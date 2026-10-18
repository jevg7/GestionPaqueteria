<#
.SYNOPSIS
    PostgreSQL 16 local en Docker para desarrollo, configurado como Supabase.

.DESCRIPTION
    Crea el contenedor "paqueteria-dev" (solo escucha en 127.0.0.1), el dueño del esquema
    (paqueteria_owner, no superusuario) y el usuario de la API (paqueteria_api_app, miembro de
    paqueteria_api); aplica las migraciones con el dueño y carga database/seed.sql.

    Las contraseñas se generan al azar y se guardan solo en los user-secrets del proyecto
    Paqueteria.Api (ConnectionStrings:Paqueteria y ConnectionStrings:PaqueteriaOwner).
    Nada queda en el repositorio.

    Si el contenedor ya existe, solo lo enciende. Con -Reset lo borra con sus datos y empieza
    de cero.

.EXAMPLE
    .\scripts\dev-db.ps1
.EXAMPLE
    .\scripts\dev-db.ps1 -Reset
#>
param(
    [switch]$Reset,
    [int]$Puerto = 5433
)

$ErrorActionPreference = 'Stop'

$contenedor = 'paqueteria-dev'
$volumen = 'paqueteria-dev-data'
$imagen = 'postgres:16'
$baseDeDatos = 'paqueteria'
$rolDueno = 'paqueteria_owner'
$rolApi = 'paqueteria_api_app'

$backend = Split-Path $PSScriptRoot -Parent
$proyectoApi = Join-Path $backend 'src\Paqueteria.Api'
$seed = Join-Path (Split-Path $backend -Parent) 'database\seed.sql'

function Invocar {
    param([Parameter(Mandatory)][string]$Descripcion, [Parameter(Mandatory)][scriptblock]$Comando)
    & $Comando
    if ($LASTEXITCODE -ne 0) { throw "Falló: $Descripcion (código $LASTEXITCODE)." }
}

function Nueva-Clave {
    $bytes = New-Object byte[] 24
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
}

function Psql-Superusuario([string]$Sql, [string]$Bd = 'postgres') {
    Invocar "psql: $Sql" { docker exec $contenedor psql -v ON_ERROR_STOP=1 -q -U postgres -d $Bd -c $Sql }
}

function Cadena([string]$Usuario, [string]$Clave) {
    "Host=localhost;Port=$Puerto;Database=$baseDeDatos;Username=$Usuario;Password=$Clave"
}

docker info --format '{{.ServerVersion}}' *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker no responde. Encienda Docker Desktop y vuelva a intentar.' }

$existe = [bool](docker ps -a --filter "name=^/$contenedor$" --format '{{.Names}}')

if ($existe -and $Reset) {
    Write-Host "Borrando $contenedor y sus datos..."
    Invocar 'docker rm' { docker rm -f $contenedor | Out-Null }
    docker volume rm $volumen 2>$null | Out-Null
    $existe = $false
}

if ($existe) {
    Invocar 'docker start' { docker start $contenedor | Out-Null }
    Write-Host "$contenedor encendido en localhost:$Puerto. (Use -Reset para recrearlo desde cero.)"
    return
}

Write-Host "Creando $contenedor ($imagen) en 127.0.0.1:$Puerto..."
Invocar 'docker run' {
    docker run -d --name $contenedor `
        -e "POSTGRES_PASSWORD=$(Nueva-Clave)" `
        -p "127.0.0.1:${Puerto}:5432" `
        -v "${volumen}:/var/lib/postgresql/data" `
        $imagen | Out-Null
}

# Durante la inicialización el servidor temporal no escucha por TCP: se espera al definitivo.
$limite = (Get-Date).AddSeconds(90)
do {
    Start-Sleep -Seconds 1
    docker exec $contenedor pg_isready -q -h 127.0.0.1 -U postgres *> $null
} until ($LASTEXITCODE -eq 0 -or (Get-Date) -gt $limite)
if ($LASTEXITCODE -ne 0) { throw "PostgreSQL no quedó listo a tiempo. Revise: docker logs $contenedor" }

$claveDueno = Nueva-Clave
$claveApi = Nueva-Clave

Write-Host 'Creando roles y base de datos...'
Psql-Superusuario "create role $rolDueno login createrole password '$claveDueno'"
Psql-Superusuario "create role $rolApi login password '$claveApi'"
Psql-Superusuario "alter role $rolApi set search_path = paqueteria, public"
Psql-Superusuario "create database $baseDeDatos owner $rolDueno"

Write-Host 'Guardando cadenas de conexión en user-secrets...'
Invocar 'user-secrets (dueño)' {
    dotnet user-secrets set 'ConnectionStrings:PaqueteriaOwner' (Cadena $rolDueno $claveDueno) --project $proyectoApi | Out-Null
}
Invocar 'user-secrets (API)' {
    dotnet user-secrets set 'ConnectionStrings:Paqueteria' (Cadena $rolApi $claveApi) --project $proyectoApi | Out-Null
}

Write-Host 'Aplicando migraciones con el dueño del esquema...'
Push-Location $backend
try {
    Invocar 'dotnet tool restore' { dotnet tool restore | Out-Null }
    Invocar 'dotnet ef database update' { dotnet ef database update --project $proyectoApi }
}
finally {
    Pop-Location
}

Write-Host 'Cargando seed.sql...'
Invocar 'docker cp seed.sql' { docker cp $seed "${contenedor}:/tmp/seed.sql" }
Invocar 'psql seed.sql' {
    docker exec -e "PGPASSWORD=$claveDueno" $contenedor `
        psql -v ON_ERROR_STOP=1 -q -h 127.0.0.1 -U $rolDueno -d $baseDeDatos -f /tmp/seed.sql
}

# La migración crea paqueteria_api; recién ahora se le puede asignar al usuario de la API.
Psql-Superusuario "grant paqueteria_api to $rolApi"

Write-Host ''
Write-Host "Listo: $baseDeDatos en localhost:$Puerto."
Write-Host "  API   -> $rolApi   (user-secrets ConnectionStrings:Paqueteria)"
Write-Host "  Dueño -> $rolDueno (user-secrets ConnectionStrings:PaqueteriaOwner)"
Write-Host "Apagar: docker stop $contenedor · Encender: .\scripts\dev-db.ps1 · Desde cero: .\scripts\dev-db.ps1 -Reset"

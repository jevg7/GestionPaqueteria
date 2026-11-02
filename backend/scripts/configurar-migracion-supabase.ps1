#requires -Version 5.1
<#
Guarda las credenciales de migracion en un almacen user-secrets separado.
No cambia la configuracion de la aplicacion ni modifica las bases de datos.
Las entradas secretas se ocultan y se envian a dotnet por stdin.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$targetRef = 'wqvkkwholnpdurjcussq'
$sourceRef = 'effwbofqvchwffnpxbng'
$migrationSecretId = "paqueteo-migracion-$targetRef"
$dotnetExe = Join-Path $env:ProgramFiles 'dotnet\dotnet.exe'
if (-not (Test-Path -LiteralPath $dotnetExe)) {
    $dotnetExe = (Get-Command dotnet -ErrorAction Stop).Source
}

function Read-RequiredSecret([string]$Prompt) {
    $secureValue = Read-Host $Prompt -AsSecureString
    try {
        $plainValue = [System.Net.NetworkCredential]::new('', $secureValue).Password
        if ([string]::IsNullOrWhiteSpace($plainValue)) {
            throw 'La entrada no puede estar vacia. No se guardo la configuracion.'
        }
        return $plainValue
    }
    finally {
        $secureValue.Dispose()
    }
}

Write-Host 'Preparacion de la migracion de Paqueteo.'
Write-Host "Destino: https://$targetRef.supabase.co"
Write-Host 'Las contrasenas y la clave secreta se escriben de forma oculta.'
Write-Host 'Se guardaran en user-secrets local, separado de la conexion actual.'
Write-Host ''

$credentials = $null
$jsonInput = $null
$serverKey = $null
$newPassword = $null
$oldPassword = $null
$previousOutputEncoding = $OutputEncoding
try {
    $targetHost = (Read-Host 'Host del proyecto NUEVO (Connect > Session pooler, puerto 5432)').Trim()
    $allowedTargetHost = '^(?:[a-z0-9-]+\.pooler\.supabase\.com|db\.' + [regex]::Escape($targetRef) + '\.supabase\.co)$'
    if ($targetHost -notmatch $allowedTargetHost) {
        throw 'Copia solo el Host de Supabase, sin URL, puerto ni contrasena.'
    }

    $newPassword = Read-RequiredSecret 'Contrasena PostgreSQL del proyecto NUEVO'
    $serverKey = (Read-RequiredSecret 'Secret key del proyecto NUEVO (sb_secret_... o service_role)').Trim()
    if ($serverKey -notmatch '^sb_secret_\S+$') {
        try {
            $jwtParts = $serverKey.Split('.')
            if ($jwtParts.Count -ne 3) { throw 'Formato invalido' }
            $payload = $jwtParts[1].Replace('-', '+').Replace('_', '/')
            $payload = $payload.PadRight($payload.Length + ((4 - $payload.Length % 4) % 4), '=')
            $keyClaims = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
            if ($keyClaims.role -ne 'service_role') { throw 'Rol incorrecto' }
            if ($keyClaims.ref -and $keyClaims.ref -ne $targetRef) { throw 'Proyecto incorrecto' }
        }
        catch {
            throw 'Se necesita una clave secreta del proyecto nuevo; la publishable key no sirve en este campo.'
        }
    }

    Write-Host ''
    Write-Host 'Para conservar las contrasenas de los usuarios tambien se necesita acceso administrativo a la BD anterior.'
    $oldPassword = Read-RequiredSecret 'Contrasena PostgreSQL del proyecto ANTERIOR'

    $credentials = [ordered]@{
        'Target:ProjectRef' = $targetRef
        'Target:Url' = "https://$targetRef.supabase.co"
        'Target:PublishableKey' = 'sb_publishable_XnZMwMvyCm2fuRiQcalgmA_E1RPdCRY'
        'Target:DatabaseHost' = $targetHost
        'Target:DatabasePort' = '5432'
        'Target:DatabaseName' = 'postgres'
        'Target:DatabaseUsername' = $(if ($targetHost -like '*.pooler.supabase.com') { "postgres.$targetRef" } else { 'postgres' })
        'Target:DatabasePassword' = $newPassword
        'Target:SecretKey' = $serverKey
        'Source:ProjectRef' = $sourceRef
        'Source:DatabasePassword' = $oldPassword
    }
    $jsonInput = $credentials | ConvertTo-Json -Depth 4 -Compress
    # Windows PowerShell 5.1 usa ASCII por defecto al enviar texto a procesos.
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $jsonInput | & $dotnetExe user-secrets set --id $migrationSecretId
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudieron guardar las credenciales en user-secrets.'
    }

    Write-Host ''
    Write-Host 'Credenciales guardadas. No se modifico la conexion actual ni las bases de datos.'
    Write-Host 'Vuelve al chat y escribe: credenciales guardadas.'
}
finally {
    $OutputEncoding = $previousOutputEncoding
    if ($credentials) { $credentials.Clear() }
    $jsonInput = $null
    $serverKey = $null
    $newPassword = $null
    $oldPassword = $null
}

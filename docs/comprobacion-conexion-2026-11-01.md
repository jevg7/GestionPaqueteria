# Comprobación frontend ↔ backend — 2026-11-01

La configuración y el transporte HTTP de la primera fase funcionan. Jairo tiene
el correo confirmado y perfil `PLATAFORMA` activo; se añadió su correo a los
propietarios locales con autorización del usuario. El usuario confirmó el acceso
real al panel de plataforma. El otro propietario sigue pendiente de confirmación.

## Resultados

| Comprobación | Resultado | Alcance |
|---|---|---|
| Frontend: build, lint y pruebas | Aprobados; 57 pruebas | Incluye cuatro regresiones de enlaces de invitación fallidos |
| Backend: compilación y pruebas unitarias | Aprobados; 145 pruebas | Compilación sin errores ni advertencias |
| Infraestructura de API | 28 pruebas aprobadas | Incluye regresión del contrato OpenAPI; Auth simulado |
| API real local | `/health` y OpenAPI responden 200 | `/health` no comprueba PostgreSQL |
| Contratos de primera fase | 30 operaciones coincidentes | Métodos, rutas, filtros, DTOs y permisos comparados con código/OpenAPI |
| Endpoints reales sin token o con token inválido | 120 respuestas 401 | 30 operaciones × 2 orígenes × 2 estados de token |
| Preflight CORS real | 60 respuestas 204 | 30 operaciones × 2 orígenes |
| Cabeceras de errores | Correctas en el barrido | `application/problem+json`, challenge Bearer y origen CORS permitido |
| Supabase real | Settings, JWKS y administración de usuarios: HTTP 200 | Consultas de solo lectura; sin envío de invitaciones |
| PostgreSQL real | Conexión y esquema comprobados | Transacción de solo lectura, rol de API sin superusuario ni bypass RLS; `VerifyFull`, puerto 5432 y 16 tablas con RLS |
| Acceso autenticado real | El usuario confirmó que entró al panel de plataforma con Jairo | Identidad `PLATAFORMA` activa comprobada también en PostgreSQL; operaciones de agencia pendientes |

Los orígenes locales comprobados son `http://localhost:5173` y
`http://127.0.0.1:5173`. Un origen ajeno no recibió permiso CORS en la comprobación
inicial. Las pruebas negativas no acreditan respuestas exitosas con JWT válido.

Las 28 pruebas de infraestructura se ejecutaron desde un proyecto temporal que
enlaza los archivos existentes, excluyendo el fixture global de PostgreSQL. Usan
Auth/JWKS simulados y una conexión ficticia para el caso de base inaccesible.
No deben sumarse de nuevo si se ejecuta posteriormente la suite de integración
completa que ya las incluye.

Docker Desktop está instalado y se inició en segundo plano, pero su daemon no
respondió dentro de 60 segundos. No se ejecutó la suite completa de integración
con PostgreSQL local. No se instalaron componentes, descargaron imágenes ni
cambiaron opciones de Docker. Las verificaciones automatizadas disponibles suman
230 pruebas aprobadas (57 frontend, 145 unitarias y 28 de infraestructura).

## Corrección: esquemas de enumeraciones en OpenAPI

El OpenAPI local describía `EstadoAgencia`, `EstadoTarifa`, `Moneda` y
`UnidadTarifa` como enteros. Los controladores serializan esos valores como texto
`UPPER_SNAKE` mediante `JsonStringEnumConverter` en
[`Program.cs`](../backend/src/Paqueteria.Api/Program.cs), y el frontend espera
texto en [`types.ts`](../frontend/src/types.ts).

Se alinearon las opciones JSON HTTP que usa OpenAPI con las de MVC y se completó
el tipo `string` cuando el exportador lo omite para enumeraciones de texto. Una
regresión comprueba tanto el tipo como los valores, incluido `EN_TRANSITO`.
La API reiniciada publica correctamente los cinco esquemas comprobados por HTTP.
El formato de las respuestas de negocio se conserva.

Referencia: las opciones MVC y HTTP son independientes según la
[documentación de ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/openapi/include-metadata?view=aspnetcore-10.0);
la omisión del tipo del enum está descrita en el
[repositorio oficial](https://github.com/dotnet/aspnetcore/issues/61303).

## Corrección: invitación fallida con otra sesión abierta

El SDK conserva una sesión anterior cuando falla un enlace de autenticación.
La pantalla de aceptación habilitaba el formulario de contraseña por el solo
hecho de que existiera esa sesión. Ahora bloquea los parámetros de error en la
URL y espera el resultado de inicialización de Auth antes de habilitar el
formulario. Las cuatro regresiones verifican errores en hash/query y rechazo del
token por el SDK; no se llama a `updateUser` en esos casos. El recorrido válido
de invitación o confirmación sigue admitido.

## Pendientes del recorrido real

1. Completar la confirmación del primer propietario; Supabase aceptó con HTTP 200
   el reenvío de su enlace autorizado por el usuario. La entrega y aceptación de
   ese correo no se han comprobado.
2. Comprobar en Supabase que la lista de redirecciones permite
   `http://localhost:5173/aceptar-invitacion`; la configuración pública consultada
   no expone esa lista.
3. Recorrer alta de agencia, invitación y aceptación del ADMIN, acceso por rol,
   consultas y escrituras, renovación/cierre de sesión y errores del negocio.

El usuario identificó la cuenta que quiere usar como propietaria. Su correo ya
coincide con `Plataforma:Propietarios`, por lo que no fue necesario modificar la
configuración. La consulta al endpoint administrativo individual de esa misma
cuenta confirmó que `email_confirmed_at` y `confirmed_at` siguen vacíos. La
confirmación pendiente corresponde al usuario de Authentication del proyecto
configurado en Paqueteo.

La consulta de solo lectura `fn_identificar_usuario` para esa cuenta devuelve
`SIN_CUENTA`: todavía no tiene perfil de negocio. El método existente
`CrearPropietarioSiCorrespondeAsync` en
[`AutenticacionExtensions.cs`](../backend/src/Paqueteria.Api/Auth/AutenticacionExtensions.cs)
está preparado para crear su perfil `PLATAFORMA` durante el primer inicio de
sesión válido porque su correo ya está autorizado. Frontend, backend y emisor
JWT apuntan al mismo proyecto Supabase. La API y el formulario de acceso
respondieron 200 al cierre de esta comprobación.

Además de la comprobación inicial descrita arriba, el usuario indicó la cuenta
de Jairo. Supabase la devuelve confirmada y PostgreSQL devuelve identidad
`PLATAFORMA` activa. Se añadió como segundo propietario en user-secrets,
conservando el primero, y se reinició la API. El usuario informó después que pudo
entrar al panel. Las cuentas y credenciales permanecen fuera del repositorio.

Las pruebas automatizadas que simulan Supabase no sustituyen las operaciones
reales de la agencia. No se aplicaron migraciones ni cambios de esquema en Supabase.

## Ejecución local

La API utiliza el perfil `https` (`https://localhost:7225`) y Vite escucha en el
puerto 5173. Los procesos de la primera ejecución terminaron al cerrar aquella
sesión; se reiniciaron con `Start-Process -WindowStyle Hidden` y salida redirigida
a archivos temporales. El navegador pudo cargar el formulario tras ese reinicio.

Para iniciar manualmente, consultar los comandos en
[`frontend/README.md`](../frontend/README.md). Los secretos permanecen en
user-secrets y `.env.local`.

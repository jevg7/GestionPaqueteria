# CLAUDE.md — Sistema de Gestión de Paquetería

Plataforma web **SaaS multi-agencia** para agencias de envíos de paquetes Miami (EE. UU.) → Nicaragua:
cada agencia ve solo sus datos y todo se administra desde el frontend (sin SQL ni paneles externos).
Flujo del negocio: registro del paquete → recepción en Miami → embarque (aéreo o marítimo) →
recepción en Nicaragua → peso y cálculo del monto → factura → pago → entrega.

Responde en español. El código usa los nombres del dominio en español (entidades, tablas,
columnas); controladores y rutas REST en inglés (`ClientsController`, `/api/clients`).

## Fuentes de verdad

Antes de cambiar algo, lee lo que corresponda:

- `docs/modelo-datos.md` — modelo de dominio v1 (revisado y cerrado): entidades, relaciones,
  ciclo de vida del paquete, qué regla vive en la BD y cuál en el backend, preguntas abiertas. Sus
  reglas valen dentro de cada agencia; lo multi-agencia está en `docs/diseno-multiagencia.md`.
- `docs/diseno-multiagencia.md` — diseño SaaS (agencias, RLS, dueños de la plataforma, invitaciones) y
  sus decisiones. Prevalece sobre `modelo-datos.md` en lo que toca a agencias.
- `database/schema.sql` — esquema PostgreSQL **v2 (multi-agencia)**. **Congelado:** la migración `Baseline` lo ejecuta tal cual
  (recurso embebido) y verifica su SHA-256; si el archivo cambia, la migración se niega a correr y falla
  el test `SchemaSqlSigueCongelado`. **No editarlo.** Todo cambio de esquema va en una migración nueva
  (`dotnet ef migrations add`), con `migrationBuilder.Sql(...)` para lo que EF no expresa.
- `backend/src/Paqueteria.Api/Data/Migrations/` — cambios de esquema posteriores al baseline. Hoy solo
  está `Baseline` (v2 ya incluye pagos en córdobas, `tipos_cambio` y auditoría). **Toda tabla nueva de
  agencia debe llevar en su migración:** `agencia_id bigint not null default fn_agencia_actual()`, unique
  `(id, agencia_id)` y FK compuestas `(x_id, agencia_id)`, RLS con la política `pol_<tabla>_agencia`, el
  trigger de auditoría (`trg_<tabla>_auditoria … fn_auditar('id')`) y los de no borrado. Patrón: EF genera las
  operaciones desde el modelo y a mano se agrega con `migrationBuilder.Sql` lo que EF no expresa
  (CHECK, triggers de no borrado y `actualizado_en`, grants, comentarios, funciones reemplazadas),
  y un `Down` que lo revierte. Los valores por defecto literales van solo en la migración.
- `database/seed.sql` — configuración inicial del negocio (métodos, ubicaciones, ruta, tarifa de ejemplo).
- `database/tests/flujo_completo.sql` — prueba de integración de la BD. Debe seguir pasando siempre.

Si un cambio contradice el modelo, detente y pregunta; no lo "arregles" en silencio.

## Estructura

```text
paqueteria/
├── backend/        # ASP.NET Core Web API + tests (completo: flujo operativo + administración SaaS)
├── frontend/       # React + TypeScript + Vite (administración y operación; faltan facturación, entregas y auditoría)
├── database/       # schema.sql (v2 congelado), seed.sql, tests/
└── docs/
```

Backend (`backend/Paqueteria.slnx`, .NET 10): un solo proyecto `src/Paqueteria.Api` (carpetas Controllers,
Services, Entities, DTOs, Data, Auth, Middleware), `tests/Paqueteria.IntegrationTests` (xUnit v3 +
Testcontainers, contra PostgreSQL 16 real) y `tests/Paqueteria.UnitTests` (reglas puras, sin Docker). Sin repositorios genéricos: el `DbContext` es la unidad de
trabajo. Evitar sobrearquitectura.

- `Data/Configurations/`: una `IEntityTypeConfiguration` por entidad. Los nombres de PK, FK e índices son
  los reales de la BD (`clientes_pkey`, `paquetes_cliente_id_fkey`…); `ModeloEsquemaTests` compara el
  modelo con el catálogo de PostgreSQL. Lo que EF no expresa (triggers, CHECK, índices por expresión,
  exclusión) vive solo en SQL.
- La entidad de `estados_paquete` es `EstadoPaqueteCatalogo`; el enum `EstadoPaquete` es su `Id`.
- Columnas que llena la BD: `GeneradoAlInsertar()` (códigos, `creado_en`) y `MantenidoPorLaBd()`
  (estado actual, fechas de recepción, `actualizado_en`) en `Data/ValoresDeBaseDeDatos.cs`.
- Valores por defecto literales de la BD (`true`, `0`, `'USD'`…) no se declaran en EF: la entidad los
  inicializa en C# y EF siempre los envía.
- `timestamptz` → `DateTimeOffset` siempre en UTC (Npgsql rechaza offsets distintos de 0).
- **Agencia:** `AgenciaId` tiene `private set` y se configura con `AgenciaDeLaSesion()` (DEFAULT
  `fn_agencia_actual()`): **el código nunca la asigna ni filtra por ella**. RLS filtra y rellena según
  la variable de sesión `paqueteria.agencia_id`, que fija `Data/ContextoSesionInterceptor.cs` con el
  claim de la solicitud. Sin agencia en la sesión, toda consulta a tablas de agencia falla con `42501`.
  No hay filtros globales de EF (RLS ya filtra). Las FK compuestas usan claves alternas `(Id, AgenciaId)`.
- Un error de cuadre de factura llega en el COMMIT y puede no venir envuelto en `DbUpdateException`:
  buscar la `PostgresException` en toda la cadena de `InnerException`.

## Stack

- Backend: C#, ASP.NET Core Web API, EF Core + Npgsql, `EFCore.NamingConventions` (snake_case).
- BD: PostgreSQL en Supabase. Esquema propio `paqueteria` (no `public`, para que la Data API de
  Supabase no lo exponga). Historial de migraciones también en `paqueteria`.
- Auth: Supabase Auth (JWT con claves asimétricas, JWKS); la API valida el token. `usuarios.auth_user_id` = claim `sub`.
- Frontend: React 19, TypeScript 6, Vite 8, Tailwind 4, React Router 8, TanStack Query 5, React Hook Form,
  Zod 4 y `@supabase/supabase-js` (solo Auth); linter Oxlint. Node 24 LTS.

## Comandos

```bash
# Cargar el esquema en una BD local vacía y probarlo (como dueño del esquema)
psql -v ON_ERROR_STOP=1 -d <bd> -f database/schema.sql
psql -v ON_ERROR_STOP=1 -d <bd> -f database/seed.sql
psql -v ON_ERROR_STOP=1 -d <bd> -f database/tests/flujo_completo.sql   # debe terminar en "TODAS LAS PRUEBAS PASARON"
```

La prueba corre en una transacción que se revierte: no deja datos.

```bash
# Backend (desde backend/). Los tests necesitan Docker Desktop encendido.
dotnet build
dotnet test                       # unitarios + integración (postgres:16, migraciones, flujo_completo.sql, HTTP)
dotnet test --project tests/Paqueteria.UnitTests   # solo reglas puras: sin Docker, en segundos
dotnet dev-certs https --trust    # una vez por equipo, para que el navegador acepte https://localhost
dotnet run --project src/Paqueteria.Api --launch-profile https
# Desarrollo: https://localhost:7225/swagger y https://localhost:7225/health
# El frontend debe llamar a https://localhost:7225: con este perfil, una llamada por
# http://localhost:5102 se redirige a HTTPS y el preflight de CORS falla con la redirección.
dotnet tool restore               # dotnet-ef local (dotnet-tools.json)
dotnet ef migrations add <Nombre> --project src/Paqueteria.Api --output-dir Data/Migrations
dotnet ef database update --project src/Paqueteria.Api   # usa la cadena del dueño

# BD local de desarrollo (Docker, localhost:5433, igual que Supabase: dueño no superusuario y
# usuario de la API). Crea roles con contraseñas al azar, migra, carga seed.sql y guarda ambas
# cadenas en user-secrets. Si ya existe solo la enciende; -Reset la recrea desde cero.
.\scripts\dev-db.ps1
.\scripts\dev-db.ps1 -Reset
docker stop paqueteria-dev

# Cadenas de conexión (nunca en el repositorio). En despliegue: variables de entorno
# ConnectionStrings__Paqueteria y ConnectionStrings__PaqueteriaOwner. Al pasar a Supabase,
# reemplazar los user-secrets que dejó dev-db.ps1:
dotnet user-secrets --project src/Paqueteria.Api set "ConnectionStrings:Paqueteria" "<usuario miembro de paqueteria_api>"
dotnet user-secrets --project src/Paqueteria.Api set "ConnectionStrings:PaqueteriaOwner" "<dueño del esquema>"
# Cuando exista el proyecto de Supabase (no es secreto; también puede ir en appsettings.Development.json):
dotnet user-secrets --project src/Paqueteria.Api set "Auth:Issuer" "https://<proyecto>.supabase.co/auth/v1"
dotnet user-secrets --project src/Paqueteria.Api set "Supabase:Url" "https://<proyecto>.supabase.co"
dotnet user-secrets --project src/Paqueteria.Api set "Supabase:InviteRedirectUrl" "<frontend>/aceptar-invitacion"
dotnet user-secrets --project src/Paqueteria.Api set "Plataforma:Propietarios:0" "<correo del dueño de la plataforma>"
# SECRETO (invitaciones): solo user-secrets o la variable Supabase__ServiceRoleKey, nunca appsettings.
dotnet user-secrets --project src/Paqueteria.Api set "Supabase:ServiceRoleKey" "<sb_secret_… o service_role>"
```

La API nunca aplica migraciones al arrancar y falla al iniciar si falta `ConnectionStrings:Paqueteria`.
`ConnectionStrings:PaqueteriaOwner` no es necesaria para ejecutar la API normalmente.

```bash
# Frontend (desde frontend/, Node 24 LTS). Una vez: copiar .env.example como .env.local y completarlo.
npm install
npm run dev     # http://localhost:5173 (puerto fijo: lo usan el CORS de la API y la Redirect URL de Supabase)
npm run build   # tsc -b + vite build
npm run lint    # oxlint --deny-warnings: una advertencia también falla
npm test        # Vitest: pruebas unitarias, sin la API ni Supabase
```

## Infraestructura base de la API

- `Program.cs` configura DI, controllers, el `DbContext` existente, routing, redirección HTTPS,
  ProblemDetails, manejo global de excepciones y CORS. Se mantiene un solo proyecto de API,
  sin repositorios ni capas adicionales. Controllers de negocio: `MeController`, `CatalogsController`,
  `ClientsController`, `PackagesController`, `ShipmentsController`, `InvoicesController`,
  `PaymentsController`, `ExchangeRatesController`, `DeliveriesController`, `AuditLogsController`,
  `UsersController`, `RatesController`, `LocationsController`, `RoutesController` y
  `PlatformAgenciesController`.
- **OpenAPI y Swagger:** documento `/openapi/v1.json` generado por `Microsoft.AspNetCore.OpenApi`
  y UI en `/swagger` mediante `Swashbuckle.AspNetCore.SwaggerUI`, solo en `Development`.
  Metadata: `Paqueteria API`, `API REST del Sistema de Gestión de Paquetería`, versión `v1`.
  Permite explorar modelos y probar endpoints con el esquema `Bearer` (JWT de Supabase Auth).
- **Errores:** `Middleware/GlobalExceptionHandler.cs` implementa `IExceptionHandler` y usa
  `IProblemDetailsService`. Las excepciones se convierten en `application/problem+json` con
  `status`, `title`, `type` y `traceId`, incluso si el encabezado `Accept` no admite el writer estándar.
  `type` usa las referencias del RFC 9110, las mismas que ASP.NET Core por defecto.
  Las solicitudes canceladas por el cliente no llegan al manejador: `ExceptionHandlerMiddleware`
  responde 499 sin registrar un error (lo fija un test).
  No exponer mensajes originales, SQL, secretos ni stack traces, tampoco en desarrollo.
  **Única excepción:** `ReglaDeNegocioException` (`Services/ExcepcionesDeNegocio.cs`):
  `ConflictoException` → 409, `SolicitudInvalidaException` → 400, `AccesoDenegadoException` → 403 y
  `ServicioNoDisponibleException` → 503 (Supabase Auth no configurado o sin responder), con su mensaje en `detail`.
  Ese mensaje lo escribe el backend para el usuario y se registra en el log: solo códigos
  (PKG-, CLI-, FAC-), nunca nombres ni otros datos personales. Es la forma de responder los
  conflictos de estado que el servicio valida antes de guardar.
  No repetir bloques `try/catch` en cada controller. `UseStatusCodePages` atiende errores HTTP sin cuerpo.
- **PostgreSQL:** `Middleware/PostgresExceptionMapper.cs` busca la excepción mediante `Find`
  en toda la cadena de `InnerException`, incluida la excepción raíz; `GetStatusCode` aplica el
  mapeo SQLSTATE indicado abajo. No depende de que exista una `DbUpdateException`.
  `IsDatabaseUnavailable` detecta una `NpgsqlException` sin SQLSTATE en la cadena (la BD no
  respondió) y el manejador responde 503.
- **CORS:** se lee de `Cors:AllowedOrigins`. `appsettings.Development.json` permite
  `http://localhost:5173`; `appsettings.json` deja la lista vacía. En despliegue configurar orígenes
  explícitos, por ejemplo mediante `Cors__AllowedOrigins__0`. La política permite métodos y
  encabezados para esos orígenes, sin habilitar credenciales. No usar `AllowAnyOrigin()`.
  Un origen inválido (comodín, credenciales, ruta o barra final) impide el arranque; una lista vacía
  registra una advertencia y no autoriza solicitudes CORS desde otros orígenes.
- **Logging:** proveedores estándar de ASP.NET Core, sin librería externa. Se registra el inicio,
  problemas de configuración y errores con tipo de excepción, SQLSTATE, estado HTTP y `traceId`.
  `42501` se registra como crítico, otros errores 5xx (500, 503) como error y 400/409 como advertencia.
  No pasar la excepción completa al logger: puede contener información sensible. En la API se
  filtra `Microsoft.EntityFrameworkCore` con `LogLevel.None` para evitar SQL y mensajes sensibles;
  los errores de solicitudes se registran de forma sanitizada en el manejador global.
- **Health:** `GET /health` devuelve HTTP 200 y `{"status":"ok"}`. Solo comprueba que la API
  responde; no consulta la BD ni verifica su disponibilidad.
- Los archivos `appsettings` no contienen secretos. Se conservan user-secrets para desarrollo
  y variables de entorno para despliegue. Esta infraestructura no modifica el modelo ni requiere
  nuevas migraciones.

## Autenticación y autorización (`Auth/`)

- **Configuración** (sección `Auth`, sin secretos): `Issuer` = `https://<proyecto>.supabase.co/auth/v1`,
  `Audience` = `authenticated`, `JwksUrl` opcional (por defecto `{Issuer}/.well-known/jwks.json`).
  En despliegue: `Auth__Issuer`. Deben ser URL HTTPS o la API no arranca. Sin `Issuer`, la API no
  arranca fuera de `Development`; en `Development` arranca con una advertencia y rechaza todo token.
- **Validación del token:** firma con las claves públicas del JWKS (caché y refresco automático al
  rotar claves), emisor, audiencia y expiración. Solo ES256/RS256: un token HS256 se rechaza.
  `MapInboundClaims = false`: `sub` llega como `sub`.
- **Usuario:** tras validar el token, `OnTokenValidated` llama a `fn_identificar_usuario(sub)` (SECURITY
  DEFINER: antes de conocer la agencia, RLS no deja leer `usuarios`). Empleado activo de agencia activa →
  claims `paqueteria:usuario_id`, `paqueteria:agencia_id` y un `paqueteria:rol` por cada rol **activo**.
  Dueño de la plataforma → `paqueteria:plataforma_id` y rol `PLATAFORMA`. Sin acceso → solo
  `paqueteria:estado_acceso` (`SIN_CUENTA`, `USUARIO_INACTIVO`, `AGENCIA_SUSPENDIDA`). Se leen de la BD
  en cada solicitud: desactivar un usuario, quitarle un rol o suspender su agencia surte efecto con el
  mismo token. Esos claims solo los pone la API; si vinieran dentro del token se descartan. El claim
  `role` de Supabase (`authenticated`) no es un rol del negocio.
- **Dueños de la plataforma** (`usuarios_plataforma`, sin agencia): el primero se crea solo al iniciar
  sesión con un correo de `Plataforma:Propietarios` (claim `email`; Supabase exige confirmarlo). Un
  inicio de sesión simultáneo no lo duplica. No ven datos de negocio de ninguna agencia.
- **Respuestas:** sin token o con token inválido → 401. Token válido sin acceso → 403 (se registra
  advertencia con el motivo y el `sub`). BD inaccesible al buscar el usuario → 503.
- **Política por defecto y de respaldo:** usuario autenticado con `paqueteria:usuario_id` y
  `paqueteria:agencia_id`. `[Authorize(Roles = …)]` no la incluye, pero los roles solo existen si hay
  acceso. `GET /api/me` usa la política `TokenValido`. Todo
  endpoint queda protegido salvo los marcados `AllowAnonymous` (`/health`, `/openapi/v1.json`).
  Una ruta inexistente pedida sin token responde 401, no 404. Para exigir roles:
  `[Authorize(Roles = CodigosRol.Admin + "," + CodigosRol.Agente)]` (constantes en `CodigosRol`).
- **`UsuarioActual`** (scoped): `Id` es el `usuarios.id` para las columnas `*_usuario_id`; `AgenciaId`;
  `PlataformaId` (dueño de la plataforma); `Roles`.
- **`GET /api/me`:** `tipo` (`AGENCIA` o `PLATAFORMA`), datos, roles activos y la agencia (id, nombre,
  estado). Sin acceso responde 403 con el motivo en `detail`. Lo usa el frontend para saber quién es.
- **Swagger:** esquema `Bearer`; en "Authorize" se pega el `access_token` de una sesión de Supabase.
- **Invitaciones** (`Services/InvitacionesSupabase.cs`, sección `Supabase`): `POST {Url}/auth/v1/invite`
  con la clave de servicio (`apikey`; también `Bearer` si es la service_role JWT). Supabase crea la
  cuenta y envía el correo; su id se guarda en `usuarios.auth_user_id`. Reinvitar a quien no aceptó
  reenvía y devuelve la misma cuenta. `email_exists` → 409; correo rechazado → 400; 429 u otra falla o
  sin configurar → 503. Nunca se registra el cuerpo de la respuesta (trae el correo) ni la clave.
- Permisos por operación en `Auth/Permisos.cs` (constantes para `[Authorize(Roles = ...)]`).
- `JwtBearerHandler` registra con su excepción los errores al procesar un token (p. ej. BD caída o
  JWKS inaccesible); IdentityModel oculta la PII por defecto y la respuesta sigue siendo ProblemDetails.

## Módulo de clientes

`Controllers/ClientsController.cs` (HTTP y permisos), `Services/ClientesService.cs` (lógica),
`DTOs/Clients.cs`. Patrón a seguir en los módulos siguientes: controller delgado, servicio scoped
con el `DbContext`, DTOs con validación por atributos (errores 400 automáticos de `[ApiController]`).

| Método y ruta | Roles | Respuesta |
|---|---|---|
| `GET /api/clients?search=&activo=&page=1&pageSize=20` | ADMIN, AGENTE, BODEGA | 200 `PagedResponse<ClientResponse>` |
| `GET /api/clients/{id}` | ADMIN, AGENTE, BODEGA | 200 · 404 |
| `POST /api/clients` | ADMIN, AGENTE | 201 + `Location` · 400 |
| `PUT /api/clients/{id}` | ADMIN, AGENTE | 200 · 400 · 404 |
| `POST /api/clients/{id}/deactivate` · `/activate` | ADMIN, AGENTE | 204 (idempotente) · 404 |

- **Datos:** `ClientRequest` sirve para crear y reemplazar. Nombres y apellidos obligatorios (≤ 100),
  teléfono obligatorio (≤ 30; dígitos, espacios, `-`, `()` y `+` inicial), correo opcional con formato
  válido. Los textos se recortan; correo y dirección vacíos se guardan como `null`. El código lo asigna
  la BD. PUT no cambia el código ni el estado activo. Al editar gana la última escritura.
- **Búsqueda:** `search` busca en nombre completo con `ILIKE` sobre `nombres || ' ' || apellidos`
  (usa `ix_clientes_nombre_trgm`, verificado con `EXPLAIN`), en código y en correo. Si trae ≥ 4
  dígitos, también en el teléfono comparando solo dígitos (`88880002` encuentra `+505 8888-0002`).
  `%` y `_` se buscan literales. Orden: apellidos, nombres, id. `pageSize` entre 1 y 100.
  No distingue mayúsculas, pero **sí acentos**: `lopez` no encuentra `López`. Resolverlo requiere la
  extensión `unaccent` y un índice nuevo, es decir una migración.
- **Desactivar** solo impide registrarle paquetes nuevos (regla que aplicará el módulo de paquetes);
  sus paquetes en curso siguen su flujo. No hay DELETE.
- **Auditoría:** quién registró o editó un cliente queda en `audit_logs` (trigger); el servicio
  además lo deja en el log (ids, sin datos personales).
- Npgsql traduce `Regex.Replace` a `regexp_replace` **sin** el flag `g` (solo reemplaza la primera
  coincidencia). En consultas LINQ usar `Replace` encadenados o SQL explícito.

## Módulo de paquetes

`Controllers/PackagesController.cs`, `Services/PaquetesService.cs`, `DTOs/Packages.cs`, y las reglas
puras `Services/TransicionesPaquete.cs` (tabla de la sección 6) y `Services/CalculoMonto.cs`.

| Método y ruta | Roles | Qué hace |
|---|---|---|
| `GET /api/packages?search=&estado=&clienteId=&metodoEnvio=&page=&pageSize=` | ADMIN, AGENTE, BODEGA | Busca en código, tracking y descripción; más recientes primero |
| `GET /api/packages/{id}` · `GET /api/packages/{id}/history` | ADMIN, AGENTE, BODEGA | Detalle · historial (quién, cuándo, observación) |
| `POST /api/packages` | ADMIN, AGENTE | Registra lo que avisó el cliente; nace en `REGISTRADO` → 201 |
| `PUT /api/packages/{id}` | ADMIN, AGENTE | Edita por etapas (abajo) |
| `POST /api/packages/{id}/receive-miami` `{ observacion? }` | ADMIN, BODEGA | `REGISTRADO → RECIBIDO_EN_MIAMI` |
| `POST /api/packages/{id}/weigh` `{ pesoLb }` | ADMIN, BODEGA | Pesa y calcula: `RECIBIDO_EN_NICARAGUA → PENDIENTE_DE_PAGO`; en `PENDIENTE_DE_PAGO` sin factura corrige y recalcula |
| `POST /api/packages/{id}/cancel` `{ motivo }` | ADMIN, AGENTE | Desde `REGISTRADO`, `RECIBIDO_EN_MIAMI` o `PENDIENTE_DE_ENVIO`; lo quita del embarque |

- **Registro:** cliente **activo** (inexistente → 400, desactivado → 409); método por código
  (`AEREO`/`MARITIMO`, sin distinguir mayúsculas; inexistente → 400, desactivado → 409). Tracking
  repetido entre paquetes no cancelados → 409 que nombra el paquete que lo tiene; cancelar libera el tracking.
- **Edición por etapas:** tracking, tienda y descripción mientras no esté facturado ni en estado final;
  cliente y método además solo en `REGISTRADO` o `RECIBIDO_EN_MIAMI` (antes de un embarque).
- **Transiciones:** toda transición pasa por `PaquetesService.CambiarEstadoAsync(id, hacia, observacion, antes)`:
  abre una transacción, bloquea el paquete con `SELECT … FOR UPDATE`, valida con
  `TransicionesPaquete.EstaPermitida` (si no, 409 "está X y no puede pasar a Y"), aplica `antes`,
  inserta el historial y confirma. **Embarques, pagos y entregas deben usarla**: el bloqueo evita que
  dos solicitudes simultáneas registren la misma transición (sin él, un test lo demuestra: ambas pasan).
- **Pesaje:** tarifa de `fn_tarifa_vigente(metodo, fecha)` con la fecha del pesaje **en hora de
  Managua** (`CalculoMonto.FechaDeTarifa`; `TimeProvider` inyectado). La consulta filtra
  `where id is not null` (la función devuelve una fila con todo `NULL` si no hay tarifa) → 409
  "No hay una tarifa vigente…". Monto = `round(peso × tarifa, 2)` con `AwayFromZero`. El peso admite
  2 decimales (más → 400: `peso_lb` es `NUMERIC(10,2)` y redondearía el peso pero no el monto) y se usa
  tal cual, sin redondear a la libra (pregunta abierta 3). Un paquete en una factura vigente no se
  corrige ni edita (409 con el número de factura).
- **Auditoría:** el historial guarda quién hizo cada transición; registro, ediciones y correcciones
  de peso van al log.
- `PaquetesTests` prepara estados de otros módulos insertando historial directamente (más rápido);
  el recorrido real por embarques está en `EmbarquesTests.CicloCompletoDelRegistroAlPesaje`.

## Módulo de embarques

`Controllers/ShipmentsController.cs`, `Services/EmbarquesService.cs`, `DTOs/Shipments.cs`.
Ciclo: `ABIERTO` → `CERRADO` → `EN_TRANSITO` → `RECIBIDO`; `CANCELADO` solo sin paquetes. No se reabre.

| Método y ruta | Roles | Qué hace |
|---|---|---|
| `GET /api/shipments?search=&estado=&metodoEnvio=&page=&pageSize=` · `GET /{id}` · `GET /{id}/packages` | ADMIN, AGENTE, BODEGA | Lista (con `cantidadPaquetes`), detalle, paquetes |
| `POST /api/shipments` `{ metodoEnvio, rutaId, fechaLlegadaEstimada?, observaciones? }` | ADMIN, BODEGA | Crea `ABIERTO`; código `AIR-2026-0001` por trigger |
| `PUT /api/shipments/{id}` `{ fechaLlegadaEstimada?, observaciones? }` | ADMIN, BODEGA | Hasta antes de `RECIBIDO` |
| `POST /{id}/packages` `{ paqueteIds }` | ADMIN, BODEGA | Asigna (`RECIBIDO_EN_MIAMI → PENDIENTE_DE_ENVIO`), mismo método, todo o nada |
| `POST /{id}/packages/{paqueteId}/remove` | ADMIN, BODEGA | Solo `ABIERTO`: `PENDIENTE_DE_ENVIO → RECIBIDO_EN_MIAMI` |
| `POST /{id}/close` | ADMIN, BODEGA | `ABIERTO → CERRADO`, con al menos un paquete |
| `POST /{id}/depart` `{ fecha? }` | ADMIN, BODEGA | `CERRADO → EN_TRANSITO` con todos sus paquetes |
| `POST /{id}/arrive` `{ fecha? }` | ADMIN, BODEGA | `EN_TRANSITO → RECIBIDO`; paquetes → `RECIBIDO_EN_NICARAGUA` |
| `POST /{id}/cancel` | ADMIN, BODEGA | `ABIERTO`/`CERRADO` sin paquetes → `CANCELADO` |

- **Transacción única:** asignar, salir y llegar mueven todos los paquetes o ninguno. Orden de
  bloqueo fijo: primero el embarque (`FOR UPDATE`), después sus paquetes por id
  (`PaquetesService.BloquearAsync(ids)` / `BloquearDelEmbarqueAsync`), y cada paquete pasa por
  `PaquetesService.TransicionarAsync` (valida la tabla, inserta historial; no confirma).
- **Fechas de salida y llegada:** opcionales (por defecto ahora), pueden ser pasadas, nunca futuras
  (5 min de tolerancia); se guardan en UTC (`ToUniversalTime`, Npgsql rechaza otros offsets). La
  llegada no puede ser anterior a la salida. El historial de cada paquete lleva esa fecha, así
  `fecha_recepcion_nicaragua` es la de llegada. El historial se muestra **en orden de id** (orden de
  registro), no de fecha.
- **Quitar paquete** (agregado al modelo, sección 6): solo con el embarque `ABIERTO`; su
  `fecha_recepcion_miami` no cambia. `POST /api/packages/{id}/receive-miami` solo acepta paquetes en
  `REGISTRADO`: no sirve para sacar un paquete de su embarque.
- Cancelar un paquete `PENDIENTE_DE_ENVIO` (módulo de paquetes) lo quita del embarque; con eso un
  embarque que se quedó sin paquetes se puede cancelar.

## Módulo de facturación y pagos

`Controllers/InvoicesController.cs` (facturas, pagos y tipo de cambio), `Services/FacturacionService.cs`,
`Services/TiposCambioService.cs`, `DTOs/Invoices.cs`. La factura es un **comprobante interno** en USD
(la fiscal, con serie DGI, la hace la agencia aparte). Monto = peso × tarifa; **la tarifa incluye IVA**
(`impuestos = 0`, pendiente confirmar con el contador). Sin descuentos en v1.

| Método y ruta | Roles | Qué hace |
|---|---|---|
| `GET /api/invoices?search=&clienteId=&estadoPago=&page=&pageSize=` · `GET /{id}` | ADMIN, AGENTE | Lista (saldo, estado de pago) · detalle con líneas y pagos |
| `POST /api/invoices` `{ clienteId, paqueteIds }` | ADMIN, AGENTE | Emite: paquetes del cliente en `PENDIENTE_DE_PAGO` sin factura vigente; una línea por paquete |
| `POST /api/invoices/{id}/payments` `{ moneda, monto, metodoPago, referencia? }` | ADMIN, AGENTE | Pago en `USD` o `NIO`; si salda, paquetes → `PAGADO` |
| `POST /api/invoices/{id}/void` `{ motivo }` | ADMIN | `EMITIDA → ANULADA` sin pagos aplicados; los paquetes se pueden refacturar |
| `POST /api/payments/{id}/void` `{ motivo }` | ADMIN | `APLICADO → ANULADO`; si la factura estaba saldada, paquetes `PAGADO → PENDIENTE_DE_PAGO` (409 si alguno ya pasó a entrega) |
| `GET /api/exchange-rates` · `GET /api/exchange-rates/current` | ADMIN, AGENTE | Últimos 60 · el vigente (404 si no hay) |
| `PUT /api/exchange-rates/{yyyy-MM-dd}` `{ nioPorUsd }` | ADMIN | Registra o corrige el de un día (puede ser futuro) |

- **Córdobas:** el pago guarda `moneda`, `monto_moneda` (córdobas) y copia del `tipo_cambio_aplicado`;
  `monto` es lo abonado en USD = `CalculoMonto.ADolares` = `round(córdobas ÷ tipo, 2)`, la misma fórmula
  que `ck_pagos_moneda`. Tipo vigente: el más reciente con fecha ≤ hoy en Managua; sin ninguno → 409.
  Pagar `CalculoMonto.ACordobas(saldo)` salda exacto (test unitario con 100 000 casos). El 409 por
  exceder el saldo muestra el saldo en USD y su equivalente en córdobas.
- **Transacciones y bloqueo:** primero la factura (`FOR UPDATE`), después sus paquetes por id. Pago y
  paso a `PAGADO` en la misma transacción; lo mismo al anular un pago. Factura y líneas en un solo
  `SaveChanges`. Dos pagos simultáneos del saldo completo: uno 201, el otro 409.
- **Inmutabilidad:** `fn_pagos_proteger` (schema v2) impide modificar también moneda, córdobas y
  tipo de cambio (probado).
- **Anulaciones** (solo ADMIN, con motivo): factura sin pagos aplicados y sin paquetes ya preparados
  para entrega; pago salvo que algún paquete de la factura esté `ENTREGADO` (los `PAGADO` vuelven a
  `PENDIENTE_DE_PAGO`; los preparados o en ruta se quedan y se cobrarán contra entrega).
  `PAGADO → PENDIENTE_DE_PAGO` se agregó a la sección 6 del modelo.
- Al saldar una factura solo pasan a `PAGADO` los paquetes que siguen en `PENDIENTE_DE_PAGO`.
  `FacturacionService.CobrarSaldoAsync` cobra el saldo completo dentro de otra transacción (lo usa
  entregas para el cobro contra entrega).

## Módulo de entregas

`Controllers/DeliveriesController.cs`, `Services/EntregasService.cs`, `DTOs/Deliveries.cs`, y
`POST /api/packages/{id}/ready` en paquetes. Una fila de `entregas` por paquete; las operaciones reciben
varios (una visita: mismo cliente). Con **pago contra entrega** (sección 6 del modelo).

| Método y ruta | Roles | Qué hace |
|---|---|---|
| `POST /api/packages/{id}/ready` | ADMIN, AGENTE, BODEGA | → `LISTO_PARA_ENTREGA` desde `PAGADO`, o desde `PENDIENTE_DE_PAGO` con factura emitida |
| `GET /api/deliveries?estado=&tipoEntrega=&clienteId=&paqueteId=&responsableUsuarioId=` · `GET /{id}` | todos | Con `cobroPendiente`; un REPARTIDOR solo ve las suyas |
| `POST /api/deliveries` `{ paqueteIds, direccion?, fechaProgramada?, responsableUsuarioId?, observaciones? }` | ADMIN, AGENTE | Programa delivery `PENDIENTE` (sin dirección: la del cliente) |
| `POST /api/deliveries/pickup` `{ paqueteIds, personaRecibe, fecha? }` | ADMIN, AGENTE | Retiro en agencia: `ENTREGADA` y paquetes `ENTREGADO`; exige factura saldada |
| `POST /api/deliveries/dispatch` `{ entregaIds, responsableUsuarioId? }` | ADMIN, AGENTE, REPARTIDOR | `PENDIENTE → EN_RUTA`, paquetes → `EN_REPARTO`; un repartidor sale con las suyas |
| `POST /api/deliveries/deliver` `{ entregaIds, personaRecibe, fecha?, cobro? }` | ADMIN, AGENTE, REPARTIDOR | `EN_RUTA → ENTREGADA`, paquetes → `ENTREGADO`; cobra el saldo si lo hay |
| `POST /api/deliveries/fail` `{ entregaIds, motivo }` | ADMIN, AGENTE, REPARTIDOR | `EN_RUTA → FALLIDA`, paquetes → `LISTO_PARA_ENTREGA` (se reprograma) |
| `POST /api/deliveries/cancel` `{ entregaIds, motivo }` | ADMIN, AGENTE | `PENDIENTE → CANCELADA` |

- **Factura saldada para entregar:** ningún paquete llega a `ENTREGADO` sin su factura vigente saldada.
  Retiro con saldo → 409 (se cobra antes en caja). Delivery con saldo: `cobro { moneda, metodoPago,
  referencia? }` cobra el **saldo completo** de cada factura (en NIO, su equivalente exacto) en la misma
  transacción; sin `cobro` → 409 (o se marca fallida). El pago queda con el usuario que cobró (el
  repartidor), base para un futuro cuadre de caja. El REPARTIDOR no usa el endpoint general de pagos.
- **Repartidor:** solo ve las entregas asignadas a él (las demás responden 404 / "no existen"); puede
  tomar entregas `PENDIENTE` sin asignar al salir a ruta; 403 si intenta salir a nombre de otro. AGENTE
  y ADMIN operan en su nombre (p. ej. confirman por teléfono). El responsable debe ser un usuario activo
  con rol REPARTIDOR activo.
- **Un intento vigente por paquete** (`PENDIENTE`/`EN_RUTA`/`ENTREGADA`); fallida o cancelada liberan
  el paquete para otro intento. Motivos de fallo y cancelación se agregan a `observaciones`.
- **Bloqueo:** orden global facturas → paquetes → entregas. `AccesoDenegadoException` → 403 con motivo.
- Fuera de alcance: cuadre de caja del repartidor.

## Auditoría

Tabla `audit_logs` (en `schema.sql` v2, con `agencia_id`: cada agencia lee solo la suya), escrita por el trigger `fn_auditar` en todas las tablas del
negocio salvo `correlativos` e `historial_estados_paquete` (este ya es el registro de estados). Captura
todo cambio: API, triggers internos (p. ej. el estado actual del paquete) y SQL manual.

- **Qué guarda:** tabla, `registro_id` (PK; compuesta separada por coma, p. ej. `usuario_roles` "3,1"),
  `accion` (INSERT/UPDATE/DELETE), `valores_anteriores` / `valores_nuevos` (JSONB con nombres de columna;
  en UPDATE solo lo que cambió, sin `actualizado_en`; un UPDATE sin cambios reales no se registra),
  `usuario_id`, `origen` (`POST /api/payments/12/void`), `trace_id` (cruza con los logs) y fecha. Datos
  personales completos. `usuario_id` sin FK a propósito: la auditoría nunca bloquea una operación.
- **Quién:** `Data/ContextoSesionInterceptor.cs` fija, al abrir cada conexión dentro de una solicitud,
  las variables de sesión `paqueteria.agencia_id`, `paqueteria.usuario_id`, `paqueteria.origen` y
  `paqueteria.trace_id`. Sin solicitud HTTP (SQL manual, seed, tests con EF directo) queda sin usuario.
- **Requisito de despliegue:** la API debe conectarse directo o por el pooler de Supabase en **modo
  sesión** (puerto 5432), nunca en modo transacción (6543), y sin `No Reset On Close=true`: Npgsql limpia
  la sesión (`DISCARD ALL`) al devolver la conexión al pool, y eso evita que el usuario de una solicitud
  quede en la siguiente (un test lo comprueba desactivando la limpieza). Con multi-agencia esto también
  protege el aislamiento: la agencia de una solicitud no debe pasar a otra.
- **Inmutable:** la API solo inserta (vía trigger) y lee; UPDATE, DELETE y TRUNCATE los bloquean los
  permisos y, para el dueño, triggers (`23001`).
- **Consulta:** `GET /api/audit-logs?tabla=&registroId=&usuarioId=&accion=&desde=&hasta=&page=&pageSize=`,
  solo ADMIN, más recientes primero, con el nombre del usuario.

## Multi-agencia y plataforma

Detalle y decisiones en `docs/diseno-multiagencia.md`. Tres capas: RLS (política por agencia en 15
tablas; la vista `v_facturas_saldo` con `security_invoker`), FK compuestas `(id, agencia_id)` y el
DEFAULT de `agencia_id`. `flujo_completo.sql` (sección 10) y `AgenciasAislamientoTests` lo prueban.
Códigos (`CLI-`, `PKG-`, `FAC-`, `AIR-`) y unicidades (código de ubicación, ruta, tipo de cambio) son por
agencia; el correo de `usuarios` es único **en toda la plataforma** (una cuenta de Supabase = un usuario).

`Controllers/PlatformAgenciesController.cs`, `Services/AgenciasService.cs`, `DTOs/Agencies.cs`. Solo rol
`PLATAFORMA`; los empleados reciben 403.

| Método y ruta | Qué hace |
|---|---|
| `GET /api/platform/agencies?search=&estado=&page=&pageSize=` · `GET /{id}` | Lista y detalle |
| `POST /api/platform/agencies` `{ agencia: { nombre, ruc?, correoContacto?, telefono? }, admin: { nombres, apellidos, correo, telefono? } }` | Crea la agencia con MIA, MGA y la ruta Miami → Managua, su primer ADMIN, y lo invita. Todo o nada |
| `PUT /api/platform/agencies/{id}` | Nombre, RUC y contacto |
| `POST /{id}/suspend` · `/activate` | Suspender deja a sus usuarios en 403 desde la siguiente solicitud; los datos quedan |

- Crear usa `set_config('paqueteria.agencia_id', id, true)` dentro de la transacción (vale hasta el COMMIT).
- Nombre repetido (sin distinguir mayúsculas) → 409. Sin Supabase configurado → 503 y nada creado.
- Auditoría: los cambios de un dueño quedan con `usuario_id` null y `origen` = `[plataforma <id>] POST …`.

## Usuarios de la agencia

`Controllers/UsersController.cs`, `Services/UsuariosService.cs`, `DTOs/Users.cs`. Solo ADMIN.

| Método y ruta | Qué hace |
|---|---|
| `GET /api/users?search=&activo=&rol=&page=&pageSize=` · `GET /{id}` · `GET /api/users/roles` | Lista (con roles), detalle, roles asignables |
| `POST /api/users` `{ nombres, apellidos, correo, telefono?, roles }` | Crea e invita por correo → 201 |
| `PUT /api/users/{id}` `{ nombres, apellidos, telefono?, roles }` | Reemplaza datos y roles (el correo no cambia) |
| `POST /{id}/deactivate` · `/activate` | Quita o devuelve el acceso de inmediato |
| `POST /{id}/resend-invite` | Reenvía la invitación (409 si ya la aceptó o está desactivado) |

- Alta: INSERT primero (correo repetido → 409 sin invitar), luego la invitación, todo en una transacción:
  si Supabase falla, el usuario no queda creado. Correo en minúsculas. Roles: `ADMIN`, `AGENTE`, `BODEGA`,
  `REPARTIDOR` (otro → 400; al menos uno).
- Nadie se desactiva ni se quita el rol ADMIN a sí mismo; la agencia conserva al menos un ADMIN activo.
  Desactivar y cambiar roles bloquean la fila de la agencia (`FOR NO KEY UPDATE`): dos ADMIN que se
  desactivan a la vez no la dejan sin administrador (test determinista que retiene el bloqueo).

## Tarifas

`Controllers/RatesController.cs`, `Services/TarifasService.cs`, `DTOs/Rates.cs`. Consultan ADMIN, AGENTE y
BODEGA; registra y anula ADMIN.

| Método y ruta | Qué hace |
|---|---|
| `GET /api/rates?metodoEnvio=&incluirAnuladas=` · `GET /{id}` | Historial con `estado` calculado: `PROGRAMADA`, `VIGENTE`, `VENCIDA`, `ANULADA` |
| `GET /api/rates/current` | La de hoy de cada método (null si falta: no se podrá pesar) |
| `POST /api/rates` `{ metodoEnvio, precioPorUnidad, fechaInicio? }` | Desde hoy (Managua) o fecha futura; cierra la anterior el día previo |
| `POST /api/rates/{id}/void` | Anula una programada, o vigente sin paquetes; la anterior vuelve a cubrir sus fechas |

- Fecha pasada → 400; ya hay una tarifa que empieza en o después de esa fecha → 409 (anularla primero).
  Precio > 0 con hasta 4 decimales. Vencidas o ya aplicadas a paquetes → 409.
- Bloqueo: las tarifas activas del método `FOR UPDATE` por fecha de inicio (mismo orden al crear y
  anular). La exclusión de traslapes no es diferible: se guarda el cierre antes de insertar la nueva.

## Ubicaciones y rutas

`Controllers/LocationsController.cs` (`/api/locations` y `/api/routes`), `Services/UbicacionesService.cs`,
`DTOs/Locations.cs`. Solo ADMIN; el resto ve las rutas activas en `/api/catalogs`.

- Ubicación `{ codigo, nombre, pais }`: código de 2 a 10 letras o dígitos (mayúsculas), país `US` o `NI`;
  código y país no cambian (PUT solo renombra). Código repetido en la agencia → 409.
- Ruta `{ origenId, destinoId, nombre }`: siempre de `US` a `NI`, ubicaciones activas; repetida → 409.
- Desactivar una ubicación usada por rutas activas → 409; activar una ruta con una ubicación
  desactivada → 409. Una ruta desactivada no admite embarques nuevos.

## Catálogos

`GET /api/catalogs` (cualquier empleado activo): métodos de envío y rutas activos, y los estados del
paquete. Lo usa el frontend para los formularios (p. ej. el `rutaId` al crear un embarque).

## Reglas que el código debe respetar

La BD las hace cumplir con triggers y restricciones; el backend no debe intentar saltárselas.

- **Estado del paquete:** nunca asignar `Paquete.EstadoActualId` ni las fechas de recepción.
  Para cambiar de estado se inserta un `HistorialEstadoPaquete`; un trigger actualiza el paquete
  (recargar la entidad después). Al crear un paquete no asignar estado: nace en `REGISTRADO`.
- **Qué transición está permitida** lo valida el backend (tabla en la sección 6 del modelo).
- **Factura y líneas se guardan en la misma transacción** (un solo `SaveChanges` o transacción
  explícita). El cuadre (≥ 1 línea y suma de líneas = subtotal) se verifica en el `COMMIT`.
- **Facturas, líneas y pagos son inmutables.** Solo se anulan: factura `EMITIDA → ANULADA`
  (sin pagos aplicados), pago `APLICADO → ANULADO`, con motivo y fecha. Corregir = anular y emitir de nuevo.
- **Paquete facturado:** mientras esté en una factura vigente, su cliente, método, peso, tarifa y
  monto no cambian.
- **Sin borrado físico.** Desactivar (`activo = false`), cancelar o anular. La API no tiene privilegio
  de `DELETE` (salvo `usuario_roles`).
- **Tarifas en la BD, nunca en el código.** Usar `fn_tarifa_vigente(metodo, fecha)`. El paquete guarda
  una copia de la tarifa aplicada. Se registran y anulan por `/api/rates`, nunca se editan.
- **Agencia:** nunca asignar `agencia_id` ni buscar datos de otra agencia; el dueño de la plataforma no
  lee tablas de agencia. Para operar en una agencia distinta de la del usuario (solo el alta de
  agencias) se fija `set_config(..., true)` dentro de una transacción.
- **Dinero:** `decimal` en C#, `NUMERIC(18,2)` en la BD. Nunca `float`/`double`.
  Redondeo: `Math.Round(valor, 2, MidpointRounding.AwayFromZero)` (igual que `round()` de PostgreSQL).
- **Peso:** en libras, `decimal`, columna `peso_lb`.
- Estado de pago y saldo de una factura se leen de la vista `v_facturas_saldo`; no se guardan.

## Convenciones del backend

- DTOs de entrada y salida (`CreateClientRequest`, `ClientResponse`); no exponer entidades.
- Enumeraciones `VARCHAR + CHECK` → enums de C# con conversor PascalCase ↔ UPPER_SNAKE.
  `EstadoPaquete` → `enum : short` con los ids fijos 1–11 (no renumerar).
- En JSON los enums viajan como el código de la BD (`"EN_TRANSITO"`): `JsonStringEnumConverter` con
  `JsonNamingPolicy.SnakeCaseUpper` en `Program.cs`; un test unitario comprueba que coincide con el
  conversor de EF. Los DTOs pueden usar los enums directamente. En los filtros por query string se
  recibe el código como texto (`UpperSnakeEnum<T>.DesdeTextoDeUsuario`, sin distinguir mayúsculas).
- Errores de la BD (`PostgresException`, directa o dentro de la cadena de `InnerException`) →
  ProblemDetails según SQLSTATE: `23505`, `23P01`, `23001` → 409 · `23514`, `23503` → 400 ·
  `42501` → 500 + log crítico. BD inaccesible (`NpgsqlException` sin SQLSTATE) → 503.
  Otros SQLSTATE y excepciones inesperadas → 500.
- **Conflictos de estado:** muchos `23514` del esquema son conflictos de estado (anular una factura
  con pagos, pagar una factura anulada, agregar líneas a una factura anulada, cambiar un paquete en
  estado final, pagar más que el saldo). Los servicios los validan **antes** de guardar y responden
  409 con un mensaje de negocio. La BD queda como última defensa: si uno llega hasta ella, responde 400.
- Códigos HTTP: 200, 201, 204, 400, 401, 403, 404, 409, 500, 503.

## Frontend (`frontend/`)

SPA con Vite. `src/main.tsx` monta `QueryClientProvider`, `SesionProvider` y `RouterProvider`; las rutas están en
`src/router.tsx` (React Router 8 en modo datos: `createBrowserRouter` de `react-router`, `RouterProvider` de
`react-router/dom`). Carpetas: `auth/` (sesión, identidad, protección de rutas, inicio de sesión e invitación),
`agencia/` y `plataforma/` (paneles y, después, sus módulos), `components/` (interfaz compartida), `lib/`
(infraestructura) y `pages/` (páginas genéricas). Rutas y textos de la interfaz en español.

- **Configuración:** `src/lib/env.ts` valida con Zod, al arrancar, las variables de `.env.local` (plantilla en
  `.env.example`): `VITE_API_URL` (exige https), `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (rechaza
  una clave `sb_secret_`). El resto del código usa `env`, no `import.meta.env`.
- **Supabase** (`src/lib/supabase.ts`) solo para Auth: los datos van siempre por la API.
- **API** (`src/lib/api.ts`): `api.get/post/put('/api/…', …)` adjunta `Authorization: Bearer` con el token de la
  sesión de Supabase y omite los filtros vacíos (`false` sí se envía). Toda respuesta de error se convierte en
  `ApiError` (`status`, `detail`, `errors` por campo, `traceId`), cuyo `message` siempre se puede mostrar: el
  `detail` del backend o un texto según el estado. `status` 0 = sin respuesta (red, API apagada, certificado o
  CORS). Una solicitud cancelada se relanza tal cual. En la interfaz se usa `mensajeDeError(error)`. La API envía
  los encabezados CORS también en los errores: un 401 llega como 401, no como una falla de red. `ApiError` y
  `mensajeDeError` viven en `lib/errores.ts` (sin dependencias, para módulos y pruebas puras); `api.ts` los
  reexporta. `Pagina<T>` = `PagedResponse<T>`.
- **Formularios:** React Hook Form + Zod con las mismas reglas y mensajes que las DataAnnotations del DTO
  (`lib/validacion.ts`: teléfono con el patrón del backend, correos y textos recortados). Si la API igual
  responde 400 con `errors`, `mensajeDelEnvio` (`lib/formularios.ts`) los pone en sus campos (claves de C# →
  camelCase) y devuelve el mensaje general. Toda escritura va por `useMutation`, así un 401 también cierra la
  sesión. Instantes en hora de Managua; los días del calendario (`DateOnly`, "yyyy-MM-dd") se muestran sin
  convertir de zona (`formatearDia`; leídos como medianoche UTC serían el día anterior) y "hoy" es
  `hoyEnManagua()`, el de `CalculoMonto.FechaEnManagua` (`lib/formato.ts`). Una fecha y hora (salida, llegada) se
  escribe en hora de Managua con `<input type="datetime-local">` y viaja con su desfase (`instanteEnManagua`:
  "2026-10-20T08:30:00-06:00"), sin depender de la zona del equipo. Decimales escritos con punto
  (`decimalPositivo`); los grupos de casillas (roles) con `useController`, y `useWatch` en vez de `watch()`.
  Una regla entre campos (`superRefine`) que deba verse junto con los errores de otros campos necesita `when`: Zod 4
  la salta si otro campo ya tiene error.
- **Dinero** (`lib/dinero.ts`): las vistas previas usan el redondeo de `CalculoMonto` (2 decimales, medios hacia
  arriba) en enteros (BigInt): `productoRedondeado` (peso × tarifa, dólares → córdobas), `cocienteRedondeado`
  (córdobas → dólares) y sumas y restas en centavos. Nunca sumar o comparar montos como `number` sin pasarlos a
  centavos. El monto definitivo siempre lo da la API.
- **Listas:** `useFiltrosDeLista` guarda filtros y página en la dirección con `flushSync`: si la actualización
  fuera una transición (lo normal en React Router), los campos mostrarían el valor viejo y al escribir rápido se
  perderían letras. La búsqueda sale al dejar de escribir (`useDiferido`) y la lista anterior se ve mientras
  llega la nueva (`keepPreviousData`). Un registro por `:id` se carga con `useIdDeLaRuta` + `CargaDeRegistro`
  (espera, error y "no existe"). Las acciones que cambian el acceso o los datos piden `Confirmacion` en la página.
- **TanStack Query** (`src/lib/queryClient.ts`): las consultas solo se reintentan si el error es pasajero (estado 0
  o ≥ 500), hasta dos veces; las mutaciones nunca (repetir un pago lo duplicaría).
- **Build:** las librerías van en archivos aparte (`react`, `supabase`, `vendor`, con
  `build.rolldownOptions.output.codeSplitting`) para que la caché del navegador sobreviva a los despliegues.
- **Sesión** (`auth/SesionProvider.tsx`, `useSesion`): sigue `onAuthStateChange` de Supabase y, al cambiar de
  usuario o cerrar sesión, vacía la caché de TanStack Query. `cerrarSesion()` (`lib/supabase.ts`) cierra solo en
  este dispositivo (`scope: 'local'`). Un 401 de la API cierra la sesión y la pantalla de inicio de sesión explica
  el motivo (`auth/salida.ts`).
- **Identidad** (`auth/identidad.ts`): sale de `GET /api/me` (clave `['identidad', <id de Supabase>]`), no del
  token. `AccesoProtegido` (ruta `/`) exige sesión y una cuenta con acceso: 403 → pantalla de bloqueo con el
  `detail` del backend; otro error → reintentar o cerrar sesión. Dentro, `useIdentidadActual()`.
- **Navegación por rol:** `/` lleva al dueño a `/plataforma` y al empleado a la primera sección de sus roles.
  `auth/secciones.ts` define cada sección de la agencia con su permiso de `Auth/Permisos.cs` y sus roles;
  `secciones.test.ts` las compara con ese archivo, así que cambiar un permiso en el backend obliga a actualizar el
  menú. Lo mismo vale para las operaciones dentro de una sección: `permisos` (mismo archivo, por el nombre del
  permiso en `Permisos.cs`) y `usePermiso('EscribirClientes')` (`auth/identidad.ts`) deciden qué botones se ven;
  una subruta de escritura se protege con `<RequiereRoles roles={permisos.X}>`. Nunca roles escritos a mano.
  `RequiereRoles` muestra "Sin acceso" en una sección no permitida. `PanelAgencia` precarga `/api/catalogs`
  (`agencia/catalogos.ts`).
- **Invitación y recuperación** (`/aceptar-invitacion`, `Supabase:InviteRedirectUrl`): supabase-js toma la
  sesión del enlace (flujo implícito) y el usuario elige su contraseña (≥ 8 caracteres; Supabase puede exigir
  más: `weak_password`). `lib/supabase.ts` lee la URL antes que Supabase para reconocer el tipo de enlace y uno
  vencido (`otp_expired`). Los correos del panel de Supabase, o los de una `redirect_to` no permitida, llegan a
  la Site URL (`/`): `router.tsx` los lleva a `/aceptar-invitacion` antes de crear el router; si no, el usuario
  entraría con la sesión del enlace sin elegir contraseña. Los errores de Supabase Auth se traducen en
  `auth/mensajesAuth.ts`.
- **Panel de la plataforma** (`plataforma/`): `/plataforma/agencias` (lista; búsqueda, estado y página viven en
  la dirección), `/nueva` (agencia + invitación de su primer ADMIN; todo o nada en la API), `/:id` (detalle;
  suspender o reactivar con confirmación) y `/:id/editar`. Las claves de caché cuelgan de `claveAgencias`.
- **Administración de la agencia** (`agencia/`; páginas de cada sección en `paginasDeSeccion` de `router.tsx`,
  que exige los roles de la sección para todas sus subrutas; las secciones sin páginas dicen "en construcción"):
  - `/usuarios` (ADMIN): lista con filtros por estado y rol, alta con invitación y roles, detalle (desactivar o
    activar, reenviar invitación) y edición. El ADMIN no ve cómo desactivarse ni quitarse su rol ADMIN (la API
    responde 409); si cambia sus roles, se vuelve a pedir `/api/me` para el menú.
  - `/tarifas` (ADMIN, AGENTE, BODEGA): las de hoy y el historial; `/tarifas/nueva` y anular solo el ADMIN.
  - `/tipo-de-cambio` (ADMIN, AGENTE): el vigente (404 de `/current` = ninguno) y los últimos; registrar o
    corregir un día solo el ADMIN.
  - `/ubicaciones` (ADMIN): ubicaciones y rutas, alta, renombre en la fila y activar/desactivar. Todo cambio
    invalida también `/api/catalogs`.
- **Operación de la agencia** (`agencia/`, Paso 3):
  - `/clientes` (consultan ADMIN, AGENTE y BODEGA; `EscribirClientes`: ADMIN y AGENTE): lista con búsqueda (nombre,
    código, correo y teléfono por dígitos) y estado, alta (el código `CLI-` lo pone la BD), ficha y edición, y
    desactivar o activar con confirmación. Sin resultados y con letras en la búsqueda, avisa que distingue tildes
    (falta `unaccent`; `AVISO_DE_TILDES`): así no se registra dos veces al mismo cliente. Su ficha lleva a "Ver sus
    paquetes" (`/paquetes?cliente=<id>`) y a "Registrar paquete" con el cliente ya elegido.
  - `/paquetes` (consultan ADMIN, AGENTE y BODEGA): lista (más recientes primero) con búsqueda por código, tracking o
    descripción y filtros por estado, método y cliente (este último con su nombre y un botón para quitarlo). Registro
    (`GestionarPaquetes`: ADMIN y AGENTE) con `SelectorDeCliente` (busca solo clientes activos; ofrece registrar otro
    paquete para el mismo cliente al terminar), edición por etapas (cliente y método solo en REGISTRADO o
    RECIBIDO_EN_MIAMI; después se muestran fijos y se envían como estaban) y cancelación con motivo. La ficha muestra la
    línea de tiempo (`/history`, en orden de registro) y las acciones de cada estado: recibir en Miami y pesar o
    corregir el peso (`OperarBodega`: ADMIN y BODEGA). El pesaje muestra la tarifa de hoy (`/api/rates/current`) y el
    monto que resultará (`montoEstimado`, en enteros como `CalculoMonto.Calcular`); sin tarifa no deja pesar. Qué acción
    se ofrece en cada estado sale de `agencia/paquetes.ts` (`sePuedeCancelar`, `sePuedePesar`…), que
    `paquetes.test.ts` compara con `TransicionesPaquete.cs`; la API decide lo demás (factura vigente → 409). Su embarque
    enlaza a `/embarques?buscar=<código>` (la API da el código, no el id).
  - `/embarques` (consultan ADMIN, AGENTE y BODEGA; `OperarBodega`: ADMIN y BODEGA): lista (más recientes primero) con
    búsqueda por código y filtros por estado y método; alta (método y ruta de `/api/catalogs`; con una sola ruta activa
    viene elegida). La ficha muestra sus paquetes y las acciones de su estado (`estadosQuePermiten` + `admite` en
    `agencia/embarques.ts`, que `embarques.test.ts` compara con `ExigirEstado` de `EmbarquesService.cs`): asignar en
    lote los RECIBIDO_EN_MIAMI de su método (la selección se conserva entre búsquedas; todo o nada en la API), quitar
    con confirmación, cerrar (con paquetes), registrar salida y llegada (fecha opcional, nunca futura y la llegada no
    antes de la salida), editar llegada estimada y observaciones, y cancelar (sin paquetes). Lo que mueve paquetes
    invalida también la caché de paquetes; cancelar un paquete que estaba en un embarque invalida la de embarques.
  - `/facturas` (`Facturar`: ADMIN y AGENTE; anular, `AdministrarFinanzas`: ADMIN): lista (más recientes primero)
    con total, pagado y saldo, búsqueda por número y filtros por estado de pago y cliente. Emitir (`/facturas/nueva`):
    se elige el cliente (también inactivos: sus paquetes en curso se cobran) y se ofrecen sus paquetes
    PENDIENTE_DE_PAGO sin factura vigente, todos marcados, con el total; los que ya están en una factura con saldo se
    muestran aparte con su enlace. La API no dice si un paquete está facturado: lo dicen las líneas de las facturas
    PENDIENTE y PARCIAL del cliente (`opcionesFacturasConSaldo`). La ficha muestra líneas, pagos y saldo; el pago
    (USD o NIO) llega con el saldo completo, al cambiar de moneda pasa a su equivalente exacto en córdobas
    (`saldoEnMoneda`) y muestra lo que abona en dólares; sin tipo de cambio vigente no se reciben córdobas. Anular una
    factura (sin pagos) o un pago pide motivo; la API responde 409 si un paquete ya pasó a entrega.
  - `/entregas` (consultan todos; el REPARTIDOR recibe de la API solo las suyas y la página se llama "Mis entregas"):
    las en curso (`EN_RUTA` y `PENDIENTE`, hasta 100 de cada una) agrupadas en visitas (`agruparEnVisitas`: mismo
    cliente, estado, dirección y repartidor), con el teléfono para llamar y el cobro contra entrega (cada factura una
    vez: `cobroDeLaVisita`). Acciones de `OperarReparto` (ADMIN, AGENTE, REPARTIDOR): salir a ruta, entregado (quién
    recibe, fecha opcional y, si hay saldo, moneda y método del cobro; en córdobas, cada factura a su equivalente exacto)
    y no se pudo entregar (motivo); de `ProgramarEntregas` (ADMIN, AGENTE): cancelar (motivo) y `/entregas/nueva`
    (paquetes LISTO_PARA_ENTREGA del cliente sin delivery por salir; retiro en agencia solo con la factura saldada,
    con enlace a la factura por cobrar; delivery con la dirección del cliente). `/entregas/historial`: todas, con
    filtros. Qué acción se ofrece en cada estado (`estadoQuePermite`) y quién es "solo repartidor" (`esSoloRepartidor`)
    se comparan con `EntregasService.cs`. La lista de repartidores sale de `/api/users`: solo el ADMIN la ve; el AGENTE
    programa sin repartidor y no saca a ruta una entrega sin asignar (ver decisiones abiertas). En la ficha del paquete:
    "Preparar para entrega" (`PrepararEntrega`, desde PAGADO o PENDIENTE_DE_PAGO con factura) y "Programar entrega".
- **Componentes compartidos** (`components/`): además de botones y campos, `AreaDeTexto` (varias líneas; `Dato`
  respeta los saltos de línea al mostrarlas), `EtiquetaActivo` y `campoDeFiltro` (`estilos.ts`) para las búsquedas
  y filtros de las listas.
- **Pruebas:** Vitest (`npm test`), junto al código como `*.test.ts`: cliente de la API (simula `fetch` y la
  sesión), secciones y operaciones contra `Permisos.cs`, mensajes de Supabase, lectura del enlace de invitación,
  reglas de validación, errores por campo, fechas y los esquemas de agencias, usuarios, tarifas, tipo de cambio,
  ubicaciones, clientes, paquetes, embarques, facturas y entregas; las acciones por estado contra
  `TransicionesPaquete.cs`, `EmbarquesService.cs` y `EntregasService.cs`, los estados, tipos, métodos de pago y monedas
  contra los enums del backend, y el dinero con los casos de `CalculoMontoTests` (incluido "pagar en córdobas el saldo
  convertido lo salda exacto", con 100 000 casos).
- Imports con extensión (`./router.tsx`), como la plantilla de Vite; sin alias de rutas. Exportaciones con nombre.

## Seguridad

- Nunca poner contraseñas, cadenas de conexión, API keys ni secretos en el repositorio.
  Usar user-secrets en desarrollo y variables de entorno en despliegue.
- Dos cadenas de conexión: dueño del esquema (solo migraciones) y usuario miembro de
  `paqueteria_api` (la API en ejecución). El dueño no pasa por RLS: nunca usarlo en la API.
- `Supabase:ServiceRoleKey` permite administrar todas las cuentas de Supabase: solo en user-secrets o
  en la variable de entorno `Supabase__ServiceRoleKey`; nunca en logs, respuestas ni el frontend.

## Pruebas

- `database/tests/flujo_completo.sql` debe pasar contra la BD creada por las migraciones.
- `HasPendingModelChanges()` debe ser `false`.
- Cubrir con tests de integración lo que dependa de la BD (valores generados, triggers, cuadre de factura).
- Tests unitarios para el cálculo de montos, las transiciones de estado y los permisos, en
  `tests/Paqueteria.UnitTests` (sin Docker). `TransicionesPaqueteTests` compara los 121 pares de
  estados con la sección 6 escrita a mano; `CalculoMontoTests` cubre el redondeo de medios y la fecha
  de Managua. Los permisos se prueban por HTTP (matrices por rol en los tests de cada módulo).
- `ApiInfrastructureTests.cs` usa `WebApplicationFactory<Program>` y una conexión ficticia sin
  acceder a la BD (apunta a `127.0.0.1:1`, donde no escucha nadie) para probar health, errores
  inesperados, BD inaccesible (503), solicitudes canceladas, SQLSTATE directos/anidados, ausencia
  de información sensible en respuestas y logs, CORS, Swagger/OpenAPI por entorno y fallos de
  arranque por configuración. El controller que provoca errores vive únicamente en el ensamblado
  de tests y se registra solo en su host; no agregar endpoints de prueba a la API publicada.
- La fábrica compartida es `Infrastructure/ApiDePrueba.cs`; `TokensDePrueba` hace el papel de
  Supabase Auth (clave ES256 propia, su JWKS servido por un `HttpMessageHandler` y tokens con la forma
  de los de Supabase). `AutenticacionTests.cs` prueba contra PostgreSQL real: 401 sin token o con
  firma, emisor, audiencia, expiración o algoritmo inválidos; 403 para no empleados, usuarios
  inactivos y roles quitados; roles inactivos excluidos; claims inyectados en el token ignorados;
  503 con la BD inaccesible.
- `PruebaHttpConBaseDeDatos` es la base de los tests HTTP con BD: `ComoAsync(roles)` crea un empleado
  con esos roles y devuelve un `HttpClient` con su token. `ClientesTests.cs` cubre alta, validaciones,
  edición, 404, desactivar/reactivar, búsqueda, paginación y la matriz de permisos por rol.
- `PaquetesTests.cs` cubre registro y rechazos (400/409 con `detail`), recepción, recepciones
  simultáneas, pesaje con tarifa vigente y sin ella, corrección de peso, paquete facturado,
  cancelación (con y sin embarque), edición por etapas, búsqueda, 404, permisos por rol y que el enum
  `EstadoPaquete` coincide con el catálogo `estados_paquete`.
- `EmbarquesTests.cs` recorre el ciclo completo sin atajos (registro → Miami → embarque → salida →
  llegada → pesaje, con fechas pasadas y el historial en orden), y cubre todo o nada al asignar,
  método distinto, embarque cerrado, quitar paquetes, fechas inválidas, cancelación, salidas
  simultáneas, filtros, enums como texto en JSON, catálogo, 404 y permisos. `JsonApi.Opciones` son
  las opciones JSON de la API para leer respuestas con enums.
- `FacturacionTests.cs` cubre emisión y rechazos, pagos parciales hasta `PAGADO`, pagos en córdobas
  con saldo exacto, sin tipo de cambio, exceso de saldo, validaciones, anulaciones (factura, pago,
  paquete ya en entrega), pagos simultáneos, coherencia e inmutabilidad en la BD, tipo de cambio
  vigente, filtros, 404 y permisos. `BaselineTests` comprueba que solo se aplica `Baseline` (v2) y
  que `flujo_completo.sql` pasa completo (incluido el aislamiento entre agencias).
- `EntregasTests.cs` cubre retiro en agencia agrupado, preparar (pagado o con factura), retiro con
  saldo cobrado antes en caja, delivery completo con el repartidor, contra entrega en córdobas,
  fallido y reprogramado, un intento vigente y cancelación, visita de un solo cliente, dirección,
  visibilidad y 403 del repartidor, responsable inválido, anulaciones con paquetes preparados y permisos.
- `AuditoriaTests.cs` cubre usuario, origen y traceId de los cambios de la API, UPDATE con solo lo que
  cambió, cambios hechos por triggers, SQL manual sin usuario, UPDATE sin cambios reales, DELETE con
  clave compuesta, que las variables de sesión no pasan a otra solicitud por el pool, inmutabilidad
  (API y dueño), filtros y que solo ADMIN consulta. `flujo_completo.sql` pasa con los triggers activos.
- `AgenciasAislamientoTests.cs`: un empleado de otra agencia recibe 404 y listas vacías, correlativos
  por agencia, agencia suspendida (403 y reactivación con el mismo token), motivos de `/api/me`, alta del
  dueño en su primer inicio de sesión (también simultáneo) y que no ve datos de agencias.
  `SupabaseDePrueba` (en `ApiDePrueba.Supabase`) hace de API de administración de Supabase: registra
  invitaciones y simula fallas (`Falla`) y cuentas ya aceptadas (`Confirmadas`).
- `UsuariosTests.cs`, `PlataformaTests.cs`, `TarifasTests.cs` y `UbicacionesRutasTests.cs` cubren sus
  módulos: invitación y entrada del invitado, fallas de Supabase sin dejar datos, reglas del ADMIN (con
  la carrera de dos ADMIN), alta de agencia completa con su auditoría, cierre y reapertura de tarifas,
  rutas US → NI, aislamiento y permisos.
- Última verificación completa con Docker (2026-09-29, administración): `dotnet build` sin advertencias ni errores;
  `dotnet test` con 409 pruebas aprobadas: 145 unitarias y 264 de integración (50 nuevas: 8 de
  aislamiento entre agencias, 18 de usuarios, 8 de plataforma, 10 de tarifas y 6 de ubicaciones y
  rutas), ninguna omitida.
  Siguen pasando `SchemaSqlSigueCongelado`, `HasPendingModelChanges() = false`, la comparación
  del modelo con PostgreSQL 16 y `flujo_completo.sql` mediante la migración `Baseline`.
- Verificación contra Supabase real (2026-10-18): migración `20260930001535_Baseline` aplicada sobre el pooler
  en modo sesión (`aws-1-us-west-2.pooler.supabase.com:5432`), rol `paqueteria_api_app` creado, `seed.sql`
  cargado y `flujo_completo.sql` ejecutado completo (`=== TODAS LAS PRUEBAS PASARON ===`); `dotnet build`
  compila con 0 advertencias y 0 errores y `Paqueteria.UnitTests` aprueba las 145 pruebas unitarias.

## Git

Ramas: `main`, `develop`, `feature/*`, `fix/*`. Commits pequeños y descriptivos.
La raíz del repositorio es esta carpeta. `.gitattributes` fija LF en el repositorio y en la copia de trabajo
(no depende de `core.autocrlf`).

## Antes de cada funcionalidad nueva

Responder: qué problema del negocio resuelve, qué actor la usa, qué datos necesita, qué regla aplica,
qué entidad modifica, qué permisos requiere, si genera auditoría y cómo se prueba.
No implementar algo solo porque "podría ser útil".

## Estado actual (revisado el 2026-10-18)

### Completado (Backend y Base de Datos en Supabase — 100 %)

- [x] Modelo de datos v1 y esquema v2 multi-agencia (`database/schema.sql` congelado, probado en
  PostgreSQL 16 local y en Supabase real).
- [x] Solución .NET 10 (`backend/Paqueteria.slnx`), entidades EF Core, `DbContext`, migración `Baseline` y
  tests de integración (`flujo_completo.sql` completo, `HasPendingModelChanges() = false`, modelo = catálogo real).
- [x] **Base de datos y Auth de Supabase conectados y migrados (`effwbofqvchwffnpxbng`):**
  - Migración `20260930001535_Baseline` aplicada por el pooler en modo sesión (`:5432`).
  - Rol de la API `paqueteria_api_app` creado con `search_path = paqueteria, public, extensions` y miembro de `paqueteria_api`.
  - `database/seed.sql` cargado y `database/tests/flujo_completo.sql` verificado en Supabase (`TODAS LAS PRUEBAS PASARON`).
  - Configurados en `user-secrets`: `ConnectionStrings:Paqueteria`, `ConnectionStrings:PaqueteriaOwner`, `Auth:Issuer` (`https://effwbofqvchwffnpxbng.supabase.co/auth/v1`), `Supabase:Url` (`https://effwbofqvchwffnpxbng.supabase.co`), `Supabase:InviteRedirectUrl` (`http://localhost:5173/aceptar-invitacion`), `Supabase:ServiceRoleKey` y `Plataforma:Propietarios:0`.
  - Auth → *URL Configuration*: Site URL `http://localhost:5173` y Redirect URL `http://localhost:5173/aceptar-invitacion`.
- [x] Infraestructura base de la API: Swagger/OpenAPI con esquema `Bearer` en desarrollo, ProblemDetails,
  manejo global de errores y SQLSTATE, CORS configurable, logging sanitizado y `GET /health`.
- [x] Autenticación con Supabase Auth (JWKS), usuario activo y roles desde la BD, `GET /api/me`.
- [x] Módulo de clientes (`/api/clients`).
- [x] Módulo de paquetes (`/api/packages`): registro, consulta, edición por etapas, recepción en Miami,
  pesaje con cálculo en hora de Managua y cancelación.
- [x] Módulo de embarques (`/api/shipments`) y catálogos (`/api/catalogs`).
- [x] Facturación, pagos en USD y córdobas (`/api/invoices`, `/api/payments`) y tipos de cambio (`/api/exchange-rates`).
- [x] Entregas (`/api/deliveries`, `/api/packages/{id}/ready`), con retiro en agencia, delivery agrupado
  y pago contra entrega.
- [x] Auditoría (`/api/audit-logs`): triggers `fn_auditar` en la BD, consulta solo `ADMIN`.
- [x] SaaS multi-agencia: `schema.sql` v2, RLS en 15 tablas + `v_facturas_saldo` con `security_invoker`,
  dueños de la plataforma (`usuarios_plataforma`) y `/api/me` con agencia y motivos de bloqueo.
- [x] Administración desde el frontend (endpoints listos): agencias (`/api/platform/agencies`), usuarios y
  roles con invitación de Supabase (`/api/users`), tarifas (`/api/rates`), ubicaciones y rutas (`/api/locations`, `/api/routes`).

### Estado del entorno y pendientes detectados

- [ ] **Segundo dueño de la plataforma (opcional cuando esté listo):** agregar `Plataforma:Propietarios:1` en `user-secrets` (el primero ya está configurado).
- [x] **Repositorio Git (2026-10-18):** inicializado en esta carpeta con `.gitignore`, `.gitattributes` y el commit
  inicial en `main` (de ahí sale `develop`). `Claude stuff/` (copias v1 del esquema) quedó archivada fuera del workspace.
- [ ] **Frontend (`frontend/`):** Fase 1 completa (Paso 2, 2026-10-20): base, cliente de la API, sesión, navegación
  por rol, panel de agencias y administración de la agencia. Fase 2 completa (Paso 3, 2026-10-21): clientes, paquetes
  y embarques. Paso 4 en curso (rama `feature/frontend-fase-3`): facturación y pagos, y entregas y reparto, listos
  (2026-10-24); falta la auditoría.
  La administración y la operación de la agencia no se han probado con una cuenta de empleado real: requiere que
  llegue la invitación (SMTP, ver abajo).
- [ ] **Mejoras y decisiones abiertas:**
  - Confirmar con la agencia/contador que la tarifa incluye IVA (`impuestos = 0`).
  - Resolver preguntas abiertas de la sección 9 de `docs/modelo-datos.md` (tarifa marítima por libra o pie³,
    redondeo/mínimo de peso, paquetes sin aviso en Miami, cédula del cliente).
  - Búsqueda de clientes sin distinguir acentos (`unaccent` + migración).
  - **Repartidores para el AGENTE:** la única lista de repartidores es `/api/users` (solo ADMIN). El agente programa
    deliveries sin repartidor y no puede sacar a ruta uno sin asignar; el repartidor tampoco ve los sin asignar.
    Propuesta: `GET /api/deliveries/couriers` (`ProgramarEntregas`) con los repartidores activos.
  - **Tipo de cambio para el REPARTIDOR:** `GET /api/exchange-rates/current` es de `Facturar` (ADMIN, AGENTE). Al
    cobrar contra entrega en córdobas, el repartidor no ve el monto en C$ antes de confirmar (lo calcula el backend).
    Propuesta: permitirlo también a `OperarReparto`, o incluir el equivalente en córdobas en `PendingCharge`.
  - Al corregir el peso, el monto se recalcula con la tarifa de hoy, no con la del primer pesaje: confirmar con la agencia.
  - Evaluar si se requieren permisos finos (`Permiso`/`RolPermiso`) y cuadre de caja del repartidor.
  - Definir `Cors:AllowedOrigins` y SMTP propio en Supabase para producción. Sin SMTP propio, Supabase solo
    envía correos a los miembros del equipo del proyecto (y 2 por hora): una invitación a otro correo falla con
    `email_address_not_authorized`, que la API muestra hoy como "El sistema de acceso rechazó el correo…".

---

## Siguientes pasos (Hoja de ruta)

Con el backend, la base de datos y las credenciales de Supabase listos en `user-secrets`, los pasos siguientes son:

### Paso 0 — Higiene del repositorio (completado el 2026-10-18)

1. **Inicializar Git:** crear `.gitignore` (excluyendo `bin/`, `obj/`, `.vs/`, `node_modules/`, `dist/`, `.env*`),
   eliminar o archivar fuera del workspace la carpeta obsoleta `Claude stuff/` (v1) y hacer el commit inicial.

### Paso 1 — URL de invitación en el panel de Supabase (punto 1 completado el 2026-10-18)

1. En el panel de Supabase (*Authentication → URL Configuration*), asegurarse de agregar `http://localhost:5173/aceptar-invitacion`
   a **Redirect URLs** y poner la **Site URL** en `http://localhost:5173` (por defecto venía `http://localhost:3000`).
2. Cuando tengan el correo del segundo dueño, agregarlo con:
   ```powershell
   dotnet user-secrets --project src/Paqueteria.Api set "Plataforma:Propietarios:1" "<correo dueño 2>"
   ```

### Paso 2 — Frontend Fase 1: Base, Autenticación, Plataforma y Administración (`frontend/`) (completado el 2026-10-20)

1. **Inicializar proyecto (`frontend/`)** (completado el 2026-10-18): React + TypeScript + Vite + Tailwind CSS + React Router +
   TanStack Query + React Hook Form + Zod + `@supabase/supabase-js`.
2. **Cliente de API y manejo de errores** (completado el 2026-10-18):
   - Base URL hacia `https://localhost:7225` (`VITE_API_URL`), adjuntando `Authorization: Bearer <access_token>` de la sesión de Supabase.
   - Interceptor/helper para leer `application/problem+json` (`ProblemDetails`) y mostrar el campo `detail` en errores `400`, `403`, `409` y `503`.
3. **Sesión, identidad (`GET /api/me`) y navegación por rol** (completado el 2026-10-20):
   - Pantalla de Login con Supabase Auth y ruta `/aceptar-invitacion` para que los usuarios invitados creen su contraseña.
   - Consultar `GET /api/me` al autenticarse:
     - Si responde `403` (`SIN_CUENTA`, `USUARIO_INACTIVO`, `AGENCIA_SUSPENDIDA`), mostrar pantalla de bloqueo con el mensaje de `detail` y opción de cerrar sesión.
     - Si `tipo === "PLATAFORMA"`, dirigir al **Panel de Plataforma**.
     - Si `tipo === "AGENCIA"`, precargar `GET /api/catalogs` y mostrar el layout de la agencia habilitando secciones según `roles` (`ADMIN`, `AGENTE`, `BODEGA`, `REPARTIDOR`).
4. **Panel del dueño de la plataforma (`PLATAFORMA`)** (completado el 2026-10-20):
   - Listado, búsqueda y filtro por estado (`GET /api/platform/agencies`).
   - Alta de agencia + invitación de su primer `ADMIN` (`POST /api/platform/agencies`).
   - Edición de datos de la agencia (`PUT /{id}`) y suspensión/reactivación (`POST /{id}/suspend` y `/activate`).
5. **Administración de la agencia (`ADMIN`)** (completado el 2026-10-20):
   - **Usuarios (`/api/users`):** listado, alta con invitación y selección de roles, edición de datos/roles, activar/desactivar y reenviar invitación (`POST /{id}/resend-invite`).
   - **Tarifas (`/api/rates`):** vista de tarifas actuales (`/current`) e historial (`ADMIN`, `AGENTE`, `BODEGA`); registro de nueva tarifa y anulación (`ADMIN`).
   - **Tipo de cambio (`/api/exchange-rates`):** consulta del tipo vigente y últimos 60 registros (`ADMIN`, `AGENTE`); registro/corrección por fecha (`PUT /api/exchange-rates/{yyyy-MM-dd}`, `ADMIN`).
   - **Ubicaciones y rutas (`/api/locations`, `/api/routes`):** listado, creación, renombrado y activación/desactivación (`ADMIN`).

### Paso 3 — Frontend Fase 2: Operación de Bodega y Atención al Cliente (completado el 2026-10-21)

1. **Clientes (`/api/clients`)** (completado el 2026-10-21): listado paginado con búsqueda (nombre, código, correo, teléfono), creación, edición y activación/desactivación (`ADMIN`, `AGENTE`; lectura `BODEGA`).
2. **Paquetes (`/api/packages`)** (completado el 2026-10-21):
   - Búsqueda y filtros por estado, cliente y método de envío; vista de detalle con línea de tiempo (`GET /{id}/history`).
   - Registro de paquete (`POST /api/packages`), edición por etapas (`PUT /{id}`) y cancelación con motivo (`POST /{id}/cancel`) para `ADMIN` y `AGENTE`.
   - Recepción en Miami (`POST /{id}/receive-miami`) y pesaje en Nicaragua con cálculo automático (`POST /{id}/weigh`) para `ADMIN` y `BODEGA`.
3. **Embarques (`/api/shipments`)** (completado el 2026-10-21):
   - Listado con filtros, creación de embarque `ABIERTO`, asignación por lote (`POST /{id}/packages`) y retiro de paquetes (`POST /{id}/packages/{paqueteId}/remove`).
   - Acciones de ciclo de vida: cerrar (`/close`), registrar salida (`/depart`), registrar llegada a Nicaragua (`/arrive`) y cancelar (`/cancel`) (`ADMIN`, `BODEGA`; consulta `AGENTE`).

### Paso 4 — Frontend Fase 3: Facturación, Caja, Entregas y Auditoría

1. **Facturación y pagos (`/api/invoices`, `/api/payments`)** (completado el 2026-10-24):
   - Emisión de factura seleccionando los paquetes `PENDIENTE_DE_PAGO` de un cliente (`POST /api/invoices`).
   - Detalle de factura con líneas, pagos e indicadores de saldo; registro de pagos parciales o totales en `USD` o `NIO` mostrando el equivalente en córdobas según el tipo de cambio vigente (`POST /{id}/payments`).
   - Anulación de facturas y pagos con motivo (`POST /api/invoices/{id}/void`, `POST /api/payments/{id}/void`, solo `ADMIN`).
2. **Entregas y reparto (`/api/deliveries`, `POST /api/packages/{id}/ready`)** (completado el 2026-10-24):
   - Acción para marcar paquetes como `LISTO_PARA_ENTREGA` (`ADMIN`, `AGENTE`, `BODEGA`).
   - Registro de retiro en agencia agrupado (`POST /api/deliveries/pickup`) y programación/cancelación de deliveries (`POST /api/deliveries`, `POST /api/deliveries/cancel`) (`ADMIN`, `AGENTE`).
   - Vista operativa para `REPARTIDOR` (y `ADMIN`/`AGENTE` en su nombre): consultar entregas asignadas, salir a ruta (`/dispatch`), confirmar entrega (`/deliver`) incluyendo formulario de **cobro contra entrega** cuando `cobroPendiente > 0`, o reportar entrega fallida (`/fail`).
3. **Auditoría (`/api/audit-logs`):**
   - Pantalla exclusiva para `ADMIN` con filtros por tabla, `registroId`, usuario, acción y rango de fechas (`desde`/`hasta`), mostrando el diff entre `valoresAnteriores` y `valoresNuevos`.

### Paso 5 — Cierre de reglas abiertas y preparación para producción

1. Definir con la agencia las preguntas abiertas de `docs/modelo-datos.md` (sección 9) e implementar migraciones si alguna regla cambia (p. ej. `unaccent` para búsqueda de clientes o volumen en envíos marítimos).
2. Configurar entorno de producción: base de datos en Supabase conectada por el pooler en **modo sesión (puerto 5432)**, SMTP propio para invitaciones, Site URL y Redirect URLs de Supabase Auth con la URL del frontend de producción, variables de entorno (`ConnectionStrings`, `Auth`, `Supabase`, `Plataforma`, `Cors:AllowedOrigins`) y pipeline CI/CD.

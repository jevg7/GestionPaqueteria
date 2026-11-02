# Migración de Supabase — 2026-11-02

Paqueteo utiliza el proyecto `wqvkkwholnpdurjcussq`:
`https://wqvkkwholnpdurjcussq.supabase.co`. El frontend y la API local están
configurados para ese destino. Abrir [Paqueteo](http://localhost:5173) e iniciar
sesión con los mismos correos y contraseñas.

## Datos trasladados

El origen `effwbofqvchwffnpxbng` se reactivó antes de la copia. Se consultó dentro
de una transacción `REPEATABLE READ READ ONLY`. La importación se confirmó en
una transacción del destino después de comparar todos los campos de cada fila
en memoria, sin imprimir datos personales, tokens ni hashes.

| Tabla | Filas trasladadas |
|---|---:|
| `auth.users` | 3 |
| `auth.identities` | 3 |
| `paqueteria.usuarios_plataforma` | 2 |
| `paqueteria.usuarios` | 1 |
| `paqueteria.usuario_roles` | 1 |
| `paqueteria.agencias` | 2 |
| `paqueteria.ubicaciones` | 4 |
| `paqueteria.rutas` | 2 |
| `paqueteria.tarifas_envio` | 1 |

Se conservaron UUID, IDs numéricos, correos, hashes de contraseña, confirmación
del correo, metadatos, estados, asignaciones de roles y fechas. Las tres cuentas
estaban confirmadas. Las columnas generadas se recalcularon en PostgreSQL.
Se comprobaron los catálogos existentes y se ajustaron las secuencias de las
tablas importadas. Tipos de cambio, correlativos y tablas operativas/contables
estaban vacíos en el origen al tomar la copia.

La auditoría histórica permanece en el origen. En el destino, los triggers
registraron las altas importadas con origen `migracion-supabase-2026-11-02`.
Las sesiones anteriores pertenecen al proyecto viejo; hay que iniciar sesión
de nuevo en Paqueteo.

## Esquema y configuración

- Migraciones EF Core `20260930001535_Baseline` y
  `20261101205707_Contabilidad`, registradas en el historial del destino.
- Pooler de sesión `aws-0-us-east-2.pooler.supabase.com:5432` y TLS
  `SSL Mode=VerifyFull`, utilizando la CA pública oficial existente.
- Login de ejecución `paqueteria_api_app`, miembro de `paqueteria_api`, con
  credencial generada y guardada en user-secrets. No tiene superusuario,
  propiedad de las tablas ni bypass RLS.
- Frontend: `.env.local` con URL/clave pública del proyecto nuevo y modo real.
- Backend: conexiones de API/dueño, emisor, JWKS, URL de Supabase y clave de
  servidor actualizados. Se conservaron ambos correos de propietarios.
- Redirección de invitación del backend:
  `http://localhost:5173/aceptar-invitacion`.

## Comprobaciones realizadas

- Igualdad completa de las filas importadas, incluidos hashes, UUID y permisos;
  enlaces entre perfiles y Auth válidos y sin identidad duplicada.
- 19 tablas con RLS y 20 políticas. El rol de API tiene RLS activo, carece de
  acceso al historial EF y recibe `42501` al solicitar agencia sin contexto.
- Aislamiento real por agencia en 8 tablas, repetido para ambas agencias:
  conteos esperados y cero filas visibles de una agencia distinta.
- Supabase Auth con ES256 y clave administrativa válida. Se generaron sesiones
  temporales para las tres cuentas confirmadas mediante la API administrativa,
  sin enviar correos ni introducir sus contraseñas. Cada sesión se cerró con
  alcance local al terminar.
- `/api/me`: HTTP 200 para las tres cuentas. Los dos propietarios consultaron
  agencias con HTTP 200 y recibieron 403 al consultar usuarios de agencia.
  El ADMIN consultó catálogos y usuarios con HTTP 200 y recibió 403 al consultar
  la administración de plataforma.
- Sin token: HTTP 401. Preflight del frontend: HTTP 204 con el origen correcto.
- La generación administrativa de enlaces devolvió la redirección local solicitada.
- `npm run build`: TypeScript y Vite aprobados. El bundle contiene la URL nueva
  y no contiene la anterior. La pantalla de acceso local carga correctamente.

La comprobación de acceso utilizó sesiones administrativas de prueba; no sustituye
la comprobación manual del formulario con la contraseña habitual. No se enviaron
invitaciones reales ni se probó un flujo operativo completo de paquetes.

## Recuperar la configuración anterior

El almacén local user-secrets `paqueteo-migracion-wqvkkwholnpdurjcussq` conserva
`Source:OriginalBackendConfig` y `Source:FrontendEnv`, además de los datos de
migración. Para volver al origen, detener API/Vite, restaurar esas dos
configuraciones y reiniciar ambos servicios. El origen conserva sus datos.

Esta recuperación solo cambia la conexión: si se registran operaciones nuevas en
el destino, hay que conciliarlas antes de volver al origen. Las credenciales se
administran localmente; no deben copiarse al repositorio ni a este informe.

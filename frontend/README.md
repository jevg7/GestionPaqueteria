# Paqueteo · Frontend

Primera fase del frontend descrito en `../CLAUDE.md`. React, TypeScript, Vite, Tailwind CSS,
React Router, TanStack Query, React Hook Form y Zod. La interfaz está en español y se adapta
a escritorio y móvil.

El estilo toma como referencia [MiiChart](https://miichart.com/): fondo crema, coral y tarjetas
pastel, tipografía Nunito local y bordes redondeados. Los colores y componentes visuales se
centralizan en `src/theme.css`; `src/styles.css` conserva la estructura y los puntos de quiebre.

## Conectar con el backend

Requiere Node.js 24 LTS, npm y la API ASP.NET Core (.NET 10). La conexión real es el modo
predeterminado. Desde esta carpeta:

```powershell
npm ci
Copy-Item .env.example .env.local # Solo si todavía no existe
```

Completar `.env.local` con las variables públicas del mismo proyecto Supabase que usa la API:

```dotenv
VITE_DEMO_MODE=false
VITE_API_URL=https://localhost:7225
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<clave-publica>
```

La URL y la clave pública proporcionadas ya están guardadas en `.env.local`; Supabase Auth y
su JWKS respondieron HTTP 200. La URL de referencia del proyecto está en `../CLAUDE.md`. `.env.local` está excluido
de Git. La configuración rechaza claves privadas, URLs inválidas y HTTP remoto. Si faltan
credenciales, el formulario indica que el acceso aún no está configurado y permanece deshabilitado.

Estado local del 2026-10-31: `.env.local` y los user-secrets del backend están configurados.
La conexión PostgreSQL real y el acceso administrativo a Auth fueron validados. El propietario
configurado existe, pero su correo todavía no está confirmado; el recorrido de login sigue pendiente.

Actualización del 2026-11-01: se añadió un segundo propietario con correo confirmado,
se verificó su perfil `PLATAFORMA` activo y el usuario confirmó que pudo entrar al panel.
El reenvío de confirmación del primer propietario fue aceptado por Supabase. Siguen
pendientes las invitaciones del ADMIN y las operaciones reales de la agencia.
Ver el [informe de comprobación](../docs/comprobacion-conexion-2026-11-01.md).

La API necesita `ConnectionStrings:Paqueteria`, `Auth:Issuer`, `Supabase:Url`,
`Supabase:ServiceRoleKey`, `Supabase:InviteRedirectUrl` y `Plataforma:Propietarios:0`
en user-secrets o variables de entorno. `Auth:Issuer` debe ser `<VITE_SUPABASE_URL>/auth/v1` y
la redirección `http://localhost:5173/aceptar-invitacion`. Los comandos están en `../CLAUDE.md`.
La cadena de conexión usa el rol de la API, miembro de `paqueteria_api`, para respetar RLS.
Se comprobó que no tiene superusuario ni bypass de RLS y que el esquema existe. La conexión
conserva `SSL Mode=VerifyFull` y utiliza la CA pública oficial guardada junto a user-secrets.
Las contraseñas con separadores deben serializarse con `NpgsqlConnectionStringBuilder`;
corregir el escapado no requiere cambiar la contraseña.

Desde `../backend/`:

```powershell
dotnet dev-certs https --trust # Una vez por equipo
dotnet run --project src/Paqueteria.Api --launch-profile https
```

El certificado HTTPS de desarrollo ya está confiado en este equipo. Comprobar
`https://localhost:7225/health` (solo confirma que la API responde, no prueba la BD) y abrir
el frontend desde otra terminal:

```powershell
npm run dev
```

Abrir [http://localhost:5173](http://localhost:5173) y usar una cuenta existente o una invitación.
El modo Development de la API permite CORS desde `localhost:5173` y `127.0.0.1:5173`.
Usar el perfil HTTPS: el puerto HTTP redirige el preflight y no sirve para esta conexión directa.
Reiniciar Vite al modificar `.env.local`.

En Supabase, autorizar `http://localhost:5173/aceptar-invitacion` en Authentication → URL Configuration.
Abrir las invitaciones desde ese mismo origen. Supabase se utiliza únicamente para Auth;
los datos del negocio pasan por la API ASP.NET Core.

## Ejecutar la demostración

Para recorrer la interfaz sin iniciar sesión con una cuenta real:

```powershell
npm run dev:demo
```

Elegir un rol y pulsar **Abrir demostración**. El modo `demo` de Vite activa el simulador,
sin cambiar `.env.local`. También se puede activar mediante `VITE_DEMO_MODE=true`.
No necesita la API, Supabase ni credenciales;
no envía correos ni modifica datos reales. Los datos son ejemplos y los cambios se reinician
al recargar la página. Solo el rol elegido se conserva durante la sesión de la pestaña.

## Alcance implementado

El módulo **Contabilidad** (`/contabilidad`, ADMIN de agencia) incorpora plan de
cuentas, libro diario por partida doble, registro de gastos, reversión de asientos,
balance general, estado de resultados y balanza en NIO. Usa la migración
`20261101205707_Contabilidad`; consultar [contabilidad.md](../docs/contabilidad.md)
para la activación y el registro de apertura, ingresos y gastos.

La migración contable ya fue aplicada en Supabase (2026-11-01). Para empezar en
modo real, entrar como ADMIN de agencia en `http://localhost:5173/contabilidad`
y crear el plan inicial. El puerto 5174 corresponde a la demostración separada.

- Bienvenida, acceso, aceptación de invitación y pantallas de sesión vencida, acceso bloqueado,
  falta de permisos, errores de carga y ruta inexistente.
- Vista general por rol, navegación protegida y limpieza de caché al cambiar de usuario/rol
  o cerrar sesión. Los permisos se basan en `/api/me`, sin enviar `agenciaId`.
- Plataforma: agencias con búsqueda, filtro, paginación, alta con primer administrador,
  edición, suspensión y reactivación.
- Administración: usuarios, roles, alta con invitación, edición, activación/desactivación
  y reenvío de invitación.
- Tarifas vigentes, historial, filtros, registro de nuevas vigencias y anulación.
- Tipo de cambio vigente, historial y registro/corrección por fecha.
- Ubicaciones y rutas: consulta, búsqueda, alta, renombrado y activación/desactivación.
- Formularios con validación, prevención de doble envío, modales con teclado, confirmación
  de cambios de estado y mensajes de resultado.

Las operaciones de clientes, paquetes, embarques, facturación, pagos, entregas y auditoría
pertenecen a las siguientes fases. El repartidor tiene su espacio de bienvenida; la operación
de reparto todavía no está implementada.

## Sesión y permisos

- Los valores `VITE_*` quedan visibles en el navegador. Usar únicamente la Publishable key,
  nunca `service_role`, secretos del servidor ni cadenas de conexión.
- Las invitaciones se solicitan a la API ASP.NET,
  que sigue siendo responsable del correo y de las reglas del negocio.
- El helper adjunta el Bearer token de Supabase, interpreta `ProblemDetails`, informa los
  errores de validación, revalida `/api/me` ante un 403 y cierra la sesión local ante un 401.
  La identidad también se revalida al recuperar el foco y cada 60 segundos. Si cambian los
  roles o la agencia para el mismo usuario, se cancelan solicitudes y se purgan los datos
  anteriores. También se limpian al cambiar de usuario, cerrar sesión o perder el acceso.
- Los controles de frontend facilitan la navegación; la API y RLS siguen siendo la autoridad
  de permisos y aislamiento entre agencias. El simulador ilustra las reglas, sin sustituirlas.
- Antes de un despliegue real, compilar con `VITE_DEMO_MODE=false` y configurar el servidor
  web para redirigir las rutas de la SPA a `index.html`.

## Verificación

```powershell
npm run build
npm run lint
npm test
```

Las pruebas comprueban permisos de rutas y acciones, separación de plataforma/agencia,
limpieza de datos al cambiar de rol, validación de invitaciones, acceso suspendido,
precisión de formularios, fechas de Managua, configuración pública y el contrato HTTP de
errores/sesión. Login e invitaciones se prueban con Supabase simulado.
No realizan solicitudes a servicios externos.

Verificación del 2026-10-27: compilación y lint aprobados, 53 pruebas locales de frontend y
145 pruebas unitarias del backend aprobadas. Se comprobó por HTTP `/health`, el 401 sin
token y los preflight CORS de ambos orígenes locales. La suite de integración con PostgreSQL
requiere Docker, actualmente apagado. Actualización del 2026-10-31: PostgreSQL real validado
mediante consultas de solo lectura y API administrativa de Auth con HTTP 200 usando `HttpClient`
sin User-Agent; para reproducir esta última comprobación, evitar `Invoke-WebRequest` con un
User-Agent de navegador. **El login, las invitaciones y las operaciones de negocio de extremo
a extremo seguían pendientes**, incluido confirmar el correo del propietario.

Verificación del 2026-11-01: build y lint aprobados, 57 pruebas de frontend y 28 de
infraestructura backend aprobadas (además de las 145 unitarias previas). OpenAPI ya
describe los enums como texto `UPPER_SNAKE`, comprobado por HTTP. La aceptación de
invitaciones bloquea los enlaces con error y los fallos de inicialización de Auth,
incluso cuando el SDK conserva una sesión anterior. El primer acceso real al panel
de plataforma fue confirmado por el usuario; la suite completa de PostgreSQL local
y el flujo de invitación/operación de la agencia continúan pendientes.

## Organización

```text
src/
  auth/        sesión e identidad
  components/  layout, tablas, formularios, modales y estados compartidos
  demo/        datos de ejemplo y simulador local
  lib/         API, permisos, esquemas Zod, filtros y formatos
  pages/       pantallas por módulo
  test/        soporte de pruebas
```

La integración añade los dos orígenes locales al CORS de desarrollo del backend y conserva
el esquema de base de datos congelado. Los criterios
de negocio y de comprobación están en `../docs/frontend-fase-1.md`.

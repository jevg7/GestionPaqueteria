# Diseño multi-agencia (SaaS)

**Estado:** implementado (`schema.sql` v2 y API) · **Fecha:** 2026-09-29. Las secciones 1 a 6 son la
propuesta original; donde la implementación se apartó, manda la sección 8.

El sistema pasa de una agencia a una **plataforma SaaS**: varias agencias de envíos usan la misma
aplicación, cada una con sus datos aislados, y todo se opera desde el frontend (sin SQL ni paneles
externos). Este documento describe qué cambia respecto del modelo v1 (`modelo-datos.md`).

---

## 1. Principio: el aislamiento lo garantiza la base de datos

Una agencia nunca debe ver ni tocar datos de otra. Es el peor error posible en un SaaS, así que se
protege en tres capas, igual que el resto de reglas del sistema:

1. **Row Level Security (RLS) de PostgreSQL** en todas las tablas de agencia: el usuario de la API
   solo ve y modifica filas cuyo `agencia_id` coincide con la variable de sesión
   `paqueteria.agencia_id`. La fija el mismo interceptor que hoy pasa el usuario a la auditoría. Sin
   esa variable, las consultas no devuelven nada.
2. **Claves foráneas compuestas `(id, agencia_id)`**: una fila solo puede referenciar filas de su
   misma agencia. Hace falta porque las FK de PostgreSQL no pasan por RLS: sin esto, un paquete
   podría apuntar al cliente de otra agencia conociendo su id. Es el patrón que el esquema ya usa
   para "embarque del mismo método".
3. **`agencia_id` lo pone la BD** (`DEFAULT fn_agencia_actual()`). La propuesta original eran filtros
   globales de EF Core; se descartaron (sección 8): RLS ya filtra y un filtro duplicado solo agrega código.

Un test recorrerá todas las tablas comprobando que una agencia no ve ni puede referenciar datos de otra.

## 2. Qué es de cada agencia y qué es de la plataforma

| Tabla | Alcance | Notas |
|---|---|---|
| `agencias` (nueva) | Plataforma | Nombre, RUC opcional, contacto, estado (`ACTIVA`, `SUSPENDIDA`) |
| `estados_paquete`, `roles`, `metodos_envio` | Plataforma (catálogos fijos) | Iguales para todas. `AEREO`/`MARITIMO` no dependen de la agencia |
| `usuarios` | Agencia | Cada empleado pertenece a una agencia |
| `usuario_roles` | Agencia (vía usuario) | |
| `ubicaciones`, `rutas` | Agencia | Cada agencia define sus bodegas y rutas (Miami → Managua, Houston → León…) |
| `tarifas_envio`, `tipos_cambio` | Agencia | Cada agencia fija sus precios y su tipo de cambio |
| `clientes`, `paquetes`, `historial_estados_paquete`, `embarques` | Agencia | |
| `facturas`, `detalles_factura`, `pagos`, `entregas` | Agencia | |
| `correlativos` | Agencia | Clave `(agencia_id, clave)` |
| `audit_logs` | Agencia | Con `agencia_id`; solo el ADMIN de esa agencia la consulta |

**Numeración por agencia:** `CLI-000001`, `PKG-000001`, `FAC-000001` y `AIR-2026-0001` empiezan en 1
en cada agencia, y los UNIQUE pasan a ser `(agencia_id, codigo)`. Los códigos de cliente y paquete
pasan de secuencias globales a `correlativos` por agencia. El tracking externo no se repite **dentro
de una agencia**.

**Dueño de la plataforma:** un rol aparte (`PLATAFORMA`), fuera de las agencias. Ve la lista de
agencias y puede suspenderlas o reactivarlas. **No ve datos de negocio de las agencias** (clientes,
paquetes, facturas): RLS no tiene excepción para él.

## 3. Cómo sabe la API a qué agencia pertenece cada solicitud

- Al validar el token, `OnTokenValidated` ya busca al usuario por `auth_user_id`; ahora también lee su
  `agencia_id` y el estado de la agencia.
- Con una agencia suspendida, responde 403 con un mensaje claro.
- El interceptor fija `paqueteria.agencia_id` en cada conexión, junto con el usuario, el origen y el
  traceId de la auditoría.
- El frontend **nunca envía** la agencia: sale siempre del usuario autenticado.

## 4. Todo desde el frontend: altas

- **Agencia nueva:** la crea el dueño de la plataforma (decisión 1, sección 7) con su primer ADMIN, las
  ubicaciones MIA y MGA y la ruta Miami → Managua.
- **Empleados:** el ADMIN de la agencia los registra en la web. La API los invita a Supabase Auth con
  la *service role key*, guardada solo como secreto del servidor y nunca en el repositorio ni en el
  frontend. Supabase les envía el correo para crear su contraseña, y el vínculo `auth_user_id` queda
  guardado al invitar.
- **Tarifas, tipo de cambio, rutas y ubicaciones:** endpoints del ADMIN de la agencia.

## 5. Lo que no cambia

El ciclo del paquete, las reglas de facturación, los pagos en córdobas, el pago contra entrega, la
auditoría y la política de no borrado siguen igual, pero ahora **dentro de cada agencia**. Los 359
tests existentes se adaptaron para correr dentro de una agencia, y se agregaron los de aislamiento.

## 6. Fuera de alcance por ahora

- Cobro de la suscripción del SaaS: planes, límites y facturación a las agencias.
- Un empleado que trabaje en dos agencias con la misma cuenta.
- Personalización por agencia: logo, formato de factura, dominio propio.

## 7. Decisiones (2026-09-29)

1. **Alta de agencias:** solo el **dueño de la plataforma** las crea desde su panel e invita al primer
   ADMIN de cada una. No hay registro público.
2. **Esquema:** **baseline v2**. `schema.sql` se reescribe con `agencia_id`, FK compuestas y RLS desde el
   origen; incorpora las migraciones `PagosEnCordobas` y `Auditoria`, y se vuelve a congelar. Aún no
   había ninguna BD desplegada.
3. **Países:** **solo Nicaragua** (USD + córdobas, hora de Managua) para todas las agencias.

## 8. Decisiones técnicas del diseño detallado

- **`agencia_id` lo pone la BD:** cada tabla de agencia tiene `DEFAULT fn_agencia_actual()`, que lee la
  variable de sesión y falla (`42501`) si no está fijada. El código nunca asigna `agencia_id`: no se
  puede olvidar ni falsificar, y RLS `WITH CHECK` impide escribir en otra agencia. Por eso se descartan
  los filtros globales de EF de la sección 1: RLS ya filtra, y un filtro duplicado solo agrega código.
- **La vista `v_facturas_saldo` usa `security_invoker`:** sin eso, PostgreSQL ejecuta las vistas con los
  permisos de su dueño, que no pasa por RLS, y **la vista mostraría los saldos de todas las agencias**.
  Un test lo comprueba.
- **Identificación del usuario al validar el token:** antes de saber la agencia no se puede leer
  `usuarios` (RLS lo impide). Una función `SECURITY DEFINER` acotada, `fn_identificar_usuario(sub)`,
  devuelve solo lo necesario: agencia, estado, roles, o si es dueño de la plataforma.
- **Dueños de la plataforma:** tabla aparte, `usuarios_plataforma`, sin agencia. El primero se crea al
  iniciar sesión con un correo listado en la configuración `Plataforma:Propietarios`, sin SQL. No
  tienen acceso a datos de negocio de ninguna agencia.
- **Agencia nueva:** se crea con las ubicaciones MIA y MGA y la ruta Miami → Managua. El ADMIN las
  puede cambiar. Las tarifas las define cada agencia.
- **Invitaciones:** la API usa la *service role key* de Supabase (`Supabase:ServiceRoleKey`, secreto) para
  invitar al primer ADMIN y a los empleados. Supabase envía el correo para crear la contraseña.

## 9. Módulo de administración (implementado)

Respuestas de "Antes de cada funcionalidad nueva" (CLAUDE.md). Todo se opera desde el frontend. La
auditoría de todos estos cambios la hacen los triggers `fn_auditar`, sin código adicional.

| | Agencias | Usuarios y roles | Tarifas | Ubicaciones y rutas |
|---|---|---|---|---|
| **Problema** | Dar de alta, corregir y suspender clientes del SaaS sin SQL | Dar acceso a los empleados y quitárselo al instante | Cambiar precios sin SQL y sin alterar lo ya cobrado | Operar desde otras bodegas o destinos |
| **Actor** | Dueño de la plataforma | ADMIN de la agencia | ADMIN (consultan AGENTE y BODEGA) | ADMIN |
| **Datos** | Nombre, RUC, contacto; primer ADMIN (nombre, correo) | Nombre, correo, teléfono, roles | Método, precio por libra, fecha de inicio | Código, nombre, país; origen y destino |
| **Reglas** | Nombre único; todo o nada con la invitación; suspender corta el acceso | Correo único en la plataforma; ≥ 1 ADMIN activo; nadie se quita su ADMIN ni se desactiva | Desde hoy (Managua) en adelante; cierra la anterior; anular solo programada o vigente sin paquetes | Rutas US → NI; no desactivar una ubicación en rutas activas |
| **Entidades** | `agencias` (+ `ubicaciones`, `rutas`, `usuarios` iniciales) | `usuarios`, `usuario_roles` | `tarifas_envio` | `ubicaciones`, `rutas` |
| **Permisos** | `PLATAFORMA` | `ADMIN` | Leer: `ADMIN`, `AGENTE`, `BODEGA`; escribir: `ADMIN` | `ADMIN` |
| **Pruebas** | `PlataformaTests` | `UsuariosTests` | `TarifasTests` | `UbicacionesRutasTests` |

Decisiones de esta etapa:

- **Invitación en la misma transacción que el alta:** primero el INSERT (un correo repetido se rechaza
  sin enviar nada), después la invitación, al final el COMMIT. Si Supabase falla, no queda nada creado.
  Reinvitar a quien no aceptó reenvía el correo con la misma cuenta, así que un reintento funciona.
- **El correo no se edita:** es la cuenta de Supabase. Para cambiarlo, se desactiva el usuario y se
  invita otro.
- **Un solo ADMIN no se puede quedar fuera:** los cambios de usuarios bloquean la fila de la agencia
  (`FOR NO KEY UPDATE`, que no bloquea los INSERT que la referencian).
- **Tarifas sin edición:** una tarifa se reemplaza (la nueva cierra la anterior) o se anula (la anterior
  se reabre). Una tarifa vigente registrada hoy por error se puede anular mientras no se haya pesado
  ningún paquete con ella.
- **Los dueños de la plataforma quedan auditados** en `audit_logs.origen` (`[plataforma <id>] …`),
  porque no están en `usuarios`.
- **Limitación conocida:** que el correo sea único en toda la plataforma deja ver a un ADMIN que ese
  correo ya existe en otra agencia (409). Supabase revela lo mismo al invitar; no se expone nada más.

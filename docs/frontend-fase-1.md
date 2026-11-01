# Frontend · Primera fase

Fecha inicial: 2026-10-24. Integración preparada: 2026-10-27. Entorno validado: 2026-10-31.
Alcance: paso 2 de la hoja de ruta de `CLAUDE.md`.
La conexión real está habilitada por defecto; la demostración se abre con `npm run dev:demo`.
El frontend y los secretos del backend están configurados. La conexión PostgreSQL real y el
acceso administrativo a Auth están validados; falta confirmar el correo del propietario y
completar el recorrido autenticado real.

## Criterios de negocio

| Funcionalidad / problema | Actor | Datos y entidad | Regla y permisos | Auditoría y verificación |
|---|---|---|---|---|
| Acceso al espacio correcto | Usuario invitado / dueño | Sesión y `/api/me` | Identidad y roles de API; sin registro público; bloquear 403 | Sin auditoría nueva; pruebas de rutas, 401 y 403 |
| Crear y administrar agencias sin SQL | PLATAFORMA | Agencia, contacto y primer ADMIN | Acceso solo PLATAFORMA; suspender conserva datos | La API audita; simulación local y prueba de separación de navegación |
| Dar acceso al equipo | ADMIN | Usuario y roles | Al menos un rol; correo fijo al editar; no desactivarse a sí mismo | Triggers existentes en modo real; prueba de formulario y cambio de rol |
| Consultar y programar precios | ADMIN escribe; AGENTE/BODEGA consultan | Tarifas por método y fecha | USD por libra; hasta cuatro decimales; desde hoy en Managua; reemplazar/anular | Sin cambios al cálculo; pruebas de validación y acciones según rol |
| Referencia para cobros en NIO | ADMIN escribe; AGENTE consulta | Tipo de cambio diario | NIO por USD, hasta cuatro decimales; vigente según fecha de Managua | La API conserva la copia de pagos; pruebas de precisión y fechas |
| Organizar origen y destino | ADMIN | Ubicaciones y rutas | US → NI; código/país y extremos de ruta no editables; restricciones de activación | Auditoría existente en API; comprobación de alta, renombrado y conflictos en demostración |

## Decisiones de implementación

- Se mantiene el contrato JSON camelCase y los códigos de dominio `UPPER_SNAKE`.
- No se toca `database/schema.sql`, RLS, migraciones ni configuración de producción.
- Los datos operativos siempre pasan por ASP.NET Core en modo conectado. Supabase se usa
  exclusivamente para Auth; el cliente no consulta tablas de la agencia directamente.
- La caché se limpia al cambiar de identidad o cerrar sesión. También se cancelan solicitudes
  y eliminan datos de negocio si `/api/me` cambia roles/agencia para el mismo usuario o bloquea
  su acceso. Un 403 de otra operación vuelve a consultar identidad.
- La demostración se habilita explícitamente mediante `VITE_DEMO_MODE=true`; no hay
  sustitución silenciosa de una API caída por datos ficticios. El aviso aparece en todas
  las pantallas del espacio y las invitaciones se identifican como simuladas.
- Las tarifas y tipos de cambio se introducen como texto validado antes de serializar
  números. Los cálculos financieros definitivos siguen perteneciendo al backend.
- El simulador reside en un módulo separado, cargado dinámicamente. Sus datos cambian
  en memoria y se reinician al recargar. No es un backend alternativo.
- El diseño utiliza Nunito alojada localmente, con tipografías del sistema como respaldo,
  iconos SVG y CSS locales. La demostración no requiere servicios externos de imágenes o fuentes.

## Estilo visual

La referencia solicitada es [MiiChart](https://miichart.com/). Se adapta su lenguaje visual
al contexto de paquetería: fondo crema, tipografía Nunito redondeada, titulares oscuros con
acento coral, superficies claras, tarjetas pastel y navegación flotante de bordes redondeados.
Las imágenes y los personajes del sitio de referencia no forman parte de la aplicación.

Los colores se centralizan en `frontend/src/theme.css`, que se carga después de los estilos
de estructura y aplica la misma identidad a acceso, navegación, tablas, estados y formularios.
Nunito se distribuye con `@fontsource-variable/nunito`, sin solicitudes a Google Fonts.

| Uso | Color |
|---|---|
| Fondo crema | `#FBF6EC` |
| Superficie de tarjetas | `#FFFDF8` |
| Texto principal | `#3A322A` |
| Acción principal coral | `#ED7B89` |
| Rosa pastel | `#FFE3E9` |
| Amarillo pastel | `#FAF0CE` |
| Azul pastel | `#E3EFFA` |
| Verde pastel | `#E8F2DC` |
| Lavanda | `#EEE7F8` |

La adaptación conserva los permisos, validaciones y el modo de demostración existentes.

## Pendientes de la integración real

1. Confirmar el correo de la cuenta del propietario configurada en este equipo y verificar
   la redirección de invitaciones. `.env.local` y los user-secrets ya están guardados; PostgreSQL
   y Auth administrativo fueron validados. CORS permite los dos orígenes locales de Vite.
2. Comprobar acceso, renovación de sesión y aceptación de invitaciones con cuentas reales.
3. Verificar por HTTP los formularios y mensajes 400/403/409/503 con la API encendida.
4. Recorrer las restricciones de último administrador, tarifa aplicada y ubicaciones/rutas
   contra PostgreSQL y la API existente. Las reglas definitivas no dependen del simulador.
5. Continuar con fases 2 y 3: clientes, paquetes, embarques, caja, entregas y auditoría.

## Verificación de esta entrega

- `npm run build`: TypeScript y compilación de producción aprobados.
- `npm run lint`: aprobado, sin advertencias.
- `npm test`: 23 pruebas aprobadas en tres archivos.
- Navegador: bienvenida, panel, validación y alta simulada de usuario, corrección de tipo
  de cambio y conflicto al desactivar una ubicación en una ruta activa.
- Diseño revisado en escritorio y a 390 × 844 px; menú móvil y tablas con desplazamiento
  horizontal. Se corrigió el solapamiento de la ilustración de bienvenida en móvil.
- No se ejecutaron operaciones contra la API ni Supabase durante esta verificación.

## Verificación de la integración (2026-10-27)

- Frontend: compilación de producción, lint sin advertencias y 53 pruebas aprobadas.
- Configuración real por defecto y simulador opcional; las claves privadas o URLs inválidas
  no inicializan el cliente público. Sin credenciales se muestra el acceso sin configurar.
- Pruebas de login, invitaciones, renovación de token, sesión vencida y cambio de permisos
  realizadas con Supabase simulado. No se enviaron invitaciones reales.
- Backend compilado sin errores ni advertencias; 145 pruebas unitarias aprobadas.
- API temporal por HTTP: `/health` devuelve 200, `/api/me` sin token devuelve 401, preflight
  con Bearer y JSON permite ambos orígenes locales en Development y los rechaza en Production.
  Esta comprobación usa una cadena ficticia y no comprueba conexión con PostgreSQL.
- La suite de integración con PostgreSQL requiere Docker, que está apagado en este equipo.
- El usuario proporcionó la URL y la clave pública para la configuración local del frontend.
  Ambas quedaron guardadas en `.env.local`; `/auth/v1/settings` y el JWKS real respondieron
  HTTP 200. El cliente Supabase se inicializó y la compilación con estos valores fue aprobada.
  El inicio de sesión, operaciones autenticadas y reglas contra la BD quedan por comprobar cuando
  estén disponibles los secretos del backend y una cuenta con acceso. No hay cambios de esquema
  ni de datos reales.

## Validación del entorno (2026-10-31)

- User-secrets del backend guardados y validados, sin copiar secretos al repositorio.
- Conexión PostgreSQL real exitosa con consultas de solo lectura: esquema presente, rol de la
  API miembro de `paqueteria_api`, sin superusuario ni bypass de RLS. La contraseña con separador
  se serializó correctamente sin cambiarla; se conserva `SSL Mode=VerifyFull` con la CA pública
  oficial almacenada junto a user-secrets.
- API administrativa de Auth: HTTP 200 con `HttpClient` sin User-Agent. Para repetir la prueba,
  evitar `Invoke-WebRequest` con User-Agent de navegador al usar una clave secreta.
- Certificado HTTPS de desarrollo de .NET confiado. `/health` solo comprueba disponibilidad
  de la API; la conexión a PostgreSQL se validó por separado.
- El propietario configurado existe y su correo aún no está confirmado. No se ha probado
  login, invitaciones ni operaciones de negocio de extremo a extremo.

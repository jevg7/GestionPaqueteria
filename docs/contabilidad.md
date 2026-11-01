# Contabilidad de la agencia

El módulo `/contabilidad` registra el libro diario en **córdobas (NIO)** y genera
el balance general, estado de resultados y balanza de comprobación desde sus
partidas. Acceso exclusivo del rol `ADMIN` de cada agencia, con las mismas reglas
de aislamiento y auditoría del resto del sistema.

## Cómo empezar

1. Aplicar la migración `20261101205707_Contabilidad` con el dueño del esquema.
2. Entrar como ADMIN de una agencia y abrir **Contabilidad**.
3. Pulsar **Crear plan de cuentas inicial**. Agrega 21 cuentas sin saldos; repetir
   la acción agrega únicamente los códigos que falten. Se pueden crear cuentas
   propias y renombrar o desactivar cuentas existentes.
4. Registrar un asiento de apertura con los saldos reales de caja, bancos,
   cuentas por cobrar/pagar, activos y capital. Debe y haber deben cuadrar.
5. Usar **Registrar gasto** para gastos diarios o **Nuevo asiento** para ingresos,
   aportes de capital, préstamos, compra de activos y ajustes.

Los reportes necesitan todos los movimientos correspondientes, incluidos los
ingresos y saldos de apertura. Esta entrega usa registro contable manual:
facturas y pagos operativos no generan asientos automáticamente. Todos los
importes se registran en NIO; no se suman importes USD como si fueran córdobas.

## Libro diario y gastos

Cada asiento contiene fecha contable, concepto, referencia opcional del
comprobante y entre 2 y 100 partidas. Cada partida tiene una cuenta y un importe
positivo en debe o haber, con hasta dos decimales. La fecha usa el calendario de
Managua y no puede ser futura.

El formulario de gasto crea dos partidas: un débito en una cuenta de gasto/costo
deudora y un crédito en la contrapartida seleccionada de activo o pasivo. Ejemplos:

| Operación | Debe | Haber |
|---|---|---|
| Alquiler pagado en efectivo, C$1,200 | Alquiler 1,200 | Caja 1,200 |
| Servicio recibido pendiente de pago, C$500 | Servicios básicos 500 | Cuentas por pagar 500 |
| Ingreso cobrado, C$3,000 | Caja/Bancos 3,000 | Ingresos por envíos 3,000 |
| Aporte de capital, C$10,000 | Caja/Bancos 10,000 | Capital aportado 10,000 |
| Compra de equipo, C$2,000 | Equipo y mobiliario 2,000 | Caja/Bancos 2,000 |

Una compra de activo o una amortización de préstamo puede registrarse mediante el
asiento general, eligiendo las cuentas correspondientes. La referencia es texto
del comprobante; no se adjuntan archivos en esta entrega.

## Integridad e historial

- Asientos publicados y partidas inmutables. Corregir requiere registrar una
  reversión con fecha y motivo y, si corresponde, un asiento nuevo.
- La reversión invierte exactamente los importes por cuenta, se admite una sola
  por asiento y no puede tener fecha anterior al original. Se permite revertir
  aunque la cuenta se haya desactivado.
- Original y reversión permanecen en el diario y afectan los reportes desde sus
  respectivas fechas. Una reversión posterior no reescribe un balance anterior.
- Las cuentas con movimientos conservan código, tipo, clasificación y
  naturaleza. Se pueden renombrar o desactivar.
- PostgreSQL valida el cuadre al confirmar la transacción, impide añadir partidas
  posteriormente y bloquea la edición y el borrado físico del historial.
- Las tres tablas usan `agencia_id`, claves compuestas, RLS y auditoría. Los
  propietarios de plataforma no consultan los libros de otras agencias.

## Estados financieros

**Balance general:** saldos acumulados hasta una fecha. Presenta activos y pasivos
corrientes/no corrientes, capital y reservas y resultado acumulado. Comprueba
`activos = pasivos + patrimonio`. Los contraactivos, como depreciación acumulada,
reducen el activo. Las pérdidas reducen el patrimonio.

**Estado de resultados:** movimientos entre dos fechas incluidas. Muestra
ingresos, costos, gastos, utilidad bruta y resultado neto del período. Los saldos
anteriores al rango no se tratan como ingresos o gastos del período actual.

**Balanza de comprobación:** saldo inicial, movimientos al debe/haber y saldos
deudores/acreedores por cuenta, con sus totales y comprobación de cuadre.

El resultado acumulado se calcula desde ingresos, costos y gastos del libro y se
incorpora al patrimonio del balance. No hay cierre anual automático ni cálculo
tributario automático. Los ajustes contables se registran como asientos.

La separación entre activos, pasivos, patrimonio, ingresos y gastos sigue los
conceptos del [Marco Conceptual de IFRS](https://www.ifrs.org/issued-standards/list-of-standards/conceptual-framework/).
Los reportes del módulo no afirman por sí solos cumplimiento fiscal o normativo.

## API

Todas las rutas están bajo `/api/accounting` y exigen ADMIN activo de agencia.

| Método y ruta | Operación |
|---|---|
| GET/POST `accounts` | Consultar o crear cuentas |
| POST `accounts/initialize` | Inicializar el plan básico sin saldos |
| PUT `accounts/{id}` | Renombrar, clasificar si no tiene movimientos o activar/desactivar |
| GET `journal?desde=&hasta=&search=&page=&pageSize=` | Diario paginado |
| GET `journal/{id}` | Detalle del asiento y sus partidas |
| POST `journal` | Contabilizar un asiento equilibrado |
| POST `journal/{id}/reverse` | Registrar contraasiento |
| POST `expenses` | Registrar un gasto por partida doble |
| GET `balance-sheet?asOf=yyyy-MM-dd` | Balance general al corte |
| GET `income-statement?from=yyyy-MM-dd&to=yyyy-MM-dd` | Estado de resultados |
| GET `trial-balance?from=yyyy-MM-dd&to=yyyy-MM-dd` | Balanza de comprobación |

## Migración y activación

**Activada en Supabase el 2026-11-01.** El usuario ejecutó el script completo
desde SQL Editor y obtuvo `Success. No rows returned`. Una comprobación posterior
de solo lectura confirmó las tres tablas, RLS y sus políticas por agencia, 17
triggers (incluidos dos controles de cuadre diferidos) y cinco funciones contables.
El rol de la API tiene permisos de operación y carece de DELETE/TRUNCATE. La API
responde y publica las rutas contables; cargar el plan inicial sigue siendo una
acción del ADMIN de cada agencia.

`database/schema.sql` permanece congelado. La nueva migración crea únicamente
`cuentas_contables`, `asientos_contables` y `partidas_contables`, sus claves y las
protecciones contables. El SQL idempotente para una base con Baseline aplicado
está en `database/migrations/20261101205707_Contabilidad.sql`.

También puede aplicarse ese archivo completo desde SQL Editor de Supabase como
`postgres` o dueño del esquema. El script incluye transacción y registro de la
migración en el historial de EF. Esta vía usa la sesión administrativa del panel;
no requiere configurar una conexión del dueño en el equipo.

Desde `backend/`, con `ConnectionStrings:PaqueteriaOwner` configurada en
user-secrets y apuntando a la misma base de la API:

```powershell
dotnet ef database update --project src/Paqueteria.Api
```

La API continúa usando `ConnectionStrings:Paqueteria`, con el rol restringido. El
dueño del esquema se usa únicamente para migraciones y no pasa al frontend.

El modo demo dispone de un libro en memoria con las mismas pantallas y moneda.
Sus cuentas y asientos no se guardan en Supabase y se reinician al recargar.

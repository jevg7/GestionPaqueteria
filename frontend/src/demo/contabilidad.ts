// Libro aislado de demostración. Los importes se acumulan en centavos.
import { ErrorApi } from '../lib/api-error'
import type {
  AsientoContable,
  CuentaContable,
  NuevoAsientoContable,
  NuevoGastoContable,
  SaldoCuentaContable,
  TipoCuenta,
} from '../lib/contabilidad'

const cuentas: CuentaContable[] = []
const asientos: AsientoContable[] = []
const fallo = (detail: string) => {
  throw new ErrorApi(409, { detail })
}
const cents = (n: number) => Math.round(n * 100)
const money = (n: number) => n / 100

function inicializar() {
  const plan: Array<
    [string, string, TipoCuenta, CuentaContable['clasificacion']]
  > = [
    ['1101', 'Caja', 'ACTIVO', 'CORRIENTE'],
    ['1102', 'Bancos', 'ACTIVO', 'CORRIENTE'],
    ['1103', 'Cuentas por cobrar', 'ACTIVO', 'CORRIENTE'],
    ['1104', 'Anticipos y pagos por adelantado', 'ACTIVO', 'CORRIENTE'],
    ['1201', 'Mobiliario y equipo', 'ACTIVO', 'NO_CORRIENTE'],
    ['1202', 'Depreciación acumulada', 'ACTIVO', 'NO_CORRIENTE'],
    ['2101', 'Cuentas por pagar', 'PASIVO', 'CORRIENTE'],
    ['2102', 'Préstamos a corto plazo', 'PASIVO', 'CORRIENTE'],
    ['2201', 'Préstamos a largo plazo', 'PASIVO', 'NO_CORRIENTE'],
    ['3101', 'Capital aportado', 'PATRIMONIO', 'NO_APLICA'],
    ['3102', 'Resultados acumulados', 'PATRIMONIO', 'NO_APLICA'],
    ['4101', 'Ingresos por servicios', 'INGRESO', 'NO_APLICA'],
    ['4102', 'Otros ingresos', 'INGRESO', 'NO_APLICA'],
    ['5101', 'Costos de transporte', 'COSTO', 'NO_APLICA'],
    ['6101', 'Alquiler', 'GASTO', 'NO_APLICA'],
    ['6102', 'Servicios básicos', 'GASTO', 'NO_APLICA'],
    ['6103', 'Sueldos y salarios', 'GASTO', 'NO_APLICA'],
    ['6104', 'Combustible', 'GASTO', 'NO_APLICA'],
    ['6105', 'Suministros', 'GASTO', 'NO_APLICA'],
    ['6106', 'Depreciación', 'GASTO', 'NO_APLICA'],
    ['6199', 'Otros gastos', 'GASTO', 'NO_APLICA'],
  ]
  for (const [codigo, nombre, tipo, clasificacion] of plan) {
    if (!cuentas.some((c) => c.codigo === codigo))
      cuentas.push({
        id: cuentas.length + 1,
        codigo,
        nombre,
        tipo,
        clasificacion,
        activo: true,
        naturaleza:
          codigo !== '1202' && ['ACTIVO', 'COSTO', 'GASTO'].includes(tipo)
            ? 'DEUDORA'
            : 'ACREEDORA',
      })
  }
  return cuentas
}

function registrar(
  body: NuevoAsientoContable,
  reversionDeId: number | null = null,
) {
  if (
    !body.concepto?.trim() ||
    body.partidas.length < 2 ||
    body.partidas.length > 100
  )
    fallo('Registra un concepto y entre 2 y 100 partidas.')
  let debe = 0
  let haber = 0
  const partidas = body.partidas.map((p) => {
    const cuenta = cuentas.find((c) => c.id === p.cuentaId)
    if (!cuenta || (!cuenta.activo && !reversionDeId))
      fallo('La cuenta no está disponible.')
    if (
      !Number.isFinite(p.debe) ||
      !Number.isFinite(p.haber) ||
      p.debe < 0 ||
      p.haber < 0 ||
      p.debe > 0 === p.haber > 0
    )
      fallo('Cada partida debe tener debe o haber positivo.')
    if (money(cents(p.debe)) !== p.debe || money(cents(p.haber)) !== p.haber)
      fallo('Los importes deben tener hasta dos decimales.')
    debe += cents(p.debe)
    haber += cents(p.haber)
    return { ...p, codigo: cuenta!.codigo, nombre: cuenta!.nombre }
  })
  if (debe <= 0 || debe !== haber)
    fallo('El asiento debe cuadrar entre debe y haber.')
  const asiento: AsientoContable = {
    id: asientos.length + 1,
    fecha: body.fecha,
    concepto: body.concepto.trim(),
    referencia: body.referencia,
    reversionDeId,
    revertidoPorId: null,
    registradoPorUsuarioId: 1,
    creadoEn: new Date().toISOString(),
    totalDebe: money(debe),
    totalHaber: money(haber),
    partidas,
  }
  asientos.push(asiento)
  return asiento
}

function movimientos(desde: string, hasta: string) {
  return cuentas.map((cuenta) => {
    let inicial = 0
    let debe = 0
    let haber = 0
    for (const asiento of asientos) {
      if (asiento.fecha > hasta) continue
      for (const p of asiento.partidas.filter(
        (p) => p.cuentaId === cuenta.id,
      )) {
        if (asiento.fecha < desde) inicial += cents(p.debe) - cents(p.haber)
        else {
          debe += cents(p.debe)
          haber += cents(p.haber)
        }
      }
    }
    return { cuenta, inicial, debe, haber, neto: inicial + debe - haber }
  })
}

export function contabilidadDemo<T>(
  url: URL,
  method: string,
  body: unknown,
): T {
  const recurso = url.pathname.split('/')[3]
  const id = Number(url.pathname.split('/')[4])
  const accion = url.pathname.split('/')[5]
  const data = body as Record<string, unknown>
  let result: unknown
  if (recurso === 'accounts') {
    if (method === 'GET') result = cuentas
    else if (method === 'POST' && url.pathname.endsWith('/initialize'))
      result = inicializar()
    else if (method === 'POST' || method === 'PUT') {
      const cuenta = data as unknown as Omit<CuentaContable, 'id'>
      const anterior = cuentas.find((c) => c.id === id)
      if (cuentas.some((c) => c.codigo === cuenta.codigo && c.id !== id))
        fallo('Ya existe ese código de cuenta.')
      if (method === 'PUT') {
        if (!anterior) throw new ErrorApi(404)
        const usada = asientos.some((a) =>
          a.partidas.some((p) => p.cuentaId === id),
        )
        if (
          usada &&
          ['codigo', 'tipo', 'naturaleza', 'clasificacion'].some(
            (key) =>
              anterior![key as keyof CuentaContable] !==
              cuenta[key as keyof typeof cuenta],
          )
        )
          fallo('Una cuenta con movimientos no puede reclasificarse.')
        Object.assign(anterior!, cuenta)
        result = anterior
      } else {
        const nueva = { ...cuenta, id: cuentas.length + 1 }
        cuentas.push(nueva)
        result = nueva
      }
    }
  } else if (recurso === 'journal') {
    if (method === 'POST' && accion === 'reverse') {
      const original = asientos.find((a) => a.id === id)
      if (!original) throw new ErrorApi(404)
      if (original.reversionDeId || original.revertidoPorId)
        fallo('El asiento ya fue revertido o es una reversión.')
      if (String(data.fecha) < original.fecha)
        fallo('La reversión no puede ser anterior al asiento.')
      const nuevo = registrar(
        {
          fecha: String(data.fecha),
          concepto: `Reversión: ${String(data.motivo)}`,
          referencia: original.referencia,
          partidas: original.partidas.map((p) => ({
            cuentaId: p.cuentaId,
            debe: p.haber,
            haber: p.debe,
            detalle: p.detalle,
          })),
        },
        original.id,
      )
      original.revertidoPorId = nuevo.id
      result = nuevo
    } else if (method === 'POST')
      result = registrar(body as NuevoAsientoContable)
    else if (id) {
      result = asientos.find((a) => a.id === id)
      if (!result) throw new ErrorApi(404)
    } else {
      const q = url.searchParams
      const rows = asientos
        .filter(
          (a) =>
            (!q.get('desde') || a.fecha >= q.get('desde')!) &&
            (!q.get('hasta') || a.fecha <= q.get('hasta')!) &&
            (!q.get('search') ||
              `${a.concepto} ${a.referencia ?? ''}`
                .toLowerCase()
                .includes(q.get('search')!.toLowerCase())),
        )
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
      const page = Number(q.get('page') || 1)
      const pageSize = Number(q.get('pageSize') || 20)
      result = {
        items: rows.slice((page - 1) * pageSize, page * pageSize),
        total: rows.length,
        page,
        pageSize,
      }
    }
  } else if (recurso === 'expenses' && method === 'POST') {
    const gasto = body as NuevoGastoContable
    if (
      !['COSTO', 'GASTO'].includes(
        cuentas.find((c) => c.id === gasto.cuentaGastoId)?.tipo ?? '',
      )
    )
      fallo('Selecciona una cuenta de costo o gasto.')
    if (
      !['ACTIVO', 'PASIVO'].includes(
        cuentas.find((c) => c.id === gasto.contrapartidaId)?.tipo ?? '',
      )
    )
      fallo('Selecciona una contrapartida de activo o pasivo.')
    result = registrar({
      fecha: gasto.fecha,
      concepto: gasto.concepto,
      referencia: gasto.referencia,
      partidas: [
        {
          cuentaId: gasto.cuentaGastoId,
          debe: gasto.monto,
          haber: 0,
          detalle: null,
        },
        {
          cuentaId: gasto.contrapartidaId,
          debe: 0,
          haber: gasto.monto,
          detalle: null,
        },
      ],
    })
  } else if (method === 'GET') {
    const desde = url.searchParams.get('from') || '0001-01-01'
    const hasta =
      url.searchParams.get('asOf') ||
      url.searchParams.get('to') ||
      new Date().toISOString().slice(0, 10)
    const rows = movimientos(
      recurso === 'balance-sheet' ? '0001-01-01' : desde,
      hasta,
    )
    const saldos: SaldoCuentaContable[] = rows.map(
      ({ cuenta, neto, debe, haber }) => ({
        cuentaId: cuenta.id,
        codigo: cuenta.codigo,
        nombre: cuenta.nombre,
        tipo: cuenta.tipo,
        clasificacion: cuenta.clasificacion,
        saldo: money(
          (['PASIVO', 'PATRIMONIO', 'INGRESO'].includes(cuenta.tipo) ? -1 : 1) *
            (recurso === 'income-statement' ? debe - haber : neto),
        ),
      }),
    )
    const suma = (tipo: TipoCuenta) =>
      money(
        saldos
          .filter((c) => c.tipo === tipo)
          .reduce((n, c) => n + cents(c.saldo), 0),
      )
    if (recurso === 'balance-sheet') {
      const totalActivos = suma('ACTIVO')
      const totalPasivos = suma('PASIVO')
      const capitalYReservas = suma('PATRIMONIO')
      const resultadoAcumulado = money(
        cents(suma('INGRESO')) - cents(suma('COSTO')) - cents(suma('GASTO')),
      )
      const totalPatrimonio = money(
        cents(capitalYReservas) + cents(resultadoAcumulado),
      )
      const diferencia = money(
        cents(totalActivos) - cents(totalPasivos) - cents(totalPatrimonio),
      )
      result = {
        moneda: 'NIO',
        fechaCorte: hasta,
        cuentas: saldos.filter((c) =>
          ['ACTIVO', 'PASIVO', 'PATRIMONIO'].includes(c.tipo),
        ),
        totalActivos,
        totalPasivos,
        capitalYReservas,
        resultadoAcumulado,
        totalPatrimonio,
        diferencia,
        cuadrado: diferencia === 0,
      }
    } else if (recurso === 'income-statement') {
      const ingresos = suma('INGRESO')
      const costos = suma('COSTO')
      const gastos = suma('GASTO')
      result = {
        moneda: 'NIO',
        desde,
        hasta,
        cuentas: saldos.filter((c) =>
          ['INGRESO', 'COSTO', 'GASTO'].includes(c.tipo),
        ),
        ingresos,
        costos,
        gastos,
        utilidadBruta: money(cents(ingresos) - cents(costos)),
        resultadoNeto: money(cents(ingresos) - cents(costos) - cents(gastos)),
      }
    } else if (recurso === 'trial-balance') {
      const lineas = rows.map(({ cuenta, inicial, debe, haber, neto }) => ({
        cuentaId: cuenta.id,
        codigo: cuenta.codigo,
        nombre: cuenta.nombre,
        tipo: cuenta.tipo,
        clasificacion: cuenta.clasificacion,
        saldoInicial: money(inicial),
        debe: money(debe),
        haber: money(haber),
        saldoDeudor: money(Math.max(neto, 0)),
        saldoAcreedor: money(Math.max(-neto, 0)),
      }))
      const sum = (key: 'debe' | 'haber' | 'saldoDeudor' | 'saldoAcreedor') =>
        money(lineas.reduce((s, c) => s + cents(c[key]), 0))
      result = {
        moneda: 'NIO',
        desde,
        hasta,
        cuentas: lineas,
        totalDebe: sum('debe'),
        totalHaber: sum('haber'),
        totalSaldoDeudor: sum('saldoDeudor'),
        totalSaldoAcreedor: sum('saldoAcreedor'),
        cuadrado: sum('saldoDeudor') === sum('saldoAcreedor'),
      }
    }
  }
  if (result === undefined) throw new ErrorApi(404)
  return structuredClone(result) as T
}

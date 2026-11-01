export const tiposCuenta = [
  'ACTIVO',
  'PASIVO',
  'PATRIMONIO',
  'INGRESO',
  'COSTO',
  'GASTO',
] as const
export type TipoCuenta = (typeof tiposCuenta)[number]
export type NaturalezaCuenta = 'DEUDORA' | 'ACREEDORA'
export type ClasificacionCuenta = 'CORRIENTE' | 'NO_CORRIENTE' | 'NO_APLICA'

export const nombresTiposCuenta: Record<TipoCuenta, string> = {
  ACTIVO: 'Activo',
  PASIVO: 'Pasivo',
  PATRIMONIO: 'Patrimonio',
  INGRESO: 'Ingreso',
  COSTO: 'Costo',
  GASTO: 'Gasto',
}
export const nombresGruposCuenta: Record<ClasificacionCuenta, string> = {
  CORRIENTE: 'Corriente',
  NO_CORRIENTE: 'No corriente',
  NO_APLICA: 'No aplica',
}

export interface CuentaContable {
  id: number
  codigo: string
  nombre: string
  tipo: TipoCuenta
  clasificacion: ClasificacionCuenta
  naturaleza: NaturalezaCuenta
  activo: boolean
}
export interface PartidaContable {
  cuentaId: number
  codigo: string
  nombre: string
  debe: number
  haber: number
  detalle: string | null
}
export interface AsientoContable {
  id: number
  fecha: string
  concepto: string
  referencia: string | null
  reversionDeId: number | null
  revertidoPorId: number | null
  registradoPorUsuarioId: number
  creadoEn: string
  totalDebe: number
  totalHaber: number
  partidas: PartidaContable[]
}
export interface NuevaPartidaContable {
  cuentaId: number
  debe: number
  haber: number
  detalle: string | null
}
export interface NuevoAsientoContable {
  fecha: string
  concepto: string
  referencia: string | null
  partidas: NuevaPartidaContable[]
}
export interface NuevoGastoContable {
  fecha: string
  concepto: string
  referencia: string | null
  cuentaGastoId: number
  contrapartidaId: number
  monto: number
}
export interface SaldoCuentaContable {
  cuentaId: number
  codigo: string
  nombre: string
  tipo: TipoCuenta
  clasificacion: ClasificacionCuenta
  saldo: number
}
export interface BalanceGeneral {
  moneda: 'NIO'
  fechaCorte: string
  cuentas: SaldoCuentaContable[]
  totalActivos: number
  totalPasivos: number
  capitalYReservas: number
  resultadoAcumulado: number
  totalPatrimonio: number
  diferencia: number
  cuadrado: boolean
}
export interface EstadoResultados {
  moneda: 'NIO'
  desde: string
  hasta: string
  cuentas: SaldoCuentaContable[]
  ingresos: number
  costos: number
  gastos: number
  utilidadBruta: number
  resultadoNeto: number
}
export interface BalanzaComprobacion {
  moneda: 'NIO'
  desde: string
  hasta: string
  cuentas: Array<
    Omit<SaldoCuentaContable, 'saldo'> & {
      saldoInicial: number
      debe: number
      haber: number
      saldoDeudor: number
      saldoAcreedor: number
    }
  >
  totalDebe: number
  totalHaber: number
  totalSaldoDeudor: number
  totalSaldoAcreedor: number
  cuadrado: boolean
}

export function dineroContable(value: number) {
  return new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency: 'NIO',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/** Texto decimal a centavos exactos; no admite exponentes, separadores ni redondeo. */
export function centavosContables(value: string): number | null {
  const text = value.trim()
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(text)) return null
  const [entero, fraccion = ''] = text.split('.')
  const cents = Number(entero) * 100 + Number(fraccion.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

export interface PartidaEditable {
  cuentaId: string
  descripcion: string
  debe: string
  haber: string
}

export function totalesPartidas(partidas: PartidaEditable[]) {
  let debe = 0n
  let haber = 0n
  for (const partida of partidas) {
    const debit = centavosContables(partida.debe || '0')
    const credit = centavosContables(partida.haber || '0')
    if (debit === null || credit === null) return null
    debe += BigInt(debit)
    haber += BigInt(credit)
  }
  return { debe, haber, cuadrado: debe === haber && debe > 0n }
}

export function validarPartidas(partidas: PartidaEditable[]): string | null {
  if (partidas.length < 2 || partidas.length > 100)
    return 'El asiento debe tener entre 2 y 100 partidas.'
  for (const partida of partidas) {
    if (!/^\d+$/.test(partida.cuentaId) || Number(partida.cuentaId) <= 0)
      return 'Selecciona una cuenta para cada partida.'
    const debe = centavosContables(partida.debe || '0')
    const haber = centavosContables(partida.haber || '0')
    if (debe === null || haber === null)
      return 'Usa importes positivos con punto y hasta dos decimales, sin separadores de miles.'
    if (debe > 0 === haber > 0)
      return 'Cada partida debe tener un importe únicamente en el debe o en el haber.'
    if (partida.descripcion.length > 300)
      return 'El detalle de cada partida admite hasta 300 caracteres.'
  }
  if (!totalesPartidas(partidas)?.cuadrado)
    return 'El total del debe debe ser igual al total del haber.'
  return null
}

export function fechaContableValida(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-'))
    return false
  const parsed = new Date(`${value}T12:00:00Z`)
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}

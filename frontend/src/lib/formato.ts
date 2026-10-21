// Los instantes (DateTimeOffset) se muestran en hora de Managua, como los calcula el backend, sin importar la
// zona del equipo. Los días del calendario (DateOnly, "yyyy-MM-dd") se muestran tal cual, sin convertir.
const fecha = new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium', timeZone: 'America/Managua' })
const fechaHora = new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Managua' })
const formatoDeDia = new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium', timeZone: 'UTC' })
const partesEnManagua = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Managua', year: 'numeric', month: '2-digit', day: '2-digit' })

export function formatearFecha(iso: string): string {
  return fecha.format(new Date(iso))
}

export function formatearFechaHora(iso: string): string {
  return fechaHora.format(new Date(iso))
}

/** Un día del calendario ("yyyy-MM-dd"): leído como medianoche de Managua cambiaría al día anterior. */
export function formatearDia(valor: string): string {
  return formatoDeDia.format(new Date(`${valor}T00:00:00Z`))
}

/** Hoy en Managua como "yyyy-MM-dd": el "hoy" del negocio (CalculoMonto.FechaEnManagua en el backend). */
export function hoyEnManagua(ahora = new Date()): string {
  const partes = Object.fromEntries(partesEnManagua.formatToParts(ahora).map((parte) => [parte.type, parte.value]))
  return `${partes.year}-${partes.month}-${partes.day}`
}

const partesConHoraEnManagua = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Managua',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const desfaseDeManagua = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Managua', timeZoneName: 'longOffset' })

/** Un instante en hora de Managua como "yyyy-MM-ddTHH:mm", el valor de <input type="datetime-local">. */
export function fechaHoraEnManagua(instante: Date = new Date()): string {
  const partes = Object.fromEntries(partesConHoraEnManagua.formatToParts(instante).map((parte) => [parte.type, parte.value]))
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`
}

/**
 * Lo escrito en un <input type="datetime-local"> ("yyyy-MM-ddTHH:mm"), leído como hora de Managua sin importar la zona
 * del equipo, como instante con su desfase: "2026-10-20T08:30:00-06:00". El desfase lo da Intl (Managua no tiene
 * horario de verano: siempre −06:00).
 */
export function instanteEnManagua(valor: string): string {
  const zona = desfaseDeManagua.formatToParts(new Date(`${valor}:00Z`)).find((parte) => parte.type === 'timeZoneName')?.value
  const desfase = !zona || zona === 'GMT' ? 'Z' : zona.replace('GMT', '')
  return `${valor}:00${desfase}`
}

/** Un número con entre `minimo` y `maximo` decimales (precios y tipos de cambio: de 2 a 4). */
export function formatearNumero(valor: number, minimo = 2, maximo = 4): string {
  return new Intl.NumberFormat('es-NI', { minimumFractionDigits: minimo, maximumFractionDigits: maximo }).format(valor)
}

/** Un peso con sus 2 decimales (peso_lb es NUMERIC(10,2)). */
export const formatearLibras = (valor: number) => `${formatearNumero(valor, 2, 2)} lb`

/** Un monto en dólares con sus 2 decimales. */
export const formatearDolares = (valor: number) => `${formatearNumero(valor, 2, 2)} USD`

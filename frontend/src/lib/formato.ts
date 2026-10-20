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

/** Un número con entre `minimo` y `maximo` decimales (precios y tipos de cambio: de 2 a 4). */
export function formatearNumero(valor: number, minimo = 2, maximo = 4): string {
  return new Intl.NumberFormat('es-NI', { minimumFractionDigits: minimo, maximumFractionDigits: maximo }).format(valor)
}

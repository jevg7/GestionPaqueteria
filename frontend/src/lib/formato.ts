// Las fechas se muestran en hora de Managua, como las calcula el backend, sin importar la zona del equipo.
const fecha = new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium', timeZone: 'America/Managua' })
const fechaHora = new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Managua' })

export function formatearFecha(iso: string): string {
  return fecha.format(new Date(iso))
}

export function formatearFechaHora(iso: string): string {
  return fechaHora.format(new Date(iso))
}

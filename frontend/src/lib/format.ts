export const fechaManagua = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

export function fecha(value: string | null, long = false) {
  if (!value) return 'Sin fecha de fin'
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(value)
  return new Intl.DateTimeFormat('es-NI', {
    day: 'numeric',
    month: long ? 'long' : 'short',
    year: 'numeric',
    timeZone: isDay ? 'UTC' : 'America/Managua',
  }).format(new Date(isDay ? `${value}T12:00:00Z` : value))
}
export const dinero = (value: number, decimals = 2) =>
  new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: 4,
  }).format(value)
export const decimal = (value: number) =>
  new Intl.NumberFormat('es-NI', { maximumFractionDigits: 4 }).format(value)
export const iniciales = (nombres: string, apellidos = '') =>
  `${nombres[0] ?? ''}${apellidos[0] ?? ''}`.toUpperCase()
export const nombresRoles: Record<string, string> = {
  ADMIN: 'Administrador',
  AGENTE: 'Agente',
  BODEGA: 'Bodega',
  REPARTIDOR: 'Repartidor',
  PLATAFORMA: 'Plataforma',
}

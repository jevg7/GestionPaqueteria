import type { Identidad, Rol, RolAgencia } from './identidad.ts'

export type Seccion = {
  ruta: string
  titulo: string
  /** Permiso del backend (Auth/Permisos.cs) del que salen los roles de la sección. */
  permiso: string
  roles: readonly RolAgencia[]
}

// Secciones de la agencia, en el orden del menú, y quién las ve. Los roles copian los permisos del
// backend: la API los hace cumplir; aquí solo se ocultan las secciones que el usuario no puede usar.
// secciones.test.ts compara cada sección con Permisos.cs.
export const seccionesAgencia: readonly Seccion[] = [
  { ruta: 'paquetes', titulo: 'Paquetes', permiso: 'LeerPaquetes', roles: ['ADMIN', 'AGENTE', 'BODEGA'] },
  { ruta: 'clientes', titulo: 'Clientes', permiso: 'LeerClientes', roles: ['ADMIN', 'AGENTE', 'BODEGA'] },
  { ruta: 'embarques', titulo: 'Embarques', permiso: 'LeerEmbarques', roles: ['ADMIN', 'AGENTE', 'BODEGA'] },
  { ruta: 'facturas', titulo: 'Facturación', permiso: 'Facturar', roles: ['ADMIN', 'AGENTE'] },
  { ruta: 'entregas', titulo: 'Entregas', permiso: 'LeerEntregas', roles: ['ADMIN', 'AGENTE', 'BODEGA', 'REPARTIDOR'] },
  { ruta: 'tarifas', titulo: 'Tarifas', permiso: 'LeerTarifas', roles: ['ADMIN', 'AGENTE', 'BODEGA'] },
  { ruta: 'tipo-de-cambio', titulo: 'Tipo de cambio', permiso: 'Facturar', roles: ['ADMIN', 'AGENTE'] },
  { ruta: 'usuarios', titulo: 'Usuarios', permiso: 'AdministrarUsuarios', roles: ['ADMIN'] },
  { ruta: 'ubicaciones', titulo: 'Ubicaciones y rutas', permiso: 'AdministrarConfiguracion', roles: ['ADMIN'] },
  { ruta: 'auditoria', titulo: 'Auditoría', permiso: 'VerAuditoria', roles: ['ADMIN'] },
]

// Roles de las operaciones que se ofrecen u ocultan dentro de una sección (botones y formularios), por el nombre
// de su permiso en Permisos.cs. Como el menú, solo ocultan lo que el usuario no podría usar (lo prueba
// secciones.test.ts). Se usan con usePermiso (auth/identidad.ts).
export const permisos = {
  EscribirClientes: ['ADMIN', 'AGENTE'],
  GestionarPaquetes: ['ADMIN', 'AGENTE'],
  OperarBodega: ['ADMIN', 'BODEGA'],
  AdministrarFinanzas: ['ADMIN'],
  AdministrarConfiguracion: ['ADMIN'],
} as const satisfies Record<string, readonly RolAgencia[]>

export type Permiso = keyof typeof permisos

export function tieneAlgunRol(roles: readonly Rol[], permitidos: readonly Rol[]): boolean {
  return permitidos.some((rol) => roles.includes(rol))
}

export function seccionesVisibles(roles: readonly Rol[]): Seccion[] {
  return seccionesAgencia.filter((seccion) => tieneAlgunRol(roles, seccion.roles))
}

/** Adónde va cada quien al entrar; null si un empleado no tiene ningún rol activo. */
export function destinoInicial(identidad: Identidad): string | null {
  if (identidad.tipo === 'PLATAFORMA') return '/plataforma'
  const primera = seccionesVisibles(identidad.roles)[0]
  return primera ? `/${primera.ruta}` : null
}

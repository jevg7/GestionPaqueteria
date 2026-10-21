import { cerrarSesion } from '../lib/supabase.ts'

// Por qué se cerró la sesión sin que el usuario lo pidiera: la pantalla de inicio de sesión lo muestra.
let motivo: string | undefined

/** La API rechazó el token (401): la sesión ya no sirve y hay que volver a iniciarla. */
export function cerrarSesionRechazada(mensaje: string) {
  motivo = mensaje
  void cerrarSesion()
}

export function leerMotivoDeSalida(): string | undefined {
  return motivo
}

export function olvidarMotivoDeSalida() {
  motivo = undefined
}

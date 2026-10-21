import { useState } from 'react'
import { cerrarSesion } from '../lib/supabase.ts'
import { Boton } from './Boton.tsx'

export function BotonCerrarSesion() {
  const [cerrando, setCerrando] = useState(false)
  return (
    <Boton
      variante="secundario"
      cargando={cerrando}
      onClick={() => {
        setCerrando(true)
        // Al quedar sin sesión, <AccesoProtegido> lleva a la pantalla de inicio de sesión.
        void cerrarSesion()
      }}
    >
      Cerrar sesión
    </Boton>
  )
}

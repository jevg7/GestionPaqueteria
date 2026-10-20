import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { CargaDeRegistro } from '../components/CargaDeRegistro.tsx'
import { useIdDeLaRuta } from '../lib/useIdDeLaRuta.ts'
import { opcionesUsuario, type Usuario } from './usuarios.ts'

/** Carga el usuario de la ruta (:id); con el usuario, dibuja children. */
export function ConUsuario({ volver, children }: { volver: string; children: (usuario: Usuario) => ReactNode }) {
  const id = useIdDeLaRuta()
  const consulta = useQuery({ ...opcionesUsuario(id ?? 0), enabled: id !== null })
  return (
    <CargaDeRegistro
      consulta={consulta}
      idValido={id !== null}
      noExiste={{ titulo: 'El usuario no existe', volver, textoVolver: 'Volver a los usuarios' }}
    >
      {children}
    </CargaDeRegistro>
  )
}

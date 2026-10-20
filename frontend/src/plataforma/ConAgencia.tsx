import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { CargaDeRegistro } from '../components/CargaDeRegistro.tsx'
import { useIdDeLaRuta } from '../lib/useIdDeLaRuta.ts'
import { opcionesAgencia, type Agencia } from './agencias.ts'

/** Carga la agencia de la ruta (:id); con la agencia, dibuja children. */
export function ConAgencia({ volver, children }: { volver: string; children: (agencia: Agencia) => ReactNode }) {
  const id = useIdDeLaRuta()
  const consulta = useQuery({ ...opcionesAgencia(id ?? 0), enabled: id !== null })
  return (
    <CargaDeRegistro
      consulta={consulta}
      idValido={id !== null}
      noExiste={{ titulo: 'La agencia no existe', volver, textoVolver: 'Volver a las agencias' }}
    >
      {children}
    </CargaDeRegistro>
  )
}

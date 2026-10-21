import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { CargaDeRegistro } from '../components/CargaDeRegistro.tsx'
import { useIdDeLaRuta } from '../lib/useIdDeLaRuta.ts'
import { opcionesPaquete, type Paquete } from './paquetes.ts'

/** Carga el paquete de la ruta (:id); con el paquete, dibuja children. */
export function ConPaquete({ volver, children }: { volver: string; children: (paquete: Paquete) => ReactNode }) {
  const id = useIdDeLaRuta()
  const consulta = useQuery({ ...opcionesPaquete(id ?? 0), enabled: id !== null })
  return (
    <CargaDeRegistro
      consulta={consulta}
      idValido={id !== null}
      noExiste={{ titulo: 'El paquete no existe', volver, textoVolver: 'Volver a los paquetes' }}
    >
      {children}
    </CargaDeRegistro>
  )
}

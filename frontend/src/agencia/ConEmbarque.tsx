import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { CargaDeRegistro } from '../components/CargaDeRegistro.tsx'
import { useIdDeLaRuta } from '../lib/useIdDeLaRuta.ts'
import { opcionesEmbarque, type Embarque } from './embarques.ts'

/** Carga el embarque de la ruta (:id); con el embarque, dibuja children. */
export function ConEmbarque({ volver, children }: { volver: string; children: (embarque: Embarque) => ReactNode }) {
  const id = useIdDeLaRuta()
  const consulta = useQuery({ ...opcionesEmbarque(id ?? 0), enabled: id !== null })
  return (
    <CargaDeRegistro
      consulta={consulta}
      idValido={id !== null}
      noExiste={{ titulo: 'El embarque no existe', volver, textoVolver: 'Volver a los embarques' }}
    >
      {children}
    </CargaDeRegistro>
  )
}

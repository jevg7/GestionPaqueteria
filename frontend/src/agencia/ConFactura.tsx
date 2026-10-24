import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { CargaDeRegistro } from '../components/CargaDeRegistro.tsx'
import { useIdDeLaRuta } from '../lib/useIdDeLaRuta.ts'
import { opcionesFactura, type Factura } from './facturas.ts'

/** Carga la factura de la ruta (:id); con la factura, dibuja children. */
export function ConFactura({ volver, children }: { volver: string; children: (factura: Factura) => ReactNode }) {
  const id = useIdDeLaRuta()
  const consulta = useQuery({ ...opcionesFactura(id ?? 0), enabled: id !== null })
  return (
    <CargaDeRegistro
      consulta={consulta}
      idValido={id !== null}
      noExiste={{ titulo: 'La factura no existe', volver, textoVolver: 'Volver a las facturas' }}
    >
      {children}
    </CargaDeRegistro>
  )
}

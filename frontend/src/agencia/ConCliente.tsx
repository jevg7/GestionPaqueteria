import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { CargaDeRegistro } from '../components/CargaDeRegistro.tsx'
import { useIdDeLaRuta } from '../lib/useIdDeLaRuta.ts'
import { opcionesCliente, type Cliente } from './clientes.ts'

/** Carga el cliente de la ruta (:id); con el cliente, dibuja children. */
export function ConCliente({ volver, children }: { volver: string; children: (cliente: Cliente) => ReactNode }) {
  const id = useIdDeLaRuta()
  const consulta = useQuery({ ...opcionesCliente(id ?? 0), enabled: id !== null })
  return (
    <CargaDeRegistro
      consulta={consulta}
      idValido={id !== null}
      noExiste={{ titulo: 'El cliente no existe', volver, textoVolver: 'Volver a los clientes' }}
    >
      {children}
    </CargaDeRegistro>
  )
}

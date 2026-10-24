import { useQuery } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { mensajeDeError } from '../lib/errores.ts'
import { useDiferido } from '../lib/useDiferido.ts'
import {
  AVISO_DE_TILDES,
  nombreDelCliente,
  opcionesListaClientes,
  referenciaDe,
  tieneLetras,
  type ReferenciaCliente,
} from './clientes.ts'

const RESULTADOS_A_LA_VISTA = 8

type Props = {
  valor: ReferenciaCliente | null
  alCambiar: (cliente: ReferenciaCliente | null) => void
  error?: string
  /**
   * Solo clientes activos (por defecto): a uno desactivado no se le registran paquetes. Al facturar se ofrecen todos: un
   * cliente desactivado conserva sus paquetes en curso, y esos se cobran.
   */
  soloActivos?: boolean
}

/** Elige un cliente buscándolo por nombre, código, teléfono o correo. */
export function SelectorDeCliente({ valor, alCambiar, error, soloActivos = true }: Props) {
  const idCampo = useId()
  const [buscar, setBuscar] = useState('')
  const termino = useDiferido(buscar.trim())
  // Al pulsar "Cambiar cliente" el buscador vuelve a aparecer: el foco va a él.
  const enfocar = useRef(false)
  const resultados = useQuery({
    ...opcionesListaClientes({ buscar: termino, activo: soloActivos ? 'true' : '', pagina: 1 }),
    enabled: valor === null && termino.length >= 2,
  })

  if (valor) {
    return (
      <div>
        <p className="text-sm font-medium text-slate-700">Cliente</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{nombreDelCliente(valor)}</p>
            <p className="font-mono text-xs text-slate-600">{valor.codigoCliente}</p>
          </div>
          <Boton
            variante="secundario"
            onClick={() => {
              enfocar.current = true
              alCambiar(null)
            }}
          >
            Cambiar cliente
          </Boton>
        </div>
      </div>
    )
  }

  return (
    <div>
      <label htmlFor={idCampo} className="block text-sm font-medium text-slate-700">
        Cliente
      </label>
      <input
        ref={(campo) => {
          if (campo && enfocar.current) {
            enfocar.current = false
            campo.focus()
          }
        }}
        id={idCampo}
        type="search"
        value={buscar}
        onChange={(evento) => setBuscar(evento.target.value)}
        placeholder="Buscar por nombre, código, teléfono o correo"
        autoComplete="off"
        maxLength={100}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${idCampo}-nota`}
        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-xs focus:border-blue-700 focus:outline-2 focus:outline-blue-700/20 aria-invalid:border-red-600"
      />
      <p id={`${idCampo}-nota`} className={`mt-1 text-sm ${error ? 'text-red-700' : 'text-slate-500'}`}>
        {error ?? 'Escriba al menos 2 letras, o 4 dígitos del teléfono.'}
      </p>

      {termino.length >= 2 &&
        (resultados.isPending ? (
          <p className="mt-2 text-sm text-slate-500">Buscando…</p>
        ) : resultados.isError ? (
          <div className="mt-2">
            <Aviso tipo="error">{mensajeDeError(resultados.error)}</Aviso>
          </div>
        ) : resultados.data.items.length === 0 ? (
          <div className="mt-2 space-y-1 text-sm text-slate-600">
            {soloActivos ? (
              <p>
                Ningún cliente activo coincide. Si es nuevo, regístrelo en{' '}
                <Link to="/clientes/nuevo" className="font-medium text-blue-700 hover:underline">
                  Clientes
                </Link>
                : desde su ficha podrá registrar el paquete.
              </p>
            ) : (
              <p>Ningún cliente coincide.</p>
            )}
            {tieneLetras(termino) && <p className="text-slate-500">{AVISO_DE_TILDES}</p>}
          </div>
        ) : (
          <div className={`mt-2 ${resultados.isPlaceholderData ? 'opacity-60' : ''}`}>
            <ul aria-label="Clientes encontrados" className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {resultados.data.items.slice(0, RESULTADOS_A_LA_VISTA).map((cliente) => (
                <li key={cliente.id}>
                  <button
                    type="button"
                    onClick={() => alCambiar(referenciaDe(cliente))}
                    className="flex w-full flex-wrap items-center justify-between gap-x-3 px-3 py-2 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-700"
                  >
                    <span className="text-sm font-medium">
                      {nombreDelCliente(cliente)}
                      {!cliente.activo && <span className="font-normal text-slate-500"> (inactivo)</span>}
                    </span>
                    <span className="text-sm text-slate-500">
                      {cliente.codigoCliente} · {cliente.telefono}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {resultados.data.total > RESULTADOS_A_LA_VISTA && (
              <p className="mt-1 text-xs text-slate-500">
                Coinciden {resultados.data.total} clientes: escriba más para afinar la búsqueda.
              </p>
            )}
          </div>
        ))}
    </div>
  )
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useLocation } from 'react-router'
import { usePermiso } from '../auth/identidad.ts'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { Confirmacion } from '../components/Confirmacion.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { Etiqueta, type Tono } from '../components/Etiqueta.tsx'
import { campoDeFiltro } from '../components/estilos.ts'
import { mensajeDeError } from '../lib/errores.ts'
import { useFiltrosDeLista } from '../lib/useFiltrosDeLista.ts'
import { opcionesCatalogos } from './catalogos.ts'
import {
  anularTarifa,
  claveTarifas,
  opcionesHistorialTarifas,
  opcionesTarifasDeHoy,
  precioDeTarifa,
  sePuedeAnular,
  vigenciaDeTarifa,
  type EstadoTarifa,
  type Tarifa,
} from './tarifas.ts'

const estados: Record<EstadoTarifa, { texto: string; tono: Tono }> = {
  PROGRAMADA: { texto: 'Programada', tono: 'azul' },
  VIGENTE: { texto: 'Vigente', tono: 'verde' },
  VENCIDA: { texto: 'Vencida', tono: 'gris' },
  ANULADA: { texto: 'Anulada', tono: 'ambar' },
}

/** Tarifas de la agencia: las consultan ADMIN, AGENTE y BODEGA; registra y anula solo el ADMIN. */
export function Tarifas() {
  const puedeModificar = usePermiso('AdministrarConfiguracion')
  const queryClient = useQueryClient()
  const navegacion = useLocation().state as { aviso?: string } | null
  const [aviso, setAviso] = useState(navegacion?.aviso)
  const { leer, cambiar } = useFiltrosDeLista()
  const metodo = leer('metodo')
  const incluirAnuladas = leer('anuladas') === 'si'
  const catalogos = useQuery(opcionesCatalogos)
  const deHoy = useQuery(opcionesTarifasDeHoy)
  const historial = useQuery(opcionesHistorialTarifas({ metodo, incluirAnuladas }))
  const [anulando, setAnulando] = useState<number>()
  const anulacion = useMutation({
    mutationFn: (tarifa: Tarifa) => anularTarifa(tarifa.id),
    onSuccess: async (_, tarifa) => {
      await queryClient.invalidateQueries({ queryKey: claveTarifas })
      setAnulando(undefined)
      setAviso(
        `Tarifa ${tarifa.metodoEnvio.nombre} de ${precioDeTarifa(tarifa)} anulada.` +
          (tarifa.estado === 'VIGENTE' ? ' La tarifa anterior vuelve a regir.' : ''),
      )
    },
  })

  return (
    <section className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Tarifas</h1>
        {puedeModificar && <EnlaceBoton to="nueva">Registrar tarifa</EnlaceBoton>}
      </div>
      {aviso && (
        <div className="mt-4">
          <Aviso tipo="exito">{aviso}</Aviso>
        </div>
      )}

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Tarifas de hoy</h2>
      {deHoy.isPending ? (
        <p className="mt-2 text-sm text-slate-500">Cargando…</p>
      ) : deHoy.isError ? (
        <div className="mt-2">
          <Aviso tipo="error">{mensajeDeError(deHoy.error)}</Aviso>
        </div>
      ) : (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {deHoy.data.map(({ metodoEnvio, tarifa }) => (
            <div key={metodoEnvio.codigo} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-500">{metodoEnvio.nombre}</p>
              {tarifa ? (
                <>
                  <p className="mt-1 text-lg font-semibold">{precioDeTarifa(tarifa)}</p>
                  <p className="text-sm text-slate-500">Rige {vigenciaDeTarifa(tarifa)}</p>
                </>
              ) : (
                <div className="mt-2">
                  <Aviso tipo="advertencia">Sin tarifa vigente: no se pueden pesar paquetes de este método.</Aviso>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Historial</h2>
        <div className="flex flex-wrap items-center gap-3">
          <select value={metodo} onChange={(evento) => cambiar('metodo', evento.target.value)} aria-label="Método de envío" className={campoDeFiltro}>
            <option value="">Todos los métodos</option>
            {catalogos.data?.metodosEnvio.map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.nombre}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={incluirAnuladas}
              onChange={(evento) => cambiar('anuladas', evento.target.checked ? 'si' : '')}
              className="size-4 accent-blue-700"
            />
            Incluir anuladas
          </label>
        </div>
      </div>

      <div className="mt-2">
        {historial.isPending ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : historial.isError ? (
          <div className="space-y-3">
            <Aviso tipo="error">{mensajeDeError(historial.error)}</Aviso>
            <Boton variante="secundario" cargando={historial.isFetching} onClick={() => void historial.refetch()}>
              Reintentar
            </Boton>
          </div>
        ) : historial.data.length === 0 ? (
          <p className="text-sm text-slate-600">No hay tarifas registradas{metodo ? ' para este método' : ''}.</p>
        ) : (
          <ul
            className={`divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white ${historial.isPlaceholderData ? 'opacity-60' : ''}`}
          >
            {historial.data.map((tarifa) => (
              <li key={tarifa.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {tarifa.metodoEnvio.nombre}: {precioDeTarifa(tarifa)}
                    </p>
                    <p className="text-sm text-slate-500">Rige {vigenciaDeTarifa(tarifa)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Etiqueta tono={estados[tarifa.estado].tono}>{estados[tarifa.estado].texto}</Etiqueta>
                    {puedeModificar && sePuedeAnular(tarifa) && anulando !== tarifa.id && (
                      <Boton
                        variante="secundario"
                        onClick={() => {
                          anulacion.reset()
                          setAviso(undefined)
                          setAnulando(tarifa.id)
                        }}
                      >
                        Anular
                      </Boton>
                    )}
                  </div>
                </div>
                {anulando === tarifa.id && (
                  <div className="mt-3">
                    <Confirmacion
                      mensaje={
                        `¿Anular la tarifa ${tarifa.metodoEnvio.nombre} de ${precioDeTarifa(tarifa)}? ` +
                        (tarifa.estado === 'VIGENTE'
                          ? 'La tarifa anterior volverá a regir. Solo se puede si todavía no se aplicó a paquetes.'
                          : 'No llegará a regir.')
                      }
                      textoConfirmar="Sí, anular"
                      variante="peligro"
                      cargando={anulacion.isPending}
                      error={anulacion.isError ? mensajeDeError(anulacion.error) : undefined}
                      alConfirmar={() => anulacion.mutate(tarifa)}
                      alCancelar={() => setAnulando(undefined)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

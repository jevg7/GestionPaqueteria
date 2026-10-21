import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { AreaDeTexto } from '../components/AreaDeTexto.tsx'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { Campo } from '../components/Campo.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { Seleccion } from '../components/Seleccion.tsx'
import { mensajeDeError } from '../lib/errores.ts'
import { mensajeDelEnvio } from '../lib/formularios.ts'
import { opcionesCatalogos, type Catalogos } from './catalogos.ts'
import {
  camposDeNuevoEmbarque,
  claveEmbarques,
  crearEmbarque,
  esquemaNuevoEmbarque,
  opcionesEmbarque,
  type DatosNuevoEmbarque,
  type FormularioNuevoEmbarque,
} from './embarques.ts'

const LISTA = '/embarques'

/** Crea un embarque ABIERTO; el código (AIR-2026-0001) lo asigna la BD. Métodos y rutas salen de los catálogos. */
export function EmbarqueNuevo() {
  const catalogos = useQuery(opcionesCatalogos)
  if (catalogos.isPending) return <p className="text-sm text-slate-500">Cargando…</p>
  if (catalogos.isError) {
    return (
      <div className="max-w-xl space-y-3">
        <Aviso tipo="error">{mensajeDeError(catalogos.error)}</Aviso>
        <Boton variante="secundario" cargando={catalogos.isFetching} onClick={() => void catalogos.refetch()}>
          Reintentar
        </Boton>
      </div>
    )
  }
  return <Formulario catalogos={catalogos.data} />
}

function Formulario({ catalogos }: { catalogos: Catalogos }) {
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const { rutas, metodosEnvio } = catalogos
  const formulario = useForm<FormularioNuevoEmbarque, unknown, DatosNuevoEmbarque>({
    resolver: zodResolver(esquemaNuevoEmbarque),
    // Con una sola ruta activa (lo normal: Miami → Managua) ya viene elegida.
    defaultValues: { metodoEnvio: '', rutaId: rutas.length === 1 ? String(rutas[0].id) : '', fechaLlegadaEstimada: '', observaciones: '' },
  })
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = formulario
  const alta = useMutation({ mutationFn: crearEmbarque })

  const crear = async (datos: DatosNuevoEmbarque) => {
    setErrorGeneral(undefined)
    try {
      const embarque = await alta.mutateAsync(datos)
      queryClient.setQueryData(opcionesEmbarque(embarque.id).queryKey, embarque)
      void queryClient.invalidateQueries({ queryKey: [...claveEmbarques, 'lista'] })
      navegar(`${LISTA}/${embarque.id}`, {
        replace: true,
        state: { aviso: `Embarque ${embarque.codigoEmbarque} creado. Ahora asígnele los paquetes recibidos en Miami.` },
      })
    } catch (error) {
      // 409: el método o la ruta se desactivaron mientras tanto.
      setErrorGeneral(mensajeDelEnvio(error, setError, camposDeNuevoEmbarque))
    }
  }

  return (
    <section className="max-w-xl">
      <Link to={LISTA} className="text-sm font-medium text-blue-700 hover:underline">
        ← Embarques
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Nuevo embarque</h1>
      <p className="mt-1 text-sm text-slate-600">
        Nace abierto para recibir paquetes del mismo método. El código lo asigna el sistema.
      </p>

      <form onSubmit={handleSubmit(crear)} noValidate className="mt-6 space-y-6">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <Seleccion etiqueta="Método de envío" error={errors.metodoEnvio?.message} {...register('metodoEnvio')}>
            <option value="">Elija un método…</option>
            {metodosEnvio.map((metodo) => (
              <option key={metodo.codigo} value={metodo.codigo}>
                {metodo.nombre}
              </option>
            ))}
          </Seleccion>
          {rutas.length === 0 ? (
            <Aviso tipo="advertencia">No hay rutas activas: un administrador debe crearlas en Ubicaciones y rutas.</Aviso>
          ) : (
            <Seleccion etiqueta="Ruta" error={errors.rutaId?.message} {...register('rutaId')}>
              <option value="">Elija una ruta…</option>
              {rutas.map((ruta) => (
                <option key={ruta.id} value={ruta.id}>
                  {ruta.nombre} ({ruta.origen} → {ruta.destino})
                </option>
              ))}
            </Seleccion>
          )}
          <Campo
            etiqueta="Llegada estimada (opcional)"
            type="date"
            error={errors.fechaLlegadaEstimada?.message}
            {...register('fechaLlegadaEstimada')}
          />
          <AreaDeTexto etiqueta="Observaciones (opcional)" rows={2} error={errors.observaciones?.message} {...register('observaciones')} />
        </div>
        {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
        <div className="flex flex-wrap gap-3">
          <Boton type="submit" cargando={isSubmitting}>
            Crear embarque
          </Boton>
          <EnlaceBoton to={LISTA} variante="secundario">
            Cancelar
          </EnlaceBoton>
        </div>
      </form>
    </section>
  )
}

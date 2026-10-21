import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { Campo } from '../components/Campo.tsx'
import { Etiqueta } from '../components/Etiqueta.tsx'
import { Seleccion } from '../components/Seleccion.tsx'
import { mensajeDeError } from '../lib/errores.ts'
import { mensajeDelEnvio } from '../lib/formularios.ts'
import {
  cambiarActivoRuta,
  cambiarActivoUbicacion,
  camposDeNuevaRuta,
  camposDeNuevaUbicacion,
  crearRuta,
  crearUbicacion,
  esquemaNombre,
  esquemaNuevaRuta,
  esquemaNuevaUbicacion,
  nombresDePais,
  opcionesRutas,
  opcionesUbicaciones,
  refrescarConfiguracion,
  renombrarRuta,
  renombrarUbicacion,
  type DatosNuevaRuta,
  type DatosNuevaUbicacion,
  type FormularioNuevaRuta,
  type FormularioNuevaUbicacion,
  type Ruta,
  type Ubicacion,
} from './ubicaciones.ts'

/** Ubicaciones (bodegas en EE. UU. y agencias en Nicaragua) y rutas entre ellas. Solo ADMIN; nada se borra. */
export function UbicacionesYRutas() {
  return (
    <section className="max-w-4xl space-y-10">
      <div>
        <h1 className="text-xl font-semibold">Ubicaciones y rutas</h1>
        <p className="mt-1 text-sm text-slate-600">
          Las bodegas en EE. UU., las agencias en Nicaragua y las rutas entre ellas. Nada se borra: se desactiva. Una
          ruta desactivada no admite embarques nuevos.
        </p>
      </div>
      <SeccionUbicaciones />
      <SeccionRutas />
    </section>
  )
}

function EtiquetaActiva({ activa }: { activa: boolean }) {
  return activa ? <Etiqueta tono="verde">Activa</Etiqueta> : <Etiqueta tono="gris">Inactiva</Etiqueta>
}

function SeccionUbicaciones() {
  const ubicaciones = useQuery(opcionesUbicaciones)
  const [creando, setCreando] = useState(false)
  const [aviso, setAviso] = useState<string>()

  return (
    <section aria-labelledby="titulo-ubicaciones">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="titulo-ubicaciones" className="text-lg font-semibold">
          Ubicaciones
        </h2>
        {!creando && (
          <Boton
            variante="secundario"
            onClick={() => {
              setAviso(undefined)
              setCreando(true)
            }}
          >
            Nueva ubicación
          </Boton>
        )}
      </div>
      {aviso && (
        <div className="mt-3">
          <Aviso tipo="exito">{aviso}</Aviso>
        </div>
      )}
      {creando && (
        <NuevaUbicacion
          alTerminar={(texto) => {
            setCreando(false)
            setAviso(texto)
          }}
        />
      )}
      <div className="mt-3">
        {ubicaciones.isPending ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : ubicaciones.isError ? (
          <Aviso tipo="error">{mensajeDeError(ubicaciones.error)}</Aviso>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {ubicaciones.data.map((ubicacion) => (
              <FilaUbicacion key={ubicacion.id} ubicacion={ubicacion} alAvisar={setAviso} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function FilaUbicacion({ ubicacion, alAvisar }: { ubicacion: Ubicacion; alAvisar: (texto?: string) => void }) {
  const queryClient = useQueryClient()
  const [renombrando, setRenombrando] = useState(false)
  const cambio = useMutation({
    mutationFn: () => cambiarActivoUbicacion(ubicacion.id, !ubicacion.activo),
    onSuccess: async () => {
      await refrescarConfiguracion(queryClient)
      alAvisar(`Ubicación ${ubicacion.codigo} ${ubicacion.activo ? 'desactivada' : 'activada'}.`)
    },
  })

  return (
    <li className="px-4 py-3">
      {renombrando ? (
        <RenombrarEnLinea
          etiqueta={`Nombre de ${ubicacion.codigo}`}
          actual={ubicacion.nombre}
          alGuardar={(nombre) => renombrarUbicacion(ubicacion.id, nombre)}
          alTerminar={(guardado) => {
            setRenombrando(false)
            if (guardado) alAvisar(`Ubicación ${ubicacion.codigo} renombrada.`)
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">
              <span className="font-mono">{ubicacion.codigo}</span> · {ubicacion.nombre}
            </p>
            <p className="text-sm text-slate-500">{nombresDePais[ubicacion.pais]}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <EtiquetaActiva activa={ubicacion.activo} />
            <Boton variante="secundario" onClick={() => setRenombrando(true)}>
              Renombrar
            </Boton>
            <Boton
              variante="secundario"
              cargando={cambio.isPending}
              onClick={() => {
                alAvisar(undefined)
                cambio.mutate()
              }}
            >
              {ubicacion.activo ? 'Desactivar' : 'Activar'}
            </Boton>
          </div>
        </div>
      )}
      {cambio.isError && (
        <div className="mt-2">
          <Aviso tipo="error">{mensajeDeError(cambio.error)}</Aviso>
        </div>
      )}
    </li>
  )
}

function NuevaUbicacion({ alTerminar }: { alTerminar: (aviso?: string) => void }) {
  const queryClient = useQueryClient()
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const formulario = useForm<FormularioNuevaUbicacion, unknown, DatosNuevaUbicacion>({
    resolver: zodResolver(esquemaNuevaUbicacion),
    defaultValues: { codigo: '', nombre: '' },
  })
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = formulario
  const alta = useMutation({ mutationFn: crearUbicacion })

  const crear = async (datos: DatosNuevaUbicacion) => {
    setErrorGeneral(undefined)
    try {
      const ubicacion = await alta.mutateAsync(datos)
      await refrescarConfiguracion(queryClient)
      alTerminar(`Ubicación ${ubicacion.codigo} creada.`)
    } catch (error) {
      setErrorGeneral(mensajeDelEnvio(error, setError, camposDeNuevaUbicacion))
    }
  }

  return (
    <form onSubmit={handleSubmit(crear)} noValidate className="mt-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo
          etiqueta="Código"
          placeholder="MIA"
          maxLength={10}
          ayuda="De 2 a 10 letras o dígitos. No cambia después."
          error={errors.codigo?.message}
          {...register('codigo')}
        />
        <Campo etiqueta="Nombre" placeholder="Bodega Miami" error={errors.nombre?.message} {...register('nombre')} />
        <Seleccion etiqueta="País" error={errors.pais?.message} {...register('pais')}>
          <option value="">Elija…</option>
          <option value="US">Estados Unidos (bodega)</option>
          <option value="NI">Nicaragua (agencia)</option>
        </Seleccion>
      </div>
      {errorGeneral && (
        <div className="mt-4">
          <Aviso tipo="error">{errorGeneral}</Aviso>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <Boton type="submit" cargando={isSubmitting}>
          Crear ubicación
        </Boton>
        <Boton variante="secundario" onClick={() => alTerminar()}>
          Cancelar
        </Boton>
      </div>
    </form>
  )
}

function SeccionRutas() {
  const rutas = useQuery(opcionesRutas)
  const ubicaciones = useQuery(opcionesUbicaciones)
  const [creando, setCreando] = useState(false)
  const [aviso, setAviso] = useState<string>()

  return (
    <section aria-labelledby="titulo-rutas">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="titulo-rutas" className="text-lg font-semibold">
          Rutas
        </h2>
        {!creando && (
          <Boton
            variante="secundario"
            onClick={() => {
              setAviso(undefined)
              setCreando(true)
            }}
          >
            Nueva ruta
          </Boton>
        )}
      </div>
      {aviso && (
        <div className="mt-3">
          <Aviso tipo="exito">{aviso}</Aviso>
        </div>
      )}
      {creando && (
        <NuevaRuta
          ubicaciones={ubicaciones.data ?? []}
          alTerminar={(texto) => {
            setCreando(false)
            setAviso(texto)
          }}
        />
      )}
      <div className="mt-3">
        {rutas.isPending ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : rutas.isError ? (
          <Aviso tipo="error">{mensajeDeError(rutas.error)}</Aviso>
        ) : rutas.data.length === 0 ? (
          <p className="text-sm text-slate-600">Todavía no hay rutas.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {rutas.data.map((ruta) => (
              <FilaRuta key={ruta.id} ruta={ruta} alAvisar={setAviso} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function FilaRuta({ ruta, alAvisar }: { ruta: Ruta; alAvisar: (texto?: string) => void }) {
  const queryClient = useQueryClient()
  const [renombrando, setRenombrando] = useState(false)
  const cambio = useMutation({
    mutationFn: () => cambiarActivoRuta(ruta.id, !ruta.activo),
    onSuccess: async () => {
      await refrescarConfiguracion(queryClient)
      alAvisar(`Ruta ${ruta.nombre} ${ruta.activo ? 'desactivada: no admite embarques nuevos' : 'activada'}.`)
    },
  })

  return (
    <li className="px-4 py-3">
      {renombrando ? (
        <RenombrarEnLinea
          etiqueta="Nombre de la ruta"
          actual={ruta.nombre}
          alGuardar={(nombre) => renombrarRuta(ruta.id, nombre)}
          alTerminar={(guardado) => {
            setRenombrando(false)
            if (guardado) alAvisar('Ruta renombrada.')
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">{ruta.nombre}</p>
            <p className="font-mono text-sm text-slate-500">
              {ruta.origen.codigo} → {ruta.destino.codigo}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <EtiquetaActiva activa={ruta.activo} />
            <Boton variante="secundario" onClick={() => setRenombrando(true)}>
              Renombrar
            </Boton>
            <Boton
              variante="secundario"
              cargando={cambio.isPending}
              onClick={() => {
                alAvisar(undefined)
                cambio.mutate()
              }}
            >
              {ruta.activo ? 'Desactivar' : 'Activar'}
            </Boton>
          </div>
        </div>
      )}
      {cambio.isError && (
        <div className="mt-2">
          <Aviso tipo="error">{mensajeDeError(cambio.error)}</Aviso>
        </div>
      )}
    </li>
  )
}

function NuevaRuta({ ubicaciones, alTerminar }: { ubicaciones: Ubicacion[]; alTerminar: (aviso?: string) => void }) {
  const queryClient = useQueryClient()
  const [errorGeneral, setErrorGeneral] = useState<string>()
  // Una ruta va siempre de una ubicación activa en EE. UU. a una activa en Nicaragua.
  const origenes = ubicaciones.filter((u) => u.activo && u.pais === 'US')
  const destinos = ubicaciones.filter((u) => u.activo && u.pais === 'NI')
  const formulario = useForm<FormularioNuevaRuta, unknown, DatosNuevaRuta>({
    resolver: zodResolver(esquemaNuevaRuta),
    defaultValues: { origenId: '', destinoId: '', nombre: '' },
  })
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = formulario
  const alta = useMutation({ mutationFn: crearRuta })

  const crear = async (datos: DatosNuevaRuta) => {
    setErrorGeneral(undefined)
    try {
      const ruta = await alta.mutateAsync(datos)
      await refrescarConfiguracion(queryClient)
      alTerminar(`Ruta ${ruta.nombre} creada.`)
    } catch (error) {
      setErrorGeneral(mensajeDelEnvio(error, setError, camposDeNuevaRuta))
    }
  }

  return (
    <form onSubmit={handleSubmit(crear)} noValidate className="mt-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      {(origenes.length === 0 || destinos.length === 0) && (
        <div className="mb-4">
          <Aviso tipo="advertencia">Para crear una ruta hace falta una ubicación activa en EE. UU. y otra en Nicaragua.</Aviso>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Seleccion etiqueta="Origen (EE. UU.)" error={errors.origenId?.message} {...register('origenId')}>
          <option value="">Elija…</option>
          {origenes.map((u) => (
            <option key={u.id} value={u.id}>
              {u.codigo} · {u.nombre}
            </option>
          ))}
        </Seleccion>
        <Seleccion etiqueta="Destino (Nicaragua)" error={errors.destinoId?.message} {...register('destinoId')}>
          <option value="">Elija…</option>
          {destinos.map((u) => (
            <option key={u.id} value={u.id}>
              {u.codigo} · {u.nombre}
            </option>
          ))}
        </Seleccion>
        <Campo etiqueta="Nombre" placeholder="Miami → Managua" error={errors.nombre?.message} {...register('nombre')} />
      </div>
      {errorGeneral && (
        <div className="mt-4">
          <Aviso tipo="error">{errorGeneral}</Aviso>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <Boton type="submit" cargando={isSubmitting}>
          Crear ruta
        </Boton>
        <Boton variante="secundario" onClick={() => alTerminar()}>
          Cancelar
        </Boton>
      </div>
    </form>
  )
}

type PropsRenombrar = {
  etiqueta: string
  actual: string
  alGuardar: (nombre: string) => Promise<unknown>
  alTerminar: (guardado: boolean) => void
}

/** Cambia el nombre en la misma fila (el código y el país, o el origen y el destino, no cambian). */
function RenombrarEnLinea({ etiqueta, actual, alGuardar, alTerminar }: PropsRenombrar) {
  const queryClient = useQueryClient()
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const formulario = useForm<{ nombre: string }>({ resolver: zodResolver(esquemaNombre), defaultValues: { nombre: actual } })
  const renombre = useMutation({ mutationFn: alGuardar })

  const guardar = async ({ nombre }: { nombre: string }) => {
    setErrorGeneral(undefined)
    try {
      await renombre.mutateAsync(nombre)
      await refrescarConfiguracion(queryClient)
      alTerminar(true)
    } catch (error) {
      setErrorGeneral(mensajeDelEnvio(error, formulario.setError, ['nombre']))
    }
  }

  return (
    <form onSubmit={formulario.handleSubmit(guardar)} noValidate className="space-y-3">
      <Campo etiqueta={etiqueta} autoFocus error={formulario.formState.errors.nombre?.message} {...formulario.register('nombre')} />
      {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
      <div className="flex flex-wrap gap-3">
        <Boton type="submit" cargando={formulario.formState.isSubmitting}>
          Guardar
        </Boton>
        <Boton variante="secundario" onClick={() => alTerminar(false)}>
          Cancelar
        </Boton>
      </div>
    </form>
  )
}

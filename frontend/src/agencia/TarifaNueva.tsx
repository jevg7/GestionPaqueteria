import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { Campo } from '../components/Campo.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { Seleccion } from '../components/Seleccion.tsx'
import { mensajeDeError } from '../lib/errores.ts'
import { hoyEnManagua } from '../lib/formato.ts'
import { mensajeDelEnvio } from '../lib/formularios.ts'
import { opcionesCatalogos } from './catalogos.ts'
import {
  camposDeNuevaTarifa,
  claveTarifas,
  crearTarifa,
  esquemaNuevaTarifa,
  precioDeTarifa,
  vigenciaDeTarifa,
  type DatosNuevaTarifa,
  type FormularioNuevaTarifa,
} from './tarifas.ts'

const LISTA = '/tarifas'

export function TarifaNueva() {
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  // "Hoy" es el de Managua, como en el backend; se fija al abrir el formulario.
  const hoy = useMemo(() => hoyEnManagua(), [])
  const esquema = useMemo(() => esquemaNuevaTarifa(hoy), [hoy])
  const catalogos = useQuery(opcionesCatalogos)
  const [errorGeneral, setErrorGeneral] = useState<string>()
  const formulario = useForm<FormularioNuevaTarifa, unknown, DatosNuevaTarifa>({
    resolver: zodResolver(esquema),
    defaultValues: { metodoEnvio: '', precioPorUnidad: '', fechaInicio: hoy },
  })
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = formulario
  const alta = useMutation({ mutationFn: crearTarifa })

  const registrar = async (datos: DatosNuevaTarifa) => {
    setErrorGeneral(undefined)
    try {
      const tarifa = await alta.mutateAsync(datos)
      await queryClient.invalidateQueries({ queryKey: claveTarifas })
      navegar(LISTA, {
        replace: true,
        state: { aviso: `Tarifa ${tarifa.metodoEnvio.nombre} registrada: ${precioDeTarifa(tarifa)}, ${vigenciaDeTarifa(tarifa)}.` },
      })
    } catch (error) {
      setErrorGeneral(mensajeDelEnvio(error, setError, camposDeNuevaTarifa))
    }
  }

  return (
    <section className="max-w-xl">
      <Link to={LISTA} className="text-sm font-medium text-blue-700 hover:underline">
        ← Tarifas
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Registrar tarifa</h1>
      <p className="mt-1 text-sm text-slate-600">
        Rige desde el día de inicio. Si el método ya tiene una tarifa, esa termina el día anterior. Los paquetes ya
        pesados conservan su precio.
      </p>

      <form onSubmit={handleSubmit(registrar)} noValidate className="mt-6 space-y-6">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          {catalogos.isError && <Aviso tipo="error">{mensajeDeError(catalogos.error)}</Aviso>}
          <Seleccion etiqueta="Método de envío" error={errors.metodoEnvio?.message} {...register('metodoEnvio')}>
            <option value="">Elija un método…</option>
            {catalogos.data?.metodosEnvio.map((metodo) => (
              <option key={metodo.codigo} value={metodo.codigo}>
                {metodo.nombre}
              </option>
            ))}
          </Seleccion>
          <Campo
            etiqueta="Precio por libra (USD)"
            inputMode="decimal"
            placeholder="3.50"
            error={errors.precioPorUnidad?.message}
            {...register('precioPorUnidad')}
          />
          <Campo etiqueta="Rige desde" type="date" min={hoy} error={errors.fechaInicio?.message} {...register('fechaInicio')} />
        </div>
        {errorGeneral && <Aviso tipo="error">{errorGeneral}</Aviso>}
        <div className="flex flex-wrap gap-3">
          <Boton type="submit" cargando={isSubmitting}>
            Registrar tarifa
          </Boton>
          <EnlaceBoton to={LISTA} variante="secundario">
            Cancelar
          </EnlaceBoton>
        </div>
      </form>
    </section>
  )
}

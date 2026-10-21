import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation } from 'react-router'
import { z } from 'zod'
import { Boton } from '../components/Boton.tsx'
import { Campo } from '../components/Campo.tsx'
import { Cargando } from '../components/Cargando.tsx'
import { PantallaCentrada } from '../components/PantallaCentrada.tsx'
import { supabase } from '../lib/supabase.ts'
import { mensajeDeErrorDeAuth } from './mensajesAuth.ts'
import { leerMotivoDeSalida, olvidarMotivoDeSalida } from './salida.ts'
import { useSesion } from './sesion.ts'

const esquema = z.object({
  correo: z.email('Escriba un correo válido.'),
  contrasena: z.string().min(1, 'Escriba su contraseña.'),
})
type Datos = z.infer<typeof esquema>

export function IniciarSesion() {
  const sesion = useSesion()
  const ubicacion = useLocation()
  // Si la API cerró la sesión (401), se explica una sola vez.
  const [aviso] = useState(leerMotivoDeSalida)
  useEffect(olvidarMotivoDeSalida, [])
  const [errorDeAcceso, setErrorDeAcceso] = useState<string>()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Datos>({ resolver: zodResolver(esquema) })

  if (sesion === undefined) return <Cargando />
  if (sesion) {
    // Con sesión: a donde quería ir (lo guarda <AccesoProtegido>) o al inicio.
    const desde = (ubicacion.state as { desde?: string } | null)?.desde
    return <Navigate to={desde ?? '/'} replace />
  }

  const entrar = async ({ correo, contrasena }: Datos) => {
    setErrorDeAcceso(undefined)
    const { error } = await supabase.auth.signInWithPassword({ email: correo, password: contrasena })
    // Si entra, SesionProvider recibe la sesión y esta pantalla redirige sola.
    if (error) setErrorDeAcceso(mensajeDeErrorDeAuth(error))
  }

  return (
    <PantallaCentrada titulo="Iniciar sesión">
      {aviso && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{aviso}</p>}
      <form onSubmit={handleSubmit(entrar)} noValidate className="space-y-4">
        <Campo etiqueta="Correo" type="email" autoComplete="email" error={errors.correo?.message} {...register('correo')} />
        <Campo
          etiqueta="Contraseña"
          type="password"
          autoComplete="current-password"
          error={errors.contrasena?.message}
          {...register('contrasena')}
        />
        {errorDeAcceso && (
          <p role="alert" className="text-sm text-red-700">
            {errorDeAcceso}
          </p>
        )}
        <Boton type="submit" cargando={isSubmitting} className="w-full">
          Entrar
        </Boton>
      </form>
    </PantallaCentrada>
  )
}

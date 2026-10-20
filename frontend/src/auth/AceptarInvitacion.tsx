import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { z } from 'zod'
import { Boton } from '../components/Boton.tsx'
import { Campo } from '../components/Campo.tsx'
import { Cargando } from '../components/Cargando.tsx'
import { PantallaCentrada } from '../components/PantallaCentrada.tsx'
import { enlaceDeAuth, supabase } from '../lib/supabase.ts'
import { mensajeDeErrorDeAuth } from './mensajesAuth.ts'
import { useSesion } from './sesion.ts'

const esquema = z
  .object({
    contrasena: z.string().min(8, 'Use al menos 8 caracteres.'),
    confirmacion: z.string(),
  })
  .refine((datos) => datos.contrasena === datos.confirmacion, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmacion'],
  })
type Datos = z.infer<typeof esquema>

/**
 * Destino del enlace del correo de invitación: Supabase ya inició la sesión del invitado con el enlace;
 * aquí elige su contraseña y entra.
 */
export function AceptarInvitacion() {
  const sesion = useSesion()
  const navegar = useNavigate()
  const [errorDeAcceso, setErrorDeAcceso] = useState<string>()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Datos>({ resolver: zodResolver(esquema) })

  if (sesion === undefined) return <Cargando />

  if (!sesion) {
    return (
      <PantallaCentrada titulo={enlaceDeAuth.error ? 'El enlace no sirve' : 'Aceptar invitación'}>
        <p className="text-sm text-slate-600">
          {enlaceDeAuth.error === 'otp_expired'
            ? 'El enlace de invitación expiró o ya se usó. Pida al administrador de su agencia que le reenvíe la invitación.'
            : enlaceDeAuth.error
              ? 'El enlace de invitación no es válido. Pida al administrador de su agencia que le reenvíe la invitación.'
              : 'Para crear su contraseña, abra el enlace de invitación que recibió por correo.'}
        </p>
        <Link to="/iniciar-sesion" className="mt-6 inline-block text-sm font-medium text-blue-700 hover:underline">
          Ir a iniciar sesión
        </Link>
      </PantallaCentrada>
    )
  }

  const guardar = async ({ contrasena }: Datos) => {
    setErrorDeAcceso(undefined)
    const { error } = await supabase.auth.updateUser({ password: contrasena })
    if (error) {
      setErrorDeAcceso(mensajeDeErrorDeAuth(error))
      return
    }
    navegar('/', { replace: true })
  }

  return (
    <PantallaCentrada titulo="Cree su contraseña">
      <p className="text-sm text-slate-600">
        Con ella entrará al sistema como <strong className="break-all text-slate-900">{sesion.user.email}</strong>.
      </p>
      <form onSubmit={handleSubmit(guardar)} noValidate className="mt-4 space-y-4">
        <Campo
          etiqueta="Contraseña"
          type="password"
          autoComplete="new-password"
          error={errors.contrasena?.message}
          {...register('contrasena')}
        />
        <Campo
          etiqueta="Repita la contraseña"
          type="password"
          autoComplete="new-password"
          error={errors.confirmacion?.message}
          {...register('confirmacion')}
        />
        {errorDeAcceso && (
          <p role="alert" className="text-sm text-red-700">
            {errorDeAcceso}
          </p>
        )}
        <Boton type="submit" cargando={isSubmitting} className="w-full">
          Guardar y entrar
        </Boton>
      </form>
    </PantallaCentrada>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  Box,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  MapPin,
  Plane,
  ShieldCheck,
  Ship,
} from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { Logo, Aviso, Cargando } from '../components/ui'
import { useSesion } from '../auth/session'
import { supabase } from '../lib/supabase'
import { loginSchema, passwordSchema } from '../lib/schemas'
import { nombresRoles } from '../lib/format'
import type { Rol } from '../types'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <section className="auth-story">
        <Logo light />
        <div className="auth-story-content">
          <span className="auth-kicker">
            <span /> DE MIAMI A NICARAGUA
          </span>
          <h1>
            Cada envío,
            <br />
            <span className="accent-text">más cerca.</span>
          </h1>
          <p>
            Un espacio para conectar a tu equipo,
            <br />
            organizar tu agencia y seguir avanzando.
          </p>
          <div className="journey">
            <div className="journey-city">
              <span className="city-icon">
                <Box size={26} />
              </span>
              <span className="city-code">MIA</span>
              <small>Miami, EE. UU.</small>
            </div>
            <div className="journey-path">
              <span />
              <Plane size={23} />
              <span />
            </div>
            <div className="journey-city">
              <span className="city-icon">
                <MapPin size={26} />
              </span>
              <span className="city-code">NIC</span>
              <small>Nicaragua</small>
            </div>
            <div className="journey-label">
              <Plane size={13} /> Por aire <span>·</span>
              <Ship size={13} /> Por mar
            </div>
          </div>
          <div className="auth-features">
            <span>
              <Check size={15} />
              Tu equipo conectado
            </span>
            <span>
              <Check size={15} />
              Cada agencia, su espacio
            </span>
          </div>
        </div>
        <footer>
          <span>Logística que acerca personas.</span>
          <span>© {new Date().getFullYear()} Paqueteo</span>
        </footer>
      </section>
      <section className="auth-form-side">
        <div className="auth-mobile-logo">
          <Logo />
        </div>
        {children}
        <div className="auth-security">
          <ShieldCheck size={16} />
          <span>Un espacio seguro para tu agencia</span>
        </div>
      </section>
    </div>
  )
}
const descripciones: Record<Rol, string> = {
  ADMIN: 'Administra tu equipo y la configuración de la agencia.',
  AGENTE: 'Consulta tarifas de envío y tipos de cambio.',
  BODEGA: 'Consulta las tarifas disponibles para tu operación.',
  REPARTIDOR: 'Explora el acceso reservado para el equipo de reparto.',
  PLATAFORMA: 'Gestiona las agencias que forman parte de Paqueteo.',
}
export function Login({ cambiar = false }: { cambiar?: boolean }) {
  const { demo, entrarDemo, autenticado, cargando } = useSesion()
  const navigate = useNavigate()
  const [rol, setRol] = useState<Rol>('ADMIN')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  })
  if (cargando) return <Cargando label="Preparando tu espacio…" />
  if (autenticado && !cambiar) return <Navigate to="/inicio" replace />
  return (
    <AuthLayout>
      <div className="login-card">
        <span className="eyebrow">TU PRÓXIMO DESTINO</span>
        <h2>{cambiar ? 'Explora otro rol' : 'Bienvenido a tu espacio'}</h2>
        <p className="login-intro">
          {demo
            ? 'Conoce cómo se organiza tu agencia, desde adentro.'
            : 'Ingresa tus datos para continuar con tu operación.'}
        </p>
        {demo ? (
          <>
            <div className="demo-intro">
              <span className="demo-intro-icon">
                <Box size={20} />
              </span>
              <div>
                <strong>Todo listo para explorar</strong>
                <p>Usa datos de ejemplo. Sin conexiones ni correos reales.</p>
              </div>
            </div>
            <label className="field demo-role-label" htmlFor="demo-rol">
              <span>¿Desde qué rol quieres entrar?</span>
              <select
                id="demo-rol"
                value={rol}
                onChange={(e) => setRol(e.target.value as Rol)}
              >
                {(
                  [
                    'ADMIN',
                    'AGENTE',
                    'BODEGA',
                    'REPARTIDOR',
                    'PLATAFORMA',
                  ] as Rol[]
                ).map((r) => (
                  <option key={r} value={r}>
                    {nombresRoles[r]}
                  </option>
                ))}
              </select>
            </label>
            <p className="role-description">{descripciones[rol]}</p>
            <button
              className="button primary login-submit"
              onClick={() => {
                entrarDemo(rol)
                navigate('/inicio', { replace: true })
              }}
            >
              Abrir demostración
              <ArrowRight size={18} />
            </button>
            <div className="login-footnote">
              Los cambios son temporales y se reinician al recargar.
            </div>
          </>
        ) : (
          <form
            noValidate
            onSubmit={handleSubmit(async (values) => {
              setError('')
              if (!supabase) {
                setError(
                  'El acceso todavía no está configurado. Contacta al administrador de la plataforma.',
                )
                return
              }
              try {
                const { error } = await supabase.auth.signInWithPassword({
                  email: values.correo,
                  password: values.password,
                })
                if (error) {
                  setError(
                    error.code === 'invalid_credentials'
                      ? 'El correo o la contraseña no son correctos.'
                      : error.code === 'email_not_confirmed'
                        ? 'Confirma tu correo antes de ingresar.'
                        : 'No se pudo iniciar sesión. Revisa tus datos e inténtalo de nuevo.',
                  )
                  return
                }
                navigate('/inicio', { replace: true })
              } catch {
                setError(
                  'No se pudo conectar con el servicio de acceso. Inténtalo de nuevo.',
                )
              }
            })}
          >
            <div className="field">
              <label htmlFor="correo">Correo electrónico</label>
              <div className="input-icon">
                <Mail size={18} />
                <input
                  id="correo"
                  type="email"
                  autoComplete="username"
                  placeholder="tu@agencia.com"
                  aria-invalid={!!errors.correo}
                  aria-describedby="correo-error"
                  {...register('correo')}
                />
              </div>
              <span className="field-error" id="correo-error">
                {errors.correo?.message}
              </span>
            </div>
            <div className="field">
              <label htmlFor="password">Contraseña</label>
              <div className="input-icon">
                <LockKeyhole size={18} />
                <input
                  id="password"
                  type={visible ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Tu contraseña"
                  aria-invalid={!!errors.password}
                  aria-describedby="password-error"
                  {...register('password')}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={
                    visible ? 'Ocultar contraseña' : 'Mostrar contraseña'
                  }
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <span className="field-error" id="password-error">
                {errors.password?.message}
              </span>
            </div>
            {!supabase && (
              <Aviso>
                El acceso se habilitará cuando se configure la conexión de la
                aplicación.
              </Aviso>
            )}
            {error && <Aviso tipo="error">{error}</Aviso>}
            <button
              className="button primary login-submit"
              disabled={isSubmitting || !supabase}
            >
              {isSubmitting ? 'Ingresando…' : 'Iniciar sesión'}
              <ArrowRight size={18} />
            </button>
            <div className="login-footnote">
              ¿Es tu primer ingreso? Usa la invitación que recibiste por correo.
            </div>
          </form>
        )}
      </div>
    </AuthLayout>
  )
}
export function AceptarInvitacion() {
  const { autenticado, cargando, demo } = useSesion()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState('')
  const [retornoValido, setRetornoValido] = useState<boolean | null>(null)
  const enlaceConError = [location.search, location.hash].some((parte) => {
    const parametros = new URLSearchParams(parte.slice(1))
    return ['error', 'error_code', 'error_description'].some((clave) =>
      parametros.has(clave),
    )
  })
  useEffect(() => {
    let vigente = true
    if (demo || !supabase || enlaceConError) {
      return
    }
    // Un enlace fallido conserva la sesión anterior en Supabase. No permitir
    // que esa sesión reciba la contraseña destinada al usuario de la invitación.
    void supabase.auth.initialize().then(
      ({ error }) => {
        if (vigente) setRetornoValido(!error)
      },
      () => {
        if (vigente) setRetornoValido(false)
      },
    )
    return () => {
      vigente = false
    }
  }, [demo, enlaceConError])
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
  })
  return (
    <AuthLayout>
      <div className="login-card">
        <span className="eyebrow">UN NUEVO COMIENZO</span>
        <h2>Prepara tu acceso</h2>
        <p className="login-intro">
          Crea tu contraseña para unirte al equipo de tu agencia.
        </p>
        {cargando ||
        (autenticado &&
          !demo &&
          !enlaceConError &&
          supabase &&
          retornoValido === null) ? (
          <Cargando />
        ) : demo || !autenticado || !retornoValido || enlaceConError ? (
          <>
            <Aviso>
              {demo
                ? 'Las invitaciones están simuladas en esta demostración.'
                : 'Abre el enlace de tu invitación para continuar. Si venció o ya se utilizó, pide a tu administrador una nueva invitación.'}
            </Aviso>
            <Link className="button primary login-submit" to="/login">
              Volver al inicio
            </Link>
          </>
        ) : (
          <form
            noValidate
            onSubmit={handleSubmit(async (values) => {
              if (!retornoValido || enlaceConError) return
              setError('')
              try {
                const result = await supabase!.auth.updateUser({
                  password: values.password,
                })
                if (result.error) {
                  setError(
                    'No se pudo guardar la contraseña. Comprueba los requisitos e inténtalo de nuevo.',
                  )
                  return
                }
                navigate('/inicio', { replace: true })
              } catch {
                setError('El servicio no está disponible. Inténtalo de nuevo.')
              }
            })}
          >
            <div className="field">
              <label htmlFor="nueva-password">Nueva contraseña</label>
              <input
                id="nueva-password"
                type="password"
                autoComplete="new-password"
                aria-describedby="nueva-error"
                {...register('password')}
              />
              <span
                id="nueva-error"
                className={errors.password ? 'field-error' : 'field-help'}
              >
                {errors.password?.message ?? 'Usa al menos 8 caracteres.'}
              </span>
            </div>
            <div className="field">
              <label htmlFor="confirmar">Confirmar contraseña</label>
              <input
                id="confirmar"
                type="password"
                autoComplete="new-password"
                aria-describedby="confirmar-error"
                {...register('confirmar')}
              />
              <span id="confirmar-error" className="field-error">
                {errors.confirmar?.message}
              </span>
            </div>
            {error && <Aviso tipo="error">{error}</Aviso>}
            <button
              className="button primary login-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Guardando…' : 'Crear contraseña y continuar'}
              <ArrowRight size={17} />
            </button>
          </form>
        )}
      </div>
    </AuthLayout>
  )
}

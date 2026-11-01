import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  CircleDollarSign,
  MapPin,
  Plane,
  Plus,
  Route,
  Settings2,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react'
import { useSesion } from '../auth/session'
import { api } from '../lib/api'
import { decimal, fecha } from '../lib/format'
import { ErrorApi } from '../lib/api-error'
import { puede, permisos } from '../lib/permisos'
import { Consulta, Estado, Titulo } from '../components/ui'
import { TarjetaTarifa } from './Tarifas'
import type {
  Agencia,
  Catalogos,
  Paginado,
  TarifaActual,
  TipoCambio,
  Usuario,
} from '../types'

export function Inicio() {
  const { usuario } = useSesion()
  const plataforma = usuario?.tipo === 'PLATAFORMA'
  const admin = usuario?.roles.includes('ADMIN')
  const catalogos = useQuery({
    queryKey: ['catalogos'],
    queryFn: ({ signal }) => api<Catalogos>('/api/catalogs', { signal }),
    enabled: !plataforma,
  })
  const usuarios = useQuery({
    queryKey: ['usuarios', 'resumen'],
    queryFn: ({ signal }) =>
      api<Paginado<Usuario>>('/api/users?activo=true&pageSize=1', { signal }),
    enabled: !!admin,
  })
  const agencias = useQuery({
    queryKey: ['agencias', 'resumen'],
    queryFn: ({ signal }) =>
      api<Paginado<Agencia>>('/api/platform/agencies?pageSize=5', { signal }),
    enabled: plataforma,
  })
  const tarifas = useQuery({
    queryKey: ['tarifas-actuales'],
    queryFn: ({ signal }) =>
      api<TarifaActual[]>('/api/rates/current', { signal }),
    enabled: puede(usuario, permisos.tarifas),
  })
  const cambio = useQuery({
    queryKey: ['cambio-actual'],
    queryFn: async ({ signal }) => {
      try {
        return await api<TipoCambio>('/api/exchange-rates/current', { signal })
      } catch (error) {
        if (error instanceof ErrorApi && error.status === 404) return null
        throw error
      }
    },
    enabled: puede(usuario, permisos.cambio),
  })
  const opciones = [
    {
      title: 'Invitar a tu equipo',
      description: 'Las personas indicadas, con el acceso que necesitan.',
      to: '/usuarios',
      icon: Users,
      roles: permisos.usuarios,
    },
    {
      title: 'Configurar tus tarifas',
      description: 'Precios claros para cada método de envío.',
      to: '/tarifas',
      icon: Wallet,
      roles: permisos.tarifas,
    },
    {
      title: 'Conectar tus ubicaciones',
      description: 'Bodegas y destinos, en una misma ruta.',
      to: '/rutas',
      icon: Route,
      roles: permisos.configuracion,
    },
    {
      title: 'Consultar el tipo de cambio',
      description: 'Una referencia para tus pagos en córdobas.',
      to: '/tipo-cambio',
      icon: CircleDollarSign,
      roles: permisos.cambio,
    },
  ].filter((o) => puede(usuario, o.roles))
  return (
    <>
      <Titulo
        eyebrow="ASÍ COMIENZA UN BUEN DÍA"
        title={`Hola, ${usuario?.nombres.split(' ')[0]}.`}
        description={
          plataforma
            ? 'Tu red de agencias, en un solo lugar.'
            : 'Todo lo que necesitas para poner tu agencia en marcha.'
        }
        action={
          <span className="workspace-badge">
            <ShieldCheck size={16} />
            {plataforma ? 'Panel de plataforma' : 'Espacio de tu agencia'}
          </span>
        }
      />
      <section className="welcome-banner">
        <div>
          <span className="welcome-tag">
            <span />{' '}
            {plataforma ? 'CONECTANDO NUEVAS AGENCIAS' : 'DE MIAMI A NICARAGUA'}
          </span>
          <h2>
            {plataforma ? (
              <>
                Más agencias.
                <br />
                <span className="accent-text">Más conexiones.</span>
              </>
            ) : (
              <>
                Tu agencia,
                <br />
                <span className="accent-text">en buena ruta.</span>
              </>
            )}
          </h2>
          <p>
            {plataforma
              ? 'Dale la bienvenida a una nueva agencia y acompaña el crecimiento de tu red.'
              : 'Un equipo conectado y cada detalle en su lugar. Aquí empieza el próximo envío.'}
          </p>
          <Link
            className="welcome-link"
            to={
              plataforma
                ? '/plataforma/agencias'
                : admin
                  ? '/usuarios'
                  : puede(usuario, permisos.tarifas)
                    ? '/tarifas'
                    : '/inicio'
            }
          >
            {plataforma
              ? 'Administrar agencias'
              : admin
                ? 'Conocer a tu equipo'
                : puede(usuario, permisos.tarifas)
                  ? 'Ver tarifas de envío'
                  : 'Tu espacio de trabajo'}
            <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="banner-route" aria-hidden="true">
          <div className="banner-orbit orbit-one" />
          <div className="banner-orbit orbit-two" />
          <div className="banner-city banner-origin">
            <span>
              <Building2 size={23} />
            </span>
            <strong>MIA</strong>
            <small>Miami</small>
          </div>
          <div className="banner-flight">
            <Plane size={25} />
          </div>
          <div className="banner-city banner-destination">
            <span>
              <MapPin size={23} />
            </span>
            <strong>NIC</strong>
            <small>Nicaragua</small>
          </div>
          <div className="banner-route-caption">
            <span /> Cada vez más cerca
          </div>
        </div>
      </section>
      {plataforma ? (
        <Consulta query={agencias}>
          <div className="overview-section-title">
            <h2>Tus agencias</h2>
            <Link to="/plataforma/agencias">
              Ver todas <ArrowRight size={16} />
            </Link>
          </div>
          <section className="panel agency-overview">
            {agencias.data?.items.map((a) => (
              <Link to="/plataforma/agencias" key={a.id}>
                <span className="location-icon">
                  <Building2 size={19} />
                </span>
                <div>
                  <strong>{a.nombre}</strong>
                  <small>{a.correoContacto ?? 'Sin correo de contacto'}</small>
                </div>
                <Estado valor={a.estado} />
                <ArrowUpRight size={17} />
              </Link>
            ))}
            {!agencias.data?.total && (
              <div className="empty">
                <h3>Tu red comienza con la primera agencia</h3>
                <Link to="/plataforma/agencias" className="button primary">
                  <Plus size={16} />
                  Crear una agencia
                </Link>
              </div>
            )}
          </section>
        </Consulta>
      ) : (
        <>
          <div className="stats-grid">
            {admin && (
              <Link to="/usuarios" className="stat-card">
                <span className="stat-icon">
                  <Users size={19} />
                </span>
                <div>
                  <small>PERSONAS EN TU EQUIPO</small>
                  <strong>
                    {usuarios.isError ? '—' : (usuarios.data?.total ?? '…')}{' '}
                    <span>activas</span>
                  </strong>
                </div>
                <ArrowUpRight size={16} />
              </Link>
            )}
            <Link to={admin ? '/rutas' : '/inicio'} className="stat-card">
              <span className="stat-icon blue">
                <Route size={19} />
              </span>
              <div>
                <small>RUTAS DISPONIBLES</small>
                <strong>
                  {catalogos.isError
                    ? '—'
                    : (catalogos.data?.rutas.length ?? '…')}{' '}
                  <span>conexiones</span>
                </strong>
              </div>
              {admin && <ArrowUpRight size={16} />}
            </Link>
            {puede(usuario, permisos.cambio) && (
              <Link to="/tipo-cambio" className="stat-card">
                <span className="stat-icon ochre">
                  <CircleDollarSign size={19} />
                </span>
                <div>
                  <small>TIPO DE CAMBIO VIGENTE</small>
                  <strong>
                    {cambio.data
                      ? decimal(cambio.data.nioPorUsd)
                      : cambio.isPending
                        ? '…'
                        : '—'}{' '}
                    <span>NIO / USD</span>
                  </strong>
                </div>
                <ArrowUpRight size={16} />
              </Link>
            )}
          </div>
          {puede(usuario, permisos.tarifas) && (
            <>
              <div className="overview-section-title">
                <div>
                  <h2>Un precio para cada camino</h2>
                  <p>Tarifas vigentes de tu agencia, en USD por libra.</p>
                </div>
                <Link to="/tarifas">
                  Ver tarifas <ArrowRight size={16} />
                </Link>
              </div>
              <Consulta query={tarifas}>
                <div className="rates-grid">
                  {tarifas.data?.map((t) => (
                    <TarjetaTarifa actual={t} key={t.metodoEnvio.codigo} />
                  ))}
                </div>
              </Consulta>
            </>
          )}
          {opciones.length ? (
            <>
              <div className="overview-section-title">
                <div>
                  <h2>Tu espacio, a tu manera</h2>
                  <p>Los detalles que hacen que todo funcione.</p>
                </div>
                <Settings2 size={20} />
              </div>
              <div className="quick-grid">
                {opciones.map((o) => (
                  <Link className="quick-card" key={o.to} to={o.to}>
                    <span>
                      <o.icon size={21} />
                    </span>
                    <h3>{o.title}</h3>
                    <p>{o.description}</p>
                    <ArrowUpRight size={18} />
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <section className="panel role-welcome">
              <span className="empty-icon">
                <ShieldCheck size={26} />
              </span>
              <h2>Tu acceso de reparto está preparado</h2>
              <p>
                En esta primera fase puedes conocer tu espacio de trabajo. La
                consulta y operación de entregas se incorporará en la fase de
                reparto.
              </p>
            </section>
          )}
          <div className="overview-bottom-note">
            <Check size={17} />
            <span>
              Tu agencia tiene su propio espacio. Los datos y el acceso de cada
              equipo se administran por separado.
            </span>
            {cambio.data && (
              <span className="note-date">
                Referencia: {fecha(cambio.data.fecha)}
              </span>
            )}
          </div>
        </>
      )}
    </>
  )
}

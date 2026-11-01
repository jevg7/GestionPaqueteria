import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Route,
  ShieldCheck,
  Users,
  Wallet,
  X,
  CircleDollarSign,
  BookOpen,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useSesion } from '../auth/session'
import { Logo, Aviso } from './ui'
import { fechaManagua, fecha, iniciales, nombresRoles } from '../lib/format'
import { api } from '../lib/api'
import { puede, permisos } from '../lib/permisos'
import type { Catalogos } from '../types'

const items = [
  { to: '/inicio', label: 'Vista general', icon: LayoutDashboard },
  {
    to: '/usuarios',
    label: 'Usuarios y roles',
    icon: Users,
    roles: permisos.usuarios,
  },
  {
    to: '/tarifas',
    label: 'Tarifas de envío',
    icon: Wallet,
    roles: permisos.tarifas,
  },
  {
    to: '/tipo-cambio',
    label: 'Tipo de cambio',
    icon: CircleDollarSign,
    roles: permisos.cambio,
  },
  {
    to: '/ubicaciones',
    label: 'Ubicaciones',
    icon: MapPin,
    roles: permisos.configuracion,
  },
  { to: '/rutas', label: 'Rutas', icon: Route, roles: permisos.configuracion },
  {
    to: '/contabilidad',
    label: 'Contabilidad',
    icon: BookOpen,
    roles: permisos.contabilidad,
  },
  {
    to: '/plataforma/agencias',
    label: 'Agencias',
    icon: Building2,
    roles: permisos.plataforma,
  },
]
export function Layout() {
  const { usuario, demo, salir, error } = useSesion()
  const [open, setOpen] = useState(false)
  const [help, setHelp] = useState(false)
  const location = useLocation()
  const catalogos = useQuery({
    queryKey: ['catalogos'],
    queryFn: ({ signal }) => api<Catalogos>('/api/catalogs', { signal }),
    enabled: usuario?.tipo === 'AGENCIA',
  })
  const active = items.find((i) => i.to === location.pathname)
  useEffect(() => {
    document.title = `${active?.label ?? 'Página'} · Paqueteo`
  }, [active?.label])
  useEffect(() => {
    const cerrarEnEscritorio = () => {
      if (window.innerWidth > 760) setOpen(false)
    }
    window.addEventListener('resize', cerrarEnEscritorio)
    return () => window.removeEventListener('resize', cerrarEnEscritorio)
  }, [])
  return (
    <div className="app-shell">
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>
      {open && (
        <button
          className="sidebar-backdrop"
          aria-label="Cerrar navegación"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`sidebar ${open ? 'is-open' : ''}`}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
      >
        <div className="sidebar-top">
          <Link to="/inicio" aria-label="Paqueteo, inicio">
            <Logo light />
          </Link>
          <button
            className="icon-button sidebar-close"
            aria-label="Cerrar navegación"
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace">
          <span className="workspace-icon">
            <Building2 size={20} />
          </span>
          <div>
            <small>
              {usuario?.tipo === 'PLATAFORMA' ? 'TU ESPACIO' : 'TU AGENCIA'}
            </small>
            <strong>{usuario?.agencia?.nombre ?? 'Plataforma Paqueteo'}</strong>
          </div>
          <ShieldCheck size={15} />
        </div>
        <div className="nav-label">ESPACIO DE TRABAJO</div>
        <nav aria-label="Navegación principal">
          {items
            .filter((i) => !i.roles || puede(usuario, i.roles))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `nav-item ${isActive ? 'active' : ''}`
                }
              >
                <item.icon size={19} />
                <span>{item.label}</span>
                <ChevronRight size={14} />
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="route-note">
            <span className="route-note-line">
              MIA{' '}
              <span>
                ······ <ArrowUpRight size={16} /> ······
              </span>{' '}
              NIC
            </span>
            <p>
              Conectamos destinos.
              <br />
              Acercamos personas.
            </p>
          </div>
          <button
            className="sidebar-help"
            onClick={() => setHelp(!help)}
            aria-expanded={help}
          >
            <CircleHelp size={17} />
            Guía del espacio
          </button>
          <div className="profile">
            <span className="avatar">
              {iniciales(usuario?.nombres ?? '', usuario?.apellidos)}
            </span>
            <div>
              <strong>
                {usuario?.nombres} {usuario?.apellidos}
              </strong>
              <small>
                {usuario?.roles.map((r) => nombresRoles[r]).join(' · ')}
              </small>
            </div>
            <button
              className="icon-button"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              onClick={() => void salir()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-main" inert={open || undefined}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir navegación"
              onClick={() => setOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>
              {usuario?.tipo === 'PLATAFORMA' ? 'Plataforma' : 'Administración'}
            </span>
            <ChevronRight size={14} />
            <strong>{active?.label ?? 'Página'}</strong>
          </div>
          <div className="topbar-right">
            <span className="today">
              <CalendarDays size={15} />
              {fecha(fechaManagua())}
            </span>
            <span className="topbar-divider" />
            <span className={`connection ${demo ? 'demo' : ''}`}>
              <span />
              {demo ? 'Demostración' : 'Sesión activa'}
            </span>
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <FlaskConical size={15} />
            <span>
              <strong>Espacio de demostración.</strong> Datos de ejemplo,
              cambios temporales y correos simulados.
            </span>
            <Link to="/demo">
              Cambiar rol <ArrowUpRight size={14} />
            </Link>
          </div>
        )}
        <main id="contenido" tabIndex={-1} key={location.pathname}>
          {help && (
            <Aviso onClose={() => setHelp(false)}>
              Esta primera fase permite administrar agencias, equipo, tarifas,
              tipo de cambio, ubicaciones y rutas. Las operaciones de paquetes,
              facturación y reparto se incorporarán en las siguientes fases.
            </Aviso>
          )}
          {!!error && (
            <Aviso tipo="error">
              No se pudo completar la acción de sesión. Inténtalo de nuevo.
            </Aviso>
          )}
          {catalogos.isError && (
            <Aviso tipo="error">
              No se pudieron cargar los catálogos.{' '}
              <button
                className="text-button"
                onClick={() => void catalogos.refetch()}
              >
                Reintentar
              </button>
            </Aviso>
          )}
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>
            Paqueteo <span>© {new Date().getFullYear()}</span>
          </span>
          <span>
            Hecho para llegar más lejos <span className="footer-dot" />
          </span>
        </footer>
      </div>
    </div>
  )
}

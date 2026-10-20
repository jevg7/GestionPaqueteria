import { createBrowserRouter, Navigate, Outlet, type RouteObject } from 'react-router'
import { PanelAgencia } from './agencia/PanelAgencia.tsx'
import { TarifaNueva } from './agencia/TarifaNueva.tsx'
import { Tarifas } from './agencia/Tarifas.tsx'
import { TipoDeCambio } from './agencia/TipoDeCambio.tsx'
import { UsuarioDetalle } from './agencia/UsuarioDetalle.tsx'
import { UsuarioEditar } from './agencia/UsuarioEditar.tsx'
import { UsuarioNuevo } from './agencia/UsuarioNuevo.tsx'
import { UsuariosLista } from './agencia/UsuariosLista.tsx'
import { AccesoProtegido } from './auth/AccesoProtegido.tsx'
import { AceptarInvitacion } from './auth/AceptarInvitacion.tsx'
import { IniciarSesion } from './auth/IniciarSesion.tsx'
import { Inicio } from './auth/Inicio.tsx'
import { RequiereRoles } from './auth/RequiereRoles.tsx'
import { seccionesAgencia } from './auth/secciones.ts'
import { llevaALaContrasena } from './lib/enlaceDeAuth.ts'
import { enlaceDeAuth } from './lib/supabase.ts'
import { EnConstruccion } from './pages/EnConstruccion.tsx'
import { NoEncontrada } from './pages/NoEncontrada.tsx'
import { AgenciaDetalle } from './plataforma/AgenciaDetalle.tsx'
import { AgenciaEditar } from './plataforma/AgenciaEditar.tsx'
import { AgenciaNueva } from './plataforma/AgenciaNueva.tsx'
import { AgenciasLista } from './plataforma/AgenciasLista.tsx'
import { PanelPlataforma } from './plataforma/PanelPlataforma.tsx'

const PAGINA_DE_CONTRASENA = '/aceptar-invitacion'

/** Páginas de cada sección de la agencia (por su ruta en auth/secciones.ts). */
const paginasDeSeccion: Partial<Record<string, RouteObject[]>> = {
  usuarios: [
    { index: true, Component: UsuariosLista },
    { path: 'nuevo', Component: UsuarioNuevo },
    { path: ':id', Component: UsuarioDetalle },
    { path: ':id/editar', Component: UsuarioEditar },
  ],
  // Consultan ADMIN y AGENTE; el formulario para registrar solo lo ve el ADMIN.
  'tipo-de-cambio': [{ index: true, Component: TipoDeCambio }],
  // Consultan ADMIN, AGENTE y BODEGA; registrar es solo del ADMIN.
  tarifas: [
    { index: true, Component: Tarifas },
    {
      path: 'nueva',
      element: (
        <RequiereRoles roles={['ADMIN']}>
          <TarifaNueva />
        </RequiereRoles>
      ),
    },
  ],
}

// Un enlace de invitación o de recuperación puede llegar a otra ruta: los correos que envía el panel de
// Supabase (o uno cuya redirect_to no está permitida) llevan a la Site URL. Si se quedara ahí, el usuario
// entraría con la sesión del enlace sin elegir contraseña. El router arranca en la página de la contraseña;
// el fragmento (#…) se conserva para que Supabase tome la sesión.
if (llevaALaContrasena(enlaceDeAuth) && window.location.pathname !== PAGINA_DE_CONTRASENA) {
  window.history.replaceState(window.history.state, '', PAGINA_DE_CONTRASENA + window.location.search + window.location.hash)
}

export const router = createBrowserRouter([
  { path: '/iniciar-sesion', Component: IniciarSesion },
  // Destino del enlace del correo de invitación (Supabase:InviteRedirectUrl en el backend) y de recuperación.
  { path: PAGINA_DE_CONTRASENA, Component: AceptarInvitacion },
  {
    path: '/',
    Component: AccesoProtegido,
    children: [
      { index: true, Component: Inicio },
      {
        path: 'plataforma',
        Component: PanelPlataforma,
        children: [
          { index: true, element: <Navigate to="agencias" replace /> },
          { path: 'agencias', Component: AgenciasLista },
          { path: 'agencias/nueva', Component: AgenciaNueva },
          { path: 'agencias/:id', Component: AgenciaDetalle },
          { path: 'agencias/:id/editar', Component: AgenciaEditar },
        ],
      },
      {
        Component: PanelAgencia,
        // Cada sección exige sus roles para todas sus páginas; las que aún no existen dicen "en construcción".
        children: seccionesAgencia.map((seccion) => ({
          path: seccion.ruta,
          element: (
            <RequiereRoles roles={seccion.roles}>
              <Outlet />
            </RequiereRoles>
          ),
          children: paginasDeSeccion[seccion.ruta] ?? [{ index: true, element: <EnConstruccion titulo={seccion.titulo} /> }],
        })),
      },
    ],
  },
  { path: '*', Component: NoEncontrada },
])

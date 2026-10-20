import { createBrowserRouter } from 'react-router'
import { PanelAgencia } from './agencia/PanelAgencia.tsx'
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
import { PanelPlataforma } from './plataforma/PanelPlataforma.tsx'

const PAGINA_DE_CONTRASENA = '/aceptar-invitacion'

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
        children: [{ index: true, element: <EnConstruccion titulo="Agencias" /> }],
      },
      {
        Component: PanelAgencia,
        children: seccionesAgencia.map((seccion) => ({
          path: seccion.ruta,
          element: (
            <RequiereRoles roles={seccion.roles}>
              <EnConstruccion titulo={seccion.titulo} />
            </RequiereRoles>
          ),
        })),
      },
    ],
  },
  { path: '*', Component: NoEncontrada },
])

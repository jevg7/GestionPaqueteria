import { createBrowserRouter } from 'react-router'
import { PanelAgencia } from './agencia/PanelAgencia.tsx'
import { AccesoProtegido } from './auth/AccesoProtegido.tsx'
import { AceptarInvitacion } from './auth/AceptarInvitacion.tsx'
import { IniciarSesion } from './auth/IniciarSesion.tsx'
import { Inicio } from './auth/Inicio.tsx'
import { RequiereRoles } from './auth/RequiereRoles.tsx'
import { seccionesAgencia } from './auth/secciones.ts'
import { EnConstruccion } from './pages/EnConstruccion.tsx'
import { NoEncontrada } from './pages/NoEncontrada.tsx'
import { PanelPlataforma } from './plataforma/PanelPlataforma.tsx'

export const router = createBrowserRouter([
  { path: '/iniciar-sesion', Component: IniciarSesion },
  // Destino del enlace del correo de invitación (Supabase:InviteRedirectUrl en el backend).
  { path: '/aceptar-invitacion', Component: AceptarInvitacion },
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

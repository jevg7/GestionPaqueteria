import { createBrowserRouter, Navigate, Outlet, type RouteObject } from 'react-router'
import { Auditoria } from './agencia/Auditoria.tsx'
import { ClienteDetalle } from './agencia/ClienteDetalle.tsx'
import { ClienteEditar } from './agencia/ClienteEditar.tsx'
import { ClienteNuevo } from './agencia/ClienteNuevo.tsx'
import { ClientesLista } from './agencia/ClientesLista.tsx'
import { EmbarqueDetalle } from './agencia/EmbarqueDetalle.tsx'
import { EmbarqueNuevo } from './agencia/EmbarqueNuevo.tsx'
import { EmbarquesLista } from './agencia/EmbarquesLista.tsx'
import { EntregaNueva } from './agencia/EntregaNueva.tsx'
import { Entregas } from './agencia/Entregas.tsx'
import { EntregasHistorial } from './agencia/EntregasHistorial.tsx'
import { FacturaDetalle } from './agencia/FacturaDetalle.tsx'
import { FacturaNueva } from './agencia/FacturaNueva.tsx'
import { FacturasLista } from './agencia/FacturasLista.tsx'
import { PanelAgencia } from './agencia/PanelAgencia.tsx'
import { PaqueteDetalle } from './agencia/PaqueteDetalle.tsx'
import { PaqueteEditar } from './agencia/PaqueteEditar.tsx'
import { PaqueteNuevo } from './agencia/PaqueteNuevo.tsx'
import { PaquetesLista } from './agencia/PaquetesLista.tsx'
import { TarifaNueva } from './agencia/TarifaNueva.tsx'
import { Tarifas } from './agencia/Tarifas.tsx'
import { TipoDeCambio } from './agencia/TipoDeCambio.tsx'
import { UbicacionesYRutas } from './agencia/UbicacionesYRutas.tsx'
import { UsuarioDetalle } from './agencia/UsuarioDetalle.tsx'
import { UsuarioEditar } from './agencia/UsuarioEditar.tsx'
import { UsuarioNuevo } from './agencia/UsuarioNuevo.tsx'
import { UsuariosLista } from './agencia/UsuariosLista.tsx'
import { AccesoProtegido } from './auth/AccesoProtegido.tsx'
import { AceptarInvitacion } from './auth/AceptarInvitacion.tsx'
import { IniciarSesion } from './auth/IniciarSesion.tsx'
import { Inicio } from './auth/Inicio.tsx'
import { RequiereRoles } from './auth/RequiereRoles.tsx'
import { permisos, seccionesAgencia } from './auth/secciones.ts'
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
  // Consultan ADMIN, AGENTE y BODEGA. Registran, editan y cancelan ADMIN y AGENTE; reciben y pesan ADMIN y BODEGA
  // (esas acciones están en el detalle).
  paquetes: [
    { index: true, Component: PaquetesLista },
    {
      path: 'nuevo',
      element: (
        <RequiereRoles roles={permisos.GestionarPaquetes}>
          <PaqueteNuevo />
        </RequiereRoles>
      ),
    },
    { path: ':id', Component: PaqueteDetalle },
    {
      path: ':id/editar',
      element: (
        <RequiereRoles roles={permisos.GestionarPaquetes}>
          <PaqueteEditar />
        </RequiereRoles>
      ),
    },
  ],
  // Consultan ADMIN, AGENTE y BODEGA; registran y editan ADMIN y AGENTE.
  clientes: [
    { index: true, Component: ClientesLista },
    {
      path: 'nuevo',
      element: (
        <RequiereRoles roles={permisos.EscribirClientes}>
          <ClienteNuevo />
        </RequiereRoles>
      ),
    },
    { path: ':id', Component: ClienteDetalle },
    {
      path: ':id/editar',
      element: (
        <RequiereRoles roles={permisos.EscribirClientes}>
          <ClienteEditar />
        </RequiereRoles>
      ),
    },
  ],
  // Consultan ADMIN, AGENTE y BODEGA; crean y operan ADMIN y BODEGA (las acciones están en el detalle).
  embarques: [
    { index: true, Component: EmbarquesLista },
    {
      path: 'nuevo',
      element: (
        <RequiereRoles roles={permisos.OperarBodega}>
          <EmbarqueNuevo />
        </RequiereRoles>
      ),
    },
    { path: ':id', Component: EmbarqueDetalle },
  ],
  // ADMIN y AGENTE emiten y cobran; anular facturas y pagos es solo del ADMIN (botones del detalle).
  facturas: [
    { index: true, Component: FacturasLista },
    { path: 'nueva', Component: FacturaNueva },
    { path: ':id', Component: FacturaDetalle },
  ],
  // Consultan todos (el REPARTIDOR, solo las suyas); programan ADMIN y AGENTE; salen a ruta y confirman ADMIN, AGENTE y
  // REPARTIDOR (las acciones están en la página de entregas en curso).
  entregas: [
    { index: true, Component: Entregas },
    { path: 'historial', Component: EntregasHistorial },
    {
      path: 'nueva',
      element: (
        <RequiereRoles roles={permisos.ProgramarEntregas}>
          <EntregaNueva />
        </RequiereRoles>
      ),
    },
  ],
  // Solo ADMIN: datos personales y financieros de todos los clientes.
  auditoria: [{ index: true, Component: Auditoria }],
  usuarios: [
    { index: true, Component: UsuariosLista },
    { path: 'nuevo', Component: UsuarioNuevo },
    { path: ':id', Component: UsuarioDetalle },
    { path: ':id/editar', Component: UsuarioEditar },
  ],
  ubicaciones: [{ index: true, Component: UbicacionesYRutas }],
  // Consultan ADMIN y AGENTE; el formulario para registrar solo lo ve el ADMIN.
  'tipo-de-cambio': [{ index: true, Component: TipoDeCambio }],
  // Consultan ADMIN, AGENTE y BODEGA; registrar es solo del ADMIN.
  tarifas: [
    { index: true, Component: Tarifas },
    {
      path: 'nueva',
      element: (
        <RequiereRoles roles={permisos.AdministrarConfiguracion}>
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

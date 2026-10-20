import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router'
import { nombresDeRol, useIdentidadActual, type RolAgencia } from '../auth/identidad.ts'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { Paginacion } from '../components/Paginacion.tsx'
import { mensajeDeError } from '../lib/errores.ts'
import { useDiferido } from '../lib/useDiferido.ts'
import { useFiltrosDeLista } from '../lib/useFiltrosDeLista.ts'
import { EtiquetaActivo, EtiquetasDeRoles } from './EtiquetasDeUsuario.tsx'
import { nombreDelUsuario, opcionesListaUsuarios, TAMANO_DE_PAGINA, type FiltrosUsuarios } from './usuarios.ts'

const estados: { valor: FiltrosUsuarios['activo']; texto: string }[] = [
  { valor: '', texto: 'Todos' },
  { valor: 'true', texto: 'Activos' },
  { valor: 'false', texto: 'Inactivos' },
]
const roles: RolAgencia[] = ['ADMIN', 'AGENTE', 'BODEGA', 'REPARTIDOR']

const campo =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-blue-700 focus:outline-2 focus:outline-blue-700/20'

export function UsuariosLista() {
  const yo = useIdentidadActual()
  const { leer, pagina, cambiar, cambiarPagina } = useFiltrosDeLista()
  const ubicacion = useLocation()
  const buscar = leer('buscar')
  const activo = estados.find((opcion) => opcion.valor === leer('activo'))?.valor ?? ''
  const rol = roles.find((codigo) => codigo === leer('rol')) ?? ''
  const buscarDiferido = useDiferido(buscar.trim())
  const lista = useQuery(opcionesListaUsuarios({ buscar: buscarDiferido, activo, rol, pagina }))

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Usuarios</h1>
        <EnlaceBoton to="nuevo">Nuevo usuario</EnlaceBoton>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={buscar}
          onChange={(evento) => cambiar('buscar', evento.target.value)}
          placeholder="Buscar por nombre o correo"
          aria-label="Buscar usuarios"
          maxLength={100}
          className={`${campo} w-full sm:max-w-sm`}
        />
        <select value={activo} onChange={(evento) => cambiar('activo', evento.target.value)} aria-label="Estado" className={campo}>
          {estados.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.texto}
            </option>
          ))}
        </select>
        <select value={rol} onChange={(evento) => cambiar('rol', evento.target.value)} aria-label="Rol" className={campo}>
          <option value="">Todos los roles</option>
          {roles.map((codigo) => (
            <option key={codigo} value={codigo}>
              {nombresDeRol[codigo]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        {lista.isPending ? (
          <p className="text-sm text-slate-500">Cargando usuarios…</p>
        ) : lista.isError ? (
          <div className="space-y-3">
            <Aviso tipo="error">{mensajeDeError(lista.error)}</Aviso>
            <Boton variante="secundario" cargando={lista.isFetching} onClick={() => void lista.refetch()}>
              Reintentar
            </Boton>
          </div>
        ) : lista.data.total === 0 ? (
          <p className="text-sm text-slate-600">Ningún usuario coincide con la búsqueda.</p>
        ) : (
          <div className={`space-y-3 ${lista.isPlaceholderData ? 'opacity-60' : ''}`}>
            {lista.data.items.length > 0 && (
              <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                {lista.data.items.map((usuario) => (
                  <li key={usuario.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={String(usuario.id)}
                          state={{ lista: ubicacion.search }}
                          className="font-medium text-blue-800 hover:underline"
                        >
                          {nombreDelUsuario(usuario)}
                        </Link>
                        {usuario.id === yo.id && <span className="text-xs text-slate-500">(usted)</span>}
                        {!usuario.activo && <EtiquetaActivo activo={false} />}
                      </div>
                      <p className="truncate text-sm text-slate-500">{usuario.correo}</p>
                    </div>
                    <EtiquetasDeRoles roles={usuario.roles} />
                  </li>
                ))}
              </ul>
            )}
            <Paginacion pagina={pagina} tamano={TAMANO_DE_PAGINA} total={lista.data.total} alCambiar={cambiarPagina} />
          </div>
        )}
      </div>
    </section>
  )
}

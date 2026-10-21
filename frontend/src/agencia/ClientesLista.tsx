import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router'
import { usePermiso } from '../auth/identidad.ts'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { EnlaceBoton } from '../components/EnlaceBoton.tsx'
import { EtiquetaActivo } from '../components/Etiqueta.tsx'
import { Paginacion } from '../components/Paginacion.tsx'
import { campoDeFiltro } from '../components/estilos.ts'
import { mensajeDeError } from '../lib/errores.ts'
import { useDiferido } from '../lib/useDiferido.ts'
import { useFiltrosDeLista } from '../lib/useFiltrosDeLista.ts'
import { nombreDelCliente, opcionesListaClientes, TAMANO_DE_PAGINA, type FiltrosClientes } from './clientes.ts'

const estados: { valor: FiltrosClientes['activo']; texto: string }[] = [
  { valor: '', texto: 'Todos' },
  { valor: 'true', texto: 'Activos' },
  { valor: 'false', texto: 'Inactivos' },
]

/** Clientes de la agencia: consultan ADMIN, AGENTE y BODEGA; registran y editan ADMIN y AGENTE. */
export function ClientesLista() {
  const puedeRegistrar = usePermiso('EscribirClientes')
  const { leer, pagina, cambiar, cambiarPagina } = useFiltrosDeLista()
  const ubicacion = useLocation()
  const buscar = leer('buscar')
  const activo = estados.find((opcion) => opcion.valor === leer('activo'))?.valor ?? ''
  const buscarDiferido = useDiferido(buscar.trim())
  const lista = useQuery(opcionesListaClientes({ buscar: buscarDiferido, activo, pagina }))

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Clientes</h1>
        {puedeRegistrar && <EnlaceBoton to="nuevo">Nuevo cliente</EnlaceBoton>}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={buscar}
          onChange={(evento) => cambiar('buscar', evento.target.value)}
          placeholder="Buscar por nombre, código, teléfono o correo"
          aria-label="Buscar clientes"
          maxLength={100}
          className={`${campoDeFiltro} w-full sm:max-w-md`}
        />
        <select value={activo} onChange={(evento) => cambiar('activo', evento.target.value)} aria-label="Estado" className={campoDeFiltro}>
          {estados.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.texto}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        {lista.isPending ? (
          <p className="text-sm text-slate-500">Cargando clientes…</p>
        ) : lista.isError ? (
          <div className="space-y-3">
            <Aviso tipo="error">{mensajeDeError(lista.error)}</Aviso>
            <Boton variante="secundario" cargando={lista.isFetching} onClick={() => void lista.refetch()}>
              Reintentar
            </Boton>
          </div>
        ) : lista.data.total === 0 ? (
          <div className={`space-y-1 text-sm text-slate-600 ${lista.isPlaceholderData ? 'opacity-60' : ''}`}>
            <p>{buscarDiferido || activo ? 'Ningún cliente coincide con la búsqueda.' : 'Todavía no hay clientes registrados.'}</p>
            {/* La API distingue acentos (falta unaccent): sin este aviso se registraría el mismo cliente dos veces. */}
            {/\p{L}/u.test(buscarDiferido) && (
              <p className="text-slate-500">La búsqueda distingue tildes: pruebe también con o sin ellas (López / Lopez).</p>
            )}
          </div>
        ) : (
          <div className={`space-y-3 ${lista.isPlaceholderData ? 'opacity-60' : ''}`}>
            {lista.data.items.length > 0 && (
              <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                {lista.data.items.map((cliente) => (
                  <li key={cliente.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={String(cliente.id)}
                          state={{ lista: ubicacion.search }}
                          className="font-medium text-blue-800 hover:underline"
                        >
                          {nombreDelCliente(cliente)}
                        </Link>
                        {!cliente.activo && <EtiquetaActivo activo={false} />}
                      </div>
                      <p className="truncate text-sm text-slate-500">
                        {cliente.telefono}
                        {cliente.correo && ` · ${cliente.correo}`}
                      </p>
                    </div>
                    <span className="font-mono text-sm text-slate-600">{cliente.codigoCliente}</span>
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

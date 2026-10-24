import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Aviso } from '../components/Aviso.tsx'
import { Boton } from '../components/Boton.tsx'
import { Etiqueta } from '../components/Etiqueta.tsx'
import { Paginacion } from '../components/Paginacion.tsx'
import { campoDeFiltro } from '../components/estilos.ts'
import { mensajeDeError } from '../lib/errores.ts'
import { formatearFechaHora } from '../lib/formato.ts'
import { useDiferido } from '../lib/useDiferido.ts'
import { useFiltrosDeLista } from '../lib/useFiltrosDeLista.ts'
import {
  accionesDeAuditoria,
  accionesVisibles,
  camposDelRegistro,
  nombreDeTabla,
  opcionesAuditoria,
  opcionesUsuariosParaFiltrar,
  tablasAuditadas,
  TAMANO_DE_PAGINA,
  textoDelValor,
  type RegistroDeAuditoria,
} from './auditoria.ts'
import { nombreDelUsuario } from './usuarios.ts'

/**
 * La auditoría de la agencia (solo ADMIN): cada alta, cambio o borrado con quién, cuándo, desde dónde y los valores. La
 * escribe la base de datos, también en los cambios automáticos; nadie la puede modificar.
 */
export function Auditoria() {
  const { leer, pagina, cambiar, cambiarPagina } = useFiltrosDeLista()
  const tabla = leer('tabla')
  const registro = leer('registro')
  const idUsuario = Number(leer('usuario'))
  const usuarioId = Number.isSafeInteger(idUsuario) && idUsuario > 0 ? idUsuario : null
  const accion = accionesDeAuditoria.find((codigo) => codigo === leer('accion')) ?? ''
  const desde = leer('desde')
  const hasta = leer('hasta')
  const rangoInvalido = desde !== '' && hasta !== '' && desde > hasta
  const registroDiferido = useDiferido(registro.trim())
  const usuarios = useQuery(opcionesUsuariosParaFiltrar)
  const lista = useQuery({
    ...opcionesAuditoria({ tabla, registro: registroDiferido, usuarioId, accion, desde, hasta, pagina }),
    enabled: !rangoInvalido,
  })

  return (
    <section className="max-w-5xl">
      <h1 className="text-xl font-semibold">Auditoría</h1>
      <p className="mt-1 text-sm text-slate-600">
        Quién cambió qué y cuándo. La escribe la base de datos en cada cambio, también en los automáticos, y no se puede
        modificar. Los campos llevan su nombre en la base de datos.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <select value={tabla} onChange={(evento) => cambiar('tabla', evento.target.value)} aria-label="Tabla" className={campoDeFiltro}>
          <option value="">Todas las tablas</option>
          {Object.entries(tablasAuditadas).map(([codigo, nombre]) => (
            <option key={codigo} value={codigo}>
              {nombre}
            </option>
          ))}
        </select>
        <input
          value={registro}
          onChange={(evento) => cambiar('registro', evento.target.value)}
          placeholder="Registro (id; con la tabla, su historia)"
          aria-label="Registro"
          maxLength={100}
          autoComplete="off"
          className={campoDeFiltro}
        />
        <select value={usuarioId ?? ''} onChange={(evento) => cambiar('usuario', evento.target.value)} aria-label="Usuario" className={campoDeFiltro}>
          <option value="">Todos los usuarios</option>
          {usuarios.data?.map((usuario) => (
            <option key={usuario.id} value={usuario.id}>
              {nombreDelUsuario(usuario)}
            </option>
          ))}
        </select>
        <select value={accion} onChange={(evento) => cambiar('accion', evento.target.value)} aria-label="Acción" className={campoDeFiltro}>
          <option value="">Altas, cambios y borrados</option>
          {accionesDeAuditoria.map((codigo) => (
            <option key={codigo} value={codigo}>
              {accionesVisibles[codigo].nombre}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Desde
          <input type="date" value={desde} onChange={(evento) => cambiar('desde', evento.target.value)} className={`${campoDeFiltro} flex-1`} />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Hasta
          <input type="date" value={hasta} onChange={(evento) => cambiar('hasta', evento.target.value)} className={`${campoDeFiltro} flex-1`} />
        </label>
      </div>

      <div className="mt-4">
        {rangoInvalido ? (
          <Aviso tipo="error">La fecha inicial no puede ser posterior a la final.</Aviso>
        ) : lista.isPending ? (
          <p className="text-sm text-slate-500">Cargando la auditoría…</p>
        ) : lista.isError ? (
          <div className="space-y-3">
            <Aviso tipo="error">{mensajeDeError(lista.error)}</Aviso>
            <Boton variante="secundario" cargando={lista.isFetching} onClick={() => void lista.refetch()}>
              Reintentar
            </Boton>
          </div>
        ) : lista.data.total === 0 ? (
          <p className="text-sm text-slate-600">Ningún cambio coincide con los filtros.</p>
        ) : (
          <div className={`space-y-3 ${lista.isPlaceholderData ? 'opacity-60' : ''}`}>
            <ul aria-label="Cambios" className="space-y-3">
              {lista.data.items.map((registroDeAuditoria) => (
                <Cambio key={registroDeAuditoria.id} registro={registroDeAuditoria} />
              ))}
            </ul>
            <Paginacion pagina={pagina} tamano={TAMANO_DE_PAGINA} total={lista.data.total} alCambiar={cambiarPagina} />
          </div>
        )}
      </div>
    </section>
  )
}

/** Un cambio: qué registro, quién y desde dónde, y sus campos (en un cambio, antes y después). */
function Cambio({ registro }: { registro: RegistroDeAuditoria }) {
  const accion = accionesVisibles[registro.accion] ?? { nombre: registro.accion, tono: 'gris' as const }
  const campos = camposDelRegistro(registro)
  const esCambio = registro.accion === 'UPDATE'
  // Un dueño de la plataforma no es usuario de la agencia: su origen lo dice ("[plataforma 2] POST …").
  const quien = registro.usuario ?? (registro.origen?.startsWith('[plataforma') ? 'Dueño de la plataforma' : 'Sin usuario (proceso de la base de datos)')
  const tabla = (
    <div className="mt-3 overflow-x-auto">
      {/* Ancho fijo: las columnas quedan alineadas de un cambio a otro. */}
      <table className="w-full min-w-md table-fixed text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th className="w-1/4 py-1 pr-4 font-medium">Campo</th>
            {esCambio ? (
              <>
                <th className="py-1 pr-4 font-medium">Antes</th>
                <th className="py-1 font-medium">Después</th>
              </>
            ) : (
              <th className="py-1 font-medium">Valor</th>
            )}
          </tr>
        </thead>
        <tbody>
          {campos.map(({ campo, antes, despues }) => (
            <tr key={campo} className="border-t border-slate-100 align-top">
              <td className="py-1 pr-4 font-mono text-xs text-slate-600">{campo}</td>
              {esCambio ? (
                <>
                  <td className="py-1 pr-4">
                    <Valor valor={antes} />
                  </td>
                  <td className="py-1">
                    <Valor valor={despues} />
                  </td>
                </>
              ) : (
                <td className="py-1">
                  <Valor valor={registro.accion === 'DELETE' ? antes : despues} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Etiqueta tono={accion.tono}>{accion.nombre}</Etiqueta>
          <span className="text-sm font-medium">
            {nombreDeTabla(registro.tabla)} · registro {registro.registroId}
          </span>
        </div>
        <span className="text-sm text-slate-500">{formatearFechaHora(registro.fecha)}</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {quien}
        {registro.origen && <span className="font-mono text-xs text-slate-500"> · {registro.origen}</span>}
      </p>
      {esCambio ? (
        tabla
      ) : (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-blue-700">
            {registro.accion === 'DELETE' ? 'Ver lo que había' : 'Ver los valores'} ({campos.length} campos)
          </summary>
          {tabla}
        </details>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <Link
          to={`?tabla=${encodeURIComponent(registro.tabla)}&registro=${encodeURIComponent(registro.registroId)}`}
          className="font-medium text-blue-700 hover:underline"
        >
          Ver la historia de este registro
        </Link>
        {registro.traceId && <span className="font-mono">traza {registro.traceId}</span>}
      </div>
    </li>
  )
}

function Valor({ valor }: { valor: unknown }) {
  const texto = textoDelValor(valor)
  return texto === null ? <span className="italic text-slate-400">vacío</span> : <span className="whitespace-pre-line break-all">{texto}</span>
}

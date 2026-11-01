import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  MapPin,
  Pencil,
  Plus,
  Power,
  Route as RouteIcon,
} from 'lucide-react'
import {
  Aviso,
  Busqueda,
  Confirmar,
  Consulta,
  Estado,
  Formulario,
  Modal,
  Tabla,
  Titulo,
  Vacio,
} from '../components/ui'
import { api } from '../lib/api'
import { useAcciones, useFiltros } from '../lib/hooks'
import { renombrarSchema, rutaSchema, ubicacionSchema } from '../lib/schemas'
import type { Ruta, Ubicacion } from '../types'

export function Ubicaciones() {
  const [editor, setEditor] = useState<Ubicacion | 'nuevo' | null>(null)
  const [accion, setAccion] = useState<Ubicacion | null>(null)
  const filtros = useFiltros()
  const { ejecutar, aviso, cerrarAviso } = useAcciones([
    'ubicaciones',
    'rutas',
    'catalogos',
  ])
  const query = useQuery({
    queryKey: ['ubicaciones'],
    queryFn: ({ signal }) => api<Ubicacion[]>('/api/locations', { signal }),
  })
  const rows =
    query.data?.filter(
      (u) =>
        (!filtros.get('pais') || u.pais === filtros.get('pais')) &&
        `${u.nombre} ${u.codigo}`
          .toLowerCase()
          .includes(filtros.get('search').toLowerCase()),
    ) ?? []
  const editando = editor && editor !== 'nuevo' ? editor : null
  return (
    <>
      <Titulo
        eyebrow="EL INICIO Y EL DESTINO"
        title="Ubicaciones"
        description="Organiza las bodegas y agencias que conectan tus envíos."
        action={
          <button className="button primary" onClick={() => setEditor('nuevo')}>
            <Plus size={18} />
            Nueva ubicación
          </button>
        }
      />
      {aviso && (
        <Aviso tipo="success" onClose={cerrarAviso}>
          {aviso}
        </Aviso>
      )}
      <div className="location-summary">
        <div>
          <span className="country-code">US</span>
          <div>
            <strong>Estados Unidos</strong>
            <small>Bodegas de origen</small>
          </div>
        </div>
        <ArrowRight size={23} />
        <div>
          <span className="country-code ni">NI</span>
          <div>
            <strong>Nicaragua</strong>
            <small>Agencias de destino</small>
          </div>
        </div>
      </div>
      <section className="panel">
        <div className="panel-toolbar">
          <Busqueda
            value={filtros.get('search')}
            onChange={(v) => filtros.set('search', v)}
            placeholder="Buscar por nombre o código…"
          />
          <select
            aria-label="Filtrar por país"
            value={filtros.get('pais')}
            onChange={(e) => filtros.set('pais', e.target.value)}
          >
            <option value="">Todos los países</option>
            <option value="US">Estados Unidos</option>
            <option value="NI">Nicaragua</option>
          </select>
        </div>
        <Consulta query={query}>
          <Tabla
            caption="Ubicaciones de la agencia"
            rows={rows}
            columns={[
              {
                titulo: 'UBICACIÓN',
                render: (u) => (
                  <div className="person-cell">
                    <span className="location-icon">
                      <MapPin size={20} />
                    </span>
                    <div>
                      <strong>{u.nombre}</strong>
                      <small>
                        {u.pais === 'US'
                          ? 'Bodega de origen'
                          : 'Agencia de destino'}
                      </small>
                    </div>
                  </div>
                ),
              },
              {
                titulo: 'CÓDIGO',
                render: (u) => <span className="code-tag">{u.codigo}</span>,
              },
              {
                titulo: 'PAÍS',
                render: (u) =>
                  u.pais === 'US' ? 'Estados Unidos' : 'Nicaragua',
              },
              { titulo: 'ESTADO', render: (u) => <Estado valor={u.activo} /> },
              {
                titulo: 'ACCIONES',
                className: 'actions-column',
                render: (u) => (
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      title="Renombrar ubicación"
                      aria-label={`Renombrar ${u.nombre}`}
                      onClick={() => setEditor(u)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      title={
                        u.activo ? 'Desactivar ubicación' : 'Activar ubicación'
                      }
                      aria-label={`${u.activo ? 'Desactivar' : 'Activar'} ${u.nombre}`}
                      onClick={() => setAccion(u)}
                    >
                      <Power size={17} />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </Consulta>
      </section>
      <p className="page-hint">
        El código y el país son permanentes. Para desactivar una ubicación,
        primero desactiva las rutas que la utilizan.
      </p>
      {editor && (
        <Modal
          title={editando ? 'Renombrar ubicación' : 'Agregar ubicación'}
          description={
            editando
              ? `Código ${editando.codigo} · ${editando.pais === 'US' ? 'Estados Unidos' : 'Nicaragua'}`
              : 'Agrega una bodega en Estados Unidos o una agencia en Nicaragua.'
          }
          onClose={() => setEditor(null)}
        >
          <Formulario
            schema={editando ? renombrarSchema : ubicacionSchema}
            defaults={
              editando
                ? { nombre: editando.nombre }
                : { nombre: '', codigo: '', pais: 'NI' }
            }
            fields={
              editando
                ? [
                    {
                      name: 'nombre',
                      label: 'Nombre de la ubicación',
                      wide: true,
                      maxLength: 100,
                    },
                  ]
                : [
                    {
                      name: 'nombre',
                      label: 'Nombre de la ubicación',
                      wide: true,
                      maxLength: 100,
                    },
                    {
                      name: 'codigo',
                      label: 'Código',
                      placeholder: 'MGA',
                      help: 'De 2 a 10 letras o dígitos.',
                      maxLength: 10,
                    },
                    {
                      name: 'pais',
                      label: 'País',
                      type: 'select',
                      options: [
                        { value: 'US', label: 'Estados Unidos' },
                        { value: 'NI', label: 'Nicaragua' },
                      ],
                    },
                  ]
            }
            onCancel={() => setEditor(null)}
            onSubmit={async (v) => {
              await ejecutar(
                `/api/locations${editando ? `/${editando.id}` : ''}`,
                v,
                editando ? 'PUT' : 'POST',
              )
              setEditor(null)
            }}
          />
        </Modal>
      )}
      {accion && (
        <Confirmar
          title={`${accion.activo ? 'Desactivar' : 'Activar'} ubicación`}
          description={`${accion.nombre} ${accion.activo ? 'dejará de estar disponible para nuevas rutas. Ninguna ruta activa debe utilizarla.' : 'estará disponible para crear nuevas rutas.'}`}
          action={accion.activo ? 'Desactivar ubicación' : 'Activar ubicación'}
          danger={accion.activo}
          onClose={() => setAccion(null)}
          onConfirm={() =>
            ejecutar(
              `/api/locations/${accion.id}/${accion.activo ? 'deactivate' : 'activate'}`,
            )
          }
        />
      )}
    </>
  )
}
export function Rutas() {
  const [editor, setEditor] = useState<Ruta | 'nuevo' | null>(null)
  const [accion, setAccion] = useState<Ruta | null>(null)
  const filtros = useFiltros()
  const { ejecutar, aviso, cerrarAviso } = useAcciones(['rutas', 'catalogos'])
  const query = useQuery({
    queryKey: ['rutas'],
    queryFn: ({ signal }) => api<Ruta[]>('/api/routes', { signal }),
  })
  const ubicaciones = useQuery({
    queryKey: ['ubicaciones'],
    queryFn: ({ signal }) => api<Ubicacion[]>('/api/locations', { signal }),
  })
  const editando = editor && editor !== 'nuevo' ? editor : null
  const rows =
    query.data?.filter(
      (r) =>
        r.nombre.toLowerCase().includes(filtros.get('search').toLowerCase()) &&
        (!filtros.get('activo') ||
          r.activo === (filtros.get('activo') === 'true')),
    ) ?? []
  const options = (pais: string) =>
    ubicaciones.data
      ?.filter((u) => u.activo && u.pais === pais)
      .map((u) => ({
        value: String(u.id),
        label: `${u.codigo} · ${u.nombre}`,
      })) ?? []
  return (
    <>
      <Titulo
        eyebrow="CONECTAMOS CADA PUNTO"
        title="Rutas"
        description="Los caminos que unen tus bodegas con las agencias de destino."
        action={
          <button className="button primary" onClick={() => setEditor('nuevo')}>
            <Plus size={18} />
            Nueva ruta
          </button>
        }
      />
      {aviso && (
        <Aviso tipo="success" onClose={cerrarAviso}>
          {aviso}
        </Aviso>
      )}
      <div className="panel-toolbar standalone-toolbar">
        <Busqueda
          value={filtros.get('search')}
          onChange={(v) => filtros.set('search', v)}
          placeholder="Buscar una ruta…"
        />
        <select
          aria-label="Filtrar por estado"
          value={filtros.get('activo')}
          onChange={(e) => filtros.set('activo', e.target.value)}
        >
          <option value="">Todos los estados</option>
          <option value="true">Activas</option>
          <option value="false">Inactivas</option>
        </select>
      </div>
      <Consulta query={query}>
        {rows.length ? (
          <div className="routes-grid">
            {rows.map((r) => (
              <article
                className={`route-card ${!r.activo ? 'route-inactive' : ''}`}
                key={r.id}
              >
                <header>
                  <span className="route-card-label">
                    <RouteIcon size={16} />
                    RUTA DE ENVÍO
                  </span>
                  <Estado valor={r.activo} />
                </header>
                <h2>{r.nombre}</h2>
                <div className="route-cities">
                  <div>
                    <small>ORIGEN · US</small>
                    <strong>{r.origen.codigo}</strong>
                    <span>{r.origen.nombre}</span>
                  </div>
                  <span className="route-arrow">
                    <span />
                    <ArrowRight size={21} />
                    <span />
                  </span>
                  <div>
                    <small>DESTINO · NI</small>
                    <strong>{r.destino.codigo}</strong>
                    <span>{r.destino.nombre}</span>
                  </div>
                </div>
                <footer>
                  <span>Estados Unidos → Nicaragua</span>
                  <div>
                    <button
                      className="icon-button"
                      title="Renombrar ruta"
                      aria-label={`Renombrar ${r.nombre}`}
                      onClick={() => setEditor(r)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      title={r.activo ? 'Desactivar ruta' : 'Activar ruta'}
                      aria-label={`${r.activo ? 'Desactivar' : 'Activar'} ${r.nombre}`}
                      onClick={() => setAccion(r)}
                    >
                      <Power size={17} />
                    </button>
                  </div>
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel">
            <Vacio
              title="No hay rutas para mostrar"
              description="Crea una ruta o prueba con otros filtros."
            />
          </div>
        )}
      </Consulta>
      <p className="page-hint">
        Todas las rutas conectan Estados Unidos con Nicaragua. Una ruta inactiva
        no admite nuevos embarques.
      </p>
      {editor && (
        <Modal
          title={editando ? 'Renombrar ruta' : 'Crear una nueva ruta'}
          description={
            editando
              ? `${editando.origen.codigo} → ${editando.destino.codigo}. El origen y el destino se conservan.`
              : 'Selecciona ubicaciones activas para conectar el origen y el destino.'
          }
          onClose={() => setEditor(null)}
        >
          <Consulta query={ubicaciones}>
            <Formulario
              schema={editando ? renombrarSchema : rutaSchema}
              defaults={
                editando
                  ? { nombre: editando.nombre }
                  : { nombre: '', origenId: '', destinoId: '' }
              }
              fields={[
                {
                  name: 'nombre',
                  label: 'Nombre de la ruta',
                  placeholder: 'Miami → Managua',
                  wide: true,
                  maxLength: 100,
                },
                ...(!editando
                  ? [
                      {
                        name: 'origenId',
                        label: 'Origen en Estados Unidos',
                        type: 'select' as const,
                        options: options('US'),
                      },
                      {
                        name: 'destinoId',
                        label: 'Destino en Nicaragua',
                        type: 'select' as const,
                        options: options('NI'),
                      },
                    ]
                  : []),
              ]}
              note={
                !editando && (!options('US').length || !options('NI').length)
                  ? 'Necesitas una ubicación activa en cada país. Puedes registrarlas en Ubicaciones.'
                  : undefined
              }
              onCancel={() => setEditor(null)}
              onSubmit={async (v) => {
                await ejecutar(
                  `/api/routes${editando ? `/${editando.id}` : ''}`,
                  editando
                    ? v
                    : {
                        ...v,
                        origenId: Number(v.origenId),
                        destinoId: Number(v.destinoId),
                      },
                  editando ? 'PUT' : 'POST',
                )
                setEditor(null)
              }}
            />
          </Consulta>
        </Modal>
      )}
      {accion && (
        <Confirmar
          title={`${accion.activo ? 'Desactivar' : 'Activar'} ruta`}
          description={`${accion.nombre} ${accion.activo ? 'dejará de estar disponible para crear embarques nuevos. Los embarques existentes se conservan.' : 'estará disponible para crear nuevos embarques. Ambas ubicaciones deben estar activas.'}`}
          action={accion.activo ? 'Desactivar ruta' : 'Activar ruta'}
          danger={accion.activo}
          onClose={() => setAccion(null)}
          onConfirm={() =>
            ejecutar(
              `/api/routes/${accion.id}/${accion.activo ? 'deactivate' : 'activate'}`,
            )
          }
        />
      )}
    </>
  )
}

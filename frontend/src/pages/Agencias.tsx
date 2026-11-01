import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, Pencil, Plus, Power } from 'lucide-react'
import {
  Aviso,
  Busqueda,
  Confirmar,
  Consulta,
  Estado,
  Formulario,
  Modal,
  Paginacion,
  Tabla,
  Titulo,
  type Campo,
} from '../components/ui'
import { api, consulta } from '../lib/api'
import { fecha, iniciales } from '../lib/format'
import { useAcciones, useFiltros } from '../lib/hooks'
import { agenciaSchema, nuevaAgenciaSchema } from '../lib/schemas'
import type { Agencia, Paginado } from '../types'

const campos: Campo[] = [
  {
    name: 'nombre',
    label: 'Nombre de la agencia',
    wide: true,
    placeholder: 'Nombre comercial',
    maxLength: 150,
  },
  { name: 'ruc', label: 'RUC (opcional)', maxLength: 30 },
  {
    name: 'telefono',
    label: 'Teléfono (opcional)',
    type: 'tel',
    maxLength: 30,
  },
  {
    name: 'correoContacto',
    label: 'Correo de contacto (opcional)',
    type: 'email',
    wide: true,
    maxLength: 254,
  },
]
const adminCampos: Campo[] = [
  { name: 'nombres', label: 'Nombres del administrador', maxLength: 100 },
  { name: 'apellidos', label: 'Apellidos del administrador', maxLength: 100 },
  {
    name: 'correo',
    label: 'Correo del administrador',
    type: 'email',
    wide: true,
    help: 'Recibirá la invitación para administrar su nueva agencia.',
    maxLength: 254,
  },
  {
    name: 'telefonoAdmin',
    label: 'Teléfono del administrador (opcional)',
    type: 'tel',
    wide: true,
    maxLength: 30,
  },
]
export function Agencias() {
  const filtros = useFiltros()
  const [editor, setEditor] = useState<Agencia | 'nuevo' | null>(null)
  const [accion, setAccion] = useState<Agencia | null>(null)
  const { ejecutar, aviso, cerrarAviso } = useAcciones(['agencias'])
  const path = consulta('/api/platform/agencies', {
    search: filtros.get('search'),
    estado: filtros.get('estado'),
    page: filtros.page,
    pageSize: 10,
  })
  const query = useQuery({
    queryKey: ['agencias', path],
    queryFn: ({ signal }) => api<Paginado<Agencia>>(path, { signal }),
  })
  const editando = editor && editor !== 'nuevo' ? editor : null
  return (
    <>
      <Titulo
        eyebrow="PLATAFORMA / AGENCIAS"
        title="Una red que sigue creciendo"
        description="Administra las agencias y acompaña cada nuevo comienzo."
        action={
          <button className="button primary" onClick={() => setEditor('nuevo')}>
            <Plus size={18} />
            Nueva agencia
          </button>
        }
      />
      {aviso && (
        <Aviso tipo="success" onClose={cerrarAviso}>
          {aviso}
        </Aviso>
      )}
      <div className="section-note">
        <Building2 size={18} />
        <span>
          Cada agencia cuenta con su propio equipo, configuración y datos
          aislados.
        </span>
      </div>
      <section className="panel">
        <div className="panel-toolbar">
          <Busqueda
            value={filtros.get('search')}
            onChange={(v) => filtros.set('search', v)}
            placeholder="Buscar por nombre, RUC o correo…"
          />
          <select
            aria-label="Filtrar por estado"
            value={filtros.get('estado')}
            onChange={(e) => filtros.set('estado', e.target.value)}
          >
            <option value="">Todos los estados</option>
            <option value="ACTIVA">Activas</option>
            <option value="SUSPENDIDA">Suspendidas</option>
          </select>
        </div>
        <Consulta query={query}>
          <Tabla
            caption="Agencias de la plataforma"
            rows={query.data?.items ?? []}
            columns={[
              {
                titulo: 'AGENCIA',
                render: (a) => (
                  <div className="person-cell">
                    <span className="avatar avatar-2">
                      {iniciales(a.nombre)}
                    </span>
                    <div>
                      <strong>{a.nombre}</strong>
                      <small>
                        {a.ruc ? `RUC ${a.ruc}` : 'Sin RUC registrado'}
                      </small>
                    </div>
                  </div>
                ),
              },
              {
                titulo: 'CONTACTO',
                render: (a) => (
                  <div className="stack-cell">
                    <span>{a.correoContacto || 'Sin correo'}</span>
                    <small>{a.telefono || 'Sin teléfono'}</small>
                  </div>
                ),
              },
              {
                titulo: 'CREADA',
                render: (a) => (
                  <span className="muted">{fecha(a.creadoEn)}</span>
                ),
              },
              { titulo: 'ESTADO', render: (a) => <Estado valor={a.estado} /> },
              {
                titulo: 'ACCIONES',
                className: 'actions-column',
                render: (a) => (
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      aria-label={`Editar ${a.nombre}`}
                      title="Editar agencia"
                      onClick={() => setEditor(a)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`${a.estado === 'ACTIVA' ? 'Suspender' : 'Reactivar'} ${a.nombre}`}
                      title={
                        a.estado === 'ACTIVA'
                          ? 'Suspender agencia'
                          : 'Reactivar agencia'
                      }
                      onClick={() => setAccion(a)}
                    >
                      <Power size={17} />
                    </button>
                  </div>
                ),
              },
            ]}
          />
          {query.data && (
            <Paginacion
              total={query.data.total}
              page={filtros.page}
              onChange={(v) => filtros.set('page', v)}
            />
          )}
        </Consulta>
      </section>
      <p className="page-hint">
        Este panel administra el acceso de las agencias. Sus datos operativos
        pertenecen a cada agencia.
      </p>
      {editor && (
        <Modal
          title={
            editando ? 'Editar agencia' : 'Dar la bienvenida a una agencia'
          }
          description={
            editando
              ? 'Actualiza sus datos comerciales y de contacto.'
              : 'La agencia comenzará con sus ubicaciones, la ruta Miami → Managua y su primer administrador.'
          }
          onClose={() => setEditor(null)}
        >
          <Formulario
            schema={editando ? agenciaSchema : nuevaAgenciaSchema}
            defaults={
              editando
                ? {
                    nombre: editando.nombre,
                    ruc: editando.ruc ?? '',
                    telefono: editando.telefono ?? '',
                    correoContacto: editando.correoContacto ?? '',
                  }
                : {
                    nombre: '',
                    ruc: '',
                    telefono: '',
                    correoContacto: '',
                    nombres: '',
                    apellidos: '',
                    correo: '',
                    telefonoAdmin: '',
                  }
            }
            fields={editando ? campos : [...campos, ...adminCampos]}
            submit={editando ? 'Guardar cambios' : 'Crear agencia e invitar'}
            onCancel={() => setEditor(null)}
            onSubmit={async (v) => {
              const agencia = {
                nombre: v.nombre,
                ruc: v.ruc || null,
                telefono: v.telefono || null,
                correoContacto: v.correoContacto || null,
              }
              await ejecutar(
                `/api/platform/agencies${editando ? `/${editando.id}` : ''}`,
                editando
                  ? agencia
                  : {
                      agencia,
                      admin: {
                        nombres: v.nombres,
                        apellidos: v.apellidos,
                        correo: v.correo,
                        telefono: v.telefonoAdmin || null,
                      },
                    },
                editando ? 'PUT' : 'POST',
                editando
                  ? 'Agencia actualizada.'
                  : 'Agencia creada e invitación preparada.',
              )
              setEditor(null)
            }}
          />
        </Modal>
      )}
      {accion && (
        <Confirmar
          title={
            accion.estado === 'ACTIVA'
              ? 'Suspender agencia'
              : 'Reactivar agencia'
          }
          description={
            accion.estado === 'ACTIVA'
              ? `Los usuarios de ${accion.nombre} perderán el acceso de inmediato. Sus datos se conservarán y podrás reactivar la agencia después.`
              : `Los usuarios activos de ${accion.nombre} podrán volver a acceder a su espacio.`
          }
          action={
            accion.estado === 'ACTIVA'
              ? 'Suspender agencia'
              : 'Reactivar agencia'
          }
          danger={accion.estado === 'ACTIVA'}
          onClose={() => setAccion(null)}
          onConfirm={() =>
            ejecutar(
              `/api/platform/agencies/${accion.id}/${accion.estado === 'ACTIVA' ? 'suspend' : 'activate'}`,
              undefined,
              'POST',
              'Estado de la agencia actualizado.',
            )
          }
        />
      )}
    </>
  )
}

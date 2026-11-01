import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  MailPlus,
  Pencil,
  Plus,
  ShieldCheck,
  UserRoundCheck,
  UserRoundX,
} from 'lucide-react'
import { useSesion } from '../auth/session'
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
import { iniciales, nombresRoles } from '../lib/format'
import { useAcciones, useFiltros } from '../lib/hooks'
import { nuevoUsuarioSchema, usuarioSchema } from '../lib/schemas'
import type { Paginado, Usuario } from '../types'

const roles = ['ADMIN', 'AGENTE', 'BODEGA', 'REPARTIDOR'].map((value) => ({
  value,
  label: nombresRoles[value],
}))
const campos: Campo[] = [
  { name: 'nombres', label: 'Nombres', maxLength: 100 },
  { name: 'apellidos', label: 'Apellidos', maxLength: 100 },
  {
    name: 'correo',
    label: 'Correo electrónico',
    type: 'email',
    placeholder: 'persona@agencia.com',
    help: 'Aquí llegará la invitación para crear su contraseña.',
    wide: true,
    maxLength: 254,
  },
  {
    name: 'telefono',
    label: 'Teléfono (opcional)',
    type: 'tel',
    placeholder: '+505 8888 0000',
    wide: true,
    maxLength: 30,
  },
  { name: 'roles', label: 'Roles y acceso', type: 'roles', options: roles },
]
export function Usuarios() {
  const filtros = useFiltros()
  const { usuario } = useSesion()
  const [editor, setEditor] = useState<Usuario | 'nuevo' | null>(null)
  const [accion, setAccion] = useState<{
    usuario: Usuario
    tipo: 'estado' | 'invitar'
  } | null>(null)
  const { ejecutar, aviso, cerrarAviso } = useAcciones(['usuarios'])
  const path = consulta('/api/users', {
    search: filtros.get('search'),
    activo: filtros.get('activo'),
    rol: filtros.get('rol'),
    page: filtros.page,
    pageSize: 10,
  })
  const query = useQuery({
    queryKey: ['usuarios', path],
    queryFn: ({ signal }) => api<Paginado<Usuario>>(path, { signal }),
  })
  const editando = editor && editor !== 'nuevo' ? editor : null
  return (
    <>
      <Titulo
        eyebrow="UN EQUIPO, MUCHOS DESTINOS"
        title="Usuarios y roles"
        description="Las personas que hacen que cada envío llegue a su destino."
        action={
          <button className="button primary" onClick={() => setEditor('nuevo')}>
            <Plus size={18} />
            Invitar usuario
          </button>
        }
      />
      {aviso && (
        <Aviso tipo="success" onClose={cerrarAviso}>
          {aviso}
        </Aviso>
      )}
      <div className="section-note">
        <ShieldCheck size={18} />
        <span>
          Cada persona tiene su propio acceso. Asigna solo los roles que
          necesita.
        </span>
      </div>
      <section className="panel">
        <div className="panel-toolbar">
          <Busqueda
            value={filtros.get('search')}
            onChange={(v) => filtros.set('search', v)}
            placeholder="Buscar por nombre o correo…"
          />
          <div className="filter-group">
            <select
              aria-label="Filtrar por rol"
              value={filtros.get('rol')}
              onChange={(e) => filtros.set('rol', e.target.value)}
            >
              <option value="">Todos los roles</option>
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar por estado"
              value={filtros.get('activo')}
              onChange={(e) => filtros.set('activo', e.target.value)}
            >
              <option value="">Todos los estados</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
            </select>
          </div>
        </div>
        <Consulta query={query}>
          <Tabla
            caption="Usuarios de la agencia"
            rows={query.data?.items ?? []}
            columns={[
              {
                titulo: 'PERSONA',
                render: (u) => (
                  <div className="person-cell">
                    <span className={`avatar avatar-${u.id % 4}`}>
                      {iniciales(u.nombres, u.apellidos)}
                    </span>
                    <div>
                      <strong>
                        {u.nombres} {u.apellidos}
                        {u.id === usuario?.id && (
                          <span className="you-label">Tú</span>
                        )}
                      </strong>
                      <small>{u.correo}</small>
                    </div>
                  </div>
                ),
              },
              {
                titulo: 'ROLES',
                render: (u) => (
                  <div className="role-tags">
                    {u.roles.map((r) => (
                      <span
                        className={`role-tag role-${r.toLowerCase()}`}
                        key={r}
                      >
                        {nombresRoles[r]}
                      </span>
                    ))}
                  </div>
                ),
              },
              {
                titulo: 'TELÉFONO',
                render: (u) => (
                  <span className="muted">{u.telefono || 'Sin teléfono'}</span>
                ),
              },
              { titulo: 'ESTADO', render: (u) => <Estado valor={u.activo} /> },
              {
                titulo: 'ACCIONES',
                className: 'actions-column',
                render: (u) => (
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      title="Editar usuario"
                      aria-label={`Editar a ${u.nombres}`}
                      onClick={() => setEditor(u)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      title="Reenviar invitación"
                      aria-label={`Reenviar invitación a ${u.nombres}`}
                      disabled={!u.activo}
                      onClick={() => setAccion({ usuario: u, tipo: 'invitar' })}
                    >
                      <MailPlus size={16} />
                    </button>
                    <button
                      className="icon-button"
                      title={u.activo ? 'Desactivar' : 'Activar'}
                      aria-label={`${u.activo ? 'Desactivar' : 'Activar'} a ${u.nombres}`}
                      disabled={u.id === usuario?.id}
                      onClick={() => setAccion({ usuario: u, tipo: 'estado' })}
                    >
                      {u.activo ? (
                        <UserRoundX size={17} />
                      ) : (
                        <UserRoundCheck size={17} />
                      )}
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
        Los usuarios inactivos conservan su historial, pero no pueden acceder a
        la agencia.
      </p>
      {editor && (
        <Modal
          title={editando ? 'Editar usuario' : 'Invitar al equipo'}
          description={
            editando
              ? 'Actualiza los datos y los permisos de esta persona.'
              : 'La persona recibirá una invitación para definir su contraseña.'
          }
          onClose={() => setEditor(null)}
        >
          <Formulario
            schema={editando ? usuarioSchema : nuevoUsuarioSchema}
            defaults={
              editando
                ? {
                    nombres: editando.nombres,
                    apellidos: editando.apellidos,
                    correo: editando.correo,
                    telefono: editando.telefono ?? '',
                    roles: editando.roles,
                  }
                : {
                    nombres: '',
                    apellidos: '',
                    correo: '',
                    telefono: '',
                    roles: ['AGENTE'],
                  }
            }
            fields={campos.map((c) =>
              c.name === 'correo' && editando
                ? {
                    ...c,
                    disabled: true,
                    help: 'El correo identifica la cuenta y no se puede cambiar.',
                  }
                : c,
            )}
            submit={editando ? 'Guardar cambios' : 'Enviar invitación'}
            onCancel={() => setEditor(null)}
            note="La agencia siempre debe conservar al menos un administrador activo."
            onSubmit={async (values) => {
              const body = {
                nombres: values.nombres,
                apellidos: values.apellidos,
                telefono: values.telefono || null,
                roles: values.roles,
                ...(!editando ? { correo: values.correo } : {}),
              }
              await ejecutar(
                `/api/users${editando ? `/${editando.id}` : ''}`,
                body,
                editando ? 'PUT' : 'POST',
                editando ? 'Usuario actualizado.' : 'Invitación preparada.',
              )
              setEditor(null)
            }}
          />
        </Modal>
      )}
      {accion && (
        <Confirmar
          title={
            accion.tipo === 'invitar'
              ? 'Reenviar invitación'
              : `${accion.usuario.activo ? 'Desactivar' : 'Activar'} usuario`
          }
          description={
            accion.tipo === 'invitar'
              ? `Se reenviará una invitación a ${accion.usuario.correo}. Solo está disponible si todavía no la aceptó.`
              : `${accion.usuario.nombres} ${accion.usuario.apellidos} ${accion.usuario.activo ? 'perderá el acceso de inmediato. Su historial se conservará.' : 'podrá volver a acceder con sus roles asignados.'}`
          }
          action={
            accion.tipo === 'invitar'
              ? 'Reenviar invitación'
              : accion.usuario.activo
                ? 'Desactivar usuario'
                : 'Activar usuario'
          }
          danger={accion.tipo === 'estado' && accion.usuario.activo}
          onClose={() => setAccion(null)}
          onConfirm={() =>
            ejecutar(
              `/api/users/${accion.usuario.id}/${accion.tipo === 'invitar' ? 'resend-invite' : accion.usuario.activo ? 'deactivate' : 'activate'}`,
              undefined,
              'POST',
              accion.tipo === 'invitar'
                ? 'Invitación preparada.'
                : 'Estado del usuario actualizado.',
            )
          }
        />
      )}
    </>
  )
}

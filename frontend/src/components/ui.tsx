import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Inbox,
  LoaderCircle,
  Search,
  X,
} from 'lucide-react'
import { useForm, type FieldValues, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { mensajeError } from '../lib/api-error'

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className={`logo ${light ? 'logo-light' : ''}`}>
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <path
          d="m20 6 13 7.5v15L20 36 7 28.5v-15L20 6Z"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="m7 13.5 13 7.6 13-7.6M20 21v15M13.5 9.7 27 17.2"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      </svg>
      <span>
        paqueteo<span className="logo-dot">.</span>
      </span>
    </span>
  )
}
export function Cargando({
  label = 'Cargando información…',
}: {
  label?: string
}) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} />
      <span>{label}</span>
    </div>
  )
}
export function Aviso({
  children,
  tipo = 'info',
  onClose,
}: {
  children: ReactNode
  tipo?: 'info' | 'error' | 'success'
  onClose?: () => void
}) {
  const Icon = tipo === 'success' ? CheckCircle2 : AlertCircle
  return (
    <div
      className={`notice notice-${tipo}`}
      role={tipo === 'error' ? 'alert' : 'status'}
    >
      <Icon size={18} />
      <div>{children}</div>
      {onClose && (
        <button
          className="icon-button"
          aria-label="Cerrar aviso"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}
export function Vacio({
  title = 'No hay resultados',
  description = 'Prueba con otros filtros o registra el primer elemento.',
  action,
}: {
  title?: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}
export function Consulta({
  query,
  children,
}: {
  query: {
    isPending: boolean
    isError: boolean
    error: unknown
    refetch: () => unknown
  }
  children: ReactNode
}) {
  if (query.isPending) return <Cargando />
  if (query.isError)
    return (
      <div className="query-error">
        <Aviso tipo="error">{mensajeError(query.error)}</Aviso>
        <button
          className="button secondary"
          onClick={() => void query.refetch()}
        >
          Volver a intentar
        </button>
      </div>
    )
  return children
}
const etiquetas: Record<string, string> = {
  ACTIVA: 'Activa',
  SUSPENDIDA: 'Suspendida',
  VIGENTE: 'Vigente',
  VENCIDA: 'Vencida',
  PROGRAMADA: 'Programada',
  ANULADA: 'Anulada',
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
}
export function Estado({ valor }: { valor: string | boolean }) {
  const estado =
    typeof valor === 'boolean' ? (valor ? 'ACTIVO' : 'INACTIVO') : valor
  return (
    <span className={`badge badge-${estado.toLowerCase()}`}>
      <span />
      {etiquetas[estado] ?? estado}
    </span>
  )
}
export function Titulo({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  )
}
export interface Columna<T> {
  titulo: string
  render: (row: T) => ReactNode
  className?: string
}
export function Tabla<T extends { id: number }>({
  rows,
  columns,
  caption,
}: {
  rows: T[]
  columns: Columna<T>[]
  caption: string
}) {
  if (!rows.length) return <Vacio />
  return (
    <div className="table-scroll">
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.titulo} className={c.className} scope="col">
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((c) => (
                <td key={c.titulo} className={c.className}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
export function Paginacion({
  total,
  page,
  pageSize = 10,
  onChange,
}: {
  total: number
  page: number
  pageSize?: number
  onChange: (page: number) => void
}) {
  const paginas = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="pagination">
      <span>
        {total
          ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}`
          : '0'}{' '}
        de {total} registros
      </span>
      <div>
        <button
          className="icon-button"
          aria-label="Página anterior"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ArrowLeft size={16} />
        </button>
        <span>
          Página {page} de {paginas}
        </span>
        <button
          className="icon-button"
          aria-label="Página siguiente"
          disabled={page >= paginas}
          onClick={() => onChange(page + 1)}
        >
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}
export function Busqueda({
  value,
  onChange,
  placeholder = 'Buscar…',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    if (input.current) input.current.value = value
    return () => clearTimeout(timer.current)
  }, [value])
  return (
    <label className="search-field">
      <Search size={17} />
      <span className="sr-only">{placeholder}</span>
      <input
        ref={input}
        type="search"
        maxLength={100}
        placeholder={placeholder}
        defaultValue={value}
        onChange={(event) => {
          clearTimeout(timer.current)
          const text = event.target.value
          timer.current = setTimeout(() => onChange(text), 300)
        }}
      />
    </label>
  )
}
export function Modal({
  title,
  description,
  children,
  onClose,
  busy = false,
}: {
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
  busy?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const cerrar = () => {
    if (!busy && !ref.current?.querySelector('fieldset[disabled]')) onClose()
  }
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="modal"
      onCancel={(e) => {
        e.preventDefault()
        cerrar()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) cerrar()
      }}
    >
      <div className="modal-inner">
        <header>
          <div>
            <span className="eyebrow">PAQUETEO / ADMINISTRACIÓN</span>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="Cerrar ventana"
            onClick={cerrar}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  )
}
export interface Campo {
  name: string
  label: string
  type?: 'text' | 'email' | 'tel' | 'date' | 'decimal' | 'select' | 'roles'
  placeholder?: string
  help?: string
  options?: { value: string; label: string }[]
  disabled?: boolean
  wide?: boolean
  min?: string
  maxLength?: number
}
export function Formulario({
  schema,
  defaults,
  fields,
  onSubmit,
  onCancel,
  submit = 'Guardar cambios',
  note,
}: {
  schema: z.ZodObject
  defaults: FieldValues
  fields: Campo[]
  onSubmit: (data: FieldValues) => Promise<void>
  onCancel: () => void
  submit?: string
  note?: string
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FieldValues>({
    defaultValues: defaults,
    resolver: zodResolver(schema) as Resolver<FieldValues>,
  })
  const id = useId()
  const [error, setError] = useState<unknown>(null)
  return (
    <form
      noValidate
      onSubmit={handleSubmit(async (data) => {
        setError(null)
        try {
          await onSubmit(data)
        } catch (error) {
          setError(error)
        }
      })}
    >
      <fieldset disabled={isSubmitting} className="form-grid">
        {fields.map((field) => {
          const fieldId = `${id}-${field.name}`
          const message = errors[field.name]?.message
          const props = {
            id: fieldId,
            'aria-invalid': !!message,
            'aria-describedby': `${fieldId}-help`,
            readOnly: field.disabled,
            ...register(field.name),
          }
          return (
            <div
              className={`field ${field.wide || field.type === 'roles' ? 'field-wide' : ''}`}
              key={field.name}
            >
              {field.type !== 'roles' && (
                <label htmlFor={fieldId}>{field.label}</label>
              )}
              {field.type === 'select' ? (
                <select {...props}>
                  <option value="">Seleccionar…</option>
                  {field.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : field.type === 'roles' ? (
                <fieldset
                  className="roles-field"
                  aria-invalid={!!message}
                  aria-describedby={`${fieldId}-help`}
                >
                  <legend>{field.label}</legend>
                  <div>
                    {field.options?.map((o) => (
                      <label className="role-option" key={o.value}>
                        <input
                          type="checkbox"
                          value={o.value}
                          {...register(field.name)}
                        />
                        <span>
                          <strong>{o.label}</strong>
                          <small>
                            {
                              (
                                {
                                  ADMIN: 'Configuración y equipo',
                                  AGENTE: 'Atención y facturación',
                                  BODEGA: 'Recepción y embarques',
                                  REPARTIDOR: 'Entregas asignadas',
                                } as Record<string, string>
                              )[o.value]
                            }
                          </small>
                        </span>
                        <Check size={16} />
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <input
                  {...props}
                  type={
                    field.type === 'decimal' ? 'text' : (field.type ?? 'text')
                  }
                  inputMode={field.type === 'decimal' ? 'decimal' : undefined}
                  placeholder={field.placeholder}
                  min={field.min}
                  maxLength={field.maxLength}
                />
              )}
              <span
                id={`${fieldId}-help`}
                className={message ? 'field-error' : 'field-help'}
              >
                {message ? String(message) : field.help}
              </span>
            </div>
          )
        })}
      </fieldset>
      {note && (
        <p className="form-note">
          <AlertCircle size={16} />
          {note}
        </p>
      )}
      {!!error && <Aviso tipo="error">{mensajeError(error)}</Aviso>}
      <footer className="form-actions">
        <button
          className="button secondary"
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancelar
        </button>
        <button
          className="button primary"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting && <LoaderCircle className="spin" size={17} />}
          {isSubmitting ? 'Guardando…' : submit}
        </button>
      </footer>
    </form>
  )
}
export function Confirmar({
  title,
  description,
  action = 'Confirmar',
  onConfirm,
  onClose,
  danger = false,
}: {
  title: string
  description: string
  action?: string
  onConfirm: () => Promise<void>
  onClose: () => void
  danger?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  return (
    <Modal
      title={title}
      description={description}
      onClose={onClose}
      busy={busy}
    >
      {!!error && <Aviso tipo="error">{mensajeError(error)}</Aviso>}
      <footer className="form-actions">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          Volver
        </button>
        <button
          className={`button ${danger ? 'danger' : 'primary'}`}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await onConfirm()
              onClose()
            } catch (error) {
              setError(error)
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy && <LoaderCircle className="spin" size={16} />}
          {busy ? 'Procesando…' : action}
        </button>
      </footer>
    </Modal>
  )
}

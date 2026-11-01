import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen,
  Eye,
  FileText,
  Pencil,
  Plus,
  Receipt,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { z } from 'zod'
import {
  Aviso,
  Consulta,
  Estado,
  Formulario,
  Modal,
  Paginacion,
  Tabla,
  Titulo,
  Vacio,
} from '../components/ui'
import { api, consulta } from '../lib/api'
import { mensajeError } from '../lib/api-error'
import { fecha, fechaManagua } from '../lib/format'
import { useAcciones } from '../lib/hooks'
import {
  centavosContables,
  dineroContable,
  fechaContableValida,
  nombresGruposCuenta,
  nombresTiposCuenta,
  tiposCuenta,
  totalesPartidas,
  validarPartidas,
  type AsientoContable,
  type BalanceGeneral,
  type BalanzaComprobacion,
  type CuentaContable,
  type EstadoResultados,
  type NuevoAsientoContable,
  type NuevoGastoContable,
  type PartidaEditable,
  type SaldoCuentaContable,
  type TipoCuenta,
} from '../lib/contabilidad'
import type { Paginado } from '../types'
import './Contabilidad.css'

const base = '/api/accounting'
const claves = [
  'contabilidad-cuentas',
  'contabilidad-diario',
  'contabilidad-reportes',
]
const cuentaSchema = z
  .object({
    codigo: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9.-]{0,19}$/,
        'Empieza con una letra o número y usa hasta 20 caracteres, puntos o guiones.',
      ),
    nombre: z.string().trim().min(1, 'Escribe el nombre.').max(120),
    tipo: z.enum(tiposCuenta),
    naturaleza: z.enum(['DEUDORA', 'ACREEDORA']),
    clasificacion: z.enum(['CORRIENTE', 'NO_CORRIENTE', 'NO_APLICA']),
    activo: z.enum(['true', 'false']),
  })
  .refine(
    (value) =>
      ['ACTIVO', 'PASIVO'].includes(value.tipo)
        ? value.clasificacion !== 'NO_APLICA'
        : value.clasificacion === 'NO_APLICA',
    {
      path: ['clasificacion'],
      message:
        'Activos y pasivos se clasifican como corrientes o no corrientes; las demás cuentas usan No aplica.',
    },
  )

function CabeceraAsiento({ asiento }: { asiento: AsientoContable }) {
  return (
    <div className="accounting-entry-heading">
      <span className="subtle-pill">Asiento #{asiento.id}</span>
      <strong>{fecha(asiento.fecha)}</strong>
      <span>{asiento.concepto}</span>
    </div>
  )
}

function PartidasAsiento({ asiento }: { asiento: AsientoContable }) {
  return (
    <div className="table-scroll accounting-entry-table">
      <table>
        <caption className="sr-only">Partidas del asiento {asiento.id}</caption>
        <thead>
          <tr>
            <th scope="col">CUENTA</th>
            <th scope="col">DETALLE</th>
            <th scope="col" className="accounting-amount">
              DEBE
            </th>
            <th scope="col" className="accounting-amount">
              HABER
            </th>
          </tr>
        </thead>
        <tbody>
          {asiento.partidas.map((p, index) => (
            <tr key={`${p.cuentaId}-${index}`}>
              <td>
                <strong>{p.codigo}</strong> · {p.nombre}
              </td>
              <td>{p.detalle || '—'}</td>
              <td className="accounting-amount">{dineroContable(p.debe)}</td>
              <td className="accounting-amount">{dineroContable(p.haber)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>
              TOTAL
            </th>
            <td className="accounting-amount">
              {dineroContable(asiento.totalDebe)}
            </td>
            <td className="accounting-amount">
              {dineroContable(asiento.totalHaber)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export function Contabilidad() {
  const hoy = fechaManagua()
  const [seccion, setSeccion] = useState<
    'diario' | 'gastos' | 'cuentas' | 'reportes'
  >('diario')
  const [desde, setDesde] = useState(`${hoy.slice(0, 7)}-01`)
  const [hasta, setHasta] = useState(hoy)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState<'asiento' | 'gasto' | 'cuenta' | null>(
    null,
  )
  const [cuenta, setCuenta] = useState<CuentaContable | null>(null)
  const [detalle, setDetalle] = useState<AsientoContable | null>(null)
  const [reversion, setReversion] = useState<AsientoContable | null>(null)
  const [inicializando, setInicializando] = useState(false)
  const [errorInicio, setErrorInicio] = useState<unknown>(null)
  const { ejecutar, aviso, cerrarAviso } = useAcciones(claves)
  const cuentas = useQuery({
    queryKey: ['contabilidad-cuentas'],
    queryFn: ({ signal }) =>
      api<CuentaContable[]>(`${base}/accounts`, { signal }),
  })
  const fechasValidas =
    fechaContableValida(desde) && fechaContableValida(hasta) && desde <= hasta
  const path = consulta(`${base}/journal`, {
    desde,
    hasta,
    search,
    page,
    pageSize: 10,
  })
  const diario = useQuery({
    queryKey: ['contabilidad-diario', path],
    queryFn: ({ signal }) => api<Paginado<AsientoContable>>(path, { signal }),
    enabled: seccion === 'diario' && fechasValidas,
  })
  const disponibles = cuentas.data?.filter((c) => c.activo) ?? []
  const cambiarFecha = (tipo: 'desde' | 'hasta', value: string) => {
    ;(tipo === 'desde' ? setDesde : setHasta)(value)
    setPage(1)
  }
  const guardarDocumento = async (
    body: NuevoAsientoContable | NuevoGastoContable,
    gasto = false,
  ) => {
    await ejecutar(
      `${base}/${gasto ? 'expenses' : 'journal'}`,
      body,
      'POST',
      gasto
        ? 'El gasto quedó registrado en el libro diario.'
        : 'El asiento quedó contabilizado.',
    )
    setEditor(null)
    setSeccion('diario')
    setDesde(body.fecha)
    setHasta(body.fecha)
    setSearch('')
    setPage(1)
  }
  return (
    <>
      <Titulo
        eyebrow="ADMINISTRACIÓN / CONTABILIDAD"
        title="Contabilidad"
        description="Registra los movimientos diarios de tu agencia y consulta sus estados financieros en córdobas."
        action={
          <div className="accounting-actions">
            <button
              className="button secondary"
              onClick={() => setEditor('asiento')}
              disabled={disponibles.length < 2}
            >
              <Plus size={17} />
              Nuevo asiento
            </button>
            <button
              className="button primary"
              onClick={() => setEditor('gasto')}
              disabled={!disponibles.length}
            >
              <Receipt size={17} />
              Registrar gasto
            </button>
          </div>
        }
      />
      {aviso && (
        <Aviso tipo="success" onClose={cerrarAviso}>
          {aviso}
        </Aviso>
      )}
      <nav className="accounting-tabs" aria-label="Secciones de contabilidad">
        {(
          [
            ['diario', 'Libro diario', BookOpen],
            ['gastos', 'Gastos diarios', Receipt],
            ['cuentas', 'Plan de cuentas', FileText],
            ['reportes', 'Estados financieros', FileText],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            className={`button ${seccion === id ? 'primary' : 'secondary'}`}
            aria-pressed={seccion === id}
            onClick={() => setSeccion(id)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>
      <Consulta query={cuentas}>
        {!cuentas.data?.length && (
          <section className="panel">
            <Vacio
              title="Comienza con tu plan de cuentas"
              description="Crea las cuentas de activos, pasivos, patrimonio, ingresos, costos y gastos. El plan inicial contiene cuentas sin movimientos ni saldos inventados."
              action={
                <button
                  className="button primary"
                  disabled={inicializando}
                  onClick={async () => {
                    setInicializando(true)
                    setErrorInicio(null)
                    try {
                      await ejecutar(
                        `${base}/accounts/initialize`,
                        undefined,
                        'POST',
                        'El plan inicial de cuentas está disponible.',
                      )
                      setSeccion('cuentas')
                    } catch (error) {
                      setErrorInicio(error)
                    } finally {
                      setInicializando(false)
                    }
                  }}
                >
                  {inicializando
                    ? 'Preparando…'
                    : 'Crear plan de cuentas inicial'}
                </button>
              }
            />
            {!!errorInicio && (
              <Aviso tipo="error">{mensajeError(errorInicio)}</Aviso>
            )}
          </section>
        )}
        {seccion === 'cuentas' && (
          <section className="panel">
            <div className="panel-section-heading">
              <div>
                <h2>Plan de cuentas</h2>
                <p>
                  La clasificación de cada cuenta determina cómo aparece en los
                  estados financieros.
                </p>
              </div>
              <button
                className="button secondary"
                onClick={() => {
                  setCuenta(null)
                  setEditor('cuenta')
                }}
              >
                <Plus size={17} />
                Nueva cuenta
              </button>
            </div>
            <Tabla
              caption="Plan de cuentas contables"
              rows={cuentas.data ?? []}
              columns={[
                {
                  titulo: 'CÓDIGO',
                  render: (c) => <strong>{c.codigo}</strong>,
                },
                { titulo: 'CUENTA', render: (c) => c.nombre },
                { titulo: 'TIPO', render: (c) => nombresTiposCuenta[c.tipo] },
                {
                  titulo: 'CLASIFICACIÓN',
                  render: (c) => nombresGruposCuenta[c.clasificacion],
                },
                {
                  titulo: 'NATURALEZA',
                  render: (c) =>
                    c.naturaleza === 'DEUDORA' ? 'Deudora' : 'Acreedora',
                },
                {
                  titulo: 'ESTADO',
                  render: (c) => <Estado valor={c.activo} />,
                },
                {
                  titulo: 'ACCIONES',
                  render: (c) => (
                    <button
                      className="icon-button"
                      aria-label={`Editar cuenta ${c.codigo}`}
                      onClick={() => {
                        setCuenta(c)
                        setEditor('cuenta')
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                  ),
                },
              ]}
            />
          </section>
        )}
      </Consulta>
      {seccion === 'diario' && (
        <section className="panel">
          <div className="panel-section-heading">
            <div>
              <h2>Libro diario</h2>
              <p>
                Los asientos contabilizados se conservan. Una corrección se
                registra mediante una reversión y un nuevo asiento.
              </p>
            </div>
            <span className="subtle-pill">Moneda: NIO · C$</span>
          </div>
          <div className="accounting-filters">
            <label>
              Desde
              <input
                type="date"
                value={desde}
                onChange={(e) => cambiarFecha('desde', e.target.value)}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                value={hasta}
                onChange={(e) => cambiarFecha('hasta', e.target.value)}
              />
            </label>
            <label className="accounting-search">
              Buscar concepto o referencia
              <input
                type="search"
                value={search}
                maxLength={100}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Ej. alquiler, combustible, factura…"
              />
            </label>
          </div>
          {!fechasValidas ? (
            <Aviso tipo="error">
              Selecciona un rango de fechas válido; la fecha inicial no puede
              superar la final.
            </Aviso>
          ) : (
            <Consulta query={diario}>
              <Tabla
                caption="Libro diario de la agencia"
                rows={diario.data?.items ?? []}
                columns={[
                  {
                    titulo: 'FECHA / NÚMERO',
                    render: (a) => (
                      <div className="stack-cell">
                        <strong>{fecha(a.fecha)}</strong>
                        <small>Asiento #{a.id}</small>
                      </div>
                    ),
                  },
                  {
                    titulo: 'CONCEPTO',
                    render: (a) => (
                      <div className="stack-cell">
                        <strong>{a.concepto}</strong>
                        <small>
                          {a.referencia || 'Sin referencia'}
                          {a.reversionDeId
                            ? ` · Revierte #${a.reversionDeId}`
                            : ''}
                          {a.revertidoPorId
                            ? ` · Revertido por #${a.revertidoPorId}`
                            : ''}
                        </small>
                      </div>
                    ),
                  },
                  {
                    titulo: 'DEBE',
                    className: 'accounting-amount',
                    render: (a) => dineroContable(a.totalDebe),
                  },
                  {
                    titulo: 'HABER',
                    className: 'accounting-amount',
                    render: (a) => dineroContable(a.totalHaber),
                  },
                  {
                    titulo: 'ACCIONES',
                    render: (a) => (
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label={`Ver asiento ${a.id}`}
                          onClick={() => setDetalle(a)}
                        >
                          <Eye size={17} />
                        </button>
                        {!a.revertidoPorId && !a.reversionDeId && (
                          <button
                            className="icon-button"
                            aria-label={`Revertir asiento ${a.id}`}
                            onClick={() => setReversion(a)}
                          >
                            <RotateCcw size={17} />
                          </button>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
              {diario.data && (
                <Paginacion
                  total={diario.data.total}
                  page={page}
                  onChange={setPage}
                />
              )}
            </Consulta>
          )}
        </section>
      )}
      {seccion === 'gastos' && (
        <section className="panel">
          <div className="panel-section-heading">
            <div>
              <h2>Registro de gastos diarios</h2>
              <p>
                Registra alquiler, transporte, servicios y otros desembolsos con
                su cuenta de gasto y su contrapartida.
              </p>
            </div>
          </div>
          <div className="accounting-explanation">
            <Receipt size={27} />
            <div>
              <h3>Cada gasto queda respaldado por un asiento</h3>
              <p>
                El importe se carga a la cuenta de costo o gasto y se abona a
                caja, banco o una obligación por pagar. Puedes registrar el
                número de recibo o factura como referencia.
              </p>
              <button
                className="button primary"
                disabled={!disponibles.length}
                onClick={() => setEditor('gasto')}
              >
                Registrar gasto diario
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  setDesde(hoy)
                  setHasta(hoy)
                  setSearch('')
                  setPage(1)
                  setSeccion('diario')
                }}
              >
                Consultar movimientos del día
              </button>
            </div>
          </div>
          <Aviso>
            Para que los estados financieros reflejen toda la empresa, registra
            también ingresos, saldos de apertura, activos, deudas y aportes
            mediante Nuevo asiento. Los cobros de paquetería no se contabilizan
            automáticamente.
          </Aviso>
        </section>
      )}
      {seccion === 'reportes' && <ReportesContables />}
      {editor === 'asiento' && (
        <Modal
          title="Nuevo asiento contable"
          description="Registra las partidas en córdobas. La suma del debe debe ser igual a la del haber."
          onClose={() => setEditor(null)}
        >
          <FormularioAsiento
            cuentas={disponibles}
            onSave={(body) => guardarDocumento(body)}
            onCancel={() => setEditor(null)}
          />
        </Modal>
      )}
      {editor === 'gasto' && (
        <Modal
          title="Registrar gasto diario"
          description="Se contabilizará un asiento equilibrado en el libro diario de tu agencia."
          onClose={() => setEditor(null)}
        >
          <FormularioGasto
            cuentas={disponibles}
            onSave={(body) => guardarDocumento(body, true)}
            onCancel={() => setEditor(null)}
          />
        </Modal>
      )}
      {editor === 'cuenta' && (
        <Modal
          title={cuenta ? 'Editar cuenta contable' : 'Nueva cuenta contable'}
          description="Las cuentas con movimientos conservan su identidad y clasificación. Puedes cambiar su nombre o desactivarlas."
          onClose={() => setEditor(null)}
        >
          <Formulario
            schema={cuentaSchema}
            defaults={{
              codigo: cuenta?.codigo ?? '',
              nombre: cuenta?.nombre ?? '',
              tipo: cuenta?.tipo ?? 'GASTO',
              clasificacion: cuenta?.clasificacion ?? 'NO_APLICA',
              naturaleza: cuenta?.naturaleza ?? 'DEUDORA',
              activo: String(cuenta?.activo ?? true),
            }}
            fields={[
              { name: 'codigo', label: 'Código', maxLength: 20 },
              { name: 'nombre', label: 'Nombre de la cuenta', maxLength: 120 },
              {
                name: 'tipo',
                label: 'Tipo',
                type: 'select',
                options: tiposCuenta.map((value) => ({
                  value,
                  label: nombresTiposCuenta[value],
                })),
              },
              {
                name: 'clasificacion',
                label: 'Clasificación',
                type: 'select',
                options: Object.entries(nombresGruposCuenta).map(
                  ([value, label]) => ({ value, label }),
                ),
              },
              {
                name: 'naturaleza',
                label: 'Naturaleza',
                type: 'select',
                options: [
                  { value: 'DEUDORA', label: 'Deudora' },
                  { value: 'ACREEDORA', label: 'Acreedora' },
                ],
                help: 'La naturaleza acreedora permite cuentas correctoras del activo, como depreciación acumulada.',
              },
              {
                name: 'activo',
                label: 'Estado',
                type: 'select',
                options: [
                  { value: 'true', label: 'Activa' },
                  { value: 'false', label: 'Inactiva' },
                ],
              },
            ]}
            onCancel={() => setEditor(null)}
            onSubmit={async (v) => {
              await ejecutar(
                `${base}/accounts${cuenta ? `/${cuenta.id}` : ''}`,
                { ...v, activo: v.activo === 'true' },
                cuenta ? 'PUT' : 'POST',
              )
              setEditor(null)
            }}
          />
        </Modal>
      )}
      {detalle && (
        <Modal
          title={`Detalle del asiento #${detalle.id}`}
          onClose={() => setDetalle(null)}
        >
          <CabeceraAsiento asiento={detalle} />
          {detalle.referencia && <p>Referencia: {detalle.referencia}</p>}
          <PartidasAsiento asiento={detalle} />
          <p className="form-note">
            Registrado el {fecha(detalle.creadoEn, true)}. Los importes
            corresponden a córdobas.
          </p>
        </Modal>
      )}
      {reversion && (
        <Modal
          title={`Revertir asiento #${reversion.id}`}
          description="Se conservará el original y se registrará un contraasiento con los importes invertidos. Elige la fecha que debe afectar a los reportes."
          onClose={() => setReversion(null)}
        >
          <Formulario
            schema={z.object({
              fecha: z
                .string()
                .refine(
                  (v) =>
                    fechaContableValida(v) &&
                    v >= reversion.fecha &&
                    v <= fechaManagua(),
                  'Usa una fecha entre la del asiento y hoy.',
                ),
              motivo: z.string().trim().min(1, 'Escribe el motivo.').max(300),
            })}
            defaults={{ fecha: hoy, motivo: '' }}
            fields={[
              {
                name: 'fecha',
                label: 'Fecha de la reversión',
                type: 'date',
                min: reversion.fecha,
              },
              {
                name: 'motivo',
                label: 'Motivo de la reversión',
                wide: true,
                maxLength: 300,
              },
            ]}
            submit="Registrar contraasiento"
            onCancel={() => setReversion(null)}
            onSubmit={async (body) => {
              await ejecutar(`${base}/journal/${reversion.id}/reverse`, body)
              setReversion(null)
            }}
          />
        </Modal>
      )}
    </>
  )
}

function CamposDocumento({
  fecha: dia,
  concepto,
  referencia,
  onFecha,
  onConcepto,
  onReferencia,
}: {
  fecha: string
  concepto: string
  referencia: string
  onFecha: (value: string) => void
  onConcepto: (value: string) => void
  onReferencia: (value: string) => void
}) {
  return (
    <div className="form-grid">
      <label className="field">
        Fecha
        <input
          type="date"
          value={dia}
          max={fechaManagua()}
          onChange={(e) => onFecha(e.target.value)}
          required
        />
      </label>
      <label className="field">
        Comprobante o referencia (opcional)
        <input
          value={referencia}
          maxLength={100}
          onChange={(e) => onReferencia(e.target.value)}
          placeholder="Número de recibo o factura"
        />
      </label>
      <label className="field field-wide">
        Concepto
        <input
          value={concepto}
          maxLength={500}
          onChange={(e) => onConcepto(e.target.value)}
          placeholder="Describe el movimiento de la empresa"
          required
        />
      </label>
    </div>
  )
}

function validarDocumento(dia: string, concepto: string) {
  if (!fechaContableValida(dia) || dia > fechaManagua())
    return 'Selecciona una fecha válida que no sea futura.'
  if (!concepto.trim()) return 'Escribe el concepto del movimiento.'
  if (concepto.trim().length > 500)
    return 'El concepto admite hasta 500 caracteres.'
  return null
}

export function FormularioAsiento({
  cuentas,
  onSave,
  onCancel,
}: {
  cuentas: CuentaContable[]
  onSave: (body: NuevoAsientoContable) => Promise<void>
  onCancel: () => void
}) {
  const [dia, setDia] = useState(fechaManagua())
  const [concepto, setConcepto] = useState('')
  const [referencia, setReferencia] = useState('')
  const nueva = (): PartidaEditable => ({
    cuentaId: '',
    descripcion: '',
    debe: '',
    haber: '',
  })
  const [partidas, setPartidas] = useState<PartidaEditable[]>([
    nueva(),
    nueva(),
  ])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const totals = totalesPartidas(partidas)
  const actualizar = (
    index: number,
    field: keyof PartidaEditable,
    value: string,
  ) =>
    setPartidas((previous) =>
      previous.map((line, i) =>
        i === index ? { ...line, [field]: value } : line,
      ),
    )
  const guardar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const invalid = validarDocumento(dia, concepto) || validarPartidas(partidas)
    if (invalid) {
      setError(invalid)
      return
    }
    if (
      partidas.some(
        (p) => !cuentas.some((c) => c.id === Number(p.cuentaId) && c.activo),
      )
    ) {
      setError('Selecciona únicamente cuentas activas de tu agencia.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSave({
        fecha: dia,
        concepto: concepto.trim(),
        referencia: referencia.trim() || null,
        partidas: partidas.map((p) => ({
          cuentaId: Number(p.cuentaId),
          debe: (centavosContables(p.debe || '0') ?? 0) / 100,
          haber: (centavosContables(p.haber || '0') ?? 0) / 100,
          detalle: p.descripcion.trim() || null,
        })),
      })
    } catch (error) {
      setError(mensajeError(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form noValidate onSubmit={(event) => void guardar(event)}>
      <fieldset disabled={busy} className="accounting-fieldset">
        <CamposDocumento
          fecha={dia}
          concepto={concepto}
          referencia={referencia}
          onFecha={setDia}
          onConcepto={setConcepto}
          onReferencia={setReferencia}
        />
        <div className="accounting-lines">
          {partidas.map((p, index) => (
            <section
              className="accounting-line"
              key={index}
              aria-label={`Partida ${index + 1}`}
            >
              <div className="accounting-line-title">
                <strong>Partida {index + 1}</strong>
                <button
                  className="icon-button"
                  type="button"
                  disabled={partidas.length <= 2}
                  aria-label={`Quitar partida ${index + 1}`}
                  onClick={() =>
                    setPartidas((previous) =>
                      previous.filter((_, i) => i !== index),
                    )
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <label className="field">
                Cuenta {index + 1}
                <select
                  value={p.cuentaId}
                  onChange={(e) =>
                    actualizar(index, 'cuentaId', e.target.value)
                  }
                >
                  <option value="">Seleccionar cuenta…</option>
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo} · {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <div className="accounting-line-amounts">
                <label className="field">
                  Debe {index + 1}
                  <input
                    inputMode="decimal"
                    value={p.debe}
                    maxLength={15}
                    onChange={(e) => actualizar(index, 'debe', e.target.value)}
                    placeholder="0.00"
                  />
                </label>
                <label className="field">
                  Haber {index + 1}
                  <input
                    inputMode="decimal"
                    value={p.haber}
                    maxLength={15}
                    onChange={(e) => actualizar(index, 'haber', e.target.value)}
                    placeholder="0.00"
                  />
                </label>
              </div>
              <label className="field">
                Detalle {index + 1} (opcional)
                <input
                  maxLength={300}
                  value={p.descripcion}
                  onChange={(e) =>
                    actualizar(index, 'descripcion', e.target.value)
                  }
                />
              </label>
            </section>
          ))}
        </div>
        <button
          type="button"
          className="button secondary"
          disabled={partidas.length >= 100}
          onClick={() => setPartidas((previous) => [...previous, nueva()])}
        >
          <Plus size={16} />
          Agregar partida
        </button>
      </fieldset>
      <div
        className={`accounting-totals ${totals?.cuadrado ? 'accounting-balanced' : ''}`}
        aria-live="polite"
      >
        <span>Debe: {dineroContable(Number(totals?.debe ?? 0n) / 100)}</span>
        <span>Haber: {dineroContable(Number(totals?.haber ?? 0n) / 100)}</span>
        <strong>
          {totals?.cuadrado ? 'Asiento cuadrado' : 'Pendiente de cuadrar'}
        </strong>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <footer className="form-actions">
        <button
          type="button"
          className="button secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Cancelar
        </button>
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? 'Contabilizando…' : 'Contabilizar asiento'}
        </button>
      </footer>
    </form>
  )
}

export function FormularioGasto({
  cuentas,
  onSave,
  onCancel,
}: {
  cuentas: CuentaContable[]
  onSave: (body: NuevoGastoContable) => Promise<void>
  onCancel: () => void
}) {
  const [dia, setDia] = useState(fechaManagua())
  const [concepto, setConcepto] = useState('')
  const [referencia, setReferencia] = useState('')
  const [gastoId, setGastoId] = useState('')
  const [contrapartidaId, setContrapartidaId] = useState('')
  const [monto, setMonto] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const gastos = cuentas.filter(
    (c) =>
      c.activo &&
      ['COSTO', 'GASTO'].includes(c.tipo) &&
      c.naturaleza === 'DEUDORA',
  )
  const contrapartidas = cuentas.filter(
    (c) => c.activo && ['ACTIVO', 'PASIVO'].includes(c.tipo),
  )
  const guardar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const invalid = validarDocumento(dia, concepto)
    const cents = centavosContables(monto)
    if (invalid) {
      setError(invalid)
      return
    }
    if (
      !gastos.some((c) => c.id === Number(gastoId)) ||
      !contrapartidas.some((c) => c.id === Number(contrapartidaId))
    ) {
      setError(
        'Selecciona una cuenta de costo o gasto y una contrapartida activa.',
      )
      return
    }
    if (cents === null || cents <= 0) {
      setError(
        'Escribe un importe mayor que cero, con punto y hasta dos decimales.',
      )
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSave({
        fecha: dia,
        concepto: concepto.trim(),
        referencia: referencia.trim() || null,
        cuentaGastoId: Number(gastoId),
        contrapartidaId: Number(contrapartidaId),
        monto: cents / 100,
      })
    } catch (error) {
      setError(mensajeError(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form noValidate onSubmit={(event) => void guardar(event)}>
      <fieldset disabled={busy} className="accounting-fieldset">
        <CamposDocumento
          fecha={dia}
          concepto={concepto}
          referencia={referencia}
          onFecha={setDia}
          onConcepto={setConcepto}
          onReferencia={setReferencia}
        />
        <div className="form-grid">
          <label className="field">
            Cuenta de costo o gasto
            <select
              value={gastoId}
              onChange={(e) => setGastoId(e.target.value)}
            >
              <option value="">Seleccionar gasto…</option>
              {gastos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} · {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Se paga o reconoce contra
            <select
              value={contrapartidaId}
              onChange={(e) => setContrapartidaId(e.target.value)}
            >
              <option value="">Seleccionar caja, banco u obligación…</option>
              {contrapartidas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} · {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Importe en córdobas (NIO)
            <input
              inputMode="decimal"
              value={monto}
              maxLength={15}
              placeholder="0.00"
              onChange={(e) => setMonto(e.target.value)}
            />
          </label>
        </div>
      </fieldset>
      {(!gastos.length || !contrapartidas.length) && (
        <Aviso>
          El plan necesita una cuenta activa de costo o gasto y una cuenta de
          activo o pasivo.
        </Aviso>
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}
      <footer className="form-actions">
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={onCancel}
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="button primary"
          disabled={busy || !gastos.length || !contrapartidas.length}
        >
          {busy ? 'Registrando…' : 'Guardar gasto'}
        </button>
      </footer>
    </form>
  )
}

function ListaSaldos({
  cuentas,
  tipo,
  title,
}: {
  cuentas: SaldoCuentaContable[]
  tipo: TipoCuenta
  title: string
}) {
  const rows = cuentas.filter((c) => c.tipo === tipo)
  return (
    <section className="accounting-statement-section">
      <h3>{title}</h3>
      {!rows.length ? (
        <p className="muted">Sin movimientos.</p>
      ) : (
        <ul>
          {rows.map((c) => (
            <li key={c.cuentaId}>
              <span>
                <strong>{c.codigo}</strong> · {c.nombre}
                {c.clasificacion !== 'NO_APLICA' && (
                  <small>{nombresGruposCuenta[c.clasificacion]}</small>
                )}
              </span>
              <strong className="tabular">{dineroContable(c.saldo)}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Resumen({
  label,
  value,
  destacado = false,
}: {
  label: string
  value: number
  destacado?: boolean
}) {
  return (
    <div
      className={`accounting-report-total ${destacado ? 'accounting-report-total-main' : ''}`}
    >
      <span>{label}</span>
      <strong className="tabular">{dineroContable(value)}</strong>
    </div>
  )
}

export function ReportesContables() {
  const hoy = fechaManagua()
  const [tipo, setTipo] = useState<'balance' | 'resultados' | 'balanza'>(
    'balance',
  )
  const [desde, setDesde] = useState(`${hoy.slice(0, 7)}-01`)
  const [hasta, setHasta] = useState(hoy)
  const fechasValidas =
    fechaContableValida(hasta) &&
    (tipo === 'balance' || (fechaContableValida(desde) && desde <= hasta))
  const balance = useQuery({
    queryKey: ['contabilidad-reportes', 'balance', hasta],
    queryFn: ({ signal }) =>
      api<BalanceGeneral>(consulta(`${base}/balance-sheet`, { asOf: hasta }), {
        signal,
      }),
    enabled: tipo === 'balance' && fechasValidas,
  })
  const resultados = useQuery({
    queryKey: ['contabilidad-reportes', 'resultados', desde, hasta],
    queryFn: ({ signal }) =>
      api<EstadoResultados>(
        consulta(`${base}/income-statement`, { from: desde, to: hasta }),
        { signal },
      ),
    enabled: tipo === 'resultados' && fechasValidas,
  })
  const balanza = useQuery({
    queryKey: ['contabilidad-reportes', 'balanza', desde, hasta],
    queryFn: ({ signal }) =>
      api<BalanzaComprobacion>(
        consulta(`${base}/trial-balance`, { from: desde, to: hasta }),
        { signal },
      ),
    enabled: tipo === 'balanza' && fechasValidas,
  })
  return (
    <section className="panel accounting-report">
      <div className="panel-section-heading">
        <div>
          <h2>Estados financieros</h2>
          <p>
            Se construyen únicamente con los asientos contabilizados de esta
            agencia. Importes en córdobas (NIO).
          </p>
        </div>
      </div>
      <div className="accounting-filters">
        <label>
          Reporte
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as typeof tipo)}
          >
            <option value="balance">Balance general</option>
            <option value="resultados">Estado de resultados</option>
            <option value="balanza">Balanza de comprobación</option>
          </select>
        </label>
        {tipo !== 'balance' && (
          <label>
            Desde
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </label>
        )}
        <label>
          {tipo === 'balance' ? 'Fecha de corte' : 'Hasta'}
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </label>
      </div>
      {!fechasValidas ? (
        <Aviso tipo="error">
          Selecciona fechas válidas y un rango ordenado.
        </Aviso>
      ) : (
        <>
          {tipo === 'balance' && (
            <Consulta query={balance}>
              {balance.data && (
                <>
                  <div className="accounting-report-heading">
                    <h3>Balance general</h3>
                    <p>Al {fecha(balance.data.fechaCorte, true)} · NIO</p>
                  </div>
                  <div className="accounting-balance-grid">
                    <div>
                      <ListaSaldos
                        cuentas={balance.data.cuentas}
                        tipo="ACTIVO"
                        title="Activos"
                      />
                      <Resumen
                        label="Total de activos"
                        value={balance.data.totalActivos}
                        destacado
                      />
                    </div>
                    <div>
                      <ListaSaldos
                        cuentas={balance.data.cuentas}
                        tipo="PASIVO"
                        title="Pasivos"
                      />
                      <Resumen
                        label="Total de pasivos"
                        value={balance.data.totalPasivos}
                      />
                      <ListaSaldos
                        cuentas={balance.data.cuentas}
                        tipo="PATRIMONIO"
                        title="Patrimonio"
                      />
                      <Resumen
                        label="Capital y reservas"
                        value={balance.data.capitalYReservas}
                      />
                      <Resumen
                        label="Resultado acumulado"
                        value={balance.data.resultadoAcumulado}
                      />
                      <Resumen
                        label="Total de patrimonio"
                        value={balance.data.totalPatrimonio}
                      />
                      <Resumen
                        label="Pasivo + patrimonio"
                        value={
                          balance.data.totalPasivos +
                          balance.data.totalPatrimonio
                        }
                        destacado
                      />
                    </div>
                  </div>
                  <Aviso tipo={balance.data.cuadrado ? 'success' : 'error'}>
                    {balance.data.cuadrado
                      ? 'El balance cuadra: activo = pasivo + patrimonio.'
                      : `El balance tiene una diferencia de ${dineroContable(balance.data.diferencia)}. Revisa los asientos.`}
                  </Aviso>
                  <p className="page-hint">
                    El resultado acumulado incluye los ingresos, costos y gastos
                    hasta la fecha de corte. Las cuentas correctoras se
                    presentan con su signo.
                  </p>
                </>
              )}
            </Consulta>
          )}
          {tipo === 'resultados' && (
            <Consulta query={resultados}>
              {resultados.data && (
                <>
                  <div className="accounting-report-heading">
                    <h3>Estado de resultados</h3>
                    <p>
                      Del {fecha(resultados.data.desde)} al{' '}
                      {fecha(resultados.data.hasta)} · NIO
                    </p>
                  </div>
                  <ListaSaldos
                    cuentas={resultados.data.cuentas}
                    tipo="INGRESO"
                    title="Ingresos"
                  />
                  <Resumen
                    label="Total de ingresos"
                    value={resultados.data.ingresos}
                  />
                  <ListaSaldos
                    cuentas={resultados.data.cuentas}
                    tipo="COSTO"
                    title="Costos"
                  />
                  <Resumen
                    label="Total de costos"
                    value={resultados.data.costos}
                  />
                  <Resumen
                    label="Utilidad bruta"
                    value={resultados.data.utilidadBruta}
                    destacado
                  />
                  <ListaSaldos
                    cuentas={resultados.data.cuentas}
                    tipo="GASTO"
                    title="Gastos"
                  />
                  <Resumen
                    label="Total de gastos"
                    value={resultados.data.gastos}
                  />
                  <Resumen
                    label="Resultado neto del período"
                    value={resultados.data.resultadoNeto}
                    destacado
                  />
                </>
              )}
            </Consulta>
          )}
          {tipo === 'balanza' && (
            <Consulta query={balanza}>
              {balanza.data && (
                <>
                  <div className="accounting-report-heading">
                    <h3>Balanza de comprobación</h3>
                    <p>
                      Del {fecha(balanza.data.desde)} al{' '}
                      {fecha(balanza.data.hasta)} · NIO
                    </p>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <caption className="sr-only">
                        Balanza de comprobación
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">CUENTA</th>
                          <th scope="col">SALDO INICIAL</th>
                          <th scope="col">DEBE</th>
                          <th scope="col">HABER</th>
                          <th scope="col">SALDO DEUDOR</th>
                          <th scope="col">SALDO ACREEDOR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {balanza.data.cuentas.map((c) => (
                          <tr key={c.cuentaId}>
                            <td>
                              {c.codigo} · {c.nombre}
                            </td>
                            <td className="accounting-amount">
                              {dineroContable(c.saldoInicial)}
                            </td>
                            <td className="accounting-amount">
                              {dineroContable(c.debe)}
                            </td>
                            <td className="accounting-amount">
                              {dineroContable(c.haber)}
                            </td>
                            <td className="accounting-amount">
                              {dineroContable(c.saldoDeudor)}
                            </td>
                            <td className="accounting-amount">
                              {dineroContable(c.saldoAcreedor)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th scope="row" colSpan={2}>
                            TOTAL
                          </th>
                          <td className="accounting-amount">
                            {dineroContable(balanza.data.totalDebe)}
                          </td>
                          <td className="accounting-amount">
                            {dineroContable(balanza.data.totalHaber)}
                          </td>
                          <td className="accounting-amount">
                            {dineroContable(balanza.data.totalSaldoDeudor)}
                          </td>
                          <td className="accounting-amount">
                            {dineroContable(balanza.data.totalSaldoAcreedor)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <Aviso tipo={balanza.data.cuadrado ? 'success' : 'error'}>
                    {balanza.data.cuadrado
                      ? 'Los movimientos y saldos deudores y acreedores cuadran.'
                      : 'La balanza presenta diferencias. Revisa los asientos y saldos iniciales.'}
                  </Aviso>
                </>
              )}
            </Consulta>
          )}
        </>
      )}
    </section>
  )
}

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Ban, Plane, Plus, Ship } from 'lucide-react'
import { useSesion } from '../auth/session'
import {
  Aviso,
  Confirmar,
  Consulta,
  Estado,
  Formulario,
  Modal,
  Tabla,
  Titulo,
} from '../components/ui'
import { api, consulta } from '../lib/api'
import { dinero, fecha, fechaManagua } from '../lib/format'
import { useAcciones, useFiltros } from '../lib/hooks'
import { tarifaSchema } from '../lib/schemas'
import type { Tarifa, TarifaActual } from '../types'

export function TarjetaTarifa({ actual }: { actual: TarifaActual }) {
  const aereo = actual.metodoEnvio.codigo === 'AEREO'
  const Icon = aereo ? Plane : Ship
  return (
    <article className={`rate-card ${aereo ? 'rate-air' : 'rate-sea'}`}>
      <div className="rate-card-top">
        <span className="rate-icon">
          <Icon size={21} />
        </span>
        <Estado valor={actual.tarifa ? 'VIGENTE' : 'INACTIVO'} />
      </div>
      <span className="rate-label">
        ENVÍO {actual.metodoEnvio.nombre.toLocaleUpperCase('es')}
      </span>
      <div className="rate-price">
        {actual.tarifa ? dinero(actual.tarifa.precioPorUnidad) : 'Sin tarifa'}
        {actual.tarifa && <span>USD / lb</span>}
      </div>
      <div className="rate-card-bottom">
        <span>
          {actual.tarifa
            ? `Desde el ${fecha(actual.tarifa.fechaInicio)}`
            : 'Registra una tarifa para comenzar a pesar.'}
        </span>
        <ArrowUpRight size={16} />
      </div>
    </article>
  )
}
export function Tarifas() {
  const { usuario } = useSesion()
  const admin = usuario?.roles.includes('ADMIN')
  const filtros = useFiltros()
  const [editor, setEditor] = useState(false)
  const [anular, setAnular] = useState<Tarifa | null>(null)
  const { ejecutar, aviso, cerrarAviso } = useAcciones([
    'tarifas',
    'tarifas-actuales',
  ])
  const actuales = useQuery({
    queryKey: ['tarifas-actuales'],
    queryFn: ({ signal }) =>
      api<TarifaActual[]>('/api/rates/current', { signal }),
  })
  const path = consulta('/api/rates', {
    metodoEnvio: filtros.get('metodoEnvio'),
    incluirAnuladas: filtros.get('anuladas') === 'true',
  })
  const historial = useQuery({
    queryKey: ['tarifas', path],
    queryFn: ({ signal }) => api<Tarifa[]>(path, { signal }),
  })
  return (
    <>
      <Titulo
        eyebrow="PRECIOS CLAROS, ENVÍOS CON CONFIANZA"
        title="Tarifas de envío"
        description="Consulta los precios vigentes y planifica los próximos cambios."
        action={
          admin && (
            <button className="button primary" onClick={() => setEditor(true)}>
              <Plus size={18} />
              Nueva tarifa
            </button>
          )
        }
      />
      {aviso && (
        <Aviso tipo="success" onClose={cerrarAviso}>
          {aviso}
        </Aviso>
      )}
      <Consulta query={actuales}>
        <div className="rates-grid">
          {actuales.data?.map((a) => (
            <TarjetaTarifa actual={a} key={a.metodoEnvio.codigo} />
          ))}
        </div>
      </Consulta>
      <section className="panel">
        <div className="panel-section-heading">
          <div>
            <h2>Historial de tarifas</h2>
            <p>Cada tarifa conserva su vigencia y el precio aplicado.</p>
          </div>
          <div className="filter-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={filtros.get('anuladas') === 'true'}
                onChange={(e) =>
                  filtros.set('anuladas', String(e.target.checked))
                }
              />
              Incluir anuladas
            </label>
            <select
              aria-label="Método de envío"
              value={filtros.get('metodoEnvio')}
              onChange={(e) => filtros.set('metodoEnvio', e.target.value)}
            >
              <option value="">Todos los métodos</option>
              <option value="AEREO">Aéreo</option>
              <option value="MARITIMO">Marítimo</option>
            </select>
          </div>
        </div>
        <Consulta query={historial}>
          <Tabla
            caption="Historial de tarifas de envío"
            rows={historial.data ?? []}
            columns={[
              {
                titulo: 'MÉTODO DE ENVÍO',
                render: (t) => (
                  <span className="method-cell">
                    {t.metodoEnvio.codigo === 'AEREO' ? (
                      <Plane size={17} />
                    ) : (
                      <Ship size={17} />
                    )}
                    <strong>{t.metodoEnvio.nombre}</strong>
                  </span>
                ),
              },
              {
                titulo: 'PRECIO POR LIBRA',
                render: (t) => (
                  <strong className="tabular">
                    {dinero(t.precioPorUnidad)}{' '}
                    <span className="unit">USD</span>
                  </strong>
                ),
              },
              { titulo: 'DESDE', render: (t) => fecha(t.fechaInicio) },
              {
                titulo: 'HASTA',
                render: (t) =>
                  t.fechaFin ? (
                    fecha(t.fechaFin)
                  ) : (
                    <span className="muted">Sin fecha de fin</span>
                  ),
              },
              { titulo: 'ESTADO', render: (t) => <Estado valor={t.estado} /> },
              ...(admin
                ? [
                    {
                      titulo: 'ACCIONES',
                      className: 'actions-column',
                      render: (t: Tarifa) => (
                        <button
                          className="icon-button"
                          title="Anular tarifa"
                          aria-label={`Anular tarifa ${t.id}`}
                          disabled={
                            !['VIGENTE', 'PROGRAMADA'].includes(t.estado)
                          }
                          onClick={() => setAnular(t)}
                        >
                          <Ban size={17} />
                        </button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </Consulta>
      </section>
      <p className="page-hint">
        Las tarifas están en USD por libra. Los cambios no alteran los montos de
        paquetes ya calculados.
      </p>
      {editor && (
        <Modal
          title="Registrar nueva tarifa"
          description="El nuevo precio se aplicará desde la fecha que elijas, en hora de Managua."
          onClose={() => setEditor(false)}
        >
          <Formulario
            schema={tarifaSchema}
            defaults={{
              metodoEnvio: 'AEREO',
              precioPorUnidad: '',
              fechaInicio: fechaManagua(),
            }}
            fields={[
              {
                name: 'metodoEnvio',
                label: 'Método de envío',
                type: 'select',
                options: [
                  { value: 'AEREO', label: 'Aéreo' },
                  { value: 'MARITIMO', label: 'Marítimo' },
                ],
              },
              {
                name: 'precioPorUnidad',
                label: 'Precio por libra (USD)',
                type: 'decimal',
                placeholder: '0.0000',
                help: 'Hasta 4 decimales.',
              },
              {
                name: 'fechaInicio',
                label: 'Fecha de inicio',
                type: 'date',
                min: fechaManagua(),
                wide: true,
              },
            ]}
            note="La tarifa anterior finalizará el día previo. Para corregir un precio, registra una nueva tarifa o anula la que corresponda."
            submit="Registrar tarifa"
            onCancel={() => setEditor(false)}
            onSubmit={async (v) => {
              await ejecutar('/api/rates', {
                ...v,
                precioPorUnidad: Number(v.precioPorUnidad),
              })
              setEditor(false)
            }}
          />
        </Modal>
      )}
      {anular && (
        <Confirmar
          title="Anular tarifa"
          description={`Se anulará la tarifa de ${dinero(anular.precioPorUnidad)} por libra para envío ${anular.metodoEnvio.nombre.toLowerCase()}. Solo se permite si está programada o vigente y no se aplicó a ningún paquete.`}
          action="Anular tarifa"
          danger
          onClose={() => setAnular(null)}
          onConfirm={() =>
            ejecutar(
              `/api/rates/${anular.id}/void`,
              undefined,
              'POST',
              'Tarifa anulada; la vigencia anterior se restableció cuando corresponde.',
            )
          }
        />
      )}
    </>
  )
}

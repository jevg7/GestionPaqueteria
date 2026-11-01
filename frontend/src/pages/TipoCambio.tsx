import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, Pencil, Plus } from 'lucide-react'
import { useSesion } from '../auth/session'
import {
  Aviso,
  Consulta,
  Formulario,
  Modal,
  Titulo,
  Vacio,
} from '../components/ui'
import { api } from '../lib/api'
import { ErrorApi } from '../lib/api-error'
import { decimal, fecha, fechaManagua } from '../lib/format'
import { cambioSchema } from '../lib/schemas'
import { useAcciones } from '../lib/hooks'
import type { TipoCambio as Cambio } from '../types'

export function TipoCambio() {
  const { usuario } = useSesion()
  const admin = usuario?.roles.includes('ADMIN')
  const [editor, setEditor] = useState<Cambio | 'nuevo' | null>(null)
  const { ejecutar, aviso, cerrarAviso } = useAcciones([
    'cambios',
    'cambio-actual',
  ])
  const actual = useQuery({
    queryKey: ['cambio-actual'],
    queryFn: async ({ signal }) => {
      try {
        return await api<Cambio>('/api/exchange-rates/current', { signal })
      } catch (error) {
        if (error instanceof ErrorApi && error.status === 404) return null
        throw error
      }
    },
  })
  const historial = useQuery({
    queryKey: ['cambios'],
    queryFn: ({ signal }) => api<Cambio[]>('/api/exchange-rates', { signal }),
  })
  const editando = editor && editor !== 'nuevo' ? editor : null
  return (
    <>
      <Titulo
        eyebrow="DOS MONEDAS, UNA OPERACIÓN"
        title="Tipo de cambio"
        description="Define la referencia de tu agencia para los pagos en córdobas."
        action={
          admin && (
            <button
              className="button primary"
              onClick={() => setEditor('nuevo')}
            >
              <Plus size={18} />
              Registrar tipo de cambio
            </button>
          )
        }
      />
      {aviso && (
        <Aviso tipo="success" onClose={cerrarAviso}>
          {aviso}
        </Aviso>
      )}
      <Consulta query={actual}>
        {actual.data ? (
          <div className="exchange-hero">
            <div>
              <span className="eyebrow">TIPO DE CAMBIO VIGENTE</span>
              <div className="exchange-value">
                <span>
                  1 <small>USD</small>
                </span>
                <ArrowLeftRight size={25} />
                <span>
                  {decimal(actual.data.nioPorUsd)} <small>NIO</small>
                </span>
              </div>
              <p>
                Registrado para el {fecha(actual.data.fecha, true)} · Hora de
                Managua
              </p>
            </div>
            <span className="currency-symbol">C$</span>
          </div>
        ) : (
          <Aviso>
            No hay un tipo de cambio vigente. El administrador debe registrar
            uno para recibir pagos en córdobas.
          </Aviso>
        )}
      </Consulta>
      <section className="panel">
        <div className="panel-section-heading">
          <div>
            <h2>Historial de tipos de cambio</h2>
            <p>Los últimos 60 registros de tu agencia.</p>
          </div>
          <span className="subtle-pill">NIO por cada USD</span>
        </div>
        <Consulta query={historial}>
          {historial.data?.length ? (
            <div className="table-scroll">
              <table>
                <caption className="sr-only">
                  Historial de tipos de cambio
                </caption>
                <thead>
                  <tr>
                    <th scope="col">FECHA DE APLICACIÓN</th>
                    <th scope="col">TIPO DE CAMBIO</th>
                    <th scope="col">ÚLTIMA ACTUALIZACIÓN</th>
                    {admin && (
                      <th scope="col" className="actions-column">
                        ACCIONES
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {historial.data.map((c) => (
                    <tr key={c.fecha}>
                      <td>
                        <strong>{fecha(c.fecha)}</strong>
                        {c.fecha > fechaManagua() && (
                          <span className="subtle-pill scheduled">
                            Programado
                          </span>
                        )}
                      </td>
                      <td className="tabular">
                        C$ {decimal(c.nioPorUsd)}{' '}
                        <span className="unit">/ USD</span>
                      </td>
                      <td className="muted">{fecha(c.actualizadoEn)}</td>
                      {admin && (
                        <td className="actions-column">
                          <button
                            className="icon-button"
                            title="Corregir tipo de cambio"
                            aria-label={`Corregir tipo de cambio del ${c.fecha}`}
                            onClick={() => setEditor(c)}
                          >
                            <Pencil size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Vacio />
          )}
        </Consulta>
      </section>
      <p className="page-hint">
        Los pagos ya registrados conservan el tipo de cambio que se aplicó al
        cobrarlos.
      </p>
      {editor && (
        <Modal
          title={
            editando ? 'Corregir tipo de cambio' : 'Registrar tipo de cambio'
          }
          description="Se utilizará el registro más reciente cuya fecha sea hoy o anterior, en hora de Managua."
          onClose={() => setEditor(null)}
        >
          <Formulario
            schema={cambioSchema}
            defaults={{
              fecha: editando?.fecha ?? fechaManagua(),
              nioPorUsd: editando ? String(editando.nioPorUsd) : '',
            }}
            fields={[
              {
                name: 'fecha',
                label: 'Fecha de aplicación',
                type: 'date',
                disabled: !!editando,
              },
              {
                name: 'nioPorUsd',
                label: 'Córdobas por 1 USD',
                type: 'decimal',
                placeholder: '36.6243',
                help: 'Mayor que cero, con hasta 4 decimales.',
              },
            ]}
            note="Si ya existe un registro para esa fecha, su valor será reemplazado. Los pagos anteriores se conservan."
            onCancel={() => setEditor(null)}
            onSubmit={async (v) => {
              await ejecutar(
                `/api/exchange-rates/${editando?.fecha ?? v.fecha}`,
                { nioPorUsd: Number(v.nioPorUsd) },
                'PUT',
              )
              setEditor(null)
            }}
          />
        </Modal>
      )}
    </>
  )
}

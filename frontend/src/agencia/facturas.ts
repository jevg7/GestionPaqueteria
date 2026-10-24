import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import type { Path } from 'react-hook-form'
import { z } from 'zod'
import type { Tono } from '../components/Etiqueta.tsx'
import { api, type Pagina } from '../lib/api.ts'
import { aCentavos, cocienteRedondeado, productoRedondeado } from '../lib/dinero.ts'
import { formatearCordobas, formatearDolares, formatearNumero } from '../lib/formato.ts'
import { decimalPositivo, esquemaDeMotivo, textoOpcional } from '../lib/validacion.ts'
import type { ReferenciaCliente } from './clientes.ts'
import { clavePaquetes, type Paquete } from './paquetes.ts'

/** Estado de pago de una factura (v_facturas_saldo): sale de sus pagos aplicados, no se guarda. */
export const estadosDePago = ['PENDIENTE', 'PARCIAL', 'PAGADA', 'ANULADA'] as const
export type EstadoDePago = (typeof estadosDePago)[number]

export const estadosDePagoVisibles: Record<EstadoDePago, { nombre: string; tono: Tono }> = {
  PENDIENTE: { nombre: 'Pendiente', tono: 'ambar' },
  PARCIAL: { nombre: 'Pago parcial', tono: 'azul' },
  PAGADA: { nombre: 'Pagada', tono: 'verde' },
  ANULADA: { nombre: 'Anulada', tono: 'rojo' },
}

export const metodosDePago = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'OTRO'] as const
export type MetodoDePago = (typeof metodosDePago)[number]

export const esMetodoDePago = (valor: string): valor is MetodoDePago => (metodosDePago as readonly string[]).includes(valor)

export const nombresDeMetodoDePago: Record<MetodoDePago, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  TARJETA: 'Tarjeta',
  OTRO: 'Otro',
}

export const monedas = ['USD', 'NIO'] as const
export type Moneda = (typeof monedas)[number]

/** InvoiceSummaryResponse: una factura en la lista, con lo pagado, el saldo y su estado de pago (en USD). */
export type ResumenFactura = {
  id: number
  numeroFactura: string
  cliente: ReferenciaCliente
  fecha: string
  total: number
  pagado: number
  saldo: number
  estado: 'EMITIDA' | 'ANULADA'
  estadoPago: EstadoDePago
}

/** InvoiceLineResponse: una línea por paquete (peso × tarifa aplicada). */
export type LineaDeFactura = {
  id: number
  paqueteId: number | null
  codigoPaquete: string | null
  descripcion: string
  cantidad: number
  precioUnitario: number
  subtotal: number
}

/** PaymentResponse. En córdobas, monto es lo abonado en USD y montoMoneda, lo recibido en córdobas. */
export type Pago = {
  id: number
  facturaId: number
  numeroFactura: string
  monto: number
  moneda: Moneda
  montoMoneda: number | null
  tipoCambioAplicado: number | null
  metodoPago: MetodoDePago
  referencia: string | null
  fecha: string
  estado: 'APLICADO' | 'ANULADO'
  motivoAnulacion: string | null
  anuladoEn: string | null
  usuarioId: number
}

/** InvoiceResponse: comprobante interno en USD, con sus líneas y sus pagos. */
export type Factura = ResumenFactura & {
  moneda: 'USD'
  subtotal: number
  descuento: number
  impuestos: number
  motivoAnulacion: string | null
  anuladaEn: string | null
  usuarioId: number
  lineas: LineaDeFactura[]
  pagos: Pago[]
}

export const TAMANO_DE_PAGINA = 20

/** CreateInvoiceRequest admite hasta 200 paquetes por factura. */
export const MAXIMO_POR_FACTURA = 200

export type FiltrosFacturas = { buscar: string; estadoPago: EstadoDePago | ''; clienteId: number | null; pagina: number }

/** Raíz de las claves de caché de las facturas: invalidarla refresca listas, detalles y las facturas con saldo. */
export const claveFacturas = ['agencia', 'facturas'] as const

export function opcionesListaFacturas({ buscar, estadoPago, clienteId, pagina }: FiltrosFacturas) {
  return queryOptions({
    queryKey: [...claveFacturas, 'lista', { buscar, estadoPago, clienteId, pagina }],
    queryFn: ({ signal }) =>
      api.get<Pagina<ResumenFactura>>('/api/invoices', {
        params: { search: buscar, estadoPago, clienteId, page: pagina, pageSize: TAMANO_DE_PAGINA },
        signal,
      }),
    placeholderData: keepPreviousData,
  })
}

export function opcionesFactura(id: number) {
  return queryOptions({
    queryKey: [...claveFacturas, 'detalle', id],
    queryFn: ({ signal }) => api.get<Factura>(`/api/invoices/${id}`, { signal }),
  })
}

/**
 * Las facturas de un cliente que todavía tienen saldo (pendientes o con pago parcial), completas: sus líneas dicen qué
 * paquetes pendientes de pago ya están facturados. Uno pendiente de pago con factura vigente siempre está en una de
 * estas: al saldarse la factura, sus paquetes pasan a PAGADO.
 */
export function opcionesFacturasConSaldo(clienteId: number) {
  return queryOptions({
    queryKey: [...claveFacturas, 'con-saldo', clienteId],
    queryFn: async ({ signal }) => {
      const paginas = await Promise.all(
        (['PENDIENTE', 'PARCIAL'] as const).map((estadoPago) =>
          api.get<Pagina<ResumenFactura>>('/api/invoices', { params: { clienteId, estadoPago, pageSize: 100 }, signal }),
        ),
      )
      return Promise.all(paginas.flatMap((pagina) => pagina.items).map((resumen) => api.get<Factura>(`/api/invoices/${resumen.id}`, { signal })))
    },
  })
}

/** Los paquetes del cliente pendientes de pago (con y sin factura). Cuelga de las listas de paquetes. */
export function opcionesPaquetesPendientesDePago(clienteId: number) {
  return queryOptions({
    queryKey: [...clavePaquetes, 'lista', 'pendientes-de-pago', clienteId],
    queryFn: ({ signal }) =>
      api.get<Pagina<Paquete>>('/api/packages', { params: { clienteId, estado: 'PENDIENTE_DE_PAGO', page: 1, pageSize: 100 }, signal }),
  })
}

/** paqueteId → la factura con saldo en la que ya está. */
export function facturadosEn(facturas: readonly Factura[]): Map<number, Factura> {
  return new Map(facturas.flatMap((factura) => factura.lineas.flatMap((linea) => (linea.paqueteId === null ? [] : [[linea.paqueteId, factura] as const]))))
}

// Qué se ofrece según el estado (FacturacionService lo vuelve a comprobar y responde 409 con el motivo).
/** Se cobra una factura emitida que tiene saldo. */
export const sePuedePagar = (factura: Pick<ResumenFactura, 'estado' | 'saldo'>) => factura.estado === 'EMITIDA' && factura.saldo > 0

/** Se anula una factura emitida sin pagos aplicados; la API además exige que sus paquetes sigan pendientes de pago. */
export const sePuedeAnular = (factura: Pick<ResumenFactura, 'estado' | 'pagado'>) => factura.estado === 'EMITIDA' && factura.pagado === 0

export const sePuedeAnularElPago = (pago: Pick<Pago, 'estado'>) => pago.estado === 'APLICADO'

/** "15.75 USD", o "C$ 576.83 (15.75 USD al tipo de cambio 36.6243)" si se pagó en córdobas. */
export function textoDelPago(pago: Pago): string {
  if (pago.moneda === 'NIO' && pago.montoMoneda !== null && pago.tipoCambioAplicado !== null) {
    return `${formatearCordobas(pago.montoMoneda)} (${formatearDolares(pago.monto)} al tipo de cambio ${formatearNumero(pago.tipoCambioAplicado, 4, 4)})`
  }
  return formatearDolares(pago.monto)
}

/** Lo que paga el saldo completo en la moneda elegida: en córdobas, su equivalente exacto (CalculoMonto.ACordobas). */
export const saldoEnMoneda = (saldo: number, moneda: Moneda, tipoDeCambio: number | null) =>
  moneda === 'NIO' && tipoDeCambio !== null ? productoRedondeado(saldo, tipoDeCambio) : saldo

/** El monto escrito de un pago: mayor que cero y con hasta 2 decimales, en la moneda elegida. */
export const montoDelPago = decimalPositivo(2, {
  vacio: 'Indique el monto.',
  formato: 'Escriba el monto con punto decimal y hasta 2 decimales (por ejemplo, 15.75).',
  cero: 'El monto debe ser mayor que cero.',
})

/**
 * CreatePaymentRequest y las reglas de FacturacionService: monto con hasta 2 decimales; en córdobas se abona
 * round(córdobas ÷ tipo de cambio, 2) USD, al tipo de cambio vigente. El pago no puede exceder el saldo.
 */
export function esquemaPago(saldo: number, tipoDeCambio: number | null) {
  return z
    .object({
      moneda: z.enum(monedas),
      monto: montoDelPago,
      // Empieza sin elegir: el método de cada pago importa para cuadrar la caja.
      metodoPago: z.string().transform((metodo, contexto) => {
        if (esMetodoDePago(metodo)) return metodo
        contexto.addIssue({ code: 'custom', message: 'Elija el método de pago.' })
        return z.NEVER
      }),
      referencia: textoOpcional(100, 'La referencia admite hasta 100 caracteres.'),
    })
    .superRefine(
      (pago, contexto) => {
        if (pago.moneda === 'USD') {
          if (aCentavos(pago.monto) > aCentavos(saldo)) {
            contexto.addIssue({ code: 'custom', path: ['monto'], message: `El pago excede el saldo de la factura (${formatearDolares(saldo)}).` })
          }
          return
        }
        if (tipoDeCambio === null) {
          contexto.addIssue({ code: 'custom', path: ['moneda'], message: 'No hay un tipo de cambio vigente: no se pueden recibir córdobas.' })
          return
        }
        const dolares = cocienteRedondeado(pago.monto, tipoDeCambio)
        if (dolares === 0) {
          contexto.addIssue({ code: 'custom', path: ['monto'], message: 'El monto en córdobas equivale a menos de 0.01 USD.' })
        } else if (aCentavos(dolares) > aCentavos(saldo)) {
          contexto.addIssue({
            code: 'custom',
            path: ['monto'],
            message: `El pago (${formatearDolares(dolares)}) excede el saldo de la factura (${formatearDolares(saldo)} = ${formatearCordobas(productoRedondeado(saldo, tipoDeCambio))}).`,
          })
        }
      },
      {
        // Zod salta esta regla si otro campo tiene error; con moneda y monto válidos corre igual, así el usuario ve
        // juntos "excede el saldo" y "elija el método de pago".
        when: ({ value }) => {
          const pago = value as { moneda?: unknown; monto?: unknown }
          return (pago.moneda === 'USD' || pago.moneda === 'NIO') && typeof pago.monto === 'number'
        },
      },
    )
}

export type FormularioPago = z.input<ReturnType<typeof esquemaPago>>
export type DatosPago = z.output<ReturnType<typeof esquemaPago>>

export const camposDePago = ['moneda', 'monto', 'metodoPago', 'referencia'] as const satisfies readonly Path<FormularioPago>[]

/** VoidRequest: anular una factura o un pago exige el motivo. */
export const esquemaAnulacion = esquemaDeMotivo('El motivo de la anulación es obligatorio.')

export const emitirFactura = (clienteId: number, paqueteIds: number[]) => api.post<Factura>('/api/invoices', { clienteId, paqueteIds })
export const registrarPago = (facturaId: number, pago: DatosPago) => api.post<Pago>(`/api/invoices/${facturaId}/payments`, pago)
export const anularFactura = (id: number, motivo: string) => api.post<Factura>(`/api/invoices/${id}/void`, { motivo })
export const anularPago = (id: number, motivo: string) => api.post<Pago>(`/api/payments/${id}/void`, { motivo })

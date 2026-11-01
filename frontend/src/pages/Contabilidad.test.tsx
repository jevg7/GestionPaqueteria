import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { ErrorApi } from '../lib/api-error'
import {
  centavosContables,
  fechaContableValida,
  totalesPartidas,
  validarPartidas,
  type CuentaContable,
} from '../lib/contabilidad'
import {
  Contabilidad,
  FormularioAsiento,
  FormularioGasto,
  ReportesContables,
} from './Contabilidad'

vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  api: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({ modoDemo: false, supabase: null }))

const cuentas: CuentaContable[] = [
  {
    id: 1,
    codigo: '1101',
    nombre: 'Caja',
    tipo: 'ACTIVO',
    clasificacion: 'CORRIENTE',
    naturaleza: 'DEUDORA',
    activo: true,
  },
  {
    id: 2,
    codigo: '5101',
    nombre: 'Alquiler',
    tipo: 'GASTO',
    clasificacion: 'NO_APLICA',
    naturaleza: 'DEUDORA',
    activo: true,
  },
  {
    id: 3,
    codigo: '4101',
    nombre: 'Ventas',
    tipo: 'INGRESO',
    clasificacion: 'NO_APLICA',
    naturaleza: 'ACREEDORA',
    activo: true,
  },
]

function abrir(children: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>,
  )
}
const cambiar = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

beforeEach(() => {
  vi.mocked(api).mockReset()
})

describe('Validación monetaria de contabilidad', () => {
  it('cuadra centavos decimales sin errores de suma binaria', () => {
    const partidas = [
      { cuentaId: '2', descripcion: '', debe: '0.10', haber: '' },
      { cuentaId: '2', descripcion: '', debe: '0.20', haber: '' },
      { cuentaId: '1', descripcion: '', debe: '', haber: '0.30' },
    ]
    expect(totalesPartidas(partidas)).toEqual({
      debe: 30n,
      haber: 30n,
      cuadrado: true,
    })
    expect(validarPartidas(partidas)).toBeNull()
  })

  it.each(['1.001', '-1.00', '1e3', '1,000.00', 'Infinity'])(
    'rechaza importes ambiguos o que requieren redondeo: %s',
    (value) => {
      expect(centavosContables(value)).toBeNull()
    },
  )

  it('rechaza fechas inexistentes para evitar que el navegador las normalice', () => {
    expect(fechaContableValida('2026-02-29')).toBe(false)
    expect(fechaContableValida('0000-01-01')).toBe(false)
    expect(fechaContableValida('2028-02-29')).toBe(true)
  })
})

describe('Registro en el libro diario', () => {
  it('impide contabilizar partidas descuadradas', async () => {
    const guardar = vi.fn()
    abrir(
      <FormularioAsiento
        cuentas={cuentas}
        onSave={guardar}
        onCancel={vi.fn()}
      />,
    )
    cambiar('Concepto', 'Pago de alquiler')
    cambiar('Cuenta 1', '2')
    cambiar('Debe 1', '100.00')
    cambiar('Cuenta 2', '1')
    cambiar('Haber 2', '99.99')
    fireEvent.click(
      screen.getByRole('button', { name: 'Contabilizar asiento' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El total del debe debe ser igual al total del haber.',
    )
    expect(guardar).not.toHaveBeenCalled()
  })

  it('envía el asiento equilibrado con números y referencia, sin asignar agencia', async () => {
    const guardar = vi.fn().mockResolvedValue(undefined)
    abrir(
      <FormularioAsiento
        cuentas={cuentas}
        onSave={guardar}
        onCancel={vi.fn()}
      />,
    )
    cambiar('Concepto', '  Pago de alquiler  ')
    cambiar('Comprobante o referencia (opcional)', ' REC-20 ')
    cambiar('Cuenta 1', '2')
    cambiar('Debe 1', '125.50')
    cambiar('Cuenta 2', '1')
    cambiar('Haber 2', '125.50')
    fireEvent.click(
      screen.getByRole('button', { name: 'Contabilizar asiento' }),
    )
    await waitFor(() => expect(guardar).toHaveBeenCalledOnce())
    expect(guardar.mock.calls[0][0]).toEqual({
      fecha: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      concepto: 'Pago de alquiler',
      referencia: 'REC-20',
      partidas: [
        { cuentaId: 2, debe: 125.5, haber: 0, detalle: null },
        { cuentaId: 1, debe: 0, haber: 125.5, detalle: null },
      ],
    })
  })

  it('no permite poner debe y haber en una misma partida', async () => {
    const guardar = vi.fn()
    abrir(
      <FormularioAsiento
        cuentas={cuentas}
        onSave={guardar}
        onCancel={vi.fn()}
      />,
    )
    cambiar('Concepto', 'Movimiento')
    cambiar('Cuenta 1', '2')
    cambiar('Debe 1', '10')
    cambiar('Haber 1', '10')
    cambiar('Cuenta 2', '1')
    cambiar('Haber 2', '10')
    fireEvent.click(
      screen.getByRole('button', { name: 'Contabilizar asiento' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'únicamente en el debe o en el haber',
    )
    expect(guardar).not.toHaveBeenCalled()
  })
})

describe('Gastos diarios', () => {
  it('registra el costo o gasto contra una cuenta de activo o pasivo', async () => {
    const guardar = vi.fn().mockResolvedValue(undefined)
    abrir(
      <FormularioGasto cuentas={cuentas} onSave={guardar} onCancel={vi.fn()} />,
    )
    cambiar('Concepto', 'Alquiler de oficina')
    cambiar('Cuenta de costo o gasto', '2')
    cambiar('Se paga o reconoce contra', '1')
    cambiar('Importe en córdobas (NIO)', '2500.75')
    expect(
      within(screen.getByLabelText('Cuenta de costo o gasto')).queryByRole(
        'option',
        { name: /Ventas/ },
      ),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar gasto' }))
    await waitFor(() => expect(guardar).toHaveBeenCalledOnce())
    expect(guardar.mock.calls[0][0]).toMatchObject({
      concepto: 'Alquiler de oficina',
      referencia: null,
      cuentaGastoId: 2,
      contrapartidaId: 1,
      monto: 2500.75,
    })
  })

  it('conserva el formulario y explica un rechazo del backend', async () => {
    const guardar = vi
      .fn()
      .mockRejectedValue(
        new ErrorApi(409, { detail: 'La cuenta fue desactivada.' }),
      )
    abrir(
      <FormularioGasto cuentas={cuentas} onSave={guardar} onCancel={vi.fn()} />,
    )
    cambiar('Concepto', 'Alquiler')
    cambiar('Cuenta de costo o gasto', '2')
    cambiar('Se paga o reconoce contra', '1')
    cambiar('Importe en córdobas (NIO)', '100')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar gasto' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La cuenta fue desactivada.',
    )
    expect(screen.getByLabelText('Concepto')).toHaveValue('Alquiler')
    expect(screen.getByRole('button', { name: 'Guardar gasto' })).toBeEnabled()
  })
})

describe('Estados financieros y plan inicial', () => {
  it('presenta el resultado acumulado en el patrimonio del balance', async () => {
    vi.mocked(api).mockResolvedValue({
      moneda: 'NIO',
      fechaCorte: '2026-11-01',
      cuentas: [],
      totalActivos: 1000,
      totalPasivos: 500,
      capitalYReservas: 600,
      resultadoAcumulado: -100,
      totalPatrimonio: 500,
      diferencia: 0,
      cuadrado: true,
    })
    abrir(<ReportesContables />)
    expect(
      await screen.findByText(
        'El balance cuadra: activo = pasivo + patrimonio.',
      ),
    ).toBeInTheDocument()
    const resultado = screen.getByText('Resultado acumulado').parentElement!
    expect(resultado).toHaveTextContent(/100\.00/)
    expect(resultado.textContent).toContain('-')
    expect(api).toHaveBeenCalledWith(
      expect.stringContaining('/balance-sheet?asOf='),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('no inicializa cuentas ni crea movimientos automáticamente', async () => {
    vi.mocked(api).mockImplementation(async (path) =>
      path.startsWith('/api/accounting/accounts')
        ? []
        : { items: [], page: 1, pageSize: 10, total: 0 },
    )
    abrir(<Contabilidad />)
    const inicializar = await screen.findByRole('button', {
      name: 'Crear plan de cuentas inicial',
    })
    expect(api).not.toHaveBeenCalledWith(
      '/api/accounting/accounts/initialize',
      expect.anything(),
    )
    fireEvent.click(inicializar)
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/accounting/accounts/initialize', {
        method: 'POST',
        body: undefined,
      }),
    )
    expect(api).not.toHaveBeenCalledWith(
      '/api/accounting/journal',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

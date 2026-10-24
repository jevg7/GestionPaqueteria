// Montos del negocio con el redondeo del backend (CalculoMonto): 2 decimales, los medios hacia arriba, como round() de
// PostgreSQL. Se calcula en enteros (BigInt) para que el punto flotante no cambie el redondeo de un medio
// (1.00 × 7.865 debe dar 7.87). Las vistas previas usan estas funciones; el monto definitivo siempre lo da la API.

const centesimas = (valor: number) => BigInt(Math.round(valor * 100))
const diezmilesimas = (valor: number) => BigInt(Math.round(valor * 10_000))

/** Un monto (hasta 2 decimales) en centavos: para comparar y sumar sin errores de redondeo. */
export const aCentavos = (monto: number) => Math.round(monto * 100)

/** round(a × b, 2): a con hasta 2 decimales (peso, dólares) y b con hasta 4 (tarifa, tipo de cambio). */
export function productoRedondeado(a: number, b: number): number {
  const millonesimas = centesimas(a) * diezmilesimas(b)
  return Number((millonesimas + 5_000n) / 10_000n) / 100
}

/** round(a ÷ b, 2): a con hasta 2 decimales (córdobas) y b con hasta 4 (tipo de cambio). */
export function cocienteRedondeado(a: number, b: number): number {
  // a ÷ b en centésimas = a·100 × 10 000 ÷ b·10 000; sumar medio divisor antes de dividir redondea el medio hacia arriba.
  const divisor = diezmilesimas(b)
  return Number((2n * centesimas(a) * 10_000n + divisor) / (2n * divisor)) / 100
}

/** La suma exacta de montos de hasta 2 decimales. */
export const sumaDeMontos = (montos: readonly number[]) => montos.reduce((suma, monto) => suma + aCentavos(monto), 0) / 100

/** a − b, exacta, para montos de hasta 2 decimales. */
export const restaDeMontos = (a: number, b: number) => (aCentavos(a) - aCentavos(b)) / 100

// Clases de los botones, compartidas por <Boton> y <EnlaceBoton>.
export const baseBoton =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed'

export const variantesBoton = {
  primario: 'bg-blue-700 text-white hover:bg-blue-800 disabled:bg-blue-400',
  secundario: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:text-slate-400',
  peligro: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-400',
}

export type VarianteBoton = keyof typeof variantesBoton

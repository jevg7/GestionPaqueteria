import { Boton } from './Boton.tsx'

type Props = { pagina: number; tamano: number; total: number; alCambiar: (pagina: number) => void }

/** "1–20 de 45" y los botones para moverse entre páginas. */
export function Paginacion({ pagina, tamano, total, alCambiar }: Props) {
  const ultima = Math.max(1, Math.ceil(total / tamano))
  const desde = total === 0 ? 0 : (pagina - 1) * tamano + 1
  const hasta = Math.min(pagina * tamano, total)
  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
      <p>{desde > total ? `Página ${pagina} sin resultados (total: ${total})` : `${desde}–${hasta} de ${total}`}</p>
      <div className="flex gap-2">
        <Boton variante="secundario" disabled={pagina <= 1} onClick={() => alCambiar(Math.min(pagina - 1, ultima))}>
          Anterior
        </Boton>
        <Boton variante="secundario" disabled={pagina >= ultima} onClick={() => alCambiar(pagina + 1)}>
          Siguiente
        </Boton>
      </div>
    </nav>
  )
}

/** Espera a pantalla completa (por ejemplo, mientras se lee la sesión o se carga la cuenta). */
export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-500">
      <p role="status" className="flex items-center gap-2 text-sm">
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
        {texto}
      </p>
    </main>
  )
}

/** Contenido provisional de una sección que todavía no se construye. */
export function EnConstruccion({ titulo }: { titulo: string }) {
  return (
    <section>
      <h1 className="text-xl font-semibold">{titulo}</h1>
      <p className="mt-2 text-sm text-slate-600">Esta sección está en construcción.</p>
    </section>
  )
}

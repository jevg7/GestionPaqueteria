import type { ReactNode } from 'react'

/** Tarjeta centrada para las pantallas sin menú: inicio de sesión, invitación, bloqueos y errores. */
export function PantallaCentrada({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-8 text-slate-900">
      <section className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Gestión de Paquetería</p>
        <h1 className="mt-1 text-xl font-semibold">{titulo}</h1>
        <div className="mt-4">{children}</div>
      </section>
    </main>
  )
}

import { env } from '../lib/env.ts'

// Página provisional hasta que existan el inicio de sesión y los paneles por rol.
export default function Inicio() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 text-slate-900">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Gestión de Paquetería</h1>
        <p className="mt-1 text-sm text-slate-600">La base del frontend está lista.</p>
        <dl className="mt-5 space-y-2 text-sm">
          <Dato nombre="API" valor={env.VITE_API_URL} />
          <Dato nombre="Supabase" valor={new URL(env.VITE_SUPABASE_URL).host} />
        </dl>
      </section>
    </main>
  )
}

function Dato({ nombre, valor }: { nombre: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{nombre}</dt>
      <dd className="break-all text-right font-mono">{valor}</dd>
    </div>
  )
}

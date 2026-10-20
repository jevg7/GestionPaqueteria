import { Link } from 'react-router'

export function NoEncontrada() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 text-center text-slate-900">
      <div>
        <h1 className="text-xl font-semibold">Página no encontrada</h1>
        <p className="mt-1 text-sm text-slate-600">Esta dirección no existe.</p>
        <Link to="/" className="mt-4 inline-block text-sm font-medium text-blue-700 hover:underline">
          Volver al inicio
        </Link>
      </div>
    </main>
  )
}

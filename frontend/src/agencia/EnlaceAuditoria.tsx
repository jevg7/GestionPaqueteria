import { Link } from 'react-router'
import type { TablaAuditada } from './auditoria.ts'

/** "Ver su auditoría": los cambios de este registro (quién, cuándo y qué valores). Lo muestra quien tiene VerAuditoria. */
export function EnlaceAuditoria({ tabla, registro }: { tabla: TablaAuditada; registro: number }) {
  return (
    <p className="mt-2 text-right text-sm">
      <Link to={`/auditoria?tabla=${tabla}&registro=${registro}`} className="font-medium text-blue-700 hover:underline">
        Ver su auditoría
      </Link>
    </p>
  )
}

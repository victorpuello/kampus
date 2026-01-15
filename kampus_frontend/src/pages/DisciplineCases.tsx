import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { useAuthStore } from '../store/auth'
import { disciplineApi, type DisciplineCaseListItem } from '../services/discipline'

const canAccess = (role?: string) =>
  role === 'TEACHER' || role === 'COORDINATOR' || role === 'ADMIN' || role === 'SUPERADMIN' || role === 'PARENT'

const statusLabel = (s: string) => {
  switch (s) {
    case 'OPEN':
      return 'Abierto'
    case 'DECIDED':
      return 'Decidido'
    case 'CLOSED':
      return 'Cerrado'
    default:
      return s
  }
}

export default function DisciplineCases() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const isParent = user?.role === 'PARENT'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<DisciplineCaseListItem[]>([])

  useEffect(() => {
    if (!canAccess(user?.role)) return

    let mounted = true
    setLoading(true)
    setError(null)

    disciplineApi
      .list()
      .then((res) => {
        if (!mounted) return
        setItems(res.data || [])
      })
      .catch((e) => {
        if (!mounted) return
        console.error(e)
        setError('No se pudieron cargar los casos')
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [user?.role])

  if (!canAccess(user?.role)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Convivencia</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 dark:text-slate-300">No tienes permisos para acceder al módulo de convivencia.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (loading) return <div className="p-6 text-slate-600 dark:text-slate-300">Cargando…</div>
  if (error) return <div className="p-6 text-red-600 dark:text-rose-200">{error}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Convivencia</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {isParent ? 'Casos asociados a tus acudidos.' : 'Casos registrados en el observador (MVP).'}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Casos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-linear-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 font-semibold">Fecha</th>
                  <th className="px-6 py-4 font-semibold">Estudiante</th>
                  <th className="px-6 py-4 font-semibold">Grado/Grupo</th>
                  <th className="px-6 py-4 font-semibold">Ley 1620</th>
                  <th className="px-6 py-4 font-semibold">Estado</th>
                  <th className="px-6 py-4 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((c) => (
                  <tr key={c.id} className="bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                    <td className="px-6 py-4">{new Date(c.occurred_at).toLocaleString()}</td>
                    <td className="px-6 py-4">{c.student_full_name || `#${c.student_id}`}</td>
                    <td className="px-6 py-4">{(c.grade_name || '-') + ' / ' + (c.group_name || '-')}</td>
                    <td className="px-6 py-4">{c.law_1620_type}</td>
                    <td className="px-6 py-4">

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200">
                          {statusLabel(c.status)}
                        </span>
                        {c.sealed_at && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200">
                            Sellado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Link to={`/discipline/cases/${c.id}`} className="text-blue-600 dark:text-blue-300 hover:underline">
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td className="px-6 py-6 text-slate-500 dark:text-slate-400" colSpan={6}>
                      No hay casos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

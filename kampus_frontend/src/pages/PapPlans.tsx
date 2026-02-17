import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Toast, type ToastType } from '../components/ui/Toast'
import { Input } from '../components/ui/Input'
import { ConfirmationModal } from '../components/ui/ConfirmationModal'
import { enrollmentsApi, type PapPlanListItem } from '../services/enrollments'
import { useAuthStore } from '../store/auth'

export default function PapPlans() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<PapPlanListItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false
  })

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [selected, setSelected] = useState<{ enrollmentId: number; action: 'CLEARED' | 'FAILED'; title: string; description: string } | null>(null)

  const blocked = user?.role === 'TEACHER' || user?.role === 'PARENT' || user?.role === 'STUDENT'

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await enrollmentsApi.papPlans({ status: 'OPEN' })
      setItems(res.data.results || [])
    } catch (e) {
      console.error(e)
      setError('No se pudo cargar la lista de PAP')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (blocked) return
    load()
  }, [blocked])

  const filtered = useMemo(() => {
    const t = searchTerm.trim().toLowerCase()
    if (!t) return items
    return items.filter((p) => {
      const name = (p.enrollment.student.name || '').toLowerCase()
      const doc = (p.enrollment.student.document_number || '').toLowerCase()
      const grade = (p.enrollment.grade.name || '').toLowerCase()
      const year = String(p.enrollment.academic_year.year || '').toLowerCase()
      return name.includes(t) || doc.includes(t) || grade.includes(t) || year.includes(t)
    })
  }, [items, searchTerm])

  const openResolve = (plan: PapPlanListItem, action: 'CLEARED' | 'FAILED') => {
    const studentName = plan.enrollment.student.name || 'Estudiante'
    if (action === 'CLEARED') {
      setSelected({
        enrollmentId: plan.enrollment.id,
        action,
        title: 'Aprobar PAP',
        description: `¿Marcar PAP como APROBADO para ${studentName}?`,
      })
    } else {
      setSelected({
        enrollmentId: plan.enrollment.id,
        action,
        title: 'No aprobar PAP',
        description: `¿Marcar PAP como NO APROBADO para ${studentName}? Esto puede retener el grado.`,
      })
    }
    setConfirmOpen(true)
  }

  const confirmResolve = async () => {
    if (!selected) return
    setConfirmLoading(true)
    try {
      await enrollmentsApi.papResolve(selected.enrollmentId, { status: selected.action })
      showToast(selected.action === 'CLEARED' ? 'PAP aprobado' : 'PAP no aprobado', 'success')
      setConfirmOpen(false)
      setSelected(null)
      await load()
    } catch (e) {
      console.error(e)
      showToast('No se pudo resolver el PAP', 'error')
    } finally {
      setConfirmLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {blocked ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-slate-900 dark:text-slate-100">PAP (Promoción Condicional)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-600 dark:text-slate-300">No tienes permisos para acceder a PAP.</p>
            <div className="mt-4">
              <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
      <Card className="border-slate-200 dark:border-slate-800/80 dark:bg-slate-900">
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="text-slate-900 dark:text-slate-100">PAP (Promoción Condicional)</CardTitle>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Listado de planes pendientes (OPEN)</p>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto">
              <Button className="min-h-11" variant="outline" onClick={() => navigate('/')}>Volver</Button>
              <Button className="min-h-11" onClick={load} disabled={loading}>Refrescar</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Input
              placeholder="Buscar por estudiante / documento / grado / año"
              className="h-11"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="text-sm text-slate-500 dark:text-slate-400 md:whitespace-nowrap">{filtered.length} resultado(s)</div>
          </div>

          {loading ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">Cargando…</div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-red-600 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">No hay PAP pendientes.</div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-3 lg:hidden">
                {filtered.map((plan) => (
                  <article
                    key={plan.id}
                    className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{plan.enrollment.student.name || '-'}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">Doc: {plan.enrollment.student.document_number || '-'}</p>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Año</dt>
                        <dd className="text-slate-700 dark:text-slate-200">{String(plan.enrollment.academic_year.year || '-')}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Grado</dt>
                        <dd className="text-slate-700 dark:text-slate-200">{plan.enrollment.grade.name || '-'}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-slate-500 dark:text-slate-400">Periodo límite</dt>
                        <dd className="text-slate-700 dark:text-slate-200">{plan.due_period?.name || '-'}</dd>
                      </div>
                    </dl>
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button className="min-h-11" onClick={() => openResolve(plan, 'CLEARED')}>Aprobar</Button>
                      <Button className="min-h-11" variant="destructive" onClick={() => openResolve(plan, 'FAILED')}>No aprobar</Button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden lg:block">
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                    <thead className="bg-slate-50 dark:bg-slate-900/80">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Estudiante</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Documento</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Año</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Grado</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Periodo límite</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/70">
                      {filtered.map((plan) => (
                        <tr key={plan.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/80">
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-100">{plan.enrollment.student.name || '-'}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{plan.enrollment.student.document_number || '-'}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{String(plan.enrollment.academic_year.year || '-')}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{plan.enrollment.grade.name || '-'}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{plan.due_period?.name || '-'}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                            <div className="inline-flex gap-2">
                              <Button className="min-h-10" size="sm" onClick={() => openResolve(plan, 'CLEARED')}>Aprobar</Button>
                              <Button className="min-h-10" variant="destructive" size="sm" onClick={() => openResolve(plan, 'FAILED')}>No aprobar</Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      <ConfirmationModal
        isOpen={confirmOpen}
        onClose={() => {
          if (!confirmLoading) setConfirmOpen(false)
        }}
        onConfirm={confirmResolve}
        title={selected?.title || 'Confirmar'}
        description={selected?.description || ''}
        confirmText="Confirmar"
        cancelText="Cancelar"
        variant={selected?.action === 'FAILED' ? 'destructive' : 'default'}
        loading={confirmLoading}
      />

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((t) => ({ ...t, isVisible: false }))}
      />
    </div>
  )
}

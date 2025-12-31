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
            <CardTitle>PAP (Promoción Condicional)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-600">No tienes permisos para acceder a PAP.</p>
            <div className="mt-4">
              <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>PAP (Promoción Condicional)</CardTitle>
              <p className="text-sm text-slate-500 mt-1">Listado de planes pendientes (OPEN)</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/')}>Volver</Button>
              <Button onClick={load} disabled={loading}>Refrescar</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-4">
            <Input
              placeholder="Buscar por estudiante / documento / grado / año"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="text-sm text-slate-500">{filtered.length} resultado(s)</div>
          </div>

          {loading ? (
            <div className="text-slate-600">Cargando…</div>
          ) : error ? (
            <div className="text-red-600">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="text-slate-600">No hay PAP pendientes.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Estudiante</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Documento</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Año</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Grado</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Periodo límite</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filtered.map((plan) => (
                    <tr key={plan.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{plan.enrollment.student.name || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{plan.enrollment.student.document_number || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{String(plan.enrollment.academic_year.year || '-')}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{plan.enrollment.grade.name || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{plan.due_period?.name || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <div className="inline-flex gap-2">
                          <Button size="sm" onClick={() => openResolve(plan, 'CLEARED')}>Aprobar</Button>
                          <Button variant="destructive" size="sm" onClick={() => openResolve(plan, 'FAILED')}>No aprobar</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

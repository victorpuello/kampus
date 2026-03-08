import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CheckCircle2, FileDown, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { usersApi, type User } from '../services/users'
import { operationalPlanApi, type OperationalPlanActivity, type OperationalPlanComplianceSummary } from '../services/operationalPlan'
import { useAuthStore } from '../store/auth'

type FormState = {
  title: string
  description: string
  activity_date: string
  end_date: string
  is_active: boolean
  responsible_user_ids: number[]
}

const initialFormState: FormState = {
  title: '',
  description: '',
  activity_date: '',
  end_date: '',
  is_active: true,
  responsible_user_ids: [],
}

export default function OperationalPlanActivities() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN'

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mapping, setMapping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [activities, setActivities] = useState<OperationalPlanActivity[]>([])
  const [summary, setSummary] = useState<OperationalPlanComplianceSummary>({ total: 0, completed: 0, pending: 0, completion_rate: 0 })
  const [users, setUsers] = useState<User[]>([])
  const [form, setForm] = useState<FormState>(initialFormState)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false)
  const [isPendingModalOpen, setIsPendingModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [selectedActivity, setSelectedActivity] = useState<OperationalPlanActivity | null>(null)
  const [completionNotes, setCompletionNotes] = useState('')
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedResponsibleActivityIds, setExpandedResponsibleActivityIds] = useState<number[]>([])

  const PAGE_SIZE = 8

  const sortedActivities = useMemo(() => {
    return [...activities].sort((a, b) => a.activity_date.localeCompare(b.activity_date))
  }, [activities])

  const filteredActivities = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return sortedActivities

    return sortedActivities.filter((item) => {
      const responsibleText = item.responsible_users.map((u) => u.full_name).join(' ')
      const rowText = [
        item.title,
        item.description || '',
        item.activity_date,
        item.end_date || '',
        responsibleText,
      ]
        .join(' ')
        .toLowerCase()

      return rowText.includes(term)
    })
  }, [searchTerm, sortedActivities])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredActivities.length / PAGE_SIZE)), [filteredActivities.length])

  const paginatedActivities = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredActivities.slice(start, start + PAGE_SIZE)
  }, [currentPage, filteredActivities])

  const formatDateRange = (activity: OperationalPlanActivity) => {
    if (activity.end_date && activity.end_date !== activity.activity_date) {
      return `${activity.activity_date} → ${activity.end_date}`
    }
    return activity.activity_date
  }

  const getResponsibleTags = (activity: OperationalPlanActivity) => {
    const names = activity.responsible_users.map((u) => u.full_name).filter(Boolean)
    return {
      visible: names.slice(0, 5),
      hidden: names.slice(5),
      extra: Math.max(0, names.length - 5),
    }
  }

  const toggleResponsibleExpansion = (activityId: number) => {
    setExpandedResponsibleActivityIds((prev) => (
      prev.includes(activityId)
        ? prev.filter((id) => id !== activityId)
        : [...prev, activityId]
    ))
  }

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [activitiesRes, usersRes, summaryRes] = await Promise.all([
        operationalPlanApi.list(),
        usersApi.getAll(),
        operationalPlanApi.summary(),
      ])
      setActivities(activitiesRes.data || [])
      setSummary(summaryRes.data)
      const usersPayload = usersRes.data
      const usersList = Array.isArray(usersPayload)
        ? usersPayload
        : Array.isArray((usersPayload as { results?: User[] })?.results)
          ? (usersPayload as { results: User[] }).results
          : []
      setUsers(usersList.filter((item) => item.is_active !== false && item.role === 'TEACHER'))
    } catch {
      setError('No se pudo cargar la información del plan operativo.')
      setActivities([])
      setUsers([])
      setSummary({ total: 0, completed: 0, pending: 0, completion_rate: 0 })
    } finally {
      setLoading(false)
    }
  }

  const onMarkCompleted = async (activity: OperationalPlanActivity) => {
    setSelectedActivity(activity)
    setCompletionNotes(activity.completion_notes || '')
    setIsCompleteModalOpen(true)
  }

  const confirmMarkCompleted = async () => {
    if (!selectedActivity) return

    setConfirmLoading(true)
    setError(null)
    setMessage(null)
    try {
      await operationalPlanApi.markCompleted(selectedActivity.id, completionNotes)
      setMessage('Actividad marcada como completada.')
      setIsCompleteModalOpen(false)
      setSelectedActivity(null)
      setCompletionNotes('')
      await loadData()
    } catch {
      setError('No se pudo marcar la actividad como completada.')
    } finally {
      setConfirmLoading(false)
    }
  }

  const onMarkPending = async (activity: OperationalPlanActivity) => {
    setSelectedActivity(activity)
    setIsPendingModalOpen(true)
  }

  const confirmMarkPending = async () => {
    if (!selectedActivity) return

    setConfirmLoading(true)
    setError(null)
    setMessage(null)
    try {
      await operationalPlanApi.markPending(selectedActivity.id)
      setMessage('Actividad marcada como no completada.')
      setIsPendingModalOpen(false)
      setSelectedActivity(null)
      await loadData()
    } catch {
      setError('No se pudo marcar la actividad como no completada.')
    } finally {
      setConfirmLoading(false)
    }
  }

  const onDownloadCompliancePdf = async () => {
    setError(null)
    setMessage(null)
    try {
      const res = await operationalPlanApi.downloadCompliancePdf()
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'plan_operativo_cumplimiento.pdf'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      setError('No se pudo descargar el reporte de cumplimiento en PDF.')
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
    setExpandedResponsibleActivityIds([])
  }, [searchTerm])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    setExpandedResponsibleActivityIds([])
  }, [currentPage])

  const resetForm = () => {
    setForm(initialFormState)
    setEditingId(null)
  }

  const openCreateModal = () => {
    resetForm()
    setError(null)
    setMessage(null)
    setIsFormModalOpen(true)
  }

  const closeFormModal = () => {
    if (saving) return
    setIsFormModalOpen(false)
    resetForm()
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.activity_date) {
      setError('Título y fecha son obligatorios.')
      return
    }
    if (form.end_date && form.end_date < form.activity_date) {
      setError('La fecha fin no puede ser menor que la fecha inicio.')
      return
    }

    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        activity_date: form.activity_date,
        end_date: form.end_date || null,
        is_active: form.is_active,
        responsible_user_ids: form.responsible_user_ids,
      }
      if (editingId) {
        await operationalPlanApi.update(editingId, payload)
        setMessage('Actividad actualizada correctamente.')
      } else {
        await operationalPlanApi.create(payload)
        setMessage('Actividad creada correctamente.')
      }
      setIsFormModalOpen(false)
      resetForm()
      await loadData()
    } catch {
      setError('No se pudo guardar la actividad.')
    } finally {
      setSaving(false)
    }
  }

  const onEdit = (activity: OperationalPlanActivity) => {
    setEditingId(activity.id)
    setForm({
      title: activity.title,
      description: activity.description || '',
      activity_date: activity.activity_date,
      end_date: activity.end_date || '',
      is_active: activity.is_active,
      responsible_user_ids: activity.responsible_users.map((item) => item.id),
    })
    setMessage(null)
    setError(null)
    setIsFormModalOpen(true)
  }

  const onDelete = async (activity: OperationalPlanActivity) => {
    setSelectedActivity(activity)
    setIsDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    if (!selectedActivity) return

    setConfirmLoading(true)
    setError(null)
    setMessage(null)
    try {
      await operationalPlanApi.remove(selectedActivity.id)
      setMessage('Actividad eliminada correctamente.')
      const deletedId = selectedActivity.id
      setIsDeleteModalOpen(false)
      setSelectedActivity(null)
      await loadData()
      if (editingId === deletedId) resetForm()
    } catch {
      setError('No se pudo eliminar la actividad.')
    } finally {
      setConfirmLoading(false)
    }
  }

  const closeConfirmModals = () => {
    if (confirmLoading) return
    setIsCompleteModalOpen(false)
    setIsPendingModalOpen(false)
    setIsDeleteModalOpen(false)
    setSelectedActivity(null)
    setCompletionNotes('')
  }

  const onResponsibleChange = (selectedOptions: HTMLOptionsCollection) => {
    const selectedIds: number[] = []
    for (const option of Array.from(selectedOptions)) {
      if (option.selected) {
        selectedIds.push(Number(option.value))
      }
    }
    setForm((prev) => ({ ...prev, responsible_user_ids: selectedIds }))
  }

  const onMapResponsibles = async () => {
    setMapping(true)
    setError(null)
    setMessage(null)
    try {
      const res = await operationalPlanApi.mapResponsibles(true)
      setMessage(res.data.output || 'Mapeo de responsables ejecutado correctamente.')
      await loadData()
    } catch {
      setError('No se pudo ejecutar el mapeo automático de responsables.')
    } finally {
      setMapping(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-3 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Actividades plan operativo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-slate-600 dark:text-slate-300">No tienes permisos para acceder a esta sección.</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Actividades plan operativo</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">Configura actividades institucionales y responsables.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" onClick={openCreateModal}>
            Nueva actividad
          </Button>
          <Button type="button" variant="outline" onClick={onDownloadCompliancePdf}>
            <FileDown className="mr-2 h-4 w-4" />
            Descargar PDF
          </Button>
          <Button type="button" variant="outline" onClick={onMapResponsibles} disabled={mapping}>
            {mapping ? 'Reprocesando responsables…' : 'Reprocesar responsables automáticamente'}
          </Button>
        </div>
      </div>

      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-slate-500">Total actividades</div>
            <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{summary.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-slate-500">Completadas</div>
            <div className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">{summary.completed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-slate-500">No completadas</div>
            <div className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-300">{summary.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-slate-500">Cumplimiento</div>
            <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{summary.completion_rate}%</div>
          </CardContent>
        </Card>
      </div>

      <Modal
        isOpen={isFormModalOpen}
        onClose={closeFormModal}
        title={editingId ? 'Editar actividad' : 'Nueva actividad'}
        description={editingId ? 'Actualiza la información de la actividad seleccionada.' : 'Registra una nueva actividad del plan operativo institucional.'}
        size="lg"
        loading={saving}
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeFormModal} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" form="operational-plan-form" disabled={saving}>
              {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear actividad'}
            </Button>
          </>
        }
      >
        <form id="operational-plan-form" className="space-y-4" onSubmit={onSubmit}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Actividad</label>
              <Input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Ej: Semana institucional"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Fecha inicio</label>
              <Input
                type="date"
                value={form.activity_date}
                onChange={(e) => setForm((prev) => ({ ...prev, activity_date: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Fecha fin (opcional)</label>
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Descripción</label>
            <textarea
              className="min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Detalle opcional de la actividad"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Responsables (solo docentes, selección múltiple)</label>
            <select
              multiple
              className="min-h-32 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              value={form.responsible_user_ids.map(String)}
              onChange={(e) => onResponsibleChange(e.target.options)}
            >
              {users.map((item) => (
                <option key={item.id} value={item.id}>
                  {(item.last_name || '').trim()} {(item.first_name || '').trim()}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tip: mantén presionada la tecla Ctrl (Windows) para seleccionar varios docentes.</p>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
            />
            Actividad activa
          </label>
        </form>
      </Modal>

      <Modal
        isOpen={isCompleteModalOpen}
        onClose={closeConfirmModals}
        title="Marcar actividad como completada"
        description="Registra una nota opcional para la trazabilidad del cumplimiento."
        size="md"
        loading={confirmLoading}
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeConfirmModals} disabled={confirmLoading}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmMarkCompleted} disabled={confirmLoading}>
              {confirmLoading ? 'Guardando…' : 'Confirmar'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {selectedActivity ? `Actividad: ${selectedActivity.title}` : ''}
          </p>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Nota de cumplimiento (opcional)</label>
            <textarea
              className="min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              placeholder="Ej: Evidencia cargada y validada por coordinación"
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isPendingModalOpen}
        onClose={closeConfirmModals}
        title="Marcar actividad como no completada"
        description="Esta acción limpiará la marcación de cumplimiento y su nota."
        size="sm"
        loading={confirmLoading}
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeConfirmModals} disabled={confirmLoading}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmMarkPending} disabled={confirmLoading}>
              {confirmLoading ? 'Guardando…' : 'Confirmar'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {selectedActivity ? `¿Deseas marcar como no completada la actividad "${selectedActivity.title}"?` : '¿Deseas continuar?'}
        </p>
      </Modal>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={closeConfirmModals}
        title="Eliminar actividad"
        description="Esta acción no se puede deshacer."
        size="sm"
        loading={confirmLoading}
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeConfirmModals} disabled={confirmLoading}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmDelete} disabled={confirmLoading}>
              {confirmLoading ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {selectedActivity ? `¿Deseas eliminar la actividad "${selectedActivity.title}"?` : '¿Deseas eliminar esta actividad?'}
        </p>
      </Modal>

      <Card>
        <CardHeader>
          <CardTitle>Listado de actividades</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por actividad, fecha, descripción o responsable"
              className="sm:max-w-md"
            />
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {filteredActivities.length} resultado(s)
            </span>
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Cargando actividades…</div>
          ) : filteredActivities.length === 0 ? (
            <div className="text-sm text-slate-500">No hay actividades registradas.</div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-3 lg:hidden">
                {paginatedActivities.map((item) => {
                  const responsibleTags = getResponsibleTags(item)
                  const isExpanded = expandedResponsibleActivityIds.includes(item.id)
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{formatDateRange(item)}</p>
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs ${item.is_active
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}>
                          {item.is_active ? 'Activa' : 'Inactiva'}
                        </span>
                      </div>

                      <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</h3>
                      {item.description ? (
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-3">{item.description}</p>
                      ) : null}

                      <div className="mt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Responsables</p>
                        {responsibleTags.visible.length === 0 ? (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Sin responsables</p>
                        ) : (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {responsibleTags.visible.map((name) => (
                              <span
                                key={`${item.id}-${name}`}
                                className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                              >
                                {name}
                              </span>
                            ))}
                            {responsibleTags.extra > 0 ? (
                              <button
                                type="button"
                                onClick={() => toggleResponsibleExpansion(item.id)}
                                className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/70"
                              >
                                {isExpanded ? 'Ocultar' : `+${responsibleTags.extra}`}
                              </button>
                            ) : null}
                          </div>
                        )}
                        {isExpanded && responsibleTags.hidden.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {responsibleTags.hidden.map((name) => (
                              <span
                                key={`${item.id}-hidden-${name}`}
                                className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {item.responsables_sin_mapear && item.responsables_texto ? (
                          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Texto original: {item.responsables_texto}</p>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.is_completed ? (
                          <Button size="sm" variant="outline" className="flex-1 min-w-24" onClick={() => onMarkPending(item)}>
                            Marcar pendiente
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="flex-1 min-w-24" onClick={() => onMarkCompleted(item)}>
                            Marcar cumplida
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="flex-1 min-w-24" onClick={() => onEdit(item)}>Editar</Button>
                        <Button size="sm" variant="outline" className="flex-1 min-w-24" onClick={() => onDelete(item)}>Eliminar</Button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-sm text-left">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    <tr>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Actividad</th>
                      <th className="px-3 py-2">Responsables</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Cumplimiento</th>
                      <th className="px-3 py-2 min-w-52">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {paginatedActivities.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">{formatDateRange(item)}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{item.title}</div>
                          {item.description ? <div className="text-xs text-slate-500 dark:text-slate-400">{item.description}</div> : null}
                        </td>
                        <td className="px-3 py-2">
                          {getResponsibleTags(item).visible.length === 0 ? (
                            <span className="text-slate-500 dark:text-slate-400">Sin responsables</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {getResponsibleTags(item).visible.map((name) => (
                                <span
                                  key={`${item.id}-${name}`}
                                  className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                >
                                  {name}
                                </span>
                              ))}
                              {getResponsibleTags(item).extra > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => toggleResponsibleExpansion(item.id)}
                                  className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/70"
                                >
                                  {expandedResponsibleActivityIds.includes(item.id)
                                    ? 'Ocultar'
                                    : `+${getResponsibleTags(item).extra}`}
                                </button>
                              ) : null}
                            </div>
                          )}
                          {expandedResponsibleActivityIds.includes(item.id) && getResponsibleTags(item).hidden.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {getResponsibleTags(item).hidden.map((name) => (
                                <span
                                  key={`${item.id}-desktop-hidden-${name}`}
                                  className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {item.responsables_sin_mapear && item.responsables_texto ? (
                            <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                              Texto original: {item.responsables_texto}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">{item.is_active ? 'Activa' : 'Inactiva'}</td>
                        <td className="px-3 py-2">
                          {item.is_completed ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">Completada</span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">No completada</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            {item.is_completed ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="px-2"
                                onClick={() => onMarkPending(item)}
                                title="Marcar no completada"
                                aria-label="Marcar no completada"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="px-2"
                                onClick={() => onMarkCompleted(item)}
                                title="Marcar completada"
                                aria-label="Marcar completada"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="px-2"
                              onClick={() => onEdit(item)}
                              title="Editar actividad"
                              aria-label="Editar actividad"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="px-2"
                              onClick={() => onDelete(item)}
                              title="Eliminar actividad"
                              aria-label="Eliminar actividad"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-2 text-xs text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  Mostrando {filteredActivities.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, filteredActivities.length)} de {filteredActivities.length}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  >
                    Anterior
                  </Button>
                  <span>Página {currentPage} de {totalPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

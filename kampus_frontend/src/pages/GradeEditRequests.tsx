import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ClipboardList, Save } from 'lucide-react'
import { academicApi, type EditRequest, type EditRequestType, type Period, type TeacherAssignment, type GradebookStudent } from '../services/academic'
import { useAuthStore } from '../store/auth'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Toast, type ToastType } from '../components/ui/Toast'

function useQuery() {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search), [search])
}

function selectLikeClassName() {
  return 'flex h-11 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-100 dark:ring-offset-slate-900 dark:focus-visible:ring-slate-200'
}

function textareaClassName() {
  return 'mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-100 dark:ring-offset-slate-900 dark:focus-visible:ring-slate-200'
}

export default function GradeEditRequests() {
  const navigate = useNavigate()
  const query = useQuery()
  const user = useAuthStore((s) => s.user)

  const isTeacher = user?.role === 'TEACHER'
  const isAdminLike = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN' || user?.role === 'COORDINATOR'

  const initialPeriod = Number(query.get('period') || '')
  const initialAssignment = Number(query.get('teacher_assignment') || '')

  const [periods, setPeriods] = useState<Period[]>([])
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])

  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(Number.isFinite(initialPeriod) && initialPeriod > 0 ? initialPeriod : null)
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(Number.isFinite(initialAssignment) && initialAssignment > 0 ? initialAssignment : null)

  const [requestType, setRequestType] = useState<EditRequestType>('FULL')
  const [reason, setReason] = useState('')
  const [requestedUntil, setRequestedUntil] = useState('')
  const [selectedEnrollments, setSelectedEnrollments] = useState<Set<number>>(new Set())

  const [students, setStudents] = useState<GradebookStudent[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)

  const [myRequests, setMyRequests] = useState<EditRequest[]>([])
  const [loadingMyRequests, setLoadingMyRequests] = useState(false)

  const [pendingRequests, setPendingRequests] = useState<EditRequest[]>([])
  const [loadingPending, setLoadingPending] = useState(false)

  const [adminFilterPeriodId, setAdminFilterPeriodId] = useState<number | null>(
    Number.isFinite(initialPeriod) && initialPeriod > 0 ? initialPeriod : null
  )

  const [decisionById, setDecisionById] = useState<Record<number, { valid_until: string; decision_note: string; submitting: boolean }>>({})

  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const formatDateTime = (value?: string | null) => {
    if (!value) return '—'
    const d = new Date(value)
    if (!Number.isFinite(d.getTime())) return '—'
    return d.toLocaleString()
  }

  const statusBadgeClass = (status: EditRequest['status']) => {
    return status === 'APPROVED'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900/40'
      : status === 'REJECTED'
      ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-200 dark:border-rose-900/40'
      : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900/40'
  }

  const periodNameById = useMemo(() => {
    const map = new Map<number, string>()
    periods.forEach((p) => map.set(p.id, p.name))
    return map
  }, [periods])

  const assignmentLabelById = useMemo(() => {
    const map = new Map<number, string>()
    assignments.forEach((a) => {
      const group = a.group_name ? a.group_name : `Grupo ${a.group}`
      const subject = a.subject_name || a.academic_load_name || `Carga ${a.academic_load}`
      map.set(a.id, `${group} • ${subject}`)
    })
    return map
  }, [assignments])

  const loadTeacherContext = async () => {
    const [periodsRes, assignmentsRes] = await Promise.all([
      academicApi.listPeriods(),
      academicApi.listMyAssignments(),
    ])
    setPeriods(periodsRes.data)
    setAssignments(assignmentsRes.data)
  }

  const loadAdminContext = async () => {
    const periodsRes = await academicApi.listPeriods()
    setPeriods(periodsRes.data)
  }

  const refreshMyRequests = async () => {
    if (!isTeacher) return
    setLoadingMyRequests(true)
    try {
      const res = await academicApi.listMyEditRequests()
      setMyRequests(res.data.filter((r) => r.scope === 'GRADES').sort((a, b) => (a.created_at < b.created_at ? 1 : -1)))
    } catch {
      showToast('No se pudieron cargar tus solicitudes.', 'error')
    } finally {
      setLoadingMyRequests(false)
    }
  }

  const refreshPendingRequests = async () => {
    if (!isAdminLike) return
    setLoadingPending(true)
    try {
      const res = await academicApi.listEditRequests({
        status: 'PENDING',
        scope: 'GRADES',
        ...(adminFilterPeriodId ? { period: adminFilterPeriodId } : {}),
      })
      setPendingRequests(res.data.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)))
    } catch {
      showToast('No se pudieron cargar las solicitudes pendientes.', 'error')
    } finally {
      setLoadingPending(false)
    }
  }

  useEffect(() => {
    let mounted = true

    ;(async () => {
      try {
        if (isTeacher) {
          await loadTeacherContext()
          if (!mounted) return
          await refreshMyRequests()
        } else if (isAdminLike) {
          await loadAdminContext()
          if (!mounted) return
          await refreshPendingRequests()
        }
      } catch {
        showToast('No se pudo cargar la información inicial.', 'error')
      }
    })()

    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher, isAdminLike])

  useEffect(() => {
    if (!isAdminLike) return
    refreshPendingRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminFilterPeriodId, isAdminLike])

  useEffect(() => {
    let mounted = true

    const loadStudents = async () => {
      if (!isTeacher) return
      if (requestType !== 'PARTIAL') {
        setStudents([])
        setSelectedEnrollments(new Set())
        return
      }
      if (!selectedPeriodId || !selectedAssignmentId) {
        setStudents([])
        return
      }

      setLoadingStudents(true)
      try {
        const res = await academicApi.getGradebook(selectedAssignmentId, selectedPeriodId)
        if (!mounted) return
        setStudents(res.data.students || [])
      } catch {
        if (!mounted) return
        setStudents([])
        showToast('No se pudieron cargar los estudiantes de la planilla.', 'error')
      } finally {
        if (mounted) setLoadingStudents(false)
      }
    }

    loadStudents()

    return () => {
      mounted = false
    }
  }, [isTeacher, requestType, selectedAssignmentId, selectedPeriodId])

  const toggleEnrollment = (enrollmentId: number) => {
    setSelectedEnrollments((prev) => {
      const next = new Set(prev)
      if (next.has(enrollmentId)) next.delete(enrollmentId)
      else next.add(enrollmentId)
      return next
    })
  }

  const submitRequest = async () => {
    if (!isTeacher) return
    if (!selectedPeriodId || !selectedAssignmentId) {
      showToast('Selecciona periodo y asignación.', 'error')
      return
    }

    const trimmedReason = reason.trim()
    if (!trimmedReason) {
      showToast('Describe la justificación de la solicitud.', 'error')
      return
    }

    if (requestType === 'PARTIAL' && selectedEnrollments.size === 0) {
      showToast('Selecciona al menos un estudiante.', 'error')
      return
    }

    let requestedUntilIso: string | null = null
    if (requestedUntil) {
      const d = new Date(requestedUntil)
      if (!Number.isFinite(d.getTime())) {
        showToast('Fecha/hora inválida.', 'error')
        return
      }
      requestedUntilIso = d.toISOString()
    }

    setSubmitting(true)
    try {
      await academicApi.createEditRequest({
        scope: 'GRADES',
        request_type: requestType,
        period: selectedPeriodId,
        teacher_assignment: selectedAssignmentId,
        requested_until: requestedUntilIso,
        reason: trimmedReason,
        enrollment_ids: requestType === 'PARTIAL' ? Array.from(selectedEnrollments) : undefined,
      })

      setReason('')
      setRequestedUntil('')
      setSelectedEnrollments(new Set())
      showToast('Solicitud enviada.', 'success')
      await refreshMyRequests()
    } catch {
      showToast('No se pudo enviar la solicitud.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const setDecision = (id: number, patch: Partial<{ valid_until: string; decision_note: string; submitting: boolean }>) => {
    setDecisionById((prev) => ({
      ...prev,
      [id]: {
        valid_until: prev[id]?.valid_until ?? '',
        decision_note: prev[id]?.decision_note ?? '',
        submitting: prev[id]?.submitting ?? false,
        ...patch,
      },
    }))
  }

  const approve = async (r: EditRequest) => {
    const d = decisionById[r.id]
    if (!d?.valid_until) {
      showToast('Define “Válida hasta” para aprobar.', 'error')
      return
    }

    setDecision(r.id, { submitting: true })
    try {
      const dIso = new Date(d.valid_until)
      if (!Number.isFinite(dIso.getTime())) {
        showToast('Fecha/hora inválida.', 'error')
        return
      }
      await academicApi.approveEditRequest(r.id, {
        valid_until: dIso.toISOString(),
        decision_note: d.decision_note?.trim() || undefined,
      })
      showToast('Solicitud aprobada.', 'success')
      await refreshPendingRequests()
    } catch {
      showToast('No se pudo aprobar la solicitud.', 'error')
    } finally {
      setDecision(r.id, { submitting: false })
    }
  }

  const reject = async (r: EditRequest) => {
    const d = decisionById[r.id]

    setDecision(r.id, { submitting: true })
    try {
      await academicApi.rejectEditRequest(r.id, {
        decision_note: d?.decision_note?.trim() || undefined,
      })
      showToast('Solicitud rechazada.', 'success')
      await refreshPendingRequests()
    } catch {
      showToast('No se pudo rechazar la solicitud.', 'error')
    } finally {
      setDecision(r.id, { submitting: false })
    }
  }

  if (!isTeacher && !isAdminLike) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Solicitudes de edición (Notas)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 dark:text-slate-300">No tienes permisos para ver esta sección.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((t) => ({ ...t, isVisible: false }))}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 md:text-3xl">
            <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-950/30">
              <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-300 md:h-6 md:w-6" />
            </div>
            Solicitudes de edición (Notas)
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Crea solicitudes y consulta su estado.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="min-h-11 w-full sm:w-auto" variant="outline" onClick={() => navigate('/grades')}>Ir a Calificaciones</Button>
          {isTeacher ? (
            <Button className="min-h-11 w-full sm:w-auto" variant="outline" onClick={refreshMyRequests} disabled={loadingMyRequests}>Recargar</Button>
          ) : (
            <Button className="min-h-11 w-full sm:w-auto" variant="outline" onClick={refreshPendingRequests} disabled={loadingPending}>Recargar</Button>
          )}
        </div>
      </div>

      {isTeacher && (
        <Card>
          <CardHeader>
            <CardTitle>Nueva solicitud</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Periodo</label>
                <select
                  className={selectLikeClassName()}
                  value={selectedPeriodId ?? ''}
                  onChange={(e) => setSelectedPeriodId(e.target.value ? Number(e.target.value) : null)}
                  disabled={submitting}
                >
                  <option value="">Selecciona…</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.is_closed ? ' (Cerrado)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Asignación</label>
                <select
                  className={selectLikeClassName()}
                  value={selectedAssignmentId ?? ''}
                  onChange={(e) => setSelectedAssignmentId(e.target.value ? Number(e.target.value) : null)}
                  disabled={submitting}
                >
                  <option value="">Selecciona…</option>
                  {assignments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {assignmentLabelById.get(a.id) || `Asignación ${a.id}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 items-end gap-4 lg:grid-cols-2">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Tipo</label>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="inline-flex min-h-11 items-center gap-3 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
                    <input
                      type="radio"
                      name="grade-edit-request-type"
                      checked={requestType === 'FULL'}
                      onChange={() => setRequestType('FULL')}
                      disabled={submitting}
                      className="h-4 w-4"
                    />
                    Completa
                  </label>
                  <label className="inline-flex min-h-11 items-center gap-3 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
                    <input
                      type="radio"
                      name="grade-edit-request-type"
                      checked={requestType === 'PARTIAL'}
                      onChange={() => setRequestType('PARTIAL')}
                      disabled={submitting}
                      className="h-4 w-4"
                    />
                    Parcial
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Hasta (opcional)</label>
                <Input className="h-11" type="datetime-local" value={requestedUntil} onChange={(e) => setRequestedUntil(e.target.value)} disabled={submitting} />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Justificación</label>
              <textarea
                className={textareaClassName()}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={submitting}
                placeholder="Describe por qué necesitas reabrir la edición…"
              />
            </div>

            {requestType === 'PARTIAL' && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Estudiantes</div>
                <div className="mt-2 max-h-64 overflow-auto rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
                  {loadingStudents ? (
                    <div className="p-3 text-sm text-slate-600 dark:text-slate-300">Cargando estudiantes…</div>
                  ) : students.length === 0 ? (
                    <div className="p-3 text-sm text-slate-500 dark:text-slate-400">No hay estudiantes disponibles para esta planilla.</div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {students.map((s) => (
                        <label key={s.enrollment_id} className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm text-slate-800 dark:text-slate-200">
                          <input
                            type="checkbox"
                            checked={selectedEnrollments.has(s.enrollment_id)}
                            onChange={() => toggleEnrollment(s.enrollment_id)}
                            disabled={submitting}
                            className="h-4 w-4"
                          />
                          <span className="truncate">{s.student_name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={submitRequest} disabled={submitting} className="min-h-11 w-full bg-blue-600 hover:bg-blue-700 sm:w-auto">
                <Save className="mr-2 h-4 w-4" />
                {submitting ? 'Enviando…' : 'Enviar solicitud'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isTeacher && (
        <Card>
          <CardHeader>
            <CardTitle>Mis solicitudes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 xl:hidden">
              {loadingMyRequests ? (
                <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
                  Cargando…
                </div>
              ) : myRequests.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
                  No has creado solicitudes.
                </div>
              ) : (
                myRequests.map((r) => {
                  const detail =
                    r.status === 'APPROVED'
                      ? `Aprobada${r.decided_at ? ` (${formatDateTime(r.decided_at)})` : ''}`
                      : r.status === 'REJECTED'
                      ? `Rechazada${r.decided_at ? ` (${formatDateTime(r.decided_at)})` : ''}`
                      : 'Pendiente'

                  return (
                    <div
                      key={r.id}
                      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {periodNameById.get(r.period) || `Periodo ${r.period}`}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            {r.teacher_assignment
                              ? assignmentLabelById.get(r.teacher_assignment) || `Asignación ${r.teacher_assignment}`
                              : '—'}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusBadgeClass(r.status)}`}
                        >
                          {r.status}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="text-slate-500 dark:text-slate-400">Tipo</div>
                        <div className="text-slate-800 dark:text-slate-200 text-right">{r.request_type === 'FULL' ? 'Completa' : 'Parcial'}</div>

                        <div className="text-slate-500 dark:text-slate-400">Creada</div>
                        <div className="text-slate-800 dark:text-slate-200 text-right">{formatDateTime(r.created_at)}</div>
                      </div>

                      <div className="mt-3 text-sm text-slate-700 dark:text-slate-200">
                        {detail}
                      </div>

                      {r.decision_note ? (
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap">
                          {r.decision_note}
                        </div>
                      ) : null}

                      {r.request_type === 'PARTIAL' ? (
                        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                          Estudiantes: {(r.items ?? []).length}
                        </div>
                      ) : null}
                    </div>
                  )
                })
              )}
            </div>

            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 dark:text-slate-300 uppercase bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200 dark:from-slate-900 dark:to-slate-800 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Estado</th>
                    <th className="px-6 py-4 font-semibold">Periodo</th>
                    <th className="px-6 py-4 font-semibold">Asignación</th>
                    <th className="px-6 py-4 font-semibold">Tipo</th>
                    <th className="px-6 py-4 font-semibold">Detalle</th>
                    <th className="px-6 py-4 font-semibold">Creada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loadingMyRequests ? (
                    <tr className="bg-white dark:bg-slate-900/40">
                      <td className="px-6 py-6 text-slate-600 dark:text-slate-300" colSpan={6}>Cargando…</td>
                    </tr>
                  ) : myRequests.length === 0 ? (
                    <tr className="bg-white dark:bg-slate-900/40">
                      <td className="px-6 py-6 text-slate-600 dark:text-slate-300" colSpan={6}>No has creado solicitudes.</td>
                    </tr>
                  ) : (
                    myRequests.map((r) => {
                      const statusClass = statusBadgeClass(r.status)

                      const detail =
                        r.status === 'APPROVED'
                          ? `Aprobada${r.decided_at ? ` (${new Date(r.decided_at).toLocaleString()})` : ''}`
                          : r.status === 'REJECTED'
                          ? `Rechazada${r.decided_at ? ` (${new Date(r.decided_at).toLocaleString()})` : ''}`
                          : 'Pendiente'

                      return (
                        <tr key={r.id} className="bg-white hover:bg-slate-50/80 transition-colors dark:bg-slate-900/40 dark:hover:bg-slate-800/50">
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusClass}`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">{periodNameById.get(r.period) || `Periodo ${r.period}`}</td>
                          <td className="px-6 py-4">{r.teacher_assignment ? assignmentLabelById.get(r.teacher_assignment) || `Asignación ${r.teacher_assignment}` : '—'}</td>
                          <td className="px-6 py-4">{r.request_type === 'FULL' ? 'Completa' : 'Parcial'}</td>
                          <td className="px-6 py-4">
                            <div className="text-slate-700 dark:text-slate-200">{detail}</div>
                            {r.decision_note ? <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{r.decision_note}</div> : null}
                            {r.request_type === 'PARTIAL' ? <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Estudiantes: {(r.items ?? []).length}</div> : null}
                          </td>
                          <td className="px-6 py-4">{formatDateTime(r.created_at)}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {isAdminLike && (
        <Card>
          <CardHeader>
            <CardTitle>Solicitudes pendientes (Notas)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Filtrar por periodo</label>
                <select
                  className={selectLikeClassName()}
                  value={adminFilterPeriodId ?? ''}
                  onChange={(e) => setAdminFilterPeriodId(e.target.value ? Number(e.target.value) : null)}
                  disabled={loadingPending}
                >
                  <option value="">Todos</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.is_closed ? ' (Cerrado)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-3 xl:hidden">
              {loadingPending ? (
                <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
                  Cargando…
                </div>
              ) : pendingRequests.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
                  No hay solicitudes pendientes.
                </div>
              ) : (
                pendingRequests.map((r) => {
                  const decision = decisionById[r.id] || { valid_until: '', decision_note: '', submitting: false }
                  const disabled = !!decision.submitting
                  const periodName = periodNameById.get(r.period) || `Periodo ${r.period}`

                  return (
                    <div
                      key={r.id}
                      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {r.requested_by_name || r.requested_by}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            {periodName} • {r.request_type === 'FULL' ? 'Completa' : `Parcial (${(r.items ?? []).length})`}
                          </div>
                        </div>
                        <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900/40">
                          PENDING
                        </span>
                      </div>

                      <div className="mt-3 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                        {r.reason}
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Válida hasta</label>
                          <div className="mt-1">
                            <Input
                              className="h-11"
                              type="datetime-local"
                              value={decision.valid_until}
                              onChange={(e) => setDecision(r.id, { valid_until: e.target.value })}
                              disabled={disabled}
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Nota</label>
                          <div className="mt-1">
                            <Input
                              className="h-11"
                              value={decision.decision_note}
                              onChange={(e) => setDecision(r.id, { decision_note: e.target.value })}
                              disabled={disabled}
                              placeholder="Opcional"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button onClick={() => approve(r)} disabled={disabled} className="min-h-11 w-full bg-blue-600 hover:bg-blue-700 sm:w-auto">
                            Aprobar
                          </Button>
                          <Button variant="outline" onClick={() => reject(r)} disabled={disabled} className="min-h-11 w-full sm:w-auto">
                            Rechazar
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 dark:text-slate-300 uppercase bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200 dark:from-slate-900 dark:to-slate-800 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Solicitante</th>
                    <th className="px-6 py-4 font-semibold">Periodo</th>
                    <th className="px-6 py-4 font-semibold">Tipo</th>
                    <th className="px-6 py-4 font-semibold">Justificación</th>
                    <th className="px-6 py-4 font-semibold">Válida hasta</th>
                    <th className="px-6 py-4 font-semibold">Nota</th>
                    <th className="px-6 py-4 font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loadingPending ? (
                    <tr className="bg-white dark:bg-slate-900/40"><td className="px-6 py-6 text-slate-600 dark:text-slate-300" colSpan={7}>Cargando…</td></tr>
                  ) : pendingRequests.length === 0 ? (
                    <tr className="bg-white dark:bg-slate-900/40"><td className="px-6 py-6 text-slate-600 dark:text-slate-300" colSpan={7}>No hay solicitudes pendientes.</td></tr>
                  ) : (
                    pendingRequests.map((r) => {
                      const decision = decisionById[r.id] || { valid_until: '', decision_note: '', submitting: false }
                      const disabled = !!decision.submitting
                      const periodName = periodNameById.get(r.period) || `Periodo ${r.period}`

                      return (
                        <tr key={r.id} className="bg-white hover:bg-slate-50/80 transition-colors dark:bg-slate-900/40 dark:hover:bg-slate-800/50">
                          <td className="px-6 py-4">{r.requested_by_name || r.requested_by}</td>
                          <td className="px-6 py-4">{periodName}</td>
                          <td className="px-6 py-4">{r.request_type === 'FULL' ? 'Completa' : `Parcial (${(r.items ?? []).length})`}</td>
                          <td className="px-6 py-4 whitespace-pre-wrap text-slate-700 dark:text-slate-200">{r.reason}</td>
                          <td className="px-6 py-4">
                            <Input type="datetime-local" value={decision.valid_until} onChange={(e) => setDecision(r.id, { valid_until: e.target.value })} disabled={disabled} />
                          </td>
                          <td className="px-6 py-4">
                            <Input value={decision.decision_note} onChange={(e) => setDecision(r.id, { decision_note: e.target.value })} disabled={disabled} placeholder="Opcional" />
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              <Button onClick={() => approve(r)} disabled={disabled} className="bg-blue-600 hover:bg-blue-700">Aprobar</Button>
                              <Button variant="outline" onClick={() => reject(r)} disabled={disabled}>Rechazar</Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

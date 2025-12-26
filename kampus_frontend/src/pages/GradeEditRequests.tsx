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
  return 'flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
}

function textareaClassName() {
  return 'mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
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
        if (!mounted) return
        setLoadingStudents(false)
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
          <p className="text-slate-600">No tienes permisos para ver esta sección.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((t) => ({ ...t, isVisible: false }))}
      />

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ClipboardList className="h-6 w-6 text-blue-600" />
            </div>
            Solicitudes de edición (Notas)
          </h2>
          <p className="text-slate-500 mt-1">Crea solicitudes y consulta su estado.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/grades')}>Ir a Calificaciones</Button>
          {isTeacher ? (
            <Button variant="outline" onClick={refreshMyRequests} disabled={loadingMyRequests}>Recargar</Button>
          ) : (
            <Button variant="outline" onClick={refreshPendingRequests} disabled={loadingPending}>Recargar</Button>
          )}
        </div>
      </div>

      {isTeacher && (
        <Card>
          <CardHeader>
            <CardTitle>Nueva solicitud</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase">Periodo</label>
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
                <label className="block text-xs font-semibold text-slate-500 uppercase">Asignación</label>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase">Tipo</label>
                <div className="mt-2 flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-800">
                    <input
                      type="radio"
                      name="grade-edit-request-type"
                      checked={requestType === 'FULL'}
                      onChange={() => setRequestType('FULL')}
                      disabled={submitting}
                    />
                    Completa
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-800">
                    <input
                      type="radio"
                      name="grade-edit-request-type"
                      checked={requestType === 'PARTIAL'}
                      onChange={() => setRequestType('PARTIAL')}
                      disabled={submitting}
                    />
                    Parcial
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase">Hasta (opcional)</label>
                <Input type="datetime-local" value={requestedUntil} onChange={(e) => setRequestedUntil(e.target.value)} disabled={submitting} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase">Justificación</label>
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
                <div className="text-xs font-semibold text-slate-500 uppercase">Estudiantes</div>
                <div className="mt-2 max-h-64 overflow-auto rounded-md border border-slate-200 bg-white">
                  {loadingStudents ? (
                    <div className="p-3 text-sm text-slate-600">Cargando estudiantes…</div>
                  ) : students.length === 0 ? (
                    <div className="p-3 text-sm text-slate-500">No hay estudiantes disponibles para esta planilla.</div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {students.map((s) => (
                        <label key={s.enrollment_id} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-800">
                          <input
                            type="checkbox"
                            checked={selectedEnrollments.has(s.enrollment_id)}
                            onChange={() => toggleEnrollment(s.enrollment_id)}
                            disabled={submitting}
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
              <Button onClick={submitRequest} disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Estado</th>
                    <th className="px-6 py-4 font-semibold">Periodo</th>
                    <th className="px-6 py-4 font-semibold">Asignación</th>
                    <th className="px-6 py-4 font-semibold">Tipo</th>
                    <th className="px-6 py-4 font-semibold">Detalle</th>
                    <th className="px-6 py-4 font-semibold">Creada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingMyRequests ? (
                    <tr className="bg-white">
                      <td className="px-6 py-6 text-slate-600" colSpan={6}>Cargando…</td>
                    </tr>
                  ) : myRequests.length === 0 ? (
                    <tr className="bg-white">
                      <td className="px-6 py-6 text-slate-600" colSpan={6}>No has creado solicitudes.</td>
                    </tr>
                  ) : (
                    myRequests.map((r) => {
                      const statusClass =
                        r.status === 'APPROVED'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : r.status === 'REJECTED'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'

                      const detail =
                        r.status === 'APPROVED'
                          ? `Aprobada${r.decided_at ? ` (${new Date(r.decided_at).toLocaleString()})` : ''}`
                          : r.status === 'REJECTED'
                          ? `Rechazada${r.decided_at ? ` (${new Date(r.decided_at).toLocaleString()})` : ''}`
                          : 'Pendiente'

                      return (
                        <tr key={r.id} className="bg-white hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusClass}`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">{periodNameById.get(r.period) || `Periodo ${r.period}`}</td>
                          <td className="px-6 py-4">{r.teacher_assignment ? assignmentLabelById.get(r.teacher_assignment) || `Asignación ${r.teacher_assignment}` : '—'}</td>
                          <td className="px-6 py-4">{r.request_type === 'FULL' ? 'Completa' : 'Parcial'}</td>
                          <td className="px-6 py-4">
                            <div className="text-slate-700">{detail}</div>
                            {r.decision_note ? <div className="text-xs text-slate-500 mt-1">{r.decision_note}</div> : null}
                            {r.request_type === 'PARTIAL' ? <div className="text-xs text-slate-500 mt-1">Estudiantes: {(r.items ?? []).length}</div> : null}
                          </td>
                          <td className="px-6 py-4">{new Date(r.created_at).toLocaleString()}</td>
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase">Filtrar por periodo</label>
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
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
                <tbody className="divide-y divide-slate-100">
                  {loadingPending ? (
                    <tr className="bg-white"><td className="px-6 py-6 text-slate-600" colSpan={7}>Cargando…</td></tr>
                  ) : pendingRequests.length === 0 ? (
                    <tr className="bg-white"><td className="px-6 py-6 text-slate-600" colSpan={7}>No hay solicitudes pendientes.</td></tr>
                  ) : (
                    pendingRequests.map((r) => {
                      const decision = decisionById[r.id] || { valid_until: '', decision_note: '', submitting: false }
                      const disabled = !!decision.submitting
                      const periodName = periodNameById.get(r.period) || `Periodo ${r.period}`

                      return (
                        <tr key={r.id} className="bg-white hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4">{r.requested_by_name || r.requested_by}</td>
                          <td className="px-6 py-4">{periodName}</td>
                          <td className="px-6 py-4">{r.request_type === 'FULL' ? 'Completa' : `Parcial (${(r.items ?? []).length})`}</td>
                          <td className="px-6 py-4 whitespace-pre-wrap text-slate-700">{r.reason}</td>
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

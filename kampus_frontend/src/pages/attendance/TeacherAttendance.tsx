import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { ConfirmationModal } from '../../components/ui/ConfirmationModal'
import { Input } from '../../components/ui/Input'
import { Pill } from '../../components/ui/Pill'
import { Toast, type ToastType } from '../../components/ui/Toast'
import { academicApi, type AcademicYear, type Period, type TeacherAssignment } from '../../services/academic'
import {
  createAttendanceSession,
  deleteAttendanceSession,
  downloadAttendanceManualSheetPdf,
  flushAttendanceOfflineQueue,
  listAttendanceSessions,
  type AttendanceSession,
} from '../../services/attendance'

type AxiosLikeError = {
  response?: {
    status?: unknown
    data?: unknown
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getAxiosStatus(err: unknown): number | null {
  const anyErr = err as AxiosLikeError
  const status = anyErr.response?.status
  return typeof status === 'number' ? status : null
}

function getAxiosData(err: unknown): unknown {
  const anyErr = err as AxiosLikeError
  return anyErr.response?.data
}

function parseMinutesRemaining(data: unknown): number | null {
  if (!isRecord(data)) return null
  const raw = data.minutes_remaining
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') {
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function safeRandomUUID() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // ignore
  }
  // Fallback (not RFC4122, but good enough as idempotency key if crypto is unavailable)
  return `uuid_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function getTodayIsoDate(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

function getOrderingToggle(current: string, field: string) {
  if (current === field) return `-${field}`
  if (current === `-${field}`) return field
  return `-${field}`
}

export default function TeacherAttendance() {
  const navigate = useNavigate()

  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const [years, setYears] = useState<AcademicYear[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])

  const [selectedPeriod, setSelectedPeriod] = useState<number | ''>('')
  const [selectedAssignment, setSelectedAssignment] = useState<number | ''>('')
  const [classDate, setClassDate] = useState<string>(getTodayIsoDate())

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [queueStatus, setQueueStatus] = useState<{ flushed: number; remaining: number } | null>(null)

  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<AttendanceSession[]>([])
  const [sessionsCount, setSessionsCount] = useState(0)

  const [deletingSessionId, setDeletingSessionId] = useState<number | null>(null)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteModalSessionId, setDeleteModalSessionId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [ordering, setOrdering] = useState('-starts_at')
  const [downloadingSheet, setDownloadingSheet] = useState(false)

  const activeYearId = useMemo(() => {
    const active = years.find((y) => y.status === 'ACTIVE')
    return active?.id ?? years[0]?.id ?? null
  }, [years])

  const filteredPeriods = useMemo(() => {
    if (!activeYearId) return periods
    return periods.filter((p) => p.academic_year === activeYearId)
  }, [periods, activeYearId])

  const filteredAssignments = useMemo(() => {
    if (!activeYearId) return assignments
    return assignments.filter((a) => a.academic_year === activeYearId)
  }, [assignments, activeYearId])

  useEffect(() => {
    let mounted = true

    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const yearsRes = await academicApi.listYears()
        if (mounted) setYears(yearsRes.data)

        const periodsRes = await academicApi.listPeriods()
        if (mounted) setPeriods(periodsRes.data)

        const activeYear = yearsRes.data.find((y) => y.status === 'ACTIVE')
        const yearParam = activeYear ? activeYear.id : ''
        const assignmentsRes = await academicApi.listMyAssignments({ academic_year: yearParam })
        if (mounted) setAssignments(assignmentsRes.data)

        // sensible defaults
        const defaultPeriod = periodsRes.data.find((p) => !p.is_closed && (!activeYear || p.academic_year === activeYear.id))
        if (mounted && defaultPeriod) setSelectedPeriod(defaultPeriod.id)

        const defaultAssignment = assignmentsRes.data[0]
        if (mounted && defaultAssignment) setSelectedAssignment(defaultAssignment.id)
      } catch (err) {
        console.error(err)
        if (mounted) setError('No se pudo cargar la información de asistencias.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  const loadSessions = async () => {
    setSessionsLoading(true)
    setSessionsError(null)
    try {
      const res = await listAttendanceSessions({ page, page_size: pageSize, ordering })
      if (Array.isArray(res)) {
        // Fallback if backend returns a plain list.
        setSessions(res)
        setSessionsCount(res.length)
      } else {
        setSessions(res.results)
        setSessionsCount(res.count)
      }
    } catch (err) {
      console.error(err)
      setSessionsError('No se pudo cargar el historial de clases.')
    } finally {
      setSessionsLoading(false)
    }
  }

  useEffect(() => {
    // Once the page is loaded, fetch sessions for the table.
    if (loading) return
    loadSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, page, pageSize, ordering])

  const handleCreate = async () => {
    setError(null)
    setQueueStatus(null)

    if (!selectedPeriod) {
      setError('Selecciona un periodo.')
      return
    }
    if (!selectedAssignment) {
      setError('Selecciona una asignación.')
      return
    }

    setSubmitting(true)
    try {
      const session = await createAttendanceSession({
        teacher_assignment_id: Number(selectedAssignment),
        period_id: Number(selectedPeriod),
        class_date: classDate || undefined,
        client_uuid: safeRandomUUID(),
      })
      navigate(`/attendance/sessions/${session.id}`)
    } catch (err) {
      console.error(err)
      const statusCode = getAxiosStatus(err)
      const data = getAxiosData(err)
      const minutesRemaining = parseMinutesRemaining(data)

      const detail = isRecord(data) ? data.detail : null
      const detailText = typeof detail === 'string' ? detail : ''

      // Friendly message when backend blocks due to an already active session.
      if (statusCode === 400 && (minutesRemaining != null || detailText.toLowerCase().includes('asistencia activa'))) {
        const base = 'No puedes tener dos planillas de asistencia abiertas al mismo tiempo. Cierra la planilla actual y vuelve a intentarlo.'
        const withTime =
          minutesRemaining && minutesRemaining > 0
            ? `${base} Intenta de nuevo en ~${minutesRemaining} min.`
            : base
        setError(withTime)
        showToast(withTime, 'error')
      } else {
        const msg = 'No se pudo crear la clase. Verifica tu conexión y permisos.'
        setError(msg)
        showToast(msg, 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleFlushQueue = async () => {
    setError(null)
    try {
      const res = await flushAttendanceOfflineQueue()
      setQueueStatus(res)
    } catch (err) {
      console.error(err)
      setError('No se pudo reintentar la cola offline.')
    }
  }

  const handleDownloadManualSheet = async () => {
    setError(null)
    setQueueStatus(null)

    if (!selectedAssignment) {
      setError('Selecciona una asignación para descargar la planilla.')
      return
    }

    const assignment = filteredAssignments.find((a) => a.id === Number(selectedAssignment))
    if (!assignment?.group) {
      setError('No se pudo determinar el grupo de la asignación.')
      return
    }

    setDownloadingSheet(true)
    try {
      const blob = await downloadAttendanceManualSheetPdf({ group_id: assignment.group, columns: 24 })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      console.error(err)
      setError('No se pudo descargar la planilla. Verifica tu conexión y permisos.')
    } finally {
      setDownloadingSheet(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(sessionsCount / pageSize))

  const openRequestDeleteModal = (sessionId: number) => {
    setDeleteModalSessionId(sessionId)
    setDeleteModalOpen(true)
  }

  const handleRequestDeleteConfirmed = async () => {
    if (!deleteModalSessionId) return

    setDeletingSessionId(deleteModalSessionId)
    setError(null)
    try {
      const res = await deleteAttendanceSession(deleteModalSessionId)
      const msg = (res && typeof res.detail === 'string' && res.detail) ? res.detail : 'Solicitud enviada al administrador.'
      showToast(msg, 'success')
      await loadSessions()
    } catch (err) {
      console.error(err)
      const msg = 'No se pudo enviar la solicitud de eliminación. Verifica tu conexión y permisos.'
      setError(msg)
      showToast(msg, 'error')
    } finally {
      setDeletingSessionId(null)
      setDeleteModalOpen(false)
      setDeleteModalSessionId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Asistencias</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-slate-600 dark:text-slate-300">Cargando…</p>
        ) : (
          <div className="space-y-4">
            {error ? (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-rose-950/30 dark:text-rose-200">
                {error}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Periodo</label>
                <select
                  className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">Selecciona…</option>
                  {filteredPeriods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.is_closed ? '(Cerrado)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Asignación</label>
                <select
                  className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
                  value={selectedAssignment}
                  onChange={(e) => setSelectedAssignment(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">Selecciona…</option>
                  {filteredAssignments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.subject_name ?? 'Materia'} — {(a.grade_name ? `${a.grade_name} ` : '') + (a.group_name ?? 'Grupo')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Fecha (opcional)</label>
                <Input type="date" value={classDate} onChange={(e) => setClassDate(e.target.value)} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleCreate} disabled={submitting}>
                {submitting ? 'Creando…' : 'Crear clase y tomar asistencia'}
              </Button>
              <Button variant="outline" onClick={() => navigate('/attendance/stats')}>
                Ver reporte
              </Button>
              <Button variant="outline" onClick={handleDownloadManualSheet} disabled={downloadingSheet || !selectedAssignment}>
                {downloadingSheet ? 'Generando planilla…' : 'Descargar planilla (manual)'}
              </Button>
              <Button variant="outline" onClick={handleFlushQueue}>
                Reintentar envíos offline
              </Button>
            </div>

            {queueStatus ? (
              <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                Cola offline: enviados {queueStatus.flushed}, pendientes {queueStatus.remaining}
              </div>
            ) : null}

            {filteredAssignments.length === 0 ? (
              <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                No tienes asignaciones cargadas para el año activo.
              </div>
            ) : null}

            <div className="pt-2">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Historial de clases</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Ordenadas de la más reciente a la más antigua por defecto.</div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPage(1)
                    loadSessions()
                  }}
                  disabled={sessionsLoading}
                >
                  Actualizar
                </Button>
              </div>

              {sessionsError ? <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-200">{sessionsError}</div> : null}

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200 dark:text-slate-300 dark:from-slate-900 dark:to-slate-800 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-3">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-100"
                            onClick={() => {
                              setPage(1)
                              setOrdering(getOrderingToggle(ordering, 'class_date'))
                            }}
                          >
                            Fecha
                          </button>
                        </th>
                        <th className="px-4 py-3">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-100"
                            onClick={() => {
                              setPage(1)
                              setOrdering(getOrderingToggle(ordering, 'starts_at'))
                            }}
                          >
                            Inicio
                          </button>
                        </th>
                        <th className="px-4 py-3">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-100"
                            onClick={() => {
                              setPage(1)
                              setOrdering(getOrderingToggle(ordering, 'teacher_assignment__academic_load__subject__name'))
                            }}
                          >
                            Materia
                          </button>
                        </th>
                        <th className="px-4 py-3">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-100"
                            onClick={() => {
                              setPage(1)
                              setOrdering(getOrderingToggle(ordering, 'teacher_assignment__group__name'))
                            }}
                          >
                            Grado / Grupo
                          </button>
                        </th>
                        <th className="px-4 py-3">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-100"
                            onClick={() => {
                              setPage(1)
                              setOrdering(getOrderingToggle(ordering, 'sequence'))
                            }}
                          >
                            #
                          </button>
                        </th>
                        <th className="px-4 py-3">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-100"
                            onClick={() => {
                              setPage(1)
                              setOrdering(getOrderingToggle(ordering, 'locked_at'))
                            }}
                          >
                            Estado
                          </button>
                        </th>
                        <th className="px-4 py-3">Acciones</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {sessionsLoading ? (
                        <tr>
                          <td className="px-4 py-6 text-slate-600 dark:text-slate-300" colSpan={7}>
                            Cargando clases…
                          </td>
                        </tr>
                      ) : sessions.length === 0 ? (
                        <tr>
                          <td className="px-4 py-6 text-slate-600 dark:text-slate-300" colSpan={7}>
                            Aún no tienes clases registradas.
                          </td>
                        </tr>
                      ) : (
                        sessions.map((s) => (
                          <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                            <td className="px-4 py-3 whitespace-nowrap">{s.class_date}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(s.starts_at)}</td>
                            <td className="px-4 py-3">{s.subject_name || 'Materia'}</td>
                            <td className="px-4 py-3">{s.group_display || ((s.grade_name ? `${s.grade_name} ` : '') + (s.group_name || 'Grupo'))}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{s.sequence}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {s.locked_at ? (
                                <Pill text="Cerrada" className="bg-amber-50 text-amber-800 border-amber-200" />
                              ) : (
                                <Pill text="Abierta" className="bg-emerald-50 text-emerald-700 border-emerald-200" />
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex flex-wrap gap-2">
                                <Button variant="outline" onClick={() => navigate(`/attendance/sessions/${s.id}`)}>
                                  Abrir
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={() => openRequestDeleteModal(s.id)}
                                  disabled={deletingSessionId === s.id}
                                >
                                  {deletingSessionId === s.id ? 'Enviando…' : 'Eliminar'}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    Total: {sessionsCount} · Página {page} / {totalPages}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || sessionsLoading}>
                      Anterior
                    </Button>
                    <Button variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || sessionsLoading}>
                      Siguiente
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={() => setToast((prev) => ({ ...prev, isVisible: false }))}
        />

        <ConfirmationModal
          isOpen={deleteModalOpen}
          onClose={() => {
            if (deletingSessionId) return
            setDeleteModalOpen(false)
            setDeleteModalSessionId(null)
          }}
          onConfirm={handleRequestDeleteConfirmed}
          title="Eliminar planilla"
          description="Esto enviará una solicitud de eliminación al administrador y desactivará la planilla para ti."
          confirmText="Eliminar"
          cancelText="Cancelar"
          variant="destructive"
          loading={Boolean(deletingSessionId) && deletingSessionId === deleteModalSessionId}
        />
      </CardContent>
    </Card>
  )
}

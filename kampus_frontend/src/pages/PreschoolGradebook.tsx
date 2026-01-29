import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Save, ArrowLeft } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import type { AxiosError } from 'axios'
import {
  academicApi,
  type Period,
  type EditGrant,
  type TeacherAssignment,
  type PreschoolGradebookResponse,
  type PreschoolGradebookCellUpsert,
} from '../services/academic'
import { useAuthStore } from '../store/auth'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Toast, type ToastType } from '../components/ui/Toast'

type CellKey = `${number}:${number}`
const makeKey = (enrollmentId: number, achievementId: number): CellKey => `${enrollmentId}:${achievementId}`

type ApiErrorPayload = {
  detail?: unknown
  error?: unknown
}

function parseApiError(err: unknown, fallbackMessage: string): { status?: number; message: string } {
  const e = err as AxiosError<ApiErrorPayload>
  const status = e?.response?.status
  const data = e?.response?.data
  const raw = data?.detail ?? data?.error
  const message = raw === undefined || raw === null ? fallbackMessage : String(raw)
  return { status, message }
}

function isGradeWindowClosed(period: Period | null): boolean {
  if (!period) return false
  const until = period.grades_edit_until
  if (until) return Date.now() > new Date(until).getTime()
  if (!period.end_date) return false
  const fallback = new Date(`${period.end_date}T23:59:59`).getTime()
  return Date.now() > fallback
}

export default function PreschoolGradebook() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const params = useParams()

  const teacherAssignmentId = Number(params.teacherAssignmentId)
  const periodId = Number(params.periodId)

  const isTeacher = user?.role === 'TEACHER'
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [teacherAssignment, setTeacherAssignment] = useState<TeacherAssignment | null>(null)
  const [gradebook, setGradebook] = useState<PreschoolGradebookResponse | null>(null)
  const [blockedKeys, setBlockedKeys] = useState<Set<CellKey>>(new Set())

  const [periodMeta, setPeriodMeta] = useState<Period | null>(null)
  const [loadingPeriodMeta, setLoadingPeriodMeta] = useState(false)

  const [activeGradeGrant, setActiveGradeGrant] = useState<
    | null
    | {
        hasFull: boolean
        allowedEnrollments: Set<number>
        validUntil: string | null
      }
  >(null)
  const [loadingGradeGrant, setLoadingGradeGrant] = useState(false)

  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }, [])

  const pendingRef = useRef<Map<CellKey, number | null>>(new Map())
  const [pendingCount, setPendingCount] = useState(0)
  const autosaveTimerRef = useRef<number | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'scheduled' | 'saving' | 'saved' | 'error'>('idle')

  const sortedLabels = useMemo(() => {
    return (gradebook?.labels ?? []).slice().sort((x, y) => (x.order ?? 0) - (y.order ?? 0) || x.id - y.id)
  }, [gradebook?.labels])

  const cellValueByKey = useMemo(() => {
    const map = new Map<CellKey, number | null>()
    for (const c of gradebook?.cells ?? []) {
      map.set(makeKey(c.enrollment, c.achievement), c.qualitative_scale ?? null)
    }
    return map
  }, [gradebook?.cells])

  const canLoad = useMemo(() => {
    if (!isTeacher) return false
    if (!Number.isFinite(teacherAssignmentId) || teacherAssignmentId <= 0) return false
    if (!Number.isFinite(periodId) || periodId <= 0) return false
    return true
  }, [isTeacher, teacherAssignmentId, periodId])

  useEffect(() => {
    if (!isTeacher) return
    if (!Number.isFinite(periodId) || periodId <= 0) return

    let mounted = true
    setLoadingPeriodMeta(true)
    ;(async () => {
      try {
        const res = await academicApi.listPeriods()
        if (!mounted) return
        const found = (res.data ?? []).find((p) => p.id === periodId) ?? null
        setPeriodMeta(found)
      } catch {
        if (mounted) setPeriodMeta(null)
      } finally {
        if (mounted) setLoadingPeriodMeta(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [isTeacher, periodId])

  const gradeWindowClosed = useMemo(() => {
    if (!isTeacher) return false
    return isGradeWindowClosed(periodMeta)
  }, [isTeacher, periodMeta])

  const periodIsClosed = !!(gradebook?.period?.is_closed ?? periodMeta?.is_closed)

  const refreshGradeGrants = useCallback(async () => {
    if (!isTeacher) {
      setActiveGradeGrant(null)
      return
    }
    if (!Number.isFinite(teacherAssignmentId) || teacherAssignmentId <= 0) {
      setActiveGradeGrant(null)
      return
    }
    if (!Number.isFinite(periodId) || periodId <= 0) {
      setActiveGradeGrant(null)
      return
    }
    if (!gradeWindowClosed) {
      setActiveGradeGrant(null)
      return
    }

    setLoadingGradeGrant(true)
    try {
      const res = await academicApi.listMyEditGrants({
        scope: 'GRADES',
        period: periodId,
        teacher_assignment: teacherAssignmentId,
      })

      const now = Date.now()
      const grants = (res.data ?? []) as EditGrant[]
      const active = grants.filter((g) => new Date(g.valid_until).getTime() > now)
      const hasFull = active.some((g) => g.grant_type === 'FULL')

      const allowedEnrollments = new Set<number>()
      let maxValidUntil: string | null = null

      for (const g of active) {
        if (!maxValidUntil || new Date(g.valid_until).getTime() > new Date(maxValidUntil).getTime()) {
          maxValidUntil = g.valid_until
        }
        if (g.grant_type !== 'PARTIAL') continue
        for (const item of g.items ?? []) {
          allowedEnrollments.add(item.enrollment_id)
        }
      }

      setActiveGradeGrant({ hasFull, allowedEnrollments, validUntil: maxValidUntil })
    } catch {
      setActiveGradeGrant(null)
    } finally {
      setLoadingGradeGrant(false)
    }
  }, [gradeWindowClosed, isTeacher, periodId, teacherAssignmentId])

  useEffect(() => {
    refreshGradeGrants()
  }, [refreshGradeGrants])

  const canEditEnrollment = useCallback(
    (enrollmentId: number) => {
      if (periodIsClosed) return false
      if (!isTeacher) return true

      // Be conservative until period metadata is known.
      if (loadingPeriodMeta) return false

      if (!gradeWindowClosed) return true
      if (activeGradeGrant?.hasFull) return true
      return !!activeGradeGrant?.allowedEnrollments?.has(enrollmentId)
    },
    [
      activeGradeGrant?.allowedEnrollments,
      activeGradeGrant?.hasFull,
      gradeWindowClosed,
      isTeacher,
      loadingPeriodMeta,
      periodIsClosed,
    ]
  )

  const canEditAnyEnrollment = useMemo(() => {
    if (!gradebook) return true
    return gradebook.students.some((s) => canEditEnrollment(s.enrollment_id))
  }, [canEditEnrollment, gradebook])

  const editabilityLoading = loadingPeriodMeta || (gradeWindowClosed && loadingGradeGrant)

  const clearAutosaveTimer = useCallback(() => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearAutosaveTimer()
    }
  }, [clearAutosaveTimer])

  const loadGradebook = useCallback(async () => {
    if (!canLoad) return

    setLoading(true)
    try {
      const res = await academicApi.getPreschoolGradebook(teacherAssignmentId, periodId)
      setGradebook(res.data)
      setBlockedKeys(new Set())
      pendingRef.current.clear()
      setPendingCount(0)
      setForbidden(false)
    } catch (err: unknown) {
      const { status, message } = parseApiError(err, 'No se pudo abrir la planilla de preescolar')
      if (status === 403) {
        showToast('No autorizado para abrir esta planilla', 'error')
        setGradebook(null)
        setForbidden(true)
        return
      }
      showToast(message, 'error')
      setGradebook(null)
      setForbidden(false)
    } finally {
      setLoading(false)
    }
  }, [canLoad, periodId, showToast, teacherAssignmentId])

  useEffect(() => {
    loadGradebook()
  }, [loadGradebook])

  useEffect(() => {
    if (!isTeacher) return
    if (!Number.isFinite(teacherAssignmentId) || teacherAssignmentId <= 0) return

    let mounted = true
    ;(async () => {
      try {
        const res = await academicApi.listMyAssignments()
        if (!mounted) return
        setTeacherAssignment(res.data.find((a) => a.id === teacherAssignmentId) ?? null)
      } catch {
        if (!mounted) return
        setTeacherAssignment(null)
      }
    })()

    return () => {
      mounted = false
    }
  }, [isTeacher, teacherAssignmentId])

  const flushPending = useCallback(
    async (opts?: { silentSuccess?: boolean }) => {
      if (!gradebook) return

      if (periodIsClosed) {
        showToast('El periodo está cerrado; no se pueden registrar notas.', 'error')
        setSaveState('error')
        return
      }

      if (editabilityLoading) {
        showToast('Cargando permisos de edición...', 'info')
        setSaveState('scheduled')
        return
      }

      if (gradeWindowClosed && !canEditAnyEnrollment) {
        showToast('La ventana de edición está cerrada. Solicita un permiso de edición.', 'warning')
        setSaveState('error')
        return
      }

      if (pendingRef.current.size === 0) {
        setSaveState('idle')
        return
      }

      setSaving(true)
      setSaveState('saving')
      try {
        const grades: PreschoolGradebookCellUpsert[] = []
        for (const [key, qualitativeScaleId] of pendingRef.current.entries()) {
          const [enrollmentStr, achievementStr] = key.split(':')
          grades.push({
            enrollment: Number(enrollmentStr),
            achievement: Number(achievementStr),
            qualitative_scale: qualitativeScaleId,
          })
        }

        const res = await academicApi.bulkUpsertPreschoolGradebook({
          teacher_assignment: teacherAssignmentId,
          period: periodId,
          grades,
        })

        const blocked = res.data.blocked ?? []
        if (blocked.length > 0) {
          setBlockedKeys(new Set(blocked.map((b) => makeKey(b.enrollment, b.achievement))))
          showToast('Algunas celdas no se guardaron (ventana cerrada)', 'warning')
        } else {
          setBlockedKeys(new Set())
          if (!opts?.silentSuccess) {
            showToast('Cambios guardados', 'success')
          }
        }

        pendingRef.current.clear()
        setPendingCount(0)
        setLastSavedAt(Date.now())
        setSaveState('saved')
      } catch (err: unknown) {
        const { message } = parseApiError(err, 'Error al guardar cambios')
        showToast(message, 'error')
        setSaveState('error')
      } finally {
        setSaving(false)
      }
    },
    [
      canEditAnyEnrollment,
      editabilityLoading,
      gradeWindowClosed,
      gradebook,
      periodId,
      periodIsClosed,
      showToast,
      teacherAssignmentId,
    ]
  )

  const scheduleAutosave = useCallback(() => {
    clearAutosaveTimer()
    setSaveState('scheduled')

    autosaveTimerRef.current = window.setTimeout(() => {
      // If a save is already in-flight, try again shortly.
      if (saving) {
        scheduleAutosave()
        return
      }
      void flushPending({ silentSuccess: true })
    }, 900)
  }, [clearAutosaveTimer, flushPending, saving])

  const handleSelectCell = useCallback(
    (enrollmentId: number, achievementId: number, qualitativeScaleId: number | null) => {
    const key = makeKey(enrollmentId, achievementId)
    pendingRef.current.set(key, qualitativeScaleId)
    setPendingCount(pendingRef.current.size)

      setSaveState('scheduled')
      scheduleAutosave()

    setGradebook((prev) => {
      if (!prev) return prev
      const nextCells = prev.cells.map((c) =>
        c.enrollment === enrollmentId && c.achievement === achievementId ? { ...c, qualitative_scale: qualitativeScaleId } : c
      )
      return { ...prev, cells: nextCells }
    })
    },
    [scheduleAutosave]
  )

  const savePending = useCallback(async () => {
    if (pendingRef.current.size === 0) {
      showToast('No hay cambios por guardar', 'info')
      return
    }
    clearAutosaveTimer()
    await flushPending({ silentSuccess: false })
  }, [clearAutosaveTimer, flushPending, showToast])

  if (!isTeacher) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Preescolar (Cualitativa)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">No autorizado.</p>
            <div className="mt-4">
              <Button onClick={() => navigate('/grades')}>Volver</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Preescolar (Cualitativa)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">No autorizado.</p>
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => navigate('/grades/preschool')}>
                Volver a Preescolar
              </Button>
              <Button onClick={() => navigate('/grades')}>Volver a Calificaciones</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <Toast message={toast.message} type={toast.type} isVisible={toast.isVisible} onClose={() => setToast((t) => ({ ...t, isVisible: false }))} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="outline" onClick={() => navigate('/grades/preschool')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Planilla Preescolar (Cualitativa)</h1>
            <p className="text-sm text-slate-600">
              {teacherAssignment?.grade_name ? `${teacherAssignment.grade_name} · ` : ''}
              {teacherAssignment?.group_name ?? (teacherAssignment ? `Grupo ${teacherAssignment.group}` : `Asignación ${teacherAssignmentId}`)}
              {' · '}
              {teacherAssignment?.subject_name ?? teacherAssignment?.academic_load_name ?? 'Asignatura'}
              {gradebook?.period?.name ? ` · ${gradebook.period.name}` : ` · Periodo ${periodId}`}
              {gradebook?.period?.is_closed ? ' (Cerrado)' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
            {saving || saveState === 'saving'
              ? 'Guardando…'
              : pendingCount > 0 || saveState === 'scheduled'
                ? 'Cambios pendientes (autoguardado)'
                : lastSavedAt
                  ? `Guardado: ${new Date(lastSavedAt).toLocaleTimeString()}`
                  : 'Autoguardado activo'}
          </div>
          <Button
            onClick={savePending}
            disabled={
              saving ||
              pendingCount === 0 ||
              loading ||
              periodIsClosed ||
              editabilityLoading ||
              (gradeWindowClosed && !canEditAnyEnrollment)
            }
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Guardando...' : `Guardar (${pendingCount})`}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Planilla</CardTitle>
        </CardHeader>
        <CardContent>
          {periodIsClosed ? (
            <div className="mb-4 p-3 rounded-md border border-amber-200 bg-amber-50 text-amber-900 text-sm">
              El periodo está cerrado; la planilla es de solo lectura.
            </div>
          ) : editabilityLoading ? (
            <div className="mb-4 p-3 rounded-md border border-slate-200 bg-slate-50 text-slate-700 text-sm">
              Cargando permisos de edición...
            </div>
          ) : gradeWindowClosed ? (
            <div className="mb-4 p-3 rounded-md border border-amber-200 bg-amber-50 text-amber-900 text-sm">
              <div>La ventana de edición está cerrada.</div>
              {activeGradeGrant?.hasFull ? (
                <div className="mt-1">Tienes permiso de edición (FULL).</div>
              ) : (activeGradeGrant?.allowedEnrollments?.size ?? 0) > 0 ? (
                <div className="mt-1">Tienes permiso parcial para algunos estudiantes.</div>
              ) : (
                <div className="mt-1">Solo lectura. Solicita un permiso de edición si necesitas modificar.</div>
              )}
              {activeGradeGrant?.validUntil ? (
                <div className="mt-1">Permiso vigente hasta: {new Date(activeGradeGrant.validUntil).toLocaleString()}.</div>
              ) : null}
            </div>
          ) : null}

          {!loading && gradebook && (gradebook.labels?.length ?? 0) === 0 ? (
            <div className="mb-4 p-3 rounded-md border border-red-200 bg-red-50 text-red-900 text-sm">
              No hay etiquetas cualitativas configuradas para preescolar en este año lectivo.
              <div className="mt-1 text-xs text-red-800">
                Configura la escala cualitativa (tipo QUALITATIVE) para el año, idealmente con nivel PRESCHOOL y marca una o más como default.
              </div>
            </div>
          ) : null}

          {!loading && gradebook && (gradebook.achievements?.length ?? 0) === 0 ? (
            <div className="mb-4 p-3 rounded-md border border-amber-200 bg-amber-50 text-amber-900 text-sm">
              <div className="font-medium">No hay logros configurados para este periodo.</div>
              <div className="mt-1 text-xs text-amber-800">
                Para poder registrar valoraciones, primero debes crear los logros (planeación) de la asignación en el periodo.
              </div>
              <div className="mt-3">
                <Button variant="outline" onClick={() => navigate('/planning')}>
                  Ir a Planeación
                </Button>
              </div>
            </div>
          ) : null}

          {loading ? (
            <p className="text-sm text-slate-600">Cargando planilla...</p>
          ) : !gradebook ? (
            <p className="text-sm text-slate-600">No se pudo cargar la planilla.</p>
          ) : (gradebook.achievements?.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-600">No hay logros para mostrar en este periodo.</p>
          ) : (
            <>
              {/* Mobile + tablet: modern card layout */}
              <div className="lg:hidden space-y-3">
                {gradebook.students.map((st) => {
                  const canEdit = canEditEnrollment(st.enrollment_id)
                  return (
                    <details
                      key={st.enrollment_id}
                      className="group rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/70 dark:bg-slate-950/40 shadow-sm"
                      open
                    >
                      <summary className="cursor-pointer list-none px-4 py-3 flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-900 dark:text-slate-100">{st.student_name}</div>
                          <div className="text-xs text-slate-600 dark:text-slate-300">
                            {canEdit ? 'Editable' : 'Solo lectura'}
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 group-open:hidden">Ver</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 hidden group-open:block">Ocultar</div>
                      </summary>

                      <div className="px-4 pb-4 space-y-3">
                        {gradebook.achievements.map((a) => {
                          const key = makeKey(st.enrollment_id, a.id)
                          const value = cellValueByKey.get(key) ?? null
                          const isBlocked = blockedKeys.has(key)
                          const disabled = !canEdit || saving || loading || editabilityLoading

                          return (
                            <div
                              key={a.id}
                              className={`rounded-xl border border-slate-200/60 dark:border-slate-800/60 p-3 ${
                                isBlocked ? 'bg-red-50/70 dark:bg-red-950/20' : 'bg-white/60 dark:bg-slate-950/30'
                              }`}
                            >
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                {a.dimension_name ?? 'Dimensión'}
                              </div>
                              <div className="text-sm text-slate-900 dark:text-slate-100 mt-0.5">{a.description}</div>

                              <div className="mt-2">
                                <select
                                  className={`w-full rounded-xl border border-slate-200/70 dark:border-slate-800/70 bg-white dark:bg-slate-900 px-3 py-2 text-sm ${
                                    disabled ? 'opacity-60 cursor-not-allowed' : ''
                                  }`}
                                  value={value ?? ''}
                                  disabled={disabled}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    handleSelectCell(st.enrollment_id, a.id, v ? Number(v) : null)
                                  }}
                                >
                                  <option value="">—</option>
                                  {(sortedLabels.length ?? 0) === 0 ? (
                                    <option value="" disabled>
                                      (Sin etiquetas configuradas)
                                    </option>
                                  ) : null}
                                  {sortedLabels.map((lbl) => (
                                    <option key={lbl.id} value={lbl.id}>
                                      {lbl.name}
                                    </option>
                                  ))}
                                </select>

                                {!canEdit ? (
                                  <div className="mt-1 text-xs text-slate-500">Solo lectura</div>
                                ) : isBlocked ? (
                                  <div className="mt-1 text-xs text-red-700 dark:text-red-300">No se guardó</div>
                                ) : null}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </details>
                  )
                })}
              </div>

              {/* Desktop: wide table */}
              <div className="hidden lg:block overflow-auto max-h-[75vh] rounded-2xl ring-1 ring-slate-200/60 dark:ring-slate-800/60">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50/80 dark:bg-slate-900/40 sticky top-0 z-10">
                    <tr>
                      <th className="text-left px-4 py-3 sticky left-0 bg-slate-50/90 dark:bg-slate-900/60 z-20">
                        Estudiante
                      </th>
                      {gradebook.achievements.map((a) => (
                        <th key={a.id} className="text-left px-4 py-3 min-w-[260px]">
                          <div className="font-medium">{a.dimension_name ?? 'Dimensión'}</div>
                          <div className="text-xs text-slate-600 dark:text-slate-300">{a.description}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                    {gradebook.students.map((st) => (
                      <tr key={st.enrollment_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/30">
                        <td className="px-4 py-3 sticky left-0 bg-white dark:bg-slate-950 z-10 whitespace-nowrap">
                          {st.student_name}
                        </td>
                        {gradebook.achievements.map((a) => {
                          const key = makeKey(st.enrollment_id, a.id)
                          const value = cellValueByKey.get(key) ?? null
                          const isBlocked = blockedKeys.has(key)
                          const canEdit = canEditEnrollment(st.enrollment_id)
                          const disabled = !canEdit || saving || loading || editabilityLoading

                          return (
                            <td key={a.id} className={`px-4 py-3 ${isBlocked ? 'bg-red-50/70 dark:bg-red-950/20' : ''}`}>
                              <select
                                className={`w-full rounded-xl border border-slate-200/70 dark:border-slate-800/70 bg-white dark:bg-slate-900 px-3 py-2 ${
                                  disabled ? 'opacity-60 cursor-not-allowed' : ''
                                }`}
                                value={value ?? ''}
                                disabled={disabled}
                                onChange={(e) => {
                                  const v = e.target.value
                                  handleSelectCell(st.enrollment_id, a.id, v ? Number(v) : null)
                                }}
                              >
                                <option value="">—</option>
                                {(sortedLabels.length ?? 0) === 0 ? (
                                  <option value="" disabled>
                                    (Sin etiquetas configuradas)
                                  </option>
                                ) : null}
                                {sortedLabels.map((lbl) => (
                                  <option key={lbl.id} value={lbl.id}>
                                    {lbl.name}
                                  </option>
                                ))}
                              </select>

                              {!canEdit ? (
                                <div className="mt-1 text-xs text-slate-500">Solo lectura</div>
                              ) : isBlocked ? (
                                <div className="mt-1 text-xs text-red-700 dark:text-red-300">No se guardó</div>
                              ) : null}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

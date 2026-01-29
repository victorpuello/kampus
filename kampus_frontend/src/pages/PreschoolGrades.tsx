import { useCallback, useEffect, useMemo, useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { academicApi, type AcademicYear, type GradebookAvailableSheet, type Period } from '../services/academic'
import { useAuthStore } from '../store/auth'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Toast, type ToastType } from '../components/ui/Toast'

function isCurrentPeriod(period: Period): boolean {
  const start = new Date(`${period.start_date}T00:00:00`)
  const end = new Date(`${period.end_date}T23:59:59`)
  const now = new Date()
  return now.getTime() >= start.getTime() && now.getTime() <= end.getTime()
}

export default function PreschoolGrades() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  const isTeacher = user?.role === 'TEACHER'

  const [years, setYears] = useState<AcademicYear[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)

  const [availableSheets, setAvailableSheets] = useState<GradebookAvailableSheet[]>([])
  const [loadingAvailable, setLoadingAvailable] = useState(false)
  const [preschoolAccess, setPreschoolAccess] = useState<'unknown' | 'ok' | 'no-preschool'>('unknown')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)
  const [search, setSearch] = useState('')

  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }, [])

  const activeYear = useMemo(() => years.find((y) => y.status === 'ACTIVE') ?? null, [years])
  const selectedPeriod = useMemo(() => periods.find((p) => p.id === selectedPeriodId) ?? null, [periods, selectedPeriodId])

  const planningBadge = (achievementsCount: number) => {
    const ok = (achievementsCount ?? 0) > 0
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
          ok
            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-900/60'
            : 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-900/60'
        }`}
      >
        {ok ? 'Planeación OK' : 'Sin logros'}
      </span>
    )
  }

  useEffect(() => {
    if (!isTeacher) return

    let mounted = true
    ;(async () => {
      try {
        const [yearsRes, periodsRes] = await Promise.all([academicApi.listYears(), academicApi.listPeriods()])
        if (!mounted) return
        setYears(yearsRes.data)
        setPeriods(periodsRes.data)
      } catch (e) {
        console.error(e)
        showToast('No se pudo cargar la configuración académica', 'error')
      }
    })()

    return () => {
      mounted = false
    }
  }, [isTeacher, showToast])

  useEffect(() => {
    if (!isTeacher) return
    if (selectedPeriodId) return
    const current = periods.find((p) => isCurrentPeriod(p))
    if (current) setSelectedPeriodId(current.id)
  }, [isTeacher, periods, selectedPeriodId])

  const loadAvailable = useCallback(
    async (periodId: number) => {
      setLoadingAvailable(true)
      try {
        const res = await academicApi.listAvailablePreschoolGradeSheets(periodId)
        const results = res.data.results || []
        setAvailableSheets(results)
        setPreschoolAccess(results.length > 0 ? 'ok' : 'no-preschool')
        setPage(1)
        setSearch('')
      } catch (e) {
        console.error(e)
        setAvailableSheets([])
        setPreschoolAccess('no-preschool')
        setPage(1)
        setSearch('')
        showToast('No se pudieron cargar las planillas de preescolar', 'error')
      } finally {
        setLoadingAvailable(false)
      }
    },
    [showToast]
  )

  const filteredSheets = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return availableSheets
    return availableSheets.filter((s) => {
      const haystack = `${s.grade_name ?? ''} ${s.group_name ?? ''} ${s.subject_name ?? ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [availableSheets, search])

  useEffect(() => {
    setPage(1)
  }, [search, pageSize])

  const totalPages = useMemo(() => {
    const total = filteredSheets.length
    return Math.max(1, Math.ceil(total / pageSize))
  }, [filteredSheets.length, pageSize])

  const clampedPage = useMemo(() => {
    return Math.min(Math.max(1, page), totalPages)
  }, [page, totalPages])

  useEffect(() => {
    if (page !== clampedPage) setPage(clampedPage)
  }, [clampedPage, page])

  const pagedSheets = useMemo(() => {
    const start = (clampedPage - 1) * pageSize
    const end = start + pageSize
    return filteredSheets.slice(start, end)
  }, [filteredSheets, clampedPage, pageSize])

  const paginationControls = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-slate-600 dark:text-slate-300">
          Mostrando {filteredSheets.length === 0 ? 0 : (clampedPage - 1) * pageSize + 1}–
          {Math.min(clampedPage * pageSize, filteredSheets.length)} de {filteredSheets.length}
          {search.trim() ? (
            <span className="ml-2 text-slate-500 dark:text-slate-400">(filtrado)</span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs text-slate-600 dark:text-slate-300">Por página</span>
            <select
              className="w-24 rounded-xl border border-slate-200/70 dark:border-slate-800/70 px-2 py-1 bg-white dark:bg-slate-900 text-sm"
              value={pageSize}
              onChange={(e) => {
                const v = Number(e.target.value)
                setPageSize(Number.isFinite(v) && v > 0 ? v : 5)
              }}
            >
              {[5, 10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={clampedPage <= 1}
            >
              <span className="sm:hidden">Ant.</span>
              <span className="hidden sm:inline">Anterior</span>
            </Button>

            <div className="text-xs text-slate-600 dark:text-slate-300 text-center tabular-nums">
              {clampedPage}/{totalPages}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={clampedPage >= totalPages}
            >
              <span className="sm:hidden">Sig.</span>
              <span className="hidden sm:inline">Siguiente</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  useEffect(() => {
    if (!isTeacher) return
    if (!selectedPeriodId) return
    loadAvailable(selectedPeriodId)
  }, [isTeacher, loadAvailable, selectedPeriodId])

  const showNoPreschoolAccess = isTeacher && preschoolAccess === 'no-preschool' && !!selectedPeriodId && !loadingAvailable

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
              <Button variant="outline" onClick={() => navigate(-1)}>Volver</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <Toast message={toast.message} type={toast.type} isVisible={toast.isVisible} onClose={() => setToast((t) => ({ ...t, isVisible: false }))} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-950/30 flex items-center justify-center">
            <GraduationCap className="h-5 w-5 text-blue-600 dark:text-blue-300" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Preescolar (Cualitativa)</h1>
            <p className="text-sm text-slate-600">Planillas cualitativas independientes</p>
          </div>
        </div>
        <Button className="w-full sm:w-auto" variant="outline" onClick={() => navigate(-1)}>
          Volver
        </Button>
      </div>

      <Card className="rounded-2xl border-slate-200/60 bg-white/70 dark:border-slate-800/60 dark:bg-slate-950/40 shadow-sm">
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Periodo</label>
              <select
                className="w-full rounded-xl border border-slate-200/70 dark:border-slate-800/70 px-3 py-2 bg-white dark:bg-slate-900"
                value={selectedPeriodId ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setSelectedPeriodId(v ? Number(v) : null)
                }}
              >
                <option value="">Selecciona...</option>
                {periods
                  .filter((p) => (activeYear ? p.academic_year === activeYear.id : true))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.is_closed ? '(Cerrado)' : ''}
                    </option>
                  ))}
              </select>
              {selectedPeriod && !isCurrentPeriod(selectedPeriod) && (
                <p className="text-xs text-amber-700 mt-1">Solo se puede diligenciar el periodo actual.</p>
              )}

              {showNoPreschoolAccess ? (
                <p className="text-xs text-slate-600 mt-2">
                  No tienes asignaciones de <span className="font-medium">preescolar</span>. Esta pantalla solo aplica para docentes de preescolar.
                </p>
              ) : null}
            </div>

            <div className="md:col-span-2 flex items-end justify-end">
              <Button
                variant="outline"
                onClick={() => selectedPeriodId && loadAvailable(selectedPeriodId)}
                disabled={!selectedPeriodId || loadingAvailable}
                className="w-full md:w-auto"
              >
                {loadingAvailable ? 'Cargando...' : 'Refrescar listado'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200/60 bg-white/70 dark:border-slate-800/60 dark:bg-slate-950/40 shadow-sm">
        <CardHeader>
          <CardTitle>Planillas disponibles</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingAvailable ? (
            <p className="text-sm text-slate-600">Cargando...</p>
          ) : showNoPreschoolAccess ? (
            <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/70 dark:bg-slate-950/40 p-4">
              <p className="text-sm text-slate-700 dark:text-slate-200">No autorizado.</p>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                Tu usuario no tiene asignaciones en grupos de preescolar.
              </p>
              <div className="mt-4">
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => navigate(-1)}>
                  Volver
                </Button>
              </div>
            </div>
          ) : availableSheets.length === 0 ? (
            <p className="text-sm text-slate-600">No hay planillas preescolar para este periodo.</p>
          ) : (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Buscar</label>
                <input
                  className="w-full rounded-xl border border-slate-200/70 dark:border-slate-800/70 px-3 py-2 bg-white/80 dark:bg-slate-900"
                  placeholder="Grado, grupo o asignatura..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="mb-4">{paginationControls}</div>

              {/* Mobile + tablet */}
              <div className="lg:hidden space-y-3">
                {pagedSheets.map((s) => {
                  const percent = s.completion?.percent ?? 0
                  const hasPlanning = (s.achievements_count ?? 0) > 0
                  return (
                    <div
                      key={s.teacher_assignment_id}
                      className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/70 dark:bg-slate-950/40 shadow-sm p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {s.grade_name} · {s.group_name}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                            {s.subject_name ?? '—'}
                          </div>
                        </div>

                        <div className="shrink-0">{planningBadge(s.achievements_count ?? 0)}</div>
                      </div>

                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                          <span>Avance</span>
                          <span className="font-medium">{percent}%</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-200/70 dark:bg-slate-800/70 overflow-hidden">
                          <div className="h-full rounded-full bg-blue-600 dark:bg-blue-400" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
                        </div>
                      </div>

                      {!hasPlanning ? (
                        <div className="mt-3 text-xs text-amber-700 dark:text-amber-200">
                          Falta planeación/logros para este periodo.
                        </div>
                      ) : null}

                      <div className="mt-4">
                        <Button
                          className="w-full"
                          onClick={() => {
                            if (!selectedPeriodId) return
                            navigate(`/grades/preschool/${s.teacher_assignment_id}/${selectedPeriodId}`)
                          }}
                          disabled={!selectedPeriodId}
                        >
                          Abrir planilla
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block overflow-auto rounded-2xl ring-1 ring-slate-200/60 dark:ring-slate-800/60">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50/80 dark:bg-slate-900/40">
                    <tr>
                      <th className="text-left px-4 py-3">Grado</th>
                      <th className="text-left px-4 py-3">Grupo</th>
                      <th className="text-left px-4 py-3">Asignatura</th>
                      <th className="text-left px-4 py-3">Planeación</th>
                      <th className="text-right px-4 py-3">% avance</th>
                      <th className="text-right px-4 py-3">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                    {pagedSheets.map((s) => (
                      <tr key={s.teacher_assignment_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/30">
                        <td className="px-4 py-3">{s.grade_name}</td>
                        <td className="px-4 py-3">{s.group_name}</td>
                        <td className="px-4 py-3">{s.subject_name ?? '-'}</td>
                        <td className="px-4 py-3">{planningBadge(s.achievements_count ?? 0)}</td>
                        <td className="px-4 py-3 text-right">{s.completion?.percent ?? 0}%</td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            onClick={() => {
                              if (!selectedPeriodId) return
                              navigate(`/grades/preschool/${s.teacher_assignment_id}/${selectedPeriodId}`)
                            }}
                            disabled={!selectedPeriodId}
                          >
                            Abrir
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4">{paginationControls}</div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

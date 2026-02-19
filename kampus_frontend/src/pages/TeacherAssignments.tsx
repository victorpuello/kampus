import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Label } from '../components/ui/Label'
import { useAuthStore } from '../store/auth'
import { academicApi, type AcademicYear, type Period, type TeacherAssignment } from '../services/academic'
import { downloadAttendanceManualSheetPdf } from '../services/attendance'

type AxiosLikeError = {
  response?: {
    status?: unknown
  }
}

export default function TeacherAssignments() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.role === 'TEACHER'

  const [loading, setLoading] = useState(false)
  const [loadingYears, setLoadingYears] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])

  const [periods, setPeriods] = useState<Period[]>([])
  const [loadingPeriods, setLoadingPeriods] = useState(false)

  const [years, setYears] = useState<AcademicYear[]>([])
  const [yearId, setYearId] = useState<number | ''>('')

  const pageSize = 10
  const [page, setPage] = useState(1)

  const [isPlanillaModalOpen, setIsPlanillaModalOpen] = useState(false)
  const [planillaType, setPlanillaType] = useState<'attendance' | 'grades'>('attendance')
  const [selectedAssignment, setSelectedAssignment] = useState<TeacherAssignment | null>(null)
  const [attendanceColumns, setAttendanceColumns] = useState(24)
  const [gradeNoteColumns, setGradeNoteColumns] = useState(3)
  const [gradePeriodId, setGradePeriodId] = useState<number | ''>('')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    let mounted = true
    if (!isTeacher) return

    setLoadingYears(true)
    academicApi
      .listYears()
      .then((res) => {
        if (!mounted) return
        const items = res.data ?? []
        setYears(items)

        // Default to ACTIVE year.
        const active = items.find((y) => y.status === 'ACTIVE')
        const fallback = items[0]
        const nextId = active?.id ?? fallback?.id

        if (nextId) {
          setYearId((prev) => (prev === '' ? nextId : prev))
        }
      })
      .catch(() => {
        if (!mounted) return
        // Keep page usable; year filter will show empty.
        setYears([])
      })
      .finally(() => {
        if (!mounted) return
        setLoadingYears(false)
      })

    return () => {
      mounted = false
    }
  }, [isTeacher])

  useEffect(() => {
    // Reset pagination when scope changes.
    setPage(1)
  }, [yearId])

  useEffect(() => {
    let mounted = true
    if (!isTeacher) return
    if (!yearId) return

    setLoadingPeriods(true)
    academicApi
      .listPeriods()
      .then((res) => {
        if (!mounted) return
        setPeriods(res.data ?? [])
      })
      .catch(() => {
        if (!mounted) return
        setPeriods([])
      })
      .finally(() => {
        if (!mounted) return
        setLoadingPeriods(false)
      })

    return () => {
      mounted = false
    }
  }, [isTeacher, yearId])

  useEffect(() => {
    let mounted = true

    if (!isTeacher) return

    // Wait until a year is selected (we default it from ACTIVE year).
    if (!yearId) return

    setLoading(true)
    setError(null)

    academicApi
      .listMyAssignments({ academic_year: Number(yearId) })
      .then((res) => {
        if (!mounted) return
        setAssignments(res.data)
      })
      .catch((err: unknown) => {
        if (!mounted) return
        const status = (err as AxiosLikeError).response?.status
        if (status === 403) setError('No tienes permisos para ver esta información.')
        else setError('No se pudo cargar la asignación académica.')
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [isTeacher, yearId])

  const rows = useMemo(() => {
    return assignments.map((a) => {
      const subject = a.subject_name ?? '—'
      const area = a.area_name ?? null
      const group = a.group_name ?? '—'
      const grade = a.grade_name ?? null
      const year = a.academic_year_year ?? null
      const hours = a.hours_per_week ?? null

      const subjectLabel =
        [a.area_name, a.subject_name].filter(Boolean).join(' - ') || a.academic_load_name || subject

      return {
        id: a.id,
        subject,
        subjectLabel,
        area,
        group,
        grade,
        year,
        hours,
        raw: a,
      }
    })
  }, [assignments])

  const myTeacherName = useMemo(() => {
    const last = (user?.last_name || '').trim()
    const first = (user?.first_name || '').trim()
    return `${last} ${first}`.trim()
  }, [user?.first_name, user?.last_name])

  const periodsForYear = useMemo(() => {
    if (!yearId) return []
    return periods.filter((p) => p.academic_year === Number(yearId))
  }, [periods, yearId])

  const openPdfBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank', 'noopener,noreferrer')
    if (!w) {
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const handleOpenPlanilla = (type: 'attendance' | 'grades', assignment: TeacherAssignment) => {
    setPlanillaType(type)
    setSelectedAssignment(assignment)
    setDownloading(false)

    if (type === 'attendance') {
      setAttendanceColumns(24)
    } else {
      setGradeNoteColumns(3)
      const available = periodsForYear
      setGradePeriodId(available.length > 0 ? available[0].id : '')
    }

    setIsPlanillaModalOpen(true)
  }

  const handleDownloadPlanilla = async () => {
    if (!selectedAssignment) return

    try {
      setDownloading(true)

      if (planillaType === 'attendance') {
        const blob = await downloadAttendanceManualSheetPdf({
          group_id: selectedAssignment.group,
          columns: attendanceColumns,
        })
        openPdfBlob(blob, `planilla_asistencia_grupo_${selectedAssignment.group}.pdf`)
        return
      }

      const subject =
        [selectedAssignment.area_name, selectedAssignment.subject_name].filter(Boolean).join(' - ') ||
        selectedAssignment.academic_load_name ||
        ''
      const teacher = (selectedAssignment.teacher_name || myTeacherName).trim() || undefined

      const period = gradePeriodId !== '' ? Number(gradePeriodId) : undefined
      const res = await academicApi.downloadGradeReportSheetPdf(selectedAssignment.group, {
        period,
        subject: subject || undefined,
        teacher,
        columns: gradeNoteColumns,
      })
      openPdfBlob(res.data as unknown as Blob, `planilla_notas_grupo_${selectedAssignment.group}.pdf`)
    } catch (e) {
      console.error(e)
    } finally {
      setDownloading(false)
      setIsPlanillaModalOpen(false)
    }
  }


  const paginated = useMemo(() => {
    const total = rows.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.max(1, Math.min(page, totalPages))

    const startIdx = (safePage - 1) * pageSize
    const endIdx = Math.min(total, startIdx + pageSize)

    return {
      total,
      totalPages,
      page: safePage,
      startIdx,
      endIdx,
      items: rows.slice(startIdx, endIdx),
    }
  }, [rows, page, pageSize])

  if (!isTeacher) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Asignación Académica</CardTitle>
        </CardHeader>
        <CardContent>
            <p className="text-slate-600 dark:text-slate-300">Esta pantalla es solo para docentes.</p>
          <div className="mt-4">
            <Button className="min-h-11" variant="outline" onClick={() => navigate('/dashboard')}>Volver</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Asignación Académica</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">Tus grupos y asignaturas asignadas.</p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="text-sm text-slate-600 dark:text-slate-300">Año</span>
            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 lg:w-auto"
              value={yearId}
              disabled={loadingYears || years.length === 0}
              onChange={(e) => setYearId(e.target.value ? Number(e.target.value) : '')}
            >
              {years.length === 0 ? <option value="">—</option> : null}
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.year} {y.status === 'ACTIVE' ? '(Activo)' : ''}
                </option>
              ))}
            </select>
          </div>
          <Button className="min-h-11 w-full sm:w-auto" variant="outline" onClick={() => navigate('/dashboard')}>Ir al Dashboard</Button>
        </div>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md dark:bg-rose-950/30 dark:text-rose-200">{error}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Mis asignaciones</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-slate-500">Cargando…</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-slate-500">No tienes asignaciones registradas.</div>
          ) : (
            <div>
              {/* Mobile cards */}
              <div className="xl:hidden space-y-3 sm:space-y-4">
                {paginated.items.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {r.subjectLabel}
                    </div>
                    <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      {(r.grade ? `${r.grade} · ` : '') + (r.group || '—')}
                      {r.year ? ` · ${r.year}` : ''}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                      <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
                        <div className="text-slate-600 dark:text-slate-300">Área</div>
                        <div className="mt-0.5 font-semibold">{r.area ?? '—'}</div>
                      </div>
                      <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
                        <div className="text-slate-600 dark:text-slate-300">Horas/semana</div>
                        <div className="mt-0.5 font-semibold">{r.hours ?? '—'}</div>
                      </div>
                      <div className="col-span-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200 sm:col-span-1">
                        <div className="text-slate-600 dark:text-slate-300">Asignación</div>
                        <div className="mt-0.5 font-semibold">#{r.id}</div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-2">
                      <Button
                        className="min-h-11 w-full"
                        variant="outline"
                        onClick={() => handleOpenPlanilla('attendance', r.raw)}
                        disabled={downloading}
                      >
                        Imprimible: Asistencia
                      </Button>
                      <Button
                        className="min-h-11 w-full bg-cyan-600 text-white hover:bg-cyan-700"
                        onClick={() => handleOpenPlanilla('grades', r.raw)}
                        disabled={downloading}
                      >
                        Imprimible: Notas
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden xl:block overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="border-b border-slate-200 bg-linear-to-r from-slate-50 to-slate-100 text-xs uppercase text-slate-600 dark:border-slate-800 dark:from-slate-900 dark:to-slate-800 dark:text-slate-300">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Asignatura</th>
                      <th className="px-6 py-4 font-semibold">Área</th>
                      <th className="px-6 py-4 font-semibold">Grado</th>
                      <th className="px-6 py-4 font-semibold">Grupo</th>
                      <th className="px-6 py-4 font-semibold">Año</th>
                      <th className="px-6 py-4 font-semibold text-right">Horas/Semana</th>
                      <th className="px-6 py-4 font-semibold text-right">Imprimibles</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {paginated.items.map((r) => (
                      <tr key={r.id} className="bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">{r.subject}</td>
                        <td className="px-6 py-4">{r.area ?? '—'}</td>
                        <td className="px-6 py-4">{r.grade ?? '—'}</td>
                        <td className="px-6 py-4">{r.group}</td>
                        <td className="px-6 py-4">{r.year ?? '—'}</td>
                        <td className="px-6 py-4 text-right">{r.hours ?? '—'}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col sm:flex-row justify-end gap-2">
                            <Button
                              className="min-h-11"
                              variant="outline"
                              onClick={() => handleOpenPlanilla('attendance', r.raw)}
                              disabled={downloading}
                            >
                              Asistencia
                            </Button>
                            <Button
                              className="min-h-11 bg-cyan-600 text-white hover:bg-cyan-700"
                              onClick={() => handleOpenPlanilla('grades', r.raw)}
                              disabled={downloading}
                            >
                              Notas
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  Mostrando {paginated.startIdx + 1}–{paginated.endIdx} de {paginated.total}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    className="min-h-11 w-full sm:w-auto"
                    variant="outline"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={paginated.page <= 1}
                  >
                    Anterior
                  </Button>
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    Página {paginated.page} de {paginated.totalPages}
                  </div>
                  <Button
                    className="min-h-11 w-full sm:w-auto"
                    variant="outline"
                    onClick={() => setPage((p) => Math.min(paginated.totalPages, p + 1))}
                    disabled={paginated.page >= paginated.totalPages}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isPlanillaModalOpen && selectedAssignment && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div
            className="fixed inset-0 bg-black/50 transition-opacity backdrop-blur-sm"
            onClick={() => {
              if (!downloading) setIsPlanillaModalOpen(false)
            }}
          />
          <div className="relative z-50 w-full max-w-lg transform overflow-hidden rounded-t-2xl bg-white p-5 shadow-xl transition-all animate-in fade-in zoom-in-95 duration-200 dark:bg-slate-900 max-h-[90dvh] overflow-y-auto sm:mx-auto sm:max-h-[85vh] sm:rounded-lg sm:p-6">
            <div className="sticky top-0 z-10 -mx-5 -mt-5 mb-4 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900 sm:-mx-6 sm:-mt-6 sm:px-6">
              <h3 className="text-lg font-semibold leading-6 text-slate-900 dark:text-slate-100">
                {planillaType === 'attendance' ? 'Descargar planilla de asistencia' : 'Descargar planilla de notas'}
              </h3>
              <button
                onClick={() => {
                  if (!downloading) setIsPlanillaModalOpen(false)
                }}
                className="rounded-full p-1 hover:bg-slate-100 transition-colors disabled:opacity-50 dark:hover:bg-slate-800"
                disabled={downloading}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="text-sm text-slate-600 dark:text-slate-300">
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  {selectedAssignment.group_name || `Grupo ${selectedAssignment.group}`}
                </div>
                <div>
                  {([selectedAssignment.area_name, selectedAssignment.subject_name].filter(Boolean).join(' - ') || selectedAssignment.academic_load_name || '').trim()}
                </div>
              </div>

              {planillaType === 'attendance' ? (
                <div>
                  <Label>Número de columnas (días/registro)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={40}
                    value={attendanceColumns}
                    onChange={(e) => setAttendanceColumns(Math.max(1, Math.min(40, Number(e.target.value || 24))))}
                  />
                </div>
              ) : (
                <>
                  <div>
                    <Label>Período</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
                      value={gradePeriodId}
                      onChange={(e) => setGradePeriodId(e.target.value ? Number(e.target.value) : '')}
                      disabled={loadingPeriods}
                    >
                      {periodsForYear.length === 0 ? <option value="">—</option> : null}
                      {periodsForYear.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {periodsForYear.length === 0 && (
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">No hay períodos configurados para este año.</p>
                    )}
                  </div>

                  <div>
                    <Label>Número de columnas (notas)</Label>
                    <Input
                      type="number"
                      min={3}
                      max={7}
                      value={gradeNoteColumns}
                      onChange={(e) => setGradeNoteColumns(Math.max(3, Math.min(7, Number(e.target.value || 3))))}
                    />
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Mínimo 3 y máximo 7. Esto controla cuántas columnas “Nota 1…Nota N” aparecen antes de “Def.”</p>
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button className="min-h-11 w-full sm:w-auto" variant="outline" onClick={() => setIsPlanillaModalOpen(false)} disabled={downloading}>
                Cancelar
              </Button>
              <Button
                className="min-h-11 w-full sm:w-auto bg-cyan-600 text-white hover:bg-cyan-700"
                onClick={handleDownloadPlanilla}
                disabled={downloading || (planillaType === 'grades' && periodsForYear.length > 0 && gradePeriodId === '')}
              >
                {downloading ? 'Generando…' : 'Descargar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

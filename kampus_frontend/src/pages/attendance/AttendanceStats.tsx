import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  academicApi,
  type AcademicYear,
  type Area,
  type Grade,
  type Group,
  type Period,
  type TeacherAssignment,
} from '../../services/academic'
import {
  getAttendanceKpiDashboard,
  getAttendanceKpiStudentDetail,
  getAttendanceStudentStats,
  type AttendanceKpiDashboardResponse,
  type AttendanceKpiStudentDetailResponse,
  type AttendanceStudentStatsResponse,
} from '../../services/attendance'
import { useAuthStore } from '../../store/auth'

function formatDateInput(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDelta(value: number) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value}%`
}

function parseNumericSearchParam(value: string | null): number | '' {
  if (!value) return ''
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : ''
}

function isValidDateString(value: string | null): value is string {
  if (!value) return false
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

type KpiSignal = 'GREEN' | 'YELLOW' | 'RED'

type DashboardFilters = {
  startDate: string
  endDate: string
  grade: number | ''
  group: number | ''
  teacher: number | ''
  area: number | ''
}

type ExecutiveAlert = {
  level: KpiSignal
  title: string
  detail: string
  cta: string
  action:
    | { type: 'NONE' }
    | { type: 'GROUP'; groupId: number }
    | { type: 'STUDENT'; enrollmentId: number }
    | { type: 'DAY'; date: string }
}

function signalClasses(signal: KpiSignal) {
  if (signal === 'GREEN') return 'text-emerald-600 dark:text-emerald-300'
  if (signal === 'YELLOW') return 'text-amber-600 dark:text-amber-300'
  return 'text-red-600 dark:text-red-300'
}

function signalLabel(signal: KpiSignal) {
  if (signal === 'GREEN') return 'Estable'
  if (signal === 'YELLOW') return 'Atención'
  return 'Crítico'
}

function signalDotClasses(signal: KpiSignal) {
  if (signal === 'GREEN') return 'bg-emerald-500'
  if (signal === 'YELLOW') return 'bg-amber-500'
  return 'bg-red-500'
}

function getAbsenceRateLevel(rate: number): KpiSignal {
  if (rate >= 30) return 'RED'
  if (rate >= 15) return 'YELLOW'
  return 'GREEN'
}

function getAbsenceBarColor(rate: number): string {
  const level = getAbsenceRateLevel(rate)
  if (level === 'RED') return 'var(--color-red-500)'
  if (level === 'YELLOW') return 'var(--color-amber-500)'
  return 'var(--color-emerald-500)'
}

function getAbsenceLevelBadgeClasses(rate: number): string {
  const level = getAbsenceRateLevel(rate)
  if (level === 'RED') return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900/40'
  if (level === 'YELLOW') return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900/40'
  return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900/40'
}

function getAbsenceLevelCardClasses(rate: number): string {
  const level = getAbsenceRateLevel(rate)
  if (level === 'RED') return 'border-red-200/80 dark:border-red-900/40'
  if (level === 'YELLOW') return 'border-amber-200/80 dark:border-amber-900/40'
  return 'border-emerald-200/80 dark:border-emerald-900/40'
}

function TeacherStatsReport() {
  const [years, setYears] = useState<AcademicYear[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])

  const [selectedPeriod, setSelectedPeriod] = useState<number | ''>('')
  const [selectedAssignment, setSelectedAssignment] = useState<number | ''>('')

  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<AttendanceStudentStatsResponse | null>(null)

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

        const defaultPeriod = periodsRes.data.find((p) => !p.is_closed && (!activeYear || p.academic_year === activeYear.id))
        if (mounted && defaultPeriod) setSelectedPeriod(defaultPeriod.id)

        const defaultAssignment = assignmentsRes.data[0]
        if (mounted && defaultAssignment) setSelectedAssignment(defaultAssignment.id)
      } catch (err) {
        console.error(err)
        if (mounted) setError('No se pudo cargar la información.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  const handleFetch = async () => {
    setError(null)
    setData(null)

    if (!selectedPeriod || !selectedAssignment) {
      setError('Selecciona periodo y asignación.')
      return
    }

    setFetching(true)
    try {
      const res = await getAttendanceStudentStats({
        teacher_assignment_id: Number(selectedAssignment),
        period_id: Number(selectedPeriod),
      })
      setData(res)
    } catch (err) {
      console.error(err)
      setError('No se pudo generar el reporte.')
    } finally {
      setFetching(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reporte de asistencias (docente)</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-slate-600 dark:text-slate-300">Cargando…</p>
        ) : (
          <div className="space-y-4">
            {error ? <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</div> : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Periodo</label>
                <select
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
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
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Asignación</label>
                <select
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  value={selectedAssignment}
                  onChange={(e) => setSelectedAssignment(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">Selecciona…</option>
                  {filteredAssignments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.subject_name ?? 'Materia'} — {(a.grade_name || 'Grado') + ' / ' + (a.group_name ?? 'Grupo')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button className="w-full sm:w-auto" onClick={handleFetch} disabled={fetching}>
              {fetching ? 'Generando…' : 'Generar reporte'}
            </Button>

            {data ? (
              <div className="space-y-3">
                <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    {data.teacher_assignment.subject_name} — {(data.teacher_assignment.grade_name ? `${data.teacher_assignment.grade_name} / ` : '') + data.teacher_assignment.group_name}
                  </div>
                  <div>
                    Periodo: {data.period.name} · Clases registradas: {data.sessions_count}
                  </div>
                </div>

                <div className="hidden xl:block overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                    <thead className="bg-slate-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Estudiante</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Ausencias</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Tardes</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Excusas</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Presentes</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200 dark:bg-slate-900 dark:divide-slate-800">
                      {data.students.map((s) => (
                        <tr key={s.enrollment_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                          <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">{s.student_full_name}</td>
                          <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{s.absences}</td>
                          <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{s.tardies}</td>
                          <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{s.excused}</td>
                          <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{s.present}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function AttendanceStats() {
  const [searchParams, setSearchParams] = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.role === 'TEACHER'

  const [grades, setGrades] = useState<Grade[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])

  const now = useMemo(() => new Date(), [])
  const defaultStartDate = useMemo(() => formatDateInput(new Date(now.getFullYear(), now.getMonth(), 1)), [now])
  const defaultEndDate = useMemo(() => formatDateInput(now), [now])
  const [startDate, setStartDate] = useState<string>(() => {
    const value = searchParams.get('start_date')
    return isValidDateString(value) ? value : defaultStartDate
  })
  const [endDate, setEndDate] = useState<string>(() => {
    const value = searchParams.get('end_date')
    return isValidDateString(value) ? value : defaultEndDate
  })
  const [selectedGrade, setSelectedGrade] = useState<number | ''>(() => parseNumericSearchParam(searchParams.get('grade_id')))
  const [selectedGroup, setSelectedGroup] = useState<number | ''>(() => parseNumericSearchParam(searchParams.get('group_id')))
  const [selectedTeacher, setSelectedTeacher] = useState<number | ''>(() => parseNumericSearchParam(searchParams.get('teacher_id')))
  const [selectedArea, setSelectedArea] = useState<number | ''>(() => parseNumericSearchParam(searchParams.get('area_id')))

  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<AttendanceKpiDashboardResponse | null>(null)
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<number | null>(() => {
    const parsed = parseNumericSearchParam(searchParams.get('enrollment_id'))
    return parsed === '' ? null : Number(parsed)
  })
  const [isStudentDetailModalOpen, setIsStudentDetailModalOpen] = useState(false)
  const [studentDetail, setStudentDetail] = useState<AttendanceKpiStudentDetailResponse | null>(null)
  const [studentDetailLoading, setStudentDetailLoading] = useState(false)
  const [studentDetailError, setStudentDetailError] = useState<string | null>(null)
  const [subjectPage, setSubjectPage] = useState(1)
  const subjectPageSize = 5
  const [copyLinkStatus, setCopyLinkStatus] = useState<'ok' | 'error' | null>(null)
  const [riskPage, setRiskPage] = useState(1)
  const riskPageSize = 10

  const studentSubjectChartData = useMemo(
    () =>
      [...(studentDetail?.by_subject || [])]
        .sort((a, b) => b.absence_rate - a.absence_rate)
        .map((row) => ({
          subjectName: row.subject_name,
          absenceRate: row.absence_rate,
          absent: row.absent,
          totalRecords: row.total_records,
        })),
    [studentDetail],
  )

  const subjectRows = useMemo(() => studentDetail?.by_subject ?? [], [studentDetail?.by_subject])
  const subjectTotal = subjectRows.length
  const subjectTotalPages = Math.max(1, Math.ceil(subjectTotal / subjectPageSize))
  const paginatedSubjectRows = useMemo(() => {
    const start = (subjectPage - 1) * subjectPageSize
    return subjectRows.slice(start, start + subjectPageSize)
  }, [subjectRows, subjectPage])

  const teachers = useMemo(() => {
    const map = new Map<number, string>()
    for (const assignment of assignments) {
      if (assignment.teacher && assignment.teacher_name) {
        map.set(assignment.teacher, assignment.teacher_name)
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [assignments])

  const filteredGroups = useMemo(() => {
    if (!selectedGrade) return groups
    return groups.filter((group) => group.grade === Number(selectedGrade))
  }, [groups, selectedGrade])

  const riskTotal = data?.student_risk.length ?? 0
  const riskTotalPages = Math.max(1, Math.ceil(riskTotal / riskPageSize))
  const paginatedRiskRows = useMemo(() => {
    if (!data) return []
    const start = (riskPage - 1) * riskPageSize
    return data.student_risk.slice(start, start + riskPageSize)
  }, [data, riskPage])

  const attendanceSignal = useMemo<KpiSignal>(() => {
    const rate = data?.summary.attendance_rate ?? 0
    if (rate >= 90) return 'GREEN'
    if (rate >= 80) return 'YELLOW'
    return 'RED'
  }, [data])

  const absenceSignal = useMemo<KpiSignal>(() => {
    const rate = data?.summary.absence_rate ?? 0
    if (rate <= 5) return 'GREEN'
    if (rate <= 10) return 'YELLOW'
    return 'RED'
  }, [data])

  const tardySignal = useMemo<KpiSignal>(() => {
    const rate = data?.summary.tardy_rate ?? 0
    if (rate <= 5) return 'GREEN'
    if (rate <= 10) return 'YELLOW'
    return 'RED'
  }, [data])

  const coverageSignal = useMemo<KpiSignal>(() => {
    const rate = data?.summary.coverage_rate ?? 0
    if (rate >= 95) return 'GREEN'
    if (rate >= 85) return 'YELLOW'
    return 'RED'
  }, [data])

  const executiveAlerts = useMemo(() => {
    if (!data) return [] as ExecutiveAlert[]

    const alerts: ExecutiveAlert[] = []

    if (data.summary_delta.absence_rate_delta > 2) {
      alerts.push({
        level: 'RED',
        title: 'Aumento de inasistencia',
        detail: `La inasistencia subió ${formatDelta(data.summary_delta.absence_rate_delta)} vs periodo anterior.`,
        cta: 'Ver tablero',
        action: { type: 'NONE' },
      })
    }

    if (data.summary.coverage_rate < 90) {
      alerts.push({
        level: data.summary.coverage_rate < 85 ? 'RED' : 'YELLOW',
        title: 'Cobertura de registro baja',
        detail: `Cobertura actual ${data.summary.coverage_rate}%.`,
        cta: 'Ver tablero',
        action: { type: 'NONE' },
      })
    }

    const worstGroup = [...data.group_comparison].sort((a, b) => a.gap_vs_institution - b.gap_vs_institution)[0]
    if (worstGroup && worstGroup.gap_vs_institution < -5) {
      alerts.push({
        level: 'YELLOW',
        title: 'Grupo con brecha negativa',
        detail: `${worstGroup.grade_name} ${worstGroup.group_name} está ${worstGroup.gap_vs_institution}% debajo del promedio institucional.`,
        cta: 'Filtrar grupo',
        action: { type: 'GROUP', groupId: worstGroup.group_id },
      })
    }

    const highRiskStudent = data.student_risk.find((student) => student.risk_level === 'HIGH')
    if (highRiskStudent) {
      alerts.push({
        level: 'RED',
        title: 'Estudiante en riesgo alto',
        detail: `${highRiskStudent.student_full_name} registra ${highRiskStudent.absence_rate}% de ausencia.`,
        cta: 'Abrir detalle',
        action: { type: 'STUDENT', enrollmentId: highRiskStudent.enrollment_id },
      })
    }

    const worstTrendDay = data.trend
      .filter((item) => item.attendance_rate_delta !== null)
      .sort((a, b) => (a.attendance_rate_delta ?? 0) - (b.attendance_rate_delta ?? 0))[0]
    if (worstTrendDay && (worstTrendDay.attendance_rate_delta ?? 0) < -5) {
      alerts.push({
        level: 'YELLOW',
        title: 'Caída diaria relevante',
        detail: `${worstTrendDay.date} cayó ${formatDelta(worstTrendDay.attendance_rate_delta ?? 0)} frente al periodo anterior.`,
        cta: 'Ver día',
        action: { type: 'DAY', date: String(worstTrendDay.date) },
      })
    }

    return alerts.slice(0, 3)
  }, [data])

  const fetchDashboard = async (override?: Partial<DashboardFilters>) => {
    const effectiveStartDate = override?.startDate ?? startDate
    const effectiveEndDate = override?.endDate ?? endDate
    const effectiveGrade = override?.grade ?? selectedGrade
    const effectiveGroup = override?.group ?? selectedGroup
    const effectiveTeacher = override?.teacher ?? selectedTeacher
    const effectiveArea = override?.area ?? selectedArea

    setError(null)
    if (!effectiveStartDate || !effectiveEndDate) {
      setError('Selecciona un rango de fechas válido.')
      return
    }

    setFetching(true)
    try {
      const res = await getAttendanceKpiDashboard({
        start_date: effectiveStartDate,
        end_date: effectiveEndDate,
        grade_id: effectiveGrade ? Number(effectiveGrade) : undefined,
        group_id: effectiveGroup ? Number(effectiveGroup) : undefined,
        teacher_id: effectiveTeacher ? Number(effectiveTeacher) : undefined,
        area_id: effectiveArea ? Number(effectiveArea) : undefined,
      })
      setData(res)
    } catch (err) {
      console.error(err)
      setError('No se pudo generar el reporte.')
    } finally {
      setFetching(false)
    }
  }

  useEffect(() => {
    if (isTeacher) return

    let mounted = true

    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [gradesRes, groupsRes, areasRes, assignmentsRes] = await Promise.all([
          academicApi.listGrades(),
          academicApi.listGroups(),
          academicApi.listAreas(),
          academicApi.listAssignments(),
        ])

        if (!mounted) return

        const cleanedGroups = groupsRes.data.filter((group) => (group.name || '').trim().length > 0)

        setGrades(gradesRes.data)
        setGroups(cleanedGroups)
        setAreas(areasRes.data)
        setAssignments(assignmentsRes.data)
      } catch (err) {
        console.error(err)
        if (mounted) setError('No se pudo cargar la información.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [isTeacher])

  const handleFetch = async () => {
    await fetchDashboard()
  }

  const fetchStudentDetail = async (enrollmentId: number) => {
    setStudentDetailError(null)
    setStudentDetail(null)
    setStudentDetailLoading(true)
    try {
      const detail = await getAttendanceKpiStudentDetail({
        enrollment_id: enrollmentId,
        start_date: startDate,
        end_date: endDate,
        grade_id: selectedGrade ? Number(selectedGrade) : undefined,
        group_id: selectedGroup ? Number(selectedGroup) : undefined,
        teacher_id: selectedTeacher ? Number(selectedTeacher) : undefined,
        area_id: selectedArea ? Number(selectedArea) : undefined,
      })
      setStudentDetail(detail)
    } catch (err) {
      console.error(err)
      setStudentDetailError('No se pudo cargar el detalle del estudiante.')
    } finally {
      setStudentDetailLoading(false)
    }
  }

  const handleStudentSelect = async (enrollmentId: number) => {
    setSelectedEnrollmentId(enrollmentId)
    setIsStudentDetailModalOpen(true)
    await fetchStudentDetail(enrollmentId)
  }

  const handleCloseStudentDetailModal = () => {
    setIsStudentDetailModalOpen(false)
    setSelectedEnrollmentId(null)
    setStudentDetail(null)
    setStudentDetailError(null)
    setSubjectPage(1)
  }

  const handleCopyShareLink = async () => {
    try {
      const url = new URL(window.location.href)
      const params = new URLSearchParams()
      params.set('start_date', startDate)
      params.set('end_date', endDate)
      if (selectedGrade) params.set('grade_id', String(selectedGrade))
      if (selectedGroup) params.set('group_id', String(selectedGroup))
      if (selectedTeacher) params.set('teacher_id', String(selectedTeacher))
      if (selectedArea) params.set('area_id', String(selectedArea))
      if (selectedEnrollmentId) params.set('enrollment_id', String(selectedEnrollmentId))

      url.search = params.toString()
      await navigator.clipboard.writeText(url.toString())
      setCopyLinkStatus('ok')
    } catch (err) {
      console.error(err)
      setCopyLinkStatus('error')
    }

    window.setTimeout(() => setCopyLinkStatus(null), 1800)
  }

  const handleAlertAction = async (alert: ExecutiveAlert) => {
    if (alert.action.type === 'GROUP') {
      setSelectedGrade('')
      setSelectedGroup(alert.action.groupId)
      setIsStudentDetailModalOpen(false)
      setSelectedEnrollmentId(null)
      setStudentDetail(null)
      setStudentDetailError(null)
      await fetchDashboard({ grade: '', group: alert.action.groupId })
      return
    }

    if (alert.action.type === 'STUDENT') {
      const enrollmentId = Number(alert.action.enrollmentId)
      if (!Number.isFinite(enrollmentId) || enrollmentId <= 0) {
        setStudentDetailError('No se pudo abrir el detalle del estudiante seleccionado.')
        return
      }

      await handleStudentSelect(enrollmentId)
      return
    }

    if (alert.action.type === 'DAY') {
      setStartDate(alert.action.date)
      setEndDate(alert.action.date)
      setIsStudentDetailModalOpen(false)
      setSelectedEnrollmentId(null)
      setStudentDetail(null)
      setStudentDetailError(null)
      await fetchDashboard({ startDate: alert.action.date, endDate: alert.action.date })
      return
    }
  }

  useEffect(() => {
    if (isTeacher || loading) return
    handleFetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher, loading])

  useEffect(() => {
    if (isTeacher || loading || !data || !selectedEnrollmentId || studentDetailLoading || studentDetail) return
    setIsStudentDetailModalOpen(true)
    void fetchStudentDetail(selectedEnrollmentId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher, loading, data, selectedEnrollmentId])

  useEffect(() => {
    setRiskPage(1)
  }, [riskTotal])

  useEffect(() => {
    setSubjectPage(1)
  }, [selectedEnrollmentId, studentDetail?.student.enrollment_id])

  useEffect(() => {
    if (isTeacher) return

    const nextParams = new URLSearchParams()
    nextParams.set('start_date', startDate)
    nextParams.set('end_date', endDate)
    if (selectedGrade) nextParams.set('grade_id', String(selectedGrade))
    if (selectedGroup) nextParams.set('group_id', String(selectedGroup))
    if (selectedTeacher) nextParams.set('teacher_id', String(selectedTeacher))
    if (selectedArea) nextParams.set('area_id', String(selectedArea))
    if (selectedEnrollmentId) nextParams.set('enrollment_id', String(selectedEnrollmentId))

    const current = searchParams.toString()
    const next = nextParams.toString()
    if (current !== next) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [
    endDate,
    isTeacher,
    searchParams,
    selectedArea,
    selectedEnrollmentId,
    selectedGrade,
    selectedGroup,
    selectedTeacher,
    setSearchParams,
    startDate,
  ])

  if (isTeacher) {
    return <TeacherStatsReport />
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Dashboard KPI de asistencias</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-slate-600 dark:text-slate-300">Cargando…</p>
          ) : (
            <div className="space-y-4">
              {error ? <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</div> : null}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Desde</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Hasta</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Grado</label>
                  <select
                    value={selectedGrade}
                    onChange={(e) => {
                      const next = e.target.value ? Number(e.target.value) : ''
                      setSelectedGrade(next)
                      setSelectedGroup('')
                    }}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="">Todos</option>
                    {grades.map((grade) => (
                      <option key={grade.id} value={grade.id}>{grade.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Grupo</label>
                  <select
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value ? Number(e.target.value) : '')}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="">Todos</option>
                    {filteredGroups.map((group) => (
                      <option key={group.id} value={group.id}>{(group.grade_name ? `${group.grade_name} ` : '') + group.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Docente</label>
                  <select
                    value={selectedTeacher}
                    onChange={(e) => setSelectedTeacher(e.target.value ? Number(e.target.value) : '')}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="">Todos</option>
                    {teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Área</label>
                  <select
                    value={selectedArea}
                    onChange={(e) => setSelectedArea(e.target.value ? Number(e.target.value) : '')}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="">Todas</option>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>{area.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button className="w-full sm:w-auto" onClick={handleFetch} disabled={fetching}>
                  {fetching ? 'Actualizando…' : 'Aplicar filtros'}
                </Button>
                <Button className="w-full sm:w-auto" onClick={handleCopyShareLink}>
                  Copiar enlace
                </Button>
                {copyLinkStatus === 'ok' ? <span className="text-xs text-emerald-600 dark:text-emerald-300">Enlace copiado</span> : null}
                {copyLinkStatus === 'error' ? <span className="text-xs text-red-600 dark:text-red-300">No se pudo copiar</span> : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {data ? (
        <>
          <Card>
            <CardHeader><CardTitle>Alertas prioritarias</CardTitle></CardHeader>
            <CardContent>
              {executiveAlerts.length ? (
                <div className="space-y-2">
                  {executiveAlerts.map((alert, idx) => (
                    <div key={`${alert.title}-${idx}`} className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${signalDotClasses(alert.level)}`} />
                        {alert.title}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <p className="text-xs text-slate-600 dark:text-slate-300">{alert.detail}</p>
                        <Button
                          className="h-9 w-full sm:h-7 sm:w-auto px-2 py-1 text-xs"
                          onClick={() => {
                            void handleAlertAction(alert)
                          }}
                          disabled={alert.action.type === 'NONE' || fetching}
                        >
                          {alert.cta}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Sin alertas críticas en el rango seleccionado.</p>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-slate-500">Asistencia</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{data.summary.attendance_rate}%</p>
                <p className={`mt-1 flex items-center gap-2 text-xs ${signalClasses(attendanceSignal)}`}>
                  <span className={`inline-block h-2 w-2 rounded-full ${signalDotClasses(attendanceSignal)}`} />
                  {signalLabel(attendanceSignal)}
                </p>
                <p className={`mt-1 text-xs ${data.summary_delta.attendance_rate_delta < 0 ? 'text-red-600 dark:text-red-300' : 'text-emerald-600 dark:text-emerald-300'}`}>
                  {formatDelta(data.summary_delta.attendance_rate_delta)} vs periodo anterior
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-slate-500">Inasistencia</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{data.summary.absence_rate}%</p>
                <p className={`mt-1 flex items-center gap-2 text-xs ${signalClasses(absenceSignal)}`}>
                  <span className={`inline-block h-2 w-2 rounded-full ${signalDotClasses(absenceSignal)}`} />
                  {signalLabel(absenceSignal)}
                </p>
                <p className={`mt-1 text-xs ${data.summary_delta.absence_rate_delta > 0 ? 'text-red-600 dark:text-red-300' : 'text-emerald-600 dark:text-emerald-300'}`}>
                  {formatDelta(data.summary_delta.absence_rate_delta)} vs periodo anterior
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-slate-500">Tardanza</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{data.summary.tardy_rate}%</p>
                <p className={`mt-1 flex items-center gap-2 text-xs ${signalClasses(tardySignal)}`}>
                  <span className={`inline-block h-2 w-2 rounded-full ${signalDotClasses(tardySignal)}`} />
                  {signalLabel(tardySignal)}
                </p>
                <p className={`mt-1 text-xs ${data.summary_delta.tardy_rate_delta > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>
                  {formatDelta(data.summary_delta.tardy_rate_delta)} vs periodo anterior
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-slate-500">Excusas</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{data.summary.excused_rate}%</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {formatDelta(data.summary_delta.excused_rate_delta)} vs periodo anterior
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-slate-500">Cobertura registro</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{data.summary.coverage_rate}%</p>
                <p className={`mt-1 flex items-center gap-2 text-xs ${signalClasses(coverageSignal)}`}>
                  <span className={`inline-block h-2 w-2 rounded-full ${signalDotClasses(coverageSignal)}`} />
                  {signalLabel(coverageSignal)}
                </p>
                <p className={`mt-1 text-xs ${data.summary_delta.coverage_rate_delta < 0 ? 'text-red-600 dark:text-red-300' : 'text-emerald-600 dark:text-emerald-300'}`}>
                  {formatDelta(data.summary_delta.coverage_rate_delta)} vs periodo anterior
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Tendencia por fecha</CardTitle></CardHeader>
            <CardContent>
              {data.trend.length === 0 ? (
                <p className="text-sm text-slate-500">Sin datos para el rango seleccionado.</p>
              ) : (
                <div className="space-y-2">
                  {data.trend.map((item) => (
                    <div key={item.date}>
                      <div className="mb-1 flex justify-between text-xs text-slate-600 dark:text-slate-300">
                        <span>{item.date}</span>
                        <span>
                          Actual: {item.attendance_rate}%
                          {item.previous_attendance_rate !== null ? ` · Anterior: ${item.previous_attendance_rate}%` : ''}
                          {item.attendance_rate_delta !== null ? ` · Δ ${formatDelta(item.attendance_rate_delta)}` : ''}
                        </span>
                      </div>
                      <div className="h-2 rounded bg-slate-100 dark:bg-slate-800">
                        <div className="h-2 rounded bg-sky-500" style={{ width: `${Math.min(100, Math.max(0, item.attendance_rate))}%` }} />
                      </div>
                      {item.previous_attendance_rate !== null ? (
                        <div className="mt-1 h-1.5 rounded bg-slate-100 dark:bg-slate-800">
                          <div className="h-1.5 rounded bg-slate-400 dark:bg-slate-500" style={{ width: `${Math.min(100, Math.max(0, item.previous_attendance_rate))}%` }} />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Comparativo grupal</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3 md:hidden">
                {data.group_comparison.length === 0 ? (
                  <p className="text-sm text-slate-500">Sin datos de grupos para el rango seleccionado.</p>
                ) : (
                  data.group_comparison.map((group) => (
                    <div key={`group-card-${group.group_id}-${group.grade_name}`} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{group.grade_name} {group.group_name}</div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <div>Asistencia: <span className="font-medium text-slate-900 dark:text-slate-100">{group.attendance_rate}%</span></div>
                        <div>Ausencias: <span className="font-medium text-slate-900 dark:text-slate-100">{group.absences}</span></div>
                        <div className={group.attendance_rate_delta < 0 ? 'text-red-600 dark:text-red-300' : 'text-emerald-600 dark:text-emerald-300'}>
                          Δ Asistencia: {formatDelta(group.attendance_rate_delta)}
                        </div>
                        <div className={group.gap_vs_institution < 0 ? 'text-red-600 dark:text-red-300' : 'text-emerald-600 dark:text-emerald-300'}>
                          Brecha: {group.gap_vs_institution > 0 ? '+' : ''}{group.gap_vs_institution}%
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-900">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Grupo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Asistencia</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Δ Asistencia</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Ausencias</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Brecha vs inst.</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200 dark:bg-slate-900 dark:divide-slate-800">
                    {data.group_comparison.map((group) => (
                      <tr key={`${group.group_id}-${group.grade_name}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                        <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">{group.grade_name} {group.group_name}</td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{group.attendance_rate}%</td>
                        <td className={`px-4 py-3 text-sm ${group.attendance_rate_delta < 0 ? 'text-red-600 dark:text-red-300' : 'text-emerald-600 dark:text-emerald-300'}`}>
                          {formatDelta(group.attendance_rate_delta)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{group.absences}</td>
                        <td className={`px-4 py-3 text-sm ${group.gap_vs_institution < 0 ? 'text-red-600 dark:text-red-300' : 'text-emerald-600 dark:text-emerald-300'}`}>
                          {group.gap_vs_institution > 0 ? '+' : ''}{group.gap_vs_institution}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Riesgo individual</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3 md:hidden">
                {paginatedRiskRows.length === 0 ? (
                  <p className="text-sm text-slate-500">Sin estudiantes en riesgo para el rango seleccionado.</p>
                ) : (
                  paginatedRiskRows.map((student) => (
                    <div key={`risk-card-${student.enrollment_id}`} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                      <button
                        type="button"
                        onClick={() => handleStudentSelect(student.enrollment_id)}
                        className="text-left text-sm font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                      >
                        {student.student_full_name}
                      </button>
                      <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{student.grade_name} {student.group_name}</div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <div>Ausencias: <span className="font-medium text-slate-900 dark:text-slate-100">{student.absences}</span></div>
                        <div>% Ausencia: <span className="font-medium text-slate-900 dark:text-slate-100">{student.absence_rate}%</span></div>
                        <div className={`col-span-2 font-medium ${student.risk_level === 'HIGH' ? 'text-red-600 dark:text-red-300' : student.risk_level === 'MEDIUM' ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'}`}>
                          Riesgo: {student.risk_level}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-900">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Estudiante</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Grupo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Ausencias</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">% Ausencia</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Riesgo</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200 dark:bg-slate-900 dark:divide-slate-800">
                    {paginatedRiskRows.map((student) => (
                      <tr key={student.enrollment_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                        <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
                          <button
                            type="button"
                            onClick={() => handleStudentSelect(student.enrollment_id)}
                            className="text-left font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                          >
                            {student.student_full_name}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{student.grade_name} {student.group_name}</td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{student.absences}</td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{student.absence_rate}%</td>
                        <td className={`px-4 py-3 text-sm font-medium ${student.risk_level === 'HIGH' ? 'text-red-600 dark:text-red-300' : student.risk_level === 'MEDIUM' ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'}`}>
                          {student.risk_level}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {riskTotal > 0 ? (
                <div className="mt-3 flex flex-col gap-2 text-xs text-slate-600 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Mostrando {(riskPage - 1) * riskPageSize + 1}–{Math.min(riskPage * riskPageSize, riskTotal)} de {riskTotal}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setRiskPage((prev) => Math.max(1, prev - 1))} disabled={riskPage <= 1}>
                      Anterior
                    </Button>
                    <span className="min-w-24 text-center">Página {riskPage} de {riskTotalPages}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRiskPage((prev) => Math.min(riskTotalPages, prev + 1))}
                      disabled={riskPage >= riskTotalPages}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

        </>
      ) : null}

      <Modal
        isOpen={isStudentDetailModalOpen}
        onClose={handleCloseStudentDetailModal}
        title="Detalle individual"
        description={studentDetail ? `${studentDetail.student.student_full_name} · ${studentDetail.student.grade_name} ${studentDetail.student.group_name}` : 'Cargando información del estudiante'}
        size="xl"
        loading={studentDetailLoading}
        footer={<Button variant="outline" onClick={handleCloseStudentDetailModal}>Cerrar</Button>}
      >
        <div className="space-y-4 rounded-xl bg-slate-50/70 p-2 dark:bg-slate-950/30">
          {studentDetailLoading ? <p className="text-sm text-slate-500">Cargando detalle…</p> : null}
          {studentDetailError ? <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-200">{studentDetailError}</div> : null}

          {studentDetail ? (
            <>
              <div className="rounded-lg border border-slate-200/80 bg-slate-100/80 p-4 text-sm text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                <div className="font-medium text-slate-900 dark:text-slate-100">{studentDetail.student.student_full_name}</div>
                <div>{studentDetail.student.grade_name} {studentDetail.student.group_name}</div>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Asistencia: {studentDetail.summary.attendance_rate}% · Inasistencia: {studentDetail.summary.absence_rate}% · Registros: {studentDetail.summary.total_records}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200/80 bg-gradient-to-b from-slate-100 to-slate-50 p-3 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
                <div className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">Inasistencia por asignatura</div>
                <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Alto (≥30%)</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Medio (15%-29.99%)</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Bajo (&lt;15%)</span>
                </div>
                {studentSubjectChartData.length ? (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={studentSubjectChartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" domain={[0, 100]} unit="%" />
                        <YAxis type="category" dataKey="subjectName" width={150} />
                        <Tooltip
                          formatter={(value) => [`${Number(value ?? 0).toFixed(2)}%`, 'Inasistencia']}
                        />
                        <Bar dataKey="absenceRate" radius={[0, 4, 4, 0]}>
                          {studentSubjectChartData.map((entry) => (
                            <Cell key={`absence-bar-${entry.subjectName}`} fill={getAbsenceBarColor(entry.absenceRate)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Sin datos por asignatura para los filtros actuales.</p>
                )}
              </div>

              <div className="space-y-2 xl:hidden">
                {paginatedSubjectRows.length ? (
                  paginatedSubjectRows.map((row) => (
                    <div key={`subject-card-${row.subject_name}`} className={`rounded-lg border bg-slate-100/80 p-3 dark:bg-slate-900 ${getAbsenceLevelCardClasses(row.absence_rate)}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{row.subject_name}</div>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getAbsenceLevelBadgeClasses(row.absence_rate)}`}>
                          {row.absence_rate}%
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <div>Ausencias: <span className="font-medium text-slate-900 dark:text-slate-100">{row.absent}</span></div>
                        <div>Registros: <span className="font-medium text-slate-900 dark:text-slate-100">{row.total_records}</span></div>
                        <div className="col-span-2 text-slate-500 dark:text-slate-400">
                          Nivel: <span className="font-medium text-slate-700 dark:text-slate-200">{getAbsenceRateLevel(row.absence_rate)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">Sin registros por asignatura para este estudiante con los filtros actuales.</p>
                )}
              </div>

              <div className="hidden xl:block overflow-x-auto rounded-lg border border-slate-200/80 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-900">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Asignatura</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Ausencias</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Registros</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">% Inasistencia</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200 dark:bg-slate-900 dark:divide-slate-800">
                    {paginatedSubjectRows.length ? (
                      paginatedSubjectRows.map((row) => (
                        <tr key={row.subject_name} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                          <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">{row.subject_name}</td>
                          <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{row.absent}</td>
                          <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{row.total_records}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${getAbsenceLevelBadgeClasses(row.absence_rate)}`}>
                              {row.absence_rate}%
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                          Sin registros por asignatura para este estudiante con los filtros actuales.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {subjectTotal > 0 ? (
                <div className="flex flex-col gap-2 text-xs text-slate-600 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Mostrando {(subjectPage - 1) * subjectPageSize + 1}–{Math.min(subjectPage * subjectPageSize, subjectTotal)} de {subjectTotal}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSubjectPage((prev) => Math.max(1, prev - 1))}
                      disabled={subjectPage <= 1}
                    >
                      Anterior
                    </Button>
                    <span className="min-w-24 text-center">Página {subjectPage} de {subjectTotalPages}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSubjectPage((prev) => Math.min(subjectTotalPages, prev + 1))}
                      disabled={subjectPage >= subjectTotalPages}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}

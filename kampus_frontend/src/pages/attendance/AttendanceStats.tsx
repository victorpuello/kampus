import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { academicApi, type AcademicYear, type Period, type TeacherAssignment } from '../../services/academic'
import { getAttendanceStudentStats, type AttendanceStudentStatsResponse } from '../../services/attendance'

export default function AttendanceStats() {
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
        <CardTitle>Reporte de asistencias</CardTitle>
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

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
              <Button className="w-full sm:w-auto" onClick={handleFetch} disabled={fetching}>
                {fetching ? 'Generando…' : 'Generar reporte'}
              </Button>
            </div>

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

                {/* Mobile cards */}
                <div className="xl:hidden space-y-3 sm:space-y-4">
                  {data.students.map((s) => (
                    <div
                      key={s.enrollment_id}
                      className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{s.student_full_name}</div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:gap-3">
                        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
                          <div className="text-slate-500 dark:text-slate-400">Ausencias</div>
                          <div className="text-sm font-semibold">{s.absences}</div>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
                          <div className="text-slate-500 dark:text-slate-400">Tardes</div>
                          <div className="text-sm font-semibold">{s.tardies}</div>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
                          <div className="text-slate-500 dark:text-slate-400">Excusas</div>
                          <div className="text-sm font-semibold">{s.excused}</div>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
                          <div className="text-slate-500 dark:text-slate-400">Presentes</div>
                          <div className="text-sm font-semibold">{s.present}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
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

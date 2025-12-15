import { useCallback, useEffect, useMemo, useState } from 'react'
import { GraduationCap, Save } from 'lucide-react'
import { academicApi, type GradebookResponse, type Group, type Period, type TeacherAssignment } from '../services/academic'
import { useAuthStore } from '../store/auth'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Toast, type ToastType } from '../components/ui/Toast'

type CellKey = `${number}:${number}`

const makeKey = (enrollmentId: number, achievementId: number): CellKey => `${enrollmentId}:${achievementId}`

export default function Grades() {
  const user = useAuthStore((s) => s.user)

  const [assignments, setAssignments] = useState<TeacherAssignment[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [groups, setGroups] = useState<Group[]>([])

  const [selectedGradeId, setSelectedGradeId] = useState<number | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [selectedAcademicLoadId, setSelectedAcademicLoadId] = useState<number | null>(null)
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)

  const [gradebook, setGradebook] = useState<GradebookResponse | null>(null)

  const [loadingInit, setLoadingInit] = useState(true)
  const [loadingGradebook, setLoadingGradebook] = useState(false)
  const [saving, setSaving] = useState(false)

  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }, [])

  const [baseValues, setBaseValues] = useState<Record<CellKey, string>>({})
  const [cellValues, setCellValues] = useState<Record<CellKey, string>>({})
  const [dirtyKeys, setDirtyKeys] = useState<Set<CellKey>>(new Set())

  const visibleAssignments = useMemo(() => {
    if (user?.role === 'TEACHER') return assignments.filter((a) => a.teacher === user.id)
    return assignments
  }, [assignments, user?.id, user?.role])

  const groupById = useMemo(() => {
    const map = new Map<number, Group>()
    for (const g of groups) map.set(g.id, g)
    return map
  }, [groups])

  const gradeOptions = useMemo(() => {
    const gradeIds = new Set<number>()
    for (const a of visibleAssignments) {
      const g = groupById.get(a.group)
      if (g) gradeIds.add(g.grade)
    }

    const options: { id: number; name: string }[] = []
    for (const gradeId of gradeIds) {
      const anyGroup = groups.find((g) => g.grade === gradeId)
      options.push({ id: gradeId, name: anyGroup?.grade_name || `Grado ${gradeId}` })
    }
    options.sort((a, b) => a.name.localeCompare(b.name))
    return options
  }, [groupById, groups, visibleAssignments])

  const groupOptions = useMemo(() => {
    if (!selectedGradeId) return [] as Group[]

    const allowedGroupIds = new Set<number>(visibleAssignments.map((a) => a.group))
    return groups
      .filter((g) => allowedGroupIds.has(g.id) && g.grade === selectedGradeId)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [groups, selectedGradeId, visibleAssignments])

  const subjectOptions = useMemo(() => {
    if (!selectedGroupId) return [] as { academic_load: number; subject_name: string }[]
    const map = new Map<number, string>()
    for (const a of visibleAssignments) {
      if (a.group !== selectedGroupId) continue
      map.set(a.academic_load, a.subject_name || a.academic_load_name || `Carga ${a.academic_load}`)
    }
    return Array.from(map.entries())
      .map(([academic_load, subject_name]) => ({ academic_load, subject_name }))
      .sort((a, b) => a.subject_name.localeCompare(b.subject_name))
  }, [selectedGroupId, visibleAssignments])

  const selectedAssignment = useMemo(() => {
    if (!selectedGroupId || !selectedAcademicLoadId) return null
    return (
      visibleAssignments.find(
        (a) => a.group === selectedGroupId && a.academic_load === selectedAcademicLoadId
      ) ?? null
    )
  }, [selectedAcademicLoadId, selectedGroupId, visibleAssignments])

  const visiblePeriods = useMemo(() => {
    if (!selectedAssignment) return []
    return periods.filter((p) => p.academic_year === selectedAssignment.academic_year)
  }, [periods, selectedAssignment])

  const periodIsClosed = !!gradebook?.period?.is_closed

  const computedByEnrollmentId = useMemo(() => {
    const map = new Map<number, { final_score: number | string; scale: string | null }>()
    for (const c of gradebook?.computed ?? []) {
      map.set(c.enrollment_id, { final_score: c.final_score, scale: c.scale })
    }
    return map
  }, [gradebook?.computed])

  const formatScore = (value: number | string) => {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) return String(value)
    return n.toFixed(2)
  }

  const loadInit = useCallback(async () => {
    setLoadingInit(true)
    try {
      const [assignmentsRes, periodsRes, groupsRes] = await Promise.all([
        academicApi.listAssignments(),
        academicApi.listPeriods(),
        academicApi.listGroups(),
      ])

      setAssignments(assignmentsRes.data)
      setPeriods(periodsRes.data)
      setGroups(groupsRes.data)

      const filteredAssignments = user?.role === 'TEACHER'
        ? assignmentsRes.data.filter((a) => a.teacher === user.id)
        : assignmentsRes.data

      if (filteredAssignments.length > 0) {
        const firstAssignment = filteredAssignments[0]
        const firstGroup = groupsRes.data.find((g) => g.id === firstAssignment.group)

        if (firstGroup) {
          setSelectedGradeId(firstGroup.grade)
          setSelectedGroupId(firstGroup.id)
        }
        setSelectedAcademicLoadId(firstAssignment.academic_load)

        const pForYear = periodsRes.data.filter((p) => p.academic_year === firstAssignment.academic_year)
        if (pForYear.length > 0) setSelectedPeriodId(pForYear[0].id)
      }
    } catch (e) {
      console.error(e)
      showToast('No se pudo cargar asignaciones/periodos', 'error')
    } finally {
      setLoadingInit(false)
    }
  }, [showToast, user?.id, user?.role])

  const loadGradebook = useCallback(async (teacherAssignmentId: number, periodId: number) => {
    setLoadingGradebook(true)
    try {
      const res = await academicApi.getGradebook(teacherAssignmentId, periodId)
      setGradebook(res.data)

      const nextBase: Record<CellKey, string> = {}
      for (const c of res.data.cells) {
        const key = makeKey(c.enrollment, c.achievement)
        nextBase[key] = c.score === null || c.score === undefined ? '' : String(c.score)
      }

      setBaseValues(nextBase)
      setCellValues(nextBase)
      setDirtyKeys(new Set())
    } catch (e) {
      console.error(e)
      setGradebook(null)
      setBaseValues({})
      setCellValues({})
      setDirtyKeys(new Set())
      showToast('No se pudo cargar la planilla', 'error')
    } finally {
      setLoadingGradebook(false)
    }
  }, [showToast])

  useEffect(() => {
    loadInit()
  }, [loadInit])

  useEffect(() => {
    if (!selectedAssignment || !selectedPeriodId) return
    loadGradebook(selectedAssignment.id, selectedPeriodId)
  }, [loadGradebook, selectedAssignment, selectedPeriodId])

  const handleChangeCell = (enrollmentId: number, achievementId: number, value: string) => {
    const key = makeKey(enrollmentId, achievementId)

    setCellValues((prev) => ({ ...prev, [key]: value }))
    setDirtyKeys((prev) => {
      const next = new Set(prev)
      const base = baseValues[key] ?? ''
      if (value === base) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSave = async () => {
    if (!selectedAssignment || !selectedPeriodId) return
    if (dirtyKeys.size === 0) return

    const grades: { enrollment: number; achievement: number; score: number | null }[] = []

    for (const key of dirtyKeys) {
      const [enrollmentStr, achievementStr] = key.split(':')
      const enrollment = Number(enrollmentStr)
      const achievement = Number(achievementStr)
      const raw = (cellValues[key] ?? '').trim()

      if (!raw) {
        grades.push({ enrollment, achievement, score: null })
        continue
      }

      const score = Number(raw)
      if (!Number.isFinite(score)) {
        showToast('Hay celdas con valores inválidos', 'error')
        return
      }
      if (score < 1 || score > 5) {
        showToast('Las notas deben estar entre 1.00 y 5.00', 'error')
        return
      }

      grades.push({ enrollment, achievement, score })
    }

    setSaving(true)
    try {
      await academicApi.bulkUpsertGradebook({
        teacher_assignment: selectedAssignment.id,
        period: selectedPeriodId,
        grades,
      })
      showToast('Notas guardadas', 'success')
      await loadGradebook(selectedAssignment.id, selectedPeriodId)
    } catch (e) {
      console.error(e)
      showToast('No se pudieron guardar las notas', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loadingInit) return <div className="p-6">Cargando…</div>

  return (
    <div className="space-y-6">
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((prev) => ({ ...prev, isVisible: false }))}
      />

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <GraduationCap className="h-6 w-6 text-blue-600" />
            </div>
            Calificaciones
          </h2>
          <p className="text-slate-500 mt-1">Planilla de notas por logros.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="min-w-44">
            <select
              value={selectedGradeId ?? ''}
              onChange={(e) => {
                const gradeId = e.target.value ? Number(e.target.value) : null
                setSelectedGradeId(gradeId)
                setSelectedGroupId(null)
                setSelectedAcademicLoadId(null)
                setSelectedPeriodId(null)
                setGradebook(null)
              }}
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="" disabled>Selecciona grado</option>
              {gradeOptions.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div className="min-w-44">
            <select
              value={selectedGroupId ?? ''}
              onChange={(e) => {
                const groupId = e.target.value ? Number(e.target.value) : null
                setSelectedGroupId(groupId)
                setSelectedAcademicLoadId(null)
                setSelectedPeriodId(null)
                setGradebook(null)
              }}
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!selectedGradeId}
            >
              <option value="" disabled>Selecciona grupo</option>
              {groupOptions.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div className="min-w-56">
            <select
              value={selectedAcademicLoadId ?? ''}
              onChange={(e) => {
                const loadId = e.target.value ? Number(e.target.value) : null
                setSelectedAcademicLoadId(loadId)
                setSelectedPeriodId(null)
                setGradebook(null)
              }}
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!selectedGroupId}
            >
              <option value="" disabled>Selecciona asignatura</option>
              {subjectOptions.map((s) => (
                <option key={s.academic_load} value={s.academic_load}>{s.subject_name}</option>
              ))}
            </select>
          </div>

          <div className="min-w-44">
            <select
              value={selectedPeriodId ?? ''}
              onChange={(e) => setSelectedPeriodId(e.target.value ? Number(e.target.value) : null)}
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!selectedAssignment}
            >
              <option value="" disabled>Selecciona periodo</option>
              {visiblePeriods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.is_closed ? ' (Cerrado)' : ''}
                </option>
              ))}
            </select>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving || dirtyKeys.size === 0 || !gradebook || periodIsClosed}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Save className="mr-2 h-4 w-4" />
            Guardar
          </Button>
        </div>
      </div>

      {loadingGradebook && <div className="p-4">Cargando planilla…</div>}

      {!loadingGradebook && gradebook && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-white">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-lg font-semibold text-slate-900">Planilla</CardTitle>
              {periodIsClosed && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-amber-200 bg-amber-50 text-amber-700">
                  Periodo cerrado
                </span>
              )}
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Estudiante</th>
                    {gradebook.achievements.map((a, idx) => (
                      <th
                        key={a.id}
                        className="px-6 py-4 font-semibold"
                        title={a.description}
                      >
                        <div className="flex flex-col">
                          <span>{`L${idx + 1}`}</span>
                          <span className="text-[10px] text-slate-400 normal-case">{a.percentage}%</span>
                        </div>
                      </th>
                    ))}
                    <th className="px-6 py-4 font-semibold">Definitiva</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {gradebook.students.map((s) => (
                    <tr key={s.enrollment_id} className="bg-white hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-slate-900">{s.student_name}</div>
                      </td>

                      {gradebook.achievements.map((a) => {
                        const key = makeKey(s.enrollment_id, a.id)
                        const value = cellValues[key] ?? ''
                        return (
                          <td key={a.id} className="px-6 py-4">
                            <Input
                              value={value}
                              onChange={(e) => handleChangeCell(s.enrollment_id, a.id, e.target.value)}
                              disabled={periodIsClosed}
                              inputMode="decimal"
                              className="w-24 text-center border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                              placeholder="—"
                              aria-label={`Nota ${s.student_name} logro ${a.id}`}
                            />
                          </td>
                        )
                      })}

                      <td className="px-6 py-4 whitespace-nowrap">
                        {(() => {
                          const c = computedByEnrollmentId.get(s.enrollment_id)
                          if (!c) return <span className="text-slate-400">—</span>
                          return (
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-900">{formatScore(c.final_score)}</span>
                              {c.scale ? <span className="text-xs text-slate-500">{c.scale}</span> : null}
                            </div>
                          )
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {gradebook.students.length === 0 && (
              <div className="text-sm text-slate-500">No hay estudiantes activos en el grupo.</div>
            )}

            {gradebook.achievements.length === 0 && (
              <div className="text-sm text-slate-500 mt-2">No hay logros planeados para este periodo/asignación.</div>
            )}
          </CardContent>
        </Card>
      )}

      {!loadingGradebook && !gradebook && (
        <div className="p-4 text-slate-600">
          Selecciona grado, grupo, asignatura y periodo.
        </div>
      )}
    </div>
  )
}

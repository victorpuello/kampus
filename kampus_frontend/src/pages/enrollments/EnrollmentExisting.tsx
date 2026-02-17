import { useMemo, useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { studentsApi, type Student } from '../../services/students'
import { academicApi, type AcademicYear, type Grade, type Group } from '../../services/academic'
import { enrollmentsApi } from '../../services/enrollments'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Label } from '../../components/ui/Label'
import { Search, UserCheck, AlertCircle } from 'lucide-react'
import { useAuthStore } from '../../store/auth'

type ApiErrorShape = {
  response?: {
    data?: {
      detail?: unknown
      non_field_errors?: unknown
    }
  }
}

function parseEnrollError(e: unknown, fallback: string) {
  const err = e as ApiErrorShape
  const data = err?.response?.data

  const nonField = data?.non_field_errors
  if (Array.isArray(nonField) && nonField.length > 0 && typeof nonField[0] === 'string') {
    return nonField[0]
  }

  const detail = data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail

  return fallback
}

export default function EnrollmentExisting() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const blocked = user?.role === 'TEACHER'
  const [searchTerm, setSearchTerm] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  
  // Academic Data
  const [activeYear, setActiveYear] = useState<AcademicYear | null>(null)
  const [grades, setGrades] = useState<Grade[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  
  // Form Data
  const [selectedGrade, setSelectedGrade] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [error, setError] = useState('')
  const [submitResult, setSubmitResult] = useState<{ success: number; errors: string[] } | null>(null)
  const [prefillApplied, setPrefillApplied] = useState(false)

  const prefill = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const groupRaw = params.get('group')
    const groupId = groupRaw ? Number(groupRaw) : null
    const returnToRaw = params.get('returnTo')
    const returnTo = returnToRaw && returnToRaw.startsWith('/') ? returnToRaw : ''
    return {
      groupId: groupId && Number.isFinite(groupId) && groupId > 0 ? groupId : null,
      returnTo,
    }
  }, [location.search])

  const selectedStudents = useMemo(() => {
    if (selectedIds.length === 0) return []
    const byId = new Map(students.map((s) => [s.id, s]))
    return selectedIds.map((id) => byId.get(id)).filter(Boolean) as Student[]
  }, [selectedIds, students])

  useEffect(() => {
    if (blocked) return
    loadInitialData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked])

  useEffect(() => {
    if (blocked) return
    if (selectedGrade && activeYear) {
      loadGroups(Number(selectedGrade))
    } else {
      setGroups([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked, selectedGrade, activeYear])

  const loadInitialData = async () => {
    try {
      const [yearsRes, gradesRes] = await Promise.all([
        academicApi.listYears(),
        academicApi.listGrades(),
      ])

      const years = yearsRes.data
      const currentYear = years.find(y => y.status === 'ACTIVE')
      let resolvedActiveYear: AcademicYear | null = currentYear ?? null
      let prefillGroup: Group | null = null
      if (prefill.groupId) {
        try {
          prefillGroup = (await academicApi.getGroup(prefill.groupId)).data
        } catch (e) {
          console.warn('Could not load prefill group:', e)
        }

        if (prefillGroup) {
          const prefillYearId = prefillGroup.academic_year
          resolvedActiveYear = years.find((y) => y.id === prefillYearId) ?? resolvedActiveYear
        }
      }

      if (resolvedActiveYear) {
        setActiveYear(resolvedActiveYear)
      } else {
        setError('No hay un año académico activo configurado.')
      }

      setGrades(gradesRes.data)

      if (prefillGroup && resolvedActiveYear && !prefillApplied) {
        setSelectedGrade(String(prefillGroup.grade))

        try {
          const groupListRes = await academicApi.listGroups({
            grade: prefillGroup.grade,
            academic_year: resolvedActiveYear.id,
          })
          setGroups(groupListRes.data)

          const existsInList = groupListRes.data.some(g => g.id === prefillGroup!.id)
          setSelectedGroup(existsInList ? String(prefillGroup.id) : '')
        } catch (e) {
          console.warn('Could not load groups for prefill:', e)
          setSelectedGroup('')
        }

        setPrefillApplied(true)
      }
    } catch (error) {
      console.error('Error loading initial data:', error)
      setError('Error cargando datos académicos.')
    }
  }

  const loadGroups = async (gradeId: number) => {
    if (!activeYear) return
    try {
      const response = await academicApi.listGroups({ 
        grade: gradeId,
        academic_year: activeYear.id 
      })
      setGroups(response.data)
    } catch (error) {
      console.error('Error loading groups:', error)
    }
  }

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!searchTerm.trim()) {
        setStudents([])
        return
    }

    if (!activeYear) {
      setError('No hay un año académico activo configurado.')
      return
    }

    setSearching(true)

    try {
      const response = await studentsApi.list({
        search: searchTerm,
        page: 1,
        page_size: 10,
        exclude_active_enrollment_year: activeYear.id,
      })
      setStudents(response.data.results)
    } catch (error) {
      console.error('Error searching students:', error)
    } finally {
      setSearching(false)
    }
  }

  // Predictive search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      if (blocked) return
      if (searchTerm.trim().length >= 2) {
        handleSearch()
      } else {
        setStudents([])
      }
    }, 500)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked, searchTerm, activeYear])

  const toggleSelected = (studentId: number) => {
    setSubmitResult(null)
    setSelectedIds((prev) => {
      if (prev.includes(studentId)) return prev.filter((id) => id !== studentId)
      return [...prev, studentId]
    })
  }

  const clearSelection = () => {
    setSelectedIds([])
    setSelectedGrade('')
    setSelectedGroup('')
    setSubmitResult(null)
  }

  const handleEnrollSelected = async () => {
    if (!activeYear || !selectedGrade || selectedIds.length === 0) return

    setLoading(true)
    setError('')
    setSubmitResult(null)

    try {
      const results = { success: 0, errors: [] as string[] }

      for (const studentId of selectedIds) {
        try {
          await enrollmentsApi.create({
            student: studentId,
            academic_year: activeYear.id,
            grade: Number(selectedGrade),
            group: selectedGroup ? Number(selectedGroup) : null,
            status: 'ACTIVE',
          })
          results.success += 1
        } catch (e: unknown) {
          const st = selectedStudents.find((s) => s.id === studentId)
          const who = st ? `${st.user.last_name} ${st.user.first_name} (${st.document_number})` : `ID ${studentId}`
          results.errors.push(`${who}: ${parseEnrollError(e, 'No se pudo procesar la matrícula')}`)
        }
      }

      setSubmitResult(results)

      if (results.errors.length === 0) {
        navigate(prefill.returnTo || '/enrollments')
      }
    } catch (err: unknown) {
      console.error('Error enrolling students:', err)
      setError(parseEnrollError(err, 'Error al procesar las matrículas. Verifique los datos.'))
    } finally {
      setLoading(false)
    }
  }

  if (blocked) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Matricular Antiguo</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 dark:text-slate-300">No tienes permisos para acceder al módulo de matrículas.</p>
          <div className="mt-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => navigate(prefill.returnTo || '/enrollments')} className="min-h-11 w-full sm:w-auto">
                Volver
              </Button>
              <Button variant="outline" onClick={() => navigate('/')} className="min-h-11 w-full sm:w-auto">
                Volver al Dashboard
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!activeYear && !error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Matricular Estudiante Antiguo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-4 text-center text-slate-600 dark:text-slate-300">Cargando configuración académica...</div>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate(prefill.returnTo || '/enrollments')} className="min-h-11 w-full sm:w-auto">
              Volver
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Matricular Estudiante Antiguo</h2>
          <p className="text-slate-500 dark:text-slate-400">Seleccione uno o varios estudiantes para matricularlos en el año {activeYear?.year}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate(prefill.returnTo || '/enrollments')}
          className="min-h-11 w-full shrink-0 lg:w-auto"
        >
          Volver
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Buscar Estudiante</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex flex-col gap-3 lg:flex-row">
            <div className="flex-1">
              <Input
                placeholder="Nombre o número de documento..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={searching} className="min-h-11 w-full lg:w-auto">
              <Search className="mr-2 h-4 w-4" />
              {searching ? 'Buscando...' : 'Buscar'}
            </Button>
          </form>

          {students.length > 0 && (
            <div className="mt-6 divide-y rounded-md border dark:divide-slate-800 dark:border-slate-800">
              {[...students]
                .sort((a, b) => {
                  const aLast = (a.user?.last_name || '').toLocaleLowerCase()
                  const bLast = (b.user?.last_name || '').toLocaleLowerCase()
                  if (aLast !== bLast) return aLast.localeCompare(bLast)

                  const aFirst = (a.user?.first_name || '').toLocaleLowerCase()
                  const bFirst = (b.user?.first_name || '').toLocaleLowerCase()
                  return aFirst.localeCompare(bFirst)
                })
                .map((student) => {
                const checked = selectedIds.includes(student.id)
                return (
                  <label
                    key={student.id}
                    className="flex cursor-pointer items-start justify-between gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-900 sm:items-center"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelected(student.id)}
                      />
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {student.user.last_name} {student.user.first_name}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {student.document_type}: {student.document_number}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 text-sm text-slate-500 dark:text-slate-400">{checked ? 'Seleccionado' : ''}</span>
                  </label>
                )
              })}
            </div>
          )}

          {students.length === 0 && searchTerm && !searching && (
            <div className="mt-6 text-center text-slate-500 dark:text-slate-400">
              No se encontraron estudiantes con ese criterio.
            </div>
          )}
        </CardContent>
      </Card>

      {selectedIds.length > 0 && (
        <Card className="border-blue-200 ring-1 ring-blue-100 dark:border-blue-900 dark:ring-blue-950/60">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div>
                <CardTitle>Seleccionados: {selectedIds.length}</CardTitle>
                {selectedStudents.length > 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 wrap-break-word">
                    {selectedStudents
                      .map((s) => `${s.user.last_name} ${s.user.first_name}`)
                      .join(', ')}
                  </p>
                ) : null}
              </div>
              <Button variant="ghost" className="min-h-11 w-full sm:ml-auto sm:w-auto" onClick={clearSelection}>
                Limpiar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>Grado a Matricular</Label>
                <select
                  className="flex h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={selectedGrade}
                  onChange={(e) => {
                    setSelectedGrade(e.target.value)
                    setSelectedGroup('')
                  }}
                >
                  <option value="">Seleccione un grado...</option>
                  {grades
                    .slice()
                    .sort((a, b) => {
                      const ao = a.ordinal === null || a.ordinal === undefined ? -9999 : a.ordinal
                      const bo = b.ordinal === null || b.ordinal === undefined ? -9999 : b.ordinal
                      if (ao !== bo) return bo - ao
                      return (a.name || '').localeCompare(b.name || '')
                    })
                    .map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Grupo (Opcional)</Label>
                <select
                  className="flex h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  disabled={!selectedGrade}
                >
                  <option value="">Seleccione un grupo...</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name} (Disponibles: {g.capacity - g.enrolled_count} de {g.capacity})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col pt-4 sm:flex-row sm:justify-end">
              <Button onClick={handleEnrollSelected} disabled={loading || !selectedGrade || selectedIds.length === 0} className="min-h-11 w-full sm:w-auto">
                <UserCheck className="mr-2 h-4 w-4" />
                {loading ? 'Procesando...' : `Confirmar Matrículas (${selectedIds.length})`}
              </Button>
            </div>

            {submitResult && (
              <div className="mt-2 rounded-md border bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="font-medium text-green-600 dark:text-green-300">Exitosos: {submitResult.success}</p>
                {submitResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="font-medium text-red-600 dark:text-red-300">Errores:</p>
                    <ul className="max-h-40 list-inside list-disc overflow-y-auto text-sm text-red-500 dark:text-red-300">
                      {submitResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
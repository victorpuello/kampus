import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { studentsApi } from '../services/students'
import type { Student } from '../services/students'
import type { GroupCompletionSummary } from '../services/students'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { GraduationCap, Plus, Search, User, UserCheck, Users } from 'lucide-react'
import { Input } from '../components/ui/Input'
import { useAuthStore } from '../store/auth'
import { academicApi } from '../services/academic'
import { Toast, type ToastType } from '../components/ui/Toast'
import { Modal } from '../components/ui/Modal'
import { NoveltyCaseForm } from '../components/novelties/NoveltyCaseForm'
import { StudentCompletionChecklist } from '../components/students/StudentCompletionChecklist'

export default function StudentList() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.role === 'TEACHER'
  const canImport = !isTeacher && user?.role !== 'PARENT' && user?.role !== 'STUDENT'
  const canCreateNovelty = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN'

  const [isNewNoveltyModalOpen, setIsNewNoveltyModalOpen] = useState(false)
  const [newNoveltyModalInitial, setNewNoveltyModalInitial] = useState<{ studentId?: number; typeId?: number }>({})
  const [completionDetailsTarget, setCompletionDetailsTarget] = useState<{
    studentId: number
    studentName: string
    completion: Student['completion']
  } | null>(null)

  const [data, setData] = useState<Student[]>([])
  const [groupCompletion, setGroupCompletion] = useState<GroupCompletionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [count, setCount] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [hasPrevious, setHasPrevious] = useState(false)
  const [teacherHasDirectedGroup, setTeacherHasDirectedGroup] = useState<boolean | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<null | { created: number; failed: number; errors: Array<{ row: number; error: unknown }> }>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const copyUsernameToClipboard = async (username: string) => {
    const value = (username || '').trim()
    if (!value) {
      showToast('El estudiante no tiene usuario para copiar', 'error')
      return
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      showToast(`Usuario copiado: ${value}`, 'success')
    } catch {
      showToast('No fue posible copiar el usuario', 'error')
    }
  }

  const studentStatusLabel = (raw: string | null | undefined): string => {
    const key = (raw || '').trim().toUpperCase()
    if (!key) return 'Sin matrícula'
    if (key === 'ACTIVE') return 'Activo'
    if (key === 'RETIRED') return 'Retirado'
    if (key === 'GRADUATED') return 'Graduado'
    return key
  }

  const studentStatusClassName = (raw: string | null | undefined): string => {
    const key = (raw || '').trim().toUpperCase()
    if (key === 'ACTIVE') return 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/45 dark:text-emerald-100 dark:border-emerald-800/70'
    if (key === 'RETIRED') return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/45 dark:text-amber-100 dark:border-amber-800/70'
    if (key === 'GRADUATED') return 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/45 dark:text-blue-100 dark:border-blue-800/70'
    if (!key) return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/70 dark:text-slate-200 dark:border-slate-700'
    return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/70 dark:text-slate-200 dark:border-slate-700'
  }

  const progressBarColor = (percent: number): string => {
    const greenMin = groupCompletion?.thresholds?.green_min ?? 90
    const yellowMin = groupCompletion?.thresholds?.yellow_min ?? 70
    if (percent >= greenMin) return 'bg-emerald-500'
    if (percent >= yellowMin) return 'bg-amber-500'
    return 'bg-red-500'
  }

  const shouldShowMissingButton = (student: Student): boolean => {
    const percent = student.completion?.percent
    return percent !== 100
  }

  const hasCompletionMissingItems = (completion: Student['completion']): boolean => {
    if (!completion?.sections) return false
    return Object.values(completion.sections).some((section) => (section?.missing?.length ?? 0) > 0)
  }

  const openNewNoveltyModal = (opts: { studentId: number; typeId?: number }) => {
    if (!canCreateNovelty) return
    setNewNoveltyModalInitial({ studentId: opts.studentId, typeId: opts.typeId })
    setIsNewNoveltyModalOpen(true)
  }

  const openCompletionDetails = (student: Student) => {
    const studentName = `${student.user?.last_name ?? ''} ${student.user?.first_name ?? ''}`.trim() || 'Estudiante'
    setCompletionDetailsTarget({
      studentId: student.user?.id ?? student.id,
      studentName,
      completion: student.completion,
    })
  }

  const topErrors = useMemo(() => {
    if (!importResult?.errors?.length) return []
    return importResult.errors.slice(0, 5)
  }, [importResult])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
    }, 300)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [searchTerm])

  const searchParam = useMemo(() => {
    const q = debouncedSearchTerm.trim()
    return q ? q : undefined
  }, [debouncedSearchTerm])

  const statusParam = useMemo(() => {
    const s = statusFilter.trim()
    return s ? s : undefined
  }, [statusFilter])

  useEffect(() => {
    let mounted = true

    if (!isTeacher || !user?.id) {
      setTeacherHasDirectedGroup(null)
      return
    }

    setTeacherHasDirectedGroup(null)

    ;(async () => {
      try {
        const yearsRes = await academicApi.listYears()
        const activeYear = yearsRes.data.find((y) => y.status === 'ACTIVE')
        const groupsRes = await academicApi.listGroups({
          director: user.id,
          ...(activeYear ? { academic_year: activeYear.id } : {}),
        })

        if (!mounted) return
        setTeacherHasDirectedGroup(groupsRes.data.length > 0)
      } catch {
        if (!mounted) return
        // Fail closed for UX: hide/disable students view if we can't verify.
        setTeacherHasDirectedGroup(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [isTeacher, user?.id])

  useEffect(() => {
    let mounted = true

    if (isTeacher && teacherHasDirectedGroup === null) {
      setLoading(true)
      setError(null)
      return () => {
        mounted = false
      }
    }

    if (isTeacher && teacherHasDirectedGroup === false) {
      setData([])
      setCount(0)
      setHasNext(false)
      setHasPrevious(false)
      setLoading(false)
      setError(null)
      return () => {
        mounted = false
      }
    }

    setLoading(true)
    setError(null)

    studentsApi
      .list({
        page,
        page_size: pageSize,
        search: searchParam,
        current_enrollment_status: statusParam,
        ...(isTeacher ? { include_completion: 1 } : {}),
      })
      .then((res) => {
        if (!mounted) return
        setData(res.data.results)
        setCount(res.data.count)
        setHasNext(Boolean(res.data.next))
        setHasPrevious(Boolean(res.data.previous))
        setGroupCompletion((res.data as unknown as { group_completion?: GroupCompletionSummary }).group_completion ?? null)
      })
      .catch(() => {
        if (mounted) setError('No se pudo cargar la lista')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [page, pageSize, searchParam, statusParam, isTeacher, teacherHasDirectedGroup])

  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  const startIndex = count === 0 ? 0 : (page - 1) * pageSize + 1
  const endIndex = Math.min(count, (page - 1) * pageSize + data.length)

  const pageNumbers: Array<number | 'ellipsis'> = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)

    const windowSize = 2
    const start = Math.max(2, page - windowSize)
    const end = Math.min(totalPages - 1, page + windowSize)

    const pages: Array<number | 'ellipsis'> = [1]
    if (start > 2) pages.push('ellipsis')
    for (let p = start; p <= end; p++) pages.push(p)
    if (end < totalPages - 1) pages.push('ellipsis')
    pages.push(totalPages)
    return pages
  })()

  if (isTeacher && teacherHasDirectedGroup === false) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Estudiantes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 dark:text-slate-300">
            No tienes asignación como director de grupo. Para ver estudiantes, primero debes
            estar asignado como director de un grupo.
          </p>
        </CardContent>
      </Card>
    )
  }

  const trafficLight = groupCompletion?.traffic_light
  const trafficLightClass = (() => {
    if (trafficLight === 'green') return 'bg-emerald-500'
    if (trafficLight === 'yellow') return 'bg-amber-500'
    if (trafficLight === 'red') return 'bg-red-500'
    return 'bg-slate-400'
  })()

  return (
    <div className="space-y-6">
      {isTeacher && teacherHasDirectedGroup === true && groupCompletion && (
        <Card>
          <CardHeader>
            <CardTitle>Progreso del grupo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className={`inline-block h-3 w-3 rounded-full ${trafficLightClass}`} />
                <div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">Promedio de cumplimiento</div>
                  <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                    {groupCompletion.avg_percent === null ? 'N/D' : `${groupCompletion.avg_percent}%`}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <div className="text-slate-500 dark:text-slate-400">Estudiantes</div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{groupCompletion.students_total}</div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <div className="text-slate-500 dark:text-slate-400">Computables</div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{groupCompletion.students_computable}</div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <div className="text-slate-500 dark:text-slate-400">Sin matrícula activa</div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{groupCompletion.students_missing_enrollment}</div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <div className="text-slate-500 dark:text-slate-400">100%</div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{groupCompletion.complete_100_count}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header Section */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-950/30">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-300" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Estudiantes</h2>
          </div>
          <p className="text-slate-500 dark:text-slate-400">Gestiona la información de los estudiantes matriculados.</p>
        </div>
        {!isTeacher && (
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            {canImport && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setImporting(true)
                    setImportResult(null)
                    try {
                      const res = await studentsApi.bulkImport(file)
                      setImportResult(res.data)
                      showToast(
                        `Importación finalizada: ${res.data.created} creados, ${res.data.failed} con error`,
                        res.data.failed > 0 ? 'info' : 'success'
                      )
                      setPage(1)
                    } catch (err: unknown) {
                      const detail =
                        typeof err === 'object' && err !== null && 'response' in err
                          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                          : undefined

                      showToast(detail || 'No se pudo importar el archivo', 'error')
                    } finally {
                      setImporting(false)
                      // allow re-selecting the same file
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }
                  }}
                />
                <Button
                  variant="outline"
                  className="min-h-11 w-full sm:w-auto"
                  disabled={importing}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {importing ? 'Importando…' : 'Importar (CSV/XLS/XLSX)'}
                </Button>
              </>
            )}
            <Link to="/students/new">
              <Button className="min-h-11 w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" /> Crear estudiante
              </Button>
            </Link>
          </div>
        )}
      </div>

      {importResult && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Resultado de importación</p>
                <p className="text-sm text-slate-600">
                  {importResult.created} creados • {importResult.failed} con error
                </p>
              </div>
              {importResult.failed > 0 && (
                <div className="text-xs text-slate-500">
                  Mostrando primeros {topErrors.length} errores
                </div>
              )}
            </div>

            {importResult.failed > 0 && (
              <div className="mt-3 space-y-2">
                {topErrors.map((e, i) => (
                  <div
                    key={i}
                    className="p-2 rounded border border-amber-200 bg-amber-50 text-amber-900 text-sm dark:border-amber-800/70 dark:bg-amber-950/45 dark:text-amber-100"
                  >
                    <span className="font-semibold">Fila {e.row}:</span>{' '}
                    <span className="wrap-break-word">{typeof e.error === 'string' ? e.error : JSON.stringify(e.error)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Estudiantes</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-2">{count}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg dark:bg-blue-950/30">
                <Users className="h-6 w-6 text-blue-600 dark:text-blue-300" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Hombres</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-2">
                  {data.filter(s => s.sex === 'M').length}
                </p>
              </div>
              <div className="p-3 bg-indigo-100 rounded-lg dark:bg-indigo-950/30">
                <User className="h-6 w-6 text-indigo-600 dark:text-indigo-300" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Mujeres</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-2">
                  {data.filter(s => s.sex === 'F').length}
                </p>
              </div>
              <div className="p-3 bg-pink-100 rounded-lg dark:bg-pink-950/30">
                <UserCheck className="h-6 w-6 text-pink-600 dark:text-pink-300" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className={`${count > 0 ? 'md:sticky md:top-3 md:z-20' : ''} motion-safe:transition-all motion-safe:duration-200`}>
            <div className={`rounded-xl border bg-white/95 dark:bg-slate-900/95 backdrop-blur supports-backdrop-filter:bg-white/85 supports-backdrop-filter:dark:bg-slate-900/85 p-2 sm:p-3 motion-safe:transition-all motion-safe:duration-200 ${count > 0 ? 'border-slate-200/90 dark:border-slate-700 shadow-sm md:shadow-md' : 'border-slate-200/70 dark:border-slate-800 shadow-sm dark:shadow-none'}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <CardTitle>Listado de estudiantes</CardTitle>
                <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                  <div className="relative w-full lg:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500 dark:text-slate-300" />
                    <Input
                      placeholder="Buscar estudiante..."
                      className="h-11 pl-8"
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value)
                        setPage(1)
                      }}
                    />
                  </div>

                  <select
                    className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:scheme-dark sm:min-w-40"
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value)
                      setPage(1)
                    }}
                    aria-label="Filtrar por estado"
                  >
                    <option value="">Todos</option>
                    <option value="ACTIVE">Activo</option>
                    <option value="RETIRED">Retirado</option>
                    <option value="GRADUATED">Graduado</option>
                    <option value="NONE">Sin matrícula</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          {loading && data.length > 0 && (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Actualizando resultados…</p>
          )}
          {error && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/70 dark:bg-red-950/45 dark:text-red-100">
              {error}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {/* Mobile list */}
          <div className="grid grid-cols-1 gap-3 lg:hidden">
            {loading && data.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 md:col-span-2">
                Cargando…
              </div>
            ) : data.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900 md:col-span-2">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                  <GraduationCap className="h-6 w-6 text-slate-400" />
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">No se encontraron estudiantes</p>
              </div>
            ) : (
              data.map((s, index) => (
                <div
                  key={s.user?.id || s.document_number || index}
                  className="group flex h-full flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:bg-blue-50/50 dark:border-slate-800/80 dark:bg-slate-950/70 dark:hover:bg-slate-900/80"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/students/${s.user?.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') navigate(`/students/${s.user?.id}`)
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="h-14 w-14 shrink-0 rounded-2xl bg-linear-to-br from-sky-500 via-blue-500 to-indigo-600 p-0.5 shadow-md ring-1 ring-blue-200/70 dark:ring-blue-900/40 md:h-16 md:w-16">
                      <div className="h-full w-full rounded-[0.85rem] bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
                        {(((s.photo_thumb ?? s.photo ?? '').trim()) ? (
                          <img
                            src={s.photo_thumb ?? s.photo}
                            alt={`Foto de ${s.user?.first_name ?? ''} ${s.user?.last_name ?? ''}`.trim() || 'Foto del estudiante'}
                            className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <span className="text-base font-semibold tracking-wide text-slate-900/80 dark:text-white md:text-lg">
                            {(s.user?.last_name?.[0] || '')}
                            {(s.user?.first_name?.[0] || '')}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold uppercase text-slate-900 dark:text-slate-100 md:text-base">
                        {s.user?.last_name} {s.user?.first_name}
                      </div>
                      <button
                        type="button"
                        className="truncate rounded bg-slate-50 px-1.5 py-0.5 text-left text-xs font-mono text-slate-500 transition-colors hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 md:text-sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          copyUsernameToClipboard(s.user?.username || '')
                        }}
                        title="Copiar usuario"
                      >
                        @{s.user?.username}
                      </button>
                      <div className="mt-2 grid grid-cols-1 gap-1 text-sm md:grid-cols-2 md:gap-2">
                        <div className="text-slate-700 dark:text-slate-200">
                          <span className="text-xs text-slate-500 dark:text-slate-400">Documento: </span>
                          <span className="font-mono">{s.document_number || '-'}</span>
                        </div>
                        <div className="text-slate-700 dark:text-slate-200">
                          <span className="text-xs text-slate-500 dark:text-slate-400">Estado: </span>
                          <span
                            className={
                              'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ' +
                              studentStatusClassName(s.current_enrollment_status)
                            }
                          >
                            {studentStatusLabel(s.current_enrollment_status)}
                          </span>
                        </div>
                        <div className="text-slate-700 dark:text-slate-200">
                          <span className="text-xs text-slate-500 dark:text-slate-400">Tel: </span>
                          {s.phone || '-'}
                        </div>
                        <div className="truncate text-slate-700 dark:text-slate-200 md:col-span-2">
                          <span className="text-xs text-slate-500 dark:text-slate-400">Email: </span>
                          {s.user?.email || '-'}
                        </div>
                      </div>

                      {isTeacher ? (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>Progreso ficha</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                              {s.completion?.percent === null || s.completion?.percent === undefined ? 'N/D' : `${s.completion.percent}%`}
                            </span>
                          </div>
                          <div className="mt-2 h-2 w-full rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full ${progressBarColor(Number(s.completion?.percent ?? 0))}`}
                              style={{ width: `${Math.min(100, Math.max(0, Number(s.completion?.percent ?? 0)))}%` }}
                            />
                          </div>
                          {s.completion?.message ? (
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{s.completion.message}</div>
                          ) : null}

                          {shouldShowMissingButton(s) ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2"
                              onClick={(e) => {
                                e.stopPropagation()
                                openCompletionDetails(s)
                              }}
                            >
                              Ver datos faltantes
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-auto pt-3">
                    {canCreateNovelty ? (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="min-h-11 flex-1 border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200 dark:hover:bg-amber-900/30"
                          onClick={(e) => {
                            e.stopPropagation()
                            openNewNoveltyModal({ studentId: s.id })
                          }}
                        >
                          Registrar novedad
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          className="min-h-11 flex-1"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/students/${s.user?.id}`)
                          }}
                        >
                          Ver ficha
                        </Button>

                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="min-h-11 w-full"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/students/${s.user?.id}`)
                        }}
                      >
                        Ver ficha
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border border-slate-200 shadow-sm dark:border-slate-800 lg:block">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200 dark:from-slate-900 dark:to-slate-800 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider dark:text-slate-300">
                    Estudiante
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider dark:text-slate-300">
                    Documento
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider dark:text-slate-300">
                    Estado
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider dark:text-slate-300">
                    Contacto
                  </th>
                  {isTeacher ? (
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider dark:text-slate-300">
                      Progreso
                    </th>
                  ) : null}
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider dark:text-slate-300">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200 dark:bg-slate-900 dark:divide-slate-800">
                {loading && data.length === 0 ? (
                  <tr>
                    <td colSpan={isTeacher ? 6 : 5} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                      Cargando…
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={isTeacher ? 6 : 5} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="p-4 bg-slate-100 rounded-full dark:bg-slate-800">
                          <GraduationCap className="h-8 w-8 text-slate-400" />
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">No se encontraron estudiantes</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.map((s, index) => (
                    <tr 
                      key={s.user?.id || s.document_number || index} 
                      className="group hover:bg-blue-50/50 transition-colors duration-150 cursor-pointer dark:hover:bg-slate-800/60"
                      onClick={() => navigate(`/students/${s.user?.id}`)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="h-14 w-14 shrink-0 rounded-2xl bg-linear-to-br from-sky-500 via-blue-500 to-indigo-600 p-0.5 shadow-md ring-1 ring-blue-200/70 dark:ring-blue-900/40">
                            <div className="h-full w-full rounded-[0.85rem] bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
                              {(((s.photo_thumb ?? s.photo ?? '').trim()) ? (
                                <img
                                  src={s.photo_thumb ?? s.photo}
                                  alt={`Foto de ${s.user?.first_name ?? ''} ${s.user?.last_name ?? ''}`.trim() || 'Foto del estudiante'}
                                  className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                                  loading="lazy"
                                />
                              ) : (
                                <span className="text-sm font-semibold tracking-wide text-slate-900/80 dark:text-white">
                                  {(s.user?.last_name?.[0] || '')}{(s.user?.first_name?.[0] || '')}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="font-semibold text-slate-900 uppercase dark:text-slate-100">
                              {s.user?.last_name} {s.user?.first_name}
                            </div>
                            <button
                              type="button"
                              className="rounded bg-slate-50 px-1.5 py-0.5 text-left text-xs font-mono text-slate-500 transition-colors hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                              onClick={(e) => {
                                e.stopPropagation()
                                copyUsernameToClipboard(s.user?.username || '')
                              }}
                              title="Copiar usuario"
                            >
                              @{s.user?.username}
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-900 font-mono dark:text-slate-100">{s.document_number || '-'}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{s.document_type}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={
                            'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ' +
                            studentStatusClassName(s.current_enrollment_status)
                          }
                        >
                          {studentStatusLabel(s.current_enrollment_status)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-900 dark:text-slate-100">{s.phone || '-'}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{s.user?.email || '-'}</div>
                      </td>
                      {isTeacher ? (
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-2 w-28 rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full ${progressBarColor(Number(s.completion?.percent ?? 0))}`}
                                style={{ width: `${Math.min(100, Math.max(0, Number(s.completion?.percent ?? 0)))}%` }}
                              />
                            </div>
                            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                              {s.completion?.percent === null || s.completion?.percent === undefined ? 'N/D' : `${s.completion.percent}%`}
                            </div>
                          </div>
                          {s.completion?.message ? (
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{s.completion.message}</div>
                          ) : null}

                          {shouldShowMissingButton(s) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-2 h-7 px-2 text-xs"
                              onClick={(e) => {
                                e.stopPropagation()
                                openCompletionDetails(s)
                              }}
                            >
                              Ver datos faltantes
                            </Button>
                          ) : null}
                        </td>
                      ) : null}
                      <td className="px-6 py-4 text-right">
                        <div
                          className="relative inline-flex items-center justify-end gap-2"
                        >
                          {canCreateNovelty ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Novedades"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openNewNoveltyModal({ studentId: s.id })
                                }}
                                className="text-amber-700 hover:text-amber-800 hover:bg-amber-50 dark:text-amber-200 dark:hover:text-amber-100 dark:hover:bg-amber-900/20"
                              >
                                Novedades
                              </Button>
                            </>
                          ) : null}

                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/students/${s.user?.id}`)
                            }}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            Ver ficha
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Mostrando {startIndex}-{endIndex} de {count} • Página {page} de {totalPages}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500 dark:text-slate-400">Por página</span>
                <select
                  className="h-11 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:scheme-dark"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                </select>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!hasPrevious || page <= 1}
              >
                Anterior
              </Button>

              <div className="hidden lg:flex items-center gap-1">
                {pageNumbers.map((p, idx) =>
                  p === 'ellipsis' ? (
                    <span key={`e-${idx}`} className="px-2 text-slate-500 dark:text-slate-400">
                      …
                    </span>
                  ) : (
                    <Button
                      key={p}
                      variant={p === page ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => setPage(p)}
                      aria-current={p === page ? 'page' : undefined}
                    >
                      {p}
                    </Button>
                  )
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasNext}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {canCreateNovelty ? (
        <Modal
          isOpen={isNewNoveltyModalOpen}
          onClose={() => setIsNewNoveltyModalOpen(false)}
          title="Nueva novedad"
          size="lg"
        >
          <NoveltyCaseForm
            initial={{ studentId: newNoveltyModalInitial.studentId, typeId: newNoveltyModalInitial.typeId }}
            onCancel={() => setIsNewNoveltyModalOpen(false)}
            onCreated={(caseId) => {
              setIsNewNoveltyModalOpen(false)
              navigate(`/novelties/${caseId}`)
            }}
          />
        </Modal>
      ) : null}

      <Modal
        isOpen={Boolean(completionDetailsTarget)}
        onClose={() => setCompletionDetailsTarget(null)}
        title={completionDetailsTarget ? `Faltantes para 100% · ${completionDetailsTarget.studentName}` : 'Faltantes para 100%'}
        size="lg"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setCompletionDetailsTarget(null)}
            >
              Cerrar
            </Button>
            {hasCompletionMissingItems(completionDetailsTarget?.completion) ? (
              <Button
                onClick={() => {
                  if (!completionDetailsTarget) return
                  const targetId = completionDetailsTarget.studentId
                  setCompletionDetailsTarget(null)
                  navigate(`/students/${targetId}`)
                }}
              >
                Ir a ficha
              </Button>
            ) : null}
          </>
        }
      >
        <StudentCompletionChecklist
          studentName={completionDetailsTarget?.studentName ?? 'Estudiante'}
          completion={completionDetailsTarget?.completion}
        />
      </Modal>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((t) => ({ ...t, isVisible: false }))}
      />
    </div>
  )
}

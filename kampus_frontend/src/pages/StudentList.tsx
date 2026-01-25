import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { studentsApi } from '../services/students'
import type { Student } from '../services/students'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Plus, Search, Users, User, UserCheck, GraduationCap } from 'lucide-react'
import { Input } from '../components/ui/Input'
import { useAuthStore } from '../store/auth'
import { academicApi } from '../services/academic'
import { Toast, type ToastType } from '../components/ui/Toast'

export default function StudentList() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.role === 'TEACHER'
  const canImport = !isTeacher && user?.role !== 'PARENT' && user?.role !== 'STUDENT'
  const [data, setData] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
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
      })
      .then((res) => {
        if (!mounted) return
        setData(res.data.results)
        setCount(res.data.count)
        setHasNext(Boolean(res.data.next))
        setHasPrevious(Boolean(res.data.previous))
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
  }, [page, pageSize, searchParam, isTeacher, teacherHasDirectedGroup])

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

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
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
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
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
                  className="w-full md:w-auto"
                  disabled={importing}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {importing ? 'Importando…' : 'Importar (CSV/XLS/XLSX)'}
                </Button>
              </>
            )}
            <Link to="/students/new">
              <Button className="w-full md:w-auto">
                <Plus className="mr-2 h-4 w-4" /> Nuevo Estudiante
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
                    className="p-2 rounded border border-amber-200 bg-amber-50 text-amber-900 text-sm dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle>Listado de Alumnos</CardTitle>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
              <Input 
                placeholder="Buscar estudiante..." 
                className="pl-8"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setPage(1)
                }}
              />
            </div>
          </div>
          {loading && data.length > 0 && (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Actualizando resultados…</p>
          )}
          {error && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {/* Mobile list */}
          <div className="md:hidden space-y-3">
            {loading && data.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                Cargando…
              </div>
            ) : data.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                  <GraduationCap className="h-6 w-6 text-slate-400" />
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">No se encontraron estudiantes</p>
              </div>
            ) : (
              data.map((s, index) => (
                <div
                  key={s.user?.id || s.document_number || index}
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:bg-blue-50/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/60"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/students/${s.user?.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') navigate(`/students/${s.user?.id}`)
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 h-12 w-12 rounded-xl bg-linear-to-br from-blue-500 to-indigo-600 p-0.5 shadow-sm ring-1 ring-slate-900/10 dark:ring-white/10">
                      <div className="h-full w-full rounded-[0.65rem] bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
                        {((s.photo ?? '').trim() ? (
                          <img
                            src={s.photo}
                            alt={`Foto de ${s.user?.first_name ?? ''} ${s.user?.last_name ?? ''}`.trim() || 'Foto del estudiante'}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="text-slate-900/80 dark:text-white font-semibold text-sm">
                            {(s.user?.last_name?.[0] || '')}
                            {(s.user?.first_name?.[0] || '')}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900 uppercase dark:text-slate-100 truncate">
                        {s.user?.last_name} {s.user?.first_name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">@{s.user?.username}</div>
                      <div className="mt-2 grid grid-cols-1 gap-1 text-sm">
                        <div className="text-slate-700 dark:text-slate-200">
                          <span className="text-xs text-slate-500 dark:text-slate-400">Documento: </span>
                          <span className="font-mono">{s.document_number || '-'}</span>
                        </div>
                        <div className="text-slate-700 dark:text-slate-200">
                          <span className="text-xs text-slate-500 dark:text-slate-400">Tel: </span>
                          {s.phone || '-'}
                        </div>
                        <div className="text-slate-700 dark:text-slate-200 truncate">
                          <span className="text-xs text-slate-500 dark:text-slate-400">Email: </span>
                          {s.user?.email || '-'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/students/${s.user?.id}`)
                      }}
                    >
                      Ver ficha
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200 dark:from-slate-900 dark:to-slate-800 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider dark:text-slate-300">
                    Estudiante
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider dark:text-slate-300">
                    Documento
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider dark:text-slate-300">
                    Contacto
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider dark:text-slate-300">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200 dark:bg-slate-900 dark:divide-slate-800">
                {loading && data.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                      Cargando…
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center">
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
                      className="hover:bg-blue-50/50 transition-colors duration-150 cursor-pointer dark:hover:bg-slate-800/60"
                      onClick={() => navigate(`/students/${s.user?.id}`)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="shrink-0 h-14 w-14 rounded-xl bg-linear-to-br from-blue-500 to-indigo-600 p-0.5 shadow-sm ring-1 ring-slate-900/10 dark:ring-white/10">
                            <div className="h-full w-full rounded-[0.65rem] bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
                              {((s.photo ?? '').trim() ? (
                                <img
                                  src={s.photo}
                                  alt={`Foto de ${s.user?.first_name ?? ''} ${s.user?.last_name ?? ''}`.trim() || 'Foto del estudiante'}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <span className="text-slate-900/80 dark:text-white font-semibold text-sm">
                                  {(s.user?.last_name?.[0] || '')}{(s.user?.first_name?.[0] || '')}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="font-semibold text-slate-900 uppercase dark:text-slate-100">
                              {s.user?.last_name} {s.user?.first_name}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">@{s.user?.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-900 font-mono dark:text-slate-100">{s.document_number || '-'}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{s.document_type}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-900 dark:text-slate-100">{s.phone || '-'}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{s.user?.email || '-'}</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/students/${s.user?.id}`)
                          }}
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        >
                          Ver Ficha →
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-4">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Mostrando {startIndex}-{endIndex} de {count} • Página {page} de {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500 dark:text-slate-400">Por página</span>
                <select
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!hasPrevious || page <= 1}
              >
                Anterior
              </Button>

              <div className="hidden md:flex items-center gap-1">
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
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasNext}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((t) => ({ ...t, isVisible: false }))}
      />
    </div>
  )
}

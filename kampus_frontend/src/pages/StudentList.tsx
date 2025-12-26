import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { studentsApi } from '../services/students'
import type { Student } from '../services/students'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Plus, Search, Users, User, UserCheck, GraduationCap } from 'lucide-react'
import { Input } from '../components/ui/Input'
import { useAuthStore } from '../store/auth'
import { academicApi } from '../services/academic'

export default function StudentList() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.role === 'TEACHER'
  const [data, setData] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [count, setCount] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [hasPrevious, setHasPrevious] = useState(false)
  const [teacherHasDirectedGroup, setTeacherHasDirectedGroup] = useState<boolean | null>(null)

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
        search: searchTerm.trim() ? searchTerm.trim() : undefined,
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
  }, [page, pageSize, searchTerm, isTeacher, teacherHasDirectedGroup])

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

  if (loading) return <div className="p-6">Cargando…</div>
  if (error) return <div className="p-6 text-red-600">{error}</div>

  if (isTeacher && teacherHasDirectedGroup === false) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Estudiantes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600">
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
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Estudiantes</h2>
          </div>
          <p className="text-slate-500">Gestiona la información de los estudiantes matriculados.</p>
        </div>
        {!isTeacher && (
          <Link to="/students/new">
            <Button className="w-full md:w-auto">
              <Plus className="mr-2 h-4 w-4" /> Nuevo Estudiante
            </Button>
          </Link>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Total Estudiantes</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{count}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Hombres</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {data.filter(s => s.sex === 'M').length}
                </p>
              </div>
              <div className="p-3 bg-indigo-100 rounded-lg">
                <User className="h-6 w-6 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Mujeres</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">
                  {data.filter(s => s.sex === 'F').length}
                </p>
              </div>
              <div className="p-3 bg-pink-100 rounded-lg">
                <UserCheck className="h-6 w-6 text-pink-600" />
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
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Estudiante
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Documento
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Contacto
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="p-4 bg-slate-100 rounded-full">
                          <GraduationCap className="h-8 w-8 text-slate-400" />
                        </div>
                        <p className="text-slate-500 text-sm">No se encontraron estudiantes</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.map((s, index) => (
                    <tr 
                      key={s.user?.id || s.document_number || index} 
                      className="hover:bg-blue-50/50 transition-colors duration-150 cursor-pointer"
                      onClick={() => navigate(`/students/${s.user?.id}`)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="shrink-0 h-10 w-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                            <span className="text-white font-semibold text-sm">
                              {(s.user?.first_name?.[0] || '')}{(s.user?.last_name?.[0] || '')}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="font-semibold text-slate-900 uppercase">
                              {s.user?.first_name} {s.user?.last_name}
                            </div>
                            <div className="text-xs text-slate-500">@{s.user?.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-900 font-mono">{s.document_number || '-'}</div>
                        <div className="text-xs text-slate-500">{s.document_type}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-900">{s.phone || '-'}</div>
                        <div className="text-xs text-slate-500">{s.user?.email || '-'}</div>
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
            <div className="text-sm text-slate-500">
              Mostrando {startIndex}-{endIndex} de {count} • Página {page} de {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">Por página</span>
                <select
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
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
                    <span key={`e-${idx}`} className="px-2 text-slate-500">
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
    </div>
  )
}

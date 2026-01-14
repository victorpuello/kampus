import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { enrollmentsApi, type Enrollment } from '../../services/enrollments'
import { academicApi, type AcademicYear, type Grade, type Group } from '../../services/academic'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardHeader } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { ConfirmationModal } from '../../components/ui/ConfirmationModal'
import { Search, Plus, FileText, GraduationCap, Users, BookOpen, Upload } from 'lucide-react'
import { useAuthStore } from '../../store/auth'

export default function EnrollmentList() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.role === 'TEACHER'
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [years, setYears] = useState<AcademicYear[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [count, setCount] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [hasPrevious, setHasPrevious] = useState(false)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editGradeId, setEditGradeId] = useState<number | ''>('')
  const [editGroupId, setEditGroupId] = useState<number | ''>('')
  const [editStatus, setEditStatus] = useState<Enrollment['status']>('ACTIVE')
  const [rowBusyId, setRowBusyId] = useState<number | null>(null)

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteConfirmLoading, setDeleteConfirmLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; studentName: string } | null>(null)

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    if (selectedYear) {
      loadEnrollments()
    }
  }, [selectedYear, page, pageSize, searchTerm])

  const loadInitialData = async () => {
    try {
      const [yearsRes, gradesRes] = await Promise.all([academicApi.listYears(), academicApi.listGrades()])
      setYears(yearsRes.data)
      setGrades(gradesRes.data)
      const activeYear = yearsRes.data.find(y => y.status === 'ACTIVE')
      if (activeYear) {
        setSelectedYear(String(activeYear.id))
      } else if (yearsRes.data.length > 0) {
        setSelectedYear(String(yearsRes.data[0].id))
      }
    } catch (error) {
      console.error('Error loading years:', error)
    }
  }

  const getId = (value: unknown): number | null => {
    if (typeof value === 'number') return value
    if (value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
      const v = (value as Record<string, unknown>).id
      if (typeof v === 'number') return v
    }
    return null
  }

  const loadGroupsForEdit = async (gradeId: number) => {
    if (!selectedYear) {
      setGroups([])
      return
    }
    try {
      const res = await academicApi.listGroups({ academic_year: Number(selectedYear), grade: gradeId })
      setGroups(res.data)
    } catch (e) {
      console.error(e)
      setGroups([])
    }
  }

  const startEdit = async (enrollment: Enrollment) => {
    const gradeId = getId(enrollment.grade)
    if (!gradeId) return

    const groupId = getId(enrollment.group)
    setEditingId(enrollment.id)
    setEditGradeId(gradeId)
    setEditGroupId(typeof groupId === 'number' ? groupId : '')
    setEditStatus(enrollment.status)
    await loadGroupsForEdit(gradeId)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditGradeId('')
    setEditGroupId('')
    setGroups([])
  }

  const saveEdit = async (enrollmentId: number) => {
    if (typeof editGradeId !== 'number') return

    setRowBusyId(enrollmentId)
    try {
      await enrollmentsApi.patch(enrollmentId, {
        grade: editGradeId,
        group: typeof editGroupId === 'number' ? editGroupId : null,
        status: editStatus,
      })
      await loadEnrollments()
      cancelEdit()
    } catch (e) {
      console.error(e)
    } finally {
      setRowBusyId(null)
    }
  }

  const requestDeleteEnrollment = (enrollment: Enrollment) => {
    const student = typeof enrollment.student === 'number' ? null : enrollment.student
    setDeleteTarget({
      id: enrollment.id,
      studentName: student?.full_name || `Matrícula #${enrollment.id}`,
    })
    setDeleteConfirmOpen(true)
  }

  const confirmDeleteEnrollment = async () => {
    if (!deleteTarget) return

    setDeleteConfirmLoading(true)
    setRowBusyId(deleteTarget.id)
    try {
      await enrollmentsApi.delete(deleteTarget.id)
      await loadEnrollments()
      if (editingId === deleteTarget.id) cancelEdit()
      setDeleteConfirmOpen(false)
      setDeleteTarget(null)
    } catch (e) {
      console.error(e)
    } finally {
      setRowBusyId(null)
      setDeleteConfirmLoading(false)
    }
  }

  if (isTeacher) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <GraduationCap className="h-6 w-6 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Matrículas</h2>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600">No tienes permisos para acceder al módulo de matrículas.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const loadEnrollments = async () => {
    setLoading(true)
    try {
      const response = await enrollmentsApi.list({
        academic_year: selectedYear,
        page,
        page_size: pageSize,
        search: searchTerm.trim() ? searchTerm.trim() : undefined,
      })
      setEnrollments(response.data.results)
      setCount(response.data.count)
      setHasNext(Boolean(response.data.next))
      setHasPrevious(Boolean(response.data.previous))
    } catch (error) {
      console.error('Error loading enrollments:', error)
    } finally {
      setLoading(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  const startIndex = count === 0 ? 0 : (page - 1) * pageSize + 1
  const endIndex = Math.min(count, (page - 1) * pageSize + enrollments.length)

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

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <GraduationCap className="h-6 w-6 text-blue-600" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Matrículas</h2>
          </div>
          <p className="text-slate-500">Gestión de matrículas académicas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/enrollments/reports')}>
            <FileText className="mr-2 h-4 w-4" />
            Reportes
          </Button>
          <Button variant="outline" onClick={() => navigate('/enrollments/bulk-upload')}>
            <Upload className="mr-2 h-4 w-4" />
            Carga masiva
          </Button>
          <Button variant="outline" onClick={() => navigate('/enrollments/existing')}>
            <Plus className="mr-2 h-4 w-4" />
            Matricular Antiguo
          </Button>
          <Button onClick={() => navigate('/enrollments/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva Matrícula
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Total Matriculados</p>
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
                <p className="text-sm font-medium text-slate-500">Activos</p>
                <p className="text-3xl font-bold text-green-600 mt-2">
                  {enrollments.filter(e => e.status === 'ACTIVE').length}
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <BookOpen className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Graduados</p>
                <p className="text-3xl font-bold text-blue-600 mt-2">
                  {enrollments.filter(e => e.status === 'GRADUATED').length}
                </p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <GraduationCap className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="w-full sm:w-64">
              <select
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                {years.map(y => (
                  <option key={y.id} value={y.id}>{y.year} ({y.status})</option>
                ))}
              </select>
            </div>
            <div className="relative w-full sm:w-64">
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
                    Grado
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Grupo
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        <p className="text-slate-500 text-sm">Cargando matrículas...</p>
                      </div>
                    </td>
                  </tr>
                ) : enrollments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="p-4 bg-slate-100 rounded-full">
                          <GraduationCap className="h-8 w-8 text-slate-400" />
                        </div>
                        <p className="text-slate-500 text-sm">No se encontraron matrículas</p>
                        <p className="text-slate-400 text-xs">Intenta ajustar los filtros de búsqueda</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  enrollments.map((enrollment) => {
                    const student =
                      typeof enrollment.student === 'number' ? null : enrollment.student
                    const grade = typeof enrollment.grade === 'number' ? null : enrollment.grade
                    const group = typeof enrollment.group === 'number' ? null : enrollment.group

                    if (!student || !grade) return null
                    const isEditing = editingId === enrollment.id

                    return (
                      <tr 
                        key={enrollment.id} 
                        className="hover:bg-blue-50/50 transition-colors duration-150 cursor-pointer"
                        onClick={() => {
                          if (isEditing) return
                          navigate(`/students/${student.id}`)
                        }}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div className="shrink-0 h-10 w-10 bg-linear-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                              <span className="text-white font-semibold text-sm">
                                {student.full_name
                                  .split(' ')
                                  .filter(Boolean)
                                  .map((n) => n[0])
                                  .join('')
                                  .substring(0, 2)
                                  .toUpperCase()}
                              </span>
                            </div>
                            <div className="ml-4">
                              <div className="font-semibold text-slate-900">{student.full_name}</div>
                              <div className="text-xs text-slate-500">
                                {student.document_type ? `${student.document_type}: ` : ''}{student.document_number}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-700 font-mono text-sm">
                          {student.document_number}
                        </td>
                        <td className="px-6 py-4">
                          {isEditing ? (
                            <select
                              value={editGradeId}
                              onChange={async (e) => {
                                const v = e.target.value ? Number(e.target.value) : ''
                                if (typeof v === 'number') {
                                  setEditGradeId(v)
                                  setEditGroupId('')
                                  await loadGroupsForEdit(v)
                                } else {
                                  setEditGradeId('')
                                  setEditGroupId('')
                                  setGroups([])
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                            >
                              {grades
                                .slice()
                                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
                                .map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {g.name}
                                  </option>
                                ))}
                            </select>
                          ) : (
                            <span className="inline-flex items-center px-3 py-1 rounded-md bg-purple-100 text-purple-800 text-sm font-medium">
                              {grade.name}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {isEditing ? (
                            <select
                              value={editGroupId}
                              onChange={(e) => setEditGroupId(e.target.value ? Number(e.target.value) : '')}
                              onClick={(e) => e.stopPropagation()}
                              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                            >
                              <option value="">Sin grupo</option>
                              {groups
                                .slice()
                                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
                                .map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {g.name}
                                  </option>
                                ))}
                            </select>
                          ) : group ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-md bg-indigo-100 text-indigo-800 text-sm font-medium">
                              {group.name}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-sm">Sin grupo</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {isEditing ? (
                            <select
                              value={editStatus}
                              onChange={(e) => setEditStatus(e.target.value as Enrollment['status'])}
                              onClick={(e) => e.stopPropagation()}
                              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                            >
                              <option value="ACTIVE">Activo</option>
                              <option value="RETIRED">Retirado</option>
                              <option value="GRADUATED">Graduado</option>
                            </select>
                          ) : (
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold shadow-sm ${
                              enrollment.status === 'ACTIVE' ? 'bg-green-100 text-green-800 ring-1 ring-green-600/20' :
                              enrollment.status === 'RETIRED' ? 'bg-red-100 text-red-800 ring-1 ring-red-600/20' :
                              'bg-blue-100 text-blue-800 ring-1 ring-blue-600/20'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-2 ${
                                enrollment.status === 'ACTIVE' ? 'bg-green-600' :
                                enrollment.status === 'RETIRED' ? 'bg-red-600' : 'bg-blue-600'
                              }`}></span>
                              {enrollment.status === 'ACTIVE' ? 'Activo' :
                               enrollment.status === 'RETIRED' ? 'Retirado' : 'Graduado'}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            {isEditing ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    cancelEdit()
                                  }}
                                  disabled={rowBusyId === enrollment.id}
                                >
                                  Cancelar
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    saveEdit(enrollment.id)
                                  }}
                                  disabled={rowBusyId === enrollment.id}
                                >
                                  Guardar
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    startEdit(enrollment)
                                  }}
                                  className="text-slate-700 hover:bg-slate-100"
                                  disabled={rowBusyId === enrollment.id}
                                >
                                  Editar
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    requestDeleteEnrollment(enrollment)
                                  }}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  disabled={rowBusyId === enrollment.id}
                                >
                                  Eliminar
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    navigate(`/students/${student.id}`)
                                  }}
                                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                  disabled={rowBusyId === enrollment.id}
                                >
                                  Ver Ficha →
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
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

      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        onClose={() => {
          if (deleteConfirmLoading) return
          setDeleteConfirmOpen(false)
          setDeleteTarget(null)
        }}
        onConfirm={() => {
          void confirmDeleteEnrollment()
        }}
        title="Eliminar matrícula"
        description={
          deleteTarget
            ? `¿Seguro que deseas eliminar la matrícula de ${deleteTarget.studentName}? Esta acción no se puede deshacer.`
            : '¿Seguro que deseas eliminar esta matrícula? Esta acción no se puede deshacer.'
        }
        confirmText={deleteConfirmLoading ? 'Eliminando…' : 'Eliminar'}
        cancelText="Cancelar"
        loading={deleteConfirmLoading}
      />
    </div>
  )
}

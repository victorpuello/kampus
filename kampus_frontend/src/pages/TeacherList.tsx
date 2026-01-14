import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { teachersApi } from '../services/teachers'
import { academicApi, type AcademicYear } from '../services/academic'
import type { Teacher } from '../services/teachers'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Toast, type ToastType } from '../components/ui/Toast'
import { Plus, Search, Trash2, GraduationCap, BookOpen, Users, School } from 'lucide-react'
import { Input } from '../components/ui/Input'
import { useAuthStore } from '../store/auth'

export default function TeacherList() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.role === 'TEACHER'

  const [data, setData] = useState<Teacher[]>([])
  const [years, setYears] = useState<AcademicYear[]>([])
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Load years first if not loaded
      let currentYearId = selectedYear
      if (years.length === 0) {
        const yearsRes = await academicApi.listYears()
        setYears(yearsRes.data)
        if (yearsRes.data.length > 0 && !currentYearId) {
          const activeYear = yearsRes.data.find(y => y.status === 'ACTIVE')
          currentYearId = String(activeYear ? activeYear.id : yearsRes.data[0].id)
          setSelectedYear(currentYearId)
        }
      }

      const teachersRes = await teachersApi.getAll(currentYearId ? Number(currentYearId) : undefined)
      setData(teachersRes.data)
    } catch (err) {
      console.error(err)
      setError('No se pudo cargar la información')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isTeacher) return
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, isTeacher])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
    }, 300)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [searchTerm])

  const handleDelete = async (id: number) => {
    try {
      await teachersApi.delete(id)
      showToast('Docente eliminado correctamente', 'success')
      setDeleteConfirm(null)
      loadData()
    } catch (err) {
      console.error(err)
      showToast('Error al eliminar el docente', 'error')
    }
  }

  const getTargetHours = (level: string) => {
    switch (level) {
      case 'PRESCHOOL': return 20;
      case 'PRIMARY': return 25;
      case 'SECONDARY': return 22;
      default: return 22;
    }
  }

  const getLevelLabel = (level: string) => {
    switch (level) {
      case 'PRESCHOOL': return 'Preescolar';
      case 'PRIMARY': return 'Primaria';
      case 'SECONDARY': return 'Secundaria';
      default: return '';
    }
  }

  const normalizedSearch = debouncedSearchTerm.trim().toLocaleLowerCase()
  const filteredData = useMemo(() => {
    if (!normalizedSearch) return data

    const raw = debouncedSearchTerm.trim()

    return data.filter((t) => {
      const firstName = (t.user.first_name ?? '').toLocaleLowerCase()
      const lastName = (t.user.last_name ?? '').toLocaleLowerCase()
      const username = (t.user.username ?? '').toLocaleLowerCase()
      const documentNumber = (t.document_number ?? '').toString()
      const title = (t.title ?? '').toString().toLocaleLowerCase()

      return (
        firstName.includes(normalizedSearch) ||
        lastName.includes(normalizedSearch) ||
        username.includes(normalizedSearch) ||
        documentNumber.includes(raw) ||
        title.includes(normalizedSearch)
      )
    })
  }, [data, debouncedSearchTerm, normalizedSearch])

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const aLast = (a.user.last_name || '').trim().toLocaleLowerCase()
      const bLast = (b.user.last_name || '').trim().toLocaleLowerCase()
      if (aLast !== bLast) return aLast.localeCompare(bLast)

      const aFirst = (a.user.first_name || '').trim().toLocaleLowerCase()
      const bFirst = (b.user.first_name || '').trim().toLocaleLowerCase()
      if (aFirst !== bFirst) return aFirst.localeCompare(bFirst)

      return (a.user.username || '').localeCompare(b.user.username || '')
    })
  }, [filteredData])

  // Stats
  const totalTeachers = data.length
  const fullLoadTeachers = data.filter(t => (t.assigned_hours || 0) >= getTargetHours(t.teaching_level)).length
  const avgHours = data.length > 0 
    ? (data.reduce((acc, t) => acc + (t.assigned_hours || 0), 0) / data.length).toFixed(1) 
    : '0'

  if (isTeacher) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Docentes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600">No tienes permisos para acceder al módulo de docentes.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />

      {/* Modal de confirmación de eliminación */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">¿Eliminar docente?</h3>
            <p className="text-slate-600 mb-4">
              Esta acción no se puede deshacer. Se eliminará el docente y su cuenta de usuario asociada.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                Cancelar
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => handleDelete(deleteConfirm)}
              >
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <GraduationCap className="h-6 w-6 text-blue-600" />
            </div>
            Docentes
          </h2>
          <p className="text-slate-500 mt-1">Gestiona la planta docente de la institución.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-40">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {years.map(y => (
                <option key={y.id} value={y.id}>Año {y.year} {y.status_display ? `(${y.status_display})` : ''}</option>
              ))}
            </select>
          </div>
          <Link to="/teachers/new">
            <Button className="w-full md:w-auto bg-blue-600 hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" /> Nuevo Docente
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500">Total Docentes</p>
              <Users className="h-4 w-4 text-slate-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{totalTeachers}</div>
            <p className="text-xs text-slate-500 mt-1">
              Registrados en el sistema
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500">Carga Completa</p>
              <BookOpen className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{fullLoadTeachers}</div>
            <p className="text-xs text-slate-500 mt-1">
              Docentes con asignación completa
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500">Promedio Horas</p>
              <School className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{avgHours}h</div>
            <p className="text-xs text-slate-500 mt-1">
              Promedio de asignación por docente
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle className="text-lg font-semibold text-slate-900">Listado de Docentes</CardTitle>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Buscar por nombre, documento..." 
                className="pl-9 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          {loading && data.length > 0 && (
            <p className="mt-2 text-sm text-slate-500">Actualizando resultados…</p>
          )}
          {error && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold">Docente</th>
                  <th className="px-6 py-4 font-semibold">Título / Especialidad</th>
                  <th className="px-6 py-4 font-semibold">Carga Académica</th>
                  <th className="px-6 py-4 font-semibold">Escalafón</th>
                  <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && data.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                      Cargando…
                    </td>
                  </tr>
                ) : sortedData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center py-4">
                        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                          <Search className="h-6 w-6 text-slate-400" />
                        </div>
                        <p className="font-medium text-slate-900">No se encontraron docentes</p>
                        <p className="text-sm text-slate-500 mt-1">Intenta ajustar los filtros de búsqueda</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedData.map((t) => (
                    <tr key={t.id} className="bg-white hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="h-10 w-10 rounded-full bg-linear-to-br from-blue-100 to-blue-200 flex items-center justify-center mr-3 text-blue-700 font-bold text-sm shadow-sm border border-blue-200">
                            {(t.user.last_name || '')[0]}{(t.user.first_name || '')[0]}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 uppercase">{t.user.last_name} {t.user.first_name}</div>
                            <div className="text-xs text-slate-500 flex items-center gap-1">
                              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{t.user.username}</span>
                              <span>•</span>
                              <span>{t.user.email}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">{t.title || '-'}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{t.specialty || '-'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="w-full max-w-[180px]">
                          <div className="flex justify-between text-xs mb-1.5 font-medium">
                            <span className={
                                (t.assigned_hours || 0) > getTargetHours(t.teaching_level) ? 'text-amber-600 font-bold' : 
                                (t.assigned_hours || 0) === getTargetHours(t.teaching_level) ? 'text-emerald-600 font-bold' : 'text-slate-700'
                            }>
                                {t.assigned_hours || 0} / {getTargetHours(t.teaching_level)}h
                            </span>
                            <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                              {getLevelLabel(t.teaching_level)}
                            </span>
                          </div>
                          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                (t.assigned_hours || 0) > getTargetHours(t.teaching_level) ? 'bg-amber-500' : 
                                (t.assigned_hours || 0) === getTargetHours(t.teaching_level) ? 'bg-emerald-500' : 'bg-blue-500'
                              }`}
                              style={{ width: `${Math.min(((t.assigned_hours || 0) / getTargetHours(t.teaching_level)) * 100, 100)}%` }}
                            />
                          </div>
                          {(t.assigned_hours || 0) > getTargetHours(t.teaching_level) && (
                            <div className="text-[10px] font-medium text-amber-600 mt-1.5 flex items-center bg-amber-50 px-2 py-0.5 rounded w-fit">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span>
                                +{(t.assigned_hours || 0) - getTargetHours(t.teaching_level)}h extras
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                          {t.salary_scale}
                        </div>
                        <div className="text-xs text-slate-500 mt-1.5 ml-1">
                          {t.regime === '2277' ? 'Estatuto 2277' : t.regime === '1278' ? 'Estatuto 1278' : ''}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`/teachers/${t.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600">
                              <span className="sr-only">Editar</span>
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                            </Button>
                          </Link>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => setDeleteConfirm(t.id)}
                          >
                            <span className="sr-only">Eliminar</span>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

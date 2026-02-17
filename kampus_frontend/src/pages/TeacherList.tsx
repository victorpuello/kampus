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
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const copyUsernameToClipboard = async (username: string) => {
    const value = (username || '').trim()
    if (!value) {
      showToast('El docente no tiene nombre de usuario para copiar', 'error')
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

  useEffect(() => {
    setPage(1)
  }, [selectedYear, debouncedSearchTerm])

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

  const totalPages = useMemo(() => {
    const safePerPage = Math.max(1, perPage)
    return Math.max(1, Math.ceil(sortedData.length / safePerPage))
  }, [perPage, sortedData.length])

  const currentPage = Math.min(Math.max(1, page), totalPages)

  useEffect(() => {
    if (page !== currentPage) setPage(currentPage)
  }, [currentPage, page])

  const pageItems = useMemo(() => {
    const safePerPage = Math.max(1, perPage)
    const start = (currentPage - 1) * safePerPage
    return sortedData.slice(start, start + safePerPage)
  }, [currentPage, perPage, sortedData])

  const desktopPages = useMemo(() => {
    if (totalPages <= 9) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages = new Set<number>()
    pages.add(1)
    pages.add(totalPages)
    for (let p = currentPage - 2; p <= currentPage + 2; p += 1) {
      if (p >= 1 && p <= totalPages) pages.add(p)
    }
    const sorted = Array.from(pages).sort((a, b) => a - b)
    const out: Array<number | '…'> = []
    for (let i = 0; i < sorted.length; i += 1) {
      const v = sorted[i]
      const prev = i > 0 ? sorted[i - 1] : null
      if (prev !== null && v - prev > 1) out.push('…')
      out.push(v)
    }
    return out
  }, [currentPage, totalPages])

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
          <p className="text-slate-600 dark:text-slate-300">No tienes permisos para acceder al módulo de docentes.</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-slate-900">
            <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">¿Eliminar docente?</h3>
            <p className="mb-4 text-slate-600 dark:text-slate-300">
              Esta acción no se puede deshacer. Se eliminará el docente y su cuenta de usuario asociada.
            </p>
            <div className="flex flex-col gap-3 md:flex-row md:justify-end">
              <Button variant="outline" className="min-h-11 w-full md:w-auto" onClick={() => setDeleteConfirm(null)}>
                Cancelar
              </Button>
              <Button 
                variant="destructive" 
                className="min-h-11 w-full md:w-auto"
                onClick={() => handleDelete(deleteConfirm)}
              >
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-950/40">
              <GraduationCap className="h-6 w-6 text-blue-600" />
            </div>
            Docentes
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Gestiona la planta docente de la institución.</p>
        </div>
        <div className="flex w-full flex-col gap-2 md:flex-row md:items-center md:gap-4 lg:w-auto">
          <div className="w-full md:w-56 lg:w-40">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="flex h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:scheme-dark"
            >
              {years.map(y => (
                <option key={y.id} value={y.id}>Año {y.year} {y.status_display ? `(${y.status_display})` : ''}</option>
              ))}
            </select>
          </div>
          <Link to="/teachers/new" className="w-full md:w-auto">
            <Button className="min-h-11 w-full bg-blue-600 hover:bg-blue-700 md:w-auto">
              <Plus className="mr-2 h-4 w-4" /> Crear docente
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Docentes</p>
              <Users className="h-4 w-4 text-slate-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{totalTeachers}</div>
            <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">
              Registrados en el sistema
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Carga Completa</p>
              <BookOpen className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{fullLoadTeachers}</div>
            <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">
              Docentes con asignación completa
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Promedio Horas</p>
              <School className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{avgHours}h</div>
            <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">
              Promedio de asignación por docente
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-sm dark:border-slate-800">
        <CardHeader className="border-b border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className={`${sortedData.length > 0 ? 'md:sticky md:top-3 md:z-20' : ''} motion-safe:transition-all motion-safe:duration-200`}>
            <div className={`rounded-xl border bg-white/95 dark:bg-slate-900/95 backdrop-blur supports-backdrop-filter:bg-white/85 supports-backdrop-filter:dark:bg-slate-900/85 p-2 sm:p-3 motion-safe:transition-all motion-safe:duration-200 ${sortedData.length > 0 ? 'border-slate-200/90 dark:border-slate-700 shadow-sm md:shadow-md' : 'border-slate-200/70 dark:border-slate-800 shadow-sm dark:shadow-none'}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">Listado de docentes</CardTitle>
                <div className="relative w-full lg:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-300" />
                  <Input 
                    placeholder="Buscar por nombre, documento..." 
                    className="h-11 pl-9 border-slate-200 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-xs text-slate-500 dark:text-slate-300">
                  Mostrando {pageItems.length} de {sortedData.length} docentes
                  {sortedData.length > 0 ? ` • Página ${currentPage} de ${totalPages}` : ''}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-300">Por página:</span>
                  <select
                    value={perPage}
                    onChange={(e) => {
                      setPerPage(parseInt(e.target.value) || 10)
                      setPage(1)
                    }}
                    className="h-11 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:scheme-dark"
                    aria-label="Docentes por página"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
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
          {/* Mobile: cards */}
          <div className="p-4 lg:hidden">
            {loading && data.length === 0 ? (
              <div className="py-8 text-center text-slate-500 dark:text-slate-400">Cargando…</div>
            ) : pageItems.length === 0 ? (
              <div className="py-8 text-center">
                <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 dark:bg-slate-800">
                  <Search className="h-6 w-6 text-slate-400" />
                </div>
                <p className="font-medium text-slate-900 dark:text-slate-100">No se encontraron docentes</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Intenta ajustar los filtros de búsqueda</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pageItems.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-800"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-11 w-11 rounded-full bg-linear-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-700 font-bold text-sm shadow-sm border border-blue-200 shrink-0 overflow-hidden dark:from-blue-950/40 dark:to-blue-900/30 dark:text-blue-200 dark:border-blue-900/40">
                        {(((t.photo_thumb ?? t.photo ?? '').trim()) ? (
                          <img
                            src={t.photo_thumb ?? t.photo ?? ''}
                            alt={`${t.user.last_name ?? ''} ${t.user.first_name ?? ''}`.trim() || t.user.username || 'Foto del docente'}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <>
                            {(t.user.last_name || '')[0]}{(t.user.first_name || '')[0]}
                          </>
                        ))}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 uppercase truncate dark:text-slate-100">
                          {t.user.last_name} {t.user.first_name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 wrap-break-word">
                          <button
                            type="button"
                            className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            onClick={() => copyUsernameToClipboard(t.user.username || '')}
                            title="Copiar usuario"
                          >
                            {t.user.username}
                          </button>
                          {t.user.email ? <span className="ml-2">• {t.user.email}</span> : null}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2">
                      <div className="text-sm">
                        <div className="text-[11px] font-bold text-slate-400 uppercase">Título / Especialidad</div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">{t.title || '-'}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{t.specialty || '-'}</div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
                          <span
                            className={
                              (t.assigned_hours || 0) > getTargetHours(t.teaching_level)
                                ? 'text-amber-600 font-bold'
                                : (t.assigned_hours || 0) === getTargetHours(t.teaching_level)
                                  ? 'text-emerald-600 font-bold'
                                  : 'text-slate-700 dark:text-slate-200'
                            }
                          >
                            Carga: {t.assigned_hours || 0} / {getTargetHours(t.teaching_level)}h
                          </span>
                          <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
                            {getLevelLabel(t.teaching_level)}
                          </span>
                        </div>
                        <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200 dark:bg-slate-800 dark:border-slate-700">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              (t.assigned_hours || 0) > getTargetHours(t.teaching_level)
                                ? 'bg-amber-500'
                                : (t.assigned_hours || 0) === getTargetHours(t.teaching_level)
                                  ? 'bg-emerald-500'
                                  : 'bg-blue-500'
                            }`}
                            style={{ width: `${Math.min(((t.assigned_hours || 0) / getTargetHours(t.teaching_level)) * 100, 100)}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[11px] font-bold text-slate-400 uppercase">Escalafón</div>
                          <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700">
                            {t.salary_scale}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {t.regime === '2277' ? 'Estatuto 2277' : t.regime === '1278' ? 'Estatuto 1278' : ''}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-11 w-full sm:w-auto"
                            onClick={() => navigate(`/teachers/${t.id}`)}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="min-h-11 w-full sm:w-auto"
                            onClick={() => setDeleteConfirm(t.id)}
                          >
                            Eliminar
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {totalPages > 1 && (
                  <div className="pt-2 flex items-center justify-between gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      disabled={currentPage <= 1}
                      onClick={() => setPage(Math.max(1, currentPage - 1))}
                    >
                      Anterior
                    </Button>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Página {currentPage} de {totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                    >
                      Siguiente
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-5xl w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200 dark:text-slate-300 dark:from-slate-900 dark:to-slate-800 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 font-semibold">Docente</th>
                  <th className="px-6 py-4 font-semibold">Título / Especialidad</th>
                  <th className="px-6 py-4 font-semibold">Carga Académica</th>
                  <th className="px-6 py-4 font-semibold">Escalafón</th>
                  <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading && data.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-slate-500 dark:text-slate-400">
                      Cargando…
                    </td>
                  </tr>
                ) : pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">
                      <div className="flex flex-col items-center justify-center py-4">
                        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 dark:bg-slate-800">
                          <Search className="h-6 w-6 text-slate-400" />
                        </div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">No se encontraron docentes</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Intenta ajustar los filtros de búsqueda</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pageItems.map((t) => (
                    <tr key={t.id} className="bg-white hover:bg-slate-50/80 transition-colors dark:bg-slate-900 dark:hover:bg-slate-800/60">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="h-10 w-10 rounded-full bg-linear-to-br from-blue-100 to-blue-200 flex items-center justify-center mr-3 text-blue-700 font-bold text-sm shadow-sm border border-blue-200 overflow-hidden">
                            {(((t.photo_thumb ?? t.photo ?? '').trim()) ? (
                              <img
                                src={t.photo_thumb ?? t.photo ?? ''}
                                alt={`${t.user.last_name ?? ''} ${t.user.first_name ?? ''}`.trim() || t.user.username || 'Foto del docente'}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <>
                                {(t.user.last_name || '')[0]}{(t.user.first_name || '')[0]}
                              </>
                            ))}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 uppercase dark:text-slate-100">{t.user.last_name} {t.user.first_name}</div>
                            <div className="text-xs text-slate-500 flex items-center gap-1">
                              <button
                                type="button"
                                className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                onClick={() => copyUsernameToClipboard(t.user.username || '')}
                                title="Copiar usuario"
                              >
                                {t.user.username}
                              </button>
                              <span>•</span>
                              <span>{t.user.email}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{t.title || '-'}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t.specialty || '-'}</div>
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
                            <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
                              {getLevelLabel(t.teaching_level)}
                            </span>
                          </div>
                          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200 dark:bg-slate-800 dark:border-slate-700">
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
                        <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700">
                          {t.salary_scale}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 ml-1">
                          {t.regime === '2277' ? 'Estatuto 2277' : t.regime === '1278' ? 'Estatuto 1278' : ''}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`/teachers/${t.id}`}>
                            <Button variant="ghost" size="sm" className="h-10 w-10 p-0 hover:bg-blue-50 hover:text-blue-600">
                              <span className="sr-only">Editar</span>
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                            </Button>
                          </Link>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-10 w-10 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
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

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-10"
                    disabled={currentPage <= 1}
                    onClick={() => setPage(Math.max(1, currentPage - 1))}
                  >
                    ◀
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-10"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                  >
                    ▶
                  </Button>
                  <div className="text-xs text-slate-500 dark:text-slate-400 ml-2">
                    Página {currentPage} de {totalPages}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 justify-end">
                  {desktopPages.map((p, idx) =>
                    p === '…' ? (
                      <span key={`ellipsis-${idx}`} className="px-2 text-slate-400">…</span>
                    ) : (
                      <Button
                        key={p}
                        variant={p === currentPage ? 'secondary' : 'outline'}
                        size="sm"
                        className="min-h-10 px-2"
                        onClick={() => setPage(p)}
                        aria-current={p === currentPage ? 'page' : undefined}
                      >
                        {p}
                      </Button>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

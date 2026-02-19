import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usersApi } from '../services/users'
import type { User } from '../services/users'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Plus, Search, UserCog, Trash2, Shield, Users, CheckCircle } from 'lucide-react'
import { Input } from '../components/ui/Input'
import { ConfirmationModal } from '../components/ui/ConfirmationModal'
import { useAuthStore } from '../store/auth'
import { Toast, type ToastType } from '../components/ui/Toast'

export default function UserList() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.role === 'TEACHER'

  const [data, setData] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [count, setCount] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [hasPrevious, setHasPrevious] = useState(false)
  
  // Modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<number | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
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
      showToast('El usuario no tiene username para copiar', 'error')
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

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
    }, 300)

    return () => window.clearTimeout(t)
  }, [searchTerm])

  const searchParam = useMemo(() => {
    const q = debouncedSearchTerm.trim()
    return q ? q : undefined
  }, [debouncedSearchTerm])

  useEffect(() => {
    let mounted = true

    if (isTeacher) return

    setLoading(true)
    setError(null)

    usersApi
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
        if (mounted) setError('No se pudo cargar la lista de usuarios')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [isTeacher, page, pageSize, searchParam])

  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  const startIndex = count === 0 ? 0 : (page - 1) * pageSize + 1
  const endIndex = Math.min(count, (page - 1) * pageSize + data.length)

  const isInitialLoading = loading && data.length === 0

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

  // Stats
  const totalUsers = count
  const activeUsers = data.filter(u => u.is_active).length
  const adminUsers = data.filter(u => ['SUPERADMIN', 'ADMIN'].includes(u.role)).length

  const openDeleteModal = (id: number) => {
    setUserToDelete(id)
    setDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    if (userToDelete === null) return

    setIsDeleting(true)
    try {
      await usersApi.delete(userToDelete)
      setDeleteModalOpen(false)
      setUserToDelete(null)

      // Reload current page (server-side)
      const res = await usersApi.list({
        page,
        page_size: pageSize,
        search: searchTerm.trim() ? searchTerm.trim() : undefined,
      })
      setData(res.data.results)
      setCount(res.data.count)
      setHasNext(Boolean(res.data.next))
      setHasPrevious(Boolean(res.data.previous))

      // If we deleted the last item of the last page, go back one page.
      if (res.data.results.length === 0 && page > 1) {
        setPage(page - 1)
      }
    } catch (error) {
      console.error('Error deleting user:', error)
      alert('Error al eliminar el usuario')
    } finally {
      setIsDeleting(false)
    }
  }

  const getRoleBadgeClasses = (role: string) => {
    switch (role) {
      case 'SUPERADMIN':
        return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/45 dark:text-purple-100 dark:border-purple-800/70'
      case 'ADMIN':
        return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/45 dark:text-red-100 dark:border-red-800/70'
      case 'COORDINATOR':
        return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/45 dark:text-orange-100 dark:border-orange-800/70'
      case 'SECRETARY':
        return 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/45 dark:text-sky-100 dark:border-sky-800/70'
      case 'TEACHER':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/45 dark:text-emerald-100 dark:border-emerald-800/70'
      case 'PARENT':
        return 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/45 dark:text-teal-100 dark:border-teal-800/70'
      case 'STUDENT':
        return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/45 dark:text-blue-100 dark:border-blue-800/70'
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/70 dark:text-slate-200 dark:border-slate-700'
    }
  }

  const getActiveBadgeClasses = (isActive: boolean) => {
    return isActive
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/45 dark:text-emerald-100 dark:border-emerald-800/70'
      : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900/70 dark:text-slate-200 dark:border-slate-700'
  }

  const getRoleLabel = (role: string) => {
    const roles: Record<string, string> = {
      'SUPERADMIN': 'Super Admin',
      'ADMIN': 'Administrador',
      'COORDINATOR': 'Coordinador',
      'SECRETARY': 'Secretaría',
      'TEACHER': 'Docente',
      'PARENT': 'Acudiente',
      'STUDENT': 'Estudiante',
    }
    return roles[role] || role
  }

  if (isTeacher) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Usuarios</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 dark:text-slate-300">No tienes permisos para acceder al módulo de usuarios.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/dashboard')}>Volver al Dashboard</Button>
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
        onClose={() => setToast((prev) => ({ ...prev, isVisible: false }))}
      />

      {error ? (
        <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-sm dark:border-rose-800/70 dark:bg-rose-950/45 dark:text-rose-100">{error}</div>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-950/40">
              <UserCog className="h-6 w-6 text-blue-600 dark:text-blue-300" />
            </div>
            Usuarios del Sistema
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Administración general de cuentas y roles.</p>
        </div>
        <Link to="/users/new" className="w-full md:w-auto">
          <Button className="min-h-11 w-full md:w-auto bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" /> Crear usuario
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Usuarios</p>
              <Users className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{totalUsers}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Cuentas registradas
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Usuarios Activos</p>
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{activeUsers}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Activos en esta página
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Administradores</p>
              <Shield className="h-4 w-4 text-purple-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{adminUsers}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              En esta página
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-sm dark:border-slate-800">
        <CardHeader className="border-b border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className={`${count > 0 ? 'md:sticky md:top-3 md:z-20' : ''} motion-safe:transition-all motion-safe:duration-200`}>
            <div className={`rounded-xl border bg-white/95 dark:bg-slate-900/95 backdrop-blur supports-backdrop-filter:bg-white/85 supports-backdrop-filter:dark:bg-slate-900/85 p-2 sm:p-3 motion-safe:transition-all motion-safe:duration-200 ${count > 0 ? 'border-slate-200/90 dark:border-slate-700 shadow-sm md:shadow-md' : 'border-slate-200/70 dark:border-slate-800 shadow-sm dark:shadow-none'}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">Listado de usuarios</CardTitle>
                <div className="relative w-full lg:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-300" />
                  <Input 
                    placeholder="Buscar por nombre, email..." 
                    className="h-11 pl-9 border-slate-200 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value)
                      setPage(1)
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
          {loading && data.length > 0 ? (
            <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">Actualizando resultados…</div>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile list */}
          <div className="p-4 lg:hidden">
            {isInitialLoading ? (
              <div className="py-10 text-center text-slate-500 dark:text-slate-400">Cargando usuarios…</div>
            ) : data.length === 0 ? (
              <div className="py-10 text-center text-slate-500 dark:text-slate-400">
                <div className="flex flex-col items-center justify-center">
                  <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 dark:bg-slate-800">
                    <Search className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">No se encontraron usuarios</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Intenta ajustar los filtros de búsqueda</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {data.map((u) => (
                  <div
                    key={u.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-slate-800"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-11 w-11 rounded-full bg-linear-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-600 shadow-sm border border-slate-200 shrink-0 dark:from-slate-800 dark:to-slate-700 dark:text-slate-200 dark:border-slate-700">
                        <span className="font-bold text-sm">
                          {(u.first_name?.[0] || 'U') + (u.last_name?.[0] || 'S')}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-slate-100 wrap-break-word">
                              {u.first_name} {u.last_name}
                            </div>
                            <button
                              type="button"
                              className="mt-0.5 w-fit rounded bg-slate-50 px-1.5 py-0.5 text-left text-xs font-mono text-slate-500 transition-colors hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                              onClick={() => copyUsernameToClipboard(u.username || '')}
                              title="Copiar usuario"
                            >
                              @{u.username}
                            </button>
                          </div>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${getActiveBadgeClasses(u.is_active)}`}>
                            <span
                              className={`w-1.5 h-1.5 rounded-full mr-1.5 ${u.is_active ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-slate-400 dark:bg-slate-500'}`}
                            ></span>
                            {u.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${getRoleBadgeClasses(u.role)}`}>
                            {getRoleLabel(u.role)}
                          </span>
                        </div>

                        <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 wrap-break-word">
                          {u.email || '—'}
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <Link to={`/users/${u.id}`} className="w-full">
                            <Button variant="outline" className="min-h-11 w-full">
                              Editar
                            </Button>
                          </Link>
                          <Button
                            variant="outline"
                            className="min-h-11 w-full text-rose-700 border-rose-200 hover:bg-rose-50 dark:text-rose-200 dark:border-rose-800 dark:hover:bg-rose-900/20"
                            onClick={() => openDeleteModal(u.id)}
                          >
                            Eliminar
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200 dark:text-slate-300 dark:from-slate-900 dark:to-slate-800 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 font-semibold">Usuario</th>
                  <th className="px-6 py-4 font-semibold">Rol</th>
                  <th className="px-6 py-4 font-semibold">Email</th>
                  <th className="px-6 py-4 font-semibold">Estado</th>
                  <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {isInitialLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">
                      Cargando usuarios…
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">
                      <div className="flex flex-col items-center justify-center py-4">
                        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 dark:bg-slate-800">
                          <Search className="h-6 w-6 text-slate-400" />
                        </div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">No se encontraron usuarios</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Intenta ajustar los filtros de búsqueda</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.map((u) => (
                    <tr key={u.id} className="bg-white hover:bg-slate-50/80 transition-colors dark:bg-slate-900 dark:hover:bg-slate-800/60">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="h-10 w-10 rounded-full bg-linear-to-br from-slate-100 to-slate-200 flex items-center justify-center mr-3 text-slate-600 shadow-sm border border-slate-200 dark:from-slate-800 dark:to-slate-700 dark:text-slate-200 dark:border-slate-700">
                            <span className="font-bold text-sm">{(u.first_name?.[0] || 'U') + (u.last_name?.[0] || 'S')}</span>
                          </div>
                          <div>
                            <div className="font-medium text-slate-900 uppercase dark:text-slate-100">
                              {u.first_name} {u.last_name}
                            </div>
                            <button
                              type="button"
                              className="mt-0.5 w-fit rounded bg-slate-50 px-1.5 py-0.5 text-left text-xs font-mono text-slate-500 transition-colors hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                              onClick={() => copyUsernameToClipboard(u.username || '')}
                              title="Copiar usuario"
                            >
                              @{u.username}
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeClasses(u.role)}`}>
                          {getRoleLabel(u.role)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{u.email}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getActiveBadgeClasses(u.is_active)}`}>
                          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${u.is_active ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-slate-400 dark:bg-slate-500'}`}></span>
                          {u.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`/users/${u.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-sky-300">
                              <span className="sr-only">Editar</span>
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                            </Button>
                          </Link>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:text-slate-500 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                            onClick={() => openDeleteModal(u.id)}
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

          <div className="mt-4 flex flex-col gap-3 px-4 pb-6 md:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Mostrando {startIndex}-{endIndex} de {count} • Página {page} de {totalPages}
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="flex items-center gap-2 justify-between md:justify-start">
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

              <div className="flex items-center gap-2 justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 flex-1 md:flex-none"
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
                      className="min-h-10"
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
                  className="min-h-11 flex-1 md:flex-none"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasNext}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="Eliminar Usuario"
        description="¿Estás seguro de que deseas eliminar este usuario? Esta acción no se puede deshacer y eliminará permanentemente la cuenta y todos los datos asociados."
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="destructive"
        loading={isDeleting}
      />
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BarChart3, Search, Users } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { useAuthStore } from '../store/auth'
import { teachersApi, type DirectorComplianceRow, type DirectorComplianceResponse } from '../services/teachers'

const getErrorDetail = (err: unknown): string | undefined => {
  const maybe = err as { response?: { data?: unknown } }
  const data = maybe?.response?.data
  if (!data) return undefined
  if (typeof data === 'string') return data
  if (typeof data === 'object' && data && 'detail' in data) {
    const d = (data as { detail?: unknown }).detail
    if (typeof d === 'string') return d
  }
  try {
    return JSON.stringify(data)
  } catch {
    return undefined
  }
}

function trafficLightBadge(light: string): { label: string; className: string } {
  switch ((light || '').toLowerCase()) {
    case 'green':
      return { label: 'Verde', className: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900/40' }
    case 'yellow':
      return { label: 'Amarillo', className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900/40' }
    case 'red':
      return { label: 'Rojo', className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900/40' }
    default:
      return { label: 'Sin datos', className: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700' }
  }
}

function progressBarColor(percent: number | null | undefined): string {
  const p = typeof percent === 'number' ? percent : null
  if (p === null) return 'bg-slate-300 dark:bg-slate-700'
  if (p >= 90) return 'bg-emerald-500'
  if (p >= 70) return 'bg-amber-500'
  return 'bg-red-500'
}

function initialsFromFullName(fullName: string): string {
  const name = (fullName || '').trim()
  if (!name) return ''
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return (parts[0].slice(0, 2) || '').toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

export default function DirectorCompliance() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  const isAdministrativeStaff =
    user?.role === 'ADMIN' || user?.role === 'SUPERADMIN' || user?.role === 'COORDINATOR' || user?.role === 'SECRETARY'

  const [data, setData] = useState<DirectorComplianceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    let mounted = true

    if (!isAdministrativeStaff) {
      setLoading(false)
      return
    }

    const timer = window.setTimeout(() => {
      ;(async () => {
        try {
          setLoading(true)
          setError(null)
          const res = await teachersApi.directorCompliance({
            search: search.trim() || undefined,
            page,
            page_size: pageSize,
          })
          if (mounted) setData(res.data)
        } catch (e) {
          if (mounted) setError(getErrorDetail(e) || 'No se pudo cargar el monitoreo de directores.')
        } finally {
          if (mounted) setLoading(false)
        }
      })()
    }, 250)

    return () => {
      window.clearTimeout(timer)
      mounted = false
    }
  }, [isAdministrativeStaff, page, pageSize, search])

  const count = data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(count / pageSize))

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages))
  }, [totalPages])

  const clampedPage = Math.min(Math.max(1, page), totalPages)
  const startIndex = count === 0 ? 0 : (clampedPage - 1) * pageSize + 1
  const endIndex = Math.min(count, clampedPage * pageSize)
  const hasPrevious = Boolean(data?.previous) || clampedPage > 1
  const hasNext = Boolean(data?.next) || clampedPage < totalPages

  const pageNumbers: Array<number | 'ellipsis'> = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)

    const windowSize = 2
    const start = Math.max(2, clampedPage - windowSize)
    const end = Math.min(totalPages - 1, clampedPage + windowSize)

    const pages: Array<number | 'ellipsis'> = [1]
    if (start > 2) pages.push('ellipsis')
    for (let p = start; p <= end; p++) pages.push(p)
    if (end < totalPages - 1) pages.push('ellipsis')
    pages.push(totalPages)
    return pages
  })()

  const counts = useMemo(() => {
    return data?.counts_by_light ?? { green: 0, yellow: 0, red: 0, grey: 0 }
  }, [data])

  if (!isAdministrativeStaff) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monitoreo de directores</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 dark:text-slate-300">No tienes permisos para acceder a este módulo.</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate('/')}>Volver al Dashboard</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const overall = data?.totals
  const overallBadge = trafficLightBadge(overall?.traffic_light || 'grey')
  const rows: DirectorComplianceRow[] = data?.results ?? []
  const isUpdating = loading && data !== null

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-950/40">
              <BarChart3 className="h-6 w-6 text-blue-600" />
            </div>
            Monitoreo de directores
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Seguimiento del diligenciamiento de fichas de estudiantes por grupo director.
          </p>
          {data?.academic_year ? (
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Año activo: {data.academic_year.year}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500">Grupos</p>
              <Users className="h-4 w-4 text-slate-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{overall?.groups_total ?? 0}</div>
            <p className="text-xs text-slate-500 mt-1">Total de grupos con director</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-slate-500">Promedio</p>
              <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${overallBadge.className}`}>
                {overallBadge.label}
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{overall?.avg_percent ?? '—'}%</div>
            <p className="text-xs text-slate-500 mt-1">Promedio por grupo (con datos)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="text-sm font-medium text-slate-500">Semáforo (filtrado)</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900/40 dark:bg-emerald-950/30">
                <span className="font-medium text-emerald-700 dark:text-emerald-200">Verde</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-200">{counts.green}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-950/30">
                <span className="font-medium text-amber-700 dark:text-amber-200">Amarillo</span>
                <span className="font-bold text-amber-700 dark:text-amber-200">{counts.yellow}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/40 dark:bg-red-950/30">
                <span className="font-medium text-red-700 dark:text-red-200">Rojo</span>
                <span className="font-bold text-red-700 dark:text-red-200">{counts.red}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                <span className="font-medium text-slate-600 dark:text-slate-200">Sin datos</span>
                <span className="font-bold text-slate-600 dark:text-slate-200">{counts.grey}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="text-sm font-medium text-slate-500">Búsqueda</div>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Director, grupo, sede..."
                className="pl-9 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Mostrando {startIndex}–{endIndex} de {count}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-sm dark:border-slate-800">
        <CardHeader className="border-b border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          <CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">Cumplimiento por grupo</CardTitle>
          {loading ? <p className="mt-2 text-sm text-slate-500">Cargando…</p> : null}
          {error ? (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto relative">
            {isUpdating ? (
              <div className="absolute inset-0 z-10 flex items-start justify-center pt-4 bg-white/60 dark:bg-slate-950/60">
                <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                  Actualizando…
                </div>
              </div>
            ) : null}
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Director</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Grupo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Sede</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Estudiantes</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Promedio</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Semáforo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider dark:text-slate-300">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200 dark:bg-slate-950 dark:divide-slate-800">
                {!loading && count === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                      No hay datos para mostrar.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const badge = trafficLightBadge(r.summary?.traffic_light || 'grey')
                    const avg = r.summary?.avg_percent ?? null

                    return (
                      <tr key={r.group.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-3">
                            <div className="h-10 w-10 rounded-full bg-linear-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-700 font-bold text-sm shadow-sm border border-blue-200 shrink-0 overflow-hidden dark:from-blue-950/40 dark:to-blue-900/30 dark:text-blue-200 dark:border-blue-900/40">
                              {(((r.director.photo_thumb ?? r.director.photo ?? '').trim()) ? (
                                <img
                                  src={r.director.photo_thumb ?? r.director.photo ?? ''}
                                  alt={(r.director.full_name || '').trim() || 'Foto del director'}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <>{initialsFromFullName(r.director.full_name)}</>
                              ))}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{r.director.full_name || '—'}</div>
                              {r.director.email ? (
                                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{r.director.email}</div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{r.group.grade_name} - {r.group.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{r.group.shift || ''}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{r.group.campus_name || '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                          {r.summary?.students_total ?? 0}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-28">
                              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200 dark:bg-slate-800 dark:border-slate-700">
                                <div className={`h-full ${progressBarColor(avg)} transition-all`} style={{ width: `${avg ?? 0}%` }} />
                              </div>
                            </div>
                            <div className="text-sm font-medium text-slate-900 dark:text-slate-100 w-14">
                              {avg === null ? '—' : `${avg}%`}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${badge.className}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Link to={`/groups/${r.group.id}/students`} className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                            Ver estudiantes
                          </Link>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-4 px-4 pb-6">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Mostrando {startIndex}–{endIndex} de {count} • Página {clampedPage} de {totalPages}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex items-center gap-2 justify-between sm:justify-start">
                <span className="text-sm text-slate-500 dark:text-slate-400">Por página</span>
                <select
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  value={pageSize}
                  disabled={loading}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPage(1)
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>

              <div className="flex items-center gap-2 justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={loading || !hasPrevious || clampedPage <= 1}
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
                        variant={p === clampedPage ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => setPage(p)}
                        aria-current={p === clampedPage ? 'page' : undefined}
                        disabled={loading}
                      >
                        {p}
                      </Button>
                    )
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={loading || !hasNext}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

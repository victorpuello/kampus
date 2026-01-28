import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Toast, type ToastType } from '../components/ui/Toast'
import {
  noveltiesWorkflowApi,
  type NoveltyCase,
  type NoveltyReason,
  type NoveltyStatus,
  type NoveltyType,
} from '../services/noveltiesWorkflow'

type InboxState = {
  loading: boolean
  items: NoveltyCase[]
  pageMeta?: { count: number; next: string | null; previous: string | null }
  error?: string
}

function unwrapList<T>(data: { results?: T[] } | T[]): T[] {
  if (Array.isArray(data)) return data
  return (data as { results?: T[] }).results || []
}

const statusLabel = (s: string) => {
  switch (s) {
    case 'DRAFT':
      return 'Borrador'
    case 'FILED':
      return 'Radicada'
    case 'IN_REVIEW':
      return 'En revisión'
    case 'PENDING_DOCS':
      return 'Pendiente docs'
    case 'APPROVED':
      return 'Aprobada'
    case 'REJECTED':
      return 'Rechazada'
    case 'EXECUTED':
      return 'Ejecutada'
    case 'REVERTED':
      return 'Revertida'
    case 'CLOSED':
      return 'Cerrada'
    default:
      return s
  }
}

const statusPillClass = (s: string) => {
  const base =
    'inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide border '
  switch (s) {
    case 'IN_REVIEW':
      return base + 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200'
    case 'PENDING_DOCS':
      return base + 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-200'
    case 'APPROVED':
      return base + 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200'
    case 'EXECUTED':
      return base + 'border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-900/40 dark:bg-indigo-950/40 dark:text-indigo-200'
    case 'REJECTED':
    case 'CLOSED':
      return base + 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200'
    default:
      return base + 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200'
  }
}

const getErrorDetail = (err: unknown): string | undefined => {
  if (typeof err !== 'object' || err === null) return undefined
  const maybe = err as { response?: { data?: { detail?: unknown } } }
  const detail = maybe.response?.data?.detail
  return typeof detail === 'string' ? detail : undefined
}

export default function NoveltiesInboxPage() {
  const [state, setState] = useState<InboxState>({ loading: true, items: [] })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<NoveltyStatus | ''>('')
  const [page, setPage] = useState(1)
  const [types, setTypes] = useState<NoveltyType[]>([])
  const [reasons, setReasons] = useState<NoveltyReason[]>([])
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  const typeById = useMemo(() => {
    const m = new Map<number, NoveltyType>()
    for (const t of types) m.set(t.id, t)
    return m
  }, [types])

  const reasonById = useMemo(() => {
    const m = new Map<number, NoveltyReason>()
    for (const r of reasons) m.set(r.id, r)
    return m
  }, [reasons])

  const load = useCallback(
    async (opts?: { showToast?: boolean; mounted?: () => boolean }) => {
      setState((s) => ({ ...s, loading: true, error: undefined }))
      try {
        const [casesRes, typesRes, reasonsRes] = await Promise.all([
          noveltiesWorkflowApi.listCases({ page, page_size: 25, status: statusFilter || undefined }),
          noveltiesWorkflowApi.listTypes(),
          noveltiesWorkflowApi.listReasons({ is_active: true }),
        ])

        if (!opts?.mounted || opts.mounted()) {
          const raw = casesRes.data
          const pageMeta = Array.isArray(raw)
            ? undefined
            : {
                count: raw.count,
                next: raw.next,
                previous: raw.previous,
              }

          setState({ loading: false, items: unwrapList(raw), pageMeta })
          setTypes(typesRes.items)
          setReasons(reasonsRes.items)
          if (opts?.showToast) setToast({ message: 'Listado actualizado', type: 'success' })
        }
      } catch (err) {
        if (!opts?.mounted || opts.mounted()) {
          setState({ loading: false, items: [], pageMeta: undefined, error: getErrorDetail(err) || 'No se pudo cargar el listado' })
          if (opts?.showToast) setToast({ message: 'No se pudo actualizar', type: 'error' })
        }
      }
    },
    [page, statusFilter]
  )

  useEffect(() => {
    let mounted = true
    void load({ mounted: () => mounted })
    return () => {
      mounted = false
    }
  }, [load])

  useEffect(() => {
    // If filter changes, start from first page.
    setPage(1)
  }, [statusFilter])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return state.items

    return state.items.filter((c) => {
      const rad = (c.radicado || '').toLowerCase()
      return rad.includes(q) || String(c.id).includes(q) || String(c.student).includes(q)
    })
  }, [search, state.items])

  const statusOptions: Array<{ value: NoveltyStatus | ''; label: string }> = useMemo(
    () => [
      { value: '', label: 'Todos (bandeja por rol)' },
      { value: 'FILED', label: 'Radicada' },
      { value: 'IN_REVIEW', label: 'En revisión' },
      { value: 'PENDING_DOCS', label: 'Pendiente docs' },
      { value: 'APPROVED', label: 'Aprobada' },
      { value: 'REJECTED', label: 'Rechazada' },
      { value: 'EXECUTED', label: 'Ejecutada' },
      { value: 'REVERTED', label: 'Revertida' },
      { value: 'CLOSED', label: 'Cerrada' },
    ],
    []
  )

  const canPrev = Boolean(state.pageMeta?.previous) && page > 1
  const canNext = Boolean(state.pageMeta?.next)

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Novedades</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Listado de novedades registradas</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/novelties/new">
            <Button className="h-9">Nueva novedad</Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={async () => {
              await load({ showToast: true })
            }}
          >
            Actualizar
          </Button>
        </div>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Búsqueda y filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por radicado, caso o estudiante…"
                />
              </div>
              <div>
                <select
                  className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter((e.target.value as NoveltyStatus | '') || '')}
                >
                  {statusOptions.map((o) => (
                    <option key={o.value || 'all'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{filtered.length} casos</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        {state.pageMeta ? (
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Total: {state.pageMeta.count} • Página {page}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                disabled={state.loading || !canPrev}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                disabled={state.loading || !canNext}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        ) : null}

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200 dark:text-slate-300 dark:from-slate-900 dark:to-slate-800 dark:border-slate-800">
              <tr>
                <th className="px-6 py-4 font-semibold">Radicado</th>
                <th className="px-6 py-4 font-semibold">Estado</th>
                <th className="px-6 py-4 font-semibold">Estudiante</th>
                <th className="px-6 py-4 font-semibold">Tipo</th>
                <th className="px-6 py-4 font-semibold">Creación</th>
                <th className="px-6 py-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {state.loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-500 dark:text-slate-400">Cargando…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center justify-center py-4">
                      <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 dark:bg-slate-800">
                        <Search className="h-6 w-6 text-slate-400" />
                      </div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">No hay casos en la bandeja</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Prueba ajustando la búsqueda o crea una nueva novedad</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="bg-white hover:bg-slate-50/80 transition-colors dark:bg-slate-900 dark:hover:bg-slate-800/60">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{c.radicado || `#${c.id}`}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Caso #{c.id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={statusPillClass(c.status)}>{statusLabel(c.status)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-mono text-xs bg-slate-100 px-2 py-1 rounded inline-flex dark:bg-slate-800 dark:text-slate-200">
                        {c.student}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {typeById.get(c.novelty_type)?.name || `Tipo #${c.novelty_type}`}
                      </div>
                      {c.novelty_reason ? (
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {reasonById.get(c.novelty_reason)?.name || `Motivo #${c.novelty_reason}`}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-slate-600 dark:text-slate-300">{new Date(c.created_at).toLocaleString()}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link to={`/novelties/${c.id}`}>
                        <Button variant="outline" size="sm" className="h-9">Ver</Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {state.loading ? (
            <Card>
              <CardContent className="py-8 text-center text-slate-500 dark:text-slate-400">Cargando…</CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-slate-500 dark:text-slate-400">
                <div className="flex flex-col items-center justify-center">
                  <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 dark:bg-slate-800">
                    <Search className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">No hay casos en la bandeja</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Crea una nueva novedad si lo necesitas</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            filtered.map((c) => (
              <Card key={c.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{c.radicado || `#${c.id}`}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Estudiante {c.student} • Caso #{c.id}</div>
                      <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        {typeById.get(c.novelty_type)?.name || `Tipo #${c.novelty_type}`}
                        {c.novelty_reason ? ` • ${reasonById.get(c.novelty_reason)?.name || `Motivo #${c.novelty_reason}`}` : ''}
                      </div>
                    </div>
                    <span className={statusPillClass(c.status)}>{statusLabel(c.status)}</span>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Link to={`/novelties/${c.id}`}>
                      <Button variant="outline" size="sm" className="h-9">Ver detalle</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {state.error ? (
          <div className="mt-4 text-sm text-red-600 dark:text-red-400">{state.error}</div>
        ) : null}
      </div>

      {toast ? (
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={true}
          onClose={() => setToast(null)}
        />
      ) : null}
    </div>
  )
}

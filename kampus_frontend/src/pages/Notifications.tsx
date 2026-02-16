import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, ExternalLink, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Pill } from '../components/ui/Pill'
import { Input } from '../components/ui/Input'
import { Toast, type ToastType } from '../components/ui/Toast'
import { emitNotificationsUpdated, notificationsApi, type Notification } from '../services/notifications'

export default function NotificationsPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all')
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  const unreadCount = useMemo(() => items.filter((n) => !n.read_at).length, [items])
  const readCount = items.length - unreadCount
  const totalCount = items.length

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return items.filter((n) => {
      if (filter === 'unread' && n.read_at) return false
      if (filter === 'read' && !n.read_at) return false
      if (!normalized) return true
      const inTitle = (n.title || '').toLowerCase().includes(normalized)
      const inBody = (n.body || '').toLowerCase().includes(normalized)
      return inTitle || inBody
    })
  }, [items, filter, query])

  const selected = useMemo(
    () => filteredItems.find((n) => n.id === selectedId) || filteredItems[0] || null,
    [filteredItems, selectedId]
  )

  const load = async (): Promise<Notification[] | null> => {
    setLoading(true)
    try {
      const res = await notificationsApi.list()
      setItems(res.data)
      const firstUnread = res.data.find((n) => !n.read_at)
      setSelectedId(firstUnread?.id ?? res.data[0]?.id ?? null)
      return res.data
    } catch {
      setToast({ type: 'error', message: 'No se pudieron cargar las notificaciones.' })
      return null
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const markAllRead = async () => {
    try {
      await notificationsApi.markAllRead()
      emitNotificationsUpdated()
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString(), is_read: true })))
    } catch {
      setToast({ type: 'error', message: 'No se pudieron marcar como leídas.' })
    }
  }

  const markReadInState = (id: number) => {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, read_at: x.read_at || new Date().toISOString(), is_read: true } : x)))
  }

  const selectNotification = async (n: Notification) => {
    setSelectedId(n.id)
    try {
      if (!n.read_at) {
        await notificationsApi.markRead(n.id)
        markReadInState(n.id)
        emitNotificationsUpdated()
      }
    } catch {
      // ignore
    }
  }

  const openNotification = (n: Notification) => {
    const url = (n.url || '').trim()
    if (url) navigate(url)
  }

  const markSelectedAsRead = async () => {
    if (!selected || selected.read_at) return
    try {
      await notificationsApi.markRead(selected.id)
      markReadInState(selected.id)
      emitNotificationsUpdated()
    } catch {
      setToast({ type: 'error', message: 'No se pudo marcar como leída.' })
    }
  }

  useEffect(() => {
    if (!selectedId && filteredItems.length > 0) {
      setSelectedId(filteredItems[0].id)
      return
    }
    if (selectedId && !filteredItems.some((n) => n.id === selectedId)) {
      setSelectedId(filteredItems[0]?.id ?? null)
    }
  }, [filteredItems, selectedId])

  return (
    <div className="space-y-4 sm:space-y-6">
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          isVisible={true}
          onClose={() => setToast(null)}
        />
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-950/40 shrink-0">
                <Bell className="h-5 w-5 text-blue-600" />
              </div>
              Notificaciones
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {unreadCount > 0 ? `Tienes ${unreadCount} sin leer.` : 'No tienes notificaciones pendientes.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Pill text={`TOTAL ${totalCount}`} className="bg-slate-50 text-slate-700 border-slate-200" />
            <Pill text={`SIN LEER ${unreadCount}`} className="bg-blue-50 text-blue-700 border-blue-200" />
            <Pill text={`LEÍDAS ${readCount}`} className="bg-emerald-50 text-emerald-700 border-emerald-200" />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button className="w-full sm:w-auto" variant="outline" onClick={load} disabled={loading}>
            Recargar
          </Button>
          <Button className="w-full sm:w-auto" onClick={markAllRead} disabled={loading || totalCount === 0 || unreadCount === 0}>
            <Check className="mr-2 h-4 w-4" />
            Marcar todas como leídas
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:gap-4 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-3 p-4 sm:p-6 sm:pb-3">
            <CardTitle className="text-lg">Bandeja</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por título o detalle"
                className="pl-9"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button className="px-2 text-xs sm:text-sm" variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')}>
                Todas
              </Button>
              <Button className="px-2 text-xs sm:text-sm" variant={filter === 'unread' ? 'default' : 'outline'} onClick={() => setFilter('unread')}>
                Sin leer
              </Button>
              <Button className="px-2 text-xs sm:text-sm" variant={filter === 'read' ? 'default' : 'outline'} onClick={() => setFilter('read')}>
                Leídas
              </Button>
            </div>

            <div className="max-h-[54vh] space-y-2 overflow-auto pr-1 lg:max-h-[65vh]">
              {loading ? (
                <div className="py-8 text-sm text-slate-500">Cargando notificaciones…</div>
              ) : filteredItems.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No hay resultados con los filtros actuales.
                </div>
              ) : (
                filteredItems.map((n) => {
                  const isUnread = !n.read_at
                  const isSelected = selected?.id === n.id
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => selectNotification(n)}
                      aria-selected={isSelected}
                      className={`w-full rounded-lg border p-3 text-left transition-all duration-200 motion-safe:hover:-translate-y-0.5 ${
                        isSelected
                          ? 'border-sky-300 bg-sky-50/60 shadow-sm dark:border-sky-800 dark:bg-sky-950/20'
                          : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Pill
                          text={isUnread ? 'SIN LEER' : 'LEÍDA'}
                          className={
                            isUnread
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }
                        />
                        <span className="text-xs text-slate-400">{new Date(n.created_at).toLocaleDateString('es-CO')}</span>
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">{n.title}</div>
                      <div className="mt-1 text-sm text-slate-600 dark:text-slate-300 line-clamp-2">{n.body || '—'}</div>
                    </button>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 p-4 sm:p-6 sm:pb-3">
            <CardTitle className="text-lg">Detalle</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
            {!selected ? (
              <div className="rounded-md border border-dashed border-slate-300 p-8 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Selecciona una notificación para ver su contenido.
              </div>
            ) : (
              <div
                key={selected.id}
                className="space-y-4 max-h-[38vh] overflow-auto pr-1 lg:max-h-none lg:overflow-visible motion-reduce:animate-none animate-in fade-in slide-in-from-right-1 duration-200"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Pill
                    text={!selected.read_at ? 'SIN LEER' : 'LEÍDA'}
                    className={!selected.read_at ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200'}
                  />
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(selected.created_at).toLocaleString('es-CO')}
                  </span>
                </div>

                <h3 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-slate-100">{selected.title}</h3>
                <p className="whitespace-pre-line text-sm sm:text-base text-slate-700 dark:text-slate-300">{selected.body || '—'}</p>

                <div className="sticky bottom-0 -mx-1 border-t border-slate-200 bg-white/95 px-1 pt-3 pb-1 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:static lg:mx-0 lg:border-none lg:bg-transparent lg:p-0 lg:backdrop-blur-none flex flex-col sm:flex-row gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={markSelectedAsRead}
                    disabled={!!selected.read_at}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Marcar como leída
                  </Button>
                  <Button
                    type="button"
                    onClick={() => openNotification(selected)}
                    disabled={!selected.url || !selected.url.trim()}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Abrir destino
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

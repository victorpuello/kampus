import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Toast, type ToastType } from '../components/ui/Toast'
import { emitNotificationsUpdated, notificationsApi, type Notification } from '../services/notifications'

export default function NotificationsPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  const unreadCount = useMemo(() => items.filter((n) => !n.read_at).length, [items])

  const load = async (): Promise<Notification[] | null> => {
    setLoading(true)
    try {
      const res = await notificationsApi.list()
      setItems(res.data)
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
      await load()
    } catch {
      setToast({ type: 'error', message: 'No se pudieron marcar como leídas.' })
    }
  }

  const openNotification = async (n: Notification) => {
    try {
      if (!n.read_at) {
        await notificationsApi.markRead(n.id)
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString(), is_read: true } : x)))
        emitNotificationsUpdated()
      }
    } catch {
      // ignore
    }

    const url = (n.url || '').trim()
    if (url) navigate(url)
  }

  return (
    <div className="space-y-6">
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          isVisible={true}
          onClose={() => setToast(null)}
        />
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Bell className="h-6 w-6 text-blue-600" />
            </div>
            Notificaciones
          </h2>
          <p className="text-slate-500 mt-1">{unreadCount > 0 ? `Tienes ${unreadCount} sin leer.` : 'No tienes notificaciones pendientes.'}</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            Recargar
          </Button>
          <Button onClick={markAllRead} disabled={loading || items.length === 0 || unreadCount === 0}>
            <Check className="h-4 w-4 mr-2" />
            Marcar todas como leídas
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Actividad</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold">Estado</th>
                  <th className="px-6 py-4 font-semibold">Título</th>
                  <th className="px-6 py-4 font-semibold">Detalle</th>
                  <th className="px-6 py-4 font-semibold">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length === 0 ? (
                  <tr className="bg-white">
                    <td className="px-6 py-8 text-slate-500" colSpan={4}>
                      No hay notificaciones.
                    </td>
                  </tr>
                ) : (
                  items.map((n) => {
                    const isUnread = !n.read_at
                    return (
                      <tr
                        key={n.id}
                        className="bg-white hover:bg-slate-50/80 transition-colors cursor-pointer"
                        onClick={() => openNotification(n)}
                      >
                        <td className="px-6 py-4">
                          <span
                            className={
                              'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ' +
                              (isUnread
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-slate-50 text-slate-600 border-slate-200')
                            }
                          >
                            {isUnread ? 'SIN LEER' : 'LEÍDA'}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-900">{n.title}</td>
                        <td className="px-6 py-4 text-slate-600">{n.body || '—'}</td>
                        <td className="px-6 py-4 text-slate-600">{new Date(n.created_at).toLocaleString()}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

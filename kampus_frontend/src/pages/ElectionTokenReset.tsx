import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, RotateCcw, AlertTriangle } from 'lucide-react'

import { Button } from '../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { useAuthStore } from '../store/auth'
import { electionsApi, getApiErrorMessage, type TokenResetEventItem } from '../services/elections'

export default function ElectionTokenReset() {
  const user = useAuthStore((s) => s.user)

  const canReset =
    user?.role === 'SUPERADMIN' ||
    user?.role === 'ADMIN' ||
    user?.role === 'COORDINATOR' ||
    user?.role === 'SECRETARY'

  const [token, setToken] = useState('')
  const [reason, setReason] = useState('')
  const [extendHours, setExtendHours] = useState('8')
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [events, setEvents] = useState<TokenResetEventItem[]>([])

  const loadHistory = useCallback(async () => {
    if (!canReset) return

    setLoadingHistory(true)
    setHistoryError(null)
    try {
      const response = await electionsApi.listResetEvents(20)
      setEvents(response.results)
    } catch (requestError) {
      setHistoryError(getApiErrorMessage(requestError, 'No fue posible cargar el historial de contingencias.'))
    } finally {
      setLoadingHistory(false)
    }
  }, [canReset])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canReset) return

    setError(null)
    setSuccess(null)

    const normalizedToken = token.trim().toUpperCase()
    const normalizedReason = reason.trim()
    const hours = Number(extendHours || '8')

    if (!normalizedToken) {
      setError('Debes ingresar el token a resetear.')
      return
    }

    if (normalizedReason.length < 10) {
      setError('Debes registrar un motivo claro (mínimo 10 caracteres).')
      return
    }

    if (!Number.isFinite(hours) || hours < 1 || hours > 24) {
      setError('La extensión de vigencia debe estar entre 1 y 24 horas.')
      return
    }

    try {
      setLoading(true)
      const response = await electionsApi.resetToken({
        token: normalizedToken,
        reason: normalizedReason,
        extend_hours: hours,
      })

      setSuccess(
        `${response.detail} Prefijo ${response.token_prefix}. Vigencia hasta ${response.expires_at ? new Date(response.expires_at).toLocaleString() : 'sin fecha'}.`
      )
      setReason('')
      void loadHistory()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible resetear el token.'))
    } finally {
      setLoading(false)
    }
  }

  if (!canReset) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" /> Sin permisos de contingencia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Tu rol actual no tiene autorización para resetear tokens de votación.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-sky-600 dark:text-sky-300" />
            Contingencia de token de votación
          </CardTitle>
          <CardDescription>
            Solo jurados autorizados pueden resetear un token. El motivo queda auditado de forma obligatoria.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label htmlFor="token" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Token a resetear
              </label>
              <Input
                id="token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Ej: VOTO-4988168E84"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="reason" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Motivo del reset
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Describe el incidente técnico que justifica la contingencia"
                className="min-h-28 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-400"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="extendHours" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Extender vigencia (horas)
              </label>
              <Input
                id="extendHours"
                type="number"
                min={1}
                max={24}
                value={extendHours}
                onChange={(event) => setExtendHours(event.target.value)}
                className="h-11 max-w-40"
              />
            </div>

            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/50 dark:text-red-200">
                {error}
              </p>
            )}

            {success && (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/50 dark:text-emerald-200">
                {success}
              </p>
            )}

            <Button type="submit" className="h-11" disabled={loading}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {loading ? 'Reseteando...' : 'Resetear token'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historial reciente de resets</CardTitle>
          <CardDescription>Últimas contingencias registradas con trazabilidad de jurado y motivo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {historyError && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/50 dark:text-red-200">
              {historyError}
            </p>
          )}

          {loadingHistory ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Cargando historial...</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">No hay eventos de reset registrados aún.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead className="bg-slate-50 dark:bg-slate-900/60">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Fecha</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Responsable</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Token ID</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Estado</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                  {events.map((eventItem) => (
                    <tr key={eventItem.id}>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                        {new Date(eventItem.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                        {eventItem.reset_by_name || 'Sin usuario'}
                      </td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{eventItem.voter_token}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                        {eventItem.previous_status} → {eventItem.new_status}
                      </td>
                      <td className="max-w-xl px-3 py-2 text-slate-700 dark:text-slate-200">{eventItem.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

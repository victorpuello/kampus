import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AlertTriangle, RefreshCw, TrendingUp, Vote } from 'lucide-react'

import { Button } from '../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card'
import { useAuthStore } from '../store/auth'
import {
  electionsApi,
  getApiErrorMessage,
  type ElectionLiveDashboardResponse,
  type ElectionProcessItem,
} from '../services/elections'

const POLL_INTERVAL_MS = 8000
type LiveFeedMode = 'polling' | 'sse' | 'fallback'
type MonitoringPreset = 'conservative' | 'standard' | 'sensitive'

export default function ElectionLiveDashboard() {
  const user = useAuthStore((s) => s.user)
  const canView = user?.role === 'SUPERADMIN' || user?.role === 'ADMIN'

  const [processes, setProcesses] = useState<ElectionProcessItem[]>([])
  const [selectedProcessId, setSelectedProcessId] = useState<string>('')
  const [snapshot, setSnapshot] = useState<ElectionLiveDashboardResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingProcesses, setLoadingProcesses] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  const lastCursorRef = useRef<string | null>(null)
  const [windowMinutes, setWindowMinutes] = useState('60')
  const [blankRateThreshold, setBlankRateThreshold] = useState('0.25')
  const [inactivityMinutes, setInactivityMinutes] = useState('10')
  const [spikeThreshold, setSpikeThreshold] = useState('8')
  const [seriesLimit, setSeriesLimit] = useState('60')
  const [useSsePilot, setUseSsePilot] = useState(false)
  const [sseFailed, setSseFailed] = useState(false)
  const [liveFeedMode, setLiveFeedMode] = useState<LiveFeedMode>('polling')
  const [activePreset, setActivePreset] = useState<MonitoringPreset>('standard')
  const eventSourceRef = useRef<EventSource | null>(null)

  const applyPreset = (preset: MonitoringPreset) => {
    setActivePreset(preset)
    if (preset === 'conservative') {
      setWindowMinutes('90')
      setBlankRateThreshold('0.35')
      setInactivityMinutes('15')
      setSpikeThreshold('12')
      setSeriesLimit('60')
      return
    }

    if (preset === 'sensitive') {
      setWindowMinutes('45')
      setBlankRateThreshold('0.2')
      setInactivityMinutes('6')
      setSpikeThreshold('6')
      setSeriesLimit('90')
      return
    }

    setWindowMinutes('60')
    setBlankRateThreshold('0.25')
    setInactivityMinutes('10')
    setSpikeThreshold('8')
    setSeriesLimit('60')
  }

  const loadProcesses = useCallback(async () => {
    if (!canView) return

    setLoadingProcesses(true)
    setError(null)
    try {
      const response = await electionsApi.listProcesses()
      setProcesses(response.results)

      if (response.results.length > 0) {
        const openProcess = response.results.find((item) => item.status === 'OPEN')
        const fallbackProcess = openProcess ?? response.results[0]
        setSelectedProcessId((previousId) => previousId || String(fallbackProcess.id))
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible cargar las jornadas electorales.'))
    } finally {
      setLoadingProcesses(false)
    }
  }, [canView])

  const loadSnapshot = useCallback(async (mode: 'full' | 'incremental' = 'full') => {
    if (!canView || !selectedProcessId) return

    setLoading(true)
    setError(null)
    try {
      const isIncremental = mode === 'incremental' && Boolean(lastCursorRef.current)
      const response = await electionsApi.getProcessLiveDashboard(Number(selectedProcessId), {
        windowMinutes: Number(windowMinutes) || 60,
        blankRateThreshold: Number(blankRateThreshold) || 0.25,
        inactivityMinutes: Number(inactivityMinutes) || 10,
        spikeThreshold: Number(spikeThreshold) || 8,
        seriesLimit: Number(seriesLimit) || 60,
        since: isIncremental ? lastCursorRef.current || undefined : undefined,
        includeRanking: !isIncremental,
      })

      setSnapshot((previousSnapshot) => {
        if (!isIncremental || !previousSnapshot) {
          return response
        }

        const mergedSeriesMap = new Map<string, { minute: string | null; total_votes: number; blank_votes: number }>()
        for (const row of previousSnapshot.minute_series) {
          mergedSeriesMap.set(row.minute || '', row)
        }
        for (const row of response.minute_series) {
          mergedSeriesMap.set(row.minute || '', row)
        }

        const mergedSeries = Array.from(mergedSeriesMap.values())
          .sort((a, b) => {
            const aMs = a.minute ? new Date(a.minute).getTime() : 0
            const bMs = b.minute ? new Date(b.minute).getTime() : 0
            return aMs - bMs
          })
          .slice(-response.config.series_limit)

        return {
          ...response,
          ranking: response.ranking.length > 0 ? response.ranking : previousSnapshot.ranking,
          minute_series: mergedSeries,
        }
      })

      lastCursorRef.current = response.cursor || response.generated_at
      setLastUpdate(new Date().toISOString())
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible cargar el monitoreo en vivo.'))
    } finally {
      setLoading(false)
    }
  }, [blankRateThreshold, canView, inactivityMinutes, selectedProcessId, seriesLimit, spikeThreshold, windowMinutes])

  const closeSseConnection = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  const startSseConnection = useCallback(() => {
    if (!canView || !selectedProcessId) return

    closeSseConnection()
    setError(null)
    setLoading(true)
    setLiveFeedMode('sse')

    const streamUrl = electionsApi.getProcessLiveDashboardStreamUrl(Number(selectedProcessId), {
      windowMinutes: Number(windowMinutes) || 60,
      blankRateThreshold: Number(blankRateThreshold) || 0.25,
      inactivityMinutes: Number(inactivityMinutes) || 10,
      spikeThreshold: Number(spikeThreshold) || 8,
      seriesLimit: Number(seriesLimit) || 60,
      includeRanking: true,
    })

    const source = new EventSource(streamUrl, { withCredentials: true })
    eventSourceRef.current = source

    source.addEventListener('snapshot', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as ElectionLiveDashboardResponse
        setSnapshot(payload)
        lastCursorRef.current = payload.cursor || payload.generated_at
        setLastUpdate(new Date().toISOString())
        setLoading(false)
        setSseFailed(false)
        setLiveFeedMode('sse')
      } catch {
        setSseFailed(true)
      }
    })

    source.onerror = () => {
      closeSseConnection()
      setSseFailed(true)
      setLiveFeedMode('fallback')
      setLoading(false)
    }
  }, [blankRateThreshold, canView, closeSseConnection, inactivityMinutes, selectedProcessId, seriesLimit, spikeThreshold, windowMinutes])

  useEffect(() => {
    void loadProcesses()
  }, [loadProcesses])

  useEffect(() => {
    if (!selectedProcessId) return

    setSnapshot(null)
    lastCursorRef.current = null
    const shouldUseSse = useSsePilot && !sseFailed

    if (shouldUseSse) {
      startSseConnection()
      return () => {
        closeSseConnection()
      }
    }

    setLiveFeedMode(useSsePilot ? 'fallback' : 'polling')
    void loadSnapshot('full')

    const intervalId = window.setInterval(() => {
      if (document.hidden) return
      void loadSnapshot('incremental')
    }, POLL_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
      closeSseConnection()
    }
  }, [closeSseConnection, loadSnapshot, selectedProcessId, sseFailed, startSseConnection, useSsePilot])

  useEffect(() => {
    setSseFailed(false)
  }, [selectedProcessId, windowMinutes, blankRateThreshold, inactivityMinutes, spikeThreshold, seriesLimit, useSsePilot])

  useEffect(() => {
    return () => {
      closeSseConnection()
    }
  }, [closeSseConnection])

  const minuteSeriesPreview = useMemo(() => {
    if (!snapshot) return []
    return snapshot.minute_series.slice(-12)
  }, [snapshot])

  if (!canView) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" /> Sin permisos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Solo superadmin y administrador pueden acceder al monitoreo en vivo de votaciones.
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
            <Activity className="h-5 w-5 text-sky-600 dark:text-sky-300" />
            Monitoreo en vivo de votaciones
          </CardTitle>
          <CardDescription>
            Actualización automática cada 8 segundos (near-real), con participación, ranking y alertas operativas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2 md:col-span-2">
              <label htmlFor="processId" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Jornada electoral
              </label>
              <select
                id="processId"
                value={selectedProcessId}
                onChange={(event) => setSelectedProcessId(event.target.value)}
                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                disabled={loadingProcesses || processes.length === 0}
              >
                {processes.length === 0 ? <option value="">Sin jornadas</option> : null}
                {processes.map((processItem) => (
                  <option key={processItem.id} value={String(processItem.id)}>
                    {processItem.name} ({processItem.status})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <Button type="button" className="h-11 w-full" onClick={() => void loadSnapshot('full')} disabled={!selectedProcessId || loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Modo de monitoreo</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button
                type="button"
                variant={activePreset === 'conservative' ? 'default' : 'outline'}
                className="h-10 w-full"
                onClick={() => applyPreset('conservative')}
              >
                Conservador
              </Button>
              <Button
                type="button"
                variant={activePreset === 'standard' ? 'default' : 'outline'}
                className="h-10 w-full"
                onClick={() => applyPreset('standard')}
              >
                Estándar
              </Button>
              <Button
                type="button"
                variant={activePreset === 'sensitive' ? 'default' : 'outline'}
                className="h-10 w-full"
                onClick={() => applyPreset('sensitive')}
              >
                Sensible
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <div className="space-y-1">
              <label htmlFor="windowMinutes" className="text-xs font-medium text-slate-700 dark:text-slate-200">Ventana (min)</label>
              <input
                id="windowMinutes"
                type="number"
                min={15}
                max={240}
                value={windowMinutes}
                onChange={(event) => setWindowMinutes(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="blankRate" className="text-xs font-medium text-slate-700 dark:text-slate-200">% blanco (0-1)</label>
              <input
                id="blankRate"
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={blankRateThreshold}
                onChange={(event) => setBlankRateThreshold(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="inactivity" className="text-xs font-medium text-slate-700 dark:text-slate-200">Inactividad (min)</label>
              <input
                id="inactivity"
                type="number"
                min={1}
                max={120}
                value={inactivityMinutes}
                onChange={(event) => setInactivityMinutes(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="spike" className="text-xs font-medium text-slate-700 dark:text-slate-200">Pico (votos/min)</label>
              <input
                id="spike"
                type="number"
                min={1}
                max={500}
                value={spikeThreshold}
                onChange={(event) => setSpikeThreshold(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="seriesLimit" className="text-xs font-medium text-slate-700 dark:text-slate-200">Serie (filas)</label>
              <input
                id="seriesLimit"
                type="number"
                min={5}
                max={180}
                value={seriesLimit}
                onChange={(event) => setSeriesLimit(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          {lastUpdate ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">Última actualización: {new Date(lastUpdate).toLocaleTimeString()}</p>
          ) : null}

          <div className="flex items-center gap-2">
            <input
              id="ssePilot"
              type="checkbox"
              checked={useSsePilot}
              onChange={(event) => setUseSsePilot(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <label htmlFor="ssePilot" className="text-xs text-slate-600 dark:text-slate-300">
              Piloto SSE (beta)
            </label>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Modo: {liveFeedMode === 'sse' ? 'SSE' : liveFeedMode === 'fallback' ? 'Polling fallback' : 'Polling'}
            </span>
          </div>

          {snapshot?.config ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Config aplicada: ventana {snapshot.config.window_minutes}m · blanco {snapshot.config.blank_rate_threshold} · inactividad {snapshot.config.inactivity_minutes}m · pico {snapshot.config.spike_threshold} · serie {snapshot.config.series_limit}
            </p>
          ) : null}

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/50 dark:text-red-200">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {snapshot ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Votos totales</CardDescription>
                <CardTitle className="text-2xl">{snapshot.kpis.total_votes}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-500 dark:text-slate-400">{snapshot.kpis.unique_voters_count} votantes únicos</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Participación</CardDescription>
                <CardTitle className="text-2xl">{snapshot.kpis.participation_percent}%</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {snapshot.kpis.unique_voters_count} de {snapshot.kpis.enabled_census_count} habilitados
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Voto en blanco</CardDescription>
                <CardTitle className="text-2xl">{snapshot.kpis.blank_vote_percent}%</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-500 dark:text-slate-400">{snapshot.kpis.total_blank_votes} votos en blanco</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Alertas activas</CardDescription>
                <CardTitle className="text-2xl">{snapshot.alerts.length}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-500 dark:text-slate-400">Reglas fijas de monitoreo operativo</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-indigo-600 dark:text-indigo-300" /> KPIs técnicos (24h)
              </CardTitle>
              <CardDescription>Errores 4xx/5xx, colisiones de submit y regeneraciones operativas auditadas.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Eventos auditados</p>
                  <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{snapshot.operational_kpis.audited_events}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Errores 4xx / 5xx</p>
                  <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {snapshot.operational_kpis.client_errors} / {snapshot.operational_kpis.server_errors}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Tasa de fallo</p>
                  <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{snapshot.operational_kpis.failure_rate_percent}%</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Submit / Duplicados</p>
                  <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {snapshot.operational_kpis.vote_submits} / {snapshot.operational_kpis.duplicate_submits}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Regeneraciones de códigos manuales: {snapshot.operational_kpis.manual_regenerations}.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-violet-600 dark:text-violet-300" />
                Ranking en vivo por cargo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {snapshot.ranking.length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">No hay cargos configurados para esta jornada.</p>
              ) : (
                snapshot.ranking.map((role) => (
                  <div key={role.role_id} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{role.title}</h3>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Total {role.total_votes} · Blanco {role.blank_votes}
                      </span>
                    </div>

                    {role.candidates.length === 0 ? (
                      <p className="text-sm text-slate-600 dark:text-slate-300">Sin candidaturas con votos.</p>
                    ) : (
                      <div className="space-y-2">
                        {role.candidates.map((candidate) => {
                          const percent = role.total_votes > 0 ? Math.round((candidate.votes / role.total_votes) * 100) : 0
                          return (
                            <div key={candidate.candidate_id} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-700 dark:text-slate-200">
                                  #{candidate.number} · {candidate.name}
                                </span>
                                <span className="font-semibold text-slate-800 dark:text-slate-100">
                                  {candidate.votes} ({percent}%)
                                </span>
                              </div>
                              <div className="h-2 w-full rounded bg-slate-200 dark:bg-slate-700">
                                <div className="h-2 rounded bg-sky-600 dark:bg-sky-400" style={{ width: `${percent}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Vote className="h-5 w-5 text-emerald-600 dark:text-emerald-300" /> Serie por minuto
                </CardTitle>
                <CardDescription>Últimos 60 minutos consolidados.</CardDescription>
              </CardHeader>
              <CardContent>
                {minuteSeriesPreview.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-300">Aún no hay votos registrados para construir la serie.</p>
                ) : (
                  <>
                    <div className="space-y-2 md:hidden">
                      {minuteSeriesPreview.map((row, index) => (
                        <article key={`${row.minute || 'none'}-${index}`} className="rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900/60">
                          <p className="font-medium text-slate-800 dark:text-slate-100">{row.minute ? new Date(row.minute).toLocaleTimeString() : 'Sin dato'}</p>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Votos: {row.total_votes} · Blanco: {row.blank_votes}</p>
                        </article>
                      ))}
                    </div>

                    <div className="hidden overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 md:block">
                      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                      <thead className="bg-slate-50 dark:bg-slate-900/60">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Minuto</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Votos</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Blanco</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                        {minuteSeriesPreview.map((row, index) => (
                          <tr key={`${row.minute || 'none'}-${index}`}>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                              {row.minute ? new Date(row.minute).toLocaleTimeString() : 'Sin dato'}
                            </td>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{row.total_votes}</td>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{row.blank_votes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-300" /> Alertas
                </CardTitle>
                <CardDescription>Anomalías detectadas por reglas operativas.</CardDescription>
              </CardHeader>
              <CardContent>
                {snapshot.alerts.length === 0 ? (
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">Sin alertas activas en este momento.</p>
                ) : (
                  <ul className="space-y-2">
                    {snapshot.alerts.map((alert) => (
                      <li
                        key={alert.code}
                        className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/50 dark:text-amber-200"
                      >
                        <p className="font-semibold">{alert.title}</p>
                        <p>{alert.detail}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : loading ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">Cargando snapshot en vivo...</p>
      ) : null}
    </div>
  )
}

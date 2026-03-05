import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, AlertTriangle, CircleHelp, Clock3, Mail, PlayCircle, RefreshCcw, ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Pill } from '../components/ui/Pill'
import { Toast, type ToastType } from '../components/ui/Toast'
import {
  jobsControlApi,
  type JobsOverviewResponse,
  type JobsOverviewRun,
  type JobsRunLogsResponse,
} from '../services/jobsControl'
import { useAuthStore } from '../store/auth'

const JOBS_PER_PAGE = 2
const RUNS_PER_PAGE = 5

const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '-'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '-'
  return d.toLocaleString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const statusPillClass = (status: string): string => {
  const normalized = String(status || '').toUpperCase()
  if (normalized === 'RUNNING') return 'bg-blue-50 text-blue-700 border-blue-200'
  if (normalized === 'SUCCEEDED') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (normalized === 'FAILED') return 'bg-red-50 text-red-700 border-red-200'
  if (normalized === 'CANCELED') return 'bg-amber-50 text-amber-800 border-amber-200'
  return 'bg-slate-50 text-slate-700 border-slate-200'
}

const statusLabel = (status: string): string => {
  const normalized = String(status || '').toUpperCase()
  if (normalized === 'RUNNING') return 'En ejecucion'
  if (normalized === 'SUCCEEDED') return 'Completado'
  if (normalized === 'FAILED') return 'Fallido'
  if (normalized === 'CANCELED') return 'Cancelado'
  if (normalized === 'PENDING') return 'Pendiente'
  return normalized || 'Desconocido'
}

const enabledPillClass = (enabled: boolean): string => {
  return enabled
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-amber-50 text-amber-800 border-amber-200'
}

const JOB_HELP_BY_KEY: Record<string, { short: string; whenToUse: string }> = {
  'notify-novelties-sla': {
    short: 'Vigila casos de novedades en revision y envia alertas por vencimiento de SLA.',
    whenToUse: 'Util cuando quieres presionar seguimiento de casos estancados para docentes, admins y coordinacion.',
  },
  'check-notifications-health': {
    short: 'Revisa salud de envios de correo (fallidos, suprimidos y tasa de exito) en una ventana de tiempo.',
    whenToUse: 'Util para detectar incidentes operativos de notificaciones antes de que impacten a usuarios.',
  },
  'notify-pending-planning-teachers': {
    short: 'Detecta docentes con planeacion faltante o incompleta y les envia recordatorio.',
    whenToUse: 'Util al inicio/mitad del periodo para subir el porcentaje de planeacion completada a tiempo.',
  },
}

const jobHelp = (jobKey: string): { short: string; whenToUse: string } => {
  return (
    JOB_HELP_BY_KEY[jobKey] || {
      short: 'Ejecuta una tarea periodica de soporte operativo.',
      whenToUse: 'Util cuando necesitas correr este proceso manualmente o validar su estado.',
    }
  )
}

export default function OperationsJobsConsole() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = user?.role === 'SUPERADMIN'

  const [overview, setOverview] = useState<JobsOverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [runningJobKey, setRunningJobKey] = useState<string | null>(null)
  const [togglingJobKey, setTogglingJobKey] = useState<string | null>(null)
  const [savingParamsJobKey, setSavingParamsJobKey] = useState<string | null>(null)
  const [savingScheduleJobKey, setSavingScheduleJobKey] = useState<string | null>(null)
  const [paramsDraftByJob, setParamsDraftByJob] = useState<Record<string, Record<string, string>>>({})
  const [scheduleDraftByJob, setScheduleDraftByJob] = useState<
    Record<string, { minute: string; hour: string; day_of_week: string }>
  >({})
  const [jobsPage, setJobsPage] = useState(1)
  const [runsPage, setRunsPage] = useState(1)
  const [selectedRunKey, setSelectedRunKey] = useState<string | null>(null)
  const [runLogs, setRunLogs] = useState<JobsRunLogsResponse | null>(null)
  const [runLogsLoading, setRunLogsLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const copyRestartBeatCommand = async () => {
    const command = 'docker compose up -d backend_beat'
    try {
      await navigator.clipboard.writeText(command)
      showToast('Comando copiado para reiniciar backend_beat.', 'success')
    } catch {
      showToast('No se pudo copiar el comando.', 'error')
    }
  }

  const loadOverview = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await jobsControlApi.getOverview()
      setOverview(res.data)
    } catch {
      setError('No fue posible cargar la consola de jobs. Verifica permisos y conexión.')
      setOverview(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isSuperAdmin) {
      setLoading(false)
      return
    }

    void loadOverview()
    const id = window.setInterval(() => {
      void loadOverview()
    }, 20000)

    return () => window.clearInterval(id)
  }, [isSuperAdmin, loadOverview])

  useEffect(() => {
    const periodicJobs = overview?.periodic_jobs || []
    if (periodicJobs.length === 0) return

    setParamsDraftByJob((prev) => {
      const next = { ...prev }
      for (const job of periodicJobs) {
        const current = { ...(next[job.key] || {}) }
        for (const paramKey of job.editable_params || []) {
          const value = job.effective_params?.[paramKey]
          if (typeof value === 'number' && current[paramKey] === undefined) {
            current[paramKey] = String(value)
          }
        }
        next[job.key] = current
      }
      return next
    })
  }, [overview])

  useEffect(() => {
    const periodicJobs = overview?.periodic_jobs || []
    if (periodicJobs.length === 0) return

    setScheduleDraftByJob((prev) => {
      const next = { ...prev }
      for (const job of periodicJobs) {
        if (next[job.key]) continue
        next[job.key] = {
          minute: String(job.effective_schedule?.minute ?? job.schedule.minute ?? '0'),
          hour: String(job.effective_schedule?.hour ?? job.schedule.hour ?? '*'),
          day_of_week: String(job.effective_schedule?.day_of_week ?? job.schedule.day_of_week ?? '1-5'),
        }
      }
      return next
    })
  }, [overview])

  const handleRunNow = async (jobKey: string) => {
    setRunningJobKey(jobKey)
    try {
      const res = await jobsControlApi.runNow(jobKey)
      showToast(`Job enviado: ${res.data.task_id}`, 'success')
      await loadOverview()
    } catch {
      showToast('No se pudo ejecutar el job manualmente. Si está pausado, reanúdalo primero.', 'error')
    } finally {
      setRunningJobKey(null)
    }
  }

  const handleToggleJob = async (jobKey: string, nextEnabled: boolean) => {
    setTogglingJobKey(jobKey)
    try {
      await jobsControlApi.toggleJob(jobKey, nextEnabled)
      showToast(nextEnabled ? 'Job reanudado.' : 'Job pausado.', 'success')
      await loadOverview()
    } catch {
      showToast('No se pudo actualizar el estado del job.', 'error')
    } finally {
      setTogglingJobKey(null)
    }
  }

  const paramLabel = (key: string): string => {
    if (key === 'dedupe_within_seconds') return 'Deduplicacion (seg)'
    if (key === 'max_failed') return 'Max. fallidos'
    if (key === 'max_suppressed') return 'Max. suprimidos'
    return key
  }

  const handleSaveParams = async (jobKey: string, editableParams: string[]) => {
    const draft = paramsDraftByJob[jobKey] || {}
    const payload: Record<string, number> = {}
    for (const paramKey of editableParams) {
      const raw = String(draft[paramKey] || '').trim()
      const parsed = Number(raw)
      if (!Number.isInteger(parsed) || parsed < 0) {
        showToast(`Valor inválido para ${paramLabel(paramKey)}.`, 'error')
        return
      }
      payload[paramKey] = parsed
    }

    setSavingParamsJobKey(jobKey)
    try {
      await jobsControlApi.updateParams(jobKey, payload)
      showToast('Parámetros actualizados.', 'success')
      await loadOverview()
    } catch {
      showToast('No se pudieron actualizar los parámetros.', 'error')
    } finally {
      setSavingParamsJobKey(null)
    }
  }

  const handleSaveSchedule = async (jobKey: string) => {
    const draft = scheduleDraftByJob[jobKey] || { minute: '', hour: '', day_of_week: '' }
    const minute = String(draft.minute || '').trim()
    const hour = String(draft.hour || '').trim()
    const dayOfWeek = String(draft.day_of_week || '').trim()

    if (!minute || !hour || !dayOfWeek) {
      showToast('Completa minuto, hora y dia_de_semana.', 'error')
      return
    }

    setSavingScheduleJobKey(jobKey)
    try {
      const res = await jobsControlApi.updateSchedule(jobKey, {
        minute,
        hour,
        day_of_week: dayOfWeek,
      })
      showToast(
        res.data.scheduler_restart_required
          ? 'Programacion guardada. Reinicia backend_beat para aplicarla.'
          : 'Programacion guardada.',
        'success',
      )
      await loadOverview()
    } catch {
      showToast('No se pudo actualizar la programacion.', 'error')
    } finally {
      setSavingScheduleJobKey(null)
    }
  }

  const handleOpenRunLogs = async (run: JobsOverviewRun) => {
    setSelectedRunKey(`${run.source}:${run.id}`)
    setRunLogsLoading(true)
    try {
      const res = await jobsControlApi.getRunLogs(run.id, run.source)
      setRunLogs(res.data)
    } catch {
      setRunLogs(null)
      showToast('No se pudieron cargar los logs de la ejecucion.', 'error')
    } finally {
      setRunLogsLoading(false)
    }
  }

  const metrics = useMemo(() => {
    const reportRunning = overview?.report_jobs.running ?? 0
    const reportFailed = overview?.report_jobs.failed ?? 0
    const notificationsUnread = overview?.notifications.unread_total ?? 0
    const emailFailed = overview?.email_delivery.failed ?? 0

    return [
      {
        title: 'Jobs ejecutándose',
        value: String(reportRunning),
        subtitle: 'Reportes en ejecucion',
        icon: Activity,
        tone: 'text-blue-700 bg-blue-50 border-blue-100',
      },
      {
        title: 'Fallos reportes',
        value: String(reportFailed),
        subtitle: 'Últimas 24 horas',
        icon: AlertTriangle,
        tone: 'text-red-700 bg-red-50 border-red-100',
      },
      {
        title: 'Notificaciones sin leer',
        value: String(notificationsUnread),
        subtitle: 'Global',
        icon: Clock3,
        tone: 'text-amber-800 bg-amber-50 border-amber-100',
      },
      {
        title: 'Emails fallidos',
        value: String(emailFailed),
        subtitle: 'Últimas 24 horas',
        icon: Mail,
        tone: 'text-fuchsia-700 bg-fuchsia-50 border-fuchsia-100',
      },
    ]
  }, [overview])

  const periodicJobs = overview?.periodic_jobs || []
  const totalJobPages = Math.max(1, Math.ceil(periodicJobs.length / JOBS_PER_PAGE))
  const currentJobsPage = Math.min(jobsPage, totalJobPages)
  const pagedJobs = periodicJobs.slice((currentJobsPage - 1) * JOBS_PER_PAGE, currentJobsPage * JOBS_PER_PAGE)

  const latestRuns = overview?.latest_runs || []
  const totalRunPages = Math.max(1, Math.ceil(latestRuns.length / RUNS_PER_PAGE))
  const currentRunsPage = Math.min(runsPage, totalRunPages)
  const pagedRuns = latestRuns.slice((currentRunsPage - 1) * RUNS_PER_PAGE, currentRunsPage * RUNS_PER_PAGE)

  useEffect(() => {
    if (pagedRuns.length === 0) {
      setSelectedRunKey(null)
      setRunLogs(null)
      return
    }

    const selectedIsVisible = selectedRunKey !== null && pagedRuns.some((run) => `${run.source}:${run.id}` === selectedRunKey)
    if (selectedIsVisible) return

    const firstRun = pagedRuns[0]
    if (firstRun) {
      void handleOpenRunLogs(firstRun)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRunsPage, latestRuns.length])

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            Operaciones de Jobs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Este módulo está disponible únicamente para usuarios con rol SUPERADMIN.
          </p>
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            Volver al dashboard
          </Button>
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

      <section className="rounded-2xl border border-slate-200 bg-linear-to-r from-slate-900 via-slate-800 to-cyan-900 p-5 text-white shadow-lg dark:border-slate-700">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Centro de Control</p>
            <h1 className="mt-2 text-2xl font-semibold">Consola de Jobs</h1>
            <p className="mt-1 text-sm text-cyan-100/90">
              Monitorea estado operativo y ejecuta jobs críticos bajo demanda.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              onClick={() => void loadOverview()}
              disabled={loading}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Actualizar
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs text-cyan-100/80">
          Última actualización: {formatDateTime(overview?.generated_at)}
        </p>
      </section>

      {error ? (
        <Card>
          <CardContent className="pt-6 text-sm text-red-700 dark:text-red-300">{error}</CardContent>
        </Card>
      ) : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((item) => {
          const Icon = item.icon
          return (
            <Card key={item.title} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{item.title}</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-50">{item.value}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.subtitle}</p>
                  </div>
                  <span className={`rounded-xl border p-2 ${item.tone}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Jobs periodicos</CardTitle>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pagina {currentJobsPage} de {totalJobPages}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {pagedJobs.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No hay jobs configurados.</p>
            ) : null}
            {pagedJobs.map((job) => {
              const isRunning = runningJobKey === job.key
              const isToggling = togglingJobKey === job.key
              const isSavingParams = savingParamsJobKey === job.key
              const isSavingSchedule = savingScheduleJobKey === job.key
              const nextEnabled = !job.enabled
              const editableParams = job.editable_params || []
              const help = jobHelp(job.key)

              return (
                <article key={job.key} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">{job.key}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{job.task}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill text={job.enabled ? 'Activo' : 'Pausado'} className={enabledPillClass(job.enabled)} />
                      <Pill text={job.enabled_override === null ? 'entorno' : 'dinamico'} className="bg-slate-50 text-slate-700 border-slate-200" />
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    Programacion efectiva: min {String(job.effective_schedule?.minute ?? job.schedule.minute)} · hora {String(job.effective_schedule?.hour ?? job.schedule.hour)} · dia {String(job.effective_schedule?.day_of_week ?? job.schedule.day_of_week)}
                  </p>

                  <details className="mt-2 rounded-md border border-sky-200 bg-sky-50/70 p-2 dark:border-sky-800 dark:bg-sky-950/20">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-sky-800 dark:text-sky-200">
                      <CircleHelp className="h-3.5 w-3.5" />
                      Que hace este job
                    </summary>
                    <div className="mt-2 space-y-1 text-xs text-sky-900 dark:text-sky-100">
                      <p>{help.short}</p>
                      <p>
                        <span className="font-semibold">Cuando usarlo:</span> {help.whenToUse}
                      </p>
                    </div>
                  </details>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={job.enabled ? 'secondary' : 'default'}
                      onClick={() => void handleToggleJob(job.key, nextEnabled)}
                      disabled={isToggling}
                    >
                      {isToggling ? 'Actualizando...' : nextEnabled ? 'Reanudar' : 'Pausar'}
                    </Button>
                    <Button size="sm" onClick={() => void handleRunNow(job.key)} disabled={isRunning}>
                      <PlayCircle className="mr-2 h-4 w-4" />
                      {isRunning ? 'Enviando...' : 'Ejecutar ahora'}
                    </Button>
                  </div>

                  {editableParams.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {editableParams.map((paramKey) => (
                          <div key={paramKey} className="space-y-1">
                            <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{paramLabel(paramKey)}</label>
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              className="h-8"
                              value={(paramsDraftByJob[job.key] || {})[paramKey] ?? ''}
                              onChange={(e) =>
                                setParamsDraftByJob((prev) => ({
                                  ...prev,
                                  [job.key]: {
                                    ...(prev[job.key] || {}),
                                    [paramKey]: e.target.value,
                                  },
                                }))
                              }
                            />
                          </div>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isSavingParams}
                        onClick={() => void handleSaveParams(job.key, editableParams)}
                        className="h-8"
                      >
                        {isSavingParams ? 'Guardando...' : 'Guardar parametros'}
                      </Button>
                    </div>
                  ) : null}

                  <div className="mt-3 space-y-2 rounded-md border border-slate-200 p-2 dark:border-slate-700">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Programacion personalizada</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <Input
                        className="h-8"
                        placeholder="minuto"
                        value={(scheduleDraftByJob[job.key] || {}).minute ?? ''}
                        onChange={(e) =>
                          setScheduleDraftByJob((prev) => ({
                            ...prev,
                            [job.key]: {
                              ...(prev[job.key] || { minute: '', hour: '', day_of_week: '' }),
                              minute: e.target.value,
                            },
                          }))
                        }
                      />
                      <Input
                        className="h-8"
                        placeholder="hora"
                        value={(scheduleDraftByJob[job.key] || {}).hour ?? ''}
                        onChange={(e) =>
                          setScheduleDraftByJob((prev) => ({
                            ...prev,
                            [job.key]: {
                              ...(prev[job.key] || { minute: '', hour: '', day_of_week: '' }),
                              hour: e.target.value,
                            },
                          }))
                        }
                      />
                      <Input
                        className="h-8"
                        placeholder="dia_de_semana"
                        value={(scheduleDraftByJob[job.key] || {}).day_of_week ?? ''}
                        onChange={(e) =>
                          setScheduleDraftByJob((prev) => ({
                            ...prev,
                            [job.key]: {
                              ...(prev[job.key] || { minute: '', hour: '', day_of_week: '' }),
                              day_of_week: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSavingSchedule}
                      onClick={() => void handleSaveSchedule(job.key)}
                      className="h-8"
                    >
                      {isSavingSchedule ? 'Guardando...' : 'Guardar programacion'}
                    </Button>
                    {job.scheduler_restart_required ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-[11px] text-amber-700 dark:text-amber-300">Hay override activo. Reinicia `backend_beat` para aplicar este cron.</p>
                        <Button size="sm" variant="outline" className="h-7" onClick={() => void copyRestartBeatCommand()}>
                          Copiar comando
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </article>
              )
            })}

            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="outline" disabled={currentJobsPage <= 1} onClick={() => setJobsPage((p) => Math.max(1, p - 1))}>
                Anterior
              </Button>
              <Button size="sm" variant="outline" disabled={currentJobsPage >= totalJobPages} onClick={() => setJobsPage((p) => Math.min(totalJobPages, p + 1))}>
                Siguiente
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Ejecuciones recientes</CardTitle>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pagina {currentRunsPage} de {totalRunPages}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {pagedRuns.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No hay ejecuciones recientes.</p>
            ) : null}
            {pagedRuns.map((run) => (
              <button
                key={`${run.source}:${run.id}`}
                type="button"
                onClick={() => void handleOpenRunLogs(run)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${
                  selectedRunKey === `${run.source}:${run.id}`
                    ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-900/20'
                    : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{run.report_type}</p>
                  <Pill text={statusLabel(run.status)} className={statusPillClass(run.status)} />
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Inicio: {formatDateTime(run.created_at)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Fin: {formatDateTime(run.finished_at)}</p>
              </button>
            ))}

            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="outline" disabled={currentRunsPage <= 1} onClick={() => setRunsPage((p) => Math.max(1, p - 1))}>
                Anterior
              </Button>
              <Button size="sm" variant="outline" disabled={currentRunsPage >= totalRunPages} onClick={() => setRunsPage((p) => Math.min(totalRunPages, p + 1))}>
                Siguiente
              </Button>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Detalle de ejecucion</p>
              {runLogsLoading ? <p className="mt-2 text-xs text-slate-500">Cargando logs...</p> : null}
              {!runLogsLoading && !selectedRunKey ? <p className="mt-2 text-xs text-slate-500">Selecciona una ejecucion para ver sus logs.</p> : null}
              {!runLogsLoading && selectedRunKey && !runLogs ? <p className="mt-2 text-xs text-slate-500">No fue posible cargar los logs.</p> : null}
              {!runLogsLoading && runLogs ? (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Estado: {statusLabel(runLogs.run.status)}
                    {runLogs.run.error_message ? ` | Error: ${runLogs.run.error_message}` : ''}
                  </p>
                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                    {runLogs.events.map((ev) => (
                      <div key={ev.id} className="rounded-md border border-slate-200 p-2 text-xs dark:border-slate-700">
                        <p className="font-medium text-slate-700 dark:text-slate-200">
                          {ev.event_type} · {ev.level} · {formatDateTime(ev.created_at)}
                        </p>
                        {ev.message ? <p className="mt-1 text-slate-600 dark:text-slate-300">{ev.message}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'

import { Button } from '../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card'
import { ConfirmationModal } from '../components/ui/ConfirmationModal'
import { Input } from '../components/ui/Input'
import ElectionCandidatesContraloria from './ElectionCandidatesContraloria'
import ElectionCandidatesPersoneria from './ElectionCandidatesPersoneria'
import ElectionRolesManage from './ElectionRolesManage'
import {
  electionsApi,
  getApiErrorMessage,
  type ElectionOpeningRecord,
  type ElectionProcessItem,
  type ElectionScrutinySummaryResponse,
  type ElectionTokenEligibilityIssueItem,
} from '../services/elections'
import { useAuthStore } from '../store/auth'

function localDatetimeToIso(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function isoToLocalDatetime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const timezoneOffset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16)
}

export default function ElectionProcessesManage() {
  const user = useAuthStore((s) => s.user)
  const canManage = user?.role === 'SUPERADMIN' || user?.role === 'ADMIN'

  const [items, setItems] = useState<ElectionProcessItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [status, setStatus] = useState<'DRAFT' | 'OPEN'>('DRAFT')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [activeTab, setActiveTab] = useState<'processes' | 'roles' | 'candidates'>('processes')
  const [candidatesTab, setCandidatesTab] = useState<'personeria' | 'contraloria'>('personeria')
  const [eligibilityProcessId, setEligibilityProcessId] = useState('')
  const [eligibilityIssues, setEligibilityIssues] = useState<ElectionTokenEligibilityIssueItem[]>([])
  const [eligibilityScannedCount, setEligibilityScannedCount] = useState(0)
  const [eligibilityLoading, setEligibilityLoading] = useState(false)
  const [eligibilityError, setEligibilityError] = useState<string | null>(null)
  const [eligibilityChecked, setEligibilityChecked] = useState(false)
  const [scrutinyProcessId, setScrutinyProcessId] = useState('')
  const [scrutinyLoading, setScrutinyLoading] = useState(false)
  const [scrutinyError, setScrutinyError] = useState<string | null>(null)
  const [openingRecord, setOpeningRecord] = useState<ElectionOpeningRecord | null>(null)
  const [scrutinySummary, setScrutinySummary] = useState<ElectionScrutinySummaryResponse | null>(null)
  const [deletingProcessId, setDeletingProcessId] = useState<number | null>(null)
  const [processToDelete, setProcessToDelete] = useState<ElectionProcessItem | null>(null)
  const [editingProcess, setEditingProcess] = useState<ElectionProcessItem | null>(null)
  const [editingStartsAt, setEditingStartsAt] = useState('')
  const [editingEndsAt, setEditingEndsAt] = useState('')
  const [updatingProcessId, setUpdatingProcessId] = useState<number | null>(null)

  const loadItems = async () => {
    if (!canManage) return
    setLoading(true)
    setError(null)
    try {
      const response = await electionsApi.listProcesses()
      setItems(response.results)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible cargar las jornadas electorales.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage])

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canManage) return

    const normalizedName = name.trim()
    if (!normalizedName) {
      setError('Debes ingresar el nombre de la jornada.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const payload = {
        name: normalizedName,
        status,
        starts_at: localDatetimeToIso(startsAt),
        ends_at: localDatetimeToIso(endsAt),
      }
      await electionsApi.createProcess(payload)
      setName('')
      setStatus('DRAFT')
      setStartsAt('')
      setEndsAt('')
      setSuccess('Jornada electoral creada correctamente.')
      await loadItems()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible crear la jornada electoral.'))
    } finally {
      setSaving(false)
    }
  }

  const onOpenProcess = async (processId: number) => {
    if (!canManage) return
    setError(null)
    setSuccess(null)
    try {
      await electionsApi.openProcess(processId)
      setSuccess('Jornada electoral abierta correctamente.')
      await loadItems()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible abrir la jornada electoral.'))
    }
  }

  const onRequestDeleteProcess = (processItem: ElectionProcessItem) => {
    setProcessToDelete(processItem)
  }

  const onStartEditProcess = (processItem: ElectionProcessItem) => {
    setEditingProcess(processItem)
    setEditingStartsAt(isoToLocalDatetime(processItem.starts_at))
    setEditingEndsAt(isoToLocalDatetime(processItem.ends_at))
    setError(null)
    setSuccess(null)
  }

  const onCancelEditProcess = () => {
    if (updatingProcessId) return
    setEditingProcess(null)
    setEditingStartsAt('')
    setEditingEndsAt('')
  }

  const onSubmitEditProcess = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editingProcess) return

    setUpdatingProcessId(editingProcess.id)
    setError(null)
    setSuccess(null)

    try {
      await electionsApi.updateProcess(editingProcess.id, {
        starts_at: localDatetimeToIso(editingStartsAt),
        ends_at: localDatetimeToIso(editingEndsAt),
      })
      setSuccess('Fechas de la jornada actualizadas correctamente.')
      setEditingProcess(null)
      setEditingStartsAt('')
      setEditingEndsAt('')
      await loadItems()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible actualizar las fechas de la jornada.'))
    } finally {
      setUpdatingProcessId(null)
    }
  }

  const onConfirmDeleteProcess = async () => {
    if (!processToDelete) return

    setDeletingProcessId(processToDelete.id)
    setError(null)
    setSuccess(null)
    try {
      await electionsApi.deleteProcess(processToDelete.id)
      setSuccess('Jornada electoral eliminada correctamente.')
      setProcessToDelete(null)
      await loadItems()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible eliminar la jornada electoral.'))
    } finally {
      setDeletingProcessId(null)
    }
  }

  const onRunEligibilityValidation = async () => {
    if (!canManage) return
    setEligibilityLoading(true)
    setEligibilityError(null)
    setEligibilityChecked(false)

    try {
      const processId = eligibilityProcessId ? Number(eligibilityProcessId) : undefined
      const response = await electionsApi.listTokenEligibilityIssues(processId, 200)
      setEligibilityIssues(response.results)
      setEligibilityScannedCount(response.scanned_count)
      setEligibilityChecked(true)
    } catch (requestError) {
      setEligibilityError(getApiErrorMessage(requestError, 'No fue posible ejecutar la prevalidación de censo.'))
      setEligibilityIssues([])
      setEligibilityScannedCount(0)
    } finally {
      setEligibilityLoading(false)
    }
  }

  const onExportEligibilityCsv = () => {
    if (eligibilityIssues.length === 0) return

    const headers = ['token', 'estado', 'grado', 'jornada', 'error', 'proceso_id', 'proceso_nombre']
    const escapeCsv = (value: string) => `"${value.replaceAll('"', '""')}"`

    const rows = eligibilityIssues.map((issue) => [
      issue.token_prefix || String(issue.token_id),
      issue.status || '',
      issue.student_grade || '',
      issue.student_shift || '',
      issue.error || '',
      String(issue.process_id),
      issue.process_name || '',
    ])

    const csv = [headers, ...rows].map((row) => row.map((cell) => escapeCsv(String(cell ?? ''))).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
    link.href = url
    link.download = `prevalidacion_censo_${timestamp}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const onLoadScrutiny = async () => {
    if (!canManage) return

    const processId = Number(scrutinyProcessId)
    if (!Number.isFinite(processId) || processId <= 0) {
      setScrutinyError('Debes seleccionar una jornada para consultar apertura y escrutinio.')
      return
    }

    setScrutinyLoading(true)
    setScrutinyError(null)
    try {
      const [opening, summary] = await Promise.all([
        electionsApi.getProcessOpeningRecord(processId),
        electionsApi.getProcessScrutinySummary(processId),
      ])
      setOpeningRecord(opening)
      setScrutinySummary(summary)
    } catch (requestError) {
      setScrutinyError(getApiErrorMessage(requestError, 'No fue posible consultar apertura en cero y escrutinio.'))
      setOpeningRecord(null)
      setScrutinySummary(null)
    } finally {
      setScrutinyLoading(false)
    }
  }

  const downloadBlobFile = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const onExportScrutinyCsv = async () => {
    const processId = Number(scrutinyProcessId)
    if (!Number.isFinite(processId) || processId <= 0) {
      setScrutinyError('Debes seleccionar una jornada para exportar acta CSV.')
      return
    }

    try {
      const blob = await electionsApi.downloadScrutinyCsv(processId)
      downloadBlobFile(blob, `acta_escrutinio_${processId}.csv`)
    } catch (requestError) {
      setScrutinyError(getApiErrorMessage(requestError, 'No fue posible exportar el acta CSV de escrutinio.'))
    }
  }

  const onExportScrutinyXlsx = async () => {
    const processId = Number(scrutinyProcessId)
    if (!Number.isFinite(processId) || processId <= 0) {
      setScrutinyError('Debes seleccionar una jornada para exportar acta Excel.')
      return
    }

    try {
      const blob = await electionsApi.downloadScrutinyXlsx(processId)
      downloadBlobFile(blob, `acta_escrutinio_${processId}.xlsx`)
    } catch (requestError) {
      setScrutinyError(getApiErrorMessage(requestError, 'No fue posible exportar el acta Excel de escrutinio.'))
    }
  }

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sin permisos</CardTitle>
          <CardDescription>Solo superadmin y administrador pueden gestionar Gobierno Escolar.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80 sm:flex-row sm:space-x-1 sm:gap-0" role="tablist" aria-label="Secciones de Gobierno Escolar">
        <button
          type="button"
          onClick={() => setActiveTab('processes')}
          id="gobierno-tab-jornadas"
          role="tab"
          aria-selected={activeTab === 'processes'}
          aria-controls="gobierno-panel-jornadas"
          tabIndex={activeTab === 'processes' ? 0 : -1}
          className={`min-h-11 w-full rounded-lg px-3 py-2.5 text-sm font-medium leading-5 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 ${
            activeTab === 'processes'
              ? 'bg-white text-blue-700 shadow dark:bg-slate-900 dark:text-blue-300'
              : 'text-slate-600 hover:bg-white/12 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-slate-100'
          }`}
        >
          Jornadas
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('roles')}
          id="gobierno-tab-cargos"
          role="tab"
          aria-selected={activeTab === 'roles'}
          aria-controls="gobierno-panel-cargos"
          tabIndex={activeTab === 'roles' ? 0 : -1}
          className={`min-h-11 w-full rounded-lg px-3 py-2.5 text-sm font-medium leading-5 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 ${
            activeTab === 'roles'
              ? 'bg-white text-blue-700 shadow dark:bg-slate-900 dark:text-blue-300'
              : 'text-slate-600 hover:bg-white/12 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-slate-100'
          }`}
        >
          Cargos
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('candidates')}
          id="gobierno-tab-candidatos"
          role="tab"
          aria-selected={activeTab === 'candidates'}
          aria-controls="gobierno-panel-candidatos"
          tabIndex={activeTab === 'candidates' ? 0 : -1}
          className={`min-h-11 w-full rounded-lg px-3 py-2.5 text-sm font-medium leading-5 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 ${
            activeTab === 'candidates'
              ? 'bg-white text-blue-700 shadow dark:bg-slate-900 dark:text-blue-300'
              : 'text-slate-600 hover:bg-white/12 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-slate-100'
          }`}
        >
          Candidatos
        </button>
      </div>

      {activeTab === 'processes' ? (
        <div id="gobierno-panel-jornadas" role="tabpanel" aria-labelledby="gobierno-tab-jornadas" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Jornadas electorales</CardTitle>
              <CardDescription>Crea o abre la jornada en Election Processes.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 md:grid-cols-2" onSubmit={onCreate}>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Nombre de la jornada</label>
                  <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej: Jornada electoral 2026" />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Estado inicial</label>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value as 'DRAFT' | 'OPEN')}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="DRAFT">Borrador</option>
                    <option value="OPEN">Abierta</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Inicio (opcional)</label>
                  <Input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Fin (opcional)</label>
                  <Input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
                </div>

                <div className="md:col-span-2">
                  <Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Crear jornada'}</Button>
                </div>
              </form>

              {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p> : null}
              {success ? <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-300">{success}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Listado de jornadas</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">Cargando jornadas...</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                  <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                    <thead className="bg-slate-50 dark:bg-slate-900/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Nombre</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Estado</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Inicio</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Fin</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.name}</td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{item.status}</span>
                              {item.votes_count > 0 ? (
                                <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                  Con votos ({item.votes_count})
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.starts_at ? new Date(item.starts_at).toLocaleString() : '—'}</td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.ends_at ? new Date(item.ends_at).toLocaleString() : '—'}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                disabled={updatingProcessId === item.id}
                                onClick={() => onStartEditProcess(item)}
                              >
                                {updatingProcessId === item.id ? 'Actualizando...' : 'Editar fechas'}
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={item.status === 'OPEN'}
                                onClick={() => void onOpenProcess(item.id)}
                              >
                                {item.status === 'OPEN' ? 'Abierta' : 'Abrir jornada'}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={deletingProcessId === item.id || !item.can_delete}
                                title={
                                  item.can_delete
                                    ? 'Eliminar jornada'
                                    : 'No se puede eliminar: la jornada ya tiene votos registrados.'
                                }
                                onClick={() => onRequestDeleteProcess(item)}
                              >
                                {deletingProcessId === item.id ? 'Eliminando...' : 'Eliminar'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {editingProcess ? (
            <Card>
              <CardHeader>
                <CardTitle>Editar fechas de jornada</CardTitle>
                <CardDescription>
                  Jornada: <span className="font-semibold">{editingProcess.name}</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmitEditProcess}>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Inicio (opcional)</label>
                    <Input type="datetime-local" value={editingStartsAt} onChange={(event) => setEditingStartsAt(event.target.value)} />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Fin (opcional)</label>
                    <Input type="datetime-local" value={editingEndsAt} onChange={(event) => setEditingEndsAt(event.target.value)} />
                  </div>

                  <div className="md:col-span-2 flex flex-wrap gap-2">
                    <Button type="submit" disabled={updatingProcessId === editingProcess.id}>
                      {updatingProcessId === editingProcess.id ? 'Guardando...' : 'Guardar cambios'}
                    </Button>
                    <Button type="button" variant="outline" onClick={onCancelEditProcess} disabled={updatingProcessId === editingProcess.id}>
                      Cancelar
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Prevalidación de censo</CardTitle>
              <CardDescription>
                Revisa tokens no elegibles antes de abrir jornada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Jornada (opcional)</label>
                  <select
                    value={eligibilityProcessId}
                    onChange={(event) => setEligibilityProcessId(event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="">Todas las jornadas</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <Button type="button" disabled={eligibilityLoading} onClick={() => void onRunEligibilityValidation()}>
                    {eligibilityLoading ? 'Validando...' : 'Validar elegibilidad'}
                  </Button>
                </div>
              </div>

              {eligibilityError ? <p className="text-sm text-red-600 dark:text-red-300">{eligibilityError}</p> : null}

              {eligibilityChecked ? (
                <div className="space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Tokens revisados: <span className="font-semibold">{eligibilityScannedCount}</span> · Incidencias: <span className="font-semibold">{eligibilityIssues.length}</span>
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={eligibilityIssues.length === 0}
                      onClick={onExportEligibilityCsv}
                    >
                      Exportar CSV de incidencias
                    </Button>
                  </div>

                  {eligibilityIssues.length === 0 ? (
                    <p className="text-sm text-emerald-600 dark:text-emerald-300">No se encontraron incidencias de elegibilidad en el censo.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                        <thead className="bg-slate-50 dark:bg-slate-900/50">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Token</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Estado</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Grado</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Jornada</th>
                            <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Error</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                          {eligibilityIssues.map((issue) => (
                            <tr key={issue.token_id}>
                              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{issue.token_prefix || `#${issue.token_id}`}</td>
                              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{issue.status}</td>
                              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{issue.student_grade || '—'}</td>
                              <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{issue.student_shift || '—'}</td>
                              <td className="px-3 py-2 text-red-700 dark:text-red-300">{issue.error}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Apertura en cero y escrutinio</CardTitle>
              <CardDescription>
                Consulta evidencia de apertura y resumen de votación por cargo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Jornada</label>
                  <select
                    value={scrutinyProcessId}
                    onChange={(event) => setScrutinyProcessId(event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="">Selecciona una jornada</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <Button type="button" disabled={scrutinyLoading} onClick={() => void onLoadScrutiny()}>
                    {scrutinyLoading ? 'Consultando...' : 'Consultar'}
                  </Button>
                </div>
              </div>

              {scrutinyError ? <p className="text-sm text-red-600 dark:text-red-300">{scrutinyError}</p> : null}

              {openingRecord ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-200">
                  <p>
                    Apertura certificada por <span className="font-semibold">{openingRecord.opened_by_name || 'Sistema'}</span> ·{' '}
                    {new Date(openingRecord.opened_at).toLocaleString()} · votos al abrir: <span className="font-semibold">{openingRecord.votes_count_at_open}</span>
                  </p>
                </div>
              ) : null}

              {scrutinySummary ? (
                <div className="space-y-3">
                  <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950/40 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-slate-700 dark:text-slate-200">
                      Total votos: <span className="font-semibold">{scrutinySummary.summary.total_votes}</span> · Votos en blanco:{' '}
                      <span className="font-semibold">{scrutinySummary.summary.total_blank_votes}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="secondary" onClick={() => void onExportScrutinyCsv()}>
                        Exportar CSV
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => void onExportScrutinyXlsx()}>
                        Exportar Excel
                      </Button>
                    </div>
                  </div>

                  {scrutinySummary.roles.map((role) => (
                    <div key={role.role_id} className="rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
                        {role.title} ({role.code}) · Total: {role.total_votes} · Blanco: {role.blank_votes}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                          <thead className="bg-white dark:bg-slate-950/40">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Número</th>
                              <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Candidato</th>
                              <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Votos</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                            {role.candidates.length === 0 ? (
                              <tr>
                                <td colSpan={3} className="px-3 py-2 text-slate-500 dark:text-slate-400">Sin votos registrados para candidaturas en este cargo.</td>
                              </tr>
                            ) : (
                              role.candidates.map((candidate) => (
                                <tr key={candidate.candidate_id}>
                                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{candidate.number}</td>
                                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{candidate.name}</td>
                                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{candidate.votes}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === 'roles' ? (
        <div id="gobierno-panel-cargos" role="tabpanel" aria-labelledby="gobierno-tab-cargos">
          <ElectionRolesManage />
        </div>
      ) : null}

      {activeTab === 'candidates' ? (
        <div id="gobierno-panel-candidatos" role="tabpanel" aria-labelledby="gobierno-tab-candidatos" className="space-y-6">
          <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-950/60 sm:flex-row">
            <button
              type="button"
              onClick={() => setCandidatesTab('personeria')}
              className={`min-h-10 rounded-md px-3 text-sm font-medium ${
                candidatesTab === 'personeria'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              Personería
            </button>
            <button
              type="button"
              onClick={() => setCandidatesTab('contraloria')}
              className={`min-h-10 rounded-md px-3 text-sm font-medium ${
                candidatesTab === 'contraloria'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              Contraloría
            </button>
          </div>

          {candidatesTab === 'personeria' ? <ElectionCandidatesPersoneria /> : <ElectionCandidatesContraloria />}
        </div>
      ) : null}

      <ConfirmationModal
        isOpen={Boolean(processToDelete)}
        onClose={() => {
          if (!deletingProcessId) {
            setProcessToDelete(null)
          }
        }}
        onConfirm={() => void onConfirmDeleteProcess()}
        title="Eliminar jornada electoral"
        description={
          processToDelete
            ? `¿Estás seguro de eliminar la jornada ${processToDelete.name}? Esta acción no se puede deshacer.`
            : '¿Estás seguro de eliminar esta jornada?'
        }
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="destructive"
        loading={deletingProcessId !== null}
      />
    </div>
  )
}

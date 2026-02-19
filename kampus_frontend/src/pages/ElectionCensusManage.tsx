import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card'
import {
  electionsApi,
  getApiErrorMessage,
  type ElectionProcessCensusMemberItem,
  type ElectionProcessItem,
} from '../services/elections'
import { useAuthStore } from '../store/auth'

const CENSUS_PAGE_SIZE_STORAGE_KEY = 'kampus.elections.census.pageSize'

function downloadBlobFile(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

export default function ElectionCensusManage() {
  const user = useAuthStore((s) => s.user)
  const canManage = user?.role === 'SUPERADMIN' || user?.role === 'ADMIN'

  const [processes, setProcesses] = useState<ElectionProcessItem[]>([])
  const [selectedProcessId, setSelectedProcessId] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [voteStatusFilter, setVoteStatusFilter] = useState<'all' | 'voted' | 'not_voted'>('all')
  const [groups, setGroups] = useState<string[]>([])
  const [items, setItems] = useState<ElectionProcessCensusMemberItem[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(() => {
    try {
      const rawValue = window.localStorage.getItem(CENSUS_PAGE_SIZE_STORAGE_KEY)
      const parsedValue = Number(rawValue)
      if ([10, 20, 50].includes(parsedValue)) {
        return parsedValue
      }
    } catch {
      // no-op
    }
    return 10
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busyMemberId, setBusyMemberId] = useState<number | null>(null)
  const [printing, setPrinting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [syncingCensus, setSyncingCensus] = useState(false)
  const [codeMode, setCodeMode] = useState<'existing' | 'regenerate'>('existing')
  const [regenerationReason, setRegenerationReason] = useState('')

  const selectedProcess = useMemo(
    () => processes.find((process) => String(process.id) === selectedProcessId) || null,
    [processes, selectedProcessId],
  )

  const votedCountInPage = useMemo(
    () => items.filter((item) => item.has_completed_vote).length,
    [items],
  )
  const notVotedCountInPage = useMemo(
    () => items.filter((item) => !item.has_completed_vote).length,
    [items],
  )

  const loadProcesses = async () => {
    if (!canManage) return
    try {
      const response = await electionsApi.listProcesses()
      setProcesses(response.results)
      if (!selectedProcessId && response.results.length > 0) {
        setSelectedProcessId(String(response.results[0].id))
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible cargar jornadas para el censo.'))
    }
  }

  const loadCensus = useCallback(async (processId: number, page = 1) => {
    setLoading(true)
    setError(null)
    try {
      const response = await electionsApi.getProcessCensus(
        processId,
        page,
        pageSize,
        debouncedSearchQuery || undefined,
        voteStatusFilter === 'all' ? undefined : voteStatusFilter,
      )
      setItems(response.results)
      setGroups(response.groups || [])
      setCurrentPage(response.page || page)
      setTotalPages(response.total_pages || 1)
      setTotalCount(response.total_count || 0)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible cargar el censo de la jornada seleccionada.'))
      setItems([])
      setGroups([])
      setTotalPages(1)
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }, [pageSize, debouncedSearchQuery, voteStatusFilter])

  useEffect(() => {
    void loadProcesses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage])

  useEffect(() => {
    const processId = Number(selectedProcessId)
    if (!Number.isFinite(processId) || processId <= 0) return
    void loadCensus(processId, currentPage)
  }, [selectedProcessId, currentPage, loadCensus])

  useEffect(() => {
    setCurrentPage(1)
  }, [selectedProcessId])

  useEffect(() => {
    setCurrentPage(1)
  }, [pageSize])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim())
    }, 350)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [searchQuery])

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearchQuery])

  useEffect(() => {
    setCurrentPage(1)
  }, [voteStatusFilter])

  useEffect(() => {
    try {
      window.localStorage.setItem(CENSUS_PAGE_SIZE_STORAGE_KEY, String(pageSize))
    } catch {
      // no-op
    }
  }, [pageSize])

  const onExclude = async (item: ElectionProcessCensusMemberItem) => {
    const processId = Number(selectedProcessId)
    if (!Number.isFinite(processId) || processId <= 0) return

    setBusyMemberId(item.member_id)
    setError(null)
    setSuccess(null)
    try {
      await electionsApi.excludeCensusMember(processId, item.member_id)
      setSuccess('Estudiante excluido de la jornada.')
      await loadCensus(processId, currentPage)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible excluir el estudiante del censo de la jornada.'))
    } finally {
      setBusyMemberId(null)
    }
  }

  const onInclude = async (item: ElectionProcessCensusMemberItem) => {
    const processId = Number(selectedProcessId)
    if (!Number.isFinite(processId) || processId <= 0) return

    setBusyMemberId(item.member_id)
    setError(null)
    setSuccess(null)
    try {
      await electionsApi.includeCensusMember(processId, item.member_id)
      setSuccess('Estudiante habilitado nuevamente para la jornada.')
      await loadCensus(processId, currentPage)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible habilitar nuevamente al estudiante.'))
    } finally {
      setBusyMemberId(null)
    }
  }

  const onExportXlsx = async () => {
    const processId = Number(selectedProcessId)
    if (!Number.isFinite(processId) || processId <= 0) return

    const isRegenerateMode = codeMode === 'regenerate'
    const normalizedReason = regenerationReason.trim()
    if (isRegenerateMode && normalizedReason.length < 10) {
      setError('Debes indicar un motivo de regeneración (mínimo 10 caracteres).')
      return
    }

    if (isRegenerateMode) {
      const confirmed = window.confirm('Se regenerarán códigos manuales y se revocarán los activos previos para esta selección. ¿Deseas continuar?')
      if (!confirmed) return
    }

    setExporting(true)
    setError(null)
    try {
      const blob = await electionsApi.downloadCensusManualCodesXlsx(processId, {
        group: groupFilter || undefined,
        mode: codeMode,
        confirm_regeneration: isRegenerateMode,
        regeneration_reason: isRegenerateMode ? normalizedReason : undefined,
      })
      const suffix = groupFilter ? groupFilter.replaceAll(' ', '_') : 'todos'
      downloadBlobFile(blob, `censo_codigos_${processId}_${suffix}.xlsx`)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible exportar códigos manuales en Excel.'))
    } finally {
      setExporting(false)
    }
  }

  const onPrintQr = async () => {
    const processId = Number(selectedProcessId)
    if (!Number.isFinite(processId) || processId <= 0) return

    const isRegenerateMode = codeMode === 'regenerate'
    const normalizedReason = regenerationReason.trim()
    if (isRegenerateMode && normalizedReason.length < 10) {
      setError('Debes indicar un motivo de regeneración (mínimo 10 caracteres).')
      return
    }

    if (isRegenerateMode) {
      const confirmed = window.confirm('Se regenerarán códigos manuales y se revocarán los activos previos para esta selección. ¿Deseas continuar?')
      if (!confirmed) return
    }

    setPrinting(true)
    setError(null)
    try {
      const popup = window.open('', '_blank')
      const html = await electionsApi.downloadCensusQrPrintHtml(processId, {
        group: groupFilter || undefined,
        mode: codeMode,
        confirm_regeneration: isRegenerateMode,
        regeneration_reason: isRegenerateMode ? normalizedReason : undefined,
      })
      if (!popup) {
        throw new Error('No se pudo abrir la ventana de impresión. Revisa bloqueador de ventanas emergentes.')
      }
      popup.document.open()
      popup.document.write(html)
      popup.document.close()
      popup.focus()
      popup.print()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible generar impresión grupal de QR.'))
    } finally {
      setPrinting(false)
    }
  }

  const onSyncCensusFromEnrollments = async () => {
    setSyncingCensus(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await electionsApi.syncCensusFromActiveEnrollments()
      setSuccess(
        `${response.detail} Recibidos: ${response.sync.received_count}, creados: ${response.sync.created_count}, actualizados: ${response.sync.updated_count}.`,
      )

      const processId = Number(selectedProcessId)
      if (Number.isFinite(processId) && processId > 0) {
        await loadCensus(processId, 1)
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible cargar censo desde matriculados.'))
    } finally {
      setSyncingCensus(false)
    }
  }

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sin permisos</CardTitle>
          <CardDescription>Solo superadmin y administrador pueden gestionar Censo de Gobierno Escolar.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Censo electoral por jornada</CardTitle>
          <CardDescription>
            Visualiza estudiantes habilitados para votar, excluye temporalmente por jornada y genera códigos/QR grupales.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <section className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Filtros</h3>
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Jornada</label>
                <select
                  value={selectedProcessId}
                  onChange={(event) => setSelectedProcessId(event.target.value)}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">Selecciona una jornada</option>
                  {processes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Grupo para QR/XLSX</label>
                <select
                  value={groupFilter}
                  onChange={(event) => setGroupFilter(event.target.value)}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">Todos los grupos</option>
                  {groups.map((groupName) => (
                    <option key={groupName} value={groupName}>
                      {groupName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Paginación</label>
                <select
                  value={String(pageSize)}
                  onChange={(event) => setPageSize(Number(event.target.value) || 10)}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="10">10 por página</option>
                  <option value="20">20 por página</option>
                  <option value="50">50 por página</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Votación</label>
                <select
                  value={voteStatusFilter}
                  onChange={(event) => {
                    const value = event.target.value
                    if (value === 'voted' || value === 'not_voted') {
                      setVoteStatusFilter(value)
                      return
                    }
                    setVoteStatusFilter('all')
                  }}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="all">Todos</option>
                  <option value="voted">Votó</option>
                  <option value="not_voted">No votó</option>
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Emisión y mantenimiento</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Modo de códigos</label>
                <select
                  value={codeMode}
                  onChange={(event) => setCodeMode(event.target.value === 'regenerate' ? 'regenerate' : 'existing')}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="existing">Reusar existentes y generar faltantes (sin regenerar)</option>
                  <option value="regenerate">Regenerar códigos (revoca códigos activos previos)</option>
                </select>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Buscar en censo</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Nombre, documento, grupo, grado, jornada..."
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>
          </section>

          {codeMode === 'regenerate' ? (
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Motivo de regeneración (obligatorio)</label>
              <input
                type="text"
                value={regenerationReason}
                onChange={(event) => setRegenerationReason(event.target.value)}
                placeholder="Ejemplo: reimpresión controlada por pérdida de planillas"
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void onSyncCensusFromEnrollments()} disabled={syncingCensus}>
              {syncingCensus ? 'Cargando censo...' : 'Cargar desde matriculados'}
            </Button>
            <Button type="button" onClick={() => void onPrintQr()} disabled={printing || !selectedProcessId}>
              {printing ? 'Generando impresión...' : 'Imprimir QR grupal'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void onExportXlsx()} disabled={exporting || !selectedProcessId}>
              {exporting ? 'Exportando...' : 'Exportar XLSX códigos manuales'}
            </Button>
          </div>

          {selectedProcess ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Jornada: <strong>{selectedProcess.name}</strong> · Orden: grado y grupo descendente. Modo actual:{' '}
              <strong>{codeMode === 'regenerate' ? 'Regenerar códigos' : 'Reusar + generar faltantes'}</strong>.
            </p>
          ) : null}
          {error ? <p className="text-sm text-red-600 dark:text-red-300">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-600 dark:text-emerald-300">{success}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estudiantes en censo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              Votó (página): {votedCountInPage}
            </span>
            <span className="rounded-full bg-slate-200 px-2 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              No votó (página): {notVotedCountInPage}
            </span>
          </div>

          {loading ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Cargando censo...</p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-3 md:hidden">
                {items.map((item) => (
                  <article key={item.member_id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900/60">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{item.full_name || '—'}</p>
                      {item.is_enabled ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Habilitado</span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Excluido</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Documento: {item.document_number || '—'}</p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Grado/Grupo: {item.grade || '—'} · {item.group || '—'}</p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Jornada: {item.shift || '—'}</p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Votación: {item.has_completed_vote ? 'Completó' : 'No completó'}</p>
                    <div className="mt-3">
                      {item.is_enabled ? (
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-10 w-full"
                          disabled={busyMemberId === item.member_id}
                          onClick={() => void onExclude(item)}
                        >
                          {busyMemberId === item.member_id ? 'Procesando...' : 'Excluir'}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 w-full"
                          disabled={busyMemberId === item.member_id}
                          onClick={() => void onInclude(item)}
                        >
                          {busyMemberId === item.member_id ? 'Procesando...' : 'Reincluir'}
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 md:block">
                <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-900/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Grado</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Grupo</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Estudiante</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Documento</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Jornada</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Estado</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Votación</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                    {items.map((item) => (
                      <tr key={item.member_id}>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.grade || '—'}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.group || '—'}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.full_name || '—'}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.document_number || '—'}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.shift || '—'}</td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                          {item.is_enabled ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              Habilitado
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                              Excluido
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                          {item.has_completed_vote ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              Votó
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              No votó
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {item.is_enabled ? (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={busyMemberId === item.member_id}
                              onClick={() => void onExclude(item)}
                            >
                              {busyMemberId === item.member_id ? 'Procesando...' : 'Excluir'}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              disabled={busyMemberId === item.member_id}
                              onClick={() => void onInclude(item)}
                            >
                              {busyMemberId === item.member_id ? 'Procesando...' : 'Reincluir'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Mostrando {items.length} de {totalCount} estudiantes · Página {currentPage} de {totalPages} · {pageSize} por página
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={currentPage <= 1 || loading}
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={currentPage >= totalPages || loading}
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

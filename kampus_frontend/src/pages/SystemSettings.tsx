import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../store/auth'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { systemApi, type BackupItem } from '../services/system'

export default function SystemSettings() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [backups, setBackups] = useState<BackupItem[]>([])

  const [creating, setCreating] = useState(false)
  const [includeMedia, setIncludeMedia] = useState(true)

  const [mode, setMode] = useState<'restore' | 'import'>('import')
  const [confirm, setConfirm] = useState(false)
  const [selectedFilename, setSelectedFilename] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null)

  const canRunDestructive = mode !== 'restore' || confirm

  const loadBackups = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await systemApi.listBackups()
      setBackups(res.data.results || [])
    } catch {
      setError('No se pudo cargar el historial de backups.')
      setBackups([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAdmin) return
    loadBackups()
  }, [isAdmin])

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const ts = d.getTime()
    if (!Number.isFinite(ts)) return iso
    return d.toLocaleString()
  }

  const formatSize = (bytes: number) => {
    if (!Number.isFinite(bytes)) return '—'
    if (bytes < 1024) return `${bytes} B`
    const kb = bytes / 1024
    if (kb < 1024) return `${kb.toFixed(1)} KB`
    const mb = kb / 1024
    if (mb < 1024) return `${mb.toFixed(1)} MB`
    const gb = mb / 1024
    return `${gb.toFixed(2)} GB`
  }

  const download = async (filename: string) => {
    try {
      const res = await systemApi.downloadBackup(filename)
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      setError('No se pudo descargar el backup.')
    }
  }

  const createBackup = async () => {
    setCreating(true)
    setError(null)
    try {
      await systemApi.createBackup({ include_media: includeMedia })
      await loadBackups()
    } catch {
      setError('No se pudo crear el backup.')
    } finally {
      setCreating(false)
    }
  }

  const restoreFromExisting = async () => {
    if (!selectedFilename) {
      setError('Selecciona un backup para continuar.')
      return
    }
    if (!canRunDestructive) {
      setError('Debes confirmar para restaurar (operación destructiva).')
      return
    }

    setRestoring(true)
    setError(null)
    setRestoreMessage(null)
    try {
      const res = await systemApi.restoreFromExisting({
        filename: selectedFilename,
        mode,
        confirm: confirm,
      })
      setRestoreMessage(`Proceso finalizado: ${res.data.detail}`)
      await loadBackups()
    } catch (e) {
      console.error(e)
      setError('No se pudo completar la operación.')
    } finally {
      setRestoring(false)
    }
  }

  const restoreFromUpload = async () => {
    if (!uploadFile) {
      setError('Selecciona un archivo para continuar.')
      return
    }
    if (!canRunDestructive) {
      setError('Debes confirmar para restaurar (operación destructiva).')
      return
    }

    setRestoring(true)
    setError(null)
    setRestoreMessage(null)
    try {
      const res = await systemApi.uploadAndRestore({
        file: uploadFile,
        mode,
        confirm: confirm,
      })
      setRestoreMessage(`Proceso finalizado: ${res.data.detail}`)
      await loadBackups()
    } catch (e) {
      console.error(e)
      setError('No se pudo completar la operación.')
    } finally {
      setRestoring(false)
    }
  }

  const backupOptions = useMemo(() => backups.map((b) => b.filename), [backups])

  if (!isAdmin) {
    return (
      <div className="p-3 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-slate-900 dark:text-slate-100">Sistema</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-slate-600 dark:text-slate-300">No tienes permisos para acceder a esta sección.</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Sistema</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">Backups, descargas y restauración/importación de data.</p>
      </div>

      {error ? (
        <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-sm dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>
      ) : null}

      {restoreMessage ? (
        <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200">
          {restoreMessage}
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-slate-900 dark:text-slate-100">Backup del sistema</CardTitle>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
            <label className="hidden items-center gap-2 text-sm text-slate-600 dark:text-slate-300 lg:flex">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:focus:ring-sky-400"
                checked={includeMedia}
                onChange={(e) => setIncludeMedia(e.target.checked)}
                disabled={creating}
              />
              Incluir media
            </label>
            <Button variant="outline" onClick={loadBackups} disabled={loading} className="min-h-11 w-full sm:w-auto">
              Actualizar
            </Button>
            <Button onClick={createBackup} disabled={creating} className="min-h-11 w-full sm:w-auto">
              {creating ? 'Creando…' : 'Crear backup'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-3 lg:hidden">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:focus:ring-sky-400"
                checked={includeMedia}
                onChange={(e) => setIncludeMedia(e.target.checked)}
                disabled={creating}
              />
              Incluir media
            </label>
          </div>
          {loading ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">Cargando historial…</div>
          ) : backups.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">No hay backups todavía.</div>
          ) : (
            <>
              <div className="hidden overflow-x-auto xl:block">
              <table className="w-full text-sm text-left">
                <thead className="border-b border-slate-200 bg-linear-to-r from-slate-50 to-slate-100 text-xs uppercase text-slate-500 dark:border-slate-700 dark:from-slate-900 dark:to-slate-800 dark:text-slate-300">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Archivo</th>
                    <th className="px-6 py-4 font-semibold">Fecha</th>
                    <th className="px-6 py-4 font-semibold text-right">Tamaño</th>
                    <th className="px-6 py-4 font-semibold text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {backups.map((b) => (
                    <tr key={b.filename} className="bg-white transition-colors hover:bg-slate-50/80 dark:bg-slate-900 dark:hover:bg-slate-800/70">
                      <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">{b.filename}</td>
                      <td className="px-6 py-4">{formatDate(b.created_at)}</td>
                      <td className="px-6 py-4 text-right">{formatSize(b.size_bytes)}</td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="outline" size="sm" className="min-h-10" onClick={() => download(b.filename)}>
                          Descargar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:hidden">
                {backups.map((b) => (
                  <Card key={b.filename} className="border-slate-200/90 dark:border-slate-700">
                    <CardContent className="p-4">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 break-all">{b.filename}</div>
                      <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">{formatDate(b.created_at)}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatSize(b.size_bytes)}</div>
                      <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                        <Button variant="outline" size="sm" className="min-h-11 w-full" onClick={() => download(b.filename)}>
                          Descargar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Restaurar / Importar data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500 dark:text-slate-400">Modo</span>
              <select
                className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={mode}
                onChange={(e) => {
                  const next = e.target.value === 'restore' ? 'restore' : 'import'
                  setMode(next)
                  setRestoreMessage(null)
                  if (next !== 'restore') setConfirm(false)
                }}
              >
                <option value="import">Importar (no borra data)</option>
                <option value="restore">Restaurar (borra y restaura)</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:focus:ring-sky-400"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
                disabled={mode !== 'restore'}
              />
              Confirmo restauración (operación destructiva)
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Desde un backup existente</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Selecciona un archivo del historial.</div>

              <div className="mt-3 flex flex-col gap-2">
                <select
                  className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={selectedFilename}
                  onChange={(e) => setSelectedFilename(e.target.value)}
                >
                  <option value="">Selecciona backup…</option>
                  {backupOptions.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>

                <Button
                  onClick={restoreFromExisting}
                  disabled={restoring || !selectedFilename || !canRunDestructive}
                  className="min-h-11"
                >
                  {restoring ? 'Procesando…' : mode === 'restore' ? 'Restaurar' : 'Importar'}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Subir archivo</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Acepta .json, .json.gz o .zip (bundle)</div>

              <div className="mt-3 flex flex-col gap-2">
                <input
                  type="file"
                  accept=".json,.gz,.json.gz,.zip"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="rounded-md border border-slate-200 p-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border file:border-slate-200 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:file:border-slate-700 dark:file:bg-slate-950 dark:file:text-slate-200 dark:hover:file:bg-slate-900"
                />

                <Button onClick={restoreFromUpload} disabled={restoring || !uploadFile || !canRunDestructive} className="min-h-11">
                  {restoring ? 'Procesando…' : mode === 'restore' ? 'Restaurar' : 'Importar'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

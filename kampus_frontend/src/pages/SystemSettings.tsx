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
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Sistema</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-slate-600">No tienes permisos para acceder a esta sección.</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Sistema</h2>
        <p className="text-sm text-slate-600">Backups, descargas y restauración/importación de data.</p>
      </div>

      {error ? (
        <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-sm">{error}</div>
      ) : null}

      {restoreMessage ? (
        <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm">
          {restoreMessage}
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Backup del sistema</CardTitle>
          <div className="flex items-center gap-2">
            <label className="hidden sm:flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={includeMedia}
                onChange={(e) => setIncludeMedia(e.target.checked)}
                disabled={creating}
              />
              Incluir media
            </label>
            <Button variant="outline" onClick={loadBackups} disabled={loading}>
              Actualizar
            </Button>
            <Button onClick={createBackup} disabled={creating}>
              {creating ? 'Creando…' : 'Crear backup'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="sm:hidden mb-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={includeMedia}
                onChange={(e) => setIncludeMedia(e.target.checked)}
                disabled={creating}
              />
              Incluir media
            </label>
          </div>
          {loading ? (
            <div className="text-sm text-slate-500">Cargando historial…</div>
          ) : backups.length === 0 ? (
            <div className="text-sm text-slate-500">No hay backups todavía.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Archivo</th>
                    <th className="px-6 py-4 font-semibold">Fecha</th>
                    <th className="px-6 py-4 font-semibold text-right">Tamaño</th>
                    <th className="px-6 py-4 font-semibold text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {backups.map((b) => (
                    <tr key={b.filename} className="bg-white hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">{b.filename}</td>
                      <td className="px-6 py-4">{formatDate(b.created_at)}</td>
                      <td className="px-6 py-4 text-right">{formatSize(b.size_bytes)}</td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="outline" size="sm" onClick={() => download(b.filename)}>
                          Descargar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Restaurar / Importar data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Modo</span>
              <select
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
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

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
                disabled={mode !== 'restore'}
              />
              Confirmo restauración (operación destructiva)
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-900">Desde un backup existente</div>
              <div className="text-xs text-slate-500 mt-1">Selecciona un archivo del historial.</div>

              <div className="mt-3 flex flex-col gap-2">
                <select
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
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
                >
                  {restoring ? 'Procesando…' : mode === 'restore' ? 'Restaurar' : 'Importar'}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-900">Subir archivo</div>
              <div className="text-xs text-slate-500 mt-1">Acepta .json, .json.gz o .zip (bundle)</div>

              <div className="mt-3 flex flex-col gap-2">
                <input
                  type="file"
                  accept=".json,.gz,.json.gz,.zip"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                />

                <Button onClick={restoreFromUpload} disabled={restoring || !uploadFile || !canRunDestructive}>
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

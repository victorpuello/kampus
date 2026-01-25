import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Label } from '../../components/ui/Label'
import { Toast, type ToastType } from '../../components/ui/Toast'
import { useAuthStore } from '../../store/auth'
import { disciplineApi, type ConvivenciaManual } from '../../services/discipline'

const getErrorDetail = (err: unknown): string | undefined => {
  if (typeof err !== 'object' || err === null) return undefined
  const maybe = err as { response?: { data?: { detail?: unknown } } }
  const detail = maybe.response?.data?.detail
  return typeof detail === 'string' ? detail : undefined
}

const formatDateTime = (iso?: string | null) => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function DisciplineManualConfig() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN'

  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [manuals, setManuals] = useState<ConvivenciaManual[]>([])
  const active = useMemo(() => manuals.find((m) => m.is_active) || null, [manuals])

  const [title, setTitle] = useState('Manual de Convivencia')
  const [version, setVersion] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [manualText, setManualText] = useState('')

  const [toast, setToast] = useState<{ message: string; type: ToastType; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, isVisible: true })
  }

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await disciplineApi.listManuals()
      setManuals(res.data)
    } catch (e: unknown) {
      console.error(e)
      setError(getErrorDetail(e) || 'No se pudo cargar el historial de manuales')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleUpload = async () => {
    if (!isAdmin) return
    if (!file && !manualText.trim()) return

    setBusy(true)
    setError(null)
    try {
      await disciplineApi.uploadManual({
        file: file || undefined,
        text: file ? undefined : manualText.trim() || undefined,
        title: title.trim() || undefined,
        version: version.trim() || undefined,
        activate: true,
      })
      setFile(null)
      setManualText('')
      showToast('Manual cargado y activado.', 'success')
      await load()
    } catch (e: unknown) {
      console.error(e)
      setError(getErrorDetail(e) || 'Error cargando el manual')
    } finally {
      setBusy(false)
    }
  }

  const handleActivate = async (id: number) => {
    if (!isAdmin) return
    setBusy(true)
    setError(null)
    try {
      await disciplineApi.activateManual(id)
      showToast('Manual activado.', 'success')
      await load()
    } catch (e: unknown) {
      console.error(e)
      setError(getErrorDetail(e) || 'Error activando el manual')
    } finally {
      setBusy(false)
    }
  }

  const handleProcess = async (id: number) => {
    if (!isAdmin) return
    setBusy(true)
    setError(null)
    try {
      await disciplineApi.processManual(id)
      showToast('Procesamiento iniciado.', 'success')
      await load()
    } catch (e: unknown) {
      console.error(e)
      setError(getErrorDetail(e) || 'Error procesando el manual')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast({ ...toast, isVisible: false })}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-t-4 border-t-emerald-500 shadow-sm">
          <CardHeader className="bg-slate-50/50 border-b pb-3 dark:bg-slate-900/50 dark:border-slate-800">
            <CardTitle className="text-emerald-800 flex items-center gap-2">📘 Manual activo</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {loading ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">Cargando…</div>
            ) : active ? (
              <div className="text-sm text-slate-700 dark:text-slate-200 space-y-1">
                <div>
                  <span className="font-semibold">Título:</span> {active.title || '—'}
                </div>
                <div>
                  <span className="font-semibold">Versión:</span> {active.version || '—'}
                </div>
                <div>
                  <span className="font-semibold">Estado extracción:</span> {active.extraction_status}
                </div>
                {active.extraction_status === 'FAILED' && active.extraction_error ? (
                  <div className="text-xs text-rose-600 dark:text-rose-300">{active.extraction_error}</div>
                ) : null}
                <div>
                  <span className="font-semibold">Cargado:</span> {formatDateTime(active.uploaded_at)}
                </div>
                <div>
                  <span className="font-semibold">Extraído:</span> {formatDateTime(active.extracted_at)}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500 dark:text-slate-400">No hay manual activo.</div>
            )}

            <div className="text-xs text-slate-500 dark:text-slate-400">
              Recomendación: si quieres citas más limpias y verificables, usa Markdown (.md). PDF funciona, pero la extracción puede traer saltos de línea/ruido.
            </div>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-blue-500 shadow-sm">
          <CardHeader className="bg-slate-50/50 border-b pb-3 dark:bg-slate-900/50 dark:border-slate-800">
            <CardTitle className="text-blue-800 flex items-center gap-2">⬆️ Subir nueva versión</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {!isAdmin ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">Solo ADMIN/SUPERADMIN puede subir o activar manuales.</div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:items-end">
                  <div className="space-y-1">
                    <Label>Título</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
                  </div>
                  <div className="space-y-1">
                    <Label>Versión</Label>
                    <Input value={version} onChange={(e) => setVersion(e.target.value)} disabled={busy} placeholder="Ej: 2026.1" />
                  </div>
                  <div className="space-y-1">
                    <Label>Archivo</Label>
                    <Input
                      type="file"
                      accept="application/pdf,.pdf,text/markdown,.md,text/plain,.txt"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      disabled={busy}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>O pegar contenido (Markdown/TXT)</Label>
                  <textarea
                    className="w-full min-h-32 border border-slate-200 rounded-md bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    placeholder="Pega aquí el manual (ideal en Markdown para citas más limpias)."
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    disabled={busy}
                  />
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Si seleccionas archivo, el texto se ignora (y viceversa).
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleUpload} disabled={busy || (!file && !manualText.trim())}>
                    {busy ? 'Subiendo…' : 'Subir y activar'}
                  </Button>
                </div>
              </>
            )}

            {error ? <div className="text-sm text-rose-600 dark:text-rose-300">{error}</div> : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historial de versiones</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">Cargando…</div>
          ) : manuals.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">Aún no hay manuales cargados.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-700 dark:text-slate-200">
                <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-linear-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3 font-semibold">ID</th>
                    <th className="px-4 py-3 font-semibold">Título</th>
                    <th className="px-4 py-3 font-semibold">Versión</th>
                    <th className="px-4 py-3 font-semibold">Activo</th>
                    <th className="px-4 py-3 font-semibold">Extracción</th>
                    <th className="px-4 py-3 font-semibold">Cargado</th>
                    <th className="px-4 py-3 font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {manuals.map((m) => (
                    <tr key={m.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-3">{m.id}</td>
                      <td className="px-4 py-3">{m.title || '—'}</td>
                      <td className="px-4 py-3">{m.version || '—'}</td>
                      <td className="px-4 py-3">{m.is_active ? 'Sí' : 'No'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span>{m.extraction_status}</span>
                          {m.extraction_status === 'FAILED' && m.extraction_error ? (
                            <span className="text-xs text-rose-600 dark:text-rose-300">{m.extraction_error}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">{formatDateTime(m.uploaded_at)}</td>
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleActivate(m.id)}
                              disabled={busy || m.is_active}
                            >
                              Activar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleProcess(m.id)}
                              disabled={busy}
                            >
                              Procesar
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">—</span>
                        )}
                      </td>
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

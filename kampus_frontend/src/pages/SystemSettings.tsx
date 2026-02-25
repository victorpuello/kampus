import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../store/auth'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { systemApi, type BackupItem, type MailgunSettingsAuditItem, type MailgunSettingsPayload } from '../services/system'

type SystemTab = 'mailgun' | 'audits' | 'backups' | 'restore'

const SYSTEM_TABS: SystemTab[] = ['mailgun', 'audits', 'backups', 'restore']

const SYSTEM_TAB_META: Record<SystemTab, { title: string; description: string }> = {
  mailgun: {
    title: 'Configuración de correo',
    description: 'Configura Mailgun y valida el envío de notificaciones por email.',
  },
  audits: {
    title: 'Auditoría de cambios',
    description: 'Consulta el historial de cambios de configuración y exporta evidencia CSV.',
  },
  backups: {
    title: 'Backups del sistema',
    description: 'Administra generación, descarga y revisión de copias de respaldo.',
  },
  restore: {
    title: 'Restauración e importación',
    description: 'Restaura o importa información desde backups existentes o archivos subidos.',
  },
}

const resolveTabFromHash = (hash: string): SystemTab => {
  const clean = String(hash || '').replace('#', '').trim().toLowerCase()
  return SYSTEM_TABS.includes(clean as SystemTab) ? (clean as SystemTab) : 'mailgun'
}

export default function SystemSettings() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN'
  const [activeTab, setActiveTab] = useState<SystemTab>(() => {
    if (typeof window === 'undefined') return 'mailgun'
    return resolveTabFromHash(window.location.hash)
  })

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

  const [mailgunLoading, setMailgunLoading] = useState(false)
  const [mailgunSaving, setMailgunSaving] = useState(false)
  const [mailgunTesting, setMailgunTesting] = useState(false)
  const [mailgunMessage, setMailgunMessage] = useState<string | null>(null)
  const [mailgunError, setMailgunError] = useState<string | null>(null)
  const [testEmail, setTestEmail] = useState('')
  const [mailgunForm, setMailgunForm] = useState<MailgunSettingsPayload>({
    kampus_email_backend: 'console',
    default_from_email: '',
    server_email: '',
    mailgun_sender_domain: '',
    mailgun_api_url: '',
    mailgun_webhook_strict: false,
    mailgun_api_key: '',
    mailgun_webhook_signing_key: '',
  })
  const [mailgunApiKeyMasked, setMailgunApiKeyMasked] = useState('')
  const [mailgunWebhookMasked, setMailgunWebhookMasked] = useState('')
  const [mailgunApiKeyConfigured, setMailgunApiKeyConfigured] = useState(false)
  const [mailgunWebhookConfigured, setMailgunWebhookConfigured] = useState(false)
  const [mailgunAudits, setMailgunAudits] = useState<MailgunSettingsAuditItem[]>([])
  const [mailgunAuditsLoading, setMailgunAuditsLoading] = useState(false)
  const [mailgunAuditsExporting, setMailgunAuditsExporting] = useState(false)
  const [mailgunAuditsLimit] = useState(10)
  const [mailgunAuditsOffset, setMailgunAuditsOffset] = useState(0)
  const [mailgunAuditsTotal, setMailgunAuditsTotal] = useState(0)

  const canRunDestructive = mode !== 'restore' || confirm

  const loadBackups = useCallback(async () => {
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
  }, [])

  const loadMailgunSettings = useCallback(async () => {
    setMailgunLoading(true)
    setMailgunError(null)
    try {
      const res = await systemApi.getMailgunSettings()
      const data = res.data
      setMailgunForm({
        kampus_email_backend: data.kampus_email_backend,
        default_from_email: data.default_from_email,
        server_email: data.server_email,
        mailgun_sender_domain: data.mailgun_sender_domain,
        mailgun_api_url: data.mailgun_api_url,
        mailgun_webhook_strict: data.mailgun_webhook_strict,
        mailgun_api_key: '',
        mailgun_webhook_signing_key: '',
      })
      setMailgunApiKeyMasked(data.mailgun_api_key_masked)
      setMailgunWebhookMasked(data.mailgun_webhook_signing_key_masked)
      setMailgunApiKeyConfigured(data.mailgun_api_key_configured)
      setMailgunWebhookConfigured(data.mailgun_webhook_signing_key_configured)
    } catch {
      setMailgunError('No se pudo cargar la configuración de Mailgun.')
    } finally {
      setMailgunLoading(false)
    }
  }, [])

  const loadMailgunAudits = useCallback(async (offset = 0) => {
    setMailgunAuditsLoading(true)
    try {
      const res = await systemApi.getMailgunSettingsAudits(mailgunAuditsLimit, offset)
      setMailgunAudits(res.data.results || [])
      setMailgunAuditsOffset(res.data.offset || 0)
      setMailgunAuditsTotal(res.data.total || 0)
    } catch {
      setMailgunAudits([])
      setMailgunAuditsTotal(0)
    } finally {
      setMailgunAuditsLoading(false)
    }
  }, [mailgunAuditsLimit])

  useEffect(() => {
    if (!isAdmin) return
    loadBackups()
    loadMailgunSettings()
    loadMailgunAudits(0)
  }, [isAdmin, loadBackups, loadMailgunSettings, loadMailgunAudits])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const nextHash = `#${activeTab}`
    if (window.location.hash !== nextHash) {
      const path = `${window.location.pathname}${window.location.search}${nextHash}`
      window.history.replaceState(null, '', path)
    }
  }, [activeTab])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const syncFromHash = () => {
      const hashTab = resolveTabFromHash(window.location.hash)
      setActiveTab((prev) => (prev === hashTab ? prev : hashTab))
    }

    window.addEventListener('hashchange', syncFromHash)
    return () => {
      window.removeEventListener('hashchange', syncFromHash)
    }
  }, [])

  const saveMailgunSettings = async () => {
    setMailgunSaving(true)
    setMailgunError(null)
    setMailgunMessage(null)
    try {
      const res = await systemApi.updateMailgunSettings(mailgunForm)
      const data = res.data
      setMailgunApiKeyMasked(data.mailgun_api_key_masked)
      setMailgunWebhookMasked(data.mailgun_webhook_signing_key_masked)
      setMailgunApiKeyConfigured(data.mailgun_api_key_configured)
      setMailgunWebhookConfigured(data.mailgun_webhook_signing_key_configured)
      setMailgunForm((prev) => ({
        ...prev,
        mailgun_api_key: '',
        mailgun_webhook_signing_key: '',
      }))
      await loadMailgunAudits(0)
      setMailgunMessage('Configuración de correo guardada correctamente.')
    } catch {
      setMailgunError('No se pudo guardar la configuración de Mailgun.')
    } finally {
      setMailgunSaving(false)
    }
  }

  const sendMailgunTestEmail = async () => {
    if (!testEmail.trim()) {
      setMailgunError('Ingresa un correo de prueba válido.')
      return
    }

    setMailgunTesting(true)
    setMailgunError(null)
    setMailgunMessage(null)
    try {
      const res = await systemApi.sendMailgunTestEmail(testEmail.trim())
      setMailgunMessage(res.data.detail || 'Correo de prueba enviado correctamente.')
    } catch {
      setMailgunError('No se pudo enviar el correo de prueba.')
    } finally {
      setMailgunTesting(false)
    }
  }

  const exportMailgunAuditsCsv = async () => {
    setMailgunAuditsExporting(true)
    try {
      const res = await systemApi.exportMailgunSettingsAuditsCsv()
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'mailgun_audits.csv')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      setMailgunError('No se pudo exportar el historial CSV.')
    } finally {
      setMailgunAuditsExporting(false)
    }
  }

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
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{SYSTEM_TAB_META[activeTab].title}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">{SYSTEM_TAB_META[activeTab].description}</p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
        <Button
          variant={activeTab === 'mailgun' ? 'default' : 'outline'}
          size="sm"
          className="min-h-10"
          onClick={() => setActiveTab('mailgun')}
        >
          Mailgun
        </Button>
        <Button
          variant={activeTab === 'audits' ? 'default' : 'outline'}
          size="sm"
          className="min-h-10"
          onClick={() => setActiveTab('audits')}
        >
          Auditoría
        </Button>
        <Button
          variant={activeTab === 'backups' ? 'default' : 'outline'}
          size="sm"
          className="min-h-10"
          onClick={() => setActiveTab('backups')}
        >
          Backups
        </Button>
        <Button
          variant={activeTab === 'restore' ? 'default' : 'outline'}
          size="sm"
          className="min-h-10"
          onClick={() => setActiveTab('restore')}
        >
          Restauración
        </Button>
      </div>

      {error ? (
        <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-sm dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>
      ) : null}

      {restoreMessage ? (
        <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200">
          {restoreMessage}
        </div>
      ) : null}

      {activeTab === 'mailgun' ? (
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-slate-900 dark:text-slate-100">Configuración de Mailgun</CardTitle>
          <div className="text-xs text-slate-500 dark:text-slate-400">Solo ADMIN / SUPERADMIN</div>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              saveMailgunSettings()
            }}
          >
          {mailgunError ? (
            <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-sm dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
              {mailgunError}
            </div>
          ) : null}

          {mailgunMessage ? (
            <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200">
              {mailgunMessage}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
              Backend de correo
              <select
                className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={mailgunForm.kampus_email_backend}
                onChange={(e) =>
                  setMailgunForm((prev) => ({
                    ...prev,
                    kampus_email_backend: e.target.value === 'mailgun' ? 'mailgun' : 'console',
                  }))
                }
                disabled={mailgunLoading || mailgunSaving}
              >
                <option value="console">console</option>
                <option value="mailgun">mailgun</option>
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
              Default from email
              <input
                type="email"
                className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={mailgunForm.default_from_email}
                onChange={(e) => setMailgunForm((prev) => ({ ...prev, default_from_email: e.target.value }))}
                disabled={mailgunLoading || mailgunSaving}
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
              Server email
              <input
                type="email"
                className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={mailgunForm.server_email}
                onChange={(e) => setMailgunForm((prev) => ({ ...prev, server_email: e.target.value }))}
                disabled={mailgunLoading || mailgunSaving}
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
              Mailgun sender domain
              <input
                type="text"
                className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={mailgunForm.mailgun_sender_domain}
                onChange={(e) => setMailgunForm((prev) => ({ ...prev, mailgun_sender_domain: e.target.value }))}
                disabled={mailgunLoading || mailgunSaving}
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
              Mailgun API URL (opcional)
              <input
                type="url"
                className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                placeholder="https://api.mailgun.net"
                value={mailgunForm.mailgun_api_url}
                onChange={(e) => setMailgunForm((prev) => ({ ...prev, mailgun_api_url: e.target.value }))}
                disabled={mailgunLoading || mailgunSaving}
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
              Mailgun API Key {mailgunApiKeyConfigured ? '(configurada)' : '(no configurada)'}
              <input
                type="password"
                className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                placeholder={mailgunApiKeyMasked || 'Ingresa nueva API key'}
                value={mailgunForm.mailgun_api_key || ''}
                onChange={(e) => setMailgunForm((prev) => ({ ...prev, mailgun_api_key: e.target.value }))}
                disabled={mailgunLoading || mailgunSaving}
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
              Webhook Signing Key {mailgunWebhookConfigured ? '(configurada)' : '(no configurada)'}
              <input
                type="password"
                className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                placeholder={mailgunWebhookMasked || 'Ingresa nueva signing key'}
                value={mailgunForm.mailgun_webhook_signing_key || ''}
                onChange={(e) => setMailgunForm((prev) => ({ ...prev, mailgun_webhook_signing_key: e.target.value }))}
                disabled={mailgunLoading || mailgunSaving}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:focus:ring-sky-400"
              checked={mailgunForm.mailgun_webhook_strict}
              onChange={(e) => setMailgunForm((prev) => ({ ...prev, mailgun_webhook_strict: e.target.checked }))}
              disabled={mailgunLoading || mailgunSaving}
            />
            Validación estricta de firma webhook
          </label>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row">
              <input
                type="email"
                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                placeholder="correo@destino.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                disabled={mailgunTesting || mailgunSaving}
              />
              <Button type="button" variant="outline" onClick={sendMailgunTestEmail} disabled={mailgunTesting || mailgunSaving} className="min-h-11">
                {mailgunTesting ? 'Probando…' : 'Enviar prueba'}
              </Button>
            </div>

            <Button type="submit" disabled={mailgunLoading || mailgunSaving} className="min-h-11 sm:ml-3">
              {mailgunSaving ? 'Guardando…' : 'Guardar configuración'}
            </Button>
          </div>
          </form>
        </CardContent>
      </Card>
      ) : null}

      {activeTab === 'audits' ? (
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-slate-900 dark:text-slate-100">Historial de cambios Mailgun</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="min-h-10"
              onClick={exportMailgunAuditsCsv}
              disabled={mailgunAuditsExporting}
            >
              {mailgunAuditsExporting ? 'Exportando…' : 'Exportar CSV'}
            </Button>
            <Button variant="outline" size="sm" className="min-h-10" onClick={() => loadMailgunAudits(mailgunAuditsOffset)}>
              Actualizar historial
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {mailgunAuditsLoading ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">Cargando historial de auditoría…</div>
          ) : mailgunAudits.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">No hay registros de auditoría todavía.</div>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="border-b border-slate-200 bg-linear-to-r from-slate-50 to-slate-100 text-xs uppercase text-slate-500 dark:border-slate-700 dark:from-slate-900 dark:to-slate-800 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Fecha</th>
                      <th className="px-4 py-3 font-semibold">Usuario</th>
                      <th className="px-4 py-3 font-semibold">Cambios</th>
                      <th className="px-4 py-3 font-semibold">Secretos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    {mailgunAudits.map((audit) => (
                      <tr key={audit.id} className="bg-white transition-colors hover:bg-slate-50/80 dark:bg-slate-900 dark:hover:bg-slate-800/70">
                        <td className="px-4 py-3">{formatDate(audit.created_at)}</td>
                        <td className="px-4 py-3">{audit.updated_by?.username || 'Sistema'}</td>
                        <td className="px-4 py-3">{audit.changed_fields.length ? audit.changed_fields.join(', ') : 'Sin cambios detectados'}</td>
                        <td className="px-4 py-3">
                          {audit.rotated_api_key || audit.rotated_webhook_signing_key
                            ? [
                                audit.rotated_api_key ? 'API key' : null,
                                audit.rotated_webhook_signing_key ? 'Signing key' : null,
                              ]
                                .filter(Boolean)
                                .join(' + ')
                            : 'Sin rotación'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-2 text-xs text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  Mostrando {mailgunAuditsTotal === 0 ? 0 : mailgunAuditsOffset + 1}–
                  {Math.min(mailgunAuditsOffset + mailgunAudits.length, mailgunAuditsTotal)} de {mailgunAuditsTotal}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-9"
                    disabled={mailgunAuditsOffset <= 0 || mailgunAuditsLoading}
                    onClick={() => loadMailgunAudits(Math.max(0, mailgunAuditsOffset - mailgunAuditsLimit))}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-9"
                    disabled={mailgunAuditsOffset + mailgunAudits.length >= mailgunAuditsTotal || mailgunAuditsLoading}
                    onClick={() => loadMailgunAudits(mailgunAuditsOffset + mailgunAuditsLimit)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      ) : null}

      {activeTab === 'backups' ? (
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
      ) : null}

      {activeTab === 'restore' ? (
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
      ) : null}
    </div>
  )
}

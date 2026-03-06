import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../store/auth'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { ConfirmationModal } from '../components/ui/ConfirmationModal'
import { EmailTemplateSettingsCard } from '../components/system/EmailTemplateSettingsCard'
import {
  systemApi,
  type BackupItem,
  type MailgunSettingsAuditItem,
  type MailgunSettingsPayload,
  type MailSettingsEnvironment,
  type WhatsAppHealthResponse,
  type WhatsAppSettingsPayload,
  type WhatsAppSettingsResponse,
  type WhatsAppTemplateMapItem,
  type WhatsAppTemplateMapPayload,
} from '../services/system'

type SystemTab = 'mailgun' | 'whatsapp' | 'templates' | 'audits' | 'backups' | 'restore'

const MAIL_SETTINGS_ENV_OPTIONS: { value: MailSettingsEnvironment; label: string; hint: string }[] = [
  { value: 'development', label: 'Desarrollo', hint: 'Pruebas locales y staging' },
  { value: 'production', label: 'Producción', hint: 'Configuración real de envío' },
]

const SYSTEM_TABS: SystemTab[] = ['mailgun', 'whatsapp', 'templates', 'audits', 'backups', 'restore']
const WHATSAPP_PANEL_STORAGE_KEY = 'system.whatsapp.panels'

type WhatsAppPanelState = {
  advanced: boolean
  templateMap: boolean
  health: boolean
}

const SYSTEM_TAB_META: Record<SystemTab, { title: string; description: string }> = {
  mailgun: {
    title: 'Configuración de correo',
    description: 'Configura Mailgun y valida el envío de notificaciones por email.',
  },
  whatsapp: {
    title: 'Canal WhatsApp',
    description: 'Gestiona mapeos de plantillas y monitorea salud operativa del canal.',
  },
  templates: {
    title: 'Plantillas de correo',
    description: 'Administra diseño, contenido y previsualización de plantillas transaccionales y marketing.',
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

const getRequestErrorMessage = (error: unknown, fallback: string): string => {
  const responseData = (error as { response?: { data?: unknown } } | undefined)?.response?.data
  if (typeof responseData === 'string' && responseData.trim()) return responseData

  if (responseData && typeof responseData === 'object') {
    const detail = (responseData as Record<string, unknown>).detail
    const backendError = (responseData as Record<string, unknown>).error
    if (typeof backendError === 'string' && backendError.trim()) return backendError
    if (typeof detail === 'string' && detail.trim()) return detail
  }

  return fallback
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
  const [backupMessage, setBackupMessage] = useState<string | null>(null)
  const [backups, setBackups] = useState<BackupItem[]>([])

  const [creating, setCreating] = useState(false)
  const [deletingFilename, setDeletingFilename] = useState<string | null>(null)
  const [deleteConfirmFilename, setDeleteConfirmFilename] = useState<string | null>(null)
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
  const [mailSettingsEnvironment, setMailSettingsEnvironment] = useState<MailSettingsEnvironment>('development')

  const [whatsAppLoading, setWhatsAppLoading] = useState(false)
  const [whatsAppSaving, setWhatsAppSaving] = useState(false)
  const [whatsAppMessage, setWhatsAppMessage] = useState<string | null>(null)
  const [whatsAppError, setWhatsAppError] = useState<string | null>(null)
  const [whatsAppTemplateMaps, setWhatsAppTemplateMaps] = useState<WhatsAppTemplateMapItem[]>([])
  const [whatsAppHealth, setWhatsAppHealth] = useState<WhatsAppHealthResponse | null>(null)
  const [whatsAppHours, setWhatsAppHours] = useState(24)
  const [whatsAppSettings, setWhatsAppSettings] = useState<WhatsAppSettingsPayload>({
    enabled: false,
    provider: 'meta_cloud_api',
    graph_base_url: 'https://graph.facebook.com',
    api_version: 'v21.0',
    phone_number_id: '',
    access_token: '',
    app_secret: '',
    webhook_verify_token: '',
    webhook_strict: true,
    http_timeout_seconds: 12,
    send_mode: 'template',
    template_fallback_name: '',
  })
  const [whatsAppAccessTokenMasked, setWhatsAppAccessTokenMasked] = useState('')
  const [whatsAppAppSecretMasked, setWhatsAppAppSecretMasked] = useState('')
  const [whatsAppVerifyTokenMasked, setWhatsAppVerifyTokenMasked] = useState('')
  const [whatsAppAccessConfigured, setWhatsAppAccessConfigured] = useState(false)
  const [whatsAppAppSecretConfigured, setWhatsAppAppSecretConfigured] = useState(false)
  const [whatsAppVerifyConfigured, setWhatsAppVerifyConfigured] = useState(false)
  const [whatsAppForm, setWhatsAppForm] = useState<WhatsAppTemplateMapPayload>({
    notification_type: '',
    template_name: '',
    language_code: 'es_CO',
    body_parameter_names: ['recipient_name', 'title', 'body', 'action_url'],
    default_components: [],
    category: 'utility',
    is_active: true,
  })
  const [whatsAppBodyParametersRaw, setWhatsAppBodyParametersRaw] = useState('recipient_name,title,body,action_url')
  const [whatsAppDefaultComponentsRaw, setWhatsAppDefaultComponentsRaw] = useState('')
  const [whatsAppTesting, setWhatsAppTesting] = useState(false)
  const [whatsAppTestPhone, setWhatsAppTestPhone] = useState('')
  const [whatsAppTestMessage, setWhatsAppTestMessage] = useState('Prueba de WhatsApp desde Kampus.')
  const [whatsAppTestStatus, setWhatsAppTestStatus] = useState<string | null>(null)
  const [whatsAppTestError, setWhatsAppTestError] = useState<string | null>(null)
  const [whatsAppPanels, setWhatsAppPanels] = useState<WhatsAppPanelState>(() => {
    if (typeof window === 'undefined') {
      return { advanced: false, templateMap: false, health: false }
    }
    try {
      const raw = window.localStorage.getItem(WHATSAPP_PANEL_STORAGE_KEY)
      if (!raw) return { advanced: false, templateMap: false, health: false }
      const parsed = JSON.parse(raw) as Partial<WhatsAppPanelState>
      return {
        advanced: Boolean(parsed.advanced),
        templateMap: Boolean(parsed.templateMap),
        health: Boolean(parsed.health),
      }
    } catch {
      return { advanced: false, templateMap: false, health: false }
    }
  })

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

  const loadMailgunSettings = useCallback(async (environment: MailSettingsEnvironment) => {
    setMailgunLoading(true)
    setMailgunError(null)
    try {
      const res = await systemApi.getMailgunSettings(environment)
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
        environment,
      })
      setMailgunApiKeyMasked(data.mailgun_api_key_masked)
      setMailgunWebhookMasked(data.mailgun_webhook_signing_key_masked)
      setMailgunApiKeyConfigured(data.mailgun_api_key_configured)
      setMailgunWebhookConfigured(data.mailgun_webhook_signing_key_configured)
    } catch (error) {
      setMailgunError(getRequestErrorMessage(error, 'No se pudo cargar la configuración de Mailgun.'))
    } finally {
      setMailgunLoading(false)
    }
  }, [])

  const loadMailgunAudits = useCallback(async (environment: MailSettingsEnvironment, offset = 0) => {
    setMailgunAuditsLoading(true)
    try {
      const res = await systemApi.getMailgunSettingsAudits(environment, mailgunAuditsLimit, offset)
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

  const loadWhatsAppData = useCallback(async (hours = whatsAppHours) => {
    setWhatsAppLoading(true)
    setWhatsAppError(null)
    try {
      const [mapsResponse, healthResponse, settingsResponse] = await Promise.all([
        systemApi.listWhatsAppTemplateMaps(),
        systemApi.getWhatsAppHealth(hours),
        systemApi.getWhatsAppSettings(mailSettingsEnvironment),
      ])
      setWhatsAppTemplateMaps(mapsResponse.data.results || [])
      setWhatsAppHealth(healthResponse.data)

      const settingsData: WhatsAppSettingsResponse = settingsResponse.data
      setWhatsAppSettings({
        enabled: settingsData.enabled,
        provider: settingsData.provider,
        graph_base_url: settingsData.graph_base_url,
        api_version: settingsData.api_version,
        phone_number_id: settingsData.phone_number_id,
        access_token: '',
        app_secret: '',
        webhook_verify_token: '',
        webhook_strict: settingsData.webhook_strict,
        http_timeout_seconds: settingsData.http_timeout_seconds,
        send_mode: settingsData.send_mode,
        template_fallback_name: settingsData.template_fallback_name,
      })
      setWhatsAppAccessTokenMasked(settingsData.access_token_masked)
      setWhatsAppAppSecretMasked(settingsData.app_secret_masked)
      setWhatsAppVerifyTokenMasked(settingsData.webhook_verify_token_masked)
      setWhatsAppAccessConfigured(settingsData.access_token_configured)
      setWhatsAppAppSecretConfigured(settingsData.app_secret_configured)
      setWhatsAppVerifyConfigured(settingsData.webhook_verify_token_configured)
    } catch (error) {
      setWhatsAppError(getRequestErrorMessage(error, 'No se pudo cargar la configuración de WhatsApp.'))
      setWhatsAppTemplateMaps([])
      setWhatsAppHealth(null)
    } finally {
      setWhatsAppLoading(false)
    }
  }, [mailSettingsEnvironment, whatsAppHours])

  const saveWhatsAppSettings = async () => {
    setWhatsAppSaving(true)
    setWhatsAppError(null)
    setWhatsAppMessage(null)
    try {
      const response = await systemApi.updateWhatsAppSettings(whatsAppSettings, mailSettingsEnvironment)
      const settingsData = response.data
      setWhatsAppAccessTokenMasked(settingsData.access_token_masked)
      setWhatsAppAppSecretMasked(settingsData.app_secret_masked)
      setWhatsAppVerifyTokenMasked(settingsData.webhook_verify_token_masked)
      setWhatsAppAccessConfigured(settingsData.access_token_configured)
      setWhatsAppAppSecretConfigured(settingsData.app_secret_configured)
      setWhatsAppVerifyConfigured(settingsData.webhook_verify_token_configured)
      setWhatsAppSettings((prev) => ({
        ...prev,
        access_token: '',
        app_secret: '',
        webhook_verify_token: '',
      }))
      setWhatsAppMessage('Configuración de canal WhatsApp guardada correctamente.')
      await loadWhatsAppData()
    } catch (error) {
      setWhatsAppError(getRequestErrorMessage(error, 'No se pudo guardar la configuración de WhatsApp.'))
    } finally {
      setWhatsAppSaving(false)
    }
  }

  const saveWhatsAppTemplateMap = async () => {
    setWhatsAppSaving(true)
    setWhatsAppError(null)
    setWhatsAppMessage(null)
    try {
      const bodyParameterNames = whatsAppBodyParametersRaw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)

      let defaultComponents: Array<Record<string, unknown>> = []
      if (whatsAppDefaultComponentsRaw.trim()) {
        const parsed = JSON.parse(whatsAppDefaultComponentsRaw)
        if (!Array.isArray(parsed)) throw new Error('default_components debe ser un JSON array.')
        defaultComponents = parsed as Array<Record<string, unknown>>
      }

      await systemApi.upsertWhatsAppTemplateMap({
        ...whatsAppForm,
        notification_type: whatsAppForm.notification_type.trim().toUpperCase(),
        body_parameter_names: bodyParameterNames,
        default_components: defaultComponents,
      })

      setWhatsAppMessage('Mapeo de plantilla WhatsApp guardado correctamente.')
      setWhatsAppForm((prev) => ({ ...prev, notification_type: '', template_name: '' }))
      await loadWhatsAppData()
    } catch (error) {
      setWhatsAppError(getRequestErrorMessage(error, 'No se pudo guardar el mapeo WhatsApp.'))
    } finally {
      setWhatsAppSaving(false)
    }
  }

  const removeWhatsAppTemplateMap = async (mapId: number) => {
    setWhatsAppSaving(true)
    setWhatsAppError(null)
    setWhatsAppMessage(null)
    try {
      await systemApi.deleteWhatsAppTemplateMap(mapId)
      setWhatsAppMessage('Mapeo eliminado correctamente.')
      await loadWhatsAppData()
    } catch (error) {
      setWhatsAppError(getRequestErrorMessage(error, 'No se pudo eliminar el mapeo WhatsApp.'))
    } finally {
      setWhatsAppSaving(false)
    }
  }

  const sendWhatsAppTestMessage = async () => {
    if (!whatsAppTestPhone.trim()) {
      setWhatsAppTestError('Ingresa un numero de WhatsApp en formato internacional (ej: +573001112233).')
      return
    }

    setWhatsAppTesting(true)
    setWhatsAppTestError(null)
    setWhatsAppTestStatus(null)
    try {
      const res = await systemApi.sendWhatsAppTestMessage(
        whatsAppTestPhone.trim(),
        whatsAppTestMessage.trim() || 'Prueba de WhatsApp desde Kampus.',
        mailSettingsEnvironment,
      )
      setWhatsAppTestStatus(res.data.detail || 'Mensaje de prueba enviado correctamente.')
    } catch (error) {
      setWhatsAppTestError(getRequestErrorMessage(error, 'No se pudo enviar el mensaje de prueba.'))
    } finally {
      setWhatsAppTesting(false)
    }
  }

  useEffect(() => {
    if (!isAdmin) return
    loadBackups()
    loadMailgunSettings(mailSettingsEnvironment)
    loadMailgunAudits(mailSettingsEnvironment, 0)
    loadWhatsAppData()
  }, [isAdmin, loadBackups, loadMailgunSettings, loadMailgunAudits, loadWhatsAppData, mailSettingsEnvironment])

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

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(WHATSAPP_PANEL_STORAGE_KEY, JSON.stringify(whatsAppPanels))
  }, [whatsAppPanels])

  const saveMailgunSettings = async () => {
    setMailgunSaving(true)
    setMailgunError(null)
    setMailgunMessage(null)
    try {
      const res = await systemApi.updateMailgunSettings(mailgunForm, mailSettingsEnvironment)
      const data = res.data
      setMailgunApiKeyMasked(data.mailgun_api_key_masked)
      setMailgunWebhookMasked(data.mailgun_webhook_signing_key_masked)
      setMailgunApiKeyConfigured(data.mailgun_api_key_configured)
      setMailgunWebhookConfigured(data.mailgun_webhook_signing_key_configured)
      setMailgunForm((prev) => ({
        ...prev,
        environment: mailSettingsEnvironment,
        mailgun_api_key: '',
        mailgun_webhook_signing_key: '',
      }))
      await loadMailgunAudits(mailSettingsEnvironment, 0)
      setMailgunMessage(`Configuración de correo guardada correctamente en ${mailSettingsEnvironment === 'development' ? 'Desarrollo' : 'Producción'}.`)
    } catch (error) {
      setMailgunError(getRequestErrorMessage(error, 'No se pudo guardar la configuración de Mailgun.'))
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
      const res = await systemApi.sendMailgunTestEmail(testEmail.trim(), mailSettingsEnvironment)
      setMailgunMessage(res.data.detail || 'Correo de prueba enviado correctamente.')
    } catch (error) {
      setMailgunError(getRequestErrorMessage(error, 'No se pudo enviar el correo de prueba.'))
    } finally {
      setMailgunTesting(false)
    }
  }

  const exportMailgunAuditsCsv = async () => {
    setMailgunAuditsExporting(true)
    try {
      const res = await systemApi.exportMailgunSettingsAuditsCsv(mailSettingsEnvironment)
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `mailgun_audits_${mailSettingsEnvironment}.csv`)
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
    setBackupMessage(null)
    try {
      await systemApi.createBackup({ include_media: includeMedia })
      await loadBackups()
    } catch {
      setError('No se pudo crear el backup.')
    } finally {
      setCreating(false)
    }
  }

  const deleteBackup = async (filename: string) => {
    setDeletingFilename(filename)
    setError(null)
    setBackupMessage(null)
    try {
      await systemApi.deleteBackup(filename)
      if (selectedFilename === filename) {
        setSelectedFilename('')
      }
      await loadBackups()
      setBackupMessage(`Backup eliminado: ${filename}`)
    } catch {
      setError('No se pudo eliminar el backup.')
    } finally {
      setDeletingFilename(null)
      setDeleteConfirmFilename(null)
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
          variant={activeTab === 'whatsapp' ? 'default' : 'outline'}
          size="sm"
          className="min-h-10"
          onClick={() => setActiveTab('whatsapp')}
        >
          WhatsApp
        </Button>
        <Button
          variant={activeTab === 'templates' ? 'default' : 'outline'}
          size="sm"
          className="min-h-10"
          onClick={() => setActiveTab('templates')}
        >
          Plantillas
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

      {backupMessage ? (
        <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200">
          {backupMessage}
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

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Entorno de configuración</div>
            <div className="flex flex-wrap gap-2">
              {MAIL_SETTINGS_ENV_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setMailSettingsEnvironment(option.value)
                    setMailgunMessage(null)
                    setMailgunError(null)
                  }}
                  className={`min-h-10 rounded-md border px-3 py-2 text-left text-sm transition-colors ${mailSettingsEnvironment === option.value
                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-200'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                    }`}
                  disabled={mailgunLoading || mailgunSaving || mailgunTesting}
                >
                  <div className="font-medium">{option.label}</div>
                  <div className="text-xs opacity-80">{option.hint}</div>
                </button>
              ))}
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Estás editando: <strong>{mailSettingsEnvironment === 'development' ? 'Desarrollo' : 'Producción'}</strong>. Los datos se guardan por separado.
            </div>
          </div>

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
                placeholder="https://api.mailgun.net/v3"
                value={mailgunForm.mailgun_api_url}
                onChange={(e) => setMailgunForm((prev) => ({ ...prev, mailgun_api_url: e.target.value }))}
                disabled={mailgunLoading || mailgunSaving}
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Usa <strong>https://api.mailgun.net/v3</strong> (US) o <strong>https://api.eu.mailgun.net/v3</strong> (EU).
              </span>
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
              Mailgun API Key {mailgunApiKeyConfigured ? '(configurada)' : '(no configurada)'}
              <input
                type="password"
                autoComplete="new-password"
                className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                placeholder={mailgunApiKeyMasked || 'Ingresa nueva API key'}
                value={mailgunForm.mailgun_api_key || ''}
                onChange={(e) => setMailgunForm((prev) => ({ ...prev, mailgun_api_key: e.target.value }))}
                disabled={mailgunLoading || mailgunSaving}
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">Usa una private key de Mailgun (normalmente inicia con <strong>key-...</strong>).</span>
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
              Webhook Signing Key {mailgunWebhookConfigured ? '(configurada)' : '(no configurada)'}
              <input
                type="password"
                autoComplete="new-password"
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

      {activeTab === 'whatsapp' ? (
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-slate-900 dark:text-slate-100">Configuración y pruebas de WhatsApp</CardTitle>
            <div className="text-xs text-slate-500 dark:text-slate-400">Solo ADMIN / SUPERADMIN</div>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                void saveWhatsAppSettings()
              }}
            >
              {whatsAppError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">{whatsAppError}</div>
              ) : null}
              {whatsAppMessage ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200">{whatsAppMessage}</div>
              ) : null}

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Entorno de configuración</div>
                <div className="flex flex-wrap gap-2">
                  {MAIL_SETTINGS_ENV_OPTIONS.map((option) => (
                    <button
                      key={`whatsapp-env-${option.value}`}
                      type="button"
                      onClick={() => {
                        setMailSettingsEnvironment(option.value)
                        setWhatsAppMessage(null)
                        setWhatsAppError(null)
                      }}
                      className={`min-h-10 rounded-md border px-3 py-2 text-left text-sm transition-colors ${mailSettingsEnvironment === option.value
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-200'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                        }`}
                      disabled={whatsAppLoading || whatsAppSaving}
                    >
                      <div className="font-medium">{option.label}</div>
                      <div className="text-xs opacity-80">{option.hint}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Estás editando: <strong>{mailSettingsEnvironment === 'development' ? 'Desarrollo' : 'Producción'}</strong>.
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/40">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Prueba rápida de envío</div>
                {whatsAppTestError ? (
                  <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">{whatsAppTestError}</div>
                ) : null}
                {whatsAppTestStatus ? (
                  <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200">{whatsAppTestStatus}</div>
                ) : null}
                <div className="flex flex-col gap-2 lg:flex-row">
                  <input
                    type="text"
                    className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="+573001112233"
                    value={whatsAppTestPhone}
                    onChange={(e) => setWhatsAppTestPhone(e.target.value)}
                    disabled={whatsAppTesting || whatsAppSaving}
                  />
                  <input
                    type="text"
                    className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="Mensaje corto de prueba"
                    value={whatsAppTestMessage}
                    onChange={(e) => setWhatsAppTestMessage(e.target.value)}
                    disabled={whatsAppTesting || whatsAppSaving}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={sendWhatsAppTestMessage}
                    disabled={whatsAppTesting || whatsAppSaving}
                    className="min-h-11 lg:min-w-40"
                  >
                    {whatsAppTesting ? 'Probando…' : 'Enviar prueba'}
                  </Button>
                </div>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Usa un número real con prefijo internacional para verificar conectividad del canal.
                </div>
              </div>

              <details
                open={whatsAppPanels.advanced}
                onToggle={(e) => {
                  const nextOpen = (e.currentTarget as HTMLDetailsElement).open
                  setWhatsAppPanels((prev) => ({ ...prev, advanced: nextOpen }))
                }}
              >
                <summary className="cursor-pointer list-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100">
                  Configuración avanzada del canal
                </summary>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                <label className="md:col-span-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={whatsAppSettings.enabled}
                    onChange={(e) => setWhatsAppSettings((prev) => ({ ...prev, enabled: e.target.checked }))}
                    disabled={whatsAppLoading || whatsAppSaving}
                  />
                  Canal WhatsApp habilitado
                </label>

                <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                  Proveedor
                  <input
                    type="text"
                    className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={whatsAppSettings.provider}
                    onChange={(e) => setWhatsAppSettings((prev) => ({ ...prev, provider: e.target.value }))}
                    disabled={whatsAppLoading || whatsAppSaving}
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                  Graph base URL
                  <input
                    type="url"
                    className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={whatsAppSettings.graph_base_url}
                    onChange={(e) => setWhatsAppSettings((prev) => ({ ...prev, graph_base_url: e.target.value }))}
                    disabled={whatsAppLoading || whatsAppSaving}
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                  API version
                  <input
                    type="text"
                    className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={whatsAppSettings.api_version}
                    onChange={(e) => setWhatsAppSettings((prev) => ({ ...prev, api_version: e.target.value }))}
                    disabled={whatsAppLoading || whatsAppSaving}
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                  Phone number ID
                  <input
                    type="text"
                    className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={whatsAppSettings.phone_number_id}
                    onChange={(e) => setWhatsAppSettings((prev) => ({ ...prev, phone_number_id: e.target.value }))}
                    disabled={whatsAppLoading || whatsAppSaving}
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                  Access token {whatsAppAccessConfigured ? '(configurado)' : '(no configurado)'}
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder={whatsAppAccessTokenMasked || 'Ingresa nuevo access token'}
                    value={whatsAppSettings.access_token || ''}
                    onChange={(e) => setWhatsAppSettings((prev) => ({ ...prev, access_token: e.target.value }))}
                    disabled={whatsAppLoading || whatsAppSaving}
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                  App secret {whatsAppAppSecretConfigured ? '(configurado)' : '(no configurado)'}
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder={whatsAppAppSecretMasked || 'Ingresa nuevo app secret'}
                    value={whatsAppSettings.app_secret || ''}
                    onChange={(e) => setWhatsAppSettings((prev) => ({ ...prev, app_secret: e.target.value }))}
                    disabled={whatsAppLoading || whatsAppSaving}
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                  Webhook verify token {whatsAppVerifyConfigured ? '(configurado)' : '(no configurado)'}
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder={whatsAppVerifyTokenMasked || 'Ingresa nuevo verify token'}
                    value={whatsAppSettings.webhook_verify_token || ''}
                    onChange={(e) => setWhatsAppSettings((prev) => ({ ...prev, webhook_verify_token: e.target.value }))}
                    disabled={whatsAppLoading || whatsAppSaving}
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                  Timeout HTTP (segundos)
                  <input
                    type="number"
                    min={3}
                    max={60}
                    className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={whatsAppSettings.http_timeout_seconds}
                    onChange={(e) =>
                      setWhatsAppSettings((prev) => ({
                        ...prev,
                        http_timeout_seconds: Math.min(60, Math.max(3, Number(e.target.value || 12))),
                      }))
                    }
                    disabled={whatsAppLoading || whatsAppSaving}
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                  Modo de envío
                  <select
                    className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={whatsAppSettings.send_mode}
                    onChange={(e) =>
                      setWhatsAppSettings((prev) => ({
                        ...prev,
                        send_mode: e.target.value === 'text' ? 'text' : 'template',
                      }))
                    }
                    disabled={whatsAppLoading || whatsAppSaving}
                  >
                    <option value="template">template</option>
                    <option value="text">text</option>
                  </select>
                </label>

                <label className="md:col-span-2 flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                  Template fallback name (opcional)
                  <input
                    type="text"
                    className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={whatsAppSettings.template_fallback_name}
                    onChange={(e) => setWhatsAppSettings((prev) => ({ ...prev, template_fallback_name: e.target.value }))}
                    disabled={whatsAppLoading || whatsAppSaving}
                  />
                </label>

                <label className="md:col-span-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={whatsAppSettings.webhook_strict}
                    onChange={(e) => setWhatsAppSettings((prev) => ({ ...prev, webhook_strict: e.target.checked }))}
                    disabled={whatsAppLoading || whatsAppSaving}
                  />
                  Validación estricta de firma webhook
                </label>
                </div>

                <div className="mt-4 flex justify-end">
                  <Button type="submit" disabled={whatsAppLoading || whatsAppSaving} className="min-h-11">
                    {whatsAppSaving ? 'Guardando…' : 'Guardar configuración'}
                  </Button>
                </div>
              </details>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <details
              open={whatsAppPanels.templateMap}
              onToggle={(e) => {
                const nextOpen = (e.currentTarget as HTMLDetailsElement).open
                setWhatsAppPanels((prev) => ({ ...prev, templateMap: nextOpen }))
              }}
            >
              <summary className="cursor-pointer list-none text-base font-semibold text-slate-900 dark:text-slate-100">
                Mapeo de plantillas WhatsApp ({whatsAppTemplateMaps.length})
              </summary>
              <div className="mt-4">
            {whatsAppError ? (
              <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">{whatsAppError}</div>
            ) : null}
            {whatsAppMessage ? (
              <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200">{whatsAppMessage}</div>
            ) : null}

            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault()
                void saveWhatsAppTemplateMap()
              }}
            >
              <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                Notification type
                <input
                  type="text"
                  className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  placeholder="NOVELTY_SLA_ADMIN"
                  value={whatsAppForm.notification_type}
                  onChange={(e) => setWhatsAppForm((prev) => ({ ...prev, notification_type: e.target.value }))}
                  disabled={whatsAppSaving}
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                Template name (Meta)
                <input
                  type="text"
                  className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  placeholder="novelty_sla_admin_v1"
                  value={whatsAppForm.template_name}
                  onChange={(e) => setWhatsAppForm((prev) => ({ ...prev, template_name: e.target.value }))}
                  disabled={whatsAppSaving}
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                Language code
                <input
                  type="text"
                  className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  placeholder="es_CO"
                  value={whatsAppForm.language_code}
                  onChange={(e) => setWhatsAppForm((prev) => ({ ...prev, language_code: e.target.value }))}
                  disabled={whatsAppSaving}
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                Category
                <select
                  className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={whatsAppForm.category}
                  onChange={(e) => setWhatsAppForm((prev) => ({ ...prev, category: e.target.value as WhatsAppTemplateMapPayload['category'] }))}
                  disabled={whatsAppSaving}
                >
                  <option value="utility">utility</option>
                  <option value="authentication">authentication</option>
                  <option value="marketing">marketing</option>
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
                Body parameter names (CSV)
                <input
                  type="text"
                  className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  placeholder="recipient_name,title,body,action_url"
                  value={whatsAppBodyParametersRaw}
                  onChange={(e) => setWhatsAppBodyParametersRaw(e.target.value)}
                  disabled={whatsAppSaving}
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
                Default components (JSON array opcional)
                <textarea
                  className="min-h-28 rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  placeholder='[{"type":"body","parameters":[{"type":"text","parameter_name":"recipient_name","text":"{{recipient_name}}"}]}]'
                  value={whatsAppDefaultComponentsRaw}
                  onChange={(e) => setWhatsAppDefaultComponentsRaw(e.target.value)}
                  disabled={whatsAppSaving}
                />
              </label>

              <label className="md:col-span-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={whatsAppForm.is_active}
                  onChange={(e) => setWhatsAppForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                  disabled={whatsAppSaving}
                />
                Mapeo activo
              </label>

              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={whatsAppSaving} className="min-h-11">
                  {whatsAppSaving ? 'Guardando…' : 'Guardar mapeo'}
                </Button>
              </div>
            </form>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Template</th>
                    <th className="px-3 py-2">Lang</th>
                    <th className="px-3 py-2">Categoria</th>
                    <th className="px-3 py-2">Activo</th>
                    <th className="px-3 py-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {whatsAppTemplateMaps.map((item) => (
                    <tr key={item.id} className="bg-white dark:bg-slate-900">
                      <td className="px-3 py-2 font-medium">{item.notification_type}</td>
                      <td className="px-3 py-2">{item.template_name}</td>
                      <td className="px-3 py-2">{item.language_code}</td>
                      <td className="px-3 py-2">{item.category}</td>
                      <td className="px-3 py-2">{item.is_active ? 'Sí' : 'No'}</td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="outline" size="sm" onClick={() => removeWhatsAppTemplateMap(item.id)} disabled={whatsAppSaving}>
                          Eliminar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {whatsAppTemplateMaps.length === 0 ? (
                <div className="py-3 text-sm text-slate-500 dark:text-slate-400">No hay mapeos configurados.</div>
              ) : null}
            </div>
              </div>
            </details>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <details
              open={whatsAppPanels.health}
              onToggle={(e) => {
                const nextOpen = (e.currentTarget as HTMLDetailsElement).open
                setWhatsAppPanels((prev) => ({ ...prev, health: nextOpen }))
              }}
            >
              <summary className="cursor-pointer list-none text-base font-semibold text-slate-900 dark:text-slate-100">
                Salud operativa WhatsApp ({whatsAppHours}h){' '}
                <span className={`text-sm ${whatsAppHealth ? (whatsAppHealth.breach ? 'text-rose-600' : 'text-emerald-600') : 'text-slate-500 dark:text-slate-400'}`}>
                  {whatsAppHealth ? (whatsAppHealth.breach ? 'Breach' : 'OK') : 'Sin datos'}
                </span>
              </summary>
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                className="h-10 w-24 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={whatsAppHours}
                onChange={(e) => setWhatsAppHours(Math.max(1, Number(e.target.value || 24)))}
              />
              <Button variant="outline" size="sm" onClick={() => loadWhatsAppData(whatsAppHours)} disabled={whatsAppLoading}>
                Actualizar
              </Button>
            </div>

            {!whatsAppHealth ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">Sin datos de salud disponibles.</div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <div className="rounded-lg border border-slate-200 p-3 text-center dark:border-slate-700"><div className="text-xs text-slate-500">Total</div><div className="text-lg font-semibold">{whatsAppHealth.totals.total}</div></div>
                  <div className="rounded-lg border border-slate-200 p-3 text-center dark:border-slate-700"><div className="text-xs text-slate-500">Sent</div><div className="text-lg font-semibold">{whatsAppHealth.totals.sent}</div></div>
                  <div className="rounded-lg border border-slate-200 p-3 text-center dark:border-slate-700"><div className="text-xs text-slate-500">Delivered</div><div className="text-lg font-semibold">{whatsAppHealth.totals.delivered}</div></div>
                  <div className="rounded-lg border border-slate-200 p-3 text-center dark:border-slate-700"><div className="text-xs text-slate-500">Read</div><div className="text-lg font-semibold">{whatsAppHealth.totals.read}</div></div>
                  <div className="rounded-lg border border-slate-200 p-3 text-center dark:border-slate-700"><div className="text-xs text-slate-500">Failed</div><div className="text-lg font-semibold text-rose-600">{whatsAppHealth.totals.failed}</div></div>
                  <div className="rounded-lg border border-slate-200 p-3 text-center dark:border-slate-700"><div className="text-xs text-slate-500">Success</div><div className="text-lg font-semibold">{whatsAppHealth.success_rate}%</div></div>
                </div>

                <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
                  Estado: {whatsAppHealth.breach ? <span className="font-semibold text-rose-600">Breach</span> : <span className="font-semibold text-emerald-600">OK</span>} ·
                  Umbrales: max_failed={whatsAppHealth.thresholds.max_failed}, min_success_rate={whatsAppHealth.thresholds.min_success_rate}%
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      <tr>
                        <th className="px-3 py-2">Institución</th>
                        <th className="px-3 py-2">Total</th>
                        <th className="px-3 py-2">Sent</th>
                        <th className="px-3 py-2">Delivered</th>
                        <th className="px-3 py-2">Read</th>
                        <th className="px-3 py-2">Failed</th>
                        <th className="px-3 py-2">Suppressed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {whatsAppHealth.institution_breakdown.map((row, idx) => (
                        <tr key={`${row.institution_id || 'none'}-${idx}`}>
                          <td className="px-3 py-2">{row.institution__name || 'Sin institución'}</td>
                          <td className="px-3 py-2">{row.total}</td>
                          <td className="px-3 py-2">{row.sent}</td>
                          <td className="px-3 py-2">{row.delivered}</td>
                          <td className="px-3 py-2">{row.read}</td>
                          <td className="px-3 py-2">{row.failed}</td>
                          <td className="px-3 py-2">{row.suppressed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
              </div>
            </details>
          </CardContent>
        </Card>
      </div>
      ) : null}

      {activeTab === 'templates' ? <EmailTemplateSettingsCard /> : null}

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
            <Button variant="outline" size="sm" className="min-h-10" onClick={() => loadMailgunAudits(mailSettingsEnvironment, mailgunAuditsOffset)}>
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
                    onClick={() => loadMailgunAudits(mailSettingsEnvironment, Math.max(0, mailgunAuditsOffset - mailgunAuditsLimit))}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-9"
                    disabled={mailgunAuditsOffset + mailgunAudits.length >= mailgunAuditsTotal || mailgunAuditsLoading}
                    onClick={() => loadMailgunAudits(mailSettingsEnvironment, mailgunAuditsOffset + mailgunAuditsLimit)}
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
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" size="sm" className="min-h-10" onClick={() => download(b.filename)}>
                            Descargar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-10"
                            onClick={() => setDeleteConfirmFilename(b.filename)}
                            disabled={deletingFilename === b.filename}
                          >
                            {deletingFilename === b.filename ? 'Eliminando…' : 'Eliminar'}
                          </Button>
                        </div>
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
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <Button variant="outline" size="sm" className="min-h-11 w-full" onClick={() => download(b.filename)}>
                            Descargar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-h-11 w-full"
                            onClick={() => setDeleteConfirmFilename(b.filename)}
                            disabled={deletingFilename === b.filename}
                          >
                            {deletingFilename === b.filename ? 'Eliminando…' : 'Eliminar'}
                          </Button>
                        </div>
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

      <ConfirmationModal
        isOpen={deleteConfirmFilename !== null}
        onClose={() => {
          if (!deletingFilename) setDeleteConfirmFilename(null)
        }}
        onConfirm={() => {
          if (deleteConfirmFilename) {
            void deleteBackup(deleteConfirmFilename)
          }
        }}
        title="Eliminar backup"
        description={`¿Seguro que deseas eliminar el backup "${deleteConfirmFilename || ''}"? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="destructive"
        loading={deletingFilename !== null}
      />
    </div>
  )
}

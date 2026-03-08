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
  type WhatsAppDeliveryItem,
  type WhatsAppSettingsPayload,
  type WhatsAppSettingsResponse,
  type WhatsAppTestSendResponse,
  type WhatsAppTemplateMapItem,
  type WhatsAppTemplateApprovalStatus,
  type WhatsAppTemplateSlaAuditItem,
  type WhatsAppTemplateMapPayload,
} from '../services/system'

type SystemTab = 'mailgun' | 'whatsapp' | 'templates' | 'audits' | 'backups' | 'restore'

const MAIL_SETTINGS_ENV_OPTIONS: { value: MailSettingsEnvironment; label: string; hint: string }[] = [
  { value: 'development', label: 'Desarrollo', hint: 'Pruebas locales y staging' },
  { value: 'production', label: 'Producción', hint: 'Configuración real de envío' },
]

const SYSTEM_TABS: SystemTab[] = ['mailgun', 'whatsapp', 'templates', 'audits', 'backups', 'restore']
const WHATSAPP_PANEL_STORAGE_KEY = 'system.whatsapp.panels'
const WHATSAPP_API_VERSION_PATTERN = /^v\d+\.\d+$/
const WHATSAPP_PHONE_ID_PATTERN = /^\d{8,20}$/
const WHATSAPP_DELIVERIES_PAGE_SIZE = 5

type WhatsAppPanelState = {
  test: boolean
  advanced: boolean
  templateMap: boolean
  health: boolean
  deliveries: boolean
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
  const isSuperAdmin = user?.role === 'SUPERADMIN'
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
  const [whatsAppExporting, setWhatsAppExporting] = useState(false)
  const [whatsAppMessage, setWhatsAppMessage] = useState<string | null>(null)
  const [whatsAppError, setWhatsAppError] = useState<string | null>(null)
  const [whatsAppTemplateMaps, setWhatsAppTemplateMaps] = useState<WhatsAppTemplateMapItem[]>([])
  const [whatsAppTemplateSlaAudits, setWhatsAppTemplateSlaAudits] = useState<WhatsAppTemplateSlaAuditItem[]>([])
  const [whatsAppTemplateSlaAuditsLoading, setWhatsAppTemplateSlaAuditsLoading] = useState(false)
  const [whatsAppTemplateSlaAuditsExporting, setWhatsAppTemplateSlaAuditsExporting] = useState(false)
  const [whatsAppTemplateSlaAuditsLimit] = useState(10)
  const [whatsAppTemplateSlaAuditsOffset, setWhatsAppTemplateSlaAuditsOffset] = useState(0)
  const [whatsAppTemplateSlaAuditsTotal, setWhatsAppTemplateSlaAuditsTotal] = useState(0)
  const [whatsAppTemplateApprovalFilter, setWhatsAppTemplateApprovalFilter] = useState<'all' | WhatsAppTemplateApprovalStatus>('all')
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
    template_sla_warning_pending_hours: 24,
    template_sla_critical_pending_hours: 72,
    template_sla_warning_approval_hours: 24,
    template_sla_critical_approval_hours: 72,
  })
  const [whatsAppAccessTokenMasked, setWhatsAppAccessTokenMasked] = useState('')
  const [whatsAppAppSecretMasked, setWhatsAppAppSecretMasked] = useState('')
  const [whatsAppVerifyTokenMasked, setWhatsAppVerifyTokenMasked] = useState('')
  const [whatsAppAccessConfigured, setWhatsAppAccessConfigured] = useState(false)
  const [whatsAppAppSecretConfigured, setWhatsAppAppSecretConfigured] = useState(false)
  const [whatsAppVerifyConfigured, setWhatsAppVerifyConfigured] = useState(false)
  const [whatsAppSettingsUpdatedBy, setWhatsAppSettingsUpdatedBy] = useState<WhatsAppSettingsResponse['updated_by']>(null)
  const [whatsAppSettingsUpdatedAt, setWhatsAppSettingsUpdatedAt] = useState<string | null>(null)
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
  const [whatsAppTestMode, setWhatsAppTestMode] = useState<'template' | 'text'>('template')
  const [whatsAppTestMessage, setWhatsAppTestMessage] = useState('Prueba de WhatsApp desde Kampus.')
  const [whatsAppTestTemplateName, setWhatsAppTestTemplateName] = useState('')
  const [whatsAppTestLanguageCode, setWhatsAppTestLanguageCode] = useState('es_CO')
  const [whatsAppTestHeaderText, setWhatsAppTestHeaderText] = useState('')
  const [whatsAppTestBodyParametersRaw, setWhatsAppTestBodyParametersRaw] = useState('')
  const [whatsAppTestResult, setWhatsAppTestResult] = useState<WhatsAppTestSendResponse | null>(null)
  const [whatsAppTestStatus, setWhatsAppTestStatus] = useState<string | null>(null)
  const [whatsAppTestError, setWhatsAppTestError] = useState<string | null>(null)
  const [whatsAppRecentDeliveries, setWhatsAppRecentDeliveries] = useState<WhatsAppDeliveryItem[]>([])
  const [whatsAppDeliveriesPage, setWhatsAppDeliveriesPage] = useState(1)
  const [whatsAppPanels, setWhatsAppPanels] = useState<WhatsAppPanelState>(() => {
    if (typeof window === 'undefined') {
      return { test: false, advanced: false, templateMap: false, health: false, deliveries: true }
    }
    try {
      const raw = window.localStorage.getItem(WHATSAPP_PANEL_STORAGE_KEY)
      if (!raw) return { test: false, advanced: false, templateMap: false, health: false, deliveries: true }
      const parsed = JSON.parse(raw) as Partial<WhatsAppPanelState>
      return {
        test: parsed.test === undefined ? false : Boolean(parsed.test),
        advanced: Boolean(parsed.advanced),
        templateMap: Boolean(parsed.templateMap),
        health: Boolean(parsed.health),
        deliveries: parsed.deliveries === undefined ? true : Boolean(parsed.deliveries),
      }
    } catch {
      return { test: false, advanced: false, templateMap: false, health: false, deliveries: true }
    }
  })

  const canRunDestructive = mode !== 'restore' || confirm

  const whatsAppDeliveriesTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(whatsAppRecentDeliveries.length / WHATSAPP_DELIVERIES_PAGE_SIZE))
  }, [whatsAppRecentDeliveries.length])

  const whatsAppRecentDeliveriesPageItems = useMemo(() => {
    const start = (whatsAppDeliveriesPage - 1) * WHATSAPP_DELIVERIES_PAGE_SIZE
    return whatsAppRecentDeliveries.slice(start, start + WHATSAPP_DELIVERIES_PAGE_SIZE)
  }, [whatsAppDeliveriesPage, whatsAppRecentDeliveries])

  useEffect(() => {
    if (whatsAppDeliveriesPage > whatsAppDeliveriesTotalPages) {
      setWhatsAppDeliveriesPage(whatsAppDeliveriesTotalPages)
    }
  }, [whatsAppDeliveriesPage, whatsAppDeliveriesTotalPages])

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
      const [mapsResponse, healthResponse, settingsResponse, deliveriesResponse] = await Promise.all([
        systemApi.listWhatsAppTemplateMaps(whatsAppTemplateApprovalFilter === 'all' ? undefined : whatsAppTemplateApprovalFilter),
        systemApi.getWhatsAppHealth(hours),
        systemApi.getWhatsAppSettings(mailSettingsEnvironment),
        systemApi.listRecentWhatsAppDeliveries(20),
      ])
      setWhatsAppTemplateMaps(mapsResponse.data.results || [])
      setWhatsAppHealth(healthResponse.data)
      setWhatsAppRecentDeliveries(deliveriesResponse.data.results || [])
      setWhatsAppDeliveriesPage(1)

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
        template_sla_warning_pending_hours: settingsData.template_sla_warning_pending_hours,
        template_sla_critical_pending_hours: settingsData.template_sla_critical_pending_hours,
        template_sla_warning_approval_hours: settingsData.template_sla_warning_approval_hours,
        template_sla_critical_approval_hours: settingsData.template_sla_critical_approval_hours,
      })
      setWhatsAppAccessTokenMasked(settingsData.access_token_masked)
      setWhatsAppAppSecretMasked(settingsData.app_secret_masked)
      setWhatsAppVerifyTokenMasked(settingsData.webhook_verify_token_masked)
      setWhatsAppAccessConfigured(settingsData.access_token_configured)
      setWhatsAppAppSecretConfigured(settingsData.app_secret_configured)
      setWhatsAppVerifyConfigured(settingsData.webhook_verify_token_configured)
      setWhatsAppSettingsUpdatedBy(settingsData.updated_by)
      setWhatsAppSettingsUpdatedAt(settingsData.updated_at)
      setWhatsAppTestMode(settingsData.send_mode === 'text' && mailSettingsEnvironment !== 'production' ? 'text' : 'template')
      if (settingsData.template_fallback_name) {
        setWhatsAppTestTemplateName(settingsData.template_fallback_name)
      }

      const auditsResponse = await systemApi.getWhatsAppTemplateSlaAudits(mailSettingsEnvironment, whatsAppTemplateSlaAuditsLimit, whatsAppTemplateSlaAuditsOffset)
      setWhatsAppTemplateSlaAudits(auditsResponse.data.results || [])
      setWhatsAppTemplateSlaAuditsTotal(auditsResponse.data.total || 0)
    } catch (error) {
      setWhatsAppError(getRequestErrorMessage(error, 'No se pudo cargar la configuración de WhatsApp.'))
      setWhatsAppTemplateMaps([])
      setWhatsAppHealth(null)
      setWhatsAppRecentDeliveries([])
      setWhatsAppDeliveriesPage(1)
      setWhatsAppTemplateSlaAudits([])
      setWhatsAppTemplateSlaAuditsTotal(0)
    } finally {
      setWhatsAppLoading(false)
    }
  }, [mailSettingsEnvironment, whatsAppHours, whatsAppTemplateApprovalFilter, whatsAppTemplateSlaAuditsLimit, whatsAppTemplateSlaAuditsOffset])

  const loadWhatsAppTemplateSlaAudits = useCallback(async (offset = 0) => {
    setWhatsAppTemplateSlaAuditsLoading(true)
    try {
      const response = await systemApi.getWhatsAppTemplateSlaAudits(mailSettingsEnvironment, whatsAppTemplateSlaAuditsLimit, offset)
      setWhatsAppTemplateSlaAudits(response.data.results || [])
      setWhatsAppTemplateSlaAuditsOffset(response.data.offset || 0)
      setWhatsAppTemplateSlaAuditsTotal(response.data.total || 0)
    } catch {
      setWhatsAppTemplateSlaAudits([])
      setWhatsAppTemplateSlaAuditsTotal(0)
    } finally {
      setWhatsAppTemplateSlaAuditsLoading(false)
    }
  }, [mailSettingsEnvironment, whatsAppTemplateSlaAuditsLimit])

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
      setWhatsAppSettingsUpdatedBy(settingsData.updated_by)
      setWhatsAppSettingsUpdatedAt(settingsData.updated_at)
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

  const loadWhatsAppTemplateMapIntoForm = (item: WhatsAppTemplateMapItem) => {
    setWhatsAppForm({
      notification_type: item.notification_type,
      template_name: item.template_name,
      language_code: item.language_code,
      body_parameter_names: item.body_parameter_names,
      default_components: item.default_components,
      category: item.category,
      is_active: item.is_active,
    })
    setWhatsAppBodyParametersRaw((item.body_parameter_names || []).join(','))
    setWhatsAppDefaultComponentsRaw(
      item.default_components && item.default_components.length
        ? JSON.stringify(item.default_components, null, 2)
        : '',
    )
    setWhatsAppMessage(`Mapeo ${item.notification_type} cargado en el formulario para edición.`)
    setWhatsAppError(null)
  }

  const submitWhatsAppTemplateMap = async (mapId: number) => {
    setWhatsAppSaving(true)
    setWhatsAppError(null)
    setWhatsAppMessage(null)
    try {
      await systemApi.submitWhatsAppTemplateMap(mapId)
      setWhatsAppMessage('Template enviado a aprobación correctamente.')
      await loadWhatsAppData()
    } catch (error) {
      setWhatsAppError(getRequestErrorMessage(error, 'No se pudo enviar el template a aprobación.'))
    } finally {
      setWhatsAppSaving(false)
    }
  }

  const approveWhatsAppTemplateMap = async (mapId: number) => {
    setWhatsAppSaving(true)
    setWhatsAppError(null)
    setWhatsAppMessage(null)
    try {
      await systemApi.approveWhatsAppTemplateMap(mapId)
      setWhatsAppMessage('Template aprobado correctamente.')
      await loadWhatsAppData()
    } catch (error) {
      setWhatsAppError(getRequestErrorMessage(error, 'No se pudo aprobar el template.'))
    } finally {
      setWhatsAppSaving(false)
    }
  }

  const rejectWhatsAppTemplateMap = async (mapId: number) => {
    const reason = window.prompt('Motivo de rechazo (obligatorio):', '')
    if (!reason || !reason.trim()) return

    setWhatsAppSaving(true)
    setWhatsAppError(null)
    setWhatsAppMessage(null)
    try {
      await systemApi.rejectWhatsAppTemplateMap(mapId, reason.trim())
      setWhatsAppMessage('Template rechazado correctamente.')
      await loadWhatsAppData()
    } catch (error) {
      setWhatsAppError(getRequestErrorMessage(error, 'No se pudo rechazar el template.'))
    } finally {
      setWhatsAppSaving(false)
    }
  }

  const exportWhatsAppTemplateApprovalsCsv = async () => {
    setWhatsAppExporting(true)
    try {
      const res = await systemApi.exportWhatsAppTemplateApprovalsCsv(whatsAppTemplateApprovalFilter)
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `whatsapp_template_approvals_${whatsAppTemplateApprovalFilter}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      setWhatsAppError('No se pudo exportar el historial CSV de aprobaciones WhatsApp.')
    } finally {
      setWhatsAppExporting(false)
    }
  }

  const exportWhatsAppTemplateSlaAuditsCsv = async () => {
    setWhatsAppTemplateSlaAuditsExporting(true)
    try {
      const res = await systemApi.exportWhatsAppTemplateSlaAuditsCsv(mailSettingsEnvironment)
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `whatsapp_template_sla_audits_${mailSettingsEnvironment}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      setWhatsAppError('No se pudo exportar el historial SLA en CSV.')
    } finally {
      setWhatsAppTemplateSlaAuditsExporting(false)
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
    setWhatsAppTestResult(null)
    try {
      const bodyParameters = whatsAppTestBodyParametersRaw
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean)

      const resolvedMode = mailSettingsEnvironment === 'production' ? 'template' : whatsAppTestMode
      const res = await systemApi.sendWhatsAppTestMessage({
        test_phone: whatsAppTestPhone.trim(),
        mode: resolvedMode,
        message: whatsAppTestMessage.trim() || 'Prueba de WhatsApp desde Kampus.',
        template_name: whatsAppTestTemplateName.trim() || undefined,
        language_code: whatsAppTestLanguageCode.trim() || undefined,
        template_header_text: whatsAppTestHeaderText.trim() || undefined,
        body_parameters: bodyParameters.length ? bodyParameters : undefined,
      }, mailSettingsEnvironment)
      setWhatsAppTestResult(res.data)
      setWhatsAppTestStatus(res.data.detail || 'Mensaje de prueba enviado correctamente.')
      await loadWhatsAppData()
    } catch (error) {
      const responseData = (error as { response?: { data?: unknown } } | undefined)?.response?.data
      if (responseData && typeof responseData === 'object') {
        const typed = responseData as Partial<WhatsAppTestSendResponse>
        setWhatsAppTestResult({
          detail: String(typed.detail || ''),
          status: String(typed.status || ''),
          mode: typed.mode === 'text' ? 'text' : 'template',
          error: typed.error ? String(typed.error) : undefined,
          error_code: typed.error_code ? String(typed.error_code) : undefined,
          delivery_id: typeof typed.delivery_id === 'number' ? typed.delivery_id : undefined,
          provider_message_id: typed.provider_message_id ? String(typed.provider_message_id) : undefined,
        })
      }
      setWhatsAppTestError(getRequestErrorMessage(error, 'No se pudo enviar el mensaje de prueba.'))
      await loadWhatsAppData()
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
  const whatsAppTemplateMapStats = useMemo(() => {
    const total = whatsAppTemplateMaps.length
    const active = whatsAppTemplateMaps.filter((item) => item.is_active).length
    const categories = new Set(whatsAppTemplateMaps.map((item) => item.category)).size
    const submitted = whatsAppTemplateMaps.filter((item) => item.approval_status === 'submitted').length
    const approved = whatsAppTemplateMaps.filter((item) => item.approval_status === 'approved').length
    const rejected = whatsAppTemplateMaps.filter((item) => item.approval_status === 'rejected').length

    const approvalLeadTimesHours = whatsAppTemplateMaps
      .filter((item) => item.approval_status === 'approved' && item.submitted_at && item.approved_at)
      .map((item) => {
        const submittedAt = new Date(String(item.submitted_at)).getTime()
        const approvedAt = new Date(String(item.approved_at)).getTime()
        if (!Number.isFinite(submittedAt) || !Number.isFinite(approvedAt) || approvedAt < submittedAt) return null
        return (approvedAt - submittedAt) / (1000 * 60 * 60)
      })
      .filter((value): value is number => typeof value === 'number')

    const avgApprovalHours = approvalLeadTimesHours.length
      ? approvalLeadTimesHours.reduce((acc, value) => acc + value, 0) / approvalLeadTimesHours.length
      : null

    const now = Date.now()
    const pendingAgesHours = whatsAppTemplateMaps
      .filter((item) => item.approval_status === 'submitted' && item.submitted_at)
      .map((item) => {
        const submittedAt = new Date(String(item.submitted_at)).getTime()
        if (!Number.isFinite(submittedAt) || now < submittedAt) return null
        return (now - submittedAt) / (1000 * 60 * 60)
      })
      .filter((value): value is number => typeof value === 'number')

    const pendingOver24h = pendingAgesHours.filter((hours) => hours >= 24).length
    const pendingOver72h = pendingAgesHours.filter((hours) => hours >= 72).length
    const maxPendingHours = pendingAgesHours.length ? Math.max(...pendingAgesHours) : null

    const warningPendingHours = Math.max(1, whatsAppSettings.template_sla_warning_pending_hours)
    const criticalPendingHours = Math.max(warningPendingHours, whatsAppSettings.template_sla_critical_pending_hours)
    const warningAvgApprovalHours = Math.max(1, whatsAppSettings.template_sla_warning_approval_hours)
    const criticalAvgApprovalHours = Math.max(warningAvgApprovalHours, whatsAppSettings.template_sla_critical_approval_hours)

    const pendingWarningCount = pendingAgesHours.filter((hours) => hours >= warningPendingHours).length
    const pendingCriticalCount = pendingAgesHours.filter((hours) => hours >= criticalPendingHours).length

    const avgApprovalIsWarning = avgApprovalHours !== null && avgApprovalHours >= warningAvgApprovalHours
    const avgApprovalIsCritical = avgApprovalHours !== null && avgApprovalHours >= criticalAvgApprovalHours

    const slaLevel: 'green' | 'yellow' | 'red' =
      pendingCriticalCount > 0 || avgApprovalIsCritical
        ? 'red'
        : pendingWarningCount > 0 || avgApprovalIsWarning
          ? 'yellow'
          : 'green'

    return {
      total,
      active,
      categories,
      submitted,
      approved,
      rejected,
      avgApprovalHours,
      pendingOver24h,
      pendingOver72h,
      maxPendingHours,
      pendingWarningCount,
      pendingCriticalCount,
      warningPendingHours,
      criticalPendingHours,
      warningAvgApprovalHours,
      criticalAvgApprovalHours,
      slaLevel,
    }
  }, [
    whatsAppTemplateMaps,
    whatsAppSettings.template_sla_warning_pending_hours,
    whatsAppSettings.template_sla_critical_pending_hours,
    whatsAppSettings.template_sla_warning_approval_hours,
    whatsAppSettings.template_sla_critical_approval_hours,
  ])

  const whatsAppConfigValidation = useMemo(() => {
    const graphBaseUrl = whatsAppSettings.graph_base_url.trim()
    const apiVersion = whatsAppSettings.api_version.trim()
    const phoneNumberId = whatsAppSettings.phone_number_id.trim()
    const hasAccessToken = Boolean((whatsAppSettings.access_token ?? '').trim() || whatsAppAccessConfigured)
    const templateFallbackRequired = mailSettingsEnvironment === 'production' || whatsAppSettings.send_mode === 'template'

    const checks = [
      {
        key: 'graph-url',
        label: 'Graph base URL valido (http/https)',
        ok: /^https?:\/\//i.test(graphBaseUrl),
        blocking: true,
      },
      {
        key: 'api-version',
        label: 'API version valida (ej: v21.0)',
        ok: WHATSAPP_API_VERSION_PATTERN.test(apiVersion),
        blocking: true,
      },
      {
        key: 'phone-id-required',
        label: 'Phone number ID presente',
        ok: !whatsAppSettings.enabled || phoneNumberId.length > 0,
        blocking: true,
      },
      {
        key: 'access-token-required',
        label: 'Access token configurado',
        ok: !whatsAppSettings.enabled || hasAccessToken,
        blocking: true,
      },
      {
        key: 'timeout-range',
        label: 'Timeout HTTP entre 3 y 120 segundos',
        ok: whatsAppSettings.http_timeout_seconds >= 3 && whatsAppSettings.http_timeout_seconds <= 120,
        blocking: true,
      },
      {
        key: 'phone-id-format',
        label: 'Phone number ID en formato numerico',
        ok: !phoneNumberId || WHATSAPP_PHONE_ID_PATTERN.test(phoneNumberId),
        blocking: false,
      },
      {
        key: 'template-fallback',
        label: 'Template fallback definido para mode template',
        ok: !templateFallbackRequired || Boolean(whatsAppSettings.template_fallback_name.trim()),
        blocking: false,
      },
    ]

    const blockingIssues = checks.filter((item) => item.blocking && !item.ok)
    const warnings = checks.filter((item) => !item.blocking && !item.ok)

    return {
      ready: blockingIssues.length === 0,
      checks,
      blockingIssues,
      warnings,
      completedChecks: checks.filter((item) => item.ok).length,
    }
  }, [
    mailSettingsEnvironment,
    whatsAppAccessConfigured,
    whatsAppSettings.access_token,
    whatsAppSettings.api_version,
    whatsAppSettings.enabled,
    whatsAppSettings.graph_base_url,
    whatsAppSettings.http_timeout_seconds,
    whatsAppSettings.phone_number_id,
    whatsAppSettings.send_mode,
    whatsAppSettings.template_fallback_name,
  ])

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
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Entorno de configuración</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {MAIL_SETTINGS_ENV_OPTIONS.map((option) => (
                        <button
                          key={`whatsapp-env-${option.value}`}
                          type="button"
                          onClick={() => {
                            setMailSettingsEnvironment(option.value)
                            setWhatsAppMessage(null)
                            setWhatsAppError(null)
                          }}
                          className={`min-h-9 rounded-full border px-3 py-1.5 text-xs transition-colors ${mailSettingsEnvironment === option.value
                            ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-200'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                            }`}
                          disabled={whatsAppLoading || whatsAppSaving}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button type="submit" disabled={whatsAppLoading || whatsAppSaving || !whatsAppConfigValidation.ready} className="min-h-10 md:min-w-48">
                    {whatsAppSaving ? 'Guardando…' : 'Guardar configuración'}
                  </Button>
                </div>
              </div>

              <div
                className={`rounded-lg border p-3 ${whatsAppConfigValidation.ready
                  ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/25'
                  : 'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/25'
                  }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Validacion inmediata</div>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${whatsAppConfigValidation.ready
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
                      }`}
                  >
                    {whatsAppConfigValidation.ready ? 'Lista para guardar' : 'Faltan ajustes'}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  {whatsAppConfigValidation.completedChecks}/{whatsAppConfigValidation.checks.length} checks completados
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/80 px-2 py-1 text-xs text-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
                    Bloqueantes: {whatsAppConfigValidation.blockingIssues.length}
                  </span>
                  <span className="rounded-full bg-white/80 px-2 py-1 text-xs text-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
                    Recomendaciones: {whatsAppConfigValidation.warnings.length}
                  </span>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-slate-600 dark:text-slate-300">Ver checklist</summary>
                  <div className="mt-2 grid gap-1 sm:grid-cols-2">
                    {whatsAppConfigValidation.checks.map((item) => (
                      <div key={item.key} className="text-xs text-slate-700 dark:text-slate-200">
                        <span className={item.ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-200'}>{item.ok ? 'OK' : 'PEND'}</span>{' '}
                        {item.label}
                      </div>
                    ))}
                  </div>
                </details>
              </div>

              <details
                open={whatsAppPanels.test}
                onToggle={(e) => {
                  const nextOpen = (e.currentTarget as HTMLDetailsElement).open
                  setWhatsAppPanels((prev) => ({ ...prev, test: nextOpen }))
                }}
                className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/40"
              >
                <summary className="cursor-pointer list-none text-sm font-medium text-slate-800 dark:text-slate-100">
                  Prueba rápida de envío
                </summary>
                <div className="mt-3">
                {whatsAppTestError ? (
                  <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">{whatsAppTestError}</div>
                ) : null}
                {whatsAppTestStatus ? (
                  <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200">{whatsAppTestStatus}</div>
                ) : null}
                <div className="mb-2 grid gap-2 md:grid-cols-3">
                  <select
                    className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={mailSettingsEnvironment === 'production' ? 'template' : whatsAppTestMode}
                    onChange={(e) => setWhatsAppTestMode(e.target.value === 'text' ? 'text' : 'template')}
                    disabled={whatsAppTesting || whatsAppSaving || mailSettingsEnvironment === 'production'}
                  >
                    <option value="template">template</option>
                    <option value="text">text</option>
                  </select>
                  <input
                    type="text"
                    className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="novelty_sla_coordinator_v1"
                    value={whatsAppTestTemplateName}
                    onChange={(e) => setWhatsAppTestTemplateName(e.target.value)}
                    disabled={whatsAppTesting || whatsAppSaving || (mailSettingsEnvironment !== 'production' && whatsAppTestMode === 'text')}
                  />
                  <input
                    type="text"
                    className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="es_CO"
                    value={whatsAppTestLanguageCode}
                    onChange={(e) => setWhatsAppTestLanguageCode(e.target.value)}
                    disabled={whatsAppTesting || whatsAppSaving || (mailSettingsEnvironment !== 'production' && whatsAppTestMode === 'text')}
                  />
                </div>

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
                    placeholder="Mensaje corto de prueba (solo text mode)"
                    value={whatsAppTestMessage}
                    onChange={(e) => setWhatsAppTestMessage(e.target.value)}
                    disabled={whatsAppTesting || whatsAppSaving || (mailSettingsEnvironment === 'production' || whatsAppTestMode === 'template')}
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
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <input
                    type="text"
                    className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="Parametro header (opcional)"
                    value={whatsAppTestHeaderText}
                    onChange={(e) => setWhatsAppTestHeaderText(e.target.value)}
                    disabled={whatsAppTesting || whatsAppSaving || (mailSettingsEnvironment !== 'production' && whatsAppTestMode === 'text')}
                  />
                  <input
                    type="text"
                    className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="Body params separados por | (ej: val1|val2|val3)"
                    value={whatsAppTestBodyParametersRaw}
                    onChange={(e) => setWhatsAppTestBodyParametersRaw(e.target.value)}
                    disabled={whatsAppTesting || whatsAppSaving || (mailSettingsEnvironment !== 'production' && whatsAppTestMode === 'text')}
                  />
                </div>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  En producción la prueba usa plantilla por defecto para evitar bloqueos por ventana de 24h.
                </div>
                {whatsAppTestResult ? (
                  <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
                    <div>mode: {whatsAppTestResult.mode || '-'}</div>
                    <div>status: {whatsAppTestResult.status || '-'}</div>
                    <div>delivery_id: {whatsAppTestResult.delivery_id ?? '-'}</div>
                    <div>provider_message_id: {whatsAppTestResult.provider_message_id || '-'}</div>
                    <div>error_code: {whatsAppTestResult.error_code || '-'}</div>
                    <div>error: {whatsAppTestResult.error || '-'}</div>
                  </div>
                ) : null}
                </div>
              </details>

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
                    disabled={whatsAppLoading || whatsAppSaving || mailSettingsEnvironment === 'production'}
                  >
                    <option value="template">template</option>
                    <option value="text">text</option>
                  </select>
                  {mailSettingsEnvironment === 'production' ? (
                    <span className="text-xs text-slate-500 dark:text-slate-400">En producción se fuerza template para evitar bloqueos de entrega.</span>
                  ) : null}
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

                {!whatsAppConfigValidation.ready ? (
                  <div className="mt-4 text-xs text-amber-700 dark:text-amber-200">
                    Completa la validacion inmediata para habilitar el guardado.
                  </div>
                ) : null}
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
              <summary className="cursor-pointer list-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100">
                Mapeo de plantillas WhatsApp ({whatsAppTemplateMaps.length})
              </summary>
              <div className="mt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Total: {whatsAppTemplateMapStats.total}
                </span>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                  Activos: {whatsAppTemplateMapStats.active}
                </span>
                <span className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
                  Categorias: {whatsAppTemplateMapStats.categories}
                </span>
                <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                  Pendientes: {whatsAppTemplateMapStats.submitted}
                </span>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                  Aprobados: {whatsAppTemplateMapStats.approved}
                </span>
                <span className="rounded-full bg-rose-100 px-2 py-1 text-xs text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">
                  Rechazados: {whatsAppTemplateMapStats.rejected}
                </span>
                <span className="rounded-full bg-violet-100 px-2 py-1 text-xs text-violet-700 dark:bg-violet-900/40 dark:text-violet-200">
                  SLA prom. aprobación: {whatsAppTemplateMapStats.avgApprovalHours === null ? 'N/D' : `${whatsAppTemplateMapStats.avgApprovalHours.toFixed(1)}h`}
                </span>
                <span className={`rounded-full px-2 py-1 text-xs ${whatsAppTemplateMapStats.slaLevel === 'red'
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200'
                  : whatsAppTemplateMapStats.slaLevel === 'yellow'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                  }`}>
                  SLA estado: {whatsAppTemplateMapStats.slaLevel === 'red' ? 'Crítico' : whatsAppTemplateMapStats.slaLevel === 'yellow' ? 'Alerta' : 'OK'}
                </span>
                <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                  Pendientes {'>'}{whatsAppTemplateMapStats.warningPendingHours}h: {whatsAppTemplateMapStats.pendingWarningCount}
                </span>
                <span className="rounded-full bg-rose-100 px-2 py-1 text-xs text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">
                  Pendientes {'>'}{whatsAppTemplateMapStats.criticalPendingHours}h: {whatsAppTemplateMapStats.pendingCriticalCount}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Máx. espera pendiente: {whatsAppTemplateMapStats.maxPendingHours === null ? 'N/D' : `${whatsAppTemplateMapStats.maxPendingHours.toFixed(1)}h`}
                </span>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                Ver
                <select
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={whatsAppTemplateApprovalFilter}
                  onChange={(e) => setWhatsAppTemplateApprovalFilter(e.target.value as 'all' | WhatsAppTemplateApprovalStatus)}
                  disabled={whatsAppLoading || whatsAppSaving}
                >
                  <option value="all">Todos</option>
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void exportWhatsAppTemplateApprovalsCsv()
                }}
                disabled={whatsAppExporting || whatsAppLoading || whatsAppSaving}
              >
                {whatsAppExporting ? 'Exportando CSV…' : 'Exportar historial CSV'}
              </Button>
            </div>

            <div className="mb-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-700 dark:bg-slate-900/40">
              <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
                Umbral alerta pendientes (h)
                <input
                  type="number"
                  min={1}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={whatsAppSettings.template_sla_warning_pending_hours}
                  onChange={(e) => {
                    const value = Math.max(1, Number(e.target.value || 1))
                    setWhatsAppSettings((prev) => ({
                      ...prev,
                      template_sla_warning_pending_hours: value,
                      template_sla_critical_pending_hours: Math.max(prev.template_sla_critical_pending_hours, value),
                    }))
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
                Umbral crítico pendientes (h)
                <input
                  type="number"
                  min={1}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={whatsAppSettings.template_sla_critical_pending_hours}
                  onChange={(e) => {
                    const value = Math.max(1, Number(e.target.value || 1))
                    setWhatsAppSettings((prev) => ({
                      ...prev,
                      template_sla_critical_pending_hours: Math.max(value, prev.template_sla_warning_pending_hours),
                    }))
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
                Umbral alerta promedio (h)
                <input
                  type="number"
                  min={1}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={whatsAppSettings.template_sla_warning_approval_hours}
                  onChange={(e) => {
                    const value = Math.max(1, Number(e.target.value || 1))
                    setWhatsAppSettings((prev) => ({
                      ...prev,
                      template_sla_warning_approval_hours: value,
                      template_sla_critical_approval_hours: Math.max(prev.template_sla_critical_approval_hours, value),
                    }))
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
                Umbral crítico promedio (h)
                <input
                  type="number"
                  min={1}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={whatsAppSettings.template_sla_critical_approval_hours}
                  onChange={(e) => {
                    const value = Math.max(1, Number(e.target.value || 1))
                    setWhatsAppSettings((prev) => ({
                      ...prev,
                      template_sla_critical_approval_hours: Math.max(value, prev.template_sla_warning_approval_hours),
                    }))
                  }}
                />
              </label>
            </div>

            {whatsAppError ? (
              <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">{whatsAppError}</div>
            ) : null}
            {whatsAppMessage ? (
              <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200">{whatsAppMessage}</div>
            ) : null}

            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
              Umbrales SLA persistidos por ambiente ({mailSettingsEnvironment}). Última actualización:{' '}
              {whatsAppSettingsUpdatedAt
                ? `${formatDate(whatsAppSettingsUpdatedAt)} por ${whatsAppSettingsUpdatedBy?.username || 'usuario desconocido'}`
                : 'sin registros aún.'}
            </div>

            <details className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
              <summary className="cursor-pointer list-none text-sm font-medium text-slate-800 dark:text-slate-100">
                Historial de cambios SLA (WhatsApp templates)
              </summary>
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Registro de cambios de umbrales para el ambiente {mailSettingsEnvironment}.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-9"
                      onClick={() => {
                        void exportWhatsAppTemplateSlaAuditsCsv()
                      }}
                      disabled={whatsAppTemplateSlaAuditsExporting || whatsAppTemplateSlaAuditsLoading}
                    >
                      {whatsAppTemplateSlaAuditsExporting ? 'Exportando…' : 'Exportar CSV'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-9"
                      onClick={() => {
                        void loadWhatsAppTemplateSlaAudits(whatsAppTemplateSlaAuditsOffset)
                      }}
                      disabled={whatsAppTemplateSlaAuditsLoading}
                    >
                      Actualizar historial
                    </Button>
                  </div>
                </div>

                {whatsAppTemplateSlaAuditsLoading ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400">Cargando historial SLA…</div>
                ) : whatsAppTemplateSlaAudits.length === 0 ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400">No hay cambios SLA registrados aún.</div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          <tr>
                            <th className="px-3 py-2">Fecha</th>
                            <th className="px-3 py-2">Usuario</th>
                            <th className="px-3 py-2">Pendientes (alerta/crítico)</th>
                            <th className="px-3 py-2">Promedio aprobación (alerta/crítico)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                          {whatsAppTemplateSlaAudits.map((audit) => (
                            <tr key={audit.id} className="bg-white transition-colors hover:bg-slate-50/80 dark:bg-slate-900 dark:hover:bg-slate-800/70">
                              <td className="px-3 py-2">{formatDate(audit.created_at)}</td>
                              <td className="px-3 py-2">{audit.updated_by?.username || 'Sistema'}</td>
                              <td className="px-3 py-2 text-xs">
                                {audit.previous_warning_pending_hours}h/{audit.previous_critical_pending_hours}h → {audit.new_warning_pending_hours}h/{audit.new_critical_pending_hours}h
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {audit.previous_warning_approval_hours}h/{audit.previous_critical_approval_hours}h → {audit.new_warning_approval_hours}h/{audit.new_critical_approval_hours}h
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-col gap-2 text-xs text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        Mostrando {whatsAppTemplateSlaAuditsTotal === 0 ? 0 : whatsAppTemplateSlaAuditsOffset + 1}–
                        {Math.min(whatsAppTemplateSlaAuditsOffset + whatsAppTemplateSlaAudits.length, whatsAppTemplateSlaAuditsTotal)} de {whatsAppTemplateSlaAuditsTotal}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-9"
                          disabled={whatsAppTemplateSlaAuditsOffset <= 0 || whatsAppTemplateSlaAuditsLoading}
                          onClick={() => {
                            void loadWhatsAppTemplateSlaAudits(Math.max(0, whatsAppTemplateSlaAuditsOffset - whatsAppTemplateSlaAuditsLimit))
                          }}
                        >
                          Anterior
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-9"
                          disabled={whatsAppTemplateSlaAuditsOffset + whatsAppTemplateSlaAudits.length >= whatsAppTemplateSlaAuditsTotal || whatsAppTemplateSlaAuditsLoading}
                          onClick={() => {
                            void loadWhatsAppTemplateSlaAudits(whatsAppTemplateSlaAuditsOffset + whatsAppTemplateSlaAuditsLimit)
                          }}
                        >
                          Siguiente
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </details>

            <details className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
              <summary className="cursor-pointer list-none text-sm font-medium text-slate-800 dark:text-slate-100">
                Crear o actualizar mapeo
              </summary>
              <form
                className="mt-3 grid gap-3 md:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveWhatsAppTemplateMap()
                }}
              >
                <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                  Notification type
                  <input
                    type="text"
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="es_CO"
                    value={whatsAppForm.language_code}
                    onChange={(e) => setWhatsAppForm((prev) => ({ ...prev, language_code: e.target.value }))}
                    disabled={whatsAppSaving}
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                  Category
                  <select
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="recipient_name,title,body,action_url"
                    value={whatsAppBodyParametersRaw}
                    onChange={(e) => setWhatsAppBodyParametersRaw(e.target.value)}
                    disabled={whatsAppSaving}
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
                  Default components (JSON array opcional)
                  <textarea
                    className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                  <Button type="submit" disabled={whatsAppSaving} className="min-h-10">
                    {whatsAppSaving ? 'Guardando…' : 'Guardar mapeo'}
                  </Button>
                </div>
              </form>
            </details>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Template</th>
                    <th className="px-3 py-2">Activo</th>
                    <th className="px-3 py-2">Aprobación</th>
                    <th className="px-3 py-2">Historial</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {whatsAppTemplateMaps.map((item) => (
                    <tr key={item.id} className="bg-white dark:bg-slate-900">
                      <td className="px-3 py-2 font-medium">
                        <div>{item.notification_type}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{item.category}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div>{item.template_name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{item.language_code}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-1 text-xs ${item.is_active
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}>
                          {item.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div>
                          <span className={`rounded-full px-2 py-1 text-xs ${item.approval_status === 'approved'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                            : item.approval_status === 'submitted'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
                              : item.approval_status === 'rejected'
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200'
                                : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}>
                            {item.approval_status}
                          </span>
                        </div>
                        {item.rejection_reason ? (
                          <div className="mt-1 text-xs text-rose-600 dark:text-rose-300">Motivo: {item.rejection_reason}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                        {item.approval_status === 'approved' && item.approved_at ? (
                          <div>
                            Aprobado por {item.approved_by_user?.username || `#${item.approved_by || '-'}`}
                            <div className="text-slate-500 dark:text-slate-400">{formatDate(item.approved_at)}</div>
                          </div>
                        ) : null}
                        {item.approval_status === 'submitted' && item.submitted_at ? (
                          <div>
                            Enviado por {item.submitted_by_user?.username || `#${item.submitted_by || '-'}`}
                            <div className="text-slate-500 dark:text-slate-400">{formatDate(item.submitted_at)}</div>
                          </div>
                        ) : null}
                        {item.approval_status === 'rejected' && item.rejected_at ? (
                          <div>
                            Rechazado por {item.rejected_by_user?.username || `#${item.rejected_by || '-'}`}
                            <div className="text-slate-500 dark:text-slate-400">{formatDate(item.rejected_at)}</div>
                          </div>
                        ) : null}
                        {item.approval_status === 'draft' ? <span className="text-slate-500 dark:text-slate-400">Sin envío a aprobación</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => loadWhatsAppTemplateMapIntoForm(item)} disabled={whatsAppSaving}>
                            Editar
                          </Button>
                          {(item.approval_status === 'draft' || item.approval_status === 'rejected') ? (
                            <Button variant="outline" size="sm" onClick={() => submitWhatsAppTemplateMap(item.id)} disabled={whatsAppSaving}>
                              Enviar aprobación
                            </Button>
                          ) : null}
                          {isSuperAdmin && item.approval_status === 'submitted' ? (
                            <>
                              <Button variant="outline" size="sm" onClick={() => approveWhatsAppTemplateMap(item.id)} disabled={whatsAppSaving}>
                                Aprobar
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => rejectWhatsAppTemplateMap(item.id)} disabled={whatsAppSaving}>
                                Rechazar
                              </Button>
                            </>
                          ) : null}
                          <Button variant="outline" size="sm" onClick={() => removeWhatsAppTemplateMap(item.id)} disabled={whatsAppSaving}>
                            Eliminar
                          </Button>
                        </div>
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
              <summary className="cursor-pointer list-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100">
                Salud operativa WhatsApp ({whatsAppHours}h){' '}
                <span className={`text-xs ${whatsAppHealth ? (whatsAppHealth.breach ? 'text-rose-600' : 'text-emerald-600') : 'text-slate-500 dark:text-slate-400'}`}>
                  {whatsAppHealth ? (whatsAppHealth.breach ? 'Breach' : 'OK') : 'Sin datos'}
                </span>
              </summary>
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900/40">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      className="h-9 w-20 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      value={whatsAppHours}
                      onChange={(e) => setWhatsAppHours(Math.max(1, Number(e.target.value || 24)))}
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400">Horas de ventana</span>
                  </div>
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

        <Card>
          <CardContent className="pt-4">
            <details
              open={whatsAppPanels.deliveries}
              onToggle={(e) => {
                const nextOpen = (e.currentTarget as HTMLDetailsElement).open
                setWhatsAppPanels((prev) => ({ ...prev, deliveries: nextOpen }))
              }}
            >
              <summary className="cursor-pointer list-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100">
                Últimos envíos WhatsApp ({whatsAppRecentDeliveries.length})
              </summary>
              <div className="mt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900/40">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      Total: {whatsAppRecentDeliveries.length}
                    </span>
                    <span className="rounded-full bg-rose-100 px-2 py-1 text-xs text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">
                      Fallidos: {whatsAppRecentDeliveries.filter((item) => item.status === 'failed').length}
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => loadWhatsAppData(whatsAppHours)} disabled={whatsAppLoading}>
                    Actualizar lista
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      <tr>
                        <th className="px-3 py-2">Fecha</th>
                        <th className="px-3 py-2">Estado</th>
                        <th className="px-3 py-2">Destino</th>
                        <th className="px-3 py-2">Resultado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {whatsAppRecentDeliveriesPageItems.map((item) => (
                        <tr key={item.id} className="bg-white dark:bg-slate-900">
                          <td className="px-3 py-2">{formatDate(item.created_at)}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-1 text-xs ${item.status === 'failed'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200'
                              : item.status === 'sent' || item.status === 'delivered' || item.status === 'read'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                                : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              }`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="px-3 py-2">{item.recipient_phone}</td>
                          <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                            {item.error_code ? `code ${item.error_code}` : item.provider_message_id ? `msg ${item.provider_message_id}` : '-'}
                            {item.error_message ? <div className="mt-1 text-rose-600 dark:text-rose-300">{item.error_message}</div> : null}
                            {item.skip_reason ? <div className="mt-1 text-amber-700 dark:text-amber-300">skip: {item.skip_reason}</div> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {whatsAppRecentDeliveries.length > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      Página {whatsAppDeliveriesPage} de {whatsAppDeliveriesTotalPages}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setWhatsAppDeliveriesPage((prev) => Math.max(1, prev - 1))}
                        disabled={whatsAppDeliveriesPage <= 1}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setWhatsAppDeliveriesPage((prev) => Math.min(whatsAppDeliveriesTotalPages, prev + 1))}
                        disabled={whatsAppDeliveriesPage >= whatsAppDeliveriesTotalPages}
                      >
                        Siguiente
                      </Button>
                    </div>
                  </div>
                ) : null}
                {whatsAppRecentDeliveries.length === 0 ? (
                  <div className="py-3 text-sm text-slate-500 dark:text-slate-400">No hay envíos recientes registrados.</div>
                ) : null}
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

import { api } from './api'

export type MailSettingsEnvironment = 'development' | 'production'

export type BackupItem = {
  filename: string
  size_bytes: number
  created_at: string
}

export type MailgunSettingsResponse = {
  environment: MailSettingsEnvironment
  kampus_email_backend: 'console' | 'mailgun'
  default_from_email: string
  server_email: string
  mailgun_sender_domain: string
  mailgun_api_url: string
  mailgun_webhook_strict: boolean
  mailgun_api_key_masked: string
  mailgun_webhook_signing_key_masked: string
  mailgun_api_key_configured: boolean
  mailgun_webhook_signing_key_configured: boolean
  updated_at: string | null
}

export type MailgunSettingsPayload = {
  environment?: MailSettingsEnvironment
  kampus_email_backend: 'console' | 'mailgun'
  default_from_email: string
  server_email: string
  mailgun_sender_domain: string
  mailgun_api_url: string
  mailgun_webhook_strict: boolean
  mailgun_api_key?: string
  mailgun_webhook_signing_key?: string
}

export type MailgunSettingsAuditItem = {
  id: number
  environment: MailSettingsEnvironment
  created_at: string
  changed_fields: string[]
  rotated_api_key: boolean
  rotated_webhook_signing_key: boolean
  updated_by: {
    id: number
    username: string
    email: string
    role: string
  } | null
}

export type MailgunSettingsAuditListResponse = {
  results: MailgunSettingsAuditItem[]
  total: number
  limit: number
  offset: number
}

export type EmailTemplateType = 'transactional' | 'marketing'

export type EmailTemplateItem = {
  id: number
  slug: string
  name: string
  description: string
  template_type: EmailTemplateType
  category: string
  subject_template: string
  body_text_template: string
  body_html_template: string
  allowed_variables: string[]
  is_active: boolean
  updated_at: string
}

export type EmailTemplateListResponse = {
  results: EmailTemplateItem[]
}

export type EmailTemplatePayload = {
  slug: string
  name: string
  description: string
  template_type: EmailTemplateType
  category: string
  subject_template: string
  body_text_template: string
  body_html_template: string
  allowed_variables: string[]
  is_active: boolean
}

export type EmailTemplatePreviewResponse = {
  subject: string
  body_text: string
  body_html: string
}

export type WhatsAppTemplateCategory = 'utility' | 'authentication' | 'marketing'

export type WhatsAppTemplateMapItem = {
  id: number
  notification_type: string
  template_name: string
  language_code: string
  body_parameter_names: string[]
  default_components: Array<Record<string, unknown>>
  category: WhatsAppTemplateCategory
  is_active: boolean
  updated_at: string
}

export type WhatsAppTemplateMapPayload = {
  notification_type: string
  template_name: string
  language_code: string
  body_parameter_names: string[]
  default_components: Array<Record<string, unknown>>
  category: WhatsAppTemplateCategory
  is_active: boolean
}

export type WhatsAppTemplateMapListResponse = {
  results: WhatsAppTemplateMapItem[]
}

export type WhatsAppHealthResponse = {
  window_hours: number
  totals: {
    total: number
    sent: number
    delivered: number
    read: number
    failed: number
    suppressed: number
  }
  success_rate: number
  thresholds: {
    max_failed: number
    min_success_rate: number
  }
  breach: boolean
  top_error_codes: Array<{ error_code: string; total: number }>
  institution_breakdown: Array<{
    institution_id: number | null
    institution__name: string | null
    total: number
    sent: number
    delivered: number
    read: number
    failed: number
    suppressed: number
  }>
  recent_institution_metrics: Array<{
    institution_id: number
    institution__name: string
    window_start: string
    window_end: string
    total: number
    sent: number
    delivered: number
    read: number
    failed: number
    suppressed: number
    success_rate: number
  }>
}

export type WhatsAppSettingsResponse = {
  environment: MailSettingsEnvironment
  enabled: boolean
  provider: string
  graph_base_url: string
  api_version: string
  phone_number_id: string
  access_token_masked: string
  app_secret_masked: string
  webhook_verify_token_masked: string
  webhook_strict: boolean
  http_timeout_seconds: number
  send_mode: 'template' | 'text'
  template_fallback_name: string
  access_token_configured: boolean
  app_secret_configured: boolean
  webhook_verify_token_configured: boolean
  updated_at: string | null
}

export type WhatsAppSettingsPayload = {
  environment?: MailSettingsEnvironment
  enabled: boolean
  provider: string
  graph_base_url: string
  api_version: string
  phone_number_id: string
  access_token?: string
  app_secret?: string
  webhook_verify_token?: string
  webhook_strict: boolean
  http_timeout_seconds: number
  send_mode: 'template' | 'text'
  template_fallback_name: string
}

export type WhatsAppTestSendResponse = {
  detail: string
  mode?: 'template' | 'text'
  status: string
  error?: string
  error_code?: string
  delivery_id?: number
  provider_message_id?: string
}

export type WhatsAppTestSendPayload = {
  test_phone: string
  mode?: 'template' | 'text'
  message?: string
  template_name?: string
  language_code?: string
  template_header_text?: string
  body_parameters?: string[]
}

export type WhatsAppDeliveryItem = {
  id: number
  recipient_phone: string
  status: string
  provider_message_id: string
  error_code: string
  skip_reason: string
  error_message: string
  created_at: string
  updated_at: string
}

export type WhatsAppRecentDeliveriesResponse = {
  results: WhatsAppDeliveryItem[]
}

export const systemApi = {
  listBackups: () => api.get<{ results: BackupItem[] }>('/api/system/backups/'),

  createBackup: (params?: { include_media?: boolean }) =>
    api.post<{ filename: string; size_bytes: number }>('/api/system/backups/', {
      include_media: !!params?.include_media,
    }),

  downloadBackup: (filename: string) =>
    api.get<Blob>(`/api/system/backups/${encodeURIComponent(filename)}/download/`, {
      responseType: 'blob',
    }),

  deleteBackup: (filename: string) =>
    api.delete<void>(`/api/system/backups/${encodeURIComponent(filename)}/`),

  restoreFromExisting: (params: { filename: string; mode: 'restore' | 'import'; confirm?: boolean }) =>
    api.post<{ detail: string; mode: string; filename: string }>('/api/system/backups/restore/', {
      filename: params.filename,
      mode: params.mode,
      confirm: !!params.confirm,
    }),

  uploadAndRestore: (params: { file: File; mode: 'restore' | 'import'; confirm?: boolean }) => {
    const form = new FormData()
    form.append('file', params.file)
    form.append('mode', params.mode)
    form.append('confirm', String(!!params.confirm))

    return api.post<{ detail: string; mode: string; filename: string }>('/api/system/backups/upload/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })

  },

  getMailgunSettings: (environment: MailSettingsEnvironment = 'development') =>
    api.get<MailgunSettingsResponse>(`/api/communications/settings/mailgun/?environment=${environment}`),

  updateMailgunSettings: (payload: MailgunSettingsPayload, environment: MailSettingsEnvironment = 'development') =>
    api.put<MailgunSettingsResponse>(`/api/communications/settings/mailgun/?environment=${environment}`, {
      ...payload,
      environment,
    }),

  sendMailgunTestEmail: (testEmail: string, environment: MailSettingsEnvironment = 'development') =>
    api.post<{ detail: string; status: string; error?: string }>(`/api/communications/settings/mailgun/test/?environment=${environment}`, {
      test_email: testEmail,
      environment,
    }),

  getMailgunSettingsAudits: (environment: MailSettingsEnvironment = 'development', limit = 20, offset = 0) =>
    api.get<MailgunSettingsAuditListResponse>(`/api/communications/settings/mailgun/audits/?environment=${environment}&limit=${limit}&offset=${offset}`),

  exportMailgunSettingsAuditsCsv: (environment: MailSettingsEnvironment = 'development') =>
    api.get<Blob>(`/api/communications/settings/mailgun/audits/export/?environment=${environment}`, {
      responseType: 'blob',
    }),

  listEmailTemplates: () => api.get<EmailTemplateListResponse>('/api/communications/settings/email-templates/'),

  getEmailTemplate: (slug: string) =>
    api.get<EmailTemplateItem>(`/api/communications/settings/email-templates/${encodeURIComponent(slug)}/`),

  upsertEmailTemplate: (slug: string, payload: EmailTemplatePayload) =>
    api.put<EmailTemplateItem>(`/api/communications/settings/email-templates/${encodeURIComponent(slug)}/`, payload),

  previewEmailTemplate: (slug: string, context: Record<string, unknown>) =>
    api.post<EmailTemplatePreviewResponse>(`/api/communications/settings/email-templates/${encodeURIComponent(slug)}/preview/`, {
      context,
    }),

  sendEmailTemplateTest: (slug: string, testEmail: string, context: Record<string, unknown>) =>
    api.post<{ detail: string; status: string; error?: string }>(`/api/communications/settings/email-templates/${encodeURIComponent(slug)}/test/`, {
      test_email: testEmail,
      context,
    }),

  listWhatsAppTemplateMaps: () => api.get<WhatsAppTemplateMapListResponse>('/api/communications/settings/whatsapp/templates/'),

  upsertWhatsAppTemplateMap: (payload: WhatsAppTemplateMapPayload) =>
    api.put<WhatsAppTemplateMapItem>('/api/communications/settings/whatsapp/templates/', payload),

  updateWhatsAppTemplateMap: (mapId: number, payload: Partial<WhatsAppTemplateMapPayload>) =>
    api.put<WhatsAppTemplateMapItem>(`/api/communications/settings/whatsapp/templates/${mapId}/`, payload),

  deleteWhatsAppTemplateMap: (mapId: number) => api.delete<void>(`/api/communications/settings/whatsapp/templates/${mapId}/`),

  getWhatsAppHealth: (hours = 24) =>
    api.get<WhatsAppHealthResponse>(`/api/communications/settings/whatsapp/health/?hours=${Math.max(1, hours)}`),

  getWhatsAppSettings: (environment: MailSettingsEnvironment = 'development') =>
    api.get<WhatsAppSettingsResponse>(`/api/communications/settings/whatsapp/?environment=${environment}`),

  updateWhatsAppSettings: (payload: WhatsAppSettingsPayload, environment: MailSettingsEnvironment = 'development') =>
    api.put<WhatsAppSettingsResponse>(`/api/communications/settings/whatsapp/?environment=${environment}`, {
      ...payload,
      environment,
    }),

  sendWhatsAppTestMessage: (payload: WhatsAppTestSendPayload, environment: MailSettingsEnvironment = 'development') =>
    api.post<WhatsAppTestSendResponse>(`/api/communications/settings/whatsapp/test/?environment=${environment}`, {
      ...payload,
      environment,
    }),

  listRecentWhatsAppDeliveries: (limit = 20) =>
    api.get<WhatsAppRecentDeliveriesResponse>(`/api/communications/settings/whatsapp/deliveries/?limit=${Math.max(1, Math.min(limit, 100))}`),
}

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
}

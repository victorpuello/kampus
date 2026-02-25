import { api } from './api'

export type BackupItem = {
  filename: string
  size_bytes: number
  created_at: string
}

export type MailgunSettingsResponse = {
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

  getMailgunSettings: () => api.get<MailgunSettingsResponse>('/api/communications/settings/mailgun/'),

  updateMailgunSettings: (payload: MailgunSettingsPayload) =>
    api.put<MailgunSettingsResponse>('/api/communications/settings/mailgun/', payload),

  sendMailgunTestEmail: (testEmail: string) =>
    api.post<{ detail: string; status: string; error?: string }>('/api/communications/settings/mailgun/test/', {
      test_email: testEmail,
    }),

  getMailgunSettingsAudits: (limit = 20, offset = 0) =>
    api.get<MailgunSettingsAuditListResponse>(`/api/communications/settings/mailgun/audits/?limit=${limit}&offset=${offset}`),

  exportMailgunSettingsAuditsCsv: () =>
    api.get<Blob>('/api/communications/settings/mailgun/audits/export/', {
      responseType: 'blob',
    }),
}

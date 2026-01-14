import { api } from './api'

export type BackupItem = {
  filename: string
  size_bytes: number
  created_at: string
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
}

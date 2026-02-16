import { api } from './api'

export type ReportJobStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'

export type ReportJob = {
  id: number
  report_type: string
  params: Record<string, unknown>
  status: ReportJobStatus
  progress: number | null
  created_at: string
  started_at: string | null
  finished_at: string | null
  expires_at: string | null
  output_filename: string | null
  output_size_bytes: number | null
  error_code: string | null
  error_message: string | null
  download_url: string | null
  preview_url?: string | null
}

export const reportsApi = {
  listJobs: (params?: Record<string, unknown>) =>
    api.get<ReportJob[]>('/api/reports/jobs/', { params }),

  createJob: (payload: { report_type: string; params?: Record<string, unknown> }) =>
    api.post<ReportJob>('/api/reports/jobs/', payload),

  getJob: (id: number) => api.get<ReportJob>(`/api/reports/jobs/${id}/`),

  previewJobHtml: (id: number) =>
    api.get<string>(`/api/reports/jobs/${id}/preview/`, {
      headers: { Accept: 'text/html' },
      // Axios responseType typings are limited; runtime supports 'text'
      responseType: 'text' as never,
    }),

  downloadJob: (id: number) =>
    api.get<Blob>(`/api/reports/jobs/${id}/download/`, {
      responseType: 'blob',
    }),

  createAcademicPeriodEnrollmentJob: (enrollmentId: number, periodId: number) =>
    reportsApi.createJob({
      report_type: 'ACADEMIC_PERIOD_ENROLLMENT',
      params: { enrollment_id: enrollmentId, period_id: periodId },
    }),

  createAcademicPeriodGroupJob: (groupId: number, periodId: number) =>
    reportsApi.createJob({
      report_type: 'ACADEMIC_PERIOD_GROUP',
      params: { group_id: groupId, period_id: periodId },
    }),

  createAcademicPeriodSabanaJob: (groupId: number, periodId: number) =>
    reportsApi.createJob({
      report_type: 'ACADEMIC_PERIOD_SABANA',
      params: { group_id: groupId, period_id: periodId },
    }),
}

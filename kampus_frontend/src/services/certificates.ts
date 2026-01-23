import { api } from './api'
import type { ReportJob } from './reports'

export type CertificateStudiesIssueRegisteredPayload = {
  enrollment_id: number
  academic_year_id?: number
}

export type CertificateStudiesIssueManualPayload = {
  student_full_name: string
  document_type?: string
  document_number: string
  grade_id: number
  academic_year?: number | string
  campus_id?: number
}

export type CertificateStudiesIssuePayload =
  | CertificateStudiesIssueRegisteredPayload
  | CertificateStudiesIssueManualPayload

export type CertificateDocumentTypeOption = {
  value: string
  label: string
}

export type CertificateDocumentTypesResponse = {
  options: CertificateDocumentTypeOption[]
  allow_other: boolean
}

export type CertificateIssuesListParams = {
  certificate_type?: string
  status?: string
  start_date?: string
  end_date?: string
  limit?: number
  q?: string
  issued_by?: number
}

export type CertificateIssueListItem = {
  uuid: string
  certificate_type: string
  status: string
  issued_at: string
  amount_cop: number
  student_full_name: string
  document_number: string
  academic_year: string | number
  grade_name: string
  issued_by: { id: number; name: string } | null
  has_pdf: boolean
}

export type CertificateIssuesListResponse = {
  results: CertificateIssueListItem[]
  count: number
  limit: number
}

export type CertificateRevenueSummaryParams = {
  certificate_type?: string
  start_date?: string
  end_date?: string
}

export type CertificateRevenueSummaryResponse = {
  total_count: number
  total_amount_cop: number
}

export const certificatesApi = {
  issueStudies: (payload: CertificateStudiesIssuePayload) =>
    api.post<ReportJob>('/api/certificates/studies/issue/?async=1', payload),

  previewStudies: (payload: CertificateStudiesIssuePayload) =>
    api.post('/api/certificates/studies/preview/', payload, {
      responseType: 'text',
      headers: {
        Accept: 'text/html',
      },
    }),

  listDocumentTypes: () => api.get<CertificateDocumentTypesResponse>('/api/certificates/document-types/'),

  listIssues: (params: CertificateIssuesListParams) =>
    api.get<CertificateIssuesListResponse>('/api/certificates/issues/', {
      params,
    }),

  revenueSummary: (params: CertificateRevenueSummaryParams) =>
    api.get<CertificateRevenueSummaryResponse>('/api/certificates/revenue/summary/', {
      params,
    }),

  downloadIssuePdf: (uuid: string) =>
    api.get(`/api/certificates/issues/${uuid}/pdf/`, {
      responseType: 'blob',
    }),
}

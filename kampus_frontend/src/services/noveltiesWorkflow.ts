import { api } from './api'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export type NoveltyStatus =
  | 'DRAFT'
  | 'FILED'
  | 'IN_REVIEW'
  | 'PENDING_DOCS'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXECUTED'
  | 'REVERTED'
  | 'CLOSED'

export interface NoveltyType {
  id: number
  code: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface NoveltyReason {
  id: number
  novelty_type: number
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface NoveltyExecution {
  id: number
  case: number
  idempotency_key: string
  executed_by: number | null
  executed_at: string
  before_snapshot: Record<string, unknown>
  after_snapshot: Record<string, unknown>
}

export interface NoveltyReversion {
  id: number
  case: number
  reverted_by: number | null
  reverted_at: string
  comment: string
  before_snapshot: Record<string, unknown>
  after_snapshot: Record<string, unknown>
}

export interface NoveltyCase {
  id: number
  student: number
  institution: number | null
  novelty_type: number
  novelty_reason: number | null
  status: NoveltyStatus
  radicado: string
  radicado_year: number | null
  radicado_seq: number | null
  filed_at: string | null
  requested_at: string
  effective_date: string | null
  executed_at: string | null
  closed_at: string | null
  created_by: number | null
  payload: Record<string, unknown>
  idempotency_key: string
  execution: NoveltyExecution | null
  reversion: NoveltyReversion | null
  created_at: string
  updated_at: string
}

export interface NoveltyCaseTransition {
  id: number
  case: number
  from_status: NoveltyStatus
  to_status: NoveltyStatus
  actor: number | null
  actor_role: string
  comment: string
  ip_address: string | null
  created_at: string
}

export interface NoveltyAttachment {
  id: number
  case: number
  doc_type: string
  file: string
  issued_at: string | null
  issued_by: string
  valid_until: string | null
  visibility: string
  uploaded_by: number | null
  uploaded_at: string
}

export interface NoveltyRequiredDocumentRule {
  id: number
  novelty_type: number
  novelty_reason: number | null
  doc_type: string
  is_required: boolean
  visibility: string
  created_at: string
  updated_at: string
}

const API_PREFIX = '/api/novelties-workflow'

function unwrapList<T>(data: PaginatedResponse<T> | T[]): T[] {
  if (Array.isArray(data)) return data
  return data.results
}

export const noveltiesWorkflowApi = {
  listInbox: async (params?: { page?: number; page_size?: number; status?: NoveltyStatus }) => {
    const res = await api.get<PaginatedResponse<NoveltyCase> | NoveltyCase[]>(`${API_PREFIX}/cases/inbox/`, {
      params,
    })
    return { raw: res.data, items: unwrapList(res.data) }
  },

  listCases: (params?: { page?: number; page_size?: number; status?: NoveltyStatus; student?: number }) =>
    api.get<PaginatedResponse<NoveltyCase> | NoveltyCase[]>(`${API_PREFIX}/cases/`, { params }),

  getCase: (id: number) => api.get<NoveltyCase>(`${API_PREFIX}/cases/${id}/`),

  createCase: (input: {
    student: number
    institution?: number | null
    novelty_type: number
    novelty_reason?: number | null
    effective_date?: string | null
    payload?: Record<string, unknown>
  }) => api.post<NoveltyCase>(`${API_PREFIX}/cases/`, input),

  listTypes: async () => {
    const res = await api.get<PaginatedResponse<NoveltyType> | NoveltyType[]>(`${API_PREFIX}/types/`, {
      params: { is_active: true },
    })
    return { raw: res.data, items: unwrapList(res.data) }
  },

  listReasons: async (params?: { novelty_type?: number; is_active?: boolean }) => {
    const res = await api.get<PaginatedResponse<NoveltyReason> | NoveltyReason[]>(`${API_PREFIX}/reasons/`, {
      params: { ...params, is_active: params?.is_active ?? true },
    })
    return { raw: res.data, items: unwrapList(res.data) }
  },

  listTransitions: (caseId: number) =>
    api.get<PaginatedResponse<NoveltyCaseTransition> | NoveltyCaseTransition[]>(`${API_PREFIX}/case-transitions/`, {
      params: { case: caseId, ordering: '-created_at' },
    }),

  transition: (caseId: number, action: string, input?: { comment?: string }) =>
    api.post<NoveltyCase>(`${API_PREFIX}/cases/${caseId}/${action}/`, input || {}),

  execute: (caseId: number, input: { comment: string; idempotency_key?: string }) =>
    api.post<NoveltyCase>(`${API_PREFIX}/cases/${caseId}/execute/`, input),

  revert: (caseId: number, input: { comment: string }) => api.post<NoveltyCase>(`${API_PREFIX}/cases/${caseId}/revert/`, input),

  listAttachments: (caseId: number) =>
    api.get<PaginatedResponse<NoveltyAttachment> | NoveltyAttachment[]>(`${API_PREFIX}/attachments/`, {
      params: { case: caseId },
    }),

  listRequiredDocumentRules: (params?: { novelty_type?: number; novelty_reason?: number | null; is_required?: boolean }) =>
    api.get<PaginatedResponse<NoveltyRequiredDocumentRule> | NoveltyRequiredDocumentRule[]>(
      `${API_PREFIX}/required-document-rules/`,
      {
        params,
      }
    ),

  uploadAttachment: (input: { caseId: number; doc_type: string; file: File }) => {
    const form = new FormData()
    form.append('case', String(input.caseId))
    form.append('doc_type', input.doc_type)
    form.append('file', input.file)

    return api.post<NoveltyAttachment>(`${API_PREFIX}/attachments/`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

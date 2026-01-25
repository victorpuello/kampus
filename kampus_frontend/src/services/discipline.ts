import { api } from './api'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export type DisciplineCaseStatus = 'OPEN' | 'DECIDED' | 'CLOSED'
export type DisciplineManualSeverity = 'MINOR' | 'MAJOR' | 'VERY_MAJOR'
export type DisciplineLaw1620Type = 'I' | 'II' | 'III' | 'UNKNOWN'

export type DisciplineCaseListItem = {
  id: number
  student_id: number
  student_full_name: string
  enrollment_id: number
  academic_year: number | null
  grade_name: string
  group_name: string
  occurred_at: string
  location: string
  manual_severity: DisciplineManualSeverity
  law_1620_type: DisciplineLaw1620Type
  status: DisciplineCaseStatus
  sealed_at?: string | null
  sealed_by?: number | null
  sealed_hash?: string
  descargos_due_at?: string | null
  descargos_overdue?: boolean
  created_at: string
  updated_at: string
}

export type DisciplineCaseParticipant = {
  id: number
  student_id: number
  role: string
  notes: string
  created_at: string
}

export type DisciplineCaseAttachment = {
  id: number
  kind: string
  file: string
  description: string
  uploaded_by: number | null
  uploaded_at: string
}

export type DisciplineCaseEvent = {
  id: number
  event_type: string
  text: string
  created_by: number | null
  created_at: string
}

export type DisciplineCaseNotificationLog = {
  id: number
  channel: string
  status: string
  recipient_user: number | null
  recipient_family_member: number | null
  recipient_name: string
  recipient_contact: string
  note: string
  external_id: string
  error: string
  created_by: number | null
  created_at: string
  acknowledged_at: string | null
  acknowledged_by: number | null
}

export type ConvivenciaManual = {
  id: number
  institution: number
  title: string
  version: string
  is_active: boolean
  file: string
  uploaded_by: number | null
  uploaded_at: string
  extraction_status: 'PENDING' | 'DONE' | 'FAILED'
  extraction_error: string
  extracted_at: string | null
  created_at: string
  updated_at: string
}

export type DisciplineDecisionSuggestionStatus = 'DRAFT' | 'APPROVED' | 'APPLIED' | 'REJECTED'

export type DisciplineDecisionCitation = {
  chunk_id: number
  quote: string
  label: string
}

export type DisciplineDecisionSuggestion = {
  id: number
  case: number
  manual: number
  status: DisciplineDecisionSuggestionStatus
  suggested_decision_text: string
  reasoning: string
  citations: DisciplineDecisionCitation[]
  created_by: number | null
  created_at: string
  approved_by: number | null
  approved_at: string | null
  applied_by: number | null
  applied_at: string | null
}

export type DisciplineCaseDetail = {
  id: number
  student_id: number
  student_full_name: string
  enrollment_id: number
  academic_year: number | null
  grade_name: string
  group_name: string
  occurred_at: string
  location: string
  narrative: string
  manual_severity: DisciplineManualSeverity
  law_1620_type: DisciplineLaw1620Type
  status: DisciplineCaseStatus
  notified_guardian_at: string | null
  descargos_due_at?: string | null
  descargos_overdue?: boolean
  decided_at: string | null
  decided_by: number | null
  decision_text: string
  closed_at: string | null
  closed_by: number | null
  sealed_at?: string | null
  sealed_by?: number | null
  sealed_hash?: string
  created_by: number | null
  created_at: string
  updated_at: string
  participants: DisciplineCaseParticipant[]
  attachments: DisciplineCaseAttachment[]
  events: DisciplineCaseEvent[]
  notification_logs?: DisciplineCaseNotificationLog[]
  decision_suggestions?: DisciplineDecisionSuggestion[]
}

export const disciplineApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<DisciplineCaseListItem>>('/api/discipline/cases/', { params }),
  get: (id: number) => api.get<DisciplineCaseDetail>(`/api/discipline/cases/${id}/`),

  create: (data: {
    enrollment_id: number
    occurred_at: string
    location?: string
    narrative: string
    manual_severity: DisciplineManualSeverity
    law_1620_type: DisciplineLaw1620Type
  }) => api.post<DisciplineCaseDetail>('/api/discipline/cases/', data),

  addAttachment: (id: number, data: { file: File; kind?: string; description?: string }) => {
    const formData = new FormData()
    formData.append('file', data.file)
    if (data.kind) formData.append('kind', data.kind)
    if (data.description) formData.append('description', data.description)
    return api.post(`/api/discipline/cases/${id}/add_attachment/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  addParticipant: (id: number, data: { student_id: number; role: string; notes?: string }) =>
    api.post(`/api/discipline/cases/${id}/add_participant/`, data),

  notifyGuardian: (id: number, data?: { channel?: string; note?: string }) =>
    api.post(`/api/discipline/cases/${id}/notify_guardian/`, data || {}),

  acknowledgeGuardian: (id: number, data: { log_id: number; note?: string }) =>
    api.post(`/api/discipline/cases/${id}/acknowledge_guardian/`, data),

  setDescargosDeadline: (id: number, data: { descargos_due_at?: string | null }) =>
    api.post(`/api/discipline/cases/${id}/set_descargos_deadline/`, data),

  recordDescargos: (id: number, data: { text: string; file?: File }) => {
    const formData = new FormData()
    formData.append('text', data.text)
    if (data.file) formData.append('file', data.file)
    return api.post(`/api/discipline/cases/${id}/record_descargos/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  decide: (id: number, data: { decision_text: string }) =>
    api.post(`/api/discipline/cases/${id}/decide/`, data),

  close: (id: number) => api.post(`/api/discipline/cases/${id}/close/`, {}),

  addNote: (id: number, data: { text: string }) => api.post(`/api/discipline/cases/${id}/add-note/`, data),

  updateEvent: (caseId: number, eventId: number, data: { text: string }) =>
    api.patch(`/api/discipline/cases/${caseId}/events/${eventId}/`, data),
  deleteEvent: (caseId: number, eventId: number) => api.delete(`/api/discipline/cases/${caseId}/events/${eventId}/`),

  updateDecision: (id: number, data: { decision_text: string }) => api.patch(`/api/discipline/cases/${id}/decision/`, data),
  clearDecision: (id: number) => api.delete(`/api/discipline/cases/${id}/decision/`),

  downloadActa: async (id: number): Promise<Blob> => {
    const res = await api.get(`/api/discipline/cases/${id}/acta/?format=pdf`, {
      responseType: 'blob',
      headers: { Accept: 'application/pdf' },
    })
    return res.data as Blob
  },

  listManuals: () => api.get<ConvivenciaManual[]>('/api/discipline/manual/'),

  getActiveManual: () => api.get<ConvivenciaManual | null>('/api/discipline/manual/active/'),

  uploadManual: (data: { file?: File; text?: string; title?: string; version?: string; activate?: boolean }) => {
    const formData = new FormData()
    if (data.file) formData.append('file', data.file)
    if (data.text) formData.append('text', data.text)
    if (data.title) formData.append('title', data.title)
    if (data.version) formData.append('version', data.version)
    if (data.activate !== undefined) formData.append('activate', String(data.activate))
    return api.post<ConvivenciaManual>('/api/discipline/manual/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  activateManual: (id: number) => api.post(`/api/discipline/manual/${id}/activate/`, {}),
  processManual: (id: number) => api.post<ConvivenciaManual>(`/api/discipline/manual/${id}/process/`, {}),

  suggestDecisionAi: (id: number) =>
    api.post<DisciplineDecisionSuggestion>(`/api/discipline/cases/${id}/ai/suggest-decision/`, {}),

  listDecisionSuggestionsAi: (id: number) =>
    api.get<DisciplineDecisionSuggestion[]>(`/api/discipline/cases/${id}/ai/suggestions/`),

  approveDecisionSuggestionAi: (caseId: number, suggestion_id: number) =>
    api.post<DisciplineDecisionSuggestion>(`/api/discipline/cases/${caseId}/ai/approve-suggestion/`, { suggestion_id }),

  applyDecisionSuggestionAi: (caseId: number, suggestion_id: number) =>
    api.post(`/api/discipline/cases/${caseId}/ai/apply-suggestion/`, { suggestion_id }),
}

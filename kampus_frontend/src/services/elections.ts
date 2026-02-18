import axios from 'axios'
import { api } from './api'

export type ElectionCandidatePublic = {
  id: number
  name: string
  number: string
  grade: string
  proposal: string
  photo_url?: string
}

export type ElectionRolePublic = {
  id: number
  code: string
  title: string
  description: string
  display_order: number
  candidates: ElectionCandidatePublic[]
}

export type ValidateTokenResponse = {
  access_session_id: string
  process: {
    id: number
    name: string
  }
  roles: ElectionRolePublic[]
  student_scope?: {
    grade?: string
    shift?: string
  }
}

export type SubmitVoteSelection = {
  role_id: number
  candidate_id?: number | null
  is_blank?: boolean
}

export type SubmitVoteResponse = {
  receipt_code: string
  saved_votes: number
  submitted_at: string
  process_id: number
}

export type ResetTokenResponse = {
  detail: string
  token_id: number
  token_prefix: string
  status: string
  expires_at: string | null
  reset_event_id: number
}

export type TokenResetEventItem = {
  id: number
  reason: string
  previous_status: string
  new_status: string
  previous_expires_at: string | null
  new_expires_at: string | null
  created_at: string
  reset_by_name: string
  voter_token: number
}

export type TokenResetEventListResponse = {
  results: TokenResetEventItem[]
  count: number
}

export type ElectionProcessItem = {
  id: number
  name: string
  status: 'DRAFT' | 'OPEN' | 'CLOSED'
  starts_at: string | null
  ends_at: string | null
  created_at: string
  votes_count: number
  can_delete: boolean
}

export type ElectionRoleItem = {
  id: number
  process: number
  process_name: string
  code: 'PERSONERO' | 'CONTRALOR'
  title: string
  description: string
  display_order: number
  created_at: string
  votes_count: number
  candidates_count: number
  can_delete: boolean
}

export type ElectionManageCandidateItem = {
  id: number
  role: number
  role_title: string
  process_id: number
  name: string
  number: string
  grade: string
  proposal: string
  display_order: number
  is_active: boolean
  created_at: string
}

export type ElectionEligibleStudentItem = {
  student_id: number
  enrollment_id: number
  full_name: string
  document_number: string
  grade: string
  group: string
  shift: string
  is_blocked?: boolean
  block_reason?: string
}

export type ElectionEligibleStudentsResponse = {
  results: ElectionEligibleStudentItem[]
  count: number
  limit: number
  blocked_results?: ElectionEligibleStudentItem[]
  blocked_count?: number
  academic_year: { id: number; year: number } | null
  role_code: 'PERSONERO' | 'CONTRALOR'
}

export type ElectionTokenEligibilityIssueItem = {
  token_id: number
  process_id: number
  process_name: string
  token_prefix: string
  status: string
  student_grade: string
  student_shift: string
  metadata: Record<string, unknown>
  error: string
}

export type ElectionTokenEligibilityIssueListResponse = {
  results: ElectionTokenEligibilityIssueItem[]
  count: number
  limit: number
  scanned_count: number
}

export type ElectionOpeningRecord = {
  id: number
  process: number
  opened_by: number | null
  opened_by_name: string
  opened_at: string
  votes_count_at_open: number
  blank_votes_count_at_open: number
  metadata: Record<string, unknown>
}

export type ElectionScrutinyCandidateRow = {
  candidate_id: number
  name: string
  number: string
  votes: number
}

export type ElectionScrutinyRoleSummary = {
  role_id: number
  code: string
  title: string
  total_votes: number
  blank_votes: number
  candidates: ElectionScrutinyCandidateRow[]
}

export type ElectionScrutinySummaryResponse = {
  process: {
    id: number
    name: string
    status: string
  }
  summary: {
    total_votes: number
    total_blank_votes: number
    generated_at: string
  }
  roles: ElectionScrutinyRoleSummary[]
}

export type ElectionProcessCensusMemberItem = {
  member_id: number
  student_external_id: string
  student_id: number | null
  document_number: string
  full_name: string
  grade: string
  grade_value: number | null
  group: string
  shift: string
  campus: string
  is_excluded: boolean
  is_enabled: boolean
}

export type ElectionProcessCensusResponse = {
  process: {
    id: number
    name: string
    status: string
  }
  results: ElectionProcessCensusMemberItem[]
  count: number
  total_count: number
  page: number
  page_size: number
  total_pages: number
  enabled_count: number
  excluded_count: number
  groups: string[]
}

export type ElectionCensusSyncResponse = {
  detail: string
  sync: {
    id: number
    status: string
    received_count: number
    created_count: number
    updated_count: number
    deactivated_count: number
    unchanged_count: number
    errors_count: number
    started_at: string
    finished_at: string | null
  }
}

export type ListResponse<T> = {
  results: T[]
  count: number
}

export const electionsApi = {
  validateToken: async (token: string) => {
    const response = await api.post<ValidateTokenResponse>('/api/elections/public/validate-token/', { token })
    return response.data
  },

  submitVote: async (accessSessionId: string, selections: SubmitVoteSelection[]) => {
    const response = await api.post<SubmitVoteResponse>('/api/elections/public/submit-vote/', {
      access_session_id: accessSessionId,
      selections,
    })
    return response.data
  },

  resetToken: async (payload: { token: string; reason: string; extend_hours?: number }) => {
    const response = await api.post<ResetTokenResponse>('/api/elections/tokens/reset/', payload)
    return response.data
  },

  listResetEvents: async (limit = 20) => {
    const response = await api.get<TokenResetEventListResponse>('/api/elections/tokens/reset-events/', {
      params: { limit },
    })
    return response.data
  },

  listProcesses: async () => {
    const response = await api.get<ListResponse<ElectionProcessItem>>('/api/elections/manage/processes/')
    return response.data
  },

  createProcess: async (payload: { name: string; status: 'DRAFT' | 'OPEN'; starts_at?: string | null; ends_at?: string | null }) => {
    const response = await api.post<ElectionProcessItem>('/api/elections/manage/processes/', payload)
    return response.data
  },

  deleteProcess: async (processId: number) => {
    await api.delete(`/api/elections/manage/processes/${processId}/`)
  },

  updateProcess: async (processId: number, payload: { starts_at?: string | null; ends_at?: string | null }) => {
    const response = await api.patch<ElectionProcessItem>(`/api/elections/manage/processes/${processId}/`, payload)
    return response.data
  },

  openProcess: async (processId: number) => {
    const response = await api.post<ElectionProcessItem>(`/api/elections/manage/processes/${processId}/open/`)
    return response.data
  },

  listRoles: async (processId?: number) => {
    const response = await api.get<ListResponse<ElectionRoleItem>>('/api/elections/manage/roles/', {
      params: processId ? { process_id: processId } : undefined,
    })
    return response.data
  },

  createRole: async (payload: { process: number; code: 'PERSONERO' | 'CONTRALOR'; title: string; description?: string; display_order?: number }) => {
    const response = await api.post<ElectionRoleItem>('/api/elections/manage/roles/', payload)
    return response.data
  },

  deleteRole: async (roleId: number) => {
    await api.delete(`/api/elections/manage/roles/${roleId}/`)
  },

  listPersoneriaCandidates: async (processId?: number) => {
    const response = await api.get<ListResponse<ElectionManageCandidateItem>>('/api/elections/manage/candidatos/personeria/', {
      params: processId ? { process_id: processId } : undefined,
    })
    return response.data
  },

  createPersoneriaCandidate: async (payload: {
    role: number
    name: string
    student_id_ref?: number
    student_document_number?: string
    number: string
    grade: string
    proposal?: string
    display_order?: number
    is_active?: boolean
  }) => {
    const response = await api.post<ElectionManageCandidateItem>('/api/elections/manage/candidatos/personeria/', payload)
    return response.data
  },

  deletePersoneriaCandidate: async (candidateId: number) => {
    await api.delete(`/api/elections/manage/candidatos/personeria/${candidateId}/`)
  },

  listContraloriaCandidates: async (processId?: number) => {
    const response = await api.get<ListResponse<ElectionManageCandidateItem>>('/api/elections/manage/candidatos/contraloria/', {
      params: processId ? { process_id: processId } : undefined,
    })
    return response.data
  },

  createContraloriaCandidate: async (payload: {
    role: number
    name: string
    student_id_ref?: number
    student_document_number?: string
    number: string
    grade: string
    proposal?: string
    display_order?: number
    is_active?: boolean
  }) => {
    const response = await api.post<ElectionManageCandidateItem>('/api/elections/manage/candidatos/contraloria/', payload)
    return response.data
  },

  deleteContraloriaCandidate: async (candidateId: number) => {
    await api.delete(`/api/elections/manage/candidatos/contraloria/${candidateId}/`)
  },

  listEligibleStudents: async (payload: {
    role_code: 'PERSONERO' | 'CONTRALOR'
    q?: string
    process_id?: number
    limit?: number
    show_blocked?: boolean
  }) => {
    const response = await api.get<ElectionEligibleStudentsResponse>('/api/elections/manage/eligible-students/', {
      params: {
        role_code: payload.role_code,
        ...(payload.q ? { q: payload.q } : {}),
        ...(payload.process_id ? { process_id: payload.process_id } : {}),
        ...(payload.limit ? { limit: payload.limit } : {}),
        ...(payload.show_blocked ? { show_blocked: true } : {}),
      },
    })
    return response.data
  },

  listTokenEligibilityIssues: async (processId?: number, limit = 200) => {
    const response = await api.get<ElectionTokenEligibilityIssueListResponse>('/api/elections/manage/tokens/eligibility-issues/', {
      params: {
        ...(processId ? { process_id: processId } : {}),
        limit,
      },
    })
    return response.data
  },

  getProcessOpeningRecord: async (processId: number) => {
    const response = await api.get<ElectionOpeningRecord>(`/api/elections/manage/processes/${processId}/opening-record/`)
    return response.data
  },

  getProcessScrutinySummary: async (processId: number) => {
    const response = await api.get<ElectionScrutinySummaryResponse>(`/api/elections/manage/processes/${processId}/scrutiny-summary/`)
    return response.data
  },

  downloadScrutinyCsv: async (processId: number) => {
    const response = await api.get<Blob>(`/api/elections/manage/processes/${processId}/scrutiny-export.csv`, {
      responseType: 'blob',
    })
    return response.data
  },

  downloadScrutinyXlsx: async (processId: number) => {
    const response = await api.get<Blob>(`/api/elections/manage/processes/${processId}/scrutiny-export.xlsx`, {
      responseType: 'blob',
    })
    return response.data
  },

  getProcessCensus: async (processId: number, page = 1, pageSize = 10, q?: string) => {
    const response = await api.get<ElectionProcessCensusResponse>(`/api/elections/manage/processes/${processId}/census/`, {
      params: {
        page,
        page_size: pageSize,
        ...(q ? { q } : {}),
      },
    })
    return response.data
  },

  excludeCensusMember: async (processId: number, memberId: number, reason?: string) => {
    const response = await api.post(`/api/elections/manage/processes/${processId}/census/exclusions/`, {
      member_id: memberId,
      reason: reason || '',
    })
    return response.data
  },

  includeCensusMember: async (processId: number, memberId: number) => {
    await api.delete(`/api/elections/manage/processes/${processId}/census/exclusions/${memberId}/`)
  },

  downloadCensusManualCodesXlsx: async (processId: number, group?: string) => {
    const response = await api.get<Blob>(`/api/elections/manage/processes/${processId}/census/manual-codes.xlsx`, {
      params: group ? { group } : undefined,
      responseType: 'blob',
    })
    return response.data
  },

  downloadCensusQrPrintHtml: async (processId: number, group?: string) => {
    const response = await api.get<string>(`/api/elections/manage/processes/${processId}/census/qr-print/`, {
      params: group ? { group } : undefined,
      responseType: 'text',
    })
    return response.data
  },

  syncCensusFromActiveEnrollments: async () => {
    const response = await api.post<ElectionCensusSyncResponse>('/api/elections/manage/census/sync-active-enrollments/')
    return response.data
  },
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data as { detail?: string } | undefined
    if (typeof detail?.detail === 'string' && detail.detail.trim()) {
      return detail.detail
    }
  }
  return fallback
}

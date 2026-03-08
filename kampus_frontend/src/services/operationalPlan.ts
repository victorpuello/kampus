import { api } from './api'

export type OperationalPlanResponsibleUser = {
  id: number
  full_name: string
  email: string
  role: string
}

export type OperationalPlanActivity = {
  id: number
  title: string
  description: string
  activity_date: string
  end_date: string | null
  is_active: boolean
  is_completed: boolean
  completed_at: string | null
  completion_notes: string
  completed_by: number | null
  completed_by_name: string | null
  responsible_users: OperationalPlanResponsibleUser[]
  days_until: number
  responsables_texto: string
  responsables_sin_mapear: boolean
  created_by: number | null
  created_by_name: string | null
  updated_by: number | null
  updated_by_name: string | null
  created_at: string
  updated_at: string
}

export type OperationalPlanComplianceSummary = {
  total: number
  completed: number
  pending: number
  completion_rate: number
}

export type OperationalPlanActivityPayload = {
  title: string
  description?: string
  activity_date: string
  end_date?: string | null
  is_active?: boolean
  responsible_user_ids?: number[]
}

export const operationalPlanApi = {
  list: () => api.get<OperationalPlanActivity[]>('/api/operational-plan-activities/'),
  create: (payload: OperationalPlanActivityPayload) =>
    api.post<OperationalPlanActivity>('/api/operational-plan-activities/', payload),
  update: (id: number, payload: Partial<OperationalPlanActivityPayload>) =>
    api.patch<OperationalPlanActivity>(`/api/operational-plan-activities/${id}/`, payload),
  remove: (id: number) => api.delete<void>(`/api/operational-plan-activities/${id}/`),
  upcoming: (params?: { days?: number; limit?: number }) =>
    api.get<{ results: OperationalPlanActivity[] }>('/api/operational-plan-activities/upcoming/', { params }),
  mapResponsibles: (replaceExisting = true) =>
    api.post<{ detail: string; output: string }>('/api/operational-plan-activities/map-responsibles/', {
      replace_existing: replaceExisting,
    }),
  summary: () => api.get<OperationalPlanComplianceSummary>('/api/operational-plan-activities/summary/'),
  markCompleted: (id: number, completion_notes?: string) =>
    api.post<OperationalPlanActivity>(`/api/operational-plan-activities/${id}/mark-completed/`, {
      completion_notes: completion_notes || '',
    }),
  markPending: (id: number) =>
    api.post<OperationalPlanActivity>(`/api/operational-plan-activities/${id}/mark-pending/`),
  downloadCompliancePdf: () =>
    api.get<Blob>('/api/operational-plan-activities/compliance-report-pdf/', {
      responseType: 'blob',
    }),
}

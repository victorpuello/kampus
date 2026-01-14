import { api } from './api'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface Enrollment {
  id: number
  student: number | { id: number; full_name: string; document_number: string; document_type?: string }
  academic_year: number | { id: number; year: string }
  grade: number | { id: number; name: string }
  group: number | { id: number; name: string } | null
  campus: number | null
  status: 'ACTIVE' | 'RETIRED' | 'GRADUATED'
  origin_school: string
  final_status: string
}

export interface PapPlanListItem {
  id: number
  status: 'OPEN' | 'CLEARED' | 'FAILED'
  due_period: { id: number | null; name: string | null }
  enrollment: {
    id: number
    academic_year: { id: number | null; year: number | string | null }
    grade: { id: number | null; name: string | null }
    student: { id: number | null; name: string | null; document_number: string }
  }
  source_enrollment: { id: number | null; grade: { id: number | null; name: string | null } } | null
  pending_subject_ids: number[]
  pending_area_ids: number[]
  notes: string
  created_at: string
  updated_at: string
}

export interface PapPlanListResponse {
  results: PapPlanListItem[]
}

export const enrollmentsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Enrollment>>('/api/enrollments/', { params }),
  getById: (id: number) => api.get<Enrollment>(`/api/enrollments/${id}/`),
  create: (data: Record<string, unknown>) => api.post<Enrollment>('/api/enrollments/', data),
  update: (id: number, data: Record<string, unknown>) => api.put<Enrollment>(`/api/enrollments/${id}/`, data),
  patch: (id: number, data: Record<string, unknown>) => api.patch<Enrollment>(`/api/enrollments/${id}/`, data),
  delete: (id: number) => api.delete(`/api/enrollments/${id}/`),
  
  // Bulk & Reports
  bulkUpload: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/api/enrollments/bulk-upload/', formData)
  },
  
  downloadReport: (params?: Record<string, unknown>) => api.get('/api/enrollments/report/', { 
    params,
    responseType: 'blob' 
  }),

  papPlans: (params?: { status?: 'OPEN' | 'CLEARED' | 'FAILED'; academic_year?: number; due_period?: number }) =>
    api.get<PapPlanListResponse>('/api/enrollments/pap-plans/', { params }),

  papResolve: (enrollmentId: number, data: { status: 'CLEARED' | 'FAILED'; notes?: string }) =>
    api.post(`/api/enrollments/${enrollmentId}/pap/resolve/`, data),
}

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

export const enrollmentsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Enrollment>>('/api/enrollments/', { params }),
  getById: (id: number) => api.get<Enrollment>(`/api/enrollments/${id}/`),
  create: (data: Record<string, unknown>) => api.post<Enrollment>('/api/enrollments/', data),
  update: (id: number, data: Record<string, unknown>) => api.put<Enrollment>(`/api/enrollments/${id}/`, data),
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
}

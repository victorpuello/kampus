import { api } from './api'
import type { Student } from './students'
import type { AcademicYear, Grade, Group } from './academic'

export interface Enrollment {
  id: number
  student: number | Student
  academic_year: number | AcademicYear
  grade: number | Grade
  group: number | Group | null
  campus: number | null
  status: 'ACTIVE' | 'RETIRED' | 'GRADUATED'
  origin_school: string
  final_status: string
}

export const enrollmentsApi = {
  list: (params?: any) => api.get<Enrollment[]>('/api/enrollments/', { params }),
  getById: (id: number) => api.get<Enrollment>(`/api/enrollments/${id}/`),
  create: (data: any) => api.post<Enrollment>('/api/enrollments/', data),
  update: (id: number, data: any) => api.put<Enrollment>(`/api/enrollments/${id}/`, data),
  delete: (id: number) => api.delete(`/api/enrollments/${id}/`),
  
  // Bulk & Reports
  bulkUpload: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/api/enrollments/bulk-upload/', formData)
  },
  
  downloadReport: (params?: any) => api.get('/api/enrollments/report/', { 
    params,
    responseType: 'blob' 
  }),
}

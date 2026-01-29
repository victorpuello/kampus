import { api } from './api'
import type { User } from './users'
import type { AxiosProgressEvent } from 'axios'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface FamilyMember {
  id: number
  full_name: string
  document_number: string
  identity_document?: string | null
  relationship: string
  phone: string
  email: string
  address: string
  is_main_guardian: boolean
  is_head_of_household: boolean
}

export interface StudentNovelty {
  id: number
  student: number
  novelty_type: 'INGRESO' | 'RETIRO' | 'REINGRESO' | 'OTRO'
  date: string
  observation: string
  created_at: string
}

export interface StudentDocument {
  id: number
  student: number
  document_type: 'IDENTITY' | 'VACCINES' | 'EPS' | 'ACADEMIC' | 'PHOTO' | 'OTHER'
  file: string
  description: string
  uploaded_at: string
}

export interface Student {
  id: number
  current_enrollment_status?: string | null
  current_grade_ordinal?: number | null
  current_grade_name?: string | null
  user: User
  // Identification
  document_type: string
  document_number: string
  place_of_issue: string
  nationality: string
  birth_date: string | null
  sex: string
  blood_type: string
  
  // Residence & Contact
  address: string
  neighborhood: string
  phone: string
  living_with: string
  stratum: string

  // New fields
  photo?: string
  photo_thumb?: string
  financial_status?: 'SOLVENT' | 'DEBT'
  
  // Socioeconomic
  ethnicity: string
  sisben_score: string
  eps: string
  is_victim_of_conflict: boolean
  
  // Disability & Support
  has_disability: boolean
  disability_description: string
  disability_type: string
  support_needs: string

  // Health & Emergency
  allergies: string
  emergency_contact_name: string
  emergency_contact_phone: string
  emergency_contact_relationship: string
  
  // Relations
  family_members: FamilyMember[]
  novelties: StudentNovelty[]
  documents: StudentDocument[]
}

export interface ObserverReportInstitution {
  name: string
  dane_code: string
  nit: string
  pdf_header_line1: string
  pdf_header_line2: string
  pdf_header_line3: string
  logo_url: string | null
}

export interface ObserverReportCampus {
  name: string
  municipality: string
}

export interface ObserverReportStudent {
  id: number
  full_name: string
  first_name: string
  last_name: string
  document_type: string
  document_number: string
  birth_date: string | null
  place_of_issue: string
  neighborhood: string
  address: string
  blood_type: string
  stratum: string
  sisben_score: string
  photo_url: string | null
}

export interface ObserverReportFamilyMember {
  id: number
  relationship: string
  full_name: string
  document_number: string
  phone: string
  email: string
  is_main_guardian: boolean
}

export interface ObserverReportEnrollment {
  id: number
  academic_year: number | null
  grade_name: string
  group_name: string
  campus_name: string
  status: string
  final_status: string
  enrolled_at: string | null
}

export interface ObserverReportDisciplineEvent {
  id: number
  event_type: string
  text: string
  created_at: string | null
  created_by_name: string
}

export interface ObserverReportDisciplineEntry {
  id: number
  occurred_at: string | null
  location: string
  manual_severity: string
  law_1620_type: string
  status: string
  academic_year: number | null
  grade_name: string
  group_name: string
  narrative: string
  decision_text: string
  created_by_name: string
  created_at: string | null
  events: ObserverReportDisciplineEvent[]
}

export type ObserverAnnotationType = 'PRAISE' | 'OBSERVATION' | 'ALERT' | 'COMMITMENT'

export interface ObserverAnnotationPeriodMeta {
  id: number
  name: string
  academic_year: number | null
  is_closed: boolean
}

export interface ObserverAnnotation {
  id: number
  student: number
  period: number | null
  annotation_type: ObserverAnnotationType
  title: string
  text: string
  commitments: string
  commitment_due_date: string | null
  commitment_responsible: string
  is_automatic: boolean
  created_at: string
  updated_at: string
  created_by_name: string
  updated_by_name: string
}

export interface ObserverReport {
  observer_number: string
  generated_at: string
  institution: ObserverReportInstitution
  campus: ObserverReportCampus
  student: ObserverReportStudent
  family_members: ObserverReportFamilyMember[]
  enrollments: ObserverReportEnrollment[]
  discipline_entries: ObserverReportDisciplineEntry[]
  observer_annotations: Array<
    Omit<ObserverAnnotation, 'student' | 'period'> & { period: ObserverAnnotationPeriodMeta | null }
  >
}

export interface ImportAcademicHistorySubject {
  area: string
  subject: string
  final_score: string | number
}

export interface ImportAcademicHistoryPayload {
  academic_year: number
  grade?: number
  grade_name?: string
  origin_school?: string
  subjects: ImportAcademicHistorySubject[]
}

export interface ImportAcademicHistoryResponse {
  enrollment_id: number
  academic_year: { id: number; year: number }
  decision: string
  failed_subjects_count: number
  failed_areas_count: number
}

const hasFile = (data: Record<string, unknown>): boolean =>
  Object.values(data).some((v) => v instanceof File)

const toFormData = (data: Record<string, unknown>): FormData => {
  const fd = new FormData()
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue
    if (typeof value === 'string' && value.trim() === '' && key.endsWith('_date')) continue

    if (value instanceof File) {
      fd.append(key, value)
      continue
    }

    if (typeof value === 'boolean') {
      fd.append(key, value ? 'true' : 'false')
      continue
    }

    fd.append(key, String(value))
  }
  return fd
}

export const studentsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Student>>('/api/students/', { params }),
  get: (id: number) => api.get<Student>(`/api/students/${id}/`),

  getObserverReport: (id: number) => api.get<ObserverReport>(`/api/students/${id}/observer-report/`),
  create: (data: Record<string, unknown>) =>
    hasFile(data) ? api.post<Student>('/api/students/', toFormData(data)) : api.post<Student>('/api/students/', data),
  update: (id: number, data: Record<string, unknown>) =>
    hasFile(data) ? api.patch<Student>(`/api/students/${id}/`, toFormData(data)) : api.patch<Student>(`/api/students/${id}/`, data),

  importAcademicHistory: (studentId: number, data: ImportAcademicHistoryPayload) =>
    api.post<ImportAcademicHistoryResponse>(`/api/students/${studentId}/import-academic-history/`, data),

  bulkImport: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post<{ created: number; failed: number; errors: Array<{ row: number; error: unknown }> }>(
      '/api/students/bulk-import/',
      fd
    )
  },
}

export const documentsApi = {
  create: (data: FormData, onUploadProgress?: (progressEvent: AxiosProgressEvent) => void) => api.post('/api/documents/', data, {
    onUploadProgress
  }),
  delete: (id: number) => api.delete(`/api/documents/${id}/`),
}

export const familyMembersApi = {
  create: (data: Record<string, unknown>) =>
    hasFile(data) ? api.post('/api/family-members/', toFormData(data)) : api.post('/api/family-members/', data),
  update: (id: number, data: Record<string, unknown>) =>
    hasFile(data) ? api.patch(`/api/family-members/${id}/`, toFormData(data)) : api.patch(`/api/family-members/${id}/`, data),
  delete: (id: number) => api.delete(`/api/family-members/${id}/`),
}

export const observerAnnotationsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<ObserverAnnotation> | ObserverAnnotation[]>('/api/observer-annotations/', { params }),
  create: (data: Record<string, unknown>) => api.post<ObserverAnnotation>('/api/observer-annotations/', data),
  update: (id: number, data: Record<string, unknown>) => api.patch<ObserverAnnotation>(`/api/observer-annotations/${id}/`, data),
  delete: (id: number) => api.delete(`/api/observer-annotations/${id}/`),
}

export const noveltiesApi = {
  create: (data: Record<string, unknown>) => api.post('/api/novelties/', data),
  delete: (id: number) => api.delete(`/api/novelties/${id}/`),
}

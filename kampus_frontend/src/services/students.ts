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
  create: (data: Record<string, unknown>) =>
    hasFile(data) ? api.post<Student>('/api/students/', toFormData(data)) : api.post<Student>('/api/students/', data),
  update: (id: number, data: Record<string, unknown>) =>
    hasFile(data) ? api.patch<Student>(`/api/students/${id}/`, toFormData(data)) : api.patch<Student>(`/api/students/${id}/`, data),
}

export const documentsApi = {
  create: (data: FormData, onUploadProgress?: (progressEvent: AxiosProgressEvent) => void) => api.post('/api/documents/', data, {
    onUploadProgress
  }),
  delete: (id: number) => api.delete(`/api/documents/${id}/`),
}

export const familyMembersApi = {
  create: (data: Record<string, unknown>) => api.post('/api/family-members/', data),
  update: (id: number, data: Record<string, unknown>) => api.patch(`/api/family-members/${id}/`, data),
  delete: (id: number) => api.delete(`/api/family-members/${id}/`),
}

export const noveltiesApi = {
  create: (data: Record<string, unknown>) => api.post('/api/novelties/', data),
  delete: (id: number) => api.delete(`/api/novelties/${id}/`),
}

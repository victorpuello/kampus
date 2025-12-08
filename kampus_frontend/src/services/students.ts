import { api } from './api'
import type { User } from './users'

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

export interface Student {
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
  
  // Relations
  family_members: FamilyMember[]
  novelties: StudentNovelty[]
}

export const studentsApi = {
  list: () => api.get<Student[]>('/api/students/'),
  get: (id: number) => api.get<Student>(`/api/students/${id}/`),
  create: (data: any) => api.post<Student>('/api/students/', data),
  update: (id: number, data: any) => api.patch<Student>(`/api/students/${id}/`, data),
}

export const familyMembersApi = {
  create: (data: any) => api.post('/api/family-members/', data),
  update: (id: number, data: any) => api.patch(`/api/family-members/${id}/`, data),
  delete: (id: number) => api.delete(`/api/family-members/${id}/`),
}

export const noveltiesApi = {
  create: (data: any) => api.post('/api/novelties/', data),
  delete: (id: number) => api.delete(`/api/novelties/${id}/`),
}

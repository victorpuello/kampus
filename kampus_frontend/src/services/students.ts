import { api } from './api'

export type Student = {
  user: number
  user_username: string
  user_first_name: string
  user_last_name: string
  document_type: string
  document_number: string
  birth_date: string | null
  blood_type: string
  eps: string
  address: string
  ethnicity: string
}

export const studentsApi = {
  list: () => api.get<Student[]>('/api/students/'),
}


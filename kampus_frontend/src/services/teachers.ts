import { api } from './api';
import type { User } from './users';

export interface Teacher {
  id: number;
  user: User;
  document_type: string;
  document_number: string;
  phone: string;
  address: string;
  title: string;
  specialty: string;
  regime: string;
  salary_scale: string;
  teaching_level: 'PRESCHOOL' | 'PRIMARY' | 'SECONDARY';
  assigned_hours: number;
  hiring_date: string | null;
}

export interface CreateTeacherData {
  first_name: string;
  last_name: string;
  email: string;
  document_type: string;
  document_number: string;
  phone: string;
  address: string;
  title: string;
  specialty: string;
  regime: string;
  salary_scale: string;
  teaching_level: 'PRESCHOOL' | 'PRIMARY' | 'SECONDARY';
  hiring_date: string | null;
}

export const teachersApi = {
  getAll: (yearId?: number) => api.get<Teacher[]>('/api/teachers/', { params: { year_id: yearId } }),
  getById: (id: number) => api.get<Teacher>(`/api/teachers/${id}/`),
  create: (data: CreateTeacherData) => api.post<Teacher>('/api/teachers/', data),
  update: (id: number, data: Partial<CreateTeacherData>) => api.patch<Teacher>(`/api/teachers/${id}/`, data),
  delete: (id: number) => api.delete(`/api/teachers/${id}/`),
};

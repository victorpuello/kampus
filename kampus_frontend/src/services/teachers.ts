import { api } from './api';
import type { User } from './users';

export interface Teacher {
  user: User;
  document_type: string;
  document_number: string;
  phone: string;
  address: string;
  title: string;
  specialty: string;
  salary_scale: string;
  hiring_date: string | null;
}

export interface CreateTeacherData {
  user: {
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    password?: string;
    role?: string;
  };
  document_type: string;
  document_number: string;
  phone: string;
  address: string;
  title: string;
  specialty: string;
  salary_scale: string;
  hiring_date: string | null;
}

export const teachersApi = {
  getAll: () => api.get<Teacher[]>('/api/teachers/'),
  getById: (id: number) => api.get<Teacher>(`/api/teachers/${id}/`),
  create: (data: CreateTeacherData) => api.post<Teacher>('/api/teachers/', data),
  update: (id: number, data: Partial<Teacher>) => api.patch<Teacher>(`/api/teachers/${id}/`, data),
  delete: (id: number) => api.delete(`/api/teachers/${id}/`),
};

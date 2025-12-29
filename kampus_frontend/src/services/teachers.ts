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
  photo?: string | null;
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
  photo?: File | null;
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

export const teachersApi = {
  getAll: (yearId?: number) => api.get<Teacher[]>('/api/teachers/', { params: { year_id: yearId } }),
  getById: (id: number) => api.get<Teacher>(`/api/teachers/${id}/`),
  create: (data: CreateTeacherData) => {
    const payload: Record<string, unknown> = data as unknown as Record<string, unknown>
    return hasFile(payload)
      ? api.post<Teacher>('/api/teachers/', toFormData(payload))
      : api.post<Teacher>('/api/teachers/', data)
  },
  update: (id: number, data: Partial<CreateTeacherData>) => {
    const payload: Record<string, unknown> = data as unknown as Record<string, unknown>
    return hasFile(payload)
      ? api.patch<Teacher>(`/api/teachers/${id}/`, toFormData(payload))
      : api.patch<Teacher>(`/api/teachers/${id}/`, data)
  },
  delete: (id: number) => api.delete(`/api/teachers/${id}/`),
};

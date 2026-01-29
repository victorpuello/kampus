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
  photo_thumb?: string | null;
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

export interface TeacherStatisticsResponse {
  academic_year: { id: number; year: number; status: string }
  period: { id: number; name: string; is_closed: boolean }
  subject_teacher: {
    assignments: number
    groups: number
    subjects: number
    students_active: number
    grade_sheets: {
      expected: number
      created: number
      published: number
      draft: number
      missing: number
    }
    gradebook_cells: {
      expected: number
      filled: number
    }
  }
  director: {
    groups: Array<{
      group_id: number
      group_name: string
      grade_id: number
      grade_name: string
      students_active: number
      discipline_cases_total: number
      discipline_cases_open: number
    }>
    totals: {
      groups: number
      students_active: number
      discipline_cases_total: number
      discipline_cases_open: number
    }

    performance: {
      scope: {
        director_mode: 'period' | 'accumulated'
        group_id: number | null
        subject_id: number | null
        passing_score: string
      }
      subjects_by_average: Array<{
        subject_id: number
        subject_name: string
        area_name: string
        students: number
        average: string
        failure_rate: string
        gradebook_cells: {
          expected: number
          filled: number
        }
      }>
      subjects_by_failure_rate: Array<{
        subject_id: number
        subject_name: string
        area_name: string
        students: number
        average: string
        failure_rate: string
        gradebook_cells: {
          expected: number
          filled: number
        }
      }>
      top_students: Array<{
        enrollment_id: number
        student_id: number
        student_name: string
        group_id: number | null
        group_name: string
        grade_name: string
        average: string
        failed_subjects: number
        subjects_count: number
      }>
      at_risk_students: Array<{
        enrollment_id: number
        student_id: number
        student_name: string
        group_id: number | null
        group_name: string
        grade_name: string
        average: string
        failed_subjects: number
        subjects_count: number
      }>

      risk_summary: {
        students_total: number
        at_risk: number
        ok: number
      }

      subject_detail: null | {
        subject_id: number
        subject_name: string
        area_name: string
        students: number
        average: string
        failure_rate: string
        gradebook_cells: {
          expected: number
          filled: number
        }
        students_rows: Array<{
          enrollment_id: number
          student_id: number
          student_name: string
          group_id: number | null
          group_name: string
          grade_name: string
          score: string
          failed: boolean
        }>
      }
    }
  }
}

export interface TeacherStatisticsAIResponse {
  analysis: string
  cached?: boolean
  updated_at?: string | null
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
  myStatistics: (params: {
    year_id?: number
    period_id?: number
    director_mode?: 'period' | 'accumulated'
    director_group_id?: number
    director_subject_id?: number
  }) =>
    api.get<TeacherStatisticsResponse>('/api/teachers/me/statistics/', { params }),

  myStatisticsAI: (params: {
    year_id?: number
    period_id?: number
    director_mode?: 'period' | 'accumulated'
    director_group_id?: number
    director_subject_id?: number
    refresh?: 1
  }) => api.get<TeacherStatisticsAIResponse>('/api/teachers/me/statistics/ai/', { params }),

  myStatisticsAIPdf: (params: {
    year_id?: number
    period_id?: number
    director_mode?: 'period' | 'accumulated'
    director_group_id?: number
    director_subject_id?: number
    refresh?: 1
  }) => api.get('/api/teachers/me/statistics/ai/pdf/', { params, responseType: 'blob' }),
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

import { api } from './api'

export type AcademicYear = { id: number; year: number }
export type Grade = { id: number; name: string }

export const academicApi = {
  listYears: () => api.get<AcademicYear[]>('/api/academic-years/'),
  createYear: (year: number) => api.post<AcademicYear>('/api/academic-years/', { year }),
  listGrades: () => api.get<Grade[]>('/api/grades/'),
  createGrade: (name: string) => api.post<Grade>('/api/grades/', { name }),
}


import { api } from './api'

export interface AcademicYear { id: number; year: number }
export interface Period { id: number; name: string; start_date: string; end_date: string; is_closed: boolean; academic_year: number }
export interface Grade { id: number; name: string }
export interface Group { id: number; name: string; grade: number; grade_name?: string; academic_year: number; director: number | null; director_name?: string }
export interface Area { id: number; name: string; description: string }
export interface Subject { id: number; name: string; area: number; area_name?: string; grade: number; grade_name?: string; weight_percentage: number; hours_per_week: number }
export interface TeacherAssignment { id: number; teacher: number; teacher_name?: string; subject: number; subject_name?: string; group: number; group_name?: string; academic_year: number }

export interface EvaluationScale { id: number; name: string; min_score: number; max_score: number; academic_year: number }
export interface EvaluationComponent { id: number; name: string; subject: number; weight_percentage: number }
export interface Assessment { id: number; name: string; component: number; component_name?: string; period: number; date: string; weight_percentage: number }
export interface StudentGrade { id: number; assessment: number; student: number; student_name?: string; score: number; feedback: string }
export interface Achievement { id: number; description: string; subject: number; period: number }

export const academicApi = {
  // Years
  listYears: () => api.get<AcademicYear[]>('/api/academic-years/'),
  createYear: (year: number) => api.post<AcademicYear>('/api/academic-years/', { year }),
  
  // Periods
  listPeriods: () => api.get<Period[]>('/api/periods/'),
  createPeriod: (data: Omit<Period, 'id'>) => api.post<Period>('/api/periods/', data),
  
  // Grades
  listGrades: () => api.get<Grade[]>('/api/grades/'),
  createGrade: (name: string) => api.post<Grade>('/api/grades/', { name }),

  // Groups
  listGroups: () => api.get<Group[]>('/api/groups/'),
  createGroup: (data: Omit<Group, 'id' | 'grade_name' | 'director_name'>) => api.post<Group>('/api/groups/', data),

  // Areas
  listAreas: () => api.get<Area[]>('/api/areas/'),
  createArea: (data: Omit<Area, 'id'>) => api.post<Area>('/api/areas/', data),

  // Subjects
  listSubjects: () => api.get<Subject[]>('/api/subjects/'),
  createSubject: (data: Omit<Subject, 'id' | 'area_name' | 'grade_name'>) => api.post<Subject>('/api/subjects/', data),

  // Assignments
  listAssignments: () => api.get<TeacherAssignment[]>('/api/teacher-assignments/'),
  createAssignment: (data: Omit<TeacherAssignment, 'id' | 'teacher_name' | 'subject_name' | 'group_name'>) => api.post<TeacherAssignment>('/api/teacher-assignments/', data),

  // Evaluation
  listEvaluationScales: () => api.get<EvaluationScale[]>('/api/evaluation-scales/'),
  createEvaluationScale: (data: Omit<EvaluationScale, 'id'>) => api.post<EvaluationScale>('/api/evaluation-scales/', data),

  listEvaluationComponents: () => api.get<EvaluationComponent[]>('/api/evaluation-components/'),
  createEvaluationComponent: (data: Omit<EvaluationComponent, 'id'>) => api.post<EvaluationComponent>('/api/evaluation-components/', data),

  listAssessments: () => api.get<Assessment[]>('/api/assessments/'),
  createAssessment: (data: Omit<Assessment, 'id' | 'component_name'>) => api.post<Assessment>('/api/assessments/', data),

  listStudentGrades: () => api.get<StudentGrade[]>('/api/student-grades/'),
  createStudentGrade: (data: Omit<StudentGrade, 'id' | 'student_name'>) => api.post<StudentGrade>('/api/student-grades/', data),

  listAchievements: () => api.get<Achievement[]>('/api/achievements/'),
  createAchievement: (data: Omit<Achievement, 'id'>) => api.post<Achievement>('/api/achievements/', data),
}


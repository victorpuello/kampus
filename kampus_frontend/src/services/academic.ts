import { api } from './api'

export interface AcademicYear { 
  id: number; 
  year: number;
  status: 'PLANNING' | 'ACTIVE' | 'CLOSED';
  status_display: string;
  start_date: string | null;
  end_date: string | null;
}
export interface Period { id: number; name: string; start_date: string; end_date: string; is_closed: boolean; academic_year: number }
export interface AcademicLevel { id: number; name: string; level_type: string; min_age: number; max_age: number }
export interface Grade { id: number; name: string; level: number | null; level_name?: string }
export interface Group { 
  id: number; 
  name: string; 
  grade: number; 
  grade_name?: string; 
  academic_year: number; 
  director: number | null; 
  director_name?: string; 
  campus: number | null; 
  campus_name?: string;
  shift: string;
  classroom?: string;
  capacity: number;
  enrolled_count: number;
}
export interface Area { id: number; name: string; description: string }
export interface Subject { id: number; name: string; area: number; area_name?: string; grade: number; grade_name?: string; weight_percentage: number; hours_per_week: number }
export interface TeacherAssignment { id: number; teacher: number; teacher_name?: string; subject: number; subject_name?: string; group: number; group_name?: string; academic_year: number }

export interface EvaluationScale { 
  id: number; 
  name: string; 
  min_score: number | null; 
  max_score: number | null; 
  academic_year: number;
  scale_type: 'NUMERIC' | 'QUALITATIVE';
  description: string;
}
export interface EvaluationComponent { id: number; name: string; subject: number; weight_percentage: number }
export interface Assessment { id: number; name: string; component: number; component_name?: string; period: number; date: string; weight_percentage: number }
export interface StudentGrade { id: number; assessment: number; student: number; student_name?: string; score: number; feedback: string }
export interface Achievement { id: number; description: string; subject: number; period: number }

export const academicApi = {
  // Years
  listYears: () => api.get<AcademicYear[]>('/api/academic-years/'),
  createYear: (data: Partial<AcademicYear>) => api.post<AcademicYear>('/api/academic-years/', data),
  updateYear: (id: number, data: Partial<AcademicYear>) => api.put<AcademicYear>(`/api/academic-years/${id}/`, data),
  deleteYear: (id: number) => api.delete(`/api/academic-years/${id}/`),
  
  // Periods
  listPeriods: () => api.get<Period[]>('/api/periods/'),
  createPeriod: (data: Omit<Period, 'id'>) => api.post<Period>('/api/periods/', data),
  updatePeriod: (id: number, data: Omit<Period, 'id'>) => api.put<Period>(`/api/periods/${id}/`, data),
  deletePeriod: (id: number) => api.delete(`/api/periods/${id}/`),
  
  // Academic Levels
  listLevels: () => api.get<AcademicLevel[]>('/api/academic-levels/'),
  createLevel: (data: Omit<AcademicLevel, 'id'>) => api.post<AcademicLevel>('/api/academic-levels/', data),
  updateLevel: (id: number, data: Omit<AcademicLevel, 'id'>) => api.put<AcademicLevel>(`/api/academic-levels/${id}/`, data),
  deleteLevel: (id: number) => api.delete(`/api/academic-levels/${id}/`),

  // Grades
  listGrades: () => api.get<Grade[]>('/api/grades/'),
  createGrade: (data: { name: string; level?: number }) => api.post<Grade>('/api/grades/', data),
  updateGrade: (id: number, data: { name: string; level?: number }) => api.put<Grade>(`/api/grades/${id}/`, data),
  deleteGrade: (id: number) => api.delete(`/api/grades/${id}/`),

  // Groups
  listGroups: (params?: any) => api.get<Group[]>('/api/groups/', { params }),
  createGroup: (data: Omit<Group, 'id' | 'grade_name' | 'director_name' | 'campus_name'>) => api.post<Group>('/api/groups/', data),
  updateGroup: (id: number, data: Omit<Group, 'id' | 'grade_name' | 'director_name' | 'campus_name'>) => api.put<Group>(`/api/groups/${id}/`, data),
  deleteGroup: (id: number) => api.delete(`/api/groups/${id}/`),

  // Areas
  listAreas: () => api.get<Area[]>('/api/areas/'),
  createArea: (data: Omit<Area, 'id'>) => api.post<Area>('/api/areas/', data),
  updateArea: (id: number, data: Omit<Area, 'id'>) => api.put<Area>(`/api/areas/${id}/`, data),
  deleteArea: (id: number) => api.delete(`/api/areas/${id}/`),

  // Subjects
  listSubjects: () => api.get<Subject[]>('/api/subjects/'),
  createSubject: (data: Omit<Subject, 'id' | 'area_name' | 'grade_name'>) => api.post<Subject>('/api/subjects/', data),
  updateSubject: (id: number, data: Omit<Subject, 'id' | 'area_name' | 'grade_name'>) => api.put<Subject>(`/api/subjects/${id}/`, data),
  deleteSubject: (id: number) => api.delete(`/api/subjects/${id}/`),

  // Assignments
  listAssignments: () => api.get<TeacherAssignment[]>('/api/teacher-assignments/'),
  createAssignment: (data: Omit<TeacherAssignment, 'id' | 'teacher_name' | 'subject_name' | 'group_name'>) => api.post<TeacherAssignment>('/api/teacher-assignments/', data),
  deleteAssignment: (id: number) => api.delete(`/api/teacher-assignments/${id}/`),

  // Evaluation
  listEvaluationScales: () => api.get<EvaluationScale[]>('/api/evaluation-scales/'),
  createEvaluationScale: (data: Omit<EvaluationScale, 'id'>) => api.post<EvaluationScale>('/api/evaluation-scales/', data),
  updateEvaluationScale: (id: number, data: Omit<EvaluationScale, 'id'>) => api.put<EvaluationScale>(`/api/evaluation-scales/${id}/`, data),
  deleteEvaluationScale: (id: number) => api.delete(`/api/evaluation-scales/${id}/`),
  copyEvaluationScales: (sourceYearId: number, targetYearId: number) => api.post('/api/evaluation-scales/copy_from_year/', { source_year_id: sourceYearId, target_year_id: targetYearId }),

  listEvaluationComponents: () => api.get<EvaluationComponent[]>('/api/evaluation-components/'),
  createEvaluationComponent: (data: Omit<EvaluationComponent, 'id'>) => api.post<EvaluationComponent>('/api/evaluation-components/', data),

  listAssessments: () => api.get<Assessment[]>('/api/assessments/'),
  createAssessment: (data: Omit<Assessment, 'id' | 'component_name'>) => api.post<Assessment>('/api/assessments/', data),

  listStudentGrades: () => api.get<StudentGrade[]>('/api/student-grades/'),
  createStudentGrade: (data: Omit<StudentGrade, 'id' | 'student_name'>) => api.post<StudentGrade>('/api/student-grades/', data),

  listAchievements: () => api.get<Achievement[]>('/api/achievements/'),
  createAchievement: (data: Omit<Achievement, 'id'>) => api.post<Achievement>('/api/achievements/', data),
}


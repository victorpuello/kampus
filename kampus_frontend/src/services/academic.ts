import { api } from './api'

export interface AcademicYear { 
  id: number; 
  year: number;
  status: 'PLANNING' | 'ACTIVE' | 'CLOSED';
  status_display: string;
  start_date: string | null;
  end_date: string | null;
}

export type PromotionDecision = 'PROMOTED' | 'CONDITIONAL' | 'REPEATED' | 'GRADUATED'

export interface PromotionPreviewItem {
  enrollment_id: number
  decision: PromotionDecision
  failed_subjects_count: number
  failed_areas_count: number
  failed_subjects_distinct_areas_count: number
  failed_subject_ids: number[]
  failed_area_ids: number[]

  // Extended fields (optional for backward compatibility)
  student_id?: number
  student_name?: string
  student_document_number?: string
  grade_id?: number
  grade_name?: string
  grade_ordinal?: number | null

  target_grade_id?: number | null
  target_grade_name?: string | null
}

export interface PromotionPreviewResponse {
  academic_year: { id: number; year: number; status: AcademicYear['status'] }
  passing_score: string
  count: number
  results: PromotionPreviewItem[]
}

export interface CloseWithPromotionResponse {
  academic_year: { id: number; year: number; status: AcademicYear['status'] }
  passing_score: string
  snapshots: { created: number; updated: number }
}

export type CommissionType = 'EVALUATION' | 'PROMOTION'
export type CommissionStatus = 'DRAFT' | 'IN_PROGRESS' | 'CLOSED'

export interface CommissionRuleConfig {
  id: number
  institution: number | null
  institution_name?: string
  academic_year: number
  academic_year_year?: number
  subjects_threshold: number
  areas_threshold: number
  operator: 'OR' | 'AND'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Commission {
  id: number
  institution: number | null
  academic_year: number
  period: number | null
  group: number | null
  commission_type: CommissionType
  status: CommissionStatus
  title: string
  notes: string
  created_by: number | null
  created_by_name?: string
  closed_by: number | null
  closed_by_name?: string
  closed_at: string | null
  created_at: string
  updated_at: string
  period_name?: string
  group_name?: string
}

export interface CommissionDecision {
  id: number
  commission: number
  enrollment: number
  failed_subjects_count: number
  failed_areas_count: number
  is_flagged: boolean
  decision: 'PENDING' | 'COMMITMENT' | 'FOLLOW_UP' | 'CLOSED'
  notes: string
  decided_by: number | null
  decided_at: string | null
  created_at: string
  updated_at: string
  student_id?: number
  student_name?: string
  student_document?: string
  group_name?: string
  acta_id?: number | null
}

export interface CommissionDifficultySummary {
  total_students: number
  total_flagged: number
  total_not_flagged: number
  flagged_rate: number
  subjects_distribution: Record<string, number>
  areas_distribution: Record<string, number>
}

export interface PaginatedCommissionDecisionsResponse {
  count: number
  next: string | null
  previous: string | null
  results: CommissionDecision[]
  summary?: {
    total_students: number
    total_flagged: number
    total_not_flagged: number
    flagged_rate: number
  }
}

export interface CommitmentActa {
  id: number
  decision: number
  status: 'GENERATED'
  title: string
  commitments: string
  student_name: string
  guardian_name: string
  director_name: string
  observer_annotation: number | null
  generated_by: number | null
  generated_at: string
  updated_at: string
}

export interface ApplyPromotionsResponse {
  source_academic_year: { id: number; year: number }
  target_academic_year: { id: number; year: number }
  created: number
  skipped_existing: number
  skipped_graduated: number
  skipped_missing_grade_ordinal: number
  skipped_repeated?: number
}
export interface Period {
  id: number
  name: string
  start_date: string
  end_date: string
  is_closed: boolean
  academic_year: number
  grades_edit_until?: string | null
  planning_edit_until?: string | null
}
export interface AcademicLevel { id: number; name: string; level_type: string; min_age: number; max_age: number }
export interface Grade { id: number; name: string; level: number | null; level_name?: string; ordinal?: number | null }
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
  is_multigrade?: boolean;
  capacity: number;
  enrolled_count: number;
}

export type GroupUpsertPayload = {
  name: string;
  grade: number;
  academic_year: number;
  director: number | null;
  campus: number | null;
  shift: string;
  classroom?: string;
  capacity?: number;
  is_multigrade?: boolean;
}
export interface Area { id: number; name: string; description: string }
export interface Subject { id: number; name: string; area: number; area_name?: string; }
export interface AcademicLoad { id: number; subject: number; subject_name?: string; grade: number; grade_name?: string; weight_percentage: number; hours_per_week: number }
export interface TeacherAssignment {
  id: number;
  teacher: number;
  teacher_name?: string;
  academic_load: number;
  academic_load_name?: string;
  subject_name?: string;
  area_name?: string;
  group: number;
  group_name?: string;
  grade_name?: string;
  academic_year: number;
  academic_year_year?: number;
  hours_per_week?: number | null;
}

export type AssignGradePlanPayload = {
  teacher: number
  group: number
  academic_year: number
  force?: boolean
}

export type AssignGradePlanResponse = {
  created: number
  skipped_existing: number
  skipped_taken: number
  conflicts: Array<{
    academic_load_id: number
    subject: string
    assigned_teacher_id: number
    assigned_teacher_name?: string | null
  }>
}

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

export interface Dimension {
  id: number;
  academic_year: number;
  name: string;
  description: string;
  percentage: number;
  is_active: boolean;
}

export interface AchievementDefinition {
  // Bank definition
  id: number;
  code: string;
  description: string;
  area: number | null;
  area_name?: string;
  grade: number | null;
  grade_name?: string;
  subject: number | null;
  subject_name?: string;
  dimension?: number | null;
  dimension_name?: string;
  is_active: boolean;
}



export interface PerformanceIndicator {
  id: number;
  achievement: number;
  level: 'LOW' | 'BASIC' | 'HIGH' | 'SUPERIOR';
  level_display?: string;
  description: string;
}

export interface PerformanceIndicatorCreate {
  level: PerformanceIndicator['level'];
  description: string;
}

export interface Achievement {
  id: number;
  subject: number;
  group?: number;
  group_name?: string;
  period: number;
  definition: number | null;
  definition_code?: string;
  description: string;
  percentage: number;
  indicators?: PerformanceIndicator[]; // Now writable on create
  dimension?: number;
  dimension_name?: string;
}

export interface GradebookAchievement {
  id: number;
  description: string;
  dimension: number | null;
  dimension_name: string | null;
  percentage: number;
}

export interface GradebookStudent {
  enrollment_id: number;
  student_id: number;
  student_name: string;
}

export interface GradebookCell {
  enrollment: number;
  achievement: number;
  score: number | string | null;
}

export interface PreschoolLabel {
  id: number
  name: string
  description: string
  order: number
  internal_numeric_value: string | null
  scale_type: 'QUALITATIVE' | 'NUMERIC'
  applies_to_level: 'PRESCHOOL' | 'BASIC' | 'MIDDLE' | null
  is_default: boolean
}

export interface PreschoolGradebookCell {
  enrollment: number
  achievement: number
  qualitative_scale: number | null
}

export interface PreschoolGradebookResponse {
  gradesheet: GradebookResponse['gradesheet']
  period: { id: number; name: string; is_closed: boolean }
  teacher_assignment: { id: number; group: number; academic_load: number }
  achievements: GradebookAchievement[]
  students: GradebookStudent[]
  cells: PreschoolGradebookCell[]
  labels: PreschoolLabel[]
}

export interface PreschoolGradebookBulkUpsertResponse {
  requested: number
  updated: number
  blocked?: { enrollment: number; achievement: number; reason: string }[]
}

export interface GradebookComputed {
  enrollment_id: number;
  final_score: number | string;
  scale: string | null;
}

export interface GradebookBlockedItem {
  enrollment: number
  achievement: number
  reason: string
}

export type GradeSheetGradingMode = 'ACHIEVEMENT' | 'ACTIVITIES'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export type GradeSheetListItem = {
  id: number
  teacher_assignment: number
  period: number
  grading_mode: GradeSheetGradingMode
  created_at: string
  updated_at: string
  teacher_id: number | null
  teacher_name: string | null
  group_id: number | null
  group_name: string | null
  grade_id: number | null
  grade_name: string | null
  academic_load_id: number | null
  subject_name: string | null
  academic_year_id: number | null
  academic_year_name: string | null
  period_name: string | null
  period_is_closed: boolean | null
}

export interface GradebookActivityColumn {
  id: number
  gradesheet: number
  achievement: number
  label: string
  order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface GradebookActivityCell {
  enrollment: number
  column: number
  score: number | string | null
}

export interface ActivityGradeBlockedItem {
  enrollment: number
  column: number
  reason: string
}

export interface GradebookBulkUpsertResponse {
  requested: number
  updated: number
  computed?: GradebookComputed[]
  blocked?: GradebookBlockedItem[]
}

export interface GradeSheetSetGradingModeResponse {
  gradesheet: GradebookResponse['gradesheet']
  created_columns: number
}

export type ActivityColumnUpsert = {
  id?: number
  achievement: number
  label: string
  order?: number
  is_active?: boolean
}

export interface ActivityColumnsBulkUpsertResponse {
  created: number
  updated: number
  columns: GradebookActivityColumn[]
}

export type ActivityGradeUpsert = {
  enrollment: number
  column: number
  score: number | null
}

export interface ActivityGradesBulkUpsertResponse {
  requested: number
  updated: number
  recomputed_achievement_grades: number
  computed?: GradebookComputed[]
  blocked?: ActivityGradeBlockedItem[]
}

export type EditScope = 'GRADES' | 'PLANNING'
export type EditRequestType = 'FULL' | 'PARTIAL'
export type EditRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface EditRequestItem {
  id: number
  enrollment_id: number
}

export interface EditRequest {
  id: number
  scope: EditScope
  request_type: EditRequestType
  status: EditRequestStatus
  requested_by: number
  requested_by_name?: string
  period: number
  teacher_assignment: number | null
  requested_until: string | null
  reason: string
  decided_by: number | null
  decided_by_name?: string
  decided_at: string | null
  decision_note: string | null
  created_at: string
  updated_at: string
  items?: EditRequestItem[]
}

export interface EditGrantItem {
  id: number
  enrollment_id: number
  created_at: string
}

export interface EditGrant {
  id: number
  scope: EditScope
  grant_type: EditRequestType
  granted_to: number
  granted_to_name?: string
  period: number
  teacher_assignment: number | null
  valid_until: string
  created_by: number | null
  created_by_name?: string
  source_request: number | null
  created_at: string
  items?: EditGrantItem[]
}

export interface GradebookAvailableSheet {
  teacher_assignment_id: number
  group_id: number
  group_name: string
  grade_id: number
  grade_name: string
  academic_load_id: number
  subject_name: string | null
  period: { id: number; name: string; is_closed: boolean }
  students_count: number
  achievements_count: number
  completion: { filled: number; total: number; percent: number; is_complete: boolean }
}

export interface GradebookDimension {
  id: number;
  name: string;
  percentage: number;
}

export interface GradebookResponse {
  gradesheet: {
    id: number;
    teacher_assignment: number;
    period: number;
    grading_mode?: GradeSheetGradingMode;
    status: string;
    published_at: string | null;
    created_at: string;
    updated_at: string;
  };
  period: { id: number; name: string; is_closed: boolean };
  teacher_assignment: { id: number; group: number; academic_load: number };
  dimensions: GradebookDimension[];
  achievements: GradebookAchievement[];
  students: GradebookStudent[];
  cells: GradebookCell[];
  computed: GradebookComputed[];

  activity_columns?: GradebookActivityColumn[];
  activity_cells?: GradebookActivityCell[];
}

export interface GradebookCellUpsert {
  enrollment: number;
  achievement: number;
  score: number | null;
}

export interface PreschoolGradebookCellUpsert {
  enrollment: number
  achievement: number
  qualitative_scale: number | null
}

export const academicApi = {
  // Years
  listYears: () => api.get<AcademicYear[]>('/api/academic-years/'),
  createYear: (data: Partial<AcademicYear>) => api.post<AcademicYear>('/api/academic-years/', data),
  updateYear: (id: number, data: Partial<AcademicYear>) => api.put<AcademicYear>(`/api/academic-years/${id}/`, data),
  deleteYear: (id: number) => api.delete(`/api/academic-years/${id}/`),

  // Promotions (SIEE)
  promotionPreview: (yearId: number, params?: { passing_score?: string | number | null }) =>
    api.get<PromotionPreviewResponse>(`/api/academic-years/${yearId}/promotion-preview/`, { params }),
  closeWithPromotion: (yearId: number, data?: { passing_score?: string | number | null }) =>
    api.post<CloseWithPromotionResponse>(`/api/academic-years/${yearId}/close-with-promotion/`, data ?? {}),
  applyPromotions: (
    sourceYearId: number,
    data: {
      target_academic_year: number
      passing_score?: string | number | null
      enrollment_ids?: number[]
      source_grade_id?: number
      exclude_repeated?: boolean
      target_group_id?: number
    }
  ) =>
    api.post<ApplyPromotionsResponse>(`/api/academic-years/${sourceYearId}/apply-promotions/`, data),

  // Commissions
  listCommissionRuleConfigs: (params?: Record<string, unknown>) =>
    api.get<CommissionRuleConfig[]>('/api/commission-rule-configs/', { params }),
  createCommissionRuleConfig: (data: Partial<CommissionRuleConfig>) =>
    api.post<CommissionRuleConfig>('/api/commission-rule-configs/', data),
  updateCommissionRuleConfig: (id: number, data: Partial<CommissionRuleConfig>) =>
    api.put<CommissionRuleConfig>(`/api/commission-rule-configs/${id}/`, data),

  listCommissions: (params?: Record<string, unknown>) =>
    api.get<Commission[]>('/api/commissions/', { params }),
  createCommission: (data: Partial<Commission>) =>
    api.post<Commission>('/api/commissions/', data),
  updateCommission: (id: number, data: Partial<Commission>) =>
    api.put<Commission>(`/api/commissions/${id}/`, data),
  deleteCommission: (id: number) =>
    api.delete(`/api/commissions/${id}/`),
  startCommission: (id: number) =>
    api.post<Commission>(`/api/commissions/${id}/start/`),
  closeCommission: (id: number) =>
    api.post<Commission>(`/api/commissions/${id}/close/`),
  refreshCommissionDifficulties: (id: number) =>
    api.post<{ created: number; updated: number; deleted: number; summary: CommissionDifficultySummary }>(`/api/commissions/${id}/refresh-difficulties/`),
  previewCommissionDifficulties: (id: number) =>
    api.get<{ count: number; summary: CommissionDifficultySummary; results: Array<{ enrollment_id: number; failed_subjects_count: number; failed_areas_count: number; is_flagged: boolean; decision_id: number | null; decision: string | null }> }>(`/api/commissions/${id}/preview-difficulties/`),

  listCommissionDecisions: (params?: Record<string, unknown>) =>
    api.get<PaginatedCommissionDecisionsResponse>('/api/commission-decisions/', { params }),
  updateCommissionDecision: (id: number, data: Partial<CommissionDecision>) =>
    api.put<CommissionDecision>(`/api/commission-decisions/${id}/`, data),
  generateCommissionActa: (decisionId: number, data?: { title?: string; commitments?: string }) =>
    api.post<CommitmentActa>(`/api/commission-decisions/${decisionId}/generate-acta/`, data ?? {}),
  downloadCommissionActaPdf: (decisionId: number) =>
    api.get<Blob>(`/api/commission-decisions/${decisionId}/acta/`, {
      params: { format: 'pdf' },
      responseType: 'blob',
    }),
  queueCommissionActaPdf: (decisionId: number) =>
    api.get(`/api/commission-decisions/${decisionId}/acta/`, {
      params: { format: 'pdf', async: '1' },
    }),
  queueCommissionActasBulk: (
    commissionId: number,
    data?: { only_flagged?: boolean; decision_ids?: number[] }
  ) => api.post<{ count: number; jobs: Array<{ id: number; status: string; report_type: string; preview_url?: string; download_url?: string }> }>(
    `/api/commissions/${commissionId}/generate-actas-async/`,
    data ?? {}
  ),
  listCommissionActas: (params?: Record<string, unknown>) =>
    api.get<CommitmentActa[]>('/api/commission-actas/', { params }),
  
  // Periods
  listPeriods: () => api.get<Period[]>('/api/periods/'),
  createPeriod: (data: Partial<Period>) => api.post<Period>('/api/periods/', data),
  updatePeriod: (id: number, data: Partial<Period>) => api.put<Period>(`/api/periods/${id}/`, data),
  deletePeriod: (id: number) => api.delete(`/api/periods/${id}/`),
  
  // Academic Levels
  listLevels: () => api.get<AcademicLevel[]>('/api/academic-levels/'),
  createLevel: (data: Omit<AcademicLevel, 'id'>) => api.post<AcademicLevel>('/api/academic-levels/', data),
  updateLevel: (id: number, data: Omit<AcademicLevel, 'id'>) => api.put<AcademicLevel>(`/api/academic-levels/${id}/`, data),
  deleteLevel: (id: number) => api.delete(`/api/academic-levels/${id}/`),

  // Grades
  listGrades: () => api.get<Grade[]>('/api/grades/'),
  createGrade: (data: { name: string; level?: number; ordinal?: number }) => api.post<Grade>('/api/grades/', data),
  updateGrade: (id: number, data: { name: string; level?: number; ordinal?: number }) => api.put<Grade>(`/api/grades/${id}/`, data),
  deleteGrade: (id: number) => api.delete(`/api/grades/${id}/`),

  // Groups
  listGroups: (params?: Record<string, unknown>) => api.get<Group[]>('/api/groups/', { params }),
  getGroup: (id: number) => api.get<Group>(`/api/groups/${id}/`),
  downloadGradeReportSheetPdf: (id: number, params?: { period?: number; subject?: string; teacher?: string; columns?: number }) =>
    api.get<Blob>(`/api/groups/${id}/grade-report-sheet/`, {
      params: {
        format: 'pdf',
        ...(params ?? {}),
      },
      responseType: 'blob',
    }),
  createGroup: (data: GroupUpsertPayload) => api.post<Group>('/api/groups/', data),
  updateGroup: (id: number, data: GroupUpsertPayload) => api.put<Group>(`/api/groups/${id}/`, data),
  deleteGroup: (id: number) => api.delete(`/api/groups/${id}/`),
  copyGroupsFromYear: (sourceYearId: number, targetYearId: number) =>
    api.post('/api/groups/copy_from_year/', { source_year_id: sourceYearId, target_year_id: targetYearId }),

  // Areas
  listAreas: () => api.get<Area[]>('/api/areas/'),
  createArea: (data: Omit<Area, 'id'>) => api.post<Area>('/api/areas/', data),
  updateArea: (id: number, data: Omit<Area, 'id'>) => api.put<Area>(`/api/areas/${id}/`, data),
  deleteArea: (id: number) => api.delete(`/api/areas/${id}/`),

  // Subjects
  listSubjects: () => api.get<Subject[]>('/api/subjects/'),
  createSubject: (data: Omit<Subject, 'id' | 'area_name'>) => api.post<Subject>('/api/subjects/', data),
  updateSubject: (id: number, data: Omit<Subject, 'id' | 'area_name'>) => api.put<Subject>(`/api/subjects/${id}/`, data),
  deleteSubject: (id: number) => api.delete(`/api/subjects/${id}/`),

  // Academic Loads
  listAcademicLoads: (params?: Record<string, unknown>) => api.get<AcademicLoad[]>('/api/academic-loads/', { params }),
  createAcademicLoad: (data: Omit<AcademicLoad, 'id' | 'subject_name' | 'grade_name'>) => api.post<AcademicLoad>('/api/academic-loads/', data),
  updateAcademicLoad: (id: number, data: Omit<AcademicLoad, 'id' | 'subject_name' | 'grade_name'>) => api.put<AcademicLoad>(`/api/academic-loads/${id}/`, data),
  deleteAcademicLoad: (id: number) => api.delete(`/api/academic-loads/${id}/`),

  // Assignments
  listAssignments: () => api.get<TeacherAssignment[]>('/api/teacher-assignments/'),
  listMyAssignments: (params?: { academic_year?: number | '' }) =>
    api.get<TeacherAssignment[]>('/api/teacher-assignments/me/', { params }),
  createAssignment: (data: Omit<TeacherAssignment, 'id' | 'teacher_name' | 'academic_load_name' | 'group_name'>) => api.post<TeacherAssignment>('/api/teacher-assignments/', data),
  assignGradePlan: (data: AssignGradePlanPayload) =>
    api.post<AssignGradePlanResponse>('/api/teacher-assignments/assign_grade_plan/', data),
  deleteAssignment: (id: number) => api.delete(`/api/teacher-assignments/${id}/`),

  // Gradebook
  getGradebook: (teacherAssignmentId: number, periodId: number) =>
    api.get<GradebookResponse>('/api/grade-sheets/gradebook/', {
      params: { teacher_assignment: teacherAssignmentId, period: periodId },
    }),
  listAvailableGradeSheets: (periodId: number) =>
    api.get<{ results: GradebookAvailableSheet[] }>('/api/grade-sheets/available/', {
      params: { period: periodId },
    }),
  listGradeSheets: (params?: { page?: number; page_size?: number; search?: string; ordering?: string }) =>
    api.get<PaginatedResponse<GradeSheetListItem>>('/api/grade-sheets/', { params }),
  resetGradeSheet: (gradeSheetId: number) => api.post<{ detail: string }>(`/api/grade-sheets/${gradeSheetId}/reset/`),
  bulkUpsertGradebook: (data: { teacher_assignment: number; period: number; grades: GradebookCellUpsert[] }) =>
    api.post<GradebookBulkUpsertResponse>('/api/grade-sheets/bulk-upsert/', data),

  // Gradebook (Preschool qualitative)
  listPreschoolLabels: (params: { academic_year?: number; period?: number }) =>
    api.get<{ results: PreschoolLabel[] }>('/api/preschool-gradebook/labels/', { params }),
  listAvailablePreschoolGradeSheets: (periodId: number) =>
    api.get<{ results: GradebookAvailableSheet[] }>('/api/preschool-gradebook/available/', {
      params: { period: periodId },
    }),
  getPreschoolGradebook: (teacherAssignmentId: number, periodId: number) =>
    api.get<PreschoolGradebookResponse>('/api/preschool-gradebook/gradebook/', {
      params: { teacher_assignment: teacherAssignmentId, period: periodId },
    }),
  bulkUpsertPreschoolGradebook: (data: {
    teacher_assignment: number
    period: number
    grades: PreschoolGradebookCellUpsert[]
  }) => api.post<PreschoolGradebookBulkUpsertResponse>('/api/preschool-gradebook/bulk-upsert/', data),

  // Gradebook (Activities mode)
  setGradeSheetGradingMode: (data: {
    teacher_assignment: number
    period: number
    grading_mode: GradeSheetGradingMode
    default_columns?: number
  }) => api.post<GradeSheetSetGradingModeResponse>('/api/grade-sheets/set-grading-mode/', data),
  bulkUpsertActivityColumns: (data: { teacher_assignment: number; period: number; columns: ActivityColumnUpsert[] }) =>
    api.post<ActivityColumnsBulkUpsertResponse>('/api/grade-sheets/activity-columns/bulk-upsert/', data),
  bulkUpsertActivityGrades: (data: { teacher_assignment: number; period: number; grades: ActivityGradeUpsert[] }) =>
    api.post<ActivityGradesBulkUpsertResponse>('/api/grade-sheets/activity-grades/bulk-upsert/', data),

  // Edit windows: requests/grants
  createEditRequest: (data: {
    scope: EditScope
    request_type: EditRequestType
    period: number
    teacher_assignment?: number | null
    requested_until?: string | null
    reason: string
    enrollment_ids?: number[]
  }) => api.post<EditRequest>('/api/edit-requests/', data),
  listEditRequests: (params?: Record<string, unknown>) => api.get<EditRequest[]>('/api/edit-requests/', { params }),
  listMyEditRequests: () => api.get<EditRequest[]>('/api/edit-requests/my/'),
  approveEditRequest: (id: number, data: { valid_until?: string; decision_note?: string }) =>
    api.post<{ detail: string; grant_id: number }>(`/api/edit-requests/${id}/approve/`, data),
  rejectEditRequest: (id: number, data: { decision_note?: string }) =>
    api.post<{ detail: string }>(`/api/edit-requests/${id}/reject/`, data),
  listEditGrants: (params?: Record<string, unknown>) => api.get<EditGrant[]>('/api/edit-grants/', { params }),
  listMyEditGrants: (params?: Record<string, unknown>) => api.get<EditGrant[]>('/api/edit-grants/my/', { params }),

  // Evaluation
  listEvaluationScales: () => api.get<EvaluationScale[]>('/api/evaluation-scales/'),
  createEvaluationScale: (data: Omit<EvaluationScale, 'id'>) => api.post<EvaluationScale>('/api/evaluation-scales/', data),
  updateEvaluationScale: (id: number, data: Omit<EvaluationScale, 'id'>) => api.put<EvaluationScale>(`/api/evaluation-scales/${id}/`, data),
  deleteEvaluationScale: (id: number) => api.delete(`/api/evaluation-scales/${id}/`),
  copyEvaluationScales: (sourceYearId: number, targetYearId: number) => api.post('/api/evaluation-scales/copy_from_year/', { source_year_id: sourceYearId, target_year_id: targetYearId }),

  // Achievement Definitions (Bank)
  listAchievementDefinitions: (params?: Record<string, unknown>) => api.get<AchievementDefinition[]>('/api/achievement-definitions/', { params }),
  createAchievementDefinition: (data: Partial<AchievementDefinition>) => api.post<AchievementDefinition>('/api/achievement-definitions/', data),
  updateAchievementDefinition: (id: number, data: Partial<AchievementDefinition>) => api.put<AchievementDefinition>(`/api/achievement-definitions/${id}/`, data),
  deleteAchievementDefinition: (id: number) => api.delete(`/api/achievement-definitions/${id}/`),
  improveAchievementWording: (text: string) => api.post<{ improved_text: string }>('/api/achievement-definitions/improve-wording/', { text }),

  // Achievements (Planning)
  listAchievements: (params?: Record<string, unknown>) => api.get<Achievement[]>('/api/achievements/', { params }),
  createAchievement: (data: Partial<Omit<Achievement, 'indicators'>> & { indicators?: PerformanceIndicatorCreate[] }) =>
    api.post<Achievement>('/api/achievements/', data),
  updateAchievement: (id: number, data: Partial<Achievement>) => api.put<Achievement>(`/api/achievements/${id}/`, data),
  deleteAchievement: (id: number) => api.delete(`/api/achievements/${id}/`),
  
  // AI
  generateIndicators: (description: string) => api.post<Record<string, string>>('/api/achievements/generate-indicators/', { description }),
  createIndicators: (achievementId: number, indicators: { level: string, description: string }[]) => api.post(`/api/achievements/${achievementId}/create-indicators/`, { indicators }),

  // Dimensions
  listDimensions: (yearId?: number) => api.get<Dimension[]>('/api/dimensions/', { params: { academic_year: yearId } }),
  createDimension: (data: Partial<Dimension>) => api.post<Dimension>('/api/dimensions/', data),
  updateDimension: (id: number, data: Partial<Dimension>) => api.put<Dimension>(`/api/dimensions/${id}/`, data),
  deleteDimension: (id: number) => api.delete(`/api/dimensions/${id}/`),
  copyDimensionsFromYear: (sourceYearId: number, targetYearId: number) =>
    api.post('/api/dimensions/copy_from_year/', { source_year_id: sourceYearId, target_year_id: targetYearId }),

  listEvaluationComponents: () => api.get<EvaluationComponent[]>('/api/evaluation-components/'),
  createEvaluationComponent: (data: Omit<EvaluationComponent, 'id'>) => api.post<EvaluationComponent>('/api/evaluation-components/', data),

  listAssessments: () => api.get<Assessment[]>('/api/assessments/'),
  createAssessment: (data: Omit<Assessment, 'id' | 'component_name'>) => api.post<Assessment>('/api/assessments/', data),

  listStudentGrades: () => api.get<StudentGrade[]>('/api/student-grades/'),
  createStudentGrade: (data: Omit<StudentGrade, 'id' | 'student_name'>) => api.post<StudentGrade>('/api/student-grades/', data),

  // Reports: Academic period report PDF
  downloadAcademicPeriodReportByEnrollment: (enrollmentId: number, periodId: number) =>
    api.get(`/api/enrollments/${enrollmentId}/academic-report/`, {
      params: { period: periodId },
      responseType: 'blob',
    }),
  downloadAcademicPeriodReportByGroup: (groupId: number, periodId: number) =>
    api.get(`/api/groups/${groupId}/academic-report/`, {
      params: { period: periodId },
      responseType: 'blob',
    }),
}


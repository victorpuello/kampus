import { api } from './api';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'TARDY' | 'EXCUSED';

export interface AttendanceSession {
  id: number;
  teacher_assignment: number;
  period: number;
  class_date: string;
  starts_at: string;
  sequence: number;
  group_id: number;
  group_name: string;
  grade_id: number;
  grade_name: string;
  group_display?: string;
  subject_name: string;
  teacher_id?: number;
  teacher_name?: string;
  locked_at: string | null;

  deletion_requested_at?: string | null;
  deletion_requested_by?: number | null;
  deletion_approved_at?: string | null;
  deletion_approved_by?: number | null;
}

export interface AttendanceRosterStudent {
  enrollment_id: number;
  student_full_name: string;
  student_photo_url?: string | null;
  status: AttendanceStatus | null;
  tardy_at: string | null;
  excuse_reason: string;
  record_id: number | null;
}

export interface AttendanceRosterResponse {
  session: AttendanceSession;
  students: AttendanceRosterStudent[];
}

export interface AttendanceBulkMarkItem {
  enrollment_id: number;
  status: AttendanceStatus;
  excuse_reason?: string;
}

export interface AttendanceStudentStatsResponse {
  teacher_assignment: {
    id: number;
    group_id: number;
    group_name: string;
    grade_name?: string;
    subject_name: string;
  };
  period: { id: number; name: string };
  sessions_count: number;
  students: Array<{
    enrollment_id: number;
    student_full_name: string;
    absences: number;
    tardies: number;
    excused: number;
    present: number;
  }>;
}

export interface AttendanceKpiDashboardResponse {
  filters: {
    start_date: string;
    end_date: string;
    grade_id: number | null;
    group_id: number | null;
    teacher_id: number | null;
    area_id: number | null;
  };
  summary: {
    sessions_count: number;
    total_records: number;
    present: number;
    absent: number;
    tardy: number;
    excused: number;
    attendance_rate: number;
    absence_rate: number;
    tardy_rate: number;
    excused_rate: number;
    coverage_rate: number;
  };
  previous_period: {
    start_date: string;
    end_date: string;
  };
  previous_summary: {
    sessions_count: number;
    total_records: number;
    present: number;
    absent: number;
    tardy: number;
    excused: number;
    attendance_rate: number;
    absence_rate: number;
    tardy_rate: number;
    excused_rate: number;
    coverage_rate: number;
  };
  summary_delta: {
    attendance_rate_delta: number;
    absence_rate_delta: number;
    tardy_rate_delta: number;
    excused_rate_delta: number;
    coverage_rate_delta: number;
  };
  group_comparison: Array<{
    group_id: number;
    group_name: string;
    grade_name: string;
    attendance_rate: number;
    attendance_rate_delta: number;
    absences: number;
    tardies: number;
    excused: number;
    total_records: number;
    gap_vs_institution: number;
  }>;
  student_risk: Array<{
    enrollment_id: number;
    student_full_name: string;
    grade_name: string;
    group_name: string;
    absences: number;
    tardies: number;
    excused: number;
    present: number;
    total_records: number;
    absence_rate: number;
    risk_score: number;
    risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
  trend: Array<{
    date: string;
    attendance_rate: number;
    previous_attendance_rate: number | null;
    attendance_rate_delta: number | null;
    absences: number;
    total_records: number;
  }>;
  previous_trend: Array<{
    date: string;
    attendance_rate: number;
    absences: number;
    total_records: number;
  }>;
}

export interface AttendanceKpiStudentDetailResponse {
  student: {
    enrollment_id: number;
    student_full_name: string;
    grade_name: string;
    group_name: string;
  };
  filters: {
    start_date: string;
    end_date: string;
    grade_id: number | null;
    group_id: number | null;
    teacher_id: number | null;
    area_id: number | null;
  };
  summary: {
    total_records: number;
    present: number;
    absent: number;
    tardy: number;
    excused: number;
    attendance_rate: number;
    absence_rate: number;
  };
  by_subject: Array<{
    subject_name: string;
    present: number;
    absent: number;
    tardy: number;
    excused: number;
    total_records: number;
    absence_rate: number;
  }>;
  timeline: Array<{
    date: string;
    present: number;
    absent: number;
    tardy: number;
    excused: number;
    attendance_rate: number;
  }>;
}

export type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

const API_PREFIX = '/api/attendance';

const OFFLINE_QUEUE_KEY = 'kampus:attendance:offlineQueue:v1';

type AxiosLikeError = {
  response?: {
    status?: unknown;
    data?: unknown;
  };
};

type OfflineQueueItem = {
  sessionId: number;
  payload: { records: AttendanceBulkMarkItem[] };
  createdAt: number;
};

function readQueue(): OfflineQueueItem[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineQueueItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: OfflineQueueItem[]) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items.slice(-50)));
}

export async function createAttendanceSession(input: {
  teacher_assignment_id: number;
  period_id: number;
  class_date?: string;
  client_uuid: string;
}): Promise<AttendanceSession> {
  const res = await api.post<AttendanceSession>(`${API_PREFIX}/sessions/`, input);
  return res.data;
}

export async function getAttendanceRoster(sessionId: number): Promise<AttendanceRosterResponse> {
  const res = await api.get<AttendanceRosterResponse>(`${API_PREFIX}/sessions/${sessionId}/roster/`);
  return res.data;
}

export async function listAttendanceSessions(input: {
  page?: number;
  page_size?: number;
  ordering?: string;
}): Promise<PaginatedResponse<AttendanceSession> | AttendanceSession[]> {
  const res = await api.get(`${API_PREFIX}/sessions/`, {
    params: {
      page: input.page,
      page_size: input.page_size,
      ordering: input.ordering,
    },
  });
  return res.data as PaginatedResponse<AttendanceSession> | AttendanceSession[];
}

export async function bulkMarkAttendance(sessionId: number, records: AttendanceBulkMarkItem[]) {
  try {
    const res = await api.post(`${API_PREFIX}/sessions/${sessionId}/bulk-mark/`, { records });
    return { queued: false, data: res.data } as const;
  } catch (err) {
    const anyErr = err as AxiosLikeError;

    // If we have an HTTP response, this is a server-side error (validation, locked, etc).
    // Do NOT enqueue it as offline.
    if (anyErr?.response) {
      throw err;
    }

    // Offline-lite: if network fails, queue the payload and allow UI to retry later.
    const queue = readQueue();
    queue.push({ sessionId, payload: { records }, createdAt: Date.now() });
    writeQueue(queue);
    return { queued: true } as const;
  }
}

export async function flushAttendanceOfflineQueue() {
  const queue = readQueue();
  if (!queue.length) return { flushed: 0, remaining: 0 };

  const remaining: OfflineQueueItem[] = [];
  let flushed = 0;

  for (const item of queue) {
    try {
      await api.post(`${API_PREFIX}/sessions/${item.sessionId}/bulk-mark/`, item.payload);
      flushed += 1;
    } catch (err) {
      const anyErr = err as AxiosLikeError;
      // If server rejects it (e.g. locked/validation), drop it so it doesn't retry forever.
      if (anyErr?.response) {
        continue;
      }
      remaining.push(item);
    }
  }

  writeQueue(remaining);
  return { flushed, remaining: remaining.length };
}

export async function closeAttendanceSession(sessionId: number): Promise<{ locked_at: string }> {
  const res = await api.post<{ locked_at: string }>(`${API_PREFIX}/sessions/${sessionId}/close/`, {});
  return res.data;
}

/**
 * Teacher flow: sends deletion request (HTTP 202) and deactivates the session for the teacher.
 * Admin flow: deletes definitively (HTTP 204) but only if a request exists.
 */
export async function deleteAttendanceSession(sessionId: number): Promise<{ detail?: string } | null> {
  const res = await api.delete(`${API_PREFIX}/sessions/${sessionId}/`)
  if (!res.data) return null
  return res.data as { detail?: string }
}

export async function listPendingDeletionAttendanceSessions(input: {
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<AttendanceSession> | AttendanceSession[]> {
  const res = await api.get(`${API_PREFIX}/sessions/pending-deletion/`, {
    params: {
      page: input.page,
      page_size: input.page_size,
    },
  })
  return res.data as PaginatedResponse<AttendanceSession> | AttendanceSession[]
}

export async function getAttendanceStudentStats(input: { teacher_assignment_id: number; period_id: number }) {
  const res = await api.get<AttendanceStudentStatsResponse>(`${API_PREFIX}/stats/students/`, {
    params: {
      teacher_assignment: input.teacher_assignment_id,
      period: input.period_id,
    },
  });
  return res.data;
}

export async function getAttendanceKpiDashboard(input: {
  start_date: string;
  end_date: string;
  grade_id?: number;
  group_id?: number;
  teacher_id?: number;
  area_id?: number;
}) {
  const res = await api.get<AttendanceKpiDashboardResponse>(`${API_PREFIX}/stats/kpi/`, {
    params: {
      start_date: input.start_date,
      end_date: input.end_date,
      grade_id: input.grade_id,
      group_id: input.group_id,
      teacher_id: input.teacher_id,
      area_id: input.area_id,
    },
  });
  return res.data;
}

export async function getAttendanceKpiStudentDetail(input: {
  enrollment_id: number;
  start_date: string;
  end_date: string;
  grade_id?: number;
  group_id?: number;
  teacher_id?: number;
  area_id?: number;
}) {
  const res = await api.get<AttendanceKpiStudentDetailResponse>(`${API_PREFIX}/stats/kpi/student-detail/`, {
    params: {
      enrollment_id: input.enrollment_id,
      start_date: input.start_date,
      end_date: input.end_date,
      grade_id: input.grade_id,
      group_id: input.group_id,
      teacher_id: input.teacher_id,
      area_id: input.area_id,
    },
  });
  return res.data;
}

export async function downloadAttendanceManualSheetPdf(input: { group_id: number; columns?: number }): Promise<Blob> {
  const res = await api.get(`${API_PREFIX}/planillas/manual/`, {
    params: {
      group_id: input.group_id,
      format: 'pdf',
      columns: input.columns,
    },
    responseType: 'blob',
  })
  return res.data as Blob
}

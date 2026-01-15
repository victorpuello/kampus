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
  locked_at: string | null;
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

export async function getAttendanceStudentStats(input: { teacher_assignment_id: number; period_id: number }) {
  const res = await api.get<AttendanceStudentStatsResponse>(`${API_PREFIX}/stats/students/`, {
    params: {
      teacher_assignment: input.teacher_assignment_id,
      period: input.period_id,
    },
  });
  return res.data;
}

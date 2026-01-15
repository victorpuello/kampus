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
  subject_name: string;
  locked_at: string | null;
}

export interface AttendanceRosterStudent {
  enrollment_id: number;
  student_full_name: string;
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

const OFFLINE_QUEUE_KEY = 'kampus:attendance:offlineQueue:v1';

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
  const res = await api.post<AttendanceSession>('/attendance/sessions/', input);
  return res.data;
}

export async function getAttendanceRoster(sessionId: number): Promise<AttendanceRosterResponse> {
  const res = await api.get<AttendanceRosterResponse>(`/attendance/sessions/${sessionId}/roster/`);
  return res.data;
}

export async function bulkMarkAttendance(sessionId: number, records: AttendanceBulkMarkItem[]) {
  try {
    const res = await api.post(`/attendance/sessions/${sessionId}/bulk-mark/`, { records });
    return { queued: false, data: res.data } as const;
  } catch (err) {
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
      await api.post(`/attendance/sessions/${item.sessionId}/bulk-mark/`, item.payload);
      flushed += 1;
    } catch {
      remaining.push(item);
    }
  }

  writeQueue(remaining);
  return { flushed, remaining: remaining.length };
}

import { api } from './api'

export type Notification = {
  id: number
  type: string
  title: string
  body: string
  url: string
  created_at: string
  read_at: string | null
  is_read: boolean
}

export type AdminDashboardSummary = {
  notifications: {
    unread: number
    trend: {
      last7: number
      last30: number
    }
    recent_unread: Notification[]
  }
  operational_plan: {
    upcoming_7: number
    upcoming_30: number
    due_today: number
    due_1_3_days: number
    without_responsible: number
    upcoming_items: Array<{
      id: number
      title: string
      description: string
      activity_date: string
      end_date: string | null
      is_active: boolean
      is_completed: boolean
      completed_at: string | null
      completion_notes: string
      completed_by: number | null
      completed_by_name: string | null
      responsible_users: Array<{
        id: number
        full_name: string
        email: string
        role: string
      }>
      days_until: number
      responsables_texto: string
      responsables_sin_mapear: boolean
      created_by: number | null
      created_by_name: string | null
      updated_by: number | null
      updated_by_name: string | null
      created_at: string
      updated_at: string
    }>
  }
}

export type TeacherMotivationalPhraseResponse = {
  phrase: string
  source: 'ai' | 'fallback'
}

export const NOTIFICATIONS_UPDATED_EVENT = 'kampus:notifications-updated'

export const emitNotificationsUpdated = () => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT))
}

export const onNotificationsUpdated = (handler: () => void) => {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, handler)
  return () => window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, handler)
}

export const notificationsApi = {
  list: () => api.get<Notification[]>('/api/notifications/'),
  unreadCount: () => api.get<{ unread: number }>('/api/notifications/unread-count/'),
  adminDashboardSummary: () => api.get<AdminDashboardSummary>('/api/notifications/admin-dashboard-summary/'),
  teacherMotivationalPhrase: () =>
    api.get<TeacherMotivationalPhraseResponse>('/api/notifications/teacher-motivational-phrase/'),
  markRead: (id: number) => api.post(`/api/notifications/${id}/mark-read/`),
  markAllRead: () => api.post('/api/notifications/mark-all-read/'),
}

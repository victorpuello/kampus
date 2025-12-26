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
  markRead: (id: number) => api.post(`/api/notifications/${id}/mark-read/`),
  markAllRead: () => api.post('/api/notifications/mark-all-read/'),
}

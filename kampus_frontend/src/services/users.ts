import { api } from './api';

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
}

export const usersApi = {
  // Paginated list (server-side)
  list: (params?: { page?: number; page_size?: number; search?: string }) =>
    api.get<PaginatedResponse<User>>('/api/users/', { params }),

  // Full list (unpaginated) for internal select inputs
  getAll: () => api.get<User[]>('/api/users/all/'),
  getById: (id: number) => api.get<User>(`/api/users/${id}/`),
  create: (data: Partial<User> & { password?: string }) => api.post<User>('/api/users/', data),
  update: (id: number, data: Partial<User>) => api.patch<User>(`/api/users/${id}/`, data),
  setPassword: (id: number, password: string) =>
    api.post<{ detail: string }>(`/api/users/${id}/set_password/`, { password }),
  delete: (id: number) => api.delete(`/api/users/${id}/`),
};

import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
});

function getStatusFromUnknownError(err: unknown): number | undefined {
  if (axios.isAxiosError(err)) return err.response?.status
  return (err as { response?: { status?: number } } | undefined)?.response?.status
}

const AUTH_LOGOUT_EVENT = 'kampus:auth:logout'

function emitAuthLogout() {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT))
    }
  } catch {
    // noop
  }
}

let isRefreshing = false;
let pendingRequests: Array<() => void> = [];

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    if (!original) return Promise.reject(error)
    
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      if (isRefreshing) {
        return new Promise((resolve) => {
          pendingRequests.push(() => {
            resolve(api(original));
          });
        });
      }

      isRefreshing = true;

      try {
        await api.post('/api/auth/refresh/')

        pendingRequests.forEach((cb) => cb());
        pendingRequests = [];
        isRefreshing = false;

        return api(original);
      } catch (err) {
        isRefreshing = false;
        pendingRequests = [];
        const status = getStatusFromUnknownError(err)
        if (status === 401 || status === 403) {
          emitAuthLogout()
        }
        return Promise.reject(err);
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  ensureCsrf: () => api.get('/api/auth/csrf/'),
  login: (username: string, password: string) =>
    api.post('/api/auth/login/', { username, password }),
  logout: () => api.post('/api/auth/logout/'),
  me: () => api.get('/api/users/me/'),
};

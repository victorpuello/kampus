import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
});

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null
  const encodedName = `${encodeURIComponent(name)}=`
  const parts = document.cookie.split(';')
  for (const rawPart of parts) {
    const part = rawPart.trim()
    if (part.startsWith(encodedName)) {
      const rawValue = part.slice(encodedName.length)
      return decodeURIComponent(rawValue)
    }
  }
  return null
}

function isUnsafeMethod(method?: string): boolean {
  const normalized = (method || '').toUpperCase()
  return normalized === 'POST' || normalized === 'PUT' || normalized === 'PATCH' || normalized === 'DELETE'
}

let csrfBootstrapPromise: Promise<void> | null = null

async function ensureCsrfCookie(): Promise<void> {
  if (getCookieValue('csrftoken')) return

  if (!csrfBootstrapPromise) {
    csrfBootstrapPromise = axios
      .get(`${API_BASE_URL}/api/auth/csrf/`, {
        withCredentials: true,
      })
      .then(() => undefined)
      .finally(() => {
        csrfBootstrapPromise = null
      })
  }

  await csrfBootstrapPromise
}

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
let pendingRequests: Array<{
  resolve: () => void
  reject: (error: unknown) => void
}> = [];

function resolvePendingRequests() {
  pendingRequests.forEach(({ resolve }) => resolve())
  pendingRequests = []
}

function rejectPendingRequests(error: unknown) {
  pendingRequests.forEach(({ reject }) => reject(error))
  pendingRequests = []
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    if (!original) return Promise.reject(error)
    const requestUrl = original.url || ''

    if (requestUrl.includes('/api/auth/refresh/')) {
      return Promise.reject(error)
    }
    
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingRequests.push({
            resolve: () => {
              resolve(api(original));
            },
            reject,
          });
        });
      }

      isRefreshing = true;

      try {
        await api.post('/api/auth/refresh/')

        resolvePendingRequests();
        isRefreshing = false;

        return api(original);
      } catch (err) {
        isRefreshing = false;
        rejectPendingRequests(err);
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

api.interceptors.request.use(async (config) => {
  if (!isUnsafeMethod(config.method)) return config

  await ensureCsrfCookie()

  const csrfToken = getCookieValue('csrftoken')
  if (csrfToken) {
    config.headers = config.headers || {}
    config.headers['X-CSRFToken'] = csrfToken
  }

  return config
})

export const authApi = {
  ensureCsrf: () => api.get('/api/auth/csrf/'),
  login: (username: string, password: string) =>
    api.post('/api/auth/login/', { username, password }),
  logout: () => api.post('/api/auth/logout/'),
  me: () => api.get('/api/users/me/'),
};

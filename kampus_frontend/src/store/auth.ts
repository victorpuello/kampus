import { create } from 'zustand'
import { authApi } from '../services/api'

const AUTH_LOGOUT_EVENT = 'kampus:auth:logout'

export type User = {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  role: string
}

type AuthState = {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  loading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
}

type TokenPair = {
  access: string
  refresh: string
}

function getStatusFromUnknownError(err: unknown): number | undefined {
  return (err as { response?: { status?: number } } | undefined)?.response?.status
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),
  user: null,
  loading: false,
  error: null,
  login: async (username: string, password: string) => {
    set({ loading: true, error: null })
    try {
      const { data } = await authApi.login(username, password)
      const tokenPair = data as TokenPair
      const access = tokenPair.access
      const refresh = tokenPair.refresh
      localStorage.setItem('accessToken', access)
      localStorage.setItem('refreshToken', refresh)
      set({ accessToken: access, refreshToken: refresh })
      await get().fetchMe()
    } catch (e: unknown) {
      set({ error: 'Credenciales inválidas', user: null })
      throw e
    } finally {
      set({ loading: false })
    }
  },
  logout: () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    set({ accessToken: null, refreshToken: null, user: null })
  },
  fetchMe: async () => {
    try {
      const { data } = await authApi.me()
      set({ user: data as User })
    } catch (e) {
      const status = getStatusFromUnknownError(e)
      // If token is invalid/expired, clear session.
      if (status === 401 || status === 403) {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        set({ accessToken: null, refreshToken: null, user: null })
      } else {
        set({ user: null })
      }
      throw e
    }
  },
}))

// Keep UI state in sync when the API layer detects invalid/expired tokens.
if (typeof window !== 'undefined') {
  window.addEventListener(AUTH_LOGOUT_EVENT, () => {
    useAuthStore.getState().logout()
  })
}


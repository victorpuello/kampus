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
  user: User | null
  loading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
}

function getStatusFromUnknownError(err: unknown): number | undefined {
  return (err as { response?: { status?: number } } | undefined)?.response?.status
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  error: null,
  login: async (username: string, password: string) => {
    set({ loading: true, error: null })
    try {
      await authApi.ensureCsrf()
      await authApi.login(username, password)
      await get().fetchMe()
    } catch (e: unknown) {
      set({ error: 'Credenciales inválidas', user: null })
      throw e
    } finally {
      set({ loading: false })
    }
  },
  logout: () => {
    void authApi.logout().catch(() => {
      // noop
    })
    set({ user: null })
  },
  fetchMe: async () => {
    try {
      const { data } = await authApi.me()
      set({ user: data as User })
    } catch (e) {
      const status = getStatusFromUnknownError(e)
      if (status === 401 || status === 403) {
        set({ user: null })
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


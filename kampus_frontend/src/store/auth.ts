import { create } from 'zustand'
import { authApi } from '../services/api'

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
      const access = (data as any).access as string
      const refresh = (data as any).refresh as string
      localStorage.setItem('accessToken', access)
      localStorage.setItem('refreshToken', refresh)
      set({ accessToken: access, refreshToken: refresh })
      await get().fetchMe()
    } catch (e: any) {
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
      set({ user: null })
      throw e
    }
  },
}))


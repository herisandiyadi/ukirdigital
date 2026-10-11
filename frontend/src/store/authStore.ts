import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

/**
 * BUG-S04: access token hanya di memori (tidak dipersist).
 * Refresh token ada di cookie httpOnly yang di-set backend, jadi JS tidak
 * pernah memegangnya. Hanya profil `user` yang dipersist untuk UI cepat;
 * sesi dipulihkan dari cookie lewat restoreSession() saat app dibuka.
 */
interface AuthState {
  user: User | null
  accessToken: string | null
  ready: boolean
  setAuth: (user: User, accessToken: string) => void
  setAccessToken: (accessToken: string) => void
  setUser: (user: User) => void
  setReady: (ready: boolean) => void
  logout: () => void
  isAdmin: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      ready: false,
      setAuth: (user, accessToken) => set({ user, accessToken }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setUser: (user) => set({ user }),
      setReady: (ready) => set({ ready }),
      logout: () => set({ user: null, accessToken: null }),
      isAdmin: () => get().user?.role === 'admin',
    }),
    {
      name: 'auth-storage',
      partialize: (s) => ({ user: s.user }),
    }
  )
)

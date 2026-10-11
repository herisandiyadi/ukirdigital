import api from '@/services/api'
import { useAuthStore } from '@/store/authStore'

/**
 * Logout terpusat (BUG-S05): panggil backend supaya refresh token dicabut,
 * lalu bersihkan state lokal. Backend juga menghapus cookie refresh.
 */
export async function performLogout(): Promise<void> {
  try {
    await api.post('/auth/logout', {})
  } catch {
    // Token mungkin sudah tidak valid; state lokal tetap dibersihkan.
  } finally {
    useAuthStore.getState().logout()
  }
}

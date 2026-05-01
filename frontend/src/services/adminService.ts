import api from './api'
import type { User, PaginatedResponse } from '@/types'

export interface AdminStatsOverview {
  total_users: number
  active_users: number
  total_jobs: number
  jobs_today: number
  jobs_this_month: number
  pending_jobs: number
  failed_jobs: number
  completed_jobs: number
}

export interface ChartDataPoint { date: string; conversions: number; users: number }
export interface FormatDistribution { name: string; value: number }
export interface AdminChartsData {
  daily: ChartDataPoint[]
  formats: FormatDistribution[]
}

export const fetchOverview = (): Promise<AdminStatsOverview> =>
  api.get('/admin/stats/overview').then((r) => r.data)

export const fetchCharts = (period = '30d'): Promise<AdminChartsData> =>
  api.get('/admin/stats/charts', { params: { period } }).then((r) => r.data)

export const fetchAdminJobs = (params = {}) =>
  api.get('/admin/jobs', { params }).then((r) => r.data)

// ── Users ─────────────────────────────────────────────────────────────────────
export const fetchAdminUsers = (params = {}): Promise<PaginatedResponse<User>> =>
  api.get('/admin/users', { params }).then((r) => r.data)

export const createAdminUser = (data: object): Promise<User> =>
  api.post('/admin/users', data).then((r) => r.data)

export const updateAdminUser = (id: string, data: object): Promise<User> =>
  api.put(`/admin/users/${id}`, data).then((r) => r.data)

export const updateUserLimits = (id: string, data: object) =>
  api.put(`/admin/users/${id}/limits`, data).then((r) => r.data)

export const suspendUser = (id: string) =>
  api.post(`/admin/users/${id}/suspend`).then((r) => r.data)

export const deleteAdminUser = (id: string) =>
  api.delete(`/admin/users/${id}`).then(() => undefined)

export const exportUsersCSV = () =>
  api.post('/admin/users/export-csv', {}, { responseType: 'blob' }).then((r) => r.data)

// ── Settings ──────────────────────────────────────────────────────────────────
export const fetchDefaultSettings = () =>
  api.get('/admin/settings/defaults').then((r) => r.data)

export const updateDefaultSettings = (data: object) =>
  api.put('/admin/settings/defaults', data).then((r) => r.data)

export const fetchPresets = () =>
  api.get('/admin/settings/presets').then((r) => r.data)

export const createPreset = (data: object) =>
  api.post('/admin/settings/presets', data).then((r) => r.data)

export const updatePreset = (id: string, data: object) =>
  api.put(`/admin/settings/presets/${id}`, data).then((r) => r.data)

export const deletePreset = (id: string) =>
  api.delete(`/admin/settings/presets/${id}`).then(() => undefined)

// ── Logs ──────────────────────────────────────────────────────────────────────
export const fetchLogs = (params = {}) =>
  api.get('/admin/logs', { params }).then((r) => r.data)

export const exportLogsCSV = (params = {}) =>
  api.get('/admin/logs/export-csv', { params, responseType: 'blob' }).then((r) => r.data)

// ── Namespace object (used by pages that import `adminService`) ───────────────
export const adminService = {
  getStats:           () => api.get('/api/admin/stats/overview').then(r => r.data),
  getCharts:          (days = 30) => api.get('/api/admin/stats/charts', { params: { days } }).then(r => r.data),
  getJobs:            (params = {}) => api.get('/api/admin/jobs', { params }).then(r => r.data),
  getUsers:           (params = {}) => api.get('/api/admin/users', { params }).then(r => r.data),
  updateUser:         (id: string, data: object) => api.put(`/api/admin/users/${id}`, data).then(r => r.data),
  updateUserLimits:   (id: string, data: object) => api.put(`/api/admin/users/${id}/limits`, data).then(r => r.data),
  suspendUser:        (id: string) => api.post(`/api/admin/users/${id}/suspend`).then(r => r.data),
  deleteUser:         (id: string) => api.delete(`/api/admin/users/${id}`).then(() => undefined),
  getLogs:            (params = {}) => api.get('/admin/logs', { params }).then(r => r.data),
  getDefaultSettings: () => api.get('/admin/settings/defaults').then(r => r.data),
  updateDefaultSettings: (data: object) => api.put('/admin/settings/defaults', data).then(r => r.data),
  getPresets:         () => api.get('/admin/settings/presets').then(r => r.data),
  updatePresets:      (data: object[]) => api.put('/admin/settings/presets', data).then(r => r.data),
}

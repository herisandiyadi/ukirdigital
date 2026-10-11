import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { useWebSocket }  from './hooks/useWebSocket'

// Auth pages (small, eager-loaded)
import LoginPage    from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import VerificationPendingPage from './pages/VerificationPendingPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import ResetPasswordPage from './pages/ResetPasswordPage'

// User pages — lazy loaded
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ConvertPage   = lazy(() => import('./pages/ConvertPage'))
const HistoryPage   = lazy(() => import('./pages/HistoryPage'))
const SettingsPage  = lazy(() => import('./pages/SettingsPage'))

// Admin pages — lazy loaded (heavy: recharts)
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'))
const UsersPage          = lazy(() => import('./pages/admin/UsersPage'))
const DefaultLimitsPage  = lazy(() => import('./pages/admin/DefaultLimitsPage'))
const ActivityLogsPage   = lazy(() => import('./pages/admin/ActivityLogsPage'))

// Guards
import { RequireAuth, RequireAdmin } from './components/RequireAuth'

// ── Loading fallback ──────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex h-full w-full items-center justify-center py-24">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
    </div>
  )
}

// ── WebSocket wrapper ─────────────────────────────────────────────────────────
function WebSocketProvider({ children }: { children: React.ReactNode }) {
  useWebSocket()
  return <>{children}</>
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <WebSocketProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>

            {/* ── Public ─────────────────────────────────────────────── */}
            <Route path="/login"    element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verification-pending" element={<VerificationPendingPage />} />
            <Route path="/verify-email"   element={<VerifyEmailPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* ── Authenticated user ──────────────────────────────────── */}
            <Route element={<RequireAuth />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/convert"   element={<ConvertPage />} />
              <Route path="/history"   element={<HistoryPage />} />
              <Route path="/settings"  element={<SettingsPage />} />
            </Route>

            {/* ── Admin only ───────────────────────────────────────────── */}
            <Route element={<RequireAdmin />}>
              <Route path="/admin"        element={<AdminDashboardPage />} />
              <Route path="/admin/users"  element={<UsersPage />} />
              <Route path="/admin/limits" element={<DefaultLimitsPage />} />
              <Route path="/admin/logs"   element={<ActivityLogsPage />} />
            </Route>

            {/* ── Fallback ─────────────────────────────────────────────── */}
            <Route path="/"  element={<Navigate to="/dashboard" replace />} />
            <Route path="*"  element={<Navigate to="/dashboard" replace />} />

          </Routes>
        </Suspense>
      </WebSocketProvider>
    </BrowserRouter>
  )
}

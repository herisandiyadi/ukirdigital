// ── User ───────────────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'user'

export interface UserLimit {
  max_conversions_per_day: number
  max_conversions_per_month: number
  max_file_size_mb: number
  max_output_formats: number
  allowed_formats: string[]
  use_ai_analysis: boolean
}

export interface User {
  id: string
  email: string
  username: string
  full_name: string | null
  phone_number?: string | null
  role: UserRole
  is_active: boolean
  is_verified: boolean
  avatar_url: string | null
  created_at: string
  last_login: string | null
  limits?: UserLimit | null
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user: User
}

// ── Conversion ────────────────────────────────────────────────────────────────
export type ConversionStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type ConversionMethod = 'heightmap' | 'relief' | 'silhouette' | 'profile'

export interface ConversionSettings {
  threshold: number
  max_height_mm: number
  base_thickness_mm: number
  scale_mm_per_px: number
  resolution: number
  method: ConversionMethod
  smoothing_blur_radius?: number
  ball_radius_mm?: number  // Ball nose radius (R3/2)
  stepover_mm?: number     // Calculated as 10% of ball_radius_mm
}

export interface AIAnalysis {
  complexity?: string
  dominant_shapes?: string[]
  has_text?: boolean
  background?: string
  recommended_method?: ConversionMethod
  recommended_formats?: string[]
  suggested_threshold?: number
  suggested_max_height_mm?: number
  notes?: string
  raw_analysis?: string
  parse_error?: boolean
}

export interface ConversionJob {
  id: string
  user_id: string
  original_filename: string
  file_size_bytes: number | null
  status: ConversionStatus
  method: ConversionMethod
  settings: ConversionSettings | null
  ai_analysis: AIAnalysis | null
  output_files: Record<string, string> | null
  error_message: string | null
  processing_time_seconds: number | null
  created_at: string
  completed_at: string | null
}

export interface ConversionJobListResponse {
  total: number
  items: ConversionJob[]
}

export interface LimitsStatus {
  used_today: number
  max_per_day: number
  remaining_today: number
  used_this_month: number
  max_per_month: number
  remaining_month: number
  daily_limit_hit: boolean
  monthly_limit_hit: boolean
  max_file_size_mb: number
  max_output_formats: number
  allowed_formats: string[]
  use_ai_analysis: boolean
}

export interface AnalyzeResponse {
  filename: string
  analysis: AIAnalysis
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export interface AdminStatsOverview {
  total_users: number
  active_users_today: number
  conversions_today: number
  conversions_this_month: number
  total_storage_mb: number
  failed_jobs_today: number
}

export interface ChartDataPoint {
  date: string
  count: number
}

export interface FormatDistribution {
  format: string
  count: number
}

export interface TopUser {
  username: string
  email: string
  count: number
}

export interface AdminChartsData {
  conversions_per_day: ChartDataPoint[]
  format_distribution: FormatDistribution[]
  top_users: TopUser[]
}

export interface UsageLog {
  id: string
  user_id: string
  job_id: string | null
  action: string
  ip_address: string | null
  user_agent: string | null
  created_at: string
  user?: Pick<User, 'username' | 'email' | 'avatar_url'>
}

export interface UsageLogListResponse {
  total: number
  items: UsageLog[]
}

// ── Pagination ────────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  total: number
  items: T[]
}

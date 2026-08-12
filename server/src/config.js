import 'dotenv/config'

export const PORT = process.env.PORT || 3000
export const SUPABASE_URL = process.env.SUPABASE_URL || ''
export const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'project-files'

export function requireBackendConfigured() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    const err = new Error(
      'Backend not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY in server/.env'
    )
    err.status = 500
    throw err
  }
}

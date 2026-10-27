// ─────────────────────────────────────────────────────────────
// Supabase client for centralized service
// ─────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  (typeof process !== 'undefined' && process.env && process.env.REACT_APP_SUPABASE_URL) ||
  import.meta.env?.VITE_SUPABASE_URL ||
  import.meta.env?.REACT_APP_SUPABASE_URL ||
  'https://balrgagdbbfagmgryrwv.supabase.co'

const SUPABASE_ANON_KEY =
  (typeof process !== 'undefined' && process.env && process.env.REACT_APP_SUPABASE_ANON_KEY) ||
  import.meta.env?.VITE_SUPABASE_ANON_KEY ||
  import.meta.env?.REACT_APP_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhbHJnYWdkYmJmYWdtZ3J5cnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDYxNTQsImV4cCI6MjEwMjAyMjE1NH0.5R4abl_tx3jVX5Z98Pm5Mp0eePYsTFXThjYZA-_bapg'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export default supabase

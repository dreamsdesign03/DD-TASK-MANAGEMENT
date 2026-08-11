// ─────────────────────────────────────────────────────────────
// Central backend configuration
// ─────────────────────────────────────────────────────────────
// All backend URLs live here as a single source of truth so the
// Apps Script URLs are not hardcoded across the app.
//
// Override via a `.env` file (Vite loads VITE_* vars):
//   VITE_API_BASE_URL=https://your-db-backend.example.com/exec
//   VITE_DAILY_SHEET_WEB_APP_URL=https://your-daily-sheet.example.com/exec
//
// Leave empty to run the app without making backend calls
// (features will silently no-op until the new backend is wired up).

// Main backend: tasks, team, clients, payments, activities, chat, auth.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

// Daily task sheet backend: punch in/out + per-task timer rows.
export const DAILY_SHEET_WEB_APP_URL =
  import.meta.env.VITE_DAILY_SHEET_WEB_APP_URL || ''

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
  import.meta.env.VITE_DAILY_SHEET_WEB_APP_URL ||
  'https://script.google.com/macros/s/AKfycbw86Ttol6GkUPh0Er5Ge83D7oWCpx7DTNmFLo6vh-cEk-jWZy8q5OUhSndB3Vo4jbsI/exec'

// Pending task daily email backend (Google Apps Script).
// Deploy pending_task_email_script.js and paste the URL here.
export const PENDING_EMAIL_WEB_APP_URL =
  import.meta.env.VITE_PENDING_EMAIL_WEB_APP_URL || ''

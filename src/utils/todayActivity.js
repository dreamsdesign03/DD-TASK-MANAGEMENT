import { taskDateToISO } from './taskStats'
import { EXCLUDED_ROLES, isExcludedRole, systemRoleOf } from './roles'

const TZ = 'Asia/Kolkata'

// Don't nag users before this hour (IST). The admin banner ignores this.
export const REMINDER_START_HOUR = 10

// Today's calendar day in IST as YYYY-MM-DD
export function todayIST(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

// Current hour (0-23) in IST
export function hourIST(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(date)) % 24
}

// True once it is >= REMINDER_START_HOUR IST
export function isPastReminderStart(date = new Date()) {
  return hourIST(date) >= REMINDER_START_HOUR
}

// "Today, 21 Oct"
export function todayLabel(date = new Date()) {
  const label = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: 'short' }).format(date)
  return `Today, ${label}`
}

// Calendar day (YYYY-MM-DD) of a stored task date, always resolved in IST.
//  Date instance            -> the instant, rendered in IST
//  "YYYY-MM-DD"             -> a plain calendar date, used as-is
//  "Oct 22, 2026"           -> a plain calendar date, used as-is
//  "2026-10-22T00:30+05:30" -> an instant, converted to IST
// A plain calendar date is never re-interpreted as browser-local midnight, so
// the IST day can't drift.
function calendarDayISO(raw) {
  if (!raw) return ''
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return ''
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(raw)
  }
  const s = String(raw).trim()
  if (!s) return ''
  // Plain calendar date.
  const plain = s.match(/^(\d{4}-\d{2}-\d{2})$/)
  if (plain) return plain[1]
  const text = s.match(/^([A-Za-z]{3})\w*\s+(\d{1,2}),\s*(\d{4})$/)
  if (text) {
    const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
    const mm = months[text[1].toLowerCase()]
    if (mm) return `${text[3]}-${mm}-${String(text[2]).padStart(2, '0')}`
  }
  // Anything with a time component is an instant -> resolve it in IST.
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) {
    const d = new Date(s)
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
    }
  }
  return taskDateToISO(s)
}

// Active employees = roster everyone must belong to.
//  isActive 'No' (deactivated) is excluded
//  EXCLUDED_ROLES (Admin / Accountant / Manager) are excluded - they are not
//    expected to create or move tasks day-to-day, so they are never "missing"
export function activeRoster(employees) {
  return (employees || [])
    .filter((e) => String(e?.isActive ?? 'Yes').trim().toLowerCase() !== 'no')
    .filter((e) => !isExcludedRole(e))
    .map((e) => ({ name: (e.name || '').trim(), email: (e.email || '').trim().toLowerCase() }))
    .filter((e) => e.name)
}

// Lowercased names of everyone who created at least one task on `day` (IST).
// Task creator = `assignedBy`; creation date = `assigned` (fallback `assignedDate`).
function creatorNamesToday(tasks, day) {
  const set = new Set()
  for (const t of tasks || []) {
    if (calendarDayISO(t?.assigned || t?.assignedDate) !== day) continue
    const creator = (t?.assignedBy || '').trim().toLowerCase()
    if (creator) set.add(creator)
  }
  return set
}

// Lowercased names of everyone who changed a task's status on `day` (IST).
// status_changed_by holds the changer's name; status_changed_at the IST timestamp.
function statusChangerNamesToday(tasks, day) {
  const set = new Set()
  for (const t of tasks || []) {
    if (calendarDayISO(t?.statusChangedAt) !== day) continue
    const changer = (t?.statusChangedBy || '').trim().toLowerCase()
    if (changer) set.add(changer)
  }
  return set
}

// Lowercased names of everyone active today = created a task OR changed a status.
export function activeTodayNames(tasks, day) {
  const combined = new Set()
  for (const n of creatorNamesToday(tasks, day)) combined.add(n)
  for (const n of statusChangerNamesToday(tasks, day)) combined.add(n)
  return combined
}

// Is a single user (name/email) active today?
export function isUserActiveToday(tasks, user, day) {
  const active = activeTodayNames(tasks, day)
  const name = (user?.name || '').trim().toLowerCase()
  const email = (user?.email || '').trim().toLowerCase()
  return (name && active.has(name)) || (email && active.has(email))
}

// Active employees who have NOT created a task or changed a status on `day` (IST).
export function computeMissingToday(tasks, employees, day) {
  const active = activeTodayNames(tasks, day)
  return activeRoster(employees).filter(
    (e) => !active.has(e.name.toLowerCase()) && !(e.email && active.has(e.email))
  )
}

export { EXCLUDED_ROLES, systemRoleOf }
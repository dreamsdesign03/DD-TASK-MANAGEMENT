const TZ = 'Asia/Kolkata'

function toDate(date) {
  if (date instanceof Date) return date
  if (date === undefined || date === null) return new Date()
  return new Date(date)
}

export function formatTime(date) {
  return toDate(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
}

export function formatDateShort(date) {
  return toDate(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ })
}

export function formatDateLong(date) {
  return toDate(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ })
}

export function formatDateTime(date) {
  return toDate(date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ })
}

export function formatMonthYear(date) {
  return toDate(date).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: TZ })
}

export function formatMonthYearShort(date) {
  return toDate(date).toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: TZ })
}

const WEEKDAY_ORDER = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7 }
const MONTH_MAP = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 }

function shiftSunday(d) {
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1)
  return d
}

/**
 * Compute a due date (YYYY-MM-DD) for a recurring task.
 * Weekly  -> the selected weekday; Monthly -> the 1st of a selected month; Yearly -> January 1st.
 * With includeToday=false (create-time) the NEXT occurrence strictly after today is used.
 * With includeToday=true (auto-generated instance) the current cycle's date is used when today is that day.
 * If a computed date falls on a Sunday it is shifted to the next day (Monday).
 */
export function computeRecurringDueDate(schedule, day, months, now = new Date(), includeToday = false) {
  const base = new Date(now)
  const today = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 12, 0, 0))
  const iso = (d) => d.toISOString().split('T')[0]

  if (schedule === 'Weekly') {
    const target = WEEKDAY_ORDER[day] || WEEKDAY_ORDER.Monday
    const todayIso = (today.getUTCDay() + 6) % 7 + 1 // Monday=1 .. Sunday=7
    let diff = (target - todayIso + 7) % 7
    if (diff === 0) diff = includeToday ? 0 : 7
    today.setUTCDate(today.getUTCDate() + diff)
    return iso(today)
  }

  if (schedule === 'Monthly') {
    const selected = (months || []).map(m => MONTH_MAP[m]).filter(Boolean).sort((a, b) => a - b)
    if (selected.length === 0) return ''
    const currentMonth = today.getUTCMonth() + 1
    const currentYear = today.getUTCFullYear()
    let year = currentYear
    let month = selected.find(m => m > currentMonth)
    if (!month && includeToday && selected.includes(currentMonth)) {
      month = currentMonth
    } else if (!month) {
      month = selected[0]
      year += 1
    }
    const due = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0))
    return iso(shiftSunday(due))
  }

  if (schedule === 'Yearly') {
    let year = today.getUTCFullYear()
    const isJan1 = today.getUTCMonth() === 0 && today.getUTCDate() === 1
    if (!includeToday || !isJan1) year += 1
    const due = new Date(Date.UTC(year, 0, 1, 12, 0, 0))
    return iso(shiftSunday(due))
  }

  return ''
}

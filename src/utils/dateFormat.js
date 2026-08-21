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

  if (schedule === 'Daily') {
    let diff = includeToday ? 0 : 1
    today.setUTCDate(today.getUTCDate() + diff)
    return iso(shiftSunday(today))
  }

  if (schedule === 'Weekly') {
    const target = WEEKDAY_ORDER[day] || WEEKDAY_ORDER.Monday
    const todayIso = (today.getUTCDay() + 6) % 7 + 1 // Monday=1 .. Sunday=7
    let diff = (target - todayIso + 7) % 7
    if (diff === 0) diff = includeToday ? 0 : 7
    today.setUTCDate(today.getUTCDate() + diff)
    return iso(shiftSunday(today))
  }

  if (schedule === 'Monthly') {
    const selected = (months || [])
      .map(m => MONTH_MAP[m] || (parseInt(m, 10) || null))
      .filter(Boolean)
      .sort((a, b) => a - b)

    const currentMonth = today.getUTCMonth() + 1
    const currentYear = today.getUTCFullYear()
    let year = currentYear

    if (selected.length === 0) {
      let nextMonth = currentMonth + (includeToday ? 0 : 1)
      if (nextMonth > 12) {
        nextMonth = 1
        year += 1
      }
      const due = new Date(Date.UTC(year, nextMonth - 1, 1, 12, 0, 0))
      return iso(shiftSunday(due))
    }

    let month = selected.find(m => includeToday ? m >= currentMonth : m > currentMonth)
    if (!month) {
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

const WEEKDAY_NAME_MAP = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday' }

/**
 * Checks if TODAY is the trigger day for an active recurring template.
 * - Weekly: today's day-of-week === selected day (e.g. Monday)
 * - Monthly: today is the 1st of a selected month (or Monday 2nd/3rd if 1st was Sunday)
 * - Yearly: today's month + day === template creation date's month + day
 */
export function isTodayRecurrenceTriggerDay(schedule, day, months, tplDateStr, now = new Date()) {
  const base = new Date(now)
  const today = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 12, 0, 0))
  const todayDayIso = (today.getUTCDay() + 6) % 7 + 1 // Monday=1 .. Sunday=7
  const todayDayName = WEEKDAY_NAME_MAP[todayDayIso]

  if (schedule === 'Daily') {
    return true
  }

  if (schedule === 'Weekly') {
    const target = day || 'Monday'
    return todayDayName.toLowerCase() === target.toLowerCase()
  }

  if (schedule === 'Monthly') {
    const selected = (months || [])
      .map(m => MONTH_MAP[m] || (parseInt(m, 10) || null))
      .filter(Boolean)

    const currentMonth = today.getUTCMonth() + 1
    const isMonthMatch = selected.length === 0 || selected.includes(currentMonth)
    if (!isMonthMatch) return false

    const currentDate = today.getUTCDate()
    if (currentDate === 1 && today.getUTCDay() !== 0) return true
    if (currentDate === 2 && today.getUTCDay() === 1) return true // 1st fell on Sunday, shifted to Monday 2nd
    return false
  }

  if (schedule === 'Yearly') {
    if (!tplDateStr) return false
    const tplDate = new Date(tplDateStr)
    if (isNaN(tplDate.getTime())) return false
    return today.getUTCMonth() === tplDate.getUTCMonth() && today.getUTCDate() === tplDate.getUTCDate()
  }

  return false
}

/**
 * Computes the due date for the single new instance created on trigger day:
 * - Weekly  -> today + 7 days (Sunday shifted)
 * - Monthly -> 1st of NEXT selected month (Sunday shifted)
 * - Yearly  -> same month/day, next year (Sunday shifted)
 */
export function computeNextCycleDueDate(schedule, day, months, tplDateStr, now = new Date()) {
  const base = new Date(now)
  const today = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 12, 0, 0))
  const iso = (d) => d.toISOString().split('T')[0]

  if (schedule === 'Daily') {
    today.setUTCDate(today.getUTCDate() + 1)
    return iso(shiftSunday(today))
  }

  if (schedule === 'Weekly') {
    today.setUTCDate(today.getUTCDate() + 7)
    return iso(shiftSunday(today))
  }

  if (schedule === 'Monthly') {
    const selected = (months || [])
      .map(m => MONTH_MAP[m] || (parseInt(m, 10) || null))
      .filter(Boolean)
      .sort((a, b) => a - b)

    const currentMonth = today.getUTCMonth() + 1
    const currentYear = today.getUTCFullYear()

    let nextMonth = selected.find(m => m > currentMonth)
    let nextYear = currentYear
    if (!nextMonth) {
      nextMonth = selected.length > 0 ? selected[0] : (currentMonth === 12 ? 1 : currentMonth + 1)
      if (nextMonth <= currentMonth) nextYear += 1
    }
    const due = new Date(Date.UTC(nextYear, nextMonth - 1, 1, 12, 0, 0))
    return iso(shiftSunday(due))
  }

  if (schedule === 'Yearly') {
    let year = today.getUTCFullYear() + 1
    const tplDate = tplDateStr ? new Date(tplDateStr) : today
    const month = !isNaN(tplDate.getTime()) ? tplDate.getUTCMonth() : today.getUTCMonth()
    const date = !isNaN(tplDate.getTime()) ? tplDate.getUTCDate() : today.getUTCDate()
    const due = new Date(Date.UTC(year, month, date, 12, 0, 0))
    return iso(shiftSunday(due))
  }

  today.setUTCDate(today.getUTCDate() + 7)
  return iso(shiftSunday(today))
}

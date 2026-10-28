// Single source of truth for task counting rules.
// Used by both the Tasks page (TaskTable) and the Report page (MonthlyReportPage)
// so the numbers on both screens can never drift apart.

export function isSubTask(t) {
  return t?.taskType === 'Sub Task' || t?.taskType === 'Subtask'
}

// A "Done" task whose status was updated before the current month
export function isDoneBeforeCurrentMonth(t) {
  if (!t || t.status !== 'Done') return false
  const doneTs = t.statusUpdatedOn ? new Date(t.statusUpdatedOn) : null
  if (!doneTs || isNaN(doneTs.getTime())) return false
  const now = new Date()
  return (
    doneTs.getFullYear() < now.getFullYear() ||
    (doneTs.getFullYear() === now.getFullYear() && doneTs.getMonth() < now.getMonth())
  )
}

// Same rule as the Tasks page "Current Month / All Tasks" toggle
export function passesMonthDoneRule(t, showAllTasks) {
  return showAllTasks || !isDoneBeforeCurrentMonth(t)
}

// Overdue = not Done, has a due date, and the due date is before today
export function isTaskOverdue(t) {
  if (!t || t.status === 'Done' || !t.dueDate) return false
  const due = new Date(t.dueDate)
  if (isNaN(due.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due < today
}

// Counts a task list with the exact same status buckets used by the Tasks page cards
export function computeTaskStats(list) {
  const base = (list || []).filter(t => !isSubTask(t))
  const count = st => base.filter(t => t.status === st).length
  const pending = count('Pending')
  const inProgress = count('In Progress')
  const review = count('Review')
  const completed = count('Done')
  const blocked = count('Blocked')
  const overdue = base.filter(isTaskOverdue).length
  const total = base.length
  return {
    base,
    total,
    pending,
    inProgress,
    review,
    completed,
    blocked,
    overdue,
    other: total - pending - inProgress - review - completed - blocked,
  }
}

// "05", "12"  same 2-digit display used by the Tasks page summary cards
export function formatStatCount(n) {
  return String(n ?? 0).padStart(2, '0')
}

// Normalizes any task date value ("2026-10-05", "Oct 5, 2026", Date, sheet serial)
// to an IST calendar day in YYYY-MM-DD so range comparisons are timezone-safe.
export function taskDateToISO(raw) {
  if (!raw) return ''
  const s = String(raw).trim()
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}
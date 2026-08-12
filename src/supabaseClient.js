// ─────────────────────────────────────────────────────────────
// Supabase client + data-access layer
// Replaces the old Apps Script backend entirely — all calls now
// go straight from React to Supabase (Postgres + Storage).
// ─────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://balrgagdbbfagmgryrwv.supabase.co'
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhbHJnYWdkYmJmYWdtZ3J5cnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDYxNTQsImV4cCI6MjEwMjAyMjE1NH0.5R4abl_tx3jVX5Z98Pm5Mp0eePYsTFXThjYZA-_bapg'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export const STORAGE_BUCKET = 'project-files'

/* ─── IST helpers (all app timestamps are IST) ──────────────────────────── */
function istParts(date = new Date()) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (t) => p.find((x) => x.type === t)?.value || ''
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') }
}

// YYYY-MM-DD HH:mm:ss in IST (format the app expects)
export function istNow() {
  const p = istParts()
  return `${p.y}-${p.mo}-${p.d} ${p.h}:${p.mi}:${p.s}`
}

// YYYY-MM-DD in IST
export function istDate() {
  const p = istParts()
  return `${p.y}-${p.mo}-${p.d}`
}

/* ─── Column maps: DB (snake_case) <-> legacy sheet-style keys ──────────── */
export const TEAM_MAP = {
  employee_id: 'Employee ID',
  full_name: 'Full Name',
  email_address: 'Email Address',
  password_token: 'Password Token',
  department: 'Department',
  phone: 'Phone',
  joined_date: 'Joined Date',
  is_active: 'Is Active',
  role: 'Role',
  status: 'Status',
}

export const TASK_MAP = {
  task_id: 'Task ID',
  client: 'Client',
  month: 'Month',
  task_title: 'Task Title',
  task_type: 'Task Type',
  main_task_id: 'Main Task ID',
  description: 'Description',
  assigned_by: 'Assigned By',
  assigned_to: 'Assigned To',
  employee_ids: 'Employee IDs',
  assigned_emails: 'Assigned Emails',
  department: 'Department',
  assigned_date: 'Assigned Date',
  due_date: 'Due Date',
  priority: 'Priority',
  status: 'Status',
  status_updated_on: 'Status Updated On',
  time_taken: 'Time Taken',
  days_overdue: 'Days Overdue',
  remarks: 'Remarks',
  post: 'Post',
  attachment: 'Attachment',
  is_recurring: 'Is Recurring',
  recurring_schedule: 'Recurring Schedule',
  recurring_day: 'Recurring Day',
  recurring_months: 'Recurring Months',
  last_auto_generated_date: 'Last Auto-Generated Date',
}

export const CLIENT_MAP = {
  client_id: 'Client ID',
  project_name: 'Project Name',
  client_name: 'Client Name',
  contact_email: 'Contact Email',
  phone: 'Phone',
  project_start_date: 'Project start Date',
  industry: 'Industry',
  is_active: 'Is Active',
  services: 'Services',
  project_completion_date: 'Project Completion Date',
  drive_folder_link: 'Drive Folder Link',
  important_links: 'Important Links',
}

export const PAYMENT_MAP = {
  client_id: 'CLIENT ID',
  project: 'PROJECT',
  client: 'CLIENT',
  emails: 'EMAILS',
  phone_no: 'PHONE NO',
  project_start_date: 'PROJECT START DATE',
  industry: 'INDUSTRY',
  is_active: 'IS ACTIVE',
  services: 'SERVICES',
  project_end_date: 'PROJECT END DATE',
  gst_non_gst: 'GST/NON GST',
  gst_amount_new: 'GST AMOUNT (NEW)',
  gst_pct: 'GST (%)',
  recurring: 'RECURRING',
  recurring_type: 'RECURRING TYPE',
  total_cost: 'TOTAL COST',
  payment_date: 'PAYMENT DATE',
  payment_amount: 'PAYMENT AMOUNT',
  payment_note: 'PAYMENT NOTE',
  pending_amount: 'PENDING AMOUNT',
  data_entry_date_and_time: 'DATA ENTRY DATE AND TIME',
  note: 'NOTE',
}

export const ACTIVITY_MAP = {
  employee_id: 'Employee ID',
  full_name: 'Full Name',
  role: 'Role',
  department: 'Department',
  login_date_and_time: 'Login Date and Time',
  logout_date_and_time: 'Logout Date and Time',
}

export const CHAT_MAP = {
  id: 'id',
  action: 'action',
  room_id: 'roomId',
  sender_id: 'senderId',
  sender_name: 'senderName',
  message: 'message',
  timestamp: 'timestamp',
  type: 'type',
  group_name: 'groupName',
}

/* ─── Transform helpers ─────────────────────────────────────────────────── */
export function rowToSheet(row, map) {
  if (!row) return row
  const out = {}
  for (const [col, sheetKey] of Object.entries(map)) {
    out[sheetKey] = row[col]
  }
  return out
}

export function sheetToDb(obj, map) {
  if (!obj) return {}
  const out = {}
  const reverse = {}
  for (const [col, sheetKey] of Object.entries(map)) {
    reverse[sheetKey.toLowerCase()] = col
    reverse[col] = col
  }
  for (const [key, value] of Object.entries(obj)) {
    const col = reverse[String(key).toLowerCase()]
    if (col && value !== undefined && value !== null) out[col] = normalizeValue(value)
  }
  return out
}

// Legacy 'Yes'/'No'/'' booleans -> DB boolean
function normalizeValue(value) {
  if (typeof value === 'string') {
    const t = value.trim().toLowerCase()
    if (t === 'yes' || t === 'true' || t === '1') return true
    if (t === 'no' || t === 'false' || t === '0' || t === '') return false
  }
  return value
}

export function sheetBoolean(value) {
  return value ? 'Yes' : 'No'
}

export function taskRowToSheet(row) {
  const out = rowToSheet(row, TASK_MAP)
  out['Time Taken'] = out['Time Taken'] || '0h 0m'
  out['Post'] = out['Post'] || 'NO'
  return out
}

export function teamRowToUser(row) {
  const s = rowToSheet(row, TEAM_MAP)
  return {
    'Employee ID': s['Employee ID'],
    'Full Name': s['Full Name'],
    'Email Address': s['Email Address'],
    'Phone': s['Phone'],
    'Joined Date': s['Joined Date'],
    'Department': s['Department'],
    'Role': s['Role'],
    'System Role': s['Role'],
    'Status': s['Status'],
    'Is Active': sheetBoolean(s['Is Active']),
  }
}

/* ─── ID generators ─────────────────────────────────────────────────────── */
async function nextNumericId(rows, prefix) {
  let max = 0
  for (const r of rows) {
    const m = String(r || '').match(/(\d+)$/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max + 1
}

export async function nextEmployeeId() {
  const { data } = await supabase.from('team').select('employee_id')
  return 'EMP-' + String(await nextNumericId((data || []).map((r) => r.employee_id))).padStart(3, '0')
}

export async function nextClientId() {
  const { data } = await supabase.from('clients').select('client_id')
  return 'C-' + String(await nextNumericId((data || []).map((r) => r.client_id))).padStart(3, '0')
}

export async function nextTaskId() {
  const { data } = await supabase.from('tasks').select('task_id')
  return 'T-' + String(await nextNumericId((data || []).map((r) => r.task_id))).padStart(3, '0')
}

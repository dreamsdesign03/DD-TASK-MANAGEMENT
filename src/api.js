// ─────────────────────────────────────────────────────────────
// Dreamsdesk API — the old Apps Script "action" endpoints,
// now implemented directly against Supabase from the browser.
// Every function returns the exact same shape the old backend
// returned, so the rest of the app needs no changes.
// ─────────────────────────────────────────────────────────────
import {
  supabase,
  STORAGE_BUCKET,
  istNow,
  istDate,
  rowToSheet,
  sheetToDb,
  sheetBoolean,
  taskRowToSheet,
  teamRowToUser,
  TASK_MAP,
  TEAM_MAP,
  CLIENT_MAP,
  PAYMENT_MAP,
  ACTIVITY_MAP,
  CHAT_MAP,
  nextEmployeeId,
  nextClientId,
  nextTaskId,
} from './supabaseClient'

async function recordActivity(employeeId, fullName, role, department, loginTime) {
  await supabase.from('activity').insert({
    employee_id: employeeId,
    full_name: fullName,
    role,
    department,
    login_date_and_time: loginTime,
    logout_date_and_time: null,
  })
}

async function completeLogin(row) {
  if (!row) return null
  await recordActivity(row.employee_id, row.full_name, row.role, row.department, istNow())
  return teamRowToUser(row)
}

/* ─── Auth ───────────────────────────────────────────────────────────────── */
async function register(payload) {
  const email = String(payload.email || '').trim().toLowerCase()
  const name = String(payload.name || '').trim()
  if (!email || !name) return { ok: false, error: 'Email and name are required.' }

  const { data: existing } = await supabase
    .from('team')
    .select('email_address')
    .eq('email_address', email)
    .maybeSingle()
  if (existing) return { ok: false, error: 'An account with this email already exists.' }

  const employeeId = await nextEmployeeId()
  const token = `token_${(name.split(' ')[0] || 'user').toLowerCase()}_${employeeId.replace('EMP-', '')}`

  const { error } = await supabase.from('team').insert({
    employee_id: employeeId,
    full_name: name,
    email_address: email,
    password_token: token,
    department: String(payload.department || '').trim() || 'Development',
    phone: String(payload.phone || '').trim(),
    joined_date: istDate(),
    is_active: false,
    role: String(payload.systemRole || 'Employee').trim(),
    status: 'Pending',
  })
  if (error) return { ok: false, error: error.message }
  notifyRegistrationEmail({ ...payload, employeeId, passwordToken: token })
  return { ok: true }
}

// Fire-and-forget: email the new registration's details to the admin inbox
// via the deployed Google Apps Script (sends FROM your Gmail account).
// Uses a hidden iframe form POST to bypass CORS (Apps Script /exec blocks CORS).
function notifyRegistrationEmail(info) {
  try {
    const REGISTRATION_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyqqLi4FCRg79Xj3Ph_J0m-iDFdEGtyjRbq_NmEafUNjB7oAjAqM2ILWGpd4_OAYioI/exec'
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = REGISTRATION_SCRIPT_URL
    form.target = 'email-notify-iframe'
    form.style.display = 'none'

    const fields = {
      employeeId: info.employeeId || '',
      fullName: info.name || '',
      emailAddress: info.email || '',
      phone: String(info.phone || ''),
      department: String(info.department || ''),
      requestedRole: String(info.systemRole || 'Employee'),
      status: 'Pending approval',
      submittedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    }
    for (const [key, value] of Object.entries(fields)) {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = key
      input.value = value
      form.appendChild(input)
    }

    let iframe = document.getElementById('email-notify-iframe')
    if (!iframe) {
      iframe = document.createElement('iframe')
      iframe.id = 'email-notify-iframe'
      iframe.name = 'email-notify-iframe'
      iframe.style.display = 'none'
      document.body.appendChild(iframe)
    }

    document.body.appendChild(form)
    form.submit()
    document.body.removeChild(form)

    // Also send JSON via fetch (no-cors) as a backup mechanism
    fetch(REGISTRATION_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(fields),
    }).catch((err) => console.warn('Registration fetch notify backup error:', err))
  } catch (e) {
    console.warn('Registration email notification error:', e)
  }
}

async function login(payload) {
  const email = String(payload.email || '').trim().toLowerCase()
  const password = String(payload.password || '').trim()
  if (!email || !password) return { ok: false, error: 'Email and password are required.' }

  const { data: row, error } = await supabase
    .from('team')
    .select('*')
    .ilike('email_address', email)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!row) return { ok: false, error: 'No account found with this email.' }
  if (row.password_token !== password) return { ok: false, error: 'Invalid password.' }
  
  if (!row.is_active) {
    if (email === 'dreamsdesign.in03@gmail.com') {
      await supabase.from('team').update({ is_active: true, status: 'Approved', role: 'Admin' }).eq('employee_id', row.employee_id)
      row.is_active = true
      row.status = 'Approved'
      row.role = 'Admin'
    } else {
      return { ok: false, error: 'Your account is pending admin approval.' }
    }
  }

  const user = await completeLogin(row)
  return { ok: true, authenticated: true, user }
}

async function googleLogin(payload) {
  const email = String(payload.email || '').trim().toLowerCase()
  if (!email) return { ok: false, error: 'No email provided.' }

  const { data: row, error } = await supabase
    .from('team')
    .select('*')
    .ilike('email_address', email)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!row) return { ok: false, error: 'not_registered' }

  if (!row.is_active) {
    if (email === 'dreamsdesign.in03@gmail.com') {
      await supabase.from('team').update({ is_active: true, status: 'Approved', role: 'Admin' }).eq('employee_id', row.employee_id)
      row.is_active = true
      row.status = 'Approved'
      row.role = 'Admin'
    } else {
      return { ok: false, error: 'Your account is pending admin approval.' }
    }
  }

  const user = await completeLogin(row)
  return { ok: true, authenticated: true, user }
}

async function approveUser(email) {
  const clean = String(email || '').trim().toLowerCase()
  if (!clean) return { ok: false, error: 'No email provided.' }
  const { data: row } = await supabase
    .from('team')
    .select('employee_id')
    .eq('email_address', clean)
    .maybeSingle()
  if (!row) return { ok: false, error: 'User not found.' }
  const { error } = await supabase
    .from('team')
    .update({ is_active: true, status: 'Approved' })
    .eq('employee_id', row.employee_id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

async function rejectUser(email) {
  const clean = String(email || '').trim().toLowerCase()
  if (!clean) return { ok: false, error: 'No email provided.' }
  const { error } = await supabase.from('team').delete().eq('email_address', clean)
  if (error) return { ok: false, error: error.message }
  return { ok: true, deleted: true }
}

async function setPresence(email, status) {
  const clean = String(email || '').trim().toLowerCase()
  if (!clean) return { ok: false, error: 'No email provided.' }
  const { error } = await supabase.from('team').update({ status }).eq('email_address', clean)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

async function punchIn(payload) {
  const email = String(payload.email || '').trim().toLowerCase()
  if (!email) return { ok: false, error: 'No email provided.' }
  const { data: row } = await supabase
    .from('team')
    .select('employee_id, full_name, role, department')
    .eq('email_address', email)
    .maybeSingle()
  if (!row) return { ok: false, error: 'User not found.' }
  await recordActivity(row.employee_id, row.full_name, row.role, row.department, istNow())
  await supabase.from('team').update({ status: 'Online' }).eq('employee_id', row.employee_id)
  return { ok: true }
}

async function punchOut(payload) {
  const email = String(payload.email || '').trim().toLowerCase()
  if (!email) return { ok: false, error: 'No email provided.' }
  const { data: row } = await supabase
    .from('team')
    .select('employee_id')
    .eq('email_address', email)
    .maybeSingle()
  if (!row) return { ok: false, error: 'User not found.' }
  const { data: sessions } = await supabase
    .from('activity')
    .select('id, login_date_and_time')
    .eq('employee_id', row.employee_id)
    .is('logout_date_and_time', null)
    .order('login_date_and_time', { ascending: false })
    .limit(1)
  if (sessions && sessions.length > 0) {
    await supabase
      .from('activity')
      .update({ logout_date_and_time: istNow() })
      .eq('id', sessions[0].id)
  }
  await supabase.from('team').update({ status: 'Offline' }).eq('employee_id', row.employee_id)
  return { ok: true }
}

/* ─── Tasks ──────────────────────────────────────────────────────────────── */
async function getTasks() {
  const { data, error } = await supabase.from('tasks').select('*').order('task_id').limit(2000)
  if (error) throw error
  return (data || []).map(taskRowToSheet)
}

async function addTask(payload) {
  const row = sheetToDb(payload, TASK_MAP)
  if (!row.task_id) row.task_id = await nextTaskId()
  row.department = row.department || 'COMMON'
  row.time_taken = row.time_taken || '0h 0m'
  row.post = row.post || 'NO'
  row.status = row.status || 'Pending'
  const { error } = await supabase.from('tasks').insert(row)
  if (error) throw error
  return { ok: true }
}

async function updateTask(payload) {
  const taskId = String(payload.taskId || payload.task_id || '')
  if (!taskId) return { ok: false, error: 'Task ID missing.' }
  const { data: existing } = await supabase
    .from('tasks')
    .select('task_id')
    .eq('task_id', taskId)
    .maybeSingle()
  if (!existing) return { ok: false, error: 'not_found' }
  const row = sheetToDb(payload, TASK_MAP)
  delete row.task_id
  if (row.time_taken === undefined) row.time_taken = '0h 0m'
  if (row.post === undefined) row.post = 'NO'
  const { error } = await supabase.from('tasks').update(row).eq('task_id', taskId)
  if (error) throw error
  return { ok: true }
}

async function deleteTask(payload) {
  const taskId = String(payload.taskId || payload.task_id || '')
  if (!taskId) return { ok: false, error: 'Task ID missing.' }
  const { error } = await supabase.from('tasks').delete().eq('task_id', taskId)
  if (error) throw error
  return { ok: true, deleted: true }
}

/* ─── Clients ────────────────────────────────────────────────────────────── */
async function getClients() {
  const { data, error } = await supabase.from('clients').select('*').order('client_id')
  if (error) throw error
  return {
    clients: (data || []).map((row) => {
      const s = rowToSheet(row, CLIENT_MAP)
      s['Is Active'] = sheetBoolean(s['Is Active'])
      return s
    }),
  }
}

async function addClient(payload) {
  const row = sheetToDb(payload, CLIENT_MAP)
  if (!row.client_id) row.client_id = await nextClientId()
  if (row.is_active === undefined) row.is_active = true
  const { error } = await supabase.from('clients').insert(row)
  if (error) throw error

  const payRow = sheetToDb(payload, PAYMENT_MAP)
  payRow.client_id = row.client_id
  payRow.project = row.project_name || ''
  payRow.client = row.client_name || ''
  payRow.emails = row.contact_email || ''
  payRow.phone_no = row.phone || ''
  payRow.project_start_date = row.project_start_date || ''
  payRow.industry = row.industry || ''
  payRow.is_active = row.is_active ? 'Yes' : 'No'
  payRow.services = row.services || ''
  payRow.data_entry_date_and_time = istNow()
  const { error: payErr } = await supabase.from('payments').insert(payRow)
  if (payErr) console.warn('Failed to create payment row:', payErr.message)

  return { ok: true, id: row.client_id }
}

async function updateClient(payload) {
  const clientId = String(payload.clientId || payload.client_id || '')
  if (!clientId) return { ok: false, error: 'Client ID missing.' }
  const row = sheetToDb(payload, CLIENT_MAP)
  delete row.client_id
  const { error } = await supabase.from('clients').update(row).eq('client_id', clientId)
  if (error) throw error
  return { ok: true }
}

/* ─── Payments ───────────────────────────────────────────────────────────── */
async function getPayments() {
  const { data, error } = await supabase.from('payments').select('*').order('client_id')
  if (error) throw error
  return { payments: (data || []).map((r) => rowToSheet(r, PAYMENT_MAP)) }
}

async function updatePayment(payload) {
  const clientId = String(payload.clientId || payload.client_id || '')
  if (!clientId) return { ok: false, error: 'Client ID missing.' }
  const { data: existing } = await supabase
    .from('payments')
    .select('client_id')
    .eq('client_id', clientId)
    .maybeSingle()
  const row = sheetToDb(payload, PAYMENT_MAP)
  delete row.client_id
  row.data_entry_date_and_time = istNow()
  let error
  if (existing) {
    ;({ error } = await supabase.from('payments').update(row).eq('client_id', clientId))
  } else {
    ;({ error } = await supabase.from('payments').insert({ ...row, client_id: clientId }))
  }
  if (error) throw error
  return { ok: true }
}

async function recordPayment(payload) {
  const clientId = String(payload.clientId || payload.client_id || '')
  if (!clientId) return { ok: false, error: 'Client ID missing.' }
  if (payload.amount === undefined || payload.amount === null || payload.amount === '') {
    return { ok: false, error: 'Amount missing.' }
  }
  const { error } = await supabase.from('payments').insert({
    client_id: clientId,
    payment_date: payload.date || istNow(),
    payment_amount: String(payload.amount),
    payment_note: payload.note || '',
    pending_amount: String(payload.pendingAmount ?? ''),
    data_entry_date_and_time: istNow(),
  })
  if (error) throw error
  if (payload.pendingAmount !== undefined && payload.pendingAmount !== null) {
    await supabase
      .from('payments')
      .update({ pending_amount: String(payload.pendingAmount) })
      .eq('client_id', clientId)
  }
  return { ok: true }
}

/* ─── Activities ─────────────────────────────────────────────────────────── */
async function getActivities() {
  const { data, error } = await supabase
    .from('activity')
    .select('*')
    .order('login_date_and_time', { ascending: true })
  if (error) throw error
  return (data || []).map((r) => rowToSheet(r, ACTIVITY_MAP))
}

/* ─── Chat ───────────────────────────────────────────────────────────────── */
async function getChats() {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .order('timestamp', { ascending: true })
    .limit(5000)
  if (error) throw error
  return (data || []).map((r) => rowToSheet(r, CHAT_MAP))
}

async function sendMessage(payload) {
  const row = {
    id: payload.id || String(Date.now()),
    action: payload.action || 'send',
    room_id: payload.roomId || payload.room_id || '',
    sender_id: payload.senderId || payload.sender_id || '',
    sender_name: payload.senderName || payload.sender_name || '',
    message: payload.message || '',
    timestamp: payload.timestamp || new Date().toISOString(),
    type: payload.type || 'text',
    group_name: payload.groupName || payload.group_name || '',
  }
  const { error } = await supabase.from('chat_messages').insert(row)
  if (error) throw error
  return { ok: true }
}

async function receipt(payload) {
  return sendMessage({ ...payload, type: payload.action })
}

/* ─── Files ──────────────────────────────────────────────────────────────── */
async function getProjectFiles(projectName) {
  if (!projectName) return { ok: false, error: 'No project name provided' }
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('project_name', projectName)
    .order('uploaded_at', { ascending: false })
  if (error) throw error
  const publicUrl = (path) => {
    const { data: pd } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
    return pd?.publicUrl || ''
  }
  const files = (data || []).map((f) => ({
    name: f.filename,
    url: publicUrl(f.storage_path),
    type: f.mime_type,
    department: f.department || 'General',
    date: f.uploaded_at,
  }))
  return { ok: true, files }
}

async function uploadFile(payload) {
  const filename = String(payload.filename || 'file').trim()
  const mimeType = String(payload.mimeType || 'application/octet-stream')
  const base64 = String(payload.base64 || '')
  const projectName = String(payload.projectName || '').trim()
  const department = String(payload.department || 'General').trim()
  if (!base64) return { ok: false, error: 'No file data provided.' }

  const path = `${projectName}/${department}/${Date.now()}-${filename.replace(/\s+/g, '_')}`
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, bytes, { contentType: mimeType, upsert: true })
  if (uploadErr) throw new Error(uploadErr.message)

  const { error: rowErr } = await supabase.from('files').insert({
    filename,
    mime_type: mimeType,
    size_bytes: bytes.length,
    storage_path: path,
    project_name: projectName,
    department,
    uploaded_by: String(payload.userEmail || ''),
    uploaded_at: istNow(),
  })
  if (rowErr) console.warn('File stored but row insert failed:', rowErr.message)
  return { ok: true }
}

/* ─── Dispatch ───────────────────────────────────────────────────────────── */
const POST_HANDLERS = {
  register,
  login,
  google_login: googleLogin,
  reject_user: rejectUser,
  user_online: (p) => setPresence(p.email, 'Online'),
  user_offline: (p) => setPresence(p.email, 'Offline'),
  punch_in: punchIn,
  punch_out: punchOut,
  add_task: addTask,
  update_task: updateTask,
  delete_task: deleteTask,
  add_client: addClient,
  update_client: updateClient,
  update_payment: updatePayment,
  record_payment: recordPayment,
  send: sendMessage,
  read_receipt: receipt,
  delivery_receipt: receipt,
  upload_file: uploadFile,
}

export const api = {
  // POST with an {action, ...} payload — like the old Apps Script doPost
  async post(payload) {
    const action = payload && payload.action
    const handler = POST_HANDLERS[action]
    if (!handler) throw new Error(`Unknown action: ${action}`)
    const result = await handler(payload)
    return result || { ok: true }
  },

  // GET-style read — like the old Apps Script doGet
  async get(action, params = {}) {
    switch (action) {
      case 'get_tasks': return getTasks()
      case 'get_team': return getTeam()
      case 'get_clients': return getClients()
      case 'get_payments': return getPayments()
      case 'get_activities': return getActivities()
      case 'get_project_files': return getProjectFiles(params.projectName)
      case 'approve_user': return approveUser(params.email)
      default:
        if (!action) return getChats()
        throw new Error(`Unknown action: ${action}`)
    }
  },
}

async function getTeam() {
  const { data, error } = await supabase.from('team').select('*').order('employee_id')
  if (error) throw error
  return (data || []).map((r) => {
    const s = rowToSheet(r, TEAM_MAP)
    s['Is Active'] = sheetBoolean(s['Is Active'])
    return s
  })
}

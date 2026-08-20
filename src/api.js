// ─────────────────────────────────────────────────────────────
// Dreamsdesk API — the old Apps Script "action" endpoints,
// now implemented directly against Supabase from the browser.
// Every function returns the exact same shape the old backend
// returned, so the rest of the app needs no changes.
// ─────────────────────────────────────────────────────────────
import {
  supabase,
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

// Fire-and-forget: email the team via the deployed Google Apps Script
// (sends FROM your Gmail account). Uses a hidden iframe form POST to bypass
// CORS (Apps Script /exec blocks CORS).
const EMAIL_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwW7-yUSyAU3_CrguPWfdJ8EcKG06GdBbbqKTq-mTxl13tlfnadfUU8NqZntIr6aLpy/exec'

// Apps Script /exec supports cross-origin fetch with a text/plain body (no
// preflight). Returns the JSON response so callers can read the Drive link.
async function postToDriveScript(payload) {
  const res = await fetch(EMAIL_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch (e) {
    return { ok: false, error: text || 'Unexpected response from upload service.' }
  }
}

// Uploads a file into the client's Google Drive folder (inside a department
// sub-folder) and records only the shareable link in the `files` table. The
// file content itself is stored ONLY on Google Drive, never in Supabase.
async function uploadTaskFile(payload) {
  const filename = String(payload.filename || 'file').trim()
  const mimeType = String(payload.mimeType || 'application/octet-stream')
  const projectName = String(payload.projectName || payload.clientName || '').trim()
  const department = String(payload.department || 'General').trim()

  const drive = await postToDriveScript({ ...payload, action: 'upload_drive_file' })
  if (!drive.ok || !drive.url) {
    throw new Error(drive.error || 'Google Drive upload failed. Please try again.')
  }

  const { error: rowErr } = await supabase.from('files').insert({
    filename: drive.name || filename,
    mime_type: mimeType,
    size_bytes: payload.sizeBytes || 0,
    storage_path: drive.url,
    project_name: projectName,
    department,
    uploaded_by: String(payload.userEmail || ''),
    uploaded_at: istNow(),
  })
  if (rowErr) console.warn('Link saved but files-table insert failed:', rowErr.message)
  return { ok: true, url: drive.url, name: drive.name || filename, type: mimeType, source: 'drive' }
}

function postToEmailScript(fields) {
  try {
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = EMAIL_SCRIPT_URL
    form.target = 'email-notify-iframe'
    form.style.display = 'none'

    for (const [key, value] of Object.entries(fields)) {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = key
      input.value = String(value ?? '')
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
  } catch (e) {
    console.warn('Email notification error:', e)
  }
}

function notifyRegistrationEmail(info) {
  postToEmailScript({
    action: 'registration',
    employeeId: info.employeeId || '',
    fullName: info.name || '',
    emailAddress: info.email || '',
    phone: String(info.phone || ''),
    department: String(info.department || ''),
    requestedRole: String(info.systemRole || 'Employee'),
    status: 'Pending approval',
    submittedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
  })
}

function notifyNewClient(info) {
  postToEmailScript({
    action: 'notify_new_client',
    clientId: String(info.clientId || ''),
    projectName: info.projectName || '',
    clientName: info.clientName || '',
    contactEmail: String(info.contactEmail || ''),
    phone: String(info.phone || ''),
    industry: String(info.industry || ''),
    services: String(info.services || ''),
    projectStartDate: String(info.projectStartDate || ''),
    addedBy: info.addedBy || '',
    submittedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
  })
}

function isUserActive(row) {
  if (!row) return false
  const active = row.is_active
  const status = String(row.status || '').trim().toLowerCase()

  if (status.includes('pending')) {
    return false
  }
  if (active === true || active === 'true' || active === 'Yes' || active === 'yes' || active === 1 || active === '1') {
    return true
  }
  if (status === 'approved' || status === 'active' || status === 'online' || status === 'offline') {
    return true
  }
  return false
}

async function login(payload) {
  const email = String(payload.email || '').trim().toLowerCase()
  const password = String(payload.password || '').trim()
  if (!email || !password) return { ok: false, error: 'Email and password are required.' }

  const { data: rows, error } = await supabase
    .from('team')
    .select('*')
    .ilike('email_address', email)
  if (error) return { ok: false, error: error.message }
  if (!rows || rows.length === 0) return { ok: false, error: 'No account found with this email.' }

  const row = rows.find(r => isUserActive(r)) || rows[rows.length - 1]

  if (row.password_token !== password) return { ok: false, error: 'Invalid password.' }

  if (!isUserActive(row)) {
    return { ok: false, error: 'Your account is pending admin approval.' }
  }

  const user = await completeLogin(row)
  return { ok: true, authenticated: true, user }
}

async function googleLogin(payload) {
  const email = String(payload.email || '').trim().toLowerCase()
  if (!email) return { ok: false, error: 'No email provided.' }

  const { data: rows, error } = await supabase
    .from('team')
    .select('*')
    .ilike('email_address', email)
  if (error) return { ok: false, error: error.message }
  if (!rows || rows.length === 0) return { ok: false, error: 'not_registered' }

  const row = rows.find(r => isUserActive(r)) || rows[rows.length - 1]

  if (!isUserActive(row)) {
    return { ok: false, error: 'Your account is pending admin approval.' }
  }

  const user = await completeLogin(row)
  return { ok: true, authenticated: true, user }
}

async function approveUser(email) {
  const clean = String(email || '').trim().toLowerCase()
  if (!clean) return { ok: false, error: 'No email provided.' }
  const { error } = await supabase
    .from('team')
    .update({ is_active: true, status: 'Approved' })
    .ilike('email_address', clean)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

async function reactivateUser(payload) {
  const email = typeof payload === 'string' ? payload : (payload?.email || '')
  const clean = String(email || '').trim().toLowerCase()
  if (!clean) return { ok: false, error: 'No email provided.' }
  const { error } = await supabase
    .from('team')
    .update({ is_active: true, status: 'Offline' })
    .ilike('email_address', clean)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

async function rejectUser(payload) {
  const email = payload.email || payload
  const clean = String(email || '').trim().toLowerCase()
  if (!clean) return { ok: false, error: 'No email provided.' }
  const { error } = await supabase.from('team').delete().eq('email_address', clean)
  if (error) return { ok: false, error: error.message }
  return { ok: true, deleted: true }
}

async function deleteUser(payload) {
  const email = payload.email || payload
  const clean = String(email || '').trim().toLowerCase()
  if (!clean) return { ok: false, error: 'No email provided.' }

  const { data: user } = await supabase
    .from('team')
    .select('full_name, employee_id')
    .ilike('email_address', clean)
    .maybeSingle()

  const userName = user?.full_name || ''

  await supabase.from('activity').delete().eq('employee_id', user?.employee_id || '__none__')
  await supabase.from('chat_messages').delete().eq('sender_id', clean)
  await supabase.from('files').delete().ilike('uploaded_by', userName)

  const { error } = await supabase.from('team').update({
    is_active: false,
    status: 'Inactive',
  }).ilike('email_address', clean)
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

  // Idempotent punch-in: reuse an already-open session for today instead of
  // creating duplicate rows every time the user logs back in and punches in.
  const today = istDate()
  const { data: existing } = await supabase
    .from('activity')
    .select('login_date_and_time')
    .eq('employee_id', row.employee_id)
    .is('logout_date_and_time', null)
    .gte('login_date_and_time', `${today} 00:00:00`)
    .lt('login_date_and_time', `${today} 23:59:59`)
    .limit(1)
  if (!existing || existing.length === 0) {
    await recordActivity(row.employee_id, row.full_name, row.role, row.department, istNow())
  }
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
    .select('login_date_and_time')
    .eq('employee_id', row.employee_id)
    .is('logout_date_and_time', null)
    .order('login_date_and_time', { ascending: false })
    .limit(1)
  if (sessions && sessions.length > 0) {
    await supabase
      .from('activity')
      .update({ logout_date_and_time: istNow() })
      .eq('employee_id', row.employee_id)
      .is('logout_date_and_time', null)
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
  const { error: subErr } = await supabase.from('tasks').delete().eq('main_task_id', taskId)
  if (subErr) console.warn('Failed to cascade-delete subtasks:', subErr.message)
  const { error } = await supabase.from('tasks').delete().eq('task_id', taskId)
  if (error) throw error
  return { ok: true, deleted: true }
}

async function removePersonFromTask(payload) {
  const taskId = String(payload.taskId || payload.task_id || '')
  const removeEmail = String(payload.removeEmail || payload.email || '').trim().toLowerCase()
  const removeName = String(payload.removeName || payload.name || '').trim().toLowerCase()
  if (!taskId || (!removeEmail && !removeName)) return { ok: false, error: 'Task ID and name/email required.' }

  const { data: task, error: fetchErr } = await supabase
    .from('tasks')
    .select('assigned_to, assigned_emails, employee_ids')
    .eq('task_id', taskId)
    .maybeSingle()
  if (fetchErr || !task) return { ok: false, error: 'Task not found.' }

  const names = (task.assigned_to || '').split(',').map(s => s.trim()).filter(Boolean)
  const emails = (task.assigned_emails || '').split(',').map(s => s.trim()).filter(Boolean)
  const ids = (task.employee_ids || '').split(',').map(s => s.trim()).filter(Boolean)

  let idx = -1
  if (removeEmail) {
    idx = emails.findIndex(e => e.toLowerCase() === removeEmail)
  }
  if (idx === -1 && removeName) {
    idx = names.findIndex(n => n.toLowerCase() === removeName)
  }
  if (idx === -1) return { ok: false, error: 'Person not found in task.' }

  names.splice(idx, 1)
  if (emails[idx]) emails.splice(idx, 1)
  if (ids[idx]) ids.splice(idx, 1)

  const { error } = await supabase.from('tasks').update({
    assigned_to: names.join(', '),
    assigned_emails: emails.join(', '),
    employee_ids: ids.join(', '),
  }).eq('task_id', taskId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
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

  notifyNewClient({
    clientId: row.client_id,
    projectName: row.project_name,
    clientName: row.client_name,
    contactEmail: row.contact_email,
    phone: row.phone,
    industry: row.industry,
    services: row.services,
    projectStartDate: row.project_start_date,
    addedBy: payload.userEmail || '',
  })

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

async function checkAndAutoCreateRecurringPayments() {
  try {
    const { data: clientsData } = await supabase.from('clients').select('*')
    const { data: paymentsData } = await supabase.from('payments').select('*')
    if (!clientsData || !paymentsData) return

    const now = new Date()

    for (const client of clientsData) {
      const clientId = client.client_id
      if (!clientId) continue

      const clientPays = paymentsData.filter(p => String(p.client_id).trim() === String(clientId).trim())
      const latestPay = clientPays.length > 0 ? clientPays[clientPays.length - 1] : null

      const isRecurring =
        String(latestPay?.recurring || client?.recurring || '').toLowerCase() === 'yes' ||
        String(latestPay?.recurring || client?.recurring || '').toLowerCase() === 'true'
      if (!isRecurring) continue

      const startDateStr = client.project_start_date || latestPay?.project_start_date
      if (!startDateStr) continue
      const start = new Date(startDateStr)
      if (isNaN(start.getTime()) || start > now) continue

      const monthsDiff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
      let requiredCycles = monthsDiff
      if (now.getDate() >= start.getDate()) {
        requiredCycles += 1
      }
      requiredCycles = Math.max(1, requiredCycles)

      const existingCount = clientPays.length
      if (existingCount < requiredCycles) {
        for (let cycle = existingCount + 1; cycle <= requiredCycles; cycle++) {
          const cycleDate = new Date(start)
          cycleDate.setMonth(start.getMonth() + (cycle - 1))
          const dateStr = cycleDate.toISOString().split('T')[0]

          const cost = parseFloat(latestPay?.total_cost || client?.total_cost) || 0
          const isGst = (latestPay?.gst_non_gst || client?.gst_non_gst) === 'GST'
          const gstAmt = isGst ? (parseFloat(latestPay?.gst_amount_new || client?.gst_amount_new) || Math.round(cost * 0.18)) : 0
          const tdsApplied = (latestPay?.tds_applied || client?.tds_applied) === 'Yes'
          const tdsAmt = tdsApplied ? (parseFloat(latestPay?.tds_amount || client?.tds_amount) || Math.round(cost * 0.01)) : 0
          const totalPayable = cost + gstAmt - tdsAmt

          const newCycleRow = {
            client_id: clientId,
            project: latestPay?.project || client.project_name || '',
            client: latestPay?.client || client.client_name || '',
            emails: latestPay?.emails || client.contact_email || '',
            phone_no: latestPay?.phone_no || client.phone || '',
            project_start_date: startDateStr,
            industry: latestPay?.industry || client.industry || '',
            is_active: latestPay?.is_active || (client.is_active ? 'Yes' : 'No'),
            services: latestPay?.services || client.services || '',
            project_end_date: latestPay?.project_end_date || client.project_completion_date || '',
            gst_non_gst: latestPay?.gst_non_gst || client?.gst_non_gst || '',
            gst_amount_new: latestPay?.gst_amount_new || client?.gst_amount_new || '',
            gst_pct: latestPay?.gst_pct || client?.gst_pct || '',
            tds_applied: latestPay?.tds_applied || client?.tds_applied || 'No',
            tds_amount: latestPay?.tds_amount || client?.tds_amount || '',
            recurring: latestPay?.recurring || client?.recurring || 'Yes',
            recurring_type: latestPay?.recurring_type || client?.recurring_type || 'Monthly',
            total_cost: latestPay?.total_cost || client?.total_cost || '',
            payment_date: dateStr,
            payment_amount: '',
            payment_note: `Auto-generated Month ${cycle} recurring payment cycle`,
            pending_amount: String(totalPayable),
            data_entry_date_and_time: istNow(),
            note: `Auto-generated Month ${cycle}`,
          }

          await supabase.from('payments').insert(newCycleRow)
        }
      }
    }
  } catch (err) {
    console.warn('Error auto-creating recurring payment cycles:', err)
  }
}

/* ─── Payments ───────────────────────────────────────────────────────────── */
async function getPayments() {
  await checkAndAutoCreateRecurringPayments()
  const { data, error } = await supabase.from('payments').select('*').order('data_entry_date_and_time', { ascending: true })
  if (error) throw error
  return { payments: (data || []).map((r) => rowToSheet(r, PAYMENT_MAP)) }
}

async function updatePayment(payload) {
  const clientId = String(payload.clientId || payload.client_id || '')
  if (!clientId) return { ok: false, error: 'Client ID missing.' }
  if (payload.action === 'record_payment') {
    return recordPayment(payload)
  }
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

  // Fetch latest existing payment configuration/metadata for this client
  const { data: existing } = await supabase
    .from('payments')
    .select('*')
    .eq('client_id', clientId)
    .order('data_entry_date_and_time', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: clientRow } = await supabase
    .from('clients')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()

  // Every installment MUST be inserted as a brand new entry in the payments table
  const newInstallmentRow = {
    client_id: clientId,
    project: existing?.project || clientRow?.project_name || '',
    client: existing?.client || clientRow?.client_name || '',
    emails: existing?.emails || clientRow?.contact_email || '',
    phone_no: existing?.phone_no || clientRow?.phone || '',
    project_start_date: existing?.project_start_date || clientRow?.project_start_date || '',
    industry: existing?.industry || clientRow?.industry || '',
    is_active: existing?.is_active ?? (clientRow?.is_active ? 'Yes' : 'No'),
    services: existing?.services || clientRow?.services || '',
    project_end_date: existing?.project_end_date || clientRow?.project_completion_date || '',
    gst_non_gst: existing?.gst_non_gst || '',
    gst_amount_new: existing?.gst_amount_new || '',
    gst_pct: existing?.gst_pct || '',
    tds_applied: existing?.tds_applied || 'No',
    tds_amount: existing?.tds_amount || '',
    recurring: existing?.recurring || '',
    recurring_type: existing?.recurring_type || '',
    total_cost: existing?.total_cost || '',
    payment_date: payload.date || istNow(),
    payment_amount: String(payload.amount),
    payment_note: payload.note || '',
    pending_amount: String(payload.pendingAmount ?? ''),
    data_entry_date_and_time: istNow(),
    note: payload.note || existing?.note || '',
  }

  const { error } = await supabase.from('payments').insert(newInstallmentRow)
  if (error) throw error
  return { ok: true }
}

async function deletePayment(payload) {
  const { id, clientId, dataEntryTime } = payload
  let query = supabase.from('payments').delete()
  if (id) {
    query = query.eq('id', id)
  } else if (clientId && dataEntryTime) {
    query = query.eq('client_id', clientId).eq('data_entry_date_and_time', dataEntryTime)
  } else {
    return { ok: false, error: 'Target payment identifier missing.' }
  }
  const { error } = await query
  if (error) throw error
  return { ok: true, deleted: true }
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

async function getProjectFiles(projectName) {
  if (!projectName) return { ok: false, error: 'No project name provided' }
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('project_name', projectName)
    .order('uploaded_at', { ascending: false })
  if (error) throw error
  const files = (data || []).map((f) => {
    const path = f.storage_path || ''
    const url = /^https?:\/\//.test(path) ? path : supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data?.publicUrl || ''
    return {
      name: f.filename,
      url,
      type: f.mime_type,
      department: f.department || 'General',
      date: f.uploaded_at,
    }
  })
  return { ok: true, files }
}

async function updateUserProfile(payload) {
  const email = (payload.email || '').trim().toLowerCase()
  const fullName = (payload.fullName || payload.name || '').trim()
  if (!email || !fullName) throw new Error('Email and Full Name are required')

  const { data, error } = await supabase
    .from('team')
    .update({ full_name: fullName })
    .eq('email_address', email)
    .select('*')

  if (error) throw error
  return { ok: true, data }
}

/* ─── Dispatch ───────────────────────────────────────────────────────────── */
const POST_HANDLERS = {
  register,
  login,
  google_login: googleLogin,
  reject_user: rejectUser,
  delete_user: deleteUser,
  reactivate_user: reactivateUser,
  user_online: (p) => setPresence(p.email, 'Online'),
  user_offline: (p) => setPresence(p.email, 'Offline'),
  punch_in: punchIn,
  punch_out: punchOut,
  add_task: addTask,
  update_task: updateTask,
  delete_task: deleteTask,
  remove_person_from_task: removePersonFromTask,
  add_client: addClient,
  update_client: updateClient,
  update_payment: updatePayment,
  record_payment: recordPayment,
  delete_payment: deletePayment,
  send: sendMessage,
  read_receipt: receipt,
  delivery_receipt: receipt,
  upload_task_file: uploadTaskFile,
  update_user_profile: updateUserProfile,
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
      case 'reactivate_user': return reactivateUser(params.email)
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

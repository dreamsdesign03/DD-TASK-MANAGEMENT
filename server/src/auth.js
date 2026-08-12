import { supabase, teamRowToUser, nextEmployeeId, istNow, istDate } from './db.js'

async function recordActivity(employeeId, fullName, role, department, loginTime) {
  await supabase.from('activity').insert({
    employee_id: employeeId,
    full_name: fullName,
    role: role,
    department: department,
    login_date_and_time: loginTime,
    logout_date_and_time: null,
  })
}

async function completeLogin(row) {
  if (!row) return null
  const s = teamRowToUser(row)
  await recordActivity(
    row.employee_id,
    row.full_name,
    row.role,
    row.department,
    istNow()
  )
  return s
}

export async function handleRegister(payload) {
  const email = String(payload.email || '').trim().toLowerCase()
  const name = String(payload.name || '').trim()
  if (!email || !name) {
    return { ok: false, error: 'Email and name are required.' }
  }

  const { data: existing } = await supabase
    .from('team')
    .select('email_address')
    .eq('email_address', email)
    .maybeSingle()
  if (existing) {
    return { ok: false, error: 'An account with this email already exists.' }
  }

  const employeeId = await nextEmployeeId()
  const firstName = (name.split(' ')[0] || 'user').toLowerCase()
  const token = `token_${firstName}_${employeeId.replace('EMP-', '')}`

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
  return { ok: true }
}

export async function handleLogin(payload) {
  const email = String(payload.email || '').trim().toLowerCase()
  const password = String(payload.password || '').trim()
  if (!email || !password) {
    return { ok: false, error: 'Email and password are required.' }
  }

  const { data: row } = await supabase
    .from('team')
    .select('*')
    .eq('email_address', email)
    .maybeSingle()
  if (!row) return { ok: false, error: 'No account found with this email.' }

  if (row.password_token !== password) {
    return { ok: false, error: 'Invalid password.' }
  }
  if (!row.is_active) {
    return { ok: false, error: 'Your account is pending admin approval.' }
  }

  const user = await completeLogin(row)
  return { ok: true, authenticated: true, user }
}

export async function handleGoogleLogin(payload) {
  const email = String(payload.email || '').trim().toLowerCase()
  if (!email) return { ok: false, error: 'No email provided.' }

  const { data: row } = await supabase
    .from('team')
    .select('*')
    .eq('email_address', email)
    .maybeSingle()
  if (!row) {
    return { ok: false, error: 'No account linked with this Google email.' }
  }
  if (!row.is_active) {
    return { ok: false, error: 'Your account is pending admin approval.' }
  }

  const user = await completeLogin(row)
  return { ok: true, authenticated: true, user }
}

export async function handleApproveUser(email) {
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

async function setPresence(email, status) {
  const clean = String(email || '').trim().toLowerCase()
  if (!clean) return { ok: false, error: 'No email provided.' }
  const { error } = await supabase
    .from('team')
    .update({ status })
    .eq('email_address', clean)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export const handleUserOnline = (payload) => setPresence(payload.email, 'Online')
export const handleUserOffline = (payload) => setPresence(payload.email, 'Offline')

export async function handlePunchIn(payload) {
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

export async function handlePunchOut(payload) {
  const email = String(payload.email || '').trim().toLowerCase()
  if (!email) return { ok: false, error: 'No email provided.' }

  const { data: row } = await supabase
    .from('team')
    .select('employee_id')
    .eq('email_address', email)
    .maybeSingle()
  if (!row) return { ok: false, error: 'User not found.' }

  // Close the latest open (no logout time) session for this employee
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

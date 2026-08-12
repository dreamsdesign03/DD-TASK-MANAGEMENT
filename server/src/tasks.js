import {
  supabase,
  TASK_MAP,
  taskRowToSheet,
  taskPayloadToDb,
  nextTaskId,
} from './db.js'

function isAdmin(email) {
  const clean = String(email || '').trim().toLowerCase()
  return clean === 'admin@dreamsdesk.com' || clean.endsWith('@dreamsdesk.com')
}

export async function handleGetTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('task_id', { ascending: true })
    .limit(2000)
  if (error) throw error
  return (data || []).map(taskRowToSheet)
}

export async function handleAddTask(payload) {
  const row = taskPayloadToDb(payload)

  // If no task id supplied, generate one that doesn't collide
  if (!row.task_id) {
    const { data: existing } = await supabase.from('tasks').select('task_id')
    row.task_id = nextTaskId((existing || []).map((r) => r.task_id))
  }
  row.department = row.department || 'COMMON'
  row.time_taken = row.time_taken || '0h 0m'
  row.post = row.post || 'NO'
  row.status = row.status || 'Pending'

  const { error } = await supabase.from('tasks').insert(row)
  if (error) throw error
  return { ok: true }
}

export async function handleUpdateTask(payload) {
  const taskId = String(payload.taskId || payload.task_id || '')
  if (!taskId) return { ok: false, error: 'Task ID missing.' }

  const { data: existing } = await supabase
    .from('tasks')
    .select('task_id')
    .eq('task_id', taskId)
    .maybeSingle()
  if (!existing) return { ok: false, error: 'not_found' }

  const row = taskPayloadToDb(payload)
  delete row.task_id // task id is the key, never updated
  // The frontend sends the full merged task, so write every provided column
  if (row.time_taken === undefined) row.time_taken = '0h 0m'
  if (row.post === undefined) row.post = 'NO'

  const { error } = await supabase.from('tasks').update(row).eq('task_id', taskId)
  if (error) throw error
  return { ok: true }
}

export async function handleDeleteTask(payload) {
  const taskId = String(payload.taskId || payload.task_id || '')
  if (!taskId) return { ok: false, error: 'Task ID missing.' }

  if (!isAdmin(payload.userEmail)) {
    return { ok: false, error: 'Unauthorized' }
  }

  const { error } = await supabase.from('tasks').delete().eq('task_id', taskId)
  if (error) throw error
  return { ok: true, deleted: true }
}

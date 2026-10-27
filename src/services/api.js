// ─────────────────────────────────────────────────────────────
// Centralized API adapter
// Routes legacy Google Apps Script calls through a unified adapter
// ─────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient'

/**
 * Normalize task IDs to avoid scientific notation issues
 * If incoming task ID matches scientific notation (starts with T- and length > 15),
 * format to clean ID and preserve legacy_id
 */
export function normalizeTaskId(taskId) {
  if (!taskId) return taskId
  
  const idStr = String(taskId).trim()
  
  // Check if it matches scientific notation pattern (starts with T- and length > 15)
  if (idStr.startsWith('T-') && idStr.length > 15) {
    // Try to extract the numeric part or create a clean ID
    // Preserve original as legacy_id
    const cleanId = idStr.replace(/[^A-Za-z0-9-]/g, '').substring(0, 15)
    return {
      task_id: cleanId,
      legacy_id: idStr
    }
  }
  
  return { task_id: idStr }
}

/**
 * Fix date formatting: normalize sheet date strings to ISO 8601 timestamps
 * before upserting into Supabase
 */
export function normalizeDateToISO(dateString) {
  if (!dateString) return null
  
  const str = String(dateString).trim()
  if (!str) return null
  
  // If already in ISO format
  if (str.includes('T') && (str.includes('Z') || str.includes('+'))) {
    try {
      return new Date(str).toISOString()
    } catch {
      return str
    }
  }
  
  // Try to parse common sheet date formats
  try {
    // Handle formats like DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD
    const date = new Date(str)
    if (!isNaN(date.getTime())) {
      return date.toISOString()
    }
  } catch {
    // ignore
  }
  
  return str
}

/**
 * Normalize all date fields in a record
 */
export function normalizeRecordDates(record) {
  if (!record || typeof record !== 'object') return record
  
  const dateFields = [
    'assigned_date', 'due_date', 'status_updated_on', 
    'joined_date', 'project_start_date', 'project_completion_date',
    'payment_date', 'data_entry_date_and_time', 'login_date_and_time',
    'logout_date_and_time', 'timestamp', 'uploaded_at'
  ]
  
  const normalized = { ...record }
  for (const field of dateFields) {
    if (normalized[field]) {
      normalized[field] = normalizeDateToISO(normalized[field])
    }
  }
  return normalized
}

/**
 * Generic fetch wrapper that routes through adapter
 * Can be used to replace direct script.google.com calls
 */
export async function fetchFromAdapter(url, options = {}) {
  // For now, pass through to fetch - but centralized here for future routing
  try {
    const response = await fetch(url, options)
    return response
  } catch (error) {
    console.error('Adapter fetch error:', error)
    throw error
  }
}

/**
 * Tasks API through adapter
 */
export const tasksApi = {
  async getTasks() {
    const { data, error } = await supabase.from('tasks').select('*')
    if (error) throw error
    return data
  },
  
  async upsertTask(task) {
    let normalizedTask = { ...task }
    normalizedTask = normalizeRecordDates(normalizedTask)
    
    if (normalizedTask.task_id || normalizedTask['Task ID']) {
      const taskId = normalizedTask.task_id || normalizedTask['Task ID']
      const normalized = normalizeTaskId(taskId)
      if (typeof normalized === 'object') {
        normalizedTask.task_id = normalized.task_id
        normalizedTask.legacy_id = normalized.legacy_id
      } else {
        normalizedTask.task_id = normalized
      }
    }
    
    const { data, error } = await supabase.from('tasks').upsert(normalizedTask)
    if (error) throw error
    return data
  }
}

/**
 * Team API through adapter
 */
export const teamApi = {
  async getTeam() {
    const { data, error } = await supabase.from('team').select('*')
    if (error) throw error
    return data
  }
}

/**
 * Clients API through adapter
 */
export const clientsApi = {
  async getClients() {
    const { data, error } = await supabase.from('clients').select('*')
    if (error) throw error
    return data
  }
}

/**
 * Activity API through adapter
 */
export const activityApi = {
  async getActivities() {
    const { data, error } = await supabase.from('activity').select('*')
    if (error) throw error
    return data
  }
}

export default {
  normalizeTaskId,
  normalizeDateToISO,
  normalizeRecordDates,
  fetchFromAdapter,
  tasksApi,
  teamApi,
  clientsApi,
  activityApi
}

import express from 'express'
import cors from 'cors'
import { PORT, SUPABASE_URL, SUPABASE_KEY } from './config.js'
import {
  handleRegister,
  handleLogin,
  handleGoogleLogin,
  handleApproveUser,
  handleUserOnline,
  handleUserOffline,
  handlePunchIn,
  handlePunchOut,
} from './auth.js'
import {
  handleGetTasks,
  handleAddTask,
  handleUpdateTask,
  handleDeleteTask,
} from './tasks.js'
import {
  handleGetClients,
  handleAddClient,
  handleUpdateClient,
} from './clients.js'
import {
  handleGetPayments,
  handleUpdatePayment,
  handleRecordPayment,
} from './payments.js'
import {
  handleGetActivities,
  handleGetChats,
  handleSendMessage,
  handleReceipt,
} from './chat.js'
import {
  handleGetProjectFiles,
  handleUploadFile,
} from './files.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '60mb' }))
app.use(express.urlencoded({ extended: true, limit: '60mb' }))

const POST_HANDLERS = {
  register: handleRegister,
  login: handleLogin,
  google_login: handleGoogleLogin,
  user_online: handleUserOnline,
  user_offline: handleUserOffline,
  punch_in: handlePunchIn,
  punch_out: handlePunchOut,
  add_task: handleAddTask,
  update_task: handleUpdateTask,
  delete_task: handleDeleteTask,
  add_client: handleAddClient,
  update_client: handleUpdateClient,
  update_payment: handleUpdatePayment,
  record_payment: handleRecordPayment,
  send: handleSendMessage,
  read_receipt: handleReceipt,
  delivery_receipt: handleReceipt,
  upload_file: handleUploadFile,
}

const GET_HANDLERS = {
  approve_user: async (req) => handleApproveUser(req.query.email),
  get_tasks: handleGetTasks,
  get_team: async () => {
    const { supabase, rowToSheet, TEAM_MAP, sheetBoolean } = await import('./db.js')
    const { data, error } = await supabase.from('team').select('*').order('employee_id')
    if (error) throw error
    return (data || []).map((r) => {
      const s = rowToSheet(r, TEAM_MAP)
      s['Is Active'] = sheetBoolean(s['Is Active'])
      return s
    })
  },
  get_clients: handleGetClients,
  get_payments: handleGetPayments,
  get_activities: handleGetActivities,
  get_project_files: (req) => handleGetProjectFiles(req.query.projectName),
}

// Bare GET (no action) = chat messages, matching the old Apps Script default
app.get('/', async (req, res) => {
  try {
    const action = req.query.action
    if (action) {
      const handler = GET_HANDLERS[action]
      if (!handler) return res.status(400).json({ ok: false, error: `Unknown action: ${action}` })
      const result = await handler(req)
      return res.json(result)
    }
    const messages = await handleGetChats()
    return res.json(messages)
  } catch (err) {
    console.error('GET error:', err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

app.post('/', async (req, res) => {
  try {
    let payload = req.body
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload)
      } catch {
        return res.status(400).json({ ok: false, error: 'Invalid JSON body.' })
      }
    }
    const action = payload && payload.action
    const handler = POST_HANDLERS[action]
    if (!handler) {
      return res.status(400).json({ ok: false, error: `Unknown action: ${action}` })
    }
    const result = await handler(payload)
    return res.json(result || { ok: true })
  } catch (err) {
    console.error(`POST error (${payload?.action}):`, err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

app.get('/health', (req, res) => res.json({ ok: true, supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_KEY) }))

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('⚠ SUPABASE_URL / SUPABASE_KEY not set. Copy server/.env.example → server/.env and fill it in.')
}

app.listen(PORT, () => {
  console.log(`Dreamsdesk backend listening on port ${PORT}`)
})

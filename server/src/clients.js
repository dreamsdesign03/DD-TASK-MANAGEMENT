import {
  supabase,
  CLIENT_MAP,
  PAYMENT_MAP,
  sheetToDb,
  rowToSheet,
  sheetBoolean,
  nextClientId,
  istNow,
  istDate,
} from './db.js'

export async function handleGetClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('client_id', { ascending: true })
  if (error) throw error

  const clients = (data || []).map((row) => {
    const s = rowToSheet(row, CLIENT_MAP)
    s['Is Active'] = sheetBoolean(s['Is Active'])
    return s
  })
  return { clients }
}

export async function handleAddClient(payload) {
  const row = sheetToDb(payload, CLIENT_MAP)
  if (!row.client_id) {
    const { data: existing } = await supabase.from('clients').select('client_id')
    row.client_id = await nextClientId(existing.map((r) => r.client_id))
  }
  if (row.is_active === undefined) row.is_active = true

  const { error } = await supabase.from('clients').insert(row)
  if (error) throw error

  // Mirror the old behavior: also create a payment row for the new client
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

export async function handleUpdateClient(payload) {
  const clientId = String(payload.clientId || payload.client_id || '')
  if (!clientId) return { ok: false, error: 'Client ID missing.' }

  const row = sheetToDb(payload, CLIENT_MAP)
  delete row.client_id

  const { error } = await supabase.from('clients').update(row).eq('client_id', clientId)
  if (error) throw error
  return { ok: true }
}

export { istDate }

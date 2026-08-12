import { supabase, PAYMENT_MAP, sheetToDb, rowToSheet, istNow } from './db.js'

export async function handleGetPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('client_id', { ascending: true })
  if (error) throw error
  return { payments: (data || []).map((r) => rowToSheet(r, PAYMENT_MAP)) }
}

export async function handleUpdatePayment(payload) {
  const clientId = String(payload.clientId || payload.client_id || '')
  if (!clientId) return { ok: false, error: 'Client ID missing.' }

  // Check whether a payment row already exists for this client
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
    const { error: insErr } = await supabase.from('payments').insert({
      ...row,
      client_id: clientId,
    })
    error = insErr
  }
  if (error) throw error
  return { ok: true }
}

export async function handleRecordPayment(payload) {
  const clientId = String(payload.clientId || payload.client_id || '')
  const amount = payload.amount
  const date = payload.date || istNow()
  const note = payload.note || ''
  if (!clientId) return { ok: false, error: 'Client ID missing.' }
  if (amount === undefined || amount === null || amount === '') {
    return { ok: false, error: 'Amount missing.' }
  }

  // Add a new payment history row
  const { error } = await supabase.from('payments').insert({
    client_id: clientId,
    payment_date: date,
    payment_amount: String(amount),
    payment_note: note,
    pending_amount: String(payload.pendingAmount ?? ''),
    data_entry_date_and_time: istNow(),
  })
  if (error) throw error

  // Update the primary payment row's pending amount if provided
  if (payload.pendingAmount !== undefined && payload.pendingAmount !== null) {
    await supabase
      .from('payments')
      .update({ pending_amount: String(payload.pendingAmount) })
      .eq('client_id', clientId)
  }
  return { ok: true }
}

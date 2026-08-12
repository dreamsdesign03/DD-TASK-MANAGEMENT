import { supabase, ACTIVITY_MAP, CHAT_MAP, rowToSheet } from './db.js'

export async function handleGetActivities() {
  const { data, error } = await supabase
    .from('activity')
    .select('*')
    .order('login_date_and_time', { ascending: true })
  if (error) throw error
  return (data || []).map((r) => rowToSheet(r, ACTIVITY_MAP))
}

export async function handleGetChats() {
  // Old backend returned every row from the "Chat" + "group_*" sheets.
  // Single chat_messages table now; room_id column distinguishes rooms.
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .order('timestamp', { ascending: true })
    .limit(5000)
  if (error) throw error
  return (data || []).map((r) => rowToSheet(r, CHAT_MAP))
}

export async function handleSendMessage(payload) {
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

export async function handleReceipt(payload) {
  // read_receipt / delivery_receipt persist a marker message row
  return handleSendMessage({ ...payload, type: payload.action })
}

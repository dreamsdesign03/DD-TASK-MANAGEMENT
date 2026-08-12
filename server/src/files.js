import { supabase, istNow } from './db.js'
import { STORAGE_BUCKET } from './config.js'

// Ensure the storage bucket exists (idempotent). Requires service_role key.
async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = (buckets || []).some((b) => b.name === STORAGE_BUCKET)
  if (!exists) {
    const { error } = await supabase.storage.createBucket(STORAGE_BUCKET, {
      public: true,
      fileSizeLimit: 52428800, // 50 MB
    })
    if (error) console.warn('Bucket creation failed (service_role key required):', error.message)
  }
}

export async function handleGetProjectFiles(projectName) {
  if (!projectName) return { ok: false, error: 'No project name provided' }

  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('project_name', projectName)
    .order('uploaded_at', { ascending: false })
  if (error) throw error

  const publicUrl = (path) => {
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
    return data?.publicUrl || ''
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

export async function handleUploadFile(payload) {
  const filename = String(payload.filename || 'file').trim()
  const mimeType = String(payload.mimeType || 'application/octet-stream')
  const base64 = String(payload.base64 || '')
  const projectName = String(payload.projectName || '').trim()
  const department = String(payload.department || 'General').trim()
  if (!base64) return { ok: false, error: 'No file data provided.' }

  await ensureBucket()

  const path = `${projectName}/${department}/${Date.now()}-${filename.replace(/\s+/g, '_')}`

  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, Buffer.from(base64, 'base64'), { contentType: mimeType })
  if (uploadErr) throw new Error(uploadErr.message)

  const { error: rowErr } = await supabase.from('files').insert({
    filename,
    mime_type: mimeType,
    size_bytes: Buffer.byteLength(Buffer.from(base64, 'base64')),
    storage_path: path,
    project_name: projectName,
    department,
    uploaded_by: String(payload.userEmail || ''),
    uploaded_at: istNow(),
  })
  if (rowErr) console.warn('File stored but row insert failed:', rowErr.message)

  return { ok: true }
}

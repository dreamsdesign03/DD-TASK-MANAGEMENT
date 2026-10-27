/**
 * Helper utility to format Task IDs cleanly.
 * Preserves the actual task ID value (e.g. T-0001, T-0042) while cleaning up prefixes or scientific notation.
 */
export function formatTaskId(id) {
  if (!id) return ''
  let str = String(id).trim()

  // Convert #DD- prefix to T- if present
  if (str.toUpperCase().startsWith('#DD-')) {
    str = 'T-' + str.slice(4)
  }

  // Handle scientific notation e.g. T-1.5153779060281494e+26055274 or 1.5153779060281494e+26
  if (str.includes('e+') || str.includes('E+')) {
    const parts = str.split(/e\+/i)
    const basePart = parts[0] || ''
    const expPart = parts[1] || ''

    const mantissaDigits = basePart.replace(/\D/g, '')

    if (expPart.length > 2) {
      // Suffix was concatenated with exponent e.g. e+26055274 -> suffix 26055274
      const expDigits = expPart.replace(/\D/g, '')
      str = `T-${expDigits}`
    } else {
      // Standard scientific notation e.g. 1.5153779060281494e+26
      // Use the last 6 digits of the mantissa so every task retains a unique ID!
      const uniqueDigits = mantissaDigits.slice(-6) || '0001'
      str = `T-${uniqueDigits}`
    }
  }

  return str
}

/**
 * Normalizes a task ID string into a comparison key.
 */
export function normalizeTaskIdKey(id) {
  if (!id) return ''
  return formatTaskId(id).trim().toLowerCase()
}

/**
 * Checks if two Task IDs refer to the same task.
 */
export function isSameTaskId(id1, id2) {
  if (!id1 || !id2) return false
  if (id1 === id2) return true
  return normalizeTaskIdKey(id1) === normalizeTaskIdKey(id2)
}

/**
 * Deduplicates an array of tasks by normalized Task ID key.
 * If two distinct task objects have the exact same raw ID and normalized key,
 * fallback to differentiating by title so no backend tasks are lost!
 */
export function deduplicateTasks(taskList) {
  if (!Array.isArray(taskList)) return []
  const map = new Map()
  taskList.forEach((t, idx) => {
    if (!t) return
    let key = t.id ? normalizeTaskIdKey(t.id) : `task-index-${idx}`

    if (map.has(key)) {
      const existing = map.get(key)
      const existingTitle = String(existing.title || '').trim().toLowerCase()
      const currentTitle = String(t.title || '').trim().toLowerCase()

      if (existingTitle && currentTitle && existingTitle !== currentTitle) {
        // Different tasks sharing a duplicate raw ID! Keep both!
        key = `${key}_${currentTitle.slice(0, 10).replace(/\W/g, '')}_${idx}`
        map.set(key, t)
      } else {
        // Same task! Merge properties
        map.set(key, { ...t, ...existing })
      }
    } else {
      map.set(key, t)
    }
  })
  return Array.from(map.values())
}
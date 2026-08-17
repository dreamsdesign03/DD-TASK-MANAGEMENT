export const AVATAR_COLORS = [
  '#702c91', // primary purple
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
  '#ec008c', // pink-500
  '#6366f1', // indigo-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
  '#a855f7', // purple-500
  '#0284c7', // light blue
  '#059669', // green-600
  '#d97706', // amber-600
  '#dc2626', // red-600
]

export function getUserColor(name, email) {
  const cleanName = name ? String(name).replace(/[^\w]/g, '').toLowerCase().trim() : ''
  const cleanEmail = email ? String(email).trim().toLowerCase() : ''
  const key = cleanName || cleanEmail || 'user'
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash)
  }
  hash = Math.abs(hash)
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function getInitials(name) {
  if (!name) return '?'
  const clean = String(name).replace(/[^\w\s]/g, '').trim()
  const parts = clean.split(' ').filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return '?'
}

export function renderAvatar(avatar, name, sizeClass = "w-10 h-10 rounded-full", textClass = "text-[13px]", email, isInactive = false) {
  const isValidImage = avatar &&
    (avatar.startsWith('http') || avatar.startsWith('/') || avatar.startsWith('data:')) &&
    !avatar.includes('dicebear.com')

  const initials = getInitials(name)
  const bgColor = isInactive ? '#9CA3AF' : getUserColor(name, email)
  const blurClass = isInactive ? 'filter blur-[0.5px] opacity-60' : ''

  if (isValidImage && !isInactive) {
    return (
      <img
        src={avatar}
        alt={name || '?'}
        className={`${sizeClass} object-cover flex-shrink-0`}
        title={name}
      />
    )
  }

  return (
    <div
      className={`${sizeClass} flex items-center justify-center text-white font-bold flex-shrink-0 ${textClass} ${blurClass} relative`}
      style={{ backgroundColor: bgColor }}
      title={isInactive ? `${name} (Inactive by Admin)` : name}
    >
      {isInactive ? (
        <span className="material-symbols-outlined text-[14px]">person_off</span>
      ) : (
        initials
      )}
    </div>
  )
}


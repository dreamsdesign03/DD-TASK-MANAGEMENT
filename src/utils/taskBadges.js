/* Priority badge config */
export const PRIORITY_STYLES = {
  Urgent: 'bg-[#E74C3C] text-white',
  High: 'bg-[#F39C12] text-white',
  Medium: 'bg-[#3498DB] text-white',
  Low: 'bg-[#95A5A6] text-white',
}

export const PRIORITY_WEIGHTS = {
  Urgent: 4,
  High: 3,
  Medium: 2,
  Low: 1,
}

/* Status badge config */
export const STATUS_STYLES = {
  Blocked: 'bg-red-100 text-red-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  Review: 'bg-blue-100 text-blue-700',
  Done: 'bg-green-100 text-green-700',
  Pending: 'bg-gray-100 text-gray-700',
}

export const STATUS_CONFIG = {
  'Pending': { bg: '#F3F4F6', color: '#4B5563' },
  'In Progress': { bg: '#FEF3C7', color: '#D97706' },
  'Review': { bg: '#EFF6FF', color: '#2563EB' },
  'Done': { bg: '#F0FDF4', color: '#16A34A' },
  'Blocked': { bg: '#FEF2F2', color: '#DC2626' },
}

export const STATUS_ICON = {
  Done: 'check',
}

export const FILTERS = ['All', 'Pending', 'In Progress', 'Review', 'Done', 'Blocked']
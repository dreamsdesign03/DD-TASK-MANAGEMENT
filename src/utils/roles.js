// Roles that are not expected to create or move tasks day-to-day.
// Used by the "active today" reminder so these accounts are never flagged.
export const EXCLUDED_ROLES = ['Admin', 'Accountant', 'Manager']

// System role of a user object (falls back to Role, then 'Employee').
export function systemRoleOf(user) {
  if (!user) return 'Employee'
  return String(user.systemRole || user['System Role'] || user.role || user.Role || 'Employee').trim()
}

export function isExcludedRole(user) {
  const role = systemRoleOf(user).trim().toLowerCase()
  return EXCLUDED_ROLES.some((r) => r.toLowerCase() === role)
}

// An admin is only ever the literal 'Admin' system role.
export function isAdminUser(user) {
  return systemRoleOf(user) === 'Admin'
}
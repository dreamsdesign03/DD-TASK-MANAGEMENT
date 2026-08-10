export function getISTNow() {
  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000
  return new Date(now.getTime() + istOffset)
}

export function getISTDate() {
  return getISTNow().toISOString().split('T')[0]
}

export function getISTTime() {
  const d = getISTNow()
  const h = String(d.getUTCHours()).padStart(2, '0')
  const m = String(d.getUTCMinutes()).padStart(2, '0')
  const s = String(d.getUTCSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

// Convert an epoch ms timestamp to IST time string (HH:MM:SS)
export function getISTTimeAt(ms) {
  const d = new Date(ms + 5.5 * 60 * 60 * 1000)
  const h = String(d.getUTCHours()).padStart(2, '0')
  const m = String(d.getUTCMinutes()).padStart(2, '0')
  const s = String(d.getUTCSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function getISTTimestamp() {
  return Date.now()
}

// All mutating functions are removed. State is handled by Google Sheets directly.
export function logLogin() {}
export function logLogout() {}
export function updateHeartbeat() {}
export function logShutdown() {}

export function getActiveUsers(log = []) {
  if (!log || !Array.isArray(log)) return []
  const today = getISTDate()
  const active = []
  
  log.forEach(s => {
    // Only parse strings that match today and have Login but no Logout
    if (s["Login Date and Time"] && !s["Logout Date and Time"]) {
      let loginStr = String(s["Login Date and Time"])
      if (loginStr.includes('T')) loginStr = loginStr.replace('T', ' ').substring(0, 19)
      
      if (loginStr.startsWith(today)) {
        active.push({
          email: s["Employee ID"] || "Unknown",
          name: s["Full Name"] || "Unknown",
          role: s["Role"] || "Employee"
        })
      }
    }
  })
  
  return active
}

export function getAllLoggedUsers(log = []) {
  if (!log || !Array.isArray(log)) return []
  const today = getISTDate()
  const users = []
  
  log.forEach(s => {
    if (s["Login Date and Time"]) {
      let loginStr = String(s["Login Date and Time"])
      if (loginStr.includes('T')) loginStr = loginStr.replace('T', ' ').substring(0, 19)
      
      if (loginStr.startsWith(today)) {
        users.push({
          email: s["Employee ID"] || "Unknown",
          name: s["Full Name"] || "Unknown",
          role: s["Role"] || "Employee"
        })
      }
    }
  })
  return users
}

export function getAllUsersMonthlyActivity(log = [], yearMonth) {
  if (!log || !Array.isArray(log)) return {}
  const stats = {}
  
  log.forEach(s => {
    const loginStr = s["Login Date and Time"] || ""
    if (!loginStr || !String(loginStr).startsWith(yearMonth)) return
    
    const email = s["Employee ID"] || "Unknown"
    const name = s["Full Name"] || "Unknown"
    
    if (!stats[email]) {
      stats[email] = {
        name,
        email,
        totalSessions: 0,
        totalTimeStr: '00:00',
        totalTimeMs: 0
      }
    }
    
    stats[email].totalSessions += 1
    
    if (s["Logout Date and Time"]) {
       const start = new Date(loginStr.replace(" ", "T"))
       const end = new Date(String(s["Logout Date and Time"]).replace(" ", "T"))
       if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          stats[email].totalTimeMs += Math.max(0, end.getTime() - start.getTime())
       }
    }
  })
  
  Object.values(stats).forEach(user => {
    user.totalTimeStr = formatDuration(user.totalTimeMs)
  })
  
  return stats
}

export function formatDuration(ms) {
  if (!ms || ms < 0) return '00:00:00'
  const seconds = Math.floor((ms / 1000) % 60)
  const minutes = Math.floor((ms / (1000 * 60)) % 60)
  const hours = Math.floor(ms / (1000 * 60 * 60))
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

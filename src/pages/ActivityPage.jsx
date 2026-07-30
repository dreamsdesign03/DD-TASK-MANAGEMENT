import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import TopNav from '../components/TopNav'
import { useApp } from '../context/AppContext'
import { getISTDate, getISTTime, formatDuration } from '../utils/activityLog'

function parseSheetDateTime(val) {
  if (!val) return null
  const str = String(val).trim()
  if (!str) return null
  const parts = str.split(/[ T]/)
  const datePart = parts[0]
  const timePart = parts[1] ? parts[1].split('.')[0] : '00:00:00'
  return { date: datePart, time: timePart, full: str }
}

function timeToSeconds(timeStr) {
  if (!timeStr) return 0
  const parts = timeStr.split(':')
  return parseInt(parts[0] || 0) * 3600 + parseInt(parts[1] || 0) * 60 + parseInt(parts[2] || 0)
}

function fmtDuration(seconds) {
  if (isNaN(seconds) || seconds <= 0) return '0h 0m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function fmtHMS(seconds) {
  if (isNaN(seconds) || seconds <= 0) return '00:00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}

function getISTTimeFromTs(ts) {
  const d = new Date(ts)
  const istOffset = 5.5 * 60 * 60 * 1000
  const ist = new Date(d.getTime() + istOffset)
  return [ist.getUTCHours(), ist.getUTCMinutes(), ist.getUTCSeconds()]
    .map(v => String(v).padStart(2, '0')).join(':')
}

function getISTDateFromTs(ts) {
  const d = new Date(ts)
  const istOffset = 5.5 * 60 * 60 * 1000
  const ist = new Date(d.getTime() + istOffset)
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`
}

function SessionCard({ session }) {
  const duration = Math.max(0, session.logoutSecs - session.loginSecs)
  return (
    <div className="flex items-center justify-between bg-white rounded-lg border border-slate-100 px-4 py-2.5 hover:border-[#702c91]/20 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] whitespace-nowrap">
          <span className="text-green-600 font-medium">In:</span>
          <span className="font-bold text-[#1E1B2E]">{session.loginTimeStr}</span>
        </div>
        <span className="material-symbols-outlined text-[12px] text-[#94A3B8]">arrow_forward</span>
        <div className="flex items-center gap-2 text-[12px] whitespace-nowrap">
          <span className="text-red-600 font-medium">Out:</span>
          <span className="font-bold text-[#1E1B2E]">
            {session.isStillActive ? (
              <span className="text-green-600">Active Now</span>
            ) : session.logoutTimeStr}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[12px] whitespace-nowrap bg-[#702c91]/5 rounded-md px-2.5 py-1 border border-[#702c91]/10">
          <span className="text-blue-600 font-medium">Dur:</span>
          <span className="font-bold text-[#702c91]">{fmtDuration(duration)}</span>
        </div>
      </div>
      <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
        session.isStillActive ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
      }`}>
        {session.isStillActive ? 'Active' : 'Done'}
      </span>
    </div>
  )
}

function SessionView({ sessions }) {
  return (
    <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto">
      {sessions.map((s, idx) => (
        <div key={s.id || idx} className="flex items-center gap-2 text-[12px] px-1">
          <span className="text-[10px] font-extrabold text-[#702c91] bg-purple-50 px-1.5 py-0.5 rounded min-w-[68px] text-center">
            #{idx + 1}
          </span>
          <span className="text-green-600 font-medium">In:</span>
          <span className="font-bold text-[#1E1B2E]">{s.loginTimeStr}</span>
          <span className="material-symbols-outlined text-[12px] text-[#94A3B8]">arrow_forward</span>
          <span className="text-red-600 font-medium">Out:</span>
          <span className="font-bold text-[#1E1B2E]">
            {s.isStillActive ? <span className="text-green-600">Active Now</span> : s.logoutTimeStr}
          </span>
          <span className="ml-auto font-bold text-[#702c91]">
            {fmtDuration(Math.max(0, s.logoutSecs - s.loginSecs))}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function ActivityPage() {
  const { profile, employees, fetchActivities, isPunchedIn } = useApp()

  const [nowTs, setNowTs] = useState(Date.now())
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const currentEmpId = profile?.['Employee ID'] || profile?.employeeId || profile?.id || ''
  const isAdmin = profile?.systemRole === 'Admin' || String(profile?.role || profile?.Role || '').trim().toLowerCase() === 'admin'
  const [selectedEmpId, setSelectedEmpId] = useState('')
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedExtra, setExpandedExtra] = useState(new Set())
  const extraRefs = useRef({})

  // Live timer for active session durations
  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Close expanded extras on click outside
  const handleClickOutside = useCallback((e) => {
    const target = e.target
    let shouldClose = true
    for (const key of Object.keys(extraRefs.current)) {
      if (extraRefs.current[key] && extraRefs.current[key].contains(target)) {
        shouldClose = false
        break
      }
    }
    if (shouldClose && expandedExtra.size > 0) {
      setExpandedExtra(new Set())
    }
  }, [expandedExtra])

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [handleClickOutside])

  useEffect(() => {
    if (!isAdmin) {
      if (currentEmpId) setSelectedEmpId(currentEmpId)
    } else {
      if (currentEmpId && !selectedEmpId) setSelectedEmpId(currentEmpId)
      else if (employees.length > 0 && !selectedEmpId) setSelectedEmpId(employees[0].id)
    }
  }, [isAdmin, currentEmpId, employees, selectedEmpId])

  const loadData = async () => {
    setLoading(true)
    const data = await fetchActivities()
    setActivities(data)
    setLoading(false)
  }

  // Re-fetch when punch state changes (active session may have ended)
  useEffect(() => { loadData() }, [])

  const selectedEmployee = useMemo(() => {
    if (!isAdmin) {
      return {
        id: currentEmpId,
        name: profile?.['Full Name'] || profile?.name || 'My Profile',
        role: profile?.Role || profile?.role || profile?.systemRole || '',
        department: profile?.Department || profile?.department || '',
        email: profile?.['Email Address'] || profile?.email || ''
      }
    }
    const emp = employees.find(e => String(e.id).trim() === String(selectedEmpId).trim())
    return emp || {
      id: selectedEmpId,
      name: profile?.['Full Name'] || profile?.name || '',
      role: profile?.Role || profile?.role || '',
      department: profile?.Department || profile?.department || '',
      email: profile?.['Email Address'] || profile?.email || ''
    }
  }, [isAdmin, employees, selectedEmpId, currentEmpId, profile])

  const daysInMonth = useMemo(() => new Date(selectedYear, selectedMonth, 0).getDate(), [selectedMonth, selectedYear])
  const dateRangeStr = `${selectedMonth}/1/${selectedYear} to ${selectedMonth}/${daysInMonth}/${selectedYear}`

  const handlePrevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1) }
    else setSelectedMonth(m => m - 1)
  }
  const handleNextMonth = () => {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1) }
    else setSelectedMonth(m => m + 1)
  }

  const todayDateStr = getISTDateFromTs(nowTs)
  const currentISTTimeStr = getISTTimeFromTs(nowTs)

  const dayStats = useMemo(() => {
    const stats = {}
    const targetEmpId = isAdmin ? selectedEmpId : currentEmpId
    const targetEmpName = String(selectedEmployee?.name || '').trim().toLowerCase()
    const targetEmpEmail = String(selectedEmployee?.email || '').trim().toLowerCase()

    const userActivities = activities.filter(act => {
      const actEmpId = String(act['Employee ID'] || act.employeeId || '').trim()
      if (targetEmpId && actEmpId && actEmpId === String(targetEmpId).trim()) return true

      const actName = String(act['Full Name'] || act['Name'] || act.name || '').trim().toLowerCase()
      if (targetEmpName && actName && actName === targetEmpName) return true

      const actEmail = String(act['Email Address'] || act.email || '').trim().toLowerCase()
      if (targetEmpEmail && actEmail && actEmail === targetEmpEmail) return true

      return false
    })

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const dayLogs = userActivities.filter(act => {
        const dt = parseSheetDateTime(act['Login Date and Time'])
        return dt && dt.date === dateStr
      })

      const sessions = dayLogs.map((log, idx) => {
        const loginDt = parseSheetDateTime(log['Login Date and Time'])
        const logoutDt = parseSheetDateTime(log['Logout Date and Time'])
        const loginTimeStr = loginDt ? loginDt.time : null
        let logoutTimeStr = logoutDt ? logoutDt.time : null
        let isStillActive = false

        if (!logoutTimeStr) {
          if (dateStr === todayDateStr) {
            logoutTimeStr = currentISTTimeStr
            isStillActive = true
          } else {
            logoutTimeStr = loginTimeStr
          }
        }

        return {
          id: log.id || `session_${idx}`,
          loginTimeStr,
          logoutTimeStr,
          loginSecs: timeToSeconds(loginTimeStr),
          logoutSecs: timeToSeconds(logoutTimeStr),
          isStillActive,
          status: isStillActive ? 'active' : 'logged_out'
        }
      }).filter(s => s.loginTimeStr).sort((a, b) => a.loginSecs - b.loginSecs)

      const totalSeconds = sessions.reduce((sum, s) => sum + Math.max(0, s.logoutSecs - s.loginSecs), 0)
      stats[dateStr] = { day: d, dateStr, sessions, totalSeconds }
    }
    return stats
  }, [activities, isAdmin, selectedEmpId, currentEmpId, selectedEmployee, selectedMonth, selectedYear, daysInMonth, todayDateStr, currentISTTimeStr])

  const totalMonthSeconds = useMemo(() =>
    Object.values(dayStats).reduce((sum, d) => sum + d.totalSeconds, 0),
    [dayStats]
  )

  const toggleExtra = useCallback((dateStr) => {
    setExpandedExtra(prev => {
      const next = new Set(prev)
      if (next.has(dateStr)) next.delete(dateStr)
      else {
        next.clear()
        next.add(dateStr)
      }
      return next
    })
  }, [])

  return (
    <div className="bg-[#F0EDF8] font-['Inter',sans-serif] text-[#151c27] overflow-hidden h-screen flex">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
      `}</style>
      <Sidebar />
      <main className="page-main">
        <TopNav title="Activity Tracker" showSearch={false} />
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5 pb-6">
          <div className="max-w-[1200px] mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[#702c91] text-[32px]">monitoring</span>
                <h2 className="text-[26px] font-black text-[#702c91] m-0">Punch In / Out Logs</h2>
              </div>
              <div className="flex items-center gap-3 w-full md:w-auto">
                {isAdmin && (
                  <select
                    value={selectedEmpId}
                    onChange={e => setSelectedEmpId(e.target.value)}
                    className="flex-1 md:flex-none bg-white border border-[#E5E7EB] rounded-lg px-4 py-2 text-[13px] font-bold text-[#1E1B2E] focus:border-[#702c91] outline-none md:min-w-[220px] cursor-pointer shadow-sm hover:bg-gray-50 transition-colors"
                  >
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={loadData}
                  className="flex items-center justify-center p-2 bg-white border border-[#E5E7EB] rounded-lg text-gray-500 hover:text-[#702c91] hover:border-[#702c91]/30 transition-all cursor-pointer shadow-sm shrink-0"
                  title="Refresh Logs"
                >
                  <span className={`material-symbols-outlined ${loading ? 'animate-spin' : ''}`}>sync</span>
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-2xl border border-[#E5E7EB] shadow-sm">
                <span className="material-symbols-outlined text-[48px] text-[#702c91] animate-spin mb-4">progress_activity</span>
                <p className="text-[15px] font-medium text-gray-500">Loading activity records...</p>
              </div>
            ) : (
              <div className="bg-white rounded-[20px] border border-[#E5E7EB] shadow-[0_8px_24px_rgba(91,33,182,0.08)] overflow-hidden">
                {/* Summary card */}
                <div className="px-6 py-5 border-b border-[#E5E7EB]">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <h3 className="text-[16px] font-bold text-[#1E1B2E] m-0">
                      {selectedEmployee?.name || 'Employee'} — Attendance
                    </h3>
                    <div className="flex items-center gap-3">
                      <button onClick={handlePrevMonth} className="p-1 bg-transparent border-none text-[#2563EB] hover:bg-blue-50 rounded-md cursor-pointer transition-colors flex items-center justify-center">
                        <span className="material-symbols-outlined text-[20px] font-bold">chevron_left</span>
                      </button>
                      <span className="text-[13px] font-bold text-gray-700 min-w-[150px] text-center select-none">{dateRangeStr}</span>
                      <button onClick={handleNextMonth} className="p-1 bg-transparent border-none text-[#2563EB] hover:bg-blue-50 rounded-md cursor-pointer transition-colors flex items-center justify-center">
                        <span className="material-symbols-outlined text-[20px] font-bold">chevron_right</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 mt-3 text-[13px]">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px] text-[#702c91]">work_history</span>
                      <span className="text-gray-500">Total Hours:</span>
                      <span className="font-bold text-[#1E1B2E]">{formatDuration(totalMonthSeconds)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px] text-[#702c91]">calendar_month</span>
                      <span className="text-gray-500">Days Active:</span>
                      <span className="font-bold text-[#1E1B2E]">
                        {Object.values(dayStats).filter(d => d.sessions.length > 0).length} / {daysInMonth}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="block lg:table w-full text-left border-collapse min-w-full lg:min-w-[700px]">
                    <thead className="hidden lg:table-header-group">
                      <tr className="bg-gray-50 border-b border-[#E5E7EB]">
                        <th className="py-4 px-6 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider w-[15%]">Date</th>
                        <th className="py-4 px-6 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider w-[22%]">Session #1</th>
                        <th className="py-4 px-6 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider w-[22%]">Session #2</th>
                        <th className="py-4 px-6 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider w-[22%]">Extra</th>
                        <th className="py-4 px-6 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider text-right w-[10%]">Total</th>
                        <th className="py-4 px-6 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider text-center w-[9%]"></th>
                      </tr>
                    </thead>
                    <tbody className="block lg:table-row-group divide-y lg:divide-none divide-[#E5E7EB]">
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1
                        const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                        const dateFormatted = `${String(day).padStart(2, '0')}/${String(selectedMonth).padStart(2, '0')}/${selectedYear}`
                        const stat = dayStats[dateStr] || { sessions: [], totalSeconds: 0 }
                        const hasSessions = stat.sessions.length > 0
                        const s1 = stat.sessions[0] || null
                        const s2 = stat.sessions[1] || null
                        const extraSessions = stat.sessions.length > 2 ? stat.sessions.slice(2) : []
                        const extraCount = extraSessions.length
                        const isExtraOpen = expandedExtra.has(dateStr)

                        return (
                          <React.Fragment key={day}>
                            <tr className={`block lg:table-row bg-white border-b border-[#E5E7EB] hover:bg-gray-50/50 transition-colors ${!hasSessions ? 'opacity-50' : ''}`}>
                              <td className="block lg:table-cell py-3 px-4 lg:py-5 lg:px-6 text-[13px] font-semibold text-[#374151] whitespace-nowrap">
                                <span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">Date:</span>
                                {dateFormatted}
                              </td>
                              <td className="block lg:table-cell py-2 px-4 lg:py-5 lg:px-6">
                                <span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2 block mb-1">Session #1:</span>
                                {s1 ? <SessionCard session={s1} /> : <span className="text-[#9CA3AF] text-[12px] italic">—</span>}
                              </td>
                              <td className="block lg:table-cell py-2 px-4 lg:py-5 lg:px-6">
                                <span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2 block mb-1">Session #2:</span>
                                {s2 ? <SessionCard session={s2} /> : <span className="text-[#9CA3AF] text-[12px] italic">—</span>}
                              </td>
                              <td className="block lg:table-cell py-2 px-4 lg:py-5 lg:px-6">
                                <div className="flex items-center gap-2">
                                  <span className="lg:hidden text-[10px] uppercase text-[#6B7280]">Extra:</span>
                                  {extraCount > 0 ? (
                                    <div ref={el => extraRefs.current[dateStr] = el} style={{ position: 'relative' }}>
                                      <button
                                        onClick={() => toggleExtra(dateStr)}
                                        className="text-[12px] font-bold text-[#702c91] bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg cursor-pointer transition-colors border-none flex items-center gap-1"
                                      >
                                        <span>+{extraCount} more</span>
                                        <span className={`material-symbols-outlined text-[14px] transition-transform ${isExtraOpen ? 'rotate-180' : ''}`}>
                                          expand_more
                                        </span>
                                      </button>
                                      {isExtraOpen && (
                                        <div
                                          style={{
                                            position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: 4,
                                            minWidth: 320, background: 'white',
                                            borderRadius: 12, border: '1px solid #E5E7EB',
                                            boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
                                            padding: 12
                                          }}
                                        >
                                          <div className="text-[11px] font-bold text-[#6B7280] uppercase mb-2 px-1">All Sessions</div>
                                          <SessionView sessions={stat.sessions} />
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className={`text-[12px] font-bold ${hasSessions ? 'text-gray-400' : 'text-[#9CA3AF] italic'}`}>
                                      {hasSessions ? 'No more' : 'No punches'}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="block lg:table-cell py-2 px-4 lg:py-5 lg:px-6 lg:text-right">
                                <span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">Total:</span>
                                <span className="text-[14px] font-black text-[#1E1B2E]">{fmtHMS(stat.totalSeconds)}</span>
                              </td>
                              <td className="block lg:table-cell py-2 px-4 pb-4 lg:py-5 lg:px-6 lg:text-center">
                                <span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">Status:</span>
                                {s1 ? (
                                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full ${
                                    stat.sessions.some(s => s.isStillActive)
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-blue-100 text-blue-700'
                                  }`}>
                                    <span className={`w-2 h-2 rounded-full ${stat.sessions.some(s => s.isStillActive) ? 'bg-green-500 animate-pulse' : 'bg-blue-500'}`} />
                                    {stat.sessions.some(s => s.isStillActive) ? 'Active' : 'Done'}
                                  </span>
                                ) : (
                                  <span className="text-gray-300 text-[13px]">—</span>
                                )}
                              </td>
                            </tr>
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

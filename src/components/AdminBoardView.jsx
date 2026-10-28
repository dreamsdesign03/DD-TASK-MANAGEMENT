import { useEffect, useMemo, useState } from 'react'
import { PRIORITY_STYLES, STATUS_STYLES } from '../utils/taskBadges'
import { getUserColor, getInitials } from '../utils/avatar'
import { deduplicateTasks } from '../utils/formatTaskId'
import { isSubTask, isTaskOverdue, passesMonthDoneRule } from '../utils/taskStats'
import TodayActivityBanner from './TodayActivityBanner'
import { computeMissingToday, todayIST } from '../utils/todayActivity'
import SelectDropdown from './SelectDropdown'

const COL_STYLE = {
  background: 'white',
  borderRadius: 16,
  border: '1px solid #E5E7EB',
  boxShadow: '0 8px 24px rgba(91,33,182,0.05)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

// Board fills the viewport below the sticky app header (TopNav  84px) minus 16px.
const BOARD_HEIGHT = 'calc(100vh - 100px)'

const selectBaseStyle = {
  height: 38,
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid #E5E7EB',
  background: 'white',
  fontSize: 12,
  color: '#1E1B2E',
  fontWeight: 600,
  outline: 'none',
}

function ColumnHeader({ children }) {
  return (
    <div className="px-3 py-3 border-b border-[#F3F4F6] bg-[#F9FAFB]">
      <span className="text-[11px] font-bold text-[#6B7280] tracking-[0.05em] uppercase">{children}</span>
    </div>
  )
}

export default function AdminBoardView({ tasks, searchQuery, showAllTasks, onOpenTask, activeFilter, floatingActive, refreshTasks, allEmployees, tasksLoaded }) {
  const [selectedEmployee, setSelectedEmployee] = useState('All employees')
  const [selectedClient, setSelectedClient] = useState('All Clients')
  const [selectedDepartment, setSelectedDepartment] = useState('All Departments')
  const [employeeQuery, setEmployeeQuery] = useState('')

  // IST calendar day  re-checked every minute so the day rolls over live.
  const [istDay, setIstDay] = useState(todayIST())
  useEffect(() => {
    const id = setInterval(() => setIstDay(todayIST()), 60000)
    return () => clearInterval(id)
  }, [])

  // Light background refresh fallback, active only while the Admin Board is
  // mounted. Reuses the app's existing fetchSyncedTasks (which feeds the shared
  // tasks state)  no new dependency, no separate cache. Realtime edits from
  // other users arrive via the app-wide MQTT sync; this covers focus/30s drift.
  useEffect(() => {
    if (!refreshTasks) return
    const onFocus = () => { if (document.visibilityState === 'visible') refreshTasks() }
    window.addEventListener('focus', onFocus)
    const interval = setInterval(onFocus, 30000)
    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(interval)
    }
  }, [refreshTasks])

  // Base pool: respect the page-level top filters (search + Current Month / All Tasks)
  const baseTasks = useMemo(() => {
    const query = (searchQuery || '').trim().toLowerCase()
    return deduplicateTasks(tasks || []).filter((t) => {
      if (isSubTask(t)) return false
      if (!passesMonthDoneRule(t, showAllTasks)) return false
      if (!query) return true
      return (
        (t.title || '').toLowerCase().includes(query) ||
        (t.client || '').toLowerCase().includes(query) ||
        (t.assignedTo || '').toLowerCase().includes(query) ||
        (t.assignedBy || '').toLowerCase().includes(query) ||
        (t.department || '').toLowerCase().includes(query)
      )
    })
  }, [tasks, searchQuery, showAllTasks])

  const matchesEmployee = (t, employee) =>
    (t.assignedTo || '')
      .split(',')
      .map((s) => s.trim())
      .includes(employee)

  // Top-level status pill applied on top of the base pool. Everything downstream
  // (employee counts, header stats, table rows) derives from this single pool so
  // they always stay in sync with the table.
  const statusScopedTasks = useMemo(() => {
    if (!activeFilter || activeFilter === 'All') return baseTasks
    return baseTasks.filter((t) => t.status === activeFilter)
  }, [baseTasks, activeFilter])

  // Employee roster: every employee that appears on a task in the base pool.
  // Counts come from the status-scoped pool, so an employee filtered out by the
  // active pill shows 0 (dimmed) instead of disappearing.
  const employees = useMemo(() => {
    const roster = new Set()
    for (const t of baseTasks) {
      for (const name of (t.assignedTo || '').split(',').map((s) => s.trim()).filter(Boolean)) {
        roster.add(name)
      }
    }
    const counts = new Map()
    for (const t of statusScopedTasks) {
      for (const name of (t.assignedTo || '').split(',').map((s) => s.trim()).filter(Boolean)) {
        counts.set(name, (counts.get(name) || 0) + 1)
      }
    }
    return [...roster]
      .map((name) => ({ name, count: counts.get(name) || 0 }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [baseTasks, statusScopedTasks])

  // Pool for the selected employee (feeds client/department options + table)
  const employeeScopedTasks = useMemo(() => {
    if (selectedEmployee === 'All employees') return statusScopedTasks
    return statusScopedTasks.filter((t) => matchesEmployee(t, selectedEmployee))
  }, [statusScopedTasks, selectedEmployee])

  const employeeTotal = statusScopedTasks.length

  // Client options (All Clients + list), from the employee-scoped pool
  const clientOptions = useMemo(() => {
    const names = new Set()
    for (const t of employeeScopedTasks) {
      const c = (t.client || '').trim()
      if (c && c.toLowerCase() !== 'internal' && c.toLowerCase() !== 'unknown client') names.add(c)
    }
    return ['All Clients', ...[...names].sort((a, b) => a.localeCompare(b))]
  }, [employeeScopedTasks])

  // Department options with task count per department for the current employee selection
  const departmentOptions = useMemo(() => {
    const counts = new Map()
    for (const t of employeeScopedTasks) {
      const dept = (t.department || 'COMMON').toUpperCase()
      counts.set(dept, (counts.get(dept) || 0) + 1)
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    return [
      { value: 'All Departments', label: 'All Departments' },
      ...sorted.map(([name, count]) => ({ value: name, label: `${name} (${count})` })),
    ]
  }, [employeeScopedTasks])

  // Tasks for the wide column (employee -> client + department). Status is
  // already applied in statusScopedTasks above.
  const visibleTasks = useMemo(() => {
    return employeeScopedTasks.filter((t) => {
      if (selectedClient !== 'All Clients' && (t.client || '') !== selectedClient) return false
      if (selectedDepartment !== 'All Departments' && (t.department || 'COMMON').toUpperCase() !== selectedDepartment) return false
      return true
    })
  }, [employeeScopedTasks, selectedClient, selectedDepartment])

  // Header summary (Total / Done / Overdue) derived from the exact rows the
  // table renders, so it always matches what is on screen.
  const summary = useMemo(() => {
    const done = visibleTasks.filter((t) => t.status === 'Done').length
    const overdue = visibleTasks.filter(isTaskOverdue).length
    return { total: visibleTasks.length, done, overdue }
  }, [visibleTasks])

  const filteredEmployees = employees.filter((e) => e.name.toLowerCase().includes(employeeQuery.trim().toLowerCase()))

  // Names of active employees who haven't added a task or updated a task status
  // today (IST)  drives the amber dot in the Employees list. Same derivation
  // as the top banner.
  const missingNames = useMemo(() => {
    const set = new Set(computeMissingToday(tasks, allEmployees, istDay).map((e) => e.name.toLowerCase()))
    return set
  }, [tasks, allEmployees, istDay])

  const handleSelectEmployee = (name) => {
    setSelectedEmployee(name)
    // Selecting an employee resets client and department to All
    setSelectedClient('All Clients')
    setSelectedDepartment('All Departments')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: BOARD_HEIGHT }}>
      <TodayActivityBanner
        tasks={tasks}
        employees={allEmployees}
        loaded={tasksLoaded}
        onSelectEmployee={handleSelectEmployee}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '240px minmax(0, 1fr)',
          gap: 16,
          alignItems: 'start',
          flex: 1,
          minHeight: 0,
          marginTop: 16,
        }}
        className="admin-board-grid"
      >
        <style>{`@media (max-width: 1023px) { .admin-board-grid { grid-template-columns: 1fr !important; height: auto !important; } }`}</style>

      {/* Column 1: Employees */}
      <div style={{ ...COL_STYLE, height: '100%' }}>
        <ColumnHeader>Employees</ColumnHeader>
        <div className="p-3 border-b border-[#F3F4F6]">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-[18px]">search</span>
            <input
              type="text"
              value={employeeQuery}
              onChange={(e) => setEmployeeQuery(e.target.value)}
              placeholder="Search employees..."
              className="w-full h-[36px] rounded-lg border border-[#E5E7EB] bg-white pl-8 pr-3 text-[13px] font-semibold text-[#1E1B2E] outline-none focus:border-[#702c91] transition-colors"
            />
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }} className="custom-scrollbar p-2 flex flex-col gap-0.5">
          <button
            onClick={() => handleSelectEmployee('All employees')}
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer"
            style={{
              background: selectedEmployee === 'All employees' ? '#F5F3FF' : 'transparent',
              border: 'none',
            }}
          >
            <span className="material-symbols-outlined text-[18px]" style={{ color: selectedEmployee === 'All employees' ? '#702c91' : '#9CA3AF' }}>groups</span>
            <span className="flex-1 text-[13px] font-bold truncate" style={{ color: selectedEmployee === 'All employees' ? '#702c91' : '#4B5563' }}>All employees</span>
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: selectedEmployee === 'All employees' ? '#702c91' : '#F3F4F6', color: selectedEmployee === 'All employees' ? '#fff' : '#6B7280' }}>{employeeTotal}</span>
          </button>
          {filteredEmployees.map((emp) => {
            const active = selectedEmployee === emp.name
            return (
              <button
                key={emp.name}
                onClick={() => handleSelectEmployee(emp.name)}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer"
                style={{ background: active ? '#F5F3FF' : 'transparent', border: 'none' }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#FAFAFB' }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
              >
                <div className="w-7 h-7 rounded-full text-white flex items-center justify-center text-[11px] font-bold shrink-0" style={{ backgroundColor: getUserColor(emp.name) }}>
                  {getInitials(emp.name)}
                </div>
                <span className="flex-1 text-[13px] font-semibold truncate" style={{ color: active ? '#702c91' : '#4B5563' }} title={emp.name}>
                  {emp.name}
                  {missingNames.has(emp.name.toLowerCase()) && (
                    <span
                      title="Hasn't added a task or updated a task status today"
                      style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#F59E0B', marginLeft: 6, verticalAlign: 'middle' }}
                    />
                  )}
                </span>
                <span className="text-[11px] font-bold" style={{ color: emp.count === 0 ? '#D1D5DB' : '#9CA3AF' }}>{emp.count}</span>
              </button>
            )
          })}
          {filteredEmployees.length === 0 && (
            <div className="text-center py-6 text-[12px] text-[#9CA3AF]">No employees match</div>
          )}
        </div>
      </div>

      {/* Column 2: Tasks */}
      <div style={{ ...COL_STYLE, height: '100%' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#F3F4F6] bg-[#F9FAFB]">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-[14px] font-extrabold text-[#702c91] m-0 truncate">
              Tasks {selectedEmployee}
            </h3>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#702c91] text-white shrink-0">{visibleTasks.length}</span>
            <div className="flex items-center gap-3 ml-1">
              <span className="text-[11px] font-semibold text-[#9CA3AF]">Total <b className="text-[#1E1B2E]">{summary.total}</b></span>
              <span className="text-[11px] font-semibold text-[#9CA3AF]">Done <b className="text-[#16A34A]">{summary.done}</b></span>
              <span className="text-[11px] font-semibold text-[#9CA3AF]">Overdue <b className="text-[#DC2626]">{summary.overdue}</b></span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div style={{ width: 170 }}>
              <SelectDropdown value={selectedClient} onChange={setSelectedClient} options={clientOptions} style={selectBaseStyle} />
            </div>
            <div style={{ width: 190 }}>
              <SelectDropdown value={selectedDepartment} onChange={setSelectedDepartment} options={departmentOptions} style={selectBaseStyle} />
            </div>
          </div>
        </div>

        <div
          style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
          className="custom-scrollbar"
        >
          {visibleTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
              <span className="material-symbols-outlined text-[36px] mb-2 opacity-50">inbox</span>
              <span className="text-[13px] font-semibold">No tasks for this selection</span>
            </div>
          ) : (
            <div
              className="overflow-x-auto"
            >
              <table className="w-full text-left border-collapse min-w-[660px]">
                <thead>
                  <tr className="bg-white border-b border-[#E5E7EB]">
                    {['Task Title', 'Client', 'Department', 'Assigned By', 'Due Date', 'Priority', 'Status'].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-[#6B7280] tracking-[0.05em] uppercase whitespace-nowrap" style={{ position: 'sticky', top: 0, background: 'white', zIndex: 2, paddingRight: h === 'Status' && floatingActive ? 112 : undefined }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleTasks.map((task) => {
                    const overdue = isTaskOverdue(task)
                    return (
                      <tr
                        key={task.id}
                        onClick={() => onOpenTask && onOpenTask(task)}
                        className="border-b border-[#F3F4F6] hover:bg-[#FAF5FF] transition-colors cursor-pointer"
                      >
                        <td className="px-3 py-3 max-w-[260px]">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-bold text-[#1E1B2E] truncate" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={task.title}>{task.title}</span>
                            {task.isRecurring && <span className="material-symbols-outlined text-[14px] text-primary shrink-0">event_repeat</span>}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-[12px] text-[#6B7280] whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[14px] text-[#9CA3AF]">domain</span>
                            {task.client}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-[12px] text-[#6B7280] max-w-[160px]">
                          <span className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[14px] text-[#9CA3AF]">folder_open</span>
                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={task.department || 'COMMON'}>{(task.department || 'COMMON').toUpperCase()}</span>
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {(() => {
                              const cleanName = String(task.assignedBy || '').replace(/[^\w\s-]/g, '').trim() || ''
                              return (
                                <>
                                  <div className="w-6 h-6 rounded-full text-white flex items-center justify-center text-[9px] font-bold" style={{ backgroundColor: getUserColor(cleanName) }}>{getInitials(cleanName)}</div>
                                  <span className="text-[12px] text-[#6B7280]">{cleanName}</span>
                                </>
                              )
                            })()}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`text-[12px] font-bold ${overdue ? 'text-[#DC2626]' : 'text-[#6B7280]'}`}>{task.dueDate || 'No Date'}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`${PRIORITY_STYLES[task.priority] || 'bg-gray-400 text-white'} inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider`}>{task.priority || 'Medium'}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap" style={{ paddingRight: floatingActive ? 112 : undefined }}>
                          <span className={`${STATUS_STYLES[task.status] || 'bg-gray-100 text-gray-700'} inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase`}>
                            {task.status}
                            {task.status === 'Done' && <span className="material-symbols-outlined text-[12px]">check</span>}
                          </span>
                        </td>
                      </tr>
                    )}
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  )
}
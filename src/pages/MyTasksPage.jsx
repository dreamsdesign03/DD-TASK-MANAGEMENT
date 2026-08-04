import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import TopNav from '../components/TopNav'
import TaskTable from '../components/TaskTable'
import SelectDropdown from '../components/SelectDropdown'
import { useApp } from '../context/AppContext'

export default function MyTasksPage() {
  const location = useLocation()
  const { showNewTaskModal, setShowNewTaskModal, addTask, profile, employees, tasks, clients, addToast, isPunchedIn, newTaskPrefillDept, setNewTaskPrefillDept } = useApp()
  const teamNames = employees ? employees.map(emp => emp.name) : []

  // Lock body scroll when new task modal is open
  useEffect(() => {
    if (showNewTaskModal) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [showNewTaskModal])


  // Derive company list: prefer live Clients sheet from n8n, fallback to task-derived clients
  const taskClients = tasks.map(t => t.client).filter(Boolean)
  const taskUniqueCompanies = [...new Set(taskClients)]
  // Extract active client names from the objects
  const activeClientNames = clients
    .filter(item => {
      const isActive = item['Is Active'] || item['isActive'] || item['is_active'] || item['Is active'] || item.isActive
      return String(isActive).toLowerCase() === 'yes' || isActive === true
    })
    .map(item => item['Project Name'] || item['Client Name'] || item['Company Name'] || item['Company'] || item['Name'] || '')
    .filter(Boolean)

  // Merge n8n clients + task-derived, deduplicated
  const allClients = [...new Set([...activeClientNames, ...taskUniqueCompanies])].filter(c => c && String(c).toLowerCase() !== 'internal')
  const companyList = allClients

  // Form states
  const [title, setTitle] = useState('')
  const [client, setClient] = useState(() => companyList[0] || '')
  const defaultDept = profile?.systemRole === 'HR' ? 'HR' : profile?.systemRole === 'Accountant' ? 'ACCOUNT' : profile?.systemRole === 'Sales' ? 'SALES' : 'COMMON'
  const [department, setDepartment] = useState(defaultDept)

  // Apply board-column department prefill when the modal opens
  useEffect(() => {
    if (showNewTaskModal && newTaskPrefillDept) {
      setDepartment(newTaskPrefillDept)
      setNewTaskPrefillDept('')
    }
  }, [showNewTaskModal])

  const [assignedTo, setAssignedTo] = useState([profile?.name || ''])
  const uniqueTeamMembers = [...new Set([...teamNames, ...assignedTo].filter(Boolean))]
  const [isAssigneeOpen, setIsAssigneeOpen] = useState(false)
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState('')
  const assigneeRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (assigneeRef.current && !assigneeRef.current.contains(e.target)) {
        setIsAssigneeOpen(false)
        setAssigneeSearchQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  const [assignedBy] = useState(profile?.name || '')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [description, setDescription] = useState('')
  const [remarks, setRemarks] = useState('')
  const [post, setPost] = useState('YES')

  // Recurring task states
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurringSchedule, setRecurringSchedule] = useState('Weekly')
  const [recurringDay, setRecurringDay] = useState('Monday')
  const [recurringMonths, setRecurringMonths] = useState([])
  const handleCreateTask = (e) => {
    e.preventDefault()
    if (!title.trim()) {
      addToast('Please fill out all required fields', 'error')
      return
    }

    let formattedDate = ''
    if (dueDate) {
      formattedDate = new Date(dueDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      })
    }

    let maxIdNum = 0
    tasks.forEach(t => {
      if (t.id && (!t.taskType || t.taskType === 'Main Task' || t.taskType === 'Task') && String(t.id).match(/^T-\d+$/)) {
        const match = String(t.id).match(/^T-(\d+)$/)
        if (match) {
          const num = parseInt(match[1], 10)
          if (num > maxIdNum) maxIdNum = num
        }
      }
    })
    const nextIdNum = maxIdNum > 0 ? maxIdNum + 1 : 1
    const nextIdStr = `T-${String(nextIdNum).padStart(4, '0')}`

    const assignedEmps = employees?.filter(e => assignedTo.includes(e.name)) || []

    const newTask = {
      id: nextIdStr,
      title: title.trim(),
      client: client || companyList[0] || 'General',
      project: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }),
      assigned: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' }),
      assignedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' }),
      dueDate: formattedDate,
      priority,
      status: 'Pending',
      statusUpdatedOn: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' }),
      overdue: false,
      done: false,
      department,
      assignedTo: assignedTo.join(', '),
      assignedBy,
      employeeId: assignedEmps.map(e => e.id).filter(Boolean).join(', '),
      assignedEmail: assignedEmps.map(e => e.email).filter(Boolean).join(', '),
      description: {
        intro: description.trim() || 'No description provided.',
        bullets: [],
        outro: '',
      },
      comments: [],
      attachments: [],
      remarks,
      post,
      isRecurring,
      recurringSchedule: isRecurring ? recurringSchedule : '',
      recurringDay: isRecurring && recurringSchedule === 'Weekly' ? recurringDay : '',
      recurringMonths: isRecurring && recurringSchedule === 'Monthly' ? recurringMonths.join(', ') : '',
    }

    addTask(newTask)
    setShowNewTaskModal(false)

    // Clear form
    setTitle('')
    setDescription('')
    setRemarks('')
    setPost('YES')
    setDepartment('COMMON')
    setAssignedTo([profile?.name])
    setIsRecurring(false)
    setRecurringSchedule('Weekly')
    setRecurringDay('Monday')
    setRecurringMonths([])
  }

  return (
    <div className="bg-[#F0EDF8] font-['Inter',sans-serif] text-[#151c27] overflow-hidden h-screen flex">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F8; border-radius: 10px; }
      `}</style>

      {/* Sidebar */}
      <Sidebar />

      {/* Main */}
      <main className="page-main relative">
        {/* Top nav */}
        <TopNav title={location.pathname === '/my-tasks' ? 'My Tasks' : 'All Tasks'} showSearch={true} />

        {/* Page content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-5 pb-6 animate-fade-in-up">
          <div className="w-full flex flex-col h-full">
            {!isPunchedIn ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-500 bg-white rounded-xl shadow-sm border border-gray-100 min-h-[400px]">
                <span className="material-symbols-outlined text-6xl mb-4 text-gray-300">work_off</span>
                <h2 className="text-xl font-bold mb-2">You are currently Punched Out</h2>
                <p className="text-[14px]">Please Punch In from the top navigation bar to view and manage your tasks.</p>
              </div>
            ) : (
              <TaskTable key={location.pathname} />
            )}
          </div>
        </div>


      </main>

      {/* New Task Modal — Dreamsdesk Layout style */}
      {showNewTaskModal && createPortal(
        <div className="fixed inset-0 z-[999999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateTask}
            className="bg-white w-full max-w-[520px] rounded-2xl shadow-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-hidden animate-scale-in"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 pb-4">
              <h2 className="text-[18px] font-bold text-[#702c91] m-0">Create New Task</h2>
              <button type="button" onClick={() => setShowNewTaskModal(false)} className="text-gray-400 hover:text-gray-700 transition-colors bg-transparent border-none cursor-pointer p-1 flex items-center justify-center rounded-full hover:bg-gray-100">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-5 pr-2">
              {/* Task Title */}
              <div>
                <input
                  id="task_title"
                  type="text"
                  required
                  placeholder="Task Title *"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-[14px] text-gray-800 outline-none focus:border-[#702c91] transition-colors shadow-sm placeholder:text-gray-400"
                />
              </div>

              {/* Company (Client) and Department Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1.5">COMPANY (CLIENT)</label>
                  <SelectDropdown value={client} onChange={setClient} options={companyList} />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1.5">DEPARTMENT</label>
                  <div className="relative">
                    <SelectDropdown value={department} onChange={setDepartment} options={['COMMON', 'SEO', 'SOCIAL MEDIA', 'WEBSITE', 'GRAPHIC', 'UI/UX', 'HR', 'ACCOUNT', 'AMC', 'SALES']} />
                  </div>
                </div>
              </div>

              {/* Assignee, Assigned By & Due Date */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1.5">ASSIGNEE(S)</label>
                  <div className="relative" ref={assigneeRef}>
                    <div onClick={() => setIsAssigneeOpen(!isAssigneeOpen)} className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-[14px] text-gray-700 cursor-pointer flex justify-between items-center hover:border-[#702c91] transition-colors shadow-sm">
                      <span className="truncate text-[13px]">{assignedTo.length > 0 ? assignedTo.join(', ') : 'Select'}</span>
                      <span className="material-symbols-outlined text-gray-400 text-[18px]">{isAssigneeOpen ? 'expand_less' : 'expand_more'}</span>
                    </div>
                    {isAssigneeOpen && (
                      <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden border border-gray-100 flex flex-col max-h-[220px]">
                        {/* Search Input Bar */}
                        <div className="p-2 border-b border-gray-100 bg-white sticky top-0 z-10">
                          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5">
                            <span className="material-symbols-outlined text-[16px] text-gray-400">search</span>
                            <input
                              type="text"
                              value={assigneeSearchQuery}
                              onChange={(e) => setAssigneeSearchQuery(e.target.value)}
                              placeholder="Search assignees..."
                              className="w-full bg-transparent text-[12px] font-bold text-gray-700 outline-none placeholder:text-gray-400"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                            {assigneeSearchQuery && (
                              <span
                                onClick={(e) => { e.stopPropagation(); setAssigneeSearchQuery('') }}
                                className="material-symbols-outlined text-[14px] text-gray-400 cursor-pointer hover:text-gray-600"
                              >
                                close
                              </span>
                            )}
                          </div>
                        </div>

                        {/* List */}
                        <div className="overflow-y-auto custom-scrollbar p-1 flex flex-col gap-0.5">
                          {(() => {
                            const filtered = uniqueTeamMembers.filter(m =>
                              m.toLowerCase().includes(assigneeSearchQuery.trim().toLowerCase())
                            )
                            if (filtered.length === 0) {
                              return <div className="p-3 text-[12px] text-gray-400 text-center font-semibold">No assignees match "{assigneeSearchQuery}"</div>
                            }
                            return filtered.map((m) => (
                              <label key={m} className="flex items-center gap-2 px-3 py-2 hover:bg-purple-50/60 rounded-md cursor-pointer transition-colors">
                                <input
                                  type="checkbox"
                                  checked={assignedTo.includes(m)}
                                  onChange={(e) => {
                                    if (e.target.checked) setAssignedTo([...assignedTo, m])
                                    else setAssignedTo(assignedTo.filter(name => name !== m))
                                  }}
                                  className="accent-[#702c91] w-4 h-4 cursor-pointer"
                                />
                                <span className="text-[13px] text-gray-700 font-semibold">{m}</span>
                              </label>
                            ))
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1.5">ASSIGNED BY</label>
                  <div className="relative">
                    <input type="text" readOnly value={assignedBy} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-[14px] text-gray-500 outline-none shadow-sm cursor-not-allowed" />
                    <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[18px]">lock</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1.5">DUE DATE</label>
                  <div className="relative">
                    <input type="date" value={dueDate} min={new Date().toISOString().split('T')[0]} onChange={(e) => { const val = e.target.value; if (val) { const d = new Date(val); if (d.getUTCDay() === 0) { addToast("Sundays cannot be selected as a due date.", 'error'); return } } setDueDate(val) }} className="w-full appearance-none bg-white border border-gray-200 rounded-lg pl-8 pr-2 py-2.5 text-[14px] text-gray-700 outline-none focus:border-[#702c91] transition-colors shadow-sm cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:w-full" />
                    <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[18px]">calendar_today</span>
                  </div>
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-2">PRIORITY</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['Low', 'Medium', 'High', 'Urgent'].map((p) => (
                    <button
                      type="button"
                      key={p}
                      onClick={() => setPriority(p)}
                      className={`flex-1 py-2 rounded-lg font-bold text-[13px] border transition-colors cursor-pointer ${
                        priority === p
                          ? 'btn-gradient border-transparent text-white'
                          : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#702c91]/30'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recurring Task */}
              <div className="flex items-center gap-2">
                <input type="checkbox" id="recurring" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="w-4 h-4 cursor-pointer accent-[#702c91]" />
                <label htmlFor="recurring" className="text-[14px] font-bold text-[#1E1B2E] cursor-pointer">Make this a recurring task</label>
              </div>

              {isRecurring && (
                  <div className="p-4 bg-white rounded-lg border border-[#E5E7EB] shadow-sm flex flex-col gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Schedule Type */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-extrabold text-[#6B7280] uppercase tracking-wider pl-1">
                          Recurring Schedule
                        </label>
                        <SelectDropdown
                          value={recurringSchedule}
                          onChange={(val) => {
                            setRecurringSchedule(val)
                            setRecurringDay('Monday')
                            setRecurringMonths([])
                          }}
                          options={['Weekly', 'Monthly', 'Yearly']}
                        />
                      </div>

                      {/* Dependent Fields */}
                      {recurringSchedule === 'Weekly' && (
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-extrabold text-[#6B7280] uppercase tracking-wider pl-1">
                            Day of the Week
                          </label>
                          <SelectDropdown value={recurringDay} onChange={setRecurringDay} options={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']} />
                        </div>
                      )}

                      {recurringSchedule === 'Monthly' && (
                        <div className="flex flex-col gap-1 sm:col-span-2">
                          <label className="text-[11px] font-extrabold text-[#6B7280] uppercase tracking-wider pl-1">
                            Select Months (task created on 1st of month)
                          </label>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((mon) => (
                              <label key={mon} className="flex items-center gap-1.5 bg-white border border-[#E5E7EB] px-2.5 py-1.5 rounded text-[12px] cursor-pointer hover:border-[#702c91] transition-colors">
                                <input
                                  type="checkbox"
                                  checked={recurringMonths.includes(mon)}
                                  onChange={(e) => {
                                    if (e.target.checked) setRecurringMonths([...recurringMonths, mon])
                                    else setRecurringMonths(recurringMonths.filter(m => m !== mon))
                                  }}
                                  className="accent-[#702c91]"
                                />
                                {mon}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {recurringSchedule === 'Yearly' && (
                        <div className="flex flex-col justify-center sm:col-span-2 text-[12px] text-[#6B7280] italic">
                          Task will be created automatically every January 1st.
                        </div>
                      )}
                    </div>
                    <div className="text-[11px] text-[#702c91] font-bold flex items-center gap-1 bg-[#F5F3FF] p-2 rounded">
                      <span className="material-symbols-outlined text-[14px]">info</span>
                      If the creation date falls on a Sunday, the task will be shifted to Monday.
                    </div>
                  </div>
                )}

              {/* Description */}
              <div>
                <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1.5 mt-2">TASK DESCRIPTION</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg p-3 text-[14px] text-gray-800 outline-none focus:border-[#702c91] transition-colors shadow-sm min-h-[100px] resize-none" placeholder="Details about the task..."></textarea>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1.5 mt-2">REMARKS</label>
                <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-[14px] text-gray-800 outline-none focus:border-[#702c91] transition-colors shadow-sm" placeholder="Any remarks..." />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-gray-200">
              <button type="button" onClick={() => setShowNewTaskModal(false)} className="px-6 py-2 border border-[#702c91] text-[#702c91] bg-white rounded-lg font-bold hover:bg-purple-50 transition-all text-[13px] cursor-pointer">Cancel</button>
              <button type="submit" disabled={!title.trim()} className={`px-6 py-2 btn-gradient border-none rounded-lg font-bold shadow-md text-[13px] cursor-pointer ${!title.trim() ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}>Create Task</button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </div>
  )
}



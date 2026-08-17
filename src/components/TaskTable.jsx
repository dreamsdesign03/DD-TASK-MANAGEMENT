/* eslint-disable no-unused-vars */
/* eslint-disable no-empty */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/refs */
import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getUserColor, getInitials } from '../utils/avatar'
import { computeRecurringDueDate } from '../utils/dateFormat'
import TaskCalendar from './TaskCalendar'
import VoiceBot from './VoiceBot'
import SelectDropdown from './SelectDropdown'
import { api } from '../api'

const PRIORITY_STYLES = {
  Urgent: 'bg-[#E74C3C] text-white',
  High: 'bg-[#F39C12] text-white',
  Medium: 'bg-[#3498DB] text-white',
  Low: 'bg-[#95A5A6] text-white',
}

const PRIORITY_WEIGHTS = {
  Urgent: 4,
  High: 3,
  Medium: 2,
  Low: 1,
}

/* ─── Status badge config ───────────────────────────────────────────────── */
const STATUS_STYLES = {
  Blocked: 'bg-red-100 text-red-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  Review: 'bg-blue-100 text-blue-700',
  Done: 'bg-green-100 text-green-700',
  Pending: 'bg-gray-100 text-gray-700',
}

const STATUS_CONFIG = {
  'Pending': { bg: '#F3F4F6', color: '#4B5563' },
  'In Progress': { bg: '#FEF3C7', color: '#D97706' },
  'Review': { bg: '#EFF6FF', color: '#2563EB' },
  'Done': { bg: '#F0FDF4', color: '#16A34A' },
  'Blocked': { bg: '#FEF2F2', color: '#DC2626' },
}

const STATUS_ICON = {
  Done: 'check',
}

/* ─── Filter tabs ───────────────────────────────────────────────────────── */
const FILTERS = ['All', 'Pending', 'In Progress', 'Review', 'Done', 'Blocked']

function InlineStatusSelect({ value, onChange, disabled }) {
  const [open, setOpen] = React.useState(false)
  const [rect, setRect] = React.useState(null)
  const [up, setUp] = React.useState(false)
  const ref = React.useRef(null)
  const menuRef = React.useRef(null)
  const MENU_H = 200

  React.useEffect(() => {
    const handler = (e) => { 
      if (ref.current && ref.current.contains(e.target)) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false) 
    }
    const scrollHandler = () => setOpen(false);

    document.addEventListener('mousedown', handler)
    window.addEventListener('scroll', scrollHandler, true)
    window.addEventListener('resize', scrollHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('scroll', scrollHandler, true)
      window.removeEventListener('resize', scrollHandler)
    }
  }, [])

  const handleOpen = () => {
    if (!disabled) {
      if (!open && ref.current) {
        const r = ref.current.getBoundingClientRect()
        setRect(r)
        setUp(r.bottom + 6 + MENU_H > window.innerHeight)
      }
      setOpen(o => !o)
    }
  }

  const cfg = STATUS_CONFIG[value] || STATUS_CONFIG['Pending']
  return (
    <div ref={ref} style={{ position: 'relative', width: 130 }} onClick={e => e.stopPropagation()}>
      <div
        onClick={handleOpen}
        style={{
          padding: '6px 10px 6px 14px', borderRadius: 999,
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: cfg.bg, color: cfg.color,
          fontSize: 12, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          border: `1px solid ${open ? cfg.color : 'transparent'}`,
          opacity: disabled ? 0.5 : 1,
          transition: 'all 0.2s', userSelect: 'none',
          boxShadow: open ? `0 0 0 3px ${cfg.color}22` : 'none',
        }}
        onMouseEnter={e => { if (!open && !disabled) e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.boxShadow = open ? `0 0 0 3px ${cfg.color}22` : 'none' }}
        title={disabled ? 'Only assigned users, admins, or managers can update status' : ''}
      >
        <span>{value}</span>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{open ? 'expand_less' : 'expand_more'}</span>
      </div>
      {open && rect && createPortal(
        <div ref={menuRef} className={up ? 'animate-fade-in-down' : 'animate-fade-in-up'} style={{
          position: 'fixed', left: rect.left, width: rect.width,
          [up ? 'bottom' : 'top']: up ? window.innerHeight - rect.top + 6 : rect.bottom + 6,
          background: 'white', borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          border: '1px solid #F3F4F6', zIndex: 999999,
          display: 'flex', flexDirection: 'column', padding: 6, gap: 2,
        }}>
          {Object.entries(STATUS_CONFIG).map(([status, style]) => (
            <div
              key={status}
              onClick={() => { onChange(status); setOpen(false) }}
              style={{
                padding: '8px 10px', fontSize: 12, fontWeight: 700,
                color: status === value ? style.color : '#4B5563',
                background: status === value ? style.bg : 'transparent',
                borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
              onMouseEnter={e => { if (status !== value) { e.currentTarget.style.background = style.bg; e.currentTarget.style.color = style.color } }}
              onMouseLeave={e => { if (status !== value) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#4B5563' } }}
            >
              {status}
              {status === value && <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span>}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}



export default function TaskTable() {
  const { tasks, searchQuery, deleteTask, profile, employees, messagesByChatId, lastSeenTimestamps, updateTask, addTask, addToast, setShowNewTaskModal, setNewTaskPrefillDept, clients } = useApp()
  const location = useLocation()
  const [activeFilter, setActiveFilter] = useState('All')
  const [sortBy, setSortBy] = useState('Task ID (Descending)')
  const [selectedClient, setSelectedClient] = useState(location.state?.clientFilter || 'All Clients')
  const [selectedUser, setSelectedUser] = useState(location.pathname === '/my-tasks' ? (profile?.name || 'All Users') : 'All Users')
  const [selectedDepartment, setSelectedDepartment] = useState('All Departments')

  const [viewMode, setViewMode] = useState(location.state?.viewMode || 'List') // 'List' | 'Board'
  const [boardGrouping, setBoardGrouping] = useState('Department')

  useEffect(() => {
    if (location.pathname === '/my-tasks') {
      setSelectedUser(profile?.name || 'All Users')
    } else {
      setSelectedUser('All Users')
    }
  }, [location.pathname, profile?.name])

  // Reset department filter if current selection is hidden by role
  useEffect(() => {
    const role = profile?.systemRole || 'Employee'
    const hidden = role === 'Admin' ? [] : role === 'HR' ? ['ACCOUNT', 'SALES'] : role === 'Accountant' ? ['HR', 'SALES'] : role === 'Sales' ? ['HR', 'ACCOUNT'] : ['HR', 'ACCOUNT', 'SALES']
    if (hidden.includes(selectedDepartment)) {
      setSelectedDepartment('All Departments')
    }
  }, [profile?.systemRole, selectedDepartment])

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const [tasksPerPage, setTasksPerPage] = useState(10)
  const [taskToDelete, setTaskToDelete] = useState(null)

  // Unauthorized Access Modal
  const [unauthorizedTaskTitle, setUnauthorizedTaskTitle] = useState(null)

  // Recurring Task Modal State
  const [recurringTaskObj, setRecurringTaskObj] = useState(null)
  const [recurringSchedule, setRecurringSchedule] = useState('Weekly')
  const [recurringDay, setRecurringDay] = useState('Monday')
  const [recurringMonths, setRecurringMonths] = useState([])
  const [isRecurringSubmitting, setIsRecurringSubmitting] = useState(false)

  // Lock body scroll when modal is active to prevent background scrolling
  useEffect(() => {
    if (taskToDelete || recurringTaskObj || unauthorizedTaskTitle) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [taskToDelete, recurringTaskObj, unauthorizedTaskTitle])

  const canAccessTask = (task) => {
    if (!profile) return false;
    if (profile.systemRole === 'Admin') return true;

    const role = profile.systemRole || 'Employee';
    const dept = (task.department || '').toUpperCase();
    const isRestricted = ['HR', 'ACCOUNT', 'SALES'].includes(dept);

    if (isRestricted) {
      if (role === 'HR' && dept === 'HR') return true;
      if (role === 'Accountant' && dept === 'ACCOUNT') return true;
      if (role === 'Sales' && dept === 'SALES') return true;
    } else if (role !== 'Employee') {
      return true;
    }

    const normalizeName = (name) => {
      if (!name) return '';
      return String(name).toLowerCase().replace(/[^\w]/g, '').trim();
    };
    const myName = normalizeName(profile.name);
    const myEmail = String(profile.email || '').trim().toLowerCase();
    if (!myName && !myEmail) return false;
    const assignees = (task.assignedTo || '').split(',').map(normalizeName).filter(Boolean);
    const assigneeEmails = (task.assignedEmail || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    
    let hasAccess = false;
    if (assignees.includes(myName)) {
      if (assigneeEmails.length > 0 && myEmail) {
        hasAccess = assigneeEmails.includes(myEmail);
      } else {
        hasAccess = true;
      }
    } else if (myEmail && assigneeEmails.includes(myEmail)) {
      hasAccess = true;
    }
    
    return hasAccess;
  }

  const handleMakeRecurring = async (e) => {
    e.preventDefault()
    if (!recurringTaskObj) return
    setIsRecurringSubmitting(true)
    try {
      await updateTask(recurringTaskObj.id, {
        isRecurring: true,
        recurringSchedule,
        recurringDay: recurringSchedule === 'Weekly' ? recurringDay : '',
        recurringMonths: recurringSchedule === 'Monthly' ? recurringMonths.join(', ') : '',
        dueDate: computeRecurringDueDate(recurringSchedule, recurringDay, recurringMonths)
      })
      addToast('Task successfully set as recurring!', 'success')
      setRecurringTaskObj(null)
    } catch (err) {
      addToast('Failed to set task as recurring', 'error')
    } finally {
      setIsRecurringSubmitting(false)
    }
  }
  const navigate = useNavigate()

  // Hand Scrolling State
  const boardRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  // Quick Add State
  const [quickAddCol, setQuickAddCol] = useState(null)
  const [quickAddTitle, setQuickAddTitle] = useState('')
  const [quickAddClient, setQuickAddClient] = useState('')
  const [quickAddAssignee, setQuickAddAssignee] = useState([])
  const [quickAddDueDate, setQuickAddDueDate] = useState('')
  const [quickAddPriority, setQuickAddPriority] = useState('')

  // Department File Upload State
  const fileInputRef = useRef(null)
  const [uploadDept, setUploadDept] = useState(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleDeptUploadClick = (e, dept) => {
    e.stopPropagation()
    if (!selectedClient || selectedClient === 'All Clients') {
      addToast('Please select a client before uploading files', 'error')
      return
    }
    setUploadDept(dept)
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleDeptFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !uploadDept) return

    setIsUploading(true)
    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const currentClient = selectedClient

      const data = await api.post({
        action: 'upload_task_file',
        filename: file.name,
        mimeType: file.type,
        base64: base64Data.split(',')[1],
        sizeBytes: file.size,
        projectName: currentClient,
        department: uploadDept,
        userEmail: profile?.email || ''
      })

      if (data.ok) {
        addToast('File uploaded to the ' + uploadDept + ' folder in Drive!', 'success')
      } else {
        throw new Error(data.error || 'Upload failed')
      }
    } catch (error) {
      console.error('File upload error:', error)
      addToast('Failed to upload file: ' + error.message, 'error')
    } finally {
      setIsUploading(false)
      setUploadDept(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, activeFilter, selectedClient, selectedUser, selectedDepartment, sortBy, tasksPerPage])

  // Extract unique clients
  const uniqueClients = ['All Clients', ...new Set(tasks.map((t) => t.client).filter(c => c && c.toLowerCase() !== 'internal' && c.toLowerCase() !== 'unknown client'))]

  // All known project names for the Quick Add client selector
  const allClientOptions = [...new Set([
    ...(clients || []).map(c => c['Project Name'] || c.projectName || c.project || '').filter(Boolean),
    ...uniqueClients.filter(c => c !== 'All Clients')
  ])]

  // Quick Add client reset helper
  const resetQuickAdd = () => {
    setQuickAddCol(null)
    setQuickAddTitle('')
    setQuickAddClient('')
    setQuickAddAssignee([])
    setQuickAddDueDate('')
    setQuickAddPriority('')
  }

  // Extract unique users
  const uniqueUsers = ['All Users', ...new Set(tasks.flatMap((t) => (t.assignedTo || '').split(',').map(s => s.trim()).filter(Boolean)))]

  // Extract unique departments
  const allDepts = ['All Departments', 'COMMON', 'SOCIAL MEDIA', 'WEBSITE', 'SEO', 'GRAPHIC', 'HR', 'ACCOUNT', 'AMC', 'SALES', 'APPLICATION', ...new Set(tasks.map(t => (t.department || 'COMMON').toUpperCase()))]
  const role = profile?.systemRole || 'Employee'
  const hiddenDepts = role === 'Admin' ? [] : role === 'HR' ? ['ACCOUNT', 'SALES'] : role === 'Accountant' ? ['HR', 'SALES'] : role === 'Sales' ? ['HR', 'ACCOUNT'] : ['HR', 'ACCOUNT', 'SALES']
  const uniqueDepartments = allDepts.filter(d => !hiddenDepts.includes(d))
  const deduplicatedDepartments = [...new Set(uniqueDepartments)]

  // 1. Filter tasks
  const filtered = tasks
    .filter((t) => {
      // Exclude Sub Tasks from main table view
      if (t.taskType === 'Sub Task' || t.taskType === 'Subtask') return false;

      const matchesStatus = activeFilter === 'All' || t.status === activeFilter
      const matchesClient = selectedClient === 'All Clients' || t.client === selectedClient
      let matchesUser = selectedUser === 'All Users' || (t.assignedTo || '').includes(selectedUser)
      
      // Strict disambiguation: If looking specifically at my tasks, ensure my exact email is assigned (if emails exist on task)
      if (matchesUser && selectedUser !== 'All Users' && selectedUser === profile?.name && profile?.email) {
        const taskEmails = (t.assignedEmail || '').trim().toLowerCase()
        if (taskEmails) {
          matchesUser = taskEmails.includes(profile.email.toLowerCase())
        }
      }

      const matchesDepartment = selectedDepartment === 'All Departments' || (t.department || 'COMMON').toUpperCase() === selectedDepartment

      const query = searchQuery.toLowerCase()
      const matchesSearch =
        t.title.toLowerCase().includes(query) ||
        t.client.toLowerCase().includes(query) ||
        t.id.toLowerCase().includes(query) ||
        (t.assignedTo || '').toLowerCase().includes(query)

      return matchesStatus && matchesSearch && matchesClient && matchesUser && matchesDepartment
    })
    // 2. Sort tasks
    .sort((a, b) => {
      if (sortBy === 'Task ID (Descending)') {
        const numA = parseInt(a.id.replace(/\D/g, '')) || 0
        const numB = parseInt(b.id.replace(/\D/g, '')) || 0
        return numB - numA
      }
      if (sortBy === 'Task ID (Ascending)') {
        const numA = parseInt(a.id.replace(/\D/g, '')) || 0
        const numB = parseInt(b.id.replace(/\D/g, '')) || 0
        return numA - numB
      }
      if (sortBy === 'Due Date') {
        return new Date(a.dueDate) - new Date(b.dueDate)
      }
      if (sortBy === 'Priority') {
        return (PRIORITY_WEIGHTS[b.priority] || 0) - (PRIORITY_WEIGHTS[a.priority] || 0)
      }
      if (sortBy === 'Status') {
        return a.status.localeCompare(b.status)
      }
      if (sortBy === 'Task Title') {
        return a.title.localeCompare(b.title)
      }
      return 0
    })

  // Hand Scrolling Handlers
  const handleMouseDown = (e) => {
    if (e.target.closest('.task-card') || e.target.closest('button') || e.target.closest('input')) return
    setIsDragging(true)
    setStartX(e.pageX - boardRef.current.offsetLeft)
    setScrollLeft(boardRef.current.scrollLeft)
  }

  const handleMouseLeave = () => setIsDragging(false)
  const handleMouseUp = () => setIsDragging(false)

  const handleMouseMove = (e) => {
    if (!isDragging) return
    e.preventDefault()
    const x = e.pageX - boardRef.current.offsetLeft
    const walk = (x - startX) * 2 // Scroll speed multiplier
    boardRef.current.scrollLeft = scrollLeft - walk
  }

  // Drag and Drop Handlers
  const handleDragStart = (e, taskId) => {
    e.dataTransfer.setData('taskId', taskId)
    e.dataTransfer.effectAllowed = 'move'
    setTimeout(() => { e.target.style.opacity = '0.5' }, 0)
  }

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1'
  }

  const handleDragOver = (e) => {
    e.preventDefault() // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e, colName) => {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('taskId')
    if (!taskId) return

    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    if (!canAccessTask(task)) {
      addToast('Only assigned users, admins, or managers can update status of this task.', 'error');
      return;
    }

    if (boardGrouping === 'Process Stage') {
      if (task.status !== colName) {
        updateTask(taskId, { status: colName })
        if (colName === 'Done') {
          const due = new Date(task.dueDate)
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          if (!task.dueDate || today <= due) {
            import('canvas-confetti').then((confetti) => {
              confetti.default({ particleCount: 150, spread: 70, origin: { y: 0.6 } })
            })
          }
        }
      }
    } else {
      if (colName === 'COMPLETE') {
        if (task.status !== 'Done') {
          updateTask(taskId, { status: 'Done', department: task.department || 'COMMON' })

          // Celebration Effect Check
          const due = new Date(task.dueDate)
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          if (!task.dueDate || today <= due) {
            import('canvas-confetti').then((confetti) => {
              confetti.default({ particleCount: 150, spread: 70, origin: { y: 0.6 } })
            })
          }
        }
      } else {
        if (task.department !== colName || task.status === 'Done') {
          updateTask(taskId, { department: colName, status: task.status === 'Done' ? 'Pending' : task.status })
        }
      }
    }
  }

  // Quick Add Handler
  const handleQuickAdd = (department) => {
    if (!quickAddTitle.trim()) {
      addToast('Please enter a task name', 'error')
      return
    }
    if (!quickAddClient) {
      addToast('Please select a project/client', 'error')
      return
    }
    if (quickAddAssignee.length === 0) {
      addToast('Please add at least one assignee', 'error')
      return
    }
    if (!quickAddPriority) {
      addToast('Please select a priority', 'error')
      return
    }

    let maxIdNum = 0
    tasks.forEach((t) => {
      if (t.id && (!t.taskType || t.taskType === 'Main Task' || t.taskType === 'Task') && String(t.id).match(/^T-\d+$/)) {
        const match = String(t.id).match(/^T-(\d+)$/)
        if (match) {
          const num = parseInt(match[1], 10)
          if (num > maxIdNum) maxIdNum = num
        }
      }
    })
    const nextIdNum = maxIdNum > 0 ? maxIdNum + 1 : 1
    // Timestamp suffix keeps IDs unique even when two users create a task at the same time
    const nextIdStr = `T-${String(nextIdNum).padStart(4, '0')}${Date.now().toString().slice(-6)}`

    const isComplete = boardGrouping === 'Department' && department === 'COMPLETE'
    const newDept = boardGrouping === 'Process Stage' ? 'COMMON' : (isComplete ? 'COMMON' : department)
    const initialStatus = boardGrouping === 'Process Stage' ? department : (isComplete ? 'Done' : 'Pending')

    const assignedEmps = employees?.filter(e => quickAddAssignee.includes(e.name)) || []
    const finalAssignees = quickAddAssignee.length > 0 ? quickAddAssignee : (profile?.name ? [profile?.name] : [])
    const quickAddAssigneeIds = assignedEmps.length > 0 ? assignedEmps.map(e => e.id).join(', ') : (profile?.employeeId || profile?.id || '')
    const quickAddAssigneeEmails = assignedEmps.length > 0 ? assignedEmps.map(e => e.email).join(', ') : (profile?.email || '')

    const newTask = {
      id: nextIdStr,
      title: quickAddTitle.trim(),
      client: quickAddClient || (selectedClient !== 'All Clients' ? selectedClient : (tasks[0]?.client || '')),
      project: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }),
      assigned: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' }),
      assignedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' }),
      dueDate: quickAddDueDate || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0], // 1 week default
      priority: quickAddPriority,
      status: initialStatus,
      statusUpdatedOn: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' }),
      department: newDept,
      assignedTo: finalAssignees.join(', '),
      assignedToIds: quickAddAssigneeIds,
      assignedBy: profile?.name || '',
      assignedById: profile?.employeeId || profile?.id || '',
      employeeIds: quickAddAssigneeIds,
      employeeId: quickAddAssigneeIds,
      assignedEmails: quickAddAssigneeEmails,
      assignedEmail: quickAddAssigneeEmails,
      description: { intro: 'No description provided.', bullets: [], outro: '' },
      comments: [],
      attachments: [],
      remarks: '',
      post: 'YES'
    }

    if (addTask) {
      addTask(newTask)
    }
    resetQuickAdd()
  }

  // Pagination Logic
  const totalPages = Math.ceil(filtered.length / tasksPerPage)
  const indexOfLastTask = currentPage * tasksPerPage
  const indexOfFirstTask = indexOfLastTask - tasksPerPage
  const currentTasks = filtered.slice(indexOfFirstTask, indexOfLastTask)

  // Metrics Logic
  const baseTasksForStats = tasks.filter((t) => {
    if (t.taskType === 'Sub Task' || t.taskType === 'Subtask') return false;
    const matchesClient = selectedClient === 'All Clients' || t.client === selectedClient;
    const matchesUser = selectedUser === 'All Users' || (t.assignedTo || '').includes(selectedUser);
    const matchesDepartment = selectedDepartment === 'All Departments' || (t.department || 'COMMON').toUpperCase() === selectedDepartment;
    return matchesClient && matchesUser && matchesDepartment;
  });

  const totalTasks = baseTasksForStats.length;
  const inProgressTasks = baseTasksForStats.filter(t => t.status === 'In Progress').length;
  const completedTasks = baseTasksForStats.filter(t => t.status === 'Done').length;
  const overdueTasks = baseTasksForStats.filter(t => {
    if (t.status === 'Done' || !t.dueDate) return false;
    const due = new Date(t.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today;
  }).length;



  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleDeptFileUpload}
      />
      {/* â”€â”€ Filter bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {/* ─── Summary Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Total Tasks', value: totalTasks, icon: 'layers', bg: '#F5F3FF', color: '#702c91' },
          { label: 'In Progress', value: inProgressTasks, icon: 'schedule', bg: '#EFF6FF', color: '#2563EB' },
          { label: 'Completed', value: completedTasks, icon: 'task_alt', bg: '#F0FDF4', color: '#16A34A' },
          { label: 'Overdue', value: overdueTasks, icon: 'error', bg: '#FEF2F2', color: '#DC2626', overdue: true },
        ].map(s => (
          <div key={s.label} style={{
            background: 'white', borderRadius: 20, padding: '20px 20px',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            border: `1px solid ${s.color}40`,
            boxShadow: '0 8px 24px rgba(91,33,182,0.05)',
            transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
            cursor: 'pointer'
          }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = `0 12px 28px rgba(91,33,182,0.1)`;
              e.currentTarget.style.borderColor = `${s.color}80`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(91,33,182,0.05)';
              e.currentTarget.style.borderColor = `${s.color}40`;
            }}
          >
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</p>
              <h2 style={{ fontSize: 28, fontWeight: 800, color: s.overdue ? '#DC2626' : '#1E1B2E', margin: 0 }}>{String(s.value).padStart(2, '0')}</h2>
            </div>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ color: s.color, fontSize: 22 }}>{s.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Filter bar ───────────────────────────────────────────────────────── */}
      {/* FILTERS + VIEW TOGGLE */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
        <div className="flex flex-wrap gap-2 md:gap-3">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setActiveFilter(f)} className={`px-4 md:px-6 py-2 rounded-full text-[13px] md:text-sm font-semibold transition-all ${f === activeFilter ? 'text-white' : 'bg-white text-gray-600 border border-gray-100 hover:border-gray-200'}`} style={{
              background: f === activeFilter ? 'linear-gradient(to right, #702c91 0%, #ec008c 50%, #702c91 100%)' : 'white',
              backgroundSize: f === activeFilter ? '200% auto' : 'auto',
              backgroundPosition: 'left center',
              boxShadow: f === activeFilter ? '0 4px 12px rgba(91,33,182,0.3)' : '0 2px 8px rgba(0,0,0,0.04)',
              fontFamily: 'Inter,sans-serif',
            }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = f === activeFilter ? '0 6px 16px rgba(91,33,182,0.4)' : '0 6px 16px rgba(0,0,0,0.08)';
                if (f === activeFilter) {
                  e.currentTarget.style.backgroundPosition = 'right center';
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = f === activeFilter ? '0 4px 12px rgba(91,33,182,0.3)' : '0 2px 8px rgba(0,0,0,0.04)';
                if (f === activeFilter) {
                  e.currentTarget.style.backgroundPosition = 'left center';
                }
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between md:justify-end gap-3 md:gap-4 w-full md:w-auto mt-2 md:mt-0">
          <div className="flex gap-1 md:gap-2 bg-white rounded-full p-1 shadow-[0_2px_8px_rgba(0,0,0,0.06)] border border-gray-50">
            <button onClick={() => setViewMode('List')} className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-colors ${viewMode === 'List' ? 'bg-[#F9F4FB] text-[#702c91]' : 'bg-transparent text-gray-400 hover:text-gray-600'}`}>
              <span className="material-symbols-outlined text-[20px]">view_list</span>
            </button>
            <button onClick={() => setViewMode('Board')} className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-colors ${viewMode === 'Board' ? 'bg-[#F9F4FB] text-[#702c91]' : 'bg-transparent text-gray-400 hover:text-gray-600'}`}>
              <span className="material-symbols-outlined text-[20px]">dashboard</span>
            </button>
            <button onClick={() => setViewMode('Calendar')} className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-colors ${viewMode === 'Calendar' ? 'bg-[#F9F4FB] text-[#702c91]' : 'bg-transparent text-gray-400 hover:text-gray-600'}`}>
              <span className="material-symbols-outlined text-[20px]">calendar_month</span>
            </button>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <button
              onClick={() => {
                if (selectedClient === 'All Clients') {
                  addToast('Please select the client from the filter first.', 'error')
                } else {
                  navigate(`/projects/${encodeURIComponent(selectedClient)}`)
                }
              }}
              className="w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center bg-[#F9F4FB] text-[#702c91] shadow-sm hover:bg-[#702c91] hover:text-white transition-all"
              title="Open Overview"
            >
              <span className="material-symbols-outlined text-[20px]">open_in_new</span>
            </button>
            <VoiceBot onTaskAdd={async (params) => {
              await addTask(params)
              addToast('Task added via VoiceBot!', 'success')
            }} />
            <div
              onMouseEnter={e => {
                e.currentTarget.style.maxWidth = '300px';
                e.currentTarget.style.gap = '8px';
                e.currentTarget.style.padding = '0 20px 0 14px';
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(112,44,145,0.35)';
                const text = e.currentTarget.querySelector('.add-task-text');
                if (text) { text.style.maxWidth = '120px'; text.style.width = 'auto'; text.style.opacity = '1'; }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.maxWidth = '44px';
                e.currentTarget.style.gap = '0';
                e.currentTarget.style.padding = '0';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(91,33,182,0.06)';
                const text = e.currentTarget.querySelector('.add-task-text');
                if (text) { text.style.maxWidth = '0'; text.style.width = '0'; text.style.opacity = '0'; }
              }}
              onClick={() => setShowNewTaskModal(true)}
              className="rounded-full flex items-center justify-center text-white cursor-pointer shadow-sm overflow-hidden whitespace-nowrap"
              style={{
                height: 44,
                width: 'auto',
                minWidth: 44,
                maxWidth: 44,
                background: 'linear-gradient(to right, #702c91, #ec008c)',
                boxShadow: '0 2px 8px rgba(91,33,182,0.06)',
                fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 700, gap: 0,
                transition: 'max-width 0.35s ease-out, padding 0.35s ease-out, gap 0.35s ease-out, box-shadow 0.3s ease-out',
              }}
              title="Add Task"
            >
              <span className="material-symbols-outlined shrink-0 text-[20px]">add</span>
              <span className="add-task-text opacity-0 w-0 max-w-0 overflow-hidden whitespace-nowrap" style={{ transition: 'max-width 0.35s ease-out, opacity 0.2s ease-out' }}>Add Task</span>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div
        className="animate-fade-in-up"
        style={
          viewMode === 'List'
            ? { background: 'white', borderRadius: 20, boxShadow: '0 8px 24px rgba(91,33,182,0.08)', overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0 }
            : { display: 'flex', flexDirection: 'column', flexShrink: 0 }
        }>
        {/* ADVANCED FILTER BAR */}
        {/* ADVANCED FILTER BAR */}
        <div className={`p-4 md:p-6 grid grid-cols-2 md:flex md:items-end gap-3 md:gap-4 ${viewMode === 'List' ? 'bg-[#F8F9FA] border-b border-[#F5F3FF]' : 'bg-white rounded-[20px] shadow-[0_8px_24px_rgba(91,33,182,0.08)]'}`}>
          {(() => {
            const selectBaseStyle = {
              padding: '10px 16px', borderRadius: 12, border: '1px solid #E5E7EB',
              background: 'white',
              fontSize: 13, color: '#1E1B2E', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', outline: 'none',
              width: '100%'
            };
            return (
              <React.Fragment>
                <div className="col-span-2 flex flex-col gap-1.5 md:w-[160px]">
                  <label className="text-[10px] md:text-[11px] font-bold text-[#6B7280] uppercase">Filter by Client</label>
                  <SelectDropdown
                    value={selectedClient} onChange={setSelectedClient}
                    options={uniqueClients}
                    style={{ ...selectBaseStyle }}
                  />
                </div>
                <div className="flex flex-col gap-1.5 md:w-[160px]">
                  <label className="text-[10px] md:text-[11px] font-bold text-[#6B7280] uppercase">Filter by User</label>
                  <SelectDropdown
                    value={selectedUser} onChange={setSelectedUser}
                    options={uniqueUsers}
                    style={{ ...selectBaseStyle }}
                  />
                </div>
                <div className="flex flex-col gap-1.5 md:w-[160px]">
                  <label className="text-[10px] md:text-[11px] font-bold text-[#6B7280] uppercase">Filter by Dept</label>
                  <SelectDropdown
                    value={selectedDepartment} onChange={setSelectedDepartment}
                    options={deduplicatedDepartments}
                    style={{ ...selectBaseStyle }}
                  />
                </div>

                {viewMode === 'Board' && (
                  <div className="col-span-2 sm:col-span-1 flex flex-col gap-1.5 md:w-[160px]">
                    <label className="text-[10px] md:text-[11px] font-bold text-[#6B7280] uppercase">Board Grouping</label>
                    <SelectDropdown
                      value={boardGrouping}
                      onChange={setBoardGrouping}
                      options={['Department', 'Process Stage']}
                      style={{ ...selectBaseStyle }}
                    />
                  </div>
                )}

                <div className={`flex flex-col gap-1.5 md:w-[230px] ${viewMode === 'Board' ? 'col-span-2 sm:col-span-1' : 'col-span-2'} md:ml-auto`}>
                  <label className="text-[10px] md:text-[11px] font-bold text-[#6B7280] uppercase">Sort Order</label>
                  <SelectDropdown
                    value={`Sort by: ${sortBy}`}
                    onChange={val => setSortBy(val.replace('Sort by: ', ''))}
                    options={[
                      'Sort by: Task ID (Descending)',
                      'Sort by: Task ID (Ascending)',
                      'Sort by: Due Date',
                      'Sort by: Priority',
                      'Sort by: Status',
                      'Sort by: Task Title'
                    ]}
                    style={{ ...selectBaseStyle }}
                  />
                </div>
              </React.Fragment>
            );
          })()}
        </div>

        {/* ──────────────────────────────────────────────────────────── */}
        {viewMode === 'List' ? (
          <div className="hide-scrollbar" style={{ overflowX: 'auto', flex: 1, marginTop: 24 }}>
            <div className="overflow-hidden w-full">
              <table className="block md:table w-full text-left border-collapse">
                <thead className="hidden md:table-header-group bg-[#F9FAFB] border-b border-[#E5E7EB]">
                  <tr>
                    {['Task ID', 'Task Title', 'Client', 'Assigned To', 'Assigned By', 'Due Date', 'Priority', 'Status', 'Action'].map(
                      (h) => (
                        <th
                          key={h}
                          className={`p-[16px] text-left text-[11px] font-bold text-[#6B7280] tracking-[0.05em] uppercase whitespace-nowrap ${h === 'Action' ? 'text-center' : ''
                            }`}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody className="block md:table-row-group divide-y md:divide-outline-variant p-4 md:p-0">
                  {currentTasks.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="text-center py-12 text-secondary font-label-md">
                        No matching tasks found. Try altering your filters.
                      </td>
                    </tr>
                  ) : (
                    (() => {
                      const DEPARTMENTS = ['COMMON', 'SOCIAL MEDIA', 'WEBSITE', 'SEO', 'GRAPHIC', 'HR', 'ACCOUNT', 'AMC', 'SALES', 'APPLICATION'];
                      const taskDepts = [...new Set(currentTasks.map(t => (t.department || 'COMMON').toUpperCase()))];
                      taskDepts.sort((a, b) => {
                        const idxA = DEPARTMENTS.indexOf(a);
                        const idxB = DEPARTMENTS.indexOf(b);
                        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                        if (idxA !== -1) return -1;
                        if (idxB !== -1) return 1;
                        return a.localeCompare(b);
                      });

                      return taskDepts.map(dept => {
                        const deptTasks = currentTasks.filter(t => (t.department || 'COMMON').toUpperCase() === dept);
                        if (deptTasks.length === 0) return null;

                        return (
                          <React.Fragment key={dept}>
                            {/* Department Header Row */}
                            <tr className="md:hidden block mb-3 bg-transparent border-none">
                              <td className="block p-0 w-full">
                                <div className="flex items-center justify-between gap-2 text-[#702c91] font-semibold bg-[#F9F4FB] p-3 rounded-lg border border-[#E8DDF0]">
                                  <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[18px]">folder_open</span>
                                    <span className="tracking-[0.05em] uppercase text-[13px]">{dept}</span>
                                    <span className="bg-[#702c91] text-white text-[10px] min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full">{deptTasks.length}</span>
                                  </div>
                                  <button
                                    onClick={(e) => handleDeptUploadClick(e, dept)}
                                    disabled={isUploading && uploadDept === dept}
                                    className="flex items-center justify-center w-8 h-8 rounded-full bg-white text-[#702c91] shadow-sm disabled:opacity-50"
                                  >
                                    <span className={`material-symbols-outlined text-[18px] ${isUploading && uploadDept === dept ? 'animate-spin' : ''}`}>
                                      {isUploading && uploadDept === dept ? 'refresh' : 'upload'}
                                    </span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                            <tr className="hidden md:table-row bg-[#F3F4F6] border-b border-[#E5E7EB]">
                              <td colSpan="9" className="block md:table-cell px-6 py-3">
                                <div className="flex items-center gap-3 font-bold text-[#702c91] text-[13px] tracking-[0.05em] uppercase">
                                  <span className="material-symbols-outlined text-[20px]">folder_open</span>
                                  {dept}
                                  <span className="text-[12px]">{deptTasks.length}</span>

                                  <button
                                    onClick={(e) => handleDeptUploadClick(e, dept)}
                                    disabled={isUploading && uploadDept === dept}
                                    title={`Add attachment for ${dept} department`}
                                    className="ml-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-primary disabled:opacity-50"
                                  >
                                    <span className={`material-symbols-outlined text-[16px] ${isUploading && uploadDept === dept ? 'animate-spin' : ''}`}>
                                      {isUploading && uploadDept === dept ? 'refresh' : 'add'}
                                    </span>
                                    <span className="text-[11px] font-bold tracking-normal normal-case mt-[1px]">
                                      Add attachment for {dept}
                                    </span>
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Tasks for this Department */}
                            {deptTasks.map((task) => {
                              let isTaskOverdue = false
                              let isDoneLate = false
                              if (task.status !== 'Done' && task.dueDate) {
                                const due = new Date(task.dueDate)
                                const today = new Date()
                                today.setHours(0, 0, 0, 0)
                                if (due < today) {
                                  isTaskOverdue = true
                                }

                              } else if (task.status === 'Done' && task.dueDate && task.statusUpdatedOn) {
                                const due = new Date(task.dueDate)
                                const updated = new Date(task.statusUpdatedOn)
                                due.setHours(23, 59, 59, 999)
                                if (updated > due) {
                                  isDoneLate = true
                                }
                              }

                              const rowClass = isTaskOverdue
                                ? 'bg-error-container'
                                : isDoneLate
                                  ? 'bg-[#FFF8F0]'
                                  : task.status === 'Done'
                                    ? 'opacity-60'
                                    : ''

                              const firstTdClass = isTaskOverdue
                                ? 'border-l-4 border-urgent-red'
                                : 'border-l-4 border-transparent'

                              return (
                                <React.Fragment key={task.id}>
                                <tr className={`md:hidden block w-full mb-4 bg-transparent border-none ${isTaskOverdue ? 'opacity-100' : task.status === 'Done' ? (isDoneLate ? 'opacity-80' : 'opacity-40') : 'opacity-100'}`}>
                                  <td className="block p-0 w-full">
                                    <div
                                      onClick={() => {
                                        if (!canAccessTask(task)) {
                                          setUnauthorizedTaskTitle(task.title)
                                          return
                                        }
                                        navigate(`/tasks/${task.id}`)
                                      }}
                                      className={`bg-white rounded-xl border ${isTaskOverdue ? 'border-error shadow-sm' : 'border-gray-100 shadow-sm'} overflow-hidden cursor-pointer`}
                                    >
                                      <div className="p-4 space-y-3">
                                        <div className="flex justify-between items-start">
                                          <div className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded font-bold">{task.id.replace('#DD-', 'T-00')}</div>
                                          <div className="flex gap-2">
                                            <span className={`${PRIORITY_STYLES[task.priority] || 'bg-gray-400 text-white'} text-[10px] font-bold px-3 py-1 rounded-full uppercase`}>{task.priority}</span>
                                            <span className={`${STATUS_STYLES[task.status] || 'bg-gray-100 text-gray-700'} text-[10px] font-bold px-3 py-1 rounded-full uppercase flex items-center gap-1`}>
                                              {task.status}
                                              {task.status === 'Done' && <span className="material-symbols-outlined text-[12px]">check</span>}
                                            </span>
                                          </div>
                                        </div>
                                        <h3 className="text-sm font-semibold text-[#702c91] flex items-center gap-2">
                                          {task.title}
                                          {task.isRecurring && <span className="material-symbols-outlined text-[14px] text-primary">event_repeat</span>}
                                        </h3>
                                        <div className="grid grid-cols-2 gap-y-3 text-xs border-t border-gray-50 pt-3">
                                          <div className="col-span-2">
                                            <p className="text-gray-400 font-bold uppercase text-[9px] mb-1">Client</p>
                                            <div className="flex items-center gap-1 text-gray-600">
                                              <span className="material-symbols-outlined text-[14px]">domain</span>
                                              {task.client}
                                            </div>
                                          </div>
                                          <div>
                                            <p className={`font-bold uppercase text-[9px] mb-1 ${isTaskOverdue ? 'text-error' : 'text-gray-400'}`}>Due Date</p>
                                            <p className={`${isTaskOverdue ? 'text-error font-bold' : 'text-gray-600'}`}>{task.dueDate || 'No Date'}</p>
                                          </div>
                                          <div className="flex items-center gap-3">
                                            <div>
                                              <p className="text-gray-400 font-bold uppercase text-[9px] mb-1">Assigned To</p>
                                              <div className="flex -space-x-2">
                                                {(task.assignedTo || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 3).map((a, idx) => {
                                                  const isDeleted = !employees?.some(e => (e.name || '').toLowerCase() === a.toLowerCase())
                                                  return (
                                                    <div key={idx} className={`w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold border border-white relative ${isDeleted ? 'opacity-40 blur-[0.5px]' : 'text-white'}`} style={{ backgroundColor: isDeleted ? '#9CA3AF' : getUserColor(a) }} title={isDeleted ? `${a} (deleted)` : a}>
                                                      {isDeleted ? <span className="material-symbols-outlined text-[10px]">person_off</span> : getInitials(a)}
                                                    </div>
                                                  )
                                                })}
                                                {(task.assignedTo || '').split(',').filter(Boolean).length > 3 && (
                                                  <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-[8px] font-bold border border-white">
                                                    +{(task.assignedTo || '').split(',').filter(Boolean).length - 3}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                            <div>
                                              <p className="text-gray-400 font-bold uppercase text-[9px] mb-1">By</p>
                                              {(() => {
                                                const cleanName = String(task.assignedBy || 'User').replace(/[^\w\s-]/g, '').trim()
                                                return (
                                                  <div className="w-6 h-6 rounded-full text-white flex items-center justify-center text-[8px] font-bold border border-white" style={{ backgroundColor: getUserColor(cleanName) }} title={cleanName}>
                                                    {getInitials(cleanName)}
                                                  </div>
                                                )
                                              })()}
                                            </div>
                                          </div>
                                          <div className="flex justify-end items-end col-span-2">
                                            {profile?.systemRole === 'Admin' && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  setTaskToDelete(task.id)
                                                }}
                                                className="p-1.5 text-error bg-error-container rounded-lg"
                                              >
                                                <span className="material-symbols-outlined text-[16px]">delete</span>
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                                <tr
                                  className={`hidden md:table-row ${rowClass} transition-all cursor-pointer relative group overflow-hidden`}
                                  style={{ opacity: task.status === 'Done' ? (isDoneLate ? 0.8 : 0.4) : 1 }}
                                  onClick={(e) => {
                                    if (e.target.closest('button') || e.target.closest('.inline-status-select')) return
                                    if (!canAccessTask(task)) {
                                      setUnauthorizedTaskTitle(task.title)
                                      return
                                    }
                                    navigate(`/tasks/${task.id}`)
                                  }}
                                  onMouseEnter={(e) => {
                                    if (window.innerWidth >= 768) {
                                      e.currentTarget.style.background = isTaskOverdue ? 'var(--color-error-container)' : isDoneLate ? '#FFF8F0' : 'white'
                                      e.currentTarget.style.transform = 'scale(1.01)'
                                      e.currentTarget.style.boxShadow = '0 8px 24px rgba(91,33,182,0.08)'
                                      e.currentTarget.style.zIndex = 10
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (window.innerWidth >= 768) {
                                      e.currentTarget.style.background = ''
                                      e.currentTarget.style.transform = 'scale(1)'
                                      e.currentTarget.style.boxShadow = 'none'
                                      e.currentTarget.style.zIndex = 1
                                    }
                                  }}
                                >
                                  {/* ID & Unread Badge */}
                                  <td className={`flex md:table-cell items-center justify-between px-4 py-5 border-b border-outline-variant/30 md:border-none md:border-l-4 ${firstTdClass}`}>
                                    <span className="md:hidden text-[10px] font-bold text-outline uppercase tracking-wider">Task ID</span>
                                    <div className="flex items-center gap-2">
                                      <span className="bg-[#F3F4F6] px-2 py-1 rounded-md text-[12px] font-bold text-[#6B7280] whitespace-nowrap inline-block">
                                        {task.id.replace('#DD-', 'T-00')}
                                      </span>
                                      {(() => {
                                        const msgs = messagesByChatId?.[task.id]
                                        if (!msgs || msgs.length === 0) return null
                                        const lastSeen = lastSeenTimestamps?.[task.id]
                                        const myName = String(profile?.name || 'User').trim().toLowerCase()

                                        const unreadCount = msgs.filter(m => {
                                          const isMe = String(m.senderName || m.sender || '').trim().toLowerCase() === myName
                                          if (isMe || m.type === 'system' || m.type === 'divider') return false
                                          const tTime = m.timestamp || m.time
                                          if (!tTime) return false
                                          return !lastSeen || new Date(tTime).getTime() > new Date(lastSeen).getTime()
                                        }).length

                                        if (unreadCount > 0) {
                                          return (
                                            <span className="flex items-center justify-center w-5 h-5 bg-error text-on-error text-[10px] font-bold rounded-full shadow-sm animate-scale-in">
                                              {unreadCount}
                                            </span>
                                          )
                                        }
                                        return null
                                      })()}
                                    </div>
                                  </td>

                                  {/* Title */}
                                  <td className="flex md:table-cell flex-col md:flex-row items-start md:items-center justify-between px-4 py-5 border-b border-outline-variant/30 md:border-none min-w-[220px]">
                                    <span className="md:hidden text-[10px] font-bold text-outline uppercase tracking-wider mb-1">Task Title</span>
                                    <div className="flex flex-col items-start gap-1 w-full md:w-auto">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <a
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            if (!canAccessTask(task)) {
                                              setUnauthorizedTaskTitle(task.title)
                                              return
                                            }
                                            navigate(`/tasks/${task.id}`)
                                          }}
                                          className="text-[14px] font-bold text-[#702c91] hover:underline cursor-pointer transition-all"
                                        >
                                          {task.title}
                                        </a>
                                        {task.isRecurring ? (
                                          <span
                                            className="material-symbols-outlined text-[14px] text-primary"
                                            title={`Recurring Task (${task.recurringSchedule})`}
                                          >
                                            event_repeat
                                          </span>
                                        ) : task.isAutoGenerated ? (
                                          <span
                                            className="material-symbols-outlined text-[14px] text-primary/70"
                                            title={`Auto-generated from recurring task`}
                                          >
                                            event_repeat
                                          </span>
                                        ) : (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              if (!canAccessTask(task)) {
                                                setUnauthorizedTaskTitle(task.title)
                                                return
                                              }
                                              setRecurringTaskObj(task)
                                              setRecurringSchedule('Weekly')
                                              setRecurringDay('Monday')
                                              setRecurringMonths([])
                                            }}
                                            className="material-symbols-outlined text-[14px] text-outline hover:text-primary transition-colors focus:outline-none"
                                            title="Make this a recurring task"
                                          >
                                            repeat
                                          </button>
                                        )}
                                      </div>
                                      {(() => {
                                        const subtasks = tasks.filter(t => String(t.mainTaskId) === String(task.id) && (t.taskType === 'Sub Task' || t.taskType === 'Subtask'))
                                        if (subtasks.length > 0) {
                                          const doneCount = subtasks.filter(s => s.status === 'Done').length
                                          const allDone = doneCount === subtasks.length
                                          return (
                                            <span className={`text-[10px] border px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${allDone ? 'bg-green-50 text-green-600 border-green-200' : 'bg-primary/10 text-primary border-primary/20'}`}>
                                              <span className="material-symbols-outlined text-[10px]">account_tree</span>
                                              {doneCount}/{subtasks.length}
                                            </span>
                                          )
                                        }
                                        return null;
                                      })()}
                                    </div>
                                  </td>

                                  {/* Client */}
                                  <td className="flex md:table-cell items-center justify-between px-4 py-5 text-[14px] font-normal text-[#6B7280] md:whitespace-nowrap border-b border-outline-variant/30 md:border-none">
                                    <span className="md:hidden text-[10px] font-bold text-outline uppercase tracking-wider">Client</span>
                                    <span
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!canAccessTask(task)) {
                                          setUnauthorizedTaskTitle(task.title)
                                          return
                                        }
                                        navigate(`/projects/${encodeURIComponent(task.client)}`);
                                      }}
                                      className="flex items-center gap-1.5 hover:text-[#702c91] hover:underline cursor-pointer transition-colors group/client w-fit"
                                      title={`View ${task.client} Overview`}
                                    >
                                      <span className="material-symbols-outlined text-[16px] group-hover/client:text-[#702c91] transition-colors text-[#9CA3AF]">domain</span>
                                      {task.client}
                                    </span>
                                  </td>

                                  {/* Assigned */}
                                  <td className="flex md:table-cell items-center justify-between px-4 py-5 whitespace-nowrap border-b border-outline-variant/30 md:border-none">
                                    <span className="md:hidden text-[10px] font-bold text-outline uppercase tracking-wider">Assigned To</span>
                                    <div className="flex items-center gap-2 text-right">
                                      {(() => {
                                        const assignees = (task.assignedTo || '').split(',').map(s => s.trim()).filter(Boolean)
                                        return (
                                          <div className="flex items-center">
                                            {assignees.map((a, idx) => {
                                              const userSubtasks = tasks.filter(t =>
                                                String(t.mainTaskId) === String(task.id) &&
                                                (t.taskType === 'Sub Task' || t.taskType === 'Subtask') &&
                                                String(t.assignedTo).trim().toLowerCase() === a.toLowerCase()
                                              )
                                              const allUserDone = userSubtasks.length > 0 && userSubtasks.every(s => s.status === 'Done')
                                              const isDeleted = !employees?.some(e => (e.name || '').toLowerCase() === a.toLowerCase())
                                              return (
                                                <div key={idx} className={`relative -ml-2 first:ml-0 ${isDeleted ? 'opacity-40 blur-[0.5px]' : ''}`} title={isDeleted ? `${a} (deleted)` : a}>
                                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 border-2 border-white shadow-[0_2px_4px_rgba(0,0,0,0.05)] ${isDeleted ? 'text-white' : 'text-white'}`} style={{ backgroundColor: isDeleted ? '#9CA3AF' : getUserColor(a) }}>
                                                    {isDeleted ? <span className="material-symbols-outlined text-[12px]">person_off</span> : getInitials(a)}
                                                  </div>
                                                  {allUserDone && (
                                                    <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 border-2 border-white rounded-full flex items-center justify-center">
                                                      <span className="material-symbols-outlined text-[10px] text-white">check</span>
                                                    </span>
                                                  )}
                                                </div>
                                              )
                                            })}
                                          </div>
                                        )
                                      })()}
                                    </div>
                                  </td>

                                  {/* Assigned By */}
                                  <td className="flex md:table-cell items-center justify-between px-4 py-5 whitespace-nowrap border-b border-outline-variant/30 md:border-none">
                                    <span className="md:hidden text-[10px] font-bold text-outline uppercase tracking-wider">Assigned By</span>
                                    <div className="flex items-center gap-2 text-right">
                                      {(() => {
                                        const rawName = task.assignedBy || 'User'
                                        const cleanName = String(rawName).replace(/[^\w\s-]/g, '').trim()
                                        return (
                                          <div className="w-8 h-8 rounded-full text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0 border-2 border-white shadow-[0_2px_4px_rgba(0,0,0,0.05)]" style={{ backgroundColor: getUserColor(cleanName) }} title={cleanName}>
                                            {getInitials(cleanName)}
                                          </div>
                                        )
                                      })()}
                                    </div>
                                  </td>

                                  {/* Due date */}
                                  <td
                                    className={`flex md:table-cell items-center justify-between px-4 py-5 text-[13px] font-bold whitespace-nowrap border-b border-outline-variant/30 md:border-none ${isTaskOverdue
                                      ? 'text-[#DC2626]'
                                      : 'text-[#6B7280]'
                                      }`}
                                  >
                                    <span className="md:hidden text-[10px] font-bold text-outline uppercase tracking-wider">Due Date</span>
                                    <span>{task.dueDate}</span>
                                  </td>

                                  {/* Priority */}
                                  <td className="flex md:table-cell items-center justify-between px-4 py-5 whitespace-nowrap border-b border-outline-variant/30 md:border-none">
                                    <span className="md:hidden text-[10px] font-bold text-outline uppercase tracking-wider">Priority</span>
                                    <span
                                      className={`${PRIORITY_STYLES[task.priority] || 'bg-gray-400 text-white'
                                        } inline-block whitespace-nowrap px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest`}
                                    >
                                      {task.priority}
                                    </span>
                                  </td>

                                  {/* Status */}
                                  <td className="flex md:table-cell items-center justify-between px-4 py-5 whitespace-nowrap border-b border-outline-variant/30 md:border-none">
                                    <span className="md:hidden text-[10px] font-bold text-outline uppercase tracking-wider">Status</span>
                                    <InlineStatusSelect
                                      value={task.status}
                                      disabled={!canAccessTask(task)}
                                      onChange={(newStatus) => {
                                        updateTask(task.id, { status: newStatus })
                                        if (newStatus === 'Done') {
                                          const due = new Date(task.dueDate)
                                          const today = new Date()
                                          today.setHours(0, 0, 0, 0)
                                          if (!task.dueDate || today <= due) {
                                            import('canvas-confetti').then((confetti) => {
                                              confetti.default({ particleCount: 150, spread: 70, origin: { y: 0.6 } })
                                            })
                                          }
                                        }
                                      }}
                                    />
                                  </td>

                                  {/* Actions */}
                                  <td className="flex md:table-cell items-center justify-between md:justify-end px-4 py-5 text-right whitespace-nowrap md:bg-transparent">
                                    <span className="md:hidden text-[10px] font-bold text-outline uppercase tracking-wider">Actions</span>
                                    <div className="flex items-center justify-end gap-2 pr-2">
                                      {profile?.systemRole === 'Admin' && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setTaskToDelete(task.id)
                                          }}
                                          className="w-8 h-8 rounded-lg border border-error/40 bg-white text-error flex items-center justify-center cursor-pointer transition-all hover:bg-error-container"
                                          title="Delete Task"
                                        >
                                          <span className="material-symbols-outlined text-[18px]">delete_outline</span>
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                                </React.Fragment>
                              )
                            })}
                          </React.Fragment>
                        )
                      })
                    })()
                  )}
                </tbody>
              </table>
            </div>

            {/* ──────────────────────────────────────────────────────────── */}
            <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-label-sm font-label-sm text-secondary">
                Showing {filtered.length === 0 ? 0 : indexOfFirstTask + 1}-{Math.min(indexOfLastTask, filtered.length)} of {filtered.length} tasks
              </p>
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-label-sm text-secondary font-medium">Tasks per page:</span>
                  <SelectDropdown
                    value={String(tasksPerPage)}
                    onChange={(v) => setTasksPerPage(Number(v))}
                    options={['10', '50', '100']}
                    dropdownUp
                    style={{ width: 80, padding: '8px 12px', borderRadius: 12, border: '1px solid #E5E7EB', background: 'white', fontSize: 13, color: '#1E1B2E', fontWeight: 600, cursor: 'pointer', minHeight: 40 }}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="w-10 h-10 flex items-center justify-center border border-outline-variant rounded-lg text-primary hover:bg-surface-container-lowest transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined">chevron_left</span>
                  </button>

                  <div className="px-2 font-bold text-label-md text-on-surface">
                    Page {currentPage} of {Math.max(1, totalPages)}
                  </div>

                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className="w-10 h-10 flex items-center justify-center border border-outline-variant rounded-lg text-primary hover:bg-surface-container-lowest transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined">chevron_right</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : viewMode === 'Board' ? (
          <div
            ref={boardRef}
            onMouseDown={handleMouseDown}
            onMouseLeave={handleMouseLeave}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
            className={`mt-6 overflow-x-auto select-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          >
            <div className="flex gap-4 min-w-max items-start">
              {(() => {
                const deptCols = ['COMMON', 'SOCIAL MEDIA', 'WEBSITE', 'SEO', 'GRAPHIC', 'UI/UX', 'HR', 'ACCOUNT', 'AMC', 'SALES', 'APPLICATION', 'COMPLETE'];
                const processCols = ['Pending', 'In Progress', 'Review', 'Done', 'Blocked'];

                const baseCols = boardGrouping === 'Process Stage' ? processCols : deptCols;

                const visibleCols = baseCols.filter(col => {
                  if (boardGrouping === 'Process Stage') return true;
                  if (col === 'COMMON' || col === 'COMPLETE') return true;
                  return filtered.some(t => t.status !== 'Done' && (t.department || 'COMMON').toUpperCase() === col);
                });

                return visibleCols.map((colName) => {
                  const columnTasks = filtered.filter(t => {
                    if (boardGrouping === 'Process Stage') return t.status === colName;
                    if (colName === 'COMPLETE') return t.status === 'Done';
                    return t.status !== 'Done' && (t.department || 'COMMON').toUpperCase() === colName;
                  });

                  const displayColName = boardGrouping === 'Process Stage' ? colName : (colName === 'WEBSITE' ? 'WEBSITE WORK' : colName === 'SEO' ? 'SEO WORK' : colName);

                  // Single unified color map for dot + card border
                  const getColColor = (name) => {
                    if (boardGrouping === 'Process Stage') {
                      if (name === 'Pending') return '#9CA3AF'; // grey
                      if (name === 'In Progress') return '#F59E0B'; // amber
                      if (name === 'Review') return '#702c91'; // purple
                      if (name === 'Done') return '#10B981'; // green
                      if (name === 'Blocked') return '#EF4444'; // red
                      return '#9CA3AF';
                    }
                    // Department grouping — green ONLY for COMPLETE
                    if (name === 'COMPLETE') return '#10B981'; // green
                    if (name === 'SEO') return '#6366F1'; // indigo
                    if (name === 'SOCIAL MEDIA') return '#702c91'; // purple
                    if (name === 'GRAPHIC') return '#F43F5E'; // rose
                    if (name === 'UI/UX') return '#8B5CF6'; // violet
                    if (name === 'SALES') return '#F59E0B'; // amber
                    if (name === 'WEBSITE') return '#3B82F6'; // blue
                    if (name === 'HR') return '#EC4899'; // pink
                    if (name === 'ACCOUNT') return '#0EA5E9'; // sky
                    if (name === 'APPLICATION') return '#14B8A6'; // teal
                    return '#9CA3AF'; // COMMON
                  };

                  const colColor = getColColor(colName);

                  return (
                    <div
                      key={colName}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, colName)}
                      style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'transparent', borderRadius: 24, height: 'calc(100vh - 280px)' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '0 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: colColor, flexShrink: 0 }} />
                          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1E1B2E', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{displayColName}</h3>
                          <span style={{ background: '#F3F4F6', color: '#6B7280', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>{columnTasks.length}</span>
                        </div>
                      </div>

                      {/* Column Body */}
                      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                        {columnTasks.length === 0 && quickAddCol !== colName ? (
                          <div className="text-center py-10 flex flex-col items-center justify-center opacity-40">
                            <span className="material-symbols-outlined text-[32px] mb-2">inbox</span>
                            <span className="text-label-sm">No tasks</span>
                          </div>
                        ) : (
                          <>
                            {columnTasks.map(task => {
                              const priorityColors = {
                                urgent: { bg: '#EF4444', color: 'white' },
                                high: { bg: '#F59E0B', color: 'white' },
                                medium: { bg: '#3B82F6', color: 'white' },
                                low: { bg: '#10B981', color: 'white' },
                              };
                              const pStyle = priorityColors[task.priority?.toLowerCase()] || { bg: '#3B82F6', color: 'white' };

                              // Card border color = same as column dot color
                              const cardBorderColor = getColColor(colName);


                              const canUpdateStatus = canAccessTask(task);

                              return (
                                <div
                                  key={task.id}
                                  draggable={canUpdateStatus}
                                  onDragStart={(e) => {
                                    if (!canUpdateStatus) {
                                      e.preventDefault();
                                      return;
                                    }
                                    handleDragStart(e, task.id);
                                  }}
                                  onDragEnd={handleDragEnd}
                                  onClick={() => {
                                    if (!canAccessTask(task)) {
                                      setUnauthorizedTaskTitle(task.title)
                                      return
                                    }
                                    navigate(`/tasks/${task.id}`)
                                  }}
                                  style={{
                                    background: 'white', borderRadius: 18, padding: 20, marginBottom: 16,
                                    boxShadow: '0 4px 16px rgba(91,33,182,0.06)',
                                    borderLeft: `4px solid ${cardBorderColor}`, cursor: 'grab', position: 'relative', zIndex: 1,
                                    transition: 'transform 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s'
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.transform = 'translateY(-4px) rotate(-1deg)';
                                    e.currentTarget.style.boxShadow = '0 12px 32px rgba(91,33,182,0.15)';
                                    e.currentTarget.style.zIndex = 100;
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'translateY(0) rotate(0)';
                                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(91,33,182,0.06)';
                                    e.currentTarget.style.zIndex = 1;
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                    <span style={{ background: '#F0F3FF', color: '#702c91', fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 6, textTransform: 'uppercase' }}>{task.department || 'COMMON'}</span>
                                    <span style={{ background: pStyle.bg, color: pStyle.color, fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 6, textTransform: 'uppercase' }}>{task.priority || 'Medium'}</span>
                                  </div>
                                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1E1B2E', margin: '0 0 8px 0', lineHeight: 1.2, transition: 'color 0.2s' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.color = '#702c91'; e.currentTarget.style.textDecoration = 'underline'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.color = '#1E1B2E'; e.currentTarget.style.textDecoration = 'none'; }}
                                  >
                                                                    {task.title}
                                                                  </h3>
                                                                  {(() => {
                                                                    const bSubtasks = tasks.filter(t => String(t.mainTaskId) === String(task.id) && (t.taskType === 'Sub Task' || t.taskType === 'Subtask'))
                                                                    if (bSubtasks.length > 0) {
                                                                      const doneCount = bSubtasks.filter(s => s.status === 'Done').length
                                                                      const allDone = doneCount === bSubtasks.length
                                                                      return (
                                                                        <span style={{ fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 999, marginBottom: 8, background: allDone ? '#ECFDF5' : '#F0F3FF', color: allDone ? '#059669' : '#702c91', border: allDone ? '1px solid #A7F3D0' : '1px solid rgba(112,44,145,0.2)' }}>
                                                                          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>account_tree</span>
                                                                          {doneCount}/{bSubtasks.length}
                                                                        </span>
                                                                      )
                                                                    }
                                                                    return null;
                                                                  })()}
                                                                  <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 16px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{task.client}</p>
                                                                  
                                                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 0 }}>
                                                                    <div style={{ display: 'flex' }}>
                                                                       {(task.assignedTo || '').split(',').map(s => s.trim()).filter(Boolean).map((a, i) => {
                                        const userSubtasks = tasks.filter(t =>
                                          String(t.mainTaskId) === String(task.id) &&
                                          (t.taskType === 'Sub Task' || t.taskType === 'Subtask') &&
                                          String(t.assignedTo).trim().toLowerCase() === a.toLowerCase()
                                        )
                                        const allUserDone = userSubtasks.length > 0 && userSubtasks.every(s => s.status === 'Done')
                                        const isDeleted = !employees?.some(e => (e.name || '').toLowerCase() === a.toLowerCase())
                                        return (
                                          <div key={i} style={{ position: 'relative', marginLeft: i > 0 ? -10 : 0 }} title={isDeleted ? `${a} (deleted)` : a}>
                                            <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: isDeleted ? '#9CA3AF' : getUserColor(a), border: '2px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', opacity: isDeleted ? 0.4 : 1, filter: isDeleted ? 'blur(0.5px)' : 'none' }}>
                                              {isDeleted ? <span className="material-symbols-outlined" style={{ fontSize: 10 }}>person_off</span> : getInitials(a)}
                                            </div>
                                            {allUserDone && (
                                              <span style={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, backgroundColor: '#10B981', border: '2px solid white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 8, color: 'white' }}>check</span>
                                              </span>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6B7280' }}>
                                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>calendar_today</span>
                                      <span style={{ fontSize: 11, fontWeight: 600, color: (!task.dueDate || task.dueDate === 'No') ? '#6B7280' : '#DC2626' }}>{task.dueDate}</span>
                                    </div>
                                  </div>

                                  {profile?.systemRole === 'Admin' && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setTaskToDelete(task.id)
                                      }}
                                      style={{ position: 'absolute', top: 12, right: 12, background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0, transition: 'opacity 0.2s', color: '#EF4444' }}
                                      className="group-hover/card:opacity-100"
                                      onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                                      onMouseLeave={(e) => e.currentTarget.style.opacity = 0}
                                      title="Delete Task"
                                    >
                                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete_outline</span>
                                    </button>
                                  )}
                                </div>
                              );
                            })}

                            {/* Quick Add Input */}
                            {quickAddCol === colName && (
                              <div className="bg-surface-container-lowest p-3 rounded-xl border border-primary/50 shadow-md mt-2 flex flex-col gap-2">
                                <div className="flex justify-between items-start">
                                  <input
                                    autoFocus
                                    type="text"
                                    placeholder="Task Name..."
                                    value={quickAddTitle}
                                    onChange={(e) => setQuickAddTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleQuickAdd(colName)
                                      if (e.key === 'Escape') resetQuickAdd()
                                    }}
                                    className="w-full bg-transparent border-none text-body-sm text-on-surface focus:ring-0 outline-none placeholder:text-secondary font-bold"
                                  />
                                  <button onClick={() => handleQuickAdd(colName)} className="px-2.5 py-1 text-[11px] font-bold btn-gradient rounded transition-opacity ml-2 shrink-0 flex items-center gap-1">
                                    Save <span className="material-symbols-outlined text-[12px]">keyboard_return</span>
                                  </button>
                                </div>

                                <div className="text-[11px] text-secondary mb-1">
                                  {new Date().toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'Asia/Kolkata' })}
                                </div>

                                <div className="flex items-center gap-2 text-secondary hover:text-on-surface transition-colors w-full group relative">
                                  <span className="material-symbols-outlined text-[16px] shrink-0">business</span>
                                  <select
                                    value={quickAddClient}
                                    onChange={(e) => setQuickAddClient(e.target.value)}
                                    className="w-full bg-transparent border-none text-[12px] font-medium outline-none focus:ring-0 cursor-pointer text-secondary group-hover:text-on-surface appearance-none py-1"
                                  >
                                    <option value="">Select client</option>
                                    {allClientOptions.map(c => (
                                      <option key={c} value={c}>{c}</option>
                                    ))}
                                  </select>
                                </div>

                                <div className="flex items-start gap-2 text-secondary hover:text-on-surface transition-colors w-full group relative flex-col">
                                  <div className="flex items-center gap-2 w-full">
                                    <span className="material-symbols-outlined text-[16px] shrink-0">person_add</span>

                                    <div className="flex flex-wrap gap-1 flex-1 items-center">
                                      {quickAddAssignee.map(name => (
                                        <span key={name} className="flex items-center gap-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] font-bold">
                                          {getInitials(name)}
                                          <button
                                            onClick={() => setQuickAddAssignee(prev => prev.filter(n => n !== name))}
                                            className="hover:text-red-500 flex items-center justify-center"
                                          >
                                            <span className="material-symbols-outlined text-[10px]">close</span>
                                          </button>
                                        </span>
                                      ))}

                                      <select
                                        value=""
                                        onChange={(e) => {
                                          if (e.target.value && !quickAddAssignee.includes(e.target.value)) {
                                            setQuickAddAssignee(prev => [...prev, e.target.value])
                                          }
                                        }}
                                        className="flex-1 min-w-[100px] bg-transparent border-none text-[12px] font-medium outline-none focus:ring-0 cursor-pointer text-secondary group-hover:text-on-surface appearance-none py-1"
                                      >
                                        <option value="">{quickAddAssignee.length === 0 ? 'Add assignee' : 'Add more...'}</option>
                                        {employees?.filter(emp => !quickAddAssignee.includes(emp.name)).map(emp => (
                                          <option key={emp.id} value={emp.name}>{emp.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                </div>

                                <div
                                  className="flex items-center gap-2 text-secondary hover:text-on-surface transition-colors w-full group relative cursor-pointer"
                                  onClick={(e) => {
                                    const input = e.currentTarget.querySelector('input');
                                    if (input) {
                                      input.type = 'date';
                                      input.focus();
                                      try { input.showPicker(); } catch (err) { }
                                    }
                                  }}
                                >
                                  <span className="material-symbols-outlined text-[16px] shrink-0">calendar_add_on</span>
                                  <input
                                    type="text"
                                    onClick={(e) => {
                                      e.target.type = 'date';
                                      try { e.target.showPicker(); } catch (err) { }
                                    }}
                                    onFocus={(e) => {
                                      e.target.type = 'date';
                                      try { e.target.showPicker(); } catch (err) { }
                                    }}
                                    onBlur={(e) => {
                                      if (!e.target.value) e.target.type = 'text'
                                    }}
                                    value={quickAddDueDate}
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        const dateObj = new Date(e.target.value)
                                        if (dateObj.getDay() === 0) { // 0 is Sunday
                                          addToast("Sundays cannot be selected as due dates.", 'error')
                                          setQuickAddDueDate('')
                                          return
                                        }
                                      }
                                      setQuickAddDueDate(e.target.value)
                                    }}
                                    className="w-full bg-transparent border-none text-[12px] font-medium outline-none focus:ring-0 cursor-pointer text-secondary group-hover:text-on-surface py-1"
                                    placeholder="Due Date"
                                  />
                                </div>

                                <div className="flex items-center gap-2 text-secondary hover:text-on-surface transition-colors w-full group relative">
                                  <span className="material-symbols-outlined text-[16px] shrink-0">flag</span>
                                  <select
                                    value={quickAddPriority}
                                    onChange={(e) => setQuickAddPriority(e.target.value)}
                                    className="w-full bg-transparent border-none text-[12px] font-medium outline-none focus:ring-0 cursor-pointer text-secondary group-hover:text-on-surface appearance-none py-1"
                                  >
                                    <option value="">Add priority</option>
                                    <option value="Urgent">Urgent</option>
                                    <option value="High">High</option>
                                    <option value="Medium">Medium</option>
                                    <option value="Low">Low</option>
                                  </select>
                                </div>

                                <div className="flex justify-start gap-2 mt-2">
                                  <button onClick={resetQuickAdd} className="px-3 py-1.5 text-[11px] font-bold text-secondary hover:bg-surface-container-high rounded transition-colors w-full border border-outline-variant/30">Cancel</button>
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        {/* Add Task Button at bottom of column body */}
                        {quickAddCol !== colName && (
                          <button
                            onClick={() => {
                              setNewTaskPrefillDept(colName === 'COMPLETE' ? 'COMMON' : colName)
                              setShowNewTaskModal(true)
                            }}
                            className="w-full mt-2 py-3 flex items-center justify-center gap-2 text-[13px] font-bold text-[#9CA3AF] hover:text-[#702c91] border-2 border-dashed border-[#E5E7EB] hover:border-[#702c91] hover:bg-[#F5F3FF] rounded-full transition-all"
                          >
                            <span className="material-symbols-outlined text-[18px]">add_circle</span>
                            Add Task
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              })()}


            </div>
          </div>
        ) : (
          <div className="mt-6">
            <TaskCalendar tasks={filtered} />
          </div>
        )}

        {/* FAB is now rendered by the parent page outside the scroll container */}
      </div>

      {/* Delete Confirmation Modal */}
      {taskToDelete && createPortal(
        <div className="fixed inset-0 z-[999999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-[400px] overflow-hidden animate-scale-in flex flex-col border border-outline-variant">
            <div className="flex items-center gap-3 px-6 py-5 border-b border-outline-variant bg-surface-container-low">
              <div className="w-9 h-9 rounded-full bg-error/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-error text-[20px]">warning</span>
              </div>
              <h2 className="text-label-lg font-bold text-on-surface">Delete Task</h2>
            </div>
            <div className="px-6 py-5 bg-surface-container-lowest">
              <p className="text-body-sm text-secondary leading-relaxed">
                {'Are you sure you want to delete this task? '}
                {(() => { const subCount = tasks.filter(t => String(t.mainTaskId || t.main_task_id) === String(taskToDelete)).length; return subCount > 0 ? <>All <strong className="text-on-surface">{subCount} subtask{subCount > 1 ? 's' : ''}</strong> {'will also be deleted. '}</> : null })()}
                {'This action cannot be undone.'}
              </p>
            </div>
            <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant flex justify-end gap-3">
              <button
                onClick={() => setTaskToDelete(null)}
                className="px-5 py-2 border border-outline-variant text-secondary rounded-lg font-label-md hover:bg-surface-container-high transition-all text-sm font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteTask(taskToDelete)
                  setTaskToDelete(null)
                }}
                className="px-5 py-2 bg-error text-on-error rounded-lg font-label-md shadow-md hover:brightness-105 active:scale-95 transition-all text-sm font-bold cursor-pointer"
              >
                Yes
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Make Recurring Modal */}
      {recurringTaskObj && createPortal(
        <div className="fixed inset-0 z-[999999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleMakeRecurring}
            className="bg-surface-container-lowest w-full max-w-[500px] rounded-xl shadow-2xl p-6 flex flex-col gap-6 animate-scaleIn border border-outline-variant"
          >
            <div className="flex justify-between items-center border-b border-divider pb-3">
              <h3 className="text-title-lg font-bold text-primary flex items-center gap-2">
                <span className="material-symbols-outlined">event_repeat</span>
                Make Task Recurring
              </h3>
              <button
                type="button"
                onClick={() => setRecurringTaskObj(null)}
                className="text-outline hover:text-on-surface transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="text-body-sm text-secondary bg-surface-container-low p-3 rounded-lg border border-outline-variant/50 flex items-start gap-2">
              <span className="material-symbols-outlined text-[16px] text-primary shrink-0 mt-0.5">info</span>
              <span>You are making <span className="font-bold text-on-surface">{recurringTaskObj.title}</span> a recurring task.</span>
            </div>

            <div className="flex flex-col gap-4">
              {/* Schedule Type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-bold text-secondary uppercase tracking-wider pl-1">
                  Recurring Schedule
                </label>
                <select
                  value={recurringSchedule}
                  onChange={(e) => {
                    setRecurringSchedule(e.target.value)
                    setRecurringDay('Monday')
                    setRecurringMonths([])
                  }}
                  className="w-full bg-surface border border-outline-variant rounded-md px-3 py-2.5 text-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                >
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Yearly">Yearly</option>
                </select>
              </div>

              {/* Dependent Fields */}
              {recurringSchedule === 'Weekly' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-bold text-secondary uppercase tracking-wider pl-1">
                    Day of the Week
                  </label>
                  <select
                    value={recurringDay}
                    onChange={(e) => setRecurringDay(e.target.value)}
                    className="w-full bg-surface border border-outline-variant rounded-md px-3 py-2.5 text-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                  >
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>
              )}

              {recurringSchedule === 'Monthly' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-bold text-secondary uppercase tracking-wider pl-1">
                    Select Months (task created on 1st of month)
                  </label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((mon) => (
                      <label key={mon} className="flex items-center gap-1.5 bg-surface border border-outline-variant px-3 py-1.5 rounded-md text-[13px] cursor-pointer hover:border-primary transition-colors">
                        <input
                          type="checkbox"
                          checked={recurringMonths.includes(mon)}
                          onChange={(e) => {
                            if (e.target.checked) setRecurringMonths([...recurringMonths, mon])
                            else setRecurringMonths(recurringMonths.filter(m => m !== mon))
                          }}
                          className="accent-primary w-4 h-4 cursor-pointer"
                        />
                        {mon}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {recurringSchedule === 'Yearly' && (
                <div className="flex flex-col justify-center text-[13px] text-secondary italic bg-surface-container-low p-3 rounded-lg border border-outline-variant/50">
                  This task will be automatically created every January 1st.
                </div>
              )}

              <div className="text-[12px] text-primary font-medium flex items-center gap-1.5 bg-primary/10 p-3 rounded-lg mt-2">
                <span className="material-symbols-outlined text-[16px]">info</span>
                If the creation date falls on a Sunday, the task will be safely shifted to Monday.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 mt-2 border-t border-divider">
              <button
                type="button"
                onClick={() => setRecurringTaskObj(null)}
                className="px-5 py-2 border border-outline-variant text-secondary rounded-lg font-label-md hover:bg-surface-container-high transition-all text-sm font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isRecurringSubmitting || (recurringSchedule === 'Monthly' && recurringMonths.length === 0)}
                className="px-5 py-2 btn-gradient rounded-lg font-label-md shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-bold cursor-pointer"
              >
                {isRecurringSubmitting ? 'Saving...' : 'Save Schedule'}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {unauthorizedTaskTitle && createPortal(
        <div className="fixed inset-0 z-[999999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[400px] overflow-hidden animate-scale-in flex flex-col border border-gray-200">
            <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100 bg-gray-50">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-500 text-[20px]">lock</span>
              </div>
              <h2 className="text-[15px] font-bold text-gray-800">Access Restricted</h2>
            </div>
            <div className="px-6 py-5 bg-white">
              <p className="text-[13px] text-gray-600 leading-relaxed">
                You are not assigned to <span className="font-bold text-gray-800">"{unauthorizedTaskTitle}"</span>. Only assigned users, admins, or managers can access this task.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                onClick={() => setUnauthorizedTaskTitle(null)}
                className="px-5 py-2 bg-gray-800 text-white rounded-lg text-[12px] font-bold hover:bg-gray-700 transition-all cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}




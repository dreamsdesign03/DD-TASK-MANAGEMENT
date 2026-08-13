import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import TopNav from '../components/TopNav'
import SelectDropdown from '../components/SelectDropdown'
import LinkifiedText from '../components/LinkifiedText'
import { useApp, parseMultiUserTimeStr, formatTimeStr, getActiveTimerMs } from '../context/AppContext'
import { processMessagesList, renderMessageText } from './ChatPage'
import { renderAvatar } from '../utils/avatar'
import { formatTime, formatDateTime, computeRecurringDueDate } from '../utils/dateFormat'
import CHAT_BACKGROUNDS from '../data/chatBackgrounds'
import { api } from '../api'
/* â”€â”€â”€ Priority badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function PriorityBadge({ priority }) {
  const map = {
    Urgent: 'bg-[#E74C3C]/10 text-[#E74C3C] border border-[#E74C3C]/20',
    High: 'bg-amber-100 text-amber-700 border border-amber-200',
    Medium: 'bg-blue-100 text-blue-700 border border-blue-200',
    Low: 'bg-gray-100 text-gray-600 border border-gray-200',
  }
  return (
    <span className={`${map[priority] || map.Low} px-3 py-1.5 rounded-full text-label-sm font-label-sm font-bold`}>
      {priority}
    </span>
  )
}

/* â”€â”€â”€ Status badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function StatusBadge({ status }) {
  const map = {
    Blocked: 'bg-urgent-red text-white',
    'In Progress': 'bg-amber-500 text-white',
    Review: 'bg-blue-500 text-white',
    Done: 'bg-success-green text-white',
    Pending: 'bg-gray-400 text-white',
  }
  return (
    <span className={`${map[status] || 'bg-gray-400 text-white'} px-3 py-1.5 rounded-full text-label-sm font-label-sm flex items-center gap-1`}>
      <span className="material-symbols-outlined text-[16px]">
        {status === 'Blocked' ? 'block' : status === 'Done' ? 'check_circle' : 'radio_button_checked'}
      </span>
      {status}
    </span>
  )
}





const getPriorityConfig = (priority) => {
  switch (priority) {
    case 'Urgent':
      return {
        label: 'Critical',
        badgeClass: 'bg-urgent-red text-white',
        iconClass: 'bg-urgent-red/10 text-urgent-red',
        textClass: 'text-urgent-red',
        desc: 'Requires immediate attention to resolve blocking issues for client delivery.',
      }
    case 'High':
      return {
        label: 'High',
        badgeClass: 'bg-amber-500 text-white',
        iconClass: 'bg-amber-500/10 text-amber-500',
        textClass: 'text-amber-500',
        desc: 'Should be resolved quickly to prevent potential project timeline delays.',
      }
    case 'Medium':
      return {
        label: 'Medium',
        badgeClass: 'bg-blue-500 text-white',
        iconClass: 'bg-blue-500/10 text-blue-500',
        textClass: 'text-blue-500',
        desc: 'Normal prioritization. To be completed within the scheduled milestone.',
      }
    case 'Low':
    default:
      return {
        label: 'Low',
        badgeClass: 'bg-gray-500 text-white',
        iconClass: 'bg-gray-500/10 text-gray-500',
        textClass: 'text-gray-500',
        desc: 'Low priority task. Can be worked on when higher items are cleared.',
      }
  }
}

export default function TaskDetailPage() {
  const { taskId } = useParams()
  const navigate = useNavigate()
  const { tasks, updateTask, addTask, deleteTask, profile, employees, addSystemAndWebNotification, messagesByChatId, setMessagesByChatId, fetchMessages, markChatAsRead, addToast, activeTimer, sessionSecs: globalSessionSecs, toggleTimer, isPunchedIn } = useApp()

  const task = (tasks || []).find((t) => t.id === taskId) || (tasks && tasks.length > 0 ? tasks[0] : {})

  const canViewTask = (() => {
    if (!profile || !task?.id) return true;
    if (profile.systemRole === 'Admin') return true;

    const role = profile.systemRole || 'Employee';
    const dept = (task.department || '').toUpperCase();
    const isRestricted = ['HR', 'ACCOUNT', 'SALES'].includes(dept);

    // Department-restricted tasks: only matching role or assigned user
    if (isRestricted) {
      if (role === 'HR' && dept === 'HR') return true;
      if (role === 'Accountant' && dept === 'ACCOUNT') return true;
      if (role === 'Sales' && dept === 'SALES') return true;
      // Not the right department — fall through to assignment check
    } else if (role !== 'Employee') {
      // Non-restricted: all non-Employee roles can view
      return true;
    }

    // Assignment check (email-first for all roles)
    const normalizeName = (name) => {
      if (!name) return '';
      return String(name).toLowerCase().replace(/[^\w]/g, '').trim();
    };
    const myName = normalizeName(profile.name);
    const myEmail = String(profile.email || '').trim().toLowerCase();
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
  })();

  useEffect(() => {
    fetchMessages()
  }, [taskId, fetchMessages])

  useEffect(() => {
    if (taskId) {
      markChatAsRead(taskId)
    }
  }, [taskId, messagesByChatId[taskId]?.length, markChatAsRead])

  const [reply, setReply] = useState('')
  const [replyAttachment, setReplyAttachment] = useState(null)
  const [isSendingReply, setIsSendingReply] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [isAssigneeModalOpen, setIsAssigneeModalOpen] = useState(false)
  const [selectedAssignees, setSelectedAssignees] = useState([])
  const [attachmentToDelete, setAttachmentToDelete] = useState(null)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [newSubtaskAssignee, setNewSubtaskAssignee] = useState([])
  const [isSubtaskAssigneeOpen, setIsSubtaskAssigneeOpen] = useState(false)
  const [subtaskAssigneeSearch, setSubtaskAssigneeSearch] = useState('')
  const subtaskAssigneeRef = useRef(null)
  const [newSubtaskDueDate, setNewSubtaskDueDate] = useState('')
  const [newSubtaskPriority, setNewSubtaskPriority] = useState('Medium')
  const [isSubtaskInputActive, setIsSubtaskInputActive] = useState(false)
  const [editingSubtask, setEditingSubtask] = useState(null)
  const [editSubtaskTitle, setEditSubtaskTitle] = useState('')
  const [editSubtaskAssignee, setEditSubtaskAssignee] = useState([])
  const [editSubtaskPriority, setEditSubtaskPriority] = useState('Medium')
  const [editSubtaskDueDate, setEditSubtaskDueDate] = useState('')
  const [isEditAssigneeOpen, setIsEditAssigneeOpen] = useState(false)
  const [editAssigneeSearch, setEditAssigneeSearch] = useState('')
  const editAssigneeRef = useRef(null)
  const [infoModal, setInfoModal] = useState(null)
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [taskToDelete, setTaskToDelete] = useState(null)
  const [subtaskToDelete, setSubtaskToDelete] = useState(null)

  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [editDescriptionContent, setEditDescriptionContent] = useState('')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitleContent, setEditTitleContent] = useState('')

  // Chat Background State
  const [chatBackgrounds, setChatBackgrounds] = useState(() => {
    try {
      const stored = localStorage.getItem('dd_chat_bgs_tasks')
      return stored ? JSON.parse(stored) : {}
    } catch {
      return {}
    }
  })
  const [showBgModal, setShowBgModal] = useState(false)

  // Recurring Task Modal State
  const [showRecurringModal, setShowRecurringModal] = useState(false)
  const [isEditingDueDate, setIsEditingDueDate] = useState(false)
  const [recurringSchedule, setRecurringSchedule] = useState('Weekly')
  const [recurringDay, setRecurringDay] = useState('Monday')
  const [recurringMonths, setRecurringMonths] = useState([])
  const [isRecurringSubmitting, setIsRecurringSubmitting] = useState(false)

  const handleMakeRecurring = async (e) => {
    e.preventDefault()
    setIsRecurringSubmitting(true)
    try {
      await updateTask(task.id, {
        isRecurring: true,
        recurringSchedule,
        recurringDay: recurringSchedule === 'Weekly' ? recurringDay : '',
        recurringMonths: recurringSchedule === 'Monthly' ? recurringMonths.join(', ') : '',
        dueDate: computeRecurringDueDate(recurringSchedule, recurringDay, recurringMonths)
      })
      addToast('Task successfully set as recurring!', 'success')
      setShowRecurringModal(false)
    } catch (err) {
      addToast('Failed to set task as recurring', 'error')
    } finally {
      setIsRecurringSubmitting(false)
    }
  }

  const handleDueDateChange = (e) => {
    const val = e.target.value;
    if (!val) {
      setNewSubtaskDueDate('');
      return;
    }
    // Check for Sunday
    const d = new Date(val + 'T00:00:00'); // Local time zone mapping
    if (d.getDay() === 0) { // 0 is Sunday
      addToast('Sundays cannot be selected as a due date. Please select another day.', 'error');
      return;
    }
    setNewSubtaskDueDate(val);
  }

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (subtaskAssigneeRef.current && !subtaskAssigneeRef.current.contains(event.target)) {
        setIsSubtaskAssigneeOpen(false)
      }
      if (editAssigneeRef.current && !editAssigneeRef.current.contains(event.target)) {
        setIsEditAssigneeOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isTracking = activeTimer?.taskId === task.id;
  const sessionSecs = isTracking ? globalSessionSecs : 0;
  const isTaskDone = task?.status === 'Done';


  const handleSaveAssignees = () => {
    const names = []
    const emails = []
    const ids = []
    selectedAssignees.filter(Boolean).forEach(v => {
      const emp = employees?.find(e => e.email === v)
      if (emp) {
        names.push(emp.name)
        emails.push(emp.email)
        ids.push(emp.id)
      } else {
        names.push(v)
        // Only treat as email if it contains @, otherwise it's a fallback name
        if (v.includes('@')) emails.push(v)
      }
    })
    // Always keep current user assigned (except Admin managing others' tasks)
    if (role !== 'Admin' && profile?.email && !emails.some(e => e.toLowerCase() === profile.email.toLowerCase())) {
      const selfEmp = employees?.find(e => e.email?.toLowerCase() === profile.email.toLowerCase())
      if (selfEmp) {
        names.push(selfEmp.name)
        emails.push(selfEmp.email)
      } else if (profile.name) {
        names.push(profile.name)
        emails.push(profile.email)
      }
      addToast('You cannot remove yourself from the task', 'warning')
    }
    updateTask(task.id, {
      assignedTo: names.join(', '),
      assignedToIds: ids.filter(Boolean).join(', '),
      assignedEmails: emails.join(', '),
      employeeIds: ids.filter(Boolean).join(', ')
    })
    setIsAssigneeModalOpen(false)
  }

  const handleEditDescriptionClick = () => {
    const isPlaceholder = (s) => !s || s.trim() === '' || /no description/i.test(s.trim())
    const text = [
      !isPlaceholder(task.description?.intro) ? task.description.intro : '',
      task.description?.bullets?.length ? task.description.bullets.map(b => '- ' + b).join('\n') : '',
      !isPlaceholder(task.description?.outro) ? task.description.outro : ''
    ].filter(Boolean).join('\n\n');
    setEditDescriptionContent(text);
    setIsEditingDescription(true);
  }

  const handleSaveDescription = () => {
    updateTask(task.id, {
      description: {
        intro: editDescriptionContent,
        bullets: [],
        outro: '',
        editedAt: new Date().toISOString()
      }
    })
    setIsEditingDescription(false)
  }

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return
    let maxSubIdNum = 0;
    const existingSubtasks = tasks.filter(t => String(t.mainTaskId) === String(task.id) && (t.taskType === 'Sub Task' || t.taskType === 'Subtask'));
    existingSubtasks.forEach(st => {
      const match = String(st.id).match(/-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSubIdNum) maxSubIdNum = num;
      }
    });
    const nextSubIdNum = maxSubIdNum + 1;
    // Timestamp suffix keeps subtask IDs unique even when two users add a subtask at the same time
    const newStId = `${task.id}-${String(nextSubIdNum).padStart(2, '0')}${Date.now().toString().slice(-6)}`;

    let calculatedOverdue = 'No';
    if (newSubtaskDueDate) {
      const dueTime = new Date(newSubtaskDueDate).setHours(23, 59, 59, 999);
      if (dueTime < Date.now()) {
        calculatedOverdue = 'Yes';
      }
    }

    const subtaskNames = (newSubtaskAssignee && newSubtaskAssignee.length > 0) ? newSubtaskAssignee : [profile?.name || 'User']
    const assignedEmps = employees?.filter(e => subtaskNames.map(s => String(s).trim()).includes(e.name)) || [];
    const subtaskIds = assignedEmps.map(e => e.id).filter(Boolean).join(', ')
    const subtaskEmails = assignedEmps.map(e => e.email).filter(Boolean).join(', ')

    const newSt = {
      id: newStId,
      title: newSubtaskTitle.trim(),
      taskType: 'Sub Task',
      mainTaskId: task.id,
      client: task.client,
      project: task.project,
      department: task.department,
      status: 'Pending',
      assignedTo: subtaskNames.join(', '),
      assignedToIds: subtaskIds,
      assignedBy: profile?.name || 'User',
      assignedById: profile?.employeeId || profile?.id || '',
      employeeIds: subtaskIds,
      employeeId: subtaskIds,
      assignedEmails: subtaskEmails,
      assignedEmail: subtaskEmails,
      priority: newSubtaskPriority,
      dueDate: newSubtaskDueDate,
      daysOverdue: calculatedOverdue,
      description: { intro: '', bullets: [], outro: '' }
    }
    addTask(newSt)

    setNewSubtaskTitle('')
    setNewSubtaskAssignee([])
    setNewSubtaskPriority('Medium')
    setNewSubtaskDueDate('')
    setIsSubtaskAssigneeOpen(false)
    setIsSubtaskInputActive(false)
  }

  const openEditSubtask = (st) => {
    setEditingSubtask(st)
    setEditSubtaskTitle(st.title || '')
    setEditSubtaskAssignee(String(st.assignedTo || '').split(',').map(n => n.trim()).filter(Boolean))
    setEditSubtaskPriority(st.priority || 'Medium')
    setEditSubtaskDueDate(st.dueDate || '')
    setIsEditAssigneeOpen(false)
    setEditAssigneeSearch('')
  }

  const handleSaveSubtaskEdit = () => {
    if (!editingSubtask) return
    const title = editSubtaskTitle.trim()
    if (!title) {
      addToast('Subtask title cannot be empty', 'error')
      return
    }
    const subtaskNames = (editSubtaskAssignee && editSubtaskAssignee.length > 0) ? editSubtaskAssignee : [profile?.name || 'User']
    const assignedEmps = employees?.filter(e => subtaskNames.map(s => String(s).trim()).includes(e.name)) || []
    let calculatedOverdue = 'No'
    if (editSubtaskDueDate) {
      const dueTime = new Date(editSubtaskDueDate).setHours(23, 59, 59, 999)
      if (dueTime < Date.now()) calculatedOverdue = 'Yes'
    }
    updateTask(editingSubtask.id, {
      title,
      assignedTo: subtaskNames.join(', '),
      assignedToIds: assignedEmps.map(e => e.id).filter(Boolean).join(', '),
      assignedEmails: assignedEmps.map(e => e.email).filter(Boolean).join(', '),
      employeeIds: assignedEmps.map(e => e.id).filter(Boolean).join(', '),
      priority: editSubtaskPriority,
      dueDate: editSubtaskDueDate,
      daysOverdue: calculatedOverdue
    })
    setEditingSubtask(null)
  }

  const subtasks = tasks.filter(t => String(t.mainTaskId) === String(task.id) && (t.taskType === 'Sub Task' || t.taskType === 'Subtask'))

  const isSubtaskAssignee = (st) => {
    if (!profile) return false
    const myName = String(profile.name || '').toLowerCase().replace(/[^\w]/g, '').trim()
    const myEmail = String(profile.email || '').toLowerCase().trim()
    const assigneeNames = String(st.assignedTo || '').split(',').map(n => String(n || '').toLowerCase().replace(/[^\w]/g, '').trim()).filter(Boolean)
    const assigneeEmails = String(st.assignedEmail || '').split(',').map(e => String(e || '').toLowerCase().trim()).filter(Boolean)
    return assigneeNames.includes(myName) || (myEmail && assigneeEmails.includes(myEmail))
  }

  const teamMembers = employees ? employees.map(e => ({ name: e.name, email: e.email })) : []
  const uniqueTeamMembers = [...new Map(
    [...teamMembers, ...selectedAssignees.filter(Boolean).map(email => {
      const emp = employees?.find(e => e.email === email)
      return emp ? { name: emp.name, email: emp.email } : { name: email, email }
    })].map(m => [String(m.email).toLowerCase(), m])
  ).values()]

  // Only users assigned to the MAIN task can be picked as subtask assignees
  const mainTaskAssignees = [...new Map(
    (task.assignedTo || '').split(',').map(n => n.trim()).filter(Boolean).map(name => {
      const emp = employees?.find(e => e.name === name)
      return emp ? { name: emp.name, email: emp.email } : { name, email: '' }
    }).map(m => [String((m.email || m.name)).toLowerCase(), m])
  ).values()]
  const [isUploading, setIsUploading] = useState(false)
  const scrollRef = useRef(null)
  const fileInputRef = useRef(null)
  const replyInputRef = useRef(null)
  const [mentionIndex, setMentionIndex] = useState(-1)
  const [mentionFilter, setMentionFilter] = useState('')
  const mentionDropdownRef = useRef(null)

  const handleFileUpload = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const clientName = task.client || ''
    if (!clientName || clientName.toLowerCase() === 'internal') {
      addToast('Please select a client for this task before uploading files', 'error')
      return
    }

    setIsUploading(true)
    try {
      const newAttachments = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]

        // Convert to base64
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })

        // Send to storage
        const data = await api.post({
          action: 'upload_file',
          filename: file.name,
          mimeType: file.type,
          base64: base64Data.split(',')[1], // remove data:image/...;base64,
          projectName: clientName,
          department: task.department || 'COMMON',
          userEmail: profile?.email || ''
        })

        if (data.ok) {
          newAttachments.push({
            name: file.name,
            url: data.url || data.downloadUrl,
            downloadUrl: data.downloadUrl || '',
            size: `${(file.size / 1024).toFixed(1)} KB`,
            type: file.type
          })
        } else {
          throw new Error(data.error || 'Upload failed')
        }
      }

      const updatedAttachments = [...(task.attachments || []), ...newAttachments]
      updateTask(task.id, { attachments: updatedAttachments })
      addToast('Files uploaded successfully!', 'success')
    } catch (error) {
      console.error('File upload error:', error)
      addToast('Failed to upload file: ' + error.message, 'error')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [task?.comments])

  const handleReplyChange = (e) => {
    const val = e.target.value
    setReply(val)

    const selectionStart = e.target.selectionStart
    const beforeCursor = val.slice(0, selectionStart || val.length)
    const match = beforeCursor.match(/@([a-zA-Z0-9_\s]*)$/)

    if (match) {
      const atIdx = beforeCursor.lastIndexOf('@')
      if (atIdx === 0 || beforeCursor[atIdx - 1] === ' ') {
        setMentionIndex(atIdx)
        setMentionFilter(match[1])
        return
      }
    }
    setMentionIndex(-1)
  }

  const selectMention = (userName) => {
    const beforeAt = reply.slice(0, mentionIndex)
    const afterCursor = reply.slice(replyInputRef.current?.selectionStart || reply.length)
    const newText = `${beforeAt}@${userName} ${afterCursor}`
    setReply(newText)
    setMentionIndex(-1)
    setTimeout(() => {
      if (replyInputRef.current) {
        replyInputRef.current.focus()
        const newCursorPos = beforeAt.length + userName.length + 2
        replyInputRef.current.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 50)
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (mentionDropdownRef.current &&
        !mentionDropdownRef.current.contains(event.target) &&
        replyInputRef.current &&
        !replyInputRef.current.contains(event.target)) {
        setMentionIndex(-1)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const sendReply = async () => {
    if (!reply.trim() && !replyAttachment) return
    if (isSendingReply) return

    setIsSendingReply(true)
    try {
      let finalMessageText = reply.trim()

      if (replyAttachment) {
        // Upload file first
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(replyAttachment.file)
        })

        const data = await api.post({
          action: 'upload_file',
          filename: replyAttachment.name,
          mimeType: replyAttachment.type,
          base64: base64Data.split(',')[1],
          projectName: task.client || 'General',
          department: task.department || 'COMMON',
          userEmail: profile?.email || ''
        })
        if (data.ok) {
          finalMessageText = `[Attachment:${replyAttachment.name}|${replyAttachment.type}|${data.downloadUrl || data.url}]${finalMessageText}`
        } else {
          throw new Error(data.error)
        }
      }

      const tempId = String(Date.now())
      const isoTimestamp = new Date().toISOString()
      const now = formatTime()

      const newMessage = {
        id: tempId,
        type: 'sent',
        text: finalMessageText,
        time: now,
        timestamp: isoTimestamp
      }

      setMessagesByChatId(prev => ({
        ...prev,
        [task.id]: [...(prev[task.id] || []), newMessage]
      }))

      const payload = {
        id: tempId,
        action: 'send',
        roomId: String(task.id),
        senderId: profile?.email || 'mansi@dreamsdesign.in',
        senderName: profile?.name || 'User',
        message: finalMessageText,
        timestamp: new Date().toLocaleString('en-US', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).replace(/(\d+)\/(\d+)\/(\d+),/, '$3-$1-$2'),
        type: 'task_reply',
        groupName: task.title
      }

      import('../context/AppContext.jsx').then(({ mqttClient }) => {
        if (mqttClient && mqttClient.connected) {
          mqttClient.publish('dd_chat_engine_v1/' + task.id, JSON.stringify(payload))
        }
      })

      api.post(payload).catch(e => console.warn(e))

      // Webhook fallback already catches this

      setReply('')
      setReplyAttachment(null)

    } catch (err) {
      console.error(err)
      addToast("Failed to send reply: " + err.message, 'error')
    } finally {
      setIsSendingReply(false)
    }
  }

  const handleReplyPaste = (e) => {
    const cd = e.clipboardData
    if (!cd) return
    let blob = null
    let name = 'pasted-image.png'
    let type = 'image/png'

    if (cd.items) {
      for (let i = 0; i < cd.items.length; i++) {
        if (cd.items[i].type.startsWith('image/')) {
          e.preventDefault()
          blob = cd.items[i].getAsFile()
          if (blob) {
            name = blob.name || 'pasted-image.png'
            type = blob.type
          }
          break
        }
      }
    }
    if (!blob && cd.files && cd.files.length > 0) {
      for (let i = 0; i < cd.files.length; i++) {
        if (cd.files[i].type.startsWith('image/')) {
          e.preventDefault()
          blob = cd.files[i]
          if (blob) {
            name = blob.name || 'pasted-image.png'
            type = blob.type
          }
          break
        }
      }
    }
    if (!blob) return

    if (blob.size > 4 * 1024 * 1024) {
      setInfoModal({
        title: 'File Too Large',
        message: 'File size should be less than 4MB',
        icon: 'warning',
        color: 'text-[#f59e0b]'
      })
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      setReplyAttachment({
        name,
        type,
        dataUrl: event.target.result,
        file: blob
      })
      addToast('Screenshot pasted — click Send to post it', 'success')
    }
    reader.readAsDataURL(blob)
  }

  const scrollToMessage = (msgId, sender, text) => {
    document.querySelectorAll('.reply-highlight').forEach(el => el.classList.remove('reply-highlight'))

    let el = null
    if (msgId) {
      el = document.getElementById(`msg-${msgId}`)
    }

    if (!el && sender && text) {
      const candidates = document.querySelectorAll('[id^="msg-"]')
      for (const candidate of candidates) {
        if (candidate.textContent.includes(sender) && candidate.textContent.includes(text.substring(0, 30))) {
          el = candidate
          break
        }
      }
    }

    if (el) {
      el.classList.add('reply-highlight')
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => el.classList.remove('reply-highlight'), 2500)
    } else {
      addToast('Original message not available', 'warning')
    }
  }

  const handleLike = (commentId) => {
    const updated = (task.comments || []).map((c) =>
      c.id === commentId ? { ...c, likes: (c.likes || 0) + 1 } : c
    )
    updateTask(task.id, { comments: updated })
  }

  const handleStatusChange = (newStatus) => {
    updateTask(task.id, {
      status: newStatus,
      done: newStatus === 'Done',
    })

    if (newStatus === 'Done') {
      const due = new Date(task.dueDate)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (!task.dueDate || today <= due) {
        import('canvas-confetti').then((confetti) => {
          confetti.default({ particleCount: 150, spread: 70, origin: { y: 0.6 } })
        })
        setTimeout(() => {
          navigate('/tasks', { state: { viewMode: 'Board' } })
        }, 1500)
        return
      }
    }

    setInfoModal({
      title: 'Status Updated',
      message: `Status saved: ${newStatus}`,
      icon: 'check_circle',
      color: 'text-[#25d366]'
    })
  }

  const taskMessages = messagesByChatId?.[task.id] || []
  const processedMessages = processMessagesList(taskMessages, profile)

  // Add legacy remarks as system messages
  const legacyComments = (task.comments || [])
    .filter((c) => !(c.type === 'system' && c.text?.startsWith('Status changed to ')))
    .map(c => {
      return {
        id: `legacy_${c.id}`,
        type: c.type === 'self' ? 'sent' : (c.type === 'other' ? 'received' : 'system'),
        sender: c.author,
        text: c.text,
        time: c.time
      }
    })

  const allMessages = [...legacyComments, ...processedMessages]

  const mentionableUsers = Array.from(new Set([
    ...(task.assignedTo || '').split(',').map(s => s.trim()).filter(Boolean),
    (task.assignedBy || '').trim(),
    ...(employees || []).map(e => e.name).filter(Boolean)
  ].filter(Boolean)))

  const myNameStr = String(profile?.name || 'User').trim().toLowerCase()
  const myEmailStr = String(profile?.email || '').trim().toLowerCase()
  const isAssignee = String(task?.assignedTo || '').toLowerCase().includes(myNameStr) || String(task?.assignedEmail || '').toLowerCase().includes(myEmailStr)
  const isAssigner = String(task?.assignedBy || '').toLowerCase() === myNameStr
  const restrictedDepts = ['HR', 'ACCOUNT', 'SALES']
  const taskDept = (task?.department || '').toUpperCase()
  const role = profile?.systemRole || 'Employee'
  const canManageTask = isAssigner || role === 'Admin'
  const canEditSubtask = (st) => role === 'Admin' || isSubtaskAssignee(st)
  const isSameDept = (role === 'HR' && taskDept === 'HR') || (role === 'Accountant' && taskDept === 'ACCOUNT') || (role === 'Sales' && taskDept === 'SALES')
  const canManageTimer = isAssignee || isAssigner || role === 'Admin' || isSameDept || (role !== 'Employee' && !restrictedDepts.includes(taskDept))

  if (!task || !task.id) {
    return (
      <div className="bg-[#F0EDF8] font-['Inter',sans-serif] text-[#151c27] overflow-hidden h-screen flex">
        <Sidebar />
        <main className="page-main">
          <TopNav title="Loading Task..." showSearch={false} />
          <div className="flex-1 flex items-center justify-center animate-pulse">
            <p className="text-secondary text-sm font-medium">Loading task details...</p>
          </div>
        </main>
      </div>
    )
  }

  if (!isPunchedIn) {
    return (
      <div className="bg-[#F0EDF8] font-['Inter',sans-serif] text-[#151c27] overflow-hidden h-screen flex">
        <Sidebar />
        <main className="page-main">
          <TopNav title="Punched Out" showSearch={false} />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md bg-white p-8 rounded-xl shadow-sm border border-gray-100">
              <span className="material-symbols-outlined text-[48px] text-gray-300 mb-4 block">work_off</span>
              <h2 className="text-[18px] font-bold text-[#1E1B2E] mb-2">You are currently Punched Out</h2>
              <p className="text-[13px] text-gray-500">Please Punch In from the top navigation bar to view and edit this task.</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!canViewTask) {
    return (
      <div className="bg-[#F0EDF8] font-['Inter',sans-serif] text-[#151c27] overflow-hidden h-screen flex">
        <Sidebar />
        <main className="page-main">
          <TopNav title="Access Denied" showSearch={false} />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <span className="material-symbols-outlined text-[48px] text-gray-300 mb-4 block">lock</span>
              <h2 className="text-[18px] font-bold text-[#1E1B2E] mb-2">Access Restricted</h2>
              <p className="text-[13px] text-gray-500">Only assigned users can view this task's details.</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="bg-[#f9f9ff] font-['Inter',sans-serif] text-[#151c27] overflow-hidden h-screen flex">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F8; border-radius: 10px; }
      `}</style>

      <Sidebar />

      <main className="page-main">
        <TopNav title={task.title} showSearch={true} />

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8 animate-fade-in-up">
          <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8">
            {/* LEFT COLUMN */}
            <div className="flex-1 flex flex-col gap-8">
              {/* Header */}
              <div>
                <button
                  onClick={() => navigate('/tasks')}
                  className="flex items-center gap-2 text-[#4B5563] hover:text-[#702c91] font-semibold text-[14px] bg-transparent border-none cursor-pointer p-0 mb-6 transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                  My Tasks
                </button>

                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <span className="bg-[#E5E7EB] text-[#4B5563] text-[11px] font-bold px-3 py-1 rounded-full">{task.id}</span>
                  <h1 className="text-[28px] font-black text-[#1E1B2E] m-0 flex items-center gap-2">
                    {isEditingTitle ? (
                      <input
                        autoFocus
                        value={editTitleContent}
                        onChange={(e) => setEditTitleContent(e.target.value)}
                        onBlur={() => {
                          if (editTitleContent.trim() && editTitleContent !== task.title) {
                            updateTask(task.id, { title: editTitleContent.trim() })
                          }
                          setIsEditingTitle(false)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.target.blur()
                          if (e.key === 'Escape') { setEditTitleContent(task.title); setIsEditingTitle(false) }
                        }}
                        className="text-[28px] font-black text-[#1E1B2E] bg-transparent border-b-2 border-[#702c91] outline-none w-full min-w-[200px]"
                        style={{ fontFamily: 'inherit' }}
                      />
                    ) : (
                      <>
                        <span>{task.title}</span>
                        {(isAssignee || isAssigner || role === 'Admin') && !isTaskDone && (
                          <button
                            onClick={() => { setEditTitleContent(task.title); setIsEditingTitle(true) }}
                            className="material-symbols-outlined text-[20px] text-gray-400 hover:text-[#702c91] transition-colors bg-transparent border-none cursor-pointer p-0 leading-none"
                            title="Edit title"
                          >
                            edit
                          </button>
                        )}
                      </>
                    )}
                    {task.isRecurring ? (
                      <span
                        className="material-symbols-outlined text-[24px] text-primary bg-primary/10 rounded-full p-1"
                        title={`Recurring Task (${task.recurringSchedule})`}
                      >
                        event_repeat
                      </span>
                    ) : task.isAutoGenerated ? (
                      <span
                        className="material-symbols-outlined text-[24px] text-primary/70 bg-primary/5 rounded-full p-1 cursor-default"
                        title="Auto-generated from a recurring task"
                      >
                        event_repeat
                      </span>
                    ) : (
                      <button
                        onClick={() => { if (!isTaskDone) setShowRecurringModal(true) }}
                        disabled={isTaskDone}
                        className={`material-symbols-outlined text-[24px] transition-colors focus:outline-none border-none bg-transparent ${isTaskDone ? 'text-gray-300 cursor-not-allowed' : 'text-[#9CA3AF] hover:text-[#702c91] cursor-pointer'}`}
                        title={isTaskDone ? "Cannot make recurring when done" : "Make this a recurring task"}
                      >
                        repeat
                      </button>
                    )}
                  </h1>
                  <button onClick={() => {
                    navigator.clipboard.writeText(`Task: ${task.id} - ${task.title}\nLink: ${window.location.href}`);
                    addToast("Task details copied!", "success");
                  }} className="bg-transparent border-none cursor-pointer text-[#702c91] hover:text-[#702c91]/80 p-0 flex items-center justify-center transition-colors">
                    <span className="material-symbols-outlined text-[20px]">content_copy</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {task.client && (
                    <span className="bg-purple-50 text-purple-700 border border-purple-100 text-[12px] font-bold px-3 py-1.5 rounded-full">{task.client}</span>
                  )}
                  <span className={`border text-[12px] font-bold px-3 py-1.5 rounded-full ${task.priority === 'High' ? 'bg-red-50 text-red-600 border-red-100' :
                    task.priority === 'Medium' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                      'bg-blue-50 text-blue-600 border-blue-100'
                    }`}>
                    {task.priority || 'Medium'} Priority
                  </span>
                  {(() => {
                    let isDoneLate = false;
                    if (task.status === 'Done' && task.dueDate && task.statusUpdatedOn) {
                      const due = new Date(task.dueDate);
                      const updated = new Date(task.statusUpdatedOn);
                      due.setHours(23, 59, 59, 999);
                      if (updated > due) isDoneLate = true;
                    }
                    return (
                      <span className={`text-[12px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1 border ${task.status === 'Done'
                          ? (isDoneLate ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-green-50 text-green-600 border-green-100')
                          : task.status === 'In Progress' ? 'bg-blue-50 text-blue-600 border-blue-100'
                            : task.status === 'In Review' ? 'bg-purple-50 text-purple-600 border-purple-100'
                              : 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}>
                        {task.status === 'Done' && <span className="material-symbols-outlined text-[14px]">check_circle</span>}
                        {task.status === 'Done' && isDoneLate ? 'Done (Late)' : (task.status || 'To Do')}
                      </span>
                    )
                  })()}
                  {task.dueDate && (
                    <button className="bg-gray-50 border border-gray-200 text-gray-500 rounded-full w-8 h-8 flex items-center justify-center hover:bg-gray-100 cursor-pointer transition-colors border-none" title={`Due: ${task.dueDate}`}>
                      <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                    </button>
                  )}
                  <span
                    onClick={() => {
                      if (canManageTask && !isTaskDone) {
                        const emails = (task.assignedEmail || '').split(',').map(s => s.trim()).filter(Boolean)
                        setSelectedAssignees(emails.length > 0 ? emails : (task.assignedTo || '').split(',').map(s => s.trim()).filter(Boolean))
                        setIsAssigneeModalOpen(true)
                      }
                    }}
                    className={`bg-gray-100 text-gray-600 border border-gray-200 text-[12px] font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 ${canManageTask && !isTaskDone ? 'cursor-pointer hover:bg-purple-50 hover:border-purple-200 hover:text-[#702c91] transition-colors' : ''}`}
                  >
                    <span className="material-symbols-outlined text-[14px]">person</span>
                    Assigned to: {task.assignedTo || ''}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {task.assignedBy && (
                    <span className="bg-gray-100 text-gray-600 border border-gray-200 text-[12px] font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[14px]">assignment_ind</span>
                      Assigned by: {task.assignedBy}
                    </span>
                  )}
                  {profile?.systemRole === 'Admin' && (
                    <button
                      onClick={() => { if (!isTaskDone) setTaskToDelete(task.id) }}
                      disabled={isTaskDone}
                      className={`bg-white border text-[12px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1 transition-colors ${isTaskDone ? 'border-gray-200 text-gray-400 cursor-not-allowed' : 'border-red-200 text-red-500 hover:bg-red-50 cursor-pointer'}`}
                      title={isTaskDone ? "Cannot delete done task" : "Delete Task"}
                    >
                      <span className="material-symbols-outlined text-[14px]">delete</span>
                      Delete Task
                    </button>
                  )}
                </div>
              </div>
              {/* Time Tracker */}
              <div className="flex flex-col gap-2 w-full">
                {/* Individual Time Breakdown */}
                {(() => {
                  const timeData = parseMultiUserTimeStr(task.timeTaken);
                  const entries = Object.entries(timeData);
                  if (entries.length > 0 && !(entries.length === 1 && entries[0][0] === 'legacy')) {
                    const myName = profile?.name || 'User';
                    return (
                      <div className="flex flex-wrap gap-2">
                        {entries.map(([name, secs]) => (
                          <span key={name} className="bg-gray-50 border border-gray-200 text-[11px] font-bold text-gray-500 px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm">
                            <span className="material-symbols-outlined text-[14px]">person</span>
                            {name}: <span className="text-[#702c91]">{formatTimeStr(name === myName && isTracking ? secs + sessionSecs : secs)}</span>
                          </span>
                        ))}
                      </div>
                    )
                  }
                  return null;
                })()}

                <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 flex items-center justify-between shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-purple-900/5">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center">
                      <span className={`material-symbols-outlined ${isTracking ? 'text-[#25d366] animate-pulse' : 'text-gray-500'}`}>timer</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest m-0 mb-1">Your Tracked Time</p>
                      <h3 className={`text-[18px] font-black m-0 ${isTracking ? 'text-[#25d366]' : 'text-[#1E1B2E]'}`}>
                        {(() => {
                          const timeData = parseMultiUserTimeStr(task.timeTaken);
                          const myName = profile?.name || 'User';
                          const mySecs = timeData[myName] || 0;
                          return isTracking ? formatTimeStr(mySecs + sessionSecs) : formatTimeStr(mySecs);
                        })()}
                      </h3>
                    </div>
                  </div>

                  {canManageTimer && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { if (!isTaskDone) toggleTimer(task, profile?.name) }}
                        disabled={isTracking || isTaskDone}
                        className={`border-none text-[13px] font-bold px-5 py-2.5 rounded-md flex items-center gap-2 shadow-sm transition-colors ${isTaskDone ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : (!isTracking ? 'bg-[#EF4444] hover:bg-[#DC2626] text-white cursor-pointer' : 'bg-gray-100 text-gray-400 cursor-not-allowed')}`}
                        title={isTaskDone ? "Cannot track time on done task" : ""}
                      >
                        <span className={`material-symbols-outlined text-[16px] ${!isTracking ? 'font-variation-fill' : ''}`}>play_arrow</span>
                        Start
                      </button>
                      <button
                        onClick={() => { if (!isTaskDone) toggleTimer(task, profile?.name) }}
                        disabled={!isTracking || isTaskDone}
                        className={`border-none text-[13px] font-bold px-5 py-2.5 rounded-md flex items-center gap-2 shadow-sm transition-colors ${isTaskDone ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : (isTracking ? 'bg-gray-800 hover:bg-black text-white cursor-pointer' : 'bg-gray-100 text-gray-400 cursor-not-allowed')}`}
                        title={isTaskDone ? "Cannot track time on done task" : ""}
                      >
                        <span className="material-symbols-outlined text-[16px]">stop</span>
                        Stop
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <section>
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-black text-[#4B5563] uppercase tracking-wider mb-4 flex items-center gap-2 m-0">
                    Description
                    {(profile?.name === task.assignedBy || role === 'Admin') && !isEditingDescription && !isTaskDone && (
                      <span
                        onClick={handleEditDescriptionClick}
                        className="material-symbols-outlined text-[16px] text-gray-400 cursor-pointer hover:text-[#702c91] ml-2"
                        title="Edit Description"
                      >
                        edit
                      </span>
                    )}
                  </h3>
                  {task.description?.editedAt && !isEditingDescription && (
                    <span className="text-[10px] text-secondary italic ml-auto">
                      Edited: {formatDateTime(task.description.editedAt)}
                    </span>
                  )}
                </div>

                {isEditingDescription ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={editDescriptionContent}
                      onChange={e => setEditDescriptionContent(e.target.value)}
                      className="w-full min-h-[150px] p-3 bg-surface border border-primary/40 focus:border-primary rounded-lg text-[14px] text-on-surface outline-none resize-y transition-colors custom-scrollbar shadow-sm"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setIsEditingDescription(false)}
                        className="px-3 py-1.5 text-[12px] font-medium text-secondary hover:bg-surface-container-low rounded-md transition-colors border border-transparent"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveDescription}
                        className="px-3 py-1.5 text-[12px] font-medium btn-gradient rounded-md transition-opacity shadow-sm"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-[15px] leading-relaxed text-[#3D3D3D] space-y-4 whitespace-pre-wrap">
                    <p><LinkifiedText text={task.description.intro} /></p>
                    {task.description.bullets && task.description.bullets.length > 0 && (
                      <ul className="list-disc pl-6 space-y-2">
                        {task.description.bullets.map((b, i) => (
                          <li key={i}><LinkifiedText text={b} /></li>
                        ))}
                      </ul>
                    )}
                    {task.description.outro && <p><LinkifiedText text={task.description.outro} /></p>}
                  </div>
                )}
                <div className="h-[1px] w-full bg-gray-200 my-6"></div>
              </section>

              {/* Subtasks */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-black text-[#4B5563] uppercase tracking-wider mb-4 flex items-center gap-2 m-0">
                    <span className="material-symbols-outlined text-[18px]">checklist</span>
                    Subtasks
                  </h3>
                </div>

                {/* List of existing subtasks */}
                {subtasks.length > 0 && (
                  <div className="space-y-2">
                    {subtasks.map((st) => (
                      <div key={st.id} className="flex items-center gap-3 p-3 bg-gray-50 border border-[#E5E7EB] rounded-xl transition-colors hover:border-[#702c91]/30">
                        <input
                          type="checkbox"
                          checked={st.status === 'Done'}
                          disabled={isTaskDone || !isSubtaskAssignee(st)}
                          onChange={(e) => {
                            if (isTaskDone) return;
                            const newStatus = e.target.checked ? 'Done' : 'Pending'
                            updateTask(st.id, { status: newStatus, statusUpdatedOn: newStatus === 'Done' ? new Date().toISOString() : '' })
                            if (newStatus === 'Done') {
                              const allDone = subtasks
                                .filter(s => s.id !== st.id)
                                .every(s => s.status === 'Done')
                              if (allDone) {
                                updateTask(task.id, { status: 'Done', statusUpdatedOn: new Date().toISOString() })
                              }
                            }
                          }}
                          className={`w-5 h-5 accent-primary rounded ${isTaskDone || !isSubtaskAssignee(st) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                        />
                        <div className={`flex-1 ${st.status === 'Done' ? 'line-through text-secondary' : 'text-on-surface'}`}>
                          <p className={`font-medium text-[14px] ${st.overdue ? 'text-urgent-red' : ''}`}>{st.title}</p>
                          {st.status === 'Done' && st.statusUpdatedOn && (
                            <p className="text-[10px] text-gray-400 mt-0.5 font-normal">
                              {formatDateTime(st.statusUpdatedOn)}
                            </p>
                          )}
                        </div>
                        {st.priority && (
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold shrink-0 ${st.priority === 'Urgent' ? 'bg-urgent-red/10 border-urgent-red/30 text-urgent-red' :
                            st.priority === 'High' ? 'bg-orange-500/10 border-orange-500/30 text-orange-600' :
                              st.priority === 'Medium' ? 'bg-amber-500/10 border-amber-500/30 text-amber-600' :
                                'bg-blue-500/10 border-blue-500/30 text-blue-600'
                            }`}>
                            <span className="material-symbols-outlined text-[12px]">flag</span>
                            {st.priority}
                          </div>
                        )}
                        {st.dueDate && (
                          <div className="flex items-center gap-1.5 bg-surface-container px-2.5 py-1 rounded-full border border-outline-variant/50 shrink-0">
                            <span className="material-symbols-outlined text-[13px] text-secondary">calendar_month</span>
                            <span className="text-[11px] font-bold text-secondary">{new Date(st.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          </div>
                        )}
                        {st.assignedTo && (
                          <div className="flex items-center gap-1.5 bg-surface-container px-2.5 py-1 rounded-full border border-outline-variant/50 shrink-0">
                            <span className="material-symbols-outlined text-[13px] text-secondary">person</span>
                            <span className="text-[11px] font-bold text-secondary truncate max-w-[150px]">{st.assignedTo.split(',').map(n => n.trim()).filter(Boolean).join(', ')}</span>
                          </div>
                        )}
                        {!isTaskDone && (
                          <>
                            {(() => {
                              const subTracking = activeTimer?.taskId === st.id
                              return (
                                <button
                                  onClick={() => toggleTimer(st, profile?.name)}
                                  disabled={subTracking ? false : (activeTimer !== null && activeTimer.taskId !== st.id)}
                                  className={`p-1.5 rounded-full transition-colors shrink-0 border-none flex items-center justify-center ${
                                    subTracking
                                      ? 'text-white bg-[#EF4444] hover:bg-[#DC2626] shadow-sm'
                                      : activeTimer !== null
                                        ? 'text-gray-300 cursor-not-allowed'
                                        : 'text-[#702c91] bg-purple-50 hover:bg-purple-100'
                                  }`}
                                  title={subTracking ? 'Stop timer' : activeTimer !== null ? 'Another timer is running' : 'Start timer'}
                                >
                                  <span className="material-symbols-outlined text-[16px]">{subTracking ? 'stop' : 'play_arrow'}</span>
                                </button>
                              )
                            })()}
                            <span className="text-[10px] font-bold text-gray-400 min-w-[40px] text-center">
                              {(() => {
                                const td = parseMultiUserTimeStr(st.timeTaken);
                                const myName = profile?.name || 'User';
                                const secs = td[myName] || 0;
                                const isSubTracking = activeTimer?.taskId === st.id;
                                const totalSecs = isSubTracking ? secs + (activeTimer ? Math.floor(getActiveTimerMs(activeTimer) / 1000) : 0) : secs;
                                if (totalSecs === 0) return '';
                                const h = Math.floor(totalSecs / 3600);
                                const m = Math.floor((totalSecs % 3600) / 60);
                                return h > 0 ? `${h}h ${m}m` : `${m}m`;
                              })()}
                            </span>
                          </>
                        )}
                        {!isTaskDone && canEditSubtask(st) && (
                          <button
                            onClick={() => openEditSubtask(st)}
                            className="p-1 transition-colors shrink-0 text-secondary hover:text-primary cursor-pointer border-none flex items-center justify-center"
                            title="Edit Subtask"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                        )}
                        {profile?.systemRole !== 'Employee' && (
                          <button
                            onClick={() => { if (!isTaskDone) setSubtaskToDelete(st.id) }}
                            disabled={isTaskDone}
                            className={`p-1 transition-colors shrink-0 ${isTaskDone ? 'text-gray-300 cursor-not-allowed' : 'text-secondary hover:text-urgent-red cursor-pointer'}`}
                            title={isTaskDone ? "Cannot delete when task is done" : "Delete Subtask"}
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new subtask inline creator */}
                {!isSubtaskInputActive ? (
                  <button
                    onClick={() => { if (!isTaskDone) setIsSubtaskInputActive(true) }}
                    disabled={isTaskDone}
                    className={`bg-transparent border-none flex items-center gap-2 text-[13px] font-semibold p-0 transition-colors mt-4 ${isTaskDone ? 'text-gray-300 cursor-not-allowed' : 'text-[#6B7280] hover:text-[#1E1B2E] cursor-pointer'}`}
                  >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    Add subtask
                  </button>
                ) : (
                  <div className="flex flex-col gap-3 mt-4 bg-white p-4 rounded-xl border border-[#702c91]/40 focus-within:border-[#702c91] transition-colors shadow-sm">
                    <div className="flex items-center gap-2 border-b border-[#E5E7EB] pb-2">
                      <span className="material-symbols-outlined text-secondary text-[18px]">radio_button_unchecked</span>
                      <input
                        type="text"
                        placeholder="Task Name or type '/' for commands"
                        value={newSubtaskTitle}
                        onChange={e => setNewSubtaskTitle(e.target.value)}
                        autoFocus
                        className="flex-1 bg-transparent border-none focus:ring-0 text-[14px] outline-none w-full p-0 text-on-surface"
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleAddSubtask()
                          if (e.key === 'Escape') setIsSubtaskInputActive(false)
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Assignee Selector (multi-select) */}
                        <div className="relative" ref={subtaskAssigneeRef}>
                          <button
                            type="button"
                            onClick={() => { setIsSubtaskAssigneeOpen(o => { if (o) setSubtaskAssigneeSearch(''); return !o }) }}
                            className={`flex items-center gap-1.5 bg-surface-container hover:bg-surface-container-high border border-outline-variant/50 rounded-lg h-[32px] px-2.5 cursor-pointer transition-colors ${isSubtaskAssigneeOpen ? 'border-primary' : ''}`}
                            title="Assign to multiple users"
                          >
                            <span className="material-symbols-outlined text-[14px] text-secondary">person</span>
                            <span className="text-[12px] font-bold text-secondary max-w-[120px] truncate">
                              {newSubtaskAssignee.length > 0 ? newSubtaskAssignee.join(', ') : 'Assign'}
                            </span>
                            {newSubtaskAssignee.length > 0 && (
                              <span className="bg-primary text-white text-[10px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center">{newSubtaskAssignee.length}</span>
                            )}
                            <span className="material-symbols-outlined text-[14px] text-secondary">{isSubtaskAssigneeOpen ? 'expand_less' : 'expand_more'}</span>
                          </button>

                          {isSubtaskAssigneeOpen && (
                            <div className="absolute top-full left-0 mt-1 w-[220px] bg-white border border-outline-variant/50 rounded-lg shadow-xl z-50 flex flex-col max-h-[220px] overflow-hidden animate-fade-in-up">
                              <div className="p-2 border-b border-gray-100 bg-white sticky top-0 z-10">
                                <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5">
                                  <span className="material-symbols-outlined text-[14px] text-gray-400">search</span>
                                  <input
                                    type="text"
                                    value={subtaskAssigneeSearch}
                                    onChange={(e) => setSubtaskAssigneeSearch(e.target.value)}
                                    placeholder="Search users..."
                                    className="w-full bg-transparent text-[12px] font-bold text-gray-700 outline-none placeholder:text-gray-400"
                                    autoFocus
                                  />
                                </div>
                              </div>
                              <div className="overflow-y-auto custom-scrollbar p-1 flex flex-col gap-0.5">
                                {mainTaskAssignees
                                  .filter(m => m.name.toLowerCase().includes(subtaskAssigneeSearch.trim().toLowerCase()))
                                  .map((m) => {
                                    const isChecked = newSubtaskAssignee.includes(m.name)
                                    return (
                                      <label key={m.email || m.name} className="flex items-center gap-2 px-3 py-2 hover:bg-purple-50/60 rounded-md cursor-pointer transition-colors">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setNewSubtaskAssignee([...newSubtaskAssignee, m.name])
                                            } else {
                                              setNewSubtaskAssignee(newSubtaskAssignee.filter(n => n !== m.name))
                                            }
                                          }}
                                          className="accent-[#702c91] w-4 h-4 cursor-pointer"
                                        />
                                        <span className="text-[13px] text-gray-700 font-semibold truncate">{m.name}</span>
                                      </label>
                                    )
                                  })}
                                {mainTaskAssignees.filter(m => m.name.toLowerCase().includes(subtaskAssigneeSearch.trim().toLowerCase())).length === 0 && (
                                  <div className="p-3 text-[12px] text-gray-400 text-center font-semibold">No main task assignees match "{subtaskAssigneeSearch}"</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Due Date Selector */}
                        <div className="relative group flex items-center bg-surface-container hover:bg-surface-container-high border border-outline-variant/50 rounded-lg h-[32px] overflow-hidden transition-colors w-[120px]">
                          <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[14px] text-secondary group-hover:text-primary transition-colors pointer-events-none">calendar_month</span>
                          <input
                            type="date"
                            value={newSubtaskDueDate}
                            onChange={handleDueDateChange}
                            className="bg-transparent text-[12px] font-medium focus:ring-0 border-none outline-none p-0 cursor-pointer text-secondary group-hover:text-primary w-full h-full pl-7 pr-1 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:w-full"
                            title="Due Date"
                          />
                        </div>

                        {/* Priority Selector */}
                        <SelectDropdown value={newSubtaskPriority} onChange={setNewSubtaskPriority} options={['Low', 'Medium', 'High', 'Urgent']} style={{ minHeight: 32, fontSize: 12 }} />
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setIsSubtaskInputActive(false)}
                          className="px-3 py-1.5 rounded-lg text-secondary hover:bg-surface-container-high text-[13px] font-medium transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddSubtask}
                          disabled={!newSubtaskTitle.trim()}
                          className="btn-gradient px-4 py-1.5 rounded-lg font-bold text-[13px] transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                        >
                          Save
                          <span className="material-symbols-outlined text-[14px]">keyboard_return</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* Comments / Replies Section */}
              <div className="mt-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-[13px] font-black text-[#702c91] uppercase tracking-wider flex items-center gap-2 m-0">
                    Task Replies & Updates
                  </h3>
                  <button
                    onClick={() => setShowBgModal(true)}
                    className="border-none cursor-pointer bg-transparent text-[#9CA3AF] hover:text-[#702c91] transition-colors flex items-center gap-1 p-1"
                    title="Change Chat Wallpaper"
                  >
                    <span className="material-symbols-outlined text-[18px]">wallpaper</span>
                  </button>
                </div>

                <div className="flex justify-center mb-6">
                  <button className="bg-transparent border-none text-[#702c91] font-bold text-[12px] hover:underline cursor-pointer p-0">
                    Load earlier replies
                  </button>
                </div>

                <div ref={scrollRef} className="space-y-8 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar"
                  style={{
                    backgroundColor: CHAT_BACKGROUNDS.find(bg => bg.id === (chatBackgrounds[task.id] || 'default'))?.bgColor || '#f9f9ff',
                    backgroundImage: CHAT_BACKGROUNDS.find(bg => bg.id === (chatBackgrounds[task.id] || 'default'))?.bgImage || 'none',
                    backgroundSize: CHAT_BACKGROUNDS.find(bg => bg.id === (chatBackgrounds[task.id] || 'default'))?.bgSize || 'auto',
                    backgroundPosition: 'center',
                    backgroundRepeat: CHAT_BACKGROUNDS.find(bg => bg.id === (chatBackgrounds[task.id] || 'default'))?.bgSize === 'auto' ? 'repeat' : 'no-repeat',
                    borderRadius: 12,
                    padding: 12
                  }}
                >
                  {allMessages.map((m, index) => {
                    if (m.type === 'system' || m.type === 'divider') {
                      return (
                        <div key={index} className="relative flex items-center justify-center py-2">
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-[#E5E7EB]"></div>
                          </div>
                          <div className="relative bg-white/80 backdrop-blur-sm px-4">
                            <p className={`text-[12px] text-[#6B6B6B] ${m.type === 'system' ? 'italic' : 'font-bold'} font-['Inter']`}>
                              {m.label || m.text}
                            </p>
                          </div>
                        </div>
                      )
                    }

                    if (m.type === 'received') {
                      return (
                        <div key={index} id={`msg-${m.id}`} className="flex items-start gap-3">
                          {renderAvatar(null, m.sender, "w-9 h-9 rounded-full mt-1")}
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] font-semibold font-['Inter'] text-on-surface">
                                {m.sender}
                              </span>
                              <span className="text-[11px] font-normal font-['Inter'] text-[#6B6B6B]">
                                {m.time}
                              </span>
                            </div>
                            <div className="bg-white p-4 rounded-xl rounded-tl-none border border-[#E5E7EB] max-w-md shadow-sm">
                              {renderMessageText(m.text, false, m.isDeleted, employees.map(e => e.name), (url) => setLightboxUrl(url), scrollToMessage)}
                            </div>
                          </div>
                        </div>
                      )
                    }

                    // Self message (type === 'sent')
                    return (
                      <div key={index} id={`msg-${m.id}`} className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11px] font-normal font-['Inter'] text-[#6B6B6B]">
                            {m.time}
                          </span>
                          <span className="text-[14px] font-semibold font-['Inter'] text-on-surface">
                            {m.sender || profile?.name}
                          </span>
                          {renderAvatar(profile?.avatar, profile?.name, "w-9 h-9 rounded-full", "text-[14px]", profile?.email)}
                        </div>
                        <div className="bg-[#702c91] p-4 rounded-xl rounded-tr-none max-w-md shadow-sm">
                          <div className="text-white text-body-sm">
                            {renderMessageText(m.text, true, m.isDeleted, employees.map(e => e.name), (url) => setLightboxUrl(url), scrollToMessage)}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Bottom Input */}
                <div className="mt-6">
                  <div className="relative">
                    {/* Mention Dropdown — outside overflow-hidden div so it's not clipped */}
                    {mentionIndex !== -1 && (
                      <div
                        ref={mentionDropdownRef}
                        className="absolute bottom-full mb-2 left-4 w-64 bg-surface rounded-xl shadow-lg border border-divider overflow-hidden z-50 card-shadow"
                      >
                        <div className="max-h-[200px] overflow-y-auto">
                          {mentionableUsers
                            .filter(u => u.toLowerCase().includes(mentionFilter.toLowerCase()))
                            .map((userName, idx) => (
                              <button
                                key={idx}
                                onClick={() => selectMention(userName)}
                                className="w-full text-left px-4 py-2 hover:bg-black/5 text-label-md font-medium text-on-surface flex items-center gap-2 transition-colors"
                              >
                                {renderAvatar(null, userName, "w-6 h-6 rounded-full")}
                                {userName}
                              </button>
                            ))}
                          {mentionableUsers.filter(u => u.toLowerCase().includes(mentionFilter.toLowerCase())).length === 0 && (
                            <div className="px-4 py-3 text-body-sm text-secondary italic">No matching task members</div>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-purple-900/5">
                      <textarea
                        ref={replyInputRef}
                        disabled={isTaskDone}
                        className={`w-full min-h-[120px] p-4 border-none outline-none resize-none text-[14px] text-[#1E1B2E] transition-colors ${isTaskDone ? 'bg-gray-100 cursor-not-allowed' : 'bg-[#F9F4FB] focus:bg-[#F3E8F7]'}`}
                        placeholder={isTaskDone ? "Task is done. Chat is read-only." : "Write your reply... (type @ to mention)"}
                        value={reply}
                        onChange={handleReplyChange}
                        onKeyDown={(e) => {
                          if (isTaskDone) return;
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            sendReply()
                          }
                        }}
                        onPaste={(e) => {
                          if (!isTaskDone) handleReplyPaste(e)
                        }}
                      ></textarea>
                      {replyAttachment && (
                        <div className="flex items-center gap-3 px-3 py-2 border-t border-[#E5E7EB] bg-purple-50/40 animate-fade-in">
                          {replyAttachment.type?.startsWith('image/') ? (
                            <img src={replyAttachment.dataUrl} alt="pasted" className="w-12 h-12 object-cover rounded-lg border border-[#E5E7EB] shadow-sm" />
                          ) : (
                            <span className="material-symbols-outlined text-[20px] text-[#702c91]">insert_drive_file</span>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold text-[#1E1B2E] truncate">{replyAttachment.name}</p>
                            <p className="text-[10px] text-gray-400 font-medium">Pasted image — ready to send</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setReplyAttachment(null)}
                            className="border-none bg-transparent text-gray-400 hover:text-[#EF4444] cursor-pointer p-1 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                            title="Remove attachment"
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        </div>
                      )}
                      <div className="bg-gray-50 p-3 border-t border-[#E5E7EB] flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-[12px] text-gray-400 font-medium">
                            {reply.length} / 1000
                          </span>
                          <span className="hidden sm:inline text-[11px] text-gray-300 font-medium">
                            Ctrl+V to paste a screenshot
                          </span>
                        </div>
                        <button
                          onClick={sendReply}
                          disabled={isSendingReply || (!reply.trim() && !replyAttachment) || isTaskDone}
                          className={`border-none rounded-md px-4 py-2 text-[13px] font-bold flex items-center gap-2 shadow-sm ${isTaskDone ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'btn-gradient cursor-pointer active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed'}`}
                        >
                          {isSendingReply ? (
                            <>
                              <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                              Sending...
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-[16px]">send</span>
                              Send Reply
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="w-full lg:w-[380px] flex flex-col gap-6 shrink-0 pb-10">
              {/* Task Info Card */}
              <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-purple-900/5">
                <div className="p-4 border-b border-[#E5E7EB]">
                  <h3 className="text-[14px] font-bold text-[#1E1B2E] m-0 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#6B7280] text-[18px]">info</span>
                    Task Information
                  </h3>
                </div>
                <div className="p-5 flex flex-col gap-5">
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-[13px] text-gray-500 w-1/3 pt-1">Assigned To</span>
                    <div className="flex-1 flex flex-col items-end gap-2 text-right">
                      {(task.assignedTo || '').split(',').map((assignee, idx) => {
                        const trimmedAssignee = assignee.trim()
                        if (!trimmedAssignee) return null
                        return (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="text-[13px] font-bold text-[#1E1B2E]">{trimmedAssignee}</span>
                            {trimmedAssignee === profile.name && profile.avatar ? (
                              <img
                                className="w-6 h-6 rounded-full object-cover"
                                src={profile.avatar}
                                alt={trimmedAssignee}
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              renderAvatar(null, trimmedAssignee, "w-6 h-6 rounded-full text-[10px]")
                            )}
                          </div>
                        )
                      })}
                      {!isTaskDone && canManageTask && (
                        <button
                          onClick={() => {
                            const emails = (task.assignedEmail || '').split(',').map(s => s.trim()).filter(Boolean)
                            if (emails.length > 0) {
                              setSelectedAssignees(emails)
                            } else {
                              const names = (task.assignedTo || '').split(',').map(s => s.trim()).filter(Boolean)
                              const matchedEmails = names.map(name => {
                                const emp = employees?.find(e => e.name === name)
                                return emp ? emp.email : null
                              }).filter(Boolean)
                              setSelectedAssignees(matchedEmails.length > 0 ? [...new Set(matchedEmails)] : names)
                            }
                            setIsAssigneeModalOpen(true)
                          }}
                          className="bg-transparent border-none text-[#702c91] font-bold text-[11px] flex items-center gap-1 cursor-pointer hover:underline mt-1 p-0 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[14px]">person_add</span> Manage Assignees
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] text-gray-500 w-1/3">Assigned By</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold text-[#1E1B2E]">{task.assignedBy || 'User'}</span>
                      {task.assignedBy === profile.name && profile.avatar ? (
                        <img
                          className="w-6 h-6 rounded-full object-cover"
                          src={profile.avatar}
                          alt={task.assignedBy}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        renderAvatar(null, task.assignedBy || 'User', "w-6 h-6 rounded-full text-[10px]")
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] text-gray-500 w-1/3">Assigned Date</span>
                    <span className="text-[13px] font-bold text-[#1E1B2E]">{task.assigned}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] text-gray-500 w-1/3">Due Date</span>
                    {canManageTask && !isTaskDone ? (
                      isEditingDueDate ? (
                        <input
                          type="date"
                          value={task.dueDate || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) return;
                            const d = new Date(val + 'T00:00:00');
                            if (d.getDay() === 0) {
                              addToast('Sundays cannot be selected as a due date. Please select another day.', 'error');
                              return;
                            }
                            updateTask(task.id, { dueDate: val });
                          }}
                          onBlur={() => setIsEditingDueDate(false)}
                          autoFocus
                          className="text-[13px] font-bold text-[#1E1B2E] bg-purple-50 border border-[#702c91]/40 rounded-md px-2 py-1 outline-none w-[140px] text-right"
                        />
                      ) : (
                        <button
                          onClick={() => setIsEditingDueDate(true)}
                          className="text-[13px] font-bold text-[#1E1B2E] bg-transparent border border-dashed border-gray-300 hover:border-[#702c91]/40 rounded-md px-2 py-1 cursor-pointer hover:bg-purple-50/50 transition-colors flex items-center gap-1"
                        >
                          {task.dueDate || 'Set date'}
                          <span className="material-symbols-outlined text-[14px] text-gray-400">edit</span>
                        </button>
                      )
                    ) : (
                      <span className="text-[13px] font-bold text-[#1E1B2E]">{task.dueDate}</span>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] text-gray-500 w-1/3">Overdue</span>
                    <span className={`text-[13px] font-bold ${(!task.daysOverdue || task.daysOverdue === 'No') ? 'text-green-600' : 'text-red-500'}`}>
                      Days Overdue: {task.daysOverdue || 'No'}
                    </span>
                  </div>
                  <hr className="border-[#E5E7EB] border-t-0 my-2" />
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] text-gray-500 w-1/3">Client</span>
                    <span className="text-[13px] font-bold text-[#702c91]">{task.client}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] text-gray-500 w-1/3">Department</span>
                    <span className="text-[13px] font-bold text-[#1E1B2E]">{task.department || 'COMMON'}</span>
                  </div>
                </div>
              </div>

              {/* Update Status Card */}
              {(() => {
                const canUpdateStatus = (() => {
                  if (!profile) return false;
                  const normalizeName = (name) => {
                    if (!name) return '';
                    return String(name).toLowerCase().replace(/[^\w]/g, '').trim();
                  };
                  const myName = normalizeName(profile.name);
                  const myEmail = String(profile.email || '').trim().toLowerCase();
                  if (!myName && !myEmail) return false;

                  if (profile.systemRole !== 'Employee') return true;

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
                })();

                if (!canUpdateStatus) {
                  return (
                    <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm p-6 opacity-80">
                      <h3 className="text-[14px] font-bold text-[#1E1B2E] m-0 flex items-center gap-2 mb-4">
                        <span className="material-symbols-outlined text-[#6B7280] text-[18px]">lock</span> Update Status
                      </h3>
                      <p className="text-[12px] text-gray-500 italic m-0">Only assigned users, admins, or managers can update the status of this task.</p>
                    </div>
                  )
                }

                return (
                  <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-purple-900/5">
                    <div className="p-4 border-b border-[#E5E7EB]">
                      <h3 className="text-[14px] font-bold text-[#1E1B2E] m-0 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#6B7280] text-[18px]">update</span>
                        Update Status
                      </h3>
                    </div>
                    <div className="p-5 flex flex-col gap-4">
                      <SelectDropdown value={task.status} onChange={handleStatusChange} options={['Pending', 'In Progress', 'Review', 'Done', 'Blocked']} dropdownUp={true} />
                    </div>
                  </div>
                )
              })()}

              {/* Priority Card */}
              {(() => {
                const config = getPriorityConfig(task.priority)
                return (
                  <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-purple-900/5">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-[14px] font-bold text-[#1E1B2E] m-0">Priority</h3>
                      <span className={`${config.badgeClass} text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider`}>
                        {config.label}
                      </span>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${config.badgeClass.replace('bg-', 'bg-opacity-20 ')} bg-opacity-20`}>
                        <span className={`material-symbols-outlined ${config.textClass}`}>priority_high</span>
                      </div>
                      <div>
                        <h4 className={`text-[14px] font-bold m-0 mb-1 ${config.textClass}`}>{task.priority}</h4>
                        <p className="text-[12px] text-gray-500 m-0 leading-relaxed">
                          {config.desc}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Attachments Section */}
              <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-purple-900/5">
                <div className="p-4 border-b border-[#E5E7EB] flex justify-between items-center bg-[#FAFAFF]">
                  <h3 className="text-[14px] font-bold text-[#1E1B2E] m-0 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#6B7280] text-[18px]">link</span> Attachment Links
                  </h3>
                  <span className="text-[11px] font-bold text-pink-600">
                    {task.attachments?.length || 0} Links
                  </span>
                </div>

                <div className="p-5">
                  {/* Add Link Form */}
                  <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-4 mb-4">
                    <label className="block text-[10px] font-bold text-gray-600 mb-2 uppercase tracking-wider">LINK URL</label>
                    <input
                      type="url"
                      value={linkUrl}
                      disabled={isTaskDone}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="Paste your link here"
                      className={`w-full border rounded-md px-3 py-2 text-[13px] outline-none mb-3 ${isTaskDone ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white border-gray-200 focus:border-purple-400'}`}
                    />
                    <button
                      onClick={() => {
                        if (isTaskDone) return;
                        if (!linkUrl.trim()) {
                          addToast('Please enter a valid link URL.', 'error');
                          return;
                        }
                        let formattedUrl = linkUrl.trim();
                        if (!/^https?:\/\//i.test(formattedUrl)) {
                          formattedUrl = 'https://' + formattedUrl;
                        }

                        try {
                          new URL(formattedUrl);
                        } catch (e) {
                          addToast('Please enter a valid link URL.', 'error');
                          return;
                        }

                        const newAttachment = {
                          name: linkUrl.trim(),
                          url: formattedUrl,
                          size: 'Link'
                        }

                        const updatedAttachments = [...(task.attachments || []), newAttachment]

                        updateTask(task.id, {
                          attachments: updatedAttachments,
                          attachmentLink: formattedUrl
                        })

                        setLinkUrl('')
                        addToast('Attachment link added successfully and synced to Google Sheets!', 'success')
                      }}
                      disabled={isTaskDone}
                      className={`w-full text-white border-none rounded-md py-2.5 text-[13px] font-bold flex items-center justify-center gap-2 shadow-sm mb-3 ${isTaskDone ? 'bg-gray-300 cursor-not-allowed' : 'btn-gradient cursor-pointer transition-opacity hover:opacity-90 active:scale-95'}`}
                    >
                      <span className="material-symbols-outlined text-[16px]">add_link</span>
                      Add Link Attachment
                    </button>

                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-divider">
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        ref={fileInputRef}
                        disabled={isTaskDone}
                        onChange={handleFileUpload}
                      />
                      <button
                        onClick={() => { if (!isTaskDone) fileInputRef.current?.click() }}
                        disabled={isUploading || isTaskDone}
                        className={`flex-1 border rounded-md py-2.5 text-[13px] font-bold flex items-center justify-center gap-2 shadow-sm ${isTaskDone ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed' : 'bg-white border-[#702c91] text-[#702c91] hover:bg-purple-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait'}`}
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          {isUploading ? 'hourglass_empty' : 'upload_file'}
                        </span>
                        {isUploading ? 'Uploading Files...' : 'Upload Files (Image, Files, Audio)'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                  {(task.attachments || []).length === 0 ? (
                    <div className="py-6 flex justify-center border border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                      <span className="text-[12px] text-gray-400 italic">No link attachments added yet.</span>
                    </div>
                  ) : (
                    (task.attachments || []).map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2.5 bg-gray-50/50 rounded-lg border border-gray-200 hover:border-purple-300 transition-all">
                        <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
                          <span className="material-symbols-outlined text-[20px] text-purple-600 flex-shrink-0">
                            link
                          </span>
                          <div className="truncate">
                            <a
                              href={file.url || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[13px] font-bold text-[#702c91] hover:underline truncate block m-0"
                              title={file.name}
                            >
                              {file.name}
                            </a>
                            <p className="text-[10px] text-gray-400 truncate m-0">{file.url || 'No URL'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {file.downloadUrl && (
                            <a
                              href={file.downloadUrl}
                              className="w-7 h-7 rounded-full hover:bg-purple-100 flex items-center justify-center text-gray-400 hover:text-[#702c91] transition-all bg-transparent border-none cursor-pointer"
                              title="Download"
                            >
                              <span className="material-symbols-outlined text-[18px]">download</span>
                            </a>
                          )}
                          {!isTaskDone && (
                            <button
                              onClick={() => setAttachmentToDelete(idx)}
                              className="w-7 h-7 rounded-full hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 transition-all bg-transparent border-none cursor-pointer"
                              title="Delete"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      {/* Assignee Modal */}
      {isAssigneeModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-[400px] rounded-2xl shadow-2xl p-6 flex flex-col gap-4 max-h-[80vh] overflow-hidden animate-scale-in">
            <div className="flex justify-between items-center border-b border-gray-200 pb-4">
              <h2 className="text-[18px] font-bold text-[#702c91] flex items-center gap-2 m-0">
                <span className="material-symbols-outlined text-[22px]">group_add</span>
                Manage Assignees
              </h2>
              <button
                type="button"
                onClick={() => setIsAssigneeModalOpen(false)}
                className="text-gray-400 hover:text-gray-700 transition-colors bg-transparent border-none cursor-pointer p-1 flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="overflow-y-auto custom-scrollbar flex-1 space-y-1 py-2">
              {uniqueTeamMembers.map((m) => {
                const memberEmail = m.email || ''
                const isChecked = selectedAssignees.some(v => v === memberEmail || v === m.name)
                const value = memberEmail || m.name
                const isSelf = memberEmail && profile?.email && memberEmail.toLowerCase() === profile.email.toLowerCase()
                return (
                  <label key={memberEmail || m.name} className={`flex items-center gap-4 px-3 py-2.5 rounded-lg transition-colors group ${isSelf && role !== 'Admin' ? 'opacity-70' : 'hover:bg-purple-50/50 cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isSelf && role !== 'Admin'}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedAssignees([...selectedAssignees.filter(v => v !== m.name && v !== memberEmail), value])
                        } else if (!isSelf || role === 'Admin') {
                          setSelectedAssignees(selectedAssignees.filter(v => v !== value && v !== m.name && v !== memberEmail))
                        }
                      }}
                      className="w-4 h-4 cursor-pointer accent-[#702c91]"
                    />
                    <div className="flex flex-col">
                      <span className="text-[14px] text-gray-700 font-medium group-hover:text-[#702c91] transition-colors">{m.name}</span>
                      {memberEmail && memberEmail !== m.name && <span className="text-[11px] text-gray-400">{memberEmail}</span>}
                      {isSelf && <span className="text-[10px] text-gray-400 italic">(you)</span>}
                    </div>
                  </label>
                )
              })}
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={() => setIsAssigneeModalOpen(false)}
                className="px-6 py-2 border border-[#702c91] text-[#702c91] bg-white rounded-lg font-bold hover:bg-purple-50 transition-all text-[13px] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAssignees}
                className="px-6 py-2 btn-gradient border-none rounded-lg font-bold shadow-md active:scale-95 transition-all text-[13px] cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Attachment Confirmation Modal */}
      {attachmentToDelete !== null && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center">
          <div className="bg-surface-container-lowest w-[350px] rounded-xl shadow-xl p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3 text-error">
              <span className="material-symbols-outlined text-[28px]">warning</span>
              <h2 className="text-[18px] font-bold">Delete Attachment</h2>
            </div>
            <p className="text-body-sm text-secondary">
              Are you sure you want to delete this attachment?
            </p>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setAttachmentToDelete(null)}
                className="px-5 py-2 border border-outline text-secondary rounded-lg font-label-md hover:bg-surface-container-low transition-all text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const updated = (task.attachments || []).filter((_, i) => i !== attachmentToDelete);
                  updateTask(task.id, { attachments: updated });
                  setAttachmentToDelete(null);
                }}
                className="px-5 py-2 bg-error text-on-error rounded-lg font-label-md shadow-md hover:brightness-105 active:scale-95 transition-all text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Task */}
      {taskToDelete && (
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-[400px] overflow-hidden animate-scale-in flex flex-col border border-outline-variant">
            <div className="flex items-center gap-3 px-6 py-5 border-b border-outline-variant bg-surface-container-low">
              <div className="w-9 h-9 rounded-full bg-error/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-error text-[20px]">warning</span>
              </div>
              <h2 className="text-label-lg font-bold text-on-surface">Delete Task</h2>
            </div>
            <div className="px-6 py-5 bg-surface-container-lowest">
              <p className="text-body-sm text-secondary leading-relaxed">
                Are you sure you want to delete this task? This action cannot be undone.
              </p>
            </div>
            <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant flex justify-end gap-3">
              <button
                onClick={() => setTaskToDelete(null)}
                className="px-5 py-2 border border-outline-variant text-secondary rounded-lg font-label-md hover:bg-surface-container-high transition-all text-sm font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteTask(taskToDelete)
                  setTaskToDelete(null)
                  navigate('/tasks')
                }}
                className="px-5 py-2 bg-error text-on-error rounded-lg font-label-md shadow-md hover:brightness-105 active:scale-95 transition-all text-sm font-bold"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Subtask Confirmation Modal */}
      {editingSubtask && (
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-[440px] overflow-hidden animate-scale-in flex flex-col border border-outline-variant">
            <div className="flex items-center gap-3 px-6 py-5 border-b border-outline-variant bg-surface-container-low">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-[20px]">edit</span>
              </div>
              <h2 className="text-label-lg font-bold text-on-surface">Edit Subtask</h2>
            </div>
            <div className="px-6 py-5 bg-surface-container-lowest flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-bold text-secondary uppercase tracking-wider pl-1">Title</label>
                <input
                  type="text"
                  value={editSubtaskTitle}
                  onChange={e => setEditSubtaskTitle(e.target.value)}
                  placeholder="Subtask title"
                  autoFocus
                  className="w-full bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-[14px] font-semibold text-on-surface outline-none focus:border-primary transition-colors"
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveSubtaskEdit()
                    if (e.key === 'Escape') setEditingSubtask(null)
                  }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-bold text-secondary uppercase tracking-wider pl-1">Assignees</label>
                <div className="relative" ref={editAssigneeRef}>
                  <button
                    type="button"
                    onClick={() => { setIsEditAssigneeOpen(o => { if (o) setEditAssigneeSearch(''); return !o }) }}
                    className={`w-full flex items-center gap-1.5 bg-surface-container hover:bg-surface-container-high border border-outline-variant/50 rounded-lg h-[36px] px-2.5 cursor-pointer transition-colors ${isEditAssigneeOpen ? 'border-primary' : ''}`}
                    title="Assign to multiple users"
                  >
                    <span className="material-symbols-outlined text-[14px] text-secondary">person</span>
                    <span className="text-[12px] font-bold text-secondary flex-1 text-left truncate">
                      {editSubtaskAssignee.length > 0 ? editSubtaskAssignee.join(', ') : 'Assign'}
                    </span>
                    {editSubtaskAssignee.length > 0 && (
                      <span className="bg-primary text-white text-[10px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center">{editSubtaskAssignee.length}</span>
                    )}
                    <span className="material-symbols-outlined text-[14px] text-secondary">{isEditAssigneeOpen ? 'expand_less' : 'expand_more'}</span>
                  </button>

                  {isEditAssigneeOpen && (
                    <div className="absolute top-full left-0 mt-1 w-full bg-white border border-outline-variant/50 rounded-lg shadow-xl z-50 flex flex-col max-h-[220px] overflow-hidden animate-fade-in-up">
                      <div className="p-2 border-b border-gray-100 bg-white sticky top-0 z-10">
                        <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5">
                          <span className="material-symbols-outlined text-[14px] text-gray-400">search</span>
                          <input
                            type="text"
                            value={editAssigneeSearch}
                            onChange={(e) => setEditAssigneeSearch(e.target.value)}
                            placeholder="Search users..."
                            className="w-full bg-transparent text-[12px] font-bold text-gray-700 outline-none placeholder:text-gray-400"
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="overflow-y-auto custom-scrollbar p-1 flex flex-col gap-0.5">
                        {mainTaskAssignees
                          .filter(m => m.name.toLowerCase().includes(editAssigneeSearch.trim().toLowerCase()))
                          .map((m) => {
                            const isChecked = editSubtaskAssignee.includes(m.name)
                            return (
                              <label key={m.email || m.name} className="flex items-center gap-2 px-3 py-2 hover:bg-purple-50/60 rounded-md cursor-pointer transition-colors">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setEditSubtaskAssignee([...editSubtaskAssignee, m.name])
                                    } else {
                                      setEditSubtaskAssignee(editSubtaskAssignee.filter(n => n !== m.name))
                                    }
                                  }}
                                  className="accent-[#702c91] w-4 h-4 cursor-pointer"
                                />
                                <span className="text-[13px] text-gray-700 font-semibold truncate">{m.name}</span>
                              </label>
                            )
                          })}
                        {mainTaskAssignees.filter(m => m.name.toLowerCase().includes(editAssigneeSearch.trim().toLowerCase())).length === 0 && (
                          <div className="p-3 text-[12px] text-gray-400 text-center font-semibold">No main task assignees match "{editAssigneeSearch}"</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-[12px] font-bold text-secondary uppercase tracking-wider pl-1">Due Date</label>
                  <input
                    type="date"
                    value={editSubtaskDueDate}
                    onChange={(e) => {
                      const val = e.target.value
                      if (!val) {
                        setEditSubtaskDueDate('')
                        return
                      }
                      const d = new Date(val + 'T00:00:00')
                      if (d.getDay() === 0) {
                        addToast('Sundays cannot be selected as a due date. Please select another day.', 'error')
                        return
                      }
                      setEditSubtaskDueDate(val)
                    }}
                    className="w-full bg-surface-container border border-outline-variant/50 rounded-lg h-[36px] px-2.5 text-[12px] font-semibold text-secondary outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-[12px] font-bold text-secondary uppercase tracking-wider pl-1">Priority</label>
                  <SelectDropdown value={editSubtaskPriority} onChange={setEditSubtaskPriority} options={['Low', 'Medium', 'High', 'Urgent']} style={{ height: 36, fontSize: 12 }} />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant flex justify-end gap-3">
              <button
                onClick={() => setEditingSubtask(null)}
                className="px-5 py-2 border border-outline-variant text-secondary rounded-lg font-label-md hover:bg-surface-container-high transition-all text-sm font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSubtaskEdit}
                className="px-5 py-2 bg-primary text-on-primary rounded-lg font-label-md shadow-md hover:brightness-105 active:scale-95 transition-all text-sm font-bold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {subtaskToDelete && (
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-[400px] overflow-hidden animate-scale-in flex flex-col border border-outline-variant">
            <div className="flex items-center gap-3 px-6 py-5 border-b border-outline-variant bg-surface-container-low">
              <div className="w-9 h-9 rounded-full bg-error/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-error text-[20px]">warning</span>
              </div>
              <h2 className="text-label-lg font-bold text-on-surface">Delete Subtask</h2>
            </div>
            <div className="px-6 py-5 bg-surface-container-lowest">
              <p className="text-body-sm text-secondary leading-relaxed">
                Are you sure you want to delete this subtask? This action cannot be undone.
              </p>
            </div>
            <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant flex justify-end gap-3">
              <button
                onClick={() => setSubtaskToDelete(null)}
                className="px-5 py-2 border border-outline-variant text-secondary rounded-lg font-label-md hover:bg-surface-container-high transition-all text-sm font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteTask(subtaskToDelete)
                  setSubtaskToDelete(null)
                }}
                className="px-5 py-2 bg-error text-on-error rounded-lg font-label-md shadow-md hover:brightness-105 active:scale-95 transition-all text-sm font-bold"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Make Recurring Modal */}
      {showRecurringModal && (
        <div className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
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
                onClick={() => setShowRecurringModal(false)}
                className="text-outline hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Schedule Type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-bold text-secondary uppercase tracking-wider pl-1">
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
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-bold text-secondary uppercase tracking-wider pl-1">
                    Day of the Week
                  </label>
                  <SelectDropdown value={recurringDay} onChange={setRecurringDay} options={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']} />
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
                onClick={() => setShowRecurringModal(false)}
                className="px-5 py-2 border border-outline-variant text-secondary rounded-lg font-label-md hover:bg-surface-container-high transition-all text-sm font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isRecurringSubmitting || (recurringSchedule === 'Monthly' && recurringMonths.length === 0)}
                className="px-5 py-2 btn-gradient rounded-lg font-label-md shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-bold"
              >
                {isRecurringSubmitting ? 'Saving...' : 'Save Schedule'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Info Modal */}
      {infoModal && (
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-[400px] overflow-hidden animate-scale-in flex flex-col border border-outline-variant">
            <div className="flex items-center gap-3 px-6 py-5 border-b border-outline-variant bg-surface-container-low">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center ${infoModal.color?.includes('error') ? 'bg-error/10 text-error' :
                infoModal.color?.includes('warning') || infoModal.color?.includes('f59e0b') ? 'bg-warning/10 text-[#f59e0b]' :
                  'bg-primary/10 text-primary'
                }`}>
                <span className="material-symbols-outlined text-[20px]">{infoModal.icon || 'info'}</span>
              </div>
              <h2 className="text-label-lg font-bold text-on-surface">{infoModal.title}</h2>
            </div>
            <div className="px-6 py-5 bg-surface-container-lowest">
              <p className="text-body-sm text-secondary leading-relaxed">
                {infoModal.message}
              </p>
            </div>
            <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant flex justify-end gap-3">
              <button
                onClick={() => setInfoModal(null)}
                className="px-5 py-2 btn-gradient rounded-lg font-label-md shadow-md active:scale-95 transition-all text-sm font-bold"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Background Selection Modal */}
      {showBgModal && (
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[560px] overflow-hidden animate-scale-in flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
              <h2 className="text-[18px] font-bold text-[#702c91] flex items-center gap-2 m-0">
                <span className="material-symbols-outlined text-[20px]">wallpaper</span>
                Chat Wallpaper
              </h2>
              <button
                onClick={() => setShowBgModal(false)}
                className="text-gray-400 hover:text-gray-700 transition-colors bg-transparent border-none cursor-pointer p-1 flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 sm:grid-cols-3 gap-4 bg-[#f9f9ff] max-h-[60vh] overflow-y-auto custom-scrollbar">
              {CHAT_BACKGROUNDS.map((bg) => {
                const currentBgId = chatBackgrounds[task.id] || 'default'
                return (
                  <button
                    key={bg.id}
                    onClick={() => {
                      const newBgs = { ...chatBackgrounds, [task.id]: bg.id }
                      setChatBackgrounds(newBgs)
                      localStorage.setItem('dd_chat_bgs_tasks', JSON.stringify(newBgs))
                    }}
                    className={`relative aspect-[3/4] rounded-xl overflow-hidden border-[3px] transition-all cursor-pointer ${currentBgId === bg.id ? 'border-[#702c91] scale-105 shadow-md z-10' : 'border-transparent hover:border-gray-300 shadow-sm'
                      }`}
                    style={{
                      backgroundColor: bg.bgColor,
                      backgroundImage: bg.bgImage,
                      backgroundSize: bg.bgSize || 'auto',
                      backgroundPosition: 'center',
                      backgroundRepeat: bg.bgSize === 'auto' ? 'repeat' : 'no-repeat'
                    }}
                    title={bg.name}
                  >
                    {currentBgId === bg.id && (
                      <div className="absolute top-2 right-2 w-6 h-6 bg-[#702c91] rounded-full flex items-center justify-center shadow-sm">
                        <span className="material-symbols-outlined text-white text-[14px] font-bold">check</span>
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-black/50 backdrop-blur-md p-2 text-center">
                      <span className="text-white text-[11px] font-bold tracking-wide">{bg.name}</span>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="px-6 py-4 bg-white border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowBgModal(false)}
                className="px-6 py-2.5 btn-gradient border-none rounded-lg font-bold shadow-md active:scale-95 transition-all text-[13px] cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <button className="absolute -top-10 right-0 text-white/80 hover:text-white transition-colors bg-transparent border-none cursor-pointer" onClick={() => setLightboxUrl(null)}>
              <span className="material-symbols-outlined text-[28px]">close</span>
            </button>
            <img src={lightboxUrl} alt="Preview" className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
          </div>
        </div>
      )}

    </div>
  )
}



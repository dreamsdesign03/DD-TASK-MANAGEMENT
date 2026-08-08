import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import mqtt from 'mqtt'
import { useToast } from './ToastContext'
import { updateHeartbeat, logShutdown, getActiveUsers, getAllUsersMonthlyActivity, formatDuration, getAllLoggedUsers, getISTDate, getISTTime } from '../utils/activityLog'
import { formatDateShort, formatDateTime, computeRecurringDueDate } from '../utils/dateFormat'
import { isElectron } from '../utils/isElectron'

export const mqttClient = mqtt.connect('wss://broker.emqx.io:8084/mqtt')

const AppContext = createContext()

export function getPersonalChatRoomId(userA, userB) {
  const idA = String(userA?.email || userA?.id || userA?.name || '').toLowerCase().trim()
  const idB = String(userB?.email || userB?.id || userB?.name || '').toLowerCase().trim()
  return [idA, idB].sort().join('_')
}

export function useApp() {
  return useContext(AppContext)
}

const STATIC_EMPLOYEES = []

const INITIAL_TASKS = []

const INITIAL_MESSAGES = {}

const INITIAL_NOTIFICATIONS = []

const mapWebhookTaskToApp = (item) => {
  if (!item) return null
  const data = item.body || item

  // Ignore echo request payloads from stateless webhook calls
  if (data.event === 'get_tasks') return null

  const id = data["Task ID"] || data.taskId || data.id
  const employeeId = data["Employee ID"] || data.employeeId
  const title = data["Task Title"] || data.taskTitle || data.title || (typeof data.Description === 'string' ? data.Description : '') || (typeof data.description === 'string' ? data.description : '') || data.description?.intro || 'Untitled Task'
  const client = data.Client || data.client

  const taskType = data["Task Type"] || data.taskType || data.type || 'Main Task'
  const mainTaskId = data["Main Task ID"] || data.mainTaskId || ''

  // Ignore system messages or responses that don't look like tasks
  if (data.message || (!id && !employeeId && !title && !client)) {
    return null
  }

  let finalId = id
  if (!finalId || String(finalId).trim() === '') {
    const rand = Math.floor(1000 + Math.random() * 9000)
    finalId = `T-${employeeId || 'SYNC'}-${rand}`
  }

  const finalClient = client || 'General'
  const finalProject = data.Project || data.project || data.Month || data.month || 'June 2025'

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return dateStr
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' })
    } catch {
      return dateStr
    }
  }

  const assigned = formatDate(data["Assigned Date"] || data.assignedDate || data.assigned)
  const dueDate = formatDate(data["Due Date"] || data.dueDate)

  let isOverdue = data["Days Overdue"] === 'Yes' || data.daysOverdue === 'Yes' || data.overdue === true
  let daysOverdueStr = data["Days Overdue"] || data.daysOverdue || 'No'

  if (!isOverdue && dueDate) {
    const dueTime = new Date(dueDate).setHours(23, 59, 59, 999)
    const nowTime = new Date().getTime()
    if (dueTime < nowTime) {
      isOverdue = true
      const diffTime = Math.abs(nowTime - dueTime)
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      daysOverdueStr = `${diffDays} days`
    }
  }

  const remarks = data.Remarks || data.remarks
  const comments = Array.isArray(data.comments) ? data.comments : (remarks
    ? [
      {
        id: Date.now(),
        type: 'system',
        text: `Sync Remark: ${remarks}`,
      },
    ]
    : [])

  const getIntroDescription = (desc) => {
    if (!desc) return 'No description available'
    if (typeof desc === 'string') return desc
    if (typeof desc === 'object' && desc.intro) return desc.intro
    return 'No description available'
  }

  let descObj = data.Description || data.description
  if (typeof descObj === 'string') {
    if (descObj.trim().startsWith('{')) {
      try {
        descObj = JSON.parse(descObj)
      } catch (e) { }
    }
  }

  const isDone = data.Status === 'Done' || data.status === 'Done' || data.done === true

  // Department Mapping
  const rawDept = data.Department || data.department || data.Dept || data.dept || ''
  const validDepartments = ['SEO', 'SOCIAL MEDIA', 'WEBSITE', 'GRAPHIC', 'HR', 'ACCOUNT', 'AMC', 'SALES', 'COMMON']
  let mappedDept = 'COMMON'
  if (rawDept) {
    const upper = String(rawDept).toUpperCase().trim()
    if (validDepartments.includes(upper)) {
      mappedDept = upper
    } else {
      mappedDept = validDepartments.find(d => upper.includes(d)) || 'COMMON'
    }
  }

  return {
    id: finalId,
    title: title,
    taskType: taskType,
    mainTaskId: mainTaskId,
    client: finalClient,
    project: finalProject,
    assigned: assigned || formatDateShort(),
    dueDate: dueDate,
    priority: data.Priority || data.priority || 'Medium',
    status: data.Status || data.status || 'Pending',
    overdue: !isDone && isOverdue,
    done: isDone,
    department: mappedDept,
    assignedTo: data["Assigned To"] || data.assignedTo || 'Unassigned',
    assignedBy: data["Assigned By"] || data.assignedBy || 'Mansi Shah',
    timeTaken: data["Time Taken"] || data.timeTaken || '0h 0m',
    statusUpdatedOn: data["Status Updated On"] || data.statusUpdatedOn || null,
    daysOverdue: daysOverdueStr,
    employeeId: data["Employee ID"] || data.employeeId || '',
    assignedEmail: data["Assigned Email"] || data.assignedEmail || '',
    isRecurring: String(data["Is Recurring"] || data.isRecurring).toUpperCase() === 'TRUE',
    isAutoGenerated: String(data["Is Recurring"] || data.isRecurring).toUpperCase() === 'AUTO_GENERATED',
    recurringSchedule: data["Recurring Schedule"] || data.recurringSchedule || '',
    recurringDay: data["Recurring Day"] || data.recurringDay || '',
    recurringMonths: data["Recurring Months"] || data.recurringMonths || '',
    description: {
      intro: getIntroDescription(descObj),
      bullets: Array.isArray(descObj?.bullets) ? descObj.bullets : [],
      outro: descObj?.outro || (remarks ? `Remarks: ${remarks}` : ''),
      subtasks: Array.isArray(descObj?.subtasks) ? descObj.subtasks : [],
      editedAt: descObj?.editedAt || null
    },
    comments: comments,
    attachments: (() => {
      let parsedAttachments = data.attachments
      if (typeof parsedAttachments === 'string') {
        try { parsedAttachments = JSON.parse(parsedAttachments) } catch (e) { }
      }

      if (Array.isArray(parsedAttachments) && parsedAttachments.length > 0) {
        return parsedAttachments
      }
      // Only read from 'attachment' column for raw URLs
      let linkData = data.attachment || data.Attachment || data.attachmentLink || ''
      if (linkData && typeof linkData === 'string' && linkData.trim() && linkData.trim() !== 'NO') {
        // Only split by newline or whitespace (not commas, because Figma URLs can contain commas!)
        const urls = linkData.split(/[\n]+/).map(u => u.trim()).filter(u => u)
        return urls.map((urlStr, index) => {
          let friendlyName = 'Attached Link ' + (index + 1)
          let downloadUrl = ''
          try {
            const urlObj = new URL(urlStr)
            friendlyName = urlObj.hostname + (urlObj.pathname !== '/' && urlObj.pathname.length > 1 ? urlObj.pathname.substring(0, 15) + '...' : '')

            // Check if it's a Google Drive viewer link and construct a download link
            if (urlObj.hostname.includes('drive.google.com')) {
              const match = urlStr.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
              if (match && match[1]) {
                downloadUrl = `https://drive.google.com/uc?id=${match[1]}&export=download`
              } else if (urlObj.pathname === '/uc' && urlObj.searchParams.has('id')) {
                downloadUrl = `https://drive.google.com/uc?id=${urlObj.searchParams.get('id')}&export=download`
              }
            }
          } catch (e) { }
          return {
            name: friendlyName,
            url: urlStr.trim(),
            downloadUrl: downloadUrl,
            size: 'Link'
          }
        })
      }
      return []
    })()
  }
}

const insertDateDividers_util = (msgList) => {
  if (!msgList || msgList.length === 0) return []
  const withDividers = []
  let lastDateStr = ''
  msgList.forEach(m => {
    let dateStr = 'Today'
    if (m.timestamp) {
      try {
        const d = new Date(m.timestamp)
        dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' })
      } catch (e) { }
    }
    if (dateStr !== lastDateStr) {
      withDividers.push({ id: `div-${dateStr}`, type: 'divider', label: dateStr })
      lastDateStr = dateStr
    }
    withDividers.push(m)
  })
  return withDividers
}

export const parseTimeStr = (str) => {
  if (!str || str === '0h 0m' || str === 'No' || typeof str !== 'string') return 0;
  let secs = 0;
  const hMatch = str.match(/(\d+)h/i);
  const mMatch = str.match(/(\d+)m/i);
  const sMatch = str.match(/(\d+)s/i);
  if (hMatch) secs += parseInt(hMatch[1]) * 3600;
  if (mMatch) secs += parseInt(mMatch[1]) * 60;
  if (sMatch) secs += parseInt(sMatch[1]);
  return secs;
};

export const parseMultiUserTimeStr = (str) => {
  if (!str || str === '0h 0m' || str === 'No' || typeof str !== 'string') return {};
  const data = {};
  if (!str.includes(':')) {
    data['legacy'] = parseTimeStr(str);
    return data;
  }
  const parts = str.split(',');
  parts.forEach(part => {
    const [name, time] = part.split(':');
    if (name && time) {
      data[name.trim()] = parseTimeStr(time.trim());
    }
  });
  return data;
}

export const formatTimeStr = (totalSecs) => {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
};

export const buildMultiUserTimeStr = (data) => {
  return Object.entries(data).map(([name, secs]) => {
    if (name === 'legacy') return formatTimeStr(secs);
    return `${name}: ${formatTimeStr(secs)}`;
  }).join(', ');
}

export function AppProvider({ children }) {
  const { addToast } = useToast()

  const [tasks, setTasks] = useState(() => {
    try {
      const saved = localStorage.getItem('dd_tasks_v1')
      if (saved) return JSON.parse(saved)
    } catch (err) {
      console.warn('Failed to parse saved tasks:', err)
    }
    return INITIAL_TASKS
  })

  useEffect(() => {
    localStorage.setItem('dd_tasks_v1', JSON.stringify(tasks))
  }, [tasks])

  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
    try { return match ? JSON.parse(decodeURIComponent(match[2])) : null } catch { return null }
  }
  function setCookie(name, value) {
    document.cookie = name + '=' + encodeURIComponent(JSON.stringify(value)) + '; path=/; max-age=86400'
  }
  function removeCookie(name) {
    document.cookie = name + '=; path=/; max-age=0'
  }

  const [activeTimer, setActiveTimer] = useState(() => {
    return getCookie('dd_active_timer')
  })

  useEffect(() => {
    if (activeTimer) {
      setCookie('dd_active_timer', activeTimer)
    } else {
      removeCookie('dd_active_timer')
    }
  }, [activeTimer])

  const [sessionSecs, setSessionSecs] = useState(0)

  useEffect(() => {
    let interval;
    if (activeTimer) {
      setSessionSecs(Math.floor((Date.now() - activeTimer.startTime) / 1000));
      interval = setInterval(() => {
        setSessionSecs(Math.floor((Date.now() - activeTimer.startTime) / 1000));
      }, 1000);
    } else {
      setSessionSecs(0);
    }
    return () => clearInterval(interval);
  }, [activeTimer])

  // ── IPC to Electron overlay (always runs when in Electron) ──
  useEffect(() => {
    if (window.require) {
      try {
        const { ipcRenderer } = window.require('electron')
        const displayTime = (() => {
          const s = sessionSecs
          if (s < 60) return String(s)
          const m = Math.floor(s / 60)
          const sec = s % 60
          if (s < 3600) return [m, sec].map(v => String(v).padStart(2, '0')).join(':')
          const h = Math.floor(s / 3600)
          return [h, m % 60, sec].map(v => String(v).padStart(2, '0')).join(':')
        })()
        ipcRenderer.send('timer-update', {
          active: !!activeTimer,
          time: displayTime,
          taskTitle: activeTimer?.taskTitle || '',
          taskId: activeTimer?.taskId || null,
        })
      } catch (e) { }
    }
  }, [activeTimer, sessionSecs])

  const tasksRef = useRef(tasks)
  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])


  const [notifications, setNotifications] = useState(() => {
    try {
      const saved = localStorage.getItem('dd_notifications_v1')
      if (saved) return JSON.parse(saved)
    } catch { }
    return INITIAL_NOTIFICATIONS
  })

  useEffect(() => {
    localStorage.setItem('dd_notifications_v1', JSON.stringify(notifications))
  }, [notifications])
  const [notifPreferences, setNotifPreferences] = useState(() => {
    try {
      const saved = localStorage.getItem('dd_notif_prefs')
      if (saved) return JSON.parse(saved)
    } catch { }
    return {
      taskReminders: true,
      overdueAlerts: true,
      statusUpdates: false,
      chatNotifs: true,
    }
  })

  useEffect(() => {
    localStorage.setItem('dd_notif_prefs', JSON.stringify(notifPreferences))
  }, [notifPreferences])

  const [searchQuery, setSearchQuery] = useState('')
  const [showNewTaskModal, setShowNewTaskModal] = useState(false)
  const [newTaskPrefillDept, setNewTaskPrefillDept] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  useEffect(() => {
    // Set CSS variable so all page layouts react to sidebar toggle
    const updateSidebarMargin = () => {
      const isMobile = window.innerWidth < 1024
      document.documentElement.style.setProperty(
        '--sidebar-ml',
        isMobile ? '0px' : (isSidebarOpen ? '260px' : '96px')
      )
    }
    updateSidebarMargin()
    window.addEventListener('resize', updateSidebarMargin)
    return () => window.removeEventListener('resize', updateSidebarMargin)
  }, [isSidebarOpen])
  const [profile, setProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('dd_profile')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed && typeof parsed === 'object') {
          parsed.avatar = ''
          return parsed
        }
      }
    } catch (err) {
      console.warn('Failed to parse saved profile:', err)
    }
    return null
  })

  useEffect(() => {
    localStorage.setItem('dd_profile', JSON.stringify(profile))
  }, [profile])

  const [isPunchedIn, setIsPunchedIn] = useState(false)
  const [punchInTime, setPunchInTime] = useState(null)
  const [firstPunchInToday, setFirstPunchInToday] = useState(null)
  const [todaysSessions, setTodaysSessions] = useState([])
  const todaysSessionsRef = useRef([])
  useEffect(() => {
    todaysSessionsRef.current = todaysSessions
  }, [todaysSessions])
  const [isSessionRestored, setIsSessionRestored] = useState(false)
  const [activityLog, setActivityLog] = useState([])
  const [pendingAutoPunchOut, setPendingAutoPunchOut] = useState(null)
  const autoPunchOutDoneRef = useRef(new Set())
  const tasksLoadedRef = useRef(false)

  useEffect(() => {
    if (!profile?.email) return
    const fetchActivities = async () => {
      try {
        const res = await fetch('https://script.google.com/macros/s/AKfycbxIoBk4LlvzB8jKG4mgjqH02Gn6H0ymG2DvQvdIemC7aoYHxVCx4PitSdbl2O_hzAq2/exec?action=get_activities')
        const data = await res.json()
        setActivityLog(data)
        const todayPrefix = getISTDate()
        const mySessions = []
        let activeTime = null
        let staleSession = null
        data.forEach(row => {
          if ((row["Full Name"] === profile.name || row["Employee ID"] === profile.employeeId) && row["Login Date and Time"]) {
            // e.g. "2026-07-10 13:02:55"
            // The sheet might return a string or a Date object, ensure it's a string
            let loginStr = row["Login Date and Time"]
            if (loginStr && typeof loginStr === 'string' && loginStr.includes('T')) loginStr = loginStr.replace('T', ' ').substring(0, 19)
            if (loginStr instanceof Date) {
              const d = new Date(loginStr.getTime() - loginStr.getTimezoneOffset() * 60000)
              loginStr = d.toISOString().replace('T', ' ').substring(0, 19)
            }
            if (String(loginStr).startsWith(todayPrefix)) {
              const inTime = String(loginStr).split(' ')[1] || ""
              let outStr = row["Logout Date and Time"] || ""
              if (outStr instanceof Date) {
                const d2 = new Date(outStr.getTime() - outStr.getTimezoneOffset() * 60000)
                outStr = d2.toISOString().replace('T', ' ').substring(0, 19)
              } else if (typeof outStr === 'string' && outStr.includes('T')) {
                outStr = outStr.replace('T', ' ').substring(0, 19)
              }
              const outTime = outStr ? String(outStr).split(' ')[1] : null
              mySessions.push({ in: inTime, out: outTime })
              if (!outTime) activeTime = inTime
            } else if (!row["Logout Date and Time"]) {
              const staleDate = String(loginStr).substring(0, 10)
              if (/^\d{4}-\d{2}-\d{2}$/.test(staleDate) && staleDate < todayPrefix) {
                if (!staleSession || staleDate > staleSession.date) {
                  staleSession = { date: staleDate, in: String(loginStr).split(' ')[1] || "" }
                }
              }
            }
          }
        })
        setTodaysSessions(mySessions)
        if (mySessions.length > 0) {
          setFirstPunchInToday(mySessions[0].in)
        }
        if (activeTime) {
          setIsPunchedIn(true)
          setPunchInTime(activeTime)
        } else {
          setIsPunchedIn(false)
          setPunchInTime(null)
          if (mySessions.length === 0) setFirstPunchInToday(null)
        }
        sessionRestoredRef.current = true
        setIsSessionRestored(true)
        if (staleSession) setPendingAutoPunchOut(staleSession)
      } catch (err) {
        console.error("Failed to fetch activities from sheet:", err)
        sessionRestoredRef.current = true
        setIsSessionRestored(true)
      }
    }
    fetchActivities()
  }, [profile])

  const handlePunchIn = () => {
    const inTime = getISTTime()
    setIsPunchedIn(true)
    setPunchInTime(inTime)

    setTodaysSessions(prev => {
      const updated = [...prev, { in: inTime, out: null }]
      return updated
    })
    addToast('Punched In successfully', 'success')

    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxIoBk4LlvzB8jKG4mgjqH02Gn6H0ymG2DvQvdIemC7aoYHxVCx4PitSdbl2O_hzAq2/exec';
    fetch(SCRIPT_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'punch_in', email: profile.email })
    }).then(r => r.text()).then(t => console.log('Punch in response:', t)).catch(e => console.warn('Punch in failed:', e))

    const DAILY_SHEET_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzrLvG8wg2zPqchsavvLbgIR5vD_iPAxwSRxMRJMjQgW3YuUuaoRYSXUDF7_A1sWswqxA/exec';
    if (profile?.email && DAILY_SHEET_WEB_APP_URL !== 'YOUR_NEW_APPS_SCRIPT_WEB_APP_URL_HERE') {
      const payload = JSON.stringify({
        action: 'log_punch_in',
        email: profile?.email,
        employeeId: profile?.employeeId || '',
        name: profile?.name || 'Unknown',
        date: getISTDate(),
        startTime: inTime,
        firstPunchIn: inTime
      });
      fetch(DAILY_SHEET_WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: payload
      }).catch(() => { })
    }
  }

  const handlePunchOut = () => {
    const prevEmail = profile?.email
    setIsPunchedIn(false)
    setPunchInTime(null)
    const outTime = getISTTime()
    setTodaysSessions(prev => {
      const updated = [...prev]
      if (updated.length > 0) updated[updated.length - 1].out = outTime
      return updated
    })
    addToast('Punched Out successfully', 'success')

    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxIoBk4LlvzB8jKG4mgjqH02Gn6H0ymG2DvQvdIemC7aoYHxVCx4PitSdbl2O_hzAq2/exec';
    fetch(SCRIPT_URL, {
      method: 'POST', mode: 'no-cors', keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'punch_out', email: prevEmail })
    }).then(r => r.text()).then(t => console.log('Punch out response:', t)).catch(e => console.warn('Punch out failed:', e))

    // Log daily tasks & punch out to daily sheet
    if (prevEmail) {
      const DAILY_SHEET_URL = 'https://script.google.com/macros/s/AKfycbzrLvG8wg2zPqchsavvLbgIR5vD_iPAxwSRxMRJMjQgW3YuUuaoRYSXUDF7_A1sWswqxA/exec';
      if (DAILY_SHEET_URL !== 'YOUR_NEW_APPS_SCRIPT_WEB_APP_URL_HERE') {
        const todayIST = getISTDate();
        const myFirstPunchIn = (todaysSessions && todaysSessions.length > 0 && todaysSessions[0].in)
          ? todaysSessions[0].in
          : (punchInTime || outTime);

        const myName = (profile?.name || '').trim().toLowerCase();
        const myFirstName = myName.split(' ')[0];
        const myEmail = (prevEmail || '').trim().toLowerCase();
        const myEmpId = String(profile?.employeeId || '').trim();

        // Robust date helper comparing date value against todayIST (YYYY-MM-DD)
        const isDateToday = (dateVal) => {
          if (!dateVal) return true;
          const str = String(dateVal).trim();
          if (!str) return true;
          if (str.startsWith(todayIST)) return true;
          if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10) === todayIST;
          const dmY = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
          if (dmY) {
            const formatted = `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`;
            return formatted === todayIST;
          }
          try {
            const d = new Date(str.replace(' ', 'T'));
            if (!isNaN(d.getTime())) {
              const yyyy = d.getFullYear();
              const mm = String(d.getMonth() + 1).padStart(2, '0');
              const dd = String(d.getDate()).padStart(2, '0');
              return `${yyyy}-${mm}-${dd}` === todayIST;
            }
          } catch (e) {}
          return true;
        };

        // Filter all tasks assigned/worked on today by this user (Pending, In Progress, Done)
        const todaysTasks = (tasks || []).filter(t => {
          const assignedEmailClean = (t.assignedEmail || '').toLowerCase();
          const assignedToClean = (t.assignedTo || '').toLowerCase();
          const taskEmpId = String(t.employeeId || '').trim();

          const isMyTask = (assignedEmailClean && assignedEmailClean === myEmail) ||
                           (assignedToClean && (assignedToClean.includes(myName) || myName.includes(assignedToClean) || (myFirstName && assignedToClean.includes(myFirstName)))) ||
                           (myEmpId && taskEmpId && myEmpId === taskEmpId);

          if (!isMyTask) return false;

          return isDateToday(t.statusUpdatedOn || t.assignedDate || t.assigned);
        });

        console.log('Todays Tasks count for Daily Sheet:', todaysTasks.length);

        const payload = JSON.stringify({
          action: 'log_daily_tasks',
          email: prevEmail,
          name: profile?.name || 'Unknown',
          employeeId: profile?.employeeId || '',
          date: todayIST,
          firstPunchIn: myFirstPunchIn,
          lastPunchOut: outTime,
          tasks: todaysTasks.map(t => ({
            project: t.client || t.project || t.projectName || '',
            title: t.title || '',
            status: t.status || 'Pending',
            startTime: t.startTime || (t.status === 'Done' ? myFirstPunchIn : ''),
            endTime: t.endTime || (t.status === 'Done' ? outTime : ''),
            remark: (t.comments && t.comments.length > 0) ? t.comments[t.comments.length - 1].text : (t.remarks || '')
          }))
        });

        fetch(DAILY_SHEET_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: payload
        }).catch(err => console.warn('Daily task sheet sync failed:', err));
      }
    }
  }

  // Auto punch-out: if the user forgot to punch out on a previous day, close that
  // session and log that day's tasks to the daily task sheet (frontend-only fix)
  const handleAutoPunchOut = useCallback((session) => {
    const sessionDate = session.date
    const sessionIn = session.in || ''
    const myName = (profile?.name || '').trim().toLowerCase()
    const myFirstName = myName.split(' ')[0]
    const myEmail = (profile?.email || '').trim().toLowerCase()
    const myEmpId = String(profile?.employeeId || '').trim()

    const isDateMatch = (dateVal) => {
      if (!dateVal) return true
      const str = String(dateVal).trim()
      if (!str) return true
      if (str.startsWith(sessionDate)) return true
      if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10) === sessionDate
      const dmY = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
      if (dmY) {
        const formatted = `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`
        return formatted === sessionDate
      }
      try {
        const d = new Date(str.replace(' ', 'T'))
        if (!isNaN(d.getTime())) {
          const yyyy = d.getFullYear()
          const mm = String(d.getMonth() + 1).padStart(2, '0')
          const dd = String(d.getDate()).padStart(2, '0')
          return `${yyyy}-${mm}-${dd}` === sessionDate
        }
      } catch (e) {}
      return true
    }

    const dayTasks = (tasks || []).filter(t => {
      const assignedEmailClean = (t.assignedEmail || '').toLowerCase()
      const assignedToClean = (t.assignedTo || '').toLowerCase()
      const taskEmpId = String(t.employeeId || '').trim()

      const isMyTask = (assignedEmailClean && assignedEmailClean === myEmail) ||
        (assignedToClean && (assignedToClean.includes(myName) || myName.includes(assignedToClean) || (myFirstName && assignedToClean.includes(myFirstName)))) ||
        (myEmpId && taskEmpId && myEmpId === taskEmpId)

      if (!isMyTask) return false
      return isDateMatch(t.statusUpdatedOn || t.assignedDate || t.assigned)
    })

    const rawEnds = dayTasks.map(t => t.endTime).filter(Boolean)
    const autoOutTime = rawEnds.length > 0 ? rawEnds.sort().slice(-1)[0] : '23:59'

    // 1. Close the open session on the main backend
    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxIoBk4LlvzB8jKG4mgjqH02Gn6H0ymG2DvQvdIemC7aoYHxVCx4PitSdbl2O_hzAq2/exec'
    fetch(SCRIPT_URL, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'punch_out', email: profile?.email })
    }).then(r => r.text()).then(t => console.log('Auto punch out response:', t)).catch(e => console.warn('Auto punch out failed:', e))

    // 2. Log that day's tasks to the daily task sheet
    const DAILY_SHEET_URL = 'https://script.google.com/macros/s/AKfycbzrLvG8wg2zPqchsavvLbgIR5vD_iPAxwSRxMRJMjQgW3YuUuaoRYSXUDF7_A1sWswqxA/exec'
    if (profile?.email && DAILY_SHEET_URL !== 'YOUR_NEW_APPS_SCRIPT_WEB_APP_URL_HERE') {
      const payload = JSON.stringify({
        action: 'log_daily_tasks',
        email: profile?.email,
        name: profile?.name || 'Unknown',
        employeeId: profile?.employeeId || '',
        date: sessionDate,
        firstPunchIn: sessionIn,
        lastPunchOut: autoOutTime,
        tasks: dayTasks.map(t => ({
          project: t.client || t.project || t.projectName || '',
          title: t.title || '',
          status: t.status || 'Pending',
          startTime: t.startTime || (t.status === 'Done' ? sessionIn : ''),
          endTime: t.endTime || (t.status === 'Done' ? autoOutTime : ''),
          remark: (t.comments && t.comments.length > 0) ? t.comments[t.comments.length - 1].text : (t.remarks || '')
        }))
      })
      fetch(DAILY_SHEET_URL, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: payload
      }).catch(err => console.warn('Auto daily task sheet sync failed:', err))
    }

    addToast(`Auto punched out for ${sessionDate} and logged your tasks`, 'success')
  }, [profile, tasks, addToast])

  // Trigger auto punch-out once the day's tasks have been synced
  useEffect(() => {
    if (!pendingAutoPunchOut || !profile?.email || !sessionRestoredRef.current || !tasksLoadedRef.current) return
    const key = pendingAutoPunchOut.date
    if (autoPunchOutDoneRef.current.has(key)) {
      setPendingAutoPunchOut(null)
      return
    }
    autoPunchOutDoneRef.current.add(key)
    setPendingAutoPunchOut(null)
    handleAutoPunchOut(pendingAutoPunchOut)
  }, [pendingAutoPunchOut, profile, handleAutoPunchOut])

  // Activity tracking: log punch in, heartbeat every 30s
  const heartbeatRef = useRef(null)
  const prevProfileEmailRef = useRef(null)
  const sessionRestoredRef = useRef(false)

  useEffect(() => {
    if (profile?.email) {
      prevProfileEmailRef.current = profile.email
    }

    if (!sessionRestoredRef.current) {
      if (isPunchedIn && profile?.email) {
        setEmployees(prev => prev.map(e =>
          e.email === profile.email ? { ...e, status: 'Online' } : e
        ))
        heartbeatRef.current = setInterval(() => updateHeartbeat(profile.email), 30000)
      }
      return
    }

    if (isPunchedIn && profile?.email) {
      setEmployees(prev => prev.map(e =>
        e.email === profile.email ? { ...e, status: 'Online' } : e
      ))
      if (mqttClient && mqttClient.connected) {
        mqttClient.publish('dd_status_engine_v1/status', JSON.stringify({
          action: 'user_online', email: profile.email, name: profile.name, timestamp: Date.now()
        }))
      }
      heartbeatRef.current = setInterval(() => updateHeartbeat(profile.email), 30000)
      return () => {
        if (heartbeatRef.current) { clearInterval(heartbeatRef.current) }
      }
    } else {
      const prevEmail = prevProfileEmailRef.current || profile?.email
      if (prevEmail) {
        setEmployees(prev => prev.map(e =>
          e.email === prevEmail ? { ...e, status: 'Offline' } : e
        ))
        if (mqttClient && mqttClient.connected) {
          mqttClient.publish('dd_status_engine_v1/status', JSON.stringify({
            action: 'user_offline', email: prevEmail, name: '', timestamp: Date.now()
          }))
        }
      }
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
      if (!profile?.email && isPunchedIn) { setIsPunchedIn(false) }
    }
  }, [isPunchedIn, profile?.email])

  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    localStorage.removeItem('dd_dark_mode')
    document.documentElement.classList.remove('dark')
  }, [isDarkMode])


  // Chat channels state
  const [employees, setEmployees] = useState(() => {
    return STATIC_EMPLOYEES.map(staticEmp => ({
      id: staticEmp.id,
      name: staticEmp.name,
      email: staticEmp.email,
      role: staticEmp.role,
      avatar: staticEmp.avatar,
      status: 'Online',
      department: 'Creative',
      location: 'Remote'
    }))
  })

  const [personalChats, setPersonalChats] = useState(() => {
    return STATIC_EMPLOYEES
      .filter(m => m.email?.toLowerCase() !== (profile?.email || '').toLowerCase())
      .map((m, idx) => {
        const roomId = getPersonalChatRoomId(profile, m)
        return {
          id: roomId,
          name: m.name,
          email: m.email,
          department: m.department || 'Creative',
          location: m.location || 'Remote',
          time: '10:45 AM',
          preview: 'No messages yet.',
          avatar: m.avatar,
          online: true,
          unread: 0,
          active: idx === 0
        }
      })
  })

  const [groupChats, setGroupChats] = useState([])
  const [groupMembers, setGroupMembers] = useState({})

  const [clients, setClients] = useState(() => {
    try {
      const saved = localStorage.getItem('dd_clients_v1')
      if (saved) return JSON.parse(saved)
    } catch (err) {
      console.warn('Failed to parse saved clients:', err)
    }
    return []
  })

  const [payments, setPayments] = useState(() => {
    try {
      const saved = localStorage.getItem('dd_payments_v1')
      if (saved) return JSON.parse(saved)
    } catch (err) {}
    return []
  })

  useEffect(() => {
    localStorage.setItem('dd_clients_v1', JSON.stringify(clients))
  }, [clients])

  useEffect(() => {
    localStorage.setItem('dd_payments_v1', JSON.stringify(payments))
  }, [payments])

  const [messagesByChatId, setMessagesByChatId] = useState(INITIAL_MESSAGES)
  const [activeChatSession, setActiveChatSession] = useState(null)
  const [readReceiptsByChatId, setReadReceiptsByChatId] = useState({})
  const [messageStatusByChatId, setMessageStatusByChatId] = useState({})

  const profileRef = useRef(profile)
  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  const notifiedMessageIds = useRef(new Set())

  // One-time cleanup: remove the old stale dd_cleared_chats key (v1) that had bad timestamps
  // This runs only once on component mount via useState initializer trick
  useState(() => {
    try {
      localStorage.removeItem('dd_cleared_chats')
    } catch (_) { }
  })

  const handlePunchOutRef = useRef()
  handlePunchOutRef.current = handlePunchOut
  const isPunchedInRef = useRef(isPunchedIn)
  isPunchedInRef.current = isPunchedIn

  // Listen for Electron auto-punch-out (e.g. system shutdown / session-end / power cut)
  useEffect(() => {
    if (isElectron() && window.require) {
      try {
        const { ipcRenderer } = window.require('electron')
        const doAutoPunchOut = async () => {
          if (isPunchedInRef.current && handlePunchOutRef.current) {
            // handlePunchOut already fires the fetch with keepalive: true
            // We call it and give the network request ~3s to complete before signalling done
            handlePunchOutRef.current()
            await new Promise(resolve => setTimeout(resolve, 3000))
          }
          // Signal main process that punch-out is done so it can continue quitting
          try { ipcRenderer.send('punch-out-done') } catch (_) { }
        }
        // Navigate to tasks/punch-in screen when screen is unlocked or app restarts
        const doShowPunchIn = () => {
          window.dispatchEvent(new CustomEvent('dd_navigate', { detail: { path: '/tasks' } }))
        }
        ipcRenderer.on('auto-punch-out', doAutoPunchOut)
        ipcRenderer.on('show-punch-in', doShowPunchIn)
        return () => {
          ipcRenderer.removeListener('auto-punch-out', doAutoPunchOut)
          ipcRenderer.removeListener('show-punch-in', doShowPunchIn)
        }
      } catch (e) {
        console.warn('Electron IPC setup failed:', e)
      }
    }
  }, [])

  // Persist which chats have been cleared — stores { chatId: clearTimestamp }
  // Messages BEFORE the timestamp are hidden; messages AFTER still appear (new messages work!)
  const [clearedChatTimestamps, setClearedChatTimestamps] = useState(() => {
    try {
      const saved = localStorage.getItem('dd_cleared_chats_v2')
      if (!saved) return {}
      const parsed = JSON.parse(saved)
      return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch { return {} }
  })
  // Persist which personal chats have been deleted (hidden even after fetchTeam rebuilds the list)
  const [deletedPersonalChatIds, setDeletedPersonalChatIds] = useState(() => {
    try {
      const saved = localStorage.getItem('dd_deleted_personal_chats')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch { return new Set() }
  })

  const clearedChatIdsRef = useRef(clearedChatTimestamps)
  clearedChatIdsRef.current = clearedChatTimestamps

  const deletedPersonalChatIdsRef = useRef(deletedPersonalChatIds)
  deletedPersonalChatIdsRef.current = deletedPersonalChatIds

  // Helper: mark a chat as cleared at this moment (persists across refresh)
  // New messages sent AFTER this moment will still be visible
  const clearChatLocally = (chatId) => {
    const key = String(chatId)
    const ts = Date.now()
    setClearedChatTimestamps(prev => {
      const next = { ...prev, [key]: ts }
      localStorage.setItem('dd_cleared_chats_v2', JSON.stringify(next))
      return next
    })
    setMessagesByChatId(prev => ({ ...prev, [chatId]: [] }))
  }

  // Helper: clear ALL personal and group chats at once
  const clearAllChatsLocally = () => {
    const ts = Date.now()
    const allIds = [
      ...chatsRef.current.personalChats.map(c => String(c.id)),
      ...chatsRef.current.groupChats.map(g => String(g.id))
    ]
    setClearedChatTimestamps(prev => {
      const next = { ...prev }
      allIds.forEach(id => { next[id] = ts })
      localStorage.setItem('dd_cleared_chats_v2', JSON.stringify(next))
      return next
    })
    setDeletedPersonalChatIds(new Set())
    localStorage.removeItem('dd_deleted_personal_chats')
    setMessagesByChatId({})
  }

  // Helper: mark a personal chat as deleted (persists across refresh)
  const deletePersonalChatLocally = (chatId) => {
    const key = String(chatId)
    setDeletedPersonalChatIds(prev => {
      const next = new Set(prev)
      next.add(key)
      localStorage.setItem('dd_deleted_personal_chats', JSON.stringify([...next]))
      return next
    })
    setPersonalChats(prev => prev.filter(c => String(c.id) !== key))
    setMessagesByChatId(prev => {
      const copy = { ...prev }
      delete copy[chatId]
      return copy
    })
  }

  // Helper: restore a deleted personal chat so it shows in the sidebar again
  const restorePersonalChatLocally = (chatId) => {
    const key = String(chatId)
    setDeletedPersonalChatIds(prev => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      localStorage.setItem('dd_deleted_personal_chats', JSON.stringify([...next]))
      return next
    })
  }

  const appStartTime = useRef(new Date())
  const initialTaskIds = useRef(null)
  const initialTaskStatuses = useRef({})
  const initialTaskOverdueStatuses = useRef({})
  const initialTaskData = useRef({})
  const recentTaskUpdates = useRef({}) // { taskId: { timestamp, fields } }

  const addSystemAndWebNotification = (category, title, subtitle, taskId = null) => {
    // Cross-tab deduplication: prevent multiple open tabs from triggering the exact same notification
    const notifHash = `${category}_${title}_${subtitle}_${taskId}`
    try {
      const stored = JSON.parse(localStorage.getItem('dd_notif_hashes') || '[]')
      const now = Date.now()
      // Keep hashes for 10 seconds
      const validStored = stored.filter(item => now - item.time < 10000)
      if (validStored.some(item => item.hash === notifHash)) {
        localStorage.setItem('dd_notif_hashes', JSON.stringify(validStored))
        return // Already notified by another tab
      }
      validStored.push({ hash: notifHash, time: now })
      localStorage.setItem('dd_notif_hashes', JSON.stringify(validStored))
    } catch (e) {
      // Proceed if localStorage fails
    }
    const newNotif = {
      id: Date.now() + Math.random(),
      unread: true,
      category,
      iconBg: category === 'Status Updates' ? 'bg-[#F4EFF6]' : 'bg-[#E3F2FD]',
      iconColor: category === 'Status Updates' ? 'text-primary' : 'text-blue-600',
      icon: category === 'Status Updates' ? 'check_circle' : (category === 'Task Reminders' ? 'assignment' : 'chat_bubble'),
      title,
      subtitle,
      time: formatDateTime(),
      taskId
    }
    setNotifications(prev => [newNotif, ...prev])

    // Show beautiful UI toast notification
    let toastType = 'info'
    if (category === 'Status Updates' || title.toLowerCase().includes('success') || title.toLowerCase().includes('done')) toastType = 'success'
    if (title.toLowerCase().includes('overdue') || category === 'Error') toastType = 'error'

    // Don't show toast if it's just a general system sync unless important
    addToast(`${title} - ${subtitle}`, toastType)

    if (window.require) {
      try {
        const { ipcRenderer } = window.require('electron')
        ipcRenderer.send('show-notification', { title, body: subtitle })
      } catch (e) {
        // Fallback
      }
    } else if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(title, {
        body: subtitle,
        icon: '/favicon.ico'
      })
      n.onclick = () => {
        window.focus()
        if (category === 'Task Chat' || category === 'Status Updates') {
          if (taskId) window.dispatchEvent(new CustomEvent('dd_navigate', { detail: { path: `/tasks/${taskId}` } }))
        } else if (category === 'New Message' || category === 'New Group Message') {
          if (taskId) localStorage.setItem('dd_pending_chat_nav', taskId)
          window.dispatchEvent(new CustomEvent('dd_navigate', { detail: { path: '/chat' } }))
        } else {
          window.dispatchEvent(new CustomEvent('dd_navigate', { detail: { path: '/notifications' } }))
        }
      }
    }
  }

  const [lastSeenTimestamps, setLastSeenTimestamps] = useState(() => {
    try {
      const saved = localStorage.getItem('dd_chat_last_seen')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  const chatsRef = useRef({ personalChats, groupChats, activeChatSession, messagesByChatId })
  chatsRef.current = { personalChats, groupChats, activeChatSession, messagesByChatId }

  const lastSeenRef = useRef(lastSeenTimestamps)
  lastSeenRef.current = lastSeenTimestamps

  const markChatAsRead = useCallback((chatId, messagesList) => {
    // If the browser tab is hidden, do NOT mark as read yet!
    if (document.visibilityState !== 'visible') return

    // Also clear unread counts immediately in the UI states if they are positive
    setPersonalChats(prev => {
      const needsUpdate = prev.some(c => String(c.id) === String(chatId) && c.unread > 0)
      if (!needsUpdate) return prev
      return prev.map(c => String(c.id) === String(chatId) ? { ...c, unread: 0 } : c)
    })
    setGroupChats(prev => {
      const needsUpdate = prev.some(g => String(g.id) === String(chatId) && g.unread > 0)
      if (!needsUpdate) return prev
      return prev.map(g => String(g.id) === String(chatId) ? { ...g, unread: 0 } : g)
    })

    const msgs = messagesList || chatsRef.current.messagesByChatId[chatId] || []
    if (msgs.length === 0) return

    const actualMsgs = msgs.filter(m => m.type === 'sent' || m.type === 'received' || m.type === 'system')
    if (actualMsgs.length === 0) return

    const lastMsg = actualMsgs[actualMsgs.length - 1]
    const lastMsgTime = lastMsg.timestamp
    if (!lastMsgTime) return

    setLastSeenTimestamps(prev => {
      if (prev[chatId] === lastMsgTime) return prev
      const next = { ...prev, [chatId]: lastMsgTime }
      localStorage.setItem('dd_chat_last_seen', JSON.stringify(next))
      lastSeenRef.current = next
      return next
    })

    // Do NOT send a read receipt for messages we sent ourselves
    if (lastMsg.type === 'sent') return

    const key = `receipt_${chatId}_${lastMsgTime}`
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, 'true')

      const senderEmail = profile?.email || 'mansi@dreamsdesign.in'

      // Broadcast read receipt via MQTT
      if (mqttClient && mqttClient.connected) {
        const payload = {
          action: 'read_receipt',
          roomId: chatId,
          messageId: lastMsg.id,
          senderEmail: senderEmail,
          timestamp: lastMsgTime
        }
        mqttClient.publish('dd_chat_engine_v1/' + chatId, JSON.stringify(payload))
      }

      // ALSO SEND TO SHEET so it persists
      const sheetPayload = {
        id: String(Date.now()),
        action: 'send',
        roomId: chatId,
        senderId: senderEmail,
        senderName: profileRef.current?.name || 'Mansi Shah',
        message: `[ReadReceipt:${senderEmail}|${lastMsgTime}]`,
        timestamp: new Date().toISOString(),
        type: 'personal'
      }
      fetch('https://script.google.com/macros/s/AKfycbxIoBk4LlvzB8jKG4mgjqH02Gn6H0ymG2DvQvdIemC7aoYHxVCx4PitSdbl2O_hzAq2/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(sheetPayload)
      }).catch(err => console.warn('Failed to send read receipt to sheet:', err))
    }
  }, [profile?.email])

  const mapN8nMessageToApp = useCallback((m) => {
    // Find keys case-insensitively since Google Sheets headers might vary slightly
    const getVal = (keyBase) => {
      const lowerBase = keyBase.toLowerCase()
      const foundKey = Object.keys(m).find(k => k.trim().toLowerCase() === lowerBase)
      return foundKey ? m[foundKey] : ''
    }

    const senderName = getVal('senderName') || m.senderName || m['senderName '] || ''
    const senderId = getVal('senderId') || m.senderId || m['senderId '] || ''
    const msgText = getVal('message') || m.message || m['message '] || ''
    const timestamp = getVal('timestamp') || m.timestamp || m['timestamp '] || ''
    const hashStr = `${m.roomId || m['roomId '] || ''}_${senderId}_${timestamp}_${msgText}`
    let hash = 0
    for (let i = 0; i < hashStr.length; i++) {
      hash = ((hash << 5) - hash) + hashStr.charCodeAt(i)
      hash |= 0
    }
    let msgId = m.id || m['id '] || String(Math.abs(hash))
    if (!String(msgId).startsWith('sheet_msg_')) {
      msgId = `sheet_msg_${msgId}`
    }

    const isSystem = senderName === 'System' || senderId === 'system' || (typeof msgText === 'string' && msgText.startsWith('[System:'))
    const isMe =
      String(senderName).trim().toLowerCase() === String(profileRef.current?.name || 'Mansi Shah').trim().toLowerCase() ||
      String(senderId).trim().toLowerCase() === String(profileRef.current?.email || 'mansi@dreamsdesign.in').trim().toLowerCase()
    let timeStr = ''
    try {
      const d = new Date(timestamp)
      if (isNaN(d.getTime())) throw new Error('Invalid date')
      timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
    } catch (err) {
      timeStr = timestamp || ''
    }

    let textVal = msgText
    if (isSystem && typeof textVal === 'string') {
      if (textVal.startsWith('[System:')) {
        textVal = textVal.substring(8)
      }
      if (textVal.endsWith(']')) {
        textVal = textVal.substring(0, textVal.length - 1)
      }
    }

    return {
      id: msgId,
      type: isSystem ? 'system' : (isMe ? 'sent' : 'received'),
      sender: senderName,
      text: textVal,
      time: timeStr,
      timestamp: timestamp
    }
  }, [profileRef])

  const insertDateDividers = insertDateDividers_util

  // Helper: strip protocol markers from message text for sidebar preview display
  const cleanPreviewText = (text) => {
    if (!text) return ''
    const t = String(text)
    if (t.startsWith('[Delete:')) return null  // deleted message — skip entirely
    if (t.startsWith('[React:')) return null   // reaction — skip entirely
    if (t.startsWith('[Edit:')) {
      const m = t.match(/^\[Edit:[^|]+\|([^\]]+)\]/)
      return m ? m[1] : null
    }
    if (t.startsWith('[Reply:')) {
      const m = t.match(/^\[Reply:[^\]]+\](.*)/s)
      return m ? (m[1].trim() || null) : null
    }
    if (t.startsWith('[Meeting:')) return '📹 Video Meeting'
    if (t.startsWith('[Attachment:')) return '\ud83d\udcce Attachment'
    return t
  }

  // Get the last visible preview message from a list (skips protocol-only messages)
  const getLastPreviewMsg = (msgs) => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]
      if (m.type !== 'sent' && m.type !== 'received') continue
      const cleaned = cleanPreviewText(m.text)
      if (cleaned !== null && cleaned !== '') return { msg: m, text: cleaned }
    }
    return null
  }

  // Fetch messages from n8n CHAT_ENGINE Webhook
  const fetchMessages = useCallback(async () => {
    try {
      const url = 'https://script.google.com/macros/s/AKfycbxIoBk4LlvzB8jKG4mgjqH02Gn6H0ymG2DvQvdIemC7aoYHxVCx4PitSdbl2O_hzAq2/exec'

      let res = null;
      try {
        res = await fetch(url)
      } catch (err) {
        console.warn(`Failed fetch from Apps Script:`, err)
      }

      if (res && res.ok) {
        const textStr = await res.text()
        let msgs = []
        if (textStr && textStr.trim() !== '') {
          try {
            const data = JSON.parse(textStr)
            if (Array.isArray(data)) {
              msgs = data
            }
          } catch (e) {
            console.warn('Failed to parse JSON:', e)
          }
        }

        const grouped = {}
        const fetchedGroups = []

        msgs.forEach(m => {
          const roomId = m.roomId || m['roomId '] || ''

          if (m.type === 'group_created' || m['type'] === 'group_created') {
            try {
              const meta = JSON.parse(m.message || m['message '])
              fetchedGroups.push({
                id: meta.id,
                name: meta.name,
                members: meta.members,
                memberEmails: meta.memberEmails || [],
                creator: meta.creator,
                creatorEmail: meta.creatorEmail || '',
                time: m.timestamp || m['timestamp ']
              })
            } catch (e) { }
            return // Don't show system metadata message in chat
          }
          const msgText = m.message || m['message '] || ''
          if (m.type === 'system' || m['type'] === 'system' || (typeof msgText === 'string' && msgText.startsWith('[ReadReceipt:'))) {
            if (typeof msgText === 'string' && msgText.startsWith('[ReadReceipt:')) {
              const match = msgText.match(/^\[ReadReceipt:([^|]+)\|([^\]]+)\]/)
              if (match) {
                const email = match[1]
                const time = match[2]
                setReadReceiptsByChatId(prev => {
                  const current = prev[roomId] || {}
                  const existingTime = current[email]
                  if (!existingTime || new Date(time).getTime() > new Date(existingTime).getTime()) {
                    return { ...prev, [roomId]: { ...current, [email]: time } }
                  }
                  return prev
                })
              }
            }
            return // Don't show system read receipts in chat UI
          }

          if (!roomId) return
          const mapped = mapN8nMessageToApp(m)
          if (!grouped[roomId]) grouped[roomId] = []
          grouped[roomId].push(mapped)
        })

        setMessagesByChatId(prev => {
          const next = { ...prev }
          let hasChanges = false

          // Clear out rooms that were completely deleted from the sheet
          Object.keys(next).forEach(roomId => {
            if (!grouped[roomId] && next[roomId].length > 0 && !String(roomId).startsWith('groups_metadata')) {
              const hasUnsaved = next[roomId].some(m => String(m.id).startsWith('temp_') || /^\d{13,}$/.test(String(m.id)) || !m.timestamp)
              if (!hasUnsaved) {
                next[roomId] = []
                hasChanges = true
              }
            }
          })

          Object.keys(grouped).forEach(roomId => {
            const sheetMsgs = grouped[roomId] || []

            const matchedFm = new Set()
            let tempMsgs = (next[roomId] || []).filter(m => {
              const isTemp = String(m.id).startsWith('temp_') || /^\d{13,}$/.test(String(m.id)) || !m.timestamp
              if (!isTemp) return false

              // Find a 1-to-1 match in sheetMsgs
              const matchIdx = sheetMsgs.findIndex((fm, idx) => {
                if (matchedFm.has(idx)) return false

                // Direct ID match (most reliable)
                const extractId = (id) => String(id || '').replace('sheet_msg_temp_', '').replace('sheet_msg_', '').replace('temp_', '')
                const fmCleanId = extractId(fm.id)
                const mCleanId = extractId(m.id)
                if (fmCleanId === mCleanId && fmCleanId !== '') return true

                // Fallback text/time matching
                if (fm.type !== m.type) return false
                if (String(fm.text || '').trim() !== String(m.text || '').trim()) return false

                const fmTime = new Date(fm.timestamp).getTime()
                const mTime = new Date(m.timestamp).getTime()
                if (!isNaN(fmTime) && !isNaN(mTime)) {
                  return Math.abs(fmTime - mTime) < 60000 // Within 60 seconds
                }
                return fm.time === m.time
              })

              if (matchIdx !== -1) {
                matchedFm.add(matchIdx)
                return false // It's in the sheet, so remove from tempMsgs
              }
              return true // Keep in tempMsgs (still sending)
            })

            const parseSafeTs = (ts) => {
              if (!ts) return 0
              let d = new Date(ts)
              if (!isNaN(d.getTime())) return d.getTime()
              if (typeof ts === 'string') {
                d = new Date(ts.replace(' ', 'T'))
                if (!isNaN(d.getTime())) return d.getTime()
              }
              return 0
            }

            // Remove ghost messages for the recipient, and mark failed messages for the sender
            tempMsgs = tempMsgs.filter(m => {
              const mTime = parseSafeTs(m.timestamp)
              // If a received message isn't in the sheet after 45s, the sender's webhook failed. Don't show it to the recipient!
              if (m.type === 'received' && mTime > 0 && Date.now() - mTime > 45000) {
                return false
              }
              return true
            }).map(m => {
              const mTime = parseSafeTs(m.timestamp)
              if (mTime > 0 && Date.now() - mTime > 45000) {
                return { ...m, isFailed: true }
              }
              return m
            })

            const allMsgs = [...sheetMsgs, ...tempMsgs].sort((a, b) => {
              // Extract pure UNIX timestamp from ID to completely bypass Google Sheets timezone shifts
              const extractIdTs = (idStr) => {
                if (!idStr) return 0
                const m = String(idStr).match(/(\d{13,})/)
                return m ? parseInt(m[1], 10) : 0
              }
              const idTsA = extractIdTs(a.id)
              const idTsB = extractIdTs(b.id)

              if (idTsA > 0 && idTsB > 0 && idTsA !== idTsB) {
                return idTsA - idTsB
              }

              const ta = parseSafeTs(a.timestamp)
              const tb = parseSafeTs(b.timestamp)
              if (ta === tb || isNaN(ta) || isNaN(tb)) {
                // Fallback to ensuring temp messages appear after sheet messages if timestamps are equal or invalid
                const aIsTemp = String(a.id).startsWith('temp_') || /^\d{13,}$/.test(String(a.id))
                const bIsTemp = String(b.id).startsWith('temp_') || /^\d{13,}$/.test(String(b.id))
                if (aIsTemp && !bIsTemp) return 1
                if (!aIsTemp && bIsTemp) return -1
                return 0
              }
              return ta - tb
            })
            const combined = insertDateDividers(allMsgs)

            if (JSON.stringify(next[roomId]) !== JSON.stringify(combined)) {
              next[roomId] = combined
              hasChanges = true
            }
          })
          return hasChanges ? next : prev
        })

        if (fetchedGroups.length > 0) {
          // Determine the absolute LATEST metadata for each group (in case members were added/removed)
          const latestGroupMetadata = {}
          fetchedGroups.forEach(fg => {
            latestGroupMetadata[fg.id] = fg
          })

          setGroupChats(prev => {
            const newGroups = [...prev]
            let changed = false

            Object.values(latestGroupMetadata).forEach(fg => {
              const myEmail = (profileRef.current?.email || '').toLowerCase()
              const amIMember = (fg.members || []).some(mName => mName.toLowerCase() === (profileRef.current?.name || '').toLowerCase()) ||
                (fg.memberEmails || []).some(e => e.toLowerCase() === myEmail)
              const existingIdx = newGroups.findIndex(g => String(g.id) === String(fg.id))

              if (amIMember) {
                if (existingIdx === -1) {
                  newGroups.push({
                    id: fg.id,
                    name: fg.name,
                    time: new Date(fg.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }),
                    preview: 'Group created.',
                    icon: 'groups',
                    bg: 'bg-primary-container',
                    active: false,
                    creator: fg.creator,
                    creatorEmail: fg.creatorEmail || ''
                  })
                  changed = true
                } else if (newGroups[existingIdx].name !== fg.name) {
                  newGroups[existingIdx].name = fg.name
                  changed = true
                }
              } else {
                // I am no longer a member of this group
                if (existingIdx !== -1) {
                  newGroups.splice(existingIdx, 1)
                  changed = true
                }
              }
            })
            return changed ? newGroups : prev
          })

          setGroupMembers(prev => {
            const newMembers = { ...prev }
            let changed = false
            Object.values(latestGroupMetadata).forEach(fg => {
              const currentMembersStr = JSON.stringify(newMembers[fg.id] || [])
              const nextMembersStr = JSON.stringify((fg.members || []).map(name => ({ name })))
              if (currentMembersStr !== nextMembersStr) {
                newMembers[fg.id] = (fg.members || []).map(name => ({ name }))
                changed = true
              }
            })
            return changed ? newMembers : prev
          })
        }

        const getPreview = (msgsList) => {
          if (!msgsList || msgsList.length === 0) return null
          for (let i = msgsList.length - 1; i >= 0; i--) {
            const m = msgsList[i]
            if (m.type !== 'sent' && m.type !== 'received') continue
            const cleaned = cleanPreviewText(m.text)
            if (cleaned !== null && cleaned !== '') return { text: cleaned, time: m.time }
          }
          return null
        }

        setPersonalChats(prev => {
          let changed = false
          const next = prev.map(c => {
            const msgsList = grouped[c.id]
            let previewObj = getPreview(msgsList)

            if (!previewObj) {
              const localMsgs = chatsRef.current.messagesByChatId[c.id] || []
              const hasUnsaved = localMsgs.some(m => String(m.id).startsWith('temp_') || /^\d{13,}$/.test(String(m.id)))
              if (hasUnsaved) {
                previewObj = getPreview(localMsgs)
              }
            }

            let unreadCount = c.unread || 0

            if (msgsList && msgsList.length > 0 && (String(c.id) !== String(chatsRef.current.activeChatSession?.id) || document.visibilityState !== 'visible')) {
              const lastSeen = lastSeenRef.current[c.id]
              const unreadMsgs = msgsList.filter(m =>
                m.type === 'received' &&
                (!lastSeen || new Date(m.timestamp).getTime() > new Date(lastSeen).getTime())
              )
              const newUnread = unreadMsgs.length
              if (newUnread !== unreadCount) {
                if (newUnread > unreadCount && previewObj) {
                  const latestUnreadMsg = unreadMsgs[unreadMsgs.length - 1]
                  const msgTime = latestUnreadMsg ? new Date(latestUnreadMsg.timestamp).getTime() : 0
                  // Only trigger push notification if the message was received AFTER the app was opened
                  if (latestUnreadMsg && !notifiedMessageIds.current.has(latestUnreadMsg.id) && !isNaN(msgTime) && msgTime > appStartTime.current.getTime()) {
                    notifiedMessageIds.current.add(latestUnreadMsg.id)
                    addSystemAndWebNotification(
                      'New Message',
                      `Message from ${c.name}`,
                      cleanPreviewText(latestUnreadMsg.text) || previewObj.text,
                      c.id
                    )
                  }
                }
                unreadCount = newUnread
                changed = true
              }
            }

            if (!previewObj) {
              if (c.preview !== 'No messages yet.' || c.unread !== unreadCount) {
                changed = true
                return { ...c, preview: 'No messages yet.', time: '10:45 AM', unread: unreadCount }
              }
              return c
            }
            if (previewObj) {
              if (c.preview !== previewObj.text || c.time !== previewObj.time || c.unread !== unreadCount) {
                changed = true
                return { ...c, preview: previewObj.text, time: previewObj.time, unread: unreadCount }
              }
            }
            return c
          })
          return changed ? next : prev
        })

        setGroupChats(prev => {
          let changed = false
          const next = prev.map(c => {
            const msgsList = grouped[c.id]
            let previewObj = getPreview(msgsList)

            if (!previewObj) {
              const localMsgs = chatsRef.current.messagesByChatId[c.id] || []
              const hasUnsaved = localMsgs.some(m => String(m.id).startsWith('temp_') || /^\d{13,}$/.test(String(m.id)))
              if (hasUnsaved) {
                previewObj = getPreview(localMsgs)
              }
            }

            let unreadCount = c.unread || 0

            if (msgsList && msgsList.length > 0 && (String(c.id) !== String(chatsRef.current.activeChatSession?.id) || document.visibilityState !== 'visible')) {
              const lastSeen = lastSeenRef.current[c.id]

              // Find when the current user joined this group (if applicable)
              let joinTime = 0
              const myName = String(profileRef.current?.name || '').trim().toLowerCase()
              msgsList.forEach(m => {
                if (m.type === 'system') {
                  const sysText = String(m.text || '').toLowerCase()
                  if (sysText.includes(myName) && (sysText.includes('joined') || sysText.includes('added'))) {
                    const mTime = new Date(m.timestamp).getTime()
                    if (!isNaN(mTime) && mTime > joinTime) joinTime = mTime
                  }
                }
              })

              let effectiveLastSeenTime = lastSeen ? new Date(lastSeen).getTime() : 0
              if (joinTime > effectiveLastSeenTime) effectiveLastSeenTime = joinTime

              const unreadMsgs = msgsList.filter(m => {
                const mTime = new Date(m.timestamp).getTime()
                if (isNaN(mTime)) return false

                if (m.type === 'received') {
                  return mTime > effectiveLastSeenTime
                }

                if (m.type === 'system') {
                  const sysText = String(m.text || '').toLowerCase()
                  const myNameStr = String(profileRef.current?.name || '').trim().toLowerCase()
                  // If the system message explicitly says this user was added
                  if (myNameStr && sysText.includes(`added ${myNameStr}`)) {
                    const lastSeenMs = lastSeen ? new Date(lastSeen).getTime() : 0
                    // For this exact join message, we only compare against raw lastSeen
                    return mTime > lastSeenMs
                  }
                }
                return false
              })
              const newUnread = unreadMsgs.length
              if (newUnread !== unreadCount) {
                if (newUnread > unreadCount && previewObj) {
                  const latestUnreadMsg = unreadMsgs[unreadMsgs.length - 1]
                  const msgTime = latestUnreadMsg ? new Date(latestUnreadMsg.timestamp).getTime() : 0
                  // Only trigger push notification if the message was received AFTER the app was opened
                  if (latestUnreadMsg && !notifiedMessageIds.current.has(latestUnreadMsg.id) && !isNaN(msgTime) && msgTime > appStartTime.current.getTime()) {
                    notifiedMessageIds.current.add(latestUnreadMsg.id)
                    const msgTextStr = String(latestUnreadMsg.text || '')
                    const myNameStr = String(profileRef.current?.name || '').trim()

                    let notifCategory = 'New Group Message'
                    let notifTitle = `Message in ${c.name}`
                    let notifBody = cleanPreviewText(latestUnreadMsg.text) || previewObj.text

                    let mentionedOthers = []
                    const allEmps = Array.isArray(chatsRef.current?.employees) ? chatsRef.current.employees : []
                    allEmps.forEach(emp => {
                      if (emp.name && emp.name.toLowerCase() !== myNameStr.toLowerCase() && msgTextStr.toLowerCase().includes(`@${emp.name.toLowerCase()}`)) {
                        mentionedOthers.push(emp.name)
                      }
                    })

                    if (msgTextStr.includes('@all')) {
                      notifCategory = 'Group Mention'
                      notifTitle = `Mention in ${c.name}`
                      notifBody = `${latestUnreadMsg.sender || 'Someone'} mentioned @all: ${previewObj.text}`
                    } else if (myNameStr && msgTextStr.toLowerCase().includes(`@${myNameStr.toLowerCase()}`)) {
                      notifCategory = 'Group Mention'
                      notifTitle = `Mention in ${c.name}`
                      notifBody = `${latestUnreadMsg.sender || 'Someone'} mentioned you: ${previewObj.text}`
                    } else if (mentionedOthers.length > 0) {
                      notifCategory = 'Group Mention'
                      notifTitle = `Mention in ${c.name}`
                      notifBody = `${latestUnreadMsg.sender || 'Someone'} mentioned ${mentionedOthers.join(', ')}: ${cleanPreviewText(latestUnreadMsg.text) || previewObj.text}`
                    } else if (latestUnreadMsg.type === 'system' && myNameStr && msgTextStr.toLowerCase().includes(`added ${myNameStr.toLowerCase()}`)) {
                      notifCategory = 'Group Invitation'
                      notifTitle = `Added to ${c.name}`
                      notifBody = latestUnreadMsg.text
                    }

                    addSystemAndWebNotification(
                      notifCategory,
                      notifTitle,
                      notifBody,
                      c.id
                    )
                  }
                }
                unreadCount = newUnread
                changed = true
              }
            }

            if (!previewObj) {
              if (c.preview !== 'Group created.' && c.preview !== 'No messages yet.' || c.unread !== unreadCount) {
                changed = true
                return { ...c, preview: 'No messages yet.', time: '10:45 AM', unread: unreadCount }
              }
              return c
            }
            if (previewObj) {
              if (c.preview !== previewObj.text || c.time !== previewObj.time || c.unread !== unreadCount) {
                changed = true
                return { ...c, preview: previewObj.text, time: previewObj.time, unread: unreadCount }
              }
            }
            return c
          })
          return changed ? next : prev
        })
      }
    } catch (err) {
      console.warn('Failed to fetch messages:', err)
    }
  }, [])

  // Poll for new messages every 5 minutes as a fallback.
  // Real-time updates are handled entirely by MQTT now.
  // Also re-fetch immediately when the user returns to this tab
  useEffect(() => {
    fetchMessages()
    const interval = setInterval(fetchMessages, 300000) // 5 minutes

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchMessages()
        const activeId = chatsRef.current.activeChatSession?.id
        if (activeId) {
          markChatAsRead(activeId)
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // MQTT subscription for instant updates
    mqttClient.subscribe('dd_chat_engine_v1/#')
    const handleMqttMessage = (topic, message) => {
      try {
        const payload = JSON.parse(message.toString())
        const roomId = payload.roomId
        if (!roomId) return

        if (payload.action === 'delivery_receipt') {
          setMessageStatusByChatId(prev => {
            const room = prev[roomId] || { deliveredIds: {}, maxReadTime: 0 }
            if (!payload.messageId) return prev
            return { ...prev, [roomId]: { ...room, deliveredIds: { ...room.deliveredIds, [payload.messageId]: true } } }
          })
          return
        }

        if (payload.action === 'read_receipt') {
          setMessageStatusByChatId(prev => {
            const room = prev[roomId] || { deliveredIds: {}, maxReadTime: 0, maxReadTimeByEmail: {} }
            let parsedTime = payload.timestamp
            if (typeof parsedTime === 'string' && /^\d+$/.test(parsedTime)) {
              parsedTime = parseInt(parsedTime, 10)
            }
            const newTime = new Date(parsedTime).getTime()
            const email = payload.senderEmail

            const updatedMaxReadTimeByEmail = { ...(room.maxReadTimeByEmail || {}) }
            if (email && (!updatedMaxReadTimeByEmail[email] || newTime > updatedMaxReadTimeByEmail[email])) {
              updatedMaxReadTimeByEmail[email] = newTime
            }

            let newMaxReadTime = room.maxReadTime
            if (!isNaN(newTime) && newTime > room.maxReadTime) {
              newMaxReadTime = newTime
            }

            const updatedReadIds = { ...(room.readIds || {}) }
            if (payload.messageId) {
              updatedReadIds[payload.messageId] = true
            }

            return { ...prev, [roomId]: { ...room, maxReadTime: newMaxReadTime, maxReadTimeByEmail: updatedMaxReadTimeByEmail, readIds: updatedReadIds } }
          })
          return
        }

        const mapped = mapN8nMessageToApp(payload)

        // If it's a message from someone else, instantly broadcast a delivery receipt
        const pSender = String(payload.senderName || payload.sendername || '').trim().toLowerCase()
        const myName = String(profileRef.current?.name || 'Mansi Shah').trim().toLowerCase()
        const pEmail = String(payload.senderId || payload.senderid || '').trim().toLowerCase()
        const myEmail = String(profileRef.current?.email || 'mansi@dreamsdesign.in').trim().toLowerCase()

        const isMe = (pSender !== '' && pSender === myName) || (pEmail !== '' && pEmail === myEmail)

        // Only process personal messages where current user is a participant
        const myEmailTrimmed = profileRef.current?.email?.toLowerCase().trim()
        const isParticipant = payload.type !== 'personal' || (myEmailTrimmed && roomId && (roomId.startsWith(myEmailTrimmed + '_') || roomId.endsWith('_' + myEmailTrimmed)))
        if (!isParticipant) return

        const cleanText = cleanPreviewText(payload.message || '') || payload.message || ''
        const shortText = cleanText.length > 50 ? cleanText.substring(0, 50) + '...' : cleanText
        const nowTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })

        // 1. Instantly update the sidebar preview (for both sent and received)
        if (payload.type === 'personal') {
          setPersonalChats(prev => prev.map(c => String(c.id) === String(roomId) ? { ...c, preview: shortText, time: nowTime } : c))
        } else if (payload.type === 'group') {
          setGroupChats(prev => prev.map(g => String(g.id) === String(roomId) ? { ...g, preview: shortText, time: nowTime } : g))
        }

        if (payload.action === 'send' && !isMe) {
          if (mqttClient && mqttClient.connected) {
            mqttClient.publish('dd_chat_engine_v1/' + roomId, JSON.stringify({
              action: 'delivery_receipt',
              roomId: roomId,
              messageId: payload.id, // we send the tempId back
              senderEmail: profileRef.current?.email
            }))
          }

          // 2. Instant Notification for Task Chats
          if (payload.type === 'task_reply') {
            const taskId = payload.roomId
            const taskObj = tasksRef.current.find(t => t.id === taskId)
            if (taskObj) {
              const assignees = (taskObj.assignedTo || '').split(',').map(s => s.trim())
              const participants = [...assignees, taskObj.assignedBy].filter(Boolean)

              if (participants.includes(profileRef.current?.name)) {
                let cleanTextTask = payload.message || ''
                cleanTextTask = cleanTextTask.replace(/\[Attachment:[^\]]+\]/g, '📎 Attachment').replace(/\[Reply:[^\]]+\]/g, '')
                if (cleanTextTask.length > 50) cleanTextTask = cleanTextTask.substring(0, 50) + '...'

                addSystemAndWebNotification(
                  'Task Chat',
                  `New reply on ${taskId}`,
                  `${payload.senderName}: ${cleanTextTask}`,
                  taskId
                )
              }
            }
          }
          // 3. Instant Notification & Unread Badge for Personal/Group Chats
          else if (payload.type === 'personal' || payload.type === 'group') {
            const isActiveAndFocused = String(roomId) === String(chatsRef.current.activeChatSession?.id) && document.visibilityState === 'visible'

            if (!isActiveAndFocused) {
              // Update unread badges instantly
              if (payload.type === 'personal') {
                setPersonalChats(prev => prev.map(c => String(c.id) === String(roomId) ? { ...c, unread: (c.unread || 0) + 1 } : c))
              } else {
                setGroupChats(prev => prev.map(g => String(g.id) === String(roomId) ? { ...g, unread: (g.unread || 0) + 1 } : g))
              }

              // Trigger push notification instantly
              if (!notifiedMessageIds.current.has(payload.id)) {
                notifiedMessageIds.current.add(payload.id)
                addSystemAndWebNotification(
                  payload.type === 'group' ? 'New Group Message' : 'New Message',
                  payload.type === 'group' ? `Message in ${payload.groupName || 'Group'}` : `Message from ${payload.senderName}`,
                  shortText,
                  roomId
                )
              }
            }
          }
        }

        setMessagesByChatId(prev => {
          const existing = prev[roomId] || []
          // Check if we already have it
          if (existing.some(m => String(m.id) === String(mapped.id) || (m.type === mapped.type && m.text === mapped.text && m.time === mapped.time))) {
            return prev
          }

          const next = { ...prev }
          // Add to the list and sort
          const allMsgs = [...existing, mapped].sort((a, b) => {
            const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0
            const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0
            return ta - tb
          })

          next[roomId] = insertDateDividers(allMsgs)
          return next
        })
      } catch (err) {
        console.warn('Failed to parse MQTT message:', err)
      }
    }
    mqttClient.on('message', handleMqttMessage)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      mqttClient.unsubscribe('dd_chat_engine_v1/#')
      mqttClient.removeListener('message', handleMqttMessage)
    }
  }, [])

  const formatDescriptionForSheet = (desc) => {
    if (!desc) return '';
    if (typeof desc === 'string') return desc;

    // Check if it's an effectively empty structured description
    const intro = String(desc.intro || '').trim();
    const isIntroEmpty = !intro || intro === 'Synced from n8n webhook.' || intro === 'No description provided.';
    const hasBullets = desc.bullets && desc.bullets.length > 0;
    const hasOutro = desc.outro && String(desc.outro).trim() !== '';
    const hasSubtasks = desc.subtasks && desc.subtasks.length > 0;
    const hasEditedAt = !!desc.editedAt;
    if (isIntroEmpty && !hasBullets && !hasOutro && !hasSubtasks && !hasEditedAt) {
      return '';
    }

    return JSON.stringify(desc);
  }

  const updateTask = async (id, fields) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...fields } : t))
    )

    const currentTask = tasks.find((t) => t.id === id)
    if (!currentTask) return

    let hasStatusChange = fields.status !== undefined && fields.status !== currentTask.status;
    if (hasStatusChange && !fields.statusUpdatedOn) {
      fields.statusUpdatedOn = getISTDate();
    }

    const mergedTask = {
      ...currentTask,
      ...fields
    }
    let updateType = 'Status Updates'
    let updateTitle = `Task ${id} Updated`
    let updateSubtitle = mergedTask.title

    // Update our tracker so we don't notify ourselves
    initialTaskData.current[id] = mergedTask
    recentTaskUpdates.current[id] = { timestamp: Date.now(), fields }

    let shouldNotify = true

    if (hasStatusChange) {
      initialTaskStatuses.current[id] = fields.status
      updateTitle = `Task ${id} status updated to ${fields.status}`
    } else if (fields.comments && (!currentTask.comments || fields.comments.length > currentTask.comments.length)) {
      // New comment added locally — if the author is the current user, don't self-notify
      const latestComment = fields.comments[fields.comments.length - 1]
      const myName = String(profile?.name || 'Mansi Shah').trim().toLowerCase()
      const cAuthor = String(latestComment?.author || '').trim().toLowerCase()
      if (cAuthor === myName) shouldNotify = false
      updateTitle = `New comment on Task ${id}`
    } else if (fields.comments && currentTask.comments && fields.comments.length === currentTask.comments.length) {
      // Same comment count (like/update) — user's own interaction, no self-notify
      shouldNotify = false
    } else if (fields.attachments && (!currentTask.attachments || fields.attachments.length > currentTask.attachments.length)) {
      updateTitle = `Attachment added to Task ${id}`
    } else if (fields.assignedTo && fields.assignedTo !== currentTask.assignedTo) {
      updateTitle = `Task Reassigned`
      updateSubtitle = `You have been assigned to ${mergedTask.title}`
      updateType = 'Task Reminders'
    } else if (fields.description && fields.description !== currentTask.description) {
      updateTitle = `Task ${id} description updated`
    }

    const myNameStr = String(profile?.name || 'Mansi Shah').trim().toLowerCase()
    const assigneesArr = (mergedTask.assignedTo || '').split(',').map(s => s.trim().toLowerCase())
    const assignedByStr = String(mergedTask.assignedBy || '').trim().toLowerCase()
    const isRelated = assigneesArr.includes(myNameStr) || assignedByStr === myNameStr

    if (shouldNotify && isRelated) {
      addToast(`${updateTitle}`, 'success')
    }

    // Auto-stop timer if task is marked Done
    if (hasStatusChange && fields.status === 'Done' && activeTimer && activeTimer.taskId === id) {
      toggleTimer(currentTask, profile?.name)
    }

    try {
      const url = 'https://script.google.com/macros/s/AKfycbxIoBk4LlvzB8jKG4mgjqH02Gn6H0ymG2DvQvdIemC7aoYHxVCx4PitSdbl2O_hzAq2/exec'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'update_task',
          taskId: mergedTask.id,
          client: mergedTask.client,
          month: mergedTask.project || '',
          taskTitle: mergedTask.title,
          taskType: mergedTask.taskType || 'Main Task',
          mainTaskId: mergedTask.mainTaskId || '',
          description: formatDescriptionForSheet(mergedTask.description),
          assignedBy: mergedTask.assignedBy,
          assignedTo: mergedTask.assignedTo,
          employeeId: (employees?.filter(e => (mergedTask.assignedTo || '').split(',').map(s => s.trim()).includes(e.name)) || []).map(e => e.id).join(', '),
          assignedEmail: mergedTask.assignedEmail || '',
          department: mergedTask.department || 'COMMON',
          assignedDate: mergedTask.assignedDate || mergedTask.assigned || new Date().toISOString().split('T')[0],
          dueDate: mergedTask.dueDate,
          priority: mergedTask.priority,
          status: mergedTask.status,
          statusUpdatedOn: new Date().toISOString().split('T')[0],
          timeTaken: mergedTask.timeTaken || '0h 0m',
          daysOverdue: mergedTask.daysOverdue || 'No',
          remarks: mergedTask.comments && mergedTask.comments.length > 0 ? mergedTask.comments[mergedTask.comments.length - 1].text : '',
          post: mergedTask.post || 'YES',
          attachment: (mergedTask.attachments && mergedTask.attachments.length > 0) ? mergedTask.attachments.map(a => a.url).join(', \n') : '',
          isRecurring: mergedTask.isAutoGenerated ? 'AUTO_GENERATED' : (mergedTask.isRecurring || false),
          recurringSchedule: mergedTask.recurringSchedule || '',
          recurringDay: mergedTask.recurringDay || '',
          recurringMonths: mergedTask.recurringMonths || ''
        })
      })
      const data = await res.json()
      if (!data.ok) {
        console.error('Apps Script Error (update_task):', data.error)
        addToast('Failed to sync to Google Sheets: ' + data.error, 'error')
      }
      if (mqttClient && mqttClient.connected) {
        setTimeout(() => {
          mqttClient.publish('dd_task_engine_v1/sync', JSON.stringify({ action: 'sync' }))
        }, 1000)
      }
    } catch (err) {
      console.warn('Failed to sync task update to Google Sheets:', err)
    }

    // Sync status change to daily sheet row
    if (hasStatusChange && profile?.email && isPunchedIn) {
      const DAILY_SHEET_URL = 'https://script.google.com/macros/s/AKfycbzrLvG8wg2zPqchsavvLbgIR5vD_iPAxwSRxMRJMjQgW3YuUuaoRYSXUDF7_A1sWswqxA/exec';
      if (DAILY_SHEET_URL !== 'YOUR_NEW_APPS_SCRIPT_WEB_APP_URL_HERE') {
        fetch(DAILY_SHEET_URL, {
          method: 'POST', mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'log_task_status_update',
            email: profile.email,
            name: profile?.name || 'Unknown',
            date: getISTDate(),
            title: mergedTask.title,
            status: mergedTask.status,
            startTime: mergedTask.startTime || getISTTime(),
            endTime: mergedTask.status === 'Done' ? (mergedTask.endTime || getISTTime()) : (mergedTask.endTime || '')
          })
        }).catch(() => {})
      }
    }
  }

  const markAllNotificationsRead = () => {
    setNotifications([])
  }

  const markNotificationRead = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const toggleTimer = useCallback((taskToToggle, profileName) => {
    const nowIST = getISTTime();
    if (activeTimer && activeTimer.taskId === taskToToggle.id) {
      // Stop timer
      const elapsed = Math.floor((Date.now() - activeTimer.startTime) / 1000);
      const timeData = parseMultiUserTimeStr(taskToToggle.timeTaken);
      const myName = profileName || 'Mansi Shah';

      if (timeData[myName]) {
        timeData[myName] += elapsed;
      } else {
        timeData[myName] = elapsed;
      }

      const startIST = activeTimer.istStartTime || taskToToggle.startTime || nowIST;
      updateTask(taskToToggle.id, { timeTaken: buildMultiUserTimeStr(timeData), startTime: startIST, endTime: nowIST });
      setActiveTimer(null);

      const DAILY_SHEET_URL = 'https://script.google.com/macros/s/AKfycbzrLvG8wg2zPqchsavvLbgIR5vD_iPAxwSRxMRJMjQgW3YuUuaoRYSXUDF7_A1sWswqxA/exec';
      if (profile?.email && DAILY_SHEET_URL !== 'YOUR_NEW_APPS_SCRIPT_WEB_APP_URL_HERE') {
        fetch(DAILY_SHEET_URL, {
          method: 'POST', mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'log_task_end',
            email: profile.email,
            name: profile?.name || 'Unknown',
            date: getISTDate(),
            title: taskToToggle.title,
            endTime: nowIST
          })
        }).catch(() => {})
      }
    } else {
      // Don't start timer for completed tasks
      if (taskToToggle.status === 'Done') {
        addToast("Cannot start timer for a completed task.", "error");
        return;
      }
      // Start timer
      if (activeTimer) {
        addToast("Please stop the active timer before starting a new one.", "error");
        return;
      }
      updateTask(taskToToggle.id, { startTime: nowIST, endTime: '' });
      setActiveTimer({ taskId: taskToToggle.id, taskTitle: taskToToggle.title, startTime: Date.now(), istStartTime: nowIST });

      const DAILY_SHEET_URL = 'https://script.google.com/macros/s/AKfycbzrLvG8wg2zPqchsavvLbgIR5vD_iPAxwSRxMRJMjQgW3YuUuaoRYSXUDF7_A1sWswqxA/exec';
      if (profile?.email && DAILY_SHEET_URL !== 'YOUR_NEW_APPS_SCRIPT_WEB_APP_URL_HERE') {
        fetch(DAILY_SHEET_URL, {
          method: 'POST', mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'log_task_start',
            email: profile.email,
            name: profile?.name || 'Unknown',
            date: getISTDate(),
            project: taskToToggle.client || taskToToggle.project || '',
            title: taskToToggle.title,
            status: taskToToggle.status || '',
            startTime: nowIST
          })
        }).catch(() => {})
      }
    }
  }, [activeTimer, profile, addToast])

  // Listen for timer stop from Electron overlay
  useEffect(() => {
    if (!window.require) return
    try {
      const { ipcRenderer } = window.require('electron')
      const handler = () => {
        if (activeTimer) {
          const foundTask = tasksRef.current.find(t => t.id === activeTimer.taskId)
          if (foundTask) {
            const name = profile?.name || 'Mansi Shah'
            toggleTimer(foundTask, name)
          }
        }
      }
      ipcRenderer.on('timer-stop-from-overlay', handler)
      return () => ipcRenderer.removeListener('timer-stop-from-overlay', handler)
    } catch (e) { }
  }, [activeTimer, toggleTimer, profile])

  const addTask = async (newTask) => {
    setTasks((prev) => [newTask, ...prev])

    // Notifications for newly created tasks will be handled by fetchTasks via MQTT sync
    // for the relevant assignees. No need to show local notifications here to the creator.

    if (!initialTaskIds.current) {
      initialTaskIds.current = new Set()
    }
    initialTaskIds.current.add(newTask.id)
    initialTaskStatuses.current[newTask.id] = newTask.status

    // Prevent this new task from being wiped out by an immediate sync
    recentTaskUpdates.current[newTask.id] = { timestamp: Date.now(), fields: newTask, isNew: true }
    try {
      const url = 'https://script.google.com/macros/s/AKfycbxIoBk4LlvzB8jKG4mgjqH02Gn6H0ymG2DvQvdIemC7aoYHxVCx4PitSdbl2O_hzAq2/exec'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'add_task',
          taskId: newTask.id,
          client: newTask.client,
          month: newTask.project || '',
          taskTitle: newTask.title,
          taskType: newTask.taskType || 'Main Task',
          mainTaskId: newTask.mainTaskId || '',
          description: formatDescriptionForSheet(newTask.description),
          assignedBy: newTask.assignedBy,
          assignedTo: newTask.assignedTo,
          employeeId: newTask.employeeId || '',
          assignedEmail: newTask.assignedEmail || '',
          department: newTask.department || 'COMMON',
          assignedDate: newTask.assignedDate || newTask.assigned || new Date().toISOString().split('T')[0],
          dueDate: newTask.dueDate,
          priority: newTask.priority,
          status: newTask.status,
          statusUpdatedOn: new Date().toISOString().split('T')[0],
          timeTaken: newTask.timeTaken || '0h 0m',
          daysOverdue: newTask.daysOverdue || 'No',
          remarks: newTask.remarks || '',
          post: newTask.post || 'YES',
          attachment: (newTask.attachments && newTask.attachments.length > 0) ? newTask.attachments.map(a => a.url).join(', \n') : '',
          isRecurring: newTask.isAutoGenerated ? 'AUTO_GENERATED' : (newTask.isRecurring || false),
          recurringSchedule: newTask.recurringSchedule || '',
          recurringDay: newTask.recurringDay || '',
          recurringMonths: newTask.recurringMonths || ''
        })
      })
      if (res.ok) {
        addToast('Task added successfully!', 'success')
      }
      if (mqttClient && mqttClient.connected) {
        setTimeout(() => {
          mqttClient.publish('dd_task_engine_v1/sync', JSON.stringify({ action: 'sync' }))
        }, 1000)
      }
    } catch (err) {
      addToast('Task added locally, but failed to sync to Google Sheets.', 'error')
      console.warn('Failed to sync new task to Google Sheets:', err)
    }
  }

  const deleteTask = async (id) => {
    try {
      const url = 'https://script.google.com/macros/s/AKfycbxIoBk4LlvzB8jKG4mgjqH02Gn6H0ymG2DvQvdIemC7aoYHxVCx4PitSdbl2O_hzAq2/exec'
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'delete_task',
          taskId: id,
          userEmail: profile?.email
        })
      })
      if (response.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== id))
        if (mqttClient && mqttClient.connected) {
          mqttClient.publish('dd_task_engine_v1/sync', JSON.stringify({ action: 'sync' }))
        }
      } else {
        setTasks((prev) => prev.filter((t) => t.id !== id))
      }
    } catch (err) {
      console.warn('Delete task failed:', err)
      setTasks((prev) => prev.filter((t) => t.id !== id))
    }
  }

  const fetchSyncedTasks = async () => {
    const handleSetTasksWithNotification = (newTasksList) => {
      // OVERRIDE server state immediately if we updated this task locally in the last 15 seconds
      newTasksList.forEach(nt => {
        const recent = recentTaskUpdates.current[nt.id]
        if (recent && Date.now() - recent.timestamp < 15000) {
          Object.assign(nt, recent.fields)
          if (recent.isNew) recent.isNew = false // Task has arrived from server
        }
      })

      // INJECT newly created tasks that haven't made it to the server yet
      Object.entries(recentTaskUpdates.current).forEach(([id, recent]) => {
        if (recent.isNew && Date.now() - recent.timestamp < 15000) {
          if (!newTasksList.find(t => t.id === id)) {
            newTasksList.unshift(recent.fields)
          }
        }
      })

      if (newTasksList.length > 0) {
        if (initialTaskIds.current === null) {
          initialTaskIds.current = new Set(newTasksList.map(t => t.id))
          newTasksList.forEach(t => {
            initialTaskStatuses.current[t.id] = t.status
            initialTaskData.current[t.id] = { ...t }
          })
        } else {
          newTasksList.forEach(nt => {
            const hasId = initialTaskIds.current.has(nt.id)
            if (!hasId) {
              initialTaskIds.current.add(nt.id)
              initialTaskStatuses.current[nt.id] = nt.status
              initialTaskData.current[nt.id] = { ...nt }

              const myName = String(profile?.name || 'Mansi Shah').trim().toLowerCase()
              const assigneesArr = (nt.assignedTo || '').split(',').map(s => s.trim().toLowerCase())
              const assignedByStr = String(nt.assignedBy || '').trim().toLowerCase()
              const isRelated = assigneesArr.includes(myName) || assignedByStr === myName

              if (isRelated) {
                let title = `New Task Created: ${nt.title}`
                let subtitle = `Assigned to: ${nt.assignedTo} by ${nt.assignedBy}`
                let category = 'Task Reminders'

                if (assigneesArr.includes(myName)) {
                  title = `New Task Assigned to You`
                  subtitle = `${nt.assignedBy} assigned you: ${nt.title}`
                } else {
                  title = `New Task for ${nt.assignedTo}`
                  subtitle = `${nt.assignedBy} assigned a task to ${nt.assignedTo}`
                }

                addSystemAndWebNotification(
                  category,
                  title,
                  subtitle,
                  nt.id
                )
              }

              // Auto-set the due date for recurring auto-generated tasks (frontend-only fix)
              if (nt.isAutoGenerated && !nt.dueDate && nt.recurringSchedule) {
                const nextDue = computeRecurringDueDate(nt.recurringSchedule, nt.recurringDay, nt.recurringMonths, new Date(), true)
                if (nextDue) {
                  updateTask(nt.id, { dueDate: nextDue })
                }
              }
            } else {
              const oldData = initialTaskData.current[nt.id] || {}
              let updatedFields = []

              const myName = String(profile?.name || 'Mansi Shah').trim().toLowerCase()
              const assigneesArr = (nt.assignedTo || '').split(',').map(s => s.trim().toLowerCase())
              const oldAssigneesArr = (oldData.assignedTo || '').split(',').map(s => s.trim().toLowerCase())
              const assignedByStr = String(nt.assignedBy || '').trim().toLowerCase()
              const isRelated = assigneesArr.includes(myName) || assignedByStr === myName

              const justAssignedToMe = assigneesArr.includes(myName) && !oldAssigneesArr.includes(myName) && oldData.assignedTo !== undefined

              if (oldData.status && oldData.status !== nt.status) updatedFields.push(`status to ${nt.status}`)
              if (oldData.assignedTo && oldData.assignedTo !== nt.assignedTo) {
                if (!justAssignedToMe) {
                  updatedFields.push(`assigned to ${nt.assignedTo}`)
                }
              }
              if (oldData.priority && oldData.priority !== nt.priority) updatedFields.push(`priority to ${nt.priority}`)
              if (oldData.dueDate && oldData.dueDate !== nt.dueDate) updatedFields.push(`due date to ${nt.dueDate}`)
              if (oldData.title && oldData.title !== nt.title) updatedFields.push(`title changed`)

              const oldEditedAt = oldData.description?.editedAt || ''
              const newEditedAt = nt.description?.editedAt || ''
              if (newEditedAt && newEditedAt !== oldEditedAt) {
                updatedFields.push(`description updated`)
              }

              const oldCommentsLen = oldData.comments ? oldData.comments.length : 0
              const newCommentsLen = nt.comments ? nt.comments.length : 0
              if (newCommentsLen > oldCommentsLen) {
                const latestComment = nt.comments[nt.comments.length - 1]
                const cAuthor = String(latestComment?.author || '').trim().toLowerCase()

                if (cAuthor !== myName) {
                  updatedFields.push(`new comment added`)
                }
              }

              if (justAssignedToMe) {
                initialTaskStatuses.current[nt.id] = nt.status
                initialTaskData.current[nt.id] = { ...nt }
                addSystemAndWebNotification(
                  'Task Reminders',
                  `New Task Assigned to You`,
                  `${nt.assignedBy} assigned you to: ${nt.title}`,
                  nt.id
                )
              } else if (updatedFields.length > 0 && isRelated) {
                initialTaskStatuses.current[nt.id] = nt.status
                initialTaskData.current[nt.id] = { ...nt }
                addSystemAndWebNotification(
                  'Status Updates',
                  `Task ${nt.id} Updated`,
                  `${nt.title} (${updatedFields.join(', ')})`,
                  nt.id
                )
              }

              const todayStr = new Date().toDateString()
              let notifiedHistory = {}
              try {
                notifiedHistory = JSON.parse(localStorage.getItem('dd_overdue_notified') || '{}')
              } catch (e) { }

              let isCompletedOrBlocked = nt.status === 'Done' || nt.status === 'Blocked'
              if (nt.overdue && !isCompletedOrBlocked) {
                if (notifiedHistory[nt.id] !== todayStr && isRelated) {
                  notifiedHistory[nt.id] = todayStr
                  localStorage.setItem('dd_overdue_notified', JSON.stringify(notifiedHistory))

                  initialTaskOverdueStatuses.current[nt.id] = true
                  const prioText = nt.priority === 'High' ? '🔴 High Priority: ' : (nt.priority === 'Medium' ? '🟡 Medium Priority: ' : '')
                  addSystemAndWebNotification(
                    'Overdue Alerts',
                    `${prioText}Task ${nt.id} is overdue`,
                    nt.title,
                    nt.id
                  )
                }
              } else {
                if (!nt.overdue) {
                  initialTaskOverdueStatuses.current[nt.id] = false
                }

                // Check if due today
                if (nt.dueDate && !isCompletedOrBlocked) {
                  const dueD = new Date(nt.dueDate).toDateString()
                  if (dueD === todayStr && notifiedHistory[`${nt.id}_due_today`] !== todayStr && isRelated) {
                    notifiedHistory[`${nt.id}_due_today`] = todayStr
                    localStorage.setItem('dd_overdue_notified', JSON.stringify(notifiedHistory))

                    const prioText = nt.priority === 'High' ? '🔴 High Priority: ' : (nt.priority === 'Medium' ? '🟡 Medium Priority: ' : '')
                    addSystemAndWebNotification(
                      'Task Reminders',
                      `Due Today: Task ${nt.id}`,
                      `${prioText}${nt.title}`,
                      nt.id
                    )
                  }
                }
              }
            }
          })
        }
        setTasks((prevTasks) => {
          const finalTasks = newTasksList.map(newTask => {
            const existingTask = prevTasks.find(t => t.id === newTask.id)
            if (existingTask && existingTask.comments && existingTask.comments.length > 0) {
              const mergedComments = [...existingTask.comments]
              if (newTask.comments) {
                newTask.comments.forEach(nc => {
                  if (!mergedComments.some(ec => ec.id === nc.id || ec.text === nc.text)) {
                    mergedComments.push(nc)
                  }
                })
              }
              newTask.comments = mergedComments
            }

            return newTask
          })
          return finalTasks
        })
      } else {
        setTasks([])
      }
    }

    try {
      const url = `https://script.google.com/macros/s/AKfycbxIoBk4LlvzB8jKG4mgjqH02Gn6H0ymG2DvQvdIemC7aoYHxVCx4PitSdbl2O_hzAq2/exec?action=get_tasks&t=${Date.now()}`
      const res = await fetch(url)

      if (res.ok) {
        const text = await res.text()
        try {
          const parsed = JSON.parse(text)
          const items = Array.isArray(parsed) ? parsed : [parsed]
          const newTasks = []

          items.forEach(item => {
            // Filter out empty rows that Google Sheets might return
            if (item.taskId || item.id || item["Task ID"]) {
              const mapped = mapWebhookTaskToApp(item)
              if (mapped) {
                newTasks.push(mapped)
              }
            }
          })

          handleSetTasksWithNotification(newTasks)
        } catch (e) {
          console.warn('Failed to parse Google Sheets tasks:', e)
        }
      }
    } catch (err) {
      console.warn('Direct Google Sheet task fetch failed:', err)
    }
    tasksLoadedRef.current = true
  }

  const updateTeamAndChats = useCallback((fetchedTeam) => {
    const combined = fetchedTeam && fetchedTeam.length > 0 ? fetchedTeam : STATIC_EMPLOYEES

    // User is only Online when punched in; login alone does not make them active
    const withStatus = combined.map(e =>
      e.email === profile?.email ? { ...e, status: isPunchedIn ? 'Online' : 'Offline' } : e
    )

    setEmployees(prev => {
      if (prev.length === withStatus.length && prev.every((e, i) => e.id === withStatus[i].id && e.status === withStatus[i].status)) {
        return prev
      }
      return withStatus
    })

    setPersonalChats(prev => {
      const chatList = combined
        .filter(m => m.name.toLowerCase() !== (profile?.name || '').toLowerCase())
        .map((m, idx) => {
          const roomId = getPersonalChatRoomId(profile, m)
          const existing = prev.find(c => c.name.toLowerCase() === m.name.toLowerCase())
          return {
            id: roomId,
            name: m.name,
            email: m.email,
            role: m.role,
            department: m.department,
            location: m.location,
            time: existing?.time || '10:45 AM',
            preview: existing?.preview || 'No messages yet.',
            avatar: m.avatar,
            online: (existing && existing.online !== undefined) ? existing.online : m.status === 'Online',
            unread: existing?.unread || 0,
            active: existing ? existing.active : (idx === 0)
          }
        })
        // Exclude chats the user has deleted
        .filter(c => !deletedPersonalChatIds.has(String(c.id)))

      if (prev.length === chatList.length) {
        const isIdentical = prev.every((c, idx) => {
          const target = chatList[idx]
          return c.id === target.id &&
            c.name === target.name &&
            c.time === target.time &&
            c.preview === target.preview &&
            c.avatar === target.avatar &&
            c.unread === target.unread &&
            c.active === target.active
        })
        if (isIdentical) return prev
      }
      return chatList
    })
  }, [profile, deletedPersonalChatIds, isPunchedIn])

  // Re-generate personal chats whenever profile changes to filter out the current user and update room IDs
  useEffect(() => {
    updateTeamAndChats(employees)
  }, [profile, employees, deletedPersonalChatIds, updateTeamAndChats])

  const fetchTeam = async () => {
    let fetchedTeam = []
    let success = false

    try {
      const url = `https://script.google.com/macros/s/AKfycbxIoBk4LlvzB8jKG4mgjqH02Gn6H0ymG2DvQvdIemC7aoYHxVCx4PitSdbl2O_hzAq2/exec?action=get_team&t=${Date.now()}`
      const res = await fetch(url)

      if (res.ok) {
        const data = await res.json()
        const items = Array.isArray(data) ? data : [data]

        if (items.length > 0 && items[0]) {
          const nameCounts = {}
          items.forEach(item => {
            const name = (item["Full Name"] || item.Name || item.name || '').trim()
            nameCounts[name] = (nameCounts[name] || 0) + 1
          })

          fetchedTeam = items.map((item, idx) => {
            let name = (item["Full Name"] || item.Name || item.name || '').trim()
            const department = item.Department || item.department || 'Development'
            if (nameCounts[name] > 1) {
              name = `${name} (${department})`
            }

            const email = item["Email Address"] || item.Email || item.email || ''
            const role = item.Role || item.role || item.Designation || 'Team Member'
            const avatar = item.Avatar || item.avatar || item["Profile Image"] || ""
            const id = item["Employee ID"] || item.employeeId || item.id || `emp-${idx}`
            const isActive = item["Is Active"] || 'Yes'
            const status = isActive === 'No' ? 'Offline' : (item.Status || item.status || 'Online')
            const location = item.Location || item.location || 'Remote'

            return { id, name, email, role, avatar, status, department, location, isActive }
          })
          success = true
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch team from GAS:`, err)
    }

    if (success) {
      updateTeamAndChats(fetchedTeam)
    }
  }

  const fetchClients = async () => {
    try {
      const url = `https://script.google.com/macros/s/AKfycbxIoBk4LlvzB8jKG4mgjqH02Gn6H0ymG2DvQvdIemC7aoYHxVCx4PitSdbl2O_hzAq2/exec?action=get_clients&t=${Date.now()}`
      const res = await fetch(url)

      if (res.ok) {
        const text = await res.text()
        try {
          const data = JSON.parse(text)
          const items = Array.isArray(data) ? data : (data.clients || [])

          setClients(prev => {
            if (JSON.stringify(prev) === JSON.stringify(items)) return prev;
            return items;
          })
        } catch (e) {
          console.warn('Failed to parse Google Sheets clients:', e)
        }
      }
    } catch (err) {
      console.warn('Direct Google Sheet clients fetch failed:', err)
    }
  }

  const fetchPayments = async () => {
    try {
      const url = `https://script.google.com/macros/s/AKfycbxIoBk4LlvzB8jKG4mgjqH02Gn6H0ymG2DvQvdIemC7aoYHxVCx4PitSdbl2O_hzAq2/exec?action=get_payments&t=${Date.now()}`
      const res = await fetch(url)
      if (res.ok) {
        const text = await res.text()
        try {
          const data = JSON.parse(text)
          const items = data.payments || []
          setPayments(prev => {
            if (JSON.stringify(prev) === JSON.stringify(items)) return prev;
            return items;
          })
        } catch (e) {
          console.warn('Failed to parse payments:', e)
        }
      }
    } catch (err) {
      console.warn('Payments fetch failed:', err)
    }
  }

  const updatePayment = async (paymentData) => {
    try {
      const url = `https://script.google.com/macros/s/AKfycbxIoBk4LlvzB8jKG4mgjqH02Gn6H0ymG2DvQvdIemC7aoYHxVCx4PitSdbl2O_hzAq2/exec`
      const res = await fetch(url, {
        method: 'POST',
        body: JSON.stringify({ ...paymentData, userEmail: profile?.email }),
        headers: { 'Content-Type': 'text/plain' }
      })
      if (res.ok) {
        const text = await res.text()
        try {
          const data = JSON.parse(text)
          if (data.ok) {
            fetchPayments()
            return true
          }
        } catch (e) {}
      }
    } catch (err) {
      console.warn('Payment update failed:', err)
    }
    return false
  }

  const fetchActivities = async () => {
    try {
      const url = `https://script.google.com/macros/s/AKfycbxIoBk4LlvzB8jKG4mgjqH02Gn6H0ymG2DvQvdIemC7aoYHxVCx4PitSdbl2O_hzAq2/exec?action=get_activities&t=${Date.now()}`
      const res = await fetch(url)
      if (res.ok) {
        const text = await res.text()
        try {
          const data = JSON.parse(text)
          setActivityLog(data)
          return data
        } catch (e) {
          console.warn('Failed to parse Google Sheets activities:', e)
          return []
        }
      }
    } catch (err) {
      console.warn('Direct Google Sheet activities fetch failed:', err)
    }
    return []
  }


  // Load synced tasks & team on initialization
  // Also re-fetch immediately when the user returns to this tab
  // (browsers throttle setInterval in background tabs, causing delayed notifications)
  useEffect(() => {
    fetchSyncedTasks()
    fetchTeam()
    fetchClients()
    fetchPayments()
    fetchMessages()
    fetchActivities()

    const handleFirstClick = () => {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission()
      }
    }
    document.addEventListener('click', handleFirstClick, { once: true })

    // Background polling fallback (real-time is handled by MQTT)
    const taskInterval = setInterval(fetchSyncedTasks, 300000) // 5 minutes
    const teamInterval = setInterval(fetchTeam, 300000) // 5 minutes
    const clientInterval = setInterval(fetchClients, 300000) // 5 minutes
    const paymentInterval = setInterval(fetchPayments, 300000) // 5 minutes

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchSyncedTasks()
        fetchTeam()
        fetchClients()
        fetchPayments()
        fetchMessages()
        fetchActivities()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Listen for realtime sync triggers from other clients
    mqttClient.subscribe('dd_task_engine_v1/sync')
    // Listen for realtime online/offline status changes
    mqttClient.subscribe('dd_status_engine_v1/status')

    const handleSyncMessage = (topic, message) => {
      try {
        const payload = JSON.parse(message.toString())

        if (topic === 'dd_task_engine_v1/sync') {
          if (payload.action === 'sync') {
            fetchSyncedTasks()
            fetchTeam()
            fetchClients()
            fetchPayments()
          }
        } else if (topic === 'dd_status_engine_v1/status') {
          const { action, email, name } = payload
          if (!email) return
          // Ignore own status broadcasts
          if (email === profile?.email) return

          if (action === 'user_online') {
            setEmployees(prev => {
              const exists = prev.some(e => e.email === email)
              if (!exists) return prev
              return prev.map(e =>
                e.email === email ? { ...e, status: 'Online' } : e
              )
            })
            if (name) {
              addToast(`${name} is now online`, 'info')
            }
          } else if (action === 'user_offline') {
            setEmployees(prev => {
              const exists = prev.some(e => e.email === email)
              if (!exists) return prev
              return prev.map(e =>
                e.email === email ? { ...e, status: 'Offline' } : e
              )
            })
            if (name) {
              addToast(`${name} went offline`, 'info')
            }
          }
        }
      } catch (e) {
        if (topic === 'dd_task_engine_v1/sync') {
          console.warn('Failed to parse task sync message:', e)
        }
      }
    }
    mqttClient.on('message', handleSyncMessage)

    return () => {
      clearInterval(taskInterval)
      clearInterval(teamInterval)
      clearInterval(clientInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      mqttClient.unsubscribe('dd_task_engine_v1/sync')
      mqttClient.unsubscribe('dd_status_engine_v1/status')
      mqttClient.removeListener('message', handleSyncMessage)
    }
  }, [profile])
  const visibleTasks = useMemo(() => {
    if (!profile) return tasks;
    const role = profile.systemRole || 'Employee';
    if (role === 'Admin') return tasks;

    const normalizeName = (name) => {
      if (!name) return '';
      return String(name).toLowerCase().replace(/[^\w]/g, '').trim();
    };
    const myName = normalizeName(profile.name);
    const myEmail = String(profile.email || '').trim().toLowerCase();

    return tasks.filter(t => {
      const dept = (t.department || '').toUpperCase();
      if (['HR', 'ACCOUNT', 'SALES'].includes(dept)) {
        if (role === 'HR' && dept === 'HR') return true;
        if (role === 'Accountant' && dept === 'ACCOUNT') return true;
        if (role === 'Sales' && dept === 'SALES') return true;

        // If the current user is assigned to the task, they should always see it
        if (myName || myEmail) {
          const assignees = (t.assignedTo || '').split(',').map(normalizeName).filter(Boolean);
          const assigneeEmails = (t.assignedEmail || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

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

          if (hasAccess) return true;
        }

        return false;
      }
      return true;
    });
  }, [tasks, profile]);

  // Auto-reload the web app when a new version is deployed
  useEffect(() => {
    const checkVersion = async () => {
      try {
        const res = await fetch(`/version.txt?t=${Date.now()}`)
        if (!res.ok) return
        const version = (await res.text()).trim()
        if (!version) return
        const stored = localStorage.getItem('dd_app_version')
        if (stored && stored !== version) {
          localStorage.setItem('dd_app_version', version)
          addToast('New version available - refreshing...', 'success')
          setTimeout(() => window.location.reload(), 1500)
        } else if (!stored) {
          localStorage.setItem('dd_app_version', version)
        }
      } catch (e) {
        // ignore network/parse errors; retry on next check
      }
    }
    checkVersion()
    const interval = setInterval(checkVersion, 300000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkVersion()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', checkVersion)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', checkVersion)
    }
  }, [addToast])

  return (
    <AppContext.Provider
      value={{
        tasks: visibleTasks,
        setTasks,
        updateTask,
        addTask,
        deleteTask,
        notifications,
        setNotifications,
        markAllNotificationsRead,
        markNotificationRead,
        searchQuery,
        setSearchQuery,
        profile,
        setProfile,
        notifPreferences,
        setNotifPreferences,
        personalChats,
        setPersonalChats,
        groupChats,
        setGroupChats,
        groupMembers,
        setGroupMembers,
        showNewTaskModal,
        setShowNewTaskModal,
        newTaskPrefillDept,
        setNewTaskPrefillDept,
        isSidebarOpen,
        setIsSidebarOpen,
        fetchSyncedTasks,
        employees,
        clients,
        fetchClients,
        payments,
        fetchPayments,
        updatePayment,
        fetchTeam,
        messagesByChatId,
        setMessagesByChatId,
        activeChatSession,
        setActiveChatSession,
        fetchMessages,
        markChatAsRead,
        lastSeenTimestamps,
        clearChatLocally,
        clearAllChatsLocally,
        deletePersonalChatLocally,
        messageStatusByChatId,
        setMessageStatusByChatId,
        restorePersonalChatLocally,
        clearedChatTimestamps,
        readReceiptsByChatId,
        addSystemAndWebNotification,
        isDarkMode,
        setIsDarkMode,
        addToast,
        isPunchedIn,
        handlePunchIn,
        handlePunchOut,
        punchInTime,
        firstPunchInToday,
        todaysSessions,
        activityLog,
        getActiveUsers,
        getAllUsersMonthlyActivity,
        formatDuration,
        getAllLoggedUsers,
        getISTDate,
        logShutdown,
        fetchActivities,
        isSessionRestored,
        activeTimer,
        sessionSecs,
        toggleTimer
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

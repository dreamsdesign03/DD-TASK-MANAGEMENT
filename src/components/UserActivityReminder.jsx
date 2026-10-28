import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { isExcludedRole, isAdminUser } from '../utils/roles'
import { isUserActiveToday, isPastReminderStart, todayIST, todayLabel } from '../utils/todayActivity'

// Compact reminder shown only to the logged-in user about themselves.
//  Missing today  -> amber banner with an "Add task" button
//  Became active  -> brief green confirmation, then it hides
// Never lists other users, and never shows before REMINDER_START_HOUR (IST).
export default function UserActivityReminder() {
  const { tasks, profile, setShowNewTaskModal } = useApp()

  // `now` is refreshed every minute. It re-renders the component so the 10:00
  // IST gate is re-evaluated (a page left open across 10:00 picks the banner
  // up) and so the IST day rolls over at midnight.
  const [now, setNow] = useState(() => new Date())
  const [showDone, setShowDone] = useState(false)
  // Starts as "active" so an already-active user never gets a green flash on load.
  const [wasActive, setWasActive] = useState(true)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  const day = useMemo(() => todayIST(now), [now])
  const pastStart = useMemo(() => isPastReminderStart(now), [now])
  const label = useMemo(() => todayLabel(now), [now])

  const isEligible = useMemo(() => {
    if (!profile) return false
    if (isAdminUser(profile)) return false
    if (isExcludedRole(profile)) return false
    return true
  }, [profile])

  const activeToday = useMemo(
    () => (isEligible ? isUserActiveToday(tasks, profile, day) : true),
    [isEligible, tasks, profile, day]
  )

  // Missing -> active transition: flash the green confirmation once.
  // (State is adjusted during render, the React-recommended pattern.)
  if (isEligible && activeToday !== wasActive) {
    setWasActive(activeToday)
    setShowDone(activeToday)
  }

  // Green state lasts 3 seconds, then the banner disappears.
  useEffect(() => {
    if (!showDone) return
    const id = setTimeout(() => setShowDone(false), 3000)
    return () => clearTimeout(id)
  }, [showDone])

  if (!isEligible) return null
  if (!pastStart) return null

  if (showDone) {
    return (
      <div
        className="flex items-center gap-2 px-4 py-2.5 mb-4"
        style={{ borderRadius: 12, background: '#ECFDF5', border: '1px solid #A7F3D0' }}
      >
        <span className="material-symbols-outlined text-[18px] text-[#059669]">check_circle</span>
        <span className="text-[13px] font-bold text-[#065F46]">Nice, you're all set for today</span>
        <span className="ml-auto text-[12px] font-semibold text-[#059669]">{label}</span>
      </div>
    )
  }

  if (activeToday) return null

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 mb-4 flex-wrap"
      style={{ borderRadius: 14, background: '#FFF7ED', border: '1px solid #FED7AA' }}
    >
      <span className="material-symbols-outlined text-[37px] text-[#D97706]">warning</span>
      <div className="min-w-0">
        <p className="m-0 font-extrabold text-[#9A3412]" style={{ fontSize: 28 }}>
          You haven't added a task or updated a task status today
        </p>
        <p className="m-0 mt-0.5 font-medium text-[#B45309]" style={{ fontSize: 16 }}>
          Add a new task or change the status of an existing one to clear this.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setShowNewTaskModal(true)}
        className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-bold text-white cursor-pointer transition-opacity hover:opacity-90"
        style={{ background: 'linear-gradient(to right, #702c91, #ec008c)' }}
        title="Add a new task"
      >
        <span className="material-symbols-outlined text-[16px]">add</span>
        Add task
      </button>
      <span className="text-[12px] font-semibold text-[#B45309]">{label}</span>
    </div>
  )
}
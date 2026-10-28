import { useEffect, useMemo, useState } from 'react'
import { getUserColor, getInitials } from '../utils/avatar'
import { computeMissingToday, todayIST, todayLabel } from '../utils/todayActivity'

// Top-of-board status strip for admins:
//  N > 0  -> amber banner listing the employees who haven't added a task or
//              updated a task status today
//  N == 0 -> slim green "everyone has been active on tasks today" strip
// Always renders one of the two states (a skeleton while data is loading).
export default function TodayActivityBanner({ tasks, employees, loaded, onSelectEmployee }) {
  // Recompute when the IST calendar day rolls over (check each minute)
  const [day, setDay] = useState(todayIST())
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    const id = setInterval(() => setDay(todayIST()), 60000)
    return () => clearInterval(id)
  }, [])

  const missing = useMemo(() => computeMissingToday(tasks, employees, day), [tasks, employees, day])

  if (!loaded) {
    return (
      <div
        style={{ height: 44, marginTop: 24, borderRadius: 14, background: '#F3F4F6' }}
        className="animate-pulse"
        aria-hidden="true"
      />
    )
  }

  const n = missing.length
  const label = todayLabel()

  // Green strip: everyone has been active on tasks today
  if (n === 0) {
    return (
      <div
        className="flex items-center gap-2 mt-6 px-4"
        style={{ height: 40, borderRadius: 12, background: '#ECFDF5', border: '1px solid #A7F3D0' }}
      >
        <span className="material-symbols-outlined text-[18px] text-[#059669]">check_circle</span>
        <span className="text-[13px] font-bold text-[#065F46]">Everyone has been active on tasks today</span>
        <span className="ml-auto text-[12px] font-semibold text-[#059669]">{label}</span>
      </div>
    )
  }

  // Amber banner: N employees missing
  const more = n - 8
  const showAll = expanded || more <= 0
  const visibleChips = showAll ? missing : missing.slice(0, 8)

  return (
    <div
      className="mt-6 px-4 py-3"
      style={{ borderRadius: 14, background: '#FFF7ED', border: '1px solid #FED7AA' }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="material-symbols-outlined text-[20px] text-[#D97706]">warning</span>
        <span className="text-[13px] font-extrabold text-[#9A3412]">
          {n} {n === 1 ? "employee hasn't" : "employees haven't"} added a task or updated a task status today
        </span>
        <span className="ml-auto text-[12px] font-semibold text-[#B45309]">{label}</span>
      </div>
      <div
        className="flex items-center gap-2 flex-wrap mt-2"
        style={{
          maxHeight: showAll ? Math.ceil(missing.length / 4) * 40 + 40 : 60,
          overflow: 'hidden',
          transition: 'max-height 150ms ease',
        }}
      >
        {visibleChips.map((u) => (
          <button
            key={u.name}
            onClick={() => onSelectEmployee && onSelectEmployee(u.name)}
            className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full cursor-pointer transition-colors hover:brightness-95"
            style={{ background: 'white', border: '1px solid #FED7AA' }}
            title={`Show ${u.name}'s tasks`}
          >
            <span
              className="w-5 h-5 rounded-full text-white flex items-center justify-center text-[9px] font-bold shrink-0"
              style={{ backgroundColor: getUserColor(u.name) }}
            >
              {getInitials(u.name)}
            </span>
            <span className="text-[12px] font-semibold text-[#9A3412] whitespace-nowrap">{u.name}</span>
          </button>
        ))}
        {more > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="text-[12px] font-bold text-[#B45309] px-2 py-1 cursor-pointer hover:underline bg-transparent border-none"
            title={expanded ? 'Show fewer' : `Show all ${n} employees`}
          >
            {expanded ? 'Show less' : `+${more} more`}
          </button>
        )}
      </div>
    </div>
  )
}
import { useRef, useState, useEffect, useCallback } from 'react'
import { useApp, getActiveTimerMs } from '../context/AppContext'

function formatAdaptive(totalSecs) {
  if (totalSecs < 60) return String(totalSecs)
  const m = Math.floor(totalSecs / 60)
  const s = totalSecs % 60
  if (totalSecs < 3600) return [m, s].map(v => String(v).padStart(2, '0')).join(':')
  const h = Math.floor(totalSecs / 3600)
  return [h, m % 60, s].map(v => String(v).padStart(2, '0')).join(':')
}

let restoreTitle = null

export default function TimerBadge() {
  const { activeTimer, sessionSecs, toggleTimer, tasks, profile } = useApp()
  const badgeRef = useRef(null)
  const dragRef = useRef({ active: false, offsetX: 0, offsetY: 0, startX: 0, startY: 0 })
  const posRef = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('dd_timer_pos')
      if (saved) posRef.current = JSON.parse(saved)
    } catch {}
    setVisible(true)
  }, [])

  // ── Document title timer when tab is hidden ──
  useEffect(() => {
    if (!activeTimer) {
      if (restoreTitle) { restoreTitle(); restoreTitle = null }
      return
    }

    const handleVisibility = () => {
      if (document.hidden) {
        const orig = document.title
        const interval = setInterval(() => {
          if (document.hidden) {
            const elapsed = Math.floor(getActiveTimerMs(activeTimer) / 1000)
            document.title = `\u23F1 ${formatAdaptive(elapsed)} - Dreamsdesk`
          }
        }, 1000)
        restoreTitle = () => { clearInterval(interval); document.title = orig }
      } else {
        if (restoreTitle) restoreTitle()
        restoreTitle = null
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      if (restoreTitle) restoreTitle()
      restoreTitle = null
      document.title = 'Dreamsdesk'
    }
  }, [activeTimer])

  // ── Smooth drag with direct DOM ──
  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const rect = badgeRef.current.getBoundingClientRect()
    dragRef.current = {
      active: true,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      startX: rect.left,
      startY: rect.top,
    }
    badgeRef.current.style.setProperty('transition', 'none', 'important')
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    if (!activeTimer) return
    const el = badgeRef.current
    if (!el) return

    const onMove = (e) => {
      const d = dragRef.current
      if (!d.active) return
      const x = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, e.clientX - d.offsetX))
      const y = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, e.clientY - d.offsetY))
      el.style.left = x + 'px'
      el.style.top = y + 'px'
    }

    const onUp = () => {
      const d = dragRef.current
      if (!d.active) return
      d.active = false
      el.style.removeProperty('transition')
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      const x = parseInt(el.style.left, 10) || 0
      const y = parseInt(el.style.top, 10) || 0
      try { localStorage.setItem('dd_timer_pos', JSON.stringify({ x, y })) } catch {}
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [activeTimer, visible])

  if (!activeTimer || !visible) return null

  const task = tasks?.find(t => t.id === activeTimer.taskId)
  const savedPos = posRef.current
  const baseStyle = savedPos
    ? { left: savedPos.x, top: savedPos.y }
    : { bottom: 24, right: 24 }

  return (
    <div
      ref={badgeRef}
      onMouseDown={onMouseDown}
      className="timer-fade-in"
      style={{
        position: 'fixed',
        ...baseStyle,
        zIndex: 9999,
        cursor: 'grab',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div className="timer-pulse-dot" style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0 }} />

      <span
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: '#fff',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.04em',
          lineHeight: 1,
          fontFamily: "'Inter', 'SF Mono', 'Fira Code', monospace",
        }}
      >
        {formatAdaptive(sessionSecs)}
      </span>

      <button
        onClick={(e) => {
          e.stopPropagation()
          if (task) toggleTimer(task, profile?.name)
        }}
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(255, 255, 255, 0.2)',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.85)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
        title="Stop Timer"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>stop</span>
      </button>
    </div>
  )
}

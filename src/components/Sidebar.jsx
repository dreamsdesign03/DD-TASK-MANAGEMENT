import { useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useApp, mqttClient } from '../context/AppContext'
import { isElectron } from '../utils/isElectron'
import { renderAvatar } from '../utils/avatar'

const COLLAPSED_W = 72;
const EXPANDED_W  = 240;

export default function Sidebar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { setShowNewTaskModal, personalChats, groupChats, tasks, messagesByChatId, lastSeenTimestamps, profile, setProfile, fetchClients, isSidebarOpen, setIsSidebarOpen, addToast } = useApp()

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024)
  const [showComingSoon, setShowComingSoon] = useState(false)
  const [hoveredNav, setHoveredNav] = useState(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Auto-close sidebar on mobile when navigating
  useEffect(() => {
    if (isMobile) setIsSidebarOpen(false)
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  const expanded = isSidebarOpen

  const totalUnreadChat =
    (personalChats?.reduce((acc, c) => acc + (c.unread || 0), 0) || 0) +
    (groupChats?.reduce((acc, g) => acc + (g.unread || 0), 0) || 0)

  const myName = String(profile?.name || 'User').trim().toLowerCase()
  let totalUnreadTasks = 0
  if (tasks && messagesByChatId) {
    tasks.forEach(task => {
      const msgs = messagesByChatId[task.id]
      if (!msgs || msgs.length === 0) return
      const lastSeen = lastSeenTimestamps?.[task.id]
      const unreadCount = msgs.filter(m => {
        const isMe = String(m.senderName || m.sender || '').trim().toLowerCase() === myName
        if (isMe || m.type === 'system' || m.type === 'divider') return false
        const tTime = m.timestamp || m.time
        if (!tTime) return false
        return !lastSeen || new Date(tTime).getTime() > new Date(lastSeen).getTime()
      }).length
      totalUnreadTasks += unreadCount
    })
  }

  const NAV_ITEMS = [
    { icon: 'grid_view',       label: 'All Tasks',     path: '/tasks',          count: totalUnreadTasks, countBg: '#EF4444' },
    { icon: 'check_box',       label: 'My Tasks',      path: '/my-tasks'                },
    { icon: 'notifications',   label: 'Notifications', path: '/notifications' },
    { icon: 'chat_bubble',     label: 'Chat',          path: '/chat',           count: totalUnreadChat, countBg: '#A78BFA' },
    { icon: 'group',           label: 'Team',          path: '/team'                    },
    { icon: 'business_center', label: 'Projects',       path: '/clients'                 },
    { icon: 'bar_chart',       label: 'Reports',       path: '/reports'                 },
  ];

  const _sysRole = String(profile?.systemRole || '').trim().toLowerCase()
  if (profile?.systemRole === 'Admin' || _sysRole === 'accountant') {
    NAV_ITEMS.push({ icon: 'account_balance', label: 'Clients AC', path: '/account-clients' })
  }

  NAV_ITEMS.push({ icon: 'monitoring', label: 'Activity', path: '/activity' })

  const handleNavClick = (path) => {
    navigate(path)
    if (isMobile) setIsSidebarOpen(false)
  }

  return (
    <>
      <style>{`
        /* ── Nav item base ── */
        .dd-item {
          position: relative;
          display: flex;
          align-items: center;
          height: 44px;
          border: none;
          cursor: pointer;
          font-family: Inter, sans-serif;
          font-size: 14px;
          text-align: left;
          transition: background-color 0.2s ease, color 0.2s ease;
          border-radius: 12px;
          color: rgba(255,255,255,0.65);
          background: transparent;
          overflow: hidden;
        }
        .dd-item:not(.dd-active):hover {
          background: rgba(255,255,255,0.12);
          color: #fff;
        }
        .dd-item.dd-active {
          background: rgba(255, 255, 255, 0.18) !important;
          color: #fff !important;
          font-weight: 700;
          box-shadow: none;
          border: 1px solid rgba(255,255,255,0.12);
        }

        /* ── Hide scrollbar in Nav ── */
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        /* ── Sidebar toggle button (desktop only) ── */
        .dd-toggle-btn {
          position: fixed;
          top: 50%;
          transform: translateY(-50%);
          width: 22px;
          height: 48px;
          background: white;
          border: 1px solid #E5E7EB;
          border-left: none;
          border-radius: 0 10px 10px 0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 51;
          box-shadow: 3px 0 8px rgba(0,0,0,0.08);
          transition: left 0.35s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s;
          padding: 0;
        }
        .dd-toggle-btn:hover {
          background: #F5F3FF;
        }
        .dd-toggle-btn .toggle-icon {
          font-size: 16px;
          color: #702c91;
          transition: transform 0.3s ease;
        }
        
        /* ── Mobile Sidebar Drawer ── */
        .dd-sidebar-drawer {
          position: fixed;
          top: 0;
          left: -260px;
          bottom: 0;
          width: 240px;
          background: #fff;
          z-index: 60;
          transition: left 0.3s ease;
        }
        .dd-sidebar-drawer.dd-sidebar-open {
          left: 0;
        }
        
        .dd-sidebar-backdrop {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.4);
          z-index: 55;
          opacity: 0;
          animation: fadeIn 0.3s forwards;
        }
        @keyframes fadeIn {
          to { opacity: 1; }
        }
      `}</style>

      {/* ── DESKTOP: fixed sidebar ── */}
      {!isMobile && (
        <>
          <aside
            style={{
              position: 'fixed',
              top: 12, left: 12, bottom: 12,
              width: expanded ? EXPANDED_W : COLLAPSED_W,
              background: 'linear-gradient(to bottom, #702c91 0%, #9b2691 50%, #702c91 100%)',
              borderRadius: 20,
              boxShadow: '0 12px 32px rgba(112, 44, 145, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 50,
              overflow: 'hidden',
              transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {/* ── LOGO SECTION ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: expanded ? 12 : 0,
              padding: expanded ? '28px 20px' : '28px 0',
              justifyContent: expanded ? 'flex-start' : 'center',
              flexShrink: 0, overflow: 'hidden',
              transition: 'padding 0.35s cubic-bezier(0.4, 0, 0.2, 1), gap 0.35s',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <div className="logo-mask" style={{ width: 28, height: 28, backgroundColor: '#702c91' }} />
              </div>
              <div style={{
                opacity: expanded ? 1 : 0,
                width: expanded ? 'auto' : 0,
                overflow: 'hidden',
                transition: 'opacity 0.25s ease, width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                whiteSpace: 'nowrap',
              }}>
                <p style={{ margin: 0, color: '#fff', fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em' }}>Dreamsdesk</p>
              </div>
            </div>

            {/* ── NAV ── */}
            <nav
              className="hide-scrollbar"
              style={{
                flex: 1,
                padding: '6px 0 16px 0',
                display: 'flex', flexDirection: 'column', gap: 4,
                overflowY: 'auto', overflowX: 'hidden',
              }}
            >
              {NAV_ITEMS.map(item => {
                const active = pathname === item.path || (pathname === '/dashboard' && item.path === '/tasks');
                return (
                  <button
                    key={item.path}
                    className={`dd-item${active ? ' dd-active' : ''}`}
                    onClick={() => handleNavClick(item.path)}
                    onMouseEnter={(e) => {
                      if (!expanded) {
                        const rect = e.currentTarget.getBoundingClientRect()
                        setHoveredNav({ label: item.label, top: rect.top + rect.height / 2 })
                      }
                    }}
                    onMouseLeave={() => setHoveredNav(null)}
                    style={{
                      margin: expanded ? '0 10px' : '0 auto',
                      width: expanded ? 'calc(100% - 20px)' : '44px',
                      padding: expanded ? '0 12px' : '0',
                      justifyContent: expanded ? 'flex-start' : 'center',
                      transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1), margin 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  >
                    <span style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                      <span
                        className="material-symbols-outlined"
                        style={{
                          fontSize: 20,
                          color: active ? '#fff' : 'rgba(255,255,255,0.75)',
                          fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
                          transition: 'color 0.2s',
                        }}
                      >
                        {item.icon}
                      </span>
                      {item.count > 0 && !expanded && (
                        <span style={{
                          position: 'absolute', top: -4, right: -4,
                          width: 8, height: 8, borderRadius: '50%',
                          background: item.countBg, border: '2px solid #702c91'
                        }} />
                      )}
                    </span>
                    <span style={{
                      opacity: expanded ? 1 : 0,
                      maxWidth: expanded ? 160 : 0,
                      marginLeft: expanded ? 10 : 0,
                      overflow: 'hidden',
                      transition: 'opacity 0.2s ease, max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1), margin 0.35s',
                      whiteSpace: 'nowrap',
                      fontWeight: active ? 700 : 500,
                      flex: 1,
                      textAlign: 'left'
                    }}>
                      {item.label}
                    </span>
                    {item.count > 0 && expanded && (
                      <span style={{
                        minWidth: 20, height: 20, padding: '0 6px',
                        background: item.countBg, color: '#fff',
                        borderRadius: 999, fontSize: 11, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, marginLeft: 6,
                        opacity: expanded ? 1 : 0,
                        transition: 'opacity 0.2s ease',
                      }}>
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* ── BOTTOM ACTIONS ── */}
            <div style={{
              padding: '16px 0 24px 0',
              display: 'flex', flexDirection: 'column', gap: 6,
              flexShrink: 0, overflow: 'hidden',
              borderTop: '1px solid rgba(255,255,255,0.1)'
            }}>
              {!isElectron() && (
                <button
                  onClick={() => setShowComingSoon(true)}
                  style={{
                    display: 'flex', alignItems: 'center',
                    height: 44,
                    margin: expanded ? '0 10px' : '0 auto',
                    width: expanded ? 'calc(100% - 20px)' : '44px',
                    padding: expanded ? '0 12px' : '0', justifyContent: expanded ? 'flex-start' : 'center',
                    borderRadius: 12, cursor: 'pointer',
                    background: '#fff', color: '#702c91',
                    transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1), margin 0.35s, background 0.2s',
                    overflow: 'hidden', border: 'none', flexShrink: 0,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#f9f9f9';
                    if (!expanded) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredNav({ label: 'Get Desktop App', top: rect.top + rect.height / 2 });
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#fff';
                    setHoveredNav(null);
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20, flexShrink: 0 }}>get_app</span>
                  <span style={{
                    opacity: expanded ? 1 : 0, marginLeft: expanded ? 10 : 0,
                    maxWidth: expanded ? 160 : 0,
                    overflow: 'hidden',
                    transition: 'opacity 0.2s ease, max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1), margin 0.35s',
                    whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700
                  }}>
                    Get Desktop App
                  </span>
                </button>
              )}

              <button
                onClick={() => {
                  setProfile(null)
                  localStorage.removeItem('dd_profile')
                  navigate('/login')
                }}
                style={{
                  display: 'flex', alignItems: 'center',
                  height: 44,
                  margin: expanded ? '0 10px' : '0 auto',
                  width: expanded ? 'calc(100% - 20px)' : '44px',
                  padding: expanded ? '0 12px' : '0', justifyContent: expanded ? 'flex-start' : 'center',
                  borderRadius: 12, cursor: 'pointer',
                  background: 'transparent', color: 'rgba(255,255,255,0.75)',
                  transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1), margin 0.35s, background 0.2s',
                  overflow: 'hidden', border: 'none', flexShrink: 0,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                  if (!expanded) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoveredNav({ label: 'Logout', top: rect.top + rect.height / 2 });
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                  setHoveredNav(null);
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20, flexShrink: 0 }}>logout</span>
                <span style={{
                  opacity: expanded ? 1 : 0, marginLeft: expanded ? 10 : 0,
                  maxWidth: expanded ? 160 : 0,
                  overflow: 'hidden',
                  transition: 'opacity 0.2s ease, max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1), margin 0.35s',
                  whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600
                }}>
                  Logout
                </span>
              </button>
            </div>
          </aside>

          {/* Floating Tooltip in Mini View */}
          {!expanded && hoveredNav && (
            <div
              style={{
                position: 'fixed',
                left: 12 + COLLAPSED_W + 10,
                top: hoveredNav.top,
                transform: 'translateY(-50%)',
                background: '#1E1B2E',
                color: '#ffffff',
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "'Inter', sans-serif",
                whiteSpace: 'nowrap',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                border: '1px solid rgba(255,255,255,0.15)',
                zIndex: 99999,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                animation: 'fadeIn 0.15s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              <div style={{
                position: 'absolute',
                right: '100%',
                top: '50%',
                transform: 'translateY(-50%)',
                borderWidth: 5,
                borderStyle: 'solid',
                borderColor: 'transparent #1E1B2E transparent transparent'
              }} />
              <span>{hoveredNav.label}</span>
            </div>
          )}

          {/* ── TOGGLE BUTTON ── */}
          <button
            className="dd-toggle-btn"
            onClick={() => setIsSidebarOpen(o => !o)}
            title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            style={{
              left: expanded ? (12 + EXPANDED_W) : (12 + COLLAPSED_W),
            }}
          >
            <span
              className="material-symbols-outlined toggle-icon"
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              chevron_right
            </span>
          </button>
        </>
      )}

      {/* ── MOBILE: overlay drawer ── */}
      {isMobile && (
        <>
          {/* Backdrop */}
          {isSidebarOpen && (
            <div
              className="dd-sidebar-backdrop"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}

          {/* Drawer */}
          <aside
            className={`dd-sidebar-drawer${isSidebarOpen ? ' dd-sidebar-open' : ''}`}
            style={{
              width: EXPANDED_W,
              background: 'linear-gradient(to bottom, #702c91 0%, #9b2691 50%, #702c91 100%)',
              boxShadow: isSidebarOpen ? '0 12px 32px rgba(112, 44, 145, 0.3)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* ── LOGO SECTION ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '28px 20px 16px',
              justifyContent: 'flex-start',
              flexShrink: 0, overflow: 'hidden',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <div className="logo-mask" style={{ width: 28, height: 28, backgroundColor: '#702c91' }} />
              </div>
              <div style={{ whiteSpace: 'nowrap' }}>
                <p style={{ margin: 0, color: '#fff', fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em' }}>Dreamsdesk</p>
              </div>
            </div>

            {/* ── MOBILE PROFILE SECTION ── */}
            <div 
              onClick={() => {
                navigate('/settings')
                setIsSidebarOpen(false)
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 20px', margin: '0 10px 12px',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: 12, cursor: 'pointer',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '2px solid rgba(255,255,255,0.3)' }}>
                {renderAvatar(profile?.avatar, profile?.name, "w-full h-full", "text-[14px]", profile?.email)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ color: '#fff', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {profile?.name || 'User'}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {profile?.email || 'View Profile'}
                </span>
              </div>
            </div>

            {/* ── NAV ── */}
            <nav
              className="hide-scrollbar"
              style={{
                flex: 1,
                padding: '6px 0 16px 0',
                display: 'flex', flexDirection: 'column', gap: 4,
                overflowY: 'auto', overflowX: 'hidden',
              }}
            >
              {NAV_ITEMS.map(item => {
                const active = pathname === item.path || (pathname === '/dashboard' && item.path === '/tasks');
                return (
                  <button
                    key={item.path}
                    className={`dd-item${active ? ' dd-active' : ''}`}
                    onClick={() => handleNavClick(item.path)}
                    style={{
                      margin: '0 10px',
                      width: 'calc(100% - 20px)',
                      padding: '0 12px',
                      justifyContent: 'flex-start',
                    }}
                  >
                    <span style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                      <span
                        className="material-symbols-outlined"
                        style={{
                          fontSize: 20,
                          color: active ? '#fff' : 'rgba(255,255,255,0.75)',
                          fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
                        }}
                      >
                        {item.icon}
                      </span>
                      {item.count > 0 && (
                        <span style={{
                          position: 'absolute', top: -4, right: -4,
                          width: 8, height: 8, borderRadius: '50%',
                          background: item.countBg, border: '2px solid #702c91'
                        }} />
                      )}
                    </span>
                    <span style={{
                      marginLeft: 10,
                      whiteSpace: 'nowrap',
                      fontWeight: active ? 700 : 500,
                      flex: 1,
                      textAlign: 'left'
                    }}>
                      {item.label}
                    </span>
                    {item.count > 0 && (
                      <span style={{
                        minWidth: 20, height: 20, padding: '0 6px',
                        background: item.countBg, color: '#fff',
                        borderRadius: 999, fontSize: 11, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, marginLeft: 6,
                      }}>
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* ── BOTTOM ACTIONS ── */}
            <div style={{
              padding: '16px 0 24px 0',
              display: 'flex', flexDirection: 'column', gap: 6,
              flexShrink: 0, overflow: 'hidden',
              borderTop: '1px solid rgba(255,255,255,0.1)'
            }}>
              {!isElectron() && (
                <button
                  onClick={() => setShowComingSoon(true)}
                  style={{
                    display: 'flex', alignItems: 'center',
                    height: 44, margin: '0 10px',
                    width: 'calc(100% - 20px)',
                    padding: '0 12px', justifyContent: 'flex-start',
                    borderRadius: 12, cursor: 'pointer',
                    background: '#fff', color: '#702c91',
                    overflow: 'hidden', border: 'none', flexShrink: 0,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20, flexShrink: 0 }}>get_app</span>
                  <span style={{ marginLeft: 10, whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700 }}>
                    Get Desktop App
                  </span>
                </button>
              )}

              <button
                onClick={() => {
                  setProfile(null)
                  localStorage.removeItem('dd_profile')
                  navigate('/login')
                }}
                style={{
                  display: 'flex', alignItems: 'center',
                  height: 44, margin: '0 10px',
                  width: 'calc(100% - 20px)',
                  padding: '0 12px', justifyContent: 'flex-start',
                  borderRadius: 12, cursor: 'pointer',
                  background: 'transparent', color: 'rgba(255,255,255,0.75)',
                  overflow: 'hidden', border: 'none', flexShrink: 0,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20, flexShrink: 0 }}>logout</span>
                <span style={{ marginLeft: 10, whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600 }}>
                  Logout
                </span>
              </button>
            </div>
          </aside>
        </>
      )}

      {showComingSoon && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, animation: 'fadeIn 0.2s ease'
        }} onClick={() => setShowComingSoon(false)}>
          <div style={{
            background: '#fff', borderRadius: 24, padding: '40px 36px 32px',
            width: 400, maxWidth: '100%',
            boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
            animation: 'scaleIn 0.25s cubic-bezier(0.4,0,0.2,1)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#702c91', fontVariationSettings: "'FILL' 1" }}>pending</span>
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1E1B2E', fontFamily: 'Inter,sans-serif', textAlign: 'center' }}>
              Arriving Soon
            </h2>
            <p style={{ margin: '10px 0 0', fontSize: 14, color: '#6B7280', fontFamily: 'Inter,sans-serif', textAlign: 'center', lineHeight: 1.6 }}>
              The Dreamsdesk desktop app is currently in development and will be available for download shortly. Stay tuned!
            </p>
            <button
              onClick={() => setShowComingSoon(false)}
              style={{
                marginTop: 24, height: 44, padding: '0 32px', borderRadius: 12,
                border: 'none', background: 'linear-gradient(to right, #702c91, #ec008c)',
                color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                fontFamily: 'Inter,sans-serif', boxShadow: '0 4px 12px rgba(112,44,145,0.3)',
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}

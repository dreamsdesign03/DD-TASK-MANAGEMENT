import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useApp } from './context/AppContext'
import LoginPage from './pages/LoginPage'
import ApprovePage from './pages/ApprovePage'
import MyTasksPage from './pages/MyTasksPage'
import TaskDetailPage from './pages/TaskDetailPage'
import NotificationsPage from './pages/NotificationsPage'
import ChatPage from './pages/ChatPage'
import LandingPage from './pages/LandingPage'

import MonthlyReportPage from './pages/MonthlyReportPage'
import ProfilePage from './pages/ProfilePage'
import ProjectOverviewPage from './pages/ProjectOverviewPage'
import TeamPage from './pages/TeamPage'
import ClientsPage from './pages/ClientsPage'
import AccountClientsPage from './pages/AccountClientsPage'
import ActivityPage from './pages/ActivityPage'
import TimerBadge from './components/TimerBadge'
import Sidebar from './components/Sidebar'
import TopNav from './components/TopNav'


function GlobalNav() {
  const navigate = useNavigate()
  
  useEffect(() => {
    const handleNav = (e) => {
      if (e.detail?.path) {
        navigate(e.detail.path)
      }
    }
    window.addEventListener('dd_navigate', handleNav)
    return () => window.removeEventListener('dd_navigate', handleNav)
  }, [navigate])

  return null
}

function DesktopLauncher({ profile }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-surface text-primary p-6">
      <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-xl max-w-md w-full text-center flex flex-col items-center">
        <div className="w-16 h-16 mb-6">
          <div className="logo-mask w-full h-full" aria-label="Dreamsdesk Logo" />
        </div>
        <h1 className="text-headline-md font-bold mb-3 text-on-surface">Authentication Successful!</h1>
        <p className="text-body-lg text-secondary mb-8">
          We are launching the Dreamsdesk desktop application for you. If your browser blocked the automatic popup, please click the button below.
        </p>
        
        <div className="flex flex-col gap-4 w-full">
          <button 
            onClick={() => {
              window.location.href = `dreamsdesk://login?email=${encodeURIComponent(profile.email)}`
            }}
            className="w-full h-12 btn-gradient rounded-lg font-label-lg font-bold transition-opacity"
          >
            Open Desktop App
          </button>
          
          <button 
            onClick={() => window.location.href = '/tasks'}
            className="w-full h-12 bg-surface border border-outline text-on-surface rounded-lg font-label-lg hover:bg-surface-container-low transition-colors"
          >
            Continue to Web Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { profile, isPunchedIn, isSessionRestored } = useApp()

  if (!profile) {
    return <Navigate to="/login" replace />
  }

  if (!isSessionRestored) {
    return (
      <div className="bg-[#F0EDF8] font-['Inter',sans-serif] text-[#151c27] overflow-hidden h-screen flex">
        <Sidebar />
        <main className="page-main">
          <TopNav title="" showSearch={false} />
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-[#702c91] border-t-transparent rounded-full animate-spin" />
              <p className="text-[15px] text-gray-500">Restoring your session...</p>
            </div>
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
          <TopNav title="" showSearch={false} />
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="bg-white rounded-2xl shadow-xl border border-[#E5E7EB] p-10 text-center max-w-md">
              <div className="w-16 h-16 rounded-full bg-[#F5F3FF] flex items-center justify-center mx-auto mb-5">
                <span className="material-symbols-outlined text-[36px] text-[#702c91]">lock</span>
              </div>
              <h2 className="text-2xl font-black text-[#1E1B2E] mb-2">Please Punch In</h2>
              <p className="text-[15px] text-gray-500 leading-relaxed">
                You need to <strong className="text-[#702c91]">Punch In</strong> using the button in the top bar before you can access any pages.
              </p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return children
}

function RootRedirect() {
  const { profile } = useApp()
  if (profile && profile.email) {
    return <Navigate to="/tasks" replace />
  }
  return <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <GlobalNav />
      {typeof window !== 'undefined' && !window.require && <TimerBadge />}
      <Routes>
        {/* Default */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/approve" element={<ApprovePage />} />
        <Route path="/download" element={<LandingPage />} />

        {/* App routes */}
        <Route path="/tasks" element={<ProtectedRoute><MyTasksPage /></ProtectedRoute>} />
        <Route path="/my-tasks" element={<ProtectedRoute><MyTasksPage /></ProtectedRoute>} />
        <Route path="/tasks/:taskId" element={<ProtectedRoute><TaskDetailPage /></ProtectedRoute>} />

        <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/chat/groups" element={<ProtectedRoute><ChatPage initialTab="groups" /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><MyTasksPage /></ProtectedRoute>} />
        <Route path="/projects" element={<ProtectedRoute><MyTasksPage /></ProtectedRoute>} />
        <Route path="/projects/:projectName" element={<ProtectedRoute><ProjectOverviewPage /></ProtectedRoute>} />
        <Route path="/team" element={<ProtectedRoute><TeamPage /></ProtectedRoute>} />
        <Route path="/clients" element={<ProtectedRoute><ClientsPage /></ProtectedRoute>} />
        <Route path="/account-clients" element={<ProtectedRoute><AccountClientsPage /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><MonthlyReportPage /></ProtectedRoute>} />
        <Route path="/activity" element={<ProtectedRoute><ActivityPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}


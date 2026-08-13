import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function ApprovePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const email = (searchParams.get('email') || '').trim()
  const [state, setState] = useState(email ? 'loading' : 'missing')

  useEffect(() => {
    if (!email) return
    let cancelled = false
    api.get('approve_user', { email })
      .then((data) => {
        if (cancelled) return
        setState(data.ok ? 'success' : 'error')
      })
      .catch(() => {
        if (!cancelled) setState('error')
      })
    return () => { cancelled = true }
  }, [email])

  const statusMap = {
    loading: {
      icon: 'progress_activity',
      iconBg: '#EFF6FF',
      iconColor: '#2563EB',
      spin: true,
      title: 'Approving user...',
      desc: `Activating the account for ${email || 'this user'}. Please wait.`,
    },
    success: {
      icon: 'check_circle',
      iconBg: '#ECFDF5',
      iconColor: '#10B981',
      title: 'User Access Approved!',
      desc: `The account for ${email} has been activated in Dreamsdesk. They can now log in and will land on the Punch-In screen.`,
      badge: 'Status: Approved',
    },
    error: {
      icon: 'cancel',
      iconBg: '#FEF2F2',
      iconColor: '#EF4444',
      title: 'Approval Failed',
      desc: `Could not activate the account for ${email}. Try again from the Team page inside Dreamsdesk.`,
      badge: 'Status: Update Failed',
    },
    missing: {
      icon: 'link_off',
      iconBg: '#FEF2F2',
      iconColor: '#EF4444',
      title: 'Invalid Approval Link',
      desc: 'This link is missing the user email. Please use the Team page to approve pending users.',
    },
  }

  const s = statusMap[state]

  return (
    <div className="min-h-screen w-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #F3F1FA 0%, #E9E4F9 100%)' }}>
      <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full mx-4">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: s.iconBg }}>
          <span className={`material-symbols-outlined text-[34px] ${s.spin ? 'animate-spin' : ''}`} style={{ color: s.iconColor }}>
            {s.icon}
          </span>
        </div>
        <h1 className="text-2xl font-black text-[#1E1B2E] mb-3">{s.title}</h1>
        <p className="text-[15px] text-gray-500 leading-relaxed mb-6">{s.desc}</p>
        {s.badge && (
          <span className="inline-block bg-[#D1FAE5] text-[#065F46] font-bold px-5 py-2 rounded-full text-[14px] mb-8">
            {s.badge}
          </span>
        )}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => navigate('/login')}
            className="w-full h-[52px] rounded-[14px] text-white font-bold text-[15px]"
            style={{ background: 'linear-gradient(90deg, #702c91, #ec008c)' }}
          >
            Go to Login
          </button>
          <button
            onClick={() => navigate('/team')}
            className="w-full h-[48px] rounded-[14px] border border-gray-200 text-gray-600 font-medium text-[14px] hover:bg-gray-50 transition-colors"
          >
            Manage Team Approvals
          </button>
        </div>
        <p className="mt-8 text-[12px] text-gray-400">© 2026 Dreamsdesign. All rights reserved.</p>
      </div>
    </div>
  )
}

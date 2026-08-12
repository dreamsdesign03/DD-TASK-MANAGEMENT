import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { GoogleLogin } from '@react-oauth/google'
import { jwtDecode } from 'jwt-decode'
import SelectDropdown from '../components/SelectDropdown'
import { isElectron } from '../utils/isElectron'
import { api } from '../api'

const LOGO_SRC = '/logo.png'

// Animated chevron arrow for the button
const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export default function LoginPage() {
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [pendingApprovalEmail, setPendingApprovalEmail] = useState(null)
  const [waitingForBrowser, setWaitingForBrowser] = useState(false)
  const [redirectingToApp, setRedirectingToApp] = useState(false)
  const [deepLinkUrl, setDeepLinkUrl] = useState('')

  // Form State
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [department, setDepartment] = useState('')
  const [systemRole, setSystemRole] = useState('Employee')

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile, setProfile } = useApp()

  const hasAutoOpened = useRef(false)

  // Auto-open web login in browser when in Electron (only once)
  useEffect(() => {
    if (isElectron() && window.require && !searchParams.get('desktop') && !profile?.email) {
      if (!hasAutoOpened.current) {
        hasAutoOpened.current = true
        const { shell } = window.require('electron')
        setWaitingForBrowser(true)
        shell.openExternal('https://dd-task-management-system.vercel.app/login?desktop=true')
      }
    }
  }, [searchParams, profile])

  useEffect(() => {
    if (profile?.email) {
      if (!isElectron() && searchParams.get('desktop') === 'true') {
        // Show redirect screen first, then fire deep link
        const deepLink = `dreamsdesk://login?email=${encodeURIComponent(profile.email)}`
        setDeepLinkUrl(deepLink)
        setRedirectingToApp(true)
        // Small delay so the page can render before firing the protocol
        setTimeout(() => {
          window.location.href = deepLink
        }, 400)
      } else {
        // If in Electron (or normal web), just go to tasks
        navigate('/tasks', { replace: true })
      }
    }
  }, [profile, searchParams, navigate])

  useEffect(() => {
    if (isElectron() && window.require) {
      const { ipcRenderer } = window.require('electron')

      const processDeepLink = async (url) => {
        try {
          const urlObj = new URL(url)
          if (urlObj.protocol === 'dreamsdesk:') {
            let linkEmail = urlObj.searchParams.get('email')
            if (linkEmail) {
              linkEmail = linkEmail.replace(/\/$/, '')
              setLoading(true)
              const data = await api.post({ action: 'google_login', email: linkEmail })
              setLoading(false)
              if (data.ok && data.authenticated && data.user) {
                setProfile({
                  name: data.user['Full Name'],
                  role: data.user['Role'],
                  email: data.user['Email Address'],
                  phone: data.user['Phone'] || '',
                  joined: data.user['Joined Date'] || '',
                  department: data.user['Department'] || '',
                  systemRole: data.user['System Role'] || 'Employee',
                  employeeId: data.user['Employee ID'] || '',
                  location: 'Remote',
                  avatar: '',
                })
                navigate('/tasks')
              } else {
                setErrorMsg('Deep link login failed or account not approved.')
              }
            }
          }
        } catch (err) {
          console.error('Deep link error:', err)
          setLoading(false)
        }
      }

      ipcRenderer.invoke('get-initial-deep-link').then((url) => {
        if (url) processDeepLink(url)
      }).catch(err => console.warn('IPC invoke error:', err))

      const handleDeepLink = (e, url) => processDeepLink(url)
      ipcRenderer.on('deep-link', handleDeepLink)

      return () => ipcRenderer.removeListener('deep-link', handleDeepLink)
    }
  }, [navigate, setProfile])

  useEffect(() => {
    let intervalId = null;
    if (pendingApprovalEmail) {
      intervalId = setInterval(async () => {
        try {
          const data = await api.post({ action: 'google_login', email: pendingApprovalEmail });
          if (data.ok && data.authenticated && data.user) {
            clearInterval(intervalId);
            setPendingApprovalEmail(null);
            setProfile({
              name: data.user['Full Name'],
              role: data.user['Role'],
              email: data.user['Email Address'],
              department: data.user['Department'],
              phone: data.user['Phone'] || '',
              joined: data.user['Joined Date'] || '',
              systemRole: data.user['System Role'] || 'Employee',
              employeeId: data.user['Employee ID'] || '',
              avatar: ''
            });
            navigate('/tasks');
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      }, 3000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [pendingApprovalEmail, navigate, setProfile]);

  const handleManualAuth = async (e) => {
    e.preventDefault()

    setLoading(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      if (isRegisterMode) {
        const data = await api.post({
          action: 'register',
          email: email.trim(),
          name: name.trim(),
          phone: phone.trim(),
          department: department.trim(),
          systemRole: systemRole
        })
        if (data.ok) {
          setSuccessMsg('Registration submitted! An email has been sent to the admin. You will be able to log in once approved.')
          setIsRegisterMode(false)
          setPendingApprovalEmail(email.trim())
          setPassword('')
        } else {
          setErrorMsg(data.error || 'Registration failed.')
        }
      } else {
        const data = await api.post({
          action: 'login',
          email: email.trim(),
          password: password
        })

        if (data.ok && data.authenticated && data.user) {
          const userProfile = {
            name: data.user['Full Name'],
            role: data.user['Role'],
            email: data.user['Email Address'],
            phone: data.user['Phone'] || '',
            joined: data.user['Joined Date'] || '',
            department: data.user['Department'] || '',
            systemRole: data.user['System Role'] || 'Employee',
            employeeId: data.user['Employee ID'] || '',
            location: 'Remote',
            avatar: '',
          }
          setProfile(userProfile)
          const urlParams = new URLSearchParams(window.location.search)
          if (urlParams.get('desktop') === 'true') {
            // Directly fire deep link — no React Router navigation
            window.location.href = `dreamsdesk://login?email=${encodeURIComponent(userProfile.email)}`
            return
          }
          navigate('/tasks')
        } else {
          if (data.error && /no account found/i.test(data.error)) {
            setErrorMsg('No account found with this email. Please create an account.')
            setIsRegisterMode(true)
            setPassword('')
          } else {
            setErrorMsg(data.error || 'Invalid credentials or Not authorized.')
          }
        }
      }
    } catch (err) {
      console.error(err)
      setErrorMsg('Network error. Please try again later.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const decoded = jwtDecode(credentialResponse.credential)
      const userEmail = decoded.email || ''

      setLoading(true)
      const data = await api.post({ action: 'google_login', email: userEmail })
      setLoading(false)

      if (data.ok && data.authenticated && data.user) {
        const userProfile = {
          name: data.user['Full Name'],
          role: data.user['Role'],
          email: data.user['Email Address'],
          department: data.user['Department'],
          phone: data.user['Phone'] || '',
          joined: data.user['Joined Date'] || '',
          systemRole: data.user['System Role'] || 'Employee',
          employeeId: data.user['Employee ID'] || '',
          avatar: decoded.picture || ''
        }
        setProfile(userProfile)
        const urlParams = new URLSearchParams(window.location.search)
        if (urlParams.get('desktop') === 'true') {
          // Directly fire deep link — no React Router navigation needed
          window.location.href = `dreamsdesk://login?email=${encodeURIComponent(userProfile.email)}`
          return
        }
        navigate('/tasks')
      } else if (data.error === "Admin not approved") {
        setErrorMsg('Admin not approved. Please wait for the admin to activate your account.')
        setPendingApprovalEmail(userEmail)
      } else if (data.error === "not_registered") {
        setIsRegisterMode(true)
        setEmail(userEmail)
        setName(decoded.name || '')
        setErrorMsg('')
        setSuccessMsg('Google connected! Please complete your profile details to submit your registration.')
      } else {
        setErrorMsg('Google login failed. ' + (data.error || ''))
      }
    } catch (err) {
      console.error('Google Sign In Error:', err)
      setLoading(false)
      setErrorMsg('Google login failed. Please try again.')
    }
  }

  // ── Redirect-to-App screen (web → Electron handoff) ──
  if (redirectingToApp) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #F3F1FA 0%, #E9E4F9 100%)' }}>
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full mx-4">
          <div className="w-20 h-20 rounded-full bg-[#F5F3FF] flex items-center justify-center mx-auto mb-6">
            <img src="/logo.png" alt="Dreamsdesk" className="w-12 h-12 object-contain" style={{ filter: 'hue-rotate(0deg)' }} />
          </div>
          <h1 className="text-2xl font-black text-[#1E1B2E] mb-3">Opening Dreamsdesk...</h1>
          <p className="text-[15px] text-gray-500 leading-relaxed mb-8">
            Login successful! The Dreamsdesk desktop app should open automatically.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => { window.location.href = deepLinkUrl }}
              className="w-full h-[52px] rounded-[14px] text-white font-bold text-[15px] flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(90deg, #702c91, #ec008c)' }}
            >
              <span className="material-symbols-outlined text-[20px]">open_in_new</span>
              Open App Now
            </button>
            <button
              onClick={() => { setRedirectingToApp(false); navigate('/tasks') }}
              className="w-full h-[48px] rounded-[14px] border border-gray-200 text-gray-600 font-medium text-[14px] hover:bg-gray-50 transition-colors"
            >
              Continue in Browser Instead
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full flex items-stretch justify-center relative overflow-y-auto" style={{ background: 'linear-gradient(135deg, #F3F1FA 0%, #E9E4F9 100%)' }}>

      {/* Atmospheric Blobs */}
      <div
        className="absolute top-0 left-0 rounded-full pointer-events-none"
        style={{
          width: '700px', height: '700px',
          background: 'radial-gradient(circle, #f472b6, transparent 70%)',
          opacity: 0.5, filter: 'blur(60px)',
          transform: 'translate(-40%, -40%)',
        }}
      />
      <div
        className="absolute bottom-0 right-0 rounded-full pointer-events-none"
        style={{
          width: '700px', height: '700px',
          background: 'radial-gradient(circle, #BFDBFE, transparent 70%)',
          opacity: 0.5, filter: 'blur(60px)',
          transform: 'translate(40%, 40%)',
        }}
      />

      {/* MAIN CARD */}
      <main
        className="relative z-10 w-full flex flex-col md:flex-row animate-fade-in-up max-w-[1280px] md:m-8 md:rounded-[28px] md:overflow-hidden min-h-[100dvh] md:min-h-[calc(100vh-4rem)] md:shadow-[0_24px_80px_rgba(91,33,182,0.18),0_4px_24px_rgba(0,0,0,0.08)] bg-white md:bg-transparent"
      >

        {/* LEFT PANEL */}
        <section
          className="hidden md:flex w-full md:w-1/2 flex-col items-center justify-between text-white"
          style={{
            background: 'linear-gradient(160deg, #702c91 0%, #ec008c 100%)',
            padding: 'clamp(3rem, 6vw, 5rem) clamp(2.5rem, 5vw, 4rem)',
          }}
        >
          {/* Top spacer */}
          <div />

          {/* Hero Logo */}
          <div className="flex flex-col items-center gap-8 text-center">
            <img
              src={LOGO_SRC}
              alt="Dreamsdesk"
              className="animate-float"
              style={{
                width: 'clamp(200px, 32vw, 300px)',
                height: 'auto',
                objectFit: 'contain',
                filter: 'brightness(0) invert(1) drop-shadow(0 20px 48px rgba(196,181,253,0.3))',
                opacity: 0.93,
              }}
            />
            <p style={{
              color: '#C4AEFF',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
            }}>
              Track. Collaborate. Deliver.
            </p>
          </div>

          {/* Quote Block */}
          <div
            className="w-full"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.13)',
              borderRadius: '16px',
              padding: '1.5rem 2rem',
              backdropFilter: 'blur(8px)',
            }}
          >
            <p style={{
              color: '#D8C9F5',
              fontSize: '14px',
              lineHeight: '1.8',
              textAlign: 'center',
              fontStyle: 'italic',
            }}>
              "Empowering teams to visualize productivity and streamline internal workflows with executive precision."
            </p>
          </div>
        </section>

        {/* RIGHT PANEL */}
        <section
          className="w-full md:w-1/2 bg-white flex flex-col items-center justify-start md:overflow-y-auto"
          style={{ padding: 'clamp(3rem, 6vw, 6rem) clamp(1.5rem, 5vw, 5rem)' }}
        >
          {waitingForBrowser ? (
            <div className="w-full flex flex-col items-center text-center my-auto" style={{ maxWidth: '400px' }}>
              <div className="w-20 h-20 rounded-full bg-[#F5F3FF] flex items-center justify-center mx-auto mb-6">
                <span className="material-symbols-outlined text-[40px] text-[#702c91] animate-spin" style={{ animationDuration: '3s' }}>progress_activity</span>
              </div>
              <h1 style={{ fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 800, color: '#1E1B2E', marginBottom: '12px' }}>
                Waiting for Login...
              </h1>
              <p style={{ fontSize: '15px', color: '#6B7280', lineHeight: 1.6, marginBottom: '32px' }}>
                We opened your web browser for login. Complete sign-in there and this window will update automatically.
              </p>
              {loading && (
                <div className="flex items-center gap-2 text-[#702c91] text-sm font-medium mb-4">
                  <span className="material-symbols-outlined text-[18px] animate-spin" style={{ animationDuration: '2s' }}>progress_activity</span>
                  Verifying your login...
                </div>
              )}
              {errorMsg && (
                <div className="mb-4 w-full p-3 bg-red-50 border border-red-200 text-red-600 text-[14px] rounded-lg">
                  {errorMsg}
                  <button onClick={() => { setErrorMsg(''); setWaitingForBrowser(false) }} className="block mt-2 text-[#702c91] font-semibold hover:underline text-[13px]">Try again</button>
                </div>
              )}
              <button
                onClick={() => {
                  const { shell } = window.require('electron')
                  shell.openExternal('https://dd-task-management-system.vercel.app/login?desktop=true')
                }}
                className="w-full h-[54px] bg-white border border-gray-200 text-[#1E1B2E] font-medium tracking-wide rounded-[14px] flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm mt-2"
              >
                <span className="material-symbols-outlined text-[20px] mr-2">open_in_new</span>
                Re-open Browser
              </button>
              <button
                onClick={() => setWaitingForBrowser(false)}
                className="w-full h-[54px] bg-transparent text-[#702c91] font-bold tracking-wide rounded-[14px] flex items-center justify-center hover:bg-[#F3F1FA] transition-all mt-3"
              >
                Login Manually Here
              </button>
            </div>
          ) : (
          <div className="w-full flex flex-col items-center my-auto" style={{ maxWidth: '400px' }}>

            {/* Mobile Logo */}
            <div className="md:hidden w-20 h-20 rounded-full bg-[#F5F3FF] flex items-center justify-center mx-auto mb-6">
              <img src={LOGO_SRC} alt="Dreamsdesk" className="w-12 h-12 object-contain" style={{ filter: 'hue-rotate(0deg)' }} />
            </div>

            {/* Heading */}
            <h1
              style={{
                fontSize: 'clamp(28px, 4vw, 36px)',
                fontWeight: 800,
                color: '#1E1B2E',
                marginBottom: '10px',
                textAlign: 'center',
                letterSpacing: '-0.02em',
              }}
            >
              {isRegisterMode ? 'Complete Registration' : 'Welcome Back'}
            </h1>
            <p style={{ fontSize: '15px', color: '#6B7280', textAlign: 'center', marginBottom: '40px', lineHeight: 1.6 }}>
              {isRegisterMode ? 'Please provide your details to request access.' : 'Sign in to your Dreamsdesk account to continue'}
            </p>

            {errorMsg && (
              <div className="mb-4 w-full p-3 bg-red-50 border border-red-200 text-red-600 text-[14px] rounded-lg">
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="mb-4 w-full p-3 bg-green-50 border border-green-200 text-green-700 text-[14px] rounded-lg">
                {successMsg}
              </div>
            )}

            <form className="w-full space-y-4" onSubmit={handleManualAuth}>
              {isRegisterMode && (
                <div className="relative">
                  <input
                    id="name" required placeholder=" " value={name} onChange={(e) => setName(e.target.value)}
                    className="block w-full h-[54px] px-4 pt-2 text-[#1E1B2E] bg-transparent border border-gray-200 rounded-[10px] appearance-none focus:outline-none focus:ring-1 focus:ring-[#702c91] focus:border-[#702c91] peer transition-all duration-200"
                  />
                  <label htmlFor="name" className="absolute text-[14px] text-gray-400 duration-200 transform -translate-y-1/2 top-1/2 left-4 z-10 origin-[0] peer-focus:scale-[0.85] peer-focus:-translate-y-[24px] peer-focus:text-[#702c91] peer-focus:bg-white peer-focus:px-1 pointer-events-none peer-[:not(:placeholder-shown)]:scale-[0.85] peer-[:not(:placeholder-shown)]:-translate-y-[24px] peer-[:not(:placeholder-shown)]:bg-white peer-[:not(:placeholder-shown)]:px-1">Full Name</label>
                </div>
              )}

              {isRegisterMode && (
                <div className="relative">
                  <input
                    id="email" type="email" required placeholder=" " value={email} onChange={(e) => setEmail(e.target.value)} disabled={isRegisterMode && email.length > 0}
                    className="block w-full h-[54px] px-4 pt-2 text-[#1E1B2E] bg-transparent border border-gray-200 rounded-[10px] appearance-none focus:outline-none focus:ring-1 focus:ring-[#702c91] focus:border-[#702c91] peer transition-all duration-200 disabled:opacity-60 disabled:bg-gray-50"
                  />
                  <label htmlFor="email" className="absolute text-[14px] text-gray-400 duration-200 transform -translate-y-1/2 top-1/2 left-4 z-10 origin-[0] peer-focus:scale-[0.85] peer-focus:-translate-y-[24px] peer-focus:text-[#702c91] peer-focus:bg-white peer-focus:px-1 pointer-events-none peer-[:not(:placeholder-shown)]:scale-[0.85] peer-[:not(:placeholder-shown)]:-translate-y-[24px] peer-[:not(:placeholder-shown)]:bg-white peer-[:not(:placeholder-shown)]:px-1">Email Address</label>
                </div>
              )}

              {isRegisterMode && (
                <>
                  <div className="relative">
                    <input
                      id="department" required placeholder=" " value={department} onChange={(e) => setDepartment(e.target.value)}
                      className="block w-full h-[54px] px-4 pt-2 text-[#1E1B2E] bg-transparent border border-gray-200 rounded-[10px] appearance-none focus:outline-none focus:ring-1 focus:ring-[#702c91] focus:border-[#702c91] peer transition-all duration-200"
                    />
                    <label htmlFor="department" className="absolute text-[14px] text-gray-400 duration-200 transform -translate-y-1/2 top-1/2 left-4 z-10 origin-[0] peer-focus:scale-[0.85] peer-focus:-translate-y-[24px] peer-focus:text-[#702c91] peer-focus:bg-white peer-focus:px-1 pointer-events-none peer-[:not(:placeholder-shown)]:scale-[0.85] peer-[:not(:placeholder-shown)]:-translate-y-[24px] peer-[:not(:placeholder-shown)]:bg-white peer-[:not(:placeholder-shown)]:px-1">Department</label>
                  </div>
                  <div className="relative">
                    <input
                      id="phone" required placeholder=" " value={phone} onChange={(e) => setPhone(e.target.value)}
                      className="block w-full h-[54px] px-4 pt-2 text-[#1E1B2E] bg-transparent border border-gray-200 rounded-[10px] appearance-none focus:outline-none focus:ring-1 focus:ring-[#702c91] focus:border-[#702c91] peer transition-all duration-200"
                    />
                    <label htmlFor="phone" className="absolute text-[14px] text-gray-400 duration-200 transform -translate-y-1/2 top-1/2 left-4 z-10 origin-[0] peer-focus:scale-[0.85] peer-focus:-translate-y-[24px] peer-focus:text-[#702c91] peer-focus:bg-white peer-focus:px-1 pointer-events-none peer-[:not(:placeholder-shown)]:scale-[0.85] peer-[:not(:placeholder-shown)]:-translate-y-[24px] peer-[:not(:placeholder-shown)]:bg-white peer-[:not(:placeholder-shown)]:px-1">Phone Number</label>
                  </div>
                  <div className="relative">
                    <SelectDropdown dropdownUp={true} value={systemRole} onChange={setSystemRole} options={['Employee', 'Manager', 'Admin', 'Sales', 'HR', 'Accountant']} style={{ width: '100%', height: 54, fontSize: 14 }} />
                  </div>
                </>
              )}

              {isRegisterMode && (
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-[58px] bg-gradient-to-r from-[#702c91] to-[#ec008c] text-white font-bold tracking-wide rounded-[16px] flex items-center justify-center hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-70 disabled:cursor-not-allowed shadow-md mt-8"
                >
                  {loading ? 'Processing...' : 'Submit Registration'}
                </button>
              )}

              {!isRegisterMode && !isElectron() && (
                <div className="flex justify-center w-full google-login-wrapper mt-4">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => setErrorMsg('Google login failed.')}
                    shape="pill"
                    size="large"
                    theme="outline"
                    width="360"
                    text="continue_with"
                  />
                </div>
              )}

              {isElectron() && !isRegisterMode && (
                <div className="mt-6 flex flex-col items-center space-y-3">
                  <div className="text-gray-400 text-sm font-medium">Or</div>
                  <button
                    type="button"
                    onClick={() => window.require('electron').shell.openExternal('https://dd-task-management-system.vercel.app/login?desktop=true')}
                    className="w-full h-[54px] bg-white border border-gray-200 text-[#1E1B2E] font-medium tracking-wide rounded-[14px] flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm"
                  >
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 mr-3" />
                    Sign in instantly via Web Browser
                  </button>
                </div>
              )}

              <div className="mt-6 text-center text-[13px] text-gray-500">
                {isRegisterMode ? (
                  <button type="button" onClick={() => { setIsRegisterMode(false); setErrorMsg(''); setSuccessMsg('') }} className="text-[#702c91] font-semibold hover:underline">Cancel & Return to Login</button>
                ) : (
                  <button type="button" onClick={() => { setIsRegisterMode(true); setErrorMsg(''); setSuccessMsg('') }} className="text-[#702c91] font-semibold hover:underline">New here? Create an account</button>
                )}
              </div>

            </form>

            {/* Footer */}
            {!isRegisterMode && (
              <footer className="mt-12 text-center">
                <p style={{ fontSize: '12px', color: '#f472b6' }}>© 2026 Dreamsdesign. All rights reserved.</p>
              </footer>
            )}
          </div>
          )}
        </section>
      </main>
    </div>
  )
}


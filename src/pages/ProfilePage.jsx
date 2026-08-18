import { useState, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import TopNav from '../components/TopNav'
import { useApp } from '../context/AppContext'
import { api } from '../api'
import { renderAvatar } from '../utils/avatar'

export default function ProfilePage() {
  const { profile, setProfile, addToast, fetchTeam } = useApp()
  const [isEditingName, setIsEditingName] = useState(false)
  const [fullName, setFullName] = useState(profile?.name || '')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (profile?.name) {
      setFullName(profile.name)
    }
  }, [profile?.name])

  const handleSaveName = async () => {
    const trimmed = fullName.trim()
    if (!trimmed) {
      addToast?.('Full Name cannot be empty', 'error')
      return
    }

    setIsSaving(true)
    try {
      await api.post({
        action: 'update_user_profile',
        email: profile.email,
        fullName: trimmed,
      })

      // Update local profile state
      const updatedProfile = { ...profile, name: trimmed }
      setProfile(updatedProfile)
      try {
        localStorage.setItem('dd_user', JSON.stringify(updatedProfile))
      } catch (err) {
        console.warn('Failed to save user to localStorage:', err)
      }

      // Refresh team state globally
      if (fetchTeam) fetchTeam()

      addToast?.('Full Name updated successfully!', 'success')
      setIsEditingName(false)
    } catch (err) {
      console.error('Failed to update profile name:', err)
      addToast?.('Failed to update Full Name: ' + (err.message || err), 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelName = () => {
    setFullName(profile?.name || '')
    setIsEditingName(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background, #F0EDF8)', display: 'flex' }}>
      <Sidebar />

      <main className="page-main">
        <TopNav title="Profile" showSearch={false} />

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 pb-6">
          <div className="max-w-[1450px] mx-auto w-full bg-white dark:bg-[#1e1b2e] rounded-[20px] shadow-[0_8px_24px_rgba(91,33,182,0.08)] p-6 md:p-8 flex flex-col min-h-[600px]">
            <div className="max-w-4xl mx-auto w-full">
              {/* Profile Form & Info Card */}
              <div className="bg-surface-container-lowest rounded-lg border border-outline-variant/40 shadow-sm flex flex-col h-full min-h-[600px]">
                <div className="p-4 md:p-8 flex-grow">
                  <div className="space-y-6">

                    <div className="col-span-full mt-8 bg-surface rounded-lg p-4 md:p-8 border border-outline-variant/40">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                        {/* Left side: Photo, Name, Designation, Mail */}
                        <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-6">
                          {renderAvatar(profile.avatar, profile.name, "w-24 h-24 rounded-full border-2 border-white shadow-sm text-[28px]", "text-[28px]", profile.email)}
                          <div className="flex flex-col items-center sm:items-start">
                            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1 font-bold text-[22px]">
                              {profile.name}
                            </h2>
                            <p className="text-secondary font-label-md mb-1">{profile.role}</p>
                            <p className="text-[#6B6B6B] text-body-sm">{profile.email}</p>
                          </div>
                        </div>

                        {/* Right side: Joined, Department */}
                        <div className="flex flex-col gap-4 border-t md:border-t-0 md:border-l border-outline-variant/40 pt-6 md:pt-0 md:pl-8">
                          <div className="flex flex-col gap-1 text-body-sm text-center sm:text-left">
                            <span className="text-secondary uppercase tracking-wider text-[11px] font-semibold">Joined Date</span>
                            <span className="font-semibold text-lg text-on-surface">
                              {(() => {
                                if (!profile.joined) return 'N/A'
                                try {
                                  const d = new Date(profile.joined)
                                  if (isNaN(d.getTime())) return profile.joined
                                  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' })
                                } catch {
                                  return profile.joined
                                }
                              })()}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1 text-body-sm text-center sm:text-left">
                            <span className="text-secondary uppercase tracking-wider text-[11px] font-semibold">Department</span>
                            <span className="font-semibold text-lg text-on-surface tracking-tight break-words">{profile.department}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="relative floating-label-group flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            className={`w-full p-3 bg-surface border rounded-md text-[14px] peer text-ellipsis overflow-hidden whitespace-nowrap transition-colors ${
                              isEditingName
                                ? 'border-[#702c91] bg-white text-[#151c27] shadow-sm ring-1 ring-[#702c91]/30 font-medium'
                                : 'border-outline text-secondary cursor-not-allowed'
                            }`}
                            id="full_name"
                            placeholder=" "
                            readOnly={!isEditingName}
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && isEditingName) handleSaveName()
                              if (e.key === 'Escape' && isEditingName) handleCancelName()
                            }}
                          />
                          <label
                            className="absolute left-3 top-3.5 z-10 origin-[0] -translate-y-6 scale-75 transform bg-surface-container-lowest px-1 text-label-sm text-outline"
                            htmlFor="full_name"
                          >
                            Full Name
                          </label>
                        </div>

                        {!isEditingName ? (
                          <button
                            type="button"
                            onClick={() => setIsEditingName(true)}
                            className="px-3.5 py-2.5 rounded-lg border border-[#702c91]/30 bg-purple-50 hover:bg-[#702c91] hover:text-white text-[#702c91] font-semibold text-[13px] flex items-center gap-1.5 transition-all shadow-sm shrink-0 cursor-pointer"
                            title="Edit Full Name"
                          >
                            <span className="material-symbols-outlined text-[17px]">edit</span>
                            <span>Edit</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={handleSaveName}
                              className="px-3.5 py-2.5 rounded-lg bg-gradient-to-r from-[#702c91] to-[#ec008c] hover:opacity-95 text-white font-semibold text-[13px] flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                            >
                              {isSaving ? (
                                <span className="material-symbols-outlined text-[17px] animate-spin">progress_activity</span>
                              ) : (
                                <span className="material-symbols-outlined text-[17px]">check</span>
                              )}
                              <span>Save</span>
                            </button>
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={handleCancelName}
                              className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-[13px] flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                            >
                              <span className="material-symbols-outlined text-[17px]">close</span>
                              <span>Cancel</span>
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="relative floating-label-group">
                        <input
                          className="w-full p-3 bg-surface border border-outline rounded-md text-secondary cursor-not-allowed text-[14px] peer text-ellipsis overflow-hidden whitespace-nowrap"
                          id="email"
                          placeholder=" "
                          readOnly
                          type="email"
                          value={profile.email}
                        />
                        <label
                          className="absolute left-3 top-3.5 z-10 origin-[0] -translate-y-6 scale-75 transform bg-surface-container-lowest px-1 text-label-sm text-outline"
                          htmlFor="email"
                        >
                          Email Address
                        </label>
                      </div>
                      <div className="relative floating-label-group">
                        <input
                          className="w-full p-3 bg-surface border border-outline rounded-md text-secondary cursor-not-allowed text-[14px] peer text-ellipsis overflow-hidden whitespace-nowrap"
                          id="phone"
                          placeholder=" "
                          readOnly
                          type="tel"
                          value={profile.phone}
                        />
                        <label
                          className="absolute left-3 top-3.5 z-10 origin-[0] -translate-y-6 scale-75 transform bg-surface-container-lowest px-1 text-label-sm text-outline"
                          htmlFor="phone"
                        >
                          Phone Number
                        </label>
                      </div>
                      <div className="relative floating-label-group">
                        <input
                          className="w-full p-3 bg-surface border border-outline rounded-md text-secondary cursor-not-allowed text-[14px] peer text-ellipsis overflow-hidden whitespace-nowrap"
                          id="role"
                          placeholder=" "
                          readOnly
                          type="text"
                          value={profile.role}
                        />
                        <label
                          className="absolute left-3 top-3.5 z-10 origin-[0] -translate-y-6 scale-75 transform bg-surface-container-lowest px-1 text-label-sm text-outline"
                          htmlFor="role"
                        >
                          Role
                        </label>
                      </div>
                      <div className="relative floating-label-group col-span-full">
                        <input
                          className="w-full p-3 bg-surface border border-outline rounded-md text-secondary cursor-not-allowed text-[14px] peer text-ellipsis overflow-hidden whitespace-nowrap"
                          id="department"
                          placeholder=" "
                          readOnly
                          type="text"
                          value={profile.department}
                        />
                        <label
                          className="absolute left-3 top-3.5 z-10 origin-[0] -translate-y-6 scale-75 transform bg-surface-container-lowest px-1 text-label-sm text-outline"
                          htmlFor="department"
                        >
                          Department
                        </label>
                      </div>

                      {/* Moved Profile Info Section */}


                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}


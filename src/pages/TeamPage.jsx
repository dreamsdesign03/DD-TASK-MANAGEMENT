import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import TopNav from '../components/TopNav'
import { useApp } from '../context/AppContext'
import { api } from '../api'
import { renderAvatar } from '../utils/avatar'


const INITIAL_EMPLOYEES = []

export default function TeamPage() {
  const { setSearchQuery, profile, employees: dynamicEmployees, tasks, addToast, fetchTeam } = useApp()
  const navigate = useNavigate()
  const [localEmployees, setLocalEmployees] = useState([])
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [approving, setApproving] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  // Add Member Form States
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('')
  const [newDept, setNewDept] = useState('Development')
  const [newEmail, setNewEmail] = useState('')
  const [newAvatar, setNewAvatar] = useState('')

  const handleAddMember = (e) => {
    e.preventDefault()
    if (!newName.trim() || !newRole.trim() || !newEmail.trim()) {
      addToast('Please fill out all required fields', 'error')
      return
    }

    const newEmp = {
      id: Date.now(),
      name: newName.trim(),
      role: newRole.trim(),
      department: newDept,
      email: newEmail.trim(),
      avatar: newAvatar,
      status: 'Online',
      taskCount: 0,
    }

    setLocalEmployees((prev) => [...prev, newEmp])
    setShowAddModal(false)

    // Clear inputs
    setNewName('')
    setNewRole('')
    setNewEmail('')
  }

  // Merge dynamic team members with any locally added ones, and map task count dynamically
  const baseEmployees = dynamicEmployees && dynamicEmployees.length > 0 ? dynamicEmployees : INITIAL_EMPLOYEES
  const employees = [...baseEmployees, ...localEmployees].map(emp => {
    const taskCount = tasks ? tasks.filter(t => t.assignedTo === emp.name && t.status !== 'Done').length : 0
    return { ...emp, taskCount }
  })

  const isPending = (e) => String(e.isActive).toLowerCase() === 'no'
  const pendingMembers = employees.filter(isPending)
  const approvedMembers = employees.filter(e => !isPending(e))

  // Filter Employees (search only)
  const filtered = approvedMembers.filter((e) => {
    const query = search.toLowerCase()
    return !query ||
      (e.name || '').toLowerCase().includes(query) ||
      (e.role || '').toLowerCase().includes(query) ||
      (e.department || '').toLowerCase().includes(query)
  })

  const handleApprove = async (emp) => {
    setApproving(emp.email)
    try {
      const data = await api.get('approve_user', { email: emp.email })
      if (data.ok) {
        addToast(`${emp.name} approved! They can now log in.`, 'success')
        await fetchTeam()
      } else {
        addToast('Failed to approve: ' + (data.error || ''), 'error')
      }
    } catch (err) {
      addToast('Failed to approve: ' + err.message, 'error')
    } finally {
      setApproving(null)
    }
  }

  const handleReject = async (emp) => {
    setApproving(emp.email)
    try {
      const data = await api.post({ action: 'reject_user', email: emp.email })
      if (data.ok) {
        addToast(`${emp.name}'s request was rejected.`, 'success')
        await fetchTeam()
      } else {
        addToast('Failed to reject: ' + (data.error || ''), 'error')
      }
    } catch (err) {
      addToast('Failed to reject: ' + err.message, 'error')
    } finally {
      setApproving(null)
    }
  }

  const handleDelete = async (emp) => {
    setDeleting(emp.email)
    try {
      const data = await api.post({ action: 'delete_user', email: emp.email })
      if (data.ok) {
        addToast(`${emp.name} has been deleted.`, 'success')
        setConfirmDelete(null)
        await fetchTeam()
      } else {
        addToast('Failed to delete: ' + (data.error || ''), 'error')
      }
    } catch (err) {
      addToast('Failed to delete: ' + err.message, 'error')
    } finally {
      setDeleting(null)
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'Online':
        return 'bg-green-500'
      case 'Busy':
        return 'bg-amber-500'
      default:
        return 'bg-gray-400'
    }
  }

  return (
    <>
    <div className="bg-[#F0EDF8] font-['Inter',sans-serif] text-[#151c27] overflow-hidden h-screen flex">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F8; border-radius: 10px; }

        .member-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 12px 32px rgba(91, 33, 182, 0.15);
        }
        .member-card .msg-icon {
            transition: transform 0.2s ease;
        }
        .member-card:hover .msg-icon {
            transform: scale(1.2) rotate(-5deg);
        }
      `}</style>

      <Sidebar />

      <main className="page-main">
        <TopNav title="Team Directory" showSearch={false} />

        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-5 pb-6 animate-fade-in-up">
          <div className="w-full">

            {/* Filter and Search controls */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
              <div></div>
              <div className="relative w-full md:w-80">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-[20px]">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Search by name, role..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white border border-[#E5E7EB] rounded-full pl-10 pr-4 py-2 text-[13px] font-semibold text-[#1E1B2E] focus:ring-2 focus:ring-[#702c91]/20 focus:border-[#702c91] outline-none transition-all shadow-sm"
                />
              </div>
            </div>

            {/* Pending Approvals (Admin only) */}
            {profile?.systemRole === 'Admin' && pendingMembers.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-[#F59E0B] text-[22px]">pending_actions</span>
                  <h2 className="text-[15px] font-bold text-[#1E1B2E] m-0">Pending Approvals</h2>
                  <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[11px] font-bold">{pendingMembers.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {pendingMembers.map((emp, idx) => {
                    const colors = [
                      { topBar: 'from-amber-400 to-orange-500', avatarBg: 'from-amber-100 to-orange-100', text: 'text-amber-600', tagBg: 'bg-amber-50', tagText: 'text-amber-700' },
                      { topBar: 'from-amber-400 to-orange-500', avatarBg: 'from-amber-100 to-orange-100', text: 'text-amber-600', tagBg: 'bg-amber-50', tagText: 'text-amber-700' },
                      { topBar: 'from-amber-400 to-orange-500', avatarBg: 'from-amber-100 to-orange-100', text: 'text-amber-600', tagBg: 'bg-amber-50', tagText: 'text-amber-700' },
                      { topBar: 'from-amber-400 to-orange-500', avatarBg: 'from-amber-100 to-orange-100', text: 'text-amber-600', tagBg: 'bg-amber-50', tagText: 'text-amber-700' },
                    ];
                    const theme = colors[idx % colors.length];
                    return (
                      <div key={emp.id} className="member-card bg-white rounded-[20px] p-5 shadow-[0_8px_24px_rgba(91,33,182,0.08)] relative overflow-hidden transition-all duration-300 border border-amber-100">
                        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${theme.topBar}`}></div>
                        <div className="flex items-center gap-3 mb-4">
                          {renderAvatar(emp.avatar, emp.name, "w-14 h-14 rounded-full border-2 border-white shadow-sm", "text-[18px]", emp.email)}
                          <div className="min-w-0">
                            <h3 className="text-[15px] font-bold text-[#1E1B2E] m-0 truncate">{emp.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`px-2 py-0.5 rounded-full ${theme.tagBg} ${theme.tagText} text-[10px] font-bold uppercase tracking-wide`}>Pending</span>
                            </div>
                          </div>
                        </div>
                        <div className="h-[1px] bg-[#F3F4F6] w-full mb-3"></div>
                        <div className="space-y-1.5 mb-4 text-[12px] text-[#6B7280]">
                          <div className="flex items-center gap-2"><span className="material-symbols-outlined text-[15px]">mail</span><span className="truncate">{emp.email}</span></div>
                          <div className="flex items-center gap-2"><span className="material-symbols-outlined text-[15px]">badge</span><span>{emp.role}</span></div>
                          <div className="flex items-center gap-2"><span className="material-symbols-outlined text-[15px]">apartment</span><span>{emp.department}</span></div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(emp)}
                            disabled={approving === emp.email}
                            className="flex-1 h-[38px] border-none cursor-pointer rounded-full bg-gradient-to-r from-[#10B981] to-[#059669] text-white text-[13px] font-semibold flex items-center justify-center gap-2 shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-60"
                          >
                            <span className="material-symbols-outlined text-[18px]">check</span>Approve
                          </button>
                          <button
                            onClick={() => handleReject(emp)}
                            disabled={approving === emp.email}
                            className="flex-1 h-[38px] border border-red-200 cursor-pointer rounded-full bg-white text-red-600 text-[13px] font-semibold flex items-center justify-center gap-2 hover:bg-red-50 active:scale-95 transition-all disabled:opacity-60"
                          >
                            <span className="material-symbols-outlined text-[18px]">close</span>Reject
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Directory Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filtered.length === 0 ? (
                <div className="col-span-full text-center py-16">
                  <span className="material-symbols-outlined text-[#D1D5DB] text-[64px] mb-4">group_off</span>
                  <h3 className="text-[#4B5563] font-semibold text-lg m-0">No team members found</h3>
                  <p className="text-[#9CA3AF] text-sm mt-1 m-0">Try adjusting your search or filters.</p>
                </div>
              ) : (
                filtered.map((emp, idx) => {
                  const colors = [
                    { topBar: 'from-[#702c91] to-[#ec008c]', avatarBg: 'from-purple-100 to-pink-100', text: 'text-[#702c91]', tagBg: 'bg-purple-50', tagText: 'text-purple-600' },
                    { topBar: 'from-[#10B981] to-[#059669]', avatarBg: 'from-green-100 to-emerald-100', text: 'text-[#10B981]', tagBg: 'bg-green-50', tagText: 'text-green-600' },
                    { topBar: 'from-[#F59E0B] to-[#D97706]', avatarBg: 'from-yellow-100 to-amber-100', text: 'text-[#F59E0B]', tagBg: 'bg-yellow-50', tagText: 'text-yellow-600' },
                    { topBar: 'from-[#3B82F6] to-[#2563EB]', avatarBg: 'from-blue-100 to-indigo-100', text: 'text-[#3B82F6]', tagBg: 'bg-blue-50', tagText: 'text-blue-600' },
                  ];
                  const theme = colors[idx % colors.length];

                  const getStatusElement = (status) => {
                    if (status === 'Online') {
                      return <div className="w-2.5 h-2.5 bg-[#10B981] rounded-full ring-4 ring-green-100 animate-pulse"></div>;
                    }
                    if (status === 'Busy') {
                      return <div className="w-2.5 h-2.5 bg-[#F59E0B] rounded-full ring-4 ring-yellow-100"></div>;
                    }
                    return <div className="w-2.5 h-2.5 bg-gray-300 rounded-full ring-4 ring-gray-100"></div>;
                  };

                  return (
                    <div
                      key={emp.id}
                      className="member-card bg-white rounded-[20px] p-5 shadow-[0_8px_24px_rgba(91,33,182,0.08)] relative overflow-hidden transition-all duration-300 border border-[#E5E7EB]"
                    >
                      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${theme.topBar}`}></div>
                      
                      <div className="flex justify-between items-start mb-4">
                        {renderAvatar(
                          emp.email === profile.email ? profile.avatar : emp.avatar,
                          emp.email === profile.email ? (profile.name || emp.name) : emp.name,
                          "w-16 h-16 rounded-full border-2 border-white shadow-sm",
                          "text-[20px]",
                          emp.email
                        )}
                        <div className="relative mt-1 mr-1">
                          {getStatusElement(emp.status)}
                        </div>
                      </div>

                      <div className="mb-4">
                        <h3 className="text-[15px] font-bold text-[#1E1B2E] m-0 mb-1">{emp.name}</h3>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`px-2.5 py-0.5 rounded-full ${theme.tagBg} ${theme.tagText} text-[11px] font-bold`}>
                            {emp.role}
                          </span>
                          <span className="text-[11px] uppercase text-[#9CA3AF] font-bold tracking-wider">
                            {emp.department}
                          </span>
                        </div>
                      </div>

                      <div className="h-[1px] bg-[#F3F4F6] w-full mb-4"></div>
                      
                      <div className="flex items-center gap-3 mb-5">
                        <div className="w-7 h-7 rounded-lg bg-[#F9FAFB] flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[16px] text-[#6B7280]">mail</span>
                        </div>
                        <span className="text-[11px] text-[#6B7280] font-medium truncate">{emp.email}</span>
                      </div>

                      <div className="w-full">
                        {emp.email !== profile.email ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => navigate('/chat', { state: { openChatWithName: emp.name } })}
                              className="flex-1 h-[38px] border-none cursor-pointer rounded-full bg-gradient-to-r from-[#702c91] to-[#ec008c] text-white text-[13px] font-semibold flex items-center justify-center gap-2 shadow-sm hover:opacity-90 active:scale-95 transition-all"
                            >
                              <span className="material-symbols-outlined msg-icon text-[18px]">chat_bubble</span>
                              Message
                            </button>
                            {profile?.systemRole === 'Admin' && (
                              <button
                                onClick={() => setConfirmDelete(emp)}
                                disabled={deleting === emp.email}
                                className="h-[38px] w-[38px] border border-red-200 cursor-pointer rounded-full bg-white text-red-500 flex items-center justify-center hover:bg-red-50 hover:border-red-300 active:scale-95 transition-all shrink-0 disabled:opacity-60"
                                title="Delete user"
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setSearchQuery(emp.name)
                              navigate('/my-tasks')
                            }}
                            className="w-full h-[38px] border border-[#702c91] cursor-pointer rounded-full bg-white text-[#702c91] text-[13px] font-semibold flex items-center justify-center gap-2 hover:bg-purple-50 active:scale-95 transition-all"
                          >
                            <span className="material-symbols-outlined text-[18px]">visibility</span>
                            My Tasks
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
          </div>
      </main>
    </div>
    {createPortal(
      confirmDelete && (
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-[400px] rounded-2xl shadow-2xl flex flex-col animate-scale-in">
            <div className="flex items-center gap-3 px-6 pt-6 pb-2">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px] text-red-500">delete_forever</span>
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-[#1E1B2E] m-0">Delete User</h3>
                <p className="text-[13px] text-[#6B7280] m-0 mt-0.5">This action cannot be undone</p>
              </div>
            </div>
            <div className="px-6 py-4">
              <p className="text-[13px] text-[#4B5563] m-0 leading-relaxed">
                Are you sure you want to delete <strong className="text-[#1E1B2E]">{confirmDelete.name}</strong>? This will permanently remove:
              </p>
              <ul className="mt-3 space-y-1.5 text-[12px] text-[#6B7280]">
                <li className="flex items-center gap-2"><span className="material-symbols-outlined text-[14px] text-red-400">check</span>Team profile &amp; account</li>
                <li className="flex items-center gap-2"><span className="material-symbols-outlined text-[14px] text-red-400">check</span>All assigned &amp; created tasks</li>
                <li className="flex items-center gap-2"><span className="material-symbols-outlined text-[14px] text-red-400">check</span>Activity &amp; attendance logs</li>
                <li className="flex items-center gap-2"><span className="material-symbols-outlined text-[14px] text-red-400">check</span>Chat messages &amp; file uploads</li>
              </ul>
            </div>
            <div className="border-t border-gray-200 px-6 py-4 flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 h-[42px] rounded-xl bg-white border border-[#E5E7EB] text-[#4B5563] text-[13px] font-bold cursor-pointer hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting === confirmDelete.email}
                className="flex-1 h-[42px] rounded-xl bg-red-500 hover:bg-red-600 text-white text-[13px] font-bold cursor-pointer transition-all border-none disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting === confirmDelete.email ? (
                  'Deleting...'
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                    Delete Permanently
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ),
      document.body
    )}
    </>
  )
}



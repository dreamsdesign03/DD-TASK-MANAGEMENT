import { useState } from 'react'
import Sidebar from '../components/Sidebar'
import TopNav from '../components/TopNav'
import { useApp, mqttClient } from '../context/AppContext'
import { formatDateShort } from '../utils/dateFormat'
import { api } from '../api'

const safeDate = (val) => val ? formatDateShort(val) : '-'

const AVAILABLE_SERVICES = [
  "Business Growth Consulting",
  "AI SEO & Lead Generation",
  "D2C Development / Marketing",
  "Ecommerce Development",
  "Website Development",
  "Digital Marketing & Brand Awareness",
  "Branding & Identity Management",
  "Mobile Apps and Software Development",
  "Marketing Automation & Funnel Development",
  "Films, Videos and UGC content creation",
  "Software and SAAS development",
  "Ai Automation and Business Growth",
  "360 Project"
]

export default function ClientsPage() {
  const { clients, fetchClients, profile, addToast } = useApp()
  const [isUpdating, setIsUpdating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingClient, setEditingClient] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [clientForm, setClientForm] = useState({
    projectName: '',
    clientName: '',
    emails: [''],
    phones: [''],
    industry: '',
    services: [],
    importantLinks: []
  })
  const [viewingClient, setViewingClient] = useState(null)
  const [confirmDeactivateClient, setConfirmDeactivateClient] = useState(null)
  const [showNewClientModal, setShowNewClientModal] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [newClientForm, setNewClientForm] = useState({
    projectName: '',
    clientName: '',
    emails: [''],
    phones: [''],
    industry: '',
    services: [],
    importantLinks: [],
    projectStartDate: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/(\d{2})\/(\d{2})\/(\d{4}),/, '$3-$2-$1')
  })

  const canManageClients = (prof) => {
    const sysRole = String(prof?.systemRole || '').trim().toLowerCase()
    const role = String(prof?.role || prof?.Role || '').trim().toLowerCase()
    return sysRole === 'admin' || sysRole === 'accountant' || sysRole === 'manager' ||
           role === 'admin' || role === 'accountant' || role === 'manager'
  }

  const openClientInfo = (client) => {
    if (!canManageClients(profile)) return
    setViewingClient(client)
  }

  const openEditModal = (client) => {
    if (!canManageClients(profile)) return
    setViewingClient(null)
    const emails = client['Contact Email'] ? String(client['Contact Email']).split(',').map(e => e.trim()) : ['']
    const phones = client['Phone'] ? String(client['Phone']).split(',').map(p => p.trim()) : ['']
    const servicesStr = client['Services'] || client['services'] || ''
    const servicesList = servicesStr ? String(servicesStr).split(',').map(s => s.trim()) : []
    const linksRaw = client['Important Links'] || ''
    let linksList = []
    try {
      const parsed = linksRaw ? JSON.parse(linksRaw) : []
      linksList = Array.isArray(parsed) ? parsed.filter(l => l && (l.title || l.url)) : []
    } catch (e) {
      linksList = []
    }
    setEditingClient(client)
    setClientForm({
      projectName: client['Project Name'] || '',
      clientName: client['Client Name'] || client['Company Name'] || '',
      emails: emails.length > 0 && emails[0] ? emails : [''],
      phones: phones.length > 0 && phones[0] ? phones : [''],
      industry: client['Industry'] || '',
      services: servicesList,
      importantLinks: linksList
    })
  }

  const handleUpdateClient = async (e) => {
    e.preventDefault()
    if (!editingClient) return

    setIsSubmitting(true)
    try {
      const payload = {
        action: 'update_client',
        clientId: editingClient['Client ID'],
        projectName: clientForm.projectName.trim(),
        clientName: clientForm.clientName.trim(),
        contactEmail: clientForm.emails.filter(e => e.trim() !== '').join(', '),
        phone: clientForm.phones.filter(p => p.trim() !== '').join(', '),
        industry: clientForm.industry.trim(),
        services: clientForm.services.join(', '),
        importantLinks: JSON.stringify(clientForm.importantLinks.filter(l => (l.title || '').trim() || (l.url || '').trim())),
        userEmail: profile?.email
      }
      const data = await api.post(payload)
      if (data.ok) {
        await fetchClients()
        setEditingClient(null)
        if (mqttClient && mqttClient.connected) {
          setTimeout(() => {
            mqttClient.publish('dd_task_engine_v1/sync', JSON.stringify({ action: 'sync' }))
          }, 1000)
        }
      } else {
        addToast('Failed to update client: ' + (data.error || 'Unknown error'), 'error')
      }
    } catch (err) {
      addToast('Error updating client: ' + err.message, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleStatus = async (client, confirmed = false) => {
    const isActive = client['Is Active'] || client['isActive'] || client['is_active'] || client.isActive
    const newStatus = String(isActive).toLowerCase() === 'yes' ? 'No' : 'Yes'
    const nowIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/(\d{2})\/(\d{2})\/(\d{4}),/, '$3-$2-$1')

    // If deactivating and not yet confirmed, show confirmation popup
    if (newStatus === 'No' && !confirmed) {
      setConfirmDeactivateClient(client)
      return
    }

    setConfirmDeactivateClient(null)
    setIsUpdating(true)
    try {
      const data = await api.post({
        action: 'update_client',
        clientId: client['Client ID'],
        isActive: newStatus,
        userEmail: profile?.email
      })
      if (data.ok) {
        await fetchClients()
        // Update viewingClient state immediately
        setViewingClient(prev => {
          if (!prev || String(prev['Client ID']) !== String(client['Client ID'])) return prev
          return { ...prev, 'Is Active': newStatus, 'Project Completion Date': newStatus === 'No' ? nowIST : '', 'Project Completion date': newStatus === 'No' ? nowIST : '' }
        })
        if (mqttClient && mqttClient.connected) {
          setTimeout(() => {
            mqttClient.publish('dd_task_engine_v1/sync', JSON.stringify({ action: 'sync' }))
          }, 1000)
        }
      } else {
        addToast('Failed to update client status: ' + (data.error || 'Unknown error'), 'error')
      }
    } catch (err) {
      addToast('Error updating client status: ' + err.message, 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleAddClient = async (e) => {
    e.preventDefault()
    if (!newClientForm.projectName.trim()) {
      addToast('Project Name is required', 'error')
      return
    }
    setIsAdding(true)
    try {
      const data = await api.post({
        action: 'add_client',
        projectName: newClientForm.projectName.trim(),
        clientName: newClientForm.clientName.trim(),
        contactEmail: newClientForm.emails.filter(e => e.trim()).join(', '),
        phone: newClientForm.phones.filter(p => p.trim()).join(', '),
        projectStartDate: newClientForm.projectStartDate,
        industry: newClientForm.industry.trim(),
        services: newClientForm.services.join(', '),
        importantLinks: JSON.stringify(newClientForm.importantLinks.filter(l => (l.title || '').trim() || (l.url || '').trim())),
        userEmail: profile?.email
      })
      if (data.ok) {
        addToast('Client added successfully!', 'success')
        setShowNewClientModal(false)
        setNewClientForm({
          projectName: '', clientName: '', emails: [''], phones: [''], industry: '', services: [], importantLinks: [],
          projectStartDate: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/(\d{2})\/(\d{2})\/(\d{4}),/, '$3-$2-$1')
        })
        await fetchClients()
        if (mqttClient && mqttClient.connected) {
          setTimeout(() => {
            mqttClient.publish('dd_task_engine_v1/sync', JSON.stringify({ action: 'sync' }))
          }, 1000)
        }
      } else {
        addToast('Failed to add client: ' + (data.error || 'Unknown error'), 'error')
      }
    } catch (err) {
      addToast('Error adding client: ' + err.message, 'error')
    } finally {
      setIsAdding(false)
    }
  }

  const query = searchQuery.toLowerCase()
  const filteredClients = clients.filter(c => {
    return (
      String(c['Project Name'] || '').toLowerCase().includes(query) ||
      String(c['Client Name'] || c['Company Name'] || '').toLowerCase().includes(query) ||
      String(c['Contact Email'] || '').toLowerCase().includes(query) ||
      String(c['Client ID'] || '').toLowerCase().includes(query)
    )
  })

  return (
    <div className="bg-[#F0EDF8] font-['Inter',sans-serif] text-[#151c27] overflow-hidden h-screen flex">
      <Sidebar />
      <main className="page-main">
        <TopNav title="Clients" showSearch={false} />
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-5 pb-6 animate-fade-in-up">

          {/* Page Header Area */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
            <div>
              <h2 className="text-[28px] font-bold text-[#1E1B2E] mb-1 leading-tight">Clients</h2>
              <p className="text-[14px] text-[#6B7280] m-0">Manage client details and active status.</p>
            </div>

            <div className="flex items-center gap-4 w-full md:w-auto">
              {canManageClients(profile) && (
                <div
                  onMouseEnter={e => {
                    e.currentTarget.style.maxWidth = '300px';
                    e.currentTarget.style.gap = '8px';
                    e.currentTarget.style.padding = '0 20px 0 14px';
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(112,44,145,0.35)';
                    const text = e.currentTarget.querySelector('.add-client-text');
                    if (text) { text.style.maxWidth = '120px'; text.style.width = 'auto'; text.style.opacity = '1'; }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.maxWidth = '44px';
                    e.currentTarget.style.gap = '0';
                    e.currentTarget.style.padding = '0';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(91,33,182,0.06)';
                    const text = e.currentTarget.querySelector('.add-client-text');
                    if (text) { text.style.maxWidth = '0'; text.style.width = '0'; text.style.opacity = '0'; }
                  }}
                  onClick={() => {
                    setNewClientForm({
                      projectName: '', clientName: '', emails: [''], phones: [''], industry: '', services: [], importantLinks: [],
                      projectStartDate: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/(\d{2})\/(\d{2})\/(\d{4}),/, '$3-$2-$1')
                    })
                    setShowNewClientModal(true)
                  }}
                  title="Add Client"
                  style={{
                    height: 44, minWidth: 44, borderRadius: 999, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    maxWidth: 44,
                    background: 'linear-gradient(to right, #702c91, #ec008c)', color: 'white',
                    boxShadow: '0 2px 8px rgba(91,33,182,0.06)',
                    fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 700,
                    overflow: 'hidden', whiteSpace: 'nowrap', gap: 0,
                    transition: 'max-width 0.35s ease-out, padding 0.35s ease-out, gap 0.35s ease-out, box-shadow 0.3s ease-out',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20, flexShrink: 0 }}>add</span>
                  <span className="add-client-text" style={{ width: 0, maxWidth: 0, opacity: 0, overflow: 'hidden', transition: 'max-width 0.35s ease-out, opacity 0.2s ease-out', whiteSpace: 'nowrap' }}>Add Client</span>
                </div>
              )}

              <div className="relative flex-1 md:flex-none">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-[18px]">search</span>
                <input
                  type="text"
                  placeholder="Search clients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full md:w-[300px] h-[42px] pl-10 pr-4 rounded-full border border-[#E5E7EB] bg-white text-[13px] outline-none focus:border-[#702c91] focus:ring-1 focus:ring-[#702c91] transition-all shadow-sm"
                />
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-[12px] border border-[#E5E7EB] shadow-sm overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="block lg:table w-full text-left border-collapse min-w-full lg:min-w-[1000px]">
                <thead className="hidden lg:table-header-group">
                  <tr className="bg-[#F3F4F6] border-b border-[#E5E7EB]">
                    <th className="py-4 px-6 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Client ID</th>
                    <th className="py-4 px-6 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Project Name</th>
                    <th className="py-4 px-6 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Client Name</th>
                    <th className="py-4 px-6 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Client Email(s)</th>
                    <th className="py-4 px-6 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Phone</th>
                    <th className="py-4 px-6 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Industry</th>
                    <th className="py-4 px-6 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Project Start Date</th>
                  </tr>
                </thead>
                <tbody className="block lg:table-row-group divide-y lg:divide-none divide-[#E5E7EB]">
                  {filteredClients.map((client, idx) => {
                    return (
                      <tr
                        key={client['Client ID'] || idx}
                        className={`block lg:table-row bg-white border-b border-[#E5E7EB] lg:hover:bg-white lg:hover:scale-[1.01] lg:hover:shadow-[0_8px_24px_rgba(91,33,182,0.08)] transition-all duration-200 relative ${idx === filteredClients.length - 1 ? 'border-b-0' : ''}`}
                        style={{ cursor: 'pointer', zIndex: 1 }}
                      >
                        {/* Client ID */}
                        <td className="block lg:table-cell py-3 px-4 lg:py-4 lg:px-6 text-[13px] font-bold text-[#1E1B2E]">
                          <span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">Client ID:</span>
                          {client['Client ID']}
                        </td>
                        {/* Project Name */}
                        <td
                          className="block lg:table-cell py-2 px-4 lg:py-4 lg:px-6 text-[13px] font-bold text-[#702c91] cursor-pointer hover:underline"
                          onClick={() => {
                            if (canManageClients(profile)) openClientInfo(client)
                          }}
                        >
                          <span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">Project Name:</span>
                          {client['Project Name'] || client['Client Name'] || client['Company Name'] || '-'}
                        </td>
                        {/* Client Name */}
                        <td className="block lg:table-cell py-2 px-4 lg:py-4 lg:px-6 text-[13px] text-[#4B5563]">
                          <span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">Client Name:</span>
                          {client['Project Name'] ? (client['Client Name'] || client['Company Name'] || client['Contact Person'] || '-') : (client['Contact Person'] || '-')}
                        </td>
                        {/* Client Email(s) */}
                        <td className="block lg:table-cell py-2 px-4 lg:py-4 lg:px-6 text-[13px] text-[#6B7280]">
                          <span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">Email(s):</span>
                          {client['Contact Email'] || client['Email'] || '-'}
                        </td>
                        {/* Phone */}
                        <td className="block lg:table-cell py-2 px-4 lg:py-4 lg:px-6 text-[13px] text-[#6B7280]">
                          <span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">Phone:</span>
                          {client['Phone'] || '-'}
                        </td>
                        {/* Industry */}
                        <td className="block lg:table-cell py-2 px-4 lg:py-4 lg:px-6 text-[13px] text-[#6B7280]">
                          <span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">Industry:</span>
                          {client['Industry'] || '-'}
                        </td>
                        {/* Project Start Date */}
                        <td className="block lg:table-cell py-2 px-4 pb-4 lg:py-4 lg:px-6 text-[13px] text-[#4B5563]">
                          <span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">Start Date:</span>
                          {safeDate(client['Project start Date'])}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredClients.length === 0 && (
                    <tr className="block lg:table-row">
                      <td colSpan="7" className="block lg:table-cell py-12 text-center text-[#6B7280]">
                        <div className="flex flex-col items-center justify-center">
                          <span className="material-symbols-outlined text-[48px] text-gray-300 mb-3">search_off</span>
                          <p className="text-[14px] font-medium m-0">No clients found matching your criteria.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Client Info Modal (click on row) */}
      {viewingClient && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-[420px] rounded-2xl shadow-2xl p-6 flex flex-col gap-6 animate-scale-in">
            <div className="flex items-center justify-between border-b border-gray-200 pb-4">
              <h2 className="text-[18px] font-bold text-[#702c91] flex items-center gap-2 m-0">
                <span className="material-symbols-outlined text-[20px]">business</span>
                {viewingClient['Project Name'] || 'Client'}
              </h2>
              <button
                type="button"
                onClick={() => setViewingClient(null)}
                className="text-gray-400 hover:text-gray-700 transition-colors bg-transparent border-none cursor-pointer p-1 flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-5">
              {/* Client Name */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">CLIENT NAME</label>
                <p className="text-[16px] font-bold text-[#1E1B2E] m-0">{viewingClient['Client Name'] || viewingClient['Company Name'] || '-'}</p>
              </div>

              {/* Project start Date */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">PROJECT START DATE</label>
                <p className="text-[14px] text-[#4B5563] m-0 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-[#9CA3AF]">calendar_today</span>
                  {safeDate(viewingClient['Project start Date'])}
                </p>
              </div>

              {/* Active Status */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">ACTIVE STATUS</label>
                <div className="flex items-center gap-3">
                  <div
                    className={`relative inline-block w-11 h-6 align-middle select-none transition duration-200 ease-in cursor-pointer ${(isUpdating || !canManageClients(profile)) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => { if (!isUpdating && canManageClients(profile)) handleToggleStatus(viewingClient) }}
                  >
                    <div className={`absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none transition-transform duration-300 ease-in-out z-10 ${(() => { const v = viewingClient['Is Active'] || viewingClient['isActive'] || viewingClient['is_active'] || viewingClient.isActive; return String(v).toLowerCase() === 'yes' || v === true ? 'translate-x-5 border-[#10B981]' : 'translate-x-0 border-gray-300' })()}`} />
                    <div className={`block overflow-hidden h-6 rounded-full transition-colors duration-300 ease-in-out ${(() => { const v = viewingClient['Is Active'] || viewingClient['isActive'] || viewingClient['is_active'] || viewingClient.isActive; return String(v).toLowerCase() === 'yes' || v === true ? 'bg-[#10B981]' : 'bg-gray-300' })()}`} />
                  </div>
                  <span className={`text-[12px] font-bold ${(() => { const v = viewingClient['Is Active'] || viewingClient['isActive'] || viewingClient['is_active'] || viewingClient.isActive; return String(v).toLowerCase() === 'yes' || v === true ? 'text-[#10B981]' : 'text-gray-400' })()}`}>
                    {(() => { const v = viewingClient['Is Active'] || viewingClient['isActive'] || viewingClient['is_active'] || viewingClient.isActive; return String(v).toLowerCase() === 'yes' || v === true ? 'Active' : 'Inactive' })()}
                  </span>
                </div>
              </div>

              {/* Project Completion Date (shown if set) */}
              {(viewingClient['Project Completion Date'] || viewingClient['Project Completion date']) && (
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">PROJECT COMPLETION DATE</label>
                  <p className="text-[14px] text-[#EF4444] m-0 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">event_busy</span>
                    {safeDate(viewingClient['Project Completion Date'] || viewingClient['Project Completion date'])}
                  </p>
                </div>
              )}

              {/* Drive Folder Link (shown if set) */}
              {(viewingClient['Drive Folder Link'] || viewingClient['Drive folder link']) && (
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">DRIVE FOLDER</label>
                  <a
                    href={viewingClient['Drive Folder Link'] || viewingClient['Drive folder link']}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[14px] text-[#702c91] hover:underline font-medium m-0 flex items-center gap-2 w-fit"
                  >
                    <span className="material-symbols-outlined text-[18px]">folder_open</span>
                    Open Project Folder
                  </a>
                </div>
              )}

              {/* Important Links (shown if set) */}
              {(() => {
                let links = []
                const raw = viewingClient['Important Links']
                try {
                  const parsed = raw ? JSON.parse(raw) : []
                  links = Array.isArray(parsed) ? parsed.filter(l => l && (l.title || l.url)) : []
                } catch (e) {
                  links = []
                }
                return links.length > 0 ? (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">IMPORTANT LINKS</label>
                    <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                      {links.map((link, idx) => (
                        <a
                          key={idx}
                          href={link.url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[13px] text-[#702c91] hover:underline font-medium m-0 flex items-center gap-2 w-fit"
                        >
                          <span className="material-symbols-outlined text-[16px]">link</span>
                          {link.title || link.url}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null
              })()}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => {
                  openEditModal(viewingClient)
                }}
                className="px-5 py-2 btn-gradient border-none rounded-lg font-bold shadow-md text-[13px] cursor-pointer flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[16px]">edit_square</span>
                Edit Full Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Client Modal */}
      {showNewClientModal && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleAddClient}
            className="bg-white w-full max-w-[520px] rounded-2xl shadow-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-hidden animate-scale-in"
          >
            <div className="flex items-center justify-between border-b border-gray-200 pb-4">
              <h2 className="text-[18px] font-bold text-[#702c91] flex items-center gap-2 m-0">
                <span className="material-symbols-outlined text-[20px]">domain_add</span>
                Add New Client
              </h2>
              <button
                type="button"
                onClick={() => setShowNewClientModal(false)}
                className="text-gray-400 hover:text-gray-700 transition-colors bg-transparent border-none cursor-pointer p-1 flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-5 pr-2">
              <div>
                <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1.5">PROJECT NAME *</label>
                <input
                  type="text"
                  required
                  value={newClientForm.projectName}
                  onChange={e => setNewClientForm({ ...newClientForm, projectName: e.target.value })}
                  placeholder="e.g. Dreamsdesign Redesign"
                  className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-[14px] text-gray-800 outline-none focus:border-[#702c91] transition-colors shadow-sm placeholder:text-gray-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1.5">CLIENT NAME</label>
                <input
                  type="text"
                  value={newClientForm.clientName}
                  onChange={e => setNewClientForm({ ...newClientForm, clientName: e.target.value })}
                  placeholder="e.g. Dreamsdesign"
                  className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-[14px] text-gray-800 outline-none focus:border-[#702c91] transition-colors shadow-sm placeholder:text-gray-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1.5">PROJECT START DATE</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="date"
                      value={newClientForm.projectStartDate ? newClientForm.projectStartDate.split(' ')[0] : ''}
                      onChange={e => {
                        const dateVal = e.target.value
                        const timePart = newClientForm.projectStartDate && newClientForm.projectStartDate.includes(' ') ? newClientForm.projectStartDate.split(' ')[1] : '00:00:00'
                        setNewClientForm({ ...newClientForm, projectStartDate: dateVal ? `${dateVal} ${timePart}` : '' })
                      }}
                      className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-[14px] text-gray-800 outline-none focus:border-[#702c91] transition-colors shadow-sm [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none flex items-center gap-1 text-[13px]">
                      <span className="material-symbols-outlined text-[18px]">calendar_today</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date()
                      const todayStr = now.toLocaleDateString('en-CA')
                      const timePart = newClientForm.projectStartDate && newClientForm.projectStartDate.includes(' ') ? newClientForm.projectStartDate.split(' ')[1] : now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                      setNewClientForm({ ...newClientForm, projectStartDate: `${todayStr} ${timePart}` })
                    }}
                    className="px-3 py-2.5 text-[12px] font-bold text-[#702c91] bg-[#702c91]/10 border border-[#702c91]/20 rounded-lg hover:bg-[#702c91]/20 transition-colors whitespace-nowrap flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">today</span>
                    Today
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider">CLIENT EMAIL(S)</label>
                  <button
                    type="button"
                    onClick={() => setNewClientForm({ ...newClientForm, emails: [...newClientForm.emails, ''] })}
                    className="bg-transparent border-none text-[#702c91] cursor-pointer hover:bg-purple-50 p-0.5 rounded flex items-center transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                  </button>
                </div>
                <div className="space-y-2">
                  {newClientForm.emails.map((email, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="email"
                        value={email}
                        onChange={e => {
                          const n = [...newClientForm.emails]
                          n[idx] = e.target.value
                          setNewClientForm({ ...newClientForm, emails: n })
                        }}
                        placeholder="e.g. client@example.com"
                        className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-[14px] text-gray-800 outline-none focus:border-[#702c91] transition-colors shadow-sm placeholder:text-gray-400"
                      />
                      {newClientForm.emails.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setNewClientForm({ ...newClientForm, emails: newClientForm.emails.filter((_, i) => i !== idx) })}
                          className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md px-2.5 flex items-center border border-gray-200 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider">CLIENT PHONE(S)</label>
                  <button
                    type="button"
                    onClick={() => setNewClientForm({ ...newClientForm, phones: [...newClientForm.phones, ''] })}
                    className="bg-transparent border-none text-[#702c91] cursor-pointer hover:bg-purple-50 p-0.5 rounded flex items-center transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                  </button>
                </div>
                <div className="space-y-2">
                  {newClientForm.phones.map((phone, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        value={phone}
                        onChange={e => {
                          const n = [...newClientForm.phones]
                          n[idx] = e.target.value
                          setNewClientForm({ ...newClientForm, phones: n })
                        }}
                        placeholder="+91 98000 00000"
                        className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-[14px] text-gray-800 outline-none focus:border-[#702c91] transition-colors shadow-sm placeholder:text-gray-400"
                      />
                      {newClientForm.phones.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setNewClientForm({ ...newClientForm, phones: newClientForm.phones.filter((_, i) => i !== idx) })}
                          className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md px-2.5 flex items-center border border-gray-200 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1.5">INDUSTRY</label>
                <input
                  type="text"
                  value={newClientForm.industry}
                  onChange={e => setNewClientForm({ ...newClientForm, industry: e.target.value })}
                  placeholder="e.g. Technology"
                  className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-[14px] text-gray-800 outline-none focus:border-[#702c91] transition-colors shadow-sm placeholder:text-gray-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1.5">SERVICES</label>
                <div className="bg-white border border-gray-200 rounded-lg p-4 max-h-[160px] overflow-y-auto custom-scrollbar flex flex-col gap-3 shadow-sm">
                  {AVAILABLE_SERVICES.map(service => (
                    <label key={service} className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={newClientForm.services.includes(service)}
                        onChange={e => setNewClientForm(prev => ({ ...prev, services: e.target.checked ? [...prev.services, service] : prev.services.filter(s => s !== service) }))}
                        className="w-4 h-4 cursor-pointer accent-[#702c91] border-gray-300 rounded shrink-0"
                      />
                      <span className="text-[14px] text-gray-600 group-hover:text-gray-900 transition-colors select-none">{service}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider">IMPORTANT LINKS (OPTIONAL)</label>
                  <button
                    type="button"
                    onClick={() => setNewClientForm({ ...newClientForm, importantLinks: [...newClientForm.importantLinks, { title: '', url: '' }] })}
                    className="bg-transparent border-none text-[#702c91] cursor-pointer hover:bg-purple-50 p-0.5 rounded flex items-center transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">add_link</span>
                  </button>
                </div>
                <div className="space-y-2 max-h-[180px] overflow-y-auto custom-scrollbar pr-1 p-0.5">
                  {newClientForm.importantLinks.map((link, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={link.title}
                        onChange={e => {
                          const n = [...newClientForm.importantLinks]
                          n[idx] = { ...n[idx], title: e.target.value }
                          setNewClientForm({ ...newClientForm, importantLinks: n })
                        }}
                        placeholder="Title e.g. Client Drive"
                        className="w-full md:w-[40%] bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-[14px] text-gray-800 outline-none focus:border-[#702c91] transition-colors shadow-sm placeholder:text-gray-400"
                      />
                      <input
                        type="url"
                        value={link.url}
                        onChange={e => {
                          const n = [...newClientForm.importantLinks]
                          n[idx] = { ...n[idx], url: e.target.value }
                          setNewClientForm({ ...newClientForm, importantLinks: n })
                        }}
                        placeholder="https://example.com"
                        className="w-full flex-1 bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-[14px] text-gray-800 outline-none focus:border-[#702c91] transition-colors shadow-sm placeholder:text-gray-400"
                      />
                      {newClientForm.importantLinks.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setNewClientForm({ ...newClientForm, importantLinks: newClientForm.importantLinks.filter((_, i) => i !== idx) })}
                          className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md px-2.5 flex items-center border border-gray-200 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowNewClientModal(false)}
                className="px-6 py-2 border border-[#702c91] text-[#702c91] bg-white rounded-lg font-bold hover:bg-purple-50 transition-all text-[13px] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isAdding}
                className="px-6 py-2 btn-gradient border-none rounded-lg font-bold shadow-md text-[13px] cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {isAdding ? (
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[18px]">save</span>
                )}
                Save Client
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Client Modal */}
      {/* Edit Client Modal */}
      {editingClient && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleUpdateClient}
            className="bg-white w-full max-w-[480px] rounded-2xl shadow-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto custom-scrollbar animate-scale-in"
          >
            <div className="flex justify-between items-center border-b border-gray-200 pb-4">
              <h2 className="text-[18px] font-bold text-[#702c91] flex items-center gap-2 m-0">
                <span className="material-symbols-outlined text-[20px]">edit_square</span>
                Update Client Profile
              </h2>
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="text-gray-400 hover:text-gray-700 transition-colors bg-transparent border-none cursor-pointer p-1 flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Project Name *</label>
              <input
                type="text"
                required
                value={clientForm.projectName}
                onChange={e => setClientForm({ ...clientForm, projectName: e.target.value })}
                className="w-full bg-[#f4f3f7] border border-gray-200 rounded-md px-3 py-2.5 text-[13px] text-gray-800 focus:border-[#702c91] focus:bg-white outline-none transition-colors shadow-sm"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Client Name</label>
              <input
                type="text"
                value={clientForm.clientName}
                onChange={e => setClientForm({ ...clientForm, clientName: e.target.value })}
                className="w-full bg-[#f4f3f7] border border-gray-200 rounded-md px-3 py-2.5 text-[13px] text-gray-800 focus:border-[#702c91] focus:bg-white outline-none transition-colors shadow-sm"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Client Email(s)</label>
                <button
                  type="button"
                  onClick={() => setClientForm({ ...clientForm, emails: [...clientForm.emails, ''] })}
                  className="text-[#702c91] hover:bg-purple-50 rounded-full p-0.5 flex items-center transition-colors bg-transparent border-none cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                </button>
              </div>
              <div className="space-y-2">
                {clientForm.emails.map((email, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="email"
                      value={email}
                      onChange={e => {
                        const newEmails = [...clientForm.emails]
                        newEmails[idx] = e.target.value
                        setClientForm({ ...clientForm, emails: newEmails })
                      }}
                      className="w-full bg-[#f4f3f7] border border-gray-200 rounded-md px-3 py-2.5 text-[13px] text-gray-800 focus:border-[#702c91] focus:bg-white outline-none transition-colors shadow-sm"
                    />
                    {clientForm.emails.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newEmails = clientForm.emails.filter((_, i) => i !== idx)
                          setClientForm({ ...clientForm, emails: newEmails })
                        }}
                        className="text-red-500 hover:bg-red-50 rounded-md px-2 flex items-center transition-colors bg-transparent border-none cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[20px]">remove</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Client Phone(s)</label>
                <button
                  type="button"
                  onClick={() => setClientForm({ ...clientForm, phones: [...clientForm.phones, ''] })}
                  className="text-[#702c91] hover:bg-purple-50 rounded-full p-0.5 flex items-center transition-colors bg-transparent border-none cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                </button>
              </div>
              <div className="space-y-2">
                {clientForm.phones.map((phone, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      value={phone}
                      onChange={e => {
                        const newPhones = [...clientForm.phones]
                        newPhones[idx] = e.target.value
                        setClientForm({ ...clientForm, phones: newPhones })
                      }}
                      className="w-full bg-[#f4f3f7] border border-gray-200 rounded-md px-3 py-2.5 text-[13px] text-gray-800 focus:border-[#702c91] focus:bg-white outline-none transition-colors shadow-sm"
                    />
                    {clientForm.phones.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newPhones = clientForm.phones.filter((_, i) => i !== idx)
                          setClientForm({ ...clientForm, phones: newPhones })
                        }}
                        className="text-red-500 hover:bg-red-50 rounded-md px-2 flex items-center transition-colors bg-transparent border-none cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[20px]">remove</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Industry</label>
              <input
                type="text"
                value={clientForm.industry}
                onChange={e => setClientForm({ ...clientForm, industry: e.target.value })}
                className="w-full bg-[#f4f3f7] border border-gray-200 rounded-md px-3 py-2.5 text-[13px] text-gray-800 focus:border-[#702c91] focus:bg-white outline-none transition-colors shadow-sm"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Services</label>
              <div className="bg-[#f4f3f7] border border-gray-200 rounded-md px-3 py-2.5 text-[13px] text-gray-700 max-h-[160px] overflow-y-auto custom-scrollbar flex flex-col gap-3 shadow-inner">
                {AVAILABLE_SERVICES.map(service => (
                  <label key={service} className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={clientForm.services.includes(service)}
                      onChange={e => {
                        const isChecked = e.target.checked
                        setClientForm(prev => ({
                          ...prev,
                          services: isChecked
                            ? [...prev.services, service]
                            : prev.services.filter(s => s !== service)
                        }))
                      }}
                      className="w-4 h-4 cursor-pointer accent-[#702c91]"
                    />
                    <span className="text-[13px] group-hover:text-[#702c91] transition-colors">{service}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Important Links (Optional)</label>
                <button
                  type="button"
                  onClick={() => setClientForm({ ...clientForm, importantLinks: [...clientForm.importantLinks, { title: '', url: '' }] })}
                  className="text-[#702c91] hover:bg-purple-50 rounded-full p-0.5 flex items-center transition-colors bg-transparent border-none cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">add_link</span>
                </button>
              </div>
              <div className="space-y-2 max-h-[180px] overflow-y-auto custom-scrollbar pr-1 p-0.5">
                {clientForm.importantLinks.map((link, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={link.title}
                      onChange={e => {
                        const n = [...clientForm.importantLinks]
                        n[idx] = { ...n[idx], title: e.target.value }
                        setClientForm({ ...clientForm, importantLinks: n })
                      }}
                      placeholder="Title e.g. Client Drive"
                      className="w-full md:w-[40%] bg-[#f4f3f7] border border-gray-200 rounded-md px-3 py-2.5 text-[13px] text-gray-800 focus:border-[#702c91] focus:bg-white outline-none transition-colors shadow-sm"
                    />
                    <input
                      type="url"
                      value={link.url}
                      onChange={e => {
                        const n = [...clientForm.importantLinks]
                        n[idx] = { ...n[idx], url: e.target.value }
                        setClientForm({ ...clientForm, importantLinks: n })
                      }}
                      placeholder="https://example.com"
                      className="w-full flex-1 bg-[#f4f3f7] border border-gray-200 rounded-md px-3 py-2.5 text-[13px] text-gray-800 focus:border-[#702c91] focus:bg-white outline-none transition-colors shadow-sm"
                    />
                    {clientForm.importantLinks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setClientForm({ ...clientForm, importantLinks: clientForm.importantLinks.filter((_, i) => i !== idx) })}
                        className="text-red-500 hover:bg-red-50 rounded-md px-2 flex items-center transition-colors bg-transparent border-none cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[20px]">remove</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end items-center gap-4 mt-2 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="text-[14px] text-gray-500 hover:text-gray-700 font-medium transition-colors bg-transparent border-none cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-lg btn-gradient border-none font-bold shadow-sm active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[18px]">save</span>
                )}
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Deactivate Confirmation Modal */}
      {confirmDeactivateClient && (
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-[400px] rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-5 animate-scale-in">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-[28px] text-red-500">warning</span>
            </div>
            <div className="text-center">
              <h2 className="text-[18px] font-bold text-[#1E1B2E] mb-2 m-0">Deactivate Client?</h2>
              <p className="text-[14px] text-gray-500 m-0">
                Are you sure you want to deactivate <strong className="text-[#1E1B2E]">{confirmDeactivateClient['Project Name'] || 'this client'}</strong>?
                This will mark the project as inactive and set the completion date to today.
              </p>
            </div>
            <div className="flex justify-center gap-3 w-full pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeactivateClient(null)}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-600 bg-white rounded-lg font-bold hover:bg-gray-50 transition-colors text-[13px] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleToggleStatus(confirmDeactivateClient, true)}
                disabled={isUpdating}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white border-none rounded-lg font-bold hover:bg-red-600 transition-colors text-[13px] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isUpdating ? (
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[18px]">block</span>
                )}
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

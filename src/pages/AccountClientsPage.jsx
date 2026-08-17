import { useState } from 'react'
import Sidebar from '../components/Sidebar'
import TopNav from '../components/TopNav'
import { useApp } from '../context/AppContext'
import { formatDateShort } from '../utils/dateFormat'

const safeDate = (val) => val ? formatDateShort(val) : '-'

const RECURRING_OPTIONS = ['Monthly', 'Quarterly', 'Half Yearly', 'Yearly']

const GST_FIXED_PCT = 18

const emptyPaymentForm = {
  gstType: '',
  recurring: '',
  recurringType: '',
  totalCost: '',
}

const emptyRecordForm = {
  amount: '',
  date: '',
  note: '',
}

export default function AccountClientsPage() {
  const { clients, payments, profile, updatePayment, addToast } = useApp()
  const [searchQuery, setSearchQuery] = useState('')
  const [viewingClient, setViewingClient] = useState(null)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [showRecordForm, setShowRecordForm] = useState(false)
  const [paymentForm, setPaymentForm] = useState({ ...emptyPaymentForm })
  const [recordForm, setRecordForm] = useState({
    ...emptyRecordForm,
    date: new Date().toLocaleDateString('en-CA'),
  })
  const [saving, setSaving] = useState(false)

  const role = String(profile?.systemRole || '').trim().toLowerCase()
  const canEditPayment = role === 'admin' || role === 'accountant'

  const query = searchQuery.toLowerCase()
  const filteredClients = clients.filter(c => {
    const isActive = String(c['Is Active'] || c['isActive'] || c['is_active'] || '').toLowerCase() === 'yes'
    if (!isActive) return false
    return (
      String(c['Project Name'] || '').toLowerCase().includes(query) ||
      String(c['Client Name'] || c['Company Name'] || '').toLowerCase().includes(query) ||
      String(c['Contact Email'] || '').toLowerCase().includes(query) ||
      String(c['Client ID'] || '').toLowerCase().includes(query) ||
      String(c['Industry'] || '').toLowerCase().includes(query)
    )
  })

  const getAllPayments = (clientId) => payments.filter(p => String(p['CLIENT ID']).trim() === String(clientId).trim())

  const getPayment = (clientId) => {
    const all = getAllPayments(clientId)
    return all.length > 0 ? all[all.length - 1] : null
  }

  const hasPaymentDetails = (payment) => {
    if (!payment) return false
    const cost = parseFloat(payment['TOTAL COST']) || 0
    return !!(payment['GST/NON GST'] && cost > 0)
  }

  const openPaymentFormForClient = (clientObj) => {
    const targetClient = clientObj || viewingClient
    if (!targetClient) return
    const existing = getPayment(targetClient['Client ID'])
    setPaymentForm({
      gstType: existing?.['GST/NON GST'] || '',
      recurring: existing?.['RECURRING'] || '',
      recurringType: existing?.['RECURRING TYPE'] || '',
      totalCost: existing?.['TOTAL COST'] || '',
    })
    setShowPaymentForm(true)
  }

  const openRecordFormForClient = (clientObj) => {
    const targetClient = clientObj || viewingClient
    if (!targetClient) return
    const existing = getPayment(targetClient['Client ID'])
    if (!hasPaymentDetails(existing)) {
      addToast?.('Please set payment details (GST & Project Cost) first', 'warning')
      openPaymentFormForClient(targetClient)
      return
    }
    setRecordForm({
      amount: '',
      date: new Date().toLocaleDateString('en-CA'),
      note: '',
    })
    setShowRecordForm(true)
  }

  const calcTotalWithGst = () => {
    const cost = parseFloat(paymentForm.totalCost) || 0
    const gstAmt = paymentForm.gstType === 'GST' ? Math.round(cost * GST_FIXED_PCT / 100) : 0
    return cost + gstAmt
  }

  const calcGstAmount = () => {
    const cost = parseFloat(paymentForm.totalCost) || 0
    return paymentForm.gstType === 'GST' ? Math.round(cost * GST_FIXED_PCT / 100) : 0
  }

  const handleSavePayment = async () => {
    if (!viewingClient) return
    if (!paymentForm.totalCost || parseFloat(paymentForm.totalCost) <= 0) {
      addToast?.('Please enter a valid project cost', 'warning')
      return
    }
    setSaving(true)
    const success = await updatePayment({
      action: 'update_payment',
      clientId: viewingClient['Client ID'],
      projectName: viewingClient['Project Name'] || '',
      clientName: viewingClient['Client Name'] || viewingClient['Company Name'] || '',
      emails: viewingClient['Contact Email'] || '',
      phone: viewingClient['Phone'] || '',
      projectStartDate: viewingClient['Project start Date'] || '',
      industry: viewingClient['Industry'] || '',
      services: viewingClient['Services'] || '',
      projectEndDate: viewingClient['Project Completion Date'] || viewingClient['Project Completion date'] || '',
      'GST/NON GST': paymentForm.gstType || 'Non-GST',
      'GST AMOUNT (NEW)': calcGstAmount() || '',
      'GST (%)': paymentForm.gstType === 'GST' ? GST_FIXED_PCT : '',
      'RECURRING': paymentForm.recurring || 'No',
      'RECURRING TYPE': paymentForm.recurring === 'Yes' ? paymentForm.recurringType : '',
      'TOTAL COST': paymentForm.totalCost,
    })
    setSaving(false)
    if (success) {
      addToast?.('Payment details saved successfully', 'success')
      setShowPaymentForm(false)
    } else {
      addToast?.('Failed to save payment details', 'error')
    }
  }

  const handleSaveRecord = async () => {
    if (!viewingClient) return
    if (!recordForm.amount || parseFloat(recordForm.amount) <= 0) {
      addToast?.('Please enter a valid payment amount', 'warning')
      return
    }
    setSaving(true)
    const existing = getPayment(viewingClient['Client ID'])
    const allPays = getAllPayments(viewingClient['Client ID'])
    const totalCost = parseFloat(existing?.['TOTAL COST']) || 0
    const gstAmt = existing?.['GST/NON GST'] === 'GST' ? (parseFloat(existing?.['GST AMOUNT (NEW)']) || Math.round(totalCost * 0.18)) : 0
    const totalWithGst = totalCost + gstAmt
    const totalPaidBefore = allPays.reduce((sum, p) => sum + (parseFloat(p['PAYMENT AMOUNT']) || 0), 0)
    const payAmount = parseFloat(recordForm.amount) || 0
    const newPending = Math.max(0, totalWithGst - totalPaidBefore - payAmount)
    const success = await updatePayment({
      action: 'record_payment',
      clientId: viewingClient['Client ID'],
      amount: recordForm.amount,
      date: recordForm.date,
      note: recordForm.note,
      pendingAmount: String(newPending),
    })
    setSaving(false)
    if (success) {
      addToast?.('Payment recorded successfully', 'success')
      setShowRecordForm(false)
    } else {
      addToast?.('Failed to record payment', 'error')
    }
  }

  const viewingPayment = viewingClient ? getPayment(viewingClient['Client ID']) : null

  return (
    <div className="bg-[#F0EDF8] font-['Inter',sans-serif] text-[#151c27] overflow-hidden h-screen flex">
      <Sidebar />
      <main className="page-main">
        <TopNav title="Account Clients" showSearch={false} />
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-5 pb-6 animate-fade-in-up">

          {/* Page Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
            <div>
              <h2 className="text-[28px] font-bold text-[#1E1B2E] mb-1 leading-tight">Account Clients</h2>
              <p className="text-[14px] text-[#6B7280] m-0">Active client financial ledger and recurring payment tracking.</p>
            </div>

            <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-full px-4 py-2 shadow-sm">
                <span className="material-symbols-outlined text-[18px] text-[#9CA3AF]">analytics</span>
                <span className="text-[13px] font-bold text-[#702c91]">{filteredClients.length}</span>
                <span className="text-[13px] text-[#6B7280]">active</span>
              </div>

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

          {/* Client Table */}
          <div className="bg-white rounded-[12px] border border-[#E5E7EB] shadow-sm overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="block lg:table w-full text-left border-collapse min-w-full lg:min-w-[950px]">
                <thead className="hidden lg:table-header-group">
                  <tr className="bg-[#F3F4F6] border-b border-[#E5E7EB]">
                    <th className="py-4 px-6 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Client ID</th>
                    <th className="py-4 px-6 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Project Name</th>
                    <th className="py-4 px-6 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Client Name</th>
                    <th className="py-4 px-6 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Payment Status</th>
                    <th className="py-4 px-6 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Services</th>
                    <th className="py-4 px-6 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Start Date</th>
                    {canEditPayment && <th className="py-4 px-6 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="block lg:table-row-group divide-y lg:divide-none divide-[#E5E7EB]">
                  {filteredClients.map((client, idx) => {
                    const existingPay = getPayment(client['Client ID'])
                    const isConfigured = hasPaymentDetails(existingPay)
                    return (
                      <tr
                        key={client['Client ID'] || idx}
                        onClick={() => { setViewingClient(client); setShowPaymentForm(false); setShowRecordForm(false) }}
                        className={`block lg:table-row bg-white border-b border-[#E5E7EB] lg:hover:bg-white lg:hover:scale-[1.005] lg:hover:shadow-[0_4px_20px_rgba(91,33,182,0.06)] transition-all duration-200 cursor-pointer ${idx === filteredClients.length - 1 ? 'border-b-0' : ''}`}
                      >
                        <td className="block lg:table-cell py-3 px-4 lg:py-4 lg:px-6 text-[13px] font-bold text-[#1E1B2E]">
                          <span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">ID:</span>
                          {client['Client ID']}
                        </td>
                        <td className="block lg:table-cell py-2 px-4 lg:py-4 lg:px-6 text-[13px] font-bold text-[#702c91]">
                          <span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">Project:</span>
                          {client['Project Name'] || '-'}
                        </td>
                        <td className="block lg:table-cell py-2 px-4 lg:py-4 lg:px-6 text-[13px] text-[#4B5563]">
                          <span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">Client:</span>
                          {client['Client Name'] || client['Company Name'] || '-'}
                        </td>
                        <td className="block lg:table-cell py-2 px-4 lg:py-4 lg:px-6 text-[13px]">
                          <span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">Status:</span>
                          {isConfigured ? (
                            <span className="inline-flex items-center gap-1 bg-purple-50 text-[#702c91] border border-purple-200 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                              <span className="material-symbols-outlined text-[14px]">check_circle</span>
                              Configured
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                              <span className="material-symbols-outlined text-[14px]">warning</span>
                              Details Needed
                            </span>
                          )}
                        </td>
                        <td className="block lg:table-cell py-2 px-4 lg:py-4 lg:px-6 text-[13px] text-[#6B7280]">
                          <span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">Services:</span>
                          {client['Services'] ? (
                            <div className="flex flex-wrap gap-1">
                              {String(client['Services']).split(',').slice(0, 2).map((s, i) => (
                                <span key={i} className="bg-purple-50 text-purple-700 border border-purple-100 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  {s.trim()}
                                </span>
                              ))}
                              {String(client['Services']).split(',').length > 2 && (
                                <span className="text-[10px] text-gray-400">+{String(client['Services']).split(',').length - 2}</span>
                              )}
                            </div>
                          ) : '-'}
                        </td>
                        <td className="block lg:table-cell py-2 px-4 pb-4 lg:py-4 lg:px-6 text-[13px] text-[#4B5563]">
                          <span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">Start:</span>
                          {safeDate(client['Project start Date'])}
                        </td>
                        {canEditPayment && (
                          <td className="block lg:table-cell py-2 px-4 pb-4 lg:py-4 lg:px-6 text-[13px] text-right">
                            {isConfigured ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); setViewingClient(client); openRecordFormForClient(client) }}
                                className="h-[32px] px-3 rounded-lg bg-[#702c91] hover:bg-[#5c2280] text-white text-[11px] font-bold cursor-pointer transition-all border-none inline-flex items-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[14px]">payments</span>
                                Add Payment
                              </button>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setViewingClient(client); openPaymentFormForClient(client) }}
                                className="h-[32px] px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold cursor-pointer transition-all border-none inline-flex items-center gap-1 shadow-sm"
                              >
                                <span className="material-symbols-outlined text-[14px]">edit_note</span>
                                Set Payment Details
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                  {filteredClients.length === 0 && (
                    <tr className="block lg:table-row">
                      <td colSpan={canEditPayment ? 7 : 6} className="block lg:table-cell py-12 text-center text-[#6B7280]">
                        <div className="flex flex-col items-center justify-center">
                          <span className="material-symbols-outlined text-[48px] text-gray-300 mb-3">search_off</span>
                          <p className="text-[14px] font-medium m-0">No active clients found.</p>
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

      {/* Client Info & Financial Ledger Modal */}
      {viewingClient && !showPaymentForm && !showRecordForm && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-[520px] max-h-[85vh] rounded-2xl shadow-2xl flex flex-col animate-scale-in">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 shrink-0">
              <h2 className="text-[18px] font-bold text-[#702c91] flex items-center gap-2 m-0">
                <span className="material-symbols-outlined text-[20px]">business</span>
                {viewingClient['Project Name'] || 'Client'}
              </h2>
              <button
                onClick={() => setViewingClient(null)}
                className="text-gray-400 hover:text-gray-700 transition-colors bg-transparent border-none cursor-pointer p-1 flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5">
              <div className="flex flex-col gap-5">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Client Name</label>
                  <p className="text-[16px] font-bold text-[#1E1B2E] m-0">{viewingClient['Client Name'] || viewingClient['Company Name'] || '-'}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Industry</label>
                    <p className="text-[14px] text-[#4B5563] m-0">{viewingClient['Industry'] || '-'}</p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Project Start Date</label>
                    <p className="text-[14px] text-[#4B5563] m-0 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-[#9CA3AF]">calendar_today</span>
                      {safeDate(viewingClient['Project start Date'])}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Services</label>
                  <div className="flex flex-wrap gap-1.5">
                    {viewingClient['Services'] ? String(viewingClient['Services']).split(',').map((s, i) => (
                      <span key={i} className="bg-purple-50 text-purple-700 border border-purple-100 text-[11px] font-bold px-2.5 py-1 rounded-full">{s.trim()}</span>
                    )) : <p className="text-[14px] text-gray-400 m-0">-</p>}
                  </div>
                </div>

                {(viewingClient['Project Completion Date'] || viewingClient['Project Completion date']) && (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Completion Date</label>
                    <p className="text-[14px] text-[#EF4444] m-0 flex items-center gap-1.5 font-medium">
                      <span className="material-symbols-outlined text-[16px]">event_busy</span>
                      {safeDate(viewingClient['Project Completion Date'] || viewingClient['Project Completion date'])}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Contact Email</label>
                    <p className="text-[13px] text-[#4B5563] m-0 truncate">{viewingClient['Contact Email'] || '-'}</p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Phone</label>
                    <p className="text-[13px] text-[#4B5563] m-0">{viewingClient['Phone'] || '-'}</p>
                  </div>
                </div>

                {/* Financial Summary Card */}
                {viewingPayment ? (() => {
                  const allClientPayments = getAllPayments(viewingClient['Client ID'])
                  const totalCost = parseFloat(viewingPayment['TOTAL COST']) || 0
                  const isGst = viewingPayment['GST/NON GST'] === 'GST'
                  const gstAmt = isGst ? (parseFloat(viewingPayment['GST AMOUNT (NEW)']) || Math.round(totalCost * 0.18)) : 0
                  const totalWithGst = totalCost + gstAmt
                  const totalPaid = allClientPayments.reduce((sum, p) => sum + (parseFloat(p['PAYMENT AMOUNT']) || 0), 0)
                  const pendingAmt = Math.max(0, totalWithGst - totalPaid)

                  return (
                    <div className="border-t border-gray-200 pt-4 mt-1">
                      <div className="flex items-center justify-between mb-3">
                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider m-0">Payment Details Summary</label>
                        {viewingPayment['RECURRING'] === 'Yes' && (
                          <span className="bg-purple-100 text-[#702c91] text-[10px] font-bold px-2 py-0.5 rounded-md">
                            Recurring ({viewingPayment['RECURRING TYPE'] || 'Yes'})
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                          <p className="text-[10px] text-gray-400 m-0 mb-1">GST Scheme</p>
                          <p className="text-[13px] font-bold text-[#1E1B2E] m-0">{viewingPayment['GST/NON GST'] || '-'}</p>
                        </div>

                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                          <p className="text-[10px] text-gray-400 m-0 mb-1">Base Project Cost</p>
                          <p className="text-[13px] font-bold text-[#702c91] m-0">{totalCost ? `₹${totalCost.toLocaleString('en-IN')}` : '-'}</p>
                        </div>

                        {isGst && (
                          <div className="bg-purple-50 rounded-xl p-3 border border-purple-100">
                            <p className="text-[10px] text-[#702c91] m-0 mb-1">GST (18%)</p>
                            <p className="text-[13px] font-bold text-[#702c91] m-0">₹{gstAmt.toLocaleString('en-IN')}</p>
                          </div>
                        )}

                        <div className="bg-purple-50 rounded-xl p-3 border border-purple-100">
                          <p className="text-[10px] text-[#702c91] m-0 mb-1">Total Payable (Inc GST)</p>
                          <p className="text-[13px] font-bold text-[#702c91] m-0">₹{totalWithGst.toLocaleString('en-IN')}</p>
                        </div>

                        <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                          <p className="text-[10px] text-green-600 m-0 mb-1">Total Paid</p>
                          <p className="text-[13px] font-bold text-green-700 m-0">₹{totalPaid.toLocaleString('en-IN')}</p>
                        </div>

                        <div className={pendingAmt === 0 ? "bg-green-50 rounded-xl p-3 border border-green-100" : "bg-red-50 rounded-xl p-3 border border-red-100"}>
                          <p className={pendingAmt === 0 ? "text-[10px] text-green-600 m-0 mb-1 font-bold" : "text-[10px] text-red-500 m-0 mb-1"}>Pending Amount</p>
                          <p className={pendingAmt === 0 ? "text-[13px] font-bold text-green-700 m-0" : "text-[13px] font-bold text-[#ef4444] m-0"}>₹{pendingAmt.toLocaleString('en-IN')}</p>
                        </div>
                      </div>

                      {/* Payment History Ledger */}
                      {allClientPayments.length > 0 && allClientPayments.some(p => p['PAYMENT AMOUNT']) && (
                        <div>
                          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Payment History Ledger</label>
                          <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto custom-scrollbar pr-1">
                            {allClientPayments.filter(p => p['PAYMENT AMOUNT']).map((p, idx) => (
                              <div key={idx} className="bg-white border border-gray-200 rounded-xl p-3 shadow-xs hover:border-purple-200 transition-colors">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-[11px] font-bold text-purple-700">Installment #{idx + 1}</span>
                                  <span className="text-[11px] text-gray-500">{p['PAYMENT DATE'] ? formatDateShort(p['PAYMENT DATE']) : '-'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-[14px] font-bold text-[#16a34a]">₹{parseFloat(p['PAYMENT AMOUNT'] || 0).toLocaleString('en-IN')}</span>
                                  {p['PENDING AMOUNT'] !== undefined && (() => {
                                    const pVal = parseFloat(p['PENDING AMOUNT'] || 0)
                                    return (
                                      <span className={`text-[11px] font-medium ${pVal === 0 ? 'text-green-700 font-bold' : 'text-[#ef4444]'}`}>
                                        Pending Amount: ₹{pVal.toLocaleString('en-IN')}
                                      </span>
                                    )
                                  })()}
                                </div>
                                {p['PAYMENT NOTE'] && (
                                  <p className="text-[11px] text-gray-500 m-0 mt-1 italic">"{p['PAYMENT NOTE']}"</p>
                                )}
                                {p['DATA ENTRY DATE AND TIME'] && (
                                  <p className="text-[9px] text-gray-400 m-0 mt-1 text-right">Logged: {String(p['DATA ENTRY DATE AND TIME'])}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })() : (
                  <div className="border-t border-gray-200 pt-4 mt-1">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                      <span className="material-symbols-outlined text-[28px] text-amber-600 mb-1">info</span>
                      <p className="text-[13px] font-bold text-amber-800 m-0">Payment Details Not Configured</p>
                      <p className="text-[12px] text-amber-700 m-0 mt-1">Click "Set Payment Details" below to configure GST and Project Cost before recording payments.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {canEditPayment && (
              <div className="border-t border-gray-200 px-6 py-4 shrink-0 flex gap-3">
                <button
                  onClick={() => openPaymentFormForClient(viewingClient)}
                  className="flex-1 h-[42px] rounded-xl bg-white border border-[#702c91] text-[#702c91] text-[13px] font-bold cursor-pointer hover:bg-purple-50 transition-all flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">edit_note</span>
                  {viewingPayment ? 'Edit Payment Details' : 'Set Payment Details'}
                </button>
                <button
                  onClick={() => openRecordFormForClient(viewingClient)}
                  className="flex-1 h-[42px] rounded-xl bg-[#702c91] hover:bg-[#5c2280] text-white text-[13px] font-bold cursor-pointer transition-all border-none flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">payments</span>
                  Add Payment
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment Details Form Modal (GST 18%, Recurring, Cost) */}
      {viewingClient && showPaymentForm && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-[480px] max-h-[90vh] rounded-2xl shadow-2xl flex flex-col animate-scale-in">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 shrink-0">
              <h2 className="text-[18px] font-bold text-[#702c91] flex items-center gap-2 m-0">
                <span className="material-symbols-outlined text-[20px]">receipt_long</span>
                Payment Structure — {viewingClient['Client ID']}
              </h2>
              <button
                onClick={() => setShowPaymentForm(false)}
                className="text-gray-400 hover:text-gray-700 transition-colors bg-transparent border-none cursor-pointer p-1 flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5">
              <div className="flex flex-col gap-5">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">GST Scheme</label>
                  <div className="flex gap-3">
                    {['GST', 'Non-GST'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setPaymentForm(f => ({ ...f, gstType: f.gstType === opt ? '' : opt }))}
                        className={`flex-1 h-[42px] rounded-xl text-[13px] font-bold cursor-pointer transition-all border ${paymentForm.gstType === opt ? 'bg-[#702c91] text-white border-[#702c91]' : 'bg-white text-[#4B5563] border-[#E5E7EB] hover:border-[#702c91]'}`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                {paymentForm.gstType === 'GST' && (
                  <div className="bg-purple-50 border border-purple-100 rounded-xl px-4 py-3 flex justify-between items-center shadow-xs">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#702c91] text-[18px]">verified</span>
                      <span className="text-[13px] font-bold text-[#702c91]">GST Percentage</span>
                    </div>
                    <span className="text-[15px] font-extrabold text-[#702c91] bg-white px-3 py-1 rounded-lg border border-purple-200">18% Fixed</span>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Recurring Payment</label>
                  <div className="flex gap-3">
                    {['Yes', 'No'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setPaymentForm(f => ({ ...f, recurring: f.recurring === opt ? '' : opt, recurringType: f.recurring === opt ? '' : f.recurringType }))}
                        className={`flex-1 h-[42px] rounded-xl text-[13px] font-bold cursor-pointer transition-all border ${paymentForm.recurring === opt ? 'bg-[#702c91] text-white border-[#702c91]' : 'bg-white text-[#4B5563] border-[#E5E7EB] hover:border-[#702c91]'}`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                {paymentForm.recurring === 'Yes' && (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Recurring Schedule Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {RECURRING_OPTIONS.map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setPaymentForm(f => ({ ...f, recurringType: f.recurringType === opt ? '' : opt }))}
                          className={`h-[38px] px-3 rounded-xl text-[12px] font-bold cursor-pointer transition-all border ${paymentForm.recurringType === opt ? 'bg-[#702c91] text-white border-[#702c91]' : 'bg-white text-[#4B5563] border-[#E5E7EB] hover:border-[#702c91]'}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Project Cost (₹)</label>
                  <input
                    type="number"
                    value={paymentForm.totalCost}
                    onChange={(e) => setPaymentForm(f => ({ ...f, totalCost: e.target.value }))}
                    placeholder="Enter total project cost"
                    className="w-full h-[42px] px-4 rounded-xl border border-[#E5E7EB] bg-white text-[14px] font-bold outline-none focus:border-[#702c91] focus:ring-1 focus:ring-[#702c91] transition-all"
                  />
                  {paymentForm.totalCost && parseFloat(paymentForm.totalCost) > 0 && (
                    <div className="mt-3 flex flex-col gap-2">
                      {paymentForm.gstType === 'GST' && (
                        <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 flex justify-between items-center">
                          <span className="text-[12px] text-[#702c91] font-medium">GST Amount (18%)</span>
                          <span className="text-[14px] font-bold text-[#702c91]">₹{calcGstAmount().toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      <div className="bg-[#702c91] border border-[#5c2280] rounded-xl p-3 flex justify-between items-center text-white shadow-sm">
                        <span className="text-[12px] font-bold">Total Amount Payable</span>
                        <span className="text-[16px] font-extrabold">₹{calcTotalWithGst().toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 px-6 py-4 shrink-0 flex gap-3">
              <button
                onClick={() => setShowPaymentForm(false)}
                className="flex-1 h-[42px] rounded-xl bg-white border border-[#E5E7EB] text-[#4B5563] text-[13px] font-bold cursor-pointer hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePayment}
                disabled={saving}
                className="flex-1 h-[42px] rounded-xl bg-[#702c91] hover:bg-[#5c2280] text-white text-[13px] font-bold cursor-pointer transition-all border-none disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Payment Structure'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Installment Form Modal */}
      {viewingClient && showRecordForm && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-[420px] max-h-[90vh] rounded-2xl shadow-2xl flex flex-col animate-scale-in">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 shrink-0">
              <h2 className="text-[18px] font-bold text-[#702c91] flex items-center gap-2 m-0">
                <span className="material-symbols-outlined text-[20px]">payments</span>
                Record Installment — {viewingClient['Client ID']}
              </h2>
              <button
                onClick={() => setShowRecordForm(false)}
                className="text-gray-400 hover:text-gray-700 transition-colors bg-transparent border-none cursor-pointer p-1 flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5">
              <div className="flex flex-col gap-5">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Payment Amount (₹)</label>
                  <input
                    type="number"
                    value={recordForm.amount}
                    onChange={(e) => setRecordForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="Enter installment amount"
                    className="w-full h-[42px] px-4 rounded-xl border border-[#E5E7EB] bg-white text-[14px] font-bold outline-none focus:border-[#702c91] focus:ring-1 focus:ring-[#702c91] transition-all"
                  />
                  {viewingPayment && recordForm.amount && parseFloat(recordForm.amount) > 0 && (() => {
                    const totalCost = parseFloat(viewingPayment['TOTAL COST']) || 0
                    const gstAmt = viewingPayment['GST/NON GST'] === 'GST' ? (parseFloat(viewingPayment['GST AMOUNT (NEW)']) || Math.round(totalCost * 0.18)) : 0
                    const totalWithGst = totalCost + gstAmt
                    const allPays = getAllPayments(viewingClient['Client ID'])
                    const totalPaid = allPays.reduce((sum, p) => sum + (parseFloat(p['PAYMENT AMOUNT']) || 0), 0)
                    const pendingAfter = Math.max(0, totalWithGst - totalPaid - (parseFloat(recordForm.amount) || 0))
                    const isZeroPending = pendingAfter === 0
                    return (
                      <div className={isZeroPending ? "mt-2 bg-green-50 border border-green-200 rounded-xl p-3 flex justify-between items-center shadow-xs" : "mt-2 bg-orange-50 border border-orange-200 rounded-xl p-3 flex justify-between items-center shadow-xs"}>
                        <span className={isZeroPending ? "text-[12px] text-green-700 font-bold" : "text-[12px] text-orange-700 font-bold"}>Pending Amount After Payment</span>
                        <span className={isZeroPending ? "text-[15px] font-extrabold text-green-700" : "text-[15px] font-extrabold text-orange-700"}>
                          ₹{pendingAfter.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )
                  })()}
                  {viewingPayment && (() => {
                    const totalCost = parseFloat(viewingPayment['TOTAL COST']) || 0
                    const gstAmt = viewingPayment['GST/NON GST'] === 'GST' ? (parseFloat(viewingPayment['GST AMOUNT (NEW)']) || Math.round(totalCost * 0.18)) : 0
                    const totalWithGst = totalCost + gstAmt
                    const allPays = getAllPayments(viewingClient['Client ID'])
                    const totalPaid = allPays.reduce((sum, p) => sum + (parseFloat(p['PAYMENT AMOUNT']) || 0), 0)
                    if (totalWithGst <= 0) return null
                    return (
                      <div className="mt-3 flex gap-2">
                        <div className="flex-1 bg-purple-50 border border-purple-100 rounded-lg p-2 text-center">
                          <p className="text-[9px] text-[#702c91] m-0 uppercase font-bold">Total Payable</p>
                          <p className="text-[12px] font-bold text-[#702c91] m-0">₹{totalWithGst.toLocaleString('en-IN')}</p>
                        </div>
                        {totalPaid > 0 && (
                          <div className="flex-1 bg-green-50 border border-green-100 rounded-lg p-2 text-center">
                            <p className="text-[9px] text-green-600 m-0 uppercase font-bold">Already Paid</p>
                            <p className="text-[12px] font-bold text-green-700 m-0">₹{totalPaid.toLocaleString('en-IN')}</p>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Payment Date</label>
                  <input
                    type="date"
                    value={recordForm.date}
                    onChange={(e) => setRecordForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full h-[40px] px-4 rounded-xl border border-[#E5E7EB] bg-white text-[13px] outline-none focus:border-[#702c91] focus:ring-1 focus:ring-[#702c91] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Payment Note (Optional)</label>
                  <textarea
                    value={recordForm.note}
                    onChange={(e) => setRecordForm(f => ({ ...f, note: e.target.value }))}
                    placeholder="Transaction reference, cheque no, or note..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-[#E5E7EB] bg-white text-[13px] outline-none focus:border-[#702c91] focus:ring-1 focus:ring-[#702c91] transition-all resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 px-6 py-4 shrink-0 flex gap-3">
              <button
                onClick={() => setShowRecordForm(false)}
                className="flex-1 h-[42px] rounded-xl bg-white border border-[#E5E7EB] text-[#4B5563] text-[13px] font-bold cursor-pointer hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRecord}
                disabled={saving}
                className="flex-1 h-[42px] rounded-xl bg-[#702c91] hover:bg-[#5c2280] text-white text-[13px] font-bold cursor-pointer transition-all border-none disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Payment Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

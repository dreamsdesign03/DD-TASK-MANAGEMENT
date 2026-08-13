import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import TopNav from '../components/TopNav'

import SelectDropdown from '../components/SelectDropdown'
import { useApp } from '../context/AppContext'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

export default function MonthlyReportPage() {
  const navigate = useNavigate()
  const { tasks, addToast, profile, clients: globalClients } = useApp()
  const isAdmin = profile?.systemRole === 'Admin' || profile?.role === 'Admin'
  const [filterType, setFilterType] = useState('Overall')
  const [selectedValue, setSelectedValue] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)

  // Date range filter state
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const clients = [...new Set((tasks || []).map((t) => t?.client).filter(c => c && String(c).toLowerCase() !== 'internal'))].sort()
  const users = [...new Set((tasks || []).flatMap((t) => String(t?.assignedTo || '').split(',').map(s => s.trim())).filter(Boolean))].sort()

  const handleFilterChange = (type) => {
    setFilterType(type)
    if (type === 'Overall') setSelectedValue('')
    else if (type === 'Company') setSelectedValue(clients[0] || '')
    else if (type === 'User') setSelectedValue(users[0] || '')
  }

  const isInDateRange = (task) => {
    if (!dateFrom && !dateTo) return true
    const d = task.dueDate ? new Date(task.dueDate) : null
    if (!d || isNaN(d.getTime())) return !dateFrom && !dateTo
    const from = dateFrom ? new Date(dateFrom) : null
    const to = dateTo ? new Date(dateTo) : null
    if (from && d < from) return false
    if (to) {
      const toEnd = new Date(to)
      toEnd.setHours(23, 59, 59, 999)
      if (d > toEnd) return false
    }
    return true
  }

  const sanitizedDateRange = useMemo(() => {
    if (dateFrom && dateTo) return `${dateFrom} to ${dateTo}`
    if (dateFrom) return `from ${dateFrom}`
    if (dateTo) return `until ${dateTo}`
    return 'All Dates'
  }, [dateFrom, dateTo])

  const filteredTasks = useMemo(() => {
    return (tasks || []).filter((t) => {
      // If not an admin, strictly only show tasks assigned to this user
      if (!isAdmin) {
        const assignees = (t.assignedTo || '').toLowerCase()
        const myName = (profile?.name || '').trim().toLowerCase()
        if (myName && !assignees.includes(myName)) {
          return false
        }
      }

      if (t?.client && String(t.client).toLowerCase() === 'internal') return false
      if (!isInDateRange(t)) return false
      if (filterType === 'Company' && selectedValue) {
        return t.client === selectedValue
      }
      if (filterType === 'User' && selectedValue) {
        return (t.assignedTo || '').includes(selectedValue)
      }
      return true
    })
  }, [tasks, filterType, selectedValue, dateFrom, dateTo, isAdmin, profile])

  // Compute metrics
  const totalTasks = filteredTasks.length
  const completed = filteredTasks.filter((t) => t.status === 'Done').length
  const inProgress = filteredTasks.filter((t) => t.status === 'In Progress' || t.status === 'Review').length
  const blocked = filteredTasks.filter((t) => t.status === 'Blocked').length
  const overdue = filteredTasks.filter((t) => t.daysOverdue && t.daysOverdue !== 'No').length
  const pending = filteredTasks.filter((t) => t.status === 'Pending').length

  const completedPct = totalTasks ? Math.round((completed / totalTasks) * 100) : 0
  const inProgressPct = totalTasks ? Math.round((inProgress / totalTasks) * 100) : 0
  const pendingPct = totalTasks ? Math.round((pending / totalTasks) * 100) : 0
  const blockedPct = totalTasks ? Math.round((blocked / totalTasks) * 100) : 0

  // Calculate conic gradient string for the donut chart
  // Order: Done -> In Progress -> Pending -> Blocked
  // SVG Donut Chart Calculations

  const handleDownloadPDF = async () => {
    setIsDownloading(true)
    const element = document.getElementById('report-content')
    if (!element) return

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        onclone: (clonedDoc) => {
          clonedDoc.documentElement.classList.remove('dark')
          const clonedElement = clonedDoc.getElementById('report-content')
          if (clonedElement) {
            clonedElement.style.backgroundColor = '#fbf9f8'
            clonedElement.style.padding = '40px'
            clonedElement.style.lineHeight = '1.5'
            clonedElement.style.fontFamily = 'Arial, Helvetica, sans-serif'

            const truncates = clonedElement.querySelectorAll('.truncate')
            truncates.forEach(el => {
              el.classList.remove('truncate', 'max-w-[150px]', 'inline-block')
            })

            const selects = clonedElement.querySelectorAll('select')
            selects.forEach(sel => {
              const selectedText = sel.options[sel.selectedIndex]?.text || ''
              const span = clonedDoc.createElement('span')
              span.innerText = selectedText
              span.style.cssText = 'display: inline-flex; align-items: center; padding: 10px 16px; border-radius: 12px; border: 1px solid #E5E7EB; background: white; font-size: 13px; font-weight: 600; color: #1E1B2E; line-height: 1.4; white-space: nowrap;'
              sel.parentNode.replaceChild(span, sel)
            })

            const dateInputs = clonedElement.querySelectorAll('input[type="date"]')
            dateInputs.forEach(input => {
              const span = clonedDoc.createElement('span')
              span.innerText = input.value || '—'
              span.style.cssText = 'display: inline-flex; align-items: center; padding: 10px 12px; border-radius: 12px; border: 1px solid #E5E7EB; background: white; font-size: 13px; font-weight: 600; color: #1E1B2E; line-height: 1.4;'
              input.parentNode.replaceChild(span, input)
            })

            const dropdownTriggers = clonedElement.querySelectorAll('[style*="overflow: hidden"]')
            dropdownTriggers.forEach(el => {
              if (el.style.overflow === 'hidden') el.style.overflow = 'visible'
              el.style.lineHeight = '1.4'
              el.style.fontFamily = 'Arial, Helvetica, sans-serif'
            })

            const badges = clonedElement.querySelectorAll('span[class*="rounded-full"], span[class*="rounded"]')
            badges.forEach(el => {
              el.style.paddingTop = '4px'
              el.style.paddingBottom = '4px'
              el.style.lineHeight = '1.3'
            })

            const allSpans = clonedElement.querySelectorAll('span')
            allSpans.forEach(el => {
              if (el.classList.contains('material-symbols-outlined') || (el.className && el.className.includes('material-symbols'))) return
              el.style.lineHeight = '1.5'
              el.style.fontFamily = 'Arial, Helvetica, sans-serif'
            })

            const allTdTh = clonedElement.querySelectorAll('td, th')
            allTdTh.forEach(el => {
              el.style.lineHeight = '1.5'
              el.style.paddingTop = '14px'
              el.style.paddingBottom = '14px'
              el.style.fontFamily = 'Arial, Helvetica, sans-serif'
            })

            const headings = clonedElement.querySelectorAll('h2, h3, h4')
            headings.forEach(el => {
              el.style.fontFamily = 'Arial, Helvetica, sans-serif'
            })

            const labels = clonedElement.querySelectorAll('label, p, button')
            labels.forEach(el => {
              el.style.fontFamily = 'Arial, Helvetica, sans-serif'
              el.style.lineHeight = '1.5'
            })
          }
        }
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      })

      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 6
      const usableWidth = pageWidth - margin * 2
      const usableHeight = pageHeight - margin * 2

      const contentRatio = canvas.height / canvas.width
      const pageRatio = usableHeight / usableWidth

      if (contentRatio <= pageRatio) {
        const imgHeight = usableWidth * contentRatio
        const yOffset = margin + (usableHeight - imgHeight) / 2
        pdf.addImage(imgData, 'PNG', margin, yOffset, usableWidth, imgHeight)
      } else {
        const totalPages = (contentRatio * usableWidth) / usableHeight
        if (totalPages <= 1.35) {
          const scale = usableHeight / (usableWidth * contentRatio)
          pdf.addImage(imgData, 'PNG', margin, margin, usableWidth * scale, usableHeight)
        } else {
          const sliceH = Math.round((usableHeight * canvas.width) / usableWidth)
          let remaining = canvas.height
          let srcY = 0
          while (remaining > 0) {
            if (srcY > 0) pdf.addPage()
            const pageH = Math.min(remaining, sliceH)
            const pageCanvas = document.createElement('canvas')
            pageCanvas.width = canvas.width
            pageCanvas.height = pageH
            const ctx = pageCanvas.getContext('2d')
            ctx.drawImage(canvas, 0, srcY, canvas.width, pageH, 0, 0, canvas.width, pageH)
            const pageImgData = pageCanvas.toDataURL('image/png')
            const pageImgH = (pageH / canvas.width) * usableWidth
            pdf.addImage(pageImgData, 'PNG', margin, margin, usableWidth, pageImgH)
            srcY += pageH
            remaining -= pageH
          }
        }
      }

      const sanitizedRange = sanitizedDateRange.replace(/\s+/g, '_').replace(/-/g, '')
      const sanitizedValue = filterType === 'Overall' ? 'Overall' : selectedValue.replace(/\s+/g, '_')
      const fileName = `Dreamsdesk_Report_${sanitizedRange}_${sanitizedValue}.pdf`

      pdf.save(fileName)
    } catch (error) {
      console.error('Failed to generate PDF:', error)
      addToast('Failed to generate PDF. Please try again.', 'error')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="bg-[#F0EDF8] font-['Inter',sans-serif] text-[#151c27] overflow-hidden h-screen flex">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F8; border-radius: 10px; }

        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        
        .donut-segment {
          transition: stroke-dasharray 0.3s ease;
        }
      `}</style>

      <Sidebar />

      <main className="page-main">
        <TopNav title="Reports" showSearch={false} />

        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-5 pb-6 animate-fade-in-up">
          <div id="report-content" className="w-full">
            
            {/* Header Row */}
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
              <h2 className="text-[26px] font-bold text-[#702c91] m-0">Report Analysis</h2>
            </div>

            {/* Filter Tabs & Date Range */}
            <div className="flex flex-wrap items-center gap-4 mb-8">
              <div className="flex bg-[#F3F4F6] p-1 rounded-lg w-max" style={{ flexShrink: 0 }}>
                {['Overall', 'Company', 'User'].map(type => {
                  if (type === 'User' && !isAdmin) return null;
                  return (
                  <button
                    key={type}
                    onClick={() => handleFilterChange(type)}
                    className={`px-4 py-1.5 rounded-full text-[13px] font-bold cursor-pointer transition-all border-none ${
                      filterType === type 
                        ? 'bg-gradient-to-r from-[#702c91] to-[#ec008c] text-white shadow-sm' 
                        : 'bg-transparent text-[#6B7280] hover:text-[#1E1B2E]'
                    }`}
                  >
                    {type}
                  </button>
                )})}
              </div>

              {filterType === 'Company' && (
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>SELECT COMPANY:</span>
                  <SelectDropdown value={selectedValue} onChange={setSelectedValue} options={clients} style={{ width: 220, flexShrink: 0 }} />
                </div>
              )}
              {filterType === 'User' && (
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>SELECT USER:</span>
                  <SelectDropdown value={selectedValue} onChange={setSelectedValue} options={users} style={{ width: 220, flexShrink: 0 }} />
                </div>
              )}

              <div style={{ flex: '1 1 0' }} />

              <div className="flex items-center gap-3">
                <div style={{ position: 'relative', width: 160, overflow: 'visible', paddingTop: 8 }}>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'white',
                      border: '1px solid #E5E7EB',
                      borderRadius: 12,
                      padding: '10px 12px',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#1E1B2E',
                      outline: 'none',
                      cursor: 'pointer',
                      minHeight: 44,
                      fontFamily: 'Inter, sans-serif',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                    onFocus={e => { e.target.style.borderColor = '#702c91'; e.target.style.boxShadow = '0 0 0 3px rgba(112,44,145,0.1)' }}
                    onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none' }}
                  />
                  <span style={{
                    position: 'absolute',
                    left: 12,
                    top: 0,
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#9CA3AF',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    background: 'white',
                    padding: '0 4px',
                    pointerEvents: 'none',
                    lineHeight: 1,
                  }}>From</span>
                </div>
                <div style={{ position: 'relative', width: 160, overflow: 'visible', paddingTop: 8 }}>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'white',
                      border: '1px solid #E5E7EB',
                      borderRadius: 12,
                      padding: '10px 12px',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#1E1B2E',
                      outline: 'none',
                      cursor: 'pointer',
                      minHeight: 44,
                      fontFamily: 'Inter, sans-serif',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                    onFocus={e => { e.target.style.borderColor = '#702c91'; e.target.style.boxShadow = '0 0 0 3px rgba(112,44,145,0.1)' }}
                    onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none' }}
                  />
                  <span style={{
                    position: 'absolute',
                    left: 12,
                    top: 0,
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#9CA3AF',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    background: 'white',
                    padding: '0 4px',
                    pointerEvents: 'none',
                    lineHeight: 1,
                  }}>To</span>
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              {/* Total Tasks */}
              <div className="bg-white rounded-xl p-5 shadow-sm border border-[#E5E7EB] relative overflow-hidden flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-purple-900/10 cursor-default">
                <div className="absolute top-0 left-0 w-full h-1 bg-[#ec008c]"></div>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Total Tasks</p>
                    <h3 className="text-[32px] font-black text-[#702c91] leading-none m-0">{totalTasks}</h3>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#702c91]">assignment</span>
                  </div>
                </div>
              </div>

              {/* Completed */}
              <div className="bg-white rounded-xl p-5 shadow-sm border border-[#E5E7EB] relative overflow-hidden flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-purple-900/10 cursor-default">
                <div className="absolute top-0 left-0 w-full h-1 bg-[#10B981]"></div>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Completed</p>
                    <h3 className="text-[32px] font-black text-[#10B981] leading-none m-0">{completed}</h3>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#10B981]">check_circle</span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-[#10B981] h-full rounded-full" style={{ width: `${completedPct}%` }}></div>
                </div>
              </div>

              {/* In Progress */}
              <div className="bg-white rounded-xl p-5 shadow-sm border border-[#E5E7EB] relative overflow-hidden flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-purple-900/10 cursor-default">
                <div className="absolute top-0 left-0 w-full h-1 bg-[#F59E0B]"></div>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">In Progress</p>
                    <h3 className="text-[32px] font-black text-[#F59E0B] leading-none m-0">{inProgress}</h3>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-yellow-50 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#F59E0B]">more_horiz</span>
                  </div>
                </div>
                <p className="text-[11px] font-medium text-[#6B7280] m-0">Active now</p>
              </div>

              {/* Overdue */}
              <div className="bg-white rounded-xl p-5 shadow-sm border border-[#E5E7EB] relative overflow-hidden flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-purple-900/10 cursor-default">
                <div className="absolute top-0 left-0 w-full h-1 bg-[#EF4444]"></div>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Overdue</p>
                    <h3 className="text-[32px] font-black text-[#EF4444] leading-none m-0">{overdue}</h3>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#EF4444]">warning</span>
                  </div>
                </div>
                <p className={`text-[11px] font-bold m-0 ${overdue > 0 ? 'text-[#EF4444]' : 'text-[#10B981]'}`}>
                  {overdue > 0 ? 'Requires attention!' : 'All on track'}
                </p>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              {/* Status Breakdown */}
              <div>
                <h3 className="text-[16px] font-bold text-[#1E1B2E] mb-6 flex items-center gap-2">
                  Status Breakdown
                </h3>
                <div className="flex items-center gap-8 bg-white p-6 rounded-xl border border-[#E5E7EB] shadow-sm transition-all duration-300 hover:shadow-lg hover:shadow-purple-900/5 hover:-translate-y-1">
                  
                  {/* SVG Donut Chart */}
                  <div className="relative w-40 h-40 shrink-0">
                    <svg viewBox="0 0 42 42" className="w-full h-full -rotate-90">
                      <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#E5E7EB" strokeWidth="6"></circle>
                      {/* Done */}
                      {completedPct > 0 && (
                        <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#10B981" strokeWidth="6" 
                          strokeDasharray={`${completedPct} 100`} 
                          strokeDashoffset="0"></circle>
                      )}
                      {/* In Progress */}
                      {inProgressPct > 0 && (
                        <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#F59E0B" strokeWidth="6" 
                          strokeDasharray={`${inProgressPct} 100`} 
                          strokeDashoffset={-completedPct}></circle>
                      )}
                      {/* Pending */}
                      {pendingPct > 0 && (
                        <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#3B82F6" strokeWidth="6" 
                          strokeDasharray={`${pendingPct} 100`} 
                          strokeDashoffset={-(completedPct + inProgressPct)}></circle>
                      )}
                      {/* Blocked */}
                      {blockedPct > 0 && (
                        <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#EF4444" strokeWidth="6" 
                          strokeDasharray={`${blockedPct} 100`} 
                          strokeDashoffset={-(completedPct + inProgressPct + pendingPct)}></circle>
                      )}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[20px] font-black text-[#1E1B2E]">{totalTasks}</span>
                      <span className="text-[11px] text-[#6B7280] font-medium">Total</span>
                    </div>
                  </div>
                  
                  {/* Legend */}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#10B981]"></div>
                      <span className="text-[13px] font-bold text-[#4B5563]">Done ({completedPct}%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#F59E0B]"></div>
                      <span className="text-[13px] font-bold text-[#4B5563]">In Progress ({inProgressPct}%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#3B82F6]"></div>
                      <span className="text-[13px] font-bold text-[#4B5563]">Pending ({pendingPct}%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#EF4444]"></div>
                      <span className="text-[13px] font-bold text-[#4B5563]">Blocked ({blockedPct}%)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Key Insights */}
              <div>
                <h3 className="text-[16px] font-bold text-[#1E1B2E] mb-6 flex items-center gap-2">
                  Key Insights
                </h3>
                <div className="flex flex-col gap-4">
                  <div className="bg-white border-l-4 border-[#ec008c] p-4 rounded-r-xl shadow-sm border-y border-r border-[#E5E7EB] transition-all duration-300 hover:translate-x-1 hover:shadow-md cursor-default">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-purple-50 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="material-symbols-outlined text-[#702c91] text-[14px]">info</span>
                      </div>
                      <div>
                        <h4 className="text-[14px] font-bold text-[#1E1B2E] m-0 mb-1">Completion Rate</h4>
                        <p className="text-[12px] text-[#6B7280] m-0">{filterType === 'Overall' ? 'Overall' : selectedValue} has a completion rate of {completedPct}%. {completedPct > 50 ? 'Great progress!' : 'There is room for improvement.'}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white border-l-4 border-[#F59E0B] p-4 rounded-r-xl shadow-sm border-y border-r border-[#E5E7EB] transition-all duration-300 hover:translate-x-1 hover:shadow-md cursor-default">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-yellow-50 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="material-symbols-outlined text-[#F59E0B] text-[14px]">arrow_forward</span>
                      </div>
                      <div>
                        <h4 className="text-[14px] font-bold text-[#1E1B2E] m-0 mb-1">Active Workload</h4>
                        <p className="text-[12px] text-[#6B7280] m-0">There are {inProgress} tasks currently actively being worked on.</p>
                      </div>
                    </div>
                  </div>
                  
                  {overdue > 0 && (
                    <div className="bg-white border-l-4 border-[#EF4444] p-4 rounded-r-xl shadow-sm border-y border-r border-[#E5E7EB] transition-all duration-300 hover:translate-x-1 hover:shadow-md cursor-default">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="material-symbols-outlined text-[#EF4444] text-[14px]">warning</span>
                        </div>
                        <div>
                          <h4 className="text-[14px] font-bold text-[#1E1B2E] m-0 mb-1">Overdue Alerts</h4>
                          <p className="text-[12px] text-[#6B7280] m-0">{overdue} tasks are overdue. Immediate follow up is recommended.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

          {/* Company & User Breakdown */}
            <div className="mb-10">
              <h3 className="text-[16px] font-bold text-[#1E1B2E] mb-4 flex items-center gap-2">
                Company & User Breakdown
              </h3>
              <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
                <div className="overflow-x-auto hide-scrollbar">
                  <table className="block lg:table w-full text-left border-collapse min-w-full lg:min-w-[900px]">
                    <thead className="hidden lg:table-header-group">
                      <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                        <th className="py-3 px-5 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Company</th>
                        <th className="py-3 px-5 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">User</th>
                        <th className="py-3 px-5 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider text-right">Total</th>
                        <th className="py-3 px-5 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider text-right">Done</th>
                        <th className="py-3 px-5 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider text-right">In Progress</th>
                        <th className="py-3 px-5 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider text-right">Pending</th>
                        <th className="py-3 px-5 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider text-right">Blocked</th>
                        <th className="py-3 px-5 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider text-right">Overdue</th>
                      </tr>
                    </thead>
                    <tbody className="block lg:table-row-group divide-y lg:divide-none divide-[#E5E7EB]">
                      {(() => {
                        const breakdown = {}
                        filteredTasks.forEach(t => {
                          const company = t.client || 'General'
                          if (filterType === 'Company' && company !== selectedValue) return
                          let assignedUsers = (t.assignedTo || '').split(',').map(s => s.trim()).filter(Boolean)
                          if (filterType === 'User') assignedUsers = assignedUsers.filter(u => u === selectedValue)
                          
                          if (!isAdmin) {
                            const myName = String(profile?.name || '').trim().toLowerCase()
                            assignedUsers = assignedUsers.filter(u => u.toLowerCase() === myName)
                          }

                          assignedUsers.forEach(u => {
                            if (!breakdown[company]) breakdown[company] = {}
                            if (!breakdown[company][u]) {
                              breakdown[company][u] = { total: 0, done: 0, inProgress: 0, pending: 0, blocked: 0, overdue: 0 }
                            }
                            breakdown[company][u].total++
                            if (t.status === 'Done') breakdown[company][u].done++
                            else if (t.status === 'In Progress' || t.status === 'Review') breakdown[company][u].inProgress++
                            else if (t.status === 'Pending') breakdown[company][u].pending++
                            else if (t.status === 'Blocked') breakdown[company][u].blocked++
                            if (t.overdue && t.status !== 'Done') breakdown[company][u].overdue++
                          })
                        })
                        const companyNames = Object.keys(breakdown).sort()
                        if (companyNames.length === 0) {
                          return (
                            <tr className="block lg:table-row">
                              <td colSpan="8" className="block lg:table-cell text-center py-8 text-secondary text-sm">No data for this selection.</td>
                            </tr>
                          )
                        }
                        const rows = []
                        companyNames.forEach((company, ci) => {
                          const userNames = Object.keys(breakdown[company]).sort()
                          userNames.forEach((u, ui) => {
                            const d = breakdown[company][u]
                            rows.push(
                              <tr key={`${company}-${u}`} className={`block lg:table-row border-b border-[#E5E7EB] ${ci === companyNames.length - 1 && ui === userNames.length - 1 ? 'border-b-0' : ''} transition-all lg:hover:bg-purple-50/40`}>
                                {ui === 0 ? (
                                  <td className="block lg:table-cell py-3 px-4 lg:py-4 lg:px-5 text-[13px] font-bold text-[#702c91] border-b border-gray-100 lg:border-none" rowSpan={userNames.length}>
                                    <div className="flex items-center gap-2">
                                      <span className="material-symbols-outlined text-[18px]">business</span>
                                      {company}
                                    </div>
                                  </td>
                                ) : (
                                  <td className="lg:hidden block py-3 px-4 text-[13px] font-bold text-[#702c91] border-b border-gray-100">
                                    <div className="flex items-center gap-2">
                                      <span className="material-symbols-outlined text-[18px]">business</span>
                                      {company}
                                    </div>
                                  </td>
                                )}
                                <td className="block lg:table-cell py-2 px-4 lg:py-4 lg:px-5 text-[13px] text-[#4B5563] font-semibold"><span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">User:</span>{u}</td>
                                <td className="block lg:table-cell py-2 px-4 lg:py-4 lg:px-5 text-[13px] text-[#1E1B2E] font-bold lg:text-right"><span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">Total:</span>{d.total}</td>
                                <td className="block lg:table-cell py-2 px-4 lg:py-4 lg:px-5 text-[13px] text-[#10B981] font-semibold lg:text-right"><span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">Done:</span>{d.done}</td>
                                <td className="block lg:table-cell py-2 px-4 lg:py-4 lg:px-5 text-[13px] text-[#F59E0B] font-semibold lg:text-right"><span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">In Progress:</span>{d.inProgress}</td>
                                <td className="block lg:table-cell py-2 px-4 lg:py-4 lg:px-5 text-[13px] text-[#3B82F6] font-semibold lg:text-right"><span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">Pending:</span>{d.pending}</td>
                                <td className="block lg:table-cell py-2 px-4 lg:py-4 lg:px-5 text-[13px] text-[#EF4444] font-semibold lg:text-right"><span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">Blocked:</span>{d.blocked}</td>
                                <td className="block lg:table-cell py-2 px-4 pb-4 lg:py-4 lg:px-5 text-[13px] text-[#EF4444] font-semibold lg:text-right"><span className="lg:hidden text-[10px] uppercase text-[#6B7280] mr-2">Overdue:</span>{d.overdue}</td>
                              </tr>
                            )
                          })
                        })
                        return rows
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          {/* All Tasks Activity */}
            <div className="mb-10">
              <h3 className="text-[16px] font-bold text-[#1E1B2E] mb-4">
                {filterType === 'Overall' ? 'All Tasks Activity' : `${selectedValue} Activity`}
              </h3>
              <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
                <div className="overflow-x-auto hide-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                      <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                        <th className="py-3 px-5 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider w-[10%]">Task ID</th>
                        <th className="py-3 px-5 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider w-[30%]">Task Title</th>
                        <th className="py-3 px-5 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider w-[12%]">Due Date</th>
                        <th className="py-3 px-5 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider w-[18%]">Client</th>
                        <th className="py-3 px-5 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider w-[15%]">Assigned To</th>
                        <th className="py-3 px-5 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider w-[10%]">Status</th>
                        <th className="py-3 px-5 text-[11px] font-bold text-[#6B7280] uppercase tracking-wider text-right w-[10%]">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                    {filteredTasks.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="text-center py-8 text-secondary text-[14px]">
                          No tasks found for this selection.
                        </td>
                      </tr>
                    ) : (
                      filteredTasks.map((row, idx) => (
                        <tr 
                          key={row.id} 
                          className={`border-b border-[#E5E7EB] transition-all duration-200 relative ${idx === filteredTasks.length - 1 ? 'border-b-0' : ''}`}
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={e => { 
                            e.currentTarget.style.background = 'white'; 
                            e.currentTarget.style.transform = 'scale(1.01)'; 
                            e.currentTarget.style.boxShadow = '0 8px 24px rgba(91,33,182,0.08)';
                            e.currentTarget.style.zIndex = 10;
                          }}
                          onMouseLeave={e => { 
                            e.currentTarget.style.background = 'transparent'; 
                            e.currentTarget.style.transform = 'scale(1)'; 
                            e.currentTarget.style.boxShadow = 'none';
                            e.currentTarget.style.zIndex = 1;
                          }}
                        >
                          <td className="py-4 px-5 text-[12px] font-bold text-[#4B5563]">
                            {row.id}
                          </td>
                          <td className="py-4 px-5 text-[13px] text-[#4B5563]">
                            <span className={row.status === 'Done' ? 'line-through text-[#9CA3AF]' : ''}>{row.title}</span>
                          </td>
                          <td className="py-4 px-5">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${row.dueDate ? 'text-[#702c91] bg-purple-50 border border-purple-200' : 'text-[#9CA3AF]'}`}>
                              {row.dueDate || '-'}
                            </span>
                          </td>
                          <td className="py-4 px-5 text-[12px] text-[#6B7280]">
                            {row.client}
                          </td>
                          <td className="py-4 px-5 text-[12px] text-[#6B7280]">
                            {row.assignedTo || '-'}
                          </td>
                          <td className="py-4 px-5">
                            {(() => {
                               let isDoneLate = false;
                               if (row.status === 'Done' && row.dueDate && row.statusUpdatedOn) {
                                  const due = new Date(row.dueDate);
                                  const updated = new Date(row.statusUpdatedOn);
                                  due.setHours(23, 59, 59, 999);
                                  if (updated > due) isDoneLate = true;
                               }
                               return (
                                 <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                   row.status === 'Done' 
                                     ? (isDoneLate ? 'text-amber-700 bg-amber-100' : 'text-green-600 bg-green-50') 
                                     : row.status === 'Blocked' ? 'text-red-600 bg-red-50' 
                                     : 'text-pink-600 bg-pink-50'
                                 }`}>
                                   {row.status === 'Done' && isDoneLate ? 'Done (Late)' : row.status}
                                 </span>
                               )
                            })()}
                          </td>
                          <td className="py-4 px-5 text-right">
                            <button 
                              onClick={() => navigate(`/tasks/${row.id}`)}
                              className="text-[12px] font-bold text-[#702c91] hover:text-[#702c91] transition-colors bg-transparent border-none cursor-pointer inline-flex items-center gap-1"
                            >
                              View <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>



          {/* Footer Action */}
            <div className="flex justify-end pb-8" data-html2canvas-ignore>
              <button
                onClick={handleDownloadPDF}
                disabled={isDownloading}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-[#ec008c] rounded-lg text-[14px] font-bold text-[#702c91] shadow-sm hover:bg-purple-50 transition-colors group disabled:opacity-70 disabled:cursor-wait"
              >
                {isDownloading ? (
                  <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
                ) : (
                  <span className="material-symbols-outlined text-[18px] transition-transform group-hover:translate-y-1">download</span>
                )}
                {isDownloading ? 'Generating PDF...' : 'Download PDF Report'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}


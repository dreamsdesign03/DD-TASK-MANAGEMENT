import React, { useMemo, useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Sidebar from '../components/Sidebar'
import TopNav from '../components/TopNav'
import SelectDropdown from '../components/SelectDropdown'

export default function ProjectOverviewPage() {
  const { projectName } = useParams()
  const navigate = useNavigate()
  const { tasks, messagesByChatId, fetchMessages, addToast, profile, isPunchedIn } = useApp()
  const [driveDocs, setDriveDocs] = useState([])
  const [isLoadingDocs, setIsLoadingDocs] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef(null)
  const [uploadDept, setUploadDept] = useState(null)

  const [filterTaskId, setFilterTaskId] = useState('All Tasks')
  const [filterDept, setFilterDept] = useState('All Departments')
  const [docsViewMode, setDocsViewMode] = useState('List') // 'List' | 'Grid'

  useEffect(() => {
    const role = profile?.systemRole || 'Employee'
    const hidden = role === 'Admin' ? [] : role === 'HR' ? ['ACCOUNT', 'SALES'] : role === 'Accountant' ? ['HR', 'SALES'] : role === 'Sales' ? ['HR', 'ACCOUNT'] : ['HR', 'ACCOUNT', 'SALES']
    if (hidden.includes(filterDept)) {
      setFilterDept('All Departments')
    }
  }, [profile?.systemRole, filterDept])

  const getDriveFileId = (url) => {
    if (!url) return null
    const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/)
    return match ? match[1] : null
  }

  const getDisplayName = (name) => {
    if (!name) return 'Document'
    if (name.includes('drive.google.com')) return 'Google Drive File'
    if (name.startsWith('http://') || name.startsWith('https://')) return 'Web Link'
    return name
  }

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  // Fetch documents directly from Google Drive for this project
  useEffect(() => {
    if (!projectName) return
    setIsLoadingDocs(true)
    const url = `https://script.google.com/macros/s/AKfycbzs69465Gintz_UEvY_IjcncUVK_8SGKYxRolbUGpmh--HzqRzxNCYUNX36koPlYrWg/exec?action=get_project_files&projectName=${encodeURIComponent(projectName)}&t=${Date.now()}`
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.files) {
          setDriveDocs(data.files)
        }
      })
      .catch(err => console.error("Failed to fetch project files from drive:", err))
      .finally(() => setIsLoadingDocs(false))
  }, [projectName])

  const projectTasks = useMemo(() => {
    if (!tasks) return []
    return tasks.filter(t => t.client === projectName)
  }, [tasks, projectName])

  const uniqueTaskIds = useMemo(() => {
    return ['All Tasks', ...new Set(projectTasks.map(t => t.id))]
  }, [projectTasks])

  const uniqueDepts = useMemo(() => {
    const rawDepts = projectTasks.map(t => t.department || 'COMMON')
    const allDepts = ['All Departments', 'COMMON', 'SOCIAL MEDIA', 'WEBSITE', 'SEO', 'GRAPHIC', 'HR', 'ACCOUNT', 'AMC', 'SALES', 'APPLICATION', ...new Set(rawDepts.map(d => d.toUpperCase()))]
    const role = profile?.systemRole || 'Employee'
    const hidden = role === 'Admin' ? [] : role === 'HR' ? ['ACCOUNT', 'SALES'] : role === 'Accountant' ? ['HR', 'SALES'] : role === 'Sales' ? ['HR', 'ACCOUNT'] : ['HR', 'ACCOUNT', 'SALES']
    return allDepts.filter(d => !hidden.includes(d))
  }, [projectTasks, profile?.systemRole])
  const deduplicatedDepts = [...new Set(uniqueDepts)]

  const recentTasks = useMemo(() => {
    let filtered = projectTasks
    if (filterTaskId !== 'All Tasks') {
      filtered = filtered.filter(t => t.id === filterTaskId)
    }
    if (filterDept !== 'All Departments') {
      filtered = filtered.filter(t => (t.department || 'COMMON').toUpperCase() === filterDept.toUpperCase())
    }

    return filtered.sort((a, b) => {
      const numA = parseInt(String(a.id).replace(/\D/g, '')) || 0
      const numB = parseInt(String(b.id).replace(/\D/g, '')) || 0
      return numB - numA
    }).slice(0, 15)
  }, [projectTasks, filterTaskId, filterDept])

  const allDocs = useMemo(() => {
    const docs = []
    projectTasks.forEach(t => {
      if (t.attachments && Array.isArray(t.attachments)) {
        t.attachments.forEach(att => {
          let docToPush = {
            taskId: t.id,
            taskTitle: t.title,
            ...att
          }

          // Try to enrich from driveDocs if possible to get real name and type
          const fileId = getDriveFileId(att.url)
          if (fileId && driveDocs) {
            const driveMatch = driveDocs.find(d => getDriveFileId(d.url) === fileId)
            if (driveMatch) {
              docToPush.name = driveMatch.name
              let typeStr = driveMatch.type
              if (typeStr.includes('pdf')) typeStr = 'pdf'
              else if (typeStr.includes('image')) typeStr = 'image'
              else typeStr = 'document'
              docToPush.type = typeStr
            }
          }
          docs.push(docToPush)
        })
      }

      // Also grab attachments sent in chat messages
      const msgs = messagesByChatId?.[t.id] || []
      msgs.forEach(m => {
        const text = m.text || ''
        if (text.startsWith('[Attachment:')) {
          const match = text.match(/^\[Attachment:([^|]+)\|([^|]+)\|([^\]]+)\]/)
          if (match) {
            let typeStr = match[2]
            if (typeStr.includes('pdf')) typeStr = 'pdf'
            else if (typeStr.includes('image')) typeStr = 'image'
            else typeStr = 'document'

            docs.push({
              taskId: t.id,
              taskTitle: t.title,
              name: match[1],
              type: typeStr,
              url: match[3]
            })
          }
        }
      })
    })

    // 3. Add files fetched directly from Drive
    driveDocs.forEach(d => {
      // Deduplicate by Google Drive File ID instead of exact URL to prevent showing the same file twice
      const fileId = getDriveFileId(d.url)
      const isDuplicate = docs.some(existing => {
        if (fileId && getDriveFileId(existing.url) === fileId) return true
        return existing.url === d.url
      })

      if (!isDuplicate) {
        let typeStr = d.type
        if (typeStr.includes('pdf')) typeStr = 'pdf'
        else if (typeStr.includes('image')) typeStr = 'image'
        else typeStr = 'document'

        docs.push({
          taskId: 'N/A',
          taskTitle: d.department + ' Folder',
          name: d.name,
          type: typeStr,
          url: d.url,
          department: d.department
        })
      }
    })

    // Apply Filters
    let filteredDocs = docs
    if (filterTaskId !== 'All Tasks') {
      // If filtering by specific task ID, only show attachments tied to that task.
      // Drive documents (N/A) will be hidden unless we specifically match somehow.
      filteredDocs = filteredDocs.filter(d => d.taskId === filterTaskId)
    }

    if (filterDept !== 'All Departments') {
      filteredDocs = filteredDocs.filter(d => {
        if (d.taskId === 'N/A') {
          // Check drive file department
          return (d.department || '').toUpperCase() === filterDept.toUpperCase() ||
            (d.taskTitle || '').toUpperCase().includes(filterDept.toUpperCase())
        } else {
          // Check task department
          const parentTask = projectTasks.find(t => t.id === d.taskId)
          if (parentTask) {
            return (parentTask.department || 'COMMON').toUpperCase() === filterDept.toUpperCase()
          }
          return true
        }
      })
    }

    return filteredDocs
  }, [projectTasks, messagesByChatId, driveDocs, filterTaskId, filterDept])

  const totalTasks = projectTasks.length
  const completedTasks = projectTasks.filter(t => t.status === 'Done').length
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  const handleUploadClick = () => {
    if (filterDept === 'All Departments') {
      addToast('Please select a specific department from the filter first.', 'error')
      return
    }
    setUploadDept(filterDept)
    if (fileInputRef.current) fileInputRef.current.click()
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !uploadDept) return
    setIsUploading(true)
    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch('https://script.google.com/macros/s/AKfycbzs69465Gintz_UEvY_IjcncUVK_8SGKYxRolbUGpmh--HzqRzxNCYUNX36koPlYrWg/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'upload_file',
          filename: file.name,
          mimeType: file.type,
          base64: base64Data.split(',')[1],
          projectName,
          department: uploadDept
        })
      })
      const data = await res.json()
      if (data.ok) {
        addToast('File uploaded to Drive successfully!', 'success')
      } else {
        throw new Error(data.error || 'Upload failed')
      }
    } catch (error) {
      addToast('Upload failed: ' + error.message, 'error')
    } finally {
      setIsUploading(false)
      setUploadDept(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background, #F0EDF8)', display: 'flex' }}>
      <Sidebar />

      <main className="page-main">
        <TopNav title={projectName} showSearch={true} />

        {!isPunchedIn ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center max-w-md bg-white p-8 rounded-xl shadow-sm border border-gray-100 w-full">
              <span className="material-symbols-outlined text-[48px] text-gray-300 mb-4 block">work_off</span>
              <h2 className="text-[18px] font-bold text-[#1E1B2E] mb-2">You are currently Punched Out</h2>
              <p className="text-[13px] text-gray-500">Please Punch In from the top navigation bar to view project details and manage tasks.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header Area */}
        <div className="bg-white border-b border-[#E5E7EB] pt-6 px-4 md:px-8 flex-shrink-0 shadow-sm z-10">
          <div className="flex flex-col gap-4">
            <h1 className="text-[18px] font-extrabold text-[#1E1B2E] flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-[#4B5563]">domain</span>
              Projects / {projectName}
            </h1>

            {/* Tabs and Filters Row */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Tabs */}
              <div className="flex items-center gap-6">
                <button className="px-1 py-3 text-[13px] font-extrabold text-[#702c91] border-b-2 border-[#702c91] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">info</span>
                  Overview
                </button>
                <button
                  onClick={() => navigate('/tasks', { state: { clientFilter: projectName } })}
                  className="px-1 py-3 text-[13px] font-bold text-[#6B7280] hover:text-[#1E1B2E] flex items-center gap-2 transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">list</span>
                  Tasks List
                </button>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-6 mb-1">
                <SelectDropdown value={filterTaskId} onChange={setFilterTaskId} options={uniqueTaskIds} style={{ width: 160 }} />
                <SelectDropdown value={filterDept} onChange={setFilterDept} options={deduplicatedDepts} style={{ width: 180 }} />
              </div>
            </div>
          </div>
        </div>


        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
          <div className="w-full flex flex-col gap-6">

            {/* Project Progress */}
            <div className="bg-white p-6 rounded-[16px] shadow-sm flex flex-col md:flex-row md:items-center gap-6 justify-between">
              <div>
                <h2 className="text-[16px] font-extrabold text-[#1E1B2E] flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#F5F3FF] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[#702c91] text-[18px]">data_usage</span>
                  </div>
                  Project Progress
                </h2>
                <p className="text-[12px] text-[#6B7280] mt-1 ml-10">Track the overall completion of all projects</p>
              </div>
              <div className="flex-1 max-w-[400px]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-extrabold text-[#1E1B2E]">Overall Completion</span>
                  <span className="text-[12px] font-extrabold text-[#702c91]">{completedTasks} / {totalTasks} Tasks</span>
                </div>
                <div className="w-full h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000 bg-[#702c91]"
                    style={{ width: `${progressPct}%` }}
                  ></div>
                </div>
                <p className="text-[10px] text-[#9CA3AF] mt-2 text-right">{progressPct}% Completed</p>
              </div>
            </div>

            <div className="text-center py-4 text-secondary/80 text-sm hidden">
              Get the most out of your Overview! See recent tasks and all attachments related to <strong>{projectName}</strong> below.
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Recent Tasks Card */}
              <div className="bg-white rounded-[16px] shadow-sm overflow-hidden flex flex-col h-[500px]">
                <div className="p-6 pb-2 flex items-center justify-between flex-shrink-0">
                  <h2 className="text-[16px] font-extrabold text-[#1E1B2E]">Recent Tasks</h2>
                  <button className="text-[12px] font-extrabold text-[#702c91] hover:underline">View all</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  {recentTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-[#9CA3AF]">
                      <span className="material-symbols-outlined text-[32px] mb-2">inbox</span>
                      <p className="text-[13px] font-bold">No recent tasks</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {recentTasks.map(task => {
                        const isOverdue = task.status !== 'Done' && new Date(task.dueDate) < new Date();
                        return (
                          <div
                            key={task.id}
                            onClick={() => navigate(`/tasks/${task.id}`)}
                            className="flex items-start justify-between gap-3 cursor-pointer group"
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isOverdue ? 'bg-[#FEF2F2] text-[#EF4444]' : 'bg-[#FEF9C3] text-[#EAB308]'}`}>
                                <span className="material-symbols-outlined text-[18px]">
                                  {isOverdue ? 'warning' : 'assignment'}
                                </span>
                              </div>
                              <div className="flex flex-col min-w-0">
                                <p className="text-[13px] font-extrabold text-[#1E1B2E] truncate group-hover:text-[#702c91] transition-colors">
                                  {task.title} <span className="text-[#9CA3AF] font-medium text-[11px] ml-1">#{task.id}</span>
                                </p>
                                <p className="text-[11px] text-[#6B7280] truncate mt-0.5">
                                  {task.dueDate} • {task.client}
                                </p>
                              </div>
                            </div>

                            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-extrabold shrink-0 border ${task.status === 'Done' ? 'bg-[#ECFDF5] text-[#10B981] border-[#A7F3D0]' :
                                isOverdue ? 'bg-[#FEF2F2] text-[#EF4444] border-[#FECACA]' :
                                  task.status === 'In Progress' ? 'bg-[#FEF9C3] text-[#EAB308] border-[#FEF08A]' :
                                    'bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]'
                              }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${task.status === 'Done' ? 'bg-[#10B981]' :
                                  isOverdue ? 'bg-[#EF4444]' :
                                    task.status === 'In Progress' ? 'bg-[#EAB308]' :
                                      'bg-[#9CA3AF]'
                                }`}></span>
                              {task.status === 'Done' ? 'Done' : isOverdue ? 'Overdue' : task.status}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Docs / Attachments Card */}
              <div className="bg-white rounded-[16px] shadow-sm overflow-hidden flex flex-col h-[500px]">
                <div className="p-6 pb-2 border-[#E5E7EB] flex-shrink-0 flex items-center justify-between">
                  <h2 className="text-[16px] font-extrabold text-[#1E1B2E] flex items-center gap-2">
                    Docs & Attachments
                    {isLoadingDocs && (
                      <span className="material-symbols-outlined animate-spin text-[#702c91] ml-2 text-[18px]">
                        refresh
                      </span>
                    )}
                  </h2>
                  <div className="flex bg-[#F9FAFB] rounded-lg p-1 border border-[#E5E7EB]">
                    <button
                      onClick={() => setDocsViewMode('List')}
                      className={`p-1.5 rounded text-[#9CA3AF] hover:text-[#1E1B2E] transition-all ${docsViewMode === 'List' ? 'bg-[#F5F3FF] text-[#702c91]' : ''}`}
                      title="List View"
                    >
                      <span className="material-symbols-outlined text-[18px]">view_list</span>
                    </button>
                    <button
                      onClick={() => setDocsViewMode('Grid')}
                      className={`p-1.5 rounded text-[#9CA3AF] hover:text-[#1E1B2E] transition-all ${docsViewMode === 'Grid' ? 'bg-[#F5F3FF] text-[#702c91]' : ''}`}
                      title="Grid View"
                    >
                      <span className="material-symbols-outlined text-[18px]">grid_view</span>
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                  {allDocs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-secondary opacity-60">
                      <span className="material-symbols-outlined text-[32px] mb-2">folder_off</span>
                      <p>No documents attached to any tasks</p>
                    </div>
                  ) : (
                    <div className={docsViewMode === 'Grid' ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : "grid grid-cols-1 gap-3"}>
                      {allDocs.map((doc, i) => (
                        docsViewMode === 'Grid' ? (
                          <a
                            key={i}
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex flex-col rounded-2xl border border-outline-variant hover:border-primary/50 hover:bg-surface-container bg-surface-container-lowest transition-all group shadow-sm text-center h-[180px] overflow-hidden"
                          >
                            <div className="w-full h-24 bg-surface-container-low flex items-center justify-center shrink-0 border-b border-outline-variant/30 relative overflow-hidden">
                              {getDriveFileId(doc.url) ? (
                                <>
                                  <img
                                    src={`https://drive.google.com/thumbnail?id=${getDriveFileId(doc.url)}&sz=w500`}
                                    alt={doc.name}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    onError={(e) => {
                                      e.target.style.display = 'none';
                                      if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                                    }}
                                  />
                                  <div className="hidden absolute inset-0 w-full h-full items-center justify-center bg-primary/10 text-primary group-hover:scale-105 transition-transform duration-300">
                                    <span className="material-symbols-outlined text-[32px]">
                                      {doc.type === 'pdf' ? 'picture_as_pdf' :
                                        doc.type === 'image' ? 'image' :
                                          doc.type === 'document' ? 'article' : 'insert_drive_file'}
                                    </span>
                                  </div>
                                </>
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary group-hover:scale-105 transition-transform duration-300">
                                  <span className="material-symbols-outlined text-[32px]">
                                    {doc.type === 'pdf' ? 'picture_as_pdf' :
                                      doc.type === 'image' ? 'image' :
                                        doc.type === 'document' ? 'article' : 'insert_drive_file'}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="w-full flex-1 flex flex-col items-center justify-center p-3">
                              <p className="text-[12px] font-bold text-on-surface line-clamp-1 px-1 group-hover:text-primary transition-colors" title={doc.name}>
                                {getDisplayName(doc.name)}
                              </p>
                              <div className="text-[10px] text-secondary mt-1 flex flex-col items-center gap-1 w-full px-1">
                                {doc.taskId === 'N/A' ? (
                                  <span className="font-bold text-primary truncate max-w-full">
                                    Drive &rarr; {doc.taskTitle.replace(' Folder', '')}
                                  </span>
                                ) : (
                                  <Link
                                    to={`/tasks/${doc.taskId}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="font-bold text-primary hover:underline truncate max-w-full"
                                  >
                                    {doc.taskId} - {doc.taskTitle}
                                  </Link>
                                )}
                              </div>
                            </div>
                          </a>
                        ) : (
                          <a
                            key={i}
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start justify-between gap-4 py-3 group"
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${doc.type === 'pdf' ? 'bg-[#FEF2F2] text-[#EF4444]' :
                                  doc.type === 'image' ? 'bg-[#ECFDF5] text-[#10B981]' :
                                    'bg-[#F0FDF4] text-[#22C55E]'
                                }`}>
                                <span className="material-symbols-outlined">
                                  {doc.type === 'pdf' ? 'picture_as_pdf' :
                                    doc.type === 'image' ? 'image' :
                                      doc.type === 'document' ? 'article' : 'insert_drive_file'}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-extrabold text-[#1E1B2E] truncate group-hover:text-[#702c91] transition-colors" title={doc.name}>
                                  {getDisplayName(doc.name)}
                                </p>
                                <div className="text-[11px] text-[#6B7280] mt-0.5 truncate">
                                  {doc.taskId === 'N/A' ? (
                                    <span className="truncate">
                                      {doc.taskTitle}
                                    </span>
                                  ) : (
                                    <span className="truncate">
                                      In {doc.taskTitle}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <span className="material-symbols-outlined text-[#9CA3AF] opacity-0 group-hover:opacity-100 transition-opacity">
                              download
                            </span>
                          </a>
                        )
                      ))}
                    </div>
                  )}
                </div>
                <div className="p-4 bg-white shrink-0 flex gap-3">
                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                  <button
                    onClick={handleUploadClick}
                    disabled={isUploading}
                    className="flex-1 py-2.5 rounded-lg border border-[#E5E7EB] border-dashed text-[13px] font-bold text-[#6B7280] hover:text-[#702c91] hover:border-[#702c91] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">{isUploading ? 'sync' : 'upload'}</span>
                    {isUploading ? 'Uploading...' : 'Upload File'}
                  </button>
                </div>
              </div>



            </div>
          </div>
        </div>


          </>
        )}
      </main>
    </div>
  )
}

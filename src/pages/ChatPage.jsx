import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import EmojiPicker from 'emoji-picker-react'
import Sidebar from '../components/Sidebar'
import { useApp, getPersonalChatRoomId } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { renderAvatar } from '../utils/avatar'
import { useGoogleLogin } from '@react-oauth/google'
import CHAT_BACKGROUNDS from '../data/chatBackgrounds'
import { API_BASE_URL } from '../config'
export function renderMessageTextWithMentions(text, isSent = false, employeeNames = []) {
  if (!text) return null

  // Build dynamic regex using exact employee names if available, falling back to a general word pattern
  let namePattern = '[A-Z][a-zA-Z]+(?:\\s[A-Z][a-zA-Z]+)?';
  if (employeeNames && employeeNames.length > 0) {
    // Sort by length descending to match longest names first (e.g. "Mansi Shah" before "Mansi")
    const sortedNames = [...employeeNames].sort((a, b) => b.length - a.length);
    namePattern = sortedNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  }

  const regex = new RegExp(`(@(?:all|${namePattern})|https?:\\/\\/[^\\s]+|www\\.[^\\s]+|[\\w.+-]+@[\\w-]+\\.[\\w.-]+)`, 'g');
  const parts = text.split(regex);

  return (
    <p className="text-[13px] whitespace-pre-wrap leading-relaxed break-words">
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith('@')) {
          return (
            <span key={i} className={`inline-block px-1.5 py-0.5 rounded font-bold mx-0.5 ${isSent ? 'bg-surface-container-lowest/25 text-white' : 'bg-primary/10 text-primary'
              }`}>
              {part}
            </span>
          )
        }
        let linkHref = null;
        if (part.match(/^https?:\/\//i)) {
          linkHref = part;
        } else if (part.match(/^www\./i)) {
          linkHref = 'https://' + part;
        } else if (part.match(/^[\w.+-]+@[\w-]+\.[\w.-]+$/i)) {
          linkHref = 'mailto:' + part;
        }
        if (linkHref) {
          return (
            <a
              key={i}
              href={linkHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`underline underline-offset-2 hover:opacity-80 transition-opacity ${isSent ? 'text-white font-semibold' : 'text-primary font-semibold'}`}
            >
              {part}
            </a>
          )
        }
        return part;
      })}
    </p>
  )
}

// Render message text with quoted reply and file attachment parsing
export function renderMessageText(text, isSent = false, isDeleted = false, employeeNames = [], onImageClick, onReplyClick) {
  if (isDeleted) {
    return (
      <div className={`flex items-center gap-1 italic text-[13px] ${isSent ? 'text-white/70' : 'text-outline/70'}`}>
        <span className="material-symbols-outlined text-[16px]">do_not_disturb</span>
        This message was deleted
      </div>
    )
  }

  if (!text) return null

  let currentText = text
  let replyNode = null

  // Parse Quote Reply [Reply:sender|messageText] or [Reply:sender|messageText|messageId]
  const replyMatch = currentText.match(/^\[Reply:([^|]+)\|([^|]+)(?:\|([^\]]+))?\](.*)/)
  if (replyMatch) {
    const [_, rSender, rText, rMsgId, rest] = replyMatch
    const cleanReplyText = rText.replace(/\[(?:Attachment|Reply|Meeting|Edit):[^\]]*\]/g, '').trim() || '(media)'
    replyNode = (
      <div
        className={`border-l-2 pl-2 py-1 pr-1.5 rounded mb-2 text-left text-[11px] max-w-[280px] md:max-w-[340px] ${isSent ? 'border-white/50 bg-surface-container-lowest/10 text-white' : 'border-primary bg-black/5 text-on-surface'} ${onReplyClick ? 'cursor-pointer hover:opacity-80' : ''}`}
        onClick={onReplyClick ? (e) => { e.stopPropagation(); onReplyClick(rMsgId, rSender, cleanReplyText) } : undefined}
      >
        <span className={`font-bold block ${isSent ? 'text-white' : 'text-primary'}`}>{rSender}</span>
        <span className={`truncate block ${isSent ? 'text-white/80' : 'text-outline'}`}>{cleanReplyText}</span>
      </div>
    )
    currentText = rest.trim()
  }

  // Parse File Attachment [Attachment:name|type|dataUrl]
  const match = currentText.match(/^\[Attachment:([^|]+)\|([^|]+)\|([^\]]+)\](.*)/)
  if (match) {
    const [_, name, type, dataUrl, restText] = match
    const isImage = type.startsWith('image/')

    return (
      <div className="flex flex-col gap-2 text-left">
        {replyNode}
        <div className="bg-black/5 rounded-lg p-2 flex flex-col gap-2 max-w-[240px] md:max-w-[320px]">
          {isImage ? (
            <div className="block overflow-hidden rounded border border-outline-variant hover:opacity-90 transition-opacity cursor-pointer" onClick={() => onImageClick && onImageClick(dataUrl)}>
              <img src={dataUrl} alt={name} className="max-h-[160px] object-contain mx-auto" />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[32px]">
                description
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body-sm font-semibold truncate leading-tight">{name}</p>
                <p className="text-[10px] text-outline font-medium">Attachment</p>
              </div>
              <a
                href={dataUrl}
                download={name}
                className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-all flex-shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">download</span>
              </a>
            </div>
          )}
        </div>
        {restText && renderMessageTextWithMentions(restText, isSent, employeeNames)}
      </div>
    )
  }

  // Parse Meeting [Meeting:url]
  const meetMatch = currentText.match(/^\[Meeting:([^\]]+)\](.*)/)
  if (meetMatch) {
    const [_, url, restText] = meetMatch
    return (
      <div className="flex flex-col gap-2 my-1 text-left">
        {replyNode}
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-[20px]">videocam</span>
          <span className="font-bold text-sm">Video Meeting</span>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={`px-4 py-2 rounded-lg font-semibold text-center transition-colors shadow-sm ${isSent ? 'bg-surface-container-lowest text-primary hover:bg-gray-100' : 'bg-primary text-on-primary hover:opacity-90'
            }`}
        >
          Join Meeting
        </a>
        {restText && renderMessageTextWithMentions(restText, isSent, employeeNames)}
      </div>
    )
  }

  return (
    <div className="flex flex-col text-left">
      {replyNode}
      {renderMessageTextWithMentions(currentText, isSent, employeeNames)}
    </div>
  )
}

// Process original message stream to build virtual state of deletes, edits, and reactions
export function processMessagesList(messages, currentProfile) {
  if (!messages || messages.length === 0) return []

  const virtualMessages = {}
  const deletedIds = new Set()
  const reactionsMap = {} // { msgId: { emoji: Set of names } }

  // Filter out old "Done by Me" system messages from backend
  messages = messages.filter(m => {
    if (!m || !m.text) return true
    const text = String(m.text)
    if (text.includes('marked their part as complete')) return false
    if (text.includes('completed their part')) return false
    return true
  })

  messages.forEach(m => {
    if (!m || !m.text) return

    // 1. Check Delete Protocol
    const deleteMatch = m.text.match(/^\[Delete:([^\]]+)\]/)
    if (deleteMatch) {
      deletedIds.add(deleteMatch[1])
      return
    }

    // 2. Check Edit Protocol
    const editMatch = m.text.match(/^\[Edit:([^|]+)\|([^\]]+)\]/)
    if (editMatch) {
      const targetId = editMatch[1]
      const newText = editMatch[2]
      if (virtualMessages[targetId]) {
        virtualMessages[targetId].text = newText
        virtualMessages[targetId].isEdited = true
      }
      return
    }

    // 3. Check Reaction Protocol
    const reactMatch = m.text.match(/^\[React:([^|]+)\|([^|]+)\|([^\]]+)\]/)
    if (reactMatch) {
      const targetId = reactMatch[1]
      const emoji = reactMatch[2]
      const sender = reactMatch[3]

      if (!reactionsMap[targetId]) {
        reactionsMap[targetId] = {}
      }

      // Check if they already reacted with this exact emoji
      const hasThisEmoji = reactionsMap[targetId][emoji]?.has(sender)

      // Always remove the sender from ALL emojis for this message first
      Object.keys(reactionsMap[targetId]).forEach(existingEmoji => {
        if (reactionsMap[targetId][existingEmoji].has(sender)) {
          reactionsMap[targetId][existingEmoji].delete(sender)
        }
      })

      // If they didn't already have this exact emoji, add it (this makes it toggle OFF if they clicked the same one again)
      if (!hasThisEmoji) {
        if (!reactionsMap[targetId][emoji]) {
          reactionsMap[targetId][emoji] = new Set()
        }
        reactionsMap[targetId][emoji].add(sender)
      }
      return
    }

    // 4. Regular message
    virtualMessages[m.id] = { ...m }
  })

  // Build final processed messages array
  const result = []
  messages.forEach(m => {
    if (virtualMessages[m.id]) {
      const finalMsg = virtualMessages[m.id]
      if (deletedIds.has(m.id)) {
        finalMsg.isDeleted = true
        finalMsg.text = "This message was deleted"
      }

      // Merge existing reactions (directly set by handleToggleReaction) with protocol-based reactions from sheet
      // Protocol reactions win for conflicts; existing unsynced reactions are preserved so they don't blink out
      const msgReactions = reactionsMap[m.id] || {}
      const mergedReactions = {}
        ; (finalMsg.reactions || []).forEach(r => {
          mergedReactions[r.emoji] = r
        })
      Object.keys(msgReactions).forEach(emoji => {
        const users = Array.from(msgReactions[emoji])
        mergedReactions[emoji] = {
          emoji,
          count: users.length,
          users,
          hasReacted: users.includes(currentProfile?.name || 'Mansi Shah')
        }
      })
      finalMsg.reactions = Object.values(mergedReactions).filter(r => r.count > 0)

      result.push(finalMsg)
      delete virtualMessages[m.id]
    }
  })

  return result
}





export default function ChatPage() {
  const {
    personalChats,
    setPersonalChats,
    groupChats,
    setGroupChats,
    groupMembers,
    setGroupMembers,
    profile,
    employees,
    messagesByChatId,
    setMessagesByChatId,
    setActiveChatSession,
    fetchMessages,
    markChatAsRead,
    clearChatLocally,
    clearAllChatsLocally,
    deletePersonalChatLocally,
    restorePersonalChatLocally,
    clearedChatTimestamps,
    readReceiptsByChatId,
    messageStatusByChatId,
    setIsSidebarOpen,
    addToast
  } = useApp()

  const [chatBackgrounds, setChatBackgrounds] = useState(() => {
    try {
      const stored = localStorage.getItem('dd_chat_bgs')
      return stored ? JSON.parse(stored) : {}
    } catch {
      return {}
    }
  })
  const [showBgModal, setShowBgModal] = useState(false)

  const ALL_EMPLOYEES = employees || []
  const employeeStatusMap = useMemo(() => {
    const map = {}
    ALL_EMPLOYEES.forEach(e => { if (e.email) map[e.email.toLowerCase()] = e.status })
    return map
  }, [ALL_EMPLOYEES])
  const getOnline = useCallback((email) => {
    return email ? employeeStatusMap[email.toLowerCase()] === 'Online' : false
  }, [employeeStatusMap])
  const location = useLocation()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('personal') // 'personal' | 'groups'
  const [selectedChatId, setSelectedChatId] = useState(null)
  const [searchFilter, setSearchFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [attachedFile, setAttachedFile] = useState(null)
  const emojiPickerRef = useRef(null)
  const [replyTarget, setReplyTarget] = useState(null)
  const [editingMessage, setEditingMessage] = useState(null)
  const [hoveredMessageId, setHoveredMessageId] = useState(null)
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [showMoreDropdown, setShowMoreDropdown] = useState(false)
  const moreDropdownRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const prevChatIdRef = useRef(selectedChatId)
  const prevMessagesLengthRef = useRef(0)
  const [showAddMemberDropdown, setShowAddMemberDropdown] = useState(false)
  const addMemberDropdownRef = useRef(null)
  const isSendingRef = useRef(false)

  // Custom modal states
  const [editNameModal, setEditNameModal] = useState(false)
  const [confirmModal, setConfirmModal] = useState(null) // { title, message, onConfirm, danger }
  const [showSearchModal, setShowSearchModal] = useState(false)

  const [mentionIndex, setMentionIndex] = useState(-1)
  const [mentionFilter, setMentionFilter] = useState('')
  const textInputRef = useRef(null)
  const mentionDropdownRef = useRef(null)

  // Auto-open the correct personal chat when navigated from TeamPage
  useEffect(() => {
    const targetName = location.state?.openChatWithName
    if (!targetName) return

    const match = ALL_EMPLOYEES.find(
      (e) => e.name.toLowerCase() === targetName.toLowerCase()
    )
    if (match) {
      const roomId = getPersonalChatRoomId(profile, match)
      restorePersonalChatLocally(roomId)
      setActiveTab('personal')
      setSelectedChatId(roomId)
      // Clear location state after consumption to avoid locking the selection on re-renders
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, ALL_EMPLOYEES, profile, restorePersonalChatLocally, navigate, location.pathname])

  // Auto-open chat from Push Notification click
  useEffect(() => {
    const pendingChatId = localStorage.getItem('dd_pending_chat_nav')
    if (pendingChatId) {
      localStorage.removeItem('dd_pending_chat_nav')

      const isGroup = groupChats.some(g => String(g.id) === pendingChatId)
      if (isGroup) {
        setActiveTab('groups')
      } else {
        restorePersonalChatLocally(pendingChatId)
        setActiveTab('personal')
      }
      setSelectedChatId(pendingChatId)
    }
  }, [groupChats, restorePersonalChatLocally])

  const handleTextChange = (val, selectionStart) => {
    setText(val)
    if (activeTab !== 'groups') {
      setMentionIndex(-1)
      return
    }

    const beforeCursor = val.slice(0, selectionStart || val.length)
    const match = beforeCursor.match(/@([a-zA-Z0-9_\s]*)$/)

    if (match) {
      const atIdx = beforeCursor.lastIndexOf('@')
      if (atIdx === 0 || beforeCursor[atIdx - 1] === ' ') {
        setMentionIndex(atIdx)
        setMentionFilter(match[1])
        return
      }
    }
    setMentionIndex(-1)
  }

  const selectMention = (member) => {
    const beforeAt = text.slice(0, mentionIndex)
    const afterCursor = text.slice(textInputRef.current?.selectionStart || text.length)
    const newText = `${beforeAt}@${member.name} ${afterCursor}`
    setText(newText)
    setMentionIndex(-1)
    setTimeout(() => {
      if (textInputRef.current) {
        textInputRef.current.focus()
        const newCursorPos = beforeAt.length + member.name.length + 2
        textInputRef.current.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 50)
  }

  useEffect(() => {
    setActiveChatSession({ id: selectedChatId, tab: activeTab })
    return () => setActiveChatSession(null)
  }, [selectedChatId, activeTab, setActiveChatSession])

  // Close emoji picker, more dropdown, add member dropdown and mention dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false)
      }
      if (moreDropdownRef.current && !moreDropdownRef.current.contains(event.target)) {
        setShowMoreDropdown(false)
      }
      if (addMemberDropdownRef.current && !addMemberDropdownRef.current.contains(event.target)) {
        setShowAddMemberDropdown(false)
      }
      if (mentionDropdownRef.current &&
        !mentionDropdownRef.current.contains(event.target) &&
        textInputRef.current &&
        !textInputRef.current.contains(event.target)) {
        setMentionIndex(-1)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])



  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  // Retrieve current active chat object details
  const activeChat = selectedChatId
    ? activeTab === 'personal'
      ? personalChats.find((c) => String(c.id) === String(selectedChatId))
      : groupChats.find((g) => String(g.id) === String(selectedChatId))
    : null

  const currentBgId = activeChat ? (chatBackgrounds[activeChat.id] || 'default') : 'default'

  const getMessageTicks = (msg) => {
    if (msg.isFailed) {
      return (
        <span className="flex items-center gap-1 ml-1">
          <span className="text-error font-bold italic text-[9px]">Failed</span>
          <button onClick={() => handleResend(msg)} className="text-error hover:text-red-700 p-[1px] rounded-full hover:bg-red-50 flex items-center justify-center transition-colors" title="Resend">
            <span className="material-symbols-outlined text-[12px]">refresh</span>
          </button>
        </span>
      )
    }
    const isTemp = !msg.timestamp || String(msg.id).startsWith('temp_') || /^\d{13,}$/.test(String(msg.id))

    const roomStatus = messageStatusByChatId?.[selectedChatId] || { deliveredIds: {}, maxReadTime: 0 }

    let isRead = false
    let parsedMsgTime = msg.timestamp
    if (typeof parsedMsgTime === 'string' && /^\d+$/.test(parsedMsgTime)) parsedMsgTime = parseInt(parsedMsgTime, 10)
    const msgTime = new Date(parsedMsgTime).getTime()
    
    const persistedReceipts = readReceiptsByChatId?.[selectedChatId] || {}

    if (activeTab === 'personal') {
      if (!isNaN(msgTime) && msgTime <= roomStatus.maxReadTime) {
        isRead = true
      }
      let maxPersistedReadTime = 0
      Object.keys(persistedReceipts).forEach(email => {
        if (email !== profile?.email) {
          let pt = persistedReceipts[email]
          if (typeof pt === 'string' && /^\d+$/.test(pt)) pt = parseInt(pt, 10)
          const t = new Date(pt).getTime()
          if (t > maxPersistedReadTime) maxPersistedReadTime = t
        }
      })
      if (!isTemp && !isNaN(msgTime) && msgTime <= maxPersistedReadTime) {
        isRead = true
      }
    } else {
      // Group chat: need ALL other members to have read it
      const otherMemberEmails = (activeChat?.members || [])
        .filter(name => name !== profile?.name)
        .map(name => {
          const emp = ALL_EMPLOYEES.find(e => e.name === name)
          return emp ? emp.email : null
        })
        .filter(Boolean)

      if (otherMemberEmails.length > 0) {
        let allRead = true
        let debugTimes = []
        for (const email of otherMemberEmails) {
          let pt = persistedReceipts[email] || 0
          if (typeof pt === 'string' && /^\d+$/.test(pt)) pt = parseInt(pt, 10)
          const persistedTime = isTemp ? 0 : new Date(pt).getTime()
          const mqttTime = roomStatus.maxReadTimeByEmail?.[email] || 0
          const rTime = Math.max(isNaN(persistedTime) ? 0 : persistedTime, isNaN(mqttTime) ? 0 : mqttTime)
          debugTimes.push(`${email.split('@')[0]}:${rTime}`)
          if (rTime < msgTime) {
            allRead = false
          }
        }
        msg._debugInfo = `MsgTime:${msgTime} | ` + debugTimes.join(', ')
        if (allRead) isRead = true
      }
    }

    // (Removed strict readIds check to restore MQTT watermark logic for temp messages)

    if (isRead) {
      return <span className="material-symbols-outlined text-[14px] ml-1 text-blue-400 font-bold" title="Read">done_all</span>
    }

    if (roomStatus.deliveredIds[msg.id]) {
      return <span className="material-symbols-outlined text-[14px] ml-1 opacity-70" title={`Delivered | ${msg._debugInfo || ''}`}>done_all</span>
    }

    if (isTemp) {
      return <span className="material-symbols-outlined text-[14px] ml-1 opacity-50" title="Sent">done</span>
    }

    return <span className="material-symbols-outlined text-[14px] ml-1 opacity-70" title={`Stored | ${msg._debugInfo || ''}`}>done_all</span>
  }



  useEffect(() => {
    markChatAsRead(selectedChatId)
  }, [selectedChatId, messagesByChatId[selectedChatId]?.length, markChatAsRead])

  useEffect(() => {
    const chatChanged = prevChatIdRef.current !== selectedChatId
    const currentMsgs = messagesByChatId[selectedChatId] || []
    const currentLength = currentMsgs.length
    const prevLength = prevMessagesLengthRef.current
    const messagesAdded = !chatChanged && currentLength > prevLength

    if (chatChanged) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' })
    } else if (messagesAdded) {
      const lastMsg = currentMsgs[currentLength - 1]
      const sentByMe = lastMsg && lastMsg.type === 'sent'

      if (sentByMe) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      } else {
        if (messagesContainerRef.current) {
          const container = messagesContainerRef.current
          const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
          if (distanceFromBottom < 350) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
          }
        }
      }
    }

    prevChatIdRef.current = selectedChatId
    prevMessagesLengthRef.current = currentLength
  }, [messagesByChatId, selectedChatId])

  const scrollToMessage = (msgId, sender, text) => {
    document.querySelectorAll('.reply-highlight').forEach(el => el.classList.remove('reply-highlight'))

    let el = null
    if (msgId) {
      el = document.getElementById(`msg-${msgId}`)
    }

    if (!el && sender && text) {
      const candidates = document.querySelectorAll('[id^="msg-"]')
      for (const candidate of candidates) {
        if (candidate.textContent.includes(sender) && candidate.textContent.includes(text.substring(0, 30))) {
          el = candidate
          break
        }
      }
    }

    if (el) {
      el.classList.add('reply-highlight')
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => el.classList.remove('reply-highlight'), 2500)
    } else {
      addToast('Original message not available', 'warning')
    }
  }

  const handlePaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault()
        const blob = items[i].getAsFile()
        if (!blob) continue
        if (blob.size > 4 * 1024 * 1024) {
          addToast('File size should be less than 4MB', 'error')
          return
        }
        const reader = new FileReader()
        reader.onload = (event) => {
          setAttachedFile({
            name: blob.name || 'pasted-image.png',
            type: blob.type,
            dataUrl: event.target.result
          })
        }
        reader.readAsDataURL(blob)
        return
      }
    }
  }

  const webhookQueue = useRef(Promise.resolve())

  // Resume any offline/pending messages left over from a previous session or refresh
  useEffect(() => {
    const pending = JSON.parse(localStorage.getItem('dd_chat_offline_queue') || '[]')
    if (pending.length > 0) {
      localStorage.removeItem('dd_chat_offline_queue')
      pending.forEach(item => {
        sendWebhookPayload(item.payload, item.tempId)
      })
    }
  }, [])

  const sendWebhookPayload = (payload, tempId) => {
    if (tempId) {
      const queue = JSON.parse(localStorage.getItem('dd_chat_offline_queue') || '[]')
      if (!queue.find(q => String(q.tempId) === String(tempId))) {
        queue.push({ payload, tempId })
        localStorage.setItem('dd_chat_offline_queue', JSON.stringify(queue))
      }
    }

    webhookQueue.current = webhookQueue.current.then(async () => {
      try {
        // Publish to MQTT for instant zero-latency delivery to all other clients!
        if (window.mqttClient && window.mqttClient.connected) {
          window.mqttClient.publish('dd_chat_engine_v1/' + payload.roomId, JSON.stringify(payload))
        } else {
          // Fallback if global isn't available somehow, but it should be since AppContext exports it
          import('../context/AppContext.jsx').then(({ mqttClient }) => {
            if (mqttClient && mqttClient.connected) {
              mqttClient.publish('dd_chat_engine_v1/' + payload.roomId, JSON.stringify(payload))
            }
          })
        }

        const SCRIPT_URL = API_BASE_URL

        let success = false
        try {
          if (!SCRIPT_URL) return
          const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            // CRITICAL: Must use text/plain to bypass Apps Script CORS preflight block
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          })
          if (res.ok) {
            success = true
          }
        } catch (err) {
          console.warn(`Failed call to backend:`, err)
        }

        if (success && tempId) {
          const currentQueue = JSON.parse(localStorage.getItem('dd_chat_offline_queue') || '[]')
          const updatedQueue = currentQueue.filter(q => String(q.tempId) !== String(tempId))
          localStorage.setItem('dd_chat_offline_queue', JSON.stringify(updatedQueue))
          setMessagesByChatId(prev => {
            const list = prev[payload.roomId] || []
            return {
              ...prev,
              [payload.roomId]: list.map(m => String(m.id) === String(tempId) ? { ...m, sentLocally: true } : m)
            }
          })
        }

        // Delay drastically reduced because Apps Script handles concurrency much better than raw Google Sheets API
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (error) {
        console.error('Failed to send webhook payload:', error)
      }
    })
  }

  const handleStartEdit = (m) => {
    let rawText = m.text
    const replyMatch = rawText.match(/^\[Reply:([^|]+)\|([^\]]+)\](.*)/)
    if (replyMatch) {
      rawText = replyMatch[3].trim()
    }
    const attachMatch = rawText.match(/^\[Attachment:([^|]+)\|([^|]+)\|([^\]]+)\](.*)/)
    if (attachMatch) {
      rawText = attachMatch[4].trim()
    }
    setEditingMessage(m)
    setReplyTarget(null)
    setText(rawText)
  }

  const handleDeleteMessage = (messageId) => {
    setConfirmModal({
      title: 'Delete Message',
      message: 'Are you sure you want to delete this message?',
      icon: 'delete',
      danger: true,
      onConfirm: async () => {
        const deletePayloadText = `[Delete:${messageId}]`
        const sender = profile?.name || 'Mansi Shah'

        setMessagesByChatId((prev) => {
          const list = prev[selectedChatId] || []
          const newDeleteMsg = {
            id: `temp_${Date.now()}`,
            text: deletePayloadText,
            sender: sender,
            type: 'sent',
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }),
            timestamp: new Date().toISOString()
          }
          return {
            ...prev,
            [selectedChatId]: [...list, newDeleteMsg]
          }
        })

        const payload = {
          id: `temp_${Date.now()}`,
          action: 'send',
          roomId: String(selectedChatId),
          senderId: profile?.email || 'mansi@dreamsdesign.in',
          senderName: profile?.name || 'Mansi Shah',
          message: deletePayloadText,
          groupName: activeTab === 'groups' ? (activeChat?.name || 'Unnamed Group') : '',
          timestamp: new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          }).replace(/(\d+)\/(\d+)\/(\d+),/, '$3-$1-$2'),
          type: activeTab === 'personal' ? 'personal' : 'group'
        }

        sendWebhookPayload(payload, payload.id)
        setConfirmModal(null)
      }
    })
  }

  const handleToggleReaction = async (messageId, emoji) => {
    const sender = profile?.name || 'Mansi Shah'

    // 1. Directly update the target message's reactions for instant UI
    // 2. Also inject a [React:...] protocol message so fetchMessages merge doesn't lose it
    setMessagesByChatId((prev) => {
      const list = prev[selectedChatId] || []
      const reactPayloadText = `[React:${messageId}|${emoji}|${sender}]`
      const protocolMsg = {
        id: `temp_${Date.now()}`,
        text: reactPayloadText,
        sender,
        type: 'sent',
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }),
        timestamp: new Date().toISOString(),
      }
      return {
        ...prev,
        [selectedChatId]: list.map(m => {
          if (String(m.id) !== String(messageId)) return m
          const existing = m.reactions || []
          const hasReactedWithThis = existing.some(r => r.emoji === emoji && r.users.includes(sender))

          let next
          if (hasReactedWithThis) {
            next = existing.map(r => {
              if (r.emoji !== emoji) return r
              const u = r.users.filter(x => x !== sender)
              return { ...r, users: u, count: u.length }
            }).filter(r => r.count > 0)
          } else {
            next = existing
              .map(r => ({
                ...r,
                users: r.users.filter(x => x !== sender),
                count: r.users.filter(x => x !== sender).length,
                hasReacted: r.emoji === emoji,
              }))
              .filter(r => r.count > 0)
            const idx = next.findIndex(r => r.emoji === emoji)
            if (idx !== -1) {
              next[idx].users.push(sender); next[idx].count++; next[idx].hasReacted = true
            } else {
              next.push({ emoji, count: 1, users: [sender], hasReacted: true })
            }
          }
          return { ...m, reactions: next }
        }).concat(protocolMsg),
      }
    })

    // Send to sheet + MQTT for persistence / other clients
    const reactPayloadText = `[React:${messageId}|${emoji}|${sender}]`
    const now = new Date().toISOString()
    const payload = {
      id: `temp_${Date.now()}`,
      action: 'send',
      roomId: String(selectedChatId),
      senderId: profile?.email || 'mansi@dreamsdesign.in',
      senderName: profile?.name || 'Mansi Shah',
      message: reactPayloadText,
      timestamp: now,
      groupName: activeTab === 'groups' ? (activeChat?.name || 'Unnamed Group') : '',
      type: activeTab === 'personal' ? 'personal' : 'group'
    }
    sendWebhookPayload(payload, payload.id)
  }

  const createMeetingEvent = async (accessToken) => {
    try {
      const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary: 'Dreamsdesk Instant Meeting',
          start: { dateTime: new Date().toISOString() },
          end: { dateTime: new Date(Date.now() + 3600000).toISOString() },
          conferenceData: {
            createRequest: {
              requestId: `dd-meet-${Date.now()}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' }
            }
          }
        })
      });

      const data = await response.json();
      if (data.conferenceData && data.conferenceData.entryPoints) {
        const meetLink = data.conferenceData.entryPoints.find(e => e.entryPointType === 'video').uri;
        sendMeetingMessage(meetLink);
      } else {
        addToast("Failed to create Google Meet link. Please ensure Google Calendar is enabled for your account.", 'error');
      }
    } catch (err) {
      console.error(err);
      addToast("Error creating meeting: " + err.message, 'error');
    }
  }

  const googleLoginForMeeting = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      createMeetingEvent(tokenResponse.access_token);
    },
    scope: 'https://www.googleapis.com/auth/calendar.events',
    onError: () => addToast('Google authentication failed. Cannot create meeting.', 'error')
  });

  const handleCreateMeeting = () => {
    googleLoginForMeeting();
  }

  const sendMeetingMessage = (meetingUrl) => {
    const finalMessageText = `[Meeting:${meetingUrl}]`

    const tempId = String(Date.now())
    const isoTimestamp = new Date().toISOString()
    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })

    const newMessage = {
      id: tempId,
      type: 'sent',
      text: finalMessageText,
      time: now,
      timestamp: isoTimestamp
    }

    setMessagesByChatId((prev) => ({
      ...prev,
      [selectedChatId]: [...(prev[selectedChatId] || []), newMessage],
    }))

    const previewDisplay = 'ðŸ“¹ Video Meeting'

    if (activeTab === 'personal') {
      setPersonalChats((prev) =>
        prev.map((c) =>
          c.id === selectedChatId ? { ...c, preview: previewDisplay, time: now } : c
        )
      )
    } else {
      setGroupChats((prev) =>
        prev.map((g) =>
          g.id === selectedChatId ? { ...g, preview: `You: ${previewDisplay}`, time: now } : g
        )
      )
    }

    const payload = {
      id: tempId,
      action: 'send',
      roomId: String(selectedChatId),
      senderId: profile?.email || 'mansi@dreamsdesign.in',
      senderName: profile?.name || 'Mansi Shah',
      message: finalMessageText,
      groupName: activeTab === 'groups' ? (activeChat?.name || 'Unnamed Group') : '',
      timestamp: isoTimestamp,
      type: activeTab === 'personal' ? 'personal' : 'group'
    }

    sendWebhookPayload(payload, tempId)
  }

  const handleSend = async () => {
    if (!text.trim() && !attachedFile) return
    if (isSendingRef.current) return
    isSendingRef.current = true

    // Release lock in next tick to avoid React batching duplication
    setTimeout(() => {
      isSendingRef.current = false
    }, 100)

    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
    const tempId = String(Date.now())

    let finalMessageText = text.trim()

    if (editingMessage) {
      // Message Editing Mode
      finalMessageText = `[Edit:${editingMessage.id}|${text.trim()}]`

      setMessagesByChatId(prev => {
        const list = prev[selectedChatId] || []
        return {
          ...prev,
          [selectedChatId]: list.map(m => m.id === editingMessage.id ? { ...m, text: text.trim(), isEdited: true } : m)
        }
      })
    } else {
      // Normal message Mode (possibly with Reply and/or Attachment)
      if (replyTarget) {
        const replyPreview = (replyTarget.text || '')
          .replace(/\[(?:Attachment|Reply|Meeting|Edit):[^\]]*\]/g, '')
          .trim()
          .replace(/\|/g, '\uFF5C')
          .substring(0, 150) || '(media)'
        finalMessageText = `[Reply:${replyTarget.sender || 'You'}|${replyPreview}|${replyTarget.id}]${finalMessageText}`
      }
      if (attachedFile) {
        finalMessageText = `[Attachment:${attachedFile.name}|${attachedFile.type}|${attachedFile.dataUrl}]${finalMessageText}`
      }

      const isoTimestamp = new Date().toISOString()

      const newMessage = {
        id: tempId,
        type: 'sent',
        text: finalMessageText,
        time: now,
        timestamp: isoTimestamp
      }

      setMessagesByChatId((prev) => ({
        ...prev,
        [selectedChatId]: [...(prev[selectedChatId] || []), newMessage],
      }))
    }

    const previewDisplay = attachedFile ? `ðŸ“Ž File: ${attachedFile.name}` : text.trim()

    // Update preview text in chat list
    if (activeTab === 'personal') {
      setPersonalChats((prev) =>
        prev.map((c) =>
          c.id === selectedChatId ? { ...c, preview: previewDisplay, time: now } : c
        )
      )
    } else {
      setGroupChats((prev) =>
        prev.map((g) =>
          g.id === selectedChatId ? { ...g, preview: `You: ${previewDisplay}`, time: now } : g
        )
      )
    }

    const payload = {
      id: tempId,
      action: 'send',
      roomId: String(selectedChatId),
      senderId: profile?.email || 'mansi@dreamsdesign.in',
      senderName: profile?.name || 'Mansi Shah',
      message: finalMessageText,
      groupName: activeTab === 'groups' ? (activeChat?.name || 'Unnamed Group') : '',
      timestamp: new Date().toISOString(),
      type: activeTab === 'personal' ? 'personal' : 'group'
    }

    setText('')
    setAttachedFile(null)
    setReplyTarget(null)
    setEditingMessage(null)

    sendWebhookPayload(payload, payload.id)
  }

  const handleResend = (msg) => {
    const newTimestamp = new Date().toISOString()

    // Reset the failed state instantly so it shows 'Sending...' again
    setMessagesByChatId(prev => {
      const list = prev[selectedChatId] || []
      return {
        ...prev,
        [selectedChatId]: list.map(m => m.id === msg.id ? { ...m, isFailed: false, sentLocally: false, timestamp: newTimestamp } : m)
      }
    })

    const payload = {
      id: msg.id,
      action: 'send',
      roomId: String(selectedChatId),
      senderId: profile?.email || 'mansi@dreamsdesign.in',
      senderName: profile?.name || 'Mansi Shah',
      message: msg.text,
      groupName: activeTab === 'groups' ? (activeChat?.name || 'Unnamed Group') : '',
      timestamp: newTimestamp,
      type: activeTab === 'personal' ? 'personal' : 'group'
    }

    sendWebhookPayload(payload, payload.id)
  }

  const handleEditChatName = () => {
    setShowMoreDropdown(false)
    if (!activeChat) return
    setEditNameModal(true)
  }

  const handleEditNameConfirm = (newName) => {
    if (newName && newName.trim()) {
      if (activeTab === 'personal') {
        setPersonalChats(prev => prev.map(c => c.id === selectedChatId ? { ...c, name: newName.trim() } : c))
      } else {
        setGroupChats(prev => prev.map(g => g.id === selectedChatId ? { ...g, name: newName.trim() } : g))
      }
    }
    setEditNameModal(false)
  }

  const handleClearChatMessages = () => {
    setShowMoreDropdown(false)
    setConfirmModal({
      title: 'Clear Chat',
      message: 'Are you sure you want to clear all messages in this conversation? This cannot be undone.',
      icon: 'cleaning_services',
      danger: true,
      onConfirm: () => {
        // Use persistent clear so messages don't reappear after the next poll
        clearChatLocally(selectedChatId)
        setConfirmModal(null)
      }
    })
  }

  const handleDeleteChatRoom = () => {
    setShowMoreDropdown(false)
    setConfirmModal({
      title: 'Delete Chat',
      message: `Are you sure you want to permanently delete the conversation with ${activeChat?.name}? This cannot be undone.`,
      icon: 'delete',
      danger: true,
      onConfirm: () => {
        if (activeTab === 'personal') {
          // Persist deletion so it doesn't reappear after fetchTeam refresh
          deletePersonalChatLocally(selectedChatId)
          const filtered = personalChats.filter(c => c.id !== selectedChatId)
          if (filtered.length > 0) setSelectedChatId(filtered[0].id)
        } else {
          const filtered = groupChats.filter(g => g.id !== selectedChatId)
          setGroupChats(filtered)
          if (filtered.length > 0) setSelectedChatId(filtered[0].id)
        }
        setConfirmModal(null)
      }
    })
  }

  const unreadPersonal = personalChats.reduce((acc, c) => acc + (c.unread || 0), 0)
  const unreadGroups = groupChats.reduce((acc, g) => acc + (g.unread || 0), 0)

  // Helper to get latest message timestamp for sorting
  const getLatestTimestamp = (chatId) => {
    const msgs = messagesByChatId[chatId]
    if (!msgs || msgs.length === 0) return 0
    // Try to find the latest valid timestamp
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].timestamp) {
        return new Date(msgs[i].timestamp).getTime() || 0
      }
    }
    return 0
  }

  // Filter conversation list based on search term and sort by latest message timestamp (WhatsApp style)
  const filteredPersonal = personalChats
    .filter((c) => c.name.toLowerCase().includes(searchFilter.toLowerCase()))
    .sort((a, b) => getLatestTimestamp(b.id) - getLatestTimestamp(a.id))
    
  const filteredGroups = groupChats
    .filter((g) => g.name.toLowerCase().includes(searchFilter.toLowerCase()))
    .sort((a, b) => getLatestTimestamp(b.id) - getLatestTimestamp(a.id))

  // Apply clear-chat filter at render time so locally-sent messages always show immediately
  const clearTs = clearedChatTimestamps?.[String(selectedChatId)]
  const rawMessages = messagesByChatId[selectedChatId] || []
  const visibleMessages = clearTs
    ? rawMessages.filter(m => {
      if (!m.timestamp) return true
      return new Date(m.timestamp).getTime() > clearTs
    })
    : rawMessages
  const activeMessages = processMessagesList(visibleMessages, profile)


  const activeMembersList = (groupMembers[selectedChatId] || []).map(m => {
    const matched = ALL_EMPLOYEES.find(e => e.name.toLowerCase() === m.name.toLowerCase())
    return {
      name: m.name,
      role: matched?.role || m.role,
      avatar: matched?.avatar || m.avatar
    }
  })
  const notInGroup = ALL_EMPLOYEES.filter((e) => !activeMembersList.some((m) => m.name.toLowerCase() === e.name.toLowerCase()))

  // Handle new group creation
  const handleCreateGroup = (groupName, selectedIds) => {
    const newId = Date.now()
    const members = ALL_EMPLOYEES.filter((e) => selectedIds.includes(e.id))

    // Ensure the creator is also in finalMembers
    const creatorMember = {
      name: profile?.name || 'Mansi Shah',
      email: profile?.email || '',
      role: profile?.role || 'Designer',
      avatar: profile?.avatar || ''
    }
    let finalMembers = [...members.map((m) => ({ name: m.name, email: m.email, role: m.role, avatar: m.avatar }))]
    if (!finalMembers.some(m => m.email?.toLowerCase() === creatorMember.email.toLowerCase())) {
      finalMembers.push(creatorMember)
    }

    // 1. Add Group Chat
    const newGroup = {
      id: newId,
      name: groupName || 'Unnamed Group',
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }),
      preview: 'Group created.',
      icon: 'groups',
      bg: 'bg-primary-container',
      active: false,
      creator: profile?.name || 'Mansi Shah',
      creatorEmail: creatorMember.email
    }
    setGroupChats((prev) => [...prev, newGroup])

    // 2. Initialize messages
    setMessagesByChatId((prev) => ({
      ...prev,
      [newId]: [{ id: Date.now(), type: 'divider', label: 'Group Created' }],
    }))

    // 3. Set Members list
    setGroupMembers((prev) => ({
      ...prev,
      [newId]: finalMembers,
    }))

    // 4. Send group metadata to n8n CHAT_ENGINE
    const metadataPayload = {
      action: 'send',
      roomId: 'groups_metadata',
      senderId: profile?.email || 'mansi@dreamsdesign.in',
      senderName: profile?.name || 'Mansi Shah',
      message: JSON.stringify({
        id: String(newId),
        name: groupName || 'Unnamed Group',
        members: finalMembers.map(m => m.name),
        memberEmails: finalMembers.map(m => m.email),
        creator: profile?.name || 'Mansi Shah',
        creatorEmail: profile?.email || ''
      }),
      timestamp: new Date().toISOString(),
      type: 'group_created',
      groupName: groupName || 'Unnamed Group'
    }
    sendWebhookPayload(metadataPayload)

    // 5. Select the new group
    setActiveTab('groups')
    setSelectedChatId(newId)
    setShowModal(false)
  }

  const handleSelectAndAddMember = async (member) => {
    setShowAddMemberDropdown(false)

    // 1. Add to groupMembers list
    const updatedMembersList = [...(groupMembers[selectedChatId] || []), { name: member.name, email: member.email || '', role: member.role, avatar: member.avatar }]
    setGroupMembers((prev) => ({
      ...prev,
      [selectedChatId]: updatedMembersList
    }))

    // 2. System message
    const systemMsgId = 'temp_' + String(Date.now())
    const nowIso = new Date().toISOString()
    const myName = profile?.name || 'Mansi Shah'
    const systemMessage = {
      id: systemMsgId,
      type: 'system',
      text: `${myName} added ${member.name}`,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }),
      timestamp: nowIso
    }

    setMessagesByChatId((prev) => {
      const list = prev[selectedChatId] || []
      return {
        ...prev,
        [selectedChatId]: [...list, systemMessage]
      }
    })

    // Webhooks
    const currentGroup = groupChats.find(g => String(g.id) === String(selectedChatId))
    const systemPayload = {
      action: 'send',
      roomId: String(selectedChatId),
      senderId: profile?.email || 'mansi@dreamsdesign.in',
      senderName: profile?.name || 'Mansi Shah',
      message: `[System:${myName} added ${member.name}]`,
      timestamp: nowIso,
      type: 'group',
      groupName: currentGroup?.name || 'Unnamed Group'
    }
    await sendWebhookPayload(systemPayload)

    // 3. Send updated group metadata to n8n CHAT_ENGINE
    const updatedMetadataPayload = {
      action: 'send',
      roomId: 'groups_metadata',
      senderId: profile?.email || 'mansi@dreamsdesign.in',
      senderName: profile?.name || 'Mansi Shah',
      message: JSON.stringify({
        id: String(selectedChatId),
        name: currentGroup?.name || 'Unnamed Group',
        members: updatedMembersList.map(m => m.name),
        memberEmails: updatedMembersList.map(m => m.email),
        creator: currentGroup?.creator || profile?.name || 'Mansi Shah',
        creatorEmail: currentGroup?.creatorEmail || profile?.email || ''
      }),
      timestamp: nowIso,
      type: 'group_created',
      groupName: currentGroup?.name || 'Unnamed Group'
    }
    await sendWebhookPayload(updatedMetadataPayload)
  }

  const handleRemoveMember = (memberName) => {
    setConfirmModal({
      title: 'Remove Member',
      message: `Are you sure you want to remove ${memberName} from this group?`,
      icon: 'person_remove',
      danger: true,
      onConfirm: async () => {
        // 1. Add to groupMembers list
        const currentMembersList = groupMembers[selectedChatId] || []
        const updatedMembersList = currentMembersList.filter(m => m.name !== memberName)
        setGroupMembers((prev) => ({
          ...prev,
          [selectedChatId]: updatedMembersList
        }))

        // 2. System message
        const systemMsgId = 'temp_' + String(Date.now())
        const nowIso = new Date().toISOString()
        const myName = profile?.name || 'Mansi Shah'
        const systemMessage = {
          id: systemMsgId,
          type: 'system',
          text: `${myName} removed ${memberName}`,
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }),
          timestamp: nowIso
        }

        setMessagesByChatId((prev) => {
          const list = prev[selectedChatId] || []
          return {
            ...prev,
            [selectedChatId]: [...list, systemMessage]
          }
        })

        // Webhooks
        const currentGroup = groupChats.find(g => String(g.id) === String(selectedChatId))
        const systemPayload = {
          action: 'send',
          roomId: String(selectedChatId),
          senderId: profile?.email || 'mansi@dreamsdesign.in',
          senderName: profile?.name || 'Mansi Shah',
          message: `[System:${myName} removed ${memberName}]`,
          timestamp: nowIso,
          type: 'group',
          groupName: currentGroup?.name || 'Unnamed Group'
        }
        await sendWebhookPayload(systemPayload)

        // 3. Send updated group metadata to n8n CHAT_ENGINE
        const updatedMetadataPayload = {
          action: 'send',
          roomId: 'groups_metadata',
          senderId: profile?.email || 'mansi@dreamsdesign.in',
          senderName: profile?.name || 'Mansi Shah',
          message: JSON.stringify({
            id: String(selectedChatId),
            name: currentGroup?.name || 'Unnamed Group',
            members: updatedMembersList.map(m => m.name),
            memberEmails: updatedMembersList.map(m => m.email),
            creator: currentGroup?.creator || profile?.name || 'Mansi Shah',
            creatorEmail: currentGroup?.creatorEmail || profile?.email || ''
          }),
          timestamp: nowIso,
          type: 'group_created',
          groupName: currentGroup?.name || 'Unnamed Group'
        }
        await sendWebhookPayload(updatedMetadataPayload)

        setConfirmModal(null)
      }
    })
  }



  return (
    <div className="bg-[#f9f9ff] font-['Inter',sans-serif] text-[#151c27] overflow-hidden h-screen flex">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F8; border-radius: 10px; }
        .module-shadow { box-shadow: 0 16px 48px rgba(91, 33, 182, 0.12); }
      `}</style>

      <Sidebar />

      <main className="page-main p-3">
        <div className="h-full w-full bg-white rounded-[24px] overflow-hidden module-shadow flex animate-fade-in-up">
            {/* LEFT PANEL: Conversation List */}
            <div className={`bg-[#FAFAFF] flex-col border-r border-[#F3F1FA] flex-shrink-0 ${selectedChatId ? 'hidden md:flex w-[280px]' : 'flex w-full md:w-[280px]'}`}>
          {/* Panel header with Search and Tabs */}
          <div className="p-5 flex flex-col gap-4 border-b border-[#F3F1FA]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button className="md:hidden p-1 -ml-1 hover:bg-[#F3F1FA] rounded-full flex items-center justify-center transition-colors" onClick={() => setIsSidebarOpen(true)}>
                  <span className="material-symbols-outlined text-[24px]">menu</span>
                </button>
                <h2 className="font-bold text-[18px] text-[#151c27] m-0">Messages</h2>
              </div>
            </div>

            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-[50%] -translate-y-1/2 text-[#9CA3AF] text-[18px]" style={{ fontVariationSettings: "'FILL' 0" }}>search</span>
              <input
                type="text"
                placeholder="Search people or groups..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full h-[36px] bg-[#F3F4F6] border border-[#E5E7EB] rounded-[8px] pl-9 pr-4 text-[13px] outline-none"
              />
            </div>

            <div className="flex">
            {['personal', 'groups'].map((t) => {
              const unreadCount = t === 'personal' ? unreadPersonal : unreadGroups
              const isActive = activeTab === t;
              return (
                <button
                  key={t}
                  onClick={() => {
                    setActiveTab(t)
                    setSearchFilter('')
                  }}
                  className={`flex-1 border-none cursor-pointer bg-transparent text-[13px] font-bold py-2 border-b-2 transition-colors capitalize ${isActive ? 'text-[#702c91] border-[#702c91]' : 'text-[#6B7280] border-transparent'} flex items-center justify-center gap-1.5`}
                >
                  <span>{t}</span>
                  {unreadCount > 0 && (
                    <span className="min-w-[16px] h-[16px] px-1 bg-[#25d366] text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-sm">
                      {unreadCount}
                    </span>
                  )}
                </button>
              )
            })}
            </div>
          </div>

          {/* List scrollarea */}
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
            {activeTab === 'personal' ? (
              <div className="space-y-1 flex-1">
                {employees.length === 0 ? (
                  // Skeleton loader
                  Array.from({ length: 3 }).map((_, idx) => (
                    <div key={idx} className="p-4 flex items-center gap-3 animate-pulse">
                      <div className="w-10 h-10 bg-surface-container-high rounded-full" />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="h-3 bg-surface-container-high rounded w-2/3" />
                        <div className="h-3 bg-surface-container-high rounded w-1/2" />
                      </div>
                    </div>
                  ))
                ) : filteredPersonal.length === 0 ? (
                  <div className="p-4 text-center text-outline text-body-sm">
                    No conversations found
                  </div>
                ) : (
                  filteredPersonal.map((c) => {
                    const isSelected = selectedChatId === c.id
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedChatId(c.id)
                          markChatAsRead(c.id)
                        }}
                        className={`flex items-center gap-3 h-16 px-4 cursor-pointer transition-colors border-l-4 ${isSelected ? 'bg-[#FAFAFF] border-[#702c91]' : 'bg-white border-transparent hover:bg-[#FAFAFF]'}`}
                      >
                        <div className="relative shrink-0">
                          {renderAvatar(c.avatar, c.name, "w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-bold", "text-[13px]", c.email)}
                          {getOnline(c.email) && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#10B981] border-2 border-white rounded-full"></span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-1">
                            <span className="text-[13px] font-semibold text-[#1E1B2E] truncate">{c.name}</span>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              {c.unread > 0 && (
                                <span className="min-w-[16px] h-[16px] px-1 bg-[#25d366] text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-sm">
                                  {c.unread > 99 ? '99+' : c.unread}
                                </span>
                              )}
                              <span className="text-[10px] text-[#9CA3AF]">{c.time}</span>
                            </div>
                          </div>
                          <p className={`text-[12px] truncate m-0 ${c.unread > 0 ? 'text-[#1E1B2E] font-semibold' : 'text-[#9CA3AF]'}`}>{c.preview}</p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            ) : (
              <div className="flex flex-col flex-1">
                <div className="space-y-1 flex-1">
                  {employees.length === 0 ? (
                    // Skeleton loader
                    Array.from({ length: 2 }).map((_, idx) => (
                      <div key={idx} className="p-4 flex items-center gap-3 animate-pulse">
                        <div className="w-10 h-10 bg-surface-container-high rounded-lg" />
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="h-3 bg-surface-container-high rounded w-2/3" />
                          <div className="h-3 bg-surface-container-high rounded w-1/2" />
                        </div>
                      </div>
                    ))
                  ) : filteredGroups.length === 0 ? (
                    <div className="p-4 text-center text-outline text-body-sm">
                      No groups found. Create one above!
                    </div>
                  ) : (
                    filteredGroups.map((g) => {
                      const isSelected = selectedChatId === g.id
                      return (
                        <div
                          key={g.id}
                          onClick={() => {
                            setSelectedChatId(g.id)
                            markChatAsRead(g.id)
                          }}
                          className={`flex items-center gap-3 h-16 px-4 cursor-pointer transition-colors border-l-4 ${isSelected ? 'bg-[#FAFAFF] border-[#702c91]' : 'bg-white border-transparent hover:bg-[#FAFAFF]'}`}
                        >
                          <div className="relative shrink-0">
                            <div className={`w-10 h-10 rounded-full ${g.bg} flex items-center justify-center text-white text-[13px] font-bold`}>
                              <span className="material-symbols-outlined text-[20px]">{g.icon}</span>
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline mb-1">
                              <span className="text-[13px] font-semibold text-[#1E1B2E] truncate">{g.name}</span>
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                {g.unread > 0 && (
                                  <span className="min-w-[16px] h-[16px] px-1 bg-[#25d366] text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-sm">
                                    {g.unread > 99 ? '99+' : g.unread}
                                  </span>
                                )}
                                <span className="text-[10px] text-[#9CA3AF]">{g.time}</span>
                              </div>
                            </div>
                            <p className={`text-[12px] truncate m-0 ${g.unread > 0 ? 'text-[#1E1B2E] font-semibold' : 'text-[#9CA3AF]'}`}>{g.preview}</p>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
                <div className="p-4 mt-auto">
                  <button
                    onClick={() => setShowModal(true)}
                    className="w-full h-10 border border-[#702c91] rounded-[8px] bg-transparent text-[#702c91] text-[13px] font-semibold flex items-center justify-center gap-2 cursor-pointer hover:bg-[#702c91]/10 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">add_circle</span>
                    Create New Group
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── MIDDLE PANEL: Message Thread ───────────────────────── */}
        <div className={`flex-1 flex-col bg-white h-full relative min-w-0 ${!selectedChatId ? 'hidden md:flex' : 'flex'}`}>
          {activeChat ? (
            <>
              {/* Header */}
              <header className="h-[68px] px-6 border-b border-[#F3F1FA] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <button
                    className="md:hidden flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors -ml-1 text-[#9CA3AF]"
                    onClick={() => setSelectedChatId(null)}
                  >
                    <span className="material-symbols-outlined text-[24px]">arrow_back</span>
                  </button>
                  {activeTab === 'personal' ? (
                    <>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-bold" style={{ backgroundColor: activeChat?.bg || '#9CA3AF' }}>
                        {activeChat?.avatar || activeChat?.name?.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <h3 className="text-[14px] font-bold text-[#151c27] m-0">{activeChat?.name}</h3>
                        <p className={`text-[11px] font-medium m-0 ${getOnline(activeChat?.email) ? 'text-[#10B981]' : 'text-[#9CA3AF]'}`}>
                          {getOnline(activeChat?.email) ? 'Online' : 'Offline'}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={`w-10 h-10 rounded-full ${activeChat?.bg || 'bg-gray-200'} flex items-center justify-center text-white text-[13px] font-bold`}>
                        <span className="material-symbols-outlined text-[20px]">{activeChat?.icon || 'groups'}</span>
                      </div>
                      <div className="flex flex-col">
                        <h3 className="text-[14px] font-bold text-[#151c27] m-0">{activeChat?.name}</h3>
                        <p className="text-[11px] font-medium text-[#9CA3AF] m-0 truncate max-w-[160px]">{activeMembersList.map(m => m.name.split(' ')[0]).join(', ')}</p>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={handleCreateMeeting}
                    className="border-none cursor-pointer bg-transparent text-[#9CA3AF] hover:text-[#702c91] transition-colors flex"
                    title="Video Call"
                  >
                    <span className="material-symbols-outlined text-[22px]">videocam</span>
                  </button>
                  <button
                    onClick={() => setShowSearchModal(true)}
                    className="border-none cursor-pointer bg-transparent text-[#9CA3AF] hover:text-[#702c91] transition-colors hidden md:flex"
                    title="Search messages"
                  >
                    <span className="material-symbols-outlined text-[20px]">search</span>
                  </button>
                  <button
                    onClick={() => setShowBgModal(true)}
                    className="border-none cursor-pointer bg-transparent text-[#9CA3AF] hover:text-[#702c91] transition-colors flex"
                    title="Change Chat Wallpaper"
                  >
                    <span className="material-symbols-outlined text-[20px]">wallpaper</span>
                  </button>
                </div>
              </header>

              <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 custom-scrollbar"
                style={{
                  backgroundColor: CHAT_BACKGROUNDS.find(bg => bg.id === currentBgId)?.bgColor || '#F0EDF8',
                  backgroundImage: CHAT_BACKGROUNDS.find(bg => bg.id === currentBgId)?.bgImage || 'none',
                  backgroundSize: CHAT_BACKGROUNDS.find(bg => bg.id === currentBgId)?.bgSize || 'auto',
                  backgroundPosition: 'center',
                  backgroundRepeat: CHAT_BACKGROUNDS.find(bg => bg.id === currentBgId)?.bgSize === 'auto' ? 'repeat' : 'no-repeat'
                }}
              >
                {activeMessages.length === 0 ? (
                  <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center text-center p-6">
                    <span className="material-symbols-outlined text-[#6B7280] text-[56px] mb-4">forum</span>
                    <h3 className="text-[16px] font-bold text-[#1E1B2E] m-0 mb-2">Start chat with {activeChat?.name || 'this contact'}</h3>
                    <p className="text-[13px] text-[#9CA3AF] m-0">Send a message to start a conversation.</p>
                  </div>
                ) : (
                  activeMessages.map((m, index) => {
                    if (m.type === 'divider') {
                      return (
                        <div key={index} className="flex items-center gap-4 my-2">
                          <div className="flex-1 h-px bg-outline-variant" />
                          <span className="text-[11px] text-outline font-bold uppercase tracking-widest">{m.label}</span>
                          <div className="flex-1 h-px bg-outline-variant" />
                        </div>
                      )
                    }
                    if (m.type === 'system') {
                      return (
                        <div key={index} className="text-center py-2 text-label-sm italic text-secondary bg-surface-container-low/50 rounded-lg">
                          {m.text}
                        </div>
                      )
                    }
                    if (m.type === 'received') {
                      return (
                        <div
                          key={index}
                          id={`msg-${m.id}`}
                          onMouseEnter={() => setHoveredMessageId(m.id)}
                          onMouseLeave={() => setHoveredMessageId(null)}
                          onDoubleClick={() => setReplyTarget(m)}
                          className="flex items-end gap-2 mb-1 group select-none cursor-pointer"
                          title="Double click to reply"
                        >
                          {/* Avatar */}
                          <div className="flex-shrink-0 mb-1">
                            {renderAvatar(activeChat?.avatar, activeChat?.name, 'w-7 h-7 rounded-full', 'text-[9px]')}
                          </div>
                          <div className="flex flex-col items-start max-w-[72%] relative">
                            {activeTab === 'groups' && (
                              <span className="text-[11px] font-bold text-primary mb-0.5 ml-3">{m.sender}</span>
                            )}
                            {/* Hover menu */}
                            {hoveredMessageId === m.id && (
                              <div className="absolute top-1/2 -right-12 translate-x-full -translate-y-1/2 z-10 bg-surface-container-lowest border border-outline-variant shadow-lg rounded-full px-2.5 py-1 flex items-center gap-1.5 animate-scale-in">
                                <button onClick={() => setReplyTarget(m)} className="text-outline hover:text-primary transition-colors flex items-center" title="Reply">
                                  <span className="material-symbols-outlined text-[15px]">reply</span>
                                </button>
                              </div>
                            )}
                            {/* Bubble */}
                            <div className="bg-white border border-[#E5E7EB] rounded-[12px] rounded-tl-none p-3 shadow-sm" style={{ maxWidth: '100%' }}>
                              {renderMessageText(m.text, false, m.isDeleted, ALL_EMPLOYEES.map(e => e.name), (url) => setLightboxUrl(url), scrollToMessage)}
                              <div className="flex items-center justify-end gap-1 mt-1">
                                <span className="text-[10px] text-secondary leading-none">{m.time}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    }
                    // Sent message — WhatsApp style with right tail
                    return (
                      <div
                        key={index}
                        id={`msg-${m.id}`}
                        onMouseEnter={() => setHoveredMessageId(m.id)}
                        onMouseLeave={() => setHoveredMessageId(null)}
                        onDoubleClick={() => setReplyTarget(m)}
                        className="flex items-end justify-end gap-2 mb-1 group select-none cursor-pointer"
                        title="Double click to reply"
                      >
                        <div className="flex flex-col items-end max-w-[72%] relative">
                          {/* Hover menu */}
                          {hoveredMessageId === m.id && (
                            <div className="absolute top-1/2 -left-12 -translate-x-full -translate-y-1/2 z-10 bg-surface-container-lowest border border-outline-variant shadow-lg rounded-full px-2.5 py-1 flex items-center gap-1.5 animate-scale-in">
                              <button onClick={() => handleStartEdit(m)} className="text-outline hover:text-primary transition-colors flex items-center" title="Edit">
                                <span className="material-symbols-outlined text-[15px]">edit</span>
                              </button>
                              <button onClick={() => handleDeleteMessage(m.id)} className="text-outline hover:text-error transition-colors flex items-center" title="Delete">
                                <span className="material-symbols-outlined text-[15px]">delete</span>
                              </button>
                            </div>
                          )}
                          {/* Bubble */}
                          <div className="bg-[#702c91] text-white rounded-[12px] rounded-tr-none p-3 shadow-sm" style={{ maxWidth: '100%' }}>
                            {renderMessageText(m.text, true, m.isDeleted, ALL_EMPLOYEES.map(e => e.name), (url) => setLightboxUrl(url), scrollToMessage)}
                            <div className="flex items-center justify-end gap-1 mt-1">
                              {m.isEdited && <span className="text-[9px] text-white/60 italic">edited</span>}
                              <span className="text-[10px] text-white/70 leading-none">{m.time}</span>
                              {/* Double tick — sent indicator */}
                              <span className="text-[10px] text-white/80 leading-none">{getMessageTicks(m)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input bar */}
              <div className="p-4 border-t border-[#F3F1FA] bg-white flex-shrink-0 flex flex-col gap-2 relative">
                {/* Mention Dropdown Popover */}
                {mentionIndex !== -1 && activeTab === 'groups' && (
                  <div ref={mentionDropdownRef} className="absolute bottom-16 left-4 z-50 bg-white border border-[#E5E7EB] shadow-xl rounded-xl p-2 w-[240px] max-h-[180px] overflow-y-auto custom-scrollbar flex flex-col gap-1 animate-scale-in">
                    <div className="text-[11px] font-bold text-[#6B7280] px-2 py-1 uppercase tracking-wider border-b border-[#F3F1FA] mb-1">
                      Mention Member
                    </div>
                    {[{ name: 'all', role: 'Notify everyone', avatar: null }, ...activeMembersList]
                      .filter(m => m.name.toLowerCase().includes(mentionFilter.toLowerCase()))
                      .map(m => (
                        <button
                          key={m.name}
                          onClick={() => selectMention(m)}
                          className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-[#F9FAFB] transition-colors text-left w-full border-none cursor-pointer bg-transparent"
                        >
                          {m.name === 'all' ? (
                            <div className="w-6 h-6 rounded-full bg-[#F3F1FA] flex items-center justify-center text-[#702c91] flex-shrink-0">
                              <span className="material-symbols-outlined text-[14px]">groups</span>
                            </div>
                          ) : (
                            renderAvatar(m.avatar, m.name, "w-6 h-6 rounded-full", "text-[9px]", m.email)
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-[#1E1B2E] m-0 truncate leading-tight capitalize">{m.name}</p>
                            {m.role && <p className="text-[10px] text-[#9CA3AF] m-0 truncate block">{m.role}</p>}
                          </div>
                        </button>
                      ))}
                    {[{ name: 'all' }, ...activeMembersList].filter(m => m.name.toLowerCase().includes(mentionFilter.toLowerCase())).length === 0 && (
                      <p className="text-[11px] text-[#9CA3AF] text-center py-2 m-0">No matching members</p>
                    )}
                  </div>
                )}

                {/* Quote Reply Target Preview */}
                {replyTarget && (
                  <div className="px-4 py-2 border-l-4 border-[#702c91] bg-[#F9FAFB] rounded-r-xl flex items-center justify-between gap-3 animate-fade-in">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-[#702c91] m-0">Replying to {replyTarget.sender || 'You'}</p>
                      <p className="text-[13px] text-[#6B7280] m-0 truncate leading-normal">{replyTarget.text}</p>
                    </div>
                    <button
                      onClick={() => setReplyTarget(null)}
                      className="border-none cursor-pointer bg-transparent text-[#9CA3AF] hover:text-[#DC2626] transition-colors flex items-center justify-center flex-shrink-0"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                )}

                {/* Editing Message Indicator Preview */}
                {editingMessage && (
                  <div className="px-4 py-2 border-l-4 border-[#F59E0B] bg-[#F9FAFB] rounded-r-xl flex items-center justify-between gap-3 animate-fade-in">
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#F59E0B] text-[20px]">edit</span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-[#F59E0B] m-0">Editing Message</p>
                        <p className="text-[13px] text-[#6B7280] m-0 truncate leading-normal">
                          Original: {editingMessage.text}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setEditingMessage(null)
                        setText('')
                      }}
                      className="border-none cursor-pointer bg-transparent text-[#9CA3AF] hover:text-[#DC2626] transition-colors flex items-center justify-center flex-shrink-0"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                )}

                {/* File Attachment Preview */}
                {attachedFile && (
                  <div className="px-4 py-2 border border-[#E5E7EB] bg-[#F9FAFB] rounded-xl flex items-center justify-between gap-3 animate-fade-in">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="material-symbols-outlined text-[#702c91]">
                        {attachedFile.type.startsWith('image/') ? 'image' : 'description'}
                      </span>
                      <span className="text-[13px] truncate font-semibold text-[#1E1B2E] m-0">
                        {attachedFile.name}
                      </span>
                    </div>
                    <button
                      onClick={() => setAttachedFile(null)}
                      className="border-none cursor-pointer bg-transparent text-[#9CA3AF] hover:text-[#DC2626] transition-colors flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                )}

                <div className="border border-[#E5E7EB] rounded-full p-1 pl-4 flex items-center gap-3 bg-white shadow-sm focus-within:border-[#702c91]/50 transition-colors relative">
                    {/* Emoji Picker Popover */}
                    <div ref={emojiPickerRef} className="relative flex items-center">
                      <button
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className={`border-none cursor-pointer bg-transparent flex items-center justify-center transition-colors ${showEmojiPicker ? 'text-[#702c91]' : 'text-[#9CA3AF] hover:text-[#702c91]'}`}
                      >
                        <span className="material-symbols-outlined text-[20px]">sentiment_satisfied</span>
                      </button>
                      {showEmojiPicker && (
                        <div className="absolute bottom-12 left-0 z-50 shadow-2xl rounded-xl overflow-hidden animate-scale-in">
                          <EmojiPicker
                            onEmojiClick={(emojiObject) => {
                              setText(prev => prev + emojiObject.emoji)
                            }}
                            theme="light"
                            searchPlaceHolder="Search emojis..."
                            lazyLoadEmojis={true}
                            skinTonesDisabled={true}
                            width={320}
                            height={400}
                          />
                        </div>
                      )}
                    </div>

                    <input
                      ref={textInputRef}
                      className="flex-1 bg-transparent border-none focus:ring-0 text-[13px] py-2.5 outline-none text-[#1E1B2E]"
                      placeholder={editingMessage ? "Edit your message..." : "Type a message..."}
                      type="text"
                      value={text}
                      onChange={(e) => handleTextChange(e.target.value, e.target.selectionStart)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
                      onPaste={handlePaste}
                    />
                    <button
                      onClick={handleSend}
                      className="w-10 h-10 border-none cursor-pointer btn-gradient rounded-full flex items-center justify-center text-white transition-opacity hover:opacity-90 active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[18px]">send</span>
                    </button>
                  </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <span className="material-symbols-outlined text-[#9CA3AF] text-[64px] mb-4">forum</span>
              <h3 className="text-[18px] font-bold text-[#1E1B2E] m-0 mb-2">No Chat Selected</h3>
              <p className="text-[13px] text-[#9CA3AF] m-0 max-w-[250px]">Create a new group or select one to start collaborating.</p>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL: Details Panel ───────────────────────── */}
        {activeChat && activeTab === 'personal' && (
          <aside className="hidden lg:flex w-[280px] bg-white border-l border-[#F3F1FA] overflow-y-auto custom-scrollbar flex-col items-center shrink-0">
            <div className="pt-12 pb-8 flex flex-col items-center w-full px-6 text-center border-b border-[#F3F1FA]">
              <div className="w-[88px] h-[88px] rounded-full flex items-center justify-center text-white text-[24px] font-bold mb-4 shadow-sm" style={{ backgroundColor: activeChat?.bg || '#9CA3AF' }}>
                {activeChat?.avatar || activeChat?.name?.substring(0, 2).toUpperCase()}
              </div>
              <h2 className="font-bold text-[16px] text-[#151c27] m-0">{activeChat?.name}</h2>
              <p className="text-[13px] text-[#9CA3AF] font-medium mt-1 mb-0">{activeChat?.role || 'Employee'}</p>
            </div>
            
            <div className="w-full px-6 py-6 flex flex-col gap-5">
              <h3 className="text-[12px] font-bold text-[#6B7280] tracking-wider m-0">DETAILS</h3>
              
              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#9CA3AF]">Email:</span>
                <span className="text-[12px] font-bold text-[#1E1B2E] break-all">{activeChat?.email || 'N/A'}</span>
              </div>
              
              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-[#9CA3AF]">Department:</span>
                <span className="text-[12px] font-bold text-[#1E1B2E]">{activeChat?.department || 'N/A'}</span>
              </div>
            </div>
          </aside>
        )}

        {activeChat && activeTab === 'groups' && (
          <aside className="hidden lg:flex w-[280px] bg-white border-l border-[#F3F1FA] overflow-y-auto custom-scrollbar flex-col items-center shrink-0">
            <div className="pt-12 pb-8 flex flex-col items-center w-full px-6 text-center border-b border-[#F3F1FA]">
              <div className="w-[88px] h-[88px] rounded-full flex items-center justify-center text-white text-[24px] font-bold mb-4 shadow-sm bg-gray-200">
                <span className="material-symbols-outlined text-[40px]">{activeChat?.icon || 'groups'}</span>
              </div>
              <h2 className="font-bold text-[16px] text-[#151c27] m-0">{activeChat?.name}</h2>
              <p className="text-[13px] text-[#9CA3AF] font-medium mt-1 mb-0">Group Chat</p>
            </div>

            <div className="w-full px-6 py-6 flex flex-col gap-5 relative" ref={addMemberDropdownRef}>
              <div className="flex justify-between items-center">
                <h3 className="text-[12px] font-bold text-[#6B7280] tracking-wider m-0">
                  MEMBERS ({activeMembersList.length})
                </h3>
                {(activeChat?.creator === profile?.name || activeChat?.creatorEmail === profile?.email) && (
                  <button
                    onClick={() => setShowAddMemberDropdown(!showAddMemberDropdown)}
                    className={`text-primary hover:opacity-80 transition-colors ${showAddMemberDropdown ? 'text-primary' : ''}`}
                    title="Add Member"
                  >
                    <span className="material-symbols-outlined text-[20px]">person_add</span>
                  </button>
                )}
              </div>
              <ul className="space-y-3 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                {activeMembersList.map((m) => (
                  <li key={m.name} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {renderAvatar(m.avatar, m.name, "w-8 h-8 rounded-full", "text-[11px]", m.email)}
                      <div>
                        <p className="text-label-md leading-none">{m.name}</p>
                        <span className="text-[11px] text-outline">{m.role}</span>
                      </div>
                    </div>
                    {(m.name !== profile?.name && m.email !== profile?.email) && (activeChat?.creator === profile?.name || activeChat?.creatorEmail === profile?.email) && (
                      <button
                        onClick={() => handleRemoveMember(m.name)}
                        className="text-outline hover:text-error transition-all flex items-center justify-center p-1 rounded-full hover:bg-error/10 ml-auto"
                        title={`Remove ${m.name}`}
                      >
                        <span className="material-symbols-outlined text-[16px]">person_remove</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {/* Add Member Dropdown Overlay */}
              {showAddMemberDropdown && (
                <div className="absolute right-0 bottom-12 w-full bg-surface-container-lowest border border-outline-variant rounded-xl shadow-xl z-50 p-3 max-h-[260px] overflow-y-auto custom-scrollbar flex flex-col gap-2">
                  <div className="flex justify-between items-center pb-2 border-b border-outline-variant">
                    <span className="text-label-md font-bold">Select Contact</span>
                    <button
                      onClick={() => setShowAddMemberDropdown(false)}
                      className="text-outline hover:text-error flex items-center"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                  {notInGroup.length === 0 ? (
                    <p className="text-[11px] text-outline text-center py-4">All contacts are in group</p>
                  ) : (
                    notInGroup.map(e => (
                      <button
                        key={e.id}
                        onClick={() => handleSelectAndAddMember(e)}
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-container-low transition-colors w-full text-left"
                      >
                        {renderAvatar(e.avatar, e.name, "w-8 h-8 rounded-full", "text-[11px]", e.email)}
                        <div className="min-w-0 flex-1">
                          <p className="text-label-md font-semibold truncate leading-tight">{e.name}</p>
                          <span className="text-[10px] text-outline truncate block">{e.role}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              {(activeChat?.creator === profile?.name || activeChat?.creatorEmail === profile?.email) && (
                <button
                  onClick={() => setShowAddMemberDropdown(!showAddMemberDropdown)}
                  className="w-full border border-primary text-primary py-2 rounded-lg font-label-md text-sm hover:bg-light-tint transition-all active:scale-95"
                >
                  {showAddMemberDropdown ? 'Cancel' : 'Add Member'}
                </button>
              )}
            </div>

            <div className="mt-auto">
              <button
                onClick={() => {
                  if (confirm('Leave this group?')) {
                    setGroupChats((prev) => prev.filter((g) => g.id !== selectedChatId))
                  }
                }}
                className="w-full flex items-center justify-center gap-2 text-error font-label-md hover:underline"
              >
                <span className="material-symbols-outlined text-[20px]">logout</span>
                Leave Group
              </button>
            </div>
          </aside>
        )}
        </div>
      </main>

      {/* Group Creation Modal */}
      {showModal && (
        <CreateGroupModal
          onClose={() => setShowModal(false)}
          onCreate={handleCreateGroup}
          employees={ALL_EMPLOYEES}
        />
      )}

      {/* Edit Name Modal */}
      {editNameModal && activeChat && (
        <EditNameModal
          currentName={activeChat.name}
          onClose={() => setEditNameModal(false)}
          onConfirm={handleEditNameConfirm}
        />
      )}

      {/* Confirm Modal (Clear / Delete) */}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          icon={confirmModal.icon}
          danger={confirmModal.danger}
          onClose={() => setConfirmModal(null)}
          onConfirm={confirmModal.onConfirm}
        />
      )}

      {/* Message Search Modal */}
      {showSearchModal && (
        <MessageSearchModal
          chats={activeTab === 'personal' ? personalChats : groupChats}
          messagesByChatId={messagesByChatId}
          onClose={() => setShowSearchModal(false)}
          onSelectChat={(chatId) => {
            setSelectedChatId(chatId)
            setShowSearchModal(false)
          }}
          allChats={[...personalChats, ...groupChats]}
        />
      )}

      {/* Image Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <button className="absolute -top-10 right-0 text-white/80 hover:text-white transition-colors bg-transparent border-none cursor-pointer" onClick={() => setLightboxUrl(null)}>
              <span className="material-symbols-outlined text-[28px]">close</span>
            </button>
            <img src={lightboxUrl} alt="Preview" className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
          </div>
        </div>
      )}

      {/* Background Selection Modal */}
      {showBgModal && (
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[560px] overflow-hidden animate-scale-in flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
              <h2 className="text-[18px] font-bold text-[#702c91] flex items-center gap-2 m-0">
                <span className="material-symbols-outlined text-[20px]">wallpaper</span>
                Chat Wallpaper
              </h2>
              <button
                onClick={() => setShowBgModal(false)}
                className="text-gray-400 hover:text-gray-700 transition-colors bg-transparent border-none cursor-pointer p-1 flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 sm:grid-cols-3 gap-4 bg-[#f9f9ff] max-h-[60vh] overflow-y-auto custom-scrollbar">
              {CHAT_BACKGROUNDS.map((bg) => (
                <button
                  key={bg.id}
                  onClick={() => {
                    if (!activeChat) return
                    const newBgs = { ...chatBackgrounds, [activeChat.id]: bg.id }
                    setChatBackgrounds(newBgs)
                    localStorage.setItem('dd_chat_bgs', JSON.stringify(newBgs))
                  }}
                  className={`relative aspect-[3/4] rounded-xl overflow-hidden border-[3px] transition-all cursor-pointer ${
                    currentBgId === bg.id ? 'border-[#702c91] scale-105 shadow-md z-10' : 'border-transparent hover:border-gray-300 shadow-sm'
                  }`}
                  style={{ 
                    backgroundColor: bg.bgColor, 
                    backgroundImage: bg.bgImage, 
                    backgroundSize: bg.bgSize || 'auto',
                    backgroundPosition: 'center',
                    backgroundRepeat: bg.bgSize === 'auto' ? 'repeat' : 'no-repeat'
                  }}
                  title={bg.name}
                >
                  {currentBgId === bg.id && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-[#702c91] rounded-full flex items-center justify-center shadow-sm">
                      <span className="material-symbols-outlined text-white text-[14px] font-bold">check</span>
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-black/50 backdrop-blur-md p-2 text-center">
                    <span className="text-white text-[11px] font-bold tracking-wide">{bg.name}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="px-6 py-4 bg-white border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowBgModal(false)}
                className="px-6 py-2.5 btn-gradient border-none rounded-lg font-bold shadow-md active:scale-95 transition-all text-[13px] cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// â”€â”€ Edit Name Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function EditNameModal({ currentName, onClose, onConfirm }) {
  const [value, setValue] = useState(currentName)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (value.trim()) onConfirm(value.trim())
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-[400px] overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[20px]">edit</span>
            </div>
            <h2 className="text-label-lg font-bold text-on-surface">Edit Chat Name</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-surface-container-high flex items-center justify-center text-outline transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          <div className="relative">
            <input
              autoFocus
              type="text"
              placeholder=" "
              value={value}
              onChange={e => setValue(e.target.value)}
              className="block px-4 pb-2.5 pt-5 w-full text-body-sm text-on-surface bg-transparent rounded-xl border-2 border-outline-variant appearance-none focus:outline-none focus:border-primary peer transition-colors"
            />
            <label className="absolute text-body-sm text-outline duration-200 transform -translate-y-4 scale-75 top-3 z-10 origin-[0] bg-surface-container-lowest px-1 peer-focus:text-primary peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:top-3.5 peer-focus:top-3 peer-focus:scale-75 peer-focus:-translate-y-4 left-3">
              Chat Display Name
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border-2 border-outline-variant text-on-surface-variant rounded-xl font-label-md hover:border-primary hover:text-primary transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!value.trim() || value.trim() === currentName}
              className="flex-1 py-2.5 bg-primary text-on-primary rounded-xl font-label-md shadow hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save Name
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// â”€â”€ Confirm Modal (Clear / Delete) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ConfirmModal({ title, message, icon, danger, onClose, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-[400px] overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${danger ? 'bg-error/10' : 'bg-primary/10'}`}>
              <span className={`material-symbols-outlined text-[20px] ${danger ? 'text-error' : 'text-primary'}`}>{icon || 'warning'}</span>
            </div>
            <h2 className="text-label-lg font-bold text-on-surface">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-surface-container-high flex items-center justify-center text-outline transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-5">
          <p className="text-body-md text-on-surface-variant leading-relaxed">{message}</p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border-2 border-outline-variant text-on-surface-variant rounded-xl font-label-md hover:border-primary hover:text-primary transition-all"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 py-2.5 rounded-xl font-label-md shadow text-white active:scale-95 transition-all ${danger ? 'bg-error hover:bg-error/90' : 'bg-primary hover:opacity-90'}`}
            >
              Yes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// â”€â”€ Message Search Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function MessageSearchModal({ allChats, messagesByChatId, onClose, onSelectChat }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = query.trim().length < 2 ? [] : (() => {
    const q = query.toLowerCase()
    const found = []
    allChats.forEach(chat => {
      const msgs = messagesByChatId[chat.id] || []
      msgs.forEach(m => {
        if (!m.text || m.type === 'divider' || m.type === 'system') return
        if (m.text.toLowerCase().includes(q)) {
          found.push({ chat, message: m })
        }
      })
    })
    return found.slice(0, 40)
  })()

  const highlight = (text, q) => {
    if (!q || !text) return text
    const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
    return parts.map((p, i) =>
      p.toLowerCase() === q.toLowerCase()
        ? <mark key={i} className="bg-yellow-200 text-on-surface rounded px-0.5">{p}</mark>
        : p
    )
  }

  // Strip protocol markers from display text
  const cleanText = (text) => {
    if (!text) return ''
    let t = text
    t = t.replace(/^\[Reply:[^\]]+\]/, '')
    t = t.replace(/^\[Attachment:[^\]]+\]/, '[Attachment]')
    t = t.replace(/^\[Edit:[^|]+\|/, '').replace(/\]$/, '')
    t = t.replace(/^\[Delete:[^\]]+\]/, '[Deleted]')
    t = t.replace(/^\[Meeting:([^\]]+)\]/, 'ðŸ“¹ Video Meeting')
    t = t.replace(/^\[React:[^\]]+\]/, '')
    return t.trim() || '[Media]'
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[80px] px-4" onClick={onClose}>
      <div
        className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-[560px] overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant">
          <span className="material-symbols-outlined text-primary text-[22px]">search</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search messages, people, or groups..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-body-md text-on-surface placeholder:text-outline"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-outline hover:text-on-surface transition-colors">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          )}
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-surface-container-high flex items-center justify-center text-outline transition-colors">
            <span className="material-symbols-outlined text-[20px]">keyboard_return</span>
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[420px] overflow-y-auto custom-scrollbar">
          {query.trim().length < 2 ? (
            <div className="flex flex-col items-center justify-center py-12 text-outline gap-3">
              <span className="material-symbols-outlined text-[48px] text-primary/30">manage_search</span>
              <p className="text-body-sm">Type at least 2 characters to search</p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-outline gap-3">
              <span className="material-symbols-outlined text-[48px] text-primary/30">sentiment_dissatisfied</span>
              <p className="text-body-sm">No messages found for &ldquo;{query}&rdquo;</p>
            </div>
          ) : (
            <div className="divide-y divide-outline-variant">
              <div className="px-5 py-2.5 bg-surface-container-lowest">
                <p className="text-[11px] font-bold uppercase tracking-wider text-outline">
                  {results.length} result{results.length !== 1 ? 's' : ''} found
                </p>
              </div>
              {results.map((r, idx) => (
                <button
                  key={idx}
                  onClick={() => onSelectChat(r.chat.id)}
                  className="w-full text-left px-5 py-4 hover:bg-surface-container-low transition-colors flex items-start gap-3"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="material-symbols-outlined text-primary text-[18px]">
                      {r.chat.icon ? 'groups' : 'person'}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-label-md font-bold text-on-surface truncate">{r.chat.name}</span>
                      <span className="text-[11px] text-outline flex-shrink-0 ml-2">{r.message.time}</span>
                    </div>
                    <p className="text-body-sm text-outline truncate leading-snug">
                      {highlight(cleanText(r.message.text), query)}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="material-symbols-outlined text-[12px] text-primary">chat_bubble</span>
                      <span className="text-[10px] text-primary font-semibold">Click to open chat</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CreateGroupModal({ onClose, onCreate, employees }) {
  const { addToast } = useApp()
  const [groupName, setGroupName] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])

  const toggle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const removeChip = (id) => setSelected((prev) => prev.filter((x) => x !== id))

  const filtered = employees.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase())
  )

  const selectedEmployees = employees.filter((e) => selected.includes(e.id))

  const handleCreate = () => {
    if (!groupName.trim()) {
      addToast('Please enter a group name', 'error')
      return
    }
    onCreate(groupName.trim(), selected)
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-[480px] rounded-2xl shadow-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-gray-200 pb-4">
          <h2 className="text-[18px] font-bold text-[#702c91] m-0">Create New Group</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors bg-transparent border-none cursor-pointer p-1 flex items-center justify-center rounded-full hover:bg-gray-100">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="space-y-5">
          {/* Group name */}
          <div>
            <input
              id="gname"
              type="text"
              placeholder="Group Name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-md px-3 py-2.5 text-[14px] text-gray-800 focus:border-[#702c91] focus:ring-1 focus:ring-[#702c91] outline-none transition-colors shadow-sm"
            />
          </div>

          {/* Members selection */}
          <div className="space-y-3">
            <label className="text-[13px] font-bold text-gray-700">Add Members</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
                search
              </span>
              <input
                type="text"
                placeholder="Search employees..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#f4f3f7] border border-gray-200 rounded-md pl-10 pr-4 py-2.5 text-[13px] text-gray-800 focus:border-[#702c91] outline-none transition-colors"
              />
            </div>

            {selectedEmployees.length > 0 && (
              <div className="flex flex-wrap gap-2 py-1">
                {selectedEmployees.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-1 bg-purple-50 text-[#702c91] border border-purple-100 px-3 py-1 rounded-full text-[12px] font-bold"
                  >
                    <span>{e.name}</span>
                    <span
                      className="material-symbols-outlined text-[14px] cursor-pointer hover:text-red-500 transition-colors"
                      onClick={() => removeChip(e.id)}
                    >
                      close
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="h-[180px] overflow-y-auto custom-scrollbar border border-gray-200 rounded-md divide-y divide-gray-100 bg-[#fafafa]">
              {filtered.map((e) => (
                <label
                  key={e.id}
                  className="p-3 flex items-center gap-4 hover:bg-purple-50/50 transition-colors cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(e.id)}
                    onChange={() => toggle(e.id)}
                    className="w-4 h-4 rounded cursor-pointer accent-[#702c91]"
                  />
                  {renderAvatar(e.avatar, e.name, "w-8 h-8 rounded-full", "text-[11px]", e.email)}
                  <div className="flex-1">
                    <p className="text-[13px] font-bold text-gray-800 group-hover:text-[#702c91] transition-colors m-0">{e.name}</p>
                    <p className="text-[11px] text-gray-500 font-medium m-0">{e.role}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-[#702c91] text-[#702c91] bg-white rounded-lg font-bold hover:bg-purple-50 transition-all text-[13px] cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="px-6 py-2 btn-gradient border-none rounded-lg font-bold shadow-md active:scale-95 transition-all text-[13px] cursor-pointer"
          >
            Create Group
          </button>
        </div>
      </div>
    </div>
  )
}



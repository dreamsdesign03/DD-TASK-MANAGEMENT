import React, { useState, useEffect, useRef } from 'react'

export default function SelectDropdown({ value, onChange, options = [], style = {}, placeholder, disabled = false, dropdownUp = false, showSearchThreshold = 0 }) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const selectRef = useRef(null)
  const searchInputRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectRef.current && !selectRef.current.contains(event.target)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    } else {
      setSearchTerm('')
    }
  }, [isOpen])

  // Filter options based on user typing
  const filteredOptions = options.filter(opt => {
    if (!searchTerm.trim()) return true
    const text = String(opt?.label || opt?.value || opt || '').toLowerCase()
    return text.includes(searchTerm.trim().toLowerCase())
  })

  // Selected option display text
  const getDisplayLabel = () => {
    if (!value && value !== 0) return placeholder || 'Select'
    const found = options.find(opt => (opt?.value || opt) === value)
    if (found) return found?.label || found?.value || found
    return value
  }

  if (disabled) {
    return (
      <div style={{
        ...style,
        width: style.width || '100%',
        background: '#F3F4F6',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        padding: '10px 12px',
        fontSize: 13,
        fontWeight: 600,
        color: '#9CA3AF',
        cursor: 'not-allowed',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        userSelect: 'none'
      }}>
        <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 8 }}>
          {getDisplayLabel()}
        </span>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#9CA3AF' }}>expand_more</span>
      </div>
    )
  }

  const shouldShowSearch = options.length >= showSearchThreshold

  return (
    <div ref={selectRef} style={{ position: 'relative', width: style.width || '100%' }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          ...style,
          width: '100%',
          background: 'white',
          border: `1px solid ${isOpen ? '#ec008c' : '#E5E7EB'}`,
          borderRadius: 12,
          boxShadow: isOpen ? '0 0 0 3px rgba(139,92,246,0.15)' : '0 2px 6px rgba(0,0,0,0.02)',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          fontSize: 13,
          fontWeight: 600,
          color: value ? '#1E1B2E' : '#9CA3AF',
          cursor: 'pointer',
          transition: 'all 0.15s',
          height: style.height || 44,
          overflow: 'hidden'
        }}
        onMouseEnter={e => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = '#ec008c'
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.1)'
          }
        }}
        onMouseLeave={e => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = '#E5E7EB'
            e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.02)'
          }
        }}
      >
        <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 8 }}>
          {getDisplayLabel()}
        </span>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#6B7280', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
      </div>

      {isOpen && (
        <div className={`hide-scrollbar ${dropdownUp ? '' : 'animate-fade-in-up'}`} style={{
          position: 'absolute',
          [dropdownUp ? 'bottom' : 'top']: '100%',
          left: 0,
          width: '100%',
          minWidth: style.minWidth || '100%',
          [dropdownUp ? 'marginBottom' : 'marginTop']: 8,
          background: 'white',
          borderRadius: 12,
          boxShadow: '0 12px 32px rgba(91,33,182,0.18)',
          border: '1px solid #F5F3FF',
          zIndex: 9999,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 280,
        }}>
          {/* Sticky Search / Auto-Filter Input Bar */}
          {shouldShowSearch && (
            <div style={{ padding: '8px', borderBottom: '1px solid #F3F4F6', background: 'white', position: 'sticky', top: 0, zIndex: 10 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                padding: '6px 10px'
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#9CA3AF' }}>search</span>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && filteredOptions.length > 0) {
                      const first = filteredOptions[0]
                      onChange(first?.value || first)
                      setIsOpen(false)
                      setSearchTerm('')
                    } else if (e.key === 'Escape') {
                      setIsOpen(false)
                      setSearchTerm('')
                    }
                  }}
                  placeholder="Type to filter..."
                  style={{
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    fontSize: 12,
                    width: '100%',
                    color: '#1E1B2E',
                    fontWeight: 600
                  }}
                />
                {searchTerm && (
                  <span
                    onClick={(e) => { e.stopPropagation(); setSearchTerm('') }}
                    className="material-symbols-outlined"
                    style={{ fontSize: 14, color: '#9CA3AF', cursor: 'pointer' }}
                  >
                    close
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Options List */}
          <div style={{
            overflowY: 'auto',
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            maxHeight: 220,
            msOverflowStyle: 'none',
            scrollbarWidth: 'none'
          }}>
            {filteredOptions.length === 0 ? (
              <div style={{ padding: '12px', fontSize: 12, color: '#9CA3AF', textAlign: 'center', fontWeight: 600 }}>
                No matching options
              </div>
            ) : (
              filteredOptions.map(opt => {
                const optVal = opt?.value !== undefined ? opt.value : opt
                const optLabel = opt?.label !== undefined ? opt.label : (opt?.value !== undefined ? opt.value : opt)
                const isSelected = optVal === value

                return (
                  <div
                    key={optVal}
                    onClick={() => {
                      onChange(optVal)
                      setIsOpen(false)
                      setSearchTerm('')
                    }}
                    style={{
                      padding: '9px 12px',
                      fontSize: 13,
                      fontWeight: 600,
                      color: isSelected ? '#702c91' : '#4B5563',
                      background: isSelected ? '#F5F3FF' : 'transparent',
                      borderRadius: 8,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#F9FAFB' }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {optLabel}
                    </span>
                    {isSelected && <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}


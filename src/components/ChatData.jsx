import { useState } from 'react'

export const PERSONAL = []
export const GROUPS = []
export const MEMBERS = []
const ALL_EMPLOYEES = []

export const INIT_MESSAGES = [
  { id: 1, type: 'received', sender: 'Riya Patel',   text: 'Does anyone have the latest branding guidelines for the mobile app project?', time: '10:45 AM' },
  { id: 2, type: 'sent',                              text: "Sure Riya, I just uploaded them to the 'Tasks' section under the Design folder.", time: '10:47 AM' },
  { id: 3, type: 'received', sender: 'Karan Mehta', text: "Great! I'm starting on the high-fidelity mockups now. Should be ready by EOD.", time: '11:02 AM' },
  { id: 4, type: 'divider',  label: 'Today' },
  { id: 5, type: 'received', sender: 'Riya Patel',   text: 'We need the final assets. Karan, are we still on track?', time: '11:05 AM' },
]

/* ── Enhanced Create Group Modal ────────────────────────────────── */
export function CreateGroupModal({ onClose }) {
  const [groupName, setGroupName] = useState('')
  const [search, setSearch]       = useState('')
  // Pre-select Riya + Karan to match the new team
  const [selected, setSelected]   = useState([])

  const toggle = (id) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const removeChip = (id) => setSelected((prev) => prev.filter((x) => x !== id))

  const filtered = ALL_EMPLOYEES.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase())
  )

  const selectedEmployees = ALL_EMPLOYEES.filter((e) => selected.includes(e.id))

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center">
      <div className="bg-surface-container-lowest w-full max-w-[480px] mx-4 rounded-xl shadow-xl p-6 flex flex-col gap-6">

        {/* Header */}
        <div className="flex justify-between items-center">
          <h2 className="text-headline-sm font-bold text-primary">Create New Group</h2>
          <button onClick={onClose} className="text-outline hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-4">
          {/* Group name floating label */}
          <div className="relative">
            <input
              id="gname" type="text" placeholder=" "
              value={groupName} onChange={(e) => setGroupName(e.target.value)}
              className="block px-4 pb-2.5 pt-4 w-full text-body-sm text-on-surface bg-transparent rounded-lg border border-outline-variant appearance-none focus:outline-none focus:ring-0 focus:border-primary peer"
            />
            <label
              htmlFor="gname"
              className="absolute text-body-sm text-outline duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-surface-container-lowest px-2 peer-focus:px-2 peer-focus:text-primary peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 left-2"
            >
              Group Name
            </label>
          </div>

          {/* Add members */}
          <div className="space-y-2">
            <label className="text-label-md font-bold text-on-surface-variant">Add Members</label>

            {/* Search */}
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">search</span>
              <input
                type="text" placeholder="Search employees..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-4 py-2 text-body-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              />
            </div>

            {/* Selected chips */}
            {selectedEmployees.length > 0 && (
              <div className="flex flex-wrap gap-2 py-1">
                {selectedEmployees.map((e) => (
                  <div key={e.id} className="flex items-center gap-1 bg-light-tint text-primary px-3 py-1 rounded-full text-label-md font-medium">
                    <span>{e.name}</span>
                    <span
                      className="material-symbols-outlined text-[16px] cursor-pointer hover:text-error transition-colors"
                      onClick={() => removeChip(e.id)}
                    >
                      close
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Employee list with checkboxes */}
            <div className="h-[200px] overflow-y-auto custom-scrollbar border border-outline-variant rounded-lg divide-y divide-outline-variant">
              {filtered.map((e) => (
                <label
                  key={e.id}
                  className="p-3 flex items-center gap-3 hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(e.id)}
                    onChange={() => toggle(e.id)}
                    className="rounded border-outline-variant text-primary focus:ring-primary w-4 h-4"
                  />
                  <img src={e.avatar} alt={e.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-label-md font-semibold">{e.name}</p>
                    <p className="text-label-sm text-outline">{e.role}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant">
          <button onClick={onClose}
            className="px-6 py-2 border border-primary text-primary rounded-lg font-label-md hover:bg-light-tint transition-all">
            Cancel
          </button>
          <button onClick={onClose}
            className="px-6 py-2 btn-gradient rounded-lg font-label-md shadow-md active:scale-95 transition-all">
            Create Group
          </button>
        </div>
      </div>
    </div>
  )
}



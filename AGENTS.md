# Session Summary (Aug 17, 2026)

## Changes Made (This Session)

### Inactive User Blurred Avatars, Directory Display & Static User Colors
- **`src/utils/avatar.jsx`**:
  - Updated `getUserColor` to generate a static deterministic color hash based strictly on normalized user name (`cleanName`).
  - Updated `renderAvatar` to support `isInactive` property, applying `filter blur-[0.5px] opacity-60`, `person_off` icons, and hover tooltips.
- **`src/context/AppContext.jsx`**:
  - Updated `fetchTeam` logic to set `status: 'Inactive'` and `isActive: 'No'` for deactivated employees, preventing them from resetting status to "Offline" or jumping to "Pending Approvals" on tab refresh.
- **`src/pages/TeamPage.jsx`**:
  - Kept deactivated team members visible in the team directory grid with blur cards (`blur-[0.5px] opacity-60`), **"Inactive by Admin"** status badges, and descriptive tooltips.
- **`src/components/TaskTable.jsx`**:
  - Added `checkUserInactive` helper to detect inactive users in team state across mobile, desktop table, and Kanban board views, applying avatar blur and **"[User Name] (Inactive by Admin)"** tooltips.
- **`src/pages/TaskDetailPage.jsx`**:
  - Updated "Assigned to" and "Assigned by" pills to render blurred names/avatars with `(Inactive by Admin)` tooltips for deactivated users.

---

# Session Summary (Jul 13, 2026)

## Changes Made (This Session)

### Daily Task Sheet Updates
- **`daily_task_sheet_script.js`**:
  - Removed the `Date` column entirely to ensure the sheet generates 6 columns (`Project name`, `Task Title`, `Status`, `Start Time`, `End Time`, `Remark`).
  - Added robust logic to correctly insert a blank row for spacing between different days' blocks without overwriting subsequent existing day headers.
- **`src/context/AppContext.jsx`**:
  - Updated the `DAILY_SHEET_WEB_APP_URL` to point to the newest Google Apps Script deployment.
  - Fixed a logic error in `handlePunchOut` that incorrectly included past "Done" tasks in today's timesheet. It now checks the `statusUpdatedOn` property and safely compares its date in IST format to ensure only tasks updated *today* are recorded in the current daily block.

### Commits
- Pushed Google Apps Script modifications and AppContext fixes to `origin/main`.

---

# Session Summary (Jul 9, 2026)

## Changes Made (This Session)

### Daily Task Sheet: Formatting, Punch-In Logging & Block Updates
- **`daily_task_sheet_script.js`**:
  - Rewrote with helper functions (`makeHeaderText`, `makeDispDate`, `findHeaderRow`, `formatTime`).
  - Added `log_punch_in` action: creates a minimal day block (dark green merged header, light green title row, one data row with start time) only if the date doesn't already exist.
  - Updated `log_daily_tasks` to first check for an existing header via `findHeaderRow`. If found, deletes the old data rows and inserts new task rows with end time. If not found, creates a full block from scratch.
  - Uses `getActiveSpreadsheet()` (runs on the active Daily Task List sheet).
- **`src/context/AppContext.jsx`**:
  - Updated `handlePunchIn` to send a `log_punch_in` request to the daily task sheet web app with the user's name, date, and start time.
  - Existing `handlePunchOut` unchanged (already sends `log_daily_tasks` with full task data).

---

# Session Summary (Jul 8, 2026)

## Changes Made (This Session)

### Client System: Project start Date, Completion Date & Info Modal
- **`src/pages/ClientsPage.jsx`**:
  - Added `projectStartDate` field to `newClientForm` (auto-filled with IST, editable with date picker + Today button)
  - Row click on Project Name calls `openClientInfo(client)` → info modal shows Project start Date, Active toggle, Project Completion Date (if set), and "Edit Full Details" button
  - `handleToggleStatus` updates `viewingClient` state locally so info modal reflects toggle instantly
- **`updated_apps_script.js`**:
  - `add_client`: header ensures all 10 columns; `appendRow` includes `projectStartDate` and empty `Project Completion Date`
  - `get_clients`: now self-corrects header order on every fetch
  - `update_client`: column indices shifted (Industry=7, Is Active=8, Services=9, Project Completion Date=10); auto-sets Project Completion Date on deactivation

### Commit
`c1444ef` — pushed to `origin/main`

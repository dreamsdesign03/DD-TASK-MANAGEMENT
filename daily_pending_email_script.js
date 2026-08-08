/**
 * Daily Pending Task Email — Standalone Apps Script
 * ==================================================
 * Runs on a time trigger every day at 9:00 AM, reads pending (not Done) tasks
 * from the shared DD Task Management spreadsheet and emails each team member a
 * summary of their pending tasks.
 *
 * - Emails are sent FROM the Google account that owns THIS script project
 *   (e.g. marketing.dreamdesign.in).
 * - It only READS the spreadsheet; it never writes to it.
 * - Works alongside the main backend (updated_apps_script.js) and the daily
 *   sheet script — it does not change them.
 */

var SPREADSHEET_ID = 'PASTE_YOUR_SPREADSHEET_ID_HERE';
var APP_URL = 'https://dd-task-management-system.vercel.app';
var SUBJECT = 'Your pending tasks for today';
var SENDER_NAME = 'Dreamsdesk Automated System';

var TASK_SHEET = 'Tasks';
var TEAM_SHEET = 'Team';

// 0-indexed columns in the Tasks sheet
var T_COL = { TITLE: 3, CLIENT: 1, ASSIGNED_TO: 8, EMPLOYEE_IDS: 9, ASSIGNED_EMAILS: 10, DUE_DATE: 13, PRIORITY: 14, STATUS: 15 };

// 0-indexed columns in the Team sheet
var TE_COL = { NAME: 1, EMAIL: 2, IS_ACTIVE: 7 };

/**
 * Main entry point — attach this to a 9 AM daily time trigger.
 * Also callable manually from the Apps Script editor (Run -> sendDailyPendingEmails).
 */
function sendDailyPendingEmails() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  var taskSheet = ss.getSheetByName(TASK_SHEET);
  var teamSheet = ss.getSheetByName(TEAM_SHEET);
  if (!taskSheet || !teamSheet) {
    console.error('Missing sheet. Expected tabs: "%s" and "%s"', TASK_SHEET, TEAM_SHEET);
    return;
  }

  // ---- Build a map of team member info: lowercased email -> {name, email} ----
  var teamRows = teamSheet.getDataRange().getValues();
  var byEmail = {};
  var byName = {};
  for (var r = 1; r < teamRows.length; r++) {
    var email = String(teamRows[r][TE_COL.EMAIL] || '').trim().toLowerCase();
    var name = String(teamRows[r][TE_COL.NAME] || '').trim();
    if (!email) continue;
    var isActive = teamRows[r][TE_COL.IS_ACTIVE];
    var active = String(isActive).trim().toUpperCase() !== 'FALSE';
    byEmail[email] = { email: email, name: name || email, active: active };
    if (name) byName[name.toLowerCase()] = byEmail[email];
  }

  // ---- Collect pending tasks per email ----
  var tasks = taskSheet.getDataRange().getValues();
  var pendingByEmail = {};
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  for (var r = 1; r < tasks.length; r++) {
    var row = tasks[r];
    var status = String(row[T_COL.STATUS] || '').trim();
    if (status === 'Done') continue;

    var taskEmails = parseEmails(row[T_COL.ASSIGNED_EMAILS]);
    if (taskEmails.length === 0) {
      // Fallback 1: match "Assigned To" names against the Team sheet
      var names = String(row[T_COL.ASSIGNED_TO] || '').split(',');
      for (var n = 0; n < names.length; n++) {
        var nameKey = names[n].trim().toLowerCase();
        if (nameKey && byName[nameKey]) taskEmails.push(byName[nameKey].email);
      }
    }
    if (taskEmails.length === 0) {
      // Fallback 2: match "Employee IDs" via names is not possible directly —
      // skip only if we really cannot find anyone.
      continue;
    }

    var entry = {
      title: String(row[T_COL.TITLE] || 'Untitled task'),
      project: String(row[T_COL.CLIENT] || ''),
      priority: String(row[T_COL.PRIORITY] || ''),
      status: status || 'Pending',
      dueDate: toDateString(row[T_COL.DUE_DATE]),
      overdue: isOverdue(row[T_COL.DUE_DATE], today)
    };

    var seen = {};
    for (var e = 0; e < taskEmails.length; e++) {
      var em = taskEmails[e];
      if (seen[em]) continue;
      seen[em] = true;
      if (!byEmail[em] || !byEmail[em].active) continue; // only email active members
      if (!pendingByEmail[em]) pendingByEmail[em] = { tasks: [], user: byEmail[em] };
      pendingByEmail[em].tasks.push(entry);
    }
  }

  // ---- Sort tasks: overdue first, then by due date, then title ----
  for (var key in pendingByEmail) {
    pendingByEmail[key].tasks.sort(function (a, b) {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return (a.title || '').localeCompare(b.title || '');
    });
  }

  // ---- Send emails ----
  var emailKeys = Object.keys(pendingByEmail);
  var sent = 0;
  for (var i = 0; i < emailKeys.length; i++) {
    var group = pendingByEmail[emailKeys[i]];
    if (group.tasks.length === 0) continue;
    try {
      GmailApp.sendEmail(group.user.email, SUBJECT, '', {
        htmlBody: buildEmailHtml(group.user.name, group.tasks),
        name: SENDER_NAME
      });
      sent++;
      console.info('Sent pending-task email to %s (%d tasks)', group.user.email, group.tasks.length);
    } catch (err) {
      console.error('Failed to email %s: %s', group.user.email, err.message);
    }
  }

  console.info('Done. Sent %d email(s).', sent);
  return sent;
}

function parseEmails(value) {
  var out = [];
  if (!value) return out;
  var parts = String(value).split(/[,;]/);
  for (var i = 0; i < parts.length; i++) {
    var em = parts[i].trim().toLowerCase();
    if (em && out.indexOf(em) === -1) out.push(em);
  }
  return out;
}

function toDateString(value) {
  if (!value) return '';
  var d = value;
  if (typeof value === 'string') {
    d = new Date(value);
    if (isNaN(d.getTime())) return value; // keep the raw string if unparseable
  }
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, 'Asia/Kolkata', 'dd-MMM-yyyy');
}

function isOverdue(value, today) {
  if (!value) return false;
  var d = value;
  if (typeof value === 'string') {
    d = new Date(value);
    if (isNaN(d.getTime())) return false;
  }
  if (!(d instanceof Date) || isNaN(d.getTime())) return false;
  d.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

function buildEmailHtml(name, tasks) {
  var rows = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    var due = t.dueDate ? (t.overdue ? '<span style="color:#dc2626;font-weight:600;">' + t.dueDate + ' (overdue)</span>' : t.dueDate) : '—';
    var project = t.project ? '<td style="padding:8px 10px;border-bottom:1px solid #eef2f7;color:#475569;">' + escapeHtml(t.project) + '</td>' : '<td style="padding:8px 10px;border-bottom:1px solid #eef2f7;color:#cbd5e1;">—</td>';
    rows.push(
      '<tr>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #eef2f7;color:#0f172a;font-weight:600;">' + escapeHtml(t.title) + '</td>' +
        project +
        '<td style="padding:8px 10px;border-bottom:1px solid #eef2f7;color:#475569;">' + (t.priority ? escapeHtml(t.priority) : '—') + '</td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #eef2f7;color:#475569;">' + escapeHtml(t.status) + '</td>' +
        '<td style="padding:8px 10px;border-bottom:1px solid #eef2f7;white-space:nowrap;">' + due + '</td>' +
      '</tr>'
    );
  }
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f8;padding:24px;">' +
      '<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">' +
        '<div style="background:#702c91;padding:20px 24px;">' +
          '<div style="color:#ffffff;font-size:18px;font-weight:bold;">Good morning, ' + escapeHtml(name) + '</div>' +
          '<div style="color:#d8b4e6;font-size:13px;margin-top:4px;">Here are your pending tasks (' + tasks.length + ')</div>' +
        '</div>' +
        '<div style="padding:20px 24px;">' +
          '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
            '<thead><tr>' +
              '<th style="text-align:left;padding:8px 10px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;">Task</th>' +
              '<th style="text-align:left;padding:8px 10px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;">Project</th>' +
              '<th style="text-align:left;padding:8px 10px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;">Priority</th>' +
              '<th style="text-align:left;padding:8px 10px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;">Status</th>' +
              '<th style="text-align:left;padding:8px 10px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;">Due</th>' +
            '</tr></thead>' +
            '<tbody>' + rows.join('') + '</tbody>' +
          '</table>' +
          '<div style="margin-top:20px;text-align:center;">' +
            '<a href="' + APP_URL + '/my-tasks" style="display:inline-block;background:#702c91;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:600;">Open My Tasks</a>' +
          '</div>' +
        '</div>' +
        '<div style="background:#f8fafc;padding:14px 24px;color:#94a3b8;font-size:11px;text-align:center;border-top:1px solid #e2e8f0;">Dreamsdesk Automated System<br>This email was generated automatically. Do not reply.</div>' +
      '</div>' +
    '</div>'
  );
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Send a single test email to verify authorization and formatting.
 * Run this once from the editor before scheduling the daily trigger.
 */
function testEmail() {
  var test = [
    {
      title: 'Example pending task',
      project: 'Example client',
      priority: 'High',
      status: 'Pending',
      dueDate: toDateString(new Date()),
      overdue: false
    }
  ];
  var me = Session.getActiveUser().getEmail();
  GmailApp.sendEmail(me, 'Test — pending tasks email', '', {
    htmlBody: buildEmailHtml('Test User', test),
    name: SENDER_NAME
  });
  console.info('Test email sent to %s', me);
}

/**
 * Install (or refresh) the daily 9:00 AM trigger.
 * Run this once from the editor; it removes any existing triggers first to
 * avoid duplicates. Timezone is Asia/Kolkata.
 */
function createDailyTrigger() {
  var handlers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < handlers.length; i++) {
    ScriptApp.deleteTrigger(handlers[i]);
  }
  ScriptApp.newTrigger('sendDailyPendingEmails')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .inTimezone('Asia/Kolkata')
    .create();
  console.info('Daily 9:00 AM trigger installed (Asia/Kolkata).');
}

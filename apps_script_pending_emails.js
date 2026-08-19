// ============================================================================
// Dreamsdesk - Pending Task Daily Email
// ============================================================================
// Deploy as a SEPARATE Google Apps Script project (not in Dreamsdesk).
// This keeps your working code.js completely untouched.
//
// Setup:
// 1. Go to script.google.com -> New Project -> rename to "Dreamsdesk-Emails"
// 2. Replace Code.gs contents with this file
// 3. Run createDailyTrigger() once from editor
// 4. Deploy -> New Deployment -> Web App -> Execute as Me -> Anyone can access
// 5. Paste the web app URL in src/config.js as VITE_PENDING_EMAIL_WEB_APP_URL
// ============================================================================

var SUPABASE_URL = "https://balrgagdbbfagmgryrwv.supabase.co";
var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhbHJnYWdkYmJmYWdtZ3J5cnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDYxNTQsImV4cCI6MjEwMjAyMjE1NH0.5R4abl_tx3jVX5Z98Pm5Mp0eePYsTFXThjYZA-_bapg";
var ADMIN_EMAIL = "dreamsdesign.in03@gmail.com";

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sbGet(table, query) {
  var url = SUPABASE_URL + "/rest/v1/" + table + "?" + query;
  var res = UrlFetchApp.fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
    muteHttpExceptions: true,
  });
  return JSON.parse(res.getContentText());
}

function buildIdToNameMap() {
  var team = sbGet("team", "select=employee_id,full_name");
  var map = {};
  (team || []).forEach(function (r) {
    if (r.employee_id && r.full_name) {
      map[r.employee_id.trim()] = r.full_name.trim();
    }
  });
  return map;
}

function formatEmailDueDate(dueDate) {
  if (!dueDate || String(dueDate).trim() === "") return "\u2014";
  var str = String(dueDate).trim();
  var parts = str.split("-");
  if (parts.length === 3) {
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var mi = parseInt(parts[1], 10) - 1;
    if (mi >= 0 && mi < 12) {
      return months[mi] + " " + parseInt(parts[2], 10) + ", " + parts[0];
    }
  }
  return str;
}

function getPendingTasks(assigneeName, idToName) {
  var allTasks = sbGet(
    "tasks",
    "select=task_id,task_title,client,priority,status,due_date,main_task_id,assigned_to&order=task_id"
  );
  return (allTasks || []).filter(function (t) {
    if (t.main_task_id && String(t.main_task_id).trim() !== "") return false;
    var s = String(t.status || "").trim().toLowerCase();
    if (s !== "pending" && s !== "in progress") return false;
    var assigned = String(t.assigned_to || "");
    if (assigned.toLowerCase().indexOf(assigneeName.toLowerCase()) !== -1) return true;
    var ids = assigned.split(",").map(function (x) { return x.trim(); });
    for (var i = 0; i < ids.length; i++) {
      if (idToName[ids[i]] && idToName[ids[i]].toLowerCase() === assigneeName.toLowerCase()) return true;
    }
    return false;
  });
}

function buildPendingEmailHTML(userName, tasks) {
  var firstName = String(userName).split(" ")[0];
  var count = tasks.length;
  var rows = "";
  tasks.forEach(function (t) {
    var priority = t.priority || "Medium";
    var pc = "#702c91";
    if (String(priority).toLowerCase() === "high") pc = "#dc2626";
    else if (String(priority).toLowerCase() === "low") pc = "#059669";
    rows += '<tr style="border-bottom:1px solid #e5e7eb;">';
    rows += '<td style="padding:10px 12px;font-size:13px;color:#1e1b2e;font-weight:600;">' + escapeHtml(t.task_title || t.task_id) + '</td>';
    rows += '<td style="padding:10px 12px;font-size:13px;color:#6b7280;">' + escapeHtml(t.client || "\u2014") + '</td>';
    rows += '<td style="padding:10px 12px;text-align:center;"><span style="background:' + pc + ';color:white;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;">' + escapeHtml(priority) + '</span></td>';
    rows += '<td style="padding:10px 12px;text-align:center;"><span style="background:#fef3c7;color:#d97706;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;">' + escapeHtml(t.status || "Pending") + '</span></td>';
    rows += '<td style="padding:10px 12px;text-align:center;font-size:13px;color:#6b7280;">' + formatEmailDueDate(t.due_date) + '</td>';
    rows += '</tr>';
  });
  var html = '<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:Segoe UI,Tahoma,Geneva,Verdana,sans-serif;background:#f9fafb;">';
  html += '<div style="max-width:680px;margin:20px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">';
  html += '<div style="background:linear-gradient(135deg,#702c91,#9333ea);padding:24px 32px;color:white;">';
  html += '<h2 style="margin:0;font-size:20px;font-weight:700;">Good morning, ' + escapeHtml(firstName) + '</h2>';
  html += '<p style="margin:6px 0 0;font-size:14px;opacity:0.9;">Here are your pending tasks (' + count + ')</p>';
  html += '</div>';
  html += '<div style="padding:16px 24px;">';
  html += '<table style="width:100%;border-collapse:collapse;">';
  html += '<thead><tr style="border-bottom:2px solid #e5e7eb;">';
  html += '<th style="padding:8px 12px;text-align:left;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Task</th>';
  html += '<th style="padding:8px 12px;text-align:left;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Project</th>';
  html += '<th style="padding:8px 12px;text-align:center;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Priority</th>';
  html += '<th style="padding:8px 12px;text-align:center;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Status</th>';
  html += '<th style="padding:8px 12px;text-align:center;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Due</th>';
  html += '</tr></thead>';
  html += '<tbody>' + rows + '</tbody>';
  html += '</table></div>';
  html += '<div style="padding:16px 24px 24px;text-align:center;">';
  html += '<a href="https://dd-task-management.vercel.app/my-tasks" style="display:inline-block;background:#702c91;color:white;padding:10px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Open My Tasks</a>';
  html += '</div></div></body></html>';
  return html;
}

function sendPendingTaskEmails() {
  var idToName = buildIdToNameMap();
  var team = sbGet("team", "select=full_name,email_address,is_active");
  var sent = 0;
  var skipped = 0;
  (team || []).forEach(function (member) {
    var isActive = String(member.is_active).toLowerCase();
    if (isActive === "false" || isActive === "no") return;
    var name = member.full_name || "";
    var email = member.email_address || "";
    if (!name || !email) return;
    var tasks = getPendingTasks(name, idToName);
    if (tasks.length === 0) { skipped++; return; }
    var html = buildPendingEmailHTML(name, tasks);
    var subject = "Good morning, " + name.split(" ")[0] + " \u2014 " + tasks.length + " pending task" + (tasks.length !== 1 ? "s" : "");
    GmailApp.sendEmail(email, subject, "", {
      htmlBody: html,
      from: ADMIN_EMAIL,
      name: "DD Task Manager",
    });
    sent++;
    Logger.log("Sent to " + email + " (" + tasks.length + " tasks)");
  });
  Logger.log("Done. Sent: " + sent + ", Skipped: " + skipped);
  return { sent: sent, skipped: skipped };
}

function sendTestPendingEmail() {
  var allTasks = sbGet("tasks", "select=task_id,task_title,client,priority,status,due_date,main_task_id,assigned_to&order=task_id");
  var pending = (allTasks || []).filter(function (t) {
    if (t.main_task_id && String(t.main_task_id).trim() !== "") return false;
    var s = String(t.status || "").trim().toLowerCase();
    return s === "pending" || s === "in progress";
  });
  var html = buildPendingEmailHTML("Mansi Shah", pending);
  GmailApp.sendEmail(ADMIN_EMAIL, "Test: Pending Tasks (" + pending.length + ")", "", {
    htmlBody: html,
    from: ADMIN_EMAIL,
    name: "DD Task Manager",
  });
  Logger.log("Test sent to " + ADMIN_EMAIL + " (" + pending.length + " tasks)");
  return { ok: true, count: pending.length };
}

function doPost(e) {
  var data = {};
  try {
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }
  } catch (err) {}

  var action = String(data.action || "").trim();

  if (action === "send_pending_emails") {
    var result = sendPendingTaskEmails();
    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, sent: result.sent, skipped: result.skipped })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "send_test_email") {
    var testResult = sendTestPendingEmail();
    return ContentService.createTextOutput(
      JSON.stringify(testResult)
    ).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(
    JSON.stringify({ ok: false, error: "Unknown action" })
  ).setMimeType(ContentService.MimeType.JSON);
}

function createDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "sendPendingTaskEmails") {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger("sendPendingTaskEmails")
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .nearMinute(0)
    .inTimezone("Asia/Kolkata")
    .create();
  Logger.log("Daily 9 AM IST trigger created.");
}

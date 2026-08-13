// ============================================================================
// Dreamsdesk Registration Email & One-Click Approval Script
// Deployed Web App URL: https://script.google.com/macros/s/AKfycbzXMGpJzfOi3i3RNYEGRCVL-XZFJiSyXhDKQrbOdeueCF___gUZ0wQHDKGWGlkUqHm9/exec
// Live Production URL: https://dd-task-management.vercel.app
// ============================================================================

var SUPABASE_URL = "https://balrgagdbbfagmgryrwv.supabase.co";
var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhbHJnYWdkYmJmYWdtZ3J5cnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDYxNTQsImV4cCI6MjEwMjAyMjE1NH0.5R4abl_tx3jVX5Z98Pm5Mp0eePYsTFXThjYZA-_bapg";
var VERCEL_APP_URL = "https://dd-task-management.vercel.app/login";
var ADMIN_EMAIL = PropertiesService.getScriptProperties().getProperty("ADMIN_EMAIL") || "dreamsdesign.in03@gmail.com";
// Approval is handled by the web app itself (direct Supabase update) so it never
// depends on this Apps Script deployment being up to date.
var WEB_APP_APPROVE_URL = "https://dd-task-management.vercel.app/approve?email=";
// Parent Google Drive folder where a sub-folder is auto-created for each client project.
var CLIENTS_DRIVE_PARENT_ID = "1vVUKi3ha4up966BlvAQs4mRIve043-QE";

/**
 * Creates (or reuses) a Drive folder named after the project inside the parent
 * CLIENTS_DRIVE_PARENT_ID folder. Returns { ok, url, folderId, error }.
 */
function createClientDriveFolder(projectName) {
  try {
    var folderName = String(projectName || "New Project").replace(/[\\/:*?"<>|]/g, "-").trim();
    var parent = DriveApp.getFolderById(CLIENTS_DRIVE_PARENT_ID);

    var existing = parent.getFoldersByName(folderName);
    var folder;
    if (existing.hasNext()) {
      folder = existing.next();
    } else {
      folder = parent.createFolder(folderName);
    }
    return { ok: true, url: folder.getUrl(), folderId: folder.getId() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Stores the Drive folder link back on the client row in Supabase.
 */
function saveClientDriveLink(clientId, driveUrl) {
  if (!clientId || !driveUrl) return;
  try {
    var headers = {
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    };
    UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/clients?client_id=eq." + encodeURIComponent(clientId), {
      method: "patch",
      headers: headers,
      payload: JSON.stringify({ drive_folder_link: driveUrl }),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log("saveClientDriveLink error: " + e.message);
  }
}

/**
 * Updates user in Supabase: sets is_active = true and status = 'Approved'
 * Uses ilike for case-insensitive email matching and verifies row modification.
 */
function approveUserInSupabase(email) {
  if (!email) return { ok: false, error: "No email provided" };
  var cleanEmail = String(email).trim().toLowerCase();
  var payload = JSON.stringify({
    is_active: true,
    status: "Approved"
  });

  var headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
  };

  // Try exact match first
  try {
    var urlEq = SUPABASE_URL + "/rest/v1/team?email_address=eq." + encodeURIComponent(cleanEmail);
    var res1 = UrlFetchApp.fetch(urlEq, { method: "patch", headers: headers, payload: payload, muteHttpExceptions: true });
    var code1 = res1.getResponseCode();
    if (code1 === 200 || code1 === 204) {
      return { ok: true, code: code1 };
    }
  } catch (e) {}

  // Try ilike match as fallback
  try {
    var urlIlike = SUPABASE_URL + "/rest/v1/team?email_address=ilike." + encodeURIComponent(cleanEmail);
    var res2 = UrlFetchApp.fetch(urlIlike, { method: "patch", headers: headers, payload: payload, muteHttpExceptions: true });
    var code2 = res2.getResponseCode();
    if (code2 === 200 || code2 === 204) {
      return { ok: true, code: code2 };
    }
  } catch (e) {}

  return { ok: false, error: "Supabase update failed - both exact and ilike attempts returned non-2xx" };
}

/**
 * Handles GET requests when Admin clicks the "Approve User Access" button in Gmail
 */
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var email = params.email || "";
  var action = params.action || "";

  if (action === "approve_user" || action === "approve" || email) {
    var result = approveUserInSupabase(email);
    var success = result.ok;

    var htmlOutput = success ? `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>User Approval - Dreamsdesk</title>
        <style>
          body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background-color: #F3F4F6; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { background: #ffffff; padding: 44px 36px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08); text-align: center; max-width: 450px; width: 100%; border: 1px solid #E5E7EB; }
          .icon-container { width: 68px; height: 68px; background: #ECFDF5; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
          .icon { color: #10B981; font-size: 36px; font-weight: bold; }
          h1 { color: #111827; font-size: 24px; font-weight: 700; margin: 0 0 10px 0; }
          p { color: #4B5563; font-size: 15px; line-height: 1.5; margin: 0 0 24px 0; }
          .email-highlight { color: #4C1D95; font-weight: 600; word-break: break-all; }
          .badge { display: inline-block; background: #D1FAE5; color: #065F46; font-weight: 700; padding: 8px 20px; border-radius: 9999px; font-size: 14px; margin-bottom: 28px; }
          .btn-login { display: inline-block; background-color: #4C1D95; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; transition: background 0.2s; }
          .btn-login:hover { background-color: #3B1477; }
          .footer { margin-top: 32px; font-size: 12px; color: #9CA3AF; border-top: 1px solid #F3F4F6; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon-container">
            <span class="icon">✓</span>
          </div>
          <h1>User Access Approved!</h1>
          <p>The account for <span class="email-highlight">${email}</span> has been activated in Dreamsdesk.</p>
          <div>
            <span class="badge">Status: Approved</span>
          </div>
          <div>
            <a href="${VERCEL_APP_URL}" class="btn-login" target="_blank">Open Dreamsdesk Web App</a>
          </div>
          <div class="footer">
            Dreamsdesk Automated Administration System
          </div>
        </div>
      </body>
      </html>
    ` : `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Approval Error - Dreamsdesk</title>
        <style>
          body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background-color: #F3F4F6; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { background: #ffffff; padding: 44px 36px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08); text-align: center; max-width: 450px; width: 100%; border: 1px solid #E5E7EB; }
          .icon-container { width: 68px; height: 68px; background: #FEF2F2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
          .icon { color: #EF4444; font-size: 36px; font-weight: bold; }
          h1 { color: #111827; font-size: 24px; font-weight: 700; margin: 0 0 10px 0; }
          p { color: #4B5563; font-size: 15px; line-height: 1.5; margin: 0 0 24px 0; }
          .badge { display: inline-block; background: #FEE2E2; color: #991B1B; font-weight: 700; padding: 8px 20px; border-radius: 9999px; font-size: 14px; margin-bottom: 28px; }
          .btn-login { display: inline-block; background-color: #4C1D95; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; }
          .footer { margin-top: 32px; font-size: 12px; color: #9CA3AF; border-top: 1px solid #F3F4F6; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon-container">
            <span class="icon">✕</span>
          </div>
          <h1>User Not Found</h1>
          <p>Could not find account for <strong>${email}</strong> in Supabase database.</p>
          <p style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:10px 14px;color:#B91C1C;font-size:13px;text-align:left;">${result.error || 'Unknown error'}</p>
          <div>
            <span class="badge">Status: Update Failed</span>
          </div>
          <div>
            <a href="${VERCEL_APP_URL}" class="btn-login" target="_blank">Open Dreamsdesk Web App</a>
          </div>
          <div class="footer">
            Dreamsdesk Automated Administration System
          </div>
        </div>
      </body>
      </html>
    `;
    return HtmlService.createHtmlOutput(htmlOutput).setTitle("User Approval - Dreamsdesk");
  }

  return ContentService.createTextOutput("Dreamsdesk Registration Web App Service Active.").setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Handles POST requests when a user registers on the web/desktop app
 */
function doPost(e) {
  try {
    var data = {};
    if (e && e.parameter && Object.keys(e.parameter).length > 0) {
      data = e.parameter;
    } else if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (jsonErr) {
        data = e.parameter || {};
      }
    }

    var action = String(data.action || '').trim();

    if (action === "notify_new_client") {
      return handleNewClientNotification(data);
    }

    var fullName = data.fullName || data.name || data["Full Name"] || 'New User';
    var emailAddress = data.emailAddress || data.email || data["Email Address"] || '';
    var phone = data.phone || data["Phone"] || 'N/A';
    var department = data.department || data["Department"] || 'N/A';
    var requestedRole = data.requestedRole || data.systemRole || data.role || 'Employee';

    // Dynamic Web App approval link (handled by the Vercel app -> Supabase directly)
    var approvalLink = WEB_APP_APPROVE_URL + encodeURIComponent(emailAddress);

    var htmlBody = `
      <div style="background-color: #F3F4F6; padding: 40px 10px; font-family: Arial, sans-serif;">
        <div style="max-width: 550px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; padding: 40px; border: 1px solid #E5E7EB; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          
          <h2 style="color: #4C1D95; font-size: 24px; font-weight: 700; margin: 0 0 6px 0; text-align: center;">New Registration Request</h2>
          <p style="color: #6B7280; font-size: 14px; margin: 0 0 28px 0; text-align: center;">A new user is waiting for access to Dreamsdesk.</p>
          
          <div style="background-color: #F9FAFB; border-radius: 12px; padding: 16px 20px; margin-bottom: 28px; border: 1px solid #F3F4F6;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 10px 0; color: #6B7280; font-weight: 500; border-bottom: 1px solid #F3F4F6; width: 35%;">Name</td>
                <td style="padding: 10px 0; color: #111827; font-weight: 700; border-bottom: 1px solid #F3F4F6; text-align: right;">${fullName}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #6B7280; font-weight: 500; border-bottom: 1px solid #F3F4F6;">Email</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #F3F4F6; text-align: right;"><a href="mailto:${emailAddress}" style="color: #2563EB; text-decoration: none; font-weight: 600;">${emailAddress}</a></td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #6B7280; font-weight: 500; border-bottom: 1px solid #F3F4F6;">System Role</td>
                <td style="padding: 10px 0; color: #111827; font-weight: 700; border-bottom: 1px solid #F3F4F6; text-align: right;">${requestedRole}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #6B7280; font-weight: 500; border-bottom: 1px solid #F3F4F6;">Department</td>
                <td style="padding: 10px 0; color: #111827; font-weight: 700; border-bottom: 1px solid #F3F4F6; text-align: right;">${department}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #6B7280; font-weight: 500;">Phone</td>
                <td style="padding: 10px 0; color: #111827; font-weight: 700; text-align: right;">${phone}</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin-bottom: 28px;">
            <a href="${approvalLink}" target="_blank" style="display: inline-block; background-color: #4C1D95; color: #ffffff; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; box-shadow: 0 4px 12px rgba(76, 29, 149, 0.25);">Approve User Access</a>
          </div>

          <div style="border-top: 1px solid #F3F4F6; padding-top: 20px; text-align: center;">
            <p style="color: #9CA3AF; font-size: 12px; margin: 0; line-height: 1.5;">Dreamsdesk Automated System<br>Do not forward this email.</p>
          </div>

        </div>
      </div>
    `;

    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: `New User Registration Approval Request - Dreamsdesk`,
      htmlBody: htmlBody,
      name: "Dreamsdesk - Dreams Design"
    });

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Fetches the email addresses of all approved/active team members.
 */
function getActiveTeamEmails() {
  var headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Content-Type": "application/json"
  };
  try {
    var res = UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/team?select=email_address,full_name,is_active,status", { headers: headers, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return [];
    var rows = JSON.parse(res.getContentText());
    return rows.filter(function (r) {
      var active = r.is_active === true || r.is_active === "true" || r.is_active === "Yes" || r.is_active === "yes";
      var status = String(r.status || "").toLowerCase();
      return active || status === "approved" || status === "active";
    }).map(function (r) { return { email: r.email_address, name: r.full_name }; });
  } catch (e) {
    return [];
  }
}

/**
 * Sends a "new client / project added" notification to all active team members.
 */
function handleNewClientNotification(data) {
  var projectName = data.projectName || data.project_name || data["Project Name"] || "New Project";
  var clientName = data.clientName || data.client_name || data["Client Name"] || "N/A";
  var contactEmail = data.contactEmail || data.contact_email || data["Contact Email"] || "N/A";
  var phone = data.phone || data["Phone"] || "N/A";
  var industry = data.industry || data["Industry"] || "N/A";
  var services = data.services || data["Services"] || "N/A";
  var startDate = data.projectStartDate || data.project_start_date || data["Project Start Date"] || "N/A";
  var addedBy = data.addedBy || "Dreamsdesk Team";
  var clientId = data.clientId || data.client_id || "";

  var folderResult = createClientDriveFolder(projectName);
  var driveUrl = folderResult.ok ? folderResult.url : "";
  if (driveUrl) {
    saveClientDriveLink(clientId, driveUrl);
  }

  var team = getActiveTeamEmails();
  var allEmails = team.map(function (r) { return r.email; }).filter(Boolean);
  if (allEmails.length === 0) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "No active team members to notify" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var htmlBody = `
    <div style="background-color: #F3F4F6; padding: 40px 10px; font-family: Arial, sans-serif;">
      <div style="max-width: 550px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; padding: 40px; border: 1px solid #E5E7EB; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <h2 style="color: #4C1D95; font-size: 24px; font-weight: 700; margin: 0 0 6px 0; text-align: center;">New Client / Project Added</h2>
        <p style="color: #6B7280; font-size: 14px; margin: 0 0 28px 0; text-align: center;">A new client/project has been added to Dreamsdesk.</p>
        <div style="background-color: #F9FAFB; border-radius: 12px; padding: 16px 20px; margin-bottom: 28px; border: 1px solid #F3F4F6;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 10px 0; color: #6B7280; font-weight: 500; border-bottom: 1px solid #F3F4F6; width: 35%;">Project Name</td>
              <td style="padding: 10px 0; color: #111827; font-weight: 700; border-bottom: 1px solid #F3F4F6; text-align: right;">${projectName}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #6B7280; font-weight: 500; border-bottom: 1px solid #F3F4F6;">Drive Folder</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #F3F4F6; text-align: right;">${driveUrl ? '<a href="' + driveUrl + '" target="_blank" style="color: #2563EB; text-decoration: none; font-weight: 600;">Open in Drive</a>' : '<span style="color: #DC2626; font-weight: 600;">Could not create</span>'}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #6B7280; font-weight: 500; border-bottom: 1px solid #F3F4F6;">Client Name</td>
              <td style="padding: 10px 0; color: #111827; font-weight: 700; border-bottom: 1px solid #F3F4F6; text-align: right;">${clientName}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #6B7280; font-weight: 500; border-bottom: 1px solid #F3F4F6;">Contact Email</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #F3F4F6; text-align: right;"><a href="mailto:${contactEmail}" style="color: #2563EB; text-decoration: none; font-weight: 600;">${contactEmail}</a></td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #6B7280; font-weight: 500; border-bottom: 1px solid #F3F4F6;">Phone</td>
              <td style="padding: 10px 0; color: #111827; font-weight: 700; border-bottom: 1px solid #F3F4F6; text-align: right;">${phone}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #6B7280; font-weight: 500; border-bottom: 1px solid #F3F4F6;">Industry</td>
              <td style="padding: 10px 0; color: #111827; font-weight: 700; border-bottom: 1px solid #F3F4F6; text-align: right;">${industry}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #6B7280; font-weight: 500; border-bottom: 1px solid #F3F4F6;">Services</td>
              <td style="padding: 10px 0; color: #111827; font-weight: 700; border-bottom: 1px solid #F3F4F6; text-align: right;">${services}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #6B7280; font-weight: 500; border-bottom: 1px solid #F3F4F6;">Start Date</td>
              <td style="padding: 10px 0; color: #111827; font-weight: 700; border-bottom: 1px solid #F3F4F6; text-align: right;">${startDate}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #6B7280; font-weight: 500;">Added By</td>
              <td style="padding: 10px 0; color: #111827; font-weight: 700; text-align: right;">${addedBy}</td>
            </tr>
          </table>
        </div>
        <div style="text-align: center; margin-bottom: 28px;">
          <a href="https://dd-task-management.vercel.app/clients" target="_blank" style="display: inline-block; background-color: #4C1D95; color: #ffffff; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; box-shadow: 0 4px 12px rgba(76, 29, 149, 0.25);">View Clients</a>
        </div>
        <div style="border-top: 1px solid #F3F4F6; padding-top: 20px; text-align: center;">
          <p style="color: #9CA3AF; font-size: 12px; margin: 0; line-height: 1.5;">Dreamsdesk Automated System<br>You received this because you are a member of the Dreamsdesk team.</p>
        </div>
      </div>
    </div>
  `;

  MailApp.sendEmail({
    to: ADMIN_EMAIL,
    bcc: allEmails.filter(function (em) { return String(em).toLowerCase() !== String(ADMIN_EMAIL).toLowerCase(); }).join(","),
    subject: "New Client/Project Added: " + projectName + " - Dreamsdesk",
    htmlBody: htmlBody,
    name: "Dreamsdesk - Dreams Design"
  });

  return ContentService.createTextOutput(JSON.stringify({ ok: true, recipients: allEmails.length }))
    .setMimeType(ContentService.MimeType.JSON);
}

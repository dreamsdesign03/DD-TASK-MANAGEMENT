// ============================================================================
// Dreamsdesk Registration Email & One-Click Approval Script
// Deployed Web App URL: https://script.google.com/macros/s/AKfycbyqqLi4FCRg79Xj3Ph_J0m-iDFdEGtyjRbq_NmEafUNjB7oAjAqM2ILWGpd4_OAYioI/exec
// Live Production URL: https://dd-task-management.vercel.app
// ============================================================================

var SUPABASE_URL = "https://balrgagdbbfagmgryrwv.supabase.co";
var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhbHJnYWdkYmJmYWdtZ3J5cnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDYxNTQsImV4cCI6MjEwMjAyMjE1NH0.5R4abl_tx3jVX5Z98Pm5Mp0eePYsTFXThjYZA-_bapg";
var VERCEL_APP_URL = "https://dd-task-management.vercel.app/login";
var ADMIN_EMAIL = "dreamsdesign.in03@gmail.com";
var WEB_APP_EXEC_URL = "https://script.google.com/macros/s/AKfycbyqqLi4FCRg79Xj3Ph_J0m-iDFdEGtyjRbq_NmEafUNjB7oAjAqM2ILWGpd4_OAYioI/exec";

/**
 * Updates user in Supabase: sets is_active = true and status = 'Approved'
 * Uses ilike for case-insensitive email matching and verifies row modification.
 */
function approveUserInSupabase(email) {
  if (!email) return false;
  var cleanEmail = String(email).trim().toLowerCase();
  var url = SUPABASE_URL + "/rest/v1/team?email_address=ilike." + encodeURIComponent(cleanEmail);
  var options = {
    method: "patch",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    payload: JSON.stringify({
      is_active: true,
      status: "Approved"
    }),
    muteHttpExceptions: true
  };
  try {
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    if (code === 200 || code === 204) {
      var bodyText = response.getContentText();
      try {
        var data = JSON.parse(bodyText);
        return Array.isArray(data) && data.length > 0;
      } catch (e) {
        return true;
      }
    }
    return false;
  } catch (err) {
    Logger.log("Error updating Supabase: " + err.message);
    return false;
  }
}

/**
 * Handles GET requests when Admin clicks the "Approve User Access" button in Gmail
 */
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var email = params.email || "";
  var action = params.action || "";

  if (action === "approve_user" || action === "approve" || email) {
    var success = approveUserInSupabase(email);
    
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

    var fullName = data.fullName || data.name || data["Full Name"] || 'New User';
    var emailAddress = data.emailAddress || data.email || data["Email Address"] || '';
    var phone = data.phone || data["Phone"] || 'N/A';
    var department = data.department || data["Department"] || 'N/A';
    var requestedRole = data.requestedRole || data.systemRole || data.role || 'Employee';

    // Dynamic Web App approval link
    var approvalLink = WEB_APP_EXEC_URL + "?action=approve_user&email=" + encodeURIComponent(emailAddress);

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

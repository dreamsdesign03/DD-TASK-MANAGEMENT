// ============================================
// Dreamsdesk Production Backend 
// doPost handles Writes (Tasks, Chat, Auth)
// doGet handles Reads (Tasks, Team, Clients, Chat, and Approvals)
// ============================================

// Helper: find header index by trimmed, case-insensitive match
function findHeaderIndex(headers, name) {
  var target = String(name).trim().toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toLowerCase() === target) return i;
  }
  return -1;
}

// Helper to check Authorization
function isUserAuthorized(email, ss) {
  if (!email) return false;
  var teamSheet = ss.getSheetByName("Team");
  if (!teamSheet) return false;
  var data = teamSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][2]).trim().toLowerCase() === String(email).trim().toLowerCase()) {
      var role = String(data[i][8] || "").trim().toLowerCase();
      if (role === "admin" || role === "manager" || role === "accountant") return true;
      return false;
    }
  }
  return false;
}

function doPost(e) {
  if (!e || !e.postData) {
    return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": "No payload received." })).setMimeType(ContentService.MimeType.JSON);
  }

  var payload = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.openById("1DLdlDT21vVwsggGlPg8xpSt2zjNJ_-z7W_GbFr7qIXs");

  // -------------------------
  // 1. HANDLE FILE UPLOAD 
  // -------------------------
  if (payload.action === 'upload_file') {
    try {
      var mainFolderName = "DD Projects 2026";
      var mainFolders = DriveApp.getFoldersByName(mainFolderName);
      var mainFolder;

      // 1. Main Root Folder
      if (mainFolders.hasNext()) {
        mainFolder = mainFolders.next();
      } else {
        mainFolder = DriveApp.createFolder(mainFolderName);
        mainFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      }

      // 2. Project Folder
      var projectName = payload.projectName || "General";
      var subfolders = mainFolder.getFoldersByName(projectName);
      var projectFolder;

      if (subfolders.hasNext()) {
        projectFolder = subfolders.next();
      } else {
        projectFolder = mainFolder.createFolder(projectName);
        projectFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      }

      // 3. Department Folder
      var departmentName = payload.department || "COMMON";
      var deptFolders = projectFolder.getFoldersByName(departmentName);
      var departmentFolder;

      if (deptFolders.hasNext()) {
        departmentFolder = deptFolders.next();
      } else {
        departmentFolder = projectFolder.createFolder(departmentName);
        departmentFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      }

      var contentType = payload.mimeType || 'application/octet-stream';
      var blob = Utilities.newBlob(Utilities.base64Decode(payload.base64), contentType, payload.filename);

      // Upload directly into the Department folder
      var file = departmentFolder.createFile(blob);

      return ContentService.createTextOutput(JSON.stringify({
        "ok": true,
        "url": file.getUrl(),
        "downloadUrl": file.getDownloadUrl()
      })).setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        "ok": false,
        "error": err.message
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // -------------------------
  // 2. HANDLE TASKS
  // -------------------------
  if (payload.action === 'add_task' || payload.action === 'update_task' || payload.action === 'delete_task') {
    try {
      var sheet = ss.getSheetByName("Tasks");
      if (!sheet) {
        sheet = ss.insertSheet("Tasks");
        sheet.appendRow(["Task ID", "Client", "Month", "Task Title", "Task Type", "Main Task ID", "Description", "Assigned By", "Assigned To", "Employee IDs", "Assigned Emails", "Department", "Assigned Date", "Due Date", "Priority", "Status", "Status Updated On", "Time Taken", "Days Overdue", "Remarks", "Post", "Attachment", "Is Recurring", "Recurring Schedule", "Recurring Day", "Recurring Months", "Last Auto-Generated Date"]);
      }

      var maxCols = sheet.getMaxColumns();
      if (maxCols < 27) {
        sheet.insertColumnsAfter(maxCols, 27 - maxCols);
      }

      if ((payload.action === 'update_task' || payload.action === 'delete_task') && payload.taskId) {
        var data = sheet.getDataRange().getValues();
        for (var i = 1; i < data.length; i++) {
          if (data[i][0] == payload.taskId) {
            if (payload.action === 'delete_task') {
              if (!isUserAuthorized(payload.userEmail, ss)) {
                return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": "Unauthorized" })).setMimeType(ContentService.MimeType.JSON);
              }
              sheet.deleteRow(i + 1);
              return ContentService.createTextOutput(JSON.stringify({ "ok": true, "deleted": true })).setMimeType(ContentService.MimeType.JSON);
            }
            sheet.getRange(i + 1, 1, 1, 27).setValues([[
              payload.taskId || "",
              payload.client || "",
              payload.month || "",
              payload.taskTitle || "",
              payload.taskType || "",
              payload.mainTaskId || "",
              payload.description || "",
              payload.assignedBy || "",
              payload.assignedTo || "",
              payload.employeeId || "",
              payload.assignedEmail || "",
              payload.department || "COMMON",
              payload.assignedDate || "",
              payload.dueDate || "",
              payload.priority || "",
              payload.status || "",
              payload.statusUpdatedOn || "",
              payload.timeTaken || "0h 0m",
              payload.daysOverdue || "",
              payload.remarks || "",
              payload.post || "NO",
              payload.attachment || "",
              payload.isRecurring || "",
              payload.recurringSchedule || "",
              payload.recurringDay || "",
              payload.recurringMonths || "",
              payload.lastAutoGeneratedDate || ""
            ]]);
            return ContentService.createTextOutput(JSON.stringify({ "ok": true })).setMimeType(ContentService.MimeType.JSON);
          }
        }
        if (payload.action === 'delete_task') {
          return ContentService.createTextOutput(JSON.stringify({ "ok": true, "error": "not_found" })).setMimeType(ContentService.MimeType.JSON);
        }
      }

      // Find the first empty row to prevent skipping pre-formatted blank rows
      var dataAll = sheet.getDataRange().getValues();
      var insertRow = dataAll.length + 1;
      for (var r = 1; r < dataAll.length; r++) {
        // If Task ID is completely empty, we can use this row
        if (!dataAll[r][0] || String(dataAll[r][0]).trim() === "") {
          insertRow = r + 1;
          break;
        }
      }

      sheet.getRange(insertRow, 1, 1, 27).setValues([[
        payload.taskId || "",
        payload.client || "",
        payload.month || "",
        payload.taskTitle || "",
        payload.taskType || "",
        payload.mainTaskId || "",
        payload.description || "",
        payload.assignedBy || "",
        payload.assignedTo || "",
        payload.employeeId || "",
        payload.assignedEmail || "",
        payload.department || "COMMON",
        payload.assignedDate || "",
        payload.dueDate || "",
        payload.priority || "",
        payload.status || "",
        payload.statusUpdatedOn || "",
        payload.timeTaken || "0h 0m",
        payload.daysOverdue || "",
        payload.remarks || "",
        payload.post || "NO",
        payload.attachment || "",
        payload.isRecurring || "",
        payload.recurringSchedule || "",
        payload.recurringDay || "",
        payload.recurringMonths || "",
        payload.lastAutoGeneratedDate || ""
      ]]);
      return ContentService.createTextOutput(JSON.stringify({ "ok": true })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": err.message })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // -------------------------
  // -------------------------
  // 3. HANDLE LOGIN
  // -------------------------
  if (payload.action === 'login' || payload.action === 'google_login') {
    var teamSheet = ss.getSheetByName("Team");
    if (!teamSheet) {
      return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": "Team sheet not found" })).setMimeType(ContentService.MimeType.JSON);
    }
    var data = teamSheet.getDataRange().getValues();
    var emailToMatch = String(payload.email).trim().toLowerCase();

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var rowEmail = String(row[2]).trim().toLowerCase();
      var rowPassword = String(row[3]).trim();
      var isActive = String(row[7]).trim(); // Column H (Is Active at index 7)

      if (rowEmail === emailToMatch) {
        if (payload.action === 'login' && rowPassword !== String(payload.password).trim()) {
          return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": "Invalid email or password" })).setMimeType(ContentService.MimeType.JSON);
        }



        if (isActive === "Pending") {
          return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": "Admin not approved" })).setMimeType(ContentService.MimeType.JSON);
        }

        // Note: Login only authenticates the user now. It doesn't set them "Online".
        // Punching in handles the "Online" status and activity logging.
        var userObj = {
          "Employee ID": row[0],
          "Full Name": row[1],
          "Email Address": row[2],
          "Role": row[8],
          "Department": row[4],
          "Phone": row[5],
          "Joined Date": row[6],
          "Is Active": "Yes",
          "System Role": String(row[8] || "Employee").trim()
        };
        return ContentService.createTextOutput(JSON.stringify({
          "ok": true, "authenticated": true, "user": userObj
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    if (payload.action === 'google_login') {
      return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": "not_registered" })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": "Invalid email or password" })).setMimeType(ContentService.MimeType.JSON);
  }

  // -------------------------
  // -------------------------
  // 3.5. HANDLE PUNCH IN & PUNCH OUT
  // -------------------------
  if (payload.action === 'punch_in' || payload.action === 'punch_out') {
    var teamSheet = ss.getSheetByName("Team");
    if (!teamSheet) {
      return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": "Team sheet not found" })).setMimeType(ContentService.MimeType.JSON);
    }
    var data = teamSheet.getDataRange().getValues();
    var emailToMatch = String(payload.email).trim().toLowerCase();

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var rowEmail = String(row[2]).trim().toLowerCase();
      if (rowEmail === emailToMatch) {
        if (payload.action === 'punch_in') {
          teamSheet.getRange(i + 1, 10).setValue("Online");
          // Auto-close any previous active session before creating a new one
          recordActivityLogout(ss, payload.email);
          recordActivityLogin(ss, row[0], row[1], row[8], row[4]);
        } else if (payload.action === 'punch_out') {
          teamSheet.getRange(i + 1, 10).setValue("Offline");
          recordActivityLogout(ss, payload.email);
        }
        return ContentService.createTextOutput(JSON.stringify({ "ok": true })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": "User not found" })).setMimeType(ContentService.MimeType.JSON);
  }

  // -------------------------
  // 4. HANDLE REGISTRATION (With HTML Email Button)
  // -------------------------
  if (payload.action === 'register') {
    var teamSheet = ss.getSheetByName("Team");
    if (!teamSheet) {
      teamSheet = ss.insertSheet("Team");
      teamSheet.appendRow(["Employee ID", "Full Name", "Email Address", "Password Token", "Department", "Phone", "Joined Date", "Is Active", "Role", "Status"]);
    }

    var data = teamSheet.getDataRange().getValues();
    var lastEmpId = 0;
    for (var i = 1; i < data.length; i++) {
      var idStr = String(data[i][0]).replace("EMP-", "");
      var idNum = parseInt(idStr, 10);
      if (!isNaN(idNum) && idNum > lastEmpId) {
        lastEmpId = idNum;
      }
    }
    var newEmpId = "EMP-" + ("000" + (lastEmpId + 1)).slice(-3);
    var joinedDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

    var formattedPhone = payload.phone ? (payload.phone.toString().startsWith("+") ? "'" + payload.phone : payload.phone) : "";

    teamSheet.appendRow([
      newEmpId,
      payload.name || "",
      payload.email || "",
      "token_" + payload.name.split(" ")[0].toLowerCase() + "_" + newEmpId.split("-")[1],
      payload.department || "General",
      formattedPhone,
      joinedDate,
      "Pending",
      payload.systemRole || "Employee",
      "Offline"
    ]);

    // Send RICH HTML Approval Email to Admin with a Button
    try {
      var adminEmail = "marketing.dreamsdesign.in@gmail.com";
      var subject = "New User Registration Approval Request - Dreamsdesk";

      var scriptUrl = ScriptApp.getService().getUrl();
      var approveLink = scriptUrl + "?action=approve_user&email=" + encodeURIComponent(payload.email);

      var htmlBody = "<div style='font-family: Inter, Arial, sans-serif; color: #333; max-width: 500px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);'>" +
        "<div style='text-align: center; margin-bottom: 24px;'>" +
        "<h2 style='color: #461466; margin: 0; font-size: 24px; font-weight: 700;'>New Registration Request</h2>" +
        "<p style='color: #64748b; margin-top: 8px; font-size: 14px;'>A new user is waiting for access to Dreamsdesk.</p>" +
        "</div>" +
        "<div style='background-color: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 30px;'>" +
        "<table style='width: 100%; border-collapse: collapse; font-size: 14px;'>" +
        "<tr><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; width: 100px;'>Name</td><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600; text-align: right;'>" + payload.name + "</td></tr>" +
        "<tr><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;'>Email</td><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600; text-align: right;'>" + payload.email + "</td></tr>" +
        "<tr><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;'>Role</td><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600; text-align: right;'>" + payload.role + "</td></tr>" +
        "<tr><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;'>System Role</td><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600; text-align: right;'>" + (payload.systemRole || "Employee") + "</td></tr>" +
        "<tr><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;'>Department</td><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600; text-align: right;'>" + payload.department + "</td></tr>" +
        "<tr><td style='padding: 10px 0; color: #64748b;'>Phone</td><td style='padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;'>" + payload.phone + "</td></tr>" +
        "</table>" +
        "</div>" +
        "<div style='text-align: center;'>" +
        "<a href='" + approveLink + "' style='background-color: #461466; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block; transition: all 0.2s;'>Approve User Access</a>" +
        "</div>" +
        "<div style='margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 12px;'>" +
        "Dreamsdesk Automated System<br>Do not forward this email." +
        "</div>" +
        "</div>";

      MailApp.sendEmail({
        to: adminEmail,
        name: "Dreamsdesk - Dreams Design",
        replyTo: "marketing.dreamsdesign.in@gmail.com",
        subject: subject,
        htmlBody: htmlBody
      });
    } catch (e) {
      console.error("Mail Error:", e.message);
    }

    // Create a sheet tab for the new user in the Daily Task List spreadsheet
    try {
      createUserDailySheet(payload.name, payload.email);
    } catch (we) {
      console.error("Daily task sheet creation failed:", we.message);
    }

    return ContentService.createTextOutput(JSON.stringify({ "ok": true })).setMimeType(ContentService.MimeType.JSON);
  }

  // -------------------------
  // 5. ADD CLIENT
  // -------------------------
  if (payload.action === 'add_client') {
    if (!isUserAuthorized(payload.userEmail, ss)) {
      return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": "Unauthorized" })).setMimeType(ContentService.MimeType.JSON);
    }
    try {
      var sheet = ss.getSheetByName("Clients");
      if (!sheet) {
        sheet = ss.insertSheet("Clients");
        sheet.appendRow(["Client ID", "Project Name", "Client Name", "Contact Email", "Phone", "Project start Date", "Industry", "Is Active", "Services", "Project Completion Date", "Drive Folder Link"]);
      } else {
        // Write the canonical header row so column order always matches appendRow indices
        var requiredHeaders = ["Client ID", "Project Name", "Client Name", "Contact Email", "Phone", "Project start Date", "Industry", "Is Active", "Services", "Project Completion Date", "Drive Folder Link"];
        var existingHeaders = sheet.getDataRange().getValues()[0];
        var needsUpdate = existingHeaders.length !== requiredHeaders.length;
        if (!needsUpdate) {
          for (var hi = 0; hi < requiredHeaders.length; hi++) {
            if (String(existingHeaders[hi]).trim() !== requiredHeaders[hi]) {
              needsUpdate = true;
              break;
            }
          }
        }
        if (needsUpdate) {
          sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
        }
      }

      var data = sheet.getDataRange().getValues();
      var lastId = 0;
      for (var i = 1; i < data.length; i++) {
        var idStr = String(data[i][0]).replace("C-", "");
        var idNum = parseInt(idStr, 10);
        if (!isNaN(idNum) && idNum > lastId) lastId = idNum;
      }
      var newId = "C-" + ("000" + (lastId + 1)).slice(-3);

      var formattedPhone = payload.phone ? (payload.phone.toString().startsWith("+") ? "'" + payload.phone : payload.phone) : "";
      var projectStartDate = payload.projectStartDate || Utilities.formatDate(new Date(), "GMT+5:30", "yyyy-MM-dd HH:mm:ss");

      var folderUrl = "";
      // Create Drive folder for this client
      try {
        var driveFolderName = "DD Projects 2026";
        var driveRootFolders = DriveApp.getFoldersByName(driveFolderName);
        var driveRoot;
        if (driveRootFolders.hasNext()) {
          driveRoot = driveRootFolders.next();
        } else {
          driveRoot = DriveApp.createFolder(driveFolderName);
          try { driveRoot.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { }
        }
        var clientProjectName = payload.projectName || "General";
        var clientFolders = driveRoot.getFoldersByName(clientProjectName);
        if (!clientFolders.hasNext()) {
          var clientFolder = driveRoot.createFolder(clientProjectName);
          folderUrl = clientFolder.getUrl();
          try { clientFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { }
        } else {
          folderUrl = clientFolders.next().getUrl();
        }
      } catch (driveErr) {
        // Non-critical: log but don't fail the client creation
        console.error('Drive folder creation failed: ' + driveErr.message);
      }

      sheet.appendRow([
        newId,
        payload.projectName || "",
        payload.clientName || "",
        payload.contactEmail || "",
        formattedPhone,
        projectStartDate,
        payload.industry || "",
        "Yes",
        payload.services || "",
        "", // Project Completion Date — set on deactivation
        folderUrl
      ]);

      // Also add to Payment sheet
      try {
        var paymentSheet = ss.getSheetByName("Payment");
        if (!paymentSheet) {
          paymentSheet = ss.insertSheet("Payment");
          paymentSheet.appendRow(["CLIENT ID", "PROJECT", "CLIENT", "EMAILS", "PHONE NO", "PROJECT START DATE", "INDUSTRY", "IS ACTIVE", "SERVICES", "PROJECT END DATE", "GST/NON GST", "GST AMOUNT (NEW)", "GST (%)", "RECURRING", "RECURRING TYPE", "TOTAL COST", "PAYMENT DATE", "PAYMENT AMOUNT", "PAYMENT NOTE", "PENDING AMOUNT", "DATA ENTRY DATE AND TIME", "NOTE"]);
        }
        var entryTime = Utilities.formatDate(new Date(), "GMT+5:30", "yyyy-MM-dd HH:mm:ss");
        paymentSheet.appendRow([
          newId,
          payload.projectName || "",
          payload.clientName || "",
          payload.contactEmail || "",
          formattedPhone,
          projectStartDate,
          payload.industry || "",
          "Yes",
          payload.services || "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          entryTime,
          ""
        ]);
      } catch (payErr) {
        console.error("Payment sheet write failed: " + payErr.message);
      }

      // Send RICH HTML notification to ALL Admins
      try {
        var adminEmails = [];
        var teamSheet = ss.getSheetByName("Team");
        if (teamSheet) {
          var teamData = teamSheet.getDataRange().getValues();
          for (var ti = 1; ti < teamData.length; ti++) {
            var roleStr = String(teamData[ti][8] || "").trim().toLowerCase();
            var isActiveStr = String(teamData[ti][7] || "").trim().toLowerCase();
            if (roleStr === "admin" && isActiveStr === "yes") {
              var adminEmail = String(teamData[ti][2] || "").trim();
              if (adminEmail) adminEmails.push(adminEmail);
            }
          }
        }

        if (adminEmails.length > 0) {
          var subject = "New Client Created - " + (payload.projectName || "Untitled") + " - Dreamsdesk";

          var displayPhone = payload.phone || "—";
          var displayDate = payload.projectStartDate || Utilities.formatDate(new Date(), "GMT+5:30", "yyyy-MM-dd HH:mm:ss");
          var displayFolder = folderUrl ? "<a href='" + folderUrl + "' style='color: #702c91; font-weight: 600; text-decoration: none;'>Open Drive Folder</a>" : "—";

          var htmlBody = "<div style='font-family: Inter, Arial, sans-serif; color: #333; max-width: 500px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);'>" +
            "<div style='text-align: center; margin-bottom: 24px;'>" +
            "<h2 style='color: #461466; margin: 0; font-size: 24px; font-weight: 700;'>New Client Added</h2>" +
            "<p style='color: #64748b; margin-top: 8px; font-size: 14px;'>A new client has been registered in Dreamsdesk.</p>" +
            "</div>" +
            "<div style='background-color: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 30px;'>" +
            "<table style='width: 100%; border-collapse: collapse; font-size: 14px;'>" +
            "<tr><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; width: 120px; font-weight: 700;'>Client ID</td><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600; text-align: right;'>" + newId + "</td></tr>" +
            "<tr><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 700;'>Project Name</td><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600; text-align: right;'>" + (payload.projectName || "") + "</td></tr>" +
            "<tr><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 700;'>Client Name</td><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600; text-align: right;'>" + (payload.clientName || "") + "</td></tr>" +
            "<tr><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 700;'>Client Email</td><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600; text-align: right;'>" + (payload.contactEmail || "") + "</td></tr>" +
            "<tr><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 700;'>Phone</td><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600; text-align: right;'>" + displayPhone + "</td></tr>" +
            "<tr><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 700;'>Industry</td><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600; text-align: right;'>" + (payload.industry || "") + "</td></tr>" +
            "<tr><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 700;'>Project Start Date</td><td style='padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600; text-align: right;'>" + displayDate + "</td></tr>" +
            "<tr><td style='padding: 10px 0; color: #64748b; font-weight: 700;'>Drive Folder</td><td style='padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;'>" + displayFolder + "</td></tr>" +
            "</table>" +
            "</div>" +
            "<div style='margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 12px;'>" +
            "Dreamsdesk Automated System<br>You are receiving this because you are an admin." +
            "</div>" +
            "</div>";

          MailApp.sendEmail({
            to: Session.getActiveUser().getEmail(),
            bcc: adminEmails.join(","),
            name: "Dreamsdesk - Dreams Design",
            replyTo: "marketing.dreamsdesign.in@gmail.com",
            subject: subject,
            htmlBody: htmlBody
          });
        }
      } catch (e) {
        console.error("Admin notification mail error:", e.message);
      }

      return ContentService.createTextOutput(JSON.stringify({ "ok": true })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": err.message })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // -------------------------
  // 5.5. UPDATE CLIENT
  // -------------------------
  if (payload.action === 'update_client') {
    if (!isUserAuthorized(payload.userEmail, ss)) {
      return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": "Unauthorized" })).setMimeType(ContentService.MimeType.JSON);
    }
    try {
      var sheet = ss.getSheetByName("Clients");
      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": "Clients sheet not found" })).setMimeType(ContentService.MimeType.JSON);
      }
      var data = sheet.getDataRange().getValues();
      var found = false;
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() === String(payload.clientId).trim()) {
          if (payload.projectName !== undefined) sheet.getRange(i + 1, 2).setValue(payload.projectName);
          if (payload.clientName !== undefined) sheet.getRange(i + 1, 3).setValue(payload.clientName);
          if (payload.contactEmail !== undefined) sheet.getRange(i + 1, 4).setValue(payload.contactEmail);
          if (payload.phone !== undefined) {
            var formattedPhone = payload.phone ? (payload.phone.toString().startsWith("+") ? "'" + payload.phone : payload.phone) : "";
            sheet.getRange(i + 1, 5).setValue(formattedPhone);
          }
          if (payload.projectStartDate !== undefined) sheet.getRange(i + 1, 6).setValue(payload.projectStartDate);
          if (payload.industry !== undefined) sheet.getRange(i + 1, 7).setValue(payload.industry);
          if (payload.isActive !== undefined) {
            sheet.getRange(i + 1, 8).setValue(payload.isActive);
            // When deactivating, auto-set Project Completion Date to current IST time
            if (String(payload.isActive).toLowerCase() === 'no' || payload.isActive === false) {
              var completionTime = Utilities.formatDate(new Date(), "GMT+5:30", "yyyy-MM-dd HH:mm:ss");
              sheet.getRange(i + 1, 10).setValue(completionTime);
            } else {
              sheet.getRange(i + 1, 10).setValue("");
            }
          }
          if (payload.services !== undefined) sheet.getRange(i + 1, 9).setValue(payload.services);
          found = true;

          // Also sync common fields to Payment sheet
          try {
            var paySheet = ss.getSheetByName("Payment");
            if (paySheet) {
              var payData = paySheet.getDataRange().getValues();
              var payHeaders = payData[0];
              for (var pi = 1; pi < payData.length; pi++) {
                if (String(payData[pi][0]).trim() === String(payload.clientId).trim()) {
                  if (payload.projectName !== undefined) {
                    var colIdx = payHeaders.indexOf("PROJECT");
                    if (colIdx >= 0) paySheet.getRange(pi + 1, colIdx + 1).setValue(payload.projectName);
                  }
                  if (payload.clientName !== undefined) {
                    var colIdx = payHeaders.indexOf("CLIENT");
                    if (colIdx >= 0) paySheet.getRange(pi + 1, colIdx + 1).setValue(payload.clientName);
                  }
                  if (payload.contactEmail !== undefined) {
                    var colIdx = payHeaders.indexOf("EMAILS");
                    if (colIdx >= 0) paySheet.getRange(pi + 1, colIdx + 1).setValue(payload.contactEmail);
                  }
                  if (payload.phone !== undefined) {
                    var colIdx = payHeaders.indexOf("PHONE NO");
                    if (colIdx >= 0) paySheet.getRange(pi + 1, colIdx + 1).setValue(payload.phone);
                  }
                  if (payload.industry !== undefined) {
                    var colIdx = payHeaders.indexOf("INDUSTRY");
                    if (colIdx >= 0) paySheet.getRange(pi + 1, colIdx + 1).setValue(payload.industry);
                  }
                  if (payload.services !== undefined) {
                    var colIdx = payHeaders.indexOf("SERVICES");
                    if (colIdx >= 0) paySheet.getRange(pi + 1, colIdx + 1).setValue(payload.services);
                  }
                  if (payload.isActive !== undefined) {
                    var colIdx = payHeaders.indexOf("IS ACTIVE");
                    if (colIdx >= 0) paySheet.getRange(pi + 1, colIdx + 1).setValue(payload.isActive);
                    if (String(payload.isActive).toLowerCase() === 'no' || payload.isActive === false) {
                      var colEnd = payHeaders.indexOf("PROJECT END DATE");
                      if (colEnd >= 0) paySheet.getRange(pi + 1, colEnd + 1).setValue(Utilities.formatDate(new Date(), "GMT+5:30", "yyyy-MM-dd HH:mm:ss"));
                    }
                  }
                  break;
                }
              }
            }
          } catch (payErr) {
            console.error("Payment sync failed: " + payErr.message);
          }
          break;
        }
      }
      if (found) {
        return ContentService.createTextOutput(JSON.stringify({ "ok": true })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": "Client not found" })).setMimeType(ContentService.MimeType.JSON);
      }
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": err.message })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // -------------------------
  // 5.7. UPDATE PAYMENT
  // -------------------------
  if (payload.action === 'update_payment') {
    if (!isUserAuthorized(payload.userEmail, ss)) {
      return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": "Unauthorized" })).setMimeType(ContentService.MimeType.JSON);
    }
    try {
      var sheet = ss.getSheetByName("Payment");
      var expectedHeaders = ["CLIENT ID", "PROJECT", "CLIENT", "EMAILS", "PHONE NO", "PROJECT START DATE", "INDUSTRY", "IS ACTIVE", "SERVICES", "PROJECT END DATE", "GST/NON GST", "GST AMOUNT (NEW)", "GST (%)", "RECURRING", "RECURRING TYPE", "TOTAL COST", "PAYMENT DATE", "PAYMENT AMOUNT", "PAYMENT NOTE", "PENDING AMOUNT", "DATA ENTRY DATE AND TIME", "NOTE"];
      if (!sheet) {
        sheet = ss.insertSheet("Payment");
        sheet.appendRow(expectedHeaders);
      }
      var data = sheet.getDataRange().getValues();
      if (data.length === 0 || data[0].length === 0 || !data[0][0]) {
        sheet.clear();
        sheet.appendRow(expectedHeaders);
        data = sheet.getDataRange().getValues();
      }
      var headers = data[0];

      var gstType = payload['GST/NON GST'] || '';
      var gstPct = gstType === 'GST' ? 18 : 0;
      var totalCost = parseFloat(payload['TOTAL COST']) || 0;
      var recurring = payload['RECURRING'] || '';
      var recurringType = payload['RECURRING TYPE'] || '';
      var gstAmount = gstType === 'GST' ? Math.round(totalCost * gstPct / 100) : 0;
      var totalWithGst = totalCost + gstAmount;
      var entryTime = Utilities.formatDate(new Date(), "GMT+5:30", "yyyy-MM-dd HH:mm:ss");

      var updateIdx = {
        gstType: findHeaderIndex(headers, "GST/NON GST"),
        gstAmt: findHeaderIndex(headers, "GST AMOUNT (NEW)"),
        gstPct: findHeaderIndex(headers, "GST (%)"),
        totalCost: findHeaderIndex(headers, "TOTAL COST"),
        recurring: findHeaderIndex(headers, "RECURRING"),
        recurringType: findHeaderIndex(headers, "RECURRING TYPE"),
        pendingAmt: findHeaderIndex(headers, "PENDING AMOUNT"),
        entryTime: findHeaderIndex(headers, "DATA ENTRY DATE AND TIME")
      };

      var matchedRows = [];
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() === String(payload.clientId).trim()) {
          matchedRows.push({ rowIdx: i, rowData: data[i] });
        }
      }

      if (matchedRows.length === 0) {
        // Find client details in Clients sheet to pre-fill metadata
        var clientSheet = ss.getSheetByName("Clients");
        var clientInfo = {};
        if (clientSheet) {
          var cData = clientSheet.getDataRange().getValues();
          if (cData.length > 1) {
            var cHeaders = cData[0];
            for (var ci = 1; ci < cData.length; ci++) {
              if (String(cData[ci][0]).trim() === String(payload.clientId).trim()) {
                for (var ch = 0; ch < cHeaders.length; ch++) {
                  clientInfo[String(cHeaders[ch]).trim()] = cData[ci][ch];
                }
                break;
              }
            }
          }
        }

        var newRow = [];
        for (var h = 0; h < headers.length; h++) {
          var hName = String(headers[h]).trim().toUpperCase();
          if (hName === "CLIENT ID") newRow.push(payload.clientId || "");
          else if (hName === "PROJECT") newRow.push(clientInfo["Project Name"] || payload.projectName || "");
          else if (hName === "CLIENT") newRow.push(clientInfo["Client Name"] || clientInfo["Company Name"] || payload.clientName || "");
          else if (hName === "EMAILS") newRow.push(clientInfo["Contact Email"] || payload.emails || "");
          else if (hName === "PHONE NO") newRow.push(clientInfo["Phone"] || payload.phone || "");
          else if (hName === "PROJECT START DATE") newRow.push(clientInfo["Project start Date"] || payload.projectStartDate || "");
          else if (hName === "INDUSTRY") newRow.push(clientInfo["Industry"] || payload.industry || "");
          else if (hName === "IS ACTIVE") newRow.push(clientInfo["Is Active"] || "Yes");
          else if (hName === "SERVICES") newRow.push(clientInfo["Services"] || payload.services || "");
          else if (hName === "PROJECT END DATE") newRow.push(clientInfo["Project Completion Date"] || payload.projectEndDate || "");
          else if (hName === "GST/NON GST") newRow.push(gstType);
          else if (hName === "GST AMOUNT (NEW)") newRow.push(gstAmount);
          else if (hName === "GST (%)") newRow.push(gstType === 'GST' ? 18 : "");
          else if (hName === "RECURRING") newRow.push(recurring);
          else if (hName === "RECURRING TYPE") newRow.push(recurring === 'Yes' ? recurringType : "");
          else if (hName === "TOTAL COST") newRow.push(totalCost);
          else if (hName === "PAYMENT DATE") newRow.push("");
          else if (hName === "PAYMENT AMOUNT") newRow.push("");
          else if (hName === "PAYMENT NOTE") newRow.push("");
          else if (hName === "PENDING AMOUNT") newRow.push(String(totalWithGst));
          else if (hName === "DATA ENTRY DATE AND TIME") newRow.push(entryTime);
          else if (hName === "NOTE") newRow.push("");
          else newRow.push("");
        }
        sheet.appendRow(newRow);
        return ContentService.createTextOutput(JSON.stringify({ "ok": true })).setMimeType(ContentService.MimeType.JSON);
      }

      // Collect all payment amounts for this client (sorted by row order)
      var paymentAmounts = [];
      var payAmtIdx = findHeaderIndex(headers, "PAYMENT AMOUNT");
      for (var m = 0; m < matchedRows.length; m++) {
        paymentAmounts.push(payAmtIdx >= 0 ? (parseFloat(matchedRows[m].rowData[payAmtIdx]) || 0) : 0);
      }

      // Update ALL matching rows with the new payment details
      var runningPaid = 0;
      for (var m = 0; m < matchedRows.length; m++) {
        var r = matchedRows[m].rowIdx;
        runningPaid += paymentAmounts[m];

        if (updateIdx.gstType >= 0) sheet.getRange(r + 1, updateIdx.gstType + 1).setValue(gstType);
        if (updateIdx.gstAmt >= 0) sheet.getRange(r + 1, updateIdx.gstAmt + 1).setValue(gstAmount);
        if (updateIdx.gstPct >= 0) sheet.getRange(r + 1, updateIdx.gstPct + 1).setValue(gstType === 'GST' ? gstPct : '');
        if (updateIdx.totalCost >= 0) sheet.getRange(r + 1, updateIdx.totalCost + 1).setValue(totalCost);
        if (updateIdx.recurring >= 0) sheet.getRange(r + 1, updateIdx.recurring + 1).setValue(recurring);
        if (updateIdx.recurringType >= 0) sheet.getRange(r + 1, updateIdx.recurringType + 1).setValue(recurring === 'Yes' ? recurringType : '');
        if (updateIdx.entryTime >= 0) sheet.getRange(r + 1, updateIdx.entryTime + 1).setValue(entryTime);

        // Recalculate PENDING AMOUNT for each row
        var newPending = Math.max(0, totalWithGst - runningPaid);
        if (updateIdx.pendingAmt >= 0) sheet.getRange(r + 1, updateIdx.pendingAmt + 1).setValue(newPending);
      }

      return ContentService.createTextOutput(JSON.stringify({ "ok": true })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": err.message })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // -------------------------
  // 5.8. RECORD PAYMENT (append new row)
  // -------------------------
  if (payload.action === 'record_payment') {
    if (!isUserAuthorized(payload.userEmail, ss)) {
      return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": "Unauthorized" })).setMimeType(ContentService.MimeType.JSON);
    }
    try {
      var sheet = ss.getSheetByName("Payment");
      var expectedHeaders = ["CLIENT ID", "PROJECT", "CLIENT", "EMAILS", "PHONE NO", "PROJECT START DATE", "INDUSTRY", "IS ACTIVE", "SERVICES", "PROJECT END DATE", "GST/NON GST", "GST AMOUNT (NEW)", "GST (%)", "RECURRING", "RECURRING TYPE", "TOTAL COST", "PAYMENT DATE", "PAYMENT AMOUNT", "PAYMENT NOTE", "PENDING AMOUNT", "DATA ENTRY DATE AND TIME", "NOTE"];
      if (!sheet) {
        sheet = ss.insertSheet("Payment");
        sheet.appendRow(expectedHeaders);
      }
      var data = sheet.getDataRange().getValues();
      var headers = data[0];

      // Collect ALL rows for this client
      var matchedRows = [];
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() === String(payload.clientId).trim()) {
          matchedRows.push({ rowIdx: i, rowData: data[i] });
        }
      }

      var baseRow = matchedRows.length > 0 ? matchedRows[matchedRows.length - 1].rowData : null;
      var payAmount = parseFloat(payload.amount) || 0;
      var entryTime = Utilities.formatDate(new Date(), "GMT+5:30", "yyyy-MM-dd HH:mm:ss");

      // Calculate total paid so far (before this payment)
      var totalPaidBefore = 0;
      var totalWithGst = 0;
      var tpIdx = findHeaderIndex(headers, "PAYMENT AMOUNT");
      var twgCostIdx = findHeaderIndex(headers, "TOTAL COST");
      var twgGstAmtIdx = findHeaderIndex(headers, "GST AMOUNT (NEW)");
      for (var m = 0; m < matchedRows.length; m++) {
        totalPaidBefore += tpIdx >= 0 ? (parseFloat(matchedRows[m].rowData[tpIdx]) || 0) : 0;
        if (twgCostIdx >= 0 && matchedRows[m].rowData[twgCostIdx]) {
          var rowCost = parseFloat(matchedRows[m].rowData[twgCostIdx]) || 0;
          var rowGstAmt = twgGstAmtIdx >= 0 ? (parseFloat(matchedRows[m].rowData[twgGstAmtIdx]) || 0) : 0;
          totalWithGst = rowCost + rowGstAmt;
        }
      }
      var totalPaidAfter = totalPaidBefore + payAmount;
      var newPending = Math.max(0, totalWithGst - totalPaidAfter);

      var payDateIdx = findHeaderIndex(headers, "PAYMENT DATE");
      var payAmtIdx = findHeaderIndex(headers, "PAYMENT AMOUNT");
      var pendingIdx = findHeaderIndex(headers, "PENDING AMOUNT");
      var noteIdx = findHeaderIndex(headers, "PAYMENT NOTE");
      var entryIdx = findHeaderIndex(headers, "DATA ENTRY DATE AND TIME");
      var generalNoteIdx = findHeaderIndex(headers, "NOTE");

      if (baseRow) {
        var newRow = baseRow.slice();
        if (payDateIdx >= 0) newRow[payDateIdx] = payload.date || "";
        if (payAmtIdx >= 0) newRow[payAmtIdx] = payload.amount || "";
        if (pendingIdx >= 0) newRow[pendingIdx] = String(newPending);
        if (noteIdx >= 0) newRow[noteIdx] = payload.note || "";
        if (generalNoteIdx >= 0) newRow[generalNoteIdx] = "";
        if (entryIdx >= 0) newRow[entryIdx] = entryTime;
        sheet.appendRow(newRow);
      } else {
        var newRow = [];
        for (var h = 0; h < headers.length; h++) { newRow.push(""); }
        var cidIdx = findHeaderIndex(headers, "CLIENT ID");
        if (cidIdx >= 0) newRow[cidIdx] = payload.clientId || "";
        if (payDateIdx >= 0) newRow[payDateIdx] = payload.date || "";
        if (payAmtIdx >= 0) newRow[payAmtIdx] = payload.amount || "";
        if (pendingIdx >= 0) newRow[pendingIdx] = String(newPending);
        if (noteIdx >= 0) newRow[noteIdx] = payload.note || "";
        if (generalNoteIdx >= 0) newRow[generalNoteIdx] = "";
        if (entryIdx >= 0) newRow[entryIdx] = entryTime;
        sheet.appendRow(newRow);
      }

      // Update PENDING AMOUNT on all existing rows
      for (var m = 0; m < matchedRows.length; m++) {
        var r = matchedRows[m].rowIdx;
        var prevPaid = 0;
        for (var p = 0; p <= m; p++) {
          var pAmtIdx = findHeaderIndex(headers, "PAYMENT AMOUNT");
          prevPaid += pAmtIdx >= 0 ? (parseFloat(matchedRows[p].rowData[pAmtIdx]) || 0) : 0;
        }
        var rowPending = Math.max(0, totalWithGst - prevPaid);
        if (pendingIdx >= 0) sheet.getRange(r + 1, pendingIdx + 1).setValue(rowPending);
      }

      return ContentService.createTextOutput(JSON.stringify({ "ok": true })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": err.message })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // -------------------------
  // 6. HANDLE CHAT
  // -------------------------
  if (payload.action === 'send' || payload.action === 'edit' || payload.action === 'delete' || payload.action === 'react') {
    var sheetName = "Chat";
    if (payload.roomId && payload.roomId.indexOf("group_") === 0) {
      sheetName = payload.roomId;
    }
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(["id", "action", "roomId", "senderId", "senderName", "message", "timestamp", "type", "groupName"]);
    }
    sheet.appendRow([
      payload.id || "", payload.action || "", payload.roomId || "", payload.senderId || "", payload.senderName || "", payload.message || "", payload.timestamp || "", payload.type || "", payload.groupName || ""
    ]);
    return ContentService.createTextOutput(JSON.stringify({ "ok": true })).setMimeType(ContentService.MimeType.JSON);
  }

  // If no action matched:
  return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": "Unknown action: " + payload.action })).setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// doGet handles GET Requests (Data Retrieval & Email Approvals)
// ============================================
function doGet(e) {
  var action = (e && e.parameter) ? e.parameter.action : null;
  var ss = SpreadsheetApp.openById("1DLdlDT21vVwsggGlPg8xpSt2zjNJ_-z7W_GbFr7qIXs");

  // -------------------------
  // 0. HANDLE 1-CLICK EMAIL APPROVAL
  // -------------------------
  if (action === 'approve_user') {
    var email = e.parameter.email;
    if (!email) {
      return HtmlService.createHtmlOutput("<div style='font-family:sans-serif;text-align:center;padding:40px;color:#dc3545;'><h2>Error</h2><p>No email provided.</p></div>");
    }

    var teamSheet = ss.getSheetByName("Team");
    if (!teamSheet) {
      return HtmlService.createHtmlOutput("<div style='font-family:sans-serif;text-align:center;padding:40px;color:#dc3545;'><h2>Error</h2><p>Team Database not found.</p></div>");
    }

    var data = teamSheet.getDataRange().getValues();
    var found = false;

    var approvedName = "";
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][2]).trim().toLowerCase() === String(email).trim().toLowerCase()) {
        teamSheet.getRange(i + 1, 8).setValue("Yes"); // Is Active
        approvedName = String(data[i][1] || "");
        // Status is not set here — user must punch in to become Online
        found = true;
        break;
      }
    }

    if (found) {
      // Create a sheet tab for the approved user in the Daily Task List spreadsheet
      try {
        if (approvedName) {
          createUserDailySheet(approvedName, email);
        }
      } catch (e) {
        console.error("Daily task sheet creation failed:", e.message);
      }

      return HtmlService.createHtmlOutput(
        "<div style='font-family: Arial, sans-serif; text-align: center; margin-top: 80px;'>" +
        "<div style='background-color: #f0fdf4; border: 1px solid #bbf7d0; max-width: 400px; margin: 0 auto; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);'>" +
        "<h1 style='color: #16a34a; margin-top: 0;'>Access Granted!</h1>" +
        "<p style='color: #334155; font-size: 16px;'>The user <b>" + email + "</b> has been approved successfully.</p>" +
        "<p style='color: #64748b; font-size: 14px; margin-top: 20px;'>They can now log in to the system. You may close this window.</p>" +
        "</div></div>"
      );
    } else {
      return HtmlService.createHtmlOutput(
        "<div style='font-family: Arial, sans-serif; text-align: center; margin-top: 80px;'>" +
        "<div style='background-color: #fef2f2; border: 1px solid #fecaca; max-width: 400px; margin: 0 auto; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);'>" +
        "<h1 style='color: #dc2626; margin-top: 0;'>User Not Found</h1>" +
        "<p style='color: #334155; font-size: 16px;'>Could not find user <b>" + email + "</b> in the Team sheet.</p>" +
        "</div></div>"
      );
    }
  }

  // -------------------------
  // 0.5. READ ACTIVITIES
  // -------------------------
  if (action === "get_activities") {
    var sheet = ss.getSheetByName("Activity");
    var result = [];
    if (sheet) {
      var data = sheet.getDataRange().getValues();
      if (data.length > 1) {
        var headers = data[0];
        for (var i = 1; i < data.length; i++) {
          var row = data[i];
          if (row.length === 0 || !row[0]) continue;
          var obj = {};
          for (var j = 0; j < headers.length; j++) {
            var headerStr = String(headers[j]).trim();
            if (headerStr) {
              obj[headerStr] = row[j];
            }
          }
          result.push(obj);
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }

  // -------------------------
  // 1. READ CLIENTS
  // -------------------------
  if (action === 'get_clients') {
    var sheet = ss.getSheetByName("Clients");
    if (!sheet) return ContentService.createTextOutput(JSON.stringify({ clients: [] })).setMimeType(ContentService.MimeType.JSON);
    // Ensure canonical header order so dynamic key mapping reads correct columns
    var requiredHeaders = ["Client ID", "Project Name", "Client Name", "Contact Email", "Phone", "Project start Date", "Industry", "Is Active", "Services", "Project Completion Date", "Drive Folder Link"];
    var existingHeaders = sheet.getDataRange().getValues()[0];
    var needsUpdate = existingHeaders.length !== requiredHeaders.length;
    if (!needsUpdate) {
      for (var hi = 0; hi < requiredHeaders.length; hi++) {
        if (String(existingHeaders[hi]).trim() !== requiredHeaders[hi]) {
          needsUpdate = true;
          break;
        }
      }
    }
    if (needsUpdate) {
      sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    }
    var data = sheet.getDataRange().getValues();
    var clients = [];
    if (data.length > 1) {
      var headers = data[0];
      for (var i = 1; i < data.length; i++) {
        var row = data[i];
        if (row.length === 0 || !row[0]) continue;

        // We no longer filter out inactive clients here because we need them for the Clients details page
        // Active filtering is done on the React frontend

        var clientObj = {};
        for (var j = 0; j < headers.length; j++) {
          var headerStr = String(headers[j]).trim();
          if (headerStr) clientObj[headerStr] = row[j];
        }
        clients.push(clientObj);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ clients: clients })).setMimeType(ContentService.MimeType.JSON);
  }

  // -------------------------
  // 1.5. READ PAYMENTS
  // -------------------------
  if (action === 'get_payments') {
    var sheet = ss.getSheetByName("Payment");
    if (!sheet) return ContentService.createTextOutput(JSON.stringify({ payments: [] })).setMimeType(ContentService.MimeType.JSON);
    var data = sheet.getDataRange().getValues();
    var payments = [];
    if (data.length > 1) {
      var headers = data[0];
      for (var i = 1; i < data.length; i++) {
        var row = data[i];
        if (row.length === 0 || !row[0]) continue;
        var obj = {};
        for (var j = 0; j < headers.length; j++) {
          var headerStr = String(headers[j]).trim();
          if (headerStr) obj[headerStr] = row[j];
        }
        payments.push(obj);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ payments: payments })).setMimeType(ContentService.MimeType.JSON);
  }

  // -------------------------
  // 2. READ TASKS
  // -------------------------
  if (action === "get_tasks") {
    var sheet = ss.getSheetByName("Tasks");
    var taskResult = [];
    if (sheet) {
      var taskData = sheet.getDataRange().getValues();
      if (taskData.length > 1) {
        var taskHeaders = ["Task ID", "Client", "Month", "Task Title", "Task Type", "Main Task ID", "Description", "Assigned By", "Assigned To", "Employee IDs", "Assigned Emails", "Department", "Assigned Date", "Due Date", "Priority", "Status", "Status Updated On", "Time Taken", "Days Overdue", "Remarks", "Post", "Attachment", "Is Recurring", "Recurring Schedule", "Recurring Day", "Recurring Months", "Last Auto-Generated Date"];
        for (var i = 1; i < taskData.length; i++) {
          var row = taskData[i];
          var obj = {};
          for (var j = 0; j < taskHeaders.length; j++) {
            obj[taskHeaders[j]] = row[j];
          }
          taskResult.push(obj);
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify(taskResult)).setMimeType(ContentService.MimeType.JSON);
  }

  // -------------------------
  // 3. READ TEAM
  // -------------------------
  if (action === "get_team") {
    var sheet = ss.getSheetByName("Team");
    var teamResult = [];

    if (sheet) {
      var data = sheet.getDataRange().getValues();
      if (data.length > 1) {
        var headers = data[0];

        for (var i = 1; i < data.length; i++) {
          var row = data[i];
          if (row.length === 0 || !row[0]) continue;

          var obj = {};
          for (var j = 0; j < headers.length; j++) {
            var headerStr = String(headers[j]).trim();
            if (headerStr) {
              obj[headerStr] = row[j];
            }
          }
          teamResult.push(obj);
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify(teamResult)).setMimeType(ContentService.MimeType.JSON);
  }

  // -------------------------
  // 4. READ PROJECT FILES FROM DRIVE
  // -------------------------
  if (action === "get_project_files") {
    try {
      var projectName = e.parameter.projectName;
      if (!projectName) {
        return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": "No project name provided" })).setMimeType(ContentService.MimeType.JSON);
      }

      var mainFolderName = "DD Projects 2026";
      var mainFolders = DriveApp.getFoldersByName(mainFolderName);
      if (!mainFolders.hasNext()) {
        return ContentService.createTextOutput(JSON.stringify({ "ok": true, "files": [] })).setMimeType(ContentService.MimeType.JSON);
      }
      var mainFolder = mainFolders.next();
      var projectFolders = mainFolder.getFoldersByName(projectName);
      if (!projectFolders.hasNext()) {
        return ContentService.createTextOutput(JSON.stringify({ "ok": true, "files": [] })).setMimeType(ContentService.MimeType.JSON);
      }
      var projectFolder = projectFolders.next();

      var filesResult = [];

      // Function to recursively get files
      function getFilesInFolder(folder, pathStr) {
        var files = folder.getFiles();
        while (files.hasNext()) {
          var f = files.next();
          filesResult.push({
            name: f.getName(),
            url: f.getUrl(),
            type: f.getMimeType(),
            department: pathStr || "General",
            date: Utilities.formatDate(f.getDateCreated(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss")
          });
        }
        var subFolders = folder.getFolders();
        while (subFolders.hasNext()) {
          var subFolder = subFolders.next();
          getFilesInFolder(subFolder, subFolder.getName());
        }
      }

      getFilesInFolder(projectFolder, "");

      return ContentService.createTextOutput(JSON.stringify({ "ok": true, "files": filesResult })).setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ "ok": false, "error": err.message })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // -------------------------
  // 5. READ CHATS
  // -------------------------
  var sheets = ss.getSheets();
  var result = [];
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var sName = sheet.getName();
    if (sName !== "Chat" && sName.indexOf("group_") !== 0) continue;
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) continue;
    var headers = data[0];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var obj = {};
      for (var j = 0; j < headers.length; j++) {
        obj[headers[j]] = row[j];
      }
      result.push(obj);
    }
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

// Helper to record login activity in the Activity sheet
function recordActivityLogin(ss, employeeId, fullName, role, department) {
  var activitySheet = ss.getSheetByName("Activity");
  if (!activitySheet) {
    activitySheet = ss.insertSheet("Activity");
    activitySheet.appendRow(["Employee ID", "Full Name", "Role", "Department", "Login Date and Time", "Logout Date and Time"]);
  }
  var now = new Date();
  var formattedTime = Utilities.formatDate(now, Session.getScriptTimeZone() || "GMT+5:30", "yyyy-MM-dd HH:mm:ss");

  activitySheet.appendRow([
    employeeId,
    fullName,
    role,
    department,
    formattedTime,
    "" // Logout Date and Time starts empty
  ]);
}

// Helper to create a user sheet in the Daily Task List spreadsheet
function createUserDailySheet(fullName, email) {
  var DAILY_LIST_SPREADSHEET_ID = '1TtffW2oS95WX5Xf0OtH7G-Vqsmv4eHXiTiKgnD_8lnQ';
  var sheetName = (fullName || 'Unknown').split(' ')[0];

  var ss = SpreadsheetApp.openById(DAILY_LIST_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  // Sheet created. Headers are managed by daily_task_sheet_script.js on Punch In.
  console.info('Daily sheet created/verified for: %s (tab: %s)', fullName, sheetName);
}

// Helper to record logout activity in the Activity sheet
function recordActivityLogout(ss, email) {
  var teamSheet = ss.getSheetByName("Team");
  var activitySheet = ss.getSheetByName("Activity");
  if (!teamSheet || !activitySheet) return;

  var teamData = teamSheet.getDataRange().getValues();
  var empId = "";
  for (var i = 1; i < teamData.length; i++) {
    if (String(teamData[i][2]).trim().toLowerCase() === String(email).trim().toLowerCase()) {
      empId = teamData[i][0];
      break;
    }
  }
  if (!empId) return;

  var activityData = activitySheet.getDataRange().getValues();
  // Find the last row for this employee where logout time is empty, or update their latest record
  for (var j = activityData.length - 1; j >= 1; j--) {
    if (String(activityData[j][0]).trim() === String(empId).trim()) {
      if (String(activityData[j][5]).trim() === "") {
        var now = new Date();
        var formattedTime = Utilities.formatDate(now, Session.getScriptTimeZone() || "GMT+5:30", "yyyy-MM-dd HH:mm:ss");
        activitySheet.getRange(j + 1, 6).setValue(formattedTime);
        return;
      }
    }
  }
}

// ============================================
// DAILY PENDING TASK EMAIL (added feature)
// Runs Mon-Fri at 9:30 AM via a time trigger. Emails each team member a
// single email with all their pending (not Done) tasks. Saturday/Sunday are
// skipped. This block only ADDS functions; it does not modify any existing
// code above.
// ============================================

var PENDING_EMAIL_SPREADSHEET_ID = "1DLdlDT21vVwsggGlPg8xpSt2zjNJ_-z7W_GbFr7qIXs";
var PENDING_EMAIL_APP_URL = "https://dd-task-management-system.vercel.app";
var PENDING_EMAIL_SUBJECT = "Your pending tasks for today";
var PENDING_EMAIL_SENDER_NAME = "Dreamsdesk - Dreams Design";
var PENDING_EMAIL_REPLY_TO = "marketing.dreamsdesign.in@gmail.com";

// 0-indexed columns in the Tasks sheet
var PENDING_TASK_COL = { TITLE: 3, CLIENT: 1, ASSIGNED_TO: 8, EMPLOYEE_IDS: 9, ASSIGNED_EMAILS: 10, DUE_DATE: 13, PRIORITY: 14, STATUS: 15 };

// 0-indexed columns in the Team sheet
var PENDING_TEAM_COL = { EMP_ID: 0, NAME: 1, EMAIL: 2, IS_ACTIVE: 7 };

function sendDailyPendingEmails() {
  // Guard: only send on weekdays (Mon-Fri), even if a daily trigger is used.
  var todayDay = new Date().getDay(); // 0=Sunday, 6=Saturday
  if (todayDay === 0 || todayDay === 6) {
    console.info("Weekend - skipping pending task emails.");
    return 0;
  }

  var ss = SpreadsheetApp.openById(PENDING_EMAIL_SPREADSHEET_ID);
  var taskSheet = ss.getSheetByName("Tasks");
  var teamSheet = ss.getSheetByName("Team");
  if (!taskSheet || !teamSheet) {
    console.error("Missing sheet: Tasks or Team");
    return 0;
  }

  // ---- Build team lookup maps (email / name / employee id) ----
  var teamRows = teamSheet.getDataRange().getValues();
  var byEmail = {};
  var byName = {};
  var byEmpId = {};
  for (var r = 1; r < teamRows.length; r++) {
    var email = String(teamRows[r][PENDING_TEAM_COL.EMAIL] || "").trim().toLowerCase();
    var name = String(teamRows[r][PENDING_TEAM_COL.NAME] || "").trim();
    var empId = String(teamRows[r][PENDING_TEAM_COL.EMP_ID] || "").trim();
    var isActive = String(teamRows[r][PENDING_TEAM_COL.IS_ACTIVE] || "").trim().toLowerCase();
    if (!email) continue;
    var active = isActive !== "pending"; // only pending-approval users are excluded
    byEmail[email] = { email: email, name: name || email, active: active };
    if (name) byName[name.toLowerCase()] = byEmail[email];
    if (empId) byEmpId[empId.toLowerCase()] = byEmail[email];
  }

  // ---- Collect pending tasks per email ----
  var tasks = taskSheet.getDataRange().getValues();
  var pendingByEmail = {};
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  for (var r = 1; r < tasks.length; r++) {
    var row = tasks[r];
    var status = String(row[PENDING_TASK_COL.STATUS] || "").trim();
    if (status === "Done") continue;

    var taskEmails = parsePendingEmails(row[PENDING_TASK_COL.ASSIGNED_EMAILS]);
    if (taskEmails.length === 0) {
      // Fallback 1: match "Assigned To" names against the Team sheet
      var names = String(row[PENDING_TASK_COL.ASSIGNED_TO] || "").split(",");
      for (var n = 0; n < names.length; n++) {
        var nameKey = names[n].trim().toLowerCase();
        if (nameKey && byName[nameKey]) taskEmails.push(byName[nameKey].email);
      }
    }
    if (taskEmails.length === 0) {
      // Fallback 2: match "Employee IDs" against the Team sheet
      var empIds = String(row[PENDING_TASK_COL.EMPLOYEE_IDS] || "").split(",");
      for (var idn = 0; idn < empIds.length; idn++) {
        var empKey = empIds[idn].trim().toLowerCase();
        if (empKey && byEmpId[empKey]) taskEmails.push(byEmpId[empKey].email);
      }
    }
    if (taskEmails.length === 0) continue;

    var entry = {
      title: String(row[PENDING_TASK_COL.TITLE] || "Untitled task"),
      project: String(row[PENDING_TASK_COL.CLIENT] || ""),
      priority: String(row[PENDING_TASK_COL.PRIORITY] || ""),
      status: status || "Pending",
      dueDate: pendingDateString(row[PENDING_TASK_COL.DUE_DATE]),
      overdue: pendingIsOverdue(row[PENDING_TASK_COL.DUE_DATE], today)
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

  // ---- Sort each user's tasks: overdue first, then by due date, then title ----
  for (var key in pendingByEmail) {
    pendingByEmail[key].tasks.sort(function (a, b) {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return (a.title || "").localeCompare(b.title || "");
    });
  }

  // ---- Send one email per user ----
  var emailKeys = Object.keys(pendingByEmail);
  var sent = 0;
  for (var i = 0; i < emailKeys.length; i++) {
    var group = pendingByEmail[emailKeys[i]];
    if (group.tasks.length === 0) continue;
    try {
      MailApp.sendEmail({
        to: group.user.email,
        name: PENDING_EMAIL_SENDER_NAME,
        replyTo: PENDING_EMAIL_REPLY_TO,
        subject: PENDING_EMAIL_SUBJECT,
        htmlBody: buildPendingEmailHtml(group.user.name, group.tasks)
      });
      sent++;
      console.info("Sent pending-task email to %s (%d tasks)", group.user.email, group.tasks.length);
    } catch (err) {
      console.error("Failed to email %s: %s", group.user.email, err.message);
    }
  }

  console.info("Done. Sent %d email(s).", sent);
  return sent;
}

function parsePendingEmails(value) {
  var out = [];
  if (!value) return out;
  var parts = String(value).split(/[,;]/);
  for (var i = 0; i < parts.length; i++) {
    var em = parts[i].trim().toLowerCase();
    if (em && out.indexOf(em) === -1) out.push(em);
  }
  return out;
}

function pendingDateString(value) {
  if (!value) return "";
  var d = value;
  if (typeof value === "string") {
    d = new Date(value);
    if (isNaN(d.getTime())) return value;
  }
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  return Utilities.formatDate(d, Session.getScriptTimeZone() || "GMT+5:30", "dd-MMM-yyyy");
}

function pendingIsOverdue(value, today) {
  if (!value) return false;
  var d = value;
  if (typeof value === "string") {
    d = new Date(value);
    if (isNaN(d.getTime())) return false;
  }
  if (!(d instanceof Date) || isNaN(d.getTime())) return false;
  d.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

function buildPendingEmailHtml(name, tasks) {
  var rows = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    var due = t.dueDate ? (t.overdue ? "<span style='color:#dc2626;font-weight:600;'>" + t.dueDate + " (overdue)</span>" : t.dueDate) : "&mdash;";
    var project = t.project ? "<td style='padding:8px 10px;border-bottom:1px solid #eef2f7;color:#475569;'>" + pendingEmailEsc(t.project) + "</td>" : "<td style='padding:8px 10px;border-bottom:1px solid #eef2f7;color:#cbd5e1;'>&mdash;</td>";
    rows.push(
      "<tr>" +
        "<td style='padding:8px 10px;border-bottom:1px solid #eef2f7;color:#0f172a;font-weight:600;'>" + pendingEmailEsc(t.title) + "</td>" +
        project +
        "<td style='padding:8px 10px;border-bottom:1px solid #eef2f7;color:#475569;'>" + (t.priority ? pendingEmailEsc(t.priority) : "&mdash;") + "</td>" +
        "<td style='padding:8px 10px;border-bottom:1px solid #eef2f7;color:#475569;'>" + pendingEmailEsc(t.status) + "</td>" +
        "<td style='padding:8px 10px;border-bottom:1px solid #eef2f7;white-space:nowrap;'>" + due + "</td>" +
      "</tr>"
    );
  }
  return (
    "<div style='font-family:Arial,Helvetica,sans-serif;background:#f4f6f8;padding:24px;'>" +
      "<div style='max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;'>" +
        "<div style='background:#461466;padding:20px 24px;'>" +
          "<div style='color:#ffffff;font-size:18px;font-weight:bold;'>Good morning, " + pendingEmailEsc(name) + "</div>" +
          "<div style='color:#d8b4e6;font-size:13px;margin-top:4px;'>Here are your pending tasks (" + tasks.length + ")</div>" +
        "</div>" +
        "<div style='padding:20px 24px;'>" +
          "<table style='width:100%;border-collapse:collapse;font-size:13px;'>" +
            "<thead><tr>" +
              "<th style='text-align:left;padding:8px 10px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;'>Task</th>" +
              "<th style='text-align:left;padding:8px 10px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;'>Project</th>" +
              "<th style='text-align:left;padding:8px 10px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;'>Priority</th>" +
              "<th style='text-align:left;padding:8px 10px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;'>Status</th>" +
              "<th style='text-align:left;padding:8px 10px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;'>Due</th>" +
            "</tr></thead>" +
            "<tbody>" + rows.join("") + "</tbody>" +
          "</table>" +
          "<div style='margin-top:20px;text-align:center;'>" +
            "<a href='" + PENDING_EMAIL_APP_URL + "/my-tasks' style='display:inline-block;background:#461466;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:600;'>Open My Tasks</a>" +
          "</div>" +
        "</div>" +
        "<div style='background:#f8fafc;padding:14px 24px;color:#94a3b8;font-size:11px;text-align:center;border-top:1px solid #e2e8f0;'>Dreamsdesk Automated System<br>This email was generated automatically. Do not reply.</div>" +
      "</div>" +
    "</div>"
  );
}

function pendingEmailEsc(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Send a single test email to the current script user to verify setup.
 * Run once from the Apps Script editor.
 */
function testPendingTasksEmail() {
  var me = Session.getActiveUser().getEmail();
  var test = [{
    title: "Example pending task",
    project: "Example client",
    priority: "High",
    status: "Pending",
    dueDate: Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+5:30", "dd-MMM-yyyy"),
    overdue: false
  }];
  MailApp.sendEmail({
    to: me,
    name: PENDING_EMAIL_SENDER_NAME,
    replyTo: PENDING_EMAIL_REPLY_TO,
    subject: "Test - " + PENDING_EMAIL_SUBJECT,
    htmlBody: buildPendingEmailHtml("Test User", test)
  });
  console.info("Test email sent to %s", me);
}

/**
 * Install (or refresh) the weekday 9:30 AM triggers for sendDailyPendingEmails.
 * Run once from the Apps Script editor. Creates one trigger per weekday
 * (Mon-Fri) at 9:30 AM in Asia/Kolkata. Only deletes triggers belonging to
 * this function, so it never touches any other triggers in the project.
 */
function createDailyPendingEmailTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === "sendDailyPendingEmails") {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  var weekdays = [
    ScriptApp.WeekDay.MONDAY,
    ScriptApp.WeekDay.TUESDAY,
    ScriptApp.WeekDay.WEDNESDAY,
    ScriptApp.WeekDay.THURSDAY,
    ScriptApp.WeekDay.FRIDAY
  ];
  for (var w = 0; w < weekdays.length; w++) {
    ScriptApp.newTrigger("sendDailyPendingEmails")
      .timeBased()
      .onWeekDay(weekdays[w])
      .atHour(9)
      .atMinute(30)
      .inTimezone("Asia/Kolkata")
      .create();
  }
  console.info("Weekday 9:30 AM triggers installed (Mon-Fri, Asia/Kolkata).");
}

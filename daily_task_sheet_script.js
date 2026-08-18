// ─────────────────────────────────────────────────────────────
// DAILY TASK SHEET GOOGLE APPS SCRIPT (SUPABASE DIRECT INTEGRATION)
// ─────────────────────────────────────────────────────────────
// Active Spreadsheet: Daily Task List
// Backend Database: Supabase Postgres API
// ─────────────────────────────────────────────────────────────

var SUPABASE_URL = "https://balrgagdbbfagmgryrwv.supabase.co";
var SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhbHJnYWdkYmJmYWdtZ3J5cnd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDYxNTQsImV4cCI6MjEwMjAyMjE1NH0.5R4abl_tx3jVX5Z98Pm5Mp0eePYsTFXThjYZA-_bapg";

/**
 * Creates custom menu in Google Sheets when opened
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('DD Tasks Sync')
    .addItem('Generate Daily Sheet from Database', 'generateTodaySheetFromDB')
    .addToUi();
}

function makeHeaderText(date) {
  var parts = date.split("-");
  if (parts.length === 3) {
    return "Task : " + parts[2] + "-" + parts[1] + "-" + parts[0];
  }
  return "Task : " + date;
}

function findHeaderRow(sheet, date) {
  var parts = date.split("-");
  var datePart = parts.length === 3 ? parts[2] + "-" + parts[1] + "-" + parts[0] : date;
  var data = sheet.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    var cellText = String(data[i][0]).trim();
    if (cellText.indexOf("Task :") !== -1 && cellText.indexOf(datePart) !== -1) {
      return i + 1;
    }
  }
  return -1;
}

function formatTime(timeStr) {
  if (!timeStr) return "";
  var s = String(timeStr).trim();
  if (s.indexOf(" ") !== -1) {
    s = s.split(" ")[1] || s;
  }
  return s.split(":").slice(0, 2).join(":");
}

function formatSheetTime(val) {
  if (!val) return "";
  if (val instanceof Date) {
    var h = val.getHours();
    var m = val.getMinutes();
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }
  var s = String(val).trim();
  if (s === "") return "";
  if (s.indexOf(" ") !== -1) {
    s = s.split(" ")[1] || s;
  }
  if (s.indexOf(":") !== -1) return s.split(":").slice(0, 2).join(":");
  return s;
}

function formatSheetProject(val) {
  if (!val) return "";
  var d;
  if (val instanceof Date) {
    d = val;
  } else if (typeof val === 'string' && val.indexOf('T') !== -1 && val.indexOf('Z') !== -1) {
    d = new Date(val);
  }
  if (d && !isNaN(d.getTime())) {
    var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return monthNames[d.getMonth()] + " " + d.getFullYear();
  }
  return String(val).trim();
}

/**
 * Finds the 1-indexed row number where the data section of a block ends
 */
function findBlockDataEnd(sheet, headerRowNum) {
  var dataStartRow = headerRowNum + 2;
  var allData = sheet.getDataRange().getValues();
  for (var r = dataStartRow - 1; r < allData.length; r++) {
    var rowVals = allData[r];
    var col1 = String(rowVals[0] || "").trim();
    var isEmpty = true;
    for (var c = 0; c < 6; c++) {
      if (String(rowVals[c] || "").trim() !== "") {
        isEmpty = false;
        break;
      }
    }
    if (isEmpty || col1.indexOf("Task :") === 0 || col1.indexOf("Today Task :") === 0) {
      return r + 1;
    }
  }
  return sheet.getLastRow() + 1;
}

/**
 * Finds the 1-indexed row number of the "Punched Out" row within the block, or -1.
 */
function findPunchedOutRow(sheet, headerRowNum) {
  var dataStartRow = headerRowNum + 2;
  var blockEnd = findBlockDataEnd(sheet, headerRowNum);
  var allData = sheet.getDataRange().getValues();
  for (var r = dataStartRow - 1; r < blockEnd - 1; r++) {
    if (String(allData[r][1] || "").trim() === "Punched Out") {
      return r + 1;
    }
  }
  return -1;
}

function getStatusColor(status) {
  var s = String(status || "").trim().toLowerCase();
  if (s === "done") return "#d4edda";       // Green
  if (s === "in progress") return "#fff3cd"; // Yellow
  if (s === "pending") return "#e2e3e5";     // Gray
  if (s === "review") return "#cce5ff";      // Blue
  if (s === "block" || s === "blocked") return "#f8d7da"; // Red
  return "#ffffff";
}

/* ─────────────────────────────────────────────────────────────
 * SUPABASE DATABASE FETCH HELPERS
 * ───────────────────────────────────────────────────────────── */

/**
 * Fetches punch-in / punch-out activity times directly from Supabase `employee_activities` table
 */
function fetchActivityTimes(employeeId, email, date) {
  try {
    var searchDate = date;
    var parts = date.split("-");
    if (parts.length === 3) {
      searchDate = parts[2] + "-" + parts[1] + "-" + parts[0];
    }

    var url = SUPABASE_URL + "/rest/v1/employee_activities?select=*";
    var options = {
      method: "get",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY
      },
      muteHttpExceptions: true
    };

    var res = UrlFetchApp.fetch(url, options);
    var json = JSON.parse(res.getContentText());
    if (!Array.isArray(json)) return null;

    var empIdStr = String(employeeId || "").trim().toLowerCase();
    var emailStr = String(email || "").trim().toLowerCase();

    var earliest = null;
    var latest = null;

    for (var i = 0; i < json.length; i++) {
      var r = json[i];
      var rEmpId = String(r["employee_id"] || r["Employee ID"] || "").trim().toLowerCase();
      var rName = String(r["employee_name"] || r["Employee Name"] || "").trim().toLowerCase();
      var loginStr = String(r["login_date_and_time"] || r["Login Date and Time"] || "");
      var logoutStr = String(r["logout_date_and_time"] || r["Logout Date and Time"] || "");

      var match = false;
      if (empIdStr && rEmpId === empIdStr) match = true;
      if (!match && emailStr && rName.indexOf(emailStr.split('@')[0]) !== -1) match = true;
      if (!match) continue;

      if (loginStr.indexOf(searchDate) === 0) {
        var loginDate = new Date(loginStr.replace(" ", "T"));
        if (!isNaN(loginDate.getTime())) {
          if (!earliest || loginDate < earliest) earliest = loginDate;
        }
        if (logoutStr) {
          var logoutDate = new Date(logoutStr.replace(" ", "T"));
          if (!isNaN(logoutDate.getTime())) {
            if (!latest || logoutDate > latest) latest = logoutDate;
          }
        }
      }
    }

    var fmt = function (d) {
      var h = d.getHours(); var m = d.getMinutes(); var s = d.getSeconds();
      return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
    };

    return {
      first: earliest ? fmt(earliest) : null,
      last: latest ? fmt(latest) : null
    };
  } catch (err) {
    return null;
  }
}

/**
 * Fetches tasks assigned to an employee for a given date directly from Supabase `tasks` table
 */
function fetchTasksFromDatabase(employeeId, email, name, date) {
  try {
    var searchDate = date;
    var parts = date.split("-");
    if (parts.length === 3) {
      searchDate = parts[2] + "-" + parts[1] + "-" + parts[0];
    }

    var url = SUPABASE_URL + "/rest/v1/tasks?select=*";
    var options = {
      method: "get",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY
      },
      muteHttpExceptions: true
    };

    var res = UrlFetchApp.fetch(url, options);
    var json = JSON.parse(res.getContentText());
    if (!Array.isArray(json)) return [];

    var empIdStr = String(employeeId || "").trim();
    var emailStr = String(email || "").trim().toLowerCase();
    var nameStr = String(name || "").trim().toLowerCase();
    var firstName = nameStr.split(' ')[0];

    var matchedTasks = [];
    for (var i = 0; i < json.length; i++) {
      var t = json[i];
      var tEmpId = String(t["employee_ids"] || t["Employee IDs"] || "").trim();
      var tAssignedTo = String(t["assigned_to"] || t["Assigned To"] || "").trim().toLowerCase();
      var tAssignedEmail = String(t["assigned_emails"] || t["Assigned Emails"] || "").trim().toLowerCase();

      var isMine = false;
      if (empIdStr && tEmpId && tEmpId.indexOf(empIdStr) !== -1) isMine = true;
      if (!isMine && emailStr && tAssignedEmail.indexOf(emailStr) !== -1) isMine = true;
      if (!isMine && firstName && tAssignedTo.indexOf(firstName) !== -1) isMine = true;
      if (!isMine) continue;

      var statusUpdatedOn = String(t["status_updated_on"] || t["Status Updated On"] || t["assigned_date"] || t["Assigned Date"] || "");
      if (statusUpdatedOn && statusUpdatedOn.indexOf(searchDate) !== 0) {
        continue;
      }

      matchedTasks.push({
        project: t["client"] || t["Client"] || "",
        title: t["task_title"] || t["Task Title"] || "",
        status: t["status"] || t["Status"] || "Pending",
        startTime: formatTime(t["start_time"] || t["Start Time"] || ""),
        endTime: formatTime(t["end_time"] || t["End Time"] || ""),
        remark: t["remarks"] || t["Remarks"] || ""
      });
    }

    return matchedTasks;
  } catch (err) {
    return [];
  }
}

/**
 * Custom trigger to generate today's sheet for all employees directly from Supabase DB
 */
function generateTodaySheetFromDB() {
  var now = new Date();
  var yyyy = now.getFullYear();
  var mm = String(now.getMonth() + 1).padStart(2, '0');
  var dd = String(now.getDate()).padStart(2, '0');
  var dateStr = yyyy + "-" + mm + "-" + dd;

  // Fetch employees list from Supabase
  var url = SUPABASE_URL + "/rest/v1/employees?select=*";
  var options = {
    method: "get",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY
    },
    muteHttpExceptions: true
  };

  var res = UrlFetchApp.fetch(url, options);
  var employees = JSON.parse(res.getContentText());
  if (!Array.isArray(employees)) {
    SpreadsheetApp.getUi().alert("Failed to fetch employees from database.");
    return;
  }

  for (var i = 0; i < employees.length; i++) {
    var emp = employees[i];
    var fullName = emp["full_name"] || emp["Full Name"] || "";
    var empId = emp["employee_id"] || emp["Employee ID"] || "";
    var email = emp["email_address"] || emp["Email Address"] || "";

    if (!fullName) continue;

    var tasks = fetchTasksFromDatabase(empId, email, fullName, dateStr);
    var actTimes = fetchActivityTimes(empId, email, dateStr);

    var firstPunchIn = actTimes ? actTimes.first : "";
    var lastPunchOut = actTimes ? actTimes.last : "";

    writeDailyBlockToSheet({
      name: fullName,
      date: dateStr,
      employeeId: empId,
      email: email,
      firstPunchIn: firstPunchIn,
      lastPunchOut: lastPunchOut,
      tasks: tasks
    });
  }

  SpreadsheetApp.getUi().alert("Daily Task Sheet generated successfully from Database for " + dateStr + "!");
}

/* ─────────────────────────────────────────────────────────────
 * CORE SHEET WRITER
 * ───────────────────────────────────────────────────────────── */

function writeDailyBlockToSheet(data) {
  var fullName = data.name || "Unknown";
  var date = data.date || "";
  var tasks = data.tasks || [];
  var firstPunchIn = data.firstPunchIn || data.startTime || "";
  var lastPunchOut = data.lastPunchOut || data.endTime || "";

  var sheetName = fullName.split(" ")[0];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  var headerText = makeHeaderText(date);
  var st = formatTime(firstPunchIn);
  var et = formatTime(lastPunchOut);

  // Construct rows: Punched In -> Tasks -> Punched Out
  var rowsToInsert = [];

  rowsToInsert.push({
    project: "",
    title: "Punched In",
    status: "-",
    startTime: st,
    endTime: "",
    remark: "",
    isSpecial: true
  });

  for (var t = 0; t < tasks.length; t++) {
    var tk = tasks[t];
    rowsToInsert.push({
      project: tk.project || "",
      title: tk.title || "",
      status: tk.status || "Pending",
      startTime: formatTime(tk.startTime || "") || "-",
      endTime: formatTime(tk.endTime || "") || "-",
      remark: tk.remark || "",
      isSpecial: false
    });
  }

  if (et) {
    rowsToInsert.push({
      project: "",
      title: "Punched Out",
      status: "-",
      startTime: "",
      endTime: et,
      remark: "",
      isSpecial: true
    });
  }

  var existingRow = findHeaderRow(sheet, date);
  if (existingRow !== -1) {
    // UPDATE existing block
    var dataStartRow = existingRow + 2;
    var blockEnd = findBlockDataEnd(sheet, existingRow);

    // Preserve existing sheet start/end times if available
    var existingTimes = {};
    var allData = sheet.getDataRange().getValues();
    for (var r = dataStartRow - 1; r < blockEnd - 1; r++) {
      var rowTitle = String(allData[r][1] || "").trim();
      var rowST = formatSheetTime(allData[r][3]);
      var rowET = formatSheetTime(allData[r][4]);
      if (rowTitle && rowTitle !== "Punched In" && rowTitle !== "Punched Out") {
        existingTimes[rowTitle] = { startTime: rowST, endTime: rowET };
      }
    }

    for (var k = 0; k < rowsToInsert.length; k++) {
      var item = rowsToInsert[k];
      if (!item.isSpecial) {
        var ex = existingTimes[item.title] || {};
        if (!item.startTime && ex.startTime && ex.startTime !== "-") item.startTime = ex.startTime;
        if (!item.endTime && ex.endTime && ex.endTime !== "-") item.endTime = ex.endTime;
        if (!item.startTime) item.startTime = "-";
        if (!item.endTime) item.endTime = "-";
      }
    }

    var deleteCount = blockEnd - dataStartRow;
    if (deleteCount > 0) {
      sheet.deleteRows(dataStartRow, deleteCount);
    }

    for (var i = 0; i < rowsToInsert.length; i++) {
      var item = rowsToInsert[i];
      var insertIdx = dataStartRow + i;
      sheet.insertRowBefore(insertIdx);

      sheet.getRange(insertIdx, 1).setValue(formatSheetProject(item.project));
      sheet.getRange(insertIdx, 2).setValue(item.title);
      sheet.getRange(insertIdx, 3).setValue(item.status);
      sheet.getRange(insertIdx, 4).setValue(item.startTime);
      sheet.getRange(insertIdx, 5).setValue(item.endTime);
      sheet.getRange(insertIdx, 6).setValue(item.remark);

      sheet.getRange(insertIdx, 1, 1, 6).setBackground("#ffffff").setFontWeight("normal").setFontColor("#000000");
      sheet.getRange(insertIdx, 3).setHorizontalAlignment("center");
      if (!item.isSpecial) {
        sheet.getRange(insertIdx, 3).setBackground(getStatusColor(item.status));
      }
      sheet.getRange(insertIdx, 4).setHorizontalAlignment("center");
      sheet.getRange(insertIdx, 5).setHorizontalAlignment("center");
      sheet.getRange(insertIdx, 1, 1, 6).setBorder(true, true, true, true, true, true);
    }

    var rowAfter = dataStartRow + rowsToInsert.length;
    var valAfter = sheet.getRange(rowAfter, 1).getValue();
    if (String(valAfter).indexOf("Task :") === 0) {
      sheet.insertRowBefore(rowAfter);
    } else {
      sheet.getRange(rowAfter, 1, 1, 6).clearContent();
    }
    return;
  }

  // CREATE new block
  var lastRow = sheet.getLastRow();
  if (lastRow > 0) {
    sheet.appendRow(["", "", "", "", "", ""]);
  }

  // Header row (Dark Blue)
  sheet.appendRow([headerText, "", "", "", "", ""]);
  var hdrRow = sheet.getLastRow();
  var hdrRange = sheet.getRange(hdrRow, 1, 1, 6);
  hdrRange.merge().setBackground("#0b5394").setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center").setBorder(true, true, true, true, true, true);

  // Title row (Light Blue)
  sheet.appendRow(["Project name", "Task Title", "Status", "Start Time", "End Time", "Remark"]);
  var ttlRow = sheet.getLastRow();
  var ttlRange = sheet.getRange(ttlRow, 1, 1, 6);
  ttlRange.setBackground("#9fc5e8").setFontColor("#000000").setFontWeight("bold").setHorizontalAlignment("center").setBorder(true, true, true, true, true, true);

  for (var i = 0; i < rowsToInsert.length; i++) {
    var item = rowsToInsert[i];
    sheet.appendRow([
      formatSheetProject(item.project),
      item.title,
      item.status,
      item.startTime,
      item.endTime,
      item.remark
    ]);
    var currentRow = sheet.getLastRow();
    sheet.getRange(currentRow, 1, 1, 6).setBackground("#ffffff").setFontWeight("normal").setFontColor("#000000");
    sheet.getRange(currentRow, 3).setHorizontalAlignment("center");
    if (!item.isSpecial) {
      sheet.getRange(currentRow, 3).setBackground(getStatusColor(item.status));
    }
    sheet.getRange(currentRow, 4).setHorizontalAlignment("center");
    sheet.getRange(currentRow, 5).setHorizontalAlignment("center");
    sheet.getRange(currentRow, 1, 1, 6).setBorder(true, true, true, true, true, true);
  }

  sheet.appendRow(["", "", "", "", "", ""]);
}

/* ─────────────────────────────────────────────────────────────
 * WEBHOOK ENDPOINTS (doPost & doGet)
 * ───────────────────────────────────────────────────────────── */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;

    if (action === "log_punch_in") {
      var fullName = data.name || "Unknown";
      var date = data.date || "";
      var startTime = data.startTime || data.firstPunchIn || "";
      var employeeId = data.employeeId || "";
      var email = data.email || "";

      if ((!startTime) && (employeeId || email)) {
        var actTimes = fetchActivityTimes(employeeId, email, date);
        if (actTimes && actTimes.first) startTime = actTimes.first;
      }

      var st = formatTime(startTime);
      var sheetName = fullName.split(" ")[0];
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) { sheet = ss.insertSheet(sheetName); }

      var headerText = makeHeaderText(date);
      var existingRow = findHeaderRow(sheet, date);
      if (existingRow !== -1) {
        return ContentService.createTextOutput(JSON.stringify({ status: "skipped", reason: "already exists" })).setMimeType(ContentService.MimeType.JSON);
      }

      var lastRow = sheet.getLastRow();
      if (lastRow > 0) sheet.appendRow(["", "", "", "", "", ""]);

      sheet.appendRow([headerText, "", "", "", "", ""]);
      var hdrRow = sheet.getLastRow();
      var hdrRange = sheet.getRange(hdrRow, 1, 1, 6);
      hdrRange.merge().setBackground("#0b5394").setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center").setBorder(true, true, true, true, true, true);

      sheet.appendRow(["Project name", "Task Title", "Status", "Start Time", "End Time", "Remark"]);
      var ttlRow = sheet.getLastRow();
      var ttlRange = sheet.getRange(ttlRow, 1, 1, 6);
      ttlRange.setBackground("#9fc5e8").setFontColor("#000000").setFontWeight("bold").setHorizontalAlignment("center").setBorder(true, true, true, true, true, true);

      sheet.appendRow(["", "Punched In", "-", st, "", ""]);
      var taskRow = sheet.getLastRow();
      sheet.getRange(taskRow, 1, 1, 6).setBorder(true, true, true, true, true, true);
      sheet.getRange(taskRow, 3).setHorizontalAlignment("center");
      sheet.getRange(taskRow, 4).setHorizontalAlignment("center");
      sheet.getRange(taskRow, 5).setHorizontalAlignment("center");

      sheet.appendRow(["", "", "", "", "", ""]);
      return ContentService.createTextOutput(JSON.stringify({ status: "success", action: "punch_in_logged" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "log_task_start") {
      var fullName = data.name || "Unknown";
      var date = data.date || "";
      var project = data.project || "";
      var title = data.title || "";
      var status = data.status || "";
      var startTime = data.startTime || "";
      var sheetName = fullName.split(" ")[0];

      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) { sheet = ss.insertSheet(sheetName); }

      var headerText = makeHeaderText(date);
      var existingRow = findHeaderRow(sheet, date);
      if (existingRow === -1) {
        var st = formatTime(startTime);
        var lastRow = sheet.getLastRow();
        if (lastRow > 0) sheet.appendRow(["", "", "", "", "", ""]);
        sheet.appendRow([headerText, "", "", "", "", ""]);
        var hdrR = sheet.getLastRow();
        sheet.getRange(hdrR, 1, 1, 6).merge().setBackground("#0b5394").setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center").setBorder(true, true, true, true, true, true);

        sheet.appendRow(["Project name", "Task Title", "Status", "Start Time", "End Time", "Remark"]);
        var ttlR = sheet.getLastRow();
        sheet.getRange(ttlR, 1, 1, 6).setBackground("#9fc5e8").setFontColor("#000000").setFontWeight("bold").setHorizontalAlignment("center").setBorder(true, true, true, true, true, true);

        sheet.appendRow(["", "Punched In", "-", st, "", ""]);
        var pr = sheet.getLastRow();
        sheet.getRange(pr, 1, 1, 6).setBorder(true, true, true, true, true, true);
        sheet.getRange(pr, 3).setHorizontalAlignment("center");
        sheet.getRange(pr, 4).setHorizontalAlignment("center");
        sheet.getRange(pr, 5).setHorizontalAlignment("center");

        existingRow = findHeaderRow(sheet, date);
      }

      var punchOutRow = findPunchedOutRow(sheet, existingRow);
      var blockEnd = findBlockDataEnd(sheet, existingRow);
      var dataStartRow = existingRow + 2;
      var allData = sheet.getDataRange().getValues();
      var st = formatTime(startTime);
      var updatedExisting = false;

      for (var r = dataStartRow - 1; r < blockEnd - 1; r++) {
        var rowTitle = String(allData[r][1] || "").trim();
        var rowEnd = String(allData[r][4] || "").trim();
        if (rowTitle === title && rowEnd === "") {
          sheet.getRange(r + 1, 1).setValue(formatSheetProject(project));
          sheet.getRange(r + 1, 3).setValue(status);
          sheet.getRange(r + 1, 4).setValue(st);
          sheet.getRange(r + 1, 3).setHorizontalAlignment("center").setBackground(getStatusColor(status));
          sheet.getRange(r + 1, 4).setHorizontalAlignment("center");
          sheet.getRange(r + 1, 5).setHorizontalAlignment("center");
          updatedExisting = true;
          break;
        }
      }

      if (!updatedExisting) {
        var insertAt = punchOutRow !== -1 ? punchOutRow : blockEnd;
        sheet.insertRowBefore(insertAt);
        sheet.getRange(insertAt, 1).setValue(formatSheetProject(project));
        sheet.getRange(insertAt, 2).setValue(title);
        sheet.getRange(insertAt, 3).setValue(status);
        sheet.getRange(insertAt, 4).setValue(st);
        sheet.getRange(insertAt, 5).setValue("");
        sheet.getRange(insertAt, 6).setValue("");

        sheet.getRange(insertAt, 1, 1, 6).setBackground("#ffffff").setFontWeight("normal").setFontColor("#000000");
        sheet.getRange(insertAt, 3).setHorizontalAlignment("center").setBackground(getStatusColor(status));
        sheet.getRange(insertAt, 4).setHorizontalAlignment("center");
        sheet.getRange(insertAt, 5).setHorizontalAlignment("center");
        sheet.getRange(insertAt, 1, 1, 6).setBorder(true, true, true, true, true, true);
      }

      return ContentService.createTextOutput(JSON.stringify({ status: "success", action: "task_start_logged" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "log_task_end") {
      var fullName = data.name || "Unknown";
      var date = data.date || "";
      var title = data.title || "";
      var endTime = data.endTime || "";

      var sheetName = fullName.split(" ")[0];
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({ status: "skipped", reason: "no sheet" })).setMimeType(ContentService.MimeType.JSON);
      }

      var existingRow = findHeaderRow(sheet, date);
      if (existingRow === -1) {
        return ContentService.createTextOutput(JSON.stringify({ status: "skipped", reason: "no header" })).setMimeType(ContentService.MimeType.JSON);
      }

      var dataStartRow = existingRow + 2;
      var blockEnd = findBlockDataEnd(sheet, existingRow);
      var allData = sheet.getDataRange().getValues();
      var et = formatTime(endTime);
      var updated = false;

      for (var r = dataStartRow - 1; r < blockEnd - 1; r++) {
        var rowTitle = String(allData[r][1] || "").trim();
        var rowEnd = String(allData[r][4] || "").trim();
        if (rowTitle === title && rowEnd === "") {
          sheet.getRange(r + 1, 5).setValue(et);
          sheet.getRange(r + 1, 5).setHorizontalAlignment("center");
          updated = true;
          break;
        }
      }

      return ContentService.createTextOutput(JSON.stringify({ status: updated ? "success" : "skipped", action: "task_end_logged" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "log_task_status_update") {
      var fullName = data.name || "Unknown";
      var date = data.date || "";
      var title = data.title || "";
      var status = data.status || "";
      var startTime = data.startTime || "";
      var endTime = data.endTime || "";

      var sheetName = fullName.split(" ")[0];
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({ status: "skipped", reason: "no sheet" })).setMimeType(ContentService.MimeType.JSON);
      }

      var existingRow = findHeaderRow(sheet, date);
      if (existingRow === -1) {
        return ContentService.createTextOutput(JSON.stringify({ status: "skipped", reason: "no header" })).setMimeType(ContentService.MimeType.JSON);
      }

      var dataStartRow = existingRow + 2;
      var blockEnd = findBlockDataEnd(sheet, existingRow);
      var allData = sheet.getDataRange().getValues();
      var updated = false;

      for (var r = dataStartRow - 1; r < blockEnd - 1; r++) {
        var rowTitle = String(allData[r][1] || "").trim();
        if (rowTitle === title) {
          sheet.getRange(r + 1, 3).setValue(status);
          sheet.getRange(r + 1, 3).setHorizontalAlignment("center").setBackground(getStatusColor(status));

          if (startTime && !String(sheet.getRange(r + 1, 4).getValue()).trim()) {
            sheet.getRange(r + 1, 4).setValue(formatTime(startTime)).setHorizontalAlignment("center");
          }
          if (endTime) {
            sheet.getRange(r + 1, 5).setValue(formatTime(endTime)).setHorizontalAlignment("center");
          }
          updated = true;
          break;
        }
      }

      return ContentService.createTextOutput(JSON.stringify({ status: updated ? "success" : "skipped", action: "task_status_updated" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "log_punch_out") {
      var fullName = data.name || "Unknown";
      var date = data.date || "";
      var endTime = data.endTime || "";

      var sheetName = fullName.split(" ")[0];
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({ status: "skipped", reason: "no sheet" })).setMimeType(ContentService.MimeType.JSON);
      }

      var existingRow = findHeaderRow(sheet, date);
      if (existingRow === -1) {
        return ContentService.createTextOutput(JSON.stringify({ status: "skipped", reason: "no header" })).setMimeType(ContentService.MimeType.JSON);
      }

      var punchOutRow = findPunchedOutRow(sheet, existingRow);
      var et = formatTime(endTime);

      if (punchOutRow !== -1) {
        sheet.getRange(punchOutRow, 5).setValue(et);
        sheet.getRange(punchOutRow, 5).setHorizontalAlignment("center");
      } else {
        var insertAt = findBlockDataEnd(sheet, existingRow);
        sheet.insertRowBefore(insertAt);
        sheet.getRange(insertAt, 1).setValue("");
        sheet.getRange(insertAt, 2).setValue("Punched Out");
        sheet.getRange(insertAt, 3).setValue("-");
        sheet.getRange(insertAt, 4).setValue("");
        sheet.getRange(insertAt, 5).setValue(et);
        sheet.getRange(insertAt, 6).setValue("");

        sheet.getRange(insertAt, 1, 1, 6).setBackground("#ffffff").setFontWeight("normal").setFontColor("#000000");
        sheet.getRange(insertAt, 3).setHorizontalAlignment("center");
        sheet.getRange(insertAt, 4).setHorizontalAlignment("center");
        sheet.getRange(insertAt, 5).setHorizontalAlignment("center");
        sheet.getRange(insertAt, 1, 1, 6).setBorder(true, true, true, true, true, true);
      }

      return ContentService.createTextOutput(JSON.stringify({ status: "success", action: "punch_out_logged" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "log_daily_tasks") {
      writeDailyBlockToSheet(data);
      return ContentService.createTextOutput(JSON.stringify({ status: "success", action: "log_daily_tasks_logged" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "generate_daily_sheet_from_db") {
      var dateStr = data.date || new Date().toISOString().split('T')[0];
      var empId = data.employeeId || "";
      var email = data.email || "";
      var fullName = data.name || "";

      if (fullName) {
        var tasks = fetchTasksFromDatabase(empId, email, fullName, dateStr);
        var actTimes = fetchActivityTimes(empId, email, dateStr);
        writeDailyBlockToSheet({
          name: fullName,
          date: dateStr,
          employeeId: empId,
          email: email,
          firstPunchIn: actTimes ? actTimes.first : "",
          lastPunchOut: actTimes ? actTimes.last : "",
          tasks: tasks
        });
      } else {
        generateTodaySheetFromDB();
      }

      return ContentService.createTextOutput(JSON.stringify({ status: "success", action: "generated_from_db" })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unknown action" })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", error: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput("Daily Task Sheet Supabase Sync API active.").setMimeType(ContentService.MimeType.TEXT);
}

function doOptions(e) {
  return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.JSON);
}

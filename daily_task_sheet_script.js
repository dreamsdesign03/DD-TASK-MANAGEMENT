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
  return timeStr.split(":").slice(0, 2).join(":");
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
 * (the first empty row, next header, or end of sheet after the headerRowNum block).
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

function getExistingStartTime(sheet, headerRowNum) {
  var startRow = headerRowNum + 2;
  var lastRow = sheet.getLastRow();
  if (startRow > lastRow) return "";
  // Start Time is now column 4 (Project, Title, Status, Start Time, End Time, Remark)
  var col4 = sheet.getRange(startRow, 4, lastRow - startRow + 1, 1).getValues();
  for (var i = 0; i < col4.length; i++) {
    var formatted = formatSheetTime(col4[i][0]);
    if (formatted !== "") return formatted;
  }
  return "";
}

function fetchActivityTimes(employeeId, date) {
  var MAIN_BACKEND_URL = "https://script.google.com/macros/s/AKfycbzlT_gowChPVXwdmA_jH23MtboHmYsJpWPRnXE7qlINo3TIit82y2_qt7BkeD5GsVrh/exec";
  try {
    var res = UrlFetchApp.fetch(MAIN_BACKEND_URL + "?action=get_activities&t=" + Date.now(), { muteHttpExceptions: true });
    var json = JSON.parse(res.getContentText());
    if (!Array.isArray(json)) return null;

    var empIdStr = String(employeeId || "").trim();
    if (!empIdStr) return null;

    var earliest = null;
    var latest = null;

    // Convert DD-MM-YYYY to YYYY-MM-DD
    var searchDate = date;
    var parts = date.split("-");
    if (parts.length === 3) {
      searchDate = parts[2] + "-" + parts[1] + "-" + parts[0];
    }

    for (var i = 0; i < json.length; i++) {
      var r = json[i];
      var rEmpId = String(r["Employee ID"] || "").trim();
      var loginStr = String(r["Login Date and Time"] || "");
      var logoutStr = String(r["Logout Date and Time"] || "");

      if (rEmpId !== empIdStr) continue;
      if (loginStr.indexOf(searchDate) !== 0) continue;

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

    if (!earliest && !latest) return null;

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

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;

    if (action === "log_punch_in") {
      var fullName = data.name || "Unknown";
      var date = data.date || "";
      var startTime = data.startTime || "";
      var employeeId = data.employeeId || "";
      var sheetName = fullName.split(" ")[0];

      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
      }

      var headerText = makeHeaderText(date);
      var existingRow = findHeaderRow(sheet, date);
      if (existingRow !== -1) {
        return ContentService.createTextOutput(JSON.stringify({ status: "skipped", reason: "already exists" })).setMimeType(ContentService.MimeType.JSON);
      }

      // Use client-sent firstPunchIn as primary (no race condition)
      if (data.firstPunchIn) {
        startTime = data.firstPunchIn;
      } else if (employeeId) {
        // Fallback: fetch from Activity Sheet
        var activityTimes = fetchActivityTimes(employeeId, date);
        if (activityTimes && activityTimes.first) {
          startTime = activityTimes.first;
        }
      }

      var st = formatTime(startTime);

      var lastRow = sheet.getLastRow();
      if (lastRow > 0) {
        sheet.appendRow(["", "", "", "", "", ""]);
      }

      // Dark green header
      sheet.appendRow([headerText, "", "", "", "", ""]);
      var hdrRow = sheet.getLastRow();
      var hdrRange = sheet.getRange(hdrRow, 1, 1, 6);
      hdrRange.merge();
      hdrRange.setBackground("#0b5394");
      hdrRange.setFontColor("#FFFFFF");
      hdrRange.setFontWeight("bold");
      hdrRange.setHorizontalAlignment("center");
      hdrRange.setBorder(true, true, true, true, true, true);

      // Light green column titles
      sheet.appendRow(["Project name", "Task Title", "Status", "Start Time", "End Time", "Remark"]);
      var ttlRow = sheet.getLastRow();
      var ttlRange = sheet.getRange(ttlRow, 1, 1, 6);
      ttlRange.setBackground("#9fc5e8");
      ttlRange.setFontColor("#000000");
      ttlRange.setFontWeight("bold");
      ttlRange.setHorizontalAlignment("center");
      ttlRange.setBorder(true, true, true, true, true, true);

      // One data row with start time, no tasks yet
      sheet.appendRow(["", "Punched In", "-", st, "", ""]);
      var taskRow = sheet.getLastRow();
      var taskRange = sheet.getRange(taskRow, 1, 1, 6);
      taskRange.setBorder(true, true, true, true, true, true);
      sheet.getRange(taskRow, 3).setHorizontalAlignment("center"); // Status
      sheet.getRange(taskRow, 4).setHorizontalAlignment("center"); // Start Time
      sheet.getRange(taskRow, 5).setHorizontalAlignment("center"); // End Time

      // Blank separator
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
        // No block for today — create one with a "Punched In" row
        var st = formatTime(startTime);
        var lastRow = sheet.getLastRow();
        if (lastRow > 0) { sheet.appendRow(["", "", "", "", "", ""]); }
        sheet.appendRow([headerText, "", "", "", "", ""]);
        var hdrR = sheet.getLastRow();
        var hdrRng = sheet.getRange(hdrR, 1, 1, 6);
        hdrRng.merge();
        hdrRng.setBackground("#0b5394");
        hdrRng.setFontColor("#FFFFFF");
        hdrRng.setFontWeight("bold");
        hdrRng.setHorizontalAlignment("center");
        hdrRng.setBorder(true, true, true, true, true, true);

        sheet.appendRow(["Project name", "Task Title", "Status", "Start Time", "End Time", "Remark"]);
        var ttlR = sheet.getLastRow();
        var ttl = sheet.getRange(ttlR, 1, 1, 6);
        ttl.setBackground("#9fc5e8");
        ttl.setFontColor("#000000");
        ttl.setFontWeight("bold");
        ttl.setHorizontalAlignment("center");
        ttl.setBorder(true, true, true, true, true, true);

        sheet.appendRow(["", "Punched In", "-", st, "", ""]);
        var pr = sheet.getLastRow();
        sheet.getRange(pr, 1, 1, 6).setBorder(true, true, true, true, true, true);
        sheet.getRange(pr, 3).setHorizontalAlignment("center");
        sheet.getRange(pr, 4).setHorizontalAlignment("center");
        sheet.getRange(pr, 5).setHorizontalAlignment("center");

        existingRow = findHeaderRow(sheet, date);
      }

      // Check if a row for this task already exists with no end time — update it instead of duplicating
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
          // Update start time on existing row
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
        // Insert a new task row before the blank separator or next header
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

      // Find the matching task row (by title) that has no end time yet
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

      return ContentService.createTextOutput(JSON.stringify({
        status: updated ? "success" : "skipped",
        action: "task_end_logged",
        updated: updated
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "log_task_status_update") {
      var fullName = data.name || "Unknown";
      var date = data.date || "";
      var title = data.title || "";
      var status = data.status || "";

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
          updated = true;
          break;
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: updated ? "success" : "skipped",
        action: "task_status_updated",
        updated: updated
      })).setMimeType(ContentService.MimeType.JSON);
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
        // Update existing punched out row's end time
        sheet.getRange(punchOutRow, 5).setValue(et);
        sheet.getRange(punchOutRow, 5).setHorizontalAlignment("center");
      } else {
        // Insert a "Punched Out" row before the blank separator
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
      var email = data.email;
      var fullName = data.name || "Unknown";
      var date = data.date || "";
      var employeeId = data.employeeId || "";
      var tasks = data.tasks || [];

      var sheetName = fullName.split(" ")[0];
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
      }

      // Use client-sent times as primary (client has up-to-date session data, no race condition)
      var firstPunchIn = data.firstPunchIn || data.startTime || "";
      var lastPunchOut = data.lastPunchOut || data.endTime || "";

      // Fallback: if client didn't send times, fetch from Activity Sheet
      if ((!firstPunchIn || !lastPunchOut) && employeeId) {
        var activityTimes = fetchActivityTimes(employeeId, date);
        if (activityTimes) {
          if (!firstPunchIn && activityTimes.first) firstPunchIn = activityTimes.first;
          if (!lastPunchOut && activityTimes.last) lastPunchOut = activityTimes.last;
        }
      }

      var headerText = makeHeaderText(date);
      var existingRow = findHeaderRow(sheet, date);

      if (existingRow !== -1) {
        // ── UPDATE existing block ──
        var headerRowNum = existingRow;
        var titleRowNum = headerRowNum + 1;
        var dataStartRow = titleRowNum + 1;

        var st = formatTime(firstPunchIn);

        // Find where this block ends
        var blockEnd = dataStartRow;
        var allData = sheet.getDataRange().getValues();
        for (var r = dataStartRow - 1; r < allData.length; r++) {
          var rowVals = allData[r];
          var isEmpty = true;
          for (var c = 0; c < 6; c++) {
            if (String(rowVals[c] || "").trim() !== "") {
              isEmpty = false;
              break;
            }
          }
          if (isEmpty || String(rowVals[0]).indexOf("Task :") === 0 || String(rowVals[0]).indexOf("Today Task :") === 0) {
            blockEnd = r + 1;
            break;
          }
          blockEnd = r + 2;
        }

        // Delete old data rows, but preserve the empty row or next header
        var deleteCount = blockEnd - dataStartRow;
        if (deleteCount > 0) {
          sheet.deleteRows(dataStartRow, deleteCount);
        }

        // Insert new task rows
        var et = formatTime(lastPunchOut);

        if (tasks.length === 0) {
          sheet.insertRowsAfter(dataStartRow - 1, 1);
          var rowIdx = dataStartRow;
          sheet.getRange(rowIdx, 1).setValue("-");
          sheet.getRange(rowIdx, 2).setValue("No tasks completed");
          sheet.getRange(rowIdx, 3).setValue("-");
          sheet.getRange(rowIdx, 4).setValue(st);
          sheet.getRange(rowIdx, 5).setValue(et);
          sheet.getRange(rowIdx, 6).setValue("-");

          sheet.getRange(rowIdx, 1, 1, 6).setBackground("#ffffff").setFontWeight("normal").setFontColor("#000000");
          sheet.getRange(rowIdx, 3).setHorizontalAlignment("center");
          sheet.getRange(rowIdx, 4).setHorizontalAlignment("center");
          sheet.getRange(rowIdx, 5).setHorizontalAlignment("center");
          var borderRange = sheet.getRange(rowIdx, 1, 1, 6);
          borderRange.setBorder(true, true, true, true, true, true);
        } else {
          for (var t = 0; t < tasks.length; t++) {
            var task = tasks[t];
            var rowST = t === 0 ? st : "";
            var rowET = t === tasks.length - 1 ? et : "";

            sheet.insertRowsAfter(dataStartRow + t - 1, 1);
            var rowIdx = dataStartRow + t;

            sheet.getRange(rowIdx, 1).setValue(formatSheetProject(task.project));
            sheet.getRange(rowIdx, 2).setValue(task.title || "");
            sheet.getRange(rowIdx, 3).setValue(task.status || "");
            sheet.getRange(rowIdx, 4).setValue(rowST);
            sheet.getRange(rowIdx, 5).setValue(rowET);
            sheet.getRange(rowIdx, 6).setValue(task.remark || "");

            sheet.getRange(rowIdx, 1, 1, 6).setBackground("#ffffff").setFontWeight("normal").setFontColor("#000000");
            sheet.getRange(rowIdx, 3).setHorizontalAlignment("center").setBackground(getStatusColor(task.status));
            sheet.getRange(rowIdx, 4).setHorizontalAlignment("center");
            sheet.getRange(rowIdx, 5).setHorizontalAlignment("center");

            var borderRange = sheet.getRange(rowIdx, 1, 1, 6);
            borderRange.setBorder(true, true, true, true, true, true);
          }
        }

        // Blank row after tasks
        var rowAfterTasks = dataStartRow + (tasks.length === 0 ? 1 : tasks.length);
        var valAfter = sheet.getRange(rowAfterTasks, 1).getValue();
        if (String(valAfter).indexOf("Task :") === 0) {
          // If the next row is a header, we need to push it down
          sheet.insertRowBefore(rowAfterTasks);
        } else {
          // Otherwise, clear whatever is there to ensure a clean blank space
          sheet.getRange(rowAfterTasks, 1, 1, 6).clearContent();
        }

        return ContentService.createTextOutput(JSON.stringify({ status: "success", action: "updated" })).setMimeType(ContentService.MimeType.JSON);
      }

      // ── CREATE new block (no existing header) ──
      var st = formatTime(firstPunchIn);
      var et = formatTime(lastPunchOut);

      var lastRow = sheet.getLastRow();
      if (lastRow > 0) {
        sheet.appendRow(["", "", "", "", "", ""]);
      }

      // Dark green header
      sheet.appendRow([headerText, "", "", "", "", ""]);
      var headerRowNumber = sheet.getLastRow();
      var hdrRange = sheet.getRange(headerRowNumber, 1, 1, 6);
      hdrRange.merge();
      hdrRange.setBackground("#0b5394");
      hdrRange.setFontColor("#FFFFFF");
      hdrRange.setFontWeight("bold");
      hdrRange.setHorizontalAlignment("center");
      hdrRange.setBorder(true, true, true, true, true, true);

      // Light green column headers
      sheet.appendRow(["Project name", "Task Title", "Status", "Start Time", "End Time", "Remark"]);
      var colHeaderRowNumber = sheet.getLastRow();
      var ttlRange = sheet.getRange(colHeaderRowNumber, 1, 1, 6);
      ttlRange.setBackground("#9fc5e8");
      ttlRange.setFontColor("#000000");
      ttlRange.setFontWeight("bold");
      ttlRange.setHorizontalAlignment("center");
      ttlRange.setBorder(true, true, true, true, true, true);

      var taskStartRow = sheet.getLastRow() + 1;

      if (tasks.length > 0) {
        tasks.forEach(function (task, index) {
          var rowST = index === 0 ? st : "";
          var rowET = index === tasks.length - 1 ? et : "";

          sheet.appendRow([
            formatSheetProject(task.project),
            task.title || "",
            task.status || "",
            rowST,
            rowET,
            task.remark || ""
          ]);

          var currentRow = sheet.getLastRow();
          sheet.getRange(currentRow, 1, 1, 6).setBackground("#ffffff").setFontWeight("normal").setFontColor("#000000");
          sheet.getRange(currentRow, 3).setHorizontalAlignment("center").setBackground(getStatusColor(task.status));
          sheet.getRange(currentRow, 4).setHorizontalAlignment("center");
          sheet.getRange(currentRow, 5).setHorizontalAlignment("center");
        });
      } else {
        sheet.appendRow([
          "",
          "No tasks logged",
          "-",
          st,
          et,
          ""
        ]);
        var currentRow = sheet.getLastRow();
        sheet.getRange(currentRow, 3).setHorizontalAlignment("center");
        sheet.getRange(currentRow, 4).setHorizontalAlignment("center");
        sheet.getRange(currentRow, 5).setHorizontalAlignment("center");
      }

      var taskEndRow = sheet.getLastRow();
      var numTasks = taskEndRow - taskStartRow + 1;
      if (numTasks > 0) {
        var taskRange = sheet.getRange(taskStartRow, 1, numTasks, 6);
        taskRange.setBorder(true, true, true, true, true, true);
      }

      sheet.appendRow(["", "", "", "", "", ""]);

      return ContentService.createTextOutput(JSON.stringify({ status: "success", sheetCreated: sheetName })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unknown action" })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", error: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doOptions(e) {
  return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.JSON);
}

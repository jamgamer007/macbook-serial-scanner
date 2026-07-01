const SHEET_NAME = "Impacted";

function doPost(e) {
  try {
    const sheet = SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(SHEET_NAME);

    if (!sheet) {
      return jsonResponse({
        success: false,
        error: `Sheet tab "${SHEET_NAME}" not found`
      });
    }

    const data = JSON.parse(e.postData.contents);
    const serial = data.serial;

    if (!serial) {
      return jsonResponse({
        success: false,
        error: "No serial provided"
      });
    }

    const normalized = String(serial).trim().toUpperCase();

    // Pull existing serials (Column A)
    const lastRow = sheet.getLastRow();

    let existing = [];
    if (lastRow > 0) {
      existing = sheet
        .getRange(1, 1, lastRow, 1)
        .getValues()
        .flat()
        .map(s => String(s).trim().toUpperCase());
    }

    // Duplicate check
    if (existing.includes(normalized)) {
      return jsonResponse({
        success: false,
        duplicate: true,
        serial: normalized
      });
    }

    // Append new entry
    sheet.appendRow([
      normalized,
      new Date().toISOString()
    ]);

    return jsonResponse({
      success: true,
      serial: normalized
    });

  } catch (err) {
    return jsonResponse({
      success: false,
      error: err.toString()
    });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

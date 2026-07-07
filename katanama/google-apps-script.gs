function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = JSON.parse(e.postData.contents || "{}");

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "createdAt",
      "student",
      "score",
      "correct",
      "wrong",
      "duration",
      "syncedFrom"
    ]);
  }

  sheet.appendRow([
    data.createdAt || new Date().toISOString(),
    data.student || "",
    data.score || 0,
    data.correct || 0,
    data.wrong || 0,
    data.duration || 0,
    "Malay VR Sorter"
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

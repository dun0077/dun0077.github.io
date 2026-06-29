/**
 * Google Apps Script Web App Backend for AR Cup Pyramids Word Game
 * Allows reading/saving settings and scores via JSON API.
 * 
 * Setup instructions:
 * 1. Open Google Sheets, create a spreadsheet.
 * 2. Click Extensions > Apps Script.
 * 3. Delete any default code and paste this file.
 * 4. Click Deploy > New deployment.
 * 5. Select type "Web app".
 * 6. Set Execute as: "Me", Who has access: "Anyone".
 * 7. Deploy, authorize permissions, and copy the Web App URL.
 */

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  var statusMessage = null;
  
  try {
    if (action === "saveScore") {
      var groupName = e.parameter.groupName;
      var members = e.parameter.members ? JSON.parse(e.parameter.members) : [];
      var score = e.parameter.score;
      var cupsPlaced = parseInt(e.parameter.cupsPlaced) || 0;
      var wordsUsed = e.parameter.wordsUsed ? JSON.parse(e.parameter.wordsUsed) : [];
      saveScore(groupName, members, score, cupsPlaced, wordsUsed);
      statusMessage = { status: "success", message: "Score saved successfully." };
    } else if (action === "saveSettings") {
      var students = e.parameter.students ? JSON.parse(e.parameter.students) : [];
      var words = e.parameter.words ? JSON.parse(e.parameter.words) : [];
      saveSettings(students, words);
      statusMessage = { status: "success", message: "Settings saved successfully." };
    }
  } catch (err) {
    statusMessage = { status: "error", message: err.toString() };
  }

  var data = statusMessage || getData();
  
  if (e && e.parameter && e.parameter.callback) {
    var callback = e.parameter.callback;
    var output = callback + "(" + JSON.stringify(data) + ")";
    return ContentService.createTextOutput(output)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return handleResponse(data);
}

function doPost(e) {
  try {
    var postData = JSON.parse(e.postData.contents);
    var action = postData.action;
    
    if (action === "saveScore") {
      saveScore(postData.groupName, postData.members, postData.score, postData.cupsPlaced, postData.wordsUsed);
      return handleResponse({ status: "success", message: "Score saved successfully." });
    } else if (action === "saveSettings") {
      saveSettings(postData.students, postData.words);
      return handleResponse({ status: "success", message: "Settings saved successfully." });
    }
    
    return handleResponse({ status: "error", message: "Invalid action" });
  } catch (err) {
    return handleResponse({ status: "error", message: err.toString() });
  }
}

function handleResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
}

function getData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Setup Sheets if not exist
  var scoreSheet = ss.getSheetByName("Scores") || ss.insertSheet("Scores");
  var configSheet = ss.getSheetByName("Config") || ss.insertSheet("Config");
  
  if (scoreSheet.getLastRow() === 0) {
    scoreSheet.appendRow(["Timestamp", "Group Name", "Members", "Score (Pyramid Height / Cups)", "Cups Placed", "Words Read"]);
  }
  if (configSheet.getLastRow() === 0) {
    configSheet.appendRow(["Key", "Value"]);
    configSheet.appendRow(["Students", ""]);
    configSheet.appendRow(["Words", ""]);
  }
  
  // Read Scores
  var scores = [];
  var scoreData = scoreSheet.getDataRange().getValues();
  for (var i = 1; i < scoreData.length; i++) {
    scores.push({
      timestamp: scoreData[i][0],
      groupName: scoreData[i][1],
      members: safeParse(scoreData[i][2], []),
      score: scoreData[i][3],
      cupsPlaced: scoreData[i][4],
      wordsUsed: safeParse(scoreData[i][5], [])
    });
  }
  
  // Read Settings
  var students = "";
  var words = "";
  var configData = configSheet.getDataRange().getValues();
  for (var j = 1; j < configData.length; j++) {
    if (configData[j][0] === "Students") students = configData[j][1];
    if (configData[j][0] === "Words") words = configData[j][1];
  }
  
  return {
    scores: scores,
    students: students ? safeParse(students, []) : [],
    words: words ? safeParse(words, []) : []
  };
}

function safeParse(str, fallback) {
  try {
    if (!str || str === "undefined") return fallback;
    return JSON.parse(str);
  } catch (e) {
    // If it's a string from an old schema, return the string itself or fallback
    return fallback;
  }
}

function saveScore(groupName, members, score, cupsPlaced, wordsUsed) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var scoreSheet = ss.getSheetByName("Scores") || ss.insertSheet("Scores");
  scoreSheet.appendRow([new Date(), groupName, JSON.stringify(members), score, cupsPlaced, JSON.stringify(wordsUsed)]);
}

function saveSettings(students, words) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configSheet = ss.getSheetByName("Config") || ss.insertSheet("Config");
  
  var configData = configSheet.getDataRange().getValues();
  var studentsRow = -1;
  var wordsRow = -1;
  
  for (var j = 1; j < configData.length; j++) {
    if (configData[j][0] === "Students") studentsRow = j + 1;
    if (configData[j][0] === "Words") wordsRow = j + 1;
  }
  
  if (studentsRow !== -1) {
    configSheet.getRange(studentsRow, 2).setValue(JSON.stringify(students));
  } else {
    configSheet.appendRow(["Students", JSON.stringify(students)]);
  }
  
  if (wordsRow !== -1) {
    configSheet.getRange(wordsRow, 2).setValue(JSON.stringify(words));
  } else {
    configSheet.appendRow(["Words", JSON.stringify(words)]);
  }
}

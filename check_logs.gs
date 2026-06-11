// ดึง execution logs จาก script
function checkRecentLogs() {
  var logs = [];
  try {
    var exec = SpreadsheetApp.getActiveSpreadsheet().getName();
    Logger.log('Checking logs...');
  } catch(e) {
    Logger.log('Error: ' + e.message);
  }
}

checkRecentLogs();

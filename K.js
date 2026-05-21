// ============================================================
// BNI IDEAL — Script K : ACTION LOGS & Mentor ROI Tracker
//
// อุด Gap 2: Accountability Database
// บันทึกทุก action ที่ Mentor ทำ → วัด ROI ว่าได้ผลจริงไหม
//
// Sheet: 📜 ACTION LOGS
// Columns: Timestamp | Mentor | Mentee | Score Before | Core Issue | Action | Plan | Score After | Delta | Status
// ============================================================

var LOG_SHEET_NAME = '📜 ACTION LOGS';
var LOG_HEADERS = [
  'Timestamp', 'Mentor', 'Mentee', 'ชื่อเล่น',
  'คะแนนก่อน', 'Core Issue', 'Action ที่ทำ', 'แผนถัดไป',
  'คะแนนหลัง', 'Delta', 'สถานะ', 'เดือน'
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// สร้าง Sheet ACTION LOGS (ทำครั้งเดียว)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function setupActionLogsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(LOG_SHEET_NAME);

  if (!sh) {
    sh = ss.insertSheet(LOG_SHEET_NAME);
    Logger.log('Created sheet: ' + LOG_SHEET_NAME);
  }

  // Header row
  sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
  sh.getRange(1, 1, 1, LOG_HEADERS.length)
    .setBackground('#1E2A3A').setFontColor('#F0B429')
    .setFontWeight('bold').setFontSize(9);

  // Column widths
  var widths = [140, 80, 160, 60, 70, 160, 200, 200, 70, 60, 80, 60];
  widths.forEach(function(w, i) { sh.setColumnWidth(i+1, w); });
  sh.setFrozenRows(1);

  // Freeze + filter
  sh.getRange(1, 1, 1, LOG_HEADERS.length).createFilter();

  Browser.msgBox('✅ สร้าง Sheet "📜 ACTION LOGS" แล้วครับ\n\nทุกครั้งที่ Mentor กรอก Core Issue ผ่าน Web App\nระบบจะบันทึกเข้า Log นี้อัตโนมัติ');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// บันทึก Action ใหม่ (เรียกจาก apiSaveCoreIssue ใน WebApp)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function logAction(mentorRole, teamName, memberName, nick, scoreBefore, coreIssue, action, plan) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(LOG_SHEET_NAME);

  // สร้าง Sheet ถ้ายังไม่มี
  if (!sh) {
    sh = ss.insertSheet(LOG_SHEET_NAME);
    sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS])
      .setBackground('#1E2A3A').setFontColor('#F0B429').setFontWeight('bold');
  }

  var now    = new Date();
  var ts     = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  var month  = Utilities.formatDate(now, Session.getScriptTimeZone(), 'MM/yy');

  var newRow = [
    ts,           // Timestamp
    mentorRole.toUpperCase(), // Mentor
    memberName,   // Mentee
    nick || '',   // ชื่อเล่น
    scoreBefore,  // คะแนนก่อน
    coreIssue,    // Core Issue
    action || '', // Action
    plan || '',   // แผน
    '',           // คะแนนหลัง (กรอกเองหรือ auto ต้นเดือนถัดไป)
    '',           // Delta
    '⏳ ติดตาม', // Status
    month         // เดือน
  ];

  // หา row ว่างถัดไป
  var lastRow = sh.getLastRow();
  sh.getRange(lastRow + 1, 1, 1, newRow.length).setValues([newRow]);

  // Color code row
  var rowBg = scoreBefore < 30 ? '#2A1A1A' : scoreBefore < 50 ? '#2A2410' : '#1A2A1A';
  sh.getRange(lastRow + 1, 1, 1, LOG_HEADERS.length).setBackground(rowBg);

  Logger.log('Action logged: ' + memberName + ' by ' + mentorRole);
  return lastRow + 1;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// อัปเดต "คะแนนหลัง" และ "Delta" — เรียกทุกต้นเดือนหลัง Sync
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function updateActionLogsAfterSync() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var sh  = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sh) return;

  // Build score lookup จาก Mentor Sheets
  var scoreMap = {};
  ['TOOMTAM','Aof','Draft','PHAI','AMP'].forEach(function(shName) {
    var msh = ss.getSheetByName(shName);
    if (!msh) return;
    for (var r = 4; r <= 11; r++) {
      var name  = msh.getRange(r, 3).getDisplayValue().trim();
      if (!name) continue;
      // หาคะแนนล่าสุด
      var latest = null;
      for (var c = 16; c >= 5; c--) {
        var v = msh.getRange(r, c).getValue();
        if (v && parseFloat(v) > 0) { latest = parseFloat(v); break; }
      }
      scoreMap[name] = latest;
    }
  });

  var lastRow = sh.getLastRow();
  var updated = 0;

  for (var r = 2; r <= lastRow; r++) {
    var status = sh.getRange(r, 11).getDisplayValue().trim();
    if (status !== '⏳ ติดตาม') continue; // ข้าม row ที่ update แล้ว

    var memberName  = sh.getRange(r, 3).getDisplayValue().trim();
    var scoreBefore = parseFloat(sh.getRange(r, 5).getValue()) || 0;
    var scoreAfter  = scoreMap[memberName];

    if (scoreAfter === null || scoreAfter === undefined) continue;

    var delta  = scoreAfter - scoreBefore;
    var status2 = delta > 0 ? '✅ ดีขึ้น +' + delta : delta < 0 ? '📉 แย่ลง ' + delta : '➡️ ทรงตัว';

    sh.getRange(r, 9).setValue(scoreAfter);
    sh.getRange(r, 10).setValue(delta).setFontColor(delta > 0 ? '#10B981' : delta < 0 ? '#EF4444' : '#94A3B8');
    sh.getRange(r, 11).setValue(status2);

    // Color row ตามผลลัพธ์
    var rowBg = delta > 0 ? '#1A2A1A' : delta < 0 ? '#2A1A1A' : '#1E2535';
    sh.getRange(r, 1, 1, LOG_HEADERS.length).setBackground(rowBg);
    updated++;
  }

  Logger.log('ACTION LOGS updated: ' + updated + ' rows');
  return updated;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Monthly ROI Report — summary ของแต่ละ Mentor
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function generateMentorROIReport() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sh || sh.getLastRow() < 2) {
    Browser.msgBox('ยังไม่มีข้อมูลใน ACTION LOGS ครับ');
    return;
  }

  var data = sh.getRange(2, 1, sh.getLastRow() - 1, LOG_HEADERS.length).getValues();
  var mentorStats = {};

  data.forEach(function(row) {
    var mentor     = String(row[1] || '').trim();
    var scoreBefore= parseFloat(row[4]) || 0;
    var scoreAfter = parseFloat(row[8]) || 0;
    var delta      = parseFloat(row[9]) || 0;
    var status     = String(row[10] || '');
    if (!mentor) return;

    if (!mentorStats[mentor]) {
      mentorStats[mentor] = { total:0, improved:0, declined:0, stable:0, totalDelta:0 };
    }
    mentorStats[mentor].total++;
    if (delta > 0) mentorStats[mentor].improved++;
    else if (delta < 0) mentorStats[mentor].declined++;
    else if (status !== '⏳ ติดตาม') mentorStats[mentor].stable++;
    mentorStats[mentor].totalDelta += delta;
  });

  var msg = '📊 Mentor ROI Report\n\n';
  Object.keys(mentorStats).sort().forEach(function(mentor) {
    var s  = mentorStats[mentor];
    var successRate = s.total > 0 ? Math.round((s.improved / s.total) * 100) : 0;
    msg += mentor + ':\n';
    msg += '  Actions: ' + s.total + ' | ดีขึ้น: ' + s.improved + ' (' + successRate + '%)\n';
    msg += '  Delta รวม: ' + (s.totalDelta >= 0 ? '+' : '') + s.totalDelta.toFixed(1) + '\n\n';
  });

  Browser.msgBox(msg);
}
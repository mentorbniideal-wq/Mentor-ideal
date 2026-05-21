// ============================================================
// BNI IDEAL — Script F (FINAL COMPLETE): Reporting2You Sync
// Purpose: ดึงจาก Reporting2You → สร้าง REPORTING2YOU_SYNC sheet
// Columns: Member, RG, RR, CEU, Points, BNI Days, P, A, L, M, Score
// ============================================================

/**
 * onOpen: แสดง Menu สำหรับ Reporting2You Sync
 * ✅ Call จาก Coach.gs onOpen() หรือ run ที่นี่
 */
function onOpenF() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('📊 Reporting2You')
    .addItem('🔄 Sync ข้อมูลจาก Reporting2You', 'syncReporting2YouData')
    .addItem('ℹ️ ข้อมูล REPORTING2YOU_SYNC', 'showReporting2YouInfo')
    .addSeparator()
    .addItem('🔍 Debug: Show Column Map', 'debugShowColumnMap')
    .addToUi();
}

/**
 * Main: Sync Reporting2You → REPORTING2YOU_SYNC sheet
 * ✅ Columns: A=Name, B=RG, C=RR, D=CEU, E=Points, F=BNI Days, G=P, H=A, I=L, J=M, K=Score
 */
function syncReporting2YouData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // ── Check sheets exist ────────────────────────────────────
  var r2ySheet = ss.getSheetByName('Reporting2You');
  if (!r2ySheet) {
    Browser.msgBox('⚠️ ไม่พบ Sheet "Reporting2You"\n\nกรุณา Import ข้อมูลจาก BNI ก่อนครับ');
    return;
  }
  
  // ── Create or get REPORTING2YOU_SYNC sheet ────────────────
  var syncSheet = ss.getSheetByName('REPORTING2YOU_SYNC');
  if (!syncSheet) {
    Logger.log('📊 Creating REPORTING2YOU_SYNC sheet...');
    syncSheet = createReporting2YouSyncSheet(ss);
  }
  
  // ── Read Reporting2You data ────────────────────────────────
  var r2yLastRow = r2ySheet.getLastRow();
  if (r2yLastRow < 2) {
    Browser.msgBox('⚠️ Sheet Reporting2You ว่างเปล่า');
    return;
  }
  
  // Read columns A-M (13 columns, 0-indexed: 0-12)
  // A=Member, B=RG, C=RR, D=121, E=CEU, F=TYFCB, G=Points, H=BNI Days, 
  // I=P, J=A, K=L, L=M, M=S
  var r2yData = r2ySheet.getRange(2, 1, r2yLastRow - 1, 13).getValues();
  
  // ── Transform & validate ──────────────────────────────────
  var syncData = [];
  var memberCount = 0;
  var skipped = [];
  
  r2yData.forEach(function(row) {
    var memberName = String(row[0] || '').trim();
    
    // Skip empty rows
    if (!memberName) return;
    
    // Clean member name (remove "BNI Ideal" suffix)
    var cleanName = memberName.replace(/\s*\(BNI Ideal\)\s*$/i, '').trim();
    
    // Skip if too short
    if (cleanName.length < 2) {
      skipped.push(memberName);
      return;
    }
    
    // Extract columns (using 0-indexed array)
    // row[0]=A, row[1]=B, row[2]=C, ..., row[12]=M
    var rg = parseFloat(row[1]) || 0;           // B: RG
    var rr = parseFloat(row[2]) || 0;           // C: RR
    var score121 = parseFloat(row[3]) || 0;     // D: 121
    var ceu = parseFloat(row[4]) || 0;          // E: CEU
    var tyfcb = parseFloat(row[5]) || 0;        // F: TYFCB
    var points = parseFloat(row[6]) || 0;       // G: Points
    var bniDays = parseFloat(row[7]) || 0;      // H: BNI Days
    var present = parseFloat(row[8]) || 0;      // I: P (Present/Attendance)
    var absent = parseFloat(row[9]) || 0;       // J: A (Absent)
    var late = parseFloat(row[10]) || 0;        // K: L (Late)
    var missing = parseFloat(row[11]) || 0;     // L: M (Missing/Substitute)
    
    syncData.push([
      cleanName,              // A: Member (cleaned)
      rg,                     // B: RG (1-2-1)
      rr,                     // C: RR (Referral)
      ceu,                    // D: CEU
      points,                 // E: Points
      bniDays,                // F: BNI Days
      present,                // G: P (Present/Attendance)
      absent,                 // H: A (Absent)
      late,                   // I: L (Late)
      missing,                // J: M (Missing/Substitute)
      score121                // K: 121.0 (Traffic Light Score)
    ]);
    
    memberCount++;
  });
  
  if (syncData.length === 0) {
    Browser.msgBox('⚠️ ไม่มีข้อมูลที่สามารถ sync ได้');
    return;
  }
  
  // ── Write to REPORTING2YOU_SYNC ────────────────────────────
  // Clear old data (keep headers)
  var syncLastRow = syncSheet.getLastRow();
  if (syncLastRow > 1) {
    syncSheet.getRange(2, 1, syncLastRow - 1, 11).clearContent();
  }
  
  // Write new data
  syncSheet.getRange(2, 1, syncData.length, 11).setValues(syncData);
  
  // Format
  formatReporting2YouSyncSheet(syncSheet);
  
  // ── Log result ─────────────────────────────────────────────
  var now = new Date();
  var ts = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  
  var message = 
    '✅ Sync Reporting2You เสร็จสมบูรณ์!\n\n' +
    'อัปเดต: ' + memberCount + ' คน\n' +
    'เวลา: ' + ts + '\n\n' +
    '🟢 REPORTING2YOU_SYNC sheet columns:\n' +
    '   A: Member (cleaned names)\n' +
    '   B: RG (1-2-1 meetings)\n' +
    '   C: RR (Referrals given)\n' +
    '   D: CEU (training hours)\n' +
    '   E: Points (BNI points)\n' +
    '   F: BNI Days (days in BNI)\n' +
    '   G: P (Present/Attendance)\n' +
    '   H: A (Absent)\n' +
    '   I: L (Late)\n' +
    '   J: M (Missing/Substitute)\n' +
    '   K: 121.0 (Traffic Light Score)\n\n' +
    '⚡ Coach.gs onEdit() ตอนนี้จะดึงจาก\n' +
    '   REPORTING2YOU_SYNC แทน Reporting2You\n\n' +
    '✅ ONE-PAGE COACHING อัพเดตอัตโนมัติ';
  
  if (skipped.length > 0) {
    message += '\n\n⚠️ ข้าม ' + skipped.length + ' rows (data invalid)';
  }
  
  Browser.msgBox(message);
  
  // Update timestamp on sheet
  syncSheet.getRange(1, 12).setValue('Last Sync: ' + ts)
    .setFontSize(8).setFontColor('#666666').setFontStyle('italic');
}

/**
 * Create REPORTING2YOU_SYNC sheet with headers
 */
function createReporting2YouSyncSheet(ss) {
  // Check if already exists
  var existing = ss.getSheetByName('REPORTING2YOU_SYNC');
  if (existing) return existing;
  
  // Create new sheet
  var newSheet = ss.insertSheet('REPORTING2YOU_SYNC');
  
  // Headers
  var headers = [
    'Member',
    'RG',
    'RR',
    'CEU',
    'Points',
    'BNI Days',
    'P',
    'A',
    'L',
    'M',
    'Score'
  ];
  
  newSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // Format header row
  var headerRange = newSheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#1a73e8')
    .setFontColor('white')
    .setFontWeight('bold')
    .setFontFamily('Kanit')
    .setFontSize(11)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  
  // Set column widths
  newSheet.setColumnWidth(1, 200);  // Member
  newSheet.setColumnWidths(2, 9, 70);  // Rest
  newSheet.setColumnWidth(11, 90);  // Score
  
  // Freeze header
  newSheet.setFrozenRows(1);
  
  newSheet.setRowHeight(1, 24);
  
  return newSheet;
}

/**
 * Format REPORTING2YOU_SYNC sheet
 */
function formatReporting2YouSyncSheet(sheet) {
  if (!sheet) return;
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  
  // Alternate row colors + center align
  var dataRange = sheet.getRange(2, 1, lastRow - 1, 11);
  var backgrounds = [];
  
  for (var r = 2; r <= lastRow; r++) {
    var row = [];
    for (var c = 1; c <= 11; c++) {
      row.push((r % 2 === 0) ? '#f9f9f9' : '#ffffff');
    }
    backgrounds.push(row);
  }
  
  dataRange.setBackgrounds(backgrounds);
  dataRange.setFontColor('#333333');
  dataRange.setFontFamily('Kanit');
  dataRange.setFontSize(10);
  
  // Center align numeric columns B-K
  sheet.getRange(2, 2, lastRow - 1, 10).setHorizontalAlignment('center');
  
  // Left align Member column
  sheet.getRange(2, 1, lastRow - 1, 1).setHorizontalAlignment('left');
}

/**
 * Show info about REPORTING2YOU_SYNC
 */
function showReporting2YouInfo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var syncSheet = ss.getSheetByName('REPORTING2YOU_SYNC');
  
  if (!syncSheet) {
    Browser.msgBox(
      'ℹ️ REPORTING2YOU_SYNC\n\n' +
      '❌ Sheet ยังไม่มี\n\n' +
      'วิธีสร้าง:\n' +
      '1. Click 📊 Reporting2You\n' +
      '2. Click 🔄 Sync ข้อมูลจาก Reporting2You'
    );
    return;
  }
  
  var lastRow = syncSheet.getLastRow();
  var lastSync = syncSheet.getRange(1, 12).getValue();
  
  Browser.msgBox(
    'ℹ️ REPORTING2YOU_SYNC Sheet\n\n' +
    '✅ Status: Active\n\n' +
    'Data: ' + (lastRow - 1) + ' members\n\n' +
    'Columns:\n' +
    '  A: Member name\n' +
    '  B: RG (1-2-1)\n' +
    '  C: RR (Referral)\n' +
    '  D: CEU\n' +
    '  E: Points\n' +
    '  F: BNI Days\n' +
    '  G: P (Present)\n' +
    '  H: A (Absent)\n' +
    '  I: L (Late)\n' +
    '  J: M (Sub)\n' +
    '  K: Score (121)\n\n' +
    'Last Sync: ' + lastSync + '\n\n' +
    'ใช้โดย: Coach.gs onEdit()'
  );
}

/**
 * Debug: Show column mapping
 */
function debugShowColumnMap() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var r2ySheet = ss.getSheetByName('Reporting2You');
  
  if (!r2ySheet) {
    Browser.msgBox('ไม่พบ Reporting2You');
    return;
  }
  
  var header = r2ySheet.getRange(1, 1, 1, 13).getValues()[0];
  var msg = '📊 Reporting2You Column Map:\n\n';
  msg += 'Idx | Col | Header\n';
  msg += '----+-----+----------\n';
  
  for (var i = 0; i < 13; i++) {
    var colLetter = String.fromCharCode(65 + i);
    var colName = header[i] || '(empty)';
    msg += (i < 10 ? ' ' : '') + i + '   | ' + colLetter + '   | ' + colName + '\n';
  }
  
  Browser.msgBox(msg);
}
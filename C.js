// ============================================================
// BNI IDEAL — Script C : Summary Counter ใน Dashboard
// วิธีใช้: Cmd+S → Run → addSummaryCounter
// ทำงานได้: นับจาก col D (คะแนนล่าสุด) ใน Dashboard อัตโนมัติ
// ============================================================

function addSummaryCounter() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var dash = ss.getSheetByName('📊 DASHBOARD');

  if (!dash) {
    Browser.msgBox('⚠️ ไม่พบ Sheet "📊 DASHBOARD"\nกรุณาตรวจสอบว่าเปิดไฟล์ถูกต้อง');
    return;
  }

  // ── หา data range ใน Dashboard ──────────────────────────────
  // Dashboard มี header row 3, data เริ่ม row 4
  // col D (col 4) = คะแนนล่าสุด
  var lastRow = dash.getLastRow();
  var SCORE_COL = 4;  // col D
  var DATA_START = 4;

  // อ่านคะแนนทั้งหมด
  var scores = dash.getRange(DATA_START, SCORE_COL, lastRow - DATA_START + 1, 1)
                   .getValues();

  var green = 0, yellow = 0, red = 0, black = 0, noData = 0;

  scores.forEach(function(row) {
    var v = row[0];
    // ข้ามแถว separator (ค่าว่าง หรือ text)
    if (v === '' || v === null || typeof v === 'string') {
      if (typeof v === 'string' && v !== '') noData++; // formula error
      return;
    }
    var s = parseFloat(v);
    if (isNaN(s)) return;
    if (s >= 70)      green++;
    else if (s >= 50) yellow++;
    else if (s >= 30) red++;
    else if (s > 0)   black++;
  });

  var total = green + yellow + red + black;

  // ── เพิ่ม/อัปเดต Summary row ในแถวที่ 3 (หัวตาราง) ──────────
  // แถว 1 = Title, แถว 2 = Subtitle, แถว 3 = Summary Counter (ใหม่)
  // เดิม row 3 = column headers → เลื่อนลงมา row 4
  // แต่เพื่อไม่ให้กระทบ data ที่มีอยู่ → ใส่ใน row 2 แทน (subtitle row)

  // วิธีปลอดภัยที่สุด: เพิ่ม summary เป็น merged cell ใน row 2
  // และอัปเดต row 2 ซึ่งเดิมเป็น subtitle text

  // ── อ่าน col ที่ใช้จริงใน Dashboard ─────────────────────────
  var lastCol = dash.getLastColumn();

  // Row 2: เปลี่ยนเป็น Summary Counter
  var summaryRange = dash.getRange(2, 1, 1, lastCol);
  summaryRange.merge();

  var now = new Date();
  var ts  = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');

  summaryRange.setValue(
    '🟢 เขียว ' + green + ' คน   ' +
    '🟡 เหลือง ' + yellow + ' คน   ' +
    '🔴 แดง ' + red + ' คน   ' +
    '⚫ ดำ ' + black + ' คน   ' +
    '│   รวม ' + total + ' คน ใน Mentor System   ' +
    '│   อัปเดต: ' + ts
  );

  summaryRange
    .setBackground('#1E2A3A')
    .setFontColor('#F0B429')
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(false);

  dash.setRowHeight(2, 26);

  // ── เพิ่ม Conditional Formatting badge สี ───────────────────
  // col D = คะแนน → ทำ color scale ทับ
  var scoreRange = dash.getRange(DATA_START, SCORE_COL, lastRow - DATA_START + 1, 1);

  // ลบ CF เดิมของ col D ก่อน (ถ้ามี)
  var existingRules = dash.getConditionalFormatRules();
  var newRules = existingRules.filter(function(rule) {
    var ranges = rule.getRanges();
    return !ranges.some(function(r) {
      return r.getColumn() === SCORE_COL &&
             r.getRow() >= DATA_START;
    });
  });

  // เพิ่ม CF ใหม่ 4 สี
  var cfGreen = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThanOrEqualTo(70)
    .setBackground('#E6F4EA').setFontColor('#1A7A4A').setBold(true)
    .setRanges([scoreRange]).build();

  var cfYellow = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberBetween(50, 69)
    .setBackground('#FFF8E1').setFontColor('#B7791F').setBold(true)
    .setRanges([scoreRange]).build();

  var cfRed = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberBetween(30, 49)
    .setBackground('#FDECEA').setFontColor('#C0392B').setBold(true)
    .setRanges([scoreRange]).build();

  var cfBlack = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberBetween(1, 29)
    .setBackground('#CCCCCC').setFontColor('#111111').setBold(true)
    .setRanges([scoreRange]).build();

  newRules.push(cfGreen, cfYellow, cfRed, cfBlack);
  dash.setConditionalFormatRules(newRules);

  Logger.log('Summary: เขียว=' + green + ' เหลือง=' + yellow +
             ' แดง=' + red + ' ดำ=' + black + ' รวม=' + total);

  Browser.msgBox(
    '✅ Summary Counter อัปเดตแล้ว!\n\n' +
    '🟢 เขียว  : ' + green  + ' คน\n' +
    '🟡 เหลือง : ' + yellow + ' คน\n' +
    '🔴 แดง    : ' + red    + ' คน\n' +
    '⚫ ดำ     : ' + black  + ' คน\n' +
    '──────────────────\n' +
    '👥 รวม   : ' + total  + ' คน\n\n' +
    'ดูได้ที่ row 2 ใน Dashboard ✅\n' +
    'Run Script C อีกครั้งได้ทุกเมื่อเพื่อ refresh'
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// เพิ่ม Script C เข้า BNI Sync Menu (รวมกับ Script B)
// onOpen อยู่ใน Coach.js (single source of truth) — ไม่ต้องซ้ำที่นี่
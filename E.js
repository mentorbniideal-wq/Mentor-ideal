// ============================================================
// BNI IDEAL — Script E : Quick Fix คะแนน Non-Mentor Members
// อ่านจาก UPDATE SCORES → เขียนคะแนนลง รายชื่อทั้งหมด col E
// ใช้เวลา ~10 วินาที ไม่แตะข้อมูลอื่น
// วิธีใช้: Cmd+S → เลือก fixNonMentorScores → Run
// ============================================================

function fixNonMentorScores() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var csvSheet    = ss.getSheetByName('📥 UPDATE SCORES');
  var masterSheet = ss.getSheetByName('รายชื่อทั้งหมด');
  var nmSheet     = ss.getSheetByName('👀 NON-MENTOR');

  if (!csvSheet || !masterSheet) {
    Browser.msgBox('⚠️ ไม่พบ Sheet ที่จำเป็น\nต้องมี "📥 UPDATE SCORES" และ "รายชื่อทั้งหมด"');
    return;
  }

  // ── อ่าน CSV จาก UPDATE SCORES ─────────────────────────────
  var lastRow = csvSheet.getLastRow();
  var lastCol = csvSheet.getLastColumn();

  if (lastRow < 8) {
    Browser.msgBox('⚠️ ยังไม่มีข้อมูล CSV ใน UPDATE SCORES\nกรุณา Paste CSV ก่อน');
    return;
  }

  // Header row 7 (col B เป็นต้นไป)
  var headers = csvSheet.getRange(7, 2, 1, lastCol-1).getValues()[0];

  // หา column ขวาสุดที่เป็นเดือน
  var monthPattern = /^\d{2}\/\d{2}$/;
  var latestColIdx = -1;
  for (var c = headers.length-1; c >= 0; c--) {
    if (monthPattern.test(String(headers[c]).trim())) {
      latestColIdx = c;
      break;
    }
  }

  if (latestColIdx < 0) {
    Browser.msgBox('⚠️ ไม่พบ column เดือน (เช่น 03/26) ใน row 7\nกรุณา Paste CSV ใหม่');
    return;
  }

  var latestMonth = String(headers[latestColIdx]).trim();

  // อ่าน data ทั้งหมด (row 8+)
  var data = csvSheet.getRange(8, 2, lastRow-7, lastCol-1).getValues();

  // สร้าง map: ชื่อสะอาด → คะแนนล่าสุด
  var scoreMap = {};
  data.forEach(function(row) {
    var raw = String(row[0]||'').trim();
    // ตัด "(BNI Ideal)" และ junk
    raw = raw.replace(/Export as PDF.*/i,'').replace(/No data.*/i,'').trim();
    var m = raw.match(/^(.+?)\s*\(BNI Ideal\)/i);
    var name = m ? m[1].trim() : raw;
    if (name.length < 3 || name.length > 60) return;

    var score = parseFloat(row[latestColIdx]);
    if (!isNaN(score)) scoreMap[name] = score;
  });

  // ── อัปเดต รายชื่อทั้งหมด col E ──────────────────────────────
  var masterLast = masterSheet.getLastRow();
  var updated = [];
  var notFound = [];

  for (var r = 3; r <= masterLast; r++) {
    var name   = masterSheet.getRange(r,2).getDisplayValue().trim();
    var mentor = masterSheet.getRange(r,4).getDisplayValue().trim();
    var curScore = masterSheet.getRange(r,5).getValue();

    if (!name) continue;

    // แก้เฉพาะคนที่คะแนนเป็น "—" หรือสูตรที่คืนค่า error
    var needsFix = (curScore === '"—"' || curScore === '—' ||
                   curScore === null || String(curScore).indexOf('—') >= 0);
    if (!needsFix) continue;

    // ค้นหาใน scoreMap
    var score = scoreMap[name];

    // ลอง fuzzy: ตัด spaces พิเศษ
    if (score === undefined) {
      var nameNorm = name.replace(/\s+/g,' ');
      score = scoreMap[nameNorm];
    }

    if (score !== undefined) {
      // เขียนคะแนนลง col E โดยตรง (hardcode แทน formula)
      var cell = masterSheet.getRange(r,5);
      cell.setValue(score);

      // อัปเดตสี Traffic Light col F
      var tlCell = masterSheet.getRange(r,6);
      var tlText = score>=70 ? '🟢 เขียว'
                 : score>=50 ? '🟡 เหลือง'
                 : score>=30 ? '🔴 แดง'
                 : score>0   ? '⚫ ดำ' : '— ไม่มีข้อมูล';
      tlCell.setValue(tlText);

      updated.push(name + ' → ' + score + ' (' + latestMonth + ')');
    } else {
      notFound.push(name);
    }
  }

  // ── Refresh NON-MENTOR Sheet badge counts ─────────────────────
  if (nmSheet) {
    // อัปเดต badge row 3 ด้วยตัวเลขใหม่
    var green=0,yel=0,red=0,blk=0;
    for (var r2 = 5; r2 <= nmSheet.getLastRow(); r2++) {
      var s = parseFloat(nmSheet.getRange(r2,5).getValue());
      if (isNaN(s) || s===0) continue;
      if (s>=70) green++; else if (s>=50) yel++;
      else if (s>=30) red++; else blk++;
    }
    var total = green+yel+red+blk;

    // อัปเดต scores ใน NON-MENTOR sheet ด้วย
    for (var nr = 5; nr <= nmSheet.getLastRow(); nr++) {
      var nmName = nmSheet.getRange(nr,3).getDisplayValue().trim();
      if (!nmName) continue;
      var nmScore = scoreMap[nmName] || scoreMap[nmName.replace(/\s+/g,' ')];
      if (nmScore !== undefined) {
        nmSheet.getRange(nr,5).setValue(nmScore);
        var cf = nmScore>=70?'🟢 เขียว':nmScore>=50?'🟡 เหลือง':nmScore>=30?'🔴 แดง':'⚫ ดำ';
        nmSheet.getRange(nr,6).setValue(cf);
      }
    }
  }

  // ── Log & แจ้งผล ───────────────────────────────────────────
  Logger.log('Updated: ' + updated.join(' | '));
  if (notFound.length) Logger.log('Not found in CSV: ' + notFound.join(', '));

  var skipMsg = notFound.length > 0
    ? '\n\n⚠️ ไม่พบใน CSV ' + notFound.length + ' คน:\n' + notFound.join(', ')
    : '';

  Browser.msgBox(
    '✅ แก้คะแนน Non-Mentor เสร็จแล้ว!\n\n' +
    'อัปเดต ' + updated.length + ' คน จากเดือน ' + latestMonth + '\n\n' +
    updated.slice(0,10).join('\n') +
    (updated.length > 10 ? '\n...' : '') +
    skipMsg +
    '\n\n💡 รายชื่อทั้งหมด col E และ NON-MENTOR Sheet อัปเดตแล้ว'
  );
}

// onOpen อยู่ใน Coach.js (single source of truth) — ไม่ต้องซ้ำที่นี่
// ============================================================
// BNI IDEAL — parseCheckinPDF
// Server-side function ที่รับ base64 PDF แล้ว parse เป็น JSON
//
// เพิ่มใน WEBAPP.gs:
// 1. ใน dispatch(): if (a==='parseCheckin') return parseCheckinPDF(payload.base64);
// 2. Copy function parseCheckinPDF ลงไปด้านล่าง
// ============================================================

function parseCheckinPDF(base64Data) {
  try {
    // Decode base64 เป็น Blob
    var decoded  = Utilities.base64Decode(base64Data);
    var blob     = Utilities.newBlob(decoded, 'application/pdf', 'checkin.pdf');

    // แปลง PDF เป็น text ผ่าน Google Drive (temporary)
    var tempFile = DriveApp.createFile(blob);

    // ใช้ Advanced Drive API อ่าน text (ต้องเปิด Drive API ก่อน)
    // วิธีง่ายกว่า: อ่านผ่าน raw bytes แล้ว extract text pattern
    var text = _extractTextFromPDFBlob(decoded);

    tempFile.setTrashed(true); // ลบ temp file

    if (!text) return { ok:false, error:'ไม่สามารถอ่านข้อความจาก PDF ได้' };

    var parsed = _parseCheckinText(text);
    return {
      ok:      true,
      members: parsed.members,
      date:    parsed.date,
      week:    parsed.week,
      total:   parsed.members.length
    };

  } catch(e) {
    Logger.log('parseCheckinPDF error: ' + e.message);
    return { ok:false, error:e.message };
  }
}

// ── Extract text จาก PDF bytes ──────────────────────────────
// วิธีนี้ใช้ Google Docs conversion ซึ่งรองรับ PDF ที่มี text layer
function _extractTextFromPDFBlob(decoded) {
  try {
    var blob = Utilities.newBlob(decoded, 'application/pdf', 'temp_checkin.pdf');

    // Upload ไป Drive แล้วแปลงเป็น Google Docs เพื่ออ่าน text
    var resource = { title:'temp_checkin_parse', mimeType:'application/vnd.google-apps.document' };
    var file = Drive.Files.insert(resource, blob, { convert:true });
    var doc  = DocumentApp.openById(file.id);
    var text = doc.getBody().getText();

    // ลบ temp files
    DriveApp.getFileById(file.id).setTrashed(true);

    return text;
  } catch(e) {
    Logger.log('PDF text extraction error: ' + e.message);
    // Fallback: ลอง read raw text pattern จาก bytes
    return _extractRawTextFromBytes(decoded);
  }
}

// ── Fallback: extract text patterns จาก raw PDF bytes ────────
function _extractRawTextFromBytes(bytes) {
  try {
    var str = '';
    // แปลง bytes เป็น string แล้วหา readable text
    for (var i = 0; i < Math.min(bytes.length, 100000); i++) {
      var b = bytes[i];
      if (b >= 32 && b <= 126) str += String.fromCharCode(b);
      else if (b === 10 || b === 13) str += '\n';
    }
    return str;
  } catch(e) {
    return '';
  }
}

// ── Parse text เป็น structured members ───────────────────────
function _parseCheckinText(text) {
  var lines   = text.split('\n').map(function(l){ return l.trim(); }).filter(Boolean);
  var members = [];
  var date    = '';
  var week    = '';

  // หาวันที่
  for (var i = 0; i < Math.min(5, lines.length); i++) {
    var dm = lines[i].match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
    if (dm) { date = dm[1]; break; }
  }

  // คำนวณ week label
  if (date) {
    var parts = date.split('/');
    try {
      var d;
      if (parts[2] && parts[2].length === 2) parts[2] = '20' + parts[2];
      // M/D/YYYY
      d = new Date(parseInt(parts[2]), parseInt(parts[0])-1, parseInt(parts[1]));
      if (isNaN(d.getTime())) {
        // DD/MM/YYYY
        d = new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0]));
      }
      if (!isNaN(d.getTime())) {
        var startOfYear = new Date(d.getFullYear(), 0, 1);
        var weekNum = Math.ceil((((d - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);
        week = String(weekNum).padStart(2,'0') + '/' + d.getFullYear();
      }
    } catch(e) {}
  }
  if (!week) week = date || 'unknown';

  // Parse members
  var i = 0;
  while (i < lines.length) {
    var line = lines[i];

    // Pattern: "N : Name (สมาชิก|ตัวแทน)" หรือ ": Name (สมาชิก|ตัวแทน)"
    var nameMatch = line.match(/^(\d*)\s*:\s*(.+?)\s*\((สมาชิก|ตัวแทน)\)/);
    if (nameMatch) {
      var no     = nameMatch[1] || String(members.length + 1);
      var name   = nameMatch[2].trim();
      var status = nameMatch[3];
      var subFor = null;
      var lfParts = [];

      i++;
      while (i < lines.length) {
        var nxt = lines[i];
        if (nxt.match(/^มาประชุมแทน\s*:/)) {
          subFor = nxt.replace(/^มาประชุมแทน\s*:\s*/, '').trim();
          i++;
        } else if (nxt.match(/^Looking for\s*:/i)) {
          var lf = nxt.replace(/^Looking for\s*:\s*/i, '').trim();
          if (lf) lfParts.push(lf);
          i++;
          // multi-line
          while (i < lines.length &&
                 !lines[i].match(/^เช็คอิน\s*:/) &&
                 !lines[i].match(/^\d*\s*:\s*.+\((สมาชิก|ตัวแทน)\)/)) {
            lfParts.push(lines[i]);
            i++;
          }
        } else if (nxt.match(/^เช็คอิน\s*:/)) {
          i++;
          break;
        } else {
          i++;
          break;
        }
      }

      members.push({
        no:          no,
        name:        name,
        status:      status,
        sub_for:     subFor,
        looking_for: lfParts.join(' ').trim()
      });
    } else {
      i++;
    }
  }

  return { members:members, date:date, week:week };
}
// ============================================================
// BNI IDEAL — parseCheckinCSV
// รับ CSV text จาก Gemini แล้ว parse เป็น members
// เพิ่มใน dispatch():
// if (a==='parseCheckin') return parseCheckinCSV(payload.text);
// ============================================================

// Auto-detect format: raw BNI text ("N : Name (สมาชิก)") vs CSV from Gemini
function parseCheckinCSV(rawText) {
  try {
    if (!rawText || rawText.trim().length === 0) {
      return { ok:false, error:'กรุณาวาง text ก่อนครับ' };
    }

    var cleaned = rawText.replace(/\r/g, '');

    // ตรวจว่าเป็น raw BNI text format หรือ CSV
    var isRawFormat = cleaned.split('\n').some(function(l) {
      return /^\s*\d*\s*:\s*.+\((สมาชิก|ตัวแทน)\)/.test(l.trim());
    });

    if (isRawFormat) {
      // ใช้ parser ของ raw BNI text (จาก CheckIn_ParsePDF.js)
      var parsed = _parseCheckinText(cleaned);
      if (!parsed.members || !parsed.members.length) {
        return { ok:false, error:'อ่านข้อมูลไม่ได้ — ลองตรวจสอบ format อีกครั้งครับ' };
      }
      return { ok:true, members:parsed.members, date:parsed.date, week:parsed.week, total:parsed.members.length };
    }

    // ── CSV format ────────────────────────────────────────────
    var members = [];
    var lines   = cleaned.split('\n');
    var today   = new Date();
    var date    = Utilities.formatDate(today, Session.getScriptTimeZone(), 'dd/MM/yyyy');
    var week    = _calcWeekFromDate(today);

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      // ตัด [cite: xxx] ออก
      line = line.replace(/\s*\[cite:[^\]]+\]/g, '').trim();
      if (!line) continue;

      var fields = _parseCSVLine(line);
      if (fields.length < 2) continue;

      var name      = fields[0].trim();
      var status    = fields[1].trim();
      var subFor    = fields.length > 2 ? fields[2].trim() : '';
      var lookingFor= fields.length > 3 ? fields[3].trim() : '';

      if (status !== 'สมาชิก' && status !== 'ตัวแทน') continue;
      if (!name || name.length < 2) continue;

      members.push({
        no:          String(members.length + 1),
        name:        name,
        status:      status,
        sub_for:     subFor || null,
        looking_for: lookingFor
      });
    }

    if (members.length === 0) {
      return { ok:false, error:'อ่านข้อมูลไม่ได้\n\nรองรับ 2 format:\n1) CSV: ชื่อ,สมาชิก,,Looking For\n2) Raw text: N : ชื่อ (สมาชิก)' };
    }

    return { ok:true, members:members, date:date, week:week, total:members.length };

  } catch(e) {
    Logger.log('parseCheckinCSV error: ' + e.message);
    return { ok:false, error:e.message };
  }
}

function _parseCSVLine(line) {
  var fields = [];
  var current = '';
  var inQuote = false;

  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function _calcWeekFromDate(d) {
  var startOfYear = new Date(d.getFullYear(), 0, 1);
  var weekNum = Math.ceil((((d - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);
  return ('0' + weekNum).slice(-2) + '/' + d.getFullYear();
}
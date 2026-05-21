// ============================================================
// BNI IDEAL — CheckIn & AI 1-2-1 Matching System
// แบ่งเป็น 3 ส่วน:
//   PART A: Google Sheets setup (Script)
//   PART B: WebApp server functions (ใส่ใน WEBAPP.gs)
//   PART C: HTML/JS สำหรับ Growth App (ใส่ใน index.html)
// ============================================================

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PART A — สร้าง Sheet CHECKIN LOG (Run ครั้งเดียว)
// เมนู BNI Sync → "📋 สร้าง Sheet CHECKIN LOG"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

var CHECKIN_SHEET = '📋 CHECKIN LOG';
var CHECKIN_HEADERS = [
  'สัปดาห์', 'วันที่', 'ลำดับ', 'ชื่อ', 'สถานะ',
  'แทน (Sub For)', 'Looking For', 'Mentor', 'นำเข้าเมื่อ'
];

function setupCheckinSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CHECKIN_SHEET);

  if (!sh) {
    sh = ss.insertSheet(CHECKIN_SHEET);
  }

// Header
sh.getRange(1, 1, 1, CHECKIN_HEADERS.length).setValues([CHECKIN_HEADERS])
  .setBackground('#1E2A3A').setFontColor('#F0B429')
  .setFontWeight('bold').setFontSize(9);

// Column widths
[60, 90, 50, 180, 70, 150, 300, 80, 120].forEach(function(w, i) {
  sh.setColumnWidth(i+1, w);
});

sh.setFrozenRows(1);

if (!sh.getFilter()) {
  sh.getRange(1, 1, 1, CHECKIN_HEADERS.length).createFilter();
}

  Browser.msgBox('✅ สร้าง Sheet "📋 CHECKIN LOG" แล้วครับ\n\nใน Web App → Growth → Tab "📋 Check-In"\nกด Upload PDF แล้วระบบบันทึกลง Sheet นี้อัตโนมัติ');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PART B — WebApp Server Functions
// ใส่ใน WEBAPP.gs เพิ่มใน dispatch() และ copy functions ลงไป
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// เพิ่มใน dispatch():
// if (a==='saveCheckin')    return apiSaveCheckin(payload);
// if (a==='getCheckinLog')  return apiGetCheckinLog(payload);
// if (a==='getAIMatching')  return apiGetAIMatching(payload);

// ── บันทึก Check-In data จาก Web App ────────────────────────
function apiSaveCheckin(p) {
  if (p.role !== 'growth' && p.role !== 'mc') return { ok:false, error:'Permission denied' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CHECKIN_SHEET);
  if (!sh) {
    setupCheckinSheet();
    sh = ss.getSheetByName(CHECKIN_SHEET);
  }

  var members = p.members || [];
  var dateStr  = p.date || '';
  var weekNum  = p.week || _getWeekLabel(dateStr);
  var importedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');

  // Build mentor lookup จาก Master Sheet
  var masterSh = ss.getSheetByName('รายชื่อทั้งหมด');
  var mentorMap = {};
  if (masterSh) {
    var mData = masterSh.getDataRange().getValues();
    for (var i = 2; i < mData.length; i++) {
      var mName   = String(mData[i][1] || '').trim();
      var mMentor = String(mData[i][3] || '').trim();
      if (mName) mentorMap[mName] = mMentor;
    }
  }

  // ลบ rows เดิมของสัปดาห์นี้ก่อน (ป้องกัน duplicate)
  var lastRow = sh.getLastRow();
  if (lastRow > 1) {
    var existing = sh.getRange(2, 1, lastRow-1, 1).getValues();
    for (var r = existing.length - 1; r >= 0; r--) {
      if (String(existing[r][0]).trim() === weekNum) {
        sh.deleteRow(r + 2);
      }
    }
  }

  // Write new rows
  var rows = members.map(function(m) {
    var mentor = mentorMap[m.name] || '';
    return [
      weekNum, dateStr, m.no, m.name, m.status,
      m.sub_for || '', m.looking_for || '', mentor, importedAt
    ];
  });

  if (rows.length > 0) {
    var startRow = sh.getLastRow() + 1;
    sh.getRange(startRow, 1, rows.length, CHECKIN_HEADERS.length).setValues(rows);

    // สี row ตาม status
    rows.forEach(function(row, idx) {
      var r = startRow + idx;
      var bg = row[4] === 'ตัวแทน' ? '#2A2410' : '#162030';
      sh.getRange(r, 1, 1, CHECKIN_HEADERS.length).setBackground(bg);
    });
  }

  Logger.log('CheckIn saved: ' + rows.length + ' members, week ' + weekNum);
  return { ok:true, saved:rows.length, week:weekNum };
}

// ── ดึง Check-In Log ─────────────────────────────────────────
function apiGetCheckinLog(p) {
  if (p.role !== 'growth' && p.role !== 'mc') return { ok:false, error:'Permission denied' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CHECKIN_SHEET);
  if (!sh || sh.getLastRow() < 2) return { ok:true, weeks:[], members:[] };

  // Batch read
  var data = sh.getRange(2, 1, sh.getLastRow()-1, CHECKIN_HEADERS.length).getValues();

  // หา weeks ที่มีข้อมูล
  var weeksSet = {};
  var latestWeek = null;
  data.forEach(function(row) {
    var w = String(row[0] || '').trim();
    if (w) {
      weeksSet[w] = (weeksSet[w] || 0) + 1;
      latestWeek = w; // อันสุดท้ายคือล่าสุด
    }
  });

  // Filter เฉพาะ week ที่ร้องขอ (default = latest)
  var targetWeek = p.week || latestWeek;
  var members = [];
  data.forEach(function(row) {
    if (String(row[0]).trim() === targetWeek) {
      members.push({
        no:          row[2],
        name:        String(row[3] || ''),
        status:      String(row[4] || ''),
        sub_for:     String(row[5] || ''),
        looking_for: String(row[6] || ''),
        mentor:      String(row[7] || '')
      });
    }
  });

  return {
    ok: true,
    weeks: Object.keys(weeksSet).map(function(w) { return { week:w, count:weeksSet[w] }; }),
    currentWeek: targetWeek,
    members: members
  };
}

// ── AI 1-2-1 Matching ────────────────────────────────────────
// เรียก Anthropic API วิเคราะห์ Looking For แล้ว match คู่
function apiGetAIMatching(p) {
  if (p.role !== 'growth' && p.role !== 'mc') return { ok:false, error:'Permission denied' };

  var members = p.members || [];
  if (members.length === 0) return { ok:false, error:'ไม่มีข้อมูลสมาชิก' };

  // กรองเฉพาะสมาชิกจริง (ไม่รวม Sub)
  var realMembers = members.filter(function(m) {
    return m.status === 'สมาชิก' && m.looking_for && m.looking_for.trim();
  });

  // สร้าง prompt สำหรับ Claude
  var memberList = realMembers.map(function(m) {
    return m.name + ' [' + (m.mentor||'?') + ']: ' + m.looking_for;
  }).join('\n');

  var prompt = 'คุณเป็น Growth Coordinator ของ BNI Chapter IDEAL\n\n' +
    'รายชื่อสมาชิกที่มาประชุมสัปดาห์นี้ พร้อม Looking For:\n' +
    '---\n' + memberList + '\n---\n\n' +
    'โปรดวิเคราะห์และแนะนำคู่ 1-2-1 ที่น่าจะได้ประโยชน์ร่วมกัน\n' +
    'เกณฑ์การ match:\n' +
    '1. Looking For ของคน A ตรงกับธุรกิจของคน B (B สามารถช่วยหาลูกค้าให้ A ได้)\n' +
    '2. หรือ Looking For ของทั้งสองฝ่ายเชื่อมโยงกันได้ในแง่ธุรกิจ\n' +
    '3. เน้น cross-team (ต่าง Mentor) ก่อน\n\n' +
    'ตอบเป็น JSON เท่านั้น ห้ามมี text นอก JSON:\n' +
    '{\n' +
    '  "matches": [\n' +
    '    {\n' +
    '      "person_a": "ชื่อคน A",\n' +
    '      "person_b": "ชื่อคน B",\n' +
    '      "reason": "เหตุผลสั้นๆ ว่าทำไมควร 1-2-1 กัน",\n' +
    '      "action": "สิ่งที่ควรคุยกัน หรือ Referral ที่อาจเกิด",\n' +
    '      "priority": "high/medium/low"\n' +
    '    }\n' +
    '  ],\n' +
    '  "summary": "สรุปภาพรวมการ match สัปดาห์นี้"\n' +
    '}';

  try {
    var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
    if (!apiKey) return { ok:false, error:'ไม่พบ ANTHROPIC_API_KEY ใน Script Properties' };

    var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 2000,
        messages:   [{ role:'user', content:prompt }]
      }),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    if (code !== 200) {
      return { ok:false, error:'API error: ' + code + ' — ' + response.getContentText().slice(0,200) };
    }

    var result    = JSON.parse(response.getContentText());
    var text      = result.content[0].text;
    var jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok:false, error:'AI ตอบกลับในรูปแบบที่ไม่ถูกต้อง' };

    var parsed = JSON.parse(jsonMatch[0]);
    return { ok:true, matches:parsed.matches || [], summary:parsed.summary || '' };

  } catch(e) {
    return { ok:false, error:e.message };
  }
}

// ── Helper: คำนวณ week label ─────────────────────────────────
function _getWeekLabel(dateStr) {
  if (!dateStr) {
    var now = new Date();
    return Utilities.formatDate(now, Session.getScriptTimeZone(), 'ww/yyyy');
  }
  try {
    // รองรับ M/D/YY และ DD/MM/YYYY
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'ww/yyyy');
  } catch(e) {
    return dateStr;
  }
}
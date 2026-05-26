// ============================================================
// BNI IDEAL — Growth Role Extension
// เพิ่มเข้าไปใน WebApp_v2.gs
//
// Column Map ที่ตรวจสอบแล้วจาก Sheet จริง:
//
// รายชื่อทั้งหมด (data starts row 3):
//   col 1 = ลำดับ
//   col 2 = ชื่อ - นามสกุล
//   col 3 = ชื่อเล่น
//   col 4 = Mentor
//   col 5 = คะแนนล่าสุด
//   col 6 = สี Traffic Light
//   col 7 = GIVEN (฿)
//   col 8 = Received (฿)
//   col 9 = Balance Status
//
// Reporting2You (data starts row 2):
//   col 1  = Member
//   col 2  = RG (Referral Given — จำนวนใบ)
//   col 3  = RR (Referral Received — จำนวนใบ)
//   col 4  = Visi.
//   col 5  = 1-2-1
//   col 6  = CEU
//   col 7  = TYFCB (฿)
//   col 8  = Points
//   col 9  = BNI Days
//   col 10 = P (มาประชุม)
//   col 11 = A (ขาด)
//   col 16 = Phone
//   col 15 = Email
// ============================================================

// ── [1] เพิ่ม PIN ใน PINS object ─────────────────────────────
// หา var PINS = { ... } ใน WebApp_v2.gs แล้วเพิ่มบรรทัดนี้:
//   'growth': '6666',
//
// ถ้าใช้ ⚙️ SETTINGS Sheet:
//   อ่าน PIN จาก Sheet เหมือน role อื่น (ดู _getPinFromSettings)

// ── [2] เพิ่มใน apiLogin ─────────────────────────────────────
// หา var names = { ... } แล้วเพิ่ม:
//   growth:'Growth Coordinator',
//
// หา var MENTOR_ROLE = { ... } — growth ไม่มี teamName (null)
// isMC: false → ระบบจะ route ไป growthApp แทน

// ── [3] เพิ่มใน dispatch() ──────────────────────────────────
// หา if (a==='saveMCMessage') ... แล้วต่อด้วย:
//   if (a==='getGrowthData') return apiGetGrowthData(p);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// apiGetGrowthData — Batch Read เท่านั้น (ไม่มี getValue() loop)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function apiGetGrowthData(p) {
  if (p.role !== 'growth') return { ok:false, error:'Permission denied' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── Batch Read: รายชื่อทั้งหมด ────────────────────────────
  var masterSh  = ss.getSheetByName('รายชื่อทั้งหมด');
  if (!masterSh) return { ok:false, error:'ไม่พบ Sheet รายชื่อทั้งหมด' };

  var masterLastRow = masterSh.getLastRow();
  // data เริ่ม row 3 (row 1=title, row 2=header)
  var masterData = masterSh.getRange(3, 1, masterLastRow - 2, 9).getValues();

  // ── Batch Read: Reporting2You ──────────────────────────────
  var r2ySh = ss.getSheetByName('Reporting2You');
  if (!r2ySh) return { ok:false, error:'ไม่พบ Sheet Reporting2You' };

  var r2yLastRow = r2ySh.getLastRow();
  // data เริ่ม row 2 (row 1=header), อ่าน 16 cols
  var r2yData = r2ySh.getRange(2, 1, r2yLastRow - 1, 16).getValues();

  // ── Build R2Y lookup map (key = ชื่อ clean) ───────────────
  // O(n) build แล้ว O(1) lookup — ดีกว่า nested loop
  var r2yMap = {};
  for (var j = 0; j < r2yData.length; j++) {
    var raw = String(r2yData[j][0] || '');
    var key = raw.replace(/\s*\(BNI Ideal\)/i, '').trim();
    if (key) r2yMap[key] = r2yData[j];
  }

  // ── Process & Classify Members ────────────────────────────
  var members = [];
  var summary = {
    total: 0,
    highGiverLowRecv: 0,
    lowGiverHighRecv: 0,
    balanced: 0,
    totalGiven: 0,
    totalRecv: 0,
    totalVisitors: 0,
    total121: 0,
    totalTYFCB: 0,
    chapterAttend: 0,
    chapterAbsent: 0,
    chapterAttendRate: 0
  };

  for (var i = 0; i < masterData.length; i++) {
    var row    = masterData[i];
    var name   = String(row[1] || '').trim();
    var nick   = String(row[2] || '').trim();
    var mentor = String(row[3] || '').trim();
    var score  = parseFloat(row[4]) || 0;
    var tlStr  = String(row[5] || '');
    var given  = parseFloat(row[6]) || 0;  // col 7 → index 6
    var recv   = parseFloat(row[7]) || 0;  // col 8 → index 7
    var balance= String(row[8] || '');

    if (!name || score === 0) continue;

    // ดึงจาก R2Y
    var r2y    = r2yMap[name] || null;
    var rgCount  = r2y ? (parseFloat(r2y[1])  || 0) : 0;  // RG col 2
    var rrCount  = r2y ? (parseFloat(r2y[2])  || 0) : 0;  // RR col 3
    var visitors = r2y ? (parseFloat(r2y[3])  || 0) : 0;  // Visi col 4
    var r121     = r2y ? (parseFloat(r2y[4])  || 0) : 0;  // 1-2-1 col 5
    var ceu      = r2y ? (parseFloat(r2y[5])  || 0) : 0;  // CEU col 6
    var tyfcb    = r2y ? (parseFloat(r2y[6])  || 0) : 0;  // TYFCB col 7
    var bniDays  = r2y ? (parseInt(r2y[8])    || 0) : 0;  // BNI Days col 9
    var attend   = r2y ? (parseInt(r2y[9])    || 0) : 0;  // P col 10
    var absent   = r2y ? (parseInt(r2y[10])   || 0) : 0;  // A col 11

    // ── Justice Index ─────────────────────────────────────────
    // เปรียบ RG (จำนวนใบที่ให้) vs RR (จำนวนใบที่รับ)
    // ใช้ count (ใบ) เป็นหลัก เพราะ value อาจ skewed จากขนาดธุรกิจ
    var totalRef   = rgCount + rrCount;
    var giveRatio  = totalRef > 0 ? rgCount / totalRef : 0.5;

    // ── Unfair Zone Classification ────────────────────────────
    // threshold ปรับได้ตามบริบท BNI IDEAL
    var GIVE_HIGH_THRESHOLD = 0.55; // ลดลงจาก 0.60
    var GIVE_LOW_THRESHOLD  = 0.45; // เพิ่มขึ้นจาก 0.40
    var RECV_LOW_THRESHOLD  = 5;    // เพิ่มขึ้นจาก 3
    var MIN_ACTIVITY        = 3;    // ลดลงจาก 5

    var zone;
    if (totalRef < MIN_ACTIVITY) {
      zone = 'inactive'; // ยังไม่มีข้อมูลพอ
    } else if (giveRatio >= GIVE_HIGH_THRESHOLD && rrCount < RECV_LOW_THRESHOLD) {
      zone = 'highGiverLowRecv'; // 🔴 ให้เยอะ รับน้อย — ต้องเข้าไปช่วย
    } else if (giveRatio <= GIVE_LOW_THRESHOLD) {
      zone = 'lowGiverHighRecv'; // 🟡 รับเยอะ ให้น้อย
    } else {
      zone = 'balanced';         // ✅ สมดุล
    }

    // ── TYFCB ROI — ยอดธุรกิจต่อวันที่อยู่ใน BNI ────────────
    var tyfcbPerDay = bniDays > 0 ? Math.round(tyfcb / bniDays) : 0;

    // ── Score TL key ──────────────────────────────────────────
    var tl = score >= 70 ? 'green' : score >= 50 ? 'yellow' : score >= 30 ? 'red' : 'black';

    var member = {
      name:    name,
      nick:    nick,
      mentor:  mentor,
      score:   score,
      tl:      tl,
      given:   given,    // ฿ จาก Master
      recv:    recv,     // ฿ จาก Master
      balance: balance,
      rgCount:     rgCount,
      rrCount:     rrCount,
      giveRatio:   Math.round(giveRatio * 100),
      visitors:    visitors,
      r121:        r121,
      ceu:         ceu,
      tyfcb:       tyfcb,
      tyfcbPerDay: tyfcbPerDay,
      bniDays:     bniDays,
      attend:      attend,
      absent:      absent,
      attendRate:  (attend + absent) > 0 ? Math.round(attend / (attend + absent) * 100) : 0,
      zone:        zone
    };

    members.push(member);
    summary.total++;
    summary.totalGiven    += given;
    summary.totalRecv     += recv;
    summary.totalVisitors += visitors;
    summary.total121      += r121;
    summary.totalTYFCB    += tyfcb;
    summary.chapterAttend += attend;
    summary.chapterAbsent += absent;
    if (zone === 'highGiverLowRecv') summary.highGiverLowRecv++;
    else if (zone === 'lowGiverHighRecv') summary.lowGiverHighRecv++;
    else if (zone === 'balanced') summary.balanced++;
  }
  var chTotal = summary.chapterAttend + summary.chapterAbsent;
  summary.chapterAttendRate = chTotal > 0 ? Math.round(summary.chapterAttend / chTotal * 100) : 0;

  // เรียงลำดับ: highGiverLowRecv ขึ้นก่อน → ตามด้วย score ต่ำสุด
  members.sort(function(a, b) {
    var zoneOrder = { highGiverLowRecv:0, lowGiverHighRecv:1, inactive:2, balanced:3 };
    var za = zoneOrder[a.zone] !== undefined ? zoneOrder[a.zone] : 4;
    var zb = zoneOrder[b.zone] !== undefined ? zoneOrder[b.zone] : 4;
    if (za !== zb) return za - zb;
    return a.score - b.score; // คะแนนต่ำขึ้นก่อนในกลุ่มเดียวกัน
  });

  return {
    ok:      true,
    members: members,
    summary: summary
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// _getPinFromSettings — อ่าน PIN จาก Sheet ⚙️ SETTINGS
// เพิ่มเข้าใน apiLogin() แทนการ hardcode PINS object
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _getPinFromSettings(role) {
  // ⚠️ ปรับ range ตามโครงสร้าง ⚙️ SETTINGS Sheet จริงของพีท
  // สมมติว่า Sheet มี 2 cols: col A = role, col B = pin
  // เช่น: mc | 1234
  //       toomtam | 1111
  //       growth | 6666

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('⚙️ SETTINGS');

  // ถ้าไม่มี SETTINGS Sheet ให้ fallback ไป PINS hardcode
  if (!sh) return null;

  var data = sh.getDataRange().getValues(); // Batch read ทั้ง Sheet
  for (var i = 0; i < data.length; i++) {
    var rowRole = String(data[i][0] || '').toLowerCase().trim();
    var rowPin  = String(data[i][1] || '').trim();
    if (rowRole === role.toLowerCase()) return rowPin;
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Growth ↔ Mentor Task Handoff
// Sheet: "📋 GROWTH TASKS" (auto-created)
// Cols: ID | Team | Member | Type | Note | Priority | Created | Status | Response | Responded
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _getOrCreateGrowthTaskSheet(ss) {
  var sh = ss.getSheetByName('📋 GROWTH TASKS');
  if (!sh) {
    sh = ss.insertSheet('📋 GROWTH TASKS');
    sh.appendRow(['ID','Team','Member','Type','Note','Priority','Created','Status','Response','Responded']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function apiCreateGrowthTask(p) {
  if (p.role !== 'growth') return { ok:false, error:'Permission denied' };
  if (!p.teamName || !p.memberName) return { ok:false, error:'ข้อมูลไม่ครบ' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = _getOrCreateGrowthTaskSheet(ss);
  var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yy HH:mm');
  var id = String(new Date().getTime());
  sh.appendRow([id, p.teamName, p.memberName, p.taskType||'', p.note||'', p.priority||'📋', ts, 'open', '', '']);
  try {
    var mentorLineId = _getLineId(p.teamName);
    if (mentorLineId) {
      _sendLineMsg(mentorLineId,
        '📋 Growth Task ใหม่\n' +
        'ทีม: ' + p.teamName + '\nสมาชิก: ' + p.memberName + '\n' +
        (p.taskType ? 'ประเภท: ' + p.taskType + '\n' : '') +
        (p.note ? 'หมายเหตุ: ' + p.note.substring(0,120) + '\n' : '') +
        '\nตรวจสอบใน BNI IDEAL System ครับ');
    }
  } catch(le) { Logger.log('LINE notify err: '+le.message); }
  return { ok:true, id:id };
}

function apiGetGrowthTasks(p) {
  var isMentor = !!MENTOR_ROLE[p.role];
  var isGrowth = p.role === 'growth';
  if (!isMentor && !isGrowth) return { ok:false, error:'Permission denied' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('📋 GROWTH TASKS');
  if (!sh) return { ok:true, tasks:[] };
  var data = sh.getDataRange().getValues();
  var myTeam = MENTOR_ROLE[p.role] || null;
  var tasks = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var id = String(row[0]||'').trim();
    if (!id) continue;
    if (isMentor && String(row[1]) !== myTeam) continue;
    var status = String(row[7]||'open').trim();
    if (p.statusFilter && p.statusFilter !== 'all' && status !== p.statusFilter) continue;
    tasks.push({
      id: id,
      team: String(row[1]||''),
      memberName: String(row[2]||''),
      taskType: String(row[3]||''),
      note: String(row[4]||''),
      priority: String(row[5]||'📋'),
      createdAt: String(row[6]||''),
      status: status,
      response: String(row[8]||''),
      respondedAt: String(row[9]||'')
    });
  }
  tasks.sort(function(a,b){ return (a.status==='open'?0:1)-(b.status==='open'?0:1); });
  return { ok:true, tasks:tasks };
}

function apiRespondGrowthTask(p) {
  if (!MENTOR_ROLE[p.role]) return { ok:false, error:'Permission denied' };
  if (!p.id) return { ok:false, error:'ไม่มี Task ID' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('📋 GROWTH TASKS');
  if (!sh) return { ok:false, error:'ไม่พบ Task Sheet' };
  var data = sh.getDataRange().getValues();
  var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yy HH:mm');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== String(p.id)) continue;
    if (String(data[i][1]) !== MENTOR_ROLE[p.role]) return { ok:false, error:'ไม่ใช่ทีมคุณ' };
    sh.getRange(i+1, 8).setValue('done');
    sh.getRange(i+1, 9).setValue(p.response||'');
    sh.getRange(i+1, 10).setValue(ts);
    return { ok:true };
  }
  return { ok:false, error:'ไม่พบ Task' };
}
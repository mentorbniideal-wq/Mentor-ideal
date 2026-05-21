// ============================================================
// BNI IDEAL — Script D : Sheet กลาง "📊 ALL SCORES"
// สมาชิกทุกคน (มีและไม่มี Mentor) มีคะแนนให้ดึงได้
//
// วิธีใช้: Cmd+S → Dropdown เลือก runScriptD → Run
//
// สิ่งที่ Script ทำ:
// 1. สร้าง Sheet "📊 ALL SCORES" — ตารางคะแนนรายเดือนทุกคน
// 2. อัปเดต Sheet "รายชื่อทั้งหมด" col E ให้ดึงจาก ALL SCORES
// 3. อัปเดต Sheet "📊 DASHBOARD" col D ให้ดึงจาก ALL SCORES
// ============================================================

// ── สมาชิกทุกคนที่มีใน Chapter (ไม่รวม Dropped) ──────────────
// กลุ่มที่มี Mentor: ดึงจาก Mentor Sheet ตามเดิม
// กลุ่มที่ไม่มี Mentor: กรอกคะแนนใน ALL SCORES Sheet โดยตรง

var MENTOR_SCORE_MAP = {
  // TOOMTAM — sheet row Q col
  'Ophat Taerattanachai':        { src:'TOOMTAM', row:4  },
  'Jirayu Boonlert':             { src:'TOOMTAM', row:5  },
  'Ittipon Setthawattananon':    { src:'TOOMTAM', row:6  },
  'Theerawut Piyaphinthu':       { src:'TOOMTAM', row:7  },
  'Jetsada Sanudomchok':         { src:'TOOMTAM', row:8  },
  'Duangkamon Chanthaboon':      { src:'TOOMTAM', row:9  },
  'Preyawal Vatcharachaithanin': { src:'TOOMTAM', row:10 },
  'Atthachai Somboon':           { src:'TOOMTAM', row:11 },
  // Aof
  'Narin Lourujirakul':          { src:'Aof', row:4  },
  'Pariphon Jaroonthiravith':    { src:'Aof', row:5  },
  'Chananan Saengplao':          { src:'Aof', row:6  },
  'Ploypachcha Tararattanapawn': { src:'Aof', row:7  },
  'Phanuwat Promwong':           { src:'Aof', row:8  },
  'Ekawat Suwannahong':          { src:'Aof', row:9  },
  'Nantawat Mahaeknan':          { src:'Aof', row:10 },
  'Thanongsak Seriumnuay':       { src:'Aof', row:11 },
  // Draft
  'Tanyaluck Treepornwasu':      { src:'Draft', row:4  },
  'Thanakrit Wathport':          { src:'Draft', row:5  },
  'Krisada Kotama':              { src:'Draft', row:6  },
  'Naruporn Supittayapornpong':  { src:'Draft', row:7  },
  'Nilin Waroha':                { src:'Draft', row:8  },
  'Phannakorn Kittikool':        { src:'Draft', row:9  },
  'Yosita Niyomrat':             { src:'Draft', row:10 },
  'Sirimon Sanoi':               { src:'Draft', row:11 },
  // PHAI
  'Chiranan Sathitsamphan':      { src:'PHAI', row:4  },
  'Wasawat Rattanakornpipat':    { src:'PHAI', row:5  },
  'Orapan Pougpralub':           { src:'PHAI', row:6  },
  'Pemika Siriyotha':            { src:'PHAI', row:7  },
  'Rewat Sanpet':                { src:'PHAI', row:8  },
  'Thanyalak Samreeloy':         { src:'PHAI', row:9  },
  'Nattawut Amsri':              { src:'PHAI', row:10 },
  'Weerawat Suepadkon':          { src:'PHAI', row:11 },
  // AMP
  'Gomen Khotsopa':              { src:'AMP', row:4 },
  'Kanpong Ritchainimit':        { src:'AMP', row:5 },
  'Korranat Worawongthep':       { src:'AMP', row:6 },
  'Wisnugorn Udornwong':         { src:'AMP', row:7 },
  'Itthipol Rattanapirote':      { src:'AMP', row:8 },
  'Kittathat Jaruchaikul':       { src:'AMP', row:9 }
};

// สมาชิกที่ไม่มี Mentor (กรอกคะแนนเองใน ALL SCORES)
var NON_MENTOR_MEMBERS = [
  'Archara Pagarat',
  'Kanoknat Nakhonthai',
  'Nipawee Supachaisakron',
  'Pisit Akarapanichayakul',
  'Pongpat Chanthai',
  'Thitima Hemarak',
  'Palat Thanasrivanichai',
  'Preeda Noita',
  'Jakrapong Visetpanpong',
  'Suporn Wongchompoo',
  'Praputsorn Kongsarppaisal',
  'Phitarn Sakulthanaphetch',
  'Prakorn Sirimars',
  'Adisak Pankhot',
  'Samrit Pholjan',
  'Phanupan Somsanook',
  'Chanchai Tengsujaritkul'
];

// คะแนนล่าสุดที่ทราบ (MAR-26) สำหรับ pre-fill
var KNOWN_SCORES = {
  'Archara Pagarat':90,'Kanoknat Nakhonthai':80,'Nipawee Supachaisakron':80,
  'Pisit Akarapanichayakul':80,'Pongpat Chanthai':80,'Thitima Hemarak':75,
  'Palat Thanasrivanichai':75,'Preeda Noita':70,'Jakrapong Visetpanpong':70,
  'Suporn Wongchompoo':75,'Praputsorn Kongsarppaisal':70,
  'Phitarn Sakulthanaphetch':65,'Prakorn Sirimars':65,
  'Adisak Pankhot':50,'Samrit Pholjan':60,'Phanupan Somsanook':50,
  'Chanchai Tengsujaritkul':25
};

var MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

// ── Helpers ──────────────────────────────────────────────────
function sc(cell, bg, fg, bold, sz, align) {
  if (!cell) return;
  cell.setBackground(bg||'#FFFFFF').setFontColor(fg||'#111111')
      .setFontWeight(bold?'bold':'normal').setFontSize(sz||9)
      .setHorizontalAlignment((align||'center').toLowerCase())
      .setVerticalAlignment('middle').setWrap(true);
}
function bd(range) {
  range.setBorder(true,true,true,true,false,false,'#CCCCCC',
    SpreadsheetApp.BorderStyle.SOLID);
}
function scoreColor(s) {
  var n = parseFloat(s);
  if (isNaN(n)||n===0) return {bg:'#F4F4F4',fg:'#888888'};
  if (n>=70) return {bg:'#E6F4EA',fg:'#1A7A4A'};
  if (n>=50) return {bg:'#FFF8E1',fg:'#B7791F'};
  if (n>=30) return {bg:'#FDECEA',fg:'#C0392B'};
  return {bg:'#CCCCCC',fg:'#111111'};
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 1: สร้าง Sheet "📊 ALL SCORES"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildAllScoresSheet(ss) {
  var NAME = '📊 ALL SCORES';
  var old  = ss.getSheetByName(NAME);
  if (old) ss.deleteSheet(old);

  // วางหลัง Dashboard
  var dash = ss.getSheetByName('📊 DASHBOARD');
  var idx  = dash ? dash.getIndex() : 1;
  var ws   = ss.insertSheet(NAME, idx);

  // widths
  ws.setColumnWidth(1, 20);   // A spacer
  ws.setColumnWidth(2, 6);    // B #
  ws.setColumnWidth(3, 220);  // C ชื่อ
  ws.setColumnWidth(4, 90);   // D Mentor
  for (var m = 0; m < 12; m++) ws.setColumnWidth(5+m, 48); // E-P months
  ws.setColumnWidth(17, 70);  // Q ล่าสุด (formula)
  ws.setColumnWidth(18, 20);  // R spacer

  // Row 1: Title
  ws.setRowHeight(1, 40);
  var title = ws.getRange('B1:Q1');
  title.merge().setValue('📊  ALL SCORES — คะแนนรายเดือนสมาชิกทุกคน  |  BNI IDEAL 2026');
  sc(title.getCell(1,1),'#1E2A3A','#F0B429',true,13);

  // Row 2: คำอธิบาย
  ws.setRowHeight(2, 18);
  var sub = ws.getRange('B2:Q2');
  sub.merge().setValue(
    '🟩 สีเขียว = มี Mentor ดูแล (ดึงคะแนนจาก Mentor Sheet อัตโนมัติ)   ' +
    '🟨 สีเหลือง = ไม่มี Mentor (กรอกคะแนนในช่อง MAR/APR/... ด้วยมือ)   ' +
    '⭐ คอลัมน์ Q = คะแนนล่าสุด (สูตรอัตโนมัติ)'
  );
  sc(sub.getCell(1,1),'#2E4057','#AAAAAA',false,8);

  // Row 3: Section headers
  ws.setRowHeight(3, 22);
  // mentored section
  var mentSec = ws.getRange('B3:Q3');
  mentSec.merge().setValue('✅  สมาชิกที่มี Mentor — คะแนนดึงจาก Mentor Sheet อัตโนมัติ (ไม่ต้องกรอกเอง)');
  sc(mentSec.getCell(1,1),'#1A7A4A','#FFFFFF',true,9);

  // Row 4: Column headers
  ws.setRowHeight(4, 24);
  var hdrs = ['#','ชื่อ - นามสกุล','Mentor'];
  MONTHS.forEach(function(m){ hdrs.push(m); });
  hdrs.push('⭐ ล่าสุด');
  hdrs.forEach(function(h,i){
    var cell = ws.getRange(4, i+2);
    cell.setValue(h);
    sc(cell,'#2E4057','#FFFFFF',true,8);
    bd(cell);
  });

  // Mentored rows
  var mentList = Object.keys(MENTOR_SCORE_MAP);
  mentList.sort();
  var mentorNames = {
    'TOOMTAM':'TOOMTAM','Aof':'Aof','Draft':'Draft','PHAI':'PHAI','AMP':'AMP'
  };
  var mentorColors = {
    'TOOMTAM':'#EBF5FB','Aof':'#E6F4EA','Draft':'#FFF8E1',
    'PHAI':'#FEF5E7','AMP':'#F4ECF7'
  };
  var mentorFgColors = {
    'TOOMTAM':'#1565C0','Aof':'#1A7A4A','Draft':'#B7791F',
    'PHAI':'#D35400','AMP':'#5B2C8D'
  };

  for (var i = 0; i < mentList.length; i++) {
    var r    = 5 + i;
    var name = mentList[i];
    var info = MENTOR_SCORE_MAP[name];
    var alt  = i%2===0 ? '#F4F4F4' : '#FFFFFF';
    ws.setRowHeight(r, 20);

    // # col
    var cNo = ws.getRange(r,2);
    cNo.setValue(i+1); sc(cNo,alt,'#888888',false,8); bd(cNo);

    // ชื่อ
    var cName = ws.getRange(r,3);
    cName.setValue(name); sc(cName,alt,'#111111',true,9,'left'); bd(cName);

    // Mentor badge
    var cMen = ws.getRange(r,4);
    var mBg  = mentorColors[info.src] || alt;
    var mFg  = mentorFgColors[info.src] || '#111111';
    cMen.setValue(info.src);
    sc(cMen, mBg, mFg, true, 8); bd(cMen);

    // คะแนนรายเดือน — สูตร VLOOKUP จาก Mentor Sheet
    // col E=5(JAN/01/26), F=6, G=7(MAR/03/26)...
    var monthCols = ['E','F','G','H','I','J','K','L','M','N','O','P'];
    for (var mc = 0; mc < 12; mc++) {
      var sheetCol = 5 + mc; // col index E=5...P=16 ใน Mentor Sheet
      var cell = ws.getRange(r, 5+mc);
      // Link ตรงจาก Mentor Sheet แทนที่จะ VLOOKUP
      cell.setFormula("=IFERROR('" + info.src + "'!" + monthCols[mc] + info.row + ",\"\")");
      sc(cell, alt, '#111111', false, 9); bd(cell);
    }

    // ⭐ ล่าสุด (col Q=17) — LOOKUP ขวาสุดที่มีข้อมูล
    var scoreRange = 'E'+r+':P'+r;
    var qCell = ws.getRange(r, 17);
    qCell.setFormula('=IFERROR(LOOKUP(2,1/('+scoreRange+'<>""),'+scoreRange+'),"—")');
    var cf = scoreColor(KNOWN_SCORES[name] || 0);
    sc(qCell, cf.bg, cf.fg, true, 10); bd(qCell);
  }

  // ── Non-Mentor Section ────────────────────────────────────
  var nmStart = 5 + mentList.length + 1;
  ws.setRowHeight(nmStart-1, 8); // spacer

  var nmSec = ws.getRange(nmStart, 2, 1, 16);
  nmSec.merge().setValue(
    '⚠️  สมาชิกที่ไม่มี Mentor — กรอกคะแนนในช่อง APR/MAY/... ด้วยมือทุกเดือน  ' +
    '| MAR คือคะแนนล่าสุดที่รู้ (pre-filled)  |  APR เป็นต้นไป = กรอกเองหลัง BNI ส่งข้อมูล'
  );
  sc(nmSec.getCell(1,1),'#D35400','#FFFFFF',true,9);
  ws.setRowHeight(nmStart, 24);
  nmStart++;

  // Headers (ซ้ำ)
  ws.setRowHeight(nmStart, 22);
  hdrs.forEach(function(h,i){
    var cell = ws.getRange(nmStart, i+2);
    cell.setValue(h);
    sc(cell,'#2E4057','#FFFFFF',true,8); bd(cell);
  });
  nmStart++;

  // Non-mentor rows — MAR hardcoded, APR+ เว้นว่างให้กรอก
  NON_MENTOR_MEMBERS.forEach(function(name, i) {
    var r   = nmStart + i;
    var alt = i%2===0 ? '#FFF8E1' : '#FFFDF0';
    ws.setRowHeight(r, 20);

    var cNo = ws.getRange(r,2);
    cNo.setValue(i+1); sc(cNo,alt,'#888888',false,8); bd(cNo);

    var cName = ws.getRange(r,3);
    cName.setValue(name); sc(cName,alt,'#111111',true,9,'left'); bd(cName);

    var cMen = ws.getRange(r,4);
    cMen.setValue('— ไม่มี');
    sc(cMen,'#FDECEA','#C0392B',false,8); bd(cMen);

    // MAR (col G = index 2 = 3rd month) = known score
    var knownScore = KNOWN_SCORES[name];
    for (var mc = 0; mc < 12; mc++) {
      var cell = ws.getRange(r, 5+mc);
      if (mc === 2 && knownScore) { // MAR
        cell.setValue(knownScore);
        var cf2 = scoreColor(knownScore);
        sc(cell, cf2.bg, cf2.fg, true, 9);
      } else {
        cell.setValue('');
        sc(cell, alt, '#111111', false, 9);
      }
      bd(cell);
    }

    // ⭐ ล่าสุด
    var scoreRange2 = 'E'+r+':P'+r;
    var qCell2 = ws.getRange(r, 17);
    qCell2.setFormula('=IFERROR(LOOKUP(2,1/('+scoreRange2+'<>""),'+scoreRange2+'),"—")');
    var cf3 = scoreColor(knownScore||0);
    sc(qCell2, cf3.bg, cf3.fg, true, 10); bd(qCell2);
  });

  // Named range สำหรับ VLOOKUP จากภายนอก
  // col B=ชื่อ, col Q=คะแนนล่าสุด → ทุก Sheet ทำ VLOOKUP(name, ALL_SCORES, 16, 0)
  var totalRows = mentList.length + NON_MENTOR_MEMBERS.length + 5;
  var namedRange = ws.getRange(5, 3, totalRows, 15); // C ถึง Q

  // Freeze
  ws.setFrozenRows(4);
  ws.setFrozenColumns(4);

  Logger.log('✅ ALL SCORES sheet built — ' +
             mentList.length + ' mentored + ' +
             NON_MENTOR_MEMBERS.length + ' non-mentor');

  return { mentCount: mentList.length, nmCount: NON_MENTOR_MEMBERS.length };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 2: อัปเดต รายชื่อทั้งหมด col E ให้ดึงจาก ALL SCORES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function updateMasterSheetLookups(ss) {
  var master = ss.getSheetByName('รายชื่อทั้งหมด');
  if (!master) { Logger.log('ไม่พบ รายชื่อทั้งหมด'); return 0; }

  var lastRow = master.getLastRow();
  var updated = 0;

  for (var r = 3; r <= lastRow; r++) {
    var name = master.getRange(r, 2).getDisplayValue().trim();
    if (!name || name === '') continue;

    // col E = คะแนนล่าสุด — เปลี่ยนเป็น VLOOKUP จาก ALL SCORES
    var cell = master.getRange(r, 5);
    cell.setFormula(
      '=IFERROR(VLOOKUP(B'+r+',\'📊 ALL SCORES\'!C:Q,15,0),"—")'
      // C:Q = 15 columns, col Q (ล่าสุด) = index 15
    );
    updated++;
  }

  Logger.log('✅ รายชื่อทั้งหมด: updated ' + updated + ' rows');
  return updated;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 3: อัปเดต Dashboard col D ให้ดึงจาก ALL SCORES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function updateDashboardLookups(ss) {
  var dash = ss.getSheetByName('📊 DASHBOARD');
  if (!dash) { Logger.log('ไม่พบ DASHBOARD'); return 0; }

  var lastRow = dash.getLastRow();
  var updated = 0;

  for (var r = 4; r <= lastRow; r++) {
    // col B = ชื่อ (มาจาก Mentor Sheet formula)
    var nameCell = dash.getRange(r, 2);
    var name     = nameCell.getDisplayValue().trim();
    if (!name || name === '') continue;

    // col D = คะแนนล่าสุด
    var dCell = dash.getRange(r, 4);
    var curVal = dCell.getFormula() || dCell.getValue();

    // ถ้าเป็น formula ที่ดึงจาก Mentor Sheet (เช่น =TOOMTAM!Q4) → เปลี่ยน
    // ถ้าเป็น separator row (ค่าว่าง) → ข้าม
    if (String(curVal).indexOf('!Q') >= 0 || String(curVal).indexOf('ALL SCORES') >= 0) {
      dCell.setFormula(
        '=IFERROR(VLOOKUP(B'+r+',\'📊 ALL SCORES\'!C:Q,15,0),"—")'
      );
      updated++;
    }
  }

  Logger.log('✅ DASHBOARD: updated ' + updated + ' rows');
  return updated;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function runScriptD() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ตรวจ Sheet ที่จำเป็น
  if (!ss.getSheetByName('📊 DASHBOARD') || !ss.getSheetByName('รายชื่อทั้งหมด')) {
    Browser.msgBox('⚠️ ไม่พบ Sheet ที่จำเป็น\nกรุณาตรวจสอบว่าเปิดไฟล์ Mentor & Mentee 2026 ถูกต้อง');
    return;
  }

  // Step 1
  var result   = buildAllScoresSheet(ss);
  // Step 2
  var mUpdated = updateMasterSheetLookups(ss);
  // Step 3
  var dUpdated = updateDashboardLookups(ss);

  Browser.msgBox(
    '✅ Script D เสร็จสมบูรณ์!\n\n' +
    '📊 Sheet "📊 ALL SCORES" — สร้างแล้ว\n' +
    '   • มี Mentor: ' + result.mentCount + ' คน (ดึงจาก Mentor Sheet อัตโนมัติ)\n' +
    '   • ไม่มี Mentor: ' + result.nmCount + ' คน (กรอกคะแนนเองในช่อง APR/MAY...)\n\n' +
    '📋 รายชื่อทั้งหมด: อัปเดต ' + mUpdated + ' แถว\n' +
    '📊 Dashboard: อัปเดต ' + dUpdated + ' แถว\n\n' +
    '⭐ ทุก Sheet ตอนนี้ดึงคะแนนจาก ALL SCORES\n' +
    '⚠️ กรอกคะแนนเดือนใหม่ของ Non-Mentor ใน\n' +
    '   Sheet "📊 ALL SCORES" ส่วนล่าง (สีเหลือง)'
  );
}

// onOpen อยู่ใน Coach.js (single source of truth) — ไม่ต้องซ้ำที่นี่
// ============================================================
// BNI IDEAL — Script A
// Fix: freeze columns conflict with merged cells
// ============================================================

const MENTOR_SHEETS_A  = ['TOOMTAM', 'Aof', 'Draft', 'PHAI', 'AMP'];
const DATA_START_ROW_A = 4;

const C = {
  NAVY:'1E2A3A', NAVYL:'2E4057',
  GREEN:'1A7A4A', GREENL:'E6F4EA',
  RED:'C0392B',  REDL:'FDECEA',
  YEL:'B7791F',  YELL:'FFF8E1',
  GRAY:'F4F4F4', GRAYD:'888888',
  WHITE:'FFFFFF', BLACK:'111111',
  TEAL:'117A65',  TEALL:'E8F8F5',
  ORANGE:'D35400',ORANGEL:'FEF5E7',
  BLACK_BG:'CCCCCC',
};

function styleCell(cell, opts) {
  if (!cell) return;
  cell.setBackground('#' + (opts.bg || C.WHITE))
      .setFontColor('#' + (opts.fg || C.BLACK))
      .setFontWeight(opts.bold ? 'bold' : 'normal')
      .setFontStyle(opts.italic ? 'italic' : 'normal')
      .setFontSize(opts.sz || 10)
      .setHorizontalAlignment((opts.align || 'center').toLowerCase())
      .setVerticalAlignment('middle')
      .setWrap(opts.wrap !== false);
}

function addBorder(range) {
  if (!range) return;
  range.setBorder(true,true,true,true,false,false,
    '#CCCCCC', SpreadsheetApp.BorderStyle.SOLID);
}

function makeHdr(ws, row, col, text, bg, fg, sz) {
  var cell = ws.getRange(row, col);
  cell.setValue(text);
  styleCell(cell, {bg:bg, fg:fg||C.WHITE, bold:true, sz:sz||10});
  addBorder(cell);
}

// merge + setValue + style ในครั้งเดียว
function mergeStyle(ws, a1, text, opts) {
  var range = ws.getRange(a1);
  range.merge().setValue(text);
  styleCell(range, opts);
  return range;
}

function scoreColor(score) {
  var s = parseFloat(score);
  if (isNaN(s)||s===0) return {bg:C.GRAY,     fg:C.GRAYD};
  if (s >= 70)         return {bg:C.GREENL,   fg:C.GREEN};
  if (s >= 50)         return {bg:C.YELL,     fg:C.YEL};
  if (s >= 30)         return {bg:C.REDL,     fg:C.RED};
  return                      {bg:C.BLACK_BG, fg:C.BLACK};
}

function collectNonMentorMembers(ss) {
  var masterSheet = ss.getSheetByName('รายชื่อทั้งหมด');
  if (!masterSheet) return [];

  var mentoredNames = {};
  MENTOR_SHEETS_A.forEach(function(shName) {
    var sh = ss.getSheetByName(shName);
    if (!sh) return;
    var lastRow = sh.getLastRow();
    for (var r = DATA_START_ROW_A; r <= lastRow; r++) {
      var disp = sh.getRange(r,3).getDisplayValue().trim();
      if (disp) mentoredNames[disp] = true;
    }
  });

  var results = [];
  var lastRow = masterSheet.getLastRow();
  for (var r = 3; r <= lastRow; r++) {
    var name   = masterSheet.getRange(r,2).getDisplayValue().trim();
    var nick   = masterSheet.getRange(r,3).getDisplayValue().trim();
    var mentor = masterSheet.getRange(r,4).getDisplayValue().trim();
    var score  = parseFloat(masterSheet.getRange(r,5).getDisplayValue()) || 0;
    var given  = masterSheet.getRange(r,7).getValue() || 0;
    var recv   = masterSheet.getRange(r,8).getValue() || 0;
    if (!name) continue;
    if (mentor===''||mentor==='—'||mentor==='"—"') {
      results.push({name:name, nick:nick, score:score, given:given, recv:recv});
    }
  }
  results.sort(function(a,b){ return a.score - b.score; });
  return results;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sheet 1: 📥 UPDATE SCORES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildUpdateScoresSheet(ss) {
  var NAME = '📥 UPDATE SCORES';
  var old = ss.getSheetByName(NAME);
  if (old) ss.deleteSheet(old);

  var dash = ss.getSheetByName('📊 DASHBOARD');
  var idx  = dash ? dash.getIndex() : 1;
  var ws   = ss.insertSheet(NAME, idx);

  ws.setColumnWidth(1,18);
  ws.setColumnWidth(2,240);
  for (var c=3; c<=14; c++) ws.setColumnWidth(c,55);
  ws.setColumnWidth(15,20);

  ws.setRowHeight(1,42); ws.setRowHeight(2,18);
  ws.setRowHeight(3,70); ws.setRowHeight(4,28);
  ws.setRowHeight(5,22); ws.setRowHeight(6,22);
  ws.setRowHeight(7,22);

  mergeStyle(ws,'B1:N1',
    '📥  UPDATE SCORES — วางข้อมูล CSV จาก BNI ที่นี่ทุกเดือน',
    {bg:C.TEAL,fg:C.WHITE,bold:true,sz:13});

  mergeStyle(ws,'B2:N2',
    'Staging area — วาง CSV แล้วใช้เมนู "🔄 BNI Sync" → Sync คะแนนจาก CSV',
    {bg:C.TEAL,fg:C.WHITE,sz:9,italic:true});

  mergeStyle(ws,'B3:N3',
    '📌  วิธีอัปเดตทุกเดือน\n\n'+
    '1️⃣  Export Traffic Lights Evolution จาก BNI → CSV format\n'+
    '2️⃣  เปิดไฟล์ CSV → Select All (Ctrl+A) → Copy → คลิก Cell B7 → Paste Special → Values only\n'+
    '3️⃣  กดเมนู "🔄 BNI Sync" → "Sync คะแนนจาก CSV → Mentor Sheets"',
    {bg:C.TEALL,fg:C.BLACK,sz:10,align:'left'});
  addBorder(ws.getRange('B3:N3'));

  mergeStyle(ws,'B4:N4',
    '⚠️  Script อ่านคอลัมน์ขวาสุดที่มีข้อมูลเป็น "คะแนนล่าสุด" อัตโนมัติ — ไม่ต้องแก้ไขอะไรเพิ่ม',
    {bg:C.YELL,fg:C.YEL,sz:9,bold:true,align:'left'});
  addBorder(ws.getRange('B4:N4'));

  mergeStyle(ws,'B5:N5',
    '⬇️  วางข้อมูลจาก CSV ด้านล่างนี้ เริ่มจาก Cell B7 (รวม Header row ด้วย)',
    {bg:C.NAVY,fg:C.WHITE,sz:9,bold:true});

  mergeStyle(ws,'B6:N6',
    'ข้อมูลด้านล่างจะถูก overwrite เมื่อ Paste CSV ใหม่ทุกเดือน',
    {bg:C.NAVYL,fg:C.WHITE,sz:8,italic:true});

  // Row 7: CSV headers
  var csvHdrs = ['Member','04/25','05/25','06/25','07/25','08/25',
                 '09/25','10/25','11/25','12/25','01/26','02/26','03/26'];
  for (var i=0; i<csvHdrs.length; i++) {
    makeHdr(ws,7,i+2,csvHdrs[i],C.NAVYL,C.WHITE,9);
  }

  // FIX: freeze rows เท่านั้น ไม่ freeze columns
  // (merged cells B1:N1 ขัดกับ setFrozenColumns)
  ws.setFrozenRows(7);
  ws.getRange(7,2,1,13).createFilter();

  Logger.log('✅ Sheet "'+NAME+'" สร้างเสร็จ');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sheet 2: 👀 NON-MENTOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildNonMentorSheet(ss) {
  var NAME = '👀 NON-MENTOR';
  var old = ss.getSheetByName(NAME);
  if (old) ss.deleteSheet(old);

  var upd = ss.getSheetByName('📥 UPDATE SCORES');
  var idx = upd ? upd.getIndex() : 2;
  var ws  = ss.insertSheet(NAME, idx);

  ws.setColumnWidth(1,18);  // A spacer
  ws.setColumnWidth(2,8);   // B #
  ws.setColumnWidth(3,220); // C ชื่อ
  ws.setColumnWidth(4,80);  // D ชื่อเล่น
  ws.setColumnWidth(5,75);  // E คะแนน
  ws.setColumnWidth(6,100); // F สี
  ws.setColumnWidth(7,120); // G Given
  ws.setColumnWidth(8,120); // H Received
  ws.setColumnWidth(9,110); // I Balance
  ws.setColumnWidth(10,150);// J Action
  ws.setColumnWidth(11,18); // K spacer

  ws.setRowHeight(1,42); ws.setRowHeight(2,18);
  ws.setRowHeight(3,28); ws.setRowHeight(4,26);

  // Title rows — merge B:J เท่านั้น (ไม่เกิน lastCol)
  mergeStyle(ws,'B1:J1',
    '👀  NON-MENTOR MEMBERS — สมาชิกที่ยังไม่มี Mentor ดูแล  |  BNI IDEAL 2026',
    {bg:C.ORANGE,fg:C.WHITE,bold:true,sz:13});

  mergeStyle(ws,'B2:J2',
    'คะแนนดึงจาก Sheet รายชื่อทั้งหมด อัตโนมัติ  |  Run Script A อีกครั้งเพื่อ refresh',
    {bg:C.ORANGE,fg:C.WHITE,sz:9,italic:true});

  // Row 3: badges (แต่ละ cell แยก — ไม่ merge)
  var members = collectNonMentorMembers(ss);
  var gn=0,yn=0,rn=0,bn=0;
  members.forEach(function(m){
    if(m.score>=70)      gn++;
    else if(m.score>=50) yn++;
    else if(m.score>=30) rn++;
    else                 bn++;
  });

  var badges = [
    {col:2, text:'ทั้งหมด '+members.length+' คน', bg:C.NAVYL,   fg:C.WHITE},
    {col:4, text:'เขียว '+gn+' คน',               bg:C.GREENL,  fg:C.GREEN},
    {col:6, text:'เหลือง '+yn+' คน',              bg:C.YELL,    fg:C.YEL},
    {col:8, text:'แดง '+rn+' คน',                 bg:C.REDL,    fg:C.RED},
    {col:10,text:'ดำ '+bn+' คน',                  bg:C.BLACK_BG,fg:C.BLACK},
  ];
  badges.forEach(function(b){
    var cell = ws.getRange(3,b.col);
    cell.setValue(b.text);
    styleCell(cell,{bg:b.bg,fg:b.fg,bold:true,sz:9});
    addBorder(cell);
  });

  // Row 4: headers
  var hdrs = [
    {col:2,text:'#'},{col:3,text:'ชื่อ - นามสกุล'},
    {col:4,text:'ชื่อเล่น'},{col:5,text:'⭐ คะแนน'},
    {col:6,text:'🚦 สี TL'},{col:7,text:'💰 Given (฿)'},
    {col:8,text:'📥 Received (฿)'},{col:9,text:'⚖️ Balance'},
    {col:10,text:'💡 Action แนะนำ'},
  ];
  hdrs.forEach(function(h){ makeHdr(ws,4,h.col,h.text,C.NAVYL,C.WHITE,9); });

  // Data rows
  members.forEach(function(m,idx){
    var r   = 5+idx;
    var alt = (idx%2===0) ? C.GRAY : C.WHITE;
    ws.setRowHeight(r,22);

    var sc  = scoreColor(m.score);
    var tl  = m.score>=70 ? '🟢 เขียว'
            : m.score>=50 ? '🟡 เหลือง'
            : m.score>=30 ? '🔴 แดง'
            : m.score>0   ? '⚫ ดำ' : '— ไม่มีข้อมูล';

    var bal = (!m.given&&!m.recv)              ? '— ไม่มีข้อมูล'
            : (m.recv>0&&m.given/m.recv>2)     ? '🔼 ให้มากกว่ารับ'
            : (m.given>0&&m.recv/m.given>2)    ? '🔽 รับมากกว่าให้'
            : '✅ สมดุล';

    var act = m.score<30  ? '🚨 ด่วน — ตูมตามพิจารณา'
            : m.score<50  ? '⚠️ ควร Assign โดยเร็ว'
            : m.score<70  ? '📋 Assign Mentor ได้เลย'
            : '✅ Assign เมื่อสะดวก';

    var aBg = m.score<70 ? C.ORANGEL : C.GREENL;
    var aFg = m.score<70 ? C.ORANGE  : C.GREEN;

    [
      {col:2, val:idx+1,    bg:alt,   fg:C.GRAYD,  bold:false, al:'center', fmt:null},
      {col:3, val:m.name,   bg:alt,   fg:C.BLACK,  bold:true,  al:'left',   fmt:null},
      {col:4, val:m.nick,   bg:alt,   fg:C.BLACK,  bold:false, al:'center', fmt:null},
      {col:5, val:m.score||'—', bg:sc.bg,fg:sc.fg, bold:true,  al:'center', fmt:null},
      {col:6, val:tl,       bg:sc.bg, fg:sc.fg,    bold:true,  al:'center', fmt:null},
      {col:7, val:m.given,  bg:alt,   fg:C.BLACK,  bold:false, al:'right',  fmt:'#,##0'},
      {col:8, val:m.recv,   bg:alt,   fg:C.BLACK,  bold:false, al:'right',  fmt:'#,##0'},
      {col:9, val:bal,      bg:alt,   fg:C.BLACK,  bold:false, al:'left',   fmt:null},
      {col:10,val:act,      bg:aBg,   fg:aFg,      bold:true,  al:'left',   fmt:null},
    ].forEach(function(d){
      var cell = ws.getRange(r,d.col);
      cell.setValue(d.val);
      styleCell(cell,{bg:d.bg,fg:d.fg,bold:d.bold,sz:9,align:d.al});
      if(d.fmt) cell.setNumberFormat(d.fmt);
      addBorder(cell);
    });
  });

  // FIX: freeze rows เท่านั้น
  // ไม่ใช้ setFrozenColumns เพราะ merged cells B1:J1 ขัดกัน
  ws.setFrozenRows(4);
  if(members.length>0) ws.getRange(4,2,1,9).createFilter();

  Logger.log('✅ Sheet "'+NAME+'" สร้างเสร็จ — '+members.length+' คน');
  return members.length;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function runScriptA() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var required = ['📊 DASHBOARD','รายชื่อทั้งหมด'];
  for (var i=0; i<required.length; i++) {
    if (!ss.getSheetByName(required[i])) {
      SpreadsheetApp.getUi().alert(
        '⚠️ ไม่พบ Sheet "'+required[i]+'"\nกรุณาตรวจสอบว่าเปิดไฟล์ Mentor & Mentee 2026 ถูกต้อง');
      return;
    }
  }

  buildUpdateScoresSheet(ss);
  var count = buildNonMentorSheet(ss);

  SpreadsheetApp.getUi().alert(
    '✅ Script A เสร็จสมบูรณ์!\n\n'+
    '📥 Sheet "📥 UPDATE SCORES" — สร้างแล้ว\n'+
    '👀 Sheet "👀 NON-MENTOR" — สร้างแล้ว ('+count+' คน)\n\n'+
    'ข้อมูลเดิมใน Sheet อื่นทั้งหมดไม่ถูกแตะเลย ✅');
}


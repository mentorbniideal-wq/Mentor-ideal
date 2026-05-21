// ============================================================
// BNI IDEAL — Script J : 1-Click CSV Importer  (v2.8)
//
// 2 แหล่งข้อมูล:
// 1. Traffic Lights CSV  → UPDATE SCORES → Mentor Sheets + Given/Received (อัตโนมัติ)
// 2. Reporting2You CSV  → Sheet Reporting2You + REPORTING2YOU_SYNC
//
// วิธีใช้: เมนู "🔄 BNI Sync" → "📁 1-Click Import (CSV)"
// ============================================================

var R2Y_HEADERS = [
  'Member','RG','RR','Visi.','121','CEU','TYFCB','Points',
  'BNI Days','P','A','L','M','S','Email','Phone'
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN: เปิดหน้า Import Dialog
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function openImportDialog() {
  var html = HtmlService.createHtmlOutput(getImportDialogHTML())
    .setWidth(480).setHeight(580)
    .setTitle('📁 1-Click CSV Importer');
  SpreadsheetApp.getUi().showModalDialog(html, '📁 1-Click CSV Importer');
}

function getImportDialogHTML() {
  return '<!DOCTYPE html><html><head>' +
  '<meta charset="UTF-8">' +
  '<style>' +
  'body{font-family:Sarabun,sans-serif;padding:16px;background:#0F1923;color:#F8FAFC;font-size:14px;}' +
  'h2{font-size:16px;margin-bottom:4px;color:#F0B429;}' +
  '.sub{color:#64748B;font-size:12px;margin-bottom:16px;}' +
  '.section{background:#1A2535;border-radius:10px;padding:12px;margin-bottom:12px;border:1px solid rgba(255,255,255,0.07);}' +
  '.section-title{font-size:12px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;}' +
  '.required{color:#EF4444;font-size:10px;margin-left:4px;}' +
  '.optional{color:#F0B429;font-size:10px;margin-left:4px;}' +
  'label{font-size:13px;display:block;margin-bottom:4px;}' +
  'input[type=file]{width:100%;background:#243347;border:1px dashed rgba(240,180,41,.4);border-radius:8px;padding:8px;color:#F8FAFC;font-size:12px;box-sizing:border-box;}' +
  '.note{font-size:11px;color:#64748B;margin-top:4px;}' +
  '.badge{display:inline-block;background:rgba(16,185,129,.15);color:#10B981;font-size:10px;padding:2px 6px;border-radius:4px;margin-top:4px;}' +
  '.btn{width:100%;background:#F0B429;color:#0F1923;border:none;border-radius:10px;padding:12px;font-size:15px;font-weight:700;cursor:pointer;margin-top:4px;font-family:Sarabun,sans-serif;}' +
  '.btn:active{opacity:.9;}' +
  '.progress{display:none;background:#1A2535;border-radius:8px;padding:10px 12px;margin-top:8px;}' +
  '.step{padding:3px 0;font-size:12px;color:#94A3B8;}' +
  '.step.done{color:#10B981;}' +
  '.step.active{color:#F0B429;}' +
  '.step.error{color:#EF4444;}' +
  '.step.skip{color:#64748B;}' +
  '</style></head><body>' +
  '<h2>📁 1-Click CSV Importer</h2>' +
  '<p class="sub">อัปโหลด CSV แล้วกดปุ่มเดียว ระบบจัดการเองทั้งหมด</p>' +

  '<div class="section">' +
  '<div class="section-title">1. Traffic Lights Evolution <span class="required">* จำเป็น</span></div>' +
  '<label>เลือกไฟล์ CSV จาก BNI Connect (ส่งทุกวันที่ 5)</label>' +
  '<input type="file" id="tl-file" accept=".csv">' +
  '<p class="note">BNI Connect → Traffic Lights → Export CSV</p>' +
  '<span class="badge">✅ รวม Given/Received อัตโนมัติ</span>' +
  '</div>' +

  '<div class="section">' +
  '<div class="section-title">2. Reporting2You <span class="optional">(ไม่บังคับ)</span></div>' +
  '<label>เลือกไฟล์ CSV Reporting2You</label>' +
  '<input type="file" id="r2y-file" accept=".csv">' +
  '<p class="note">BNI Connect → Reporting2You → Export CSV</p>' +
  '</div>' +

  '<button class="btn" onclick="startImport()">🚀 Import ทั้งหมดเลย</button>' +

  '<div class="progress" id="progress">' +
  '<div id="step1" class="step">⬜ อ่านและวิเคราะห์ไฟล์ Traffic Lights...</div>' +
  '<div id="step2" class="step">⬜ กระจายคะแนน → Mentor Sheets...</div>' +
  '<div id="step3" class="step">⬜ อัปเดต Non-Mentor...</div>' +
  '<div id="step4" class="step">⬜ Refresh Dashboard Counter...</div>' +
  '<div id="step5" class="step">⬜ Import Reporting2You...</div>' +
  '<div id="step6" class="step">⬜ Sync R2Y → Coaching Sheet...</div>' +
  '<div id="step7" class="step">⬜ Renewal Status...</div>' +
  '<div id="step8" class="step">⬜ อัปเดต Given/Received...</div>' +
  '</div>' +

  '<script>' +
  'function startImport() {' +
  '  var tlFile = document.getElementById("tl-file").files[0];' +
  '  if (!tlFile) { alert("กรุณาเลือกไฟล์ Traffic Lights ก่อนครับ"); return; }' +
  '  document.getElementById("progress").style.display="block";' +
  '  document.querySelector(".btn").disabled=true;' +
  '  readFile(tlFile, function(tlCsv) {' +
  '    setStep(1,"done"); setStep(2,"active");' +
  '    var r2yFile = document.getElementById("r2y-file").files[0];' +
  '    readFile(r2yFile, function(r2yCsv) {' +
  '      google.script.run' +
  '        .withSuccessHandler(function(r) { onDone(r, !!r2yCsv); })' +
  '        .withFailureHandler(function(e) {' +
  '          setStep(2,"error");' +
  '          document.querySelector(".btn").textContent = "❌ " + e.message;' +
  '          document.querySelector(".btn").disabled = false;' +
  '        })' +
  '        .runFullImport(tlCsv, r2yCsv||null);' +
  '    });' +
  '  });' +
  '}' +
  'function readFile(file, cb) {' +
  '  if (!file) { cb(null); return; }' +
  '  var r = new FileReader();' +
  '  r.onload = function(e) { cb(e.target.result); };' +
  '  r.readAsText(file, "UTF-8");' +
  '}' +
  'function onDone(r, hasR2Y) {' +
  '  setStep(2, r.ok        ? "done" : "error");' +
  '  setStep(3, r.nonMentorOk ? "done" : "error");' +
  '  setStep(4, r.counterOk   ? "done" : "error");' +
  '  setStep(5, r.r2yOk       ? "done" : (hasR2Y ? "error" : "skip"));' +
  '  setStep(6, r.r2ySyncOk   ? "done" : "error");' +
  '  setStep(7, r.renewalOk   ? "done" : "error");' +
  '  setStep(8, r.grOk        ? "done" : "error");' +
  '  var label = r.ok ? "✅ Import สำเร็จ!" : "⚠️ มีบางขั้นตอนผิดพลาด";' +
  '  if (r.grError) label += " (G/R: " + r.grError + ")";' +
  '  document.querySelector(".btn").textContent = label;' +
  '  document.querySelector(".btn").disabled = false;' +
  '}' +
  'function setStep(n, state) {' +
  '  var el = document.getElementById("step"+n);' +
  '  if (!el) return;' +
  '  var icons = {active:"⏳",done:"✅",error:"❌",skip:"⏭️"};' +
  '  el.className = "step "+state;' +
  '  el.textContent = el.textContent.replace(/^[\\u25a2\\u23f3\\u2705\\u274c\\u23ed] /, (icons[state]||"\\u25a2")+" ");' +
  '}' +
  '<\/script></body></html>';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// runFullImport — เรียกจาก Dialog
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function runFullImport(tlCsvString, r2yCsvString) {
  var result = {
    ok: false,
    nonMentorOk: false,
    counterOk:   false,
    r2yOk:       false,
    r2ySyncOk:   false,
    renewalOk:   false,
    grOk:        false
  };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ── Step 1: Parse TL CSV ───────────────────────────────────
    var tlRows = _parseCsv(tlCsvString);
    if (tlRows.length < 2) throw new Error('ไฟล์ Traffic Lights ว่างหรือไม่ถูกต้อง');

    // วาง CSV ลง UPDATE SCORES sheet (Script B จะอ่านจากนี้)
    var updateSh = ss.getSheetByName('📥 UPDATE SCORES');
    if (!updateSh) updateSh = ss.insertSheet('📥 UPDATE SCORES');
    var lastRow = updateSh.getLastRow();
    if (lastRow >= 7) {
      updateSh.getRange(7, 2, lastRow - 6, updateSh.getLastColumn() - 1).clearContent();
    }
    updateSh.getRange(7, 2, tlRows.length, tlRows[0].length).setValues(tlRows);

    // ── Step 2: Sync scores → Mentor Sheets ───────────────────
    syncScoresFromCSV();
    result.ok = true;

    // ── Step 3: Fix Non-Mentor ─────────────────────────────────
    try { fixNonMentorScores(); result.nonMentorOk = true; } catch(e) { Logger.log('NonMentor: '+e.message); }

    // ── Step 4: Refresh Counter ────────────────────────────────
    try { addSummaryCounter(); result.counterOk = true; } catch(e) { Logger.log('Counter: '+e.message); }

    // ── Step 5: Import Reporting2You CSV ──────────────────────
    if (r2yCsvString) {
      try { _importR2Y(ss, r2yCsvString); result.r2yOk = true; } catch(e) { Logger.log('R2Y import: '+e.message); }
    } else {
      result.r2yOk = true; // ไม่ได้ส่งมา = ผ่าน
    }

    // ── Step 6: Sync Reporting2You → REPORTING2YOU_SYNC ───────
    try { _syncR2YSilent(ss); result.r2ySyncOk = true; } catch(e) { Logger.log('R2Y sync: '+e.message); }

    // ── Step 7: Update Renewal Status ─────────────────────────
    try {
      if (typeof _updateAllRenewalStatus === 'function') _updateAllRenewalStatus(ss);
      result.renewalOk = true;
    } catch(e) { Logger.log('Renewal: '+e.message); }

    // ── Step 8: Extract Given/Received จาก TL file เดิม ───────
    // ไฟล์ Traffic Lights มีคอลัมน์ "Value of Business Given (Baht)" อยู่แล้ว
    try {
      _importGivenReceived(ss, tlRows);
      result.grOk = true;
    } catch(e) {
      Logger.log('G/R: '+e.message);
      result.grError = e.message;
    }

    // Timestamp
    var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    updateSh.getRange('B5').setValue('✅ Last Import: ' + ts)
      .setBackground('#E8F8F5').setFontColor('#117A65')
      .setFontWeight('bold').setFontSize(9);

    Logger.log('Full import done: ' + JSON.stringify(result));
  } catch(e) {
    result.error = e.message;
    Logger.log('Import failed: ' + e.message);
  }

  return result;
}

// ── Parse CSV string → 2D array ──────────────────────────────
function _parseCsv(csvString) {
  if (!csvString) return [];
  var rows  = [];
  var lines = csvString.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');

  lines.forEach(function(line) {
    if (!line.trim()) return;
    var row = [];
    var inQ = false, cell = '';
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') {
        if (inQ && line[i+1] === '"') { cell += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        row.push(cell.trim()); cell = '';
      } else {
        cell += ch;
      }
    }
    row.push(cell.trim());
    rows.push(row);
  });

  return rows;
}

// ── Import Reporting2You CSV → Sheet ─────────────────────────
function _importR2Y(ss, csvString) {
  var rows = _parseCsv(csvString);
  if (rows.length < 2) throw new Error('R2Y CSV ว่างหรือไม่ถูกต้อง');

  var sh = ss.getSheetByName('Reporting2You');
  if (!sh) sh = ss.insertSheet('Reporting2You');

  var headerRow = null;
  var dataStartIdx = 0;
  for (var i = 0; i < Math.min(5, rows.length); i++) {
    var row = rows[i].map(function(c){ return String(c||'').toLowerCase(); });
    if (row.indexOf('member') >= 0 || row.indexOf('rg') >= 0) {
      headerRow = rows[i];
      dataStartIdx = i;
      break;
    }
  }
  if (!headerRow) throw new Error('ไม่พบ header ใน R2Y CSV');

  var colMap = {};
  R2Y_HEADERS.forEach(function(h) {
    var idx = headerRow.findIndex(function(c){
      return String(c||'').toLowerCase() === h.toLowerCase();
    });
    if (idx >= 0) colMap[h] = idx;
  });

  var lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).clearContent();
  sh.getRange(1, 1, 1, R2Y_HEADERS.length).setValues([R2Y_HEADERS]);

  var writeRows = [];
  for (var r = dataStartIdx + 1; r < rows.length; r++) {
    var srcRow = rows[r];
    if (!srcRow || !srcRow.join('').trim()) continue;
    var destRow = R2Y_HEADERS.map(function(h) {
      var idx = colMap[h];
      var val = idx !== undefined ? (srcRow[idx] || '') : '';
      if (['RG','RR','Visi.','121','CEU','Points','BNI Days','P','A','L','M','S'].indexOf(h) >= 0) {
        var num = parseFloat(String(val).replace(/,/g,''));
        return isNaN(num) ? val : num;
      }
      if (h === 'TYFCB') {
        var num2 = parseFloat(String(val).replace(/[,฿$]/g,''));
        return isNaN(num2) ? val : num2;
      }
      return val;
    });
    writeRows.push(destRow);
  }

  if (writeRows.length > 0) {
    sh.getRange(2, 1, writeRows.length, R2Y_HEADERS.length).setValues(writeRows);
  }
  sh.getRange(1, 1, 1, R2Y_HEADERS.length)
    .setBackground('#1E2A3A').setFontColor('#F0B429').setFontWeight('bold');

  Logger.log('R2Y imported: ' + writeRows.length + ' rows');
  return writeRows.length;
}

// ── Sync Reporting2You → REPORTING2YOU_SYNC (silent, ไม่มี msgBox) ──
function _syncR2YSilent(ss) {
  var r2ySheet = ss.getSheetByName('Reporting2You');
  if (!r2ySheet) return 0;

  var syncSheet = ss.getSheetByName('REPORTING2YOU_SYNC');
  if (!syncSheet) syncSheet = createReporting2YouSyncSheet(ss);

  var r2yLastRow = r2ySheet.getLastRow();
  if (r2yLastRow < 2) return 0;

  // R2Y_HEADERS: Member,RG,RR,Visi.,121,CEU,TYFCB,Points,BNI Days,P,A,L,M,S,...
  // Index:          0    1  2   3    4   5    6     7      8       9 10 11 12
  var r2yData = r2ySheet.getRange(2, 1, r2yLastRow - 1, 13).getValues();
  var syncData = [];

  r2yData.forEach(function(row) {
    var memberName = String(row[0] || '').trim();
    if (!memberName) return;
    var cleanName = memberName.replace(/\s*\(BNI Ideal\)\s*$/i, '').trim();
    if (cleanName.length < 2) return;

    syncData.push([
      cleanName,
      parseFloat(row[1]) || 0,   // RG
      parseFloat(row[2]) || 0,   // RR
      parseFloat(row[5]) || 0,   // CEU (index 5)
      parseFloat(row[7]) || 0,   // Points (index 7)
      parseFloat(row[8]) || 0,   // BNI Days (index 8)
      parseFloat(row[9]) || 0,   // P (index 9)
      parseFloat(row[10]) || 0,  // A (index 10)
      parseFloat(row[11]) || 0,  // L (index 11)
      parseFloat(row[12]) || 0,  // M (index 12)
      parseFloat(row[4]) || 0    // 121 score (index 4)
    ]);
  });

  if (syncData.length === 0) return 0;

  var syncLastRow = syncSheet.getLastRow();
  if (syncLastRow > 1) syncSheet.getRange(2, 1, syncLastRow - 1, 11).clearContent();
  syncSheet.getRange(2, 1, syncData.length, 11).setValues(syncData);
  formatReporting2YouSyncSheet(syncSheet);

  var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  syncSheet.getRange(1, 12).setValue('Last Sync: ' + ts)
    .setFontSize(8).setFontColor('#666666').setFontStyle('italic');

  Logger.log('R2Y sync: ' + syncData.length + ' rows');
  return syncData.length;
}

// ── Import Given/Received จาก TL rows (2D array ที่ parse แล้ว) ──
// ไฟล์ Traffic Lights มีคอลัมน์:
//   "Name -Surname", "Value of Business Given (Baht)", "Value of Business Received (Baht)"
function _importGivenReceived(ss, csvRows) {
  if (!csvRows || csvRows.length < 2) throw new Error('ไม่มีข้อมูล TL rows');

  // หา header row (ตรวจ 5 แถวแรก)
  var headerRow = null;
  var dataStartIdx = 0;
  for (var i = 0; i < Math.min(5, csvRows.length); i++) {
    var r = csvRows[i].map(function(c){ return String(c||'').toLowerCase().trim(); });
    // header row ของ TL มี "name" หรือ "no" หรือ "chapter"
    if (r.indexOf('no') >= 0 || r.some(function(c){ return c.indexOf('name') >= 0 || c === 'chapter'; })) {
      headerRow = csvRows[i];
      dataStartIdx = i;
      break;
    }
  }
  if (!headerRow) throw new Error('ไม่พบ header row ใน TL CSV');

  var headers = headerRow.map(function(h){ return String(h||'').toLowerCase().trim(); });

  // หาคอลัมน์ชื่อ
  var nameIdx = _findColIdx(headers, ['name -surname','name-surname','name','member name','member','ชื่อ-นามสกุล','ชื่อ']);
  if (nameIdx < 0) nameIdx = _findColPartial(headers, 'name');
  if (nameIdx < 0) nameIdx = 2; // fallback: col 3 (index 2)

  // หาคอลัมน์ Given
  var givenIdx = _findColIdx(headers, [
    'value of business given (baht)',
    'value of business given',
    'given (baht)',
    'given',
    'tyfcb given',
    'business given'
  ]);
  if (givenIdx < 0) givenIdx = _findColPartial(headers, 'given');
  if (givenIdx < 0) throw new Error('ไม่พบคอลัมน์ "Value of Business Given" ใน TL CSV\nHeaders ที่พบ: ' + headers.slice(0,8).join(', '));

  // หาคอลัมน์ Received
  var recvIdx = _findColIdx(headers, [
    'value of business received (baht)',
    'value of business received',
    'received (baht)',
    'received',
    'tyfcb received',
    'business received'
  ]);
  if (recvIdx < 0) recvIdx = _findColPartial(headers, 'receiv');
  if (recvIdx < 0) throw new Error('ไม่พบคอลัมน์ "Value of Business Received" ใน TL CSV');

  Logger.log('G/R columns — name:' + nameIdx + ' given:' + givenIdx + ' received:' + recvIdx);

  // Build lookup map (key = lowercase name)
  var grMap = {};
  for (var ri = dataStartIdx + 1; ri < csvRows.length; ri++) {
    var row = csvRows[ri];
    if (!row || !row.join('').trim()) continue;
    var memberName = String(row[nameIdx]||'').trim();
    // ข้ามแถว header ซ้ำ หรือแถวรวม
    if (!memberName || memberName.length < 2 || memberName.toLowerCase() === 'name -surname') continue;
    var given = _parseNum(row[givenIdx]);
    var recv  = _parseNum(row[recvIdx]);
    grMap[memberName.toLowerCase()] = { given: given, recv: recv };
  }

  if (Object.keys(grMap).length === 0) throw new Error('ไม่มีข้อมูล Given/Received ในไฟล์');

  // Fuzzy match: ชื่อเต็ม → exact → partial
  function findGR(name) {
    if (!name) return null;
    var key = name.trim().replace(/\s+/g,' ').toLowerCase();
    if (grMap[key]) return grMap[key];
    var keys = Object.keys(grMap);
    for (var k = 0; k < keys.length; k++) {
      if (keys[k] === key) return grMap[keys[k]];
    }
    for (var k2 = 0; k2 < keys.length; k2++) {
      if (keys[k2].indexOf(key) >= 0 || key.indexOf(keys[k2]) >= 0) return grMap[keys[k2]];
    }
    return null;
  }

  var updated = 0;
  var skipped = [];

  // 1. Mentor Sheets — col C(3)=name, T(20)=Given, U(21)=Received, V(22)=Balance
  ['TOOMTAM','Aof','Draft','PHAI','AMP'].forEach(function(shName) {
    var sh = ss.getSheetByName(shName);
    if (!sh) return;
    var names = sh.getRange(4, 3, 8, 1).getValues();
    names.forEach(function(nameRow, idx) {
      var name = String(nameRow[0]||'').trim();
      if (!name) return;
      var d = findGR(name);
      if (!d) { skipped.push(name + ' [' + shName + ']'); return; }
      sh.getRange(4 + idx, 20, 1, 3).setValues([[d.given, d.recv, d.given - d.recv]]);
      updated++;
    });
  });

  // 2. รายชื่อทั้งหมด — col B(2)=name, startRow=3, G(7)=Given, H(8)=Received, I(9)=Balance
  _updateSheetGR(ss, 'รายชื่อทั้งหมด', 2, 3, 7, 8, 9, findGR);

  // 3. NON-MENTOR — same layout
  _updateSheetGR(ss, '👀 NON-MENTOR', 2, 3, 7, 8, 9, findGR);

  Logger.log('G/R updated: ' + updated + ', skipped: ' + skipped.length);
  return { updated: updated, skipped: skipped };
}

function _updateSheetGR(ss, shName, nameCol, startRow, givenCol, recvCol, balCol, findFn) {
  var sh = ss.getSheetByName(shName);
  if (!sh) return;
  var last = sh.getLastRow();
  if (last < startRow) return;
  var names = sh.getRange(startRow, nameCol, last - startRow + 1, 1).getValues();
  names.forEach(function(row, i) {
    var name = String(row[0]||'').trim();
    if (!name) return;
    var d = findFn(name);
    if (!d) return;
    var rowNum = startRow + i;
    sh.getRange(rowNum, givenCol).setValue(d.given);
    sh.getRange(rowNum, recvCol).setValue(d.recv);
    if (balCol) sh.getRange(rowNum, balCol).setValue(d.given - d.recv);
  });
}

function _findColIdx(headers, candidates) {
  for (var c = 0; c < candidates.length; c++) {
    var idx = headers.indexOf(candidates[c]);
    if (idx >= 0) return idx;
  }
  return -1;
}

function _findColPartial(headers, keyword) {
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].indexOf(keyword) >= 0) return i;
  }
  return -1;
}

function _parseNum(val) {
  return parseFloat(String(val||'').replace(/[,฿$\s]/g,'')) || 0;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Import ผ่าน Paste (แบบเดิม — รัน Pipeline จากข้อมูลที่ Paste แล้ว)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function oneClickSyncFromPaste() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var steps = [];
  var errors = [];

  try { syncScoresFromCSV();     steps.push('✅ Sync Mentor Sheets'); } catch(e) { errors.push('❌ Sync: '+e.message); }
  try { fixNonMentorScores();    steps.push('✅ Fix Non-Mentor');      } catch(e) { errors.push('❌ Non-Mentor: '+e.message); }
  try { addSummaryCounter();     steps.push('✅ Refresh Counter');     } catch(e) { errors.push('❌ Counter: '+e.message); }
  try { checkAndHighlight();     steps.push('✅ Highlight Check');     } catch(e) { errors.push('❌ Highlight: '+e.message); }
  try {
    if (typeof _updateAllRenewalStatus === 'function') {
      _updateAllRenewalStatus(ss);
      steps.push('✅ Renewal Status');
    }
  } catch(e) { errors.push('❌ Renewal: '+e.message); }
  try { _syncR2YSilent(ss); steps.push('✅ R2Y Sync'); } catch(e) { errors.push('❌ R2Y Sync: '+e.message); }

  var msg = '🚀 1-Click Sync เสร็จแล้ว!\n\n' + steps.join('\n');
  if (errors.length > 0) msg += '\n\n' + errors.join('\n');
  Browser.msgBox(msg);
}

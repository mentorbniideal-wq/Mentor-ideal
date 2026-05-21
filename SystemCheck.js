// ============================================================
// BNI IDEAL — System Check
// ตรวจสอบ Sheets, Config, APIs ทั้งหมดก่อนพัฒนาต่อ
// เมนู: BNI System → 🔍 ตรวจสอบระบบ (System Check)
// ============================================================

function runSystemCheck() {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var results = [];
  var counts  = { pass: 0, warn: 0, fail: 0 };

  function addResult(cat, item, status, detail) {
    results.push({ cat: cat, item: item, status: status, detail: detail || '' });
    counts[status]++;
  }
  var pass = function(c, i, d) { addResult(c, i, 'pass', d); };
  var warn = function(c, i, d) { addResult(c, i, 'warn', d); };
  var fail = function(c, i, d) { addResult(c, i, 'fail', d); };

  // ── [1] Core Data Sheets ──────────────────────────────────────
  var CAT1 = 'Core Data Sheets';

  var masterSh = ss.getSheetByName('รายชื่อทั้งหมด');
  if (!masterSh) {
    fail(CAT1, 'รายชื่อทั้งหมด', 'ไม่พบ Sheet — Dashboard และทุก API จะหยุดทำงาน');
  } else {
    var masterRows = masterSh.getLastRow();
    if (masterRows < 4) {
      warn(CAT1, 'รายชื่อทั้งหมด', 'มีแค่ ' + masterRows + ' rows — ควรมีข้อมูลสมาชิก 40+ คน');
    } else {
      var mSample = masterSh.getRange(3, 1, 1, 9).getValues()[0];
      var mName   = String(mSample[1] || '').trim();
      var mMentor = String(mSample[3] || '').trim();
      var mScore  = mSample[4];
      if (!mName) {
        warn(CAT1, 'รายชื่อทั้งหมด', 'Row 3 col B (ชื่อ) ว่าง — ตรวจสอบโครงสร้าง Sheet');
      } else {
        pass(CAT1, 'รายชื่อทั้งหมด',
          (masterRows - 2) + ' สมาชิก | ตัวอย่าง: "' + mName + '"' +
          ' | Mentor: ' + (mMentor || '—') +
          ' | คะแนน: ' + (mScore || '—'));
      }
    }
  }

  var r2ySh = ss.getSheetByName('Reporting2You');
  if (!r2ySh) {
    fail(CAT1, 'Reporting2You', 'ไม่พบ Sheet — ข้อมูล RG/RR/Visitor/Attendance/Contact จะหาย');
  } else {
    var r2yRows = r2ySh.getLastRow();
    if (r2yRows < 3) {
      warn(CAT1, 'Reporting2You', 'มีแค่ ' + r2yRows + ' rows — ข้อมูลอาจยังไม่ได้ Import');
    } else {
      var r2ySample = r2ySh.getRange(2, 1, 1, 16).getValues()[0];
      pass(CAT1, 'Reporting2You',
        (r2yRows - 1) + ' records | ตัวอย่าง: "' + String(r2ySample[0]).trim() + '"' +
        ' | RG=' + (r2ySample[1] || 0) + ' RR=' + (r2ySample[2] || 0) +
        ' Absent=' + (r2ySample[10] || 0));
    }
  }

  var dashSh = ss.getSheetByName('📊 DASHBOARD');
  if (!dashSh) {
    fail(CAT1, '📊 DASHBOARD', 'ไม่พบ Sheet — runScriptA() จะหยุดทำงาน');
  } else {
    pass(CAT1, '📊 DASHBOARD', 'พบ Sheet (' + (dashSh.getLastRow() - 1) + ' rows)');
  }

  // ── [2] Mentor Team Sheets ────────────────────────────────────
  var CAT2 = 'Mentor Team Sheets';
  var MENTOR_LIST = ['TOOMTAM', 'Aof', 'Draft', 'PHAI', 'AMP'];

  MENTOR_LIST.forEach(function(shName) {
    var sh = ss.getSheetByName(shName);
    if (!sh) {
      fail(CAT2, shName, 'ไม่พบ Sheet — MyTeam / Messages / Reports / Score History จะ error');
      return;
    }

    // Batch read rows 4–11, col C (name) to col P (score month 12)
    var data       = sh.getRange(4, 3, 8, 14).getValues();
    var memberCount = 0, withScore = 0, latestColLabel = '—';

    // หา column ล่าสุดที่มีคะแนน (col E=idx 2 ... col P=idx 13 ใน subarray)
    var latestIdx = -1;
    for (var c = 13; c >= 2; c--) {
      for (var r = 0; r < 8; r++) {
        if (parseFloat(data[r][c]) > 0) { latestIdx = c; break; }
      }
      if (latestIdx >= 0) break;
    }

    var MONTH_COL_LABEL = { 2:'APR',3:'MAY',4:'JUN',5:'JUL',6:'AUG',7:'SEP',
                            8:'OCT',9:'NOV',10:'DEC',11:'JAN',12:'FEB',13:'MAR' };
    if (latestIdx >= 0) latestColLabel = MONTH_COL_LABEL[latestIdx] || ('col+'+(latestIdx+3));

    data.forEach(function(row) {
      if (String(row[0] || '').trim()) {
        memberCount++;
        if (latestIdx >= 0 && parseFloat(row[latestIdx]) > 0) withScore++;
      }
    });

    if (memberCount === 0) {
      warn(CAT2, shName, 'Sheet พบแล้ว แต่ไม่มีสมาชิก (rows 4-11 ว่าง)');
    } else if (latestIdx < 0) {
      warn(CAT2, shName, memberCount + ' สมาชิก | ยังไม่มีคะแนนเลย — ต้อง Sync CSV ก่อน');
    } else {
      pass(CAT2, shName,
        memberCount + ' สมาชิก | มีคะแนน ' + withScore + '/' + memberCount + ' คน' +
        ' | เดือนล่าสุด: ' + latestColLabel);
    }
  });

  // ── [3] Feature / Optional Sheets ────────────────────────────
  var CAT3 = 'Feature Sheets';

  var renewSh = ss.getSheetByName('💳 RENEWAL');
  if (!renewSh) {
    fail(CAT3, '💳 RENEWAL', 'ไม่พบ Sheet — หน้า Renewal บน WebApp จะ error (ok:false)');
  } else {
    var renewRows = Math.max(0, renewSh.getLastRow() - 2);
    pass(CAT3, '💳 RENEWAL', renewRows + ' รายการ Renewal');
  }

  var nmSh = ss.getSheetByName('🆕 NEW MEMBERS');
  if (!nmSh) {
    fail(CAT3, '🆕 NEW MEMBERS', 'ไม่พบ Sheet — หน้า New Members บน WebApp จะ error');
  } else {
    var nmRows = nmSh.getLastRow();
    var nmCount = nmRows > 11 ? nmRows - 11 : 0;
    pass(CAT3, '🆕 NEW MEMBERS', nmCount > 0 ? nmCount + ' New Member(s) อยู่ในระบบ' : 'พบ Sheet (ยังไม่มีข้อมูล)');
  }

  var settingsSh = ss.getSheetByName('⚙️ SETTINGS');
  if (!settingsSh) {
    warn(CAT3, '⚙️ SETTINGS', 'ไม่พบ Sheet — Growth role จะใช้ PIN hardcode แทน (ใช้งานได้ปกติ)');
  } else {
    pass(CAT3, '⚙️ SETTINGS', 'พบ Sheet — Growth PIN จะอ่านจาก Sheet นี้');
  }

  // ── [4] Auto-created Sheets (สร้างเองได้) ─────────────────────
  var CAT4 = 'Auto Sheets';
  var autoList = [
    { name: '📥 UPDATE SCORES', desc: 'Staging CSV รายเดือน',     creator: 'runScriptA()' },
    { name: '👀 NON-MENTOR',    desc: 'สมาชิกที่ยังไม่มี Mentor', creator: 'runScriptA()' },
    { name: '📜 ACTION LOGS',   desc: 'Log การ Sync คะแนน',       creator: 'K.js (auto)' },
    { name: '📋 CHECKIN LOG',   desc: 'บันทึก Check-in รายวัน',   creator: 'CheckIn_System.js (auto)' },
    { name: 'REPORTING2YOU_SYNC', desc: 'Staging R2Y data',       creator: 'F.js (sync)' },
  ];
  autoList.forEach(function(s) {
    var sh = ss.getSheetByName(s.name);
    if (!sh) {
      warn(CAT4, s.name, 'ยังไม่มี (' + s.desc + ') — จะสร้างอัตโนมัติเมื่อรัน ' + s.creator);
    } else {
      pass(CAT4, s.name, s.desc + ' | ' + (sh.getLastRow()) + ' rows');
    }
  });

  // ── [5] Config Checks ─────────────────────────────────────────
  var CAT5 = 'Config & Credentials';

  // Line Notify Tokens
  try {
    var lineKeys       = ['MC_GROUP','TOOMTAM_GROUP','AOF_GROUP','DRAFT_GROUP','PHAI_GROUP','AMP_GROUP'];
    var unset          = lineKeys.filter(function(k) {
      return !LINE_TOKENS[k] || LINE_TOKENS[k].indexOf('YOUR_') === 0;
    });
    if (unset.length === 0) {
      pass(CAT5, 'Line Notify Tokens', 'ครบทุก ' + lineKeys.length + ' group token');
    } else {
      warn(CAT5, 'Line Notify Tokens', 'ยังเป็น placeholder: ' + unset.join(', ') + ' — แจ้งเตือน Line จะไม่ทำงาน');
    }
  } catch(e) {
    warn(CAT5, 'Line Notify Tokens', 'ไม่สามารถอ่าน LINE_TOKENS ได้: ' + e.message);
  }

  // NM Template File
  try {
    var tmplFile = DriveApp.getFileById(NM_TEMPLATE_ID);
    pass(CAT5, 'NM Template File (Drive)', 'เข้าถึงได้: "' + tmplFile.getName() + '"');
  } catch(e) {
    fail(CAT5, 'NM Template File (Drive)', 'เข้าถึงไม่ได้ (ID: ' + NM_TEMPLATE_ID + ') — apiAddNewMember() จะ error');
  }

  // NM Folder
  try {
    var nmFolder = DriveApp.getFolderById(NM_FOLDER_ID);
    pass(CAT5, 'NM Folder (Drive)', 'เข้าถึงได้: "' + nmFolder.getName() + '"');
  } catch(e) {
    fail(CAT5, 'NM Folder (Drive)', 'เข้าถึงไม่ได้ (ID: ' + NM_FOLDER_ID + ') — ไม่สามารถสร้างไฟล์ใหม่ได้');
  }

  // ── [6] API Smoke Tests ───────────────────────────────────────
  var CAT6 = 'API Smoke Tests';
  var apiTests = [
    { label: 'login (mc)',          payload: { action:'login', role:'mc', pin: PINS['mc'] } },
    { label: 'getDashboard',        payload: { action:'getDashboard', role:'mc' } },
    { label: 'getMyTeam (TOOMTAM)',  payload: { action:'getMyTeam', role:'toomtam' } },
    { label: 'getScorecard',        payload: { action:'getScorecard', role:'mc' } },
    { label: 'getRenewal',          payload: { action:'getRenewal', role:'mc' } },
    { label: 'getMessages',         payload: { action:'getMessages', role:'mc' } },
    { label: 'getMemberList',       payload: { action:'getMemberList', role:'mc' } },
    { label: 'getNewMembers',       payload: { action:'getNewMembers', role:'mc' } },
    { label: 'getGrowthData',       payload: { action:'getGrowthData', role:'growth' } },
    { label: 'getPowerTeams',       payload: { action:'getPowerTeams', role:'mc' } },
    { label: 'getCheckinLog',       payload: { action:'getCheckinLog', role:'mc' } },
  ];
  apiTests.forEach(function(t) {
    try {
      var res  = dispatch(t.payload);
      if (!res) {
        fail(CAT6, t.label, 'dispatch() คืนค่า null/undefined');
        return;
      }
      if (!res.ok) {
        fail(CAT6, t.label, 'ok:false — ' + (res.error || 'ไม่มีข้อความ error'));
        return;
      }
      // Summarise response size
      var detail = 'ok:true';
      if (Array.isArray(res.members))  detail += ' | members: '  + res.members.length;
      if (Array.isArray(res.items))    detail += ' | items: '    + res.items.length;
      if (Array.isArray(res.teams))    detail += ' | teams: '    + res.teams.length;
      if (Array.isArray(res.messages)) detail += ' | messages: ' + res.messages.length;
      if (Array.isArray(res.logs))     detail += ' | logs: '     + res.logs.length;
      if (res.summary) {
        detail += ' | 🟢' + (res.summary.green || 0) +
                  ' 🟡' + (res.summary.yellow || 0) +
                  ' 🔴' + (res.summary.red || 0) +
                  ' ⚫' + (res.summary.black || 0);
      }
      pass(CAT6, t.label, detail);
    } catch(e) {
      fail(CAT6, t.label, e.message);
    }
  });

  // ── [7] Data Integrity: MENTEE_MAP vs Master ──────────────────
  var CAT7 = 'Data Integrity';
  if (masterSh) {
    try {
      var masterData  = masterSh.getDataRange().getValues();
      var masterNames = {};
      for (var i = 2; i < masterData.length; i++) {
        var mn = String(masterData[i][1] || '').trim();
        if (mn) masterNames[mn] = true;
      }

      var mapKeys     = Object.keys(MENTEE_MAP);
      // คนที่อยู่ใน Map (ไม่ใช่ NONE) แต่ไม่พบใน Master
      var missingFromMaster = mapKeys.filter(function(n) {
        return MENTEE_MAP[n].sheet !== 'NONE' && !masterNames[n];
      });
      // คนที่อยู่ใน Master แต่ไม่มีใน Map เลย
      var missingFromMap = Object.keys(masterNames).filter(function(n) { return !MENTEE_MAP[n]; });

      if (missingFromMaster.length === 0) {
        pass(CAT7, 'MENTEE_MAP → รายชื่อทั้งหมด', 'สมาชิกใน Map ทุกคนพบใน Master (' + mapKeys.length + ' คน)');
      } else {
        warn(CAT7, 'MENTEE_MAP → รายชื่อทั้งหมด',
          'ไม่พบใน Master ' + missingFromMaster.length + ' คน: ' +
          missingFromMaster.slice(0, 4).join(', ') +
          (missingFromMaster.length > 4 ? '... (+' + (missingFromMaster.length - 4) + ')' : ''));
      }

      if (missingFromMap.length === 0) {
        pass(CAT7, 'รายชื่อทั้งหมด → MENTEE_MAP', 'สมาชิกทุกคนใน Master มีอยู่ใน Map');
      } else {
        warn(CAT7, 'รายชื่อทั้งหมด → MENTEE_MAP',
          'ไม่มีใน Map ' + missingFromMap.length + ' คน (อาจยังไม่ได้ Assign): ' +
          missingFromMap.slice(0, 4).join(', ') +
          (missingFromMap.length > 4 ? '... (+' + (missingFromMap.length - 4) + ')' : ''));
      }

      // Check Mentor sheet rows: ชื่อใน Map ตรงกับใน Mentor Sheet จริงไหม
      var rowMismatches = [];
      MENTOR_LIST.forEach(function(shName) {
        var sh = ss.getSheetByName(shName);
        if (!sh) return;
        for (var r = 4; r <= 11; r++) {
          var cellName = sh.getRange(r, 3).getDisplayValue().trim();
          if (!cellName) continue;
          var mapped = MENTEE_MAP[cellName];
          if (!mapped) {
            rowMismatches.push(shName + ' row' + r + ': "' + cellName + '" ไม่มีใน MENTEE_MAP');
          } else if (mapped.sheet !== shName || mapped.row !== r) {
            rowMismatches.push(shName + ' row' + r + ': "' + cellName +
              '" Map บอก ' + mapped.sheet + ' row' + mapped.row);
          }
        }
      });
      if (rowMismatches.length === 0) {
        pass(CAT7, 'Mentor Sheet rows vs MENTEE_MAP', 'ชื่อและ row ตรงกันทุกคน');
      } else {
        warn(CAT7, 'Mentor Sheet rows vs MENTEE_MAP',
          rowMismatches.length + ' ไม่ตรง: ' + rowMismatches.slice(0, 3).join(' | ') +
          (rowMismatches.length > 3 ? '...' : ''));
      }
    } catch(e) {
      warn(CAT7, 'Data Integrity Check', 'ตรวจสอบไม่ได้: ' + e.message);
    }
  } else {
    warn(CAT7, 'Data Integrity', 'ข้ามเพราะไม่มี Sheet รายชื่อทั้งหมด');
  }

  // ── Build Result Sheet ────────────────────────────────────────
  _buildCheckResultSheet(ss, results, counts);

  // Summary alert
  var icon = counts.fail > 0 ? '❌' : counts.warn > 0 ? '⚠️' : '✅';
  SpreadsheetApp.getUi().alert(
    icon + ' System Check เสร็จสิ้น\n\n' +
    '✅ ผ่าน  : ' + counts.pass + ' รายการ\n' +
    '⚠️ เตือน : ' + counts.warn + ' รายการ\n' +
    '❌ Error : ' + counts.fail + ' รายการ\n\n' +
    'ดูรายละเอียดทั้งหมดได้ที่ Sheet  "🔍 SYSTEM CHECK"'
  );
}

// ── Build nicely formatted result sheet ───────────────────────
function _buildCheckResultSheet(ss, results, counts) {
  var NAME = '🔍 SYSTEM CHECK';
  var old  = ss.getSheetByName(NAME);
  if (old) ss.deleteSheet(old);
  var ws   = ss.insertSheet(NAME, 0);

  ws.setColumnWidth(1, 18);
  ws.setColumnWidth(2, 180);
  ws.setColumnWidth(3, 230);
  ws.setColumnWidth(4, 95);
  ws.setColumnWidth(5, 430);
  ws.setColumnWidth(6, 18);

  // Row 1 — Title
  ws.setRowHeight(1, 50);
  var tz    = Session.getScriptTimeZone();
  var stamp = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');
  var titleRange = ws.getRange('B1:E1');
  titleRange.merge()
    .setValue('🔍  BNI IDEAL — System Check Report  |  ' + stamp)
    .setBackground('#1E2A3A').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(13)
    .setHorizontalAlignment('left').setVerticalAlignment('middle')
    .setWrap(false);

  // Row 2 — Summary badges
  ws.setRowHeight(2, 32);
  var total = counts.pass + counts.warn + counts.fail;
  var badges = [
    { col:2, text:'✅ ผ่าน: ' + counts.pass,   bg:'#E6F4EA', fg:'#1A7A4A' },
    { col:3, text:'⚠️ เตือน: ' + counts.warn,  bg:'#FFF8E1', fg:'#B7791F' },
    { col:4, text:'❌ Error: ' + counts.fail,   bg:'#FDECEA', fg:'#C0392B' },
    { col:5, text:'รวม ' + total + ' รายการ — รัน: ' + stamp, bg:'#E8F8F5', fg:'#117A65' },
  ];
  badges.forEach(function(b) {
    ws.getRange(2, b.col)
      .setValue(b.text)
      .setBackground(b.bg).setFontColor(b.fg).setFontWeight('bold').setFontSize(10)
      .setHorizontalAlignment('center').setVerticalAlignment('middle')
      .setBorder(true,true,true,true,false,false,'#CCCCCC',SpreadsheetApp.BorderStyle.SOLID);
  });

  // Row 3 — Column headers
  ws.setRowHeight(3, 26);
  ['หมวดหมู่','รายการ','สถานะ','รายละเอียด'].forEach(function(h, i) {
    ws.getRange(3, i + 2)
      .setValue(h)
      .setBackground('#2E4057').setFontColor('#FFFFFF')
      .setFontWeight('bold').setFontSize(9)
      .setHorizontalAlignment('center').setVerticalAlignment('middle')
      .setBorder(true,true,true,true,false,false,'#CCCCCC',SpreadsheetApp.BorderStyle.SOLID);
  });

  // Data rows
  var prevCat = '';
  var rowNum  = 4;

  results.forEach(function(r) {
    ws.setRowHeight(rowNum, 22);
    var isNewCat = r.cat !== prevCat;
    if (isNewCat) prevCat = r.cat;

    var statusIcon = r.status === 'pass' ? '✅ OK'
                   : r.status === 'warn' ? '⚠️ WARN'
                   : '❌ ERROR';
    var statusBg   = r.status === 'pass' ? '#E6F4EA' : r.status === 'warn' ? '#FFF8E1' : '#FDECEA';
    var statusFg   = r.status === 'pass' ? '#1A7A4A' : r.status === 'warn' ? '#B7791F' : '#C0392B';
    var rowBg      = r.status === 'pass' ? '#FFFFFF'  : r.status === 'warn' ? '#FFFDF0' : '#FFF5F5';
    var border     = '#CCCCCC';
    var bStyle     = SpreadsheetApp.BorderStyle.SOLID;

    // col B: category (แสดงเฉพาะแถวแรกของหมวด)
    ws.getRange(rowNum, 2)
      .setValue(isNewCat ? r.cat : '')
      .setBackground(isNewCat ? '#F0F0F0' : '#FAFAFA')
      .setFontWeight(isNewCat ? 'bold' : 'normal').setFontColor('#333333')
      .setFontSize(9).setHorizontalAlignment('left').setVerticalAlignment('middle')
      .setBorder(true,true,true,true,false,false,border,bStyle);

    // col C: item name
    ws.getRange(rowNum, 3)
      .setValue(r.item)
      .setBackground(rowBg).setFontColor('#111111')
      .setFontSize(9).setHorizontalAlignment('left').setVerticalAlignment('middle')
      .setBorder(true,true,true,true,false,false,border,bStyle);

    // col D: status badge
    ws.getRange(rowNum, 4)
      .setValue(statusIcon)
      .setBackground(statusBg).setFontColor(statusFg)
      .setFontWeight('bold').setFontSize(9)
      .setHorizontalAlignment('center').setVerticalAlignment('middle')
      .setBorder(true,true,true,true,false,false,border,bStyle);

    // col E: detail
    ws.getRange(rowNum, 5)
      .setValue(r.detail)
      .setBackground(rowBg).setFontColor('#444444')
      .setFontSize(9).setHorizontalAlignment('left').setVerticalAlignment('middle').setWrap(true)
      .setBorder(true,true,true,true,false,false,border,bStyle);

    rowNum++;
  });

  ws.setFrozenRows(3);
  ss.setActiveSheet(ws);
  Logger.log('System Check done — pass:' + counts.pass + ' warn:' + counts.warn + ' fail:' + counts.fail);
}

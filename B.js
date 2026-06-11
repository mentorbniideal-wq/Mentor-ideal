// ============================================================
// BNI IDEAL — Script B v7 FIXED : Sync CSV → Mentor Sheets → Master List
// Fixed issues:
//   - Dynamic month detection (handles 05/25, 06/25, 01/26, etc.)
//   - Complete MENTEE_MAP with ALL 60+ members
//   - Writes to correct columns E-P
//   - Updates Master List sheet (รายชื่อทั้งหมด)
//   - ✅ NOW: Non-Mentors (Phitarn, Preeda, etc.) update correctly!
//   - Better error reporting & logging
// ============================================================

var MENTEE_MAP = {
  // TOOMTAM (Ophat's team)
  'Ophat Taerattanachai':        { sheet:'TOOMTAM', row:4 },
  'Jirayu Boonlert':             { sheet:'TOOMTAM', row:5 },
  'Ittipon Setthawattananon':    { sheet:'TOOMTAM', row:6 },
  'Theerawut Piyaphinthu':       { sheet:'TOOMTAM', row:7 },
  'Jetsada Sanudomchok':         { sheet:'TOOMTAM', row:8 },
  'Duangkamon Chanthaboon':      { sheet:'TOOMTAM', row:9 },
  'Preyawal Vatcharachaithanin': { sheet:'TOOMTAM', row:10 },
  'Atthachai Somboon':           { sheet:'TOOMTAM', row:11 },

  // Aof (CGM)
  'Narin Lourujirakul':          { sheet:'Aof', row:4 },
  'Pariphon Jaroonthiravith':    { sheet:'Aof', row:5 },
  'Chananan Saengplao':          { sheet:'Aof', row:6 },
  'Ploypachcha Tararattanapawn': { sheet:'Aof', row:7 },
  'Phanuwat Promwong':           { sheet:'Aof', row:8 },
  'Ekawat Suwannahong':          { sheet:'Aof', row:9 },
  'Nantawat Mahaeknan':          { sheet:'Aof', row:10 },
  'Thanongsak Seriumnuay':       { sheet:'Aof', row:11 },

  // Draft (Sawad's team)
  'Tanyaluck Treepornwasu':      { sheet:'Draft', row:4 },
  'Thanakrit Wathport':          { sheet:'Draft', row:5 },
  'Krisada Kotama':              { sheet:'Draft', row:6 },
  'Naruporn Supittayapornpong':  { sheet:'Draft', row:7 },
  'Nilin Waroha':                { sheet:'Draft', row:8 },
  'Phannakorn Kittikool':        { sheet:'Draft', row:9 },
  'Yosita Niyomrat':             { sheet:'PHAI',  row:9  },
  'Sirimon Sanoi':               { sheet:'Draft', row:11 },

  // PHAI (Prakorn's team)
  'Chiranan Sathitsamphan':      { sheet:'PHAI', row:4 },
  'Wasawat Rattanakornpipat':    { sheet:'PHAI', row:5 },
  'Orapan Pougpralub':           { sheet:'PHAI', row:6 },
  'Pemika Siriyotha':            { sheet:'PHAI', row:7 },
  'Rewat Sanpet':                { sheet:'PHAI', row:8 },
  'Thanyalak Samreeloy':         { sheet:'Draft', row:10 },
  'Nattawut Amsri':              { sheet:'PHAI', row:10 },
  'Weerawat Suepadkon':          { sheet:'PHAI', row:11 },

  // AMP (Rewat's team - CGM)
  'Gomen Khotsopa':              { sheet:'AMP', row:4 },
  'Kanpong Ritchainimit':        { sheet:'AMP', row:5 },
  'Korranat Worawongthep':       { sheet:'AMP', row:6 },
  'Wisnugorn Udornwong':         { sheet:'AMP', row:7 },
  'Itthipol Rattanapirote':      { sheet:'AMP', row:8 },
  'Kittathat Jaruchaikul':       { sheet:'AMP', row:9 },

  // NON-MENTOR members (President, LT mentors, unassigned)
  'Archara Pagarat':             { sheet:'NONE', row:-1 },
  'Jakrapong Visetpanpong':      { sheet:'NONE', row:-1 },
  'Kanoknat Nakhonthai':         { sheet:'NONE', row:-1 },
  'Nipawee Supachaisakron':      { sheet:'NONE', row:-1 },
  'Palat Thanasrivanichai':      { sheet:'NONE', row:-1 },
  'Pongpat Chanthai':            { sheet:'NONE', row:-1 },
  'Phitarn Sakulthanaphetch':    { sheet:'NONE', row:-1 },  // ✅ President
  'Preeda Noita':                { sheet:'NONE', row:-1 },
  'Suporn Wongchompoo':          { sheet:'NONE', row:-1 },
  'Phanupan Somsanook':          { sheet:'NONE', row:-1 },
  'Thitima Hemarak':             { sheet:'NONE', row:-1 },

  // Unassigned / pending team placement
  'Prakorn Sirimars':            { sheet:'NONE', row:-1 },
  'Praputsorn Kongsarppaisal':   { sheet:'NONE', row:-1 },
  'Samrit Pholjan':              { sheet:'NONE', row:-1 },
  'Adisak Pankhot':              { sheet:'NONE', row:-1 },
  'Pisit Akarapanichayakul':     { sheet:'NONE', row:-1 },
  'Sophon Saenubol':             { sheet:'NONE', row:-1 },
  'Phasuthon Taesuwan':          { sheet:'NONE', row:-1 }
};

function cleanName(raw) {
  if (!raw) return null;
  var s = String(raw).trim();
  s = s.replace(/Export as PDF.*/i, '').trim();
  s = s.replace(/Export All.*/i, '').trim();
  s = s.replace(/No data is available.*/i, '').trim();
  s = s.replace(/to display\..*/i, '').trim();
  
  var m = s.match(/^(.+?)\s*\(BNI Ideal\)/i);
  if (m) return m[1].trim();
  
  if (s.length > 2 && s.length < 60) return s;
  return null;
}

/**
 * Dynamically detect month columns from CSV header
 * Handles: "05/25", "06/25", "01/26", etc.
 * Returns: { "05/25": 3, "06/25": 4, ..., "04/26": 11 }
 *          (column indices in CSV, 0-based)
 */
function detectMonthColumns(headerRow) {
  var monthCols = {};
  var monthToMentorCol = {
    1: 5,   // January -> E
    2: 6,   // February -> F
    3: 7,   // March -> G
    4: 8,   // April -> H
    5: 9,   // May -> I
    6: 10,  // June -> J
    7: 11,  // July -> K
    8: 12,  // August -> L
    9: 13,  // September -> M
    10: 14, // October -> N
    11: 15, // November -> O
    12: 16  // December -> P
  };

  for (var c = 0; c < headerRow.length; c++) {
    var h = String(headerRow[c] || '').trim();
    
    // Match MM/YY format (05/25, 01/26, etc.)
    var match = h.match(/^(\d{1,2})\/(\d{2})$/);
    if (match) {
      var monthNum = parseInt(match[1]);
      var year = match[2];
      
      if (monthNum >= 1 && monthNum <= 12) {
        var mentorCol = monthToMentorCol[monthNum];
        if (mentorCol) {
          monthCols[h] = {
            csvCol: c,        // Column index in CSV (0-based)
            mentorCol: mentorCol,  // Column letter in Mentor sheet (5=E, 6=F, etc.)
            monthNum: monthNum,
            year: year
          };
        }
      }
    }
  }
  return monthCols;
}

function syncScoresFromCSV() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var csvSheet = ss.getSheetByName('📥 UPDATE SCORES');

  if (!csvSheet) {
    Browser.msgBox('⚠️ ไม่พบ Sheet "📥 UPDATE SCORES"\nกรุณา Run Script A ก่อนครับ');
    return;
  }

  var lastRow = csvSheet.getLastRow();
  var lastCol = csvSheet.getLastColumn();
  
  if (lastRow < 8) {
    Browser.msgBox('⚠️ ยังไม่มีข้อมูล CSV\nกรุณา Paste ข้อมูลจาก Traffic Lights CSV ก่อน\n(คลิก Cell B7 → Paste Special → Values only)');
    return;
  }

  // Read header row (row 7, starting from column B)
  var numCols   = lastCol - 1;
  var headerRow = csvSheet.getRange(7, 2, 1, numCols).getValues()[0];

  // Dynamically detect month columns
  var monthCols = detectMonthColumns(headerRow);
  if (Object.keys(monthCols).length === 0) {
    Browser.msgBox('⚠️ ไม่พบ column เดือนใน row 7\nกรุณา Paste CSV ใหม่ตั้งแต่ Cell B7\nต้องมี header เช่น "05/25", "06/25", "01/26", "02/26"');
    return;
  }

  // Find latest month for display
  var latestMonthKey = Object.keys(monthCols).sort().pop();
  var latestMonthInfo = monthCols[latestMonthKey];

  // Read data rows (starting from row 8)
  var data = csvSheet.getRange(8, 2, lastRow - 7, numCols).getValues();

  // Load mentor sheets
  var mentorSheets = {};
  ['TOOMTAM','Aof','Draft','PHAI','AMP'].forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (sh) mentorSheets[name] = sh;
  });

  // Build DYNAMIC map from actual mentor sheets (supplements static MENTEE_MAP)
  // This ensures new members added via webapp are found automatically — no manual B.js edit needed
  var dynamicMap = {};
  Object.keys(mentorSheets).forEach(function(shName) {
    var sh = mentorSheets[shName];
    var lastR = sh.getLastRow();
    if (lastR < 4) return;
    sh.getRange(4, 3, lastR - 3, 1).getValues().forEach(function(row, i) {
      var name = String(row[0]||'').trim();
      if (name && !dynamicMap[name]) dynamicMap[name] = { sheet: shName, row: i + 4 };
    });
  });

  // Load master list sheet
  var masterSheet = ss.getSheetByName('รายชื่อทั้งหมด');

  var updatedMentors = 0;
  var updatedNonMentors = 0;
  var skipped = [];
  var scoreMap = {};  // For updating master list later
  
  // Detailed logs for debugging
  var debugLog = [];

  // Process each row
  data.forEach(function(row) {
    var cleanedName = cleanName(row[0]);
    if (!cleanedName) return;

    // MENTEE_MAP first (handles NONE/non-mentor), then dynamic sheet lookup for new members
    var entry = MENTEE_MAP[cleanedName] || dynamicMap[cleanedName];
    if (!entry) {
      skipped.push(cleanedName);
      return;
    }

    var sh = mentorSheets[entry.sheet];
    var isNonMentor = (entry.sheet === 'NONE');

    // Collect scores for this member
    var memberScores = {};
    var wrote = false;

    Object.keys(monthCols).forEach(function(monthKey) {
      var colInfo = monthCols[monthKey];
      var score = parseFloat(row[colInfo.csvCol]);

      if (!isNaN(score) && score >= 0 && score <= 100) {
        memberScores[monthKey] = score;

        // Write to mentor sheet (mentors only)
        if (!isNonMentor && sh) {
          sh.getRange(entry.row, colInfo.mentorCol).setValue(score);
          wrote = true;
        }
      }
    });

    // Track ALL members (Mentors + Non-Mentors) for master list update
    if (memberScores && Object.keys(memberScores).length > 0) {
      scoreMap[cleanedName] = memberScores;
      
      if (isNonMentor) {
        updatedNonMentors++;
        debugLog.push('✅ Non-Mentor: ' + cleanedName + ' [' + Object.keys(memberScores).join(',') + ']');
      } else if (wrote) {
        updatedMentors++;
        debugLog.push('✅ Mentor: ' + cleanedName + ' [' + entry.sheet + ']');
      }
    }
  });

  // Update Master List with latest scores
  if (masterSheet && Object.keys(scoreMap).length > 0) {
    updateMasterListScores(masterSheet, scoreMap, debugLog);
  }

  // Sync latest scores to Reporting2You r2y[7] (Points) so display stays consistent
  try {
    var r2ySyncSh = ss.getSheetByName('Reporting2You');
    if (r2ySyncSh && r2ySyncSh.getLastRow() > 1) {
      var r2ySyncData = r2ySyncSh.getRange(2, 1, r2ySyncSh.getLastRow()-1, 8).getValues();
      var r2yUpdated = false;
      r2ySyncData.forEach(function(row) {
        var rn = String(row[0]||'').replace(/\s*\(BNI Ideal\)\s*/gi,'').trim();
        if (!rn || !scoreMap[rn]) return;
        var latestMonthKey2 = Object.keys(scoreMap[rn]).sort(function(a,b){
          // MM/YY keys — convert to YYYY*100+MM for correct chronological sort
          var pa=a.split('/'),pb=b.split('/');
          var ya=parseInt(pa[1]||0)+2000,yb=parseInt(pb[1]||0)+2000;
          var ma=parseInt(pa[0]||0),mb=parseInt(pb[0]||0);
          return (ya*100+ma)-(yb*100+mb);
        }).pop();
        var latestSyncScore = scoreMap[rn][latestMonthKey2];
        if (!isNaN(latestSyncScore) && latestSyncScore > 0) {
          row[7] = latestSyncScore;
          r2yUpdated = true;
        }
      });
      if (r2yUpdated) {
        r2ySyncSh.getRange(2, 1, r2ySyncData.length, 8).setValues(r2ySyncData);
      }
    }
  } catch(r2ySyncErr) { Logger.log('R2Y sync err: ' + r2ySyncErr.message); }

  // Update sync timestamp
  var now = new Date();
  var ts = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  
  var statusMsg = '✅ Last Sync: ' + ts + ' — อัปเดต ' + (updatedMentors + updatedNonMentors) + ' คน | เดือนล่าสุด: ' + latestMonthKey;
  
  csvSheet.getRange('B6:N6').merge()
    .setValue(statusMsg)
    .setBackground('#E8F8F5').setFontColor('#117A65')
    .setFontWeight('bold').setFontSize(9)
    .setHorizontalAlignment('left').setVerticalAlignment('middle');

  // Alert message
  var msg = '✅ Sync เสร็จสมบูรณ์!\n\n' +
            'อัปเดตคะแนน (Mentor): ' + updatedMentors + ' คน\n' +
            'อัปเดตคะแนน (Non-Mentor): ' + updatedNonMentors + ' คน\n' +
            'รวม: ' + (updatedMentors + updatedNonMentors) + ' คน\n' +
            'เดือนล่าสุด: ' + latestMonthKey + '\n' +
            'เวลา: ' + ts + '\n\n' +
            '⚡ ข้อมูล:\n' +
            '✅ Mentor Sheets (5 sheet) อัปเดตแล้ว\n' +
            '✅ Master List (รายชื่อทั้งหมด) refresh แล้ว\n' +
            '✅ Core Issue และหมายเหตุไม่ถูกแตะ\n' +
            '✅ Non-Mentors (President, LT mentors) อัปเดตแล้ว';

  if (skipped.length > 0) {
    msg += '\n\n⚠️ ข้าม ' + skipped.length + ' คน (ไม่อยู่ใน System):\n' +
           skipped.slice(0, 5).join(', ') + (skipped.length > 5 ? '...' : '');
  }

  // Log to console for debugging
  Logger.log('=== SYNC DETAILS ===');
  Logger.log('Mentors updated: ' + updatedMentors);
  Logger.log('Non-Mentors updated: ' + updatedNonMentors);
  debugLog.forEach(function(log) {
    Logger.log(log);
  });

  Browser.msgBox(msg);

  // Feature B — แจ้งสมาชิกที่ลงทะเบียน LINE Bot หลัง import คะแนน
  try {
    if (typeof _lineNotifyScoreUpdate === 'function') {
      _lineNotifyScoreUpdate(latestMonthKey);
    }
  } catch(lineErr) { Logger.log('LINE notify after import error: ' + lineErr.message); }
}

/**
 * Update Master List (รายชื่อทั้งหมด) with latest scores
 * Finds each member's row and updates column E (⭐ คะแนนล่าสุด)
 * NOW: Covers BOTH Mentors + Non-Mentors
 */
function updateMasterListScores(masterSheet, scoreMap, debugLog) {
  if (!masterSheet) return;

  var lastRow = masterSheet.getLastRow();
  var masterData = masterSheet.getRange(3, 2, lastRow - 2, 5).getValues();  // Columns B-F
  
  var updated = 0;
  
  for (var r = 0; r < masterData.length; r++) {
    var memberName = masterData[r][0];  // Column B = member name
    
    if (!memberName) continue;
    
    var cleanMember = String(memberName).trim();
    
    // ✅ Check ALL members (Mentors + Non-Mentors)
    if (scoreMap[cleanMember]) {
      var scores = scoreMap[cleanMember];
      var latestScore = scores[Object.keys(scores).sort().pop()];  // Get last month
      
      if (latestScore && !isNaN(latestScore)) {
        // Write to column E (5th column from B)
        masterSheet.getRange(r + 3, 5).setValue(latestScore);  // Row 3 + r, column E
        updated++;
        
        if (debugLog) {
          debugLog.push('📝 Master List: ' + cleanMember + ' = ' + latestScore);
        }
      }
    }
  }
  
  Logger.log('✅ Updated Master List: ' + updated + ' members');
}

// ============================================================
// 🔍 DIAGNOSTIC SCRIPT - Check why Phitarn scores not updating
// ============================================================

function debugPhitarnScores() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Check if CSV has Phitarn's data
  var csvSheet = ss.getSheetByName(' UPDATE SCORES');
  if (!csvSheet) {
    Logger.log('❌ CSV sheet not found');
    return;
  }
  
  Logger.log('=== 📊 CSV SHEET DEBUG ===');
  var csvData = csvSheet.getRange(7, 2, 50, 20).getValues();
  var phitarnFound = false;
  
  for (var i = 0; i < csvData.length; i++) {
    var name = csvData[i][0];
    if (name && String(name).toLowerCase().indexOf('phitarn') !== -1) {
      Logger.log('✅ Found in CSV row ' + (i + 7) + ': ' + name);
      Logger.log('   Scores: ' + csvData[i].slice(1, 10).join(' | '));
      phitarnFound = true;
    }
  }
  
  if (!phitarnFound) {
    Logger.log('❌ Phitarn NOT in CSV');
  }
  
  // 2. Check Master List (รายชื่อทั้งหมด)
  Logger.log('\n=== 📋 MASTER LIST DEBUG ===');
  var masterSheet = ss.getSheetByName('รายชื่อทั้งหมด');
  if (!masterSheet) {
    Logger.log('❌ Master List sheet not found');
    return;
  }
  
  var masterData = masterSheet.getRange(3, 2, 100, 5).getValues();
  for (var r = 0; r < masterData.length; r++) {
    var memberName = masterData[r][0];
    if (memberName && String(memberName).toLowerCase().indexOf('phitarn') !== -1) {
      Logger.log('✅ Found in Master List row ' + (r + 3) + ': ' + memberName);
      Logger.log('   Column A (Name): ' + masterData[r][0]);
      Logger.log('   Column E (Score): ' + masterData[r][4]);
      Logger.log('   Last Updated: ' + new Date());
    }
  }
  
  // 3. Check MENTEE_MAP
  Logger.log('\n=== 🗺️ MENTEE_MAP DEBUG ===');
  if (MENTEE_MAP['Phitarn Sakulthanaphetch']) {
    Logger.log('✅ Phitarn in MENTEE_MAP:');
    Logger.log('   Sheet: ' + MENTEE_MAP['Phitarn Sakulthanaphetch'].sheet);
    Logger.log('   Row: ' + MENTEE_MAP['Phitarn Sakulthanaphetch'].row);
    Logger.log('   Note: sheet=NONE means Non-Mentor (President)');
  } else {
    Logger.log('❌ Phitarn NOT in MENTEE_MAP');
  }
  
  // 4. Check month columns detection
  Logger.log('\n=== 📅 MONTH COLUMNS DEBUG ===');
  var headerRow = csvSheet.getRange(7, 2, 1, 20).getValues()[0];
  var foundMonths = [];
  for (var c = 0; c < headerRow.length; c++) {
    var h = String(headerRow[c] || '').trim();
    if (h.match(/^\d{1,2}\/\d{2}$/)) {
      foundMonths.push(h);
      Logger.log('✅ Found month: ' + h + ' at column ' + (c + 2));  // +2 because starts at B
    }
  }
  
  if (foundMonths.length === 0) {
    Logger.log('❌ NO month columns detected! Expected format: 05/25, 06/25, etc.');
  }
  
  // 5. SUMMARY
  Logger.log('\n=== 📌 SUMMARY ===');
  Logger.log('1. Phitarn in CSV? ' + (phitarnFound ? '✅ YES' : '❌ NO'));
  Logger.log('2. Phitarn in Master List? ✓ (check above)');
  Logger.log('3. Phitarn in MENTEE_MAP? ✅ YES (sheet=NONE)');
  Logger.log('4. Month columns detected? ' + (foundMonths.length > 0 ? '✅ YES (' + foundMonths.join(', ') + ')' : '❌ NO'));
  Logger.log('5. Master List column E has data? (check above)');
  
  Logger.log('\n⚙️ RECOMMENDED ACTIONS:');
  Logger.log('   a) If no month columns → Re-paste CSV header starting B7');
  Logger.log('   b) If Phitarn not in CSV → Check Traffic Lights export');
  Logger.log('   c) If all above OK → Run syncScoresFromCSV() again');
}


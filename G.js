// ============================================================
// BNI IDEAL — Script G : Mentor Team Scorecard
//
// เพิ่ม Section ใหม่ใน Dashboard แสดง:
// • คะแนนเฉลี่ยแต่ละทีม เดือนนี้ vs เดือนที่แล้ว
// • จำนวนสมาชิกแดง/ดำ และดิ่งต่อเนื่อง
// • Grade ของ Mentor แต่ละคน (A/B/C/D)
//
// วิธีใช้: เมนู "🔄 BNI Sync" → "📈 Mentor Team Scorecard"
//          หรือ Run function: updateMentorScorecard
//
// ต้องเพิ่มใน onOpen() ใน Coach.gs ด้วย:
//   .addItem('📈 Mentor Team Scorecard', 'updateMentorScorecard')
// ============================================================

var MENTOR_CONFIG = {
  TOOMTAM: { name: 'TOOMTAM (ตูมตาม)', dashRows: [4,5,6,7,8,9,10,11] },
  Aof:     { name: 'Aof (อ็อฟ)',        dashRows: [12,13,14,15,16,17,18,19] },
  Draft:   { name: 'Draft (ดราฟ)',       dashRows: [21,22,23,24,25,26,27,28] },
  PHAI:    { name: 'PHAI (ไผ่)',          dashRows: [30,31,32,33,34,35,36,37] },
  AMP:     { name: 'AMP (แอมป์)',         dashRows: [38,39,40,41,42,43] }
};

// col ใน Mentor Sheet: E=5(JAN), F=6(FEB), G=7(MAR), H=8(APR)...
var SCORE_COL = { JAN:5, FEB:6, MAR:7, APR:8, MAY:9, JUN:10, JUL:11, AUG:12 };

// ── Helper: ดึงคะแนนรายทีมจาก Mentor Sheet ─────────────────
function getTeamScores(ss, sheetName, monthCol) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh) return [];
  var scores = [];
  for (var r = 4; r <= 11; r++) {
    var name  = sh.getRange(r, 3).getDisplayValue().trim();
    if (!name) continue;
    var score = parseFloat(sh.getRange(r, monthCol).getValue());
    if (!isNaN(score) && score > 0) scores.push(score);
  }
  return scores;
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce(function(a,b){ return a+b; }, 0) / arr.length;
}

// ── Grade ของทีม ─────────────────────────────────────────────
// A = avg ≥70, B = avg 60-69, C = avg 50-59, D = avg <50
// โดนปรับถ้ามีคนแดง/ดำเยอะ
function calcGrade(teamAvg, redBlkCount, totalCount, divingCount) {
  var score = teamAvg;
  // หักคะแนนตามสัดส่วนสมาชิกวิกฤต
  score -= (redBlkCount / Math.max(1, totalCount)) * 10;
  score -= divingCount * 2;

  if (score >= 68) return { grade:'A', color:'#1A7A4A', bg:'#E6F4EA', label:'ทีมแข็งแกร่ง' };
  if (score >= 58) return { grade:'B', color:'#1565C0', bg:'#EBF5FB', label:'ทีมดี มีจุดต้องดูแล' };
  if (score >= 48) return { grade:'C', color:'#B7791F', bg:'#FFF8E1', label:'ต้องเร่งพัฒนา' };
  return           { grade:'D', color:'#C0392B', bg:'#FDECEA', label:'ต้องการความช่วยเหลือด่วน' };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN: updateMentorScorecard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function updateMentorScorecard() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var dash = ss.getSheetByName('📊 DASHBOARD');
  if (!dash) { Browser.msgBox('ไม่พบ Sheet "📊 DASHBOARD"'); return; }

  // หาเดือนปัจจุบันและก่อนหน้าจาก Mentor Sheet
  // อ่านจาก TOOMTAM — หา col ล่าสุดที่มีข้อมูล
  var sampleSh = ss.getSheetByName('TOOMTAM');
  var thisMonthCol = 7; // MAR default
  var prevMonthCol = 6; // FEB default
  var thisMonthName = 'MAR';
  var prevMonthName = 'FEB';

  if (sampleSh) {
    // สแกนหา col ขวาสุดที่มีคะแนนใน row 4
    var colNames = ['','','','','JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG'];
    for (var c = 16; c >= 5; c--) {
      var v = sampleSh.getRange(4, c).getValue();
      if (v && parseFloat(v) > 0) {
        thisMonthCol  = c;
        prevMonthCol  = c > 5 ? c - 1 : 5;
        thisMonthName = colNames[c]  || ('M' + c);
        prevMonthName = colNames[prevMonthCol] || ('M' + prevMonthCol);
        break;
      }
    }
  }

  // ── คำนวณสถิติแต่ละทีม ─────────────────────────────────────
  var teamStats = {};
  Object.keys(MENTOR_CONFIG).forEach(function(key) {
    var cfg        = MENTOR_CONFIG[key];
    var thisScores = getTeamScores(ss, key, thisMonthCol);
    var prevScores = getTeamScores(ss, key, prevMonthCol);

    var thisAvg = avg(thisScores);
    var prevAvg = avg(prevScores);
    var diff    = thisAvg - prevAvg;

    // นับแดง/ดำ และดิ่ง จาก Dashboard
    var redBlk  = 0;
    var diving  = 0;
    cfg.dashRows.forEach(function(r) {
      var score = parseFloat(dash.getRange(r, 4).getValue());
      var trend = String(dash.getRange(r, 5).getValue() || '');
      if (!isNaN(score) && score > 0 && score < 50) redBlk++;
      if (trend.indexOf('📉') >= 0) diving++;
    });

    var grade = calcGrade(thisAvg, redBlk, thisScores.length, diving);

    teamStats[key] = {
      name:       cfg.name,
      thisAvg:    thisAvg,
      prevAvg:    prevAvg,
      diff:       diff,
      count:      thisScores.length,
      redBlk:     redBlk,
      diving:     diving,
      grade:      grade
    };
  });

  // ── หา insert row — ต่อหลัง AMP team ──────────────────────
  // AMP จบที่ row ~43 ใส่ Scorecard หลัง row 45
  var insertRow = 46;
  // ล้าง Scorecard เก่า (ถ้ามี)
  for (var r = insertRow; r <= insertRow + 20; r++) {
    dash.getRange(r, 1, 1, 12).clearContent().setBackground(null)
      .setFontColor('#111111').setFontWeight('normal').setFontStyle('normal');
  }

  // ── เขียน Scorecard ────────────────────────────────────────
  var row = insertRow;

  // Header
  dash.setRowHeight(row, 32);
  var hdr = dash.getRange(row, 1, 1, 12);
  hdr.merge().setValue('📈  MENTOR TEAM SCORECARD  |  ' + prevMonthName + ' → ' + thisMonthName + '  |  ดูว่าแต่ละทีมทำงานเป็นยังไง');
  hdr.setBackground('#1E2A3A').setFontColor('#F0B429')
     .setFontWeight('bold').setFontSize(11)
     .setHorizontalAlignment('center').setVerticalAlignment('middle');
  row++;

  // Sub-header
  dash.setRowHeight(row, 20);
  var subHeaders = ['Mentor', 'Grade', 'เดือนนี้\n(' + thisMonthName + ')', 'เดือนที่แล้ว\n(' + prevMonthName + ')', 'เปลี่ยนแปลง', 'สมาชิก\nในทีม', 'แดง+ดำ', 'ดิ่ง\n3เดือน', 'สรุปทีม', '', '', ''];
  subHeaders.forEach(function(h, i) {
    var c = dash.getRange(row, i+1);
    c.setValue(h);
    c.setBackground('#2E4057').setFontColor('#FFFFFF')
     .setFontWeight('bold').setFontSize(8)
     .setHorizontalAlignment('center').setVerticalAlignment('middle')
     .setWrap(true);
  });
  row++;

  // Data rows
  var mentorOrder = ['TOOMTAM', 'Aof', 'Draft', 'PHAI', 'AMP'];
  mentorOrder.forEach(function(key) {
    var s = teamStats[key];
    if (!s) return;

    dash.setRowHeight(row, 36);

    var diffText = s.diff > 0 ? '▲ +' + s.diff.toFixed(1)
                 : s.diff < 0 ? '▼ ' + s.diff.toFixed(1)
                 : '→ 0';
    var diffColor = s.diff > 0 ? '#1A7A4A' : s.diff < 0 ? '#C0392B' : '#888888';
    var diffBg    = s.diff > 0 ? '#E6F4EA' : s.diff < 0 ? '#FDECEA' : '#F4F4F4';

    var cells = [
      { val: s.name,                    bg: '#F4F4F4', fg: '#111111', bold: true  },
      { val: s.grade.grade,             bg: s.grade.bg, fg: s.grade.color, bold: true  },
      { val: s.thisAvg.toFixed(1),      bg: s.thisAvg >= 70 ? '#E6F4EA' : s.thisAvg >= 50 ? '#FFF8E1' : '#FDECEA',
                                        fg: s.thisAvg >= 70 ? '#1A7A4A' : s.thisAvg >= 50 ? '#B7791F' : '#C0392B', bold: true },
      { val: s.prevAvg.toFixed(1),      bg: '#F4F4F4', fg: '#888888', bold: false },
      { val: diffText,                  bg: diffBg,     fg: diffColor, bold: true  },
      { val: s.count,                   bg: '#F4F4F4', fg: '#111111', bold: false },
      { val: s.redBlk > 0 ? '🔴 ' + s.redBlk + ' คน' : '✅ 0', bg: s.redBlk > 2 ? '#FDECEA' : '#F4F4F4',
                                        fg: s.redBlk > 2 ? '#C0392B' : '#888888', bold: s.redBlk > 2 },
      { val: s.diving > 0 ? '📉 ' + s.diving + ' คน' : '✅ 0', bg: s.diving > 1 ? '#FFF8E1' : '#F4F4F4',
                                        fg: s.diving > 1 ? '#B7791F' : '#888888', bold: s.diving > 1 },
    ];

    cells.forEach(function(cell, i) {
      var c = dash.getRange(row, i+1);
      c.setValue(cell.val);
      c.setBackground(cell.bg).setFontColor(cell.fg)
       .setFontWeight(cell.bold ? 'bold' : 'normal')
       .setFontSize(9).setHorizontalAlignment('center')
       .setVerticalAlignment('middle').setWrap(false);
    });

    // Grade label col 9
    var gradeCell = dash.getRange(row, 9);
    gradeCell.setValue(s.grade.label);
    gradeCell.setBackground(s.grade.bg).setFontColor(s.grade.color)
      .setFontWeight('bold').setFontSize(9)
      .setHorizontalAlignment('left').setVerticalAlignment('middle');

    // Merge cols 9-12 for label
    dash.getRange(row, 9, 1, 4).merge();

    row++;
  });

  // ── Footer: Chapter Summary ────────────────────────────────
  dash.setRowHeight(row, 10); row++; // spacer

  // รวม Chapter
  var allThis = [];
  var allPrev = [];
  mentorOrder.forEach(function(k) {
    if (teamStats[k].thisAvg > 0) allThis.push(teamStats[k].thisAvg);
    if (teamStats[k].prevAvg > 0) allPrev.push(teamStats[k].prevAvg);
  });
  var chapterThis = avg(allThis);
  var chapterPrev = avg(allPrev);
  var chapterDiff = chapterThis - chapterPrev;

  dash.setRowHeight(row, 28);
  var footerRange = dash.getRange(row, 1, 1, 12);
  var chapterDiffText = chapterDiff > 0 ? '▲ ดีขึ้น +' + chapterDiff.toFixed(1) + ' แต้ม'
                      : chapterDiff < 0 ? '▼ ลดลง ' + chapterDiff.toFixed(1) + ' แต้ม'
                      : '→ ทรงตัว';
  var chapterBg = chapterDiff > 0 ? '#1A7A4A' : chapterDiff < 0 ? '#7B341E' : '#2E4057';

  footerRange.merge().setValue(
    '🏆 Chapter โดยรวม:  ' + prevMonthName + ' ' + chapterPrev.toFixed(1) + ' แต้ม  →  ' +
    thisMonthName + ' ' + chapterThis.toFixed(1) + ' แต้ม  |  ' + chapterDiffText +
    '   (Mentor ที่ดีที่สุดเดือนนี้: ' + getBestMentor(teamStats) + ')'
  );
  footerRange.setBackground(chapterBg).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');

  // อัปเดต timestamp ใน row 2
  var now = new Date();
  var ts  = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  var banner = dash.getRange(2, 1).getDisplayValue();
  // อัปเดต timestamp ใน banner ถ้ามี
  if (banner.indexOf('│') >= 0) {
    var parts = banner.split('│');
    parts[parts.length-1] = ' ' + ts;
    // ไม่แก้ banner เพราะ Script C จัดการอยู่แล้ว
  }

  Browser.msgBox(
    '✅ Mentor Team Scorecard อัปเดตแล้ว!\n\n' +
    'ดูได้ที่ Dashboard ส่วนล่างสุด\n\n' +
    '📊 สรุป ' + prevMonthName + ' → ' + thisMonthName + ':\n' +
    mentorOrder.map(function(k) {
      var s = teamStats[k];
      var arrow = s.diff > 0 ? '▲' : s.diff < 0 ? '▼' : '→';
      return s.name + ': ' + s.thisAvg.toFixed(1) + ' (' + arrow + s.diff.toFixed(1) + ') Grade ' + s.grade.grade;
    }).join('\n') +
    '\n\nChapter รวม: ' + chapterThis.toFixed(1) + ' (' + chapterDiffText + ')'
  );
}

function getBestMentor(teamStats) {
  var best = null;
  var bestDiff = -999;
  Object.keys(teamStats).forEach(function(k) {
    if (teamStats[k].diff > bestDiff) {
      bestDiff = teamStats[k].diff;
      best = teamStats[k].name;
    }
  });
  return best || '—';
}
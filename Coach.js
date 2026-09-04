/**
 * BNI IDEAL - ULTIMATE COMMAND CENTER (V17)
 * แก้ไข: Attendance — แสดง "ขาดไปแล้วกี่ครั้ง + ระดับความเสี่ยง"
 *        ไม่ใช่ "ขาดอีกกี่ครั้ง" เพราะ BNI ห้ามขาด ไม่มีโควต้า
 *        เกณฑ์: ขาด 3 = เสี่ยงเปิดเก้าอี้ | ขาด 5-6 = ต้องดรอป
 */

// ── [SECTION 1] Global Variables ─────────────────────────────

// MENTEE_MAP และ MONTH_TO_COL อยู่ใน B.js (single source of truth)

function stripNickname(name) {
  return String(name || '').replace(/\s*\([^)]+\)\s*$/, '').trim();
}

// ── [SECTION 2] onOpen ────────────────────────────────────────

function onOpen() {
  var ui = SpreadsheetApp.getUi();

  ui.createMenu('🎯 BNI System')
    .addItem('🔍 ตรวจสอบระบบ (System Check)', 'runSystemCheck')
    .addSeparator()
    .addItem('🎯 สร้างหน้า One-Page Coaching', 'setupCoachingSheet')
    .addSeparator()
    .addItem('🆕 เสกไฟล์ New Member', 'createNewMemberFile')
    .addToUi();

  ui.createMenu('🔄 BNI Sync')
    .addItem('📥 Sync คะแนนจาก CSV → Mentor Sheets',     'syncScoresFromCSV')
    .addItem('⚡ แก้คะแนน Non-Mentor (Quick Fix)',        'fixNonMentorScores')
    .addItem('📊 Refresh Summary Counter',                'addSummaryCounter')
    .addItem('📈 Mentor Team Scorecard',                  'updateMentorScorecard')
    .addItem('📁 1-Click Import (CSV)',          'openImportDialog')
    .addItem('📊 Generate Mentor ROI Report',    'generateMentorROIReport')
    .addItem('🔄 Update Action Logs After Sync', 'updateActionLogsAfterSync')
    .addSeparator()
    .addItem('📜 สร้าง Sheet ACTION LOGS',       'setupActionLogsSheet')
    .addItem('📱 ตั้ง Line Notify Trigger',      'setupThursdayTrigger')
    .addItem('🧪 ทดสอบ Line Notify',             'testLineNotify')
    .addSeparator()
    .addItem('🔍 ตรวจคะแนนเดือนนี้ + Highlight',         'checkAndHighlight')
    .addItem('🧹 ล้าง Highlight ทั้งหมด',                'clearHighlight')
    .addSeparator()
    .addItem('💳 Renewal + Core Issue Check',             'runRenewalAndCoreIssueCheck')
    .addItem('💰 อัปเดต Given/Received (Apr 26)', 'updateGivenReceived')
    .addItem('💬 ตั้งค่า MC Message Column',              'setupMCMessageColumn')
    .addItem('📋 ดู MC Messages ทั้งหมด',                 'viewAllMCMessages')
    .addSeparator()
    .addItem('🆕 สร้าง Sheet UPDATE SCORES + NON-MENTOR', 'runScriptA')
    .addSeparator()
    .addItem('⏰ ตั้ง Trigger อัตโนมัติ (ทำครั้งเดียว)', 'setupMonthlyTrigger')
    .addItem('⏰ ตั้ง Weekly Trigger (วันพุธ)',            'setupWeeklyTrigger')
    .addSeparator()
    .addItem('ℹ️ วิธีใช้งาน',                             'showHelp')
    .addToUi();

  // RENEWAL อัปเดตอัตโนมัติทุกครั้งที่เปิด
  updateRenewalOnOpen();
}

// ── [SECTION 3] Priority Engine ──────────────────────────────

var KEY_META = {
  attendance: {
    scoreWeight: 15, effort: 1, quickWin: true,
    why: 'BNI ห้ามขาดประชุม — ขาด 3 ครั้ง เสี่ยงเปิดเก้าอี้ให้คนอื่น | ขาด 5-6 ครั้ง ต้องดรอปออก'
  },
  ceu: {
    scoreWeight: 12, effort: 2, quickWin: true,
    why: 'CEU ทำได้คนเดียวทันที ไม่ต้องรอใคร ROI ต่อเวลาสูงที่สุดใน 5 Keys'
  },
  oneTwoOne: {
    scoreWeight: 8, effort: 2, quickWin: true,
    why: '1-2-1 นัดเองได้ทันที ยิ่งทำกับคนที่ยังไม่เคยทำยิ่งได้คะแนนเต็ม'
  },
  referral: {
    scoreWeight: 10, effort: 3, quickWin: false,
    why: 'Referral ต้องรอ partner ส่งให้ ใช้เวลานานกว่า แต่คะแนนต่อใบสูง ต้องวางแผนล่วงหน้า'
  },
  visitor: {
    scoreWeight: 20, effort: 4, quickWin: false,
    why: 'Visitor ให้คะแนนสูงสุดต่อหน่วย แต่ต้องใช้เวลาชวนและประสานงาน ไม่ใช่ Quick Win'
  }
};

function computePriorities(actual, target, activeWeeks) {
  var candidates = [];

  // ── Attendance — ใช้จำนวนที่ขาดแล้ว ไม่ใช่ gap ──────────
  if (actual.absent >= 1) {
    var attendTitle, attendAction, attendTarget, attendEmergency;

    if (actual.absent >= 5) {
      // วิกฤต — ใกล้ต้องดรอป
      attendTitle     = '🏛️ [🚨 วิกฤต!] Attendance — เสี่ยงต้องดรอปออก';
      attendAction    = '🚨 ขาดไปแล้ว ' + actual.absent + ' ครั้ง\n'
                      + 'BNI เกณฑ์: ขาด 5-6 ครั้ง = ต้องดรอปออกจาก Chapter\n'
                      + '⚡ ต้องปรึกษาตูมตามด่วนเรื่องสถานะสมาชิก';
      attendTarget    = 'มาทุกครั้งที่เหลือโดยไม่มีข้อยกเว้น และปรึกษา MC ทันที';
      attendEmergency = true;
    } else if (actual.absent >= 3) {
      // อันตราย — เก้าอี้อาจถูกเปิด
      attendTitle     = '🏛️ [⚠️ อันตราย] Attendance — เสี่ยงเปิดเก้าอี้ให้คนอื่น';
      attendAction    = '⚠️ ขาดไปแล้ว ' + actual.absent + ' ครั้ง\n'
                      + 'BNI เกณฑ์: ขาด 3 ครั้ง = Chapter มีสิทธิ์เปิดเก้าอี้ให้คนอื่นเข้าแทน\n'
                      + '⚡ ทำได้เลยสัปดาห์นี้: มาทุกวันศุกร์ไม่มีข้อยกเว้น';
      attendTarget    = 'ห้ามขาดอีกแม้แต่ครั้งเดียว — มาครบ 8 สัปดาห์ติดต่อกัน';
      attendEmergency = true;
    } else {
      // ระวัง — ยังมีโอกาสแก้ไข
      attendTitle     = '🏛️ [📋 ระวัง] Attendance — ห้ามขาดอีก';
      attendAction    = '📋 ขาดไปแล้ว ' + actual.absent + ' ครั้ง\n'
                      + 'BNI ห้ามขาดประชุม — ขาดสะสมอีก 2 ครั้งเสี่ยงเปิดเก้าอี้\n'
                      + '⚡ ทำได้เลยสัปดาห์นี้: มาทุกวันศุกร์ไม่มีข้อยกเว้น';
      attendTarget = 'ห้ามขาดอีก — ขาดได้อีกแค่ ' + Math.max(0, 2 - actual.absent) + ' ครั้งใน 6 เดือนนี้ก่อนถึงเกณฑ์เสี่ยง\n(การขาดที่เก่ากว่า 6 เดือนจะหายไปเองอัตโนมัติ)';
    }

    candidates.push({
      key: 'attendance',
      roi: KEY_META.attendance.scoreWeight / KEY_META.attendance.effort,
      isQuickWin: true,
      isEmergency: attendEmergency,
      pctDone: actual.attend / Math.max(1, target.attend),
      title:  attendTitle,
      action: attendAction,
      target: attendTarget,
      why:    KEY_META.attendance.why
    });
  }

  // ── CEU ───────────────────────────────────────────────────
  var ceuGap = target.ceu - actual.ceu;
  if (ceuGap > 0) {
    candidates.push({
      key: 'ceu',
      roi: KEY_META.ceu.scoreWeight / KEY_META.ceu.effort,
      isQuickWin: true, isEmergency: false,
      pctDone: actual.ceu / Math.max(1, target.ceu),
      title:  '📚 [⚡ Quick Win] CEU — เรียนได้เองทันที',
      action: 'ได้ ' + actual.ceu + ' / เป้า ' + target.ceu + ' แต้ม → ขาดอีก ' + ceuGap + ' แต้ม\n'
            + '⚡ ทำได้เลยสัปดาห์นี้: เข้า BNI Connect → Online Training → เรียนให้ครบ',
      target: 'เป้า: เรียนให้ครบ ' + ceuGap + ' แต้มภายใน ' + Math.min(Math.ceil(ceuGap), 2) + ' สัปดาห์',
      why:    KEY_META.ceu.why
    });
  }

  // ── 1-2-1 ─────────────────────────────────────────────────
  var oToOneGap = target.oToOne - actual.oToOne;
  if (oToOneGap > 0) {
    candidates.push({
      key: 'oneTwoOne',
      roi: KEY_META.oneTwoOne.scoreWeight / KEY_META.oneTwoOne.effort,
      isQuickWin: true, isEmergency: false,
      pctDone: actual.oToOne / Math.max(1, target.oToOne),
      title:  '🤝 [⚡ Quick Win] 1-2-1 — นัดเองได้เลย',
      action: 'ทำแล้ว ' + actual.oToOne + ' / เป้า ' + target.oToOne + ' ครั้ง → ขาดอีก ' + oToOneGap + ' ครั้ง\n'
            + '⚡ ทำได้เลยสัปดาห์นี้: นัดหลังประชุมวันศุกร์ หรือส่ง Line นัดสมาชิกที่ยังไม่เคยทำ',
      target: 'เป้า: ทำ ' + Math.min(Math.ceil(oToOneGap / 4), 3) + ' ครั้ง/สัปดาห์ จนครบ ' + target.oToOne + ' ครั้ง',
      why:    KEY_META.oneTwoOne.why
    });
  }

  // ── Referral ──────────────────────────────────────────────
  var refGap = target.referral - actual.rg;
  if (refGap > 0) {
    candidates.push({
      key: 'referral',
      roi: KEY_META.referral.scoreWeight / KEY_META.referral.effort,
      isQuickWin: false, isEmergency: false,
      pctDone: actual.rg / Math.max(1, target.referral),
      title:  '💡 [📋 วางแผน] Referral — ต้องเตรียมล่วงหน้า',
      action: 'ให้แล้ว ' + actual.rg + ' / เป้า ' + target.referral + ' ใบ → ขาดอีก ' + refGap + ' ใบ\n'
            + '📋 วางแผนสัปดาห์นี้: เตรียม 30-second presentation → บอกสมาชิกว่ากำลังหาลูกค้าแบบไหน',
      target: 'เป้า: ให้ Referral ' + Math.min(Math.ceil(refGap / 4), 3) + ' ใบ/สัปดาห์ ต่อเนื่อง 4 สัปดาห์',
      why:    KEY_META.referral.why
    });
  }

  // ── Visitor ───────────────────────────────────────────────
  var visGap = target.visitor - actual.visitor;
  if (visGap > 0) {
    candidates.push({
      key: 'visitor',
      roi: KEY_META.visitor.scoreWeight / KEY_META.visitor.effort,
      isQuickWin: false, isEmergency: false,
      pctDone: actual.visitor / Math.max(1, target.visitor),
      title:  '👥 [🎯 ROI สูง] Visitor — คะแนนสูงสุดต่อหน่วย',
      action: 'พาแขกแล้ว ' + actual.visitor + ' / เป้า ' + target.visitor + ' คน → ขาดอีก ' + visGap + ' คน\n'
            + '📋 เริ่มสัปดาห์นี้: ส่ง Line ชวนลูกค้า / เพื่อนธุรกิจ มาดูประชุม BNI ครั้งหน้า',
      target: 'เป้า: ชวนแขก ' + visGap + ' คนใน 4 สัปดาห์ข้างหน้า',
      why:    KEY_META.visitor.why
    });
  }

  // เรียงลำดับ: Emergency → Quick Win by ROI → แผนระยะยาว by ROI
  candidates.sort(function(a, b) {
    if (a.isEmergency !== b.isEmergency) return a.isEmergency ? -1 : 1;
    if (a.isQuickWin  !== b.isQuickWin)  return a.isQuickWin  ? -1 : 1;
    if (Math.abs(a.roi - b.roi) > 0.1)   return b.roi - a.roi;
    return a.pctDone - b.pctDone;
  });

  return candidates.slice(0, 3);
}

// ── [SECTION 4] setupCoachingSheet ───────────────────────────

function setupCoachingSheet() {
  // ป้องกันสร้างทับ Sheet อื่น
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = '🎯 ONE-PAGE COACHING';
  var sheet = ss.getSheetByName(sheetName);
  
  // ถ้ามีอยู่แล้ว → ถามก่อน
  if (sheet) {
    var confirm = Browser.msgBox(
      '⚠️ Sheet นี้มีอยู่แล้ว',
      'ต้องการ Reset ข้อมูลทั้งหมดหรือไม่?',
      Browser.Buttons.YES_NO
    );
    if (confirm !== 'yes') return;
  } else {
    sheet = ss.insertSheet(sheetName);
  }

  sheet.getRange('A1:B1').merge()
    .setValue('🏆 EXECUTIVE COACHING PLAN (BNI IDEAL)')
    .setBackground('#1a1a1a').setFontColor('white')
    .setFontWeight('bold').setHorizontalAlignment('center')
    .setFontFamily('Kanit').setFontSize(13);

  sheet.getRange('A2').setValue('👤 เลือกชื่อสมาชิก:').setFontWeight('bold').setFontFamily('Kanit');
  sheet.getRange('B2').setBackground('#fff2cc').setFontFamily('Kanit');
  sheet.getRange('A3').setValue('🛡️ Mentor:').setFontWeight('bold').setFontFamily('Kanit');
  sheet.getRange('B3').setFontColor('#666666').setFontStyle('italic').setFontFamily('Kanit');

  // Dropdown จาก col B ของ รายชื่อทั้งหมด
// ดึงรายชื่อจาก Reporting2You — ครอบคลุมทุกคนรวม Mentor และ LT
  var r2ySheet = ss.getSheetByName('Reporting2You');
  if (r2ySheet) {
    var lastR    = r2ySheet.getLastRow();
    var colA     = r2ySheet.getRange('A2:A' + lastR).getValues();
    var nameList = [];
    for (var n = 0; n < colA.length; n++) {
      var fullName = String(colA[n][0]).replace(/\s*\(BNI Ideal\)/i,'').trim();
      if (fullName && fullName.length > 2) nameList.push(fullName);
    }
    if (nameList.length > 0) {
      var rule = SpreadsheetApp.newDataValidation().requireValueInList(nameList).build();
      sheet.getRange('B2').setDataValidation(rule);
    }
  }

  sheet.getRange('A5:B5').merge()
    .setValue('━━━  สรุปเครื่องยนต์ธุรกิจ  ━━━')
    .setBackground('#f3f3f3').setFontWeight('bold').setFontFamily('Kanit')
    .setHorizontalAlignment('center').setFontColor('#444444');
  sheet.getRange('A6').setValue('คะแนนล่าสุด:').setFontWeight('bold').setFontFamily('Kanit');
  sheet.getRange('A7').setValue('อายุงาน BNI:').setFontWeight('bold').setFontFamily('Kanit');
  sheet.getRange('A8').setValue('วินัยประชุม:').setFontWeight('bold').setFontFamily('Kanit');

  sheet.getRange('A10:B10').merge()
    .setValue('📊  5 Keys — ผลงาน vs เป้าหมาย')
    .setBackground('#e8f0fe').setFontWeight('bold').setFontFamily('Kanit')
    .setHorizontalAlignment('center').setFontColor('#1a73e8');
  sheet.getRange('A11').setValue('Key').setFontWeight('bold').setFontFamily('Kanit').setHorizontalAlignment('center');
  sheet.getRange('B11').setValue('ผลงาน / เป้า / ช่องว่าง').setFontWeight('bold').setFontFamily('Kanit');

  var keys = ['🤝 1-2-1', '💡 Referral (ให้)', '👥 Visitor', '📚 CEU', '🏛️ Attendance'];
  for (var i = 0; i < keys.length; i++) {
    sheet.getRange(12+i, 1).setValue(keys[i]).setFontFamily('Kanit');
    sheet.getRange(12+i, 2).setBackground(i % 2 === 0 ? '#f8f9fa' : '#ffffff').setFontFamily('Kanit');
    sheet.setRowHeight(12+i, 40); // row สูงขึ้นสำหรับ Attendance
  }

  sheet.getRange('A18:B18').merge()
    .setValue('⚔️  THE EMPEROR\'S COMMAND — Priority สู้คะแนน')
    .setBackground('#b91c1c').setFontColor('white')
    .setFontWeight('bold').setFontFamily('Kanit')
    .setHorizontalAlignment('center').setFontSize(11);

  var priorityColors = ['#fef3c7', '#fce7f3', '#e0f2fe'];
  for (var p = 0; p < 3; p++) {
    var sr = 19 + (p * 4);
    sheet.getRange(sr,   1).setValue('Priority ' + (p+1)).setFontWeight('bold').setFontFamily('Kanit')
      .setBackground(priorityColors[p]).setFontColor('#333333');
    sheet.getRange(sr,   2).setBackground(priorityColors[p]).setFontFamily('Kanit').setFontWeight('bold').setWrap(true);
    sheet.getRange(sr+1, 1).setValue('→ Action:').setFontFamily('Kanit').setFontColor('#666666').setBackground('#fafafa').setFontSize(8);
    sheet.getRange(sr+1, 2).setBackground('#fafafa').setFontFamily('Kanit').setWrap(true);
    sheet.getRange(sr+2, 1).setValue('→ เป้าหมาย:').setFontFamily('Kanit').setFontColor('#666666').setBackground('#fafafa').setFontSize(8);
    sheet.getRange(sr+2, 2).setBackground('#fafafa').setFontFamily('Kanit').setWrap(true);
    sheet.getRange(sr+3, 1).setValue('→ ทำไม?').setFontFamily('Kanit').setFontColor('#666666').setBackground('#fafafa').setFontSize(8);
    sheet.getRange(sr+3, 2).setBackground('#f0f0f0').setFontFamily('Kanit').setFontStyle('italic').setFontColor('#555555').setWrap(true);
    sheet.setRowHeight(sr,   28);
    sheet.setRowHeight(sr+1, 55);
    sheet.setRowHeight(sr+2, 24);
    sheet.setRowHeight(sr+3, 44);
  }

  sheet.setRowHeight(1, 36);
  sheet.setRowHeight(5, 22);
  sheet.setRowHeight(10, 26);
  sheet.setRowHeight(18, 32);

  Browser.msgBox('✅ One-Page Coaching พร้อมแล้ว!\n\nไปที่ Sheet "🎯 ONE-PAGE COACHING"\nแล้วเลือกชื่อสมาชิกที่ช่อง B2 ได้เลยครับ');
}

// ── [SECTION 5] onEdit ───────────────────────────────────────

function onEdit(e) {
  var range = e.range;
  var ss    = e.source;
  var sheet = ss.getActiveSheet();

  if (sheet.getName() !== '🎯 ONE-PAGE COACHING' || range.getA1Notation() !== 'B2') return;

  var memberName = String(range.getValue()).trim();
  if (!memberName) return;

  var memberNameClean = stripNickname(memberName);

  var masterSheet = ss.getSheetByName('รายชื่อทั้งหมด');
  var reportSheet = ss.getSheetByName('Reporting2You');
  if (!masterSheet || !reportSheet) {
    sheet.getRange('B3').setValue('⚠️ ไม่พบ Sheet "รายชื่อทั้งหมด" หรือ "Reporting2You"');
    return;
  }

  var masterData = masterSheet.getDataRange().getValues();
  var reportData = reportSheet.getDataRange().getValues();

var memberInfo = null;
  for (var i = 0; i < masterData.length; i++) {
    if (stripNickname(String(masterData[i][1])) === memberNameClean) {
      memberInfo = masterData[i]; break;
    }
  }

  var r2yInfo = null;
  for (var j = 0; j < reportData.length; j++) {
    var r2yName = String(reportData[j][0]).replace(/\s*\(BNI Ideal\)/i, '').trim();
    if (r2yName === memberNameClean) {
      r2yInfo = reportData[j]; break;
    }
  }

  // ถ้าไม่พบใน masterSheet → สร้าง memberInfo จาก r2yInfo แทน
  if (!memberInfo && r2yInfo) {
    memberInfo = [];
    memberInfo[1] = memberNameClean;  // col B = ชื่อ
    memberInfo[2] = '';               // col C = ชื่อเล่น
    memberInfo[3] = 'ไม่มี Mentor';   // col D = mentor
    memberInfo[4] = 0;                // col E = score (ดึงจาก R2Y แทน)
    memberInfo[5] = '—';              // col F = TL status

    // หา score ล่าสุดจาก Mentor Sheets ทุก sheet
    var sheets = ['TOOMTAM','Aof','Draft','PHAI','AMP'];
    var allScoresSheet = ss.getSheetByName('รายชื่อทั้งหมด');
    if (allScoresSheet) {
      var allData = allScoresSheet.getDataRange().getValues();
      for (var k = 0; k < allData.length; k++) {
        if (stripNickname(String(allData[k][1])) === memberNameClean) {
          memberInfo[3] = String(allData[k][3]||'ไม่มี Mentor');
          memberInfo[4] = parseFloat(allData[k][4])||0;
          memberInfo[5] = String(allData[k][5]||'—');
          break;
        }
      }
    }
  }

  if (!memberInfo) {
    sheet.getRange('B3').setValue('⚠️ ไม่พบ "' + memberNameClean + '" ใน รายชื่อทั้งหมด'); return;
  }
  if (!r2yInfo) {
    sheet.getRange('B3').setValue('⚠️ ไม่พบ "' + memberNameClean + '" ใน Reporting2You'); return;
  }

  // ── ดึงข้อมูล ─────────────────────────────────────────────
  var mentor       = memberInfo[3] || '— (ยังไม่มี Mentor)';
  var currentScore = parseFloat(memberInfo[4]) || 0;
  var statusTL     = memberInfo[5] || '—';
  var bniDays      = parseInt(r2yInfo[8])  || 0;
  var activeWeeks  = Math.min(26, Math.max(1, Math.floor(bniDays / 7)));

  var actual = {
    rg:      parseInt(r2yInfo[1])  || 0,
    visitor: parseInt(r2yInfo[3])  || 0,
    oToOne:  parseInt(r2yInfo[4])  || 0,
    ceu:     parseInt(r2yInfo[5])  || 0,
    attend:  parseInt(r2yInfo[9])  || 0,
    absent:  parseInt(r2yInfo[10]) || 0,
    late:    parseInt(r2yInfo[11]) || 0,
    sub:     parseInt(r2yInfo[13]) || 0
  };

  var target = {
    referral: activeWeeks * 2,
    visitor:  Math.max(1, Math.ceil((activeWeeks / 26) * 2)),
    oToOne:   activeWeeks * 2,
    ceu:      Math.max(1, Math.ceil((activeWeeks / 26) * 4)),
    attend:   activeWeeks
  };

  // ── เขียนข้อมูลพื้นฐาน ────────────────────────────────────
  sheet.getRange('B3').setValue(mentor).setFontColor('#333333').setFontStyle('normal');

  var scoreColor = currentScore >= 70 ? '#137333'
                 : currentScore >= 50 ? '#e37400'
                 : currentScore >= 30 ? '#c5221f' : '#444444';
  sheet.getRange('B6').setValue(currentScore + ' แต้ม  │  ' + statusTL)
    .setFontColor(scoreColor).setFontWeight('bold');
  sheet.getRange('B7').setValue(bniDays + ' วัน  │  เทียบกับ ' + activeWeeks + ' สัปดาห์ใน BNI');
  sheet.getRange('B8').setValue(
  'มาประชุม ' + actual.attend + ' ครั้ง  │  ขาด ' + actual.absent +
  '  │  สาย ' + actual.late + '  │  ส่งแทน ' + actual.sub +
  '\n(นับย้อนหลัง 6 เดือนล่าสุดเท่านั้น — การขาดที่เกิน 6 เดือนไปแล้วไม่นับ)'
);

  // ── เขียน 5 Keys ──────────────────────────────────────────
  function keyLine(act, tgt, unit) {
    var gap    = tgt - act;
    var pct    = Math.round((act / Math.max(1, tgt)) * 100);
    var filled = Math.round(pct / 10);
    var bar    = '';
    for (var b = 0; b < 10; b++) bar += (b < filled) ? '█' : '░';
    var status = gap <= 0 ? '✅ ครบแล้ว' : '⚠️ ขาดอีก ' + gap + ' ' + unit;
    return act + ' / ' + tgt + '  [' + bar + ']  ' + pct + '%  →  ' + status;
  }

  // rows 12-15: 4 keys ปกติ
  var normalKeys = [
    [12, actual.oToOne,  target.oToOne,   'ครั้ง'],
    [13, actual.rg,      target.referral, 'ใบ'],
    [14, actual.visitor, target.visitor,  'คน'],
    [15, actual.ceu,     target.ceu,      'แต้ม']
  ];
  normalKeys.forEach(function(k) {
    var row = k[0], act = k[1], tgt = k[2], unit = k[3];
    var p = act / Math.max(1, tgt);
    sheet.getRange(row, 2)
      .setValue(keyLine(act, tgt, unit))
      .setBackground(p >= 1 ? '#e6f4ea' : p >= 0.6 ? '#fef9e7' : '#fdecea');
  });

  // ── row 16: Attendance — แสดงความเสี่ยงจากจำนวนที่ขาด ────
  var absentCount = actual.absent;
  var lateCount   = actual.late;
  var subCount    = actual.sub;

  var attendText, attendBg;
  if (absentCount >= 5) {
    attendText = 'มาแล้ว ' + actual.attend + ' ครั้ง  │  ขาด ' + absentCount + '  │  สาย ' + lateCount + '  │  ส่งแทน ' + subCount + '\n'
               + '🚨 วิกฤต! — ขาดไปแล้ว ' + absentCount + ' ครั้ง → เสี่ยงต้องดรอปออกจาก Chapter';
    attendBg = '#FDECEA';
  } else if (absentCount >= 3) {
    attendText = 'มาแล้ว ' + actual.attend + ' ครั้ง  │  ขาด ' + absentCount + '  │  สาย ' + lateCount + '  │  ส่งแทน ' + subCount + '\n'
               + '⚠️ อันตราย — ขาดไปแล้ว ' + absentCount + ' ครั้ง → Chapter มีสิทธิ์เปิดเก้าอี้ให้คนอื่น';
    attendBg = '#FFF3CD';
  } else if (absentCount >= 1) {
    var safeLeft = 2 - absentCount;
    attendText = 'มาแล้ว ' + actual.attend + ' ครั้ง  │  ขาด ' + absentCount + '  │  สาย ' + lateCount + '  │  ส่งแทน ' + subCount + '\n'
               + '📋 ระวัง — ขาดได้อีกแค่ ' + safeLeft + ' ครั้งก่อนถึงเกณฑ์เสี่ยง → ห้ามขาดอีก';
    attendBg = '#FFF8E1';
  } else {
    attendText = 'มาแล้ว ' + actual.attend + ' ครั้ง  │  ไม่เคยขาดเลย  │  สาย ' + lateCount + '  │  ส่งแทน ' + subCount + '\n'
               + '✅ ดีมาก — วินัยประชุมสมบูรณ์แบบ';
    attendBg = '#E6F4EA';
  }

  sheet.getRange(16, 2).setValue(attendText).setBackground(attendBg).setWrap(true);

  // ── Priority Engine ────────────────────────────────────────
  var priorities = computePriorities(actual, target, activeWeeks);

  for (var p = 0; p < 3; p++) {
    var sr = 19 + (p * 4);
    sheet.getRange(sr,   2).setValue('').setBackground('#fef3c7');
    sheet.getRange(sr+1, 2).setValue('');
    sheet.getRange(sr+2, 2).setValue('');
    sheet.getRange(sr+3, 2).setValue('');
  }

  if (priorities.length === 0) {
    sheet.getRange('B19').setValue('✅ ทุก Key ครบแล้ว! เครื่องยนต์ High-Performance สมบูรณ์แบบ')
      .setBackground('#e6f4ea').setFontColor('#137333').setFontWeight('bold');
    return;
  }

  priorities.forEach(function(pri, idx) {
    var sr = 19 + (idx * 4);
    var titleBg = pri.isEmergency ? '#fecaca' : pri.isQuickWin ? '#fef3c7' : '#dbeafe';
    sheet.getRange(sr,   2).setValue(pri.title).setBackground(titleBg);
    sheet.getRange(sr+1, 2).setValue(pri.action);
    sheet.getRange(sr+2, 2).setValue(pri.target);
    sheet.getRange(sr+3, 2).setValue(pri.why);
  });
}

// ── [SECTION 6] Sync Engine ───────────────────────────────────
// syncScoresFromCSV และ cleanName อยู่ใน B.js (single source of truth)

function showHelp() {
  Browser.msgBox(
    '📖 วิธีใช้งาน BNI Sync\n\n' +
    '1️⃣  Export Traffic Lights จาก BNI → CSV\n' +
    '2️⃣  เปิด CSV → Ctrl+A → Copy\n' +
    '3️⃣  Sheet UPDATE SCORES → คลิก B7 → Paste Special → Values only\n' +
    '4️⃣  เมนู BNI Sync → Sync คะแนนจาก CSV\n' +
    '5️⃣  เมนู BNI Sync → แก้คะแนน Non-Mentor\n' +
    '6️⃣  เมนู BNI Sync → Refresh Summary Counter\n' +
    '7️⃣  เมนู BNI Sync → ล้าง Highlight'
  );
}

function createNewMemberFile() {
  Browser.msgBox('กรุณาระบุ ID ไฟล์ Template ในโค้ดก่อนรันครับ');
}

// ── Renewal stub (ให้ H.gs จัดการ) ─────────────────────────
function updateRenewalOnOpen() {
  try {
    if (typeof _updateAllRenewalStatus === 'function') {
      _updateAllRenewalStatus(SpreadsheetApp.getActiveSpreadsheet());
    }
  } catch(e) { Logger.log('Renewal skip: ' + e.message); }
}

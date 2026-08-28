// ============================================================
// BNI IDEAL — Script L : Line Notify Proactive Trigger
//
// อุด Gap 3: Proactive Trigger
// ยิงข้อความสรุปตรงเข้า Line Group ทุกเช้าวันพฤหัส 07:00
// ก่อนรอบส่งรายงาน 18:00
//
// วิธีตั้งค่า:
// 1. ไปที่ https://notify-bot.line.me/th/
// 2. Login → My page → Generate access token
// 3. ใส่ token ใน LINE_TOKENS ด้านล่าง
// 4. เพิ่ม "Line Notify" บอทเข้ากลุ่ม Line แต่ละกลุ่ม
// 5. Run setupThursdayTrigger() ครั้งเดียว
// ============================================================

// ── Line Notify Tokens ────────────────────────────────────────
// แต่ละ token ส่งข้อความเข้ากลุ่มที่ต่างกัน
// ได้จาก https://notify-bot.line.me/th/ → Generate token
var LINE_TOKENS = {
  MC_GROUP:      'YOUR_MC_GROUP_TOKEN_HERE',      // กลุ่ม Mentor ทั้งหมด
  TOOMTAM_GROUP: 'YOUR_TOOMTAM_GROUP_TOKEN_HERE', // กลุ่ม TOOMTAM team
  AOF_GROUP:     'YOUR_AOF_GROUP_TOKEN_HERE',     // กลุ่ม Aof team
  DRAFT_GROUP:   'YOUR_DRAFT_GROUP_TOKEN_HERE',   // กลุ่ม Draft team
  PHAI_GROUP:    'YOUR_PHAI_GROUP_TOKEN_HERE',    // กลุ่ม PHAI team
  AMP_GROUP:     'YOUR_AMP_GROUP_TOKEN_HERE'      // กลุ่ม AMP team
};

// Mentor → Group token mapping
var MENTOR_LINE_TOKEN = {
  'TOOMTAM': 'TOOMTAM_GROUP',
  'Aof':     'AOF_GROUP',
  'Draft':   'DRAFT_GROUP',
  'PHAI':    'PHAI_GROUP',
  'AMP':     'AMP_GROUP'
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// sendLineNotify — ส่งข้อความเข้า Line
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function sendLineNotify(token, message) {
  if (!token || token.indexOf('YOUR_') >= 0) {
    Logger.log('Line token not configured for: ' + token);
    return false;
  }

  try {
    var response = UrlFetchApp.fetch('https://notify-api.line.me/api/notify', {
      method:  'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type':  'application/x-www-form-urlencoded'
      },
      payload: 'message=' + encodeURIComponent(message),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    if (code === 200) {
      Logger.log('Line sent OK');
      return true;
    } else {
      Logger.log('Line error ' + code + ': ' + response.getContentText());
      return false;
    }
  } catch(e) {
    Logger.log('Line fetch error: ' + e.message);
    return false;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// thursdayMorningAlert — เรียกโดย Trigger ทุกพฤหัส 07:00
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function thursdayMorningAlert() {
  if (typeof _lineLeanPolicyEnabled === 'function' && _lineLeanPolicyEnabled()) {
    Logger.log('LEAN: skip legacy thursdayMorningAlert');
    return;
  }
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var now = new Date();
  var dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd MMM yyyy');

  // ── 1. อัปเดต Renewal ──────────────────────────────────────
  try {
    if (typeof _updateAllRenewalStatus === 'function') {
      _updateAllRenewalStatus(ss);
    }
  } catch(e) { Logger.log('Renewal update err: '+e.message); }

  // ── 2. ดึงข้อมูลแต่ละทีม ────────────────────────────────────
  var teamData = _collectTeamAlerts(ss);

  // ── 3. ส่งข้อความรวมให้ MC Group ────────────────────────────
  _sendMCGroupSummary(teamData, dateStr);

  // ── 4. ส่งข้อความแยกให้แต่ละ Mentor Group ──────────────────
  _sendEachMentorAlert(teamData, dateStr);

  // ── 5. Push สรุปคะแนนส่วนตัวให้สมาชิกที่ลงทะเบียน LINE Bot ─
  try {
    if (typeof thursdayBotPush === 'function') thursdayBotPush();
  } catch(e3) { Logger.log('thursdayBotPush err: ' + e3.message); }

  // ── 5b. Chapter Pulse → MC ─────────────────────────────────
  try {
    if (typeof _lineChapterPulse === 'function') _lineChapterPulse();
  } catch(e5b) { Logger.log('_lineChapterPulse err: ' + e5b.message); }

  // ── 6. Push แจ้งเตือน Renewal ให้สมาชิกที่ใกล้หมดอายุ ────────
  try {
    if (typeof _lineRenewalPush === 'function') _lineRenewalPush();
  } catch(e4) { Logger.log('_lineRenewalPush err: ' + e4.message); }

  // ── 7. ส่ง 8-week onboarding message ให้สมาชิกใหม่ ───────────
  try {
    if (typeof onboardingWeeklyPush === 'function') onboardingWeeklyPush();
  } catch(e5) { Logger.log('onboardingWeeklyPush err: ' + e5.message); }

  Logger.log('Thursday alerts sent: ' + dateStr);
}

// ── รวบรวม alert ของแต่ละทีม ─────────────────────────────────
function _collectTeamAlerts(ss) {
  var teams = ['TOOMTAM','Aof','Draft','PHAI','AMP'];
  var result = {};

  // Renewal LATE
  var lateRenewals = {};
  var renSh = ss.getSheetByName('💳 RENEWAL');
  if (renSh) {
    var today = new Date(); today.setHours(0,0,0,0);
    for (var r = 3; r <= renSh.getLastRow(); r++) {
      var name   = renSh.getRange(r,1).getDisplayValue().trim();
      var team   = renSh.getRange(r,2).getDisplayValue().trim();
      var expRaw = renSh.getRange(r,3).getValue();
      if (!name||!expRaw) continue;
      var expDate = new Date(expRaw); expDate.setHours(0,0,0,0);
      var diff = Math.floor((expDate-today)/86400000);
      if (diff < 0) {
        if (!lateRenewals[team]) lateRenewals[team] = [];
        lateRenewals[team].push(name);
      } else if (diff <= 7) {
        if (!lateRenewals[team]) lateRenewals[team] = [];
        lateRenewals[team].push(name + ' (เหลือ '+diff+' วัน)');
      }
    }
  }

  teams.forEach(function(shName) {
    var sh = ss.getSheetByName(shName);
    if (!sh) return;

    var critical  = []; // ดำ/แดง
    var diving    = []; // ดิ่งต่อเนื่อง
    var noCoreIssue = []; // แดง/ดำ ที่ยังไม่กรอก Core Issue

    for (var r = 4; r <= 11; r++) {
      var name  = sh.getRange(r,3).getDisplayValue().trim();
      var nick  = sh.getRange(r,4).getDisplayValue().trim();
      if (!name) continue;

      // หาคะแนนล่าสุด
      var latest = null;
      for (var c = 16; c >= 5; c--) {
        var v = sh.getRange(r,c).getValue();
        if (v && parseFloat(v) > 0) { latest = parseFloat(v); break; }
      }
      if (!latest) continue;

      var trend = sh.getRange(r,17).getDisplayValue();
      var core  = sh.getRange(r,24).getDisplayValue().trim();
      var label = nick ? nick : name.split(' ')[0];

      if (latest < 50) {
        critical.push(label + ' ' + latest + 'แต้ม');
        if (!core || core.indexOf('⏳') >= 0 || core.indexOf('📝') >= 0) {
          noCoreIssue.push(label);
        }
      }
      if (trend.indexOf('📉') >= 0) {
        diving.push(label + ' ' + (latest||'?') + 'แต้ม');
      }
    }

    result[shName] = {
      critical:     critical,
      diving:       diving,
      noCoreIssue:  noCoreIssue,
      lateRenewal:  lateRenewals[shName] || []
    };
  });

  return result;
}

// ── ข้อความสรุปให้ MC Group ──────────────────────────────────
function _sendMCGroupSummary(teamData, dateStr) {
  var token = LINE_TOKENS['MC_GROUP'];
  if (!token || token.indexOf('YOUR_') >= 0) return;

  var msg = '\n🏆 BNI IDEAL — รายงานประจำสัปดาห์\n';
  msg += '📅 ' + dateStr + ' | กรุณาส่งรายงานก่อน 18:00\n';
  msg += '━━━━━━━━━━━━━━━━━━\n';

  var totalCritical = 0;
  var totalNoCore   = 0;

  Object.keys(teamData).forEach(function(team) {
    var d = teamData[team];
    totalCritical += d.critical.length;
    totalNoCore   += d.noCoreIssue.length;

    msg += '\n🛡️ ทีม ' + team + '\n';
    if (d.critical.length > 0) {
      msg += '🔴 วิกฤต: ' + d.critical.join(', ') + '\n';
    }
    if (d.diving.length > 0) {
      msg += '📉 ดิ่ง: ' + d.diving.join(', ') + '\n';
    }
    if (d.lateRenewal.length > 0) {
      msg += '💳 Renewal: ' + d.lateRenewal.join(', ') + '\n';
    }
    if (d.noCoreIssue.length > 0) {
      msg += '📝 ยังไม่กรอก Core Issue: ' + d.noCoreIssue.join(', ') + '\n';
    }
    if (d.critical.length===0 && d.diving.length===0 && d.lateRenewal.length===0) {
      msg += '✅ ไม่มีวิกฤต\n';
    }
  });

  msg += '\n━━━━━━━━━━━━━━━━━━\n';
  msg += '📊 รวม: วิกฤต ' + totalCritical + ' คน | ยังไม่กรอก ' + totalNoCore + ' คน';

  sendLineNotify(token, msg);
}

// ── ข้อความแยกให้แต่ละ Mentor ────────────────────────────────
function _sendEachMentorAlert(teamData, dateStr) {
  Object.keys(MENTOR_LINE_TOKEN).forEach(function(mentorName) {
    var tokenKey = MENTOR_LINE_TOKEN[mentorName];
    var token    = LINE_TOKENS[tokenKey];
    if (!token || token.indexOf('YOUR_') >= 0) return;

    var d = teamData[mentorName];
    if (!d) return;

    // ถ้าทีมดีหมด ไม่ส่ง (ลดสแปม)
    if (d.critical.length===0 && d.noCoreIssue.length===0 && d.lateRenewal.length===0) {
      return;
    }

    var msg = '\n🛡️ BNI IDEAL — Reminder สำหรับ Mentor ' + mentorName + '\n';
    msg += '📅 ' + dateStr + '\n';
    msg += '━━━━━━━━━━━━━━━━━━\n';

    if (d.critical.length > 0) {
      msg += '\n🔴 Mentee ที่ต้องดูแลด่วน:\n';
      d.critical.forEach(function(n) { msg += '  • ' + n + '\n'; });
    }

    if (d.diving.length > 0) {
      msg += '\n📉 ดิ่งต่อเนื่อง:\n';
      d.diving.forEach(function(n) { msg += '  • ' + n + '\n'; });
    }

    if (d.lateRenewal.length > 0) {
      msg += '\n💳 ต้องต่ออายุด่วน:\n';
      d.lateRenewal.forEach(function(n) { msg += '  • ' + n + '\n'; });
    }

    if (d.noCoreIssue.length > 0) {
      msg += '\n📝 กรอก Core Issue ก่อน 18:00:\n';
      d.noCoreIssue.forEach(function(n) { msg += '  • ' + n + '\n'; });
    }

    msg += '\n━━━━━━━━━━━━━━━━━━\n';
    msg += 'กรุณาส่งรายงานให้ตูมตามก่อน 18:00 น.';

    sendLineNotify(token, msg);
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ตั้ง Trigger ทุกพฤหัสบดี 07:00 (Run ครั้งเดียว)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function setupThursdayTrigger() {
  // ลบ trigger เก่า
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'thursdayMorningAlert') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // สร้างใหม่
  ScriptApp.newTrigger('thursdayMorningAlert')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(7)
    .create();

  Browser.msgBox(
    '✅ ตั้ง Trigger เรียบร้อย!\n\n' +
    'ทุกวันศุกร์ 07:00 น. ระบบจะส่ง Line แจ้งเตือนอัตโนมัติ:\n\n' +
    '• กลุ่ม MC — สรุปภาพรวมทุกทีม\n' +
    '• กลุ่ม Mentor แต่ละทีม — เฉพาะ Mentee ที่ต้องดูแล\n\n' +
    '⚠️ อย่าลืมใส่ LINE_TOKENS ใน Script L ก่อนนะครับ!\n' +
    'ไปที่: https://notify-bot.line.me/th/'
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ทดสอบส่ง Line (Run ก่อนตั้ง Trigger เพื่อเช็ค Token)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function testLineNotify() {
  var token = LINE_TOKENS['MC_GROUP'];
  if (!token || token.indexOf('YOUR_') >= 0) {
    Browser.msgBox('❌ ยังไม่ได้ใส่ Token!\n\nไปที่ https://notify-bot.line.me/th/\nแล้วแก้ YOUR_MC_GROUP_TOKEN_HERE ใน Script L');
    return;
  }

  var ok = sendLineNotify(token,
    '\n✅ BNI IDEAL Test Message\n' +
    'ระบบ Line Notify ทำงานได้ปกติแล้วครับ!\n' +
    'วันศุกร์หน้าจะเริ่มส่งอัตโนมัติ 07:00 น.'
  );

  Browser.msgBox(ok ?
    '✅ ส่ง Line Notify สำเร็จ! เช็คกลุ่ม Line ได้เลยครับ' :
    '❌ ส่งไม่ได้ — เช็ค Token อีกครั้งนะครับ'
  );
}

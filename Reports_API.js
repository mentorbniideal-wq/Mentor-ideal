function apiGetReports(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var teams = ['TOOMTAM','Aof','Draft','PHAI','AMP'];
  var reports = [];

  teams.forEach(function(teamName) {
    var sh = ss.getSheetByName(teamName);
    if (!sh) return;

    // Batch read col A–AC (rows 4–11) ในครั้งเดียว
    var data = sh.getRange(4, 1, 8, 29).getValues();

    data.forEach(function(row, i) {
      var name     = String(row[2]||'').trim();  // col C
      if (!name) return;

      var coreRaw  = String(row[23]||'').trim(); // col X
      if (!coreRaw) return;

      var nick     = String(row[3]||'').trim();  // col D

      // คะแนนล่าสุด — หาจาก col E–P (index 4–15) ย้อนหลัง
      var score = 0;
      for (var c = 15; c >= 4; c--) {
        var sv = parseFloat(row[c]);
        if (!isNaN(sv) && sv > 0) { score = sv; break; }
      }

      // Parse col X — new format: array, old format: object or plain text
      var history = [];
      try {
        var xp = JSON.parse(coreRaw);
        history = Array.isArray(xp) ? xp : [xp];
      } catch(e) {
        var tsMatch = coreRaw.match(/\[(\d{2}\/\d{2}(?:\/\d{2,4})?\s\d{2}:\d{2})\]\s*$/);
        history = [{
          coreIssue:   coreRaw.replace(/\n?Action:.*$/s,'').replace(/\n?แผน:.*$/s,'').replace(/\n?\[[\d\/\s:]+\]\s*$/,'').trim(),
          actionTaken: (coreRaw.match(/Action:\s*(.+?)(?:\n|$)/)||[])[1]||'',
          plan:        (coreRaw.match(/แผน:\s*(.+?)(?:\n|$)/)||[])[1]||'',
          savedAt:     tsMatch ? tsMatch[1] : ''
        }];
      }
      var current = history.length ? history[history.length - 1] : {};

      var reply  = String(row[26]||'').trim(); // col AA
      var status = String(row[27]||'').trim(); // col AB
      var doneAt = String(row[28]||'').trim(); // col AC

      reports.push({
        team:        teamName,
        row:         i + 4,
        memberName:  name,
        nick:        nick,
        score:       score,
        coreIssue:   current.coreIssue   || '',
        actionTaken: current.actionTaken || '',
        plan:        current.plan        || '',
        savedAt:     current.savedAt     || '',
        history:     history.length > 1 ? history.slice(0, -1) : [],
        reply:       reply,
        status:      status,
        doneAt:      doneAt
      });
    });
  });

  // no-reply ขึ้นก่อน → เรียงตามคะแนนน้อย→มาก
  reports.sort(function(a, b) {
    var aR = a.reply ? 1 : 0;
    var bR = b.reply ? 1 : 0;
    if (aR !== bR) return aR - bR;
    return a.score - b.score;
  });

  return { ok:true, reports:reports, total:reports.length };
}

// ── Set Report Status (Done / Reopen) ─────────────────────────
function apiSetReportStatus(p) {
  try {
    if (p.role !== 'mc') return { ok: false, error: 'Permission denied' };
    if (!p.teamName || !p.row || !p.status)
      return { ok: false, error: 'ข้อมูลไม่ครบ' };

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(p.teamName);
    if (!sh) return { ok: false, error: 'ไม่พบ Sheet: ' + p.teamName };

    var row = parseInt(p.row);
    if (isNaN(row) || row < 4 || row > 11)
      return { ok: false, error: 'Row ไม่ถูกต้อง' };

    var now = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), 'dd/MM/yy HH:mm'
    );

    sh.getRange(row, 28).setValue(p.status);
sh.getRange(row, 29).setValue(
  p.status === 'done'     ? 'MC ปิดเคส ' + now :
  p.status === 'reopened' ? 'Reopen ' + now : ''
);

if (p.status === 'done') {
  // Stamp closedAt on last history entry in col X
  var xRaw = String(sh.getRange(row, 24).getValue()).trim();
  if (xRaw) {
    try {
      var xp = JSON.parse(xRaw);
      var xArr = Array.isArray(xp) ? xp : [xp];
      if (xArr.length > 0) { xArr[xArr.length - 1].closedAt = now; }
      sh.getRange(row, 24).setValue(JSON.stringify(xArr));
    } catch(e) {}
  }
  sh.getRange(row, 26).setValue('');
}
if (p.status === 'reopened') {
  sh.getRange(row, 26).setValue('💬 MC เปิดเคสใหม่ [' + now + '] กรุณาติดตามผลครับ');
}

    return { ok: true, status: p.status };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}
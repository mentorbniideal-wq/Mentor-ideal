// ============================================================
// BNI IDEAL — WebApp v2 : Complete Server
// ============================================================

var APP_VERSION = 'v3.0';
var APP_VERSION_DATE = '20/05/2026';

var PINS = {
  'mc':      '6969',
  'toomtam': '6969',
  'aof':     '2539',
  'draft':   '1010',
  'phai':    '2519',
  'amp':     '9999',
  'growth':  '0000'
};

var MENTOR_ROLE = {
  'toomtam':'TOOMTAM','aof':'Aof','draft':'Draft','phai':'PHAI','amp':'AMP'
};

var MONTH_LABELS = ['','','','','JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('BNI IDEAL Mentor System')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport','width=device-width,initial-scale=1.0,maximum-scale=1.0');
}

// ── Router ────────────────────────────────────────────────────
function dispatch(payload) {
  try {
    var a = payload.action;
    if (a==='login')           return apiLogin(payload);
    if (a==='getDashboard')    return apiGetDashboard(payload);
    if (a==='getMemberDetail') return apiGetMemberDetail(payload);
    if (a==='getMyTeam')       return apiGetMyTeam(payload);
    if (a==='getScorecard')    return apiGetScorecard(payload);
    if (a==='getRenewal')      return apiGetRenewal(payload);
    if (a==='getMessages')     return apiGetMessages(payload);
    if (a==='getMemberList')   return apiGetMemberList(payload);
    if (a==='saveCoreIssue')   return apiSaveCoreIssue(payload);
    if (a==='saveMCMessage')   return apiSaveMCMessage(payload);
    if (a==='getGrowthData')   return apiGetGrowthData(payload);
    if (a==='parseCheckin')    return parseCheckinCSV(payload.text);
    if (a==='saveCheckin')     return apiSaveCheckin(payload);
    if (a==='getCheckinLog')   return apiGetCheckinLog(payload);
    if (a==='getAIMatching')   return apiGetRuleMatching(payload);
    if (a==='getTeamNotifs')   return apiGetTeamNotifs(payload);
    if (a==='ackTeamNotifs')   return apiAckTeamNotifs(payload);
    if (a==='setReportStatus') return apiSetReportStatus(payload);
    if (a==='getReports')      return apiGetReports(payload);
    if (a==='getUnreadCounts') return apiGetUnreadCounts(payload);
    if (a==='saveReply')       return apiSaveReply(payload);
    if (a==='getNewMembers')    return apiGetNewMembers(payload);
    if (a==='getNMChecklist')   return apiGetNMChecklist(payload);
    if (a==='saveNMCheckItem')  return apiSaveNMCheckItem(payload);
    if (a==='addNewMember')     return apiAddNewMember(payload);
    if (a==='getPowerTeams')       return apiGetPowerTeams(payload);
    if (a==='getMentorActivity')   return apiGetMentorActivity(payload);
    if (a==='getWeeklyActions')    return apiGetWeeklyActions(payload);
    if (a==='createGrowthTask')    return apiCreateGrowthTask(payload);
    if (a==='getGrowthTasks')      return apiGetGrowthTasks(payload);
    if (a==='respondGrowthTask')   return apiRespondGrowthTask(payload);
    if (a==='getRiskMembers')      return apiGetRiskMembers(payload);
    if (a==='getMemberDirectory')  return apiGetMemberDirectory();
    if (a==='getCoachingGuide')    return apiGetCoachingGuide(payload);
    if (a==='save121Log')          return apiSave121Log(payload);
    if (a==='get121Logs')          return apiGet121Logs(payload);
    if (a==='sendBroadcast')       return apiSendBroadcast(payload);
    if (a==='getBroadcasts')       return apiGetBroadcasts(payload);
    if (a==='getMentorPerformance')return apiGetMentorPerformance(payload);
    if (a==='getAlertCenter')      return apiGetAlertCenter(payload);
    if (a==='getMeetingPrep')      return apiGetMeetingPrep(payload);
    if (a==='getChapterPulse')     return apiGetChapterPulse(payload);
    if (a==='getLeaderboard')      return apiGetLeaderboard(payload);
    if (a==='getVisitorTracker')   return apiGetVisitorTracker(payload);
    if (a==='getChapterActions')   return apiGetChapterActions(payload);
    if (a==='createMCAssignment')  return apiCreateMCAssignment(payload);
    if (a==='getMCAssignments')    return apiGetMCAssignments(payload);
    if (a==='getMentorAssignments')return apiGetMentorAssignments(payload);
    if (a==='ackAssignment')       return apiAckAssignment(payload);

    return { ok: false, error: 'unknown action' };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

// ── Login ─────────────────────────────────────────────────────
function apiLogin(p) {
  var role = String(p.role||'').toLowerCase();
  var pin  = String(p.pin||'');
  if (!PINS[role]) return { ok:false, error:'ไม่พบ role นี้' };
  if (PINS[role]!==pin) return { ok:false, error:'PIN ไม่ถูกต้อง' };
  var names = { mc:'ตูมตาม (MC)',toomtam:'TOOMTAM (ตูมตาม)',aof:'Aof (อ็อฟ)',draft:'Draft (ดราฟ)',phai:'PHAI (ไผ่)',amp:'AMP (แอมป์)',growth: 'Growth Coordinator', };
  return { ok:true, role:role, isMC:(role==='mc'), teamName:MENTOR_ROLE[role]||null, displayName:names[role]||role, version:APP_VERSION, versionDate:APP_VERSION_DATE };
}

// ── Dashboard (all members) ───────────────────────────────────
function apiGetDashboard(p) {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var r2ySh = ss.getSheetByName('Reporting2You');
  var masterSh = ss.getSheetByName('รายชื่อทั้งหมด');
  if (!masterSh) return { ok:false, error:'ไม่พบ Sheet รายชื่อทั้งหมด' };

  // Build R2Y lookup map
  var r2yMap = {};
  if (r2ySh) {
    var r2yData = r2ySh.getDataRange().getValues();
    for (var j=1; j<r2yData.length; j++) {
      var rn = String(r2yData[j][0]).replace(/\s*\(BNI Ideal\)/i,'').trim();
      if (rn) r2yMap[rn] = r2yData[j];
    }
  }

  var members = [];
  var summary = { green:0,yellow:0,red:0,black:0 };
  var alerts  = [];
  var masterData = masterSh.getDataRange().getValues();

  for (var i=2; i<masterData.length; i++) {
    var row = masterData[i];
    var name   = String(row[1]||'').trim();
    var nick   = String(row[2]||'').trim();
    var mentor = String(row[3]||'').trim();
    var score  = parseFloat(row[4])||0;
    var tl     = String(row[5]||'');
    var given  = parseFloat(row[6])||0;
    var recv   = parseFloat(row[7])||0;
    var balance= String(row[8]||'');
    if (!name||score===0) continue;

    var tlKey = score>=70?'green':score>=50?'yellow':score>=30?'red':'black';
    summary[tlKey]++;

    var r2y = r2yMap[name] || null;
    var phone = r2y ? String(r2y[15]||'') : '';
    var email = r2y ? String(r2y[14]||'') : '';
    var tyfcb = r2y ? parseFloat(r2y[6])||0 : 0;
    var absent= r2y ? parseInt(r2y[10])||0 : 0;

    var m = { name:name,nick:nick,mentor:mentor,score:score,tl:tlKey,
              given:given,recv:recv,balance:balance,phone:phone,email:email,
              tyfcb:tyfcb,absent:absent };
    members.push(m);

    if (tlKey==='black'||absent>=3) alerts.push(m);
  }

  return { ok:true, members:members, summary:summary, alerts:alerts };
}

// ── Member Detail (ข้อมูลเต็ม + score history + coaching) ────
function apiGetMemberDetail(p) {
  var name = String(p.memberName||'').replace(/\s*\([^)]+\)\s*$/,'').trim();
  if (!name) return { ok:false, error:'ต้องระบุชื่อ' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var masterSh = ss.getSheetByName('รายชื่อทั้งหมด');
  var r2ySh    = ss.getSheetByName('Reporting2You');
  if (!masterSh||!r2ySh) return { ok:false, error:'ไม่พบ Sheet' };

  // หาจาก master
  var masterData = masterSh.getDataRange().getValues();
  var masterRow = null;
  for (var i=2;i<masterData.length;i++) {
    if (String(masterData[i][1]).trim()===name) { masterRow=masterData[i]; break; }
  }

  // หาจาก R2Y
  var r2yData = r2ySh.getDataRange().getValues();
  var r2yRow = null;
  for (var j=1;j<r2yData.length;j++) {
    var rn = String(r2yData[j][0]).replace(/\s*\(BNI Ideal\)/i,'').trim();
    if (rn===name) { r2yRow=r2yData[j]; break; }
  }

  if (!masterRow) return { ok:false, error:'ไม่พบ "'+name+'" ใน รายชื่อทั้งหมด' };
  if (!r2yRow)    return { ok:false, error:'ไม่พบ "'+name+'" ใน Reporting2You' };

  var score  = parseFloat(masterRow[4])||0;
  var mentor = String(masterRow[3]||'—');
  var nick   = String(masterRow[2]||'');
  var given  = parseFloat(masterRow[6])||0;
  var recv   = parseFloat(masterRow[7])||0;
  var balance= String(masterRow[8]||'');

  var actual = {
    rg:      parseInt(r2yRow[1])||0,
    rr:      parseInt(r2yRow[2])||0,
    visitor: parseInt(r2yRow[3])||0,
    oToOne:  parseInt(r2yRow[4])||0,
    ceu:     parseInt(r2yRow[5])||0,
    tyfcb:   parseFloat(r2yRow[6])||0,
    bniDays: parseInt(r2yRow[8])||0,
    attend:  parseInt(r2yRow[9])||0,
    absent:  parseInt(r2yRow[10])||0,
    late:    parseInt(r2yRow[11])||0,
    sub:     parseInt(r2yRow[13])||0,
    email:   String(r2yRow[14]||''),
    phone:   String(r2yRow[15]||'')
  };

  var weeks = Math.min(26,Math.max(1,Math.floor(actual.bniDays/7)));
  var target = {
    referral:weeks*2, visitor:Math.max(1,Math.ceil((weeks/26)*2)),
    oToOne:weeks*2,  ceu:Math.max(1,Math.ceil((weeks/26)*4)), attend:weeks
  };

  // Score history + Core Issue จาก Mentor Sheet (batch read ครั้งเดียว)
  var scoreHistory  = [];
  var coreIssueData = null;
  var mcReplyData   = '';
  var mentorSheetName = _findMentorSheet(ss, name);
  if (mentorSheetName) {
    var msh = ss.getSheetByName(mentorSheetName);
    if (msh) {
      // col C ถึง AA (cols 3–27 = 25 cols), rows 4–11
      var shData = msh.getRange(4, 3, 8, 25).getValues();
      for (var r = 0; r < shData.length; r++) {
        if (String(shData[r][0]||'').trim() !== name) continue;
        // Score history: col E–P = shData indices 2–13
        for (var c = 2; c <= 13; c++) {
          var sv = shData[r][c];
          scoreHistory.push({ month:MONTH_LABELS[c+3]||'', score:sv?parseFloat(sv):null });
        }
        // Core Issue: col X = index 21
        var coreRaw = String(shData[r][21]||'').trim();
        try { coreIssueData = JSON.parse(coreRaw); }
        catch(e) { if (coreRaw) coreIssueData = { coreIssue: coreRaw }; }
        // MC Reply: col AA = index 24
        mcReplyData = String(shData[r][24]||'').trim();
        break;
      }
    }
  }

  // Attendance risk
  var attendRisk = actual.absent>=5?'critical':actual.absent>=3?'danger':actual.absent>=1?'warning':'ok';

  // Priorities
  var priorities = _computePriorities(actual, target, weeks);

  return {
    ok:true, name:name, nick:nick, mentor:mentor, score:score,
    given:given, recv:recv, balance:balance,
    actual:actual, target:target, weeks:weeks,
    scoreHistory:scoreHistory, attendRisk:attendRisk,
    priorities:priorities,
    coreIssue: coreIssueData,   // ← เพิ่ม
    mcReply:   mcReplyData      // ← เพิ่ม
  };
}

function _findMentorSheet(ss, memberName) {
  var sheets = ['TOOMTAM','Aof','Draft','PHAI','AMP'];
  for (var s=0;s<sheets.length;s++) {
    var sh = ss.getSheetByName(sheets[s]);
    if (!sh) continue;
    for (var r=4;r<=11;r++) {
      if (sh.getRange(r,3).getDisplayValue().trim()===memberName) return sheets[s];
    }
  }
  return null;
}

// ── My Team ───────────────────────────────────────────────────
function apiGetMyTeam(p) {
  var teamName = MENTOR_ROLE[p.role];
  if (!teamName) return { ok:false, error:'ไม่พบทีม' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(teamName);
  if (!sh) return { ok:false, error:'ไม่พบ Sheet '+teamName };

  var r2ySh = ss.getSheetByName('Reporting2You');
  var r2yMap = {};
  if (r2ySh) {
    var r2yData = r2ySh.getDataRange().getValues();
    for (var j=1;j<r2yData.length;j++) {
      var rn = String(r2yData[j][0]).replace(/\s*\(BNI Ideal\)/i,'').trim();
      if (rn) r2yMap[rn] = r2yData[j];
    }
  }

  // Batch read col C–Z (rows 4–11) ครั้งเดียว — col 3 ถึง 26 = 24 cols
  var rawData = sh.getRange(4, 3, 8, 24).getValues();
  var members = [];
  for (var i = 0; i < rawData.length; i++) {
    var row  = rawData[i];
    var name = String(row[0]||'').trim();   // col C
    if (!name) continue;
    var nick = String(row[1]||'').trim();   // col D
    var scores = [];
    for (var c = 2; c <= 13; c++) {         // col E–P = indices 2–13
      scores.push({ month:MONTH_LABELS[c+3]||'', score:row[c]?parseFloat(row[c]):null });
    }
    var latest = null;
    for (var j = scores.length-1; j >= 0; j--) {
      if (scores[j].score !== null && scores[j].score > 0) { latest = scores[j].score; break; }
    }
    var trend   = String(row[14]||'');  // col Q
    var status  = String(row[15]||'');  // col R
    var renewal = String(row[20]||'');  // col W
    var core    = String(row[21]||'');  // col X
    var mcMsg   = String(row[23]||'');  // col Z
    var r2y     = r2yMap[name]||null;
    var phone   = r2y?String(r2y[15]||''):'';
    var email   = r2y?String(r2y[14]||''):'';
    var absent  = r2y?parseInt(r2y[10])||0:0;
    var tl      = !latest?'none':latest>=70?'green':latest>=50?'yellow':latest>=30?'red':'black';

    members.push({ row:i+4,name:name,nick:nick,scores:scores,latest:latest,
      trend:trend,status:status,tl:tl,renewal:renewal,core:core,mcMsg:mcMsg,
      phone:phone,email:email,absent:absent });
  }
  return { ok:true, teamName:teamName, members:members };
}

// ── Scorecard ─────────────────────────────────────────────────
function apiGetScorecard(p) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var TEAMS = ['TOOMTAM','Aof','Draft','PHAI','AMP'];

  // ─ หา thisCol / prevCol จาก TOOMTAM (batch read row 4 cols E–P) ─
  var thisCol = 7, prevCol = 6;
  var sampleSh = ss.getSheetByName('TOOMTAM');
  if (sampleSh) {
    var sRow = sampleSh.getRange(4, 5, 1, 12).getValues()[0]; // col E–P
    for (var c = 11; c >= 0; c--) {
      if (parseFloat(sRow[c]) > 0) {
        thisCol = c + 5; // col E = 5
        prevCol = thisCol > 5 ? thisCol - 1 : 5;
        break;
      }
    }
  }
  var thisMonth = MONTH_LABELS[thisCol] || ('M'+thisCol);
  var prevMonth = MONTH_LABELS[prevCol] || ('M'+prevCol);

  function zone(s) {
    return s >= 70 ? 'green' : s >= 50 ? 'yellow' : s >= 30 ? 'red' : s > 0 ? 'black' : 'none';
  }
  var zoneLabel = { green:'🟢 เขียว', yellow:'🟡 เหลือง', red:'🔴 แดง', black:'⚫ ดำ', none:'—' };

  var teamResults = [];
  var allMembers  = [];  // เก็บทุกคนเพื่อ chapter-level analysis

  TEAMS.forEach(function(shName) {
    var sh = ss.getSheetByName(shName);
    if (!sh) return;

    // Batch read rows 4–11, col C(3) ถึง Q(17) = 15 cols
    var data = sh.getRange(4, 3, 8, 15).getValues();
    var tScores = [], pScores = [], rBlk = 0, div = 0;

    data.forEach(function(row) {
      var name = String(row[0] || '').trim(); // col C = idx 0
      if (!name) return;
      var nick = String(row[1] || '').trim(); // col D = idx 1
      // col E=idx2, col F=idx3, … thisCol - 3 = idx offset
      var tS = parseFloat(row[thisCol - 3]) || 0; // thisCol relative to col C(3)
      var pS = parseFloat(row[prevCol - 3]) || 0;
      var trend = String(row[14] || ''); // col Q = idx 14

      if (tS > 0) { tScores.push(tS); if (tS < 50) rBlk++; }
      if (pS > 0)   pScores.push(pS);
      if (trend.indexOf('📉') >= 0) div++;

      var tZone = zone(tS), pZone = zone(pS);
      var diff  = (tS > 0 && pS > 0) ? Math.round((tS - pS) * 10) / 10 : null;

      allMembers.push({
        name: name, nick: nick, team: shName,
        thisScore: tS, prevScore: pS, diff: diff,
        thisZone: tZone, prevZone: pZone,
        zoneChanged: tZone !== pZone && tZone !== 'none' && pZone !== 'none'
      });
    });

    var tA  = tScores.length ? tScores.reduce(function(a,b){return a+b;}) / tScores.length : 0;
    var pA  = pScores.length ? pScores.reduce(function(a,b){return a+b;}) / pScores.length : 0;
    var dif = tA - pA;
    var g   = tA - (rBlk / Math.max(1, tScores.length)) * 10 - div * 2;

    teamResults.push({
      name:    shName,
      count:   tScores.length,
      thisAvg: Math.round(tA * 10) / 10,
      prevAvg: Math.round(pA * 10) / 10,
      diff:    Math.round(dif * 10) / 10,
      redBlk:  rBlk,
      diving:  div,
      grade:   g >= 68 ? 'A' : g >= 58 ? 'B' : g >= 48 ? 'C' : 'D'
    });
  });

  // ─ Chapter-level Movement Analysis ───────────────────────────
  var moveUp = 0, moveDn = 0, moveSame = 0;
  var zoneUp = [], zoneDn = [];
  var withDiff = allMembers.filter(function(m){ return m.diff !== null; });

  withDiff.forEach(function(m) {
    if      (m.diff >  2) moveUp++;
    else if (m.diff < -2) moveDn++;
    else                  moveSame++;

    if (m.zoneChanged) {
      var zones = ['black','red','yellow','green'];
      var fromIdx = zones.indexOf(m.prevZone);
      var toIdx   = zones.indexOf(m.thisZone);
      if (toIdx > fromIdx) {
        zoneUp.push({ name:m.name, nick:m.nick, team:m.team,
          from: zoneLabel[m.prevZone], to: zoneLabel[m.thisZone], diff: m.diff });
      } else {
        zoneDn.push({ name:m.name, nick:m.nick, team:m.team,
          from: zoneLabel[m.prevZone], to: zoneLabel[m.thisZone], diff: m.diff });
      }
    }
  });

  // Top Improved / Most Declined (top 3 each)
  var sorted  = withDiff.slice().sort(function(a,b){ return b.diff - a.diff; });
  var topImproved = sorted.slice(0, 3).filter(function(m){ return m.diff > 0; })
    .map(function(m){ return { name:m.name, nick:m.nick, team:m.team,
      from:m.prevScore, to:m.thisScore, diff:m.diff }; });
  var topDeclined = sorted.slice(-3).reverse().filter(function(m){ return m.diff < 0; })
    .map(function(m){ return { name:m.name, nick:m.nick, team:m.team,
      from:m.prevScore, to:m.thisScore, diff:m.diff }; });

  return {
    ok: true,
    teams:       teamResults,
    thisMonth:   thisMonth,
    prevMonth:   prevMonth,
    movement: {
      up:       moveUp,
      down:     moveDn,
      same:     moveSame,
      total:    withDiff.length,
      zoneUp:   zoneUp,
      zoneDn:   zoneDn
    },
    topImproved: topImproved,
    topDeclined: topDeclined
  };
}

// ── Renewal ───────────────────────────────────────────────────
function apiGetRenewal(p) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('💳 RENEWAL');
  if (!sh) return { ok:false, error:'ไม่พบ Sheet RENEWAL' };
  var today=new Date(); today.setHours(0,0,0,0);
  var items=[];
  for (var r=3;r<=sh.getLastRow();r++) {
    var name=sh.getRange(r,1).getDisplayValue().trim();
    var team=sh.getRange(r,2).getDisplayValue().trim();
    var expRaw=sh.getRange(r,3).getValue();
    if (!name||!expRaw) continue;
    var expDate=new Date(expRaw); expDate.setHours(0,0,0,0);
    if (isNaN(expDate.getTime())) continue;
    var diff=Math.floor((expDate-today)/86400000);
    var status=diff<0?'late':diff<=30?'soon':diff<=90?'normal':'ok';
    if (p.role!=='mc'&&MENTOR_ROLE[p.role]&&team!==MENTOR_ROLE[p.role]) continue;
    items.push({ name:name,team:team,diffDays:diff,status:status,
      expStr:Utilities.formatDate(expDate,Session.getScriptTimeZone(),'dd MMM yyyy') });
  }
  items.sort(function(a,b){return a.diffDays-b.diffDays;});
  return { ok:true, items:items };
}

// ── Messages ──────────────────────────────────────────────────
function apiGetMessages(p) {
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sheets=p.role==='mc'?['TOOMTAM','Aof','Draft','PHAI','AMP']:[MENTOR_ROLE[p.role]];
  var msgs=[];
  sheets.forEach(function(shName) {
    var sh=ss.getSheetByName(shName); if (!sh) return;
    var data=sh.getRange(4,3,8,24).getValues(); // cols C(3)–Z(26), rows 4–11
    for (var i=0;i<data.length;i++) {
      var name=String(data[i][0]||'').trim();  // col C
      var nick=String(data[i][1]||'').trim();  // col D
      var msg =String(data[i][23]||'').trim(); // col Z (index 23 = col 26)
      if (name&&msg) msgs.push({ team:shName,name:name,nick:nick,msg:msg,row:i+4 });
    }
  });
  return { ok:true, messages:msgs };
}

// ── Member List ───────────────────────────────────────────────
function apiGetMemberList(p) {
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('รายชื่อทั้งหมด');
  if (!sh) return { ok:false, error:'ไม่พบ Sheet' };
  var members=[];
  for (var r=3;r<=sh.getLastRow();r++) {
    var name=sh.getRange(r,2).getDisplayValue().trim();
    var nick=sh.getRange(r,3).getDisplayValue().trim();
    var mentor=sh.getRange(r,4).getDisplayValue().trim();
    var score=parseFloat(sh.getRange(r,5).getValue())||0;
    if (!name) continue;
    var mentorSheets=['TOOMTAM','Aof','Draft','PHAI','AMP'];
    if (p.role!=='mc'&&MENTOR_ROLE[p.role]&&mentorSheets.indexOf(mentor)<0) continue;
    members.push({ name:name,nick:nick,mentor:mentor,score:score,
      display:nick?name+' ('+nick+')':name });
  }
  return { ok:true, members:members };
}

// ── Save Core Issue (append to history array) ─────────────────
function apiSaveCoreIssue(p) {
  var teamName=MENTOR_ROLE[p.role];
  if (!teamName) return { ok:false, error:'Permission denied' };
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName(teamName);
  if (!sh) return { ok:false, error:'ไม่พบ Sheet' };
  var row=parseInt(p.row);
  if (row<4||row>11) return { ok:false, error:'Row ไม่ถูกต้อง' };
  var existing=sh.getRange(row,3).getDisplayValue().trim();
  if (existing!==p.memberName) return { ok:false, error:'ชื่อไม่ตรง' };
  var ts=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'dd/MM/yy HH:mm');

  // Read and parse existing history (handle old single-object or plain-text formats)
  var existingRaw = String(sh.getRange(row, 24).getValue()).trim();
  var history = [];
  if (existingRaw) {
    try {
      var xp = JSON.parse(existingRaw);
      history = Array.isArray(xp) ? xp : [xp];
    } catch(e) {
      history = [{ coreIssue: existingRaw, savedAt: ts }];
    }
  }

  // Append new entry; keep max 10
  history.push({ coreIssue: p.coreIssue||'', actionTaken: p.actionTaken||'', plan: p.plan||'', savedAt: ts });
  if (history.length > 10) history = history.slice(-10);

  sh.getRange(row, 24).setValue(JSON.stringify(history));
  // Reset case status — new submission reopens the case
  sh.getRange(row, 28).setValue('');
  sh.getRange(row, 29).setValue('');

  try {
    var nick = sh.getRange(row, 4).getDisplayValue().trim();
    var scoreBefore = parseFloat(sh.getRange(row, 17).getValue()) || 0;
    logAction(p.role, teamName, p.memberName, nick, scoreBefore, p.coreIssue, p.actionTaken, p.plan);
  } catch(e) { Logger.log('Log err: '+e.message); }
  return { ok:true, message:'บันทึกเรียบร้อยแล้ว' };
}

// ── Save MC Message ───────────────────────────────────────────
function apiSaveMCMessage(p) {
  if (p.role!=='mc') return { ok:false, error:'Permission denied' };
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName(p.teamName);
  if (!sh) return { ok:false, error:'ไม่พบ Sheet' };
  var row=parseInt(p.row);
  if (row<4||row>11) return { ok:false, error:'Row ไม่ถูกต้อง' };
  sh.getRange(row,26).setValue(p.message||'');
  return { ok:true, message:'บันทึกข้อความแล้ว' };
}
// ── Get Reports → อยู่ใน Reports_API.js (version ที่สมบูรณ์กว่า)

// ── Save Reply (MC ตอบกลับ Mentor) ───────────────────────────
function apiSaveReply(p) {
  try {
    if (p.role !== 'mc') return { ok: false, error: 'Permission denied' };
    if (!p.teamName || !p.row || !p.reply)
      return { ok: false, error: 'ข้อมูลไม่ครบ: teamName='+p.teamName+' row='+p.row };

    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var sh  = ss.getSheetByName(p.teamName);
    if (!sh) return { ok: false, error: 'ไม่พบ Sheet: ' + p.teamName };

    var row = parseInt(p.row);
    if (isNaN(row) || row < 4 || row > 11)
      return { ok: false, error: 'Row ไม่ถูกต้อง' };

    var now = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), 'dd/MM/yy HH:mm'
    );
    var existing = sh.getRange(row, 27).getValue().toString().trim();
    var newReply = '[MC ' + now + ']\n' + p.reply.toString().trim();
    var finalVal = existing ? existing + '\n\n' + newReply : newReply;

    sh.getRange(row, 27).setValue(finalVal);

    // col Z (26) = ข้อความที่ Mentor เห็นใน MC Msg tab
    var mcMsgForMentor = '💬 MC ตอบ [' + now + ']:\n' + p.reply.toString().trim();
    sh.getRange(row, 26).setValue(mcMsgForMentor);
    Logger.log('col Z set to: ' + mcMsgForMentor);

    try {
      var logSh = ss.getSheetByName('📜 ACTION LOGS');
      if (logSh) logSh.appendRow([
        new Date(), 'MC_REPLY', p.teamName, p.memberName || '', p.reply.toString().trim()
      ]);
    } catch(le) {}

    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}
// ── Priority Engine ───────────────────────────────────────────
function _computePriorities(actual, target, weeks) {
  var list=[];
  if (actual.absent>=1) {
    var t,a,tgt,em;
    if (actual.absent>=5) { t='🏛️ [🚨 วิกฤต!] Attendance'; a='ขาดไปแล้ว '+actual.absent+' ครั้ง — เสี่ยงต้องดรอป\nBNI เกณฑ์: ขาด 5-6 ครั้ง = ต้องดรอปออก'; tgt='มาทุกครั้งที่เหลือ + ปรึกษา MC ทันที'; em=true; }
    else if (actual.absent>=3) { t='🏛️ [⚠️ อันตราย] Attendance'; a='ขาดไปแล้ว '+actual.absent+' ครั้ง — เสี่ยงเปิดเก้าอี้\nBNI เกณฑ์: ขาด 3 ครั้ง = Chapter มีสิทธิ์เปิดเก้าอี้'; tgt='ห้ามขาดอีกแม้แต่ครั้งเดียว'; em=true; }
    else { t='🏛️ [📋 ระวัง] Attendance'; a='ขาดไปแล้ว '+actual.absent+' ครั้ง (Rolling 6 เดือน)\nขาดได้อีกแค่ '+Math.max(0,2-actual.absent)+' ครั้งก่อนถึงเกณฑ์เสี่ยง'; tgt='มาทุกวันศุกร์ไม่มีข้อยกเว้น'; em=false; }
    list.push({ type:em?'emergency':'warning',title:t,action:a,target:tgt });
  }
  var ceuGap=target.ceu-actual.ceu;
  if (ceuGap>0) list.push({ type:'quick',title:'📚 [⚡ Quick Win] CEU',
    action:'ได้ '+actual.ceu+'/'+target.ceu+' แต้ม → ขาดอีก '+ceuGap+' — เรียนได้ทันทีใน BNI Connect',
    target:'เรียนให้ครบ '+ceuGap+' แต้มภายใน 2 สัปดาห์' });
  var oGap=target.oToOne-actual.oToOne;
  if (oGap>0) list.push({ type:'quick',title:'🤝 [⚡ Quick Win] 1-2-1',
    action:'ทำแล้ว '+actual.oToOne+'/'+target.oToOne+' ครั้ง → ขาดอีก '+oGap+' ครั้ง',
    target:'นัด '+Math.min(Math.ceil(oGap/4),3)+' ครั้ง/สัปดาห์' });
  var rGap=target.referral-actual.rg;
  if (rGap>0) list.push({ type:'plan',title:'💡 [📋 วางแผน] Referral',
    action:'ให้แล้ว '+actual.rg+'/'+target.referral+' ใบ | รับแล้ว '+actual.rr+' ใบ → ขาดให้อีก '+rGap+' ใบ',
    target:'ให้ '+Math.min(Math.ceil(rGap/4),3)+' ใบ/สัปดาห์' });
  var vGap=target.visitor-actual.visitor;
  if (vGap>0) list.push({ type:'plan',title:'👥 [🎯 ROI สูง] Visitor',
    action:'พาแขกแล้ว '+actual.visitor+'/'+target.visitor+' คน → ขาดอีก '+vGap+' คน',
    target:'ชวนแขก '+vGap+' คนใน 4 สัปดาห์' });
  return list.slice(0,3);
}

// ── Unread Counts (Notification badges บน Login screen) ──────
function apiGetUnreadCounts(p) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var teams = ['TOOMTAM','Aof','Draft','PHAI','AMP'];
    var counts = {};

    teams.forEach(function(teamName) {
      var sh = ss.getSheetByName(teamName);
      if (!sh) { counts[teamName]=0; return; }

      // Batch read col Z (26) และ AA (27) rows 4–11
      var data = sh.getRange(4, 26, 8, 2).getValues();
      var unread = 0;

      data.forEach(function(row) {
        var mcMsg  = String(row[0]||'').trim(); // col Z = MC message
        var reply  = String(row[1]||'').trim(); // col AA = MC reply
        // นับ: มี MC Msg (reply จาก MC) แต่ Mentor ยังไม่ได้ acknowledge
        // ใช้ logic: col Z มีข้อความที่ขึ้นต้นด้วย 💬
        if (mcMsg && mcMsg.indexOf('💬') === 0) unread++;
      });

      counts[teamName] = unread;
    });

    return { ok: true, counts: counts };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Get Team Notifications ────────────────────────────────────
function apiGetTeamNotifs(p) {
  try {
    var teamName = p.teamName;
    if (!teamName) return { ok: false, error: 'ไม่มี teamName' };

    var ss   = SpreadsheetApp.getActiveSpreadsheet();
    var sh   = ss.getSheetByName(teamName);
    if (!sh) return { ok: false, error: 'ไม่พบ Sheet' };

    // Batch read col C,D,Z rows 4–11
    var nameData  = sh.getRange(4, 3, 8, 2).getValues(); // col C,D
    var notifData = sh.getRange(4, 26, 8, 1).getValues(); // col Z

    var notifs = [];
    for (var i = 0; i < 8; i++) {
      var name = String(nameData[i][0]||'').trim();
      var nick = String(nameData[i][1]||'').trim();
      var msg  = String(notifData[i][0]||'').trim();

      // แสดงเฉพาะที่ขึ้นต้นด้วย 💬 (MC ตอบแล้ว ยังไม่ได้ acknowledge)
      if (!name || msg.indexOf('💬') !== 0) continue;

      // ดึง timestamp จาก format "💬 MC ตอบ [dd/MM/yy HH:mm]:\nข้อความ"
      var tsMatch = msg.match(/\[([^\]]+)\]/);
      var savedAt = tsMatch ? tsMatch[1] : '';
      var msgBody = msg.replace(/^💬 MC ตอบ \[[^\]]+\]:\n?/,'').trim();

      notifs.push({
        row:        i + 4,
        memberName: name,
        nick:       nick,
        savedAt:    savedAt,
        msg:        msgBody
      });
    }

    return { ok: true, notifs: notifs };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Acknowledge Notifications (ล้าง col Z) ────────────────────
function apiAckTeamNotifs(p) {
  try {
    var teamName = p.teamName;
    if (!teamName) return { ok: false, error: 'ไม่มี teamName' };

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(teamName);
    if (!sh) return { ok: false, error: 'ไม่พบ Sheet' };

    var notifData = sh.getRange(4, 26, 8, 1).getValues();
    for (var i = 0; i < 8; i++) {
      var msg = String(notifData[i][0]||'').trim();
      if (msg.indexOf('💬') === 0) {
        // เปลี่ยนจาก 💬 → ✅ เพื่อบันทึกว่าอ่านแล้ว แต่ไม่ลบ
        var acked = msg.replace('💬','✅');
        sh.getRange(i + 4, 26).setValue(acked);
      }
    }

    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Constants ─────────────────────────────────────────────────
var NM_TEMPLATE_ID = '190d3_bji0vT8HbNVFD2w6VgHv2lxAeR3tmAhv2vemOU';
var NM_FOLDER_ID   = '14HqUyqd247wltgsZDyw2oEE0m9EmIE5B';
var NM_SHEET_NAME = '🆕 NEW MEMBERS';
var NM_DATA_ROW    = 12; // row แรกของข้อมูล

// ── Get New Members List ───────────────────────────────────────
function apiGetNewMembers(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(NM_SHEET_NAME);
    if (!sh) return { ok: false, error: 'ไม่พบ Sheet NEW MEMBERS' };

    var lastRow = sh.getLastRow();
    if (lastRow < NM_DATA_ROW) return { ok: true, members: [] };

    var numRows  = lastRow - NM_DATA_ROW + 1;
    var data     = sh.getRange(NM_DATA_ROW, 2, numRows, 10).getValues();
    var formulas = sh.getRange(NM_DATA_ROW, 2, numRows, 10).getFormulas();

    var members = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var name      = String(row[1]||'').trim(); // col C
      var mentorVal = String(row[3]||'').trim(); // col E
      var startVal  = row[4];                    // col F

      if (!name || !mentorVal || !startVal) continue;
      if (name.length > 60) continue;

      var startDate = startVal instanceof Date
        ? Utilities.formatDate(startVal, Session.getScriptTimeZone(), 'dd/MM/yy') : String(startVal);
      var w8Val   = row[5];
      var w8Str   = w8Val instanceof Date
        ? Utilities.formatDate(w8Val, Session.getScriptTimeZone(), 'dd/MM/yy') : String(w8Val||'');
      var expVal  = row[8];
      var expStr  = expVal instanceof Date
        ? Utilities.formatDate(expVal, Session.getScriptTimeZone(), 'dd/MM/yy') : String(expVal||'');

      // ดึง URL จาก HYPERLINK formula หรือ plain URL
      var fileUrl = '';
      var formula = String(formulas[i][9]||'');
      var urlMatch = formula.match(/HYPERLINK\s*\(\s*"([^"]+)"/i);
      if (urlMatch) {
        fileUrl = urlMatch[1];
      } else {
        var plain = String(row[9]||'').trim();
        if (plain.indexOf('http') === 0) fileUrl = plain;
      }

      members.push({
        rowNum:    i + NM_DATA_ROW,
        seq:       row[0],
        name:      name,
        nick:      String(row[2]||'').trim(),
        mentor:    mentorVal,
        startDate: startDate,
        w8Date:    w8Str,
        status:    String(row[6]||'').trim(),
        progress:  parseFloat(row[7])||0,
        expDate:   expStr,
        fileUrl:   fileUrl
      });
    }

    var debugInfo = 'role='+p.role+' total='+members.length;
    if (p.role !== 'mc') {
      var myTeam = (MENTOR_ROLE[p.role]||'').toLowerCase();
      debugInfo += ' myTeam='+myTeam;
      members = members.filter(function(m) {
        return m.mentor.toLowerCase() === myTeam;
      });
      debugInfo += ' afterFilter='+members.length;
    }

    return { ok: true, members: members, debug: debugInfo };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Get NM Checklist (อ่านจาก Sheet แยก) ─────────────────────
function apiGetNMChecklist(p) {
  try {
    if (!p.fileUrl) return { ok: false, error: 'ไม่มี fileUrl' };

    var nmSS = SpreadsheetApp.openByUrl(p.fileUrl);
    var sh   = nmSS.getSheetByName('✅ CHECKLIST');
    if (!sh) return { ok: false, error: 'ไม่พบ Sheet CHECKLIST' };

    // อ่าน header info (rows 3–6)
    var info = sh.getRange(3, 3, 4, 8).getValues(); // cols C–J (8 cols)
    var memberName = String(info[0][1]||'').trim(); // D3 = ชื่อ
    var nick       = String(info[1][1]||'').trim(); // D4 = ชื่อเล่น
    var mentor     = String(info[2][1]||'').trim(); // D5 = Mentor
    var startDate  = info[0][7];                    // J3 = วันเริ่ม (index 7 = col J)

    // อ่าน progress summary (row 9)
    var sumRow  = sh.getRange(9, 3, 1, 12).getValues()[0];
    var total   = parseInt(sumRow[0])||0;
    var done    = parseInt(sumRow[2])||0;
    var pct     = total > 0 ? Math.round(done/total*100) : 0;

    // อ่าน tasks (rows 11 ลงไป) — col C=phase, D=timeline, E=task, G=status, H=pass, I=nopass, J=date, K=by, L=comment
    var lastRow  = sh.getLastRow();
    var taskData = sh.getRange(11, 3, lastRow-10, 12).getValues();

    var tasks    = [];
    var curPhase = '';
    taskData.forEach(function(row, i) {
      var phase  = String(row[0]||'').trim();
      var tl     = String(row[1]||'').trim();
      var task   = String(row[2]||'').trim();
      var status = String(row[4]||'').trim();
      var pass   = row[5];   // col H = ✅ Pass (boolean)
      var nopass = row[6];   // col I = ❌ No Pass
      var date   = row[7];
      var by     = String(row[8]||'').trim();
      var comment= String(row[9]||'').trim();

      if (!task) return;
      if (phase) curPhase = phase;

      var dateStr = date instanceof Date
        ? Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd/MM/yy')
        : '';

      tasks.push({
        rowNum:  i + 11,
        phase:   curPhase,
        timeline: tl,
        task:    task,
        status:  status,
        pass:    !!pass,
        nopass:  !!nopass,
        date:    dateStr,
        by:      by,
        comment: comment
      });
    });

    return {
      ok: true,
      memberName: memberName,
      nick:       nick,
      mentor:     mentor,
      startDate:  startDate instanceof Date
        ? Utilities.formatDate(startDate, Session.getScriptTimeZone(), 'dd/MM/yy')
        : String(startDate||''),
      total:  total,
      done:   done,
      pct:    pct,
      tasks:  tasks,
      fileUrl: p.fileUrl
    };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Save NM Check Item ─────────────────────────────────────────
function apiSaveNMCheckItem(p) {
  try {
    if (!p.fileUrl || !p.rowNum) return { ok: false, error: 'ข้อมูลไม่ครบ' };

    var nmSS = SpreadsheetApp.openByUrl(p.fileUrl);
    var sh   = nmSS.getSheetByName('✅ CHECKLIST');
    if (!sh) return { ok: false, error: 'ไม่พบ Sheet CHECKLIST' };

    var row = parseInt(p.rowNum);
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yy');
    var byName = p.role === 'mc' ? 'MC' : (MENTOR_ROLE[p.role] || p.role);

    if (p.pass === true) {
      sh.getRange(row, 8).setValue(true);   // col H = Pass
      sh.getRange(row, 9).setValue(false);  // col I = No Pass
      sh.getRange(row, 7).setValue('✅ ผ่านแล้ว');
      sh.getRange(row, 10).setValue(now);   // col J = วันที่
      sh.getRange(row, 11).setValue(byName);// col K = สอนโดย
    } else if (p.pass === false) {
      sh.getRange(row, 8).setValue(false);
      sh.getRange(row, 9).setValue(true);
      sh.getRange(row, 7).setValue('❌ ยังไม่ผ่าน');
      sh.getRange(row, 10).setValue(now);
      sh.getRange(row, 11).setValue(byName);
    } else {
      // reset
      sh.getRange(row, 8).setValue(false);
      sh.getRange(row, 9).setValue(false);
      sh.getRange(row, 7).setValue('ยังไม่ได้ดำเนินการ');
      sh.getRange(row, 10).setValue('');
      sh.getRange(row, 11).setValue('');
    }

    if (p.comment !== undefined) {
      sh.getRange(row, 12).setValue(p.comment || ''); // col L = Mentor Comment
    }

    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Add New Member (Copy Template + บันทึก) ───────────────────
function apiAddNewMember(p) {
  try {
    if (p.role !== 'mc') return { ok: false, error: 'Permission denied' };
    if (!p.name || !p.nick || !p.mentor || !p.startDate)
      return { ok: false, error: 'ข้อมูลไม่ครบ' };

    // Parse วันที่
    var startParts = p.startDate.split('-'); // format: YYYY-MM-DD
    var startDate  = new Date(
      parseInt(startParts[0]),
      parseInt(startParts[1]) - 1,
      parseInt(startParts[2])
    );
    var w8Date  = new Date(startDate); w8Date.setDate(w8Date.getDate() + 56);
    var expDate = new Date(startDate); expDate.setFullYear(expDate.getFullYear() + 1);

    var tz      = Session.getScriptTimeZone();
    var startFmt= Utilities.formatDate(startDate, tz, 'dd/MM/yy');
    var w8Fmt   = Utilities.formatDate(w8Date,    tz, 'dd/MM/yy');

    // 1. Copy template
    var templateFile = DriveApp.getFileById(NM_TEMPLATE_ID);
    var folder       = DriveApp.getFolderById(NM_FOLDER_ID);
    var newFileName  = 'NM : ' + p.name + ' (Start ' + startFmt + ')';
    var newFile      = templateFile.makeCopy(newFileName, folder);
    var newFileUrl   = newFile.getUrl();

    // 2. กรอกข้อมูลลง Sheet ใหม่
    var nmSS = SpreadsheetApp.openById(newFile.getId());
    var sh   = nmSS.getSheetByName('✅ CHECKLIST');
    if (sh) {
      sh.getRange('E3').setValue(p.name);      // ชื่อ
      sh.getRange('E4').setValue(p.nick + ' / ' + (p.business||''));
      sh.getRange('E5').setValue(p.mentor);    // Mentor
      sh.getRange('J3').setValue(startDate);   // วันเริ่ม
    }

    // 3. บันทึกลง Sheet NEW MEMBERS
    var mainSS  = SpreadsheetApp.getActiveSpreadsheet();
    var nmSheet = mainSS.getSheetByName(NM_SHEET_NAME);
    if (!nmSheet) return { ok: false, error: 'ไม่พบ Sheet NEW MEMBERS' };

    // หา row ว่างแรก
    var lastRow = nmSheet.getLastRow();
    var newRow  = Math.max(lastRow + 1, NM_DATA_ROW);

    // หา seq ล่าสุด
    var seq = 1;
    if (lastRow >= NM_DATA_ROW) {
      var lastSeq = nmSheet.getRange(lastRow, 2).getValue();
      seq = (parseInt(lastSeq)||0) + 1;
    }

    nmSheet.getRange(newRow, 2).setValue(seq);              // col B = #
    nmSheet.getRange(newRow, 3).setValue(p.name);           // col C
    nmSheet.getRange(newRow, 4).setValue(p.nick);           // col D
    nmSheet.getRange(newRow, 5).setValue(p.mentor);         // col E
    nmSheet.getRange(newRow, 6).setValue(startDate);        // col F
    nmSheet.getRange(newRow, 7).setValue(w8Date);           // col G
    nmSheet.getRange(newRow, 8).setValue('กำลังดำเนินการ'); // col H
    nmSheet.getRange(newRow, 9).setValue(0);                // col I = 0%
    nmSheet.getRange(newRow, 10).setValue(expDate);         // col J
    nmSheet.getRange(newRow, 11).setValue(newFileUrl);      // col K

    return {
      ok:       true,
      name:     p.name,
      fileUrl:  newFileUrl,
      fileName: newFileName
    };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Auto Cleanup: ลบ Core Issue ที่ปิดเกิน 30 วัน ─────────────
function autoCleanupOldCases() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var teams = ['TOOMTAM','Aof','Draft','PHAI','AMP'];
  var now   = new Date();
  var cleaned = 0;

  teams.forEach(function(teamName) {
    var sh = ss.getSheetByName(teamName);
    if (!sh) return;

    var data = sh.getRange(4, 24, 8, 6).getValues(); // col X–AC

    data.forEach(function(row, i) {
      var status  = String(row[4]||'').trim(); // col AB
      var doneStr = String(row[5]||'').trim(); // col AC

      if (status !== 'done' || !doneStr) return;

      // parse วันที่จาก "MC ปิดเคส dd/MM/yy HH:mm"
      var dateMatch = doneStr.match(/(\d{2})\/(\d{2})\/(\d{2})\s/);
      if (!dateMatch) return;

      var doneDate = new Date(
        2000 + parseInt(dateMatch[3]),
        parseInt(dateMatch[2]) - 1,
        parseInt(dateMatch[1])
      );

      var daysDiff = Math.floor((now - doneDate) / 86400000);
      if (daysDiff < 30) return;

      // เกิน 30 วัน → ล้าง col X, AB, AC
      var shRow = i + 4;
      sh.getRange(shRow, 24).setValue(''); // col X = Core Issue
      sh.getRange(shRow, 27).setValue(''); // col AA = MC Reply
      sh.getRange(shRow, 28).setValue(''); // col AB = Status
      sh.getRange(shRow, 29).setValue(''); // col AC = Done timestamp
      cleaned++;
      Logger.log('Cleaned: '+teamName+' row '+shRow);
    });
  });

  Logger.log('Auto cleanup done: '+cleaned+' cases removed');
}

function setupCleanupTrigger() {
  // ลบ trigger เก่าก่อน
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'autoCleanupOldCases') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // สร้าง trigger ใหม่ — รันทุกวันตี 2
  ScriptApp.newTrigger('autoCleanupOldCases')
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();
  Logger.log('Trigger created: autoCleanupOldCases runs daily at 2am');
}

// รันครั้งเดียวเพื่อล้าง col Z ของ cases ที่ปิดไปแล้ว
function migrateCleanDoneCases() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var teams = ['TOOMTAM','Aof','Draft','PHAI','AMP'];
  var cleaned = 0;

  teams.forEach(function(teamName) {
    var sh = ss.getSheetByName(teamName);
    if (!sh) return;

    // อ่าน col AB (28) และ col Z (26) rows 4–11
    var statusData = sh.getRange(4, 28, 8, 1).getValues();
    var msgData    = sh.getRange(4, 26, 8, 1).getValues();

    for (var i = 0; i < 8; i++) {
      var status = String(statusData[i][0]||'').trim();
      var msg    = String(msgData[i][0]||'').trim();

      // ถ้า status = done และ col Z ยังมีข้อความ → ล้าง
      if (status === 'done' && msg) {
        sh.getRange(i + 4, 26).setValue('');
        cleaned++;
        Logger.log('Cleaned: '+teamName+' row '+(i+4));
      }
    }
  });

  Logger.log('Migration done: '+cleaned+' cases cleaned');
  Browser.msgBox('เรียบร้อย! ล้างแล้ว '+cleaned+' cases');
}

// ── Power Team Data ───────────────────────────────────────────
var POWER_TEAMS = [
  {
    id: 'construction', icon: '🏗', name: 'ก่อสร้าง & บ้าน',
    members: ['อ๊อฟ','ยศ','เมย์','แยม','เลียว','โอ','หนึ่ง','ต้น','เจษ','เน็ท','ต้า','ฟอร์ด','กร','แอม','ตุ๋ย','อั้น','หนุ่ม']
  },
  {
    id: 'finance', icon: '💰', name: 'การเงิน & ประกัน',
    members: ['แหม่ม','แนน','ริท','จ๊อบ','มินท์']
  },
  {
    id: 'digital', icon: '📱', name: 'Digital & Marketing',
    members: ['แพร์','เขียว','ปลาย','แต้ม','ปิงปอง','มายด์','วินโด้']
  },
  {
    id: 'food', icon: '🍽', name: 'อาหาร & เครื่องดื่ม',
    members: ['ตูมตาม','นุ่น','เบสท์','พร','เอ๋ย','ควีน','โต้ง','ไผ่','ฐิติมา','อ้น']
  },
  {
    id: 'event', icon: '🎉', name: 'Event & Hospitality',
    members: ['บาย','ปุ๊ก','เฟิร์น','แพรว','เตย']
  },
  {
    id: 'lifestyle', icon: '✨', name: 'Lifestyle & แฟชั่น',
    members: ['ฟิวส์','ยาหยี๋','เปเล่','ดราฟท์']
  },
  {
    id: 'auto', icon: '🚗', name: 'ยานยนต์',
    members: ['แมน','ธัญญ่า','ติ๊ก']
  },
  {
    id: 'health', icon: '🏥', name: 'สุขภาพ',
    members: ['หมอตู่']
  }
];

// ── Cross-Team Synergy Map ─────────────────────────────────────
var CROSS_TEAM_SYNERGY = [
  { a:'construction', b:'finance',   desc:'สินเชื่อบ้าน / ประกันโครงสร้าง' },
  { a:'construction', b:'digital',   desc:'Marketing อสังหา / Social Media' },
  { a:'construction', b:'lifestyle', desc:'Interior Design & ตกแต่งบ้าน' },
  { a:'food',         b:'event',     desc:'Catering & จัดเลี้ยงงาน' },
  { a:'food',         b:'digital',   desc:'Brand & Social Media ร้านอาหาร' },
  { a:'food',         b:'lifestyle', desc:'Food & Lifestyle Experience' },
  { a:'auto',         b:'finance',   desc:'เช่าซื้อ / Leasing รถยนต์' },
  { a:'health',       b:'lifestyle', desc:'Wellness & Beauty' },
  { a:'finance',      b:'digital',   desc:'Fintech & Digital Marketing' },
  { a:'event',        b:'lifestyle', desc:'Fashion & Event Styling' }
];

// ── Pair Scoring Helper ───────────────────────────────────────
function _scorePair(ma, mb) {
  var reasons  = [];
  var critical = false;

  // Rule 1: Low score → urgent
  if (ma.score > 0 && ma.score < 50) {
    reasons.push('⚠️ ' + ma.nick + ' คะแนนต่ำ (' + ma.score + ') ต้องการ 1-2-1 ด่วน');
    critical = true;
  }
  if (mb.score > 0 && mb.score < 50) {
    reasons.push('⚠️ ' + mb.nick + ' คะแนนต่ำ (' + mb.score + ') ต้องการ 1-2-1 ด่วน');
    critical = true;
  }

  // Rule 2: Green TL coaches Red/Black TL
  var redTLs = ['red','black'];
  if (ma.tl === 'green' && redTLs.indexOf(mb.tl) >= 0) {
    reasons.push('🌱 ' + ma.nick + ' (เขียว) ช่วยดึง ' + mb.nick + ' (' + mb.tl + ') กลับมา');
    critical = true;
  } else if (mb.tl === 'green' && redTLs.indexOf(ma.tl) >= 0) {
    reasons.push('🌱 ' + mb.nick + ' (เขียว) ช่วยดึง ' + ma.nick + ' (' + ma.tl + ') กลับมา');
    critical = true;
  }

  // Rule 3: Complementary G/R imbalance (only when both have real data)
  if (ma.given > 0 && ma.recv > 0 && mb.given > 0 && mb.recv > 0) {
    var aR = ma.given / ma.recv;
    var bR = mb.given / mb.recv;
    if ((aR > 1.5 && bR < 0.67) || (bR > 1.5 && aR < 0.67)) {
      reasons.push('💱 ยอด Given/Received สวนทางกัน — ควรแลก Referral กัน');
    }
  }

  // Rule 4: Cross-mentor bonus (only added when another reason exists)
  if (ma.mentor && mb.mentor && ma.mentor !== mb.mentor && reasons.length > 0) {
    reasons.push('🔀 ต่างทีม Mentor เพิ่มโอกาส Referral ข้ามสาย');
  }

  var priority = critical ? 'high' : (reasons.length > 0 ? 'medium' : 'low');
  return { reasons: reasons, priority: priority };
}

// ── Get Power Teams ───────────────────────────────────────────
function apiGetPowerTeams(p) {
  try {
    var ss       = SpreadsheetApp.getActiveSpreadsheet();
    var masterSh = ss.getSheetByName('รายชื่อทั้งหมด');

    // Build nick → member map (single sheet read)
    var nickMap = {};
    if (masterSh) {
      var mData = masterSh.getDataRange().getValues();
      for (var i = 2; i < mData.length; i++) {
        var name  = String(mData[i][1]||'').trim();
        var nick  = String(mData[i][2]||'').trim();
        var mentor= String(mData[i][3]||'').trim();
        var score = parseFloat(mData[i][4])||0;
        var tl    = String(mData[i][5]||'').trim();
        var given = parseFloat(mData[i][6])||0;
        var recv  = parseFloat(mData[i][7])||0;
        if (nick) nickMap[nick] = { name:name, nick:nick, mentor:mentor, score:score, tl:tl, given:given, recv:recv };
      }
    }

    // Track all assigned nicks to detect unassigned members
    var allAssigned = {};
    POWER_TEAMS.forEach(function(pt) {
      pt.members.forEach(function(n) { allAssigned[n] = true; });
    });

    // Build Power Team results
    var teams = POWER_TEAMS.map(function(pt) {
      var teamMembers = pt.members.map(function(nick) {
        return nickMap[nick] || { nick:nick, name:nick, score:0, tl:'none', given:0, recv:0, mentor:'' };
      });

      var totalGiven = teamMembers.reduce(function(s,m){ return s + m.given; }, 0);
      var totalRecv  = teamMembers.reduce(function(s,m){ return s + m.recv;  }, 0);
      var avgScore   = teamMembers.length
        ? Math.round(teamMembers.reduce(function(s,m){ return s + m.score; }, 0) / teamMembers.length)
        : 0;
      var redBlack   = teamMembers.filter(function(m){ return m.tl==='red'||m.tl==='black'; }).length;

      // In-team 1-2-1 suggestions with richer scoring
      var suggestions = [];
      for (var a = 0; a < teamMembers.length; a++) {
        for (var b = a + 1; b < teamMembers.length; b++) {
          var scored = _scorePair(teamMembers[a], teamMembers[b]);
          if (scored.priority !== 'low') {
            suggestions.push({
              a:        teamMembers[a].nick,
              b:        teamMembers[b].nick,
              aScore:   teamMembers[a].score,
              bScore:   teamMembers[b].score,
              priority: scored.priority,
              reasons:  scored.reasons
            });
          }
        }
      }
      suggestions.sort(function(x,y){ return (x.priority==='high'?0:1) - (y.priority==='high'?0:1); });
      suggestions = suggestions.slice(0, 5);

      // Cross-team synergy partners
      var synergy = CROSS_TEAM_SYNERGY
        .filter(function(s){ return s.a === pt.id || s.b === pt.id; })
        .map(function(s) {
          var pid = s.a === pt.id ? s.b : s.a;
          var ppt = null;
          for (var k = 0; k < POWER_TEAMS.length; k++) {
            if (POWER_TEAMS[k].id === pid) { ppt = POWER_TEAMS[k]; break; }
          }
          if (!ppt) return null;
          var partnerMembers = ppt.members.map(function(n) {
            return nickMap[n] || { nick:n, name:n, score:0, tl:'none', given:0, recv:0, mentor:'' };
          });
          // Suggest: most-urgent from this team ↔ highest-score from partner
          var myUrgent   = teamMembers.slice().sort(function(x,y){ return x.score - y.score; })[0];
          var partnerTop = partnerMembers.slice().sort(function(x,y){ return y.score - x.score; })[0];
          return {
            partnerId:   pid,
            partnerName: ppt.name,
            partnerIcon: ppt.icon,
            desc:        s.desc,
            suggestA:    myUrgent   ? myUrgent.nick   : '',
            suggestB:    partnerTop ? partnerTop.nick : ''
          };
        })
        .filter(function(s){ return s !== null; });

      return {
        id:          pt.id,
        icon:        pt.icon,
        name:        pt.name,
        members:     teamMembers,
        count:       teamMembers.length,
        avgScore:    avgScore,
        redBlack:    redBlack,
        totalGiven:  totalGiven,
        totalRecv:   totalRecv,
        suggestions: suggestions,
        synergy:     synergy
      };
    });

    // Detect unassigned members (in master but not in any Power Team)
    var unassigned = Object.keys(nickMap).filter(function(n) { return !allAssigned[n]; });
    if (unassigned.length > 0) {
      var uMembers = unassigned.map(function(n){ return nickMap[n]; });
      teams.push({
        id:          'unassigned',
        icon:        '❓',
        name:        'รอระบุกลุ่ม',
        members:     uMembers,
        count:       uMembers.length,
        avgScore:    Math.round(uMembers.reduce(function(s,m){ return s+m.score; },0) / uMembers.length),
        redBlack:    uMembers.filter(function(m){ return m.tl==='red'||m.tl==='black'; }).length,
        totalGiven:  uMembers.reduce(function(s,m){ return s+m.given; },0),
        totalRecv:   uMembers.reduce(function(s,m){ return s+m.recv;  },0),
        suggestions: [],
        synergy:     []
      });
    }

    return { ok: true, teams: teams };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Mentor Activity Summary (MC only) ─────────────────────────
function apiGetMentorActivity(p) {
  if (p.role !== 'mc') return { ok: false, error: 'Permission denied' };
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var teams  = ['TOOMTAM', 'Aof', 'Draft', 'PHAI', 'AMP'];
  var result = [];

  var MONTH_LABEL = {2:'APR',3:'MAY',4:'JUN',5:'JUL',6:'AUG',7:'SEP',
                     8:'OCT',9:'NOV',10:'DEC',11:'JAN',12:'FEB',13:'MAR'};

  teams.forEach(function(teamName) {
    var sh = ss.getSheetByName(teamName);
    if (!sh) {
      result.push({ team:teamName, error:'ไม่พบ Sheet' });
      return;
    }

    // Batch read rows 4–11, cols C(3)–AC(29) = 27 cols
    // idx 0=C(name) 1=D(nick) 2=E…13=P(scores) 21=X(coreIssue) 24=AA(reply) 25=AB(status)
    var data = sh.getRange(4, 3, 8, 27).getValues();

    // หา 2 เดือนล่าสุดที่มีคะแนน (idx 2–13)
    var thisIdx = -1, prevIdx = -1;
    for (var c = 13; c >= 2; c--) {
      var found = false;
      for (var r = 0; r < 8; r++) {
        if (parseFloat(data[r][c]) > 0) { found = true; break; }
      }
      if (found) {
        if (thisIdx < 0) thisIdx = c;
        else if (prevIdx < 0) { prevIdx = c; break; }
      }
    }
    var thisMonthLabel = thisIdx >= 0 ? (MONTH_LABEL[thisIdx] || '') : '';

    var memberCount = 0;
    var scoreUp = 0, scoreDown = 0, scoreSame = 0, noScoreYet = 0;
    var reportCount = 0;          // คน ที่มี Core Issue อยู่
    var openCount = 0;            // Core Issue ที่ยังไม่ปิด (status != 'done')
    var latestTs = null;          // timestamp ล่าสุด (dd/MM/yy HH:mm)
    var notReported = [];         // ชื่อคนที่ยังไม่มี Core Issue

    data.forEach(function(row) {
      var name = String(row[0] || '').trim();
      if (!name) return;
      memberCount++;

      // Score movement
      var tS = thisIdx >= 0 ? (parseFloat(row[thisIdx]) || 0) : 0;
      var pS = prevIdx >= 0 ? (parseFloat(row[prevIdx]) || 0) : 0;
      if (tS > 0 && pS > 0) {
        if      (tS > pS + 2) scoreUp++;
        else if (tS < pS - 2) scoreDown++;
        else                  scoreSame++;
      } else {
        noScoreYet++;
      }

      // Core Issue report
      var coreRaw = String(row[21] || '').trim();
      var status  = String(row[25] || '').trim(); // col AB
      if (!coreRaw) {
        notReported.push(name);
      } else {
        reportCount++;
        if (status !== 'done') openCount++;
        try {
          var parsed = JSON.parse(coreRaw);
          if (parsed.savedAt) {
            if (!latestTs || parsed.savedAt > latestTs) latestTs = parsed.savedAt;
          }
        } catch(e) {}
      }
    });

    // Days since last report
    var daysSince = null;
    if (latestTs) {
      var m = latestTs.match(/^(\d{2})\/(\d{2})\/(\d{2,4})/);
      if (m) {
        var yr   = parseInt(m[3]) + (m[3].length === 2 ? 2000 : 0);
        var rDate = new Date(yr, parseInt(m[2]) - 1, parseInt(m[1]));
        daysSince = Math.floor((new Date() - rDate) / 86400000);
      }
    }

    // Status flag
    var statusFlag = reportCount === 0 ? 'none'
                   : daysSince !== null && daysSince > 21 ? 'stale'
                   : notReported.length > 0 ? 'partial'
                   : 'ok';

    result.push({
      team:          teamName,
      memberCount:   memberCount,
      scoreUp:       scoreUp,
      scoreDown:     scoreDown,
      scoreSame:     scoreSame,
      noScoreYet:    noScoreYet,
      reportCount:   reportCount,
      openCount:     openCount,
      notReported:   notReported,
      daysSince:     daysSince,
      thisMonth:     thisMonthLabel,
      statusFlag:    statusFlag
    });
  });

  return { ok: true, teams: result };
}

// ── Weekly Action List (Mentor only) ──────────────────────────
function apiGetWeeklyActions(p) {
  var teamName = MENTOR_ROLE[p.role];
  if (!teamName) return { ok: false, error: 'ไม่ใช่ Mentor role' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(teamName);
  if (!sh) return { ok: false, error: 'ไม่พบ Sheet ' + teamName };

  // Build R2Y lookup (batch read ครั้งเดียว)
  var r2yMap = {};
  var r2ySh  = ss.getSheetByName('Reporting2You');
  if (r2ySh) {
    var r2yAll = r2ySh.getDataRange().getValues();
    for (var j = 1; j < r2yAll.length; j++) {
      var rn = String(r2yAll[j][0]).replace(/\s*\(BNI Ideal\)/i, '').trim();
      if (rn) r2yMap[rn] = r2yAll[j];
    }
  }

  // Batch read Mentor Sheet: rows 4–11, col C(3)–AB(28) = 26 cols
  // idx: 0=C(name) 1=D(nick) 2-13=E-P(scores) 14=Q(trend)
  //      20=W(renewal) 21=X(coreIssue) 23=Z(mcMsg) 24=AA(reply) 25=AB(status)
  var raw = sh.getRange(4, 3, 8, 26).getValues();
  var actions = [];

  raw.forEach(function(row, idx) {
    var name = String(row[0] || '').trim();
    if (!name) return;
    var nick = String(row[1] || '').trim();

    // หาคะแนนล่าสุด
    var latest = 0;
    for (var c = 13; c >= 2; c--) {
      var v = parseFloat(row[c]);
      if (v > 0) { latest = v; break; }
    }
    var tl = !latest ? 'none' : latest >= 70 ? 'green' : latest >= 50 ? 'yellow' : latest >= 30 ? 'red' : 'black';

    // Core Issue open?
    var coreRaw    = String(row[21] || '').trim();
    var caseStatus = String(row[25] || '').trim(); // col AB
    var hasOpenCase = coreRaw && caseStatus !== 'done';

    var r2y = r2yMap[name] || null;
    var priorities = [];
    var absent = 0;

    if (r2y) {
      absent = parseInt(r2y[10]) || 0;
      var actual = {
        rg: parseInt(r2y[1])||0, rr: parseInt(r2y[2])||0,
        visitor: parseInt(r2y[3])||0, oToOne: parseInt(r2y[4])||0,
        ceu: parseInt(r2y[5])||0, tyfcb: parseFloat(r2y[6])||0,
        bniDays: parseInt(r2y[8])||0, attend: parseInt(r2y[9])||0,
        absent: absent, late: parseInt(r2y[11])||0, sub: parseInt(r2y[13])||0
      };
      var weeks  = Math.min(26, Math.max(1, Math.floor(actual.bniDays / 7)));
      var target = {
        referral: weeks * 2,
        visitor:  Math.max(1, Math.ceil((weeks / 26) * 2)),
        oToOne:   weeks * 2,
        ceu:      Math.max(1, Math.ceil((weeks / 26) * 4)),
        attend:   weeks
      };
      priorities = _computePriorities(actual, target, weeks);
    }

    // เพิ่ม Open Case เป็น priority พิเศษ (ถ้ามี)
    if (hasOpenCase) {
      priorities.unshift({
        type: 'warning',
        title: '📋 มี Core Issue ค้าง',
        action: 'MC ยังไม่ได้ปิดเคส — ติดตาม / อัปเดตความคืบหน้า',
        target: 'Update ให้ MC ทราบ'
      });
    }

    // Urgency score: 1=ด่วนมาก … 5=ปกติดี
    var urgency = 5;
    var top = priorities[0] || null;
    if (top) {
      urgency = top.type === 'emergency' ? 1
              : top.type === 'warning'   ? 2
              : top.type === 'quick'     ? 3
              : 4;
    }
    if (tl === 'black') urgency = Math.min(urgency, 1);
    if (tl === 'red')   urgency = Math.min(urgency, 2);

    actions.push({
      row:      idx + 4,
      name:     name,
      nick:     nick,
      score:    latest,
      tl:       tl,
      absent:   absent,
      urgency:  urgency,
      topType:  top ? top.type : 'ok',
      topTitle: top ? top.title : '✅ ทุกอย่างดี',
      topAction:top ? top.action : 'ไม่มี action ด่วนสัปดาห์นี้',
      topTarget:top ? top.target : '',
      totalActions: priorities.length
    });
  });

  // เรียงตาม urgency → score ต่ำสุดก่อน
  actions.sort(function(a, b) {
    if (a.urgency !== b.urgency) return a.urgency - b.urgency;
    return (a.score || 99) - (b.score || 99);
  });

  return { ok: true, teamName: teamName, actions: actions };
}

// ── Risk Monitor: สมาชิกคะแนนลดต่อเนื่อง ──────────────────────
function apiGetRiskMembers(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var teams = Object.values(MENTOR_ROLE); // ['TOOMTAM','Aof','Draft','PHAI','AMP']
  var risks = [];

  teams.forEach(function(teamName) {
    var sh = ss.getSheetByName(teamName);
    if (!sh) return;
    // Batch read: rows 4-11, cols C-Q (name=C, nick=D, scores=E-P → 15 cols)
    var data = sh.getRange(4, 3, 8, 15).getValues();

    data.forEach(function(row) {
      var name = String(row[0]||'').trim();
      if (!name) return;
      var nick = String(row[1]||'').trim();

      // Collect monthly scores (idx 2-13 = cols E-P)
      var scores = [];
      for (var i = 2; i <= 13; i++) {
        var sv = parseFloat(row[i]);
        if (!isNaN(sv) && sv > 0) scores.push(sv);
      }
      if (scores.length < 3) return;

      // Count consecutive decline streak from the END of data
      var streak = 0;
      for (var k = scores.length - 1; k > 0; k--) {
        if (scores[k] < scores[k - 1]) { streak++; } else { break; }
      }
      if (streak < 2) return; // require 3 data points in declining sequence (2 drops)

      var latest = scores[scores.length - 1];
      var peak   = scores[scores.length - 1 - streak]; // score just before decline started
      var decline = Math.round(peak - latest);
      var tl = latest >= 70 ? 'green' : latest >= 50 ? 'yellow' : latest >= 30 ? 'red' : 'black';

      risks.push({
        name:         name,
        nick:         nick,
        team:         teamName,
        score:        latest,
        tl:           tl,
        streak:       streak + 1, // number of months in the declining sequence
        decline:      decline,
        recentScores: scores.slice(-5)
      });
    });
  });

  // Longest streak first → then lowest score
  risks.sort(function(a,b) {
    if (b.streak !== a.streak) return b.streak - a.streak;
    return a.score - b.score;
  });

  return { ok:true, risks:risks };
}

// ── Chapter Pulse (Growth Coordinator) ───────────────────────────
function apiGetChapterPulse(p) {
  if (p.role !== 'growth' && p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var masterSh = ss.getSheetByName('รายชื่อทั้งหมด');
  if (!masterSh) return { ok:false, error:'ไม่พบ sheet รายชื่อทั้งหมด' };

  var mData   = masterSh.getDataRange().getValues();
  var tlCount = { green:0, yellow:0, red:0, black:0, none:0 };
  var totalScore = 0, memberCount = 0, totalGiven = 0, totalRecv = 0;
  var nickList = [];

  for (var i = 2; i < mData.length; i++) {
    var name  = String(mData[i][1]||'').trim();
    var nick  = String(mData[i][2]||'').trim();
    var score = parseFloat(mData[i][4])||0;
    var given = parseFloat(mData[i][6])||0;
    var recv  = parseFloat(mData[i][7])||0;
    if (!name || score === 0) continue;
    var tl = score>=70?'green':score>=50?'yellow':score>=30?'red':'black';
    memberCount++;
    tlCount[tl] = (tlCount[tl]||0) + 1;
    totalScore += score;
    totalGiven += given;
    totalRecv  += recv;
    nickList.push({ name:name, nick:nick, tl:tl, score:score });
  }
  var avgScore = memberCount ? Math.round(totalScore / memberCount) : 0;

  // Score trends: read Mentor Sheets for 2 latest months per member
  var TEAMS = ['TOOMTAM','Aof','Draft','PHAI','AMP'];
  var nickTrendMap = {};
  TEAMS.forEach(function(team) {
    var sh = ss.getSheetByName(team);
    if (!sh) return;
    var data = sh.getRange(4, 3, 8, 16).getValues();
    data.forEach(function(row) {
      var nick = String(row[1]||'').trim();
      if (!nick) return;
      var scores = [];
      for (var c = 2; c <= 13; c++) {
        var sv = parseFloat(row[c]);
        if (!isNaN(sv) && sv > 0) scores.push(sv);
      }
      if (scores.length >= 2) nickTrendMap[nick] = { curr:scores[scores.length-1], prev:scores[scores.length-2] };
    });
  });

  var movers = [];
  nickList.forEach(function(m) {
    var t = nickTrendMap[m.nick];
    if (!t) return;
    var delta = t.curr - t.prev;
    movers.push({ nick:m.nick, name:m.name, tl:m.tl, score:t.curr, prev:t.prev, delta:delta });
  });
  var risers  = movers.filter(function(m){ return m.delta > 2; }).sort(function(a,b){ return b.delta - a.delta; }).slice(0,3);
  var fallers = movers.filter(function(m){ return m.delta < -2; }).sort(function(a,b){ return a.delta - b.delta; }).slice(0,3);

  return { ok:true, memberCount:memberCount, avgScore:avgScore, tlCount:tlCount,
           totalGiven:totalGiven, totalRecv:totalRecv, risers:risers, fallers:fallers };
}

// ── Leaderboard (Growth Coordinator) ─────────────────────────────
function apiGetLeaderboard(p) {
  if (p.role !== 'growth' && p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var masterSh = ss.getSheetByName('รายชื่อทั้งหมด');
  if (!masterSh) return { ok:false, error:'ไม่พบ sheet รายชื่อทั้งหมด' };

  var mData   = masterSh.getDataRange().getValues();
  var members = [];
  for (var i = 2; i < mData.length; i++) {
    var name  = String(mData[i][1]||'').trim();
    var nick  = String(mData[i][2]||'').trim();
    var mentor= String(mData[i][3]||'').trim();
    var score = parseFloat(mData[i][4])||0;
    var tl    = String(mData[i][5]||'').trim()||'none';
    var given = parseFloat(mData[i][6])||0;
    var recv  = parseFloat(mData[i][7])||0;
    if (!name) continue;
    members.push({ name:name, nick:nick, mentor:mentor, score:score, tl:tl, given:given, recv:recv });
  }
  return { ok:true, members:members };
}

// ── Visitor Tracker (Growth Coordinator) ─────────────────────────
function apiGetVisitorTracker(p) {
  if (p.role !== 'growth' && p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var nickLookup = {}; // fullname prefix → {tl, mentor}
  var masterSh = ss.getSheetByName('รายชื่อทั้งหมด');
  if (masterSh) {
    var mData = masterSh.getDataRange().getValues();
    for (var i = 2; i < mData.length; i++) {
      var mname  = String(mData[i][1]||'').trim();
      var tl     = String(mData[i][5]||'').trim()||'none';
      var mentor = String(mData[i][3]||'').trim();
      if (mname) nickLookup[mname] = { tl:tl, mentor:mentor };
    }
  }

  var r2ySh = ss.getSheetByName('Reporting2You');
  if (!r2ySh) return { ok:false, error:'ไม่พบ sheet Reporting2You' };
  var r2yData = r2ySh.getDataRange().getValues();

  var visitors = [];
  for (var j = 1; j < r2yData.length; j++) {
    var rname   = String(r2yData[j][0]||'').replace(/\s*\(BNI Ideal\)/i,'').trim();
    if (!rname) continue;
    var vCount  = parseInt(r2yData[j][3])||0;
    var bniDays = parseInt(r2yData[j][8])||0;
    var weeks   = Math.max(1, Math.floor(bniDays / 7));
    var target  = Math.max(1, Math.round(weeks / 13)); // ~2 visitors per 26 weeks
    var info    = nickLookup[rname] || { tl:'none', mentor:'' };
    visitors.push({ name:rname, visitors:vCount, target:target, weeks:weeks, tl:info.tl, mentor:info.mentor });
  }
  visitors.sort(function(a,b){ return b.visitors - a.visitors; });

  return {
    ok:          true,
    visitors:    visitors,
    withVisitor: visitors.filter(function(v){ return v.visitors > 0; }).length,
    noVisitor:   visitors.filter(function(v){ return v.visitors === 0; })
  };
}

// ── Chapter-Wide Actions (Growth Coordinator) ────────────────────
function apiGetChapterActions(p) {
  if (p.role !== 'growth' && p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var TEAMS = ['TOOMTAM','Aof','Draft','PHAI','AMP'];

  var r2yMap = {};
  var r2ySh  = ss.getSheetByName('Reporting2You');
  if (r2ySh) {
    var r2yAll = r2ySh.getDataRange().getValues();
    for (var j = 1; j < r2yAll.length; j++) {
      var rn = String(r2yAll[j][0]||'').replace(/\s*\(BNI Ideal\)/i,'').trim();
      if (rn) r2yMap[rn] = r2yAll[j];
    }
  }

  var actions = [];
  var levelOrder = { emergency:0, warning:1, info:2 };

  TEAMS.forEach(function(team) {
    var sh = ss.getSheetByName(team);
    if (!sh) return;
    var data = sh.getRange(4, 3, 8, 29).getValues();

    data.forEach(function(row) {
      var name = String(row[0]||'').trim();
      if (!name) return;
      var nick = String(row[1]||'').trim();

      var scores = [];
      for (var c = 2; c <= 13; c++) {
        var sv = parseFloat(row[c]);
        if (!isNaN(sv) && sv > 0) scores.push(sv);
      }
      var latest = scores.length ? scores[scores.length-1] : 0;
      var tl = !latest ? 'none' : latest >= 70 ? 'green' : latest >= 50 ? 'yellow' : latest >= 30 ? 'red' : 'black';

      var streak = 0;
      for (var k = scores.length - 1; k > 0; k--) {
        if (scores[k] < scores[k-1]) streak++; else break;
      }

      var coreRaw    = String(row[21]||'').trim();
      var caseStatus = String(row[25]||'').trim();
      var hasOpenCase = coreRaw && caseStatus !== 'done';

      var alerts = [];
      if (tl === 'black') alerts.push({ level:'emergency', icon:'⚫', text:'คะแนน ' + latest + ' (ดำ) ต้องดูแลด่วน' });
      else if (tl === 'red') alerts.push({ level:'emergency', icon:'🔴', text:'คะแนน ' + latest + ' (แดง) ต้องช่วย' });
      if (streak >= 2) alerts.push({ level:'warning', icon:'📉', text:'คะแนนลดต่อเนื่อง ' + (streak+1) + ' เดือนติด' });

      var r2y = r2yMap[name];
      if (r2y) {
        var absent  = parseInt(r2y[10])||0;
        var oToOne  = parseInt(r2y[4])||0;
        var visitor = parseInt(r2y[3])||0;
        var bniDays = parseInt(r2y[8])||0;
        var weeks   = Math.max(1, Math.floor(bniDays/7));
        if (absent >= 2) alerts.push({ level:'warning', icon:'🚫', text:'ขาดประชุม ' + absent + ' ครั้ง' });
        if (oToOne === 0 && weeks >= 4) alerts.push({ level:'info', icon:'🤝', text:'ยังไม่มี 1-2-1 เลย (' + weeks + ' wk)' });
        if (visitor === 0 && weeks >= 8) alerts.push({ level:'info', icon:'👥', text:'ยังไม่พา Visitor (' + weeks + ' wk)' });
      }
      if (hasOpenCase) alerts.push({ level:'info', icon:'📋', text:'มี Core Issue ค้าง' });

      if (!alerts.length) return;

      var topLevel = 'info';
      alerts.forEach(function(a) {
        if (levelOrder[a.level] < levelOrder[topLevel]) topLevel = a.level;
      });
      actions.push({ name:name, nick:nick, team:team, score:latest, tl:tl, alerts:alerts, topLevel:topLevel });
    });
  });

  actions.sort(function(a,b) {
    var ld = levelOrder[a.topLevel] - levelOrder[b.topLevel];
    return ld !== 0 ? ld : (a.score||99) - (b.score||99);
  });

  return { ok:true, actions:actions, total:actions.length };
}

// ── Broadcast ─────────────────────────────────────────────────
function _getOrCreateBroadcastSheet(ss) {
  var sh = ss.getSheetByName('📢 BROADCASTS');
  if (sh) return sh;
  sh = ss.insertSheet('📢 BROADCASTS');
  sh.getRange(1,1,1,3).setValues([['ID','Message','SentAt']]);
  sh.getRange(1,1,1,3).setBackground('#1E2A3A').setFontColor('#F0B429').setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}
function apiSendBroadcast(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  if (!p.message || !p.message.trim()) return { ok:false, error:'กรุณาใส่ข้อความ' };
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var sh  = _getOrCreateBroadcastSheet(ss);
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yy HH:mm');
  sh.appendRow([String(new Date().getTime()), p.message.trim(), now]);
  return { ok:true, sentAt:now };
}
function apiGetBroadcasts(p) {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var sh   = ss.getSheetByName('📢 BROADCASTS');
  if (!sh) return { ok:true, broadcasts:[] };
  var last = sh.getLastRow();
  if (last < 2) return { ok:true, broadcasts:[] };
  var data = sh.getRange(2, 1, last-1, 3).getValues();
  var broadcasts = data
    .filter(function(r){ return String(r[1]).trim(); })
    .map(function(r){ return { id:String(r[0]), message:String(r[1]).trim(), sentAt:String(r[2]) }; })
    .reverse();
  return { ok:true, broadcasts:broadcasts.slice(0,30) };
}

// ── Mentor Performance ─────────────────────────────────────────
function apiGetMentorPerformance(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var base = apiGetMentorActivity(p);
  if (!base.ok) return base;
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var now  = new Date();
  base.teams.forEach(function(t) {
    var sh = ss.getSheetByName(t.team);
    if (!sh) return;
    var data = sh.getRange(4, 3, 8, 27).getValues();
    var oldestDays = 0;
    data.forEach(function(row) {
      var coreRaw = String(row[21]||'').trim();
      var status  = String(row[25]||'').trim();
      if (!coreRaw || status === 'done') return;
      try {
        var arr = JSON.parse(coreRaw);
        var items = Array.isArray(arr) ? arr : [arr];
        items.forEach(function(item) {
          if (!item.savedAt) return;
          var m = item.savedAt.match(/^(\d{2})\/(\d{2})\/(\d{2,4})/);
          if (!m) return;
          var yr = parseInt(m[3]) + (m[3].length===2?2000:0);
          var age = Math.floor((now - new Date(yr, parseInt(m[2])-1, parseInt(m[1]))) / 86400000);
          if (age > oldestDays) oldestDays = age;
        });
      } catch(e) {}
    });
    t.oldestOpenDays = oldestDays;
  });
  return base;
}

// ── Alert Center (MC) ──────────────────────────────────────────
function apiGetAlertCenter(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var TEAMS = ['TOOMTAM','Aof','Draft','PHAI','AMP'];
  var now   = new Date();
  var alerts = [];

  TEAMS.forEach(function(team) {
    var sh = ss.getSheetByName(team);
    if (!sh) return;
    var data = sh.getRange(4, 3, 8, 27).getValues();
    data.forEach(function(row) {
      var name = String(row[0]||'').trim();
      if (!name) return;
      var nick = String(row[1]||'').trim();
      var latest = 0;
      for (var c = 2; c <= 13; c++) { var sv = parseFloat(row[c]); if (sv > 0) latest = sv; }
      var tl = !latest?'none':latest>=70?'green':latest>=50?'yellow':latest>=30?'red':'black';
      var coreRaw = String(row[21]||'').trim();
      var status  = String(row[25]||'').trim();

      // Stale open Core Issue (>= 14 days)
      if (coreRaw && status !== 'done') {
        try {
          var arr = JSON.parse(coreRaw);
          var items = Array.isArray(arr) ? arr : [arr];
          var last  = items[items.length-1];
          if (last && last.savedAt) {
            var m = last.savedAt.match(/^(\d{2})\/(\d{2})\/(\d{2,4})/);
            if (m) {
              var yr  = parseInt(m[3]) + (m[3].length===2?2000:0);
              var age = Math.floor((now - new Date(yr, parseInt(m[2])-1, parseInt(m[1])))/86400000);
              if (age >= 14) alerts.push({ type:'stale_case', level:age>=30?'emergency':'warning',
                icon:'📋', team:team, name:name, nick:nick, tl:tl, score:latest,
                detail:'Core Issue ค้างมา '+age+' วัน', sortKey:age });
            }
          }
        } catch(e) {}
      }

      // Declining score + no Core Issue
      var scores = [];
      for (var c2 = 2; c2 <= 13; c2++) { var sv2=parseFloat(row[c2]); if (sv2>0) scores.push(sv2); }
      var streak = 0;
      for (var k=scores.length-1;k>0;k--){ if(scores[k]<scores[k-1])streak++;else break; }
      if (streak >= 2 && !coreRaw) {
        alerts.push({ type:'no_report', level:streak>=3?'emergency':'warning',
          icon:'📉', team:team, name:name, nick:nick, tl:tl, score:latest,
          detail:'คะแนนลด '+(streak+1)+' เดือนติด ยังไม่มี Core Issue', sortKey:streak*10 });
      }
    });
  });

  // Renewal alerts from 💳 RENEWAL sheet
  var rnSh = ss.getSheetByName('💳 RENEWAL');
  if (rnSh) {
    for (var r = 3; r <= rnSh.getLastRow(); r++) {
      var rname   = String(rnSh.getRange(r,1).getDisplayValue()).trim();
      var rteam   = String(rnSh.getRange(r,2).getDisplayValue()).trim();
      var expRaw  = rnSh.getRange(r,3).getValue();
      if (!rname || !expRaw) continue;
      var expDate = new Date(expRaw); expDate.setHours(0,0,0,0);
      if (isNaN(expDate.getTime())) continue;
      var diff = Math.floor((expDate - now) / 86400000);
      if (diff >= 0 && diff <= 45) {
        alerts.push({ type:'renewal', level:diff<=7?'emergency':'warning',
          icon:'💳', team:rteam, name:rname, nick:'', tl:'none', score:0,
          detail:'Renewal อีก '+diff+' วัน ('+Utilities.formatDate(expDate,Session.getScriptTimeZone(),'dd/MM/yy')+')',
          sortKey: 100 - diff });
      }
    }
  }

  var lo = { emergency:0, warning:1 };
  alerts.sort(function(a,b){
    var ld = (lo[a.level]||1) - (lo[b.level]||1);
    return ld!==0 ? ld : b.sortKey - a.sortKey;
  });
  return { ok:true, alerts:alerts, total:alerts.length };
}

// ── Meeting Prep (MC) ──────────────────────────────────────────
function apiGetMeetingPrep(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var now = new Date();

  // Chapter stats
  var masterSh = ss.getSheetByName('รายชื่อทั้งหมด');
  var stats = { memberCount:0, avgScore:0, totalGiven:0, totalRecv:0, tlCount:{green:0,yellow:0,red:0,black:0,none:0} };
  if (masterSh) {
    var mData = masterSh.getDataRange().getValues();
    var totS = 0;
    for (var i = 2; i < mData.length; i++) {
      var mname = String(mData[i][1]||'').trim();
      if (!mname) continue;
      var sc  = parseFloat(mData[i][4])||0;
      var tl  = String(mData[i][5]||'').trim()||'none';
      stats.memberCount++;
      totS += sc;
      stats.totalGiven += parseFloat(mData[i][6])||0;
      stats.totalRecv  += parseFloat(mData[i][7])||0;
      stats.tlCount[tl] = (stats.tlCount[tl]||0) + 1;
    }
    stats.avgScore = stats.memberCount ? Math.round(totS / stats.memberCount) : 0;
  }

  // R2Y: visitor + TYFCB + top referral givers
  var r2ySh = ss.getSheetByName('Reporting2You');
  var noVisitor=[], pendingTYFCB=[], topGivers=[];
  if (r2ySh) {
    var r2y = r2ySh.getDataRange().getValues();
    var giversBuf = [];
    for (var j = 1; j < r2y.length; j++) {
      var rname  = String(r2y[j][0]||'').replace(/\s*\(BNI Ideal\)/i,'').trim();
      if (!rname) continue;
      var vis    = parseInt(r2y[j][3])||0;
      var rg     = parseInt(r2y[j][1])||0;
      var tyfcb  = parseFloat(r2y[j][6])||0;
      var bniD   = parseInt(r2y[j][8])||0;
      var weeks  = Math.max(1, Math.floor(bniD/7));
      if (vis === 0 && weeks >= 4)    noVisitor.push(rname.split(' ')[0]);
      if (tyfcb === 0 && weeks >= 4)  pendingTYFCB.push(rname.split(' ')[0]);
      if (rg > 0) giversBuf.push({ name:rname.split(' ')[0], given:rg });
    }
    topGivers = giversBuf.sort(function(a,b){ return b.given-a.given; }).slice(0,5);
  }

  return { ok:true, stats:stats, noVisitor:noVisitor, pendingTYFCB:pendingTYFCB, topGivers:topGivers };
}

// ── MC → Mentor Assignments ───────────────────────────────────
function _getOrCreateAssignSheet(ss) {
  var sh = ss.getSheetByName('📋 MC ASSIGNMENTS');
  if (sh) return sh;
  sh = ss.insertSheet('📋 MC ASSIGNMENTS');
  sh.getRange(1, 1, 1, 7).setValues([['ID','Mentor','Message','Member','CreatedAt','Status','DoneAt']]);
  sh.getRange(1, 1, 1, 7).setBackground('#1E2A3A').setFontColor('#F0B429').setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

function apiCreateMCAssignment(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  if (!p.mentor || !p.message) return { ok:false, error:'ข้อมูลไม่ครบ (mentor + message)' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = _getOrCreateAssignSheet(ss);
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yy HH:mm');
  var id  = String(new Date().getTime());
  sh.appendRow([id, p.mentor, p.message, p.memberName||'', now, 'pending', '']);
  return { ok:true };
}

function apiGetMCAssignments(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = _getOrCreateAssignSheet(ss);
  var last = sh.getLastRow();
  if (last < 2) return { ok:true, assignments:[] };
  var data = sh.getRange(2, 1, last - 1, 7).getValues();
  var assignments = data.map(function(row, i) {
    var mentor = String(row[1]||'').trim();
    if (!mentor) return null;
    return {
      row:        i + 2,
      id:         String(row[0]),
      mentor:     mentor,
      message:    String(row[2]||'').trim(),
      memberName: String(row[3]||'').trim(),
      createdAt:  String(row[4]||'').trim(),
      status:     String(row[5]||'pending').trim() || 'pending',
      doneAt:     String(row[6]||'').trim()
    };
  }).filter(Boolean);
  assignments.sort(function(a,b){
    var ap = a.status === 'pending' ? 0 : 1;
    var bp = b.status === 'pending' ? 0 : 1;
    return ap - bp || b.row - a.row;
  });
  return { ok:true, assignments:assignments };
}

function apiGetMentorAssignments(p) {
  var teamName = p.teamName;
  if (!teamName) return { ok:false, error:'ไม่มี teamName' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('📋 MC ASSIGNMENTS');
  if (!sh || sh.getLastRow() < 2) return { ok:true, assignments:[] };
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  var assignments = data.map(function(row, i) {
    if (String(row[1]||'').trim().toLowerCase() !== teamName.toLowerCase()) return null;
    return {
      row:        i + 2,
      message:    String(row[2]||'').trim(),
      memberName: String(row[3]||'').trim(),
      createdAt:  String(row[4]||'').trim(),
      status:     String(row[5]||'pending').trim() || 'pending',
      doneAt:     String(row[6]||'').trim()
    };
  }).filter(Boolean);
  return { ok:true, assignments:assignments, pending: assignments.filter(function(a){return a.status==='pending';}).length };
}

function apiAckAssignment(p) {
  if (!p.row) return { ok:false, error:'ไม่มี row' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('📋 MC ASSIGNMENTS');
  if (!sh) return { ok:false, error:'ไม่พบ sheet' };
  var row = parseInt(p.row);
  if (isNaN(row) || row < 2) return { ok:false, error:'Row ไม่ถูกต้อง' };
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yy HH:mm');
  sh.getRange(row, 6).setValue('done');
  sh.getRange(row, 7).setValue(now);
  return { ok:true };
}

// ── BNI Member Directory (public — ไม่ต้อง PIN) ───────────────
function apiGetMemberDirectory() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // อ่าน email/phone จาก Reporting2You
    // R2Y_HEADERS: Member(0), RG(1),..., Email(14), Phone(15)
    var contactMap = {};
    var r2ySh = ss.getSheetByName('Reporting2You');
    if (r2ySh && r2ySh.getLastRow() > 1) {
      var r2yData = r2ySh.getRange(2, 1, r2ySh.getLastRow() - 1, 16).getValues();
      r2yData.forEach(function(row) {
        var name = String(row[0]||'').trim().replace(/\s*\(BNI Ideal\)\s*$/i,'').trim().toLowerCase();
        if (name.length > 1) contactMap[name] = {
          email: String(row[14]||'').trim(),
          phone: String(row[15]||'').trim()
        };
      });
    }

    // อ่านรายชื่อทั้งหมด: col B(2)=name, col E(5)=score, startRow=3
    var sh = ss.getSheetByName('รายชื่อทั้งหมด');
    if (!sh) return { ok:false, error:'ไม่พบ Sheet รายชื่อทั้งหมด' };

    var lastRow = sh.getLastRow();
    if (lastRow < 3) return { ok:true, members:[], total:0 };

    // อ่าน 4 cols จาก col B → ได้ B,C,D,E
    var data = sh.getRange(3, 2, lastRow - 2, 4).getValues();
    var members = [];

    data.forEach(function(row) {
      var name = String(row[0]||'').trim(); // col B
      if (!name || name.length < 2) return;
      var score = parseFloat(row[3]||0) || 0; // col E
      var tl = score >= 70 ? 'green' : score >= 50 ? 'yellow' : score >= 30 ? 'red' : score > 0 ? 'black' : 'none';
      var contact = contactMap[name.toLowerCase()] || {};
      members.push({
        name:  name,
        email: contact.email || '',
        phone: contact.phone || '',
        score: score,
        tl:    tl
      });
    });

    members.sort(function(a,b){ return a.name.localeCompare(b.name,'th'); });
    return { ok:true, members:members, total:members.length };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

// ── Coaching Guide (Mentor) ───────────────────────────────────
function apiGetCoachingGuide(p) {
  var teamName = MENTOR_ROLE[p.role];
  if (!teamName) return { ok:false, error:'ไม่ใช่ Mentor role' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(teamName);
  if (!sh) return { ok:false, error:'ไม่พบ Sheet ' + teamName };

  // Build R2Y lookup
  var r2yMap = {};
  var r2ySh = ss.getSheetByName('Reporting2You');
  if (r2ySh) {
    var r2yAll = r2ySh.getDataRange().getValues();
    for (var j = 1; j < r2yAll.length; j++) {
      var rn = String(r2yAll[j][0]).replace(/\s*\(BNI Ideal\)/i,'').trim();
      if (rn) r2yMap[rn] = r2yAll[j];
    }
  }

  // Read mentor sheet rows 4-11, col C–AB (26 cols, idx 0=C)
  var raw = sh.getRange(4, 3, 8, 26).getValues();
  var guides = [];

  raw.forEach(function(row) {
    var name = String(row[0]||'').trim();
    if (!name) return;
    var nick = String(row[1]||'').trim();

    var latest = 0;
    for (var c = 13; c >= 2; c--) {
      var v = parseFloat(row[c]);
      if (v > 0) { latest = v; break; }
    }
    var tl = !latest ? 'none' : latest >= 70 ? 'green' : latest >= 50 ? 'yellow' : latest >= 30 ? 'red' : 'black';

    var coreRaw    = String(row[21]||'').trim();
    var caseStatus = String(row[25]||'').trim();
    var hasOpenCase = coreRaw && caseStatus !== 'done';

    var points = [];
    var wins   = [];
    var r2y    = r2yMap[name] || null;

    if (r2y) {
      var rg      = parseInt(r2y[1])||0;
      var rr      = parseInt(r2y[2])||0;
      var vis     = parseInt(r2y[3])||0;
      var oToOne  = parseInt(r2y[4])||0;
      var ceu     = parseInt(r2y[5])||0;
      var tyfcb   = parseFloat(r2y[6])||0;
      var bniDays = parseInt(r2y[8])||0;
      var attend  = parseInt(r2y[9])||0;
      var absent  = parseInt(r2y[10])||0;
      var late    = parseInt(r2y[11])||0;
      var weeks   = Math.min(26, Math.max(1, Math.floor(bniDays/7)));

      var tgtRef  = weeks * 2;
      var tgtVis  = Math.max(1, Math.ceil((weeks/26)*2));
      var tgt121  = weeks * 2;
      var tgtCeu  = Math.max(1, Math.ceil((weeks/26)*4));

      var refGap  = tgtRef  - rg;
      var visGap  = tgtVis  - vis;
      var o21Gap  = tgt121  - oToOne;
      var ceuGap  = tgtCeu  - ceu;

      // Attendance
      if (absent >= 3) {
        points.push({ level:'critical', icon:'🏛️',
          text:'ขาดประชุม '+absent+' ครั้ง — เสี่ยงโดนเปิดเก้าอี้ ต้องพูดคุยทันที' });
      } else if (absent >= 1) {
        points.push({ level:'warning', icon:'🏛️',
          text:'ขาดประชุมแล้ว '+absent+' ครั้ง — ขาดได้อีกแค่ '+Math.max(0,2-absent)+' ครั้ง' });
      } else if (attend > 0) {
        wins.push('มาประชุมครบ '+attend+' ครั้ง ไม่เคยขาด 🎯');
      }

      // CEU
      if (ceuGap > 0) {
        points.push({ level:'quick', icon:'📚',
          text:'CEU: ได้ '+ceu+'/'+tgtCeu+' แต้ม — ขาดอีก '+ceuGap+' แต้ม ทำได้ทันทีใน BNI Connect' });
      } else {
        wins.push('CEU ครบแล้ว '+ceu+'/'+tgtCeu+' แต้ม ✅');
      }

      // 1-2-1
      if (o21Gap > 0) {
        points.push({ level:'quick', icon:'🤝',
          text:'1-2-1: ทำแล้ว '+oToOne+'/'+tgt121+' ครั้ง — ขาดอีก '+o21Gap+' ครั้ง' });
      } else {
        wins.push('1-2-1 ทำได้ '+oToOne+' ครั้ง เกินเป้า ✅');
      }

      // Referral Given
      if (refGap > 0) {
        points.push({ level:'plan', icon:'💡',
          text:'Referral ให้: '+rg+'/'+tgtRef+' ใบ — ขาดอีก '+refGap+' ใบ | รับมา '+rr+' ใบ' });
      } else {
        wins.push('Referral ให้ครบ '+rg+'/'+tgtRef+' ใบ แล้ว ✅');
      }

      // Visitor
      if (visGap > 0) {
        points.push({ level:'plan', icon:'👥',
          text:'Visitor: พาแล้ว '+vis+'/'+tgtVis+' คน — ขาดอีก '+visGap+' คน' });
      } else if (vis > 0) {
        wins.push('พา Visitor แล้ว '+vis+' คน ✅');
      }

      // TYFCB
      if (tyfcb === 0 && weeks >= 4) {
        points.push({ level:'plan', icon:'💰',
          text:'TYFCB: ยังไม่มีรายได้จาก BNI เลย — ลองถามว่าได้ lead คุณภาพไหม?' });
      }
    }

    if (hasOpenCase) {
      points.unshift({ level:'critical', icon:'📋',
        text:'มี Core Issue ค้างอยู่กับ MC — ช่วยติดตามความคืบหน้า' });
    }

    // Derive status from worst point level
    var status = 'good';
    var lvlOrder = { critical:0, warning:1, quick:2, plan:3, good:4 };
    points.forEach(function(pt){
      if ((lvlOrder[pt.level]||4) < (lvlOrder[status]||4)) status = pt.level;
    });
    if (status === 'quick' || status === 'plan') status = 'attention';
    if (status === 'warning') status = 'warning';
    if (status === 'critical') status = 'critical';

    guides.push({
      name:   name,
      nick:   nick,
      tl:     tl,
      score:  latest,
      status: status,
      points: points,
      wins:   wins
    });
  });

  // Sort: critical first, then by score asc
  var sOrder = { critical:0, warning:1, attention:2, good:3 };
  guides.sort(function(a,b){
    var sd = (sOrder[a.status]||3) - (sOrder[b.status]||3);
    return sd !== 0 ? sd : a.score - b.score;
  });

  return { ok:true, teamName:teamName, guides:guides };
}

// ── 1-2-1 Log Sheet helper ───────────────────────────────────
function _getOrCreate121Sheet(ss) {
  var sh = ss.getSheetByName('📝 1-2-1 LOGS');
  if (sh) return sh;
  sh = ss.insertSheet('📝 1-2-1 LOGS');
  sh.getRange(1,1,1,7).setValues([['ID','MentorTeam','MemberName','Note','NextStep','LoggedAt','LoggedBy']]);
  sh.getRange(1,1,1,7).setBackground('#1E3A5F').setFontColor('#F0E68C').setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.setColumnWidth(4,300);
  sh.setColumnWidth(5,220);
  return sh;
}

// ── Save 1-2-1 Log ───────────────────────────────────────────
function apiSave121Log(p) {
  try {
    var teamName = MENTOR_ROLE[p.role];
    if (!teamName) return { ok:false, error:'ไม่ใช่ Mentor role' };
    if (!p.memberName || !p.note) return { ok:false, error:'ข้อมูลไม่ครบ (memberName + note)' };

    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var sh  = _getOrCreate121Sheet(ss);
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yy HH:mm');
    var id  = String(new Date().getTime());

    sh.appendRow([id, teamName, p.memberName, p.note, p.nextStep||'', now, p.role]);
    return { ok:true, loggedAt:now };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

// ── Get 1-2-1 Logs for a member ──────────────────────────────
function apiGet121Logs(p) {
  try {
    var teamName = MENTOR_ROLE[p.role];
    if (!teamName) return { ok:false, error:'ไม่ใช่ Mentor role' };
    if (!p.memberName) return { ok:false, error:'ต้องระบุ memberName' };

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('📝 1-2-1 LOGS');
    if (!sh || sh.getLastRow() < 2) return { ok:true, logs:[] };

    var data = sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
    var logs = [];
    data.forEach(function(row,i) {
      if (String(row[1]||'').trim() !== teamName) return;
      if (String(row[2]||'').trim().toLowerCase() !== p.memberName.toLowerCase()) return;
      logs.push({
        row:      i + 2,
        note:     String(row[3]||'').trim(),
        nextStep: String(row[4]||'').trim(),
        loggedAt: String(row[5]||'').trim()
      });
    });
    logs.sort(function(a,b){ return b.row - a.row; });
    return { ok:true, logs:logs };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

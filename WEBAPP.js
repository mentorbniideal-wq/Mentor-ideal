// ============================================================
// BNI IDEAL — WebApp v2 : Complete Server
// ============================================================

var APP_VERSION = 'v4.0';
var APP_VERSION_DATE = '25/05/2026';

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
// Single source of truth for all team sheet names
var MENTOR_TEAMS = Object.values(MENTOR_ROLE); // MENTOR_TEAMS

// Index maps to column number: col5(E)=JAN, col6(F)=FEB, ..., col16(P)=DEC (Mentor Sheet layout)
var MONTH_LABELS = ['','','','','','JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BNI PALMS Scoring — Verified against real PALMS data
// KEY: weeks = P + A + L + M + S  (actual meetings, not fixed 26)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _scoreAbsence(A) {
  if (A === 0) return 15;
  if (A === 1) return 10;
  if (A === 2) return 5;
  return 0;
}
function _scoreReferral(RGI, RGO, weeks) {
  var rate = (RGI + RGO) / weeks;
  if (rate >= 2) return 15;
  if (rate >= 1) return 10;
  return 0; // NO 5-pt tier — verified from real data
}
function _scoreVisitor(V, weeks) {
  var rate = V / (weeks / 4.333);
  if (rate >= 1) return 20;
  if (V > 0)    return 10;
  return 0;
}
function _scoreOneToOne(oto, weeks) {
  var rate = oto / weeks;
  if (rate >= 2) return 15;
  if (rate >= 1) return 10;
  if (rate > 0)  return 5;
  return 0;
}
function _scoreCEU(ceu) {
  if (ceu >= 4) return 20;
  if (ceu >= 3) return 15;
  if (ceu >= 2) return 10;
  if (ceu >= 1) return 5;
  return 0;
}
function _scoreTYFB(tyfb) {
  if (tyfb >= 500000) return 15;
  if (tyfb >= 200000) return 10;
  if (tyfb >= 100000) return 5;
  return 0;
}
function _getColor(total) {
  if (total >= 70) return 'green';
  if (total >= 50) return 'yellow';
  if (total >= 30) return 'red';
  return 'black';
}

function calcPALMSScore(d) {
  var weeks = (d.P||0)+(d.A||0)+(d.L||0)+(d.M||0)+(d.S||0);
  if (weeks === 0) return { weeks:0, absence:0, referral:0, visitor:0, oneToOne:0, ceu:0, tyfb:0, total:0, color:'black' };
  var absence  = _scoreAbsence(d.A||0);
  var referral = _scoreReferral(d.RGI||0, d.RGO||0, weeks);
  var visitor  = _scoreVisitor(d.V||0, weeks);
  var oneToOne = _scoreOneToOne(d.oto||0, weeks);
  var ceu      = _scoreCEU(d.ceu||0);
  var tyfb     = _scoreTYFB(d.tyfb||0);
  var total    = absence + referral + visitor + oneToOne + ceu + tyfb;
  return { weeks:weeks, absence:absence, referral:referral, visitor:visitor,
           oneToOne:oneToOne, ceu:ceu, tyfb:tyfb, total:total, color:_getColor(total) };
}

function _getNextColorGap(total) {
  if (total >= 70) return { current:'green',  next:null,     needed:'สีเขียวแล้ว 🟢' };
  if (total >= 50) return { current:'yellow', next:'green',  needed:'ต้องการอีก '+(70-total)+' pts → เขียว 🟢' };
  if (total >= 30) return { current:'red',    next:'yellow', needed:'ต้องการอีก '+(50-total)+' pts → เหลือง 🟡' };
  return             { current:'black',  next:'red',    needed:'ต้องการอีก '+(30-total)+' pts → แดง 🔴' };
}

function calcGaps(d) {
  var attendWeeks = (d.P||0)+(d.A||0)+(d.L||0)+(d.M||0)+(d.S||0);
  var weeks  = (d.bniDays > 0) ? Math.min(26, Math.max(1, Math.floor(d.bniDays/7))) : (attendWeeks || 1);
  var months = weeks / 4;
  if (weeks === 0) return null;
  var scores = calcPALMSScore(d);
  var A = d.A||0; var RGI = d.RGI||0; var RGO = d.RGO||0;
  var V = d.V||0; var oto = d.oto||0; var ceu = d.ceu||0; var tyfb = d.tyfb||0;

  function gapAbsence(currentScore) {
    if (currentScore===15) return { current:15,next:15,needed:'MAX แล้ว ✅' };
    var nxt = currentScore===10 ? {score:15,label:'ไม่ขาดเลย (0 ครั้ง)'}
            : currentScore===5  ? {score:10,label:'ขาดได้ 1 ครั้ง'}
                                : {score:5, label:'ขาดได้ 2 ครั้ง'};
    return { current:currentScore,next:nxt.score,needed:'ลดการขาดให้เหลือ: '+nxt.label+' (+'+(nxt.score-currentScore)+' pts)' };
  }
  function gapReferral(currentScore) {
    var total=RGI+RGO; var rate=total/weeks;
    if (currentScore===15) return { current:15,next:15,needed:'MAX แล้ว ✅' };
    if (currentScore===10) return { current:10,next:15,needed:'ให้ referral เพิ่มอีก '+(Math.ceil(weeks*2)-total)+' ใบ ('+rate.toFixed(2)+'/wk → 2.0/wk)' };
    return { current:0,next:10,needed:'ให้ referral เพิ่มอีก '+(Math.ceil(weeks*1)-total)+' ใบ ('+rate.toFixed(2)+'/wk → 1.0/wk)' };
  }
  function gapVisitor(currentScore) {
    var rate=V/months;
    if (currentScore===20) return { current:20,next:20,needed:'MAX แล้ว ✅' };
    if (currentScore===10) return { current:10,next:20,needed:'พา visitor เพิ่มอีก '+(Math.ceil(months)-V)+' คน ('+rate.toFixed(2)+'/mo → 1.0/mo)' };
    return { current:0,next:10,needed:'พา visitor อย่างน้อย 1 คน เพื่อรับ 10 pts' };
  }
  function gapOneToOne(currentScore) {
    var rate=oto/weeks;
    if (currentScore===15) return { current:15,next:15,needed:'MAX แล้ว ✅' };
    if (currentScore===10) return { current:10,next:15,needed:'นัด 1-2-1 เพิ่มอีก '+(Math.ceil(weeks*2)-oto)+' ครั้ง ('+rate.toFixed(2)+'/wk → 2.0/wk)' };
    if (currentScore===5)  return { current:5, next:10,needed:'นัด 1-2-1 เพิ่มอีก '+(Math.ceil(weeks*1)-oto)+' ครั้ง ('+rate.toFixed(2)+'/wk → 1.0/wk)' };
    return { current:0,next:5,needed:'นัด 1-2-1 อย่างน้อย 1 ครั้ง เพื่อรับ 5 pts' };
  }
  function gapCEU(currentScore) {
    if (currentScore===20) return { current:20,next:20,needed:'MAX แล้ว ✅' };
    if (currentScore===15) return { current:15,next:20,needed:'เรียน CEU เพิ่มอีก '+(4-ceu)+' แต้ม (ปัจจุบัน '+ceu+' → ต้องถึง 4)' };
    if (currentScore===10) return { current:10,next:15,needed:'เรียน CEU เพิ่มอีก '+(3-ceu)+' แต้ม (ปัจจุบัน '+ceu+' → ต้องถึง 3)' };
    if (currentScore===5)  return { current:5, next:10,needed:'เรียน CEU เพิ่มอีก '+(2-ceu)+' แต้ม (ปัจจุบัน '+ceu+' → ต้องถึง 2)' };
    return { current:0,next:5,needed:'เรียน CEU อย่างน้อย 1 แต้ม เพื่อรับ 5 pts' };
  }
  function gapTYFB(currentScore) {
    if (currentScore===15) return { current:15,next:15,needed:'MAX แล้ว ✅' };
    if (currentScore===10) return { current:10,next:15,needed:'เพิ่ม TYFB อีก ฿'+(500000-tyfb).toLocaleString()+' → ฿500,000' };
    if (currentScore===5)  return { current:5, next:10,needed:'เพิ่ม TYFB อีก ฿'+(200000-tyfb).toLocaleString()+' → ฿200,000' };
    return { current:0,next:5,needed:'เพิ่ม TYFB ให้ถึง ฿100,000 (ปัจจุบัน ฿'+tyfb.toLocaleString()+')' };
  }
  return {
    absence:  gapAbsence(scores.absence),
    referral: gapReferral(scores.referral),
    visitor:  gapVisitor(scores.visitor),
    oneToOne: gapOneToOne(scores.oneToOne),
    ceu:      gapCEU(scores.ceu),
    tyfb:     gapTYFB(scores.tyfb),
    total:    scores.total,
    color:    scores.color,
    nextColor: _getNextColorGap(scores.total)
  };
}

// ── runTests: verify all 7 official test cases ─────────────────
function runTests() {
  var cases = [
    { name:'Archara',   P:19,A:0,L:0,M:0,S:4,  RGI:21,RGO:24,V:8,  oto:54,tyfb:901911,   ceu:10, expect:95 },
    { name:'Thitima',   P:20,A:0,L:0,M:2,S:1,  RGI:6, RGO:42,V:7,  oto:25,tyfb:31992540, ceu:6,  expect:95 },
    { name:'Ophat',     P:18,A:0,L:2,M:2,S:1,  RGI:10,RGO:29,V:2,  oto:41,tyfb:396866,   ceu:2,  expect:65 },
    { name:'Krisada',   P:12,A:2,L:5,M:0,S:0,  RGI:5, RGO:1, V:1,  oto:40,tyfb:10490,    ceu:2,  expect:40 },
    { name:'Narin',     P:20,A:1,L:0,M:0,S:2,  RGI:6, RGO:4, V:1,  oto:36,tyfb:149281,   ceu:5,  expect:55 },
    { name:'Tanyaluck', P:15,A:3,L:4,M:0,S:1,  RGI:9, RGO:7, V:2,  oto:32,tyfb:307831,   ceu:4,  expect:50 },
    { name:'Phitarn',   P:23,A:0,L:0,M:0,S:0,  RGI:20,RGO:12,V:3,  oto:50,tyfb:309206,   ceu:5,  expect:80 },
    { name:'CEU3Test',  P:20,A:0,L:0,M:0,S:6,  RGI:0, RGO:0, V:0,  oto:0, tyfb:0,       ceu:3,  expect:30 }
  ];
  var results = cases.map(function(c) {
    var ps = calcPALMSScore(c);
    var pass = ps.total === c.expect;
    return c.name + ': got=' + ps.total + ' expect=' + c.expect + ' ' + (pass ? '✅' : '❌ FAIL');
  });
  var allPass = results.every(function(r){ return r.indexOf('✅') >= 0; });
  Logger.log('=== BNI Scoring Tests ===\n' + results.join('\n') + '\n' + (allPass ? '✅ ALL PASS' : '❌ SOME FAILED'));
  if (SpreadsheetApp) {
    try { Browser.msgBox('BNI Scoring Tests\n\n' + results.join('\n') + '\n\n' + (allPass ? '✅ ALL 7 PASS' : '❌ CHECK LOGS')); } catch(e){}
  }
  return { allPass:allPass, results:results };
}

// Strip thousand-separator commas before parsing (e.g. "901,911" → 901911)
// ── Ensure Reporting2You placeholder row exists for a member ─────
// สร้าง row ว่าง (ค่าเป็น 0 ทั้งหมด) เพื่อให้ member ปรากฏใน Stats ทันที
// ป้องกัน: ถ้ามีอยู่แล้ว ไม่สร้างซ้ำ
function _ensureR2YPlaceholder(ss, memberName, email, phone) {
  try {
    var r2ySh = ss.getSheetByName('Reporting2You');
    if (!r2ySh) return;
    var lastRow = r2ySh.getLastRow();
    if (lastRow > 1) {
      var names = r2ySh.getRange(2, 1, lastRow - 1, 1).getValues();
      var exists = names.some(function(row) {
        return String(row[0]||'').replace(/\s*\(BNI Ideal\)\s*/gi,'').trim().toLowerCase()
               === memberName.trim().toLowerCase();
      });
      if (exists) return;
    }
    // Header order: Member,RG,RR,Visi.,121,CEU,TYFCB,Points,BNI Days,P,A,L,M,S,Email,Phone
    r2ySh.appendRow([memberName + ' (BNI Ideal)', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                     email||'', phone||'']);
  } catch(e) { Logger.log('_ensureR2YPlaceholder: '+e.message); }
}

function _parseR2YNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}
// Build traffic light from official Points score (BNI Connect official thresholds)
function _bniBuildTL(officialPts) {
  return _getColor(officialPts || 0);
}

// Adapter: maps actual object → calcPALMSScore
// actual: { rg, visitor, oToOne, ceu, tyfcb, attend(P), absent(A), late(L), medical(M), sub(S) }
function _bniBuildScore(actual) {
  var d = {
    P:   actual.attend  || 0,
    A:   actual.absent  || 0,
    L:   actual.late    || 0,
    M:   actual.medical || 0,
    S:   actual.sub     || 0,
    RGI: actual.rg      || 0,
    RGO: 0,
    V:   actual.visitor || 0,
    oto: actual.oToOne  || 0,
    ceu: actual.ceu     || 0,
    tyfb: actual.tyfcb  || 0
  };
  var ps = calcPALMSScore(d);
  return {
    absent:   ps.absence,
    ref:      ps.referral,
    tyfcb:    ps.tyfb,
    visitor:  ps.visitor,
    one21:    ps.oneToOne,
    training: ps.ceu,
    total:    ps.total,
    max:      100,
    tl:       ps.color,
    weeks:    ps.weeks
  };
}

function _bniFastTrack(actual) {
  var score = _bniBuildScore(actual);
  var w = (actual.bniDays > 0) ? Math.min(26, Math.max(1, Math.floor(actual.bniDays/7))) : (score.weeks || 1);
  var months = w / 4;
  var d = {
    P:actual.attend||0, A:actual.absent||0, L:actual.late||0,
    M:actual.medical||0, S:actual.sub||0,
    RGI:actual.rg||0, RGO:0, V:actual.visitor||0,
    oto:actual.oToOne||0, ceu:actual.ceu||0, tyfb:actual.tyfcb||0,
    bniDays: actual.bniDays||0
  };
  var gd = calcGaps(d);
  if (!gd) return { score:score, gaps:[], needed:0, target:70, nextTl:'yellow', fastestActions:[] };

  // Build curVal / tgtVal for each category
  var rg=actual.rg||0, vis=actual.visitor||0, oto=actual.oToOne||0;
  var ceu=actual.ceu||0, tyfb=actual.tyfcb||0, abs=actual.absent||0;

  function fmtB(v){return v>=1000000?(v/1000000).toFixed(1)+'M':v>=1000?Math.round(v/1000)+'K':String(Math.round(v));}
  var curValMap = {
    Attendance: 'ขาด '+abs+' ครั้ง',
    Referral:   rg+' ใบ ('+(rg/w).toFixed(2)+'/wk)',
    Visitor:    vis+' คน ('+(vis/months).toFixed(2)+'/mo)',
    '1-2-1':    oto+' ครั้ง ('+(oto/w).toFixed(2)+'/wk)',
    CEU:        ceu+' แต้ม',
    TYFB:       '฿'+fmtB(tyfb)
  };
  var tgtValMap = {
    Attendance: gd.absence.current===10?'ขาด 0 ครั้ง':gd.absence.current===5?'ขาด ≤1 ครั้ง':'ขาด ≤2 ครั้ง',
    Referral:   gd.referral.current===10?Math.ceil(w*2)+' ใบรวม (2.0/wk)':Math.ceil(w*1)+' ใบรวม (1.0/wk)',
    Visitor:    gd.visitor.current===10?Math.ceil(months)+' คนรวม (1.0/mo)':'1 คนขึ้นไป',
    '1-2-1':    gd.oneToOne.current>=10?Math.ceil(w*2)+' ครั้งรวม (2.0/wk)':gd.oneToOne.current>=5?Math.ceil(w*1)+' ครั้งรวม (1.0/wk)':'1 ครั้งขึ้นไป',
    CEU:        gd.ceu.current>=10?'4 แต้ม':gd.ceu.current>=5?'2 แต้ม':'1 แต้มขึ้นไป',
    TYFB:       gd.tyfb.current>=10?'฿500,000':gd.tyfb.current>=5?'฿200,000':'฿100,000'
  };

  var iconMap = { Attendance:'🏛️', Referral:'💡', Visitor:'👥', '1-2-1':'🤝', CEU:'📚', TYFB:'💰' };
  var maxMap  = { Attendance:15, Referral:15, Visitor:20, '1-2-1':15, CEU:20, TYFB:15 };
  var gMap    = { Attendance:gd.absence, Referral:gd.referral, Visitor:gd.visitor, '1-2-1':gd.oneToOne, CEU:gd.ceu, TYFB:gd.tyfb };

  var gaps = [];
  ['Attendance','Referral','Visitor','1-2-1','CEU','TYFB'].forEach(function(cat) {
    var g = gMap[cat]; if (!g) return;
    var gain = g.next - g.current;
    if (gain > 0) gaps.push({
      cat:cat, icon:iconMap[cat], cur:g.current, max:maxMap[cat],
      next:g.next, gain:gain,
      action: g.needed || '',
      curVal: curValMap[cat] || '',
      tgtVal: tgtValMap[cat] || ''
    });
  });
  gaps.sort(function(a,b){ return b.gain - a.gain; });

  var colorGap = gd.nextColor;
  var nextTl = colorGap.next || colorGap.current;
  var target = nextTl === 'green' ? 70 : nextTl === 'yellow' ? 40 : 25;
  var needed = Math.max(0, target - score.total);
  var fastestActions = [];
  var acc = 0;
  for (var i=0; i<gaps.length; i++) {
    if (acc >= needed) break;
    fastestActions.push(gaps[i]);
    acc += gaps[i].gain;
  }
  return { score:score, gaps:gaps, needed:needed, target:target, nextTl:nextTl, fastestActions:fastestActions };
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── SETTINGS helpers ─────────────────────────────────────────
function _getSettingsValue(key) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('⚙️ SETTINGS');
  if (!sh || sh.getLastRow() < 1) return null;
  var data = sh.getRange(1, 1, sh.getLastRow(), 2).getValues();
  for (var i=0; i<data.length; i++) {
    if (String(data[i][0]||'').trim() === key) return data[i][1];
  }
  return null;
}
function _setSettingsValue(key, value) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('⚙️ SETTINGS');
  if (!sh) { sh = ss.insertSheet('⚙️ SETTINGS'); }
  if (sh.getLastRow() >= 1) {
    var data = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
    for (var i=0; i<data.length; i++) {
      if (String(data[i][0]||'').trim() === key) { sh.getRange(i+1, 2).setValue(value); return; }
    }
  }
  sh.appendRow([key, value]);
}

// ── Archive helpers ───────────────────────────────────────────
function _getArchivedNames(ss) {
  var sh = ss.getSheetByName('📦 ARCHIVED');
  var result = {};
  if (!sh || sh.getLastRow() < 2) return result;
  sh.getRange(2, 1, sh.getLastRow()-1, 1).getValues().forEach(function(r) {
    var n = String(r[0]||'').trim();
    if (n) result[n] = true;
  });
  return result;
}

function doGet(e) {
  var view = (e && e.parameter && e.parameter.v) ? e.parameter.v : 'mobile';
  if (view === 'desk') {
    return HtmlService.createTemplateFromFile('dashboard').evaluate()
      .setTitle('BNI IDEAL — Full Dashboard')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('BNI IDEAL Mentor System')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport','width=device-width,initial-scale=1.0,maximum-scale=1.0');
}

// Quick Reply ปุ่มลัด (แสดงหลังทุกข้อความสำหรับ registered users)
var LINE_QR_MAIN = [
  {type:'action',action:{type:'message',label:'📊 สถานะ',text:'สถานะ'}},
  {type:'action',action:{type:'message',label:'📈 ประวัติ',text:'ประวัติ'}},
  {type:'action',action:{type:'message',label:'🤝 แนะนำ',text:'แนะนำ'}},
  {type:'action',action:{type:'message',label:'👥 ทีม',text:'ทีม'}},
  {type:'action',action:{type:'message',label:'🙋 ลา',text:'ลา'}},
  {type:'action',action:{type:'message',label:'👥 ส่ง sub',text:'ส่ง sub'}}
];

// ── LINE Webhook (รับข้อความจาก Bot → ตอบกลับ User ID) ────────
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    (body.events || []).forEach(function(ev) {
      if (ev.type === 'follow') {
        _lineReply(ev.replyToken, _lineBotWelcome(), null);
        PropertiesService.getScriptProperties().setProperty('LINE_REG_'+ev.source.userId,'AWAITING');
        return;
      }
      if (ev.type !== 'message' || ev.message.type !== 'text') return;
      var reply = _lineBotHandle(ev.source.userId, (ev.message.text||'').trim(), ev);
      if (reply) {
        var isReg = !!_lineGetMember(ev.source.userId);
        // reply can be a plain string OR {msg, qr} for dynamic quick replies
        var replyMsg = (typeof reply === 'object' && reply.msg) ? reply.msg : reply;
        var replyQR  = (typeof reply === 'object' && reply.qr)  ? reply.qr  : (isReg ? LINE_QR_MAIN : null);
        _lineReply(ev.replyToken, replyMsg, replyQR);
      }
    });
  } catch(e2) { Logger.log('doPost error: ' + e2.message); }
  return ContentService.createTextOutput('OK');
}

function _lineBotWelcome() {
  return 'สวัสดีครับ! 👋 ยินดีต้อนรับสู่\nBNI IDEAL — Mentor Coordinator\n'
    +'─────────────────\n'
    +'บัญชีนี้จะช่วยให้คุณ:\n'
    +'📊 เช็คคะแนน BNI ตัวเอง\n'
    +'⚡ รู้ว่าต้องทำอะไรต่อ\n'
    +'📈 ดู Trend คะแนน 3 เดือน\n'
    +'─────────────────\n'
    +'🔐 เพื่อเริ่มใช้งาน กรุณาส่ง\n'
    +'ชื่อ-นามสกุล BNI (ภาษาอังกฤษ)\n'
    +'ของคุณมาเลยครับ\n\n'
    +'ตัวอย่าง:\nPhitarn Sakulthanaphetch';
}

function _lineReply(replyToken, text, qrItems) {
  var token = _getLineToken();
  if (!token || !replyToken) return;
  var msg = {type:'text', text:text};
  if (qrItems && qrItems.length) msg.quickReply = {items: qrItems.slice(0,13)};
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+token },
    payload: JSON.stringify({ replyToken:replyToken, messages:[msg] }),
    muteHttpExceptions: true
  });
}

// ── LINE Bot: Main handler ────────────────────────────────────
function _lineBotHandle(userId, text, ev) {
  var t = text.toLowerCase();
  if (t === 'myid' || t === 'id') return '🆔 LINE User ID:\n' + userId;

  var props = PropertiesService.getScriptProperties();
  var member = _lineGetMember(userId);

  // ── Registration flow ─────────────────────────────────────
  if (!member) {
    var state = props.getProperty('LINE_REG_' + userId) || '';
    if (!state) {
      props.setProperty('LINE_REG_' + userId, 'AWAITING');
      return 'สวัสดีครับ! 👋 BNI IDEAL Bot\n\nส่งชื่อ-นามสกุลภาษาอังกฤษ (ตาม BNI) เพื่อลงทะเบียนครับ\n\nเช่น: Korranat Worawongthep';
    }
    if (state === 'AWAITING') {
      var found = _lineFindMember(text);
      if (!found.length) return '❌ ไม่พบ "' + text + '" ใน BNI IDEAL\n\nลองส่งชื่อ-นามสกุลอีกครั้งนะครับ';
      if (found.length === 1) {
        props.setProperty('LINE_REG_' + userId, 'CONFIRM:' + found[0].name);
        return '✅ พบสมาชิก:\n' + found[0].name + (found[0].nick?' ('+found[0].nick+')':'') + '\nทีม: ' + (found[0].mentor||'—') + '\n\nใช่คุณไหมครับ? ตอบ "ใช่" หรือ "ไม่ใช่"';
      }
      var opts = found.slice(0,3).map(function(m,i){return (i+1)+'. '+m.name+(m.nick?' ('+m.nick+')':'');}).join('\n');
      props.setProperty('LINE_REG_' + userId, 'CHOOSE:' + found.map(function(m){return m.name;}).join('|'));
      return 'พบหลายคนที่คล้ายกัน:\n' + opts + '\n\nตอบ 1, 2 หรือ 3 ครับ';
    }
    if (state.indexOf('CONFIRM:') === 0) {
      var pending = state.slice(8);
      if (t === 'ใช่' || t === 'yes' || t === 'ok' || t === 'ยืนยัน' || t === '1') {
        _lineRegisterMember(userId, pending);
        props.deleteProperty('LINE_REG_' + userId);
        var d0 = _lineGetMemberData(pending);
        return '🎉 ลงทะเบียนสำเร็จ!\n\nยินดีต้อนรับ ' + ((d0&&d0.nick)||pending.split(' ')[0]) + ' 👋\n\nพิมพ์ "สถานะ" เพื่อดูคะแนน\nพิมพ์ "help" เพื่อดูคำสั่งทั้งหมด';
      }
      props.setProperty('LINE_REG_' + userId, 'AWAITING');
      return 'โอเคครับ ลองส่งชื่ออีกครั้งนะครับ';
    }
    if (state.indexOf('CHOOSE:') === 0) {
      var names = state.slice(7).split('|');
      var idx = parseInt(t) - 1;
      if (idx >= 0 && idx < names.length) {
        _lineRegisterMember(userId, names[idx]);
        props.deleteProperty('LINE_REG_' + userId);
        var d1 = _lineGetMemberData(names[idx]);
        return '🎉 ลงทะเบียนสำเร็จ!\n\nยินดีต้อนรับ ' + ((d1&&d1.nick)||names[idx].split(' ')[0]) + ' 👋\n\nพิมพ์ "สถานะ" เพื่อดูคะแนน\nพิมพ์ "help" เพื่อดูคำสั่งทั้งหมด';
      }
      return 'ตอบ 1, 2 หรือ 3 ครับ';
    }
    props.setProperty('LINE_REG_' + userId, 'AWAITING');
    return 'สวัสดีครับ กรุณาส่งชื่อ BNI ของคุณเพื่อลงทะเบียนครับ';
  }

  // ── Pending sub state ─────────────────────────────────────
  var absState = props.getProperty('LINE_ABS_' + userId);
  if (absState === 'AWAITING_SUB') {
    props.deleteProperty('LINE_ABS_' + userId);
    if (t === 'ยกเลิก' || t === 'cancel') return '✅ ยกเลิกแล้วครับ';
    return _lineAbsenceLog(member, text.trim(), 'ส่ง sub');
  }

  // ── Pending 1-2-1 outcome state ───────────────────────────
  var await121Out = props.getProperty('LINE_121_AWAIT_OUT_' + userId);
  if (await121Out) {
    props.deleteProperty('LINE_121_AWAIT_OUT_' + userId);
    return _line121LogOutcome(member, userId, await121Out, text.trim());
  }

  // ── Registered member commands ────────────────────────────
  if (t === 'สถานะ' || t === 'score' || t === 'คะแนน') return _lineStatusReply(member);
  if (t === 'ทำอะไร' || t === 'ต้องทำอะไร' || t === 'action')  return _lineActionReply(member);
  if (t === 'ประวัติ' || t === 'trend' || t === 'history')        return _lineHistoryReply(member);
  if (t === 'แนะนำ' || t.indexOf('แนะนำ') === 0)                return _lineMatchWithQR(member, text.slice(5).trim());
  if (t.indexOf('นัด ') === 0 || t.indexOf('นัด121 ') === 0)   return _line121Schedule(member, text.replace(/^นัด(121)?\s+/i,'').trim());
  if (t === 'เจอแล้ว' || t === 'met') {
    return _line121ConfirmMet(member, userId, props);
  }
  if (t === 'ติดตาม' || t === 'track' || t === '1-2-1')        return _line121ViewMy(member);
  if (t.indexOf('ธุรกิจ ') === 0) {
    var bizDesc = text.slice(7).trim();
    if (bizDesc) return _lineSetBizProfile(member, bizDesc);
  }
  if (t === 'ธุรกิจ') {
    return '📌 ตั้งค่าธุรกิจของคุณ:\nพิมพ์: ธุรกิจ [คำอธิบายสั้นๆ]\nเช่น: ธุรกิจ ประกันชีวิต สุขภาพ\nแล้วพิมพ์ "แนะนำ" เพื่อให้ Bot หาคู่ 1-2-1 ให้อัตโนมัติ';
  }
  if (t === 'ทีม' || t === 'team')                               return _lineTeamReply(member);
  if (t === 'ลา' || t.indexOf('ลา ') === 0) {
    var reason = text.slice(2).trim();
    return _lineAbsenceLog(member, reason, 'ลา');
  }
  if (t === 'ส่ง sub' || t.indexOf('ส่ง sub ') === 0) {
    var subName = text.slice(8).trim();
    if (!subName) {
      props.setProperty('LINE_ABS_' + userId, 'AWAITING_SUB');
      return '👥 ส่ง Sub\n─────────────────\nพิมพ์ชื่อคนที่จะมาแทนคุณครับ\n(ชื่อ-นามสกุล หรือชื่อเล่นก็ได้)';
    }
    return _lineAbsenceLog(member, subName, 'ส่ง sub');
  }
  if (t === 'ยกเลิกลา' || t === 'cancel') {
    return _lineCancelAbsence(member);
  }
  if (t === 'ปัญหา' || t === 'issue') {
    return _lineViewIssue(member);
  }
  if (t.indexOf('ปัญหา ') === 0 || t.indexOf('issue ') === 0) {
    var issueDetail = text.replace(/^(ปัญหา|issue)\s+/i, '').trim();
    return _lineReportIssue(member, issueDetail);
  }
  if (t === 'ยกเลิกปัญหา' || t === 'cancelissue') {
    return _lineCancelIssue(member);
  }
  if (t.indexOf('ลอง ') === 0 || t.indexOf('sim ') === 0) {
    var simParts = text.replace(/^(ลอง|sim)\s+/i,'').trim().split(/\s+/);
    return _lineSimulate(member, simParts[0]||'', simParts[1]||'0');
  }
  if (t === 'แจ้งเตือน' || t === 'notif') return _lineNotifSettingsReply(member);
  if (t.indexOf('ปิด ') === 0) return _lineToggleNotif(member, text.slice(4).trim(), true);
  if (t.indexOf('เปิด ') === 0) return _lineToggleNotif(member, text.slice(5).trim(), false);
  if (t === 'เป้า' || t === 'goal' || t === 'goals') return _lineGoalsReply(member);
  if (t.indexOf('เป้า ') === 0) {
    var gpParts = text.slice(5).trim().split(/\s+/);
    return _lineSetGoal(member, gpParts[0]||'', parseInt(gpParts[1])||0);
  }
  if (t === 'ยกเลิก' || t === 'ลบ') {
    _lineUnregister(userId);
    props.deleteProperty('LINE_REG_' + userId);
    return 'ลบข้อมูลแล้วครับ ส่งข้อความใหม่เพื่อลงทะเบียนอีกครั้ง';
  }
  return _lineHelpReply(member);
}

// ── LINE Bot: Member Storage ──────────────────────────────────
function _lineGetMember(userId) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('📱 LINE MEMBERS');
  if (!sh || sh.getLastRow() < 2) return null;
  var data = sh.getRange(2, 1, sh.getLastRow()-1, 2).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === userId) return String(data[i][1]).trim();
  }
  return null;
}

function _lineRegisterMember(userId, name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('📱 LINE MEMBERS') || ss.insertSheet('📱 LINE MEMBERS');
  if (sh.getLastRow() < 1) sh.appendRow(['LINE User ID','Member Name','Registered At']);
  if (sh.getLastRow() > 1) {
    var rows = sh.getRange(2, 1, sh.getLastRow()-1, 1).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === userId) {
        sh.getRange(i+2,2).setValue(name); sh.getRange(i+2,3).setValue(new Date()); return;
      }
    }
  }
  sh.appendRow([userId, name, new Date()]);
}

function _lineUnregister(userId) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('📱 LINE MEMBERS');
  if (!sh || sh.getLastRow() < 2) return;
  var rows = sh.getRange(2, 1, sh.getLastRow()-1, 1).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === userId) { sh.deleteRow(i+2); return; }
  }
}

function _lineFindMember(query) {
  var listSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('รายชื่อทั้งหมด');
  if (!listSh || listSh.getLastRow() < 3) return [];
  var data = listSh.getRange(3, 2, listSh.getLastRow()-2, 3).getValues();
  var q = query.toLowerCase().trim();
  var results = [];
  data.forEach(function(row) {
    var name = String(row[0]||'').trim(), nick = String(row[1]||'').trim(), mentor = String(row[2]||'').trim();
    if (name.length < 2) return;
    var nl = name.toLowerCase(), nickl = nick.toLowerCase();
    var score = 0;
    if (nl === q || nickl === q) score = 10;
    else if (nl.indexOf(q) >= 0 || nickl.indexOf(q) >= 0) score = 6;
    else {
      var words = q.split(/\s+/).filter(function(w){return w.length>2;});
      var hits = words.filter(function(w){return nl.indexOf(w)>=0||nickl.indexOf(w)>=0;}).length;
      if (hits >= Math.ceil(words.length/2)) score = hits;
    }
    if (score > 0) results.push({name:name,nick:nick,mentor:mentor,score:score});
  });
  return results.sort(function(a,b){return b.score-a.score;}).slice(0,3);
}

// ── LINE Bot: Data Fetcher ────────────────────────────────────
function _lineGetMemberData(memberName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var r2ySh = ss.getSheetByName('Reporting2You');
  var listSh = ss.getSheetByName('รายชื่อทั้งหมด');
  var nick = '', mentor = '';
  if (listSh && listSh.getLastRow() >= 3) {
    listSh.getRange(3,2,listSh.getLastRow()-2,3).getValues().forEach(function(r){
      if (String(r[0]||'').trim()===memberName){nick=String(r[1]||'');mentor=String(r[2]||'');}
    });
  }
  var base = {name:memberName,nick:nick,mentor:mentor,bniScore:0,bniTl:'none',cats:null,fastTrack:[],scoreHistory:[]};
  if (!r2ySh || r2ySh.getLastRow() < 2) return base;
  var r2y = null;
  r2ySh.getRange(2,1,r2ySh.getLastRow()-1,16).getValues().forEach(function(r){
    var rn=String(r[0]||'').replace(/\s*\(BNI Ideal\)\s*/gi,'').trim();
    if(rn===memberName) r2y=r;
  });
  if (!r2y) {
    // Fallback: use master sheet col E score for LT/mentors not in R2Y
    if (listSh && listSh.getLastRow() >= 3) {
      listSh.getRange(3,2,listSh.getLastRow()-2,4).getValues().forEach(function(r){
        if(String(r[0]||'').trim()===memberName){
          var ms=parseFloat(r[3])||0;
          if(ms>0){base.bniScore=ms;base.bniTl=_bniBuildTL(ms);}
        }
      });
    }
    return base;
  }
  var actual={rg:parseInt(r2y[1])||0,visitor:parseInt(r2y[3])||0,oToOne:parseInt(r2y[4])||0,
              ceu:parseInt(r2y[5])||0,tyfcb:_parseR2YNum(r2y[6]),bniDays:parseInt(r2y[8])||0,
              attend:parseInt(r2y[9])||0,absent:parseInt(r2y[10])||0};
  var ps = calcPALMSScore({P:actual.attend,A:actual.absent,L:0,M:0,S:0,
    RGI:actual.rg,RGO:0,V:actual.visitor,oto:actual.oToOne,
    ceu:actual.ceu,tyfb:actual.tyfcb,bniDays:actual.bniDays});
  var s = {absent:ps.absence,ref:ps.referral,tyfcb:ps.tyfb,visitor:ps.visitor,one21:ps.oneToOne,training:ps.ceu};
  var pts = parseInt(r2y[7])||0;
  var ft = [];
  try { if (actual.bniDays>0) { var ftr=_bniFastTrack(actual); ft=(ftr&&ftr.fastestActions||[]).slice(0,3); } } catch(e){}
  // Score history from UPDATE SCORES sheet (Traffic Light Evolution — covers ALL members)
  var hist = [];
  var updateSh = ss.getSheetByName('📥 UPDATE SCORES');
  if (updateSh && updateSh.getLastRow() >= 8) {
    var uLastCol = updateSh.getLastColumn();
    var uHeaders = updateSh.getRange(7,2,1,uLastCol-1).getValues()[0];
    var monthIdxs = [], monthPat = /^\d{2}\/\d{2}$/;
    uHeaders.forEach(function(h,i){ if(monthPat.test(String(h).trim())) monthIdxs.push({i:i,h:String(h).trim()}); });
    if (monthIdxs.length > 0) {
      updateSh.getRange(8,2,updateSh.getLastRow()-7,uLastCol-1).getValues().forEach(function(row){
        var raw = String(row[0]||'').trim().replace(/Export as PDF.*/i,'').replace(/No data.*/i,'').trim();
        var m = raw.match(/^(.+?)\s*\(BNI Ideal\)/i);
        var n = m ? m[1].trim() : raw;
        if (n !== memberName) return;
        monthIdxs.forEach(function(mi){
          var sv = parseFloat(row[mi.i])||0;
          if (sv > 0) {
            var parts = mi.h.split('/'); // MM/YY
            var mo = parseInt(parts[0])||0, yr = parseInt(parts[1]||0)+2000;
            var labels = ['','JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
            hist.push({month:labels[mo]||mi.h, score:sv, sortKey:yr*100+mo});
          }
        });
      });
      hist.sort(function(a,b){return a.sortKey-b.sortKey;});
    }
  }
  return {name:memberName,nick:nick,mentor:mentor,bniScore:pts>0?pts:0,bniTl:pts>0?_bniBuildTL(pts):'none',
          cats:{absent:s.absent,ref:s.ref,tyfcb:s.tyfcb,visitor:s.visitor,one21:s.one21,training:s.training},
          actual:actual,fastTrack:ft,scoreHistory:hist};
}

// ── LINE Bot: Random Encouragement ───────────────────────────
var _LINE_MSG = {
  green: [
    'สุดยอดครับ คุณ{nick}! 🏆 ระดับ Top ของ Chapter เลย',
    'เยี่ยมมากครับ คุณ{nick}! 💚 เป็นแบบอย่างให้ทีมได้เลย',
    'ทำได้ดีมากๆ เลยครับ คุณ{nick}! รักษาฟอร์มนี้ไว้นะครับ 🔥',
    'โปรมากครับ คุณ{nick}! 🌟 ทีมภูมิใจในตัวคุณครับ',
    'คุณ{nick} กำลังสร้างความประทับใจให้ Chapter มากเลยครับ 👏',
    'เก่งมากครับ! คุณ{nick} พิสูจน์แล้วว่าทำได้ต่อเนื่อง 💪'
  ],
  yellow: [
    'ใกล้แล้วครับ คุณ{nick}! 🟡 อีกนิดเดียวก็เขียวแล้ว',
    'กำลังดีมากเลยครับ คุณ{nick}! เห็นความพยายามชัดเลย 👍',
    'สู้ๆ ครับ คุณ{nick}! แค่เพิ่มอีก 1-2 action ก็ขึ้นเขียวได้แล้ว',
    'คุณ{nick} มาถูกทางแล้วครับ! ดัน Action Plan นิดเดียวก็ถึงครับ 🚀',
    'ไม่ไกลเลยครับ คุณ{nick}! ทำต่อเนื่องอีกเดือนเดียวเท่านั้น ✨',
    'เห็นพัฒนาการครับ คุณ{nick}! อย่าหยุดตอนนี้นะครับ 💛'
  ],
  red: [
    'สู้ๆ ครับ คุณ{nick}! ทุกก้าวเล็กๆ นับรวมกันได้เสมอครับ 💪',
    'ไม่เป็นไรครับ คุณ{nick}! เริ่มใหม่ได้เสมอ ทีมซัพพอร์ตอยู่ตลอดครับ',
    'คุณ{nick} ยังมีเวลาครับ! Action Plan ข้างล่างนี้ทำได้แน่นอน 🎯',
    'เชื่อในตัวคุณนะครับ คุณ{nick}! แค่โฟกัสที่ 2-3 อย่างก่อนเลยครับ',
    'ก้าวแรกสำคัญที่สุดครับ คุณ{nick}! เลือกทำ 1 อย่างจากด้านล่างนี้เลย 🔴→🟡',
    'ทีมเชียร์อยู่นะครับ คุณ{nick}! ลองทำ Action Plan สัปดาห์นี้เลยครับ'
  ],
  black: [
    'คุณ{nick} ไม่ต้องท้อนะครับ! ทุกคนเริ่มต้นใหม่ได้เสมอครับ 🖤→🔴',
    'พีทเชื่อในตัวคุณครับ คุณ{nick}! เริ่มจากก้าวเล็กๆ ก่อนเลยครับ',
    'ยังไม่สายครับ คุณ{nick}! มาเริ่มกันใหม่ ทีมพร้อมช่วยเสมอครับ 🤝',
    'คุณ{nick} มาทำ 1-2-1 กับ Mentor ก่อนนะครับ จะได้วางแผนด้วยกัน 📅',
    'อย่าเพิ่งท้อครับ คุณ{nick}! BNI ต้องใช้เวลา แต่ผลลัพธ์คุ้มค่าแน่นอนครับ',
    'ทุกวันคือโอกาสใหม่ครับ คุณ{nick}! เริ่มจาก Referral 1 ใบก่อนเลยครับ 💌'
  ],
  none: [
    'ยินดีต้อนรับครับ คุณ{nick}! 🌟 ข้อมูลจะอัพเดทหลัง Mentor Coordinator import CSV ครับ',
    'สวัสดีครับ คุณ{nick}! รอข้อมูลเดือนแรกก่อนนะครับ แล้วจะเห็นคะแนนเลยครับ'
  ]
};

function _lineRandMsg(tl, nick) {
  var pool = _LINE_MSG[tl] || _LINE_MSG.none;
  var idx = Math.floor(Math.random() * pool.length);
  return pool[idx].replace(/\{nick\}/g, nick);
}

// ── LINE Bot: Reply Builders ──────────────────────────────────
function _lineStatusReply(memberName) {
  var d = _lineGetMemberData(memberName);
  var nick = (d&&d.nick)||memberName.split(' ')[0];
  if (!d || !d.bniScore) return '⚠️ ยังไม่พบข้อมูลคะแนนของคุณในระบบครับ\n(ข้อมูลอัพเดทหลัง Mentor Coordinator import CSV ประจำเดือน)';

  var tl = d.bniTl||'none';
  var tlIcon = {green:'🟢',yellow:'🟡',red:'🔴',black:'⚫',none:'📊'}[tl]||'📊';
  var nextZone = {black:'🔴 แดง (30pt)',red:'🟡 เหลือง (50pt)',yellow:'🟢 เขียว (70pt)'}[tl]||'';
  var rankInfo = _lineTeamRank(memberName, d.mentor||'');
  var rankStr = rankInfo ? '🏅 อันดับ '+rankInfo.rank+'/'+rankInfo.total+' ในทีม '+(d.mentor||'') : '';
  var cats = d.cats||{};
  var a = d.actual||{};

  // Compute effective weeks for per-week context
  var effWks = Math.min(26, Math.max(1, Math.floor((a.bniDays||0)/7)));
  var rgPerWk  = effWks>0 ? (a.rg||0)/effWks : 0;
  var otoPerWk = effWks>0 ? (a.oToOne||0)/effWks : 0;
  var visMo    = effWks>0 ? (a.visitor||0)/(effWks/4) : 0;
  var tyfStr   = (a.tyfcb||0) >= 1000000
    ? (Math.round((a.tyfcb||0)/100000)/10)+'M'
    : (a.tyfcb||0) >= 1000 ? Math.round((a.tyfcb||0)/1000)+'k' : String(a.tyfcb||0);

  function bar(got, max) {
    var pct = max>0 ? got/max : 0;
    if (pct >= 1)   return '✅';
    if (pct >= 0.6) return '🔸';
    return '⚠️';
  }
  function fmt(n) { return Math.round(n*10)/10; }

  var lines = [
    '📊 คุณ'+nick+' — BNI Score',
    tlIcon+' '+d.bniScore+'/100' + (nextZone?' | เป้า: '+nextZone:''),
    rankStr ? rankStr : '',
    '─────────────────',
    '  หมวด           ได้   เต็ม',
    bar(cats.absent||0,15)  +' ขาดประชุม  '+(cats.absent||0)+'/15'+(a.absent!==undefined?'  (ขาด '+(a.absent||0)+' ครั้ง)':''),
    bar(cats.ref||0,15)     +' Referral   '+(cats.ref||0)+'/15'+'  ('+fmt(rgPerWk)+'/wk)',
    bar(cats.one21||0,15)   +' 1-2-1      '+(cats.one21||0)+'/15'+'  ('+fmt(otoPerWk)+'/wk)',
    bar(cats.visitor||0,20) +' Visitor    '+(cats.visitor||0)+'/20'+'  ('+fmt(visMo)+'/mo)',
    bar(cats.training||0,20)+' CEU        '+(cats.training||0)+'/20'+'  ('+( a.ceu||0)+' ใบ)',
    bar(cats.tyfcb||0,15)   +' TYFCB      '+(cats.tyfcb||0)+'/15'+'  (฿'+tyfStr+')',
    '─────────────────'
  ];

  if (d.fastTrack && d.fastTrack.length) {
    lines.push('⚡ ทำเพิ่มได้ทันที:');
    d.fastTrack.slice(0,3).forEach(function(ft,i){
      lines.push((i+1)+'. '+(ft.action||'')+(ft.gain?' → +'+ft.gain+' pt':''));
    });
    lines.push('─────────────────');
  } else if (tl==='green') {
    lines.push('🏆 ยอดเยี่ยม! รักษาฟอร์มนี้ไว้นะครับ');
    lines.push('─────────────────');
  }

  lines.push(_lineRandMsg(tl, nick));
  lines.push('');
  lines.push('พิมพ์ "ประวัติ" ดู Trend 3 เดือน');
  return lines.join('\n');
}

function _lineActionReply(memberName) { return _lineStatusReply(memberName); }

function _lineHistoryReply(memberName) {
  var d = _lineGetMemberData(memberName);
  var nick = (d&&d.nick)||memberName.split(' ')[0];
  if (!d || !d.scoreHistory || !d.scoreHistory.length) return '⚠️ ยังไม่มีประวัติคะแนนในระบบครับ';
  var hist = d.scoreHistory.slice(-3);
  var lines = ['📈 Trend — คุณ'+nick,'─────────────────'];

  hist.forEach(function(h, i) {
    var tl = h.score>=70?'🟢':h.score>=50?'🟡':h.score>=30?'🔴':'⚫';
    var delta = '';
    if (i > 0) {
      var diff = Math.round(h.score - hist[i-1].score);
      delta = diff > 0 ? '  ↑+'+diff : diff < 0 ? '  ↓'+diff : '  →';
    }
    lines.push(tl+' '+h.month+': '+Math.round(h.score)+' pt'+delta);
  });

  // Trend analysis
  lines.push('─────────────────');
  if (hist.length >= 2) {
    var last = hist[hist.length-1].score;
    var prev = hist[hist.length-2].score;
    var diff2 = Math.round(last - prev);
    if (diff2 < 0) {
      lines.push('📉 ลด '+ Math.abs(diff2)+' pt — หมวดที่ขาด:');
      var cats = d.cats||{};
      var weak = [];
      if ((cats.training||0) < 15) weak.push('CEU '+(cats.training||0)+'/20');
      if ((cats.ref||0)      < 10) weak.push('Referral '+(cats.ref||0)+'/15');
      if ((cats.one21||0)    < 10) weak.push('1-2-1 '+(cats.one21||0)+'/15');
      if ((cats.visitor||0)  < 15) weak.push('Visitor '+(cats.visitor||0)+'/20');
      if ((cats.absent||0)   < 15) weak.push('ขาดประชุม '+(cats.absent||0)+'/15');
      weak.slice(0,3).forEach(function(w){ lines.push('  ⚠️ '+w); });
    } else if (diff2 > 0) {
      lines.push('📈 ขึ้น +'+diff2+' pt 👏 ทำต่อเนื่องไว้ครับ!');
    } else {
      lines.push('→ คะแนนคงที่ เพิ่มอีก 1 action ขึ้นได้เลยครับ');
    }
  }

  // Gap to next zone
  var cur = Math.round((hist[hist.length-1]||{}).score||0);
  var nextTgt = cur < 30 ? 30 : cur < 50 ? 50 : cur < 70 ? 70 : 100;
  var gap = nextTgt - cur;
  if (gap > 0 && gap < 50) {
    var zoneName = nextTgt>=70?'🟢 เขียว':nextTgt>=50?'🟡 เหลือง':'🔴 แดง';
    lines.push('─────────────────');
    lines.push('🎯 อีก '+gap+' pt → '+zoneName);
    if (d.fastTrack && d.fastTrack.length) {
      lines.push('⚡ ทำได้เลยตอนนี้:');
      d.fastTrack.slice(0,2).forEach(function(ft,i){
        lines.push((i+1)+'. '+(ft.action||'')+(ft.gain?' +'+ft.gain+' pt':''));
      });
    }
  }
  lines.push('─────────────────');
  lines.push('พิมพ์ "สถานะ" ดูรายละเอียดทุกหมวด');
  return lines.join('\n');
}

function _lineTeamRank(memberName, teamName) {
  if (!teamName) return null;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var teamSh = ss.getSheetByName(teamName);
  if (!teamSh || teamSh.getLastRow() < 4) return null;
  var data = teamSh.getRange(4, 3, Math.max(1, teamSh.getLastRow()-3), 14).getValues();
  var scores = [];
  data.forEach(function(row) {
    var mName = String(row[0]||'').trim();
    if (!mName) return;
    var latest = 0;
    for (var c = 13; c >= 2; c--) {
      var v = parseFloat(row[c])||0;
      if (v > 0) { latest = v; break; }
    }
    scores.push({name:mName, score:latest});
  });
  scores.sort(function(a,b){ return b.score-a.score; });
  for (var i = 0; i < scores.length; i++) {
    if (scores[i].name === memberName) return {rank:i+1, total:scores.length};
  }
  return null;
}

function _lineHelpReply(memberName) {
  var d = _lineGetMemberData(memberName);
  var nick = (d&&d.nick)||memberName.split(' ')[0];
  return '👋 BNI IDEAL Bot — คุณ'+nick+'\n─────────────────\n'+
    '📊 สถานะ              →  คะแนน + Action Plan\n'+
    '📈 ประวัติ              →  Trend 3 เดือน\n'+
    '🤝 แนะนำ             →  Auto หาคู่จาก profile\n'+
    '📌 ธุรกิจ [คำอธิบาย]→  ตั้งค่า profile\n'+
    '👥 ทีม                  →  Leaderboard ทีม\n'+
    '🙋 ลา [เหตุผล]       →  แจ้งลาวันศุกร์\n'+
    '👥 ส่ง sub [ชื่อ]      →  แจ้งส่งคนแทน\n'+
    '🔄 ยกเลิกลา           →  ยกเลิกการแจ้งลา\n'+
    '🤝 นัด [ชื่อ]           →  บันทึกนัด 1-2-1\n'+
    '✅ เจอแล้ว              →  ยืนยันเจอ + บอกผล\n'+
    '📊 ติดตาม              →  ดูประวัติ 1-2-1\n'+
    '⚠️ ปัญหา [รายละเอียด] → แจ้งปัญหาให้ Mentor\n'+
    '📋 ปัญหา               →  ดูเรื่องที่แจ้งไว้\n'+
    '🔮 ลอง ref 3          →  จำลองคะแนนถ้าทำได้\n'+
    '─────────────────\n'+
    '🎯 เป้า ref 8          →  ตั้งเป้า Referral 8 ใบ\n'+
    '🎯 เป้า                →  ดู Progress เป้าหมาย\n'+
    '🔔 แจ้งเตือน           →  ดู/ตั้งค่า Notification\n'+
    '🔕 ปิด nudge           →  ปิด Wednesday Nudge\n'+
    '─────────────────\n'+
    'ข้อมูลอัพเดทหลัง Mentor Coordinator import CSV ประจำเดือน';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// คำสั่ง "ทีม" — แสดงภาพรวมคะแนนทีม
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
var _MENTOR_SHEETS = ['TOOMTAM','Aof','Draft','PHAI','AMP'];

function _lineTeamReply(memberName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var selfMentor = '';
  var selfNick = memberName.split(' ')[0];
  var listSh = ss.getSheetByName('รายชื่อทั้งหมด');
  if (listSh && listSh.getLastRow() >= 3) {
    listSh.getRange(3, 2, listSh.getLastRow()-2, 3).getValues().forEach(function(r) {
      if (String(r[0]||'').trim() === memberName) {
        selfNick = String(r[1]||'').trim() || selfNick;
        selfMentor = String(r[2]||'').trim();
      }
    });
  }
  var teamSheetName = selfMentor;
  // Try exact sheet name first; if not found, scan all mentor sheets for the member
  var teamSh = teamSheetName ? ss.getSheetByName(teamSheetName) : null;
  if (!teamSh) {
    for (var si = 0; si < _MENTOR_SHEETS.length; si++) {
      var candidate = ss.getSheetByName(_MENTOR_SHEETS[si]);
      if (!candidate) continue;
      for (var ri = 4; ri <= 11; ri++) {
        var cn = candidate.getRange(ri,3).getDisplayValue().trim();
        if (cn === memberName || cn === selfNick) { teamSh = candidate; teamSheetName = _MENTOR_SHEETS[si]; break; }
      }
      if (teamSh) break;
    }
  }
  if (!teamSh) return '⚠️ ไม่พบข้อมูลทีมในระบบครับ\nกรุณาติดต่อ Mentor Coordinator เพื่อตรวจสอบข้อมูลครับ';

  // Read names from mentor sheet, then get live scores via _lineGetMemberData (uses Math.max rule)
  var nameRows = teamSh.getRange(4, 3, Math.max(1, teamSh.getLastRow()-3), 1).getValues();
  var members = [];
  nameRows.forEach(function(row) {
    var mName = String(row[0]||'').trim();
    if (!mName) return;
    var d = _lineGetMemberData(mName);
    var score = (d&&d.bniScore) || 0;
    var nick  = (d&&d.nick) || mName.split(' ')[0];
    members.push({nick:nick, score:score, tl:(d&&d.bniTl)||'none'});
  });
  members.sort(function(a,b){ return b.score - a.score; });
  var TL = {green:'🟢', yellow:'🟡', red:'🔴', black:'⚫', none:'📊'};
  var lines = ['👥 ทีม ' + teamSheetName, '─────────────────'];
  members.forEach(function(m) {
    lines.push((TL[m.tl]||'📊') + ' ' + m.nick + ' — ' + (m.score||'?') + '/100');
  });
  if (!members.length) lines.push('ยังไม่มีข้อมูลครับ');
  return lines.join('\n');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Renewal reminder helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _lineCheckRenewal(memberName) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('💳 RENEWAL');
  if (!sh || sh.getLastRow() < 3) return '';
  var today = new Date(); today.setHours(0,0,0,0);
  for (var r = 3; r <= sh.getLastRow(); r++) {
    var name = sh.getRange(r,1).getDisplayValue().trim();
    if (name !== memberName) continue;
    var expRaw = sh.getRange(r,3).getValue();
    if (!expRaw) return '';
    var expDate = new Date(expRaw); expDate.setHours(0,0,0,0);
    var diff = Math.floor((expDate - today) / 86400000);
    if (diff < 0)    return '💳 สมาชิกภาพหมดอายุแล้ว! กรุณาต่ออายุด่วนครับ ‼️';
    if (diff <= 14)  return '💳 สมาชิกภาพเหลือ ' + diff + ' วัน ต่ออายุด่วนเลยครับ ⚠️';
    if (diff <= 45)  return '💳 สมาชิกภาพเหลือ ' + diff + ' วัน อย่าลืมต่ออายุนะครับ';
    return '';
  }
  return '';
}

function _lineRenewalPush() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('📱 LINE MEMBERS');
  if (!sh || sh.getLastRow() < 2) return;
  var renSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('💳 RENEWAL');
  if (!renSh) return;
  var today = new Date(); today.setHours(0,0,0,0);
  var rows = sh.getRange(2, 1, sh.getLastRow()-1, 2).getValues();
  rows.forEach(function(r) {
    var userId = String(r[0]||'').trim();
    var name   = String(r[1]||'').trim();
    if (!userId || !name) return;
    for (var i = 3; i <= renSh.getLastRow(); i++) {
      var rName = renSh.getRange(i,1).getDisplayValue().trim();
      if (rName !== name) continue;
      var expRaw = renSh.getRange(i,3).getValue();
      if (!expRaw) break;
      var expDate = new Date(expRaw); expDate.setHours(0,0,0,0);
      var diff = Math.floor((expDate - today) / 86400000);
      if (diff > 45) break;
      var nick = name.split(' ')[0];
      var msg = diff < 0
        ? '‼️ ' + nick + ' — สมาชิกภาพหมดอายุแล้ว!\nกรุณาติดต่อ Mentor เพื่อต่ออายุด่วนครับ'
        : '⚠️ ' + nick + ' — สมาชิกภาพเหลือ ' + diff + ' วัน\nอย่าลืมต่ออายุก่อน ' + Utilities.formatDate(expDate, Session.getScriptTimeZone(), 'dd MMM yyyy') + ' นะครับ';
      _sendLineMsg(userId, msg);
      break;
    }
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature C — 1-2-1 Match Suggestion ("แนะนำ" command)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _lineMatchReply(memberName, query) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── 1. Get member profile ────────────────────────────────────
  var myNick = memberName.split(' ')[0];
  var selfMentor = '';
  var d = null;
  try { d = _lineGetMemberData(memberName); myNick = (d&&d.nick)||myNick; } catch(e){}

  var listSh = ss.getSheetByName('รายชื่อทั้งหมด');
  if (listSh && listSh.getLastRow() >= 3) {
    listSh.getRange(3,2,listSh.getLastRow()-2,3).getValues().forEach(function(r){
      if (String(r[0]||'').trim()===memberName) selfMentor = String(r[2]||'').trim();
    });
  }

  // ── 2. Get stored business profile from LINE MEMBERS col E ──
  var lineSh = ss.getSheetByName('📱 LINE MEMBERS');
  var myBizProfile = '';
  if (lineSh && lineSh.getLastRow() >= 2) {
    lineSh.getRange(2,1,lineSh.getLastRow()-1,5).getValues().forEach(function(r){
      if (String(r[1]||'').trim()===memberName) myBizProfile = String(r[4]||'').trim();
    });
  }

  // ── 3. Read CHECKIN LOG — get member LF map + my own LF ─────
  var ciSh = ss.getSheetByName('📋 CHECKIN LOG');
  var memberLF = {}; // name → {lf, mentor, nick}
  var myLF = myBizProfile; // prefer stored profile over checkin
  var nickMap = {};

  if (ciSh && ciSh.getLastRow() >= 2) {
    var ciData = ciSh.getRange(2,1,ciSh.getLastRow()-1,6).getValues();
    ciData.forEach(function(row){
      var name = String(row[1]||'').trim();
      var lf   = String(row[4]||'').trim();
      var mtor = String(row[5]||'').trim();
      if (!name || !lf) return;
      if (name === memberName) {
        if (!myLF) myLF = lf; // use checkin LF only if no stored profile
      } else {
        memberLF[name] = {lf:lf, mentor:mtor};
      }
    });
  }

  // Build nick map from master list
  if (listSh && listSh.getLastRow() >= 3) {
    listSh.getRange(3,2,listSh.getLastRow()-2,2).getValues().forEach(function(r){
      if(r[0]) nickMap[String(r[0]).trim()] = String(r[1]||'').trim()||String(r[0]).split(' ')[0];
    });
  }

  // ── 4. Build 1-2-1 urgency context ──────────────────────────
  var ctx121 = '';
  if (d && d.actual && d.actual.bniDays > 0) {
    var effWks = Math.min(26, Math.max(1, Math.floor(d.actual.bniDays/7)));
    var otoNow = d.actual.oToOne||0;
    var otoPerWk = otoNow / effWks;
    if (otoPerWk < 1) {
      var stillNeed = Math.max(1, Math.ceil(effWks*1) - otoNow);
      ctx121 = '⚡ ต้องนัด 1-2-1 อีก ~'+stillNeed+' ครั้งเพื่อได้ 10 pts';
    } else if (otoPerWk < 2) {
      ctx121 = '💡 เพิ่มอีก 1 ครั้ง/สัปดาห์ → ขึ้นจาก 10 → 15 pts';
    }
  }

  // ── 5. Handle command `ธุรกิจ [คำอธิบาย]` (บันทึก profile) ─
  // (handled separately in _lineBotHandle, not here)

  // ── 6. AUTO MODE — no keyword ────────────────────────────────
  if (!query || !query.trim()) {
    if (!myLF) {
      // No profile yet — prompt to set it
      var hint = '🤝 ระบบยังไม่รู้จักธุรกิจของคุณครับ\n─────────────────\n'
        + 'ตั้งค่าธุรกิจ 1 ครั้ง:\n'
        + 'พิมพ์: ธุรกิจ [คำอธิบายสั้นๆ]\n'
        + 'เช่น: ธุรกิจ ประกันชีวิต สุขภาพ\n\n'
        + 'หรือค้นหาแบบ manual:\n'
        + 'พิมพ์: แนะนำ [หมวดธุรกิจ]\n'
        + 'เช่น: แนะนำ ก่อสร้าง / แนะนำ ร้านอาหาร';
      if (ctx121) hint += '\n─────────────────\n'+ctx121;
      return hint;
    }
    // Have profile — use it as search query (find who needs what I offer)
    query = myLF;
    // Fall through to search with auto flag
  }

  // ── 7. SEARCH & SCORE ────────────────────────────────────────
  var isAutoMode = (query === myLF && !!myLF);
  var qLow  = query.toLowerCase();
  var qCats = _getCategories(qLow);
  var qWords = _tokenize(qLow);
  var results = [];

  Object.keys(memberLF).forEach(function(name){
    var info = memberLF[name];
    var lfLow = info.lf.toLowerCase();
    var mCats = _getCategories(lfLow);
    var score = 0;
    var whyParts = [];

    // Their LF mentions my category → they need what I do
    var theyNeedMe = qCats.filter(function(c){ return mCats.indexOf(c) >= 0; });
    if (theyNeedMe.length) { score += theyNeedMe.length*3; whyParts.push('มองหา '+theyNeedMe[0]); }

    // Keyword overlap
    qWords.forEach(function(w){ if (lfLow.indexOf(w) >= 0) { score += 2; } });

    var crossTeam = info.mentor !== selfMentor;
    if (crossTeam && score > 0) score += 1;

    if (score > 0) results.push({
      name:name, nick:nickMap[name]||name.split(' ')[0],
      mentor:info.mentor, lf:info.lf,
      score:score, crossTeam:crossTeam, why:whyParts.join(', ')
    });
  });

  // ── 8. Fallback: if no matches, show cross-team suggestions ─
  if (!results.length) {
    if (!Object.keys(memberLF).length) {
      return '⚠️ ยังไม่มีข้อมูล Looking For ของสมาชิกในระบบครับ\nต้องมีการ Check-In ก่อนนะครับ'
        + (ctx121?'\n─────────────────\n'+ctx121:'');
    }
    // Suggest cross-team members without score filter
    var crossTeamAll = Object.keys(memberLF)
      .filter(function(n){ return memberLF[n].mentor !== selfMentor; })
      .slice(0,3)
      .map(function(n){ return {
        name:n, nick:nickMap[n]||n.split(' ')[0],
        mentor:memberLF[n].mentor, lf:memberLF[n].lf,
        score:0, crossTeam:true, why:'ข้ามทีม'
      }; });
    if (crossTeamAll.length) {
      results = crossTeamAll;
    } else {
      return '🔍 ไม่พบ match สำหรับ "'+query+'" ครับ\nลองคำอื่น เช่น หมวดธุรกิจกว้างๆ'
        + (ctx121?'\n─────────────────\n'+ctx121:'');
    }
  }

  results.sort(function(a,b){ return a.crossTeam!==b.crossTeam?(a.crossTeam?-1:1):b.score-a.score; });
  var top = results.slice(0,3);

  // ── 9. Build output ──────────────────────────────────────────
  var header = isAutoMode
    ? '🤝 คน BNI ที่น่าจะต้องการธุรกิจของคุณ'
    : '🤝 แนะนำ 1-2-1: "'+query+'"';
  var lines = [header, '─────────────────'];

  var medals = ['🥇','🥈','🥉'];
  top.forEach(function(m,i){
    lines.push(medals[i]+' '+m.nick+(m.crossTeam?' 🔀':' ')+' [ทีม '+(m.mentor||'—')+']');
    var lfShort = m.lf.length > 50 ? m.lf.slice(0,50)+'…' : m.lf;
    lines.push('   📌 '+lfShort);
    if (m.why && isAutoMode) {
      lines.push('   💬 "ผมทำ'+m.why+' อยากหาเวลาคุยกันไหมครับ?"');
    }
  });

  lines.push('─────────────────');
  if (ctx121) lines.push(ctx121);
  lines.push('🔀 = ข้ามทีม — ได้คะแนนเพิ่ม!');
  if (isAutoMode) {
    lines.push('\nเปลี่ยน profile: ธุรกิจ [คำอธิบาย]');
  } else {
    lines.push('กด "นัด [ชื่อ]" เพื่อบันทึก + ติดตามผล');
  }
  return {msg: lines.join('\n'), topNicks: top.map(function(m){return m.nick;})};
}

// ── Wrap _lineMatchReply to add dynamic "นัด" quick-reply buttons
function _lineMatchWithQR(memberName, query) {
  var result = _lineMatchReply(memberName, query);
  var msg = result.msg || result;
  var topNicks = result.topNicks || [];
  var qr = LINE_QR_MAIN.slice();
  // Prepend "นัด [nick]" buttons for each top match (unshift = appear first)
  topNicks.slice(0,3).reverse().forEach(function(nick) {
    if (nick) qr.unshift({type:'action',action:{type:'message',label:'🤝 นัด '+nick,text:'นัด '+nick}});
  });
  return {msg: msg, qr: qr.slice(0,13)};
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1-2-1 TRACKER — นัด / ติดตาม / ผลลัพธ์
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _get121Sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('📊 1-2-1 TRACKER');
  if (!sh) {
    sh = ss.insertSheet('📊 1-2-1 TRACKER');
    sh.appendRow(['วันที่นัด','ชื่อสมาชิก','ชื่อเล่น','ทีม','นัดกับ','ทีม partner','สถานะ','ผลลัพธ์','รายละเอียด','วันที่อัพเดท']);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,10).setFontWeight('bold');
  }
  return sh;
}

function _line121Schedule(memberName, partnerQuery) {
  if (!partnerQuery) return '🤝 พิมพ์: นัด [ชื่อหรือชื่อเล่น]\nเช่น: นัด นิค / นัด Phitarn\n\nใช้ "ติดตาม" ดู 1-2-1 ที่บันทึกไว้';

  // Fuzzy-find partner in master sheet
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var listSh = ss.getSheetByName('รายชื่อทั้งหมด');
  var partner = null;
  if (listSh && listSh.getLastRow() >= 3) {
    var q = partnerQuery.toLowerCase();
    listSh.getRange(3,2,listSh.getLastRow()-2,3).getValues().forEach(function(r){
      var name = String(r[0]||'').trim();
      var nick = String(r[1]||'').trim().toLowerCase();
      var team = String(r[2]||'').trim();
      if (!name) return;
      if (name.toLowerCase()===q || nick===q || name.toLowerCase().indexOf(q)>=0 || nick.indexOf(q)>=0) {
        if (!partner) partner = {name:name, nick:String(r[1]||'').trim()||name.split(' ')[0], team:team};
      }
    });
  }
  if (!partner) return '❌ ไม่พบสมาชิก "'+partnerQuery+'" ในระบบครับ\nลองใช้ชื่อ-นามสกุลเต็มหรือชื่อเล่นครับ';
  if (partner.name === memberName) return '😅 ไม่สามารถนัดกับตัวเองได้ครับ';

  var d = null; var myNick = memberName.split(' ')[0]; var myTeam = '';
  try { d = _lineGetMemberData(memberName); myNick=(d&&d.nick)||myNick; myTeam=(d&&d.mentor)||''; } catch(e){}

  var sh = _get121Sheet();
  var now = new Date();
  var nowStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  sh.appendRow([now, memberName, myNick, myTeam, partner.name, partner.team, 'นัดแล้ว', '', '', now]);

  return '✅ บันทึกนัด 1-2-1 แล้วครับ!\n─────────────────\n'
    + '🤝 คุณ' + myNick + ' × ' + partner.nick + '\n'
    + '📅 ' + nowStr + '\n'
    + (partner.team !== myTeam ? '🔀 ข้ามทีม — ได้คะแนนพิเศษ!\n' : '')
    + '─────────────────\n'
    + 'หลังเจอกันแล้ว พิมพ์ "เจอแล้ว" เพื่ออัพเดทผลครับ\n'
    + 'พิมพ์ "ติดตาม" ดู 1-2-1 ทั้งหมดของคุณ';
}

function _line121ConfirmMet(memberName, userId, props) {
  // Find latest pending meeting for this member
  var sh = _get121Sheet();
  if (sh.getLastRow() < 2) return 'ไม่พบนัด 1-2-1 ที่ค้างอยู่ครับ\nพิมพ์ "นัด [ชื่อ]" เพื่อบันทึกก่อนนะครับ';
  var rows = sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
  var pendingRow = -1;
  var pendingPartner = '';
  for (var i = rows.length-1; i >= 0; i--) {
    if (String(rows[i][1]||'').trim()===memberName && String(rows[i][6]||'').trim()==='นัดแล้ว') {
      pendingRow = i+2; pendingPartner = String(rows[i][4]||'').trim(); break;
    }
  }
  if (pendingRow < 0) return 'ไม่พบนัด 1-2-1 ที่รอยืนยันครับ\n(อาจบันทึกไปแล้วหรือยังไม่ได้นัด)';

  // Update status
  var now = new Date();
  sh.getRange(pendingRow, 7).setValue('เจอแล้ว');
  sh.getRange(pendingRow, 10).setValue(now);

  // Store state waiting for outcome
  props.setProperty('LINE_121_AWAIT_OUT_'+userId, pendingPartner+'|'+pendingRow);

  var partnerNick = pendingPartner.split(' ')[0];
  return {
    msg: '🎉 ดีมากเลยครับ! ยืนยันแล้ว\n─────────────────\n'
      + '✅ นัด 1-2-1 กับ ' + partnerNick + ': เจอแล้ว\n'
      + '─────────────────\n'
      + 'ได้อะไรจากการคุยครั้งนี้บ้างครับ?',
    qr: [
      {type:'action',action:{type:'message',label:'✅ ได้ Ref แล้ว',text:'ได้ ref'}},
      {type:'action',action:{type:'message',label:'🔄 มีโอกาสต่อ',text:'มีโอกาส'}},
      {type:'action',action:{type:'message',label:'📝 ยังคุยอยู่',text:'ยังคุยอยู่'}},
      {type:'action',action:{type:'message',label:'❌ ไม่ได้อะไร',text:'ไม่ได้อะไร'}}
    ]
  };
}

function _line121LogOutcome(memberName, userId, stateVal, text) {
  var parts = stateVal.split('|');
  var partnerName = parts[0]||'';
  var rowNum = parseInt(parts[1])||0;
  var partnerNick = partnerName.split(' ')[0];
  var t = text.toLowerCase();

  var outcome = '';
  var detail  = '';
  if (t==='ได้ ref' || t.indexOf('ได้ ref')>=0)        { outcome='ได้ Referral'; detail=text; }
  else if (t==='มีโอกาส' || t.indexOf('โอกาส')>=0)    { outcome='มีโอกาส'; detail=text; }
  else if (t==='ยังคุยอยู่' || t.indexOf('คุย')>=0)    { outcome='ยังคุยอยู่'; detail=text; }
  else if (t==='ไม่ได้อะไร' || t.indexOf('ไม่ได้')>=0) { outcome='ไม่ได้อะไร'; }
  else { outcome='อื่นๆ'; detail=text; }

  var sh = _get121Sheet();
  var now = new Date();
  if (rowNum >= 2 && rowNum <= sh.getLastRow()) {
    sh.getRange(rowNum, 8).setValue(outcome);
    if (detail) sh.getRange(rowNum, 9).setValue(detail);
    sh.getRange(rowNum, 10).setValue(now);
  }

  var icon = outcome==='ได้ Referral'?'🎊':outcome==='มีโอกาส'?'🌱':outcome==='ยังคุยอยู่'?'💬':'📝';
  var msg = icon+' บันทึกผลแล้วครับ!\n─────────────────\n'
    + '🤝 1-2-1 กับ '+partnerNick+'\n'
    + '📊 ผล: '+outcome+'\n'
    + '─────────────────\n';
  if (outcome==='ได้ Referral') {
    msg += '🎊 ยอดเยี่ยมมาก! การ 1-2-1 เกิดผลแล้วครับ\n';
  } else if (outcome==='มีโอกาส') {
    msg += '🌱 มีแนวโน้มดี ติดตามต่อเลยครับ!\n';
  }
  msg += '\nพิมพ์ "ติดตาม" ดูสถิติ 1-2-1 ทั้งหมดของคุณ';
  return msg;
}

function _line121ViewMy(memberName) {
  var sh = _get121Sheet();
  if (sh.getLastRow() < 2) return '📊 ยังไม่มีประวัติ 1-2-1 ครับ\nพิมพ์ "นัด [ชื่อ]" เพื่อเริ่มติดตาม';
  var rows = sh.getRange(2,1,sh.getLastRow()-1,10).getValues();
  var myRows = rows.filter(function(r){ return String(r[1]||'').trim()===memberName; });
  if (!myRows.length) return '📊 ยังไม่มีประวัติ 1-2-1 ของคุณครับ\nพิมพ์ "นัด [ชื่อ]" เพื่อบันทึกครั้งแรก';

  var total   = myRows.length;
  var met     = myRows.filter(function(r){ return ['เจอแล้ว','ได้ Referral','มีโอกาส','ยังคุยอยู่','ไม่ได้อะไร'].indexOf(String(r[6]||''))>=0 || String(r[7]||''); }).length;
  var gotRef  = myRows.filter(function(r){ return String(r[7]||'').indexOf('Referral')>=0; }).length;
  var pending = myRows.filter(function(r){ return String(r[6]||'')==='นัดแล้ว'; }).length;
  var convRate = met>0 ? Math.round(gotRef/met*100) : 0;

  var lines = ['📊 1-2-1 ของคุณ','─────────────────',
    '📅 นัดทั้งหมด: '+total+' ครั้ง',
    '✅ เจอแล้ว: '+met+' ครั้ง',
    '🎊 ได้ Ref: '+gotRef+' ครั้ง ('+convRate+'%)',
    pending?'⏳ รอยืนยัน: '+pending+' ครั้ง':'',
    '─────────────────'];

  // Last 3 meetings
  myRows.slice(-3).reverse().forEach(function(r){
    var partnerNick = String(r[4]||'').split(' ')[0];
    var status = String(r[6]||'')==='' ? '—' : String(r[6]||'');
    var outcome = String(r[7]||'');
    var statusIcon = {นัดแล้ว:'⏳',เจอแล้ว:'✅',ยกเลิก:'❌'}[status]||'✅';
    var outIcon = outcome.indexOf('Referral')>=0?'🎊':outcome==='มีโอกาส'?'🌱':outcome?'💬':'';
    var dateStr = r[0] instanceof Date ? Utilities.formatDate(r[0],Session.getScriptTimeZone(),'dd/MM') : String(r[0]||'').slice(0,5);
    lines.push(statusIcon+' '+partnerNick+' ('+dateStr+')'+' '+outIcon+(outcome?' '+outcome:''));
  });

  lines.push('─────────────────');
  lines.push('พิมพ์ "นัด [ชื่อ]" บันทึกครั้งใหม่');
  return lines.filter(Boolean).join('\n');
}

function _line121FollowUp(memberName, userId) {
  var sh = _get121Sheet();
  if (sh.getLastRow() < 2) return null;
  var rows = sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
  var cutoff = new Date(); cutoff.setDate(cutoff.getDate()-1);
  var pending = rows.filter(function(r){
    return String(r[1]||'').trim()===memberName
      && String(r[6]||'').trim()==='นัดแล้ว'
      && (r[0] instanceof Date ? r[0] < cutoff : false);
  });
  if (!pending.length) return null;
  var latest = pending[pending.length-1];
  var partnerNick = String(latest[4]||'').split(' ')[0];
  return {
    msg: '📋 Follow-up 1-2-1\n─────────────────\n'
      + 'คุณนัดพบ '+partnerNick+' ไว้ เจอกันแล้วไหมครับ?',
    qr: [
      {type:'action',action:{type:'message',label:'✅ เจอแล้ว',text:'เจอแล้ว'}},
      {type:'action',action:{type:'message',label:'📅 ยังไม่ได้เจอ',text:'ยังไม่ได้เจอ'}},
      {type:'action',action:{type:'message',label:'❌ ยกเลิกนัด',text:'ยกเลิกนัด'}}
    ]
  };
}

function apiGet121Tracker(p) {
  if (!p.role) return {ok:false,error:'auth'};
  var sh = _get121Sheet();
  if (sh.getLastRow() < 2) return {ok:true,list:[],stats:{}};
  var rows = sh.getRange(2,1,sh.getLastRow()-1,10).getValues();
  var list = rows.map(function(r,i){
    var dt = r[0] instanceof Date ? Utilities.formatDate(r[0],Session.getScriptTimeZone(),'dd/MM/yyyy HH:mm') : String(r[0]||'');
    var upd= r[9] instanceof Date ? Utilities.formatDate(r[9],Session.getScriptTimeZone(),'dd/MM/yyyy') : String(r[9]||'');
    return {row:i+2,date:dt,name:String(r[1]||''),nick:String(r[2]||''),team:String(r[3]||''),
            partner:String(r[4]||''),partnerTeam:String(r[5]||''),status:String(r[6]||''),
            outcome:String(r[7]||''),detail:String(r[8]||''),updated:upd};
  }).filter(function(r){return r.name;}).reverse();
  var total=list.length, met=0, gotRef=0, pending=0;
  list.forEach(function(r){
    if(r.status==='เจอแล้ว'||r.outcome) met++;
    if(r.outcome.indexOf('Referral')>=0) gotRef++;
    if(r.status==='นัดแล้ว'&&!r.outcome) pending++;
  });
  return {ok:true,list:list,stats:{total:total,met:met,gotRef:gotRef,pending:pending,
    convRate:met>0?Math.round(gotRef/met*100):0}};
}

function _lineSetBizProfile(memberName, biz) {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var sh   = ss.getSheetByName('📱 LINE MEMBERS');
  if (!sh || sh.getLastRow() < 2) return 'ไม่พบข้อมูลสมาชิกครับ';
  // Ensure col E header
  if (!sh.getRange(1,5).getValue()) sh.getRange(1,5).setValue('biz_profile');
  var rows = sh.getRange(2,1,sh.getLastRow()-1,2).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1]||'').trim()===memberName) {
      sh.getRange(i+2, 5).setValue(biz.trim());
      var nick = memberName.split(' ')[0];
      try { var d2 = _lineGetMemberData(memberName); nick=(d2&&d2.nick)||nick; } catch(e){}
      return '✅ บันทึก profile ของคุณแล้วครับ\n─────────────────\n'
        + '📌 ' + biz.trim() + '\n\n'
        + 'ตอนนี้พิมพ์ "แนะนำ" เพื่อให้ Bot หาคู่ 1-2-1 ที่เหมาะกับธุรกิจของคุณได้เลยครับ';
    }
  }
  return 'ไม่พบชื่อในระบบครับ';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature A — Thursday Morning Bot Push
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _lineLeanPolicyEnabled() {
  var value = PropertiesService.getScriptProperties().getProperty('LINE_NOTIFICATION_POLICY');
  return value !== 'legacy_verbose';
}

function thursdayBotPush() {
  if (_lineLeanPolicyEnabled()) { Logger.log('LEAN: skip thursdayBotPush'); return; }
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('📱 LINE MEMBERS');
  if (!sh || sh.getLastRow() < 2) return;
  var rows = sh.getRange(2, 1, sh.getLastRow()-1, 2).getValues();
  var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMM');
  var sent = 0;
  rows.forEach(function(r) {
    var userId = String(r[0]||'').trim();
    var name   = String(r[1]||'').trim();
    if (!userId || !name) return;
    try {
      var d = _lineGetMemberData(name);
      if (!d || !d.bniScore) return;
      var nick = d.nick || name.split(' ')[0];
      var tlLabel = {green:'🟢',yellow:'🟡',red:'🔴',black:'⚫'}[d.bniTl||'none'] || '📊';
      var msg = '🌄 BNI IDEAL — วันศุกร์ ' + dateStr + '\n'
        + '─────────────────\n'
        + 'สวัสดีตอนเช้า ' + nick + ' 👋\n'
        + 'คะแนนล่าสุด: ' + tlLabel + ' ' + d.bniScore + '/100\n'
        + '─────────────────\n';
      if (d.fastTrack && d.fastTrack.length) {
        msg += '⚡ Focus วันนี้:\n';
        d.fastTrack.slice(0,2).forEach(function(ft) {
          msg += '• ' + (ft.action||'') + (ft.gain?' (+'+ft.gain+'pt)':'') + '\n';
        });
        msg += '─────────────────\n';
      }
      var renewal = _lineCheckRenewal(name);
      if (renewal) msg += renewal + '\n─────────────────\n';
      msg += 'พิมพ์ "สถานะ" เพื่อดูรายละเอียด';
      _sendLineMsg(userId, msg);
      sent++;
    } catch(e2) { Logger.log('thursdayBotPush error for ' + name + ': ' + e2.message); }
  });
  Logger.log('thursdayBotPush: sent to ' + sent + ' members');
}

function setupThursdayBotTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'thursdayBotPush') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('thursdayBotPush')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(7)
    .create();
  Browser.msgBox('✅ ตั้ง Trigger thursdayBotPush แล้ว!\n\nทุกวันศุกร์ 07:00 น. ระบบจะส่งสรุปคะแนน\nให้สมาชิกที่ลงทะเบียน LINE Bot ทุกคนครับ');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature A2 — Friday Evening Reminder (Thursday 18:00 trigger → day before)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function fridayEveningReminder() {
  if (_lineLeanPolicyEnabled()) { Logger.log('LEAN: skip legacy fridayEveningReminder'); return; }
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('📱 LINE MEMBERS');
  if (!sh || sh.getLastRow() < 2) return;
  var rows = sh.getRange(2, 1, sh.getLastRow()-1, 2).getValues();
  var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  var dateStr = Utilities.formatDate(tomorrow, Session.getScriptTimeZone(), 'dd MMM');
  var sent = 0;
  rows.forEach(function(r) {
    var userId = String(r[0]||'').trim();
    var name   = String(r[1]||'').trim();
    if (!userId || !name) return;
    try {
      var d = _lineGetMemberData(name);
      var nick = (d&&d.nick) || name.split(' ')[0];
      var msg = '📅 BNI IDEAL — พรุ่งนี้วันศุกร์ ' + dateStr + ' 🎉\n'
        + '─────────────────\n'
        + 'สวัสดีตอนเย็น ' + nick + ' 👋\n\n'
        + '✅ เตรียมพร้อมสำหรับพรุ่งนี้:\n'
        + '• Looking For ที่ต้องการ Referral\n'
        + '• 60-second presentation\n'
        + '• Visitor ที่จะพามา\n\n'
        + 'พิมพ์ "สถานะ" ดูคะแนนล่าสุดของคุณครับ 🏆';
      _sendLineMsg(userId, msg);
      sent++;
    } catch(e2) { Logger.log('fridayEveningReminder error for ' + name + ': ' + e2.message); }
  });
  Logger.log('fridayEveningReminder: sent to ' + sent + ' members');
}

function setupFridayEveningTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'fridayEveningReminder') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('fridayEveningReminder')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.THURSDAY)
    .atHour(18)
    .create();
  Browser.msgBox('✅ ตั้ง Trigger แล้ว!\n\nทุกวันพฤหัส 18:00 น. ระบบจะส่งแจ้งเตือน\nให้เตรียมพร้อมก่อนประชุมวันศุกร์ครับ');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature A3 — Low Score Drop Alert (2-month consecutive decline)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _lineScoreDropAlert() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lineSh = ss.getSheetByName('📱 LINE MEMBERS');
  if (!lineSh || lineSh.getLastRow() < 2) return;
  var lineRows = lineSh.getRange(2, 1, lineSh.getLastRow()-1, 2).getValues();
  var lineMap = {};
  lineRows.forEach(function(r){ if(r[0]&&r[1]) lineMap[String(r[1]).trim()]=String(r[0]).trim(); });

  var _MENTOR_SHEETS_LOCAL = ['TOOMTAM','Aof','Draft','PHAI','AMP'];
  var alerted = 0;
  _MENTOR_SHEETS_LOCAL.forEach(function(shName) {
    var msh = ss.getSheetByName(shName);
    if (!msh || msh.getLastRow() < 4) return;
    var data = msh.getRange(4, 1, msh.getLastRow()-3, 20).getValues();
    data.forEach(function(row) {
      var name = String(row[2]||'').trim();
      var userId = lineMap[name];
      if (!name || !userId) return;
      // cols 4-15 = JAN-DEC scores (0-indexed: 4=col E=JAN)
      var scores = [];
      for (var c = 4; c <= 15; c++) {
        var v = row[c];
        if (v !== '' && v !== null && v !== undefined && !isNaN(Number(v))) {
          scores.push({col:c, val:Number(v)});
        }
      }
      if (scores.length < 3) return;
      var last3 = scores.slice(-3);
      var s1 = last3[0].val, s2 = last3[1].val, s3 = last3[2].val;
      if (s3 < s2 && s2 < s1) {
        var nick = (String(row[3]||'').trim()) || name.split(' ')[0];
        var msg = '⚠️ ' + nick + ' — คะแนนลดลง 2 เดือนต่อเนื่อง\n'
          + '─────────────────\n'
          + '3 เดือนล่าสุด: ' + Math.round(s1) + ' → ' + Math.round(s2) + ' → ' + Math.round(s3) + '\n\n'
          + 'อย่าปล่อยให้คะแนนตกต่อไปนะครับ!\n'
          + 'พิมพ์ "สถานะ" ดู Action Plan เพื่อเพิ่มคะแนนครับ 💪';
        _sendLineMsg(userId, msg);
        alerted++;
      }
    });
  });
  Logger.log('_lineScoreDropAlert: alerted ' + alerted + ' members');
  return alerted;
}

function apiTriggerScoreAlert(p) {
  if (p.role !== 'mc') return {ok:false,error:'MC only'};
  try {
    var alerted = _lineScoreDropAlert() || 0;
    return {ok:true, alerted:alerted};
  } catch(e) { return {ok:false,error:e.message}; }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature A4 — BNI Anniversary Alert (30 days before renewal)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _lineBNIAnniversary() {
  if (_lineLeanPolicyEnabled()) { Logger.log('SUPABASE_ONLY: skip legacy _lineBNIAnniversary'); return; }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lineSh = ss.getSheetByName('📱 LINE MEMBERS');
  var renSh = ss.getSheetByName('💳 RENEWAL');
  if (!lineSh || !renSh || lineSh.getLastRow() < 2) return;
  var lineRows = lineSh.getRange(2, 1, lineSh.getLastRow()-1, 2).getValues();
  var lineMap = {};
  lineRows.forEach(function(r){ if(r[0]&&r[1]) lineMap[String(r[1]).trim()]=String(r[0]).trim(); });
  var today = new Date(); today.setHours(0,0,0,0);
  var sent = 0;
  for (var i = 3; i <= renSh.getLastRow(); i++) {
    var rName = String(renSh.getRange(i,1).getDisplayValue()||'').trim();
    var userId = lineMap[rName];
    if (!rName || !userId) continue;
    var expRaw = renSh.getRange(i,3).getValue();
    if (!expRaw) continue;
    var expDate = new Date(expRaw); expDate.setHours(0,0,0,0);
    var diff = Math.floor((expDate - today) / 86400000);
    if (diff !== 30) continue;
    var nick = rName.split(' ')[0];
    var msg = '🎂 ' + nick + ' — BNI Anniversary ใกล้มาแล้ว!\n'
      + '─────────────────\n'
      + 'สมาชิกภาพของคุณจะครบรอบในอีก 30 วัน\n'
      + '(' + Utilities.formatDate(expDate, Session.getScriptTimeZone(), 'dd MMM yyyy') + ')\n\n'
      + 'ขอบคุณที่เป็นส่วนหนึ่งของ BNI IDEAL 🙏\n'
      + 'อย่าลืมต่ออายุเพื่อรักษา Referral Network ของคุณนะครับ!\n\n'
      + 'ติดต่อ Mentor เพื่อต่ออายุได้เลยครับ 💪';
    _sendLineMsg(userId, msg);
    sent++;
  }
  Logger.log('_lineBNIAnniversary: sent to ' + sent + ' members');
  return sent;
}

function setupAnniversaryCheckTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === '_lineBNIAnniversary') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('_lineBNIAnniversary')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(8)
    .create();
  Browser.msgBox('✅ ตั้ง Trigger BNI Anniversary แล้ว!\n\nทุกวันศุกร์ 08:00 น. ระบบจะเช็คว่าสมาชิกคนไหน\nครบรอบใน 30 วันข้างหน้าและส่งแจ้งเตือนครับ');
}

function apiTriggerAnniversary(p) {
  if (p.role !== 'mc') return {ok:false,error:'MC only'};
  try {
    var sent = _lineBNIAnniversary() || 0;
    return {ok:true, sent:sent};
  } catch(e) { return {ok:false,error:e.message}; }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature A5 — 1-2-1 Introduction via LINE Bot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function apiSendLineIntro(p) {
  if (p.role !== 'mc') return {ok:false,error:'MC only'};
  if (!p.name1 || !p.name2) return {ok:false,error:'ต้องระบุชื่อสมาชิก 2 คน'};
  var uid1 = _lineGetUserId(p.name1);
  var uid2 = _lineGetUserId(p.name2);
  if (!uid1 && !uid2) return {ok:false,error:'ทั้งสองคนยังไม่ได้ลงทะเบียน LINE Bot'};
  var d1 = _lineGetMemberData(p.name1);
  var d2 = _lineGetMemberData(p.name2);
  var nick1 = (d1&&d1.nick)||p.name1.split(' ')[0];
  var nick2 = (d2&&d2.nick)||p.name2.split(' ')[0];
  var team1 = (d1&&d1.mentor)||'—';
  var team2 = (d2&&d2.mentor)||'—';
  var msg1 = '🤝 1-2-1 Introduction จาก Mentor Coordinator!\n'
    + '─────────────────\n'
    + 'สวัสดี ' + nick1 + ' 👋\n\n'
    + 'MC แนะนำให้คุณรู้จักกับ:\n'
    + '👤 ' + p.name2 + ' [ทีม ' + team2 + ']\n\n'
    + 'น่าจะ Synergy กับธุรกิจของคุณได้ดีครับ!\n'
    + 'ลองนัด 1-2-1 เพื่อแลกเปลี่ยนดูนะครับ 🎯';
  var msg2 = '🤝 1-2-1 Introduction จาก Mentor Coordinator!\n'
    + '─────────────────\n'
    + 'สวัสดี ' + nick2 + ' 👋\n\n'
    + 'MC แนะนำให้คุณรู้จักกับ:\n'
    + '👤 ' + p.name1 + ' [ทีม ' + team1 + ']\n\n'
    + 'น่าจะ Synergy กับธุรกิจของคุณได้ดีครับ!\n'
    + 'ลองนัด 1-2-1 เพื่อแลกเปลี่ยนดูนะครับ 🎯';
  var sentTo = [];
  if (uid1) { _sendLineMsg(uid1, msg1); sentTo.push(nick1); }
  if (uid2) { _sendLineMsg(uid2, msg2); sentTo.push(nick2); }
  return {ok:true, sentTo:sentTo};
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature A6 — Absence Reporting via LINE Bot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
var _ABSENCE_SHEET = '📋 ABSENCE LOG';

function _lineAbsenceLog(memberName, detail, type) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var d = _lineGetMemberData(memberName);
  var nick = (d&&d.nick) || memberName.split(' ')[0];
  var team = (d&&d.mentor) || '—';
  var today = new Date();
  var isSub = (type === 'ส่ง sub');
  // find next Friday
  var nextFri = new Date(today);
  var dow = today.getDay();
  var daysToFri = (5 - dow + 7) % 7 || 7;
  nextFri.setDate(today.getDate() + daysToFri);
  var friStr = Utilities.formatDate(nextFri, Session.getScriptTimeZone(), 'dd MMM yyyy');

  var abSh = ss.getSheetByName(_ABSENCE_SHEET);
  if (!abSh) {
    abSh = ss.insertSheet(_ABSENCE_SHEET);
    abSh.appendRow(['วันที่แจ้ง','ชื่อสมาชิก','ชื่อเล่น','ทีม','วันที่ขาด','ประเภท','รายละเอียด']);
    abSh.getRange(1,1,1,7).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  }
  abSh.appendRow([today, memberName, nick, team, nextFri, type||'ลา', detail||'ไม่ระบุ']);

  // Notify Mentor Coordinator
  var mcId = _getLineId('mc');
  if (mcId) {
    var mcMsg = (isSub ? '👥 แจ้งส่ง Sub!\n' : '🙋 แจ้งลา!\n')
      + '─────────────────\n'
      + '👤 ' + nick + ' [ทีม ' + team + ']\n'
      + '📅 วันศุกร์ ' + friStr + '\n'
      + (isSub
          ? '👥 Sub: ' + (detail||'ไม่ระบุ')
          : '📝 เหตุผล: ' + (detail||'ไม่ระบุ')) + '\n'
      + '─────────────────\n'
      + 'รับทราบแล้วอัตโนมัติครับ';
    _sendLineMsg(mcId, mcMsg);
  }

  if (isSub) {
    return '✅ รับทราบแล้วครับ ' + nick + '\n'
      + '─────────────────\n'
      + '👥 ส่ง Sub: ' + (detail||'ไม่ระบุ') + '\n'
      + '📅 วันศุกร์ ' + friStr + '\n\n'
      + 'Mentor Coordinator ได้รับแจ้งแล้วครับ 👍\n'
      + 'พิมพ์ "ยกเลิกลา" ถ้าแผนเปลี่ยนครับ';
  }
  return '✅ รับทราบแล้วครับ ' + nick + '\n'
    + '─────────────────\n'
    + '🙋 ลา: ' + (detail||'ไม่ระบุ') + '\n'
    + '📅 วันศุกร์ ' + friStr + '\n\n'
    + 'Mentor Coordinator ได้รับแจ้งแล้วครับ 👍\n'
    + 'พิมพ์ "ยกเลิกลา" ถ้าแผนเปลี่ยนครับ';
}

function _lineCancelAbsence(memberName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abSh = ss.getSheetByName(_ABSENCE_SHEET);
  if (!abSh || abSh.getLastRow() < 2) return '⚠️ ไม่พบรายการแจ้งลาของคุณครับ';
  var d = _lineGetMemberData(memberName);
  var nick = (d&&d.nick) || memberName.split(' ')[0];
  var today = new Date(); today.setHours(0,0,0,0);
  var dow = today.getDay();
  var weekStart = new Date(today); weekStart.setDate(today.getDate() - dow);
  var data = abSh.getRange(2,1,abSh.getLastRow()-1,3).getValues();
  for (var i = data.length-1; i >= 0; i--) {
    var rowDate = data[i][0] ? new Date(data[i][0]) : null;
    var rowName = String(data[i][1]||'').trim();
    if (rowDate && rowDate >= weekStart && rowName === memberName) {
      abSh.deleteRow(i+2);
      var mcId = _getLineId('mc');
      if (mcId) _sendLineMsg(mcId, '🔄 ' + nick + ' [ทีม '+(d&&d.mentor||'—')+'] ยกเลิกการแจ้งลาแล้วครับ');
      return '✅ ยกเลิกการแจ้งลาแล้วครับ ' + nick + '\n─────────────────\nMentor Coordinator ได้รับแจ้งแล้วครับ';
    }
  }
  return '⚠️ ไม่พบรายการแจ้งลาของสัปดาห์นี้ครับ';
}

function apiGetAbsenceLog(p) {
  if (!p.role) return {ok:false,error:'auth'};
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(_ABSENCE_SHEET);
  if (!sh || sh.getLastRow() < 2) return {ok:true,list:[]};
  var data = sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
  var list = data.map(function(r) {
    return {
      reportedAt: r[0] ? Utilities.formatDate(new Date(r[0]), Session.getScriptTimeZone(), 'dd/MM/yy HH:mm') : '',
      name:   String(r[1]||'').trim(),
      nick:   String(r[2]||'').trim(),
      team:   String(r[3]||'').trim(),
      absDate:r[4] ? Utilities.formatDate(new Date(r[4]), Session.getScriptTimeZone(), 'dd/MM/yyyy') : '',
      type:   String(r[5]||'ลา').trim(),
      detail: String(r[6]||'').trim()
    };
  }).filter(function(r){return r.name;}).reverse();
  return {ok:true, list:list};
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature A7 — Chapter Pulse (Friday morning summary → MC)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _lineChapterPulse() {
  if (_lineLeanPolicyEnabled()) { Logger.log('LEAN: skip legacy chapter pulse'); return; }
  var mcId = _getLineId('mc');
  if (!mcId) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var listSh = ss.getSheetByName('รายชื่อทั้งหมด');
  if (!listSh || listSh.getLastRow() < 3) return;

  // Count scores by color
  var counts = {green:0, yellow:0, red:0, black:0, total:0};
  var scoreSum = 0;
  var riskNames = [];
  listSh.getRange(3,2,listSh.getLastRow()-2,4).getValues().forEach(function(r) {
    var name   = String(r[0]||'').trim();
    var mentor = String(r[2]||'').trim();
    var score  = parseFloat(r[3])||0;
    if (!name || !mentor) return; // skip empty rows and LT/non-mentor members
    counts.total++;
    scoreSum += score;
    var tl = _bniBuildTL ? _bniBuildTL(score) : (score>=70?'green':score>=50?'yellow':score>=30?'red':'black');
    counts[tl] = (counts[tl]||0) + 1;
    if (tl === 'red' || tl === 'black') riskNames.push(name.split(' ')[0]);
  });
  var avg = counts.total > 0 ? Math.round(scoreSum / counts.total) : 0;

  // Check this week's absence log
  var abSh = ss.getSheetByName(_ABSENCE_SHEET);
  var absentees = [];
  if (abSh && abSh.getLastRow() >= 2) {
    var today = new Date(); today.setHours(0,0,0,0);
    var dow = today.getDay();
    var weekStart = new Date(today); weekStart.setDate(today.getDate() - dow);
    var weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
    abSh.getRange(2,1,abSh.getLastRow()-1,3).getValues().forEach(function(r) {
      var d = r[0] ? new Date(r[0]) : null;
      if (d && d >= weekStart && d < weekEnd) absentees.push(String(r[2]||r[1]||'').trim());
    });
  }

  var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMM yyyy');
  var msg = '🏆 Chapter Pulse — ' + dateStr + '\n'
    + '─────────────────\n'
    + 'สมาชิกทั้งหมด: ' + counts.total + ' คน\n'
    + 'คะแนนเฉลี่ย: ' + avg + '/100\n\n'
    + '🟢 ' + counts.green + '  🟡 ' + counts.yellow
    + '  🔴 ' + counts.red + '  ⚫ ' + counts.black + '\n';
  if (riskNames.length) {
    msg += '─────────────────\n';
    msg += '⚠️ ต้องดูแล (' + riskNames.length + ' คน):\n';
    msg += riskNames.slice(0,5).join(', ') + (riskNames.length>5?' +อีก '+(riskNames.length-5)+' คน':'') + '\n';
  }
  if (absentees.length) {
    msg += '─────────────────\n';
    msg += '🙋 แจ้งขาดวันนี้ (' + absentees.length + ' คน):\n';
    msg += absentees.join(', ') + '\n';
  }
  msg += '─────────────────\n';
  msg += 'ขอให้การประชุมราบรื่นครับ! 🙏';
  _sendLineMsg(mcId, msg);
}

function apiGetAbsenceLogRecent(p) {
  if (!p.role) return {ok:false,error:'auth'};
  var r = apiGetAbsenceLog(p);
  if (!r.ok) return r;
  // filter to last 30 days
  var cutoff = new Date(); cutoff.setDate(cutoff.getDate()-30);
  r.list = r.list.filter(function(item){
    var parts = item.reportedAt.split('/');
    if (parts.length < 3) return true;
    return true; // keep all, let UI filter
  });
  return r;
}

function apiSetMCLineId(p) {
  if (p.role !== 'mc') return {ok:false,error:'MC only'};
  if (!p.memberName) return {ok:false,error:'ไม่มีชื่อสมาชิก'};
  var userId = _lineGetUserId(p.memberName);
  if (!userId) return {ok:false,error:'"'+p.memberName+'" ยังไม่ได้ลงทะเบียน LINE Bot'};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('⚙️ SETTINGS');
  if (!sh) {
    sh = ss.insertSheet('⚙️ SETTINGS');
    sh.appendRow(['Key','Value']);
  }
  var data = sh.getDataRange().getValues();
  var found = false;
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === 'LINE_ID_MC') {
      sh.getRange(i+1, 2).setValue(userId);
      found = true; break;
    }
  }
  if (!found) sh.appendRow(['LINE_ID_MC', userId]);
  return {ok:true, userId:userId, name:p.memberName};
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature B2 — Zone-Up Celebration (called inside _lineNotifyScoreUpdate)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _zoneName(score) {
  if (score >= 70) return 'green';
  if (score >= 50) return 'yellow';
  if (score >= 30) return 'red';
  return 'black';
}

function _buildZoneUpMsg(nick, prevScore, newScore) {
  var prev = _zoneName(prevScore), cur = _zoneName(newScore);
  var order = {black:0, red:1, yellow:2, green:3};
  if (order[cur] <= order[prev]) return null;
  var labels = {black:'⚫ Black', red:'🔴 Red', yellow:'🟡 Yellow', green:'🟢 Green'};
  var celebrate = {
    'red':   '🎉 คุณ{nick} ก้าวเข้าสู่โซนแดงแล้วครับ!\nเป็นจุดเริ่มต้นที่ดีมาก — ไปต่อได้เลยครับ 💪',
    'yellow':'🌟 คุณ{nick} ขึ้นโซนเหลืองแล้วครับ! ยอดเยี่ยมมาก!\nอีกแค่ไม่กี่ action ก็เขียวแล้วครับ 🔥',
    'green': '🏆 คุณ{nick} ขึ้นโซนเขียวแล้วครับ!! สุดยอดเลย!\nระดับ Top ของ Chapter ขอแสดงความยินดีด้วยครับ 🎊'
  };
  var msg = (celebrate[cur]||'').replace('{nick}', nick);
  msg += '\n─────────────────\n';
  msg += labels[prev] + ' → ' + labels[cur] + '\n';
  msg += prevScore + ' → ' + newScore + ' pts (+' + (newScore - prevScore) + ')';
  return msg;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature C — Core Issue ผ่าน LINE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _lineReportIssue(memberName, detail) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var nick  = '';
  var team  = '';
  try {
    var d = _lineGetMemberData(memberName);
    nick = (d&&d.nick)||memberName.split(' ')[0];
    team = (d&&d.mentor)||'';
  } catch(e){}

  // Ensure sheet exists
  var sh = ss.getSheetByName('📋 LINE ISSUES');
  if (!sh) {
    sh = ss.insertSheet('📋 LINE ISSUES');
    sh.appendRow(['วันที่','ชื่อสมาชิก','ชื่อเล่น','ทีม','รายละเอียด','สถานะ']);
    sh.setFrozenRows(1);
  }
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  sh.appendRow([now, memberName, nick, team, detail, 'รอดำเนินการ']);

  // Notify mentor (if they have LINE)
  if (team) {
    var mentorId = _getLineId(team.toLowerCase());
    if (mentorId) {
      _sendLineMsg(mentorId,
        '⚠️ สมาชิกแจ้งปัญหาผ่าน LINE\n─────────────────\n'
        + '👤 ' + memberName + ' (' + nick + ')\n'
        + '💬 ' + detail + '\n─────────────────\n'
        + 'ตรวจสอบได้ที่ Sheet "📋 LINE ISSUES" ครับ');
    }
  }
  // Notify MC
  var mcId = _getLineId('mc');
  if (mcId) {
    _sendLineMsg(mcId,
      '⚠️ Core Issue รายใหม่\n─────────────────\n'
      + '👤 ' + memberName + ' / ทีม ' + (team||'—') + '\n'
      + '💬 ' + detail + '\n─────────────────\n'
      + 'ดูได้ที่ Sheet "📋 LINE ISSUES"');
  }
  return '✅ รับเรื่องแล้วครับ คุณ' + nick + '\n─────────────────\n'
    + 'ทีมงานจะติดต่อกลับโดยเร็วครับ\nพิมพ์ "ปัญหา" เพื่อดูสถานะ\nพิมพ์ "ยกเลิกปัญหา" ถ้าหายไปเองครับ';
}

function _lineViewIssue(memberName) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('📋 LINE ISSUES');
  if (!sh || sh.getLastRow() < 2) return '📋 ยังไม่มีเรื่องค้างอยู่ครับ';
  var rows = sh.getRange(2, 1, sh.getLastRow()-1, 6).getValues();
  var myIssues = rows.filter(function(r){ return String(r[1]||'').trim()===memberName && String(r[5]||'').trim()!=='เสร็จสิ้น'; });
  if (!myIssues.length) return '📋 ไม่มีเรื่องค้างอยู่ในขณะนี้ครับ\n\nพิมพ์ "ปัญหา [รายละเอียด]" เพื่อแจ้งใหม่ได้ครับ';
  var lines = ['📋 เรื่องที่แจ้งไว้:\n─────────────────'];
  myIssues.slice(-3).forEach(function(r, i) {
    var statusIcon = r[5]==='รอดำเนินการ' ? '🟡' : r[5]==='กำลังดำเนินการ' ? '🔵' : '✅';
    lines.push((i+1)+'. ' + statusIcon + ' ' + String(r[4]||'').slice(0,50) + '\n   📅 ' + r[0]);
  });
  lines.push('\n─────────────────\nพิมพ์ "ยกเลิกปัญหา" เพื่อยกเลิกล่าสุด');
  return lines.join('\n');
}

function _lineCancelIssue(memberName) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('📋 LINE ISSUES');
  if (!sh || sh.getLastRow() < 2) return 'ไม่พบเรื่องที่แจ้งไว้ครับ';
  var rows = sh.getRange(2, 1, sh.getLastRow()-1, 6).getValues();
  for (var i = rows.length-1; i >= 0; i--) {
    if (String(rows[i][1]||'').trim()===memberName && String(rows[i][5]||'').trim()==='รอดำเนินการ') {
      sh.getRange(i+2, 6).setValue('ยกเลิก');
      return '✅ ยกเลิกเรื่องแล้วครับ\n"' + String(rows[i][4]||'').slice(0,40) + '"';
    }
  }
  return 'ไม่พบเรื่องที่สามารถยกเลิกได้ครับ (อาจดำเนินการไปแล้ว)';
}

function apiGetLineIssues(p) {
  if (!p.role) return {ok:false,error:'auth'};
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('📋 LINE ISSUES');
  if (!sh || sh.getLastRow() < 2) return {ok:true, list:[]};
  var rows = sh.getRange(2, 1, sh.getLastRow()-1, 6).getValues();
  var list = rows.map(function(r, i) {
    return {row:i+2, date:String(r[0]||''), name:String(r[1]||''), nick:String(r[2]||''), team:String(r[3]||''), detail:String(r[4]||''), status:String(r[5]||'')};
  }).filter(function(r){ return r.name; });
  list.reverse();
  return {ok:true, list:list};
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature E — Simulate Score (ลอง ref 3 / ลอง 1-2-1 2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _lineSimulate(memberName, metric, addCount) {
  var d = _lineGetMemberData(memberName);
  if (!d || !d.actual) return 'ไม่พบข้อมูลครับ';
  var nick = d.nick || memberName.split(' ')[0];
  var a    = d.actual;
  var add  = parseFloat(addCount)||0;
  if (add <= 0) return '❓ ระบุจำนวนที่ต้องการทดสอบด้วยครับ\nเช่น: ลอง ref 3 / ลอง 1-2-1 2 / ลอง visitor 1 / ลอง ceu 2';

  // Build modified actual
  var modified = {
    P: a.attend||0, A: a.absent||0, L:0, M:0, S:0,
    RGI: a.rg||0, RGO: 0, V: a.visitor||0,
    oto: a.oToOne||0, ceu: a.ceu||0, tyfb: a.tyfcb||0, bniDays: a.bniDays||0
  };
  var metricLabel = '';
  var m = String(metric).toLowerCase();
  if      (m==='ref'||m==='referral'||m==='rg') { modified.RGI += add; metricLabel = 'Referral +'+add+' ใบ'; }
  else if (m==='1-2-1'||m==='121'||m==='oto')   { modified.oto += add; metricLabel = '1-2-1 +'+add+' ครั้ง'; }
  else if (m==='visitor'||m==='vis')             { modified.V   += add; metricLabel = 'Visitor +'+add+' คน'; }
  else if (m==='ceu'||m==='training')            { modified.ceu += add; metricLabel = 'CEU +'+add+' แต้ม'; }
  else if (m==='tyfcb'||m==='tyfb'||m==='ty')   { modified.tyfb += add*1000; metricLabel = 'TYFCB +'+add+'K บาท'; }
  else return '❓ ไม่รู้จัก metric นั้นครับ\nใช้ได้: ref, 1-2-1, visitor, ceu, tyfcb';

  var before = calcPALMSScore(modified);
  // adjust back to before for comparison
  var orig = {
    P: a.attend||0, A: a.absent||0, L:0, M:0, S:0,
    RGI: a.rg||0, RGO: 0, V: a.visitor||0,
    oto: a.oToOne||0, ceu: a.ceu||0, tyfb: a.tyfcb||0, bniDays: a.bniDays||0
  };
  var origScore = calcPALMSScore(orig);
  var currentScore = d.bniScore || origScore.total;
  var newTotal     = Math.max(origScore.total, 0) + (before.total - origScore.total);
  var diff = before.total - origScore.total;
  var zoneNow  = _zoneName(currentScore);
  var zoneNew  = _zoneName(currentScore + diff);
  var zoneIcons = {black:'⚫',red:'🔴',yellow:'🟡',green:'🟢'};

  var msg = '🔮 Simulate: '+metricLabel+'\n';
  msg += '─────────────────\n';
  msg += '📊 ก่อน: ' + zoneIcons[zoneNow] + ' ' + currentScore + ' pts\n';
  msg += '📈 หลัง: ' + zoneIcons[zoneNew] + ' ' + (currentScore+diff) + ' pts';
  if (diff > 0) msg += ' (+' + diff + ')';
  else if (diff === 0) msg += ' (ไม่เปลี่ยน)';
  msg += '\n';
  if (zoneNew !== zoneNow) {
    msg += '\n🎯 จะขึ้นโซน ' + zoneIcons[zoneNew] + ' ' + zoneNew.toUpperCase() + '!\n';
  }
  msg += '─────────────────\n';
  var gap = _getNextColorGap(currentScore+diff);
  if (gap.next) msg += '💡 ' + gap.needed;
  else msg += '🏆 โซนสูงสุดแล้วครับ!';
  return msg;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Notification Preferences — col G of 📱 LINE MEMBERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
var _NOTIF_TYPE_MAP = {
  'nudge':'nudge','wednesday':'nudge',
  'leaderboard':'leaderboard',
  'brief':'brief','monday':'brief',
  'recap':'recap','monthly':'recap',
  'postmeeting':'postmeeting','post':'postmeeting',
  'ทุกอย่าง':'all','all':'all','ทั้งหมด':'all'
};
var _NOTIF_LABELS = {
  nudge:'⏰ Wednesday Nudge', brief:'🌅 Monday Brief',
  leaderboard:'🏆 Team Leaderboard', recap:'📊 Monthly Recap',
  postmeeting:'📋 Post-Meeting'
};

function _lineToggleNotif(member, typeText, disable) {
  var type = _NOTIF_TYPE_MAP[typeText.toLowerCase()] || typeText.toLowerCase();
  var validTypes = ['nudge','leaderboard','brief','recap','postmeeting'];
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('📱 LINE MEMBERS');
  if (!sh || sh.getLastRow() < 2) return 'ไม่พบข้อมูลครับ';
  if (!sh.getRange(1,7).getValue()) sh.getRange(1,7).setValue('notif_prefs');
  var rows = sh.getRange(2, 1, sh.getLastRow()-1, 7).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1]||'').trim() !== member) continue;
    var cur = String(rows[i][6]||'').trim();
    var prefs = cur ? cur.split(',').filter(function(p){return p;}) : [];
    if (type === 'all') {
      prefs = disable ? validTypes.slice() : [];
    } else {
      if (disable && prefs.indexOf(type) < 0) prefs.push(type);
      if (!disable) prefs = prefs.filter(function(p){ return p !== type; });
    }
    sh.getRange(i+2, 7).setValue(prefs.join(','));
    var d = _lineGetMemberData(member);
    var nick = (d&&d.nick)||member.split(' ')[0];
    if (type === 'all') {
      return disable
        ? '🔕 ปิดการแจ้งเตือนทั้งหมดแล้วครับ คุณ'+nick+'\nพิมพ์ "เปิด ทุกอย่าง" เพื่อเปิดใหม่'
        : '🔔 เปิดการแจ้งเตือนทั้งหมดแล้วครับ คุณ'+nick;
    }
    var label = _NOTIF_LABELS[type] || type;
    return (disable ? '🔕 ปิด '+label : '🔔 เปิด '+label)
      + ' แล้วครับ\nพิมพ์ "แจ้งเตือน" ดูสถานะทั้งหมด';
  }
  return 'ไม่พบข้อมูลครับ';
}

function _lineNotifSettingsReply(member) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('📱 LINE MEMBERS');
  var prefs = [];
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2,1,sh.getLastRow()-1,7).getValues().forEach(function(r){
      if (String(r[1]||'').trim() === member) prefs = String(r[6]||'').trim().split(',');
    });
  }
  var d = _lineGetMemberData(member);
  var nick = (d&&d.nick)||member.split(' ')[0];
  var types = [['nudge','⏰ Wednesday Nudge'],['brief','🌅 Monday Brief'],
               ['leaderboard','🏆 Leaderboard'],['recap','📊 Monthly Recap'],['postmeeting','📋 Post-Meeting']];
  var lines = ['🔔 การแจ้งเตือน — คุณ'+nick,'─────────────────'];
  types.forEach(function(t){ lines.push((prefs.indexOf(t[0])<0?'✅':'🔕')+' '+t[1]); });
  lines.push('─────────────────');
  lines.push('เช่น: ปิด nudge / เปิด nudge');
  lines.push('ปิด ทุกอย่าง  /  เปิด ทุกอย่าง');
  return lines.join('\n');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Personal Goals — col H of 📱 LINE MEMBERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
var _GOAL_METRIC_MAP = {
  'ref':'ref','referral':'ref','rg':'ref',
  '1-2-1':'oto','121':'oto','oto':'oto',
  'visitor':'visitor','vis':'visitor',
  'ceu':'ceu','training':'ceu'
};
var _GOAL_LABELS = {ref:'Referral', oto:'1-2-1', visitor:'Visitor', ceu:'CEU'};

function _lineGetGoals(memberName) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('📱 LINE MEMBERS');
  if (!sh || sh.getLastRow() < 2) return {};
  var rows = sh.getRange(2, 1, sh.getLastRow()-1, 8).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1]||'').trim() !== memberName) continue;
    var g = String(rows[i][7]||'').trim();
    if (!g) return {};
    try { return JSON.parse(g); } catch(e) { return {}; }
  }
  return {};
}

function _lineSetGoal(member, metricText, target) {
  var metric = _GOAL_METRIC_MAP[String(metricText).toLowerCase()];
  if (!metric) return '❓ ไม่รู้จัก metric นั้นครับ\nใช้ได้: ref, 1-2-1, visitor, ceu';
  if (target <= 0) return '❓ ระบุเป้าหมายด้วยครับ เช่น: เป้า ref 8';
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('📱 LINE MEMBERS');
  if (!sh || sh.getLastRow() < 2) return 'ไม่พบข้อมูลครับ';
  if (!sh.getRange(1,8).getValue()) sh.getRange(1,8).setValue('goals_json');
  var rows = sh.getRange(2, 1, sh.getLastRow()-1, 8).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1]||'').trim() !== member) continue;
    var g = {}; try { g = JSON.parse(String(rows[i][7]||'{}')); } catch(e){}
    g[metric] = target;
    sh.getRange(i+2, 8).setValue(JSON.stringify(g));
    var d = _lineGetMemberData(member);
    var nick = (d&&d.nick)||member.split(' ')[0];
    return '🎯 ตั้งเป้าแล้วครับ คุณ'+nick
      +'\n─────────────────\n'
      +_GOAL_LABELS[metric]+': '+target+' ครั้ง/ใบ/เดือน\n\n'
      +'ระบบจะรายงาน progress ทุกจันทร์เช้าครับ\n'
      +'พิมพ์ "เป้า" เพื่อดูทุกเป้า';
  }
  return 'ไม่พบข้อมูลครับ';
}

function _lineGoalsReply(member) {
  var goals = _lineGetGoals(member);
  var d = _lineGetMemberData(member);
  var nick = (d&&d.nick)||member.split(' ')[0];
  var a = (d&&d.actual)||{};
  if (!Object.keys(goals).length) {
    return '🎯 ยังไม่มีเป้าหมายครับ คุณ'+nick
      +'\n─────────────────\n'
      +'ตั้งเป้าได้ด้วย:\n'
      +'เป้า ref 8       →  Referral 8 ใบ\n'
      +'เป้า visitor 2  →  Visitor 2 คน\n'
      +'เป้า 1-2-1 12  →  1-2-1 12 ครั้ง\n'
      +'เป้า ceu 4      →  CEU 4 แต้ม';
  }
  var curMap = {ref:a.rg||0, oto:a.oToOne||0, visitor:a.visitor||0, ceu:a.ceu||0};
  var lines = ['🎯 เป้าหมายเดือนนี้ — คุณ'+nick,'─────────────────'];
  Object.keys(goals).forEach(function(m){
    var tgt=goals[m], cur=curMap[m]||0, pct=Math.round(cur/tgt*100);
    var bar = cur>=tgt?'✅':pct>=75?'🔸':pct>=50?'🟡':'⚠️';
    lines.push(bar+' '+(_GOAL_LABELS[m]||m)+': '+cur+'/'+tgt+'  ('+pct+'%)');
  });
  lines.push('─────────────────');
  lines.push('เป้า [metric] [จำนวน] เพื่ออัพเดท');
  return lines.join('\n');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature — Monday Morning Brief (จันทร์ 08:00)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function mondayMorningBrief() {
  if (_lineLeanPolicyEnabled()) { Logger.log('LEAN: skip legacy monday brief'); return; }
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('📱 LINE MEMBERS');
  if (!sh || sh.getLastRow() < 2) return;
  var rows = sh.getRange(2, 1, sh.getLastRow()-1, 8).getValues();
  var sent = 0;
  rows.forEach(function(r) {
    var userId   = String(r[0]||'').trim();
    var name     = String(r[1]||'').trim();
    var disabled = String(r[6]||'').trim().split(',');
    if (!userId || !name) return;
    if (disabled.indexOf('brief') >= 0) return;
    try {
      var d = _lineGetMemberData(name);
      if (!d || !d.bniScore) return;
      var nick  = (d&&d.nick)||name.split(' ')[0];
      var score = d.bniScore||0;
      var tl    = d.bniTl||'black';
      var tlIcon = {green:'🟢',yellow:'🟡',red:'🔴',black:'⚫'}[tl]||'📊';
      var cats  = d.cats||{};
      var a     = d.actual||{};
      var effWks = Math.min(26, Math.max(1, Math.floor((a.bniDays||0)/7)));
      var actions = [];
      if ((cats.training||0) < 15) actions.push({gain:20-(cats.training||0), label:'CEU: ทำ BNI Online Training'});
      if (effWks>0&&(a.visitor||0)/(effWks/4)<1) actions.push({gain:10,label:'Visitor: พาหน้าใหม่เข้า meeting'});
      if (effWks>0&&(a.oToOne||0)/effWks<1)      actions.push({gain:5, label:'1-2-1: นัดสมาชิกอีกทีมสัปดาห์นี้'});
      if (effWks>0&&(a.rg||0)/effWks<1)          actions.push({gain:5, label:'Referral: ส่งใบ ref ให้สักคน'});
      actions.sort(function(a,b){return b.gain-a.gain;});
      var nextTgt = score<30?30:score<50?50:score<70?70:null;
      var msg = '🌅 สวัสดีตอนเช้า คุณ'+nick+'\n'
        +'─────────────────\n'
        +'สัปดาห์ใหม่ เริ่มต้นดีๆ กันครับ!\n\n'
        +tlIcon+' คะแนนล่าสุด: '+score+'/100\n';
      if (nextTgt) {
        var zn = nextTgt>=70?'🟢 Green':nextTgt>=50?'🟡 Yellow':'🔴 Red';
        msg += '🎯 เป้า: '+zn+' (อีก '+(nextTgt-score)+' pt)\n';
      } else {
        msg += '🏆 Green Zone แล้ว รักษาให้อยู่!\n';
      }
      if (actions.length) {
        msg += '\n⚡ Action สัปดาห์นี้:\n';
        actions.slice(0,2).forEach(function(ac,i){ msg += (i+1)+'. '+ac.label+'\n'; });
      }
      var goals = {}; try { goals = JSON.parse(String(r[7]||'{}')); } catch(e){}
      var gKeys = Object.keys(goals);
      if (gKeys.length) {
        var curMap = {ref:a.rg||0,oto:a.oToOne||0,visitor:a.visitor||0,ceu:a.ceu||0};
        msg += '\n🎯 Progress:\n';
        gKeys.forEach(function(m){
          var cur=curMap[m]||0, tgt=goals[m];
          var bar = cur>=tgt?'✅':Math.round(cur/tgt*100)>=75?'🔸':'⚠️';
          msg += bar+' '+(_GOAL_LABELS[m]||m)+': '+cur+'/'+tgt+'\n';
        });
      }
      msg += '─────────────────\nพิมพ์ "สถานะ" ดูรายละเอียด 💪';
      var qr = [
        {type:'action',action:{type:'message',label:'📊 สถานะ',text:'สถานะ'}},
        {type:'action',action:{type:'message',label:'🤝 แนะนำ 1-2-1',text:'แนะนำ'}},
        {type:'action',action:{type:'message',label:'🎯 เป้าหมาย',text:'เป้า'}}
      ];
      _sendLineMsgQR(userId, msg, qr);
      sent++;
    } catch(e2) { Logger.log('mondayMorningBrief error: '+e2.message); }
  });
  Logger.log('mondayMorningBrief: sent to '+sent);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature — Monthly Recap (จันทร์แรกของเดือน 09:00)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function monthlyRecap() {
  if (_lineLeanPolicyEnabled()) { Logger.log('LEAN: skip legacy monthly recap'); return; }
  if (new Date().getDate() > 7) return; // only first Monday of month
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('📱 LINE MEMBERS');
  if (!sh || sh.getLastRow() < 2) return;
  var rows = sh.getRange(2, 1, sh.getLastRow()-1, 7).getValues();
  var sent = 0;
  var thMonths = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  var today = new Date();
  var prevMonthName = thMonths[today.getMonth()===0?12:today.getMonth()];
  rows.forEach(function(r) {
    var userId   = String(r[0]||'').trim();
    var name     = String(r[1]||'').trim();
    var disabled = String(r[6]||'').trim().split(',');
    if (!userId || !name) return;
    if (disabled.indexOf('recap') >= 0) return;
    try {
      var d = _lineGetMemberData(name);
      if (!d || !d.scoreHistory || d.scoreHistory.length < 2) return;
      var nick  = (d&&d.nick)||name.split(' ')[0];
      var hist  = d.scoreHistory;
      var last  = hist[hist.length-1];
      var prev  = hist[hist.length-2];
      var diff  = Math.round(last.score - prev.score);
      var tl = last.score>=70?'🟢':last.score>=50?'🟡':last.score>=30?'🔴':'⚫';
      var arrow = diff>0?'↑+'+diff:diff<0?'↓'+diff:'→';
      var cats  = d.cats||{};
      var msg = '📊 สรุปเดือน '+prevMonthName+' — คุณ'+nick+'\n'
        +'─────────────────\n'
        +tl+' คะแนน: '+Math.round(last.score)+' pt  '+arrow+'\n'
        +'(เดือนก่อน: '+Math.round(prev.score)+' pt)\n'
        +'─────────────────\n';
      var comps = [
        ['⚫ ขาดประชุม',cats.absent||0,15],['📨 Referral',cats.ref||0,15],
        ['🤝 1-2-1',cats.one21||0,15],['🧲 Visitor',cats.visitor||0,20],
        ['📚 CEU',cats.training||0,20],['💰 TYFCB',cats.tyfcb||0,15]
      ];
      comps.forEach(function(c){
        var b = c[1]>=c[2]?'✅':c[1]>=c[2]*0.6?'🔸':'⚠️';
        msg += b+' '+c[0]+': '+c[1]+'/'+c[2]+'\n';
      });
      msg += '─────────────────\n';
      if (diff>0)      msg += '🎉 +'+diff+' pt เดือนนี้! ทำต่อไปครับ 💪\n';
      else if (diff<0) msg += '📉 -'+Math.abs(diff)+' pt เดือนหน้าทำให้ดีขึ้นได้ 💡\n';
      else             msg += '→ คะแนนเท่าเดิม เพิ่ม 1 action ขึ้นได้เลยครับ\n';
      var nextTgt = Math.round(last.score)<30?30:Math.round(last.score)<50?50:Math.round(last.score)<70?70:null;
      if (nextTgt) msg += '🎯 เป้าเดือนหน้า: อีก '+(nextTgt-Math.round(last.score))+' pt ขึ้น zone!';
      _sendLineMsg(userId, msg);
      sent++;
    } catch(e2) { Logger.log('monthlyRecap error: '+e2.message); }
  });
  Logger.log('monthlyRecap: sent to '+sent);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature — 1-2-1 Auto-Reminder (อังคาร 09:00)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function line121AutoReminder() {
  if (_lineLeanPolicyEnabled()) { Logger.log('LEAN: skip legacy 1-2-1 reminder'); return; }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var trackerSh = ss.getSheetByName('📊 1-2-1 TRACKER');
  var lineSh    = ss.getSheetByName('📱 LINE MEMBERS');
  if (!trackerSh || trackerSh.getLastRow() < 2 || !lineSh || lineSh.getLastRow() < 2) return;
  var userMap = {};
  lineSh.getRange(2,1,lineSh.getLastRow()-1,2).getValues().forEach(function(r){
    if (r[0]&&r[1]) userMap[String(r[1]).trim()] = String(r[0]).trim();
  });
  var now  = new Date();
  var rows = trackerSh.getRange(2, 1, trackerSh.getLastRow()-1, 7).getValues();
  var sent = 0;
  rows.forEach(function(r) {
    var dateVal = r[0]; var name = String(r[1]||'').trim(); var nick = String(r[2]||'').trim();
    var partner = String(r[4]||'').trim(); var status = String(r[6]||'').trim();
    if (!name || status !== 'นัดแล้ว') return;
    var meetDate = dateVal instanceof Date ? dateVal : new Date(dateVal);
    if (isNaN(meetDate.getTime())) return;
    var daysSince = (now - meetDate) / 86400000;
    if (daysSince < 3 || daysSince > 14) return;
    var userId = userMap[name];
    if (!userId) return;
    var msg = '⏰ เช็ค 1-2-1 — คุณ'+nick+'\n'
      +'─────────────────\n'
      +'นัด '+partner+' เมื่อ '+Math.round(daysSince)+' วันที่แล้ว\n'
      +'เจอกันแล้วยังครับ?\n\n'
      +'กด "เจอแล้ว" เพื่อบันทึกผล';
    var qr = [
      {type:'action',action:{type:'message',label:'✅ เจอแล้ว',text:'เจอแล้ว'}},
      {type:'action',action:{type:'message',label:'📊 ติดตาม',text:'ติดตาม'}}
    ];
    _sendLineMsgQR(userId, msg, qr);
    sent++;
  });
  Logger.log('line121AutoReminder: sent '+sent);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mentor Broadcast — ส่งข้อความไปยัง mentees ทั้งทีม
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function apiMentorBroadcast(p) {
  var role = p.role||'';
  var message = String(p.message||'').trim();
  if (!message) return {ok:false, error:'ต้องระบุข้อความ'};
  var roleToTeam = {toomtam:'TOOMTAM',aof:'Aof',draft:'Draft',phai:'PHAI',amp:'AMP'};
  var teamSheet = roleToTeam[role];
  if (!teamSheet && role !== 'mc') return {ok:false, error:'Permission denied'};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lineSh = ss.getSheetByName('📱 LINE MEMBERS');
  if (!lineSh || lineSh.getLastRow() < 2) return {ok:false, error:'ไม่มีสมาชิก LINE'};
  var userMap = {};
  lineSh.getRange(2,1,lineSh.getLastRow()-1,2).getValues().forEach(function(r){
    if (r[0]&&r[1]) userMap[String(r[1]).trim()] = String(r[0]).trim();
  });
  var targets = [];
  if (role === 'mc') {
    targets = Object.keys(userMap);
  } else {
    var listSh = ss.getSheetByName('รายชื่อทั้งหมด');
    if (listSh && listSh.getLastRow() >= 3) {
      listSh.getRange(3,2,listSh.getLastRow()-2,3).getValues().forEach(function(r){
        var n = String(r[0]||'').trim(), team = String(r[2]||'').trim();
        if (n && team === teamSheet && userMap[n]) targets.push(n);
      });
    }
  }
  var sent = 0;
  targets.forEach(function(name, i) {
    try {
      if (i > 0) Utilities.sleep(200);
      _sendLineMsg(userMap[name], message);
      sent++;
    } catch(e) { Logger.log('mentorBroadcast error: '+e.message); }
  });
  return {ok:true, sent:sent, total:targets.length};
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LINE Rich Menu Setup
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function apiSetupRichMenu(p) {
  if (p.role !== 'mc') return {ok:false, error:'MC only'};
  var token = _getLineToken();
  if (!token) return {ok:false, error:'ไม่พบ LINE Token'};
  try {
    var listRes = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/list',
      {headers:{'Authorization':'Bearer '+token},muteHttpExceptions:true});
    var existing = JSON.parse(listRes.getContentText());
    (existing.richmenus||[]).forEach(function(rm){
      UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/'+rm.richMenuId,
        {method:'DELETE',headers:{'Authorization':'Bearer '+token},muteHttpExceptions:true});
    });
  } catch(e) {}
  var menuDef = {
    size:{width:2500,height:843}, selected:true,
    name:'BNI IDEAL Menu', chatBarText:'📋 เมนู BNI',
    areas:[
      {bounds:{x:0,   y:0,  width:833,height:421},action:{type:'message',label:'📊 สถานะ', text:'สถานะ'}},
      {bounds:{x:833, y:0,  width:834,height:421},action:{type:'message',label:'📈 ประวัติ',text:'ประวัติ'}},
      {bounds:{x:1667,y:0,  width:833,height:421},action:{type:'message',label:'🤝 แนะนำ', text:'แนะนำ'}},
      {bounds:{x:0,   y:421,width:833,height:422},action:{type:'message',label:'📊 ติดตาม',text:'ติดตาม'}},
      {bounds:{x:833, y:421,width:834,height:422},action:{type:'message',label:'⚠️ ปัญหา', text:'ปัญหา'}},
      {bounds:{x:1667,y:421,width:833,height:422},action:{type:'message',label:'❓ ช่วย',   text:'ช่วย'}}
    ]
  };
  var createRes = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
    payload:JSON.stringify(menuDef),
    muteHttpExceptions:true
  });
  var created = JSON.parse(createRes.getContentText());
  if (!created.richMenuId) return {ok:false, error:'สร้างไม่สำเร็จ: '+createRes.getContentText()};
  UrlFetchApp.fetch('https://api.line.me/v2/bot/user/all/richmenu/'+created.richMenuId,{
    method:'POST', headers:{'Authorization':'Bearer '+token}, muteHttpExceptions:true
  });
  PropertiesService.getScriptProperties().setProperty('LINE_RICH_MENU_ID', created.richMenuId);
  return {ok:true, richMenuId:created.richMenuId,
    note:'✅ สร้าง Rich Menu แล้วครับ\n⚠️ ต้องอัพโหลด background image ผ่าน LINE OA Manager\nMenu ID: '+created.richMenuId};
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature D — Friday Team Leaderboard (ศุกร์ 07:30)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function fridayTeamLeaderboard() {
  if (_lineLeanPolicyEnabled()) { Logger.log('LEAN: skip legacy team leaderboard'); return; }
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var sh  = ss.getSheetByName('📱 LINE MEMBERS');
  if (!sh || sh.getLastRow() < 2) return;

  // Build team score map from master sheet (fast — no per-member data calls)
  var masterSh = ss.getSheetByName('รายชื่อทั้งหมด');
  var teamScores = {}; // name → {score, nick, mentor}
  if (masterSh && masterSh.getLastRow() >= 3) {
    masterSh.getRange(3, 2, masterSh.getLastRow()-2, 4).getValues().forEach(function(r) {
      var name   = String(r[0]||'').trim();
      var nick   = String(r[1]||'').trim();
      var mentor = String(r[2]||'').trim();
      var score  = parseFloat(r[3])||0;
      if (name && mentor) teamScores[name] = {score:score, nick:nick||name.split(' ')[0], mentor:mentor};
    });
  }

  var rows = sh.getRange(2, 1, sh.getLastRow()-1, 7).getValues();
  var sent = 0;
  rows.forEach(function(r) {
    var userId = String(r[0]||'').trim();
    var name   = String(r[1]||'').trim();
    if (!userId || !name) return;
    var disabled = String(r[6]||'').trim().split(',');
    if (disabled.indexOf('leaderboard') >= 0) return;
    try {
      var me = teamScores[name];
      if (!me || !me.mentor) return;
      var team = me.mentor;

      // Get all team members sorted by score desc
      var members = Object.keys(teamScores).filter(function(n){ return teamScores[n].mentor===team; })
        .map(function(n){ return {name:n, nick:teamScores[n].nick, score:teamScores[n].score}; })
        .sort(function(a,b){ return b.score-a.score; });
      if (members.length === 0) return;

      var medals = ['🥇','🥈','🥉'];
      var myRank = -1;
      var lines  = members.map(function(m, i) {
        var medal = medals[i] || ('  '+(i+1)+'.');
        var isMe  = m.name === name;
        if (isMe) myRank = i+1;
        var tl    = _bniBuildTL(m.score)||'black';
        var icon  = {green:'🟢',yellow:'🟡',red:'🔴',black:'⚫'}[tl]||'📊';
        return medal + (isMe?' ★ ':' ') + m.nick + '  ' + icon + ' ' + m.score;
      });

      var msg = '🏆 Leaderboard ทีม ' + team + '\n';
      msg += '─────────────────\n';
      msg += lines.join('\n') + '\n';
      msg += '─────────────────\n';
      if (myRank === 1)      msg += '👑 คุณอยู่อันดับ 1 ของทีม! รักษาไว้นะครับ';
      else if (myRank <= 3)  msg += '🥉 Top 3 ของทีม! อีกหน่อยก็ #1 แล้ว';
      else {
        var gap = me.score > 0 && members[myRank-2] ? (members[myRank-2].score - me.score) : 0;
        msg += '📊 อันดับ '+myRank+'/'+members.length+' — ห่างอันดับบน ' + gap + ' pts';
      }
      _sendLineMsg(userId, msg);
      sent++;
    } catch(e2) { Logger.log('fridayTeamLeaderboard error for '+name+': '+e2.message); }
  });
  Logger.log('fridayTeamLeaderboard: sent to '+sent);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature A8 — Friday Post-Meeting Prompt (ศุกร์ 13:00)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function fridayPostMeetingPrompt() {
  if (_lineLeanPolicyEnabled()) { Logger.log('LEAN: skip legacy post-meeting prompt'); return; }
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('📱 LINE MEMBERS');
  if (!sh || sh.getLastRow() < 2) return;
  var rows = sh.getRange(2, 1, sh.getLastRow()-1, 7).getValues();
  var sent = 0;
  rows.forEach(function(r) {
    var userId = String(r[0]||'').trim();
    var name   = String(r[1]||'').trim();
    if (!userId || !name) return;
    var disabled = String(r[6]||'').trim().split(',');
    if (disabled.indexOf('postmeeting') >= 0) return;
    try {
      var d = _lineGetMemberData(name);
      var nick = (d&&d.nick)||name.split(' ')[0];
      var cats = (d&&d.cats)||{};
      var tips = [];
      if ((cats.one21||0) < 10) tips.push('🤝 นัด 1-2-1 ให้ครบ 1 ครั้ง/สัปดาห์');
      if ((cats.ref||0)   < 10) tips.push('📨 ส่ง Referral ให้สมาชิกที่เหมาะกับลูกค้าคุณ');
      if ((cats.visitor||0)<10) tips.push('🧲 หา Visitor สักคนมาครั้งหน้า');
      var msg = '🎯 ขอบคุณที่มาประชุมครับ คุณ'+nick+'!\n'
        + '─────────────────\n'
        + '✅ Checklist หลังประชุม:\n'
        + '• นัด 1-2-1 สัปดาห์หน้าแล้วไหม?\n'
        + '• ส่ง Referral ให้ใครได้บ้าง?\n'
        + '• มี Visitor ที่จะพามาครั้งหน้าไหม?\n';
      if (tips.length) {
        msg += '─────────────────\n';
        msg += '💡 Focus สัปดาห์นี้:\n';
        tips.slice(0,2).forEach(function(t){ msg += '• '+t+'\n'; });
      }
      msg += '─────────────────\n';
      msg += 'พิมพ์ "สถานะ" ดูคะแนนปัจจุบัน 📊';
      _sendLineMsg(userId, msg);
      // 1-2-1 follow-up: ask about any pending meetings from previous week
      try {
        var fu = _line121FollowUp(name, userId);
        if (fu) {
          Utilities.sleep(600);
          _sendLineMsg(userId, fu.msg);
        }
      } catch(ef){}
      sent++;
    } catch(e2) { Logger.log('fridayPostMeetingPrompt error: '+e2.message); }
  });
  Logger.log('fridayPostMeetingPrompt: sent to '+sent);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature A9 — Wednesday Nudge (พุธ 10:00 — เฉพาะคนที่ขาด metric)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function wednesdayNudge() {
  if (_lineLeanPolicyEnabled()) { Logger.log('LEAN: skip legacy Wednesday nudge'); return; }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('📱 LINE MEMBERS');
  if (!sh || sh.getLastRow() < 2) return;

  // ── Pre-load all reference data ONCE (outside loop) ─────────
  // 1. Master sheet: nickMap + teamMap
  var nickMap = {}, teamMap = {};
  var listSh = ss.getSheetByName('รายชื่อทั้งหมด');
  if (listSh && listSh.getLastRow() >= 3) {
    listSh.getRange(3,2,listSh.getLastRow()-2,3).getValues().forEach(function(r){
      var n = String(r[0]||'').trim();
      if (n) { nickMap[n] = String(r[1]||'').trim()||n.split(' ')[0]; teamMap[n] = String(r[2]||'').trim(); }
    });
  }
  // 2. CHECKIN LOG: latest Looking For per member
  var ciLF = {}; // name → lf string
  var ciSh = ss.getSheetByName('📋 CHECKIN LOG');
  if (ciSh && ciSh.getLastRow() >= 2) {
    ciSh.getRange(2,1,ciSh.getLastRow()-1,5).getValues().forEach(function(r){
      var n = String(r[1]||'').trim(); var lf = String(r[4]||'').trim();
      if (n && lf) ciLF[n] = lf; // later rows overwrite → keep latest
    });
  }
  // 3. LINE MEMBERS: biz_profile (col E) + notif_prefs (col G)
  var bizMap = {}, disabledMap = {};
  var allLMRows = sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
  allLMRows.forEach(function(r){
    var n = String(r[1]||'').trim(); var biz = String(r[4]||'').trim();
    if (n && biz) bizMap[n] = biz;
    if (n) disabledMap[n] = String(r[6]||'').trim().split(',');
  });

  var rows = allLMRows;
  var sent = 0;

  rows.forEach(function(r) {
    var userId = String(r[0]||'').trim();
    var name   = String(r[1]||'').trim();
    if (!userId || !name) return;
    if ((disabledMap[name]||[]).indexOf('nudge') >= 0) return;
    try {
      var d = _lineGetMemberData(name);
      if (!d || !d.bniScore) return;
      var nick     = (d&&d.nick)||name.split(' ')[0];
      var cats     = d.cats||{};
      var a        = d.actual||{};
      var selfTeam = (d&&d.mentor)||'';
      var effWks   = Math.min(26, Math.max(1, Math.floor((a.bniDays||0)/7)));
      var otoPerWk = effWks>0 ? (a.oToOne||0)/effWks : 0;
      var rgPerWk  = effWks>0 ? (a.rg||0)/effWks : 0;

      var nudges = [];
      if ((cats.training||0) < 10)
        nudges.push({gain:10, icon:'📚', msg:'CEU ยังขาดอยู่ '+Math.round(20-(cats.training||0))+' pt\nลอง BNI Online Training วันนี้ได้เลยครับ 🎓'});
      if ((cats.visitor||0) < 10)
        nudges.push({gain:10, icon:'🧲', msg:'ยังไม่มี Visitor เดือนนี้\nมีใครในเครือข่ายเหมาะกับ BNI ไหมครับ?'});
      if (otoPerWk < 1)
        nudges.push({gain:5, icon:'🤝', msg:'ยังไม่มี 1-2-1 สัปดาห์นี้เลยครับ\nดูคนที่น่าจะเหมาะได้ด้านล่างเลยครับ 👇'});
      if (rgPerWk < 1)
        nudges.push({gain:5, icon:'📨', msg:'ส่ง Referral ให้สมาชิกสักใบดีกว่านะครับ\nนึกถึงใครที่น่าจะช่วยกันได้บ้าง?'});
      if (!nudges.length) return;

      nudges.sort(function(a,b){ return b.gain-a.gain; });
      var top = nudges[0];
      var msg = top.icon+' Nudge — คุณ'+nick+'\n'
        + '─────────────────\n'
        + top.msg+'\n\n'
        + '📊 คะแนนปัจจุบัน: '+(d.bniScore||0)+'/100';

      if (top.icon === '🤝') {
        // Smart match using pre-loaded data
        var myLF = bizMap[name] || ciLF[name] || '';
        var qrBtns = _getSmartQRButtons(name, myLF, selfTeam, ciLF, nickMap, teamMap, 5);
        qrBtns.push({type:'action',action:{type:'message',label:'📊 ดูสถานะ',text:'สถานะ'}});
        _sendLineMsgQR(userId, msg, qrBtns);
      } else {
        _sendLineMsg(userId, msg);
      }
      sent++;
    } catch(e2) { Logger.log('wednesdayNudge error for '+name+': '+e2.message); }
  });
  Logger.log('wednesdayNudge: sent to '+sent+' members');
}

// Smart match for QR buttons — uses pre-loaded data, no sheet reads
function _getSmartQRButtons(memberName, myLF, selfTeam, ciLF, nickMap, teamMap, limit) {
  if (!myLF) {
    // No profile: fall back to cross-team members sorted randomly
    var fallback = [];
    Object.keys(nickMap).forEach(function(n){
      if (n !== memberName && teamMap[n]) fallback.push({nick:nickMap[n], cross: teamMap[n]!==selfTeam});
    });
    fallback.sort(function(a,b){ return a.cross===b.cross ? Math.random()-.5 : (a.cross?-1:1); });
    return fallback.slice(0, limit||5).map(function(m){
      return {type:'action',action:{type:'message',label:'🤝 นัด '+m.nick,text:'นัด '+m.nick}};
    });
  }

  var qLow  = myLF.toLowerCase();
  var qCats = _getCategories(qLow);
  var qWords = _tokenize(qLow);
  var scored = [];

  Object.keys(ciLF).forEach(function(n){
    if (n === memberName) return;
    var nick = nickMap[n]||n.split(' ')[0];
    var team = teamMap[n]||'';
    var lfLow = ciLF[n].toLowerCase();
    var mCats = _getCategories(lfLow);
    var score = 0;
    // They need what I offer
    qCats.forEach(function(c){ if (mCats.indexOf(c)>=0) score+=3; });
    qWords.forEach(function(w){ if (lfLow.indexOf(w)>=0) score+=1; });
    var cross = team !== selfTeam;
    if (cross && score>0) score+=1;
    if (score>0) scored.push({nick:nick, score:score, cross:cross});
  });

  // Fill remaining slots with cross-team members not yet included
  if (scored.length < (limit||5)) {
    var scoredNicks = scored.map(function(s){return s.nick;});
    Object.keys(nickMap).forEach(function(n){
      if (n===memberName || teamMap[n]===selfTeam) return;
      var nick = nickMap[n];
      if (scoredNicks.indexOf(nick)>=0) return;
      scored.push({nick:nick, score:0, cross:true});
    });
  }

  scored.sort(function(a,b){ return a.cross===b.cross ? b.score-a.score : (a.cross?-1:1); });
  return scored.slice(0, limit||5).map(function(m){
    return {type:'action',action:{type:'message',label:'🤝 นัด '+m.nick,text:'นัด '+m.nick}};
  });
}

function apiSetupAllTriggers(p) {
  if (p.role !== 'mc') return {ok:false,error:'MC only'};
  return applyLeanLinePolicy();
}

// Keep only messages that are timely and cannot be replaced by Today/Dashboard.
// This also removes duplicate legacy triggers left from previous deployments.
function applyLeanLinePolicy() {
  var results = [];
  var noisy = [
    'thursdayBotPush','thursdayMorningAlert','fridayPostMeetingPrompt',
    'wednesdayNudge','fridayTeamLeaderboard','mondayMorningBrief',
    'monthlyRecap','line121AutoReminder','_lineChapterPulse','fridayEveningReminder',
    '_lineBNIAnniversary'
  ];
  var existing = ScriptApp.getProjectTriggers();
  existing.forEach(function(t) {
    if (noisy.indexOf(t.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(t);
      results.push('🛑 ปิด '+t.getHandlerFunction());
    }
  });
  // Supabase is now the only scheduler. Do not recreate any GAS LINE trigger;
  // even a useful message must be catalogued and governed centrally first.
  var fns = [];
  fns.forEach(function(cfg) {
    try {
      ScriptApp.getProjectTriggers().forEach(function(t) {
        if (t.getHandlerFunction() === cfg.name) ScriptApp.deleteTrigger(t);
      });
      var t2 = ScriptApp.newTrigger(cfg.name).timeBased().onWeekDay(cfg.day).atHour(cfg.hour);
      if (cfg.minute) t2 = t2.nearMinute(cfg.minute);
      t2.create();
      results.push('✅ ' + cfg.label);
    } catch(e) {
      results.push('❌ ' + cfg.label + ': ' + e.message);
    }
  });
  PropertiesService.getScriptProperties().setProperty('LINE_NOTIFICATION_POLICY','supabase_only');
  return {ok:true, policy:'supabase_only', results:results};
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Feature B — Auto-notify members after MC imports scores
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function _lineNotifyScoreUpdate(monthKey) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('📱 LINE MEMBERS');
  if (!sh || sh.getLastRow() < 2) return;

  // Ensure header cols D, F exist
  if (!sh.getRange(1,4).getValue()) sh.getRange(1,4).setValue('last_score');
  if (!sh.getRange(1,6).getValue()) sh.getRange(1,6).setValue('last_oto');

  // Read all rows including col D (last_score) and col F (last_oto)
  var lastRow = sh.getLastRow()-1;
  var rows = sh.getRange(2, 1, lastRow, 6).getValues();
  var sent = 0;

  rows.forEach(function(r, idx) {
    var userId    = String(r[0]||'').trim();
    var name      = String(r[1]||'').trim();
    var prevScore = parseFloat(r[3])||0; // col D
    var prevOto   = parseFloat(r[5])||0; // col F
    if (!userId || !name) return;
    try {
      var d = _lineGetMemberData(name);
      if (!d || !d.bniScore) return;
      var nick     = d.nick || name.split(' ')[0];
      var newScore = d.bniScore;
      var newOto   = (d.actual&&d.actual.oToOne)||0;
      var tlLabel  = {green:'🟢',yellow:'🟡',red:'🔴',black:'⚫'}[d.bniTl||'none'] || '📊';

      // Save new score + oToOne to cols D, F
      sh.getRange(idx+2, 4).setValue(newScore);
      sh.getRange(idx+2, 6).setValue(newOto);

      var msg = '📊 คะแนนเดือน ' + (monthKey||'ล่าสุด') + ' อัพเดทแล้ว!\n'
        + '─────────────────\n'
        + nick + ': ' + tlLabel + ' ' + newScore + '/100\n'
        + '─────────────────\n'
        + _lineRandMsg(d.bniTl, nick) + '\n\n'
        + 'พิมพ์ "สถานะ" เพื่อดู Action Plan ครับ';
      _sendLineMsg(userId, msg);

      // Zone-up celebration
      if (prevScore > 0 && newScore !== prevScore) {
        var zoneMsg = _buildZoneUpMsg(nick, prevScore, newScore);
        if (zoneMsg) {
          Utilities.sleep(800);
          _sendLineMsg(userId, zoneMsg);
        }
        // MC alert on zone drop
        var zOrd = {black:0,red:1,yellow:2,green:3};
        var prevZ = _zoneName(prevScore), newZ = _zoneName(newScore);
        if (zOrd[newZ] < zOrd[prevZ]) {
          var mcId2 = _getLineId('mc');
          if (mcId2) {
            Utilities.sleep(300);
            var zIcons = {black:'⚫',red:'🔴',yellow:'🟡',green:'🟢'};
            _sendLineMsg(mcId2,
              '⚠️ Zone Drop Alert\n─────────────────\n'
              +'👤 '+nick+' (ทีม '+(d.mentor||'—')+')\n'
              +prevScore+' → '+newScore+' pts\n'
              +zIcons[prevZ]+' → '+zIcons[newZ]+'\n─────────────────\n'
              +'พิมพ์ "สถานะ" ดูรายละเอียด');
          }
        }
      }

      // 1-2-1 increase detection — ask who they met
      var otoDiff = newOto - prevOto;
      if (prevOto > 0 && otoDiff > 0) {
        Utilities.sleep(800);
        var selfTeam = (d&&d.mentor)||'';
        var otoMsg = '🤝 เดือนนี้คุณทำ 1-2-1 เพิ่มขึ้น '+otoDiff+' ครั้ง!\n'
          + '─────────────────\n'
          + 'เจอกับใครบ้างครับ? บันทึกไว้ติดตามผลได้เลย\n'
          + '(พิมพ์ "นัด [ชื่อ]" หรือกดปุ่มด้านล่างครับ)';
        var qrBtns = _getMemberQRButtons(name, selfTeam, 6);
        _sendLineMsgQR(userId, otoMsg, qrBtns);
      }
      sent++;
    } catch(e2) { Logger.log('_lineNotifyScoreUpdate error for ' + name + ': ' + e2.message); }
  });
  Logger.log('_lineNotifyScoreUpdate: sent to ' + sent + ' members for month ' + (monthKey||'?'));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LINE Notification Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// LINE_TOKEN เก็บใน Script Properties → Project Settings → Script Properties
function _getLineToken() {
  return PropertiesService.getScriptProperties().getProperty('LINE_TOKEN') || '';
}

// LINE IDs เก็บใน ⚙️ SETTINGS sheet ด้วย key LINE_ID_xxx
var LINE_KEY_MAP = {
  'mc':       'LINE_ID_MC',
  'MC':       'LINE_ID_MC',
  'TOOMTAM':  'LINE_ID_TOOMTAM',
  'Aof':      'LINE_ID_AOF',
  'Draft':    'LINE_ID_DRAFT',
  'PHAI':     'LINE_ID_PHAI',
  'AMP':      'LINE_ID_AMP',
  'growth':   'LINE_ID_GROWTH'
};

function _getLineId(roleOrTeam) {
  var key = LINE_KEY_MAP[roleOrTeam];
  if (!key) return '';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('⚙️ SETTINGS');
  if (!sh) return '';
  var data = sh.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) return String(data[i][1] || '').trim();
  }
  return '';
}

function _sendLineMsg(userId, message, attempt) {
  attempt = attempt || 0;
  if (!userId || !message) return {ok:false,error:'Missing userId or message'};
  var token = _getLineToken();
  if (!token) return {ok:false,error:'LINE_TOKEN not configured'};
  try {
    var resp = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+token },
      payload: JSON.stringify({ to: userId, messages: [{ type:'text', text: message }] }),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    var body = resp.getContentText();
    if (code === 200) {
      Logger.log('[LINE-OK] Push to '+userId+': '+message.substring(0,30)+'...');
      return {ok:true};
    }
    if (code === 429 && attempt < 3) {
      var retryAfter = resp.getHeaders()['Retry-After'] || '1';
      var waitMs = parseInt(retryAfter, 10) * 1000 || 1000;
      waitMs = Math.max(1000, Math.min(5000, waitMs));
      Logger.log('[LINE-429] Rate limit hit for '+userId+'; retryAfter='+retryAfter+'s wait='+waitMs+'ms attempt='+attempt);
      Utilities.sleep(waitMs);
      return _sendLineMsg(userId, message, attempt + 1);
    }
    if (code === 429) {
      Logger.log('[LINE-429] Persistent rate limit for '+userId+' after '+attempt+' retries; Retry-After='+((resp.getHeaders()['Retry-After']||'N/A')));
      return {ok:false,error:'HTTP 429',details:body};
    }
    Logger.log('[LINE-FAIL] Status '+code+': '+body.substring(0,100));
    return {ok:false,error:'HTTP '+code,details:body};
  } catch(err) { 
    Logger.log('[LINE-ERROR] '+err.message);
    return {ok:false,error:err.message};
  }
}

function _sendLineMsgQR(userId, message, qrItems, attempt) {
  attempt = attempt || 0;
  if (!userId || !message) return {ok:false,error:'Missing userId or message'};
  var token = _getLineToken();
  if (!token) return {ok:false,error:'LINE_TOKEN not configured'};
  var msg = {type:'text', text:message};
  if (qrItems && qrItems.length) msg.quickReply = {items: qrItems.slice(0,13)};
  try {
    var resp = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {'Content-Type':'application/json','Authorization':'Bearer '+token},
      payload: JSON.stringify({to:userId, messages:[msg]}),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    var body = resp.getContentText();
    if (code === 200) {
      Logger.log('[LINE-OK-QR] Push to '+userId+': '+message.substring(0,30)+'... ('+qrItems.length+' buttons)');
      return {ok:true};
    }
    if (code === 429 && attempt < 3) {
      var retryAfter = resp.getHeaders()['Retry-After'] || '1';
      var waitMs = parseInt(retryAfter, 10) * 1000 || 1000;
      waitMs = Math.max(1000, Math.min(5000, waitMs));
      Logger.log('[LINE-429-QR] Rate limit hit for '+userId+'; retryAfter='+retryAfter+'s wait='+waitMs+'ms attempt='+attempt);
      Utilities.sleep(waitMs);
      return _sendLineMsgQR(userId, message, qrItems, attempt + 1);
    }
    if (code === 429) {
      Logger.log('[LINE-429-QR] Persistent rate limit for '+userId+' after '+attempt+' retries; Retry-After='+((resp.getHeaders()['Retry-After']||'N/A')));
      return {ok:false,error:'HTTP 429',details:body};
    }
    Logger.log('[LINE-FAIL-QR] Status '+code+': '+body);
    return {ok:false,error:'HTTP '+code,details:body};
  } catch(err) { 
    Logger.log('[LINE-ERROR-QR] '+err.message);
    return {ok:false,error:err.message};
  }
}

// Build QR items for "นัด [nick]" from team members — cross-team first
function _getMemberQRButtons(excludeName, selfTeam, limit) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var listSh = ss.getSheetByName('รายชื่อทั้งหมด');
  if (!listSh || listSh.getLastRow() < 3) return [];
  var members = [];
  listSh.getRange(3,2,listSh.getLastRow()-2,3).getValues().forEach(function(r){
    var name = String(r[0]||'').trim();
    var nick = String(r[1]||'').trim()||name.split(' ')[0];
    var team = String(r[2]||'').trim();
    if (!name || !team || name === excludeName) return;
    members.push({nick:nick, team:team, cross: team !== selfTeam});
  });
  // Cross-team first, shuffle within each group
  members.sort(function(a,b){ return a.cross === b.cross ? (Math.random()-.5) : (a.cross?-1:1); });
  return members.slice(0, limit||6).map(function(m){
    return {type:'action',action:{type:'message',label:'🤝 นัด '+m.nick,text:'นัด '+m.nick}};
  });
}

// ── LINE Bot Push / Broadcast APIs ───────────────────────────
function _lineGetUserId(memberName) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('📱 LINE MEMBERS');
  if (!sh || sh.getLastRow() < 2) return null;
  var data = sh.getRange(2,1,sh.getLastRow()-1,2).getValues();
  for (var i=0; i<data.length; i++) {
    if (String(data[i][1]||'').trim()===memberName) return String(data[i][0]).trim();
  }
  return null;
}

function apiGetLineMembers(p) {
  if (!p.role) return {ok:false,error:'auth'};
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('📱 LINE MEMBERS');
  if (!sh || sh.getLastRow() < 2) return {ok:true,members:{}};
  var data = sh.getRange(2,1,sh.getLastRow()-1,2).getValues();
  var members = {};
  data.forEach(function(r){ if(r[0]&&r[1]) members[String(r[1]).trim()]=true; });
  return {ok:true,members:members};
}

function apiGetLineMembersDetail(p) {
  if (!p.role) return {ok:false,error:'auth'};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('📱 LINE MEMBERS');
  if (!sh || sh.getLastRow() < 2) return {ok:true,list:[],total:0};
  var data = sh.getRange(2,1,sh.getLastRow()-1,4).getValues();
  // Build team map from master list
  var teamMap = {}; var nickMap = {};
  var listSh = ss.getSheetByName('รายชื่อทั้งหมด');
  if (listSh && listSh.getLastRow() >= 3) {
    listSh.getRange(3,2,listSh.getLastRow()-2,3).getValues().forEach(function(r){
      if(r[0]) { teamMap[String(r[0]).trim()] = String(r[2]||'').trim(); nickMap[String(r[0]).trim()] = String(r[1]||'').trim(); }
    });
  }
  var list = [];
  data.forEach(function(r){
    var userId = String(r[0]||'').trim();
    var name   = String(r[1]||'').trim();
    var regAt  = r[2]||'';
    if (!userId || !name) return;
    var regStr = '';
    if (regAt instanceof Date) regStr = Utilities.formatDate(regAt, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    else if (regAt) regStr = String(regAt);
    var lastScore = parseFloat(r[3])||0;
    list.push({userId:userId, name:name, nick:nickMap[name]||'', team:teamMap[name]||'—', registeredAt:regStr, lastScore:lastScore});
  });
  list.sort(function(a,b){ return a.name.localeCompare(b.name); });
  return {ok:true, list:list, total:list.length};
}

function apiSendLineMessage(p) {
  if (!p.role) return {ok:false,error:'auth'};
  if (!p.memberName||!p.message) return {ok:false,error:'ข้อมูลไม่ครบ'};
  var userId = _lineGetUserId(p.memberName);
  if (!userId) return {ok:false,error:'สมาชิกยังไม่ได้ลงทะเบียน LINE Bot'};
  Logger.log('[API-SEND-LINE] Sending to '+p.memberName+' (uid: '+userId+'): '+p.message.substring(0,50)+'...');
  var result = _sendLineMsg(userId, p.message);
  if (result.ok) {
    Logger.log('[API-SEND-LINE-OK] Success for '+p.memberName);
    return {ok:true};
  } else {
    Logger.log('[API-SEND-LINE-FAIL] Error: '+result.error);
    return {ok:false, error: result.error, details: result.details};
  }
}

function apiSendLineBroadcast(p) {
  if (!p.role) return {ok:false,error:'auth'};
  if (!p.message) return {ok:false,error:'ไม่มีข้อความ'};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('📱 LINE MEMBERS');
  if (!sh || sh.getLastRow() < 2) return {ok:true,sent:0,skipped:0};
  var lineData = sh.getRange(2,1,sh.getLastRow()-1,2).getValues();
  var lineMap = {};
  lineData.forEach(function(r){ if(r[0]&&r[1]) lineMap[String(r[1]).trim()]=String(r[0]).trim(); });
  var targets = [];
  if (p.teamName) {
    var teamSh = ss.getSheetByName(p.teamName);
    if (teamSh && teamSh.getLastRow() >= 4) {
      teamSh.getRange(4,3,Math.max(1,teamSh.getLastRow()-3),1).getValues().forEach(function(r){
        var n=String(r[0]||'').trim(); if(n && lineMap[n]) targets.push(lineMap[n]);
      });
    }
  } else {
    targets = Object.values(lineMap);
  }
  var sent=0, skipped=0, failed=0, rateLimited=0;
  var delayMs = 300; // Throttle: 300ms between sends to avoid HTTP 429
  targets.forEach(function(uid, idx){
    try { 
      // Add delay before each send (except first) to avoid LINE rate limiting
      if (idx > 0) Utilities.sleep(delayMs);
      var res = _sendLineMsg(uid, p.message);
      if (res.ok) {
        sent++;
      } else if (res.error && res.error.indexOf('429') >= 0) {
        rateLimited++;
        Logger.log('[BROADCAST-429] Rate limited, backing off...');
        // Back off: increase delay for next sends
        delayMs = Math.min(2000, delayMs + 200);
      } else {
        skipped++;
        Logger.log('[BROADCAST-FAIL] '+res.error);
      }
    } catch(e){ 
      failed++; 
      Logger.log('[BROADCAST-ERROR] '+e.message);
    }
  });
  Logger.log('[BROADCAST-RESULT] sent='+sent+' skipped='+skipped+' failed='+failed+' rateLimited='+rateLimited+' targets='+targets.length);
  var ok = (failed === 0 && rateLimited === 0);
  return {ok:ok,sent:sent,skipped:skipped,failed:failed,rateLimited:rateLimited};
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8-Week Onboarding Program
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
var _ONBOARD_SHEET = '📋 ONBOARDING';

var _ONBOARD_MSGS = {
  1: function(nick) {
    return '🎉 ยินดีต้อนรับสู่ BNI IDEAL '+nick+'!\n\n'
      +'📅 สัปดาห์ที่ 1: แนะนำตัวให้โลกรู้จัก\n'
      +'─────────────────\n'
      +'BNI เริ่มต้นที่ "60-second presentation"\n'
      +'คำถามหลักคือ: "ลูกค้าที่ดีของคุณ คือใคร?"\n\n'
      +'✅ งานสัปดาห์นี้:\n'
      +'• เตรียม 60-sec ให้ชัดเจน\n'
      +'• บอกว่าคุณทำอะไร ช่วยใครได้\n'
      +'• ฝึกพูดก่อนวันศุกร์\n\n'
      +'📝 Template:\n"ผม/หนู [ชื่อ] ธุรกิจ [X]\nลูกค้าที่ดีของผม/หนูคือ [Y]"\n\n'
      +'สัปดาห์หน้าเจอกันครับ! 💪';
  },
  2: function(nick) {
    return '📅 '+nick+' — สัปดาห์ที่ 2: Power Team\n'
      +'─────────────────\n'
      +'Power Team = คนที่ทำธุรกิจ "เสริมกัน"\n'
      +'ไม่แข่งกัน แต่ส่ง Referral ให้กัน\n\n'
      +'ตัวอย่าง:\nนายหน้าอสังหา + สถาปนิก + ช่างตกแต่ง\n→ ลูกค้าคนเดียวกัน แต่คนละงาน!\n\n'
      +'✅ งานสัปดาห์นี้:\n'
      +'• คิดว่าธุรกิจคุณ "ไปคู่กับ" ใครใน Chapter\n'
      +'• นัด 1-2-1 กับคนนั้น 1 คน\n\n'
      +'🎯 เป้า: 1-2-1 ≥1 ครั้ง/สัปดาห์\n'
      +'พิมพ์ "แนะนำ [ธุรกิจ]" ให้ Bot ช่วยหาคู่ครับ';
  },
  3: function(nick) {
    return '📅 '+nick+' — สัปดาห์ที่ 3: 1-2-1 กับ Mentor\n'
      +'─────────────────\n'
      +'Mentor อยู่ที่นี่เพื่อช่วยให้ธุรกิจโต\nไม่ใช่แค่เช็คคะแนน!\n\n'
      +'✅ งานสัปดาห์นี้:\n'
      +'• นัด 1-2-1 กับ Mentor (ถ้ายังไม่ได้ทำ)\n'
      +'• เตรียม 3 คำถาม: "อยากได้ลูกค้าแบบไหน"\n'
      +'• เล่าธุรกิจให้ Mentor เข้าใจชัดเจน\n\n'
      +'💡 Tip: 1-2-1 ที่ดี = ฟังมากกว่าพูด\n'
      +'เข้าใจธุรกิจเขา → ส่ง Referral ได้ตรงจุด 🎯';
  },
  4: function(nick) {
    return '📅 '+nick+' — สัปดาห์ที่ 4: PALMS Score\n'
      +'─────────────────\n'
      +'PALMS = 6 หมวดคะแนน (รวม 100 pt)\n\n'
      +'📊 P = เข้าประชุม  (15 pt)\n'
      +'📊 A = ไม่ขาด    (15 pt)\n'
      +'📊 L = 1-2-1      (15 pt)\n'
      +'📊 M = Visitor     (20 pt)\n'
      +'📊 S = CEU         (20 pt)\n'
      +'📊 + Referral      (15 pt)\n\n'
      +'✅ งานสัปดาห์นี้:\n'
      +'• พิมพ์ "สถานะ" ดูคะแนนตัวเอง\n'
      +'• หมวดไหนยังต่ำ → ทำให้ขึ้นก่อน\n\n'
      +'🏆 เป้า 8 สัปดาห์แรก: 🟡 เหลือง (50+ pt)';
  },
  5: function(nick) {
    return '📅 '+nick+' — สัปดาห์ที่ 5: CEU Training\n'
      +'─────────────────\n'
      +'CEU = Continuing Education Unit\n'
      +'ทุกครั้งที่เข้า Training → ได้คะแนน (20 pt)\n\n'
      +'✅ วิธีได้ CEU:\n'
      +'• เข้า BNI Leadership Training\n'
      +'• เข้า Chapter Education ทุกวันศุกร์\n'
      +'• เรียน BNI Business Builder (Online)\n\n'
      +'🎯 เป้า: ≥4 CEU = คะแนนเต็ม\n\n'
      +'✅ งานสัปดาห์นี้:\n'
      +'• เช็ค CEU ปัจจุบัน (พิมพ์ "สถานะ")\n'
      +'• ถ้า <4 → วางแผนเข้า Training เพิ่มครับ';
  },
  6: function(nick) {
    return '📅 '+nick+' — สัปดาห์ที่ 6: พา Visitor\n'
      +'─────────────────\n'
      +'Visitor = คนรู้จักที่คุณพามาดู BNI\n'
      +'+ ได้คะแนน Visitor (20 pt)\n'
      +'+ Visitor อาจส่ง Referral กลับมาหาคุณ!\n\n'
      +'✅ คุณสมบัติ Visitor:\n'
      +'• ไม่เป็นสมาชิก BNI IDEAL อยู่แล้ว\n'
      +'• ธุรกิจไม่ซ้ำสมาชิกใน Chapter\n\n'
      +'✅ งานสัปดาห์นี้:\n'
      +'• คิดว่าใครในเครือข่ายเหมาะกับ BNI\n'
      +'• ทักเชิญ 1 คนมาวันศุกร์หน้า 📩';
  },
  7: function(nick) {
    return '📅 '+nick+' — สัปดาห์ที่ 7: TYFCB\n'
      +'─────────────────\n'
      +'TYFCB = Thank You For Closed Business\n'
      +'= ยอดธุรกิจที่ปิดได้จาก Referral BNI\n\n'
      +'นี่คือ "ผลลัพธ์จริง" ว่า BNI คุ้มค่าแค่ไหน\n\n'
      +'✅ วิธีรายงาน TYFCB:\n'
      +'• ปิดงานจาก Referral → แจ้ง Mentor Coordinator\n'
      +'• ระบุ: ใครส่ง Referral + ยอดเงิน\n\n'
      +'💡 สมาชิกที่ TYFCB สูง = ได้ Referral ดี\nเพราะทีมรู้ว่าส่งให้แล้ว "ได้ผล" 🏆\n\n'
      +'✅ งานสัปดาห์นี้:\n'
      +'• ปิดงานจาก BNI แล้วไหม? แจ้ง Mentor Coordinator เลยครับ';
  },
  8: function(nick) {
    return '🏆 '+nick+' — จบ 8 สัปดาห์แรกแล้ว!\n'
      +'─────────────────\n'
      +'คุณมาได้ไกลมากแล้วครับ 👏\n'
      +'ตอนนี้คุณรู้จัก BNI ในระดับที่ทำได้จริง\n\n'
      +'✅ ลอง Review ตัวเอง:\n'
      +'• คะแนน PALMS ตอนนี้เป็นยังไง?\n'
      +'• 1-2-1 ทำได้กี่ครั้ง/สัปดาห์?\n'
      +'• ส่ง Referral ให้ใครบ้าง?\n\n'
      +'🎯 เป้าหมายต่อไป:\n'
      +'• 🟢 เขียว (70+ pt) ภายใน 3 เดือน\n'
      +'• 1-2-1 สัปดาห์ละ 2+ ครั้ง\n'
      +'• Visitor 1 คน/เดือน\n\n'
      +'พิมพ์ "สถานะ" เพื่อดูคะแนนปัจจุบันครับ 🚀';
  }
};

// ── Custom onboarding message wrapper ─────────────────────────
function _getOnboardMsg(week, nick) {
  try {
    var custom = PropertiesService.getScriptProperties().getProperty('onboard_msg_'+week);
    if (custom && custom !== '__DEFAULT__') return custom.replace(/\{nick\}/g, nick);
  } catch(e) {}
  return _ONBOARD_MSGS[week] ? _ONBOARD_MSGS[week](nick) : '';
}

function apiGetOnboardingMessages(p) {
  if (p.role !== 'mc') return {ok:false,error:'MC only'};
  var props = PropertiesService.getScriptProperties();
  var messages = {}, defaults = {};
  for (var w = 1; w <= 8; w++) {
    var custom = props.getProperty('onboard_msg_'+w);
    if (custom && custom !== '__DEFAULT__') messages[w] = custom;
    defaults[w] = _ONBOARD_MSGS[w]('{nick}');
  }
  return {ok:true, messages:messages, defaults:defaults};
}

function apiSaveOnboardingMessage(p) {
  if (p.role !== 'mc') return {ok:false,error:'MC only'};
  var w = parseInt(p.week);
  if (!w || w < 1 || w > 8) return {ok:false,error:'week ต้องเป็น 1-8'};
  var props = PropertiesService.getScriptProperties();
  if (p.message === '__DEFAULT__') {
    props.deleteProperty('onboard_msg_'+w);
  } else {
    if (!p.message || !p.message.trim()) return {ok:false,error:'ข้อความว่างเปล่า'};
    props.setProperty('onboard_msg_'+w, p.message.trim());
  }
  return {ok:true};
}

function apiGetOnboardingPreview(p) {
  if (p.role !== 'mc') return {ok:false,error:'MC only'};
  var weeks = {};
  var nick = p.nick || 'ชื่อ';
  for (var w = 1; w <= 8; w++) {
    weeks[w] = _getOnboardMsg(w, nick);
  }
  return {ok:true, weeks:weeks};
}

function _lineOnboardEnroll(userId, name, enrolledBy) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(_ONBOARD_SHEET);
  if (!sh) {
    sh = ss.insertSheet(_ONBOARD_SHEET);
    sh.appendRow(['LINE User ID','Member Name','Start Date','Week Last Sent','Completed','Enrolled By']);
    sh.getRange(1,1,1,6).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  }
  if (sh.getLastRow() > 1) {
    var rows = sh.getRange(2,1,sh.getLastRow()-1,5).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === userId) {
        if (rows[i][4]) return; // already completed, don't reset
        return; // already enrolled
      }
    }
  }
  sh.appendRow([userId, name, new Date(), 0, false, enrolledBy || 'MC']);
}

function _lineOnboardGetRow(userId) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(_ONBOARD_SHEET);
  if (!sh || sh.getLastRow() < 2) return null;
  var rows = sh.getRange(2,1,sh.getLastRow()-1,6).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === userId) {
      return { row: i+2, userId: rows[i][0], name: rows[i][1], startDate: rows[i][2], weekSent: parseInt(rows[i][3])||0, completed: rows[i][4] };
    }
  }
  return null;
}

function _lineOnboardSetWeek(sh, rowNum, week) {
  sh.getRange(rowNum, 4).setValue(week);
  if (week >= 8) sh.getRange(rowNum, 5).setValue(true);
}

function onboardingWeeklyPush() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(_ONBOARD_SHEET);
  if (!sh || sh.getLastRow() < 2) return;
  var today = new Date(); today.setHours(0,0,0,0);
  var rows = sh.getRange(2,1,sh.getLastRow()-1,6).getValues();
  var sent = 0;
  rows.forEach(function(r, idx) {
    try {
      var userId    = String(r[0]||'').trim();
      var name      = String(r[1]||'').trim();
      var startDate = r[2] ? new Date(r[2]) : null;
      var weekSent  = parseInt(r[3]) || 0;
      var completed = r[4];
      if (!userId || !name || !startDate || completed) return;
      startDate.setHours(0,0,0,0);
      var daysPassed  = Math.floor((today - startDate) / 86400000);
      var weeksDue    = Math.min(8, Math.floor(daysPassed / 7) + 1);
      if (weeksDue <= weekSent) return; // already sent up to this week
      var nextWeek = weekSent + 1;
      if (nextWeek > 8) return;
      var d = _lineGetMemberData(name);
      var nick = (d&&d.nick) || name.split(' ')[0];
      var msg = _getOnboardMsg(nextWeek, nick);
      if (!msg) return;
      _sendLineMsg(userId, msg);
      _lineOnboardSetWeek(sh, idx+2, nextWeek);
      sent++;
      // แจ้ง Mentor เมื่อ mentee จบ Week 8
      if (nextWeek === 8) {
        try {
          var mentorName = (d&&d.mentor) || '';
          if (mentorName) {
            var mentorUserId = _lineGetUserId(mentorName);
            if (mentorUserId) {
              _sendLineMsg(mentorUserId, '🏆 '+nick+' จบ 8-week Onboarding Program แล้วครับ!\n\nนัด 1-2-1 Review เพื่อวางเป้าหมาย 3 เดือนต่อไปได้เลยครับ 🚀');
            }
          }
        } catch(e3) { Logger.log('week8 mentor notify err: '+e3.message); }
      }
    } catch(e2) { Logger.log('onboardingWeeklyPush err for row '+(idx+2)+': '+e2.message); }
  });
  Logger.log('onboardingWeeklyPush: sent '+sent+' messages');
}

function apiEnrollOnboarding(p) {
  if (p.role !== 'mc') return {ok:false,error:'MC only'};
  if (!p.memberName) return {ok:false,error:'ไม่มีชื่อสมาชิก'};
  try {
    var userId = _lineGetUserId(p.memberName) || ('PENDING_'+p.memberName.replace(/\s+/g,'_'));
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(_ONBOARD_SHEET);
    // Remove existing row if re-enrolling (match by userId OR name)
    if (sh && sh.getLastRow() > 1) {
      var rows = sh.getRange(2,1,sh.getLastRow()-1,2).getValues();
      for (var i = rows.length-1; i >= 0; i--) {
        var rid = String(rows[i][0]).trim(), rname = String(rows[i][1]).trim();
        if (rid === userId || rname === p.memberName) { sh.deleteRow(i+2); break; }
      }
    }
    // Create sheet + append new row
    var shAfter = ss.getSheetByName(_ONBOARD_SHEET);
    if (!shAfter) {
      shAfter = ss.insertSheet(_ONBOARD_SHEET);
      shAfter.appendRow(['LINE User ID','Member Name','Start Date','Week Last Sent','Completed','Enrolled By']);
      shAfter.getRange(1,1,1,6).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
    }
    shAfter.appendRow([userId, p.memberName, new Date(), 0, false, 'MC']);
    var newRow = shAfter.getLastRow();
    // Send LINE Week 1 if registered
    var sentLine = false;
    if (userId.indexOf('PENDING_') !== 0) {
      var d = _lineGetMemberData(p.memberName);
      var nick = (d&&d.nick)||p.memberName.split(' ')[0];
      _sendLineMsg(userId, _getOnboardMsg(1, nick));
      sentLine = true;
    }
    _lineOnboardSetWeek(shAfter, newRow, sentLine ? 1 : 0);
    return {ok:true, message: sentLine ? 'Enrolled และส่ง Week 1 แล้ว' : 'Enrolled แล้ว (ยังไม่มี LINE Bot)'};
  } catch(e) {
    return {ok:false, error:'Enroll ล้มเหลว: '+e.message};
  }
}

function apiSendOnboardingWeek(p) {
  if (p.role !== 'mc') return {ok:false,error:'MC only'};
  if (p.confirmed !== true) return {ok:false,error:'กรุณาตรวจข้อความและยืนยันก่อนส่ง LINE'};
  if (!p.memberName) return {ok:false,error:'ไม่มีชื่อสมาชิก'};
  var week = parseInt(p.week);
  if (!week || week < 1 || week > 8) return {ok:false,error:'week ต้องเป็น 1-8'};
  var userId = _lineGetUserId(p.memberName);
  if (!userId) return {ok:false,error:'สมาชิกยังไม่ได้ลงทะเบียน LINE Bot'};
  var d = _lineGetMemberData(p.memberName);
  var nick = (d&&d.nick)||p.memberName.split(' ')[0];
  var msg = String(p.message||'').trim() || _getOnboardMsg(week, nick);
  if (!msg) return {ok:false,error:'ไม่พบ content สำหรับ week '+week};
  _sendLineMsg(userId, msg);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(_ONBOARD_SHEET);
  if (sh && sh.getLastRow() > 1) {
    var rows = sh.getRange(2,1,sh.getLastRow()-1,1).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === userId) { _lineOnboardSetWeek(sh, i+2, week); break; }
    }
  }
  return {ok:true, message:'ส่ง Week '+week+' ให้ '+nick+' แล้ว'};
}

function apiRemoveOnboarding(p) {
  if (p.role !== 'mc') return {ok:false,error:'MC only'};
  if (!p.memberName) return {ok:false,error:'ไม่มีชื่อสมาชิก'};
  var userId = _lineGetUserId(p.memberName);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(_ONBOARD_SHEET);
  if (!sh || sh.getLastRow() < 2) return {ok:false,error:'ไม่พบข้อมูล Onboarding'};
  var rows = sh.getRange(2,1,sh.getLastRow()-1,2).getValues();
  for (var i = rows.length-1; i >= 0; i--) {
    var matchId   = userId && String(rows[i][0]).trim() === userId;
    var matchName = String(rows[i][1]).trim() === p.memberName;
    if (matchId || matchName) { sh.deleteRow(i+2); return {ok:true}; }
  }
  return {ok:false,error:'ไม่พบ "'+p.memberName+'" ใน Onboarding program'};
}

function apiGetOnboardingStatus(p) {
  if (p.role !== 'mc') return {ok:false,error:'MC only'};
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(_ONBOARD_SHEET);
  if (!sh || sh.getLastRow() < 2) return {ok:true, members:[]};
  var rows = sh.getRange(2,1,sh.getLastRow()-1,6).getValues();
  var members = rows.filter(function(r){ return r[0]&&r[1]; }).map(function(r){
    return { userId: r[0], name: r[1], startDate: r[2] ? Utilities.formatDate(new Date(r[2]), Session.getScriptTimeZone(), 'dd/MM/yy') : '', weekSent: r[3]||0, completed: r[4]||false, enrolledBy: r[5]||'' };
  });
  return {ok:true, members: members};
}

// บันทึก LINE ID จาก webapp settings UI
function apiSaveLineId(p) {
  if (p.role !== 'mc' && p.role !== 'growth') return { ok:false, error:'Permission denied' };
  var key = LINE_KEY_MAP[p.target];
  if (!key) return { ok:false, error:'ไม่รู้จัก target: ' + p.target };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = _getOrCreateSettings(ss);
  var data = sh.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) { rowIdx = i + 1; break; }
  }
  var val = String(p.lineId || '').trim();
  if (rowIdx === -1) sh.appendRow([key, val]);
  else sh.getRange(rowIdx, 2).setValue(val);
  return { ok:true };
}

// ดึง LINE IDs ทั้งหมดสำหรับแสดงใน settings UI
function apiGetLineIds(p) {
  if (p.role !== 'mc' && p.role !== 'growth') return { ok:false, error:'Permission denied' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('⚙️ SETTINGS');
  var stored = {};
  if (sh) {
    var data = sh.getDataRange().getValues();
    data.forEach(function(row) {
      var k = String(row[0]||'').trim();
      if (k.indexOf('LINE_ID_') === 0) stored[k] = String(row[1]||'').trim();
    });
  }
  var ids = {};
  Object.keys(LINE_KEY_MAP).forEach(function(role) {
    ids[role] = stored[LINE_KEY_MAP[role]] || '';
  });
  var hasToken = !!_getLineToken();
  return { ok:true, ids:ids, hasToken:hasToken };
}

// ── Member Notes ─────────────────────────────────────────────
function _getOrCreateMemberNotesSheet(ss) {
  var sh = ss.getSheetByName('📝 MEMBER NOTES');
  if (!sh) {
    sh = ss.insertSheet('📝 MEMBER NOTES');
    sh.appendRow(['Member','Note','UpdatedAt','By']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function apiSaveMemberNote(p) {
  if (p.role !== 'mc' && !MENTOR_ROLE[p.role] && p.role !== 'growth')
    return { ok:false, error:'Permission denied' };
  var memberName = String(p.memberName||'').trim();
  if (!memberName) return { ok:false, error:'ต้องระบุชื่อสมาชิก' };
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var sh  = _getOrCreateMemberNotesSheet(ss);
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yy HH:mm');
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === memberName) {
      sh.getRange(i+1,2).setValue(p.note||'');
      sh.getRange(i+1,3).setValue(now);
      sh.getRange(i+1,4).setValue(p.role);
      return { ok:true, savedAt:now };
    }
  }
  sh.appendRow([memberName, p.note||'', now, p.role]);
  return { ok:true, savedAt:now };
}

function apiGetMemberNote(p) {
  if (p.role !== 'mc' && !MENTOR_ROLE[p.role] && p.role !== 'growth')
    return { ok:false, error:'Permission denied' };
  var memberName = String(p.memberName||'').trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('📝 MEMBER NOTES');
  if (!sh) return { ok:true, note:'', savedAt:'', savedBy:'' };
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === memberName) {
      return { ok:true, note:String(data[i][1]||''), savedAt:String(data[i][2]||''), savedBy:String(data[i][3]||'') };
    }
  }
  return { ok:true, note:'', savedAt:'', savedBy:'' };
}

// ── Router ────────────────────────────────────────────────────
function dispatch(payload) {
  try {
    var a = payload.action;
    if (a === 'getAIMatching') {
      Logger.log('dispatch: getAIMatching payload=' + JSON.stringify(payload));
    }
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
    if (a==='parseCheckinPDF') return parseCheckinPDF(payload.base64);
    if (a==='saveCheckin')     return apiSaveCheckin(payload);
    if (a==='getCheckinLog')   return apiGetCheckinLog(payload);
    if (a==='getAIMatching')   return apiGetAIMatching(payload);
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
    if (a==='assignToTeam')     return apiAssignToTeam(payload);
    if (a==='getPowerTeams')          return apiGetPowerTeams(payload);
    if (a==='getGrowthPowerTeams')    return apiGetGrowthPowerTeams(payload);
    if (a==='setPTMemberStatus')      return apiSetPTMemberStatus(payload);
    if (a==='updatePTMember')         return apiUpdatePTMember(payload);
    if (a==='movePTMember')           return apiMovePTMember(payload);
    if (a==='moveSynMember')          return apiMoveSynMember(payload);
    if (a==='getMentorActivity')   return apiGetMentorActivity(payload);
    if (a==='getWeeklyActions')    return apiGetWeeklyActions(payload);
    if (a==='createGrowthTask')    return apiCreateGrowthTask(payload);
    if (a==='getGrowthTasks')      return apiGetGrowthTasks(payload);
    if (a==='respondGrowthTask')   return apiRespondGrowthTask(payload);
    if (a==='getRiskMembers')      return apiGetRiskMembers(payload);
    if (a==='getMemberDirectory')  return apiGetMemberDirectory();
    if (a==='getSimulateData')     return apiGetSimulateData();
    if (a==='getCoachingGuide')    return apiGetCoachingGuide(payload);
    if (a==='save121Log')          return apiSave121Log(payload);
    if (a==='get121Logs')          return apiGet121Logs(payload);
    if (a==='getAll121Logs')       return apiGetAll121Logs(payload);
    if (a==='sendBroadcast')       return apiSendBroadcast(payload);
    if (a==='getBroadcasts')       return apiGetBroadcasts(payload);
    if (a==='getMentorPerformance')return apiGetMentorPerformance(payload);
    if (a==='getAlertCenter')      return apiGetAlertCenter(payload);
    if (a==='dismissAlert')        return apiDismissAlert(payload);
    if (a==='getDismissedAlerts')  return apiGetDismissedAlerts(payload);
    if (a==='getMeetingPrep')      return apiGetMeetingPrep(payload);
    if (a==='getChapterPulse')     return apiGetChapterPulse(payload);
    if (a==='getLeaderboard')      return apiGetLeaderboard(payload);
    if (a==='getVisitorTracker')   return apiGetVisitorTracker(payload);
    if (a==='getChapterActions')   return apiGetChapterActions(payload);
    if (a==='createMCAssignment')  return apiCreateMCAssignment(payload);
    if (a==='getMCAssignments')    return apiGetMCAssignments(payload);
    if (a==='getMentorAssignments')return apiGetMentorAssignments(payload);
    if (a==='ackAssignment')       return apiAckAssignment(payload);
    if (a==='saveLineId')          return apiSaveLineId(payload);
    if (a==='getLineIds')          return apiGetLineIds(payload);
    if (a==='getLineMembers')       return apiGetLineMembers(payload);
    if (a==='getLineMembersDetail') return apiGetLineMembersDetail(payload);
    if (a==='sendLineMessage')      return apiSendLineMessage(payload);
    if (a==='sendLineBroadcast')    return apiSendLineBroadcast(payload);
    if (a==='sendLineIntro')        return apiSendLineIntro(payload);
    if ([
      'triggerScoreAlert','triggerAnniversary','triggerCheckinReminder',
      'triggerChapterPulse','triggerPostMeetingPrompt','triggerWednesdayNudge',
      'triggerTeamLeaderboard','triggerMondayBrief','triggerMonthlyRecap',
      'trigger121Reminder','triggerWeeklyScorePush'
    ].indexOf(a) >= 0) {
      return {ok:false,error:'คำสั่งส่ง LINE รุ่นเก่าถูกปิดแล้ว กรุณาใช้ LINE AUTO ใน MC Desktop'};
    }
    if (a==='triggerScoreAlert')    return apiTriggerScoreAlert(payload);
    if (a==='triggerAnniversary')   return apiTriggerAnniversary(payload);
    if (a==='triggerCheckinReminder') return (function(){ if(payload.role!=='mc') return {ok:false,error:'MC only'}; try{ fridayEveningReminder(); return {ok:true}; }catch(e){ return {ok:false,error:e.message}; } })();
    if (a==='getAbsenceLog')          return apiGetAbsenceLog(payload);
    if (a==='setMCLineId')            return apiSetMCLineId(payload);
    if (a==='triggerChapterPulse')    return (function(){ if(payload.role!=='mc') return {ok:false,error:'MC only'}; try{ _lineChapterPulse(); return {ok:true}; }catch(e){ return {ok:false,error:e.message}; } })();
    if (a==='triggerPostMeetingPrompt') return (function(){ if(payload.role!=='mc') return {ok:false,error:'MC only'}; try{ fridayPostMeetingPrompt(); return {ok:true}; }catch(e){ return {ok:false,error:e.message}; } })();
    if (a==='triggerWednesdayNudge')  return (function(){ if(payload.role!=='mc') return {ok:false,error:'MC only'}; try{ wednesdayNudge(); return {ok:true}; }catch(e){ return {ok:false,error:e.message}; } })();
    if (a==='triggerTeamLeaderboard') return (function(){ if(payload.role!=='mc') return {ok:false,error:'MC only'}; try{ fridayTeamLeaderboard(); return {ok:true}; }catch(e){ return {ok:false,error:e.message}; } })();
    if (a==='getLineIssues')          return apiGetLineIssues(payload);
    if (a==='get121Tracker')          return apiGet121Tracker(payload);
    if (a==='setupAllTriggers')       return apiSetupAllTriggers(payload);
    if (a==='mentorBroadcast')        return apiMentorBroadcast(payload);
    if (a==='setupRichMenu')          return apiSetupRichMenu(payload);
    if (a==='triggerMondayBrief')     return (function(){ if(payload.role!=='mc') return {ok:false,error:'MC only'}; try{ mondayMorningBrief(); return {ok:true}; }catch(e){ return {ok:false,error:e.message}; } })();
    if (a==='triggerMonthlyRecap')    return (function(){ if(payload.role!=='mc') return {ok:false,error:'MC only'}; try{ monthlyRecap(); return {ok:true}; }catch(e){ return {ok:false,error:e.message}; } })();
    if (a==='trigger121Reminder')     return (function(){ if(payload.role!=='mc') return {ok:false,error:'MC only'}; try{ line121AutoReminder(); return {ok:true}; }catch(e){ return {ok:false,error:e.message}; } })();
    if (a==='triggerWeeklyScorePush') return (function(){ if(payload.role!=='mc') return {ok:false,error:'MC only'}; try{ var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('📱 LINE MEMBERS'); var cnt=sh&&sh.getLastRow()>1?sh.getLastRow()-1:0; thursdayBotPush(); return {ok:true,sent:cnt}; }catch(e){ return {ok:false,error:e.message}; } })();
    if (a==='enrollOnboarding')     return apiEnrollOnboarding(payload);
    if (a==='removeOnboarding')     return apiRemoveOnboarding(payload);
    if (a==='sendOnboardingWeek')   return apiSendOnboardingWeek(payload);
    if (a==='getOnboardingStatus')  return apiGetOnboardingStatus(payload);
    if (a==='getOnboardingPreview')  return apiGetOnboardingPreview(payload);
    if (a==='getOnboardingMessages') return apiGetOnboardingMessages(payload);
    if (a==='saveOnboardingMessage') return apiSaveOnboardingMessage(payload);
    if (a==='saveMemberNote')      return apiSaveMemberNote(payload);
    if (a==='getMemberNote')       return apiGetMemberNote(payload);
    if (a==='extendRenewal')       return apiExtendRenewal(payload);
    if (a==='saveScore')           return apiSaveScore(payload);
    if (a==='saveStatus')          return apiSaveStatus(payload);
    if (a==='ensureSlot')          return apiEnsureSlot(payload);
    if (a==='addNewMembersBatch')  return apiAddNewMembersBatch(payload);
    if (a==='getChapterTrend')     return apiGetChapterTrend(payload);
    if (a==='archiveMember')       return apiArchiveMember(payload);
    if (a==='removeNewMember')     return apiRemoveNewMember(payload);
    if (a==='unarchiveMember')     return apiUnarchiveMember(payload);
    if (a==='getArchivedMembers')  return apiGetArchivedMembers(payload);
    if (a==='getCurrentMonth')     return apiGetCurrentMonth(payload);
    if (a==='setCurrentMonth')     return apiSetCurrentMonth(payload);
    if (a==='changePIN')           return apiChangePIN(payload);
    if (a==='verifyScoring')          return apiVerifyScoring(payload);
    if (a==='getMCCoaching')          return apiGetMCCoaching(payload);
    if (a==='getDesktopDashboard')    return apiGetDesktopDashboard(payload);
    if (a==='getUsageLog')            return apiGetUsageLog(payload);
    if (a==='logUsage')               return apiLogUsage(payload);
    if (a==='getReadMsgKeys')         return apiGetReadMsgKeys(payload);
    if (a==='setMsgRead')             return apiSetMsgRead(payload);
    if (a==='getGrowthSheetData')     return apiGetGrowthSheetData(payload);
    if (a==='updateGrowthMember')     return apiUpdateGrowthMember(payload);
    if (a==='addGrowthMember')        return apiAddGrowthMember(payload);
    if (a==='moveGrowthMember')       return apiMoveGrowthMember(payload);
    if (a==='monthlySync')            return apiMonthlySync(payload);
    if (a==='save90DayReview')        return apiSave90DayReview(payload);
    if (a==='get90DayReviews')        return apiGet90DayReviews(payload);
    if (a==='saveMentorLog')          return apiSaveMentorLog(payload);
    if (a==='getMentorLogs')          return apiGetMentorLogs(payload);
    if (a==='getVisitorLog')          return apiGetVisitorLog(payload);
    if (a==='addVisitor')             return apiAddVisitor(payload);
    if (a==='updateVisitor')          return apiUpdateVisitor(payload);
    if (a==='getSeatMap')             return apiGetSeatMap(payload);

    // Growth System v2
    if (a==='getChapterRevenue')     return apiGetChapterRevenue(payload);
    if (a==='setChapterGoal')        return apiSetChapterGoal(payload);
    if (a==='getCrossTeamSynergy')   return apiGetCrossTeamSynergy(payload);
    if (a==='saveCrossTeamPair')     return apiSaveCrossTeamPair(payload);
    if (a==='getSprintBoard')        return apiGetSprintBoard(payload);
    if (a==='saveSprintPlan')        return apiSaveSprintPlan(payload);
    if (a==='getReferralFlow')       return apiGetReferralFlow(payload);
    if (a==='getPTMembers')          return apiGetPTMembers(payload);
    if (a==='savePTMember')          return apiSavePTMember(payload);
    if (a==='deletePTMember')        return apiDeletePTMember(payload);
    if (a==='movePTMember')          return apiMovePTMember(payload);

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
  // Check SETTINGS for PIN override first
  var overridePIN = _getSettingsValue('PIN_'+role.toUpperCase());
  var correctPIN = (overridePIN !== null && String(overridePIN).trim() !== '')
    ? String(overridePIN).trim() : PINS[role];
  if (correctPIN !== pin) return { ok:false, error:'PIN ไม่ถูกต้อง' };
  var names = { mc:'ตูมตาม (MC)',toomtam:'TOOMTAM (ตูมตาม)',aof:'Aof (อ็อฟ)',draft:'Draft (ดราฟ)',phai:'PHAI (ไผ่)',amp:'AMP (แอมป์)',growth: 'Growth Coordinator', };
  var teamName = MENTOR_ROLE[role]||null;
  var displayName = names[role]||role;
  return { ok:true, role:role, isMC:(role==='mc'), teamName:teamName, displayName:displayName, version:APP_VERSION, versionDate:APP_VERSION_DATE };
}

// ── App Usage Logging ─────────────────────────────────────────
function apiLogUsage(p) {
  var role  = String(p.role||'').toLowerCase();
  var team  = String(p.team||p.role||'');
  var plat  = String(p.platform||'mobile');
  var action= String(p.logAction||p.action||'login');
  var detail= String(p.detail||'');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('📱 APP USAGE');
    if (!sh) {
      sh = ss.insertSheet('📱 APP USAGE');
      sh.appendRow(['Date','Day','Time','Role','Team','Platform','Action','Detail']);
      sh.getRange(1,1,1,8).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    var tz  = Session.getScriptTimeZone();
    var now = new Date();
    var DAYS = ['อา','จ','อ','พ','พฤ','ศ','ส'];
    sh.appendRow([
      Utilities.formatDate(now, tz, 'dd/MM/yy'),
      DAYS[now.getDay()]||'',
      Utilities.formatDate(now, tz, 'HH:mm'),
      role, team, plat, action, detail
    ]);
    return { ok:true };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

var USAGE_SHEET = '📱 APP USAGE';
var USAGE_HEADERS = ['Date','DayTH','Time','Role','Team','Platform','Action','Detail'];

function _getOrCreateUsageSheet(ss) {
  var sh = ss.getSheetByName(USAGE_SHEET);
  if (!sh) {
    sh = ss.insertSheet(USAGE_SHEET);
    sh.getRange(1,1,1,USAGE_HEADERS.length).setValues([USAGE_HEADERS]);
    sh.getRange(1,1,1,USAGE_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    try { sh.setColumnWidth(1,90);sh.setColumnWidth(2,50);sh.setColumnWidth(3,60);sh.setColumnWidth(4,70);sh.setColumnWidth(5,80);sh.setColumnWidth(6,70);sh.setColumnWidth(7,70);sh.setColumnWidth(8,140); } catch(e) {}
  }
  return sh;
}

function _logAppUsage(ss, role, team, platform, action, detail) {
  try {
    var sh = _getOrCreateUsageSheet(ss);
    var tz = Session.getScriptTimeZone();
    var now = new Date();
    var dateStr  = Utilities.formatDate(now, tz, 'dd/MM/yy');
    var timeStr  = Utilities.formatDate(now, tz, 'HH:mm');
    var days = ['อา','จ','อ','พ','พฤ','ศ','ส'];
    var dayTH = days[now.getDay()]||'';
    sh.appendRow([dateStr, dayTH, timeStr, role, team||role, platform, action||'', detail||'']);
  } catch(e) { Logger.log('_logAppUsage: '+e.message); }
}

function apiGetUsageLog(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(USAGE_SHEET);
    if (!sh || sh.getLastRow() < 2) return { ok:true, logs:[], teamStats:{} };

    var data = sh.getRange(2, 1, sh.getLastRow()-1, USAGE_HEADERS.length).getValues();
    var now = new Date();
    var logs = [];
    var teamStats = {}; // { teamName: { count7, count30, lastDate, lastTime, lastPlatform } }

    data.forEach(function(row) {
      // col 0 อาจเป็น Date object (Google Sheets auto-convert) หรือ string dd/MM/yy
      var rawDate = row[0];
      var dateStr = '';
      var daysAgo = 999;
      if (rawDate instanceof Date && !isNaN(rawDate)) {
        daysAgo = Math.floor((now - rawDate) / 86400000);
        var tz = Session.getScriptTimeZone();
        dateStr = Utilities.formatDate(rawDate, tz, 'dd/MM/yy');
      } else {
        dateStr = String(rawDate||'').trim();
        var parts = dateStr.match(/^(\d{1,2})\/(\d{2})\/(\d{2,4})/);
        if (parts) {
          var yr = parseInt(parts[3]); if (yr < 100) yr += 2000;
          var d = new Date(yr, parseInt(parts[2])-1, parseInt(parts[1]));
          daysAgo = Math.floor((now - d) / 86400000);
        }
      }
      var dayTH   = String(row[1]||'');
      var timeStr = String(row[2]||'').trim();
      var role    = String(row[3]||'').trim();
      var team    = String(row[4]||'').trim();
      var platform= String(row[5]||'').trim();
      var action  = String(row[6]||'').trim();
      var detail  = String(row[7]||'').trim();
      if (!dateStr || !role) return;

      logs.push({ date:dateStr, day:dayTH, time:timeStr, role:role, team:team, platform:platform, action:action, detail:detail, daysAgo:daysAgo });

      // Team stats
      if (!teamStats[team]) teamStats[team] = { count7:0, count30:0, lastDate:'', lastTime:'', lastPlatform:'', daysAgoLast:999 };
      var ts = teamStats[team];
      if (daysAgo <= 7)  ts.count7++;
      if (daysAgo <= 30) ts.count30++;
      if (daysAgo < ts.daysAgoLast) {
        ts.daysAgoLast = daysAgo;
        ts.lastDate = dateStr+' '+timeStr;
        ts.lastPlatform = platform;
      }
    });

    // Keep last 200 rows for display
    logs.reverse();
    return { ok:true, logs:logs.slice(0,200), teamStats:teamStats };
  } catch(e) {
    return { ok:false, error:e.message };
  }
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
  var summary = { green:0,yellow:0,red:0,black:0,none:0 };
  var alerts  = [];
  var masterData = masterSh.getDataRange().getValues();
  var archivedNames = _getArchivedNames(ss);

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
    if (!name) continue;
    if (archivedNames[name]) continue;

    var r2y    = r2yMap[name] || null;
    var phone  = r2y ? String(r2y[15]||'') : '';
    var email  = r2y ? String(r2y[14]||'') : '';
    var tyfcb  = r2y ? _parseR2YNum(r2y[6]) : 0;
    var absent = r2y ? parseInt(r2y[10])||0  : 0;

    // Use official BNI Points (r2y[7]) as primary score — same source as desktop
    var bniTl = 'none', bniScore = 0, cats = null;
    if (r2y) {
      try {
        var bniActual = {
          rg:      parseInt(r2y[1])||0,  visitor: parseInt(r2y[3])||0,
          oToOne:  parseInt(r2y[4])||0,  ceu:     parseInt(r2y[5])||0,
          tyfcb:   _parseR2YNum(r2y[6]), bniDays: parseInt(r2y[8])||0,
          absent:  absent
        };
        if (bniActual.bniDays > 0) {
          var bniS   = _bniBuildScore(bniActual);
          var offPts = parseInt(r2y[7])||0;
          bniScore = offPts > 0 ? offPts : 0;
          bniTl    = offPts > 0 ? _bniBuildTL(offPts) : 'none';
          cats = { absent:bniS.absent, ref:bniS.ref, tyfcb:bniS.tyfcb,
                   visitor:bniS.visitor, one21:bniS.one21, training:bniS.training };
        }
      } catch(e2) {}
    }

    // Use the higher of master sheet col E vs R2Y official — avoids stale overrides
    var masterScore = parseFloat(row[4])||0;
    var displayScore = Math.max(masterScore||0, bniScore||0);
    var tlKey = displayScore > 0 ? _bniBuildTL(displayScore) : (bniTl || 'none');
    summary[tlKey]++;
    // Keep bniTl/bniScore in sync with the correct display score
    var effBniScore = displayScore;
    var effBniTl = tlKey;

    var m = { name:name, nick:nick, mentor:mentor,
              score:displayScore, tl:tlKey,
              given:given, recv:recv, balance:balance,
              phone:phone, email:email,
              tyfcb:tyfcb, absent:absent,
              bniTl:effBniTl, bniScore:effBniScore, cats:cats };
    members.push(m);

    if (tlKey==='red'||tlKey==='black'||absent>4) alerts.push(m);
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
  if (!r2yRow) {
    // New member — not yet in R2Y, use empty row
    r2yRow = [name,0,0,0,0,0,0,0,0,0,0,0,0,0,'',''];
  }

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
    tyfcb:   _parseR2YNum(r2yRow[6]),
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
  var renewalStr    = '';
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
        // Renewal: col W = index 20
        var renewalRaw = shData[r][20];
        if (renewalRaw instanceof Date && !isNaN(renewalRaw.getTime())) {
          renewalStr = Utilities.formatDate(renewalRaw, Session.getScriptTimeZone(), 'dd MMM yyyy');
        } else if (renewalRaw) { renewalStr = String(renewalRaw).trim(); }
        break;
      }
    }
  }

  // Attendance risk
  var attendRisk = actual.absent>=7?'critical':actual.absent>=5?'danger':actual.absent>4?'warning':'ok';

  // Priorities
  var priorities = _computePriorities(actual, target, weeks);

  // BNI scoring — use official R2Y Points as primary score (same as desktop)
  var bniScore = 0, bniTl = 'none', cats = null, fastTrack = null;
  try {
    if (actual.bniDays > 0) {
      var s2       = _bniBuildScore(actual);
      var offPts   = parseInt(r2yRow[7])||0;
      bniScore     = offPts > 0 ? offPts : 0;
      bniTl        = offPts > 0 ? _bniBuildTL(offPts) : 'none';
      cats         = { absent:s2.absent, ref:s2.ref, tyfcb:s2.tyfcb,
                       visitor:s2.visitor, one21:s2.one21, training:s2.training };
      fastTrack    = _bniFastTrack(actual);
    }
  } catch(fe) {}

  // Use the higher of master sheet col E vs R2Y official — avoids stale overrides
  var masterScoreD = parseFloat(masterRow[4])||0;
  var displayScore = Math.max(masterScoreD||0, bniScore||0);
  var displayTl    = displayScore > 0 ? _bniBuildTL(displayScore) : (bniTl || 'none');

  return {
    ok:true, name:name, nick:nick, mentor:mentor,
    score:    displayScore,
    tl:       displayTl,
    bniScore: displayScore,   // keep bniScore in sync with display score
    bniTl:    displayTl,
    cats:     cats,
    given:given, recv:recv, balance:balance,
    actual:actual, target:target, weeks:weeks,
    scoreHistory:scoreHistory, attendRisk:attendRisk,
    priorities:priorities,
    fastTrack: fastTrack,
    coreIssue: coreIssueData,
    mcReply:   mcReplyData,
    renewal:   renewalStr
  };
}

function _findMentorSheet(ss, memberName) {
  var sheets = MENTOR_TEAMS;
  for (var s=0;s<sheets.length;s++) {
    var sh = ss.getSheetByName(sheets[s]);
    if (!sh) continue;
    var lastR = Math.max(sh.getLastRow(), 11);
    var colC  = sh.getRange(4, 3, lastR - 3, 1).getValues();
    for (var r=0;r<colC.length;r++) {
      if (String(colC[r][0]||'').trim()===memberName) return sheets[s];
    }
  }
  return null;
}

// ── My Team ───────────────────────────────────────────────────
function apiGetMyTeam(p) {
  var teamName = p.teamName || MENTOR_ROLE[p.role];
  if (!teamName) return { ok:false, error:'ไม่พบทีม' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(teamName);
  if (!sh) return { ok:false, error:'ไม่พบ Sheet '+teamName };

  // ── R2Y map (phone / email / absent) ──────────────────────────
  var r2yMap = {};
  var r2ySh = ss.getSheetByName('Reporting2You');
  if (r2ySh && r2ySh.getLastRow() > 1) {
    var r2yData = r2ySh.getRange(2, 1, r2ySh.getLastRow()-1, 16).getValues();
    r2yData.forEach(function(row) {
      var rn = String(row[0]||'').replace(/\s*\(BNI Ideal\)/i,'').trim();
      if (rn) r2yMap[rn] = row;
    });
  }

  // ── Mentor Sheet: rows 4+ (score history, core issue, etc.) ───
  var lastDataRow = Math.max(sh.getLastRow(), 11);
  var rawData = sh.getRange(4, 3, lastDataRow - 3, 24).getValues();
  var members = [];
  var sheetNames = {};   // track names already loaded from Mentor Sheet

  var archivedForTeam = _getArchivedNames(ss);

  for (var i = 0; i < rawData.length; i++) {
    var row  = rawData[i];
    var name = String(row[0]||'').trim();
    if (!name) continue;
    if (archivedForTeam[name]) continue;
    sheetNames[name] = true;
    var nick = String(row[1]||'').trim();
    var scores = [];
    for (var c = 2; c <= 13; c++) {
      scores.push({ month:MONTH_LABELS[c+3]||'', score:row[c]?parseFloat(row[c]):null });
    }
    var latest = null;
    for (var j = scores.length-1; j >= 0; j--) {
      if (scores[j].score !== null && scores[j].score > 0) { latest = scores[j].score; break; }
    }
    var trend   = String(row[14]||'');
    var status  = String(row[15]||'');
    var core    = String(row[21]||'');
    var mcMsg   = String(row[23]||'');
    var r2y     = r2yMap[name]||null;
    var tl      = !latest?'none':latest>=70?'green':latest>=50?'yellow':latest>=30?'red':'black';
    var renewalRaw = row[20];
    var renewal = '', renewalSoon = false;
    if (renewalRaw instanceof Date && !isNaN(renewalRaw)) {
      renewal = Utilities.formatDate(renewalRaw, Session.getScriptTimeZone(), 'dd MMM yyyy');
      renewalSoon = ((renewalRaw - new Date()) / 86400000) < 60;
    } else if (renewalRaw) { renewal = String(renewalRaw).trim(); }
    // ── Use R2Y official BNI Points as current score (same source as Dashboard) ──
    var bniScore = 0, bniTl = tl, absent = r2y ? parseInt(r2y[10])||0 : 0;
    if (r2y) {
      try {
        var offPts = parseInt(r2y[7])||0;
        var bniActual = {
          rg:parseInt(r2y[1])||0, visitor:parseInt(r2y[3])||0,
          oToOne:parseInt(r2y[4])||0, ceu:parseInt(r2y[5])||0,
          tyfcb:_parseR2YNum(r2y[6]), bniDays:parseInt(r2y[8])||0, absent:absent
        };
        if (offPts > 0) {
          bniScore = offPts;
          bniTl = _bniBuildTL(offPts);
        }
        // keep _bniBuildScore for cats only — don't use as fallback score
        if (bniActual.bniDays > 0) {
          try { var bniSx = _bniBuildScore(bniActual); } catch(e3) {}
        }
      } catch(e2) {}
    }
    members.push({ row:i+4, name:name, nick:nick, scores:scores, latest:latest,
      trend:trend, status:status, tl:tl, renewal:renewal, renewalSoon:renewalSoon,
      core:core, mcMsg:mcMsg,
      bniScore:bniScore, bniTl:bniTl,
      phone:r2y?String(r2y[15]||''):'', email:r2y?String(r2y[14]||''):'',
      absent:absent });
  }

  // ── รายชื่อทั้งหมด: เติมสมาชิกที่ยังไม่มีใน Mentor Sheet ──────
  // (เช่น คนใหม่ที่ถูกเพิ่มแต่ Mentor Sheet เต็ม)
  var masterSh = ss.getSheetByName('รายชื่อทั้งหมด');
  if (masterSh && masterSh.getLastRow() > 2) {
    var mData = masterSh.getRange(3, 1, masterSh.getLastRow()-2, 9).getValues();
    mData.forEach(function(mRow) {
      var mName   = String(mRow[1]||'').trim();
      var mNick   = String(mRow[2]||'').trim();
      var mMentor = String(mRow[3]||'').trim();
      if (!mName || mMentor !== teamName || sheetNames[mName]) return;
      if (archivedForTeam[mName]) return;
      // สมาชิกทีมนี้ที่ไม่มีใน Mentor Sheet → โชว์เป็น ⭐ ใหม่
      var r2y = r2yMap[mName]||null;
      var nmBniScore = 0, nmBniTl = 'none', nmAbsent = r2y ? parseInt(r2y[10])||0 : 0;
      if (r2y) {
        try {
          var nmOffPts = parseInt(r2y[7])||0;
          if (nmOffPts > 0) { nmBniScore = nmOffPts; nmBniTl = _bniBuildTL(nmOffPts); }
        } catch(e3) {}
      }
      members.push({ row:null, name:mName, nick:mNick, scores:[], latest:nmBniScore||null,
        trend:'', status:'', tl:nmBniTl, renewal:'', core:'', mcMsg:'',
        bniScore:nmBniScore, bniTl:nmBniTl,
        phone:r2y?String(r2y[15]||''):'', email:r2y?String(r2y[14]||''):'',
        absent:nmAbsent });
    });
  }

  // ── Mentor Last Activity Map ──────────────────────────────────
  // อ่าน MENTOR LOGS sheet แล้วหาวันล่าสุดที่ Mentor log สำหรับแต่ละ Mentee
  var actMap = _buildMentorActivityMap(ss);
  members.forEach(function(m) {
    var act = actMap[m.name.toLowerCase()] || null;
    m.lastMentorContact = act ? act.lastDate : null;
    m.mentorContactDays = act ? act.daysSince : null;
    m.noMentorContact   = (m.mentorContactDays === null) || (m.mentorContactDays > 14);
  });

  return { ok:true, teamName:teamName, members:members };
}

// ── Helper: Build Mentor Activity Map ─────────────────────────
function _buildMentorActivityMap(ss) {
  var map = {};
  try {
    var sh = ss.getSheetByName('📋 MENTOR LOGS');
    if (!sh || sh.getLastRow() < 2) return map;
    var data = sh.getRange(2, 1, sh.getLastRow()-1, 7).getValues();
    var now = new Date();
    data.forEach(function(row) {
      var dateStr = String(row[0]||'').trim(); // col A = Date "dd/MM/yy HH:mm"
      var mentee  = String(row[2]||'').trim().toLowerCase(); // col C = Mentee
      if (!mentee || !dateStr) return;
      // Parse dd/MM/yy HH:mm
      var parts = dateStr.match(/^(\d{1,2})\/(\d{2})\/(\d{2,4})/);
      if (!parts) return;
      var yr = parseInt(parts[3]); if (yr < 100) yr += 2000;
      var d = new Date(yr, parseInt(parts[2])-1, parseInt(parts[1]));
      if (isNaN(d.getTime())) return;
      var days = Math.floor((now - d) / 86400000);
      if (!map[mentee] || days < map[mentee].daysSince) {
        map[mentee] = { lastDate: dateStr, daysSince: days };
      }
    });
  } catch(e) { Logger.log('_buildMentorActivityMap: '+e.message); }
  return map;
}

// ── Scorecard ─────────────────────────────────────────────────
function apiGetScorecard(p) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var TEAMS = MENTOR_TEAMS;

  // ─ หา thisCol / prevCol จาก TOOMTAM ─
  // BNI FY: FEB=pos0, MAR=pos1, ... JAN=pos11  (col E=pos0+5=5 ... col P=pos11+5=16)
  // สแกนเฉพาะเดือนที่ ≤ เดือนปัจจุบัน ป้องกันการ pick JAN เก่าแทน MAY ใหม่
  var thisCol = 7, prevCol = 6;
  var sampleSh = ss.getSheetByName('TOOMTAM');
  if (sampleSh) {
    var sRow = sampleSh.getRange(4, 5, 1, 12).getValues()[0]; // col E–P (pos 0–11)

    // fiscal position ของเดือนปัจจุบัน: FEB(JS=1)→0 ... JAN(JS=0)→11
    var nowJS = new Date().getMonth(); // 0=Jan,1=Feb,...
    var currFiscalPos = (nowJS - 1 + 12) % 12;

    // หาเดือนล่าสุดที่มีข้อมูล ≤ เดือนปัจจุบัน (สแกน FEB→ curr)
    var latestPos = -1;
    for (var c = 0; c <= currFiscalPos; c++) {
      if (parseFloat(sRow[c]) > 0) latestPos = c;
    }
    // fallback: ถ้าไม่เจอในปีนี้เลย ลองสแกนทั้งหมด
    if (latestPos < 0) {
      for (var c = 11; c >= 0; c--) {
        if (parseFloat(sRow[c]) > 0) { latestPos = c; break; }
      }
    }

    if (latestPos >= 0) {
      thisCol = latestPos + 5;
      // หา prevPos = เดือนก่อนหน้าที่มีข้อมูล (ไม่จำเป็นต้องติดกัน)
      var prevPos = -1;
      for (var c2 = latestPos - 1; c2 >= 0; c2--) {
        if (parseFloat(sRow[c2]) > 0) { prevPos = c2; break; }
      }
      // ถ้าไม่เจอในปีนี้ ใช้ JAN ปีก่อน (pos 11)
      prevCol = prevPos >= 0 ? prevPos + 5 : 16;
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

    // Batch read rows 4–lastRow, col C(3) ถึง Q(17) = 15 cols — ไม่จำกัด 8 คน
    var shLastRow = Math.max(sh.getLastRow(), 4);
    var numSRows  = shLastRow - 4 + 1;
    var data = sh.getRange(4, 3, numSRows, 15).getValues();
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
  var arcR = _getArchivedNames(ss);
  for (var r=3;r<=sh.getLastRow();r++) {
    var name=sh.getRange(r,1).getDisplayValue().trim();
    var team=sh.getRange(r,2).getDisplayValue().trim();
    var expRaw=sh.getRange(r,3).getValue();
    if (!name||!expRaw) continue;
    if (arcR[name]) continue;
    var expDate=new Date(expRaw); expDate.setHours(0,0,0,0);
    if (isNaN(expDate.getTime())) continue;
    var diff=Math.floor((expDate-today)/86400000);
    var status=diff<0?'late':diff<=30?'soon':diff<=90?'normal':'ok';
    if (p.role!=='mc'&&MENTOR_ROLE[p.role]&&team!==MENTOR_ROLE[p.role]) continue;
    items.push({ name:name,team:team,diffDays:diff,status:status,
      expStr:Utilities.formatDate(expDate,Session.getScriptTimeZone(),'dd MMM yyyy'), row:r });
  }
  items.sort(function(a,b){return a.diffDays-b.diffDays;});
  return { ok:true, items:items };
}

// ── Extend Renewal +1 Year ────────────────────────────────────
function apiExtendRenewal(p) {
  if (p.role !== 'mc') return { ok:false, error:'เฉพาะ MC เท่านั้น' };
  if (!p.name) return { ok:false, error:'ต้องระบุชื่อสมาชิก' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('💳 RENEWAL');
  if (!sh) return { ok:false, error:'ไม่พบ Sheet RENEWAL' };

  // หาแถวที่ตรงกับชื่อ (ใช้ name lookup แทน row number เพื่อความปลอดภัย)
  var targetRow = -1;
  for (var r = 3; r <= sh.getLastRow(); r++) {
    if (sh.getRange(r,1).getDisplayValue().trim() === p.name.trim()) {
      targetRow = r; break;
    }
  }
  if (targetRow === -1) return { ok:false, error:'ไม่พบ "'+p.name+'" ใน RENEWAL' };

  var expRaw = sh.getRange(targetRow, 3).getValue();
  var baseDate = (expRaw instanceof Date && !isNaN(expRaw.getTime())) ? expRaw : new Date();
  // ถ้าหมดอายุแล้ว ให้นับจากวันนี้
  var today = new Date(); today.setHours(0,0,0,0);
  if (baseDate < today) baseDate = today;

  var newExp = new Date(baseDate);
  newExp.setFullYear(newExp.getFullYear() + 1);

  var tz = Session.getScriptTimeZone();
  var now = Utilities.formatDate(new Date(), tz, 'dd/MM/yy HH:mm');
  sh.getRange(targetRow, 3).setValue(newExp);
  // บันทึกวันที่ต่ออายุใน col D
  sh.getRange(targetRow, 4).setValue('ต่ออายุ ' + now);

  // อัปเดต col W ของ Mentor Sheet ด้วย
  var teams = MENTOR_TEAMS;
  teams.forEach(function(teamName) {
    var msh = ss.getSheetByName(teamName);
    if (!msh) return;
    for (var mr = 4; mr <= 11; mr++) {
      if (msh.getRange(mr,3).getDisplayValue().trim() === p.name.trim()) {
        msh.getRange(mr,23).setValue(newExp); // col W = 23
        return;
      }
    }
  });

  var newExpStr = Utilities.formatDate(newExp, tz, 'dd MMM yyyy');
  return { ok:true, newExpStr:newExpStr, renewedAt:now };
}

// ── Messages ──────────────────────────────────────────────────
function apiGetMessages(p) {
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sheets=p.role==='mc'?MENTOR_TEAMS:[MENTOR_ROLE[p.role]];
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

// ── Read Message State ────────────────────────────────────────
function apiGetReadMsgKeys(p) {
  if (p.role !== 'mc') return { ok: false, error: 'Permission denied' };
  try {
    var stored = PropertiesService.getScriptProperties().getProperty('mc_readmsgs');
    var keys = stored ? JSON.parse(stored) : [];
    return { ok: true, keys: keys };
  } catch(e) {
    return { ok: true, keys: [] };
  }
}
function apiSetMsgRead(p) {
  if (p.role !== 'mc' || !p.key) return { ok: false, error: 'ข้อมูลไม่ครบ' };
  try {
    var sp = PropertiesService.getScriptProperties();
    var stored = sp.getProperty('mc_readmsgs');
    var keys = stored ? JSON.parse(stored) : [];
    if (keys.indexOf(p.key) === -1) keys.push(p.key);
    sp.setProperty('mc_readmsgs', JSON.stringify(keys));
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
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
    var mentorSheets=MENTOR_TEAMS;
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
  var row = parseInt(p.row);
  // row:null (⭐ ใหม่) → auto-create slot before saving
  if (!p.row || isNaN(row) || row < 4) {
    var slotRes = apiEnsureSlot({ role: p.role, memberName: String(p.memberName||'').trim(), nick: String(p.nick||'').trim() });
    if (!slotRes.ok) return slotRes;
    row = slotRes.row;
  }
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

  // Append new entry; keep last 50
  history.push({ coreIssue: p.coreIssue||'', actionTaken: p.actionTaken||'', plan: p.plan||'', savedAt: ts });
  if (history.length > 50) history = history.slice(-50);

  sh.getRange(row, 24).setValue(JSON.stringify(history));
  // Reset case status — new submission reopens the case
  sh.getRange(row, 28).setValue('');
  sh.getRange(row, 29).setValue('');

  try {
    var nick = sh.getRange(row, 4).getDisplayValue().trim();
    var scoreBefore = parseFloat(sh.getRange(row, 17).getValue()) || 0;
    logAction(p.role, teamName, p.memberName, nick, scoreBefore, p.coreIssue, p.actionTaken, p.plan);
  } catch(e) { Logger.log('Log err: '+e.message); }
  try {
    var mcId = _getLineId('mc');
    if (mcId) {
      _sendLineMsg(mcId,
        '🔔 [' + teamName + '] ส่ง Core Issue ใหม่\n' +
        'สมาชิก: ' + p.memberName + '\n' +
        'ปัญหา: ' + (p.coreIssue||'').substring(0,120) +
        '\n\nตรวจสอบใน BNI IDEAL System ครับ');
    }
  } catch(le) { Logger.log('LINE notify err: '+le.message); }
  return { ok:true, message:'บันทึกเรียบร้อยแล้ว' };
}

// ── Save MC Message ───────────────────────────────────────────
function apiSaveMCMessage(p) {
  if (p.role!=='mc') return { ok:false, error:'Permission denied' };
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName(p.teamName);
  if (!sh) return { ok:false, error:'ไม่พบ Sheet' };
  var row=parseInt(p.row);
  if (row<4) return { ok:false, error:'Row ไม่ถูกต้อง' };
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
    if (isNaN(row) || row < 4)
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

    try {
      var mentorLineId = _getLineId(p.teamName);
      if (mentorLineId) {
        _sendLineMsg(mentorLineId,
          '💬 MC ตอบ Core Issue\n' +
          'ทีม: ' + p.teamName + (p.memberName ? '\nสมาชิก: ' + p.memberName : '') + '\n' +
          'MC: ' + p.reply.toString().trim().substring(0,150) +
          '\n\nตรวจสอบใน BNI IDEAL System ครับ');
      }
    } catch(le2) { Logger.log('LINE notify err: '+le2.message); }

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
    if (actual.absent>=5) { t='🏛️ [🚨 วิกฤต!] Attendance'; a='ขาดไปแล้ว '+actual.absent+' ครั้ง — เสี่ยงต้องดรอป\nBNI เกณฑ์: ขาด 5-6 ครั้ง = ต้องดรอปออก'; tgt='มาทุกครั้งที่เหลือ + ปรึกษา Mentor Coordinator ทันที'; em=true; }
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
    var teams = MENTOR_TEAMS;
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

      // Normalize progress: Sheets stores % as decimal (0.75 = 75%)
      var rawProg = parseFloat(row[7]) || 0;
      var progress = (rawProg > 0 && rawProg <= 1) ? Math.round(rawProg * 100) : Math.round(rawProg);

      members.push({
        rowNum:    i + NM_DATA_ROW,
        seq:       row[0],
        name:      name,
        nick:      String(row[2]||'').trim(),
        mentor:    mentorVal,
        startDate: startDate,
        w8Date:    w8Str,
        status:    String(row[6]||'').trim(),
        progress:  progress,
        expDate:   expStr,
        fileUrl:   fileUrl
      });
    }

    // Dedup by name — keep first occurrence (in case sheet has duplicate rows)
    var _seen = {};
    members = members.filter(function(m) {
      if (_seen[m.name]) return false;
      _seen[m.name] = true;
      return true;
    });

    if (p.role !== 'mc') {
      var myTeam = (MENTOR_ROLE[p.role]||'').toLowerCase();
      members = members.filter(function(m) {
        return m.mentor.toLowerCase() === myTeam;
      });
    }

    return { ok: true, members: members };
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

    // ── ตรวจ duplicate ก่อน ────────────────────────────────────
    var lastRow = nmSheet.getLastRow();
    if (lastRow >= NM_DATA_ROW) {
      var existingNames = nmSheet.getRange(NM_DATA_ROW, 3, lastRow - NM_DATA_ROW + 1, 1).getValues();
      var isDup = existingNames.some(function(r){ return String(r[0]||'').trim().toLowerCase() === p.name.trim().toLowerCase(); });
      if (isDup) return { ok: false, error: 'มีชื่อ "'+p.name+'" ใน New Members อยู่แล้ว — กรุณาตรวจสอบ' };
    }

    // หา row ว่างแรก
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

    var warnings = [];

    // 4. เพิ่มใน รายชื่อทั้งหมด
    var masterSh = mainSS.getSheetByName('รายชื่อทั้งหมด');
    if (masterSh) {
      var mData = masterSh.getDataRange().getValues();
      var mExists = mData.some(function(row){ return String(row[1]).trim()===p.name.trim(); });
      if (!mExists) masterSh.appendRow(['', p.name, p.nick, p.mentor, 0, '', 0, 0, '']);
    }

    // 5. เพิ่มใน Mentor Sheet (ไม่จำกัดจำนวน)
    var validTeams = MENTOR_TEAMS;
    if (validTeams.indexOf(p.mentor) >= 0) {
      var mentorSh = mainSS.getSheetByName(p.mentor);
      if (mentorSh) {
        // ตรวจ duplicate ก่อน
        var mLast = mentorSh.getLastRow();
        var alreadyInMentor = false;
        if (mLast >= 4) {
          var mNames = mentorSh.getRange(4, 3, mLast - 3, 1).getValues();
          alreadyInMentor = mNames.some(function(r){ return String(r[0]||'').trim().toLowerCase() === p.name.trim().toLowerCase(); });
        }
        if (!alreadyInMentor) {
          // หาแถวว่างแรก หรือ append ที่ท้าย
          var slotRow = mLast + 1; // default: แถวถัดจาก lastRow
          for (var mr = 4; mr <= mLast; mr++) {
            if (!mentorSh.getRange(mr, 3).getValue()) { slotRow = mr; break; }
          }
          if (slotRow < 4) slotRow = 4;
          mentorSh.getRange(slotRow, 3).setValue(p.name);
          mentorSh.getRange(slotRow, 4).setValue(p.nick);
        }
      }
    }

    // 6. เพิ่มใน 💳 RENEWAL
    var rnSh = mainSS.getSheetByName('💳 RENEWAL');
    if (!rnSh) {
      rnSh = mainSS.insertSheet('💳 RENEWAL');
      rnSh.appendRow(['ชื่อ','ทีม','วันหมดอายุ']);
      rnSh.setFrozenRows(1);
    }
    var rnData = rnSh.getDataRange().getValues();
    var rnExists = rnData.some(function(row){ return String(row[0]).trim()===p.name.trim(); });
    if (!rnExists) rnSh.appendRow([p.name, p.mentor, expDate]);

    // 7. เพิ่ม placeholder ใน Reporting2You — member ปรากฏใน Stats ทันที (ก่อน BNI data จะมา)
    _ensureR2YPlaceholder(mainSS, p.name, p.email||'', p.phone||'');

    return {
      ok:       true,
      name:     p.name,
      fileUrl:  newFileUrl,
      fileName: newFileName,
      warnings: warnings
    };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Assign NM to Team (sync Mentor Sheet + Master + Renewal) ──
function apiAssignToTeam(p) {
  try {
    if (p.role !== 'mc') return { ok: false, error: 'Permission denied' };
    if (!p.name || !p.mentor) return { ok: false, error: 'ข้อมูลไม่ครบ' };

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var validTeams = MENTOR_TEAMS;
    var warnings = [];

    // 1. เพิ่มใน Mentor Sheet
    if (validTeams.indexOf(p.mentor) >= 0) {
      var mentorSh = ss.getSheetByName(p.mentor);
      if (mentorSh) {
        var mLast2 = mentorSh.getLastRow();
        var alreadyIn = false;
        if (mLast2 >= 4) {
          var mNamesA = mentorSh.getRange(4, 3, mLast2 - 3, 1).getValues();
          alreadyIn = mNamesA.some(function(r){ return String(r[0]||'').trim().toLowerCase() === p.name.trim().toLowerCase(); });
        }
        if (!alreadyIn) {
          var slotRow2 = mLast2 + 1;
          for (var mr = 4; mr <= mLast2; mr++) {
            if (!mentorSh.getRange(mr, 3).getValue()) { slotRow2 = mr; break; }
          }
          if (slotRow2 < 4) slotRow2 = 4;
          mentorSh.getRange(slotRow2, 3).setValue(p.name);
          mentorSh.getRange(slotRow2, 4).setValue(p.nick || p.name);
        }
      }
    }

    // 2. เพิ่มใน รายชื่อทั้งหมด
    var masterSh = ss.getSheetByName('รายชื่อทั้งหมด');
    if (masterSh) {
      var mData = masterSh.getDataRange().getValues();
      var mExists = mData.some(function(row) { return String(row[1]).trim() === p.name.trim(); });
      if (!mExists) masterSh.appendRow(['', p.name, p.nick || p.name, p.mentor, 0, '', 0, 0, '']);
    }

    // 3. เพิ่มใน 💳 RENEWAL
    if (p.expDate) {
      var rnSh = ss.getSheetByName('💳 RENEWAL');
      if (!rnSh) {
        rnSh = ss.insertSheet('💳 RENEWAL');
        rnSh.appendRow(['ชื่อ','ทีม','วันหมดอายุ']);
        rnSh.setFrozenRows(1);
      }
      var rnData = rnSh.getDataRange().getValues();
      var rnExists = rnData.some(function(row) { return String(row[0]).trim() === p.name.trim(); });
      if (!rnExists) {
        var ep = p.expDate.split('/');
        var expD = new Date(2000 + parseInt(ep[2]), parseInt(ep[1]) - 1, parseInt(ep[0]));
        rnSh.appendRow([p.name, p.mentor, expD]);
      }
    }

    // Ensure Reporting2You placeholder exists
    _ensureR2YPlaceholder(ss, p.name, '', '');

    return { ok: true, warnings: warnings };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Auto Cleanup: ลบ Core Issue ที่ปิดเกิน 30 วัน ─────────────
function autoCleanupOldCases() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var teams = MENTOR_TEAMS;
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
  var teams = MENTOR_TEAMS;
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

    // Build R2Y official score map
    var ptR2yMap = {};
    var ptR2ySh  = ss.getSheetByName('Reporting2You');
    if (ptR2ySh && ptR2ySh.getLastRow() > 1) {
      ptR2ySh.getRange(2, 1, ptR2ySh.getLastRow()-1, 8).getValues().forEach(function(row) {
        var rn = String(row[0]||'').replace(/\s*\(BNI Ideal\)\s*/gi,'').trim();
        if (rn) ptR2yMap[rn] = parseInt(row[7])||0;
      });
    }

    // Build nick → member map (single sheet read)
    var nickMap = {};
    if (masterSh) {
      var mData = masterSh.getDataRange().getValues();
      for (var i = 2; i < mData.length; i++) {
        var name  = String(mData[i][1]||'').trim();
        var nick  = String(mData[i][2]||'').trim();
        var mentor= String(mData[i][3]||'').trim();
        var masterScore3 = parseFloat(mData[i][4])||0;
        var offPts3 = ptR2yMap[name] || 0;
        var score = masterScore3 > 0 ? masterScore3 : offPts3;
        var tl    = score > 0 ? _bniBuildTL(score) : 'none';
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

    // Apply PT_SYN_TEAM overrides from SETTINGS (rebucket members to different teams)
    var settingsSh_syn = ss.getSheetByName('⚙️ SETTINGS');
    if (settingsSh_syn) {
      var sData_syn = settingsSh_syn.getDataRange().getValues();
      var synOverrides = {};
      for (var si = 0; si < sData_syn.length; si++) {
        if (String(sData_syn[si][0]).trim() === 'PT_SYN_TEAM') {
          try { var sto = JSON.parse(String(sData_syn[si][1]||'{}')); if (sto && typeof sto==='object') synOverrides = sto; } catch(e2) {}
          break;
        }
      }
      if (Object.keys(synOverrides).length > 0) {
        var synTeamIds = teams.map(function(t){ return t.id; });
        var synPool = [];
        teams.forEach(function(t){ t.members.forEach(function(m){ synPool.push({member:m, origId:t.id}); }); });
        var synBuckets = {};
        synTeamIds.forEach(function(id){ synBuckets[id] = []; });
        synPool.forEach(function(item){
          // Try fullName first (stable key), fall back to nick for legacy entries
          var keyName = item.member.name || '';
          var keyNick = item.member.nick || '';
          var overrideTeam = synOverrides[keyName] || synOverrides[keyNick] || '';
          var dest = (overrideTeam && synBuckets.hasOwnProperty(overrideTeam)) ? overrideTeam : item.origId;
          synBuckets[dest].push(item.member);
        });
        teams = teams.map(function(t){
          var newMems = synBuckets[t.id] || [];
          var suggs = [];
          for (var a2=0; a2<newMems.length; a2++) {
            for (var b2=a2+1; b2<newMems.length; b2++) {
              var sc = _scorePair(newMems[a2], newMems[b2]);
              if (sc.priority !== 'low') suggs.push({a:newMems[a2].nick,b:newMems[b2].nick,aScore:newMems[a2].score,bScore:newMems[b2].score,priority:sc.priority,reasons:sc.reasons});
            }
          }
          suggs.sort(function(x,y){ return (x.priority==='high'?0:1)-(y.priority==='high'?0:1); });
          return {id:t.id, icon:t.icon, name:t.name, members:newMems, count:newMems.length,
            avgScore:newMems.length?Math.round(newMems.reduce(function(s,m){return s+m.score;},0)/newMems.length):0,
            redBlack:newMems.filter(function(m){return m.tl==='red'||m.tl==='black';}).length,
            totalGiven:newMems.reduce(function(s,m){return s+m.given;},0),
            totalRecv:newMems.reduce(function(s,m){return s+m.recv;},0),
            suggestions:suggs.slice(0,5), synergy:t.synergy};
        });
      }
    }

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

// ── Growth Power Teams Revenue View ──────────────────────────
function apiGetGrowthPowerTeams(p) {
  try {
    if (p.role !== 'growth' && p.role !== 'mc') return { ok: false, error: 'Permission denied' };

    var teams = null;

    // Primary: read from ⚡ POWER TEAMS sheet
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('⚡ POWER TEAMS');
    if (sh) {
      var data = sh.getDataRange().getValues();
      if (data.length > 1) {
        var teamMap = {}, teamOrder = [];
        for (var i = 1; i < data.length; i++) {
          var row = data[i];
          var tName = String(row[0]||'').trim();
          if (!tName) continue;
          if (!teamMap[tName]) { teamMap[tName] = []; teamOrder.push(tName); }
          var bniGoal = parseFloat(row[6])||0;
          var recv    = parseFloat(row[7])||0;
          teamMap[tName].push({
            firstName:  String(row[1]||'').trim(),
            lastName:   String(row[2]||'').trim(),
            nick:       String(row[3]||'').trim(),
            profession: String(row[4]||'').trim(),
            tl:         String(row[5]||'').trim(),
            bniGoal:    bniGoal,
            recv:       recv,
            refPerWeek: parseFloat(row[8])||0,
            goalPct:    bniGoal > 0 ? Math.round(recv / bniGoal * 1000) / 10 : 0
          });
        }
        if (teamOrder.length > 0) {
          teams = teamOrder.map(function(name) {
            var members = teamMap[name];
            var tGoal = members.reduce(function(s,m){ return s + m.bniGoal; }, 0);
            var tRecv = members.reduce(function(s,m){ return s + m.recv; }, 0);
            return { team: name, members: members, memberCount: members.length,
              teamGoal: tGoal, teamRecv: tRecv,
              teamPct: tGoal > 0 ? Math.round(tRecv / tGoal * 1000) / 10 : 0 };
          });
        }
      }
    }

    // Fallback: static data from power_team_data.json
    if (!teams) {
      teams = [{"team":"Developer","members":[{"seq":1,"firstName":"Jirayu","lastName":"Boonlert","nick":"ฟอร์ด","profession":"ผ้าม่าน วอลเปเปอร์ พื้นSPC มุ้งจีบ","tl":"Y","given":533984,"bniGoal":4000000,"recv":304140,"goalPct":7.6,"avgDeal":60000,"conversion":0.5,"refPerWeek":2.67,"refIn":9,"refOut":12},{"seq":2,"firstName":"Kanpong","lastName":"Ritchainimit","nick":"หนึ่ง","profession":"เมทัลชีท","tl":"Y","given":684510,"bniGoal":10000000,"recv":1566630,"goalPct":15.7,"avgDeal":100000,"conversion":0.6,"refPerWeek":3.33,"refIn":14,"refOut":12},{"seq":3,"firstName":"Nantawat","lastName":"Mahaeknan","nick":"เน็ท","profession":"จำหน่ายเหล็กก่อสร้าง","tl":"R","given":121542,"bniGoal":3000000,"recv":1971083,"goalPct":65.7,"avgDeal":200000,"conversion":0.5,"refPerWeek":0.6,"refIn":20,"refOut":9},{"seq":4,"firstName":"Pariphon","lastName":"Jaroonthiravith","nick":"ปิงปอง","profession":"รับทำป้าย-ฟาดซาด","tl":"G","given":3074019,"bniGoal":5000000,"recv":563852,"goalPct":11.3,"avgDeal":100000,"conversion":0.8,"refPerWeek":1.25,"refIn":6,"refOut":22},{"seq":5,"firstName":"Ploypachcha","lastName":"Tararattanapawn","nick":"เม","profession":"ประตูม้วน ประตูอัตโนมัติ","tl":"Y","given":143747,"bniGoal":2000000,"recv":156315,"goalPct":7.8,"avgDeal":100000,"conversion":0.8,"refPerWeek":0.5,"refIn":6,"refOut":19},{"seq":6,"firstName":"Praputsorn","lastName":"Kongsarppaisal","nick":"แยม","profession":"กระจก อลูมิเนียม","tl":"G","given":473205,"bniGoal":3000000,"recv":1477198,"goalPct":49.2,"avgDeal":200000,"conversion":0.8,"refPerWeek":0.38,"refIn":11,"refOut":8},{"seq":7,"firstName":"Thanongsak","lastName":"Seriumnuay","nick":"โอ","profession":"ออกแบบและตกแต่งภายใน","tl":"R","given":678168,"bniGoal":3000000,"recv":244000,"goalPct":8.1,"avgDeal":600000,"conversion":0.7,"refPerWeek":0.14,"refIn":0,"refOut":2}],"teamGoal":30000000,"teamRecv":6283218,"teamPct":20.9,"memberCount":7},{"team":"Restaurant & Supermarket","members":[{"seq":1,"firstName":"Archara","lastName":"Pagarat","nick":"นุ่น","profession":"ไวน์อินทผลัม อินทผลัม และผลิตภัณฑ์แปรรูป","tl":"G","given":312702,"bniGoal":1000000,"recv":26440,"goalPct":2.6,"avgDeal":28800,"conversion":0.5,"refPerWeek":1.39,"refIn":8,"refOut":14},{"seq":2,"firstName":"Jakrapong","lastName":"Visetpanpong","nick":"อ้น","profession":"ผลิต แปรรูป จมูกข้าวออแกนิคและธัญพืช","tl":"G","given":45471,"bniGoal":2000000,"recv":35090,"goalPct":1.8,"avgDeal":40000,"conversion":0.6,"refPerWeek":1.67,"refIn":12,"refOut":15},{"seq":3,"firstName":"Korranat","lastName":"Worawongthep","nick":"แพร","profession":"Online Marketing","tl":"G","given":74508,"bniGoal":1920000,"recv":483000,"goalPct":25.2,"avgDeal":240000,"conversion":0.5,"refPerWeek":0.32,"refIn":6,"refOut":23},{"seq":4,"firstName":"Naruporn","lastName":"Supittayapornpong","nick":"เอ๋ย","profession":"ผลิต และจำหน่ายไอศกรีมซอฟต์เสิร์ฟ","tl":"Y","given":84900,"bniGoal":2000000,"recv":275069,"goalPct":13.8,"avgDeal":28000,"conversion":0.2,"refPerWeek":7.14,"refIn":9,"refOut":18},{"seq":5,"firstName":"Phitarn","lastName":"Sakulthanaphetch","nick":"ตูมตาม","profession":"Speciality Coffee","tl":"G","given":225436,"bniGoal":150000,"recv":22681,"goalPct":15.1,"avgDeal":8750,"conversion":0.5,"refPerWeek":0.69,"refIn":26,"refOut":18},{"seq":6,"firstName":"Prakorn","lastName":"Sirimars","nick":"ไผ่","profession":"สอนทำขนม","tl":"Y","given":120194,"bniGoal":1200000,"recv":27465,"goalPct":2.3,"avgDeal":600000,"conversion":0.5,"refPerWeek":0.08,"refIn":4,"refOut":4},{"seq":7,"firstName":"Preeda","lastName":"Noita","nick":"ตุ๋ย","profession":"ผลิตสร้างห้องเย็น รถห้องเย็น","tl":"G","given":1469463,"bniGoal":20000000,"recv":24436448,"goalPct":122.2,"avgDeal":2000000,"conversion":0.2,"refPerWeek":1.0,"refIn":0,"refOut":6},{"seq":8,"firstName":"Theerawut","lastName":"Piyaphinthu","nick":"เบส","profession":"จำหน่ายหมูสด","tl":"R","given":100829,"bniGoal":5000000,"recv":334918,"goalPct":6.7,"avgDeal":256000,"conversion":0.3,"refPerWeek":1.3,"refIn":9,"refOut":18},{"seq":9,"firstName":"Thitima","lastName":"Hemarak","nick":"ปุ๊ก","profession":"โรงงานแปรรูปสัตว์น้ำจืด ปลานิลและปลาดุก","tl":"G","given":29978284,"bniGoal":12000000,"recv":1949341,"goalPct":16.2,"avgDeal":630000,"conversion":0.5,"refPerWeek":0.76,"refIn":0,"refOut":8}],"teamGoal":45270000,"teamRecv":27590452,"teamPct":60.9,"memberCount":9},{"team":"Company&Government","members":[{"seq":1,"firstName":"Adisak","lastName":"Pankhot","nick":"ออฟ","profession":"รับสร้างบ้าน","tl":"Y","given":524056,"bniGoal":10000000,"recv":177050,"goalPct":1.8,"avgDeal":5000000,"conversion":0.5,"refPerWeek":0.08,"refIn":0,"refOut":2},{"seq":2,"firstName":"Chiranan","lastName":"Sathitsamphan","nick":"โอ","profession":"โรงแรมห้องพักราคาไม่เกิน 500","tl":"G","given":117613,"bniGoal":500000,"recv":1604,"goalPct":0.3,"avgDeal":10000,"conversion":0.8,"refPerWeek":1.25,"refIn":1,"refOut":11},{"seq":3,"firstName":"Gomen","lastName":"Khotsopa","nick":"แมน","profession":"เช่ารถ รถตู้พร้อมคนขับ รถสไลด์","tl":"R","given":209047,"bniGoal":480000,"recv":171510,"goalPct":35.7,"avgDeal":20000,"conversion":0.8,"refPerWeek":0.6,"refIn":1,"refOut":35},{"seq":4,"firstName":"Kittathat","lastName":"Jaruchaikul","nick":"วินโด้","profession":"ปรึกษา และ จำหน่าย อุปกรณ์ คอมพิวเตอร์ IT","tl":"Y","given":329246,"bniGoal":5000000,"recv":2700,"goalPct":0.1,"avgDeal":500000,"conversion":0.5,"refPerWeek":0.4,"refIn":9,"refOut":7},{"seq":5,"firstName":"Nipawee","lastName":"Supachaisakron","nick":"แพรว","profession":"โรงแรม","tl":"G","given":221233,"bniGoal":1152010,"recv":589394,"goalPct":51.2,"avgDeal":25000,"conversion":0.8,"refPerWeek":1.15,"refIn":23,"refOut":34},{"seq":6,"firstName":"Palat","lastName":"Thanasrivanichai","nick":"เลียว","profession":"ร้านขายสีทุกประเภท","tl":"G","given":648377,"bniGoal":10000000,"recv":345345,"goalPct":3.5,"avgDeal":500000,"conversion":0.5,"refPerWeek":0.8,"refIn":25,"refOut":20},{"seq":7,"firstName":"Phasuthon","lastName":"Taesuwan","nick":"อะตอม","profession":"ร้านก๋วยเตี๋ยว","tl":"","given":10808,"bniGoal":2000000,"recv":1795,"goalPct":0.1,"avgDeal":30000,"conversion":1.0,"refPerWeek":1.33,"refIn":3,"refOut":4},{"seq":8,"firstName":"Pongpat","lastName":"Chanthai","nick":"เขียว","profession":"รับทำเว็ปไซต์","tl":"G","given":243831,"bniGoal":150000,"recv":194310,"goalPct":129.5,"avgDeal":40000,"conversion":0.5,"refPerWeek":0.15,"refIn":5,"refOut":8},{"seq":9,"firstName":"Rewat","lastName":"Sanpet","nick":"แอม","profession":"บริการทำความสะอาด","tl":"Y","given":139408,"bniGoal":450000,"recv":170790,"goalPct":38.0,"avgDeal":10000,"conversion":0.8,"refPerWeek":1.12,"refIn":2,"refOut":15},{"seq":10,"firstName":"Samrit","lastName":"Pholjan","nick":"ดราฟ","profession":"ร้านตัดสูท","tl":"Y","given":105124,"bniGoal":900000,"recv":97300,"goalPct":10.8,"avgDeal":50000,"conversion":0.8,"refPerWeek":0.45,"refIn":10,"refOut":13},{"seq":11,"firstName":"Sophon","lastName":"Saenubol","nick":"พอล","profession":"นักพัฒนาอสังหาฯ","tl":"","given":53875,"bniGoal":500000,"recv":0,"goalPct":0.0,"avgDeal":200000,"conversion":0.8,"refPerWeek":0.06,"refIn":0,"refOut":1},{"seq":12,"firstName":"Thanyalak","lastName":"Samreeloy","nick":"ธัญญา","profession":"เต็นท์รถยนต์มือ 2","tl":"Y","given":242319,"bniGoal":0,"recv":146513,"goalPct":0,"avgDeal":0,"conversion":0.0,"refPerWeek":0.0,"refIn":1,"refOut":7},{"seq":13,"firstName":"Yosita","lastName":"Niyomrat","nick":"ยา","profession":"ขาย-ซ่อม โทรศัพท์มือถือ","tl":"Y","given":354187,"bniGoal":1200000,"recv":288241,"goalPct":24.0,"avgDeal":10000,"conversion":0.7,"refPerWeek":3.43,"refIn":4,"refOut":20}],"teamGoal":32332010,"teamRecv":2186552,"teamPct":6.8,"memberCount":13},{"team":"Privilege","members":[{"seq":1,"firstName":"Chananan","lastName":"Saengplao","nick":"แหม่ม","profession":"ประกันชีวิต","tl":"Y","given":96472,"bniGoal":2000000,"recv":863005,"goalPct":43.2,"avgDeal":116000,"conversion":0.9,"refPerWeek":0.38,"refIn":2,"refOut":10},{"seq":2,"firstName":"Phanupan","lastName":"Somsanook","nick":"โก้","profession":"Balloon decorate & Gift","tl":"Y","given":24600,"bniGoal":1400000,"recv":53790,"goalPct":3.8,"avgDeal":10000,"conversion":0.5,"refPerWeek":5.6,"refIn":4,"refOut":6},{"seq":3,"firstName":"Orapan","lastName":"Pougpralub","nick":"หมอตู่","profession":"คลินิกทันตกรรม","tl":"Y","given":206889,"bniGoal":2000000,"recv":183827,"goalPct":9.2,"avgDeal":100000,"conversion":0.7,"refPerWeek":0.57,"refIn":7,"refOut":29},{"seq":4,"firstName":"Ophat","lastName":"Taerattanachai","nick":"เปเล่","profession":"ร้านเพชรทอง","tl":"G","given":294357,"bniGoal":2000000,"recv":1720210,"goalPct":86.0,"avgDeal":100000,"conversion":0.7,"refPerWeek":0.57,"refIn":16,"refOut":14},{"seq":5,"firstName":"Phanuwat","lastName":"Promwong","nick":"ยศ","profession":"รับเหมาก่อสร้าง (มูลค่ามากกว่า 10 ล้านบาท)","tl":"G","given":1027148,"bniGoal":5000000,"recv":1909000,"goalPct":38.2,"avgDeal":5000000,"conversion":0.1,"refPerWeek":0.2,"refIn":0,"refOut":7},{"seq":6,"firstName":"Suporn","lastName":"Wongchompoo","nick":"พร","profession":"ผลไม้พร้อมทาน","tl":"G","given":258973,"bniGoal":600000,"recv":77432,"goalPct":12.9,"avgDeal":3000,"conversion":0.7,"refPerWeek":5.71,"refIn":24,"refOut":15}],"teamGoal":13000000,"teamRecv":4807264,"teamPct":37.0,"memberCount":6},{"team":"Showroom","members":[{"seq":1,"firstName":"Pemika","lastName":"Siriyotha","nick":"มิ้น","profession":"ACCOUNTANT","tl":"Y","given":128920,"bniGoal":500000,"recv":139890,"goalPct":28.0,"avgDeal":50000,"conversion":0.5,"refPerWeek":0.4,"refIn":4,"refOut":6},{"seq":2,"firstName":"Tanyaluck","lastName":"Treepornwasu","nick":"จ๊อบ","profession":"ประกันวินาศภัย","tl":"Y","given":76400,"bniGoal":3000000,"recv":109511,"goalPct":3.7,"avgDeal":200000,"conversion":0.4,"refPerWeek":0.75,"refIn":4,"refOut":7},{"seq":3,"firstName":"Wasawat","lastName":"Rattanakornpipat","nick":"ฤทธิ์","profession":"ประกันภัยรถยนต์","tl":"R","given":98682,"bniGoal":500000,"recv":183257,"goalPct":36.7,"avgDeal":549154,"conversion":0.5,"refPerWeek":0.04,"refIn":11,"refOut":19}],"teamGoal":4000000,"teamRecv":432658,"teamPct":10.8,"memberCount":3},{"team":"Event","members":[{"seq":1,"firstName":"Phannakorn","lastName":"Kittikool","nick":"ปิุ๊ก","profession":"Event Planner","tl":"R","given":93470,"bniGoal":1000000,"recv":205900,"goalPct":20.6,"avgDeal":100000,"conversion":0.35,"refPerWeek":0.57,"refIn":0,"refOut":15},{"seq":2,"firstName":"Thanakrit","lastName":"Wathport","nick":"บาย","profession":"ให้บริการ ระบบแสงสีเสียง และ จอLED","tl":"R","given":248672,"bniGoal":5000000,"recv":1350763,"goalPct":27.0,"avgDeal":120000,"conversion":0.9,"refPerWeek":0.93,"refIn":2,"refOut":10},{"seq":3,"firstName":"Wisnugorn","lastName":"Udornwong","nick":"แต้ม","profession":"รับผลิตสื่อ ภาพนิ่ง และ Vdo","tl":"Y","given":358455,"bniGoal":1000000,"recv":159655,"goalPct":16.0,"avgDeal":25000,"conversion":0.7,"refPerWeek":1.14,"refIn":0,"refOut":6},{"seq":4,"firstName":"Narin","lastName":"Lourujirakul","nick":"โต้ง","profession":"โรงก๊าซ","tl":"Y","given":126633,"bniGoal":2000000,"recv":168674,"goalPct":8.4,"avgDeal":0,"conversion":0.0,"refPerWeek":0.0,"refIn":16,"refOut":15},{"seq":5,"firstName":"Duangkamon","lastName":"Chanthaboon","nick":"เฟิร์น","profession":"ผับหมอลำ+เพื่อชีวิต","tl":"G","given":503345,"bniGoal":700000,"recv":17720,"goalPct":2.5,"avgDeal":0,"conversion":0.0,"refPerWeek":0.0,"refIn":6,"refOut":8},{"seq":6,"firstName":"Kanoknat","lastName":"Nakkhonthai","nick":"แนน","profession":"ประกันยูนิตลิงค์","tl":"G","given":1367146,"bniGoal":2000000,"recv":193576,"goalPct":9.7,"avgDeal":0,"conversion":0.0,"refPerWeek":0.0,"refIn":1,"refOut":2},{"seq":7,"firstName":"Itthipol","lastName":"Rattanapirote","nick":"ฟิว","profession":"เสื้อกีฬา","tl":"Y","given":187046,"bniGoal":1000000,"recv":159800,"goalPct":16.0,"avgDeal":0,"conversion":0.0,"refPerWeek":0.0,"refIn":8,"refOut":14},{"seq":8,"firstName":"Weerawat","lastName":"Suepadkon","nick":"หนุ่ม","profession":"แอร์","tl":"Y","given":99931,"bniGoal":1500000,"recv":158743,"goalPct":10.6,"avgDeal":0,"conversion":0.0,"refPerWeek":0.0,"refIn":14,"refOut":25},{"seq":9,"firstName":"Ekawat","lastName":"Suwannahong","nick":"ต้น","profession":"แอร์ชีลเลอร์","tl":"R","given":54850,"bniGoal":1500000,"recv":587900,"goalPct":39.2,"avgDeal":300000,"conversion":0.2,"refPerWeek":0.5,"refIn":2,"refOut":7},{"seq":10,"firstName":"Jetsada","lastName":"Sanudomchok","nick":"เจษ","profession":"สื่อโฆษณา","tl":"Y","given":124954,"bniGoal":200000,"recv":0,"goalPct":0.0,"avgDeal":0,"conversion":0.0,"refPerWeek":0.0,"refIn":1,"refOut":1},{"seq":11,"firstName":"Preyawal","lastName":"Vatcharachaithanin","nick":"เตย","profession":"ร้านอาหารไฟน์ไดนิ่ง","tl":"Y","given":59626,"bniGoal":0,"recv":32939,"goalPct":0,"avgDeal":0,"conversion":0.0,"refPerWeek":0.0,"refIn":5,"refOut":8},{"seq":12,"firstName":"Nilin","lastName":"Waroha","nick":"ควีน","profession":"ขนมเปี๊ย","tl":"Y","given":266660,"bniGoal":300000,"recv":62626,"goalPct":20.9,"avgDeal":0,"conversion":0.0,"refPerWeek":0.0,"refIn":9,"refOut":18},{"seq":13,"firstName":"Pisit","lastName":"Akarapanichayakul","nick":"กร","profession":"หมู่บ้านจัดสรรค์","tl":"G","given":115728,"bniGoal":5000000,"recv":0,"goalPct":0.0,"avgDeal":0,"conversion":0.0,"refPerWeek":0.0,"refIn":0,"refOut":4},{"seq":14,"firstName":"Katanchalee","lastName":"Sithiprom","nick":"ตุ้ย","profession":"นายหน้าอสังหา","tl":"","given":13777,"bniGoal":1000000,"recv":0,"goalPct":0.0,"avgDeal":0,"conversion":0.0,"refPerWeek":0.0,"refIn":0,"refOut":1},{"seq":15,"firstName":"Krisada","lastName":"Kotama","nick":"ต้า","profession":"","tl":"Y","given":6900,"bniGoal":0,"recv":0,"goalPct":0,"avgDeal":0,"conversion":0.0,"refPerWeek":0.0,"refIn":2,"refOut":9},{"seq":16,"firstName":"Nattawut","lastName":"Amsri","nick":"ปลาย","profession":"","tl":"R","given":17406,"bniGoal":1500000,"recv":32500,"goalPct":2.2,"avgDeal":1500000,"conversion":0.5,"refPerWeek":0.04,"refIn":0,"refOut":3},{"seq":17,"firstName":"Sirimon","lastName":"Sanoi","nick":"มาย","profession":"","tl":"G","given":23321,"bniGoal":0,"recv":79349,"goalPct":0,"avgDeal":0,"conversion":0.0,"refPerWeek":0.0,"refIn":12,"refOut":9},{"seq":18,"firstName":"Atthachai","lastName":"Somboon","nick":"อั้น","profession":"","tl":"Y","given":34291,"bniGoal":0,"recv":0,"goalPct":0,"avgDeal":0,"conversion":0.0,"refPerWeek":0.0,"refIn":0,"refOut":1},{"seq":19,"firstName":"Ittipon","lastName":"Setthawattananon","nick":"โม","profession":"","tl":"R","given":48940,"bniGoal":0,"recv":12990,"goalPct":0,"avgDeal":0,"conversion":0.0,"refPerWeek":0.0,"refIn":0,"refOut":6}],"teamGoal":23700000,"teamRecv":6525205,"teamPct":27.5,"memberCount":19}];
    }

    // ── Apply all PT overrides from SETTINGS ──
    var ptStatus = {}, ptTeam = {}, ptRecv = {}, ptGoal = {};
    var settingsSh = ss.getSheetByName('⚙️ SETTINGS');
    if (settingsSh) {
      var sData = settingsSh.getDataRange().getValues();
      for (var si = 0; si < sData.length; si++) {
        var sKey = String(sData[si][0]).trim();
        var sVal = String(sData[si][1] || '');
        try {
          if (sKey === 'PT_STATUS') { var ptSArr = JSON.parse(sVal); if (Array.isArray(ptSArr)) ptSArr.forEach(function(n){if(n)ptStatus[n]=true;}); }
          else if (sKey === 'PT_TEAM') { var ptTO = JSON.parse(sVal); if (ptTO && typeof ptTO==='object') ptTeam = ptTO; }
          else if (sKey === 'PT_RECV') { var ptRO = JSON.parse(sVal); if (ptRO && typeof ptRO==='object') ptRecv = ptRO; }
          else if (sKey === 'PT_GOAL') { var ptGO = JSON.parse(sVal); if (ptGO && typeof ptGO==='object') ptGoal = ptGO; }
        } catch(e) {}
      }
    }

    // Apply recv/goal overrides and collect member pool for re-bucketing
    var teamNames = teams.map(function(t){ return t.team; });
    var memberPool = [];
    teams.forEach(function(t) {
      t.members.forEach(function(m) {
        var nick = m.nick || '';
        if (ptRecv[nick] != null) m.recv = ptRecv[nick];
        if (ptGoal[nick] != null) m.bniGoal = ptGoal[nick];
        m.goalPct = m.bniGoal > 0 ? Math.round(m.recv / m.bniGoal * 1000) / 10 : 0;
        memberPool.push({ member: m, origTeam: t.team });
      });
    });

    // Re-bucket by team override
    var newTeamMap = {};
    teamNames.forEach(function(name){ newTeamMap[name] = []; });
    memberPool.forEach(function(item) {
      var nick = item.member.nick || '';
      var dest = (ptTeam[nick] && newTeamMap.hasOwnProperty(ptTeam[nick])) ? ptTeam[nick] : item.origTeam;
      newTeamMap[dest].push(item.member);
    });

    // Rebuild teams with recalculated totals
    teams = teamNames.map(function(name) {
      var members = newTeamMap[name];
      var tGoal = members.reduce(function(s,m){ return s + m.bniGoal; }, 0);
      var tRecv = members.reduce(function(s,m){ return s + m.recv; }, 0);
      return { team: name, members: members, memberCount: members.length,
        teamGoal: tGoal, teamRecv: tRecv,
        teamPct: tGoal > 0 ? Math.round(tRecv / tGoal * 1000) / 10 : 0 };
    });

    // Tag active/departed
    teams.forEach(function(t) {
      var activeCount = 0, departedCount = 0;
      t.members.forEach(function(m) {
        var nick = m.nick || '';
        m.active = !(nick && nick !== 'nan' && ptStatus[nick]);
        if (m.active) activeCount++; else departedCount++;
      });
      t.activeCount   = activeCount;
      t.departedCount = departedCount;
    });

    var totalGoal = 0, totalRecv = 0, memberCount = 0, activeTotal = 0, departedTotal = 0;
    teams.forEach(function(t) {
      totalGoal     += t.teamGoal;
      totalRecv     += t.teamRecv;
      memberCount   += t.memberCount;
      activeTotal   += t.activeCount;
      departedTotal += t.departedCount;
    });

    return {
      ok: true,
      teams: teams,
      summary: {
        totalGoal:     totalGoal,
        totalRecv:     totalRecv,
        overallPct:    totalGoal > 0 ? Math.round(totalRecv / totalGoal * 1000) / 10 : 0,
        memberCount:   memberCount,
        activeTotal:   activeTotal,
        departedTotal: departedTotal
      }
    };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Helper: get or create SETTINGS sheet ──────────────────────
function _getOrCreateSettings(ss) {
  var sh = ss.getSheetByName('⚙️ SETTINGS');
  if (!sh) {
    sh = ss.insertSheet('⚙️ SETTINGS');
    sh.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
  }
  return sh;
}

// ── Set PT Member Status (growth only) ────────────────────────
function apiSetPTMemberStatus(p) {
  try {
    if (p.role !== 'growth' && p.role !== 'mc') return { ok: false, error: 'Permission denied' };
    var nick = String(p.nick || '').trim();
    var status = String(p.status || '').trim();
    if (!nick || nick === 'nan') return { ok: false, error: 'Invalid nick' };
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var settingsSh = _getOrCreateSettings(ss);
    var departedArr = [];
    var rowIdx = -1;
    var data = settingsSh.getDataRange().getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === 'PT_STATUS') {
        try { departedArr = JSON.parse(String(data[i][1])) || []; } catch(e) { departedArr = []; }
        rowIdx = i + 1;
        break;
      }
    }
    var idx = departedArr.indexOf(nick);
    if (status === 'departed' && idx === -1) departedArr.push(nick);
    else if (status === 'active' && idx !== -1) departedArr.splice(idx, 1);
    var jsonVal = JSON.stringify(departedArr);
    if (rowIdx === -1) settingsSh.appendRow(['PT_STATUS', jsonVal]);
    else settingsSh.getRange(rowIdx, 2).setValue(jsonVal);
    return { ok: true, departedNicks: departedArr };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Update PT Member Goal/Recv (growth only) ───────────────────
function apiUpdatePTMember(p) {
  try {
    if (p.role !== 'growth' && p.role !== 'mc') return { ok: false, error: 'Permission denied' };
    var nick = String(p.nick || '').trim();
    if (!nick || nick === 'nan') return { ok: false, error: 'Invalid nick' };
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    // Try ⚡ POWER TEAMS sheet first
    var sh = ss.getSheetByName('⚡ POWER TEAMS');
    if (sh) {
      var shData = sh.getDataRange().getValues();
      for (var i = 1; i < shData.length; i++) {
        if (String(shData[i][3]||'').trim() === nick) {
          if (p.bniGoal != null) sh.getRange(i+1, 7).setValue(parseFloat(p.bniGoal)||0);
          if (p.recv != null)    sh.getRange(i+1, 8).setValue(parseFloat(p.recv)||0);
          return { ok: true };
        }
      }
    }
    // Fallback: store override in SETTINGS (works with static JSON too)
    var settingsSh = _getOrCreateSettings(ss);
    var keysToUpdate = [];
    if (p.recv != null)    keysToUpdate.push({ key: 'PT_RECV', val: parseFloat(p.recv)||0 });
    if (p.bniGoal != null) keysToUpdate.push({ key: 'PT_GOAL', val: parseFloat(p.bniGoal)||0 });
    keysToUpdate.forEach(function(kv) {
      var rows = settingsSh.getDataRange().getValues();
      var obj = {}, rowIdx = -1;
      for (var j = 0; j < rows.length; j++) {
        if (String(rows[j][0]).trim() === kv.key) {
          try { obj = JSON.parse(String(rows[j][1])) || {}; } catch(e2) { obj = {}; }
          rowIdx = j + 1;
          break;
        }
      }
      obj[nick] = kv.val;
      var jv = JSON.stringify(obj);
      if (rowIdx === -1) settingsSh.appendRow([kv.key, jv]);
      else settingsSh.getRange(rowIdx, 2).setValue(jv);
    });
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Move PT Member to another team (growth only) ───────────────
function apiMovePTMember(p) {
  try {
    if (p.role !== 'growth' && p.role !== 'mc') return { ok: false, error: 'Permission denied' };
    var nick = String(p.nick || '').trim();
    if (!nick || nick === 'nan') return { ok: false, error: 'Invalid nick' };
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var settingsSh = _getOrCreateSettings(ss);
    var ptTeam = {}, rowIdx = -1;
    var rows = settingsSh.getDataRange().getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === 'PT_TEAM') {
        try { ptTeam = JSON.parse(String(rows[i][1])) || {}; } catch(e2) { ptTeam = {}; }
        rowIdx = i + 1;
        break;
      }
    }
    var newTeam = String(p.newTeam || '').trim();
    if (newTeam) ptTeam[nick] = newTeam;
    else delete ptTeam[nick];
    var jv = JSON.stringify(ptTeam);
    if (rowIdx === -1) settingsSh.appendRow(['PT_TEAM', jv]);
    else settingsSh.getRange(rowIdx, 2).setValue(jv);
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

function apiMoveSynMember(p) {
  try {
    if (p.role !== 'growth' && p.role !== 'mc') return { ok: false, error: 'Permission denied' };
    // Prefer fullName as stable key; fall back to nick for backward compat
    var key = String(p.name || p.nick || '').trim();
    if (!key) return { ok: false, error: 'Invalid member identifier' };
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var settingsSh = _getOrCreateSettings(ss);
    var synTeam = {}, rowIdx = -1;
    var rows = settingsSh.getDataRange().getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === 'PT_SYN_TEAM') {
        try { synTeam = JSON.parse(String(rows[i][1])) || {}; } catch(e2) { synTeam = {}; }
        rowIdx = i + 1;
        break;
      }
    }
    var newTeamId = String(p.newTeamId || '').trim();
    if (newTeamId) synTeam[key] = newTeamId;
    else delete synTeam[key];
    var jv = JSON.stringify(synTeam);
    if (rowIdx === -1) settingsSh.appendRow(['PT_SYN_TEAM', jv]);
    else settingsSh.getRange(rowIdx, 2).setValue(jv);
    return { ok: true };
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

  var MONTH_LABEL = {2:'JAN',3:'FEB',4:'MAR',5:'APR',6:'MAY',7:'JUN',
                     8:'JUL',9:'AUG',10:'SEP',11:'OCT',12:'NOV',13:'DEC'};

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
        ceu: parseInt(r2y[5])||0, tyfcb: _parseR2YNum(r2y[6]),
        bniDays: parseInt(r2y[8])||0, attend: parseInt(r2y[9])||0,
        absent: absent, late: parseInt(r2y[11])||0, medical: parseInt(r2y[12])||0, sub: parseInt(r2y[13])||0
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
  if (p.role !== 'mc' && p.role !== 'growth') return { ok:false, error:'Permission denied' };
  if (!p.forceRefresh) {
    try { var c=CacheService.getScriptCache().get('risk_members'); if(c) return JSON.parse(c); } catch(e){}
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // R2Y official score map — ใช้เป็น score ล่าสุดเสมอ
  var r2yMap = {};
  var r2ySh = ss.getSheetByName('Reporting2You');
  if (r2ySh && r2ySh.getLastRow() > 1) {
    r2ySh.getRange(2, 1, r2ySh.getLastRow()-1, 8).getValues().forEach(function(r) {
      var rn = String(r[0]||'').replace(/\s*\(BNI Ideal\)/i,'').trim();
      var pts = parseInt(r[7])||0;
      if (rn && pts > 0) r2yMap[rn] = pts;
    });
  }

  var teams = Object.values(MENTOR_ROLE);
  var risks = [];

  teams.forEach(function(teamName) {
    var sh = ss.getSheetByName(teamName);
    if (!sh) return;
    var lastR = sh.getLastRow();
    if (lastR < 4) return;
    var data = sh.getRange(4, 3, lastR - 4 + 1, 15).getValues();

    data.forEach(function(row) {
      var name = String(row[0]||'').trim();
      if (!name) return;
      var nick = String(row[1]||'').trim();

      // Collect historical scores from Mentor Sheet (idx 2-13 = cols E-P)
      var scores = [];
      for (var i = 2; i <= 13; i++) {
        var sv = parseFloat(row[i]);
        if (!isNaN(sv) && sv > 0) scores.push(sv);
      }
      if (scores.length < 2) return;

      // ยึด R2Y เป็น score ล่าสุดเสมอ (แทนที่ค่าสุดท้ายใน Mentor Sheet)
      var r2yScore = r2yMap[name] || 0;
      if (r2yScore > 0) {
        scores[scores.length - 1] = r2yScore;
      }
      if (scores.length < 3) return;

      // Count consecutive decline streak from the END
      var streak = 0;
      for (var k = scores.length - 1; k > 0; k--) {
        if (scores[k] < scores[k - 1]) { streak++; } else { break; }
      }
      if (streak < 2) return;

      var latest  = scores[scores.length - 1];
      var peak    = scores[scores.length - 1 - streak];
      var decline = Math.round(peak - latest);
      var tl = latest >= 70 ? 'green' : latest >= 50 ? 'yellow' : latest >= 30 ? 'red' : 'black';

      risks.push({
        name: name, nick: nick, team: teamName,
        score: latest, tl: tl,
        streak: streak + 1,
        decline: decline,
        recentScores: scores.slice(-5)
      });
    });
  });

  // Longest streak first → then lowest score
  risks.sort(function(a,b) {
    if (b.streak !== a.streak) return b.streak - a.streak;
    return a.score - b.score;
  });

  var rResult = { ok:true, risks:risks };
  try { CacheService.getScriptCache().put('risk_members', JSON.stringify(rResult), 300); } catch(e){}
  return rResult;
}

// ── Chapter Pulse (Growth Coordinator) ───────────────────────────
function apiGetChapterPulse(p) {
  if (p.role !== 'growth' && p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var ss       = SpreadsheetApp.getActiveSpreadsheet();
  var masterSh = ss.getSheetByName('รายชื่อทั้งหมด');
  if (!masterSh) return { ok:false, error:'ไม่พบ sheet รายชื่อทั้งหมด' };

  // Build R2Y map for official score lookup
  var r2yMap = {};
  var r2ySh2 = ss.getSheetByName('Reporting2You');
  if (r2ySh2 && r2ySh2.getLastRow() > 1) {
    r2ySh2.getRange(2, 1, r2ySh2.getLastRow()-1, 8).getValues().forEach(function(row) {
      var rn = String(row[0]||'').replace(/\s*\(BNI Ideal\)\s*/gi,'').trim();
      if (rn) r2yMap[rn] = parseInt(row[7])||0; // row[7] = Points
    });
  }

  var archivedNames = _getArchivedNames(ss);
  var mData   = masterSh.getDataRange().getValues();
  var tlCount = { green:0, yellow:0, red:0, black:0, none:0 };
  var totalScore = 0, memberCount = 0, totalGiven = 0, totalRecv = 0;
  var nickList = [];

  for (var i = 2; i < mData.length; i++) {
    var name  = String(mData[i][1]||'').trim();
    var nick  = String(mData[i][2]||'').trim();
    var given = parseFloat(mData[i][6])||0;
    var recv  = parseFloat(mData[i][7])||0;
    if (!name || archivedNames[name]) continue;
    // Master sheet col E (most recently synced) takes priority over R2Y
    var masterScore = parseFloat(mData[i][4])||0;
    var offPts = r2yMap[name] || 0;
    var score  = masterScore > 0 ? masterScore : offPts;
    if (score === 0) continue;
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
  var TEAMS = MENTOR_TEAMS;
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

  // R2Y official scores
  var lbR2y = {};
  var lbR2ySh = ss.getSheetByName('Reporting2You');
  if (lbR2ySh && lbR2ySh.getLastRow() > 1) {
    lbR2ySh.getRange(2, 1, lbR2ySh.getLastRow()-1, 8).getValues().forEach(function(row) {
      var rn = String(row[0]||'').replace(/\s*\(BNI Ideal\)\s*/gi,'').trim();
      if (rn) lbR2y[rn] = parseInt(row[7])||0;
    });
  }

  var archivedNames = _getArchivedNames(ss);
  var mData   = masterSh.getDataRange().getValues();
  var members = [];
  for (var i = 2; i < mData.length; i++) {
    var name  = String(mData[i][1]||'').trim();
    var nick  = String(mData[i][2]||'').trim();
    var mentor= String(mData[i][3]||'').trim();
    var given = parseFloat(mData[i][6])||0;
    var recv  = parseFloat(mData[i][7])||0;
    if (!name || archivedNames[name]) continue;
    var masterScore4 = parseFloat(mData[i][4])||0;
    var offPts4 = lbR2y[name] || 0;
    var score   = masterScore4 > 0 ? masterScore4 : offPts4;
    var tl      = score > 0 ? _bniBuildTL(score) : 'none';
    members.push({ name:name, nick:nick, mentor:mentor, score:score, tl:tl, given:given, recv:recv });
  }
  return { ok:true, members:members };
}

// ── Visitor Tracker (Growth Coordinator) ─────────────────────────
function apiGetVisitorTracker(p) {
  if (p.role !== 'growth' && p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var masterSh = ss.getSheetByName('รายชื่อทั้งหมด');
  var r2ySh    = ss.getSheetByName('Reporting2You');
  if (!r2ySh) return { ok:false, error:'ไม่พบ sheet Reporting2You' };

  // Build master lookup: name → mentor
  var mentorMap = {};
  if (masterSh) {
    var mData2 = masterSh.getDataRange().getValues();
    for (var i = 2; i < mData2.length; i++) {
      var mn = String(mData2[i][1]||'').trim();
      if (mn) mentorMap[mn] = String(mData2[i][3]||'').trim();
    }
  }

  var archivedVis = _getArchivedNames(ss);
  var r2yData = r2ySh.getDataRange().getValues();

  var visitors = [];
  for (var j = 1; j < r2yData.length; j++) {
    var rname   = String(r2yData[j][0]||'').replace(/\s*\(BNI Ideal\)/i,'').trim();
    if (!rname || archivedVis[rname]) continue;
    var vCount  = parseInt(r2yData[j][3])||0;  // Visi. col
    var bniDays = parseInt(r2yData[j][8])||0;
    var offPts6 = parseInt(r2yData[j][7])||0;  // official score for TL
    var tl      = offPts6 > 0 ? _bniBuildTL(offPts6) : 'none';
    var weeks   = Math.max(1, Math.floor(bniDays / 7));
    var target  = Math.max(1, Math.round(weeks / 13));
    visitors.push({ name:rname, visitors:vCount, target:target, weeks:weeks,
                    tl:tl, mentor:mentorMap[rname]||'' });
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
  var TEAMS = MENTOR_TEAMS;

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
        if (absent > 4) alerts.push({ level:'warning', icon:'🚫', text:'ขาดประชุม ' + absent + ' ครั้ง' });
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
  try {
    var bMsg = '📢 MC Broadcast\n' + p.message.trim().substring(0, 300);
    MENTOR_TEAMS.forEach(function(m) {
      var mid = _getLineId(m); if (mid) _sendLineMsg(mid, bMsg);
    });
    var gid = _getLineId('growth'); if (gid) _sendLineMsg(gid, bMsg);
  } catch(le) { Logger.log('LINE broadcast err: '+le.message); }
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
  var TEAMS = MENTOR_TEAMS;
  var now   = new Date();
  var alerts = [];

  // Build R2Y score lookup for accurate MAX scoring
  var r2yMap = {};
  var r2ySh = ss.getSheetByName('Reporting2You');
  if (r2ySh && r2ySh.getLastRow() > 1) {
    r2ySh.getRange(2, 1, r2ySh.getLastRow()-1, 8).getValues().forEach(function(row) {
      var rn = String(row[0]||'').replace(/\s*\(BNI Ideal\)\s*/gi,'').trim();
      if (rn) r2yMap[rn] = parseInt(row[7])||0;
    });
  }

  TEAMS.forEach(function(team) {
    var sh = ss.getSheetByName(team);
    if (!sh) return;
    var data = sh.getRange(4, 3, 8, 27).getValues();
    data.forEach(function(row) {
      var name = String(row[0]||'').trim();
      if (!name) return;
      var nick = String(row[1]||'').trim();
      var sheetLatest = 0;
      for (var c = 2; c <= 13; c++) { var sv = parseFloat(row[c]); if (sv > 0) sheetLatest = sv; }
      var latest = Math.max(sheetLatest, r2yMap[name]||0);
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

// ── Alert dismiss — stored in ScriptProperties (persistent) ───
function _getNotifDismissed() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('notif_dismissed') || '{}';
    var map = JSON.parse(raw);
    var cutoff = Date.now() - 7*24*60*60*1000;
    Object.keys(map).forEach(function(k){ if (map[k] < cutoff) delete map[k]; });
    return map;
  } catch(e) { return {}; }
}
function apiDismissAlert(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  if (!p.key) return { ok:false, error:'No key' };
  var map = _getNotifDismissed();
  map[p.key] = Date.now();
  PropertiesService.getScriptProperties().setProperty('notif_dismissed', JSON.stringify(map));
  return { ok:true };
}
function apiGetDismissedAlerts(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  return { ok:true, dismissed:_getNotifDismissed() };
}

// ── Meeting Prep (MC) ──────────────────────────────────────────
function apiGetMeetingPrep(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var now = new Date();

  // Chapter stats — use official R2Y score
  var masterSh = ss.getSheetByName('รายชื่อทั้งหมด');
  var stats = { memberCount:0, avgScore:0, totalGiven:0, totalRecv:0, tlCount:{green:0,yellow:0,red:0,black:0,none:0} };
  var mpR2y = {};
  var mpR2ySh = ss.getSheetByName('Reporting2You');
  if (mpR2ySh && mpR2ySh.getLastRow() > 1) {
    mpR2ySh.getRange(2, 1, mpR2ySh.getLastRow()-1, 8).getValues().forEach(function(row) {
      var rn = String(row[0]||'').replace(/\s*\(BNI Ideal\)\s*/gi,'').trim();
      if (rn) mpR2y[rn] = parseInt(row[7])||0;
    });
  }
  var mpArchived = _getArchivedNames(ss);
  if (masterSh) {
    var mData = masterSh.getDataRange().getValues();
    var totS = 0;
    for (var i = 2; i < mData.length; i++) {
      var mname = String(mData[i][1]||'').trim();
      if (!mname || mpArchived[mname]) continue;
      var offPts5 = mpR2y[mname] || 0;
      var sc = offPts5 > 0 ? offPts5 : (parseFloat(mData[i][4])||0);
      var tl = sc > 0 ? _bniBuildTL(sc) : 'none';
      if (sc > 0) { stats.memberCount++; totS += sc; }
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
      var tyfcb  = _parseR2YNum(r2y[j][6]);
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

    var arcDir = _getArchivedNames(ss);
    data.forEach(function(row) {
      var name   = String(row[0]||'').trim(); // col B
      if (!name || name.length < 2) return;
      if (arcDir[name]) return;
      var nick   = String(row[1]||'').trim(); // col C
      var mentor = String(row[2]||'').trim(); // col D
      var score  = parseFloat(row[3]||0) || 0; // col E
      var tl = score >= 70 ? 'green' : score >= 50 ? 'yellow' : score >= 30 ? 'red' : score > 0 ? 'black' : 'none';
      var contact = contactMap[name.toLowerCase()] || {};
      members.push({
        name:   name,
        nick:   nick,
        mentor: mentor,
        email:  contact.email || '',
        phone:  contact.phone || '',
        score:  score,
        tl:     tl
      });
    });

    members.sort(function(a,b){ return a.name.localeCompare(b.name,'th'); });
    return { ok:true, members:members, total:members.length };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

// ── Simulate Data (public — no auth) ─────────────────────────
function apiGetSimulateData() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var listSh = ss.getSheetByName('รายชื่อทั้งหมด');
    var r2ySh  = ss.getSheetByName('Reporting2You');
    if (!listSh) return { ok:false, error:'ไม่พบ Sheet รายชื่อทั้งหมด' };

    // Build r2y lookup by name (normalised)
    var r2yMap = {};
    if (r2ySh && r2ySh.getLastRow() > 1) {
      var r2yData = r2ySh.getRange(2,1,r2ySh.getLastRow()-1,16).getValues();
      r2yData.forEach(function(row){
        var n = String(row[0]||'').trim().replace(/\s*\(BNI Ideal\)\s*$/i,'').trim();
        if (n) r2yMap[n] = row;
      });
    }

    var arcNames = _getArchivedNames(ss);
    var lastRow  = listSh.getLastRow();
    if (lastRow < 3) return { ok:true, members:[] };
    var listData = listSh.getRange(3,2,lastRow-2,4).getValues(); // B,C,D,E

    var members = [];
    listData.forEach(function(row) {
      var name = String(row[0]||'').trim();
      if (!name || name.length < 2 || arcNames[name]) return;
      var nick   = String(row[1]||'').trim();
      var mentor = String(row[2]||'').trim();
      var r2y    = r2yMap[name] || null;
      var absent = r2y ? parseInt(r2y[10])||0 : 0;
      var m = { name:name, nick:nick, mentor:mentor,
                bniTl:'none', bniScore:0, cats:null, actual:null, fastTrack:[] };
      if (r2y) {
        var actual = {
          rg:      parseInt(r2y[1])||0,  visitor: parseInt(r2y[3])||0,
          oToOne:  parseInt(r2y[4])||0,  ceu:     parseInt(r2y[5])||0,
          tyfcb:   _parseR2YNum(r2y[6]), bniDays: parseInt(r2y[8])||0,
          absent:  absent
        };
        if (actual.bniDays > 0) {
          try {
            var s = _bniBuildScore(actual);
            var officialPts2 = parseInt(r2y[7])||0;
            m.bniScore = officialPts2 > 0 ? officialPts2 : 0;
            m.bniTl    = officialPts2 > 0 ? _bniBuildTL(officialPts2) : 'none';
            m.cats     = { absent:s.absent, ref:s.ref, tyfcb:s.tyfcb,
                           visitor:s.visitor, one21:s.one21, training:s.training };
            m.actual   = actual;
            if (m.bniTl !== 'green') {
              var ft = _bniFastTrack(actual);
              m.fastTrack = ft ? (ft.fastestActions||[]).map(function(g){
                return { cat:g.cat, action:g.action, gain:g.gain,
                         curVal:g.curVal, tgtVal:g.tgtVal, icon:g.icon };
              }) : [];
            }
          } catch(e2) {}
        }
      }
      members.push(m);
    });

    // Sort: Blue → Red → Yellow → Green, then by score asc within zone
    var order = {blue:0,red:1,yellow:2,green:3,none:4};
    members.sort(function(a,b){
      var oz = (order[a.bniTl]||4)-(order[b.bniTl]||4);
      if (oz !== 0) return oz;
      return a.bniScore - b.bniScore;
    });

    return { ok:true, members:members };
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
    // Use official R2Y Points only — ignore historical mentor sheet score
    var r2yEarly = r2yMap[name] || null;
    var offPtsCG = r2yEarly ? (parseInt(r2yEarly[7])||0) : 0;
    latest = offPtsCG;  // official only, 0 if not uploaded
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
      var tyfcb   = _parseR2YNum(r2y[6]);
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

    var ftData = null;
    if (r2y) {
      try {
        ftData = _bniFastTrack({ bniDays:bniDays, absent:absent, rg:rg, tyfcb:tyfcb,
          visitor:vis, oToOne:oToOne, ceu:ceu });
      } catch(fe) {}
    }

    guides.push({
      name:   name,
      nick:   nick,
      tl:     tl,
      score:  latest,
      status: status,
      points: points,
      wins:   wins,
      fastTrack: ftData
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

// ── Get 1-2-1 Log Summary (chapter-wide, MC/Growth) ──────────
function apiGetAll121Logs(p) {
  try {
    if (p.role !== 'mc' && p.role !== 'growth') return { ok:false, error:'Permission denied' };
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('📝 1-2-1 LOGS');
    if (!sh || sh.getLastRow() < 2) return { ok:true, total:0, byTeam:{}, recent:[] };

    var data = sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
    var byTeam = {}, recent = [];
    data.forEach(function(row) {
      var teamName = String(row[1]||'').trim();
      var memberName = String(row[2]||'').trim();
      var note = String(row[3]||'').trim();
      var loggedAt = String(row[5]||'').trim();
      if (!memberName) return;
      if (!byTeam[teamName]) byTeam[teamName] = 0;
      byTeam[teamName]++;
      recent.push({ team:teamName, member:memberName, note:note.slice(0,60), loggedAt:loggedAt });
    });
    recent.sort(function(a,b){ return b.loggedAt < a.loggedAt ? -1 : 1; });
    return { ok:true, total:data.length, byTeam:byTeam, recent:recent.slice(0,8) };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

// ── Save Score (MC เท่านั้น — lookup by teamName+memberName) ──
function apiSaveScore(p) {
  if (p.role !== 'mc') return { ok:false, error:'เฉพาะ MC เท่านั้น' };
  var teamName   = String(p.teamName||'').trim();
  var memberName = String(p.memberName||'').trim();
  if (!teamName || !memberName) return { ok:false, error:'ต้องระบุ teamName และ memberName' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(teamName);
  if (!sh) return { ok:false, error:'ไม่พบ Sheet '+teamName };
  var score = parseFloat(p.score);
  if (isNaN(score) || score < 0 || score > 100) return { ok:false, error:'คะแนนต้องเป็น 0-100' };
  var month = parseInt(p.month);
  if (isNaN(month) || month < 0 || month > 11) return { ok:false, error:'Month ไม่ถูกต้อง (0-11)' };
  // Find row by scanning col C
  var lastRow = sh.getLastRow();
  var targetRow = -1;
  if (lastRow >= 4) {
    var names = sh.getRange(4, 3, lastRow-3, 1).getValues();
    for (var i=0; i<names.length; i++) {
      if (String(names[i][0]||'').trim() === memberName) { targetRow = i+4; break; }
    }
  }
  if (targetRow === -1) return { ok:false, error:'ไม่พบ "'+memberName+'" ใน '+teamName };
  var col = (month === 0) ? 16 : month + 4;
  sh.getRange(targetRow, col).setValue(score);
  // Sync saved score to master sheet immediately
  try {
    var masterSh = ss.getSheetByName('รายชื่อทั้งหมด');
    if (masterSh && masterSh.getLastRow() > 2) {
      var mData = masterSh.getRange(3, 2, masterSh.getLastRow()-2, 1).getValues();
      for (var mi=0; mi<mData.length; mi++) {
        if (String(mData[mi][0]||'').trim() === memberName) { masterSh.getRange(mi+3, 5).setValue(score); break; }
      }
    }
  } catch(se) { Logger.log('master sync err: '+se.message); }
  var monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return { ok:true, message:'บันทึกคะแนน '+score+' เดือน '+monthNames[month]+' แล้ว' };
}

// ── Save Member Status (Mentor แก้ไข Status ใน Mentor Sheet col R) ──
function apiSaveStatus(p) {
  var teamName = MENTOR_ROLE[p.role];
  if (!teamName) return { ok:false, error:'Permission denied' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(teamName);
  if (!sh) return { ok:false, error:'ไม่พบ Sheet '+teamName };
  var row = parseInt(p.row);
  if (isNaN(row) || row < 4) return { ok:false, error:'Row ไม่ถูกต้อง' };
  var existing = sh.getRange(row, 3).getDisplayValue().trim();
  if (existing !== String(p.memberName||'').trim()) return { ok:false, error:'ชื่อไม่ตรง' };
  sh.getRange(row, 18).setValue(String(p.status||'').trim()); // col R = 18
  return { ok:true };
}

// ── Ensure Slot (Promote ⭐ ใหม่ → ได้แถวใน Mentor Sheet) ─────
function apiEnsureSlot(p) {
  var teamName = MENTOR_ROLE[p.role];
  if (!teamName) return { ok:false, error:'Permission denied' };
  var memberName = String(p.memberName||'').trim();
  var nick = String(p.nick||'').trim();
  if (!memberName) return { ok:false, error:'ต้องระบุชื่อ' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(teamName);
  if (!sh) return { ok:false, error:'ไม่พบ Sheet '+teamName };
  var mLast = sh.getLastRow();
  if (mLast >= 4) {
    var existing = sh.getRange(4, 3, mLast - 3, 2).getValues();
    for (var i = 0; i < existing.length; i++) {
      if (String(existing[i][0]||'').trim() === memberName) {
        return { ok:true, row: i + 4, existed: true };
      }
    }
  }
  var slotRow = mLast + 1;
  for (var r = 4; r <= mLast; r++) {
    if (!sh.getRange(r, 3).getValue()) { slotRow = r; break; }
  }
  if (slotRow < 4) slotRow = 4;
  sh.getRange(slotRow, 3).setValue(memberName);
  sh.getRange(slotRow, 4).setValue(nick);
  return { ok:true, row: slotRow, existed: false };
}

// ── Batch Import (เพิ่มสมาชิกหลายคนพร้อมกัน) ─────────────────
function apiAddNewMembersBatch(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  if (!Array.isArray(p.members) || p.members.length === 0)
    return { ok:false, error:'ต้องส่ง members array' };
  var results = [];
  p.members.forEach(function(m) {
    try {
      var res = apiAddNewMember({
        role: 'mc', name: m.name, nick: m.nick,
        mentor: m.mentor, startDate: m.startDate, business: m.business||''
      });
      results.push({ name: m.name, ok: res.ok, error: res.error||'', warnings: res.warnings||[] });
    } catch(e) {
      results.push({ name: m.name, ok: false, error: e.message });
    }
  });
  var successCount = results.filter(function(r){ return r.ok; }).length;
  return { ok: successCount > 0, results: results, successCount: successCount, total: results.length };
}

// ── Chapter Trend (ประวัติ TL distribution รายเดือน) ──────────
function apiGetChapterTrend(p) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var TEAMS = MENTOR_TEAMS;
  // Cols E(5)..P(16) = 12 months: FEB..DEC + JAN(col16)
  var monthCols  = [5,6,7,8,9,10,11,12,13,14,15,16];
  var monthNames = ['FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC','JAN'];
  var trend = monthCols.map(function(col, idx) {
    return { month: monthNames[idx], col: col, green:0,yellow:0,red:0,black:0,none:0, total:0, sum:0 };
  });

  TEAMS.forEach(function(shName) {
    var sh = ss.getSheetByName(shName);
    if (!sh) return;
    var lastR = Math.max(sh.getLastRow(), 4);
    // Range: col C(3) to col P(16) = 14 cols
    var data = sh.getRange(4, 3, lastR - 3, 14).getValues();
    data.forEach(function(row) {
      if (!String(row[0]||'').trim()) return;
      monthCols.forEach(function(col, idx) {
        var s = parseFloat(row[col - 3]) || 0; // offset: col C = index 0
        var bucket = trend[idx];
        bucket.total++;
        if (s <= 0) { bucket.none++; return; }
        bucket.sum += s;
        if (s >= 70)      bucket.green++;
        else if (s >= 50) bucket.yellow++;
        else if (s >= 30) bucket.red++;
        else              bucket.black++;
      });
    });
  });

  trend.forEach(function(t) {
    var scored = t.green + t.yellow + t.red + t.black;
    t.avg = scored ? Math.round(t.sum / scored * 10) / 10 : 0;
  });
  return { ok:true, trend: trend };
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

// ── Archive Member (MC only) ──────────────────────────────────
// ── Remove New Member (ลบออกจาก NEW MEMBERS + รายชื่อ + Renewal) ──
function apiRemoveNewMember(p) {
  if (p.role !== 'mc' && p.role !== 'growth') return { ok:false, error:'Permission denied' };
  var rowNum = parseInt(p.rowNum)||0;
  var name   = String(p.memberName||'').trim();
  if (!rowNum || !name) return { ok:false, error:'ต้องระบุ rowNum และ memberName' };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var removed = [];

    // 1. ลบออกจาก NEW MEMBERS sheet
    var nmSh = ss.getSheetByName(NM_SHEET_NAME);
    if (nmSh && rowNum >= NM_DATA_ROW && rowNum <= nmSh.getLastRow()) {
      nmSh.deleteRow(rowNum);
      removed.push('🆕 NEW MEMBERS');
    }

    // 2. ลบออกจาก รายชื่อทั้งหมด (ถ้า p.alsoMaster = true)
    if (p.alsoMaster) {
      var masterSh = ss.getSheetByName('รายชื่อทั้งหมด');
      if (masterSh && masterSh.getLastRow() > 2) {
        var mData = masterSh.getRange(3, 2, masterSh.getLastRow()-2, 1).getValues();
        for (var i = mData.length-1; i >= 0; i--) {
          if (String(mData[i][0]||'').trim().toLowerCase() === name.toLowerCase()) {
            masterSh.deleteRow(i+3);
            removed.push('รายชื่อทั้งหมด');
            break;
          }
        }
      }
      // ลบออกจาก Renewal
      var rnSh = ss.getSheetByName('💳 RENEWAL');
      if (rnSh && rnSh.getLastRow() > 1) {
        var rnData = rnSh.getRange(2, 1, rnSh.getLastRow()-1, 1).getValues();
        for (var j = rnData.length-1; j >= 0; j--) {
          if (String(rnData[j][0]||'').trim().toLowerCase() === name.toLowerCase()) {
            rnSh.deleteRow(j+2); removed.push('💳 RENEWAL'); break;
          }
        }
      }
      // ลบออกจาก Mentor Sheet
      var validTeams = MENTOR_TEAMS;
      validTeams.forEach(function(tn) {
        var tSh = ss.getSheetByName(tn);
        if (!tSh || tSh.getLastRow() < 4) return;
        var tData = tSh.getRange(4, 3, tSh.getLastRow()-3, 1).getValues();
        for (var k = tData.length-1; k >= 0; k--) {
          if (String(tData[k][0]||'').trim().toLowerCase() === name.toLowerCase()) {
            tSh.getRange(k+4, 3).clearContent();
            tSh.getRange(k+4, 4).clearContent();
            removed.push(tn+' Sheet');
            break;
          }
        }
      });
    }

    return { ok:true, removed:removed, name:name };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

function apiArchiveMember(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var name = String(p.memberName||'').trim();
  if (!name) return { ok:false, error:'ต้องระบุชื่อ' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('📦 ARCHIVED');
  if (!sh) { sh = ss.insertSheet('📦 ARCHIVED'); sh.getRange(1,1,1,2).setValues([['Name','ArchivedAt']]); }
  if (sh.getLastRow() >= 2) {
    var ex = sh.getRange(2, 1, sh.getLastRow()-1, 1).getValues();
    for (var i=0; i<ex.length; i++) { if (String(ex[i][0]||'').trim()===name) return { ok:true, message:'Archive ไปแล้ว' }; }
  }
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  sh.appendRow([name, now]);
  return { ok:true, message:'Archive "'+name+'" แล้ว' };
}

// ── Unarchive Member (MC only) ────────────────────────────────
function apiUnarchiveMember(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var name = String(p.memberName||'').trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('📦 ARCHIVED');
  if (!sh || sh.getLastRow() < 2) return { ok:false, error:'ไม่พบ Archive' };
  var data = sh.getRange(2, 1, sh.getLastRow()-1, 1).getValues();
  for (var i=0; i<data.length; i++) {
    if (String(data[i][0]||'').trim()===name) { sh.deleteRow(i+2); return { ok:true }; }
  }
  return { ok:false, error:'ไม่พบ "'+name+'" ใน Archive' };
}

// ── Get Archived Members (MC only) ───────────────────────────
function apiGetArchivedMembers(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('📦 ARCHIVED');
  var members = [];
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow()-1, 2).getValues().forEach(function(r) {
      var n = String(r[0]||'').trim();
      if (n) members.push({ name:n, archivedAt:String(r[1]||'') });
    });
  }
  return { ok:true, members:members };
}

// ── Current Month Setting ─────────────────────────────────────
function apiGetCurrentMonth(p) {
  var v = _getSettingsValue('CURRENT_MONTH');
  var m = (v !== null) ? parseInt(v) : new Date().getMonth();
  return { ok:true, month: isNaN(m) ? new Date().getMonth() : m };
}
function apiSetCurrentMonth(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var m = parseInt(p.month);
  if (isNaN(m) || m < 0 || m > 11) return { ok:false, error:'Month ไม่ถูกต้อง (0-11)' };
  _setSettingsValue('CURRENT_MONTH', m);
  return { ok:true };
}

// ── Change PIN (MC only) ──────────────────────────────────────
function apiChangePIN(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var target = String(p.target||'').toLowerCase();
  var newPin  = String(p.newPin||'').trim();
  if (!PINS[target]) return { ok:false, error:'ไม่พบ role: '+target };
  if (!/^\d{4,8}$/.test(newPin)) return { ok:false, error:'PIN ต้องเป็นตัวเลข 4-8 หลัก' };
  _setSettingsValue('PIN_'+target.toUpperCase(), newPin);
  return { ok:true, message:'เปลี่ยน PIN ของ '+target+' แล้ว' };
}

// ── MC Coaching Overview (cross-team BNI + Fast Track) ───────
function apiGetMCCoaching(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var r2ySh    = ss.getSheetByName('Reporting2You');
  var masterSh = ss.getSheetByName('รายชื่อทั้งหมด');
  if (!r2ySh || !masterSh) return { ok:false, error:'ไม่พบ Sheet' };

  var r2yMap = {};
  var r2yData = r2ySh.getDataRange().getValues();
  for (var j=1; j<r2yData.length; j++) {
    var rn = String(r2yData[j][0]).replace(/\s*\(BNI Ideal\)/i,'').trim();
    if (rn) r2yMap[rn] = r2yData[j];
  }

  var archivedNames = _getArchivedNames(ss);
  var guides = [];
  var masterData = masterSh.getDataRange().getValues();

  for (var i=2; i<masterData.length; i++) {
    var mrow   = masterData[i];
    var name   = String(mrow[1]||'').trim();
    var nick   = String(mrow[2]||'').trim();
    var mentor = String(mrow[3]||'').trim();
    if (!name) continue;
    if (archivedNames[name]) continue;

    var r2y = r2yMap[name];
    if (!r2y) { guides.push({ name:name, nick:nick, mentor:mentor, noData:true }); continue; }

    var actual = {
      rg:      parseInt(r2y[1])||0,  visitor: parseInt(r2y[3])||0,
      oToOne:  parseInt(r2y[4])||0,  ceu:     parseInt(r2y[5])||0,
      tyfcb:   _parseR2YNum(r2y[6]), bniDays: parseInt(r2y[8])||0,
      absent:  parseInt(r2y[10])||0
    };
    if (actual.bniDays < 1) { guides.push({ name:name, nick:nick, mentor:mentor, noData:true }); continue; }

    var ft = _bniFastTrack(actual);
    var offPts = parseInt(r2y[7])||0;
    var bniScore = offPts > 0 ? offPts : 0;
    var bniTl    = offPts > 0 ? _bniBuildTL(offPts) : 'none';
    guides.push({ name:name, nick:nick, mentor:mentor, fastTrack:ft,
                  bniScore:bniScore, bniTl:bniTl, noData:false });
  }

  // Sort: worst BNI score first; no-data last
  guides.sort(function(a,b){
    if (a.noData && b.noData) return 0;
    if (a.noData) return 1;
    if (b.noData) return -1;
    return (a.bniScore||0) - (b.bniScore||0);
  });

  return { ok:true, guides:guides };
}

// ── Verify Scoring vs PALMS (MC only) ────────────────────────
// Reads every member from R2Y + master sheet, runs _bniBuildScore,
// compares result vs actual PALMS score stored in master col E.
function apiVerifyScoring(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var masterSh = ss.getSheetByName('รายชื่อทั้งหมด');
  var r2ySh    = ss.getSheetByName('Reporting2You');
  if (!masterSh || !r2ySh) return { ok:false, error:'ไม่พบ Sheet' };

  // Build R2Y map by name
  var r2yMap = {};
  var r2yData = r2ySh.getDataRange().getValues();
  for (var j=1; j<r2yData.length; j++) {
    var rn = String(r2yData[j][0]).replace(/\s*\(BNI Ideal\)/i,'').trim();
    if (rn) r2yMap[rn] = r2yData[j];
  }

  var rows = [];
  var masterData = masterSh.getDataRange().getValues();
  for (var i=2; i<masterData.length; i++) {
    var mrow = masterData[i];
    var name = String(mrow[1]||'').trim();
    if (!name) continue;
    var palmsScore = parseFloat(mrow[4])||0;
    if (!palmsScore) continue; // skip unscored members (not yet in PALMS)
    var palmsTl    = palmsScore >= 70 ? 'green' : palmsScore >= 50 ? 'yellow' : palmsScore >= 30 ? 'red' : 'black';

    var r2y = r2yMap[name];
    if (!r2y) {
      rows.push({ name:name, palmsScore:palmsScore, palmsTl:palmsTl,
        ourScore:null, ourTl:null, diff:null, match:false, noData:true,
        cats:{}, bniDays:0, weeks:0 });
      continue;
    }

    var actual = {
      rg:      parseInt(r2y[1])||0,
      visitor: parseInt(r2y[3])||0,
      oToOne:  parseInt(r2y[4])||0,
      ceu:     parseInt(r2y[5])||0,
      tyfcb:   _parseR2YNum(r2y[6]),
      bniDays: parseInt(r2y[8])||0,
      absent:  parseInt(r2y[10])||0
    };
    var s = _bniBuildScore(actual);
    var diff = s.total - palmsScore;
    rows.push({
      name:       name,
      palmsScore: palmsScore,
      palmsTl:    palmsTl,
      ourScore:   s.total,
      ourTl:      s.tl,
      diff:       diff,
      match:      s.tl === palmsTl,
      noData:     false,
      bniDays:    actual.bniDays,
      weeks:      _bniEffectiveWeeks(actual.bniDays),
      cats: {
        absent:   s.absent,
        ref:      s.ref,
        tyfcb:    s.tyfcb,
        visitor:  s.visitor,
        one21:    s.one21,
        training: s.training
      }
    });
  }

  // Sort by abs(diff) desc so biggest mismatches appear first
  rows.sort(function(a,b){
    var da = a.diff===null ? 0 : Math.abs(a.diff);
    var db = b.diff===null ? 0 : Math.abs(b.diff);
    return db - da;
  });

  var matched   = rows.filter(function(r){ return !r.noData && r.match; }).length;
  var mismatched= rows.filter(function(r){ return !r.noData && !r.match; }).length;
  var noData    = rows.filter(function(r){ return r.noData; }).length;

  return { ok:true, rows:rows, summary:{ matched:matched, mismatched:mismatched, noData:noData, total:rows.length } };
}

// ── Desktop Dashboard — one-call comprehensive API (any role) ──
function apiGetDesktopDashboard(p) {
  // Cache 5 นาที — ข้อมูลไม่ได้เปลี่ยนทุกวินาที
  var CACHE_TTL = 300;
  var cKey = 'desk_dash_v2';
  if (!p.forceRefresh) {
    try {
      var cached = CacheService.getScriptCache().get(cKey);
      if (cached) return JSON.parse(cached);
    } catch(ce) {}
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var r2ySh    = ss.getSheetByName('Reporting2You');
  var masterSh = ss.getSheetByName('รายชื่อทั้งหมด');
  var renewalSh= ss.getSheetByName('💳 RENEWAL');
  if (!masterSh || !r2ySh) return { ok:false, error:'ไม่พบ Sheet หลัก' };

  // R2Y lookup map
  var r2yMap = {};
  var r2yData = r2ySh.getDataRange().getValues();
  for (var j=1; j<r2yData.length; j++) {
    var rn = String(r2yData[j][0]).replace(/\s*\(BNI Ideal\)/i,'').trim();
    if (rn) r2yMap[rn] = r2yData[j];
  }

  // Score history — อ่านจาก UPDATE SCORES (Evolution CSV) เป็น primary source
  var histMap = {};
  var updateSh = ss.getSheetByName('📥 UPDATE SCORES');
  if (updateSh && updateSh.getLastRow() >= 8) {
    var uLastCol = updateSh.getLastColumn();
    var uHeaders = updateSh.getRange(7, 2, 1, uLastCol-1).getValues()[0];
    // หา index ของ column เดือน (รูปแบบ MM/YY เช่น 03/26)
    var monthIdxs = [];
    var monthPat = /^\d{2}\/\d{2}$/;
    uHeaders.forEach(function(h, i) {
      if (monthPat.test(String(h).trim())) monthIdxs.push(i);
    });
    if (monthIdxs.length > 0) {
      var uRows = updateSh.getRange(8, 2, updateSh.getLastRow()-7, uLastCol-1).getValues();
      uRows.forEach(function(row) {
        var raw = String(row[0]||'').trim()
          .replace(/Export as PDF.*/i,'').replace(/No data.*/i,'').trim();
        var m = raw.match(/^(.+?)\s*\(BNI Ideal\)/i);
        var name = m ? m[1].trim() : raw;
        if (name.length < 3 || name.length > 60) return;
        var hist = monthIdxs.map(function(i) { return parseFloat(row[i])||0; });
        // ตัด 0 ต้น แต่เก็บ 0 กลาง
        while (hist.length > 0 && hist[0] === 0) hist.shift();
        if (hist.length > 0) histMap[name] = hist;
      });
    }
  }
  // Fallback: Mentor Sheets สำหรับสมาชิกที่ไม่มีใน UPDATE SCORES
  var teamSheets = MENTOR_TEAMS;
  teamSheets.forEach(function(tn) {
    var sh = ss.getSheetByName(tn);
    if (!sh) return;
    var lastR = sh.getLastRow();
    if (lastR < 4) return;
    var d = sh.getRange(4, 3, lastR-4+1, 14).getValues();
    d.forEach(function(row) {
      var nm = String(row[0]||'').trim();
      if (!nm || histMap[nm]) return; // ข้ามถ้ามีใน UPDATE SCORES แล้ว
      var hist = [];
      for (var c=1; c<=12; c++) { hist.push(parseFloat(row[c])||0); }
      hist = hist.filter(function(v,i,a){ return i===0||v>0||a.slice(i).some(function(x){return x>0;}); });
      while (hist.length > 0 && hist[0] === 0) hist.shift();
      if (hist.length > 0) histMap[nm] = hist;
    });
  });

  var archivedNames = _getArchivedNames(ss);
  var members = [];
  var masterData = masterSh.getDataRange().getValues();
  var summary = { total:0, green:0, yellow:0, red:0, blue:0, noData:0 };

  for (var i=2; i<masterData.length; i++) {
    var mrow   = masterData[i];
    var name   = String(mrow[1]||'').trim();
    var nick   = String(mrow[2]||'').trim();
    var mentor = String(mrow[3]||'').trim();
    var palmsScore = parseFloat(mrow[4])||0;
    if (!name) continue;
    if (archivedNames[name]) continue;

    summary.total++;
    var r2y = r2yMap[name] || null;
    var absent = r2y ? parseInt(r2y[10])||0 : 0;

    var given  = parseFloat(mrow[6])||0;
    var recv   = parseFloat(mrow[7])||0;
    var ANNUAL_FEE = 28000;
    var roi = recv > 0 ? Math.round(recv / ANNUAL_FEE * 100) : 0;
    var _mHist = histMap[name]||[];
    var _mScoreAvg = _mHist.length ? Math.round(_mHist.reduce(function(a,b){return a+b;},0)/_mHist.length) : 0;
    var m = { name:name, nick:nick, mentor:mentor,
              palmsScore:palmsScore, absent:absent,
              given:given, recv:recv, roi:roi,
              phone: r2y ? String(r2y[15]||'').trim() : '',
              email: r2y ? String(r2y[14]||'').trim() : '',
              bniTl:'none', bniScore:0, cats:null,
              fastTrack:null, hist: _mHist, scoreAvg: _mScoreAvg };

    if (r2y) {
      var actual = {
        rg:      parseInt(r2y[1])||0,  rr:      parseInt(r2y[2])||0,
        visitor: parseInt(r2y[3])||0,  oToOne:  parseInt(r2y[4])||0,
        ceu:     parseInt(r2y[5])||0,  tyfcb:   _parseR2YNum(r2y[6]),
        bniDays: parseInt(r2y[8])||0,  attend:  parseInt(r2y[9])||0,
        absent:  absent,               late:    parseInt(r2y[11])||0,
        medical: parseInt(r2y[12])||0, sub:     parseInt(r2y[13])||0
      };
      if (actual.bniDays > 0) {
        try {
          var s = _bniBuildScore(actual);
          var officialPts = parseInt(r2y[7])||0;
          // Use the higher of R2Y official pts vs master sheet — avoids stale overrides
          var effPts = Math.max(officialPts||0, palmsScore||0);
          m.bniScore = effPts > 0 ? effPts : 0;
          m.bniTl    = effPts > 0 ? _bniBuildTL(effPts) : 'none';
          m.cats = { absent:s.absent, ref:s.ref, tyfcb:s.tyfcb,
                     visitor:s.visitor, one21:s.one21, training:s.training };
          m.actual = { rg:actual.rg, rr:actual.rr, visitor:actual.visitor,
                       oToOne:actual.oToOne, ceu:actual.ceu, tyfcb:actual.tyfcb,
                       bniDays:actual.bniDays, attend:actual.attend,
                       absent:actual.absent, late:actual.late, sub:actual.sub };
          var _ft=_bniFastTrack(actual);
          if (_ft) {
            m.fastTrack = (_ft.fastestActions||[]).map(function(g){return{cat:g.cat,action:g.action,gain:g.gain,curVal:g.curVal,tgtVal:g.tgtVal,icon:g.icon};});
            m.gaps      = (_ft.gaps||[]).map(function(g){return{cat:g.cat,icon:g.icon,cur:g.cur,max:g.max,gain:g.gain,action:g.action,curVal:g.curVal,tgtVal:g.tgtVal};});
            m.ftNeeded  = _ft.needed;
            m.ftNextTl  = _ft.nextTl;
          }
        } catch(e2) {}
      }
    }
    summary[m.bniTl === 'none' ? 'noData' : m.bniTl]++;
    members.push(m);
  }

  // ── Mentor Last Activity ───────────────────────────────────────
  var deskActMap = _buildMentorActivityMap(ss);
  members.forEach(function(m) {
    var act = deskActMap[m.name.toLowerCase()] || null;
    m.lastMentorContact = act ? act.lastDate : null;
    m.mentorContactDays = act ? act.daysSince : null;
    m.noMentorContact   = (m.mentorContactDays === null) || (m.mentorContactDays > 14);
  });

  // Renewal (batch read)
  var renewalItems = [];
  if (renewalSh) {
    var today = new Date(); today.setHours(0,0,0,0);
    var rnData = renewalSh.getDataRange().getValues();
    for (var ri=2; ri<rnData.length; ri++) {
      var rname = String(rnData[ri][0]||'').trim();
      var rteam = String(rnData[ri][1]||'').trim();
      var rdate = rnData[ri][2];
      if (!rname || !rdate || archivedNames[rname]) continue;
      var expDate;
      if (rdate instanceof Date) { expDate = new Date(rdate); }
      else if (typeof rdate === 'number' && rdate > 1000) { expDate = new Date(Math.round((rdate-25569)*86400000)); }
      else { expDate = new Date(rdate); }
      expDate.setHours(0,0,0,0);
      if (isNaN(expDate.getTime())) continue;
      var diff = Math.floor((expDate - today) / 86400000);
      if (diff <= 120) {
        renewalItems.push({ name:rname, team:rteam, diffDays:diff,
          status: diff<0?'late': diff<=30?'soon': diff<=90?'normal':'ok',
          expStr: Utilities.formatDate(expDate, Session.getScriptTimeZone(), 'dd/MM/yyyy') });
      }
    }
    renewalItems.sort(function(a,b){ return a.diffDays - b.diffDays; });
  }

  // Mentor aggregates
  var teamStats = {};
  members.forEach(function(m) {
    var t = m.mentor || 'ไม่มีทีม';
    if (!teamStats[t]) teamStats[t] = { team:t, count:0, bniScores:[], green:0, yellow:0, red:0, blue:0, noData:0, absentTotal:0, tyfcbTotal:0, givenTotal:0, recvTotal:0, nmCount:0 };
    teamStats[t].count++;
    teamStats[t].absentTotal += m.absent;
    teamStats[t].tyfcbTotal  += (m.actual&&m.actual.tyfcb)||0;
    teamStats[t].givenTotal  += m.given||0;
    teamStats[t].recvTotal   += m.recv||0;
    if (m.actual && m.actual.bniDays > 0 && m.actual.bniDays <= 84) teamStats[t].nmCount++;
    if (m.bniTl !== 'none') { teamStats[t].bniScores.push(m.bniScore); teamStats[t][m.bniTl]++; }
    else teamStats[t].noData++;
  });
  var teams = Object.keys(teamStats).map(function(t) {
    var ts = teamStats[t];
    var avg = ts.bniScores.length ? Math.round(ts.bniScores.reduce(function(a,b){return a+b;},0)/ts.bniScores.length) : 0;
    return { team:t, count:ts.count, avg:avg, green:ts.green, yellow:ts.yellow,
             red:ts.red, blue:ts.blue, noData:ts.noData, absentTotal:ts.absentTotal,
             tyfcbTotal:ts.tyfcbTotal, givenTotal:ts.givenTotal, recvTotal:ts.recvTotal,
             nmCount:ts.nmCount };
  }).filter(function(t){ return t.team !== 'ไม่มีทีม' && teamSheets.indexOf(t.team) !== -1; });
  teams.sort(function(a,b){ return b.avg - a.avg; });

  // รวม NM list ใน response เลย — ไม่ต้อง async call แยก
  var nmResult = apiGetNewMembers({ role: p.role || 'mc', pin: p.pin });
  var nmList = nmResult.ok ? nmResult.members : [];

  var result = { ok:true, members:members, renewal:renewalItems, summary:summary, teams:teams,
           health: _computeChapterHealth(ss, members, summary),
           nmList: nmList,
           updatedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
           fromCache: false };
  try {
    var json = JSON.stringify(result);
    if (json.length < 5000000) { // CacheService limit 6MB
      CacheService.getScriptCache().put('desk_dash_v2', json, 300);
    }
  } catch(ce) {}
  return result;
}

function _computeChapterHealth(ss, members, summary) {
  var arSh = ss.getSheetByName('📦 ARCHIVED');
  var archived12mo = 0, archived6mo = 0;
  var now = new Date();
  var cut12 = new Date(now.getFullYear()-1, now.getMonth(), now.getDate());
  var cut6  = new Date(now.getFullYear(), now.getMonth()-6, now.getDate());
  if (arSh && arSh.getLastRow() > 1) {
    arSh.getRange(2,1,arSh.getLastRow()-1,2).getValues().forEach(function(r) {
      if (!r[0]) return;
      var d = new Date(r[1]); if (isNaN(d)) return;
      if (d >= cut12) archived12mo++;
      if (d >= cut6)  archived6mo++;
    });
  }
  var totalBefore = summary.total + archived12mo;
  var retention   = totalBefore > 0 ? Math.round(summary.total / totalBefore * 100) : 100;
  var added6mo    = members.filter(function(m){ return m.actual&&m.actual.bniDays>0&&m.actual.bniDays<=180; }).length;
  var roiMems     = members.filter(function(m){ return m.roi > 0; });
  var avgROI      = roiMems.length ? Math.round(roiMems.reduce(function(s,m){return s+m.roi;},0)/roiMems.length) : 0;
  var scoredMems  = members.filter(function(m){ return m.bniScore > 0; });
  var avgBNI      = scoredMems.length ? Math.round(scoredMems.reduce(function(s,m){return s+m.bniScore;},0)/scoredMems.length) : 0;
  var greenPct    = summary.total > 0 ? Math.round(summary.green/summary.total*100) : 0;
  var visData     = _getVisitorConversionData(ss);
  return { retention:retention, added6mo:added6mo, left6mo:archived6mo, left12mo:archived12mo,
           avgROI:avgROI, avgBNI:avgBNI, greenPct:greenPct, visitors:visData,
           total:summary.total };
}

function _getVisitorConversionData(ss) {
  var sh = ss.getSheetByName('📋 VISITOR LOG');
  if (!sh || sh.getLastRow() < 2) return { total:0, joined:0, applied:0, convRate:0, visitedThisMonth:0 };
  var data = sh.getRange(2,1,sh.getLastRow()-1,5).getValues();
  var total=0, applied=0, joined=0, thisMonth=0;
  var now = new Date(); var ym = now.getFullYear()*100+now.getMonth();
  data.forEach(function(r) {
    if (!r[1]) return; total++;
    var st = String(r[4]||'').trim();
    if (st==='สมัครแล้ว'||st==='applied') applied++;
    if (st==='เป็นสมาชิก'||st==='joined') joined++;
    var d = new Date(r[0]); if (!isNaN(d)&&(d.getFullYear()*100+d.getMonth())===ym) thisMonth++;
  });
  return { total:total, applied:applied, joined:joined, convRate:total?Math.round(joined/total*100):0, visitedThisMonth:thisMonth };
}

var VIS_SHEET = '📋 VISITOR LOG';
var VIS_HDR   = ['วันที่','ชื่อ Visitor','อาชีพ','เชิญโดย','สถานะ','หมายเหตุ','บันทึกเมื่อ'];

function apiGetVisitorLog(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(VIS_SHEET);
  if (!sh || sh.getLastRow() < 2) return { ok:true, visitors:[] };
  var rows = sh.getRange(2,1,sh.getLastRow()-1,7).getValues();
  return { ok:true, visitors: rows.map(function(r,i){
    return { row:i+2, date:_safeDateStr(r[0]), name:String(r[1]||'').trim(),
             profession:String(r[2]||'').trim(), invitedBy:String(r[3]||'').trim(),
             status:String(r[4]||'').trim()||'เยี่ยมชม', notes:String(r[5]||'').trim() };
  }).filter(function(v){ return v.name; }) };
}

function apiAddVisitor(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  if (!p.name) return { ok:false, error:'ต้องระบุชื่อ' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(VIS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(VIS_SHEET);
    sh.getRange(1,1,1,VIS_HDR.length).setValues([VIS_HDR]).setBackground('#1E2A3A').setFontColor('#F0B429').setFontWeight('bold');
  }
  var now = Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'dd/MM/yyyy HH:mm');
  sh.appendRow([p.date||now.slice(0,10), p.name, p.profession||'', p.invitedBy||'', p.status||'เยี่ยมชม', p.notes||'', now]);
  return { ok:true };
}

function apiUpdateVisitor(p) {
  if (p.role !== 'mc') return { ok:false, error:'Permission denied' };
  var row = parseInt(p.row)||0;
  if (row < 2) return { ok:false, error:'Invalid row' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(VIS_SHEET);
  if (!sh) return { ok:false, error:'ไม่พบ Sheet' };
  if (p.field === 'delete') { sh.deleteRow(row); }
  else if (p.field === 'status') { sh.getRange(row,5).setValue(p.value||''); }
  else if (p.field === 'notes')  { sh.getRange(row,6).setValue(p.value||''); }
  return { ok:true };
}

function apiGetSeatMap(p) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ptSh = ss.getSheetByName('⚡ POWER TEAMS');
  var members = [];
  if (ptSh && ptSh.getLastRow() > 1) {
    ptSh.getRange(2,1,ptSh.getLastRow()-1,6).getValues().forEach(function(r) {
      var nick = String(r[3]||'').trim();
      if (nick) members.push({ nick:nick, profession:String(r[4]||'').trim(),
                               team:String(r[0]||'').trim(), tl:String(r[5]||'').trim() });
    });
  }
  return { ok:true, members:members };
}

// ── Growth Sheet Helpers ──────────────────────────────────────
function _safeNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  var s = String(v).trim();
  if (s.charAt(0) === '#') return 0;
  var n = parseFloat(s.replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}
function _safeDateStr(v) {
  if (!v) return '';
  if (v instanceof Date) {
    try { return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy'); } catch(e) { return ''; }
  }
  var s = String(v).trim();
  return s.charAt(0) === '#' ? '' : s;
}

// ── Growth Sheet: Read ────────────────────────────────────────
// ── Extract colMap from a header row ─────────────────────────
function _gshExtractColMap(hdrs, colMap) {
  hdrs.forEach(function(h, i) {
    var hl = h.toLowerCase().replace(/\s+/g,'');
    if (!hl) return;
    // Nick — must match before generic "ชื่อ"
    if (hl.indexOf('ชื่อเล่น') !== -1 || hl === 'nick' || hl === 'nickname')
      { if (colMap.nick === undefined) colMap.nick = i; return; }
    // Skip surname-only columns
    if (hl.indexOf('นามสกุล') !== -1) return;
    // Full name
    if ((hl.indexOf('ชื่อ') !== -1 || hl === 'name' || hl === 'fullname') && colMap.name === undefined)
      colMap.name = i;
    // Target — skip "เป้าหมายบริษัท" (col 9), use "เป้า BNI" (col 10)
    if (hl.indexOf('เป้า') !== -1 || hl.indexOf('target') !== -1 || hl.indexOf('goal') !== -1) {
      if (hl.indexOf('บริษัท') === -1 && colMap.target === undefined) colMap.target = i;
    }
    // Received — avoid overwriting target-like columns
    if (colMap.target !== i && (
        hl.indexOf('รับจริง') !== -1 || hl.indexOf('ได้รับ') !== -1 || hl.indexOf('received') !== -1 ||
        hl.indexOf('รับมา') !== -1 || hl.indexOf('ยอดรับ') !== -1 || hl.indexOf('สร้าง') !== -1 ||
        (hl === 'รับ') || (hl.indexOf('รับ') !== -1 && hl.indexOf('เป้า') === -1 && hl.length <= 8)))
      { if (colMap.received === undefined) colMap.received = i; }
    // Percent
    if (h === '%' || hl.indexOf('ร้อยละ') !== -1 || hl.indexOf('%') !== -1)
      { if (colMap.pct === undefined) colMap.pct = i; }
    // Age / days
    if (hl.indexOf('อายุ') !== -1 || (hl.indexOf('วัน') !== -1 && hl.length < 8))
      { if (colMap.age === undefined) colMap.age = i; }
    // Note
    if (hl.indexOf('หมาย') !== -1 || hl.indexOf('note') !== -1 || hl.indexOf('remark') !== -1 ||
        hl.indexOf('เพิ่มเติม') !== -1)
      { if (colMap.note === undefined) colMap.note = i; }
  });
}

function apiGetGrowthSheetData(p) {
  try {
    if (!p.role) return { ok:false, error:'ต้องล็อกอินก่อน' };
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Growth');
    if (!sh) return { ok:false, error:'ไม่พบ Sheet: Growth' };

    var lastRow = sh.getLastRow();
    var lastCol = Math.min(sh.getLastColumn(), 25);
    if (lastRow < 2) return { ok:true, headers:[], colMap:{}, groups:[], colSums:[], summary:{totalReceived:0,totalTarget:0,pct:0,memberCount:0,groupCount:0} };

    var raw = sh.getRange(1, 1, lastRow, lastCol).getValues();

    // ── Parser: look-ahead approach ───────────────────────────────────────
    // Structure: each group has two consecutive non-numeric rows:
    //   Row A: Power team name  (e.g. "1.Developer")
    //   Row B: Column headers   (e.g. "ชื่อ สกุล", "เป้า", "รับจริง", "%", ...)
    //   Row C+: Member data rows (col A = pure integer "1", "2", "3"...)
    //   (optional) Total row: blank col A + "รวม" anywhere in row
    // ─────────────────────────────────────────────────────────────────────
    var headers  = [];
    var colMap   = {};
    var groups   = [];
    var curGroup = null;
    var totMembers = 0;
    var colSums  = [];
    for (var ci0 = 0; ci0 < lastCol; ci0++) colSums.push(0);

    var i = 1; // skip row 0 (title row)
    while (i < raw.length) {
      var row  = raw[i];
      var colA = String(row[0]||'').trim();

      // Skip blank rows
      if (!row.some(function(c){ return c !== '' && c !== null; })) { i++; continue; }

      // ── Total row: blank col A + "รวม" anywhere ───────────────────────
      if (!colA && row.join('|').indexOf('รวม') !== -1) {
        if (curGroup) {
          var tCells = _cleanCells(row, ss);
          curGroup.totalRow = {
            sheetRow: i + 1,
            cells:    tCells,
            received: colMap.received !== undefined ? _safeNum(tCells[colMap.received]) : 0,
            target:   colMap.target   !== undefined ? _safeNum(tCells[colMap.target])   : 0
          };
          curGroup = null; // prevent chapter total row from being misassigned to next group
        }
        i++; continue;
      }

      // ── Non-numeric col A: ALWAYS a team/group name ─────────────────
      // (e.g. "1. Developer", "NEW MEMBER") — header rows have BLANK col A
      if (colA && !/^\d+$/.test(colA)) {
        curGroup = { name:colA, sheetRow:i+1, members:[], totalRow:null };
        groups.push(curGroup);
        i++;
        continue;
      }

      // ── Blank col A (not a total row) ────────────────────────────────
      if (!colA) {
        // Check if this is a column header row (col A blank + has Thai/English header keywords)
        var rowStr = row.map(function(c){ return String(c||'').toLowerCase(); }).join('|');
        var looksLikeHeaders = rowStr.indexOf('ชื่อ') !== -1 || rowStr.indexOf('name') !== -1 ||
                               rowStr.indexOf('เป้า') !== -1 || rowStr.indexOf('target') !== -1 ||
                               rowStr.indexOf('surname') !== -1;
        if (looksLikeHeaders) {
          var hRow = row.map(function(h){ return String(h||'').trim(); });
          if (!headers.length) { headers = hRow; _gshExtractColMap(headers, colMap); }
          i++; continue;
        }
        // Otherwise: member without seq number (blank col A but has name data)
        var mNameBlank = colMap.name !== undefined ? String(row[colMap.name]||'').trim()
                       : String(row[1]||'').trim();
        if (mNameBlank && curGroup) {
          var cBlank = _cleanCells(row, ss);
          curGroup.members.push({
            sheetRow: i + 1,
            name:     mNameBlank,
            nick:     colMap.nick !== undefined ? String(cBlank[colMap.nick]||'').trim() : '',
            target:   colMap.target   !== undefined ? _safeNum(cBlank[colMap.target])   : 0,
            received: colMap.received !== undefined ? _safeNum(cBlank[colMap.received]) : 0,
            age:      colMap.age  !== undefined ? String(cBlank[colMap.age] ||'').trim() : '',
            note:     colMap.note !== undefined ? String(cBlank[colMap.note]||'').trim() : '',
            cells:    cBlank
          });
          totMembers++;
        }
        i++; continue;
      }

      // ── Member row: col A is a pure number ──────────────────────────
      var mName = colMap.name !== undefined ? String(row[colMap.name]||'').trim()
                : String(row[1]||'').trim();
      if (!mName) { i++; continue; }

      if (!curGroup) {
        curGroup = { name:'ทั่วไป', sheetRow:i, members:[], totalRow:null };
        groups.push(curGroup);
      }

      var cells = _cleanCells(row, ss);
      curGroup.members.push({
        sheetRow: i + 1,
        name:     mName,
        nick:     colMap.nick !== undefined ? String(cells[colMap.nick]||'').trim()  : '',
        target:   colMap.target   !== undefined ? _safeNum(cells[colMap.target])   : 0,
        received: colMap.received !== undefined ? _safeNum(cells[colMap.received]) : 0,
        age:      colMap.age  !== undefined ? String(cells[colMap.age] ||'').trim() : '',
        note:     colMap.note !== undefined ? String(cells[colMap.note]||'').trim() : '',
        cells:    cells
      });
      totMembers++;
      cells.forEach(function(cv, ci) {
        var n = parseFloat(cv);
        if (!isNaN(n) && n > 100) colSums[ci] += n;
      });
      i++;
    }

    // ── Auto-detect target/received if header keywords missed ────────────
    if (colMap.target === undefined || colMap.received === undefined) {
      var bigCols = [];
      for (var bi = 1; bi < lastCol; bi++) {
        if (colSums[bi] > 1000 && bi !== colMap.pct && bi !== colMap.age)
          bigCols.push({ ci:bi, sum:colSums[bi] });
      }
      bigCols.sort(function(a,b){ return b.sum - a.sum; });
      if (bigCols.length >= 1 && colMap.target   === undefined) colMap.target   = bigCols[0].ci;
      if (bigCols.length >= 2 && colMap.received === undefined) colMap.received = bigCols[1].ci;
      // Re-read member values with newly found columns
      groups.forEach(function(g) {
        g.members.forEach(function(m) {
          if (colMap.target   !== undefined) m.target   = _safeNum(m.cells[colMap.target]);
          if (colMap.received !== undefined) m.received = _safeNum(m.cells[colMap.received]);
        });
        if (g.totalRow) {
          if (colMap.target   !== undefined) g.totalRow.target   = _safeNum(g.totalRow.cells[colMap.target]);
          if (colMap.received !== undefined) g.totalRow.received = _safeNum(g.totalRow.cells[colMap.received]);
        }
      });
    }

    // ── Chapter totals ────────────────────────────────────────────────────
    var totReceived = 0, totTarget = 0;
    groups.forEach(function(g) {
      if (g.totalRow && (g.totalRow.received || g.totalRow.target)) {
        totReceived += g.totalRow.received;
        totTarget   += g.totalRow.target;
      } else {
        g.members.forEach(function(m){ totReceived += m.received; totTarget += m.target; });
      }
    });

    return {
      ok:      true,
      headers: headers,
      colMap:  colMap,
      colSums: colSums,
      groups:  groups,
      summary: {
        totalReceived: totReceived,
        totalTarget:   totTarget,
        pct:           totTarget > 0 ? Math.round(totReceived / totTarget * 100) : 0,
        memberCount:   totMembers,
        groupCount:    groups.length
      }
    };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

function _cleanCells(row, ss) {
  var tz = Session.getScriptTimeZone();
  return row.map(function(c) {
    if (c === null || c === undefined) return '';
    var s = String(c).trim();
    if (s.charAt(0) === '#') return '';
    if (c instanceof Date) {
      try { return Utilities.formatDate(c, tz, 'dd/MM/yyyy'); } catch(e) { return ''; }
    }
    return c;
  });
}

// ── Growth Sheet: Update Member ───────────────────────────────
function apiUpdateGrowthMember(p) {
  try {
    if (!p.role) return { ok:false, error:'ต้องล็อกอินก่อน' };
    if (p.role !== 'growth' && p.role !== 'mc')
      return { ok:false, error:'Permission denied' };
    if (!p.sheetRow || !p.updates || !Array.isArray(p.updates))
      return { ok:false, error:'ข้อมูลไม่ครบ' };

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Growth');
    if (!sh) return { ok:false, error:'ไม่พบ Sheet: Growth' };

    var row = parseInt(p.sheetRow);
    if (isNaN(row) || row < 2) return { ok:false, error:'Row ไม่ถูกต้อง' };

    p.updates.forEach(function(u) {
      var col = parseInt(u.col);
      if (isNaN(col) || col < 1) return;
      var val = u.val;
      if (typeof val === 'string' && !isNaN(parseFloat(val)) && val.trim() !== '') val = parseFloat(val);
      sh.getRange(row, col).setValue(val !== null && val !== undefined ? val : '');
    });

    return { ok:true };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

// ── Growth Sheet: Add Member ──────────────────────────────────
function apiAddGrowthMember(p) {
  try {
    if (!p.role) return { ok:false, error:'ต้องล็อกอินก่อน' };
    if (p.role !== 'growth' && p.role !== 'mc')
      return { ok:false, error:'Permission denied' };
    if (!p.name || !p.groupName) return { ok:false, error:'ต้องระบุชื่อและทีม' };

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Growth');
    if (!sh) return { ok:false, error:'ไม่พบ Sheet: Growth' };

    var lastRow = sh.getLastRow();
    var lastCol = Math.min(sh.getLastColumn(), 25);
    var raw     = sh.getRange(1, 1, lastRow, lastCol).getValues();

    // Find actual header row (blank col A + contains ชื่อ/name keywords)
    var headers = [];
    for (var hi = 0; hi < raw.length; hi++) {
      var hColA = String(raw[hi][0]||'').trim();
      if (hColA) continue; // skip rows with col A content
      var hStr = raw[hi].map(function(c){ return String(c||'').toLowerCase(); }).join('|');
      if (hStr.indexOf('ชื่อ') !== -1 || hStr.indexOf('name') !== -1) {
        headers = raw[hi].map(function(c){ return String(c||'').trim(); });
        break;
      }
    }

    // Locate the target group
    var groupStart = -1, groupFound = false;
    var nextSection = lastRow;
    var totalRowIdx = -1;

    for (var r = 1; r < raw.length; r++) {
      var colA = String(raw[r][0]||'').trim();

      if (colA && !/^\d+$/.test(colA)) {
        if (groupFound) { nextSection = r; break; }
        if (colA === p.groupName) { groupFound = true; groupStart = r; }
        continue;
      }
      if (groupFound && !colA && raw[r].join('|').indexOf('รวม') !== -1) {
        totalRowIdx = r;
        break;
      }
    }

    if (!groupFound) return { ok:false, error:'ไม่พบกลุ่ม: ' + p.groupName };

    // Insert before total row (if found), otherwise before next section or at end
    var insertAt = totalRowIdx !== -1 ? totalRowIdx + 1
                 : (nextSection < lastRow ? nextSection + 1 : lastRow + 1);

    sh.insertRowBefore(insertAt);

    // Count existing member rows in this group for sequence number
    var seq = 0;
    for (var r2 = groupStart + 1; r2 < (totalRowIdx !== -1 ? totalRowIdx : nextSection); r2++) {
      var a2 = String(raw[r2][0]||'').trim();
      if (/^\d+$/.test(a2)) seq++;
    }

    // Build the new row
    var newRow = [];
    for (var c = 0; c < lastCol; c++) newRow.push('');
    newRow[0] = seq + 1; // sequence number in col A

    headers.forEach(function(h, i) {
      var hl = h.toLowerCase().replace(/\s+/g,'');
      if (hl.indexOf('ชื่อเล่น') !== -1) { newRow[i] = p.nick || ''; return; }
      if ((hl.indexOf('ชื่อ') !== -1 && hl.indexOf('เล่น') === -1) || hl.indexOf('name') !== -1)
        { if(!newRow[i]) newRow[i] = p.name; return; }
      if (hl.indexOf('เป้า') !== -1 || hl.indexOf('target') !== -1)
        { if(!newRow[i]) newRow[i] = parseFloat(p.target) || 0; }
    });

    sh.getRange(insertAt, 1, 1, lastCol).setValues([newRow]);

    return { ok:true, insertedRow:insertAt };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

// ── Growth Sheet: Move Member to another Power Team ────────────
function apiMoveGrowthMember(p) {
  try {
    if (!p.role) return { ok:false, error:'ต้องล็อกอินก่อน' };
    if (p.role !== 'growth' && p.role !== 'mc')
      return { ok:false, error:'Permission denied' };
    if (!p.sheetRow || !p.targetGroup) return { ok:false, error:'ข้อมูลไม่ครบ' };

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Growth');
    if (!sh) return { ok:false, error:'ไม่พบ Sheet: Growth' };

    var srcRow  = parseInt(p.sheetRow);
    var target  = String(p.targetGroup).trim();
    var lastCol = sh.getLastColumn();

    // Read source row values, then delete it
    var srcVals = sh.getRange(srcRow, 1, 1, lastCol).getValues()[0];
    sh.deleteRow(srcRow);

    // Rescan (row numbers have shifted after deletion)
    var lastRow2 = sh.getLastRow();
    var all = sh.getRange(1, 1, lastRow2, lastCol).getValues();

    var inTarget = false;
    var lastMember = -1;
    var nextSeq = 1;
    var insertBefore = -1;

    for (var r = 0; r < all.length; r++) {
      var row = all[r];
      var colA = String(row[0]||'').trim();

      if (!inTarget) {
        if (colA && !/^\d+$/.test(colA) && colA === target) inTarget = true;
        continue;
      }

      // Inside target group
      if (/^\d+$/.test(colA)) {
        lastMember = r;
        nextSeq = parseInt(colA) + 1;
      } else if (!colA && row.join('|').indexOf('รวม') !== -1) {
        insertBefore = r + 1; // 1-indexed, before total row
        break;
      } else if (colA && !/^\d+$/.test(colA)) {
        // Hit next group — no total row found, insert after last member
        insertBefore = (lastMember >= 0 ? lastMember : r - 1) + 2;
        break;
      }
    }

    if (insertBefore < 0) {
      // Target group at end of sheet
      insertBefore = (lastMember >= 0 ? lastMember : all.length - 1) + 2;
    }

    // Insert row at new location
    sh.insertRowBefore(insertBefore);
    srcVals[0] = nextSeq; // update sequence number
    sh.getRange(insertBefore, 1, 1, lastCol).setValues([srcVals]);

    return { ok:true };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

// ── Monthly Sync (วันที่ 5) ───────────────────────────────────
function apiMonthlySync(p) {
  try {
    if (p.role !== 'mc') return { ok:false, error:'เฉพาะ MC เท่านั้น' };
    if (!p.memberTLCsv && !p.tlCsv)
      return { ok:false, error:'ต้องส่งไฟล์ Member Traffic Light หรือ Traffic Lights CSV อย่างน้อย 1 ไฟล์' };
    var result = runFullImport(p.tlCsv || null, p.r2yCsv || null, p.memberTLCsv || null);
    result.ok = result.ok !== false;
    return result;
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

// ── 90-Day Review ────────────────────────────────────────────
// Sheet: "📋 90-DAY REVIEWS"
// Cols: A=Date, B=MenteeName, C=MentorName, D=Team,
//       E=PassportOK(yes/no), F=PALMSScore, G=PALMSPass(yes/no),
//       H=GraduateReady(yes/no), I=ExtendMentoring(yes/no),
//       J=Notes, K=SavedBy
var REVIEW_SHEET = '📋 90-DAY REVIEWS';
var REVIEW_HEADERS = ['Date','Mentee','Mentor','Team','PassportOK','PALMSScore','PALMSPass','GraduateReady','ExtendMentoring','Notes','SavedBy'];

function _getOrCreate90ReviewSheet(ss) {
  var sh = ss.getSheetByName(REVIEW_SHEET);
  if (!sh) {
    sh = ss.insertSheet(REVIEW_SHEET);
    sh.getRange(1, 1, 1, REVIEW_HEADERS.length).setValues([REVIEW_HEADERS]);
    sh.getRange(1, 1, 1, REVIEW_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function apiSave90DayReview(p) {
  try {
    if (p.role !== 'mc') return { ok:false, error:'เฉพาะ MC เท่านั้น' };
    var menteeName = String(p.menteeName||'').trim();
    if (!menteeName) return { ok:false, error:'ต้องระบุชื่อ Mentee' };
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = _getOrCreate90ReviewSheet(ss);
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yy HH:mm');
    var row = [
      now,
      menteeName,
      String(p.mentorName||'').trim(),
      String(p.team||'').trim(),
      p.passportOK  ? 'yes' : 'no',
      parseFloat(p.palmsScore)||0,
      p.palmsPass   ? 'yes' : 'no',
      p.graduateReady ? 'yes' : 'no',
      p.extendMentoring ? 'yes' : 'no',
      String(p.notes||'').trim(),
      String(p.savedBy||p.role||'').trim()
    ];
    // If editing existing review (rowNum provided), update it
    if (p.rowNum && parseInt(p.rowNum) >= 2) {
      var rn = parseInt(p.rowNum);
      sh.getRange(rn, 1, 1, row.length).setValues([row]);
    } else {
      sh.appendRow(row);
    }
    // Log action
    return { ok:true, savedAt:now };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

function apiGet90DayReviews(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(REVIEW_SHEET);
    if (!sh || sh.getLastRow() < 2) return { ok:true, reviews:[] };
    var data = sh.getRange(2, 1, sh.getLastRow() - 1, REVIEW_HEADERS.length).getValues();
    var filterMentee = String(p.menteeName||'').trim().toLowerCase();
    var filterMentor = String(p.mentorName||'').trim().toLowerCase();
    var reviews = data.map(function(row, i) {
      if (!String(row[1]||'').trim()) return null;
      return {
        rowNum:          i + 2,
        date:            String(row[0]||''),
        menteeName:      String(row[1]||'').trim(),
        mentorName:      String(row[2]||'').trim(),
        team:            String(row[3]||'').trim(),
        passportOK:      String(row[4]||'')==='yes',
        palmsScore:      parseFloat(row[5])||0,
        palmsPass:       String(row[6]||'')==='yes',
        graduateReady:   String(row[7]||'')==='yes',
        extendMentoring: String(row[8]||'')==='yes',
        notes:           String(row[9]||'').trim(),
        savedBy:         String(row[10]||'').trim()
      };
    }).filter(function(r) {
      if (!r) return false;
      if (filterMentee && r.menteeName.toLowerCase() !== filterMentee) return false;
      if (filterMentor && r.mentorName.toLowerCase().indexOf(filterMentor) < 0) return false;
      return true;
    });
    return { ok:true, reviews:reviews };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

// ── Mentor Activity Log ───────────────────────────────────────
// Sheet: "📋 MENTOR LOGS"
// Cols: A=Date, B=MentorName, C=MenteeName, D=Team, E=Week(1-8),
//       F=ActivityType, G=Notes
var MENTOR_LOG_SHEET = '📋 MENTOR LOGS';
var MENTOR_LOG_HEADERS = ['Date','Mentor','Mentee','Team','Week','Activity','Notes'];
var MENTOR_ACTIVITIES = [
  'โทรหา Mentee',
  'นัด 1-2-1 กับ Mentee',
  'แนะนำ Mentee ให้รู้จักสมาชิก',
  'ให้ feedback presentation',
  'นั่งข้างๆ Mentee ในการประชุม',
  'ช่วย Mentee เรื่อง referral',
  'อื่นๆ'
];

function _getOrCreateMentorLogSheet(ss) {
  var sh = ss.getSheetByName(MENTOR_LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(MENTOR_LOG_SHEET);
    sh.getRange(1, 1, 1, MENTOR_LOG_HEADERS.length).setValues([MENTOR_LOG_HEADERS]);
    sh.getRange(1, 1, 1, MENTOR_LOG_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function apiSaveMentorLog(p) {
  try {
    var mentorName = String(p.mentorName||'').trim();
    var menteeName = String(p.menteeName||'').trim();
    if (!mentorName || !menteeName) return { ok:false, error:'ต้องระบุ Mentor และ Mentee' };
    var activity = String(p.activity||'').trim();
    if (!activity) return { ok:false, error:'ต้องระบุ Activity' };
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = _getOrCreateMentorLogSheet(ss);
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yy HH:mm');
    sh.appendRow([
      now,
      mentorName,
      menteeName,
      String(p.team||'').trim(),
      parseInt(p.week)||0,
      activity,
      String(p.notes||'').trim()
    ]);
    return { ok:true, savedAt:now };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

function apiGetMentorLogs(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(MENTOR_LOG_SHEET);
    if (!sh || sh.getLastRow() < 2) return { ok:true, logs:[], activityTypes:MENTOR_ACTIVITIES };
    var data = sh.getRange(2, 1, sh.getLastRow() - 1, MENTOR_LOG_HEADERS.length).getValues();
    var filterMentor = String(p.mentorName||'').trim().toLowerCase();
    var filterMentee = String(p.menteeName||'').trim().toLowerCase();
    var filterTeam   = String(p.team||'').trim().toLowerCase();
    var logs = data.map(function(row, i) {
      if (!String(row[1]||'').trim()) return null;
      return {
        rowNum:     i + 2,
        date:       String(row[0]||''),
        mentorName: String(row[1]||'').trim(),
        menteeName: String(row[2]||'').trim(),
        team:       String(row[3]||'').trim(),
        week:       parseInt(row[4])||0,
        activity:   String(row[5]||'').trim(),
        notes:      String(row[6]||'').trim()
      };
    }).filter(function(r) {
      if (!r) return false;
      if (filterMentor && r.mentorName.toLowerCase().indexOf(filterMentor) < 0) return false;
      if (filterMentee && r.menteeName.toLowerCase().indexOf(filterMentee) < 0) return false;
      if (filterTeam   && r.team.toLowerCase() !== filterTeam) return false;
      return true;
    });
    return { ok:true, logs:logs, activityTypes:MENTOR_ACTIVITIES };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROWTH SYSTEM v2 — Chapter Revenue Command + Cross-Team + Sprint
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _getPTSheet(ss) {
  var sh = ss.getSheetByName('⚡ POWER TEAMS');
  if (!sh) {
    sh = ss.insertSheet('⚡ POWER TEAMS');
    sh.getRange(1,1,1,9).setValues([['ทีม','ชื่อ','นามสกุล','ชื่อเล่น','อาชีพ','TL','เป้าหมาย(฿)','รับจริง(฿)','Ref/wk']]);
    sh.getRange(1,1,1,9).setBackground('#1E2A3A').setFontColor('#F0B429').setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function _readPTData(ss) {
  var sh = _getPTSheet(ss);
  if (sh.getLastRow() < 2) return { teams:[], memberPool:[] };
  var data = sh.getRange(2,1,sh.getLastRow()-1,9).getValues();
  var teamMap = {}, teamOrder = [];
  data.forEach(function(row, i) {
    var tName = String(row[0]||'').trim();
    if (!tName) return;
    if (!teamMap[tName]) { teamMap[tName]=[]; teamOrder.push(tName); }
    teamMap[tName].push({
      row:i+2, firstName:String(row[1]||'').trim(), lastName:String(row[2]||'').trim(),
      nick:String(row[3]||'').trim(), profession:String(row[4]||'').trim(),
      tl:String(row[5]||'').trim(), bniGoal:parseFloat(row[6])||0,
      recv:parseFloat(row[7])||0, refPerWeek:parseFloat(row[8])||0
    });
  });
  var teams = teamOrder.map(function(name) {
    var members = teamMap[name];
    var tGoal = members.reduce(function(s,m){ return s+m.bniGoal; },0);
    var tRecv = members.reduce(function(s,m){ return s+m.recv; },0);
    members.forEach(function(m){ m.goalPct=m.bniGoal>0?Math.round(m.recv/m.bniGoal*1000)/10:0; m.team=name; });
    return { team:name, members:members, memberCount:members.length,
             teamGoal:tGoal, teamRecv:tRecv, teamPct:tGoal>0?Math.round(tRecv/tGoal*1000)/10:0 };
  });
  var memberPool = [];
  teams.forEach(function(t){ t.members.forEach(function(m){ memberPool.push(m); }); });
  return { teams:teams, memberPool:memberPool };
}

// ── 1. Chapter Revenue Command ─────────────────────────────────
function apiGetChapterRevenue(p) {
  if (p.role!=='growth'&&p.role!=='mc') return {ok:false,error:'Permission denied'};
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var chapterGoal = parseFloat(_getSettingsValue('CHAPTER_GOAL'))||1000000000;
    var pd = _readPTData(ss);
    var teams = pd.teams, memberPool = pd.memberPool;
    if (!teams.length) {
      var fb = apiGetGrowthPowerTeams(p);
      if (fb.ok) { teams=fb.teams; memberPool=[]; teams.forEach(function(t){ (t.members||[]).forEach(function(m){ memberPool.push(Object.assign({team:t.team},m)); }); }); }
    }
    var totalTeamGoal = teams.reduce(function(s,t){ return s+t.teamGoal; },0);
    var totalRecv = teams.reduce(function(s,t){ return s+t.teamRecv; },0);
    var chapterPct = chapterGoal>0?Math.round(totalRecv/chapterGoal*1000)/10:0;
    var teamsWT = teams.map(function(t) {
      var ap = totalTeamGoal>0?t.teamGoal/totalTeamGoal:1/Math.max(1,teams.length);
      var ct = Math.round(chapterGoal*ap);
      return Object.assign({},t,{allocPct:Math.round(ap*1000)/10,chapterTarget:ct,
        chapterPct:ct>0?Math.round(t.teamRecv/ct*1000)/10:0,gap:Math.max(0,ct-t.teamRecv)});
    });
    var now=new Date(); var bniy=new Date(now.getFullYear(),3,1);
    if (now<bniy) bniy.setFullYear(bniy.getFullYear()-1);
    var mEl=Math.max(1,(now.getFullYear()-bniy.getFullYear())*12+now.getMonth()-bniy.getMonth()+1);
    var runRate=Math.round(totalRecv/mEl); var mRem=Math.max(1,12-mEl);
    var projected=totalRecv+runRate*mRem;
    memberPool.sort(function(a,b){return (b.recv||0)-(a.recv||0);});
    var milestones=[{pct:25,label:'25%',emoji:'🎯'},{pct:50,label:'50%',emoji:'🔥'},{pct:75,label:'75%',emoji:'⚡'},{pct:100,label:'1 Billion',emoji:'🏆'}];
    milestones.forEach(function(m){m.reached=chapterPct>=m.pct;});
    return {ok:true,chapterGoal:chapterGoal,totalRecv:totalRecv,chapterPct:chapterPct,
            gap:Math.max(0,chapterGoal-totalRecv),runRate:runRate,mElapsed:mEl,mRemain:mRem,
            projected:projected,projectedPct:Math.round(projected/chapterGoal*100),
            teams:teamsWT,topPerformers:memberPool.slice(0,5),
            needAttention:memberPool.filter(function(m){return m.bniGoal>0&&(m.goalPct||0)<25;}).slice(0,10),
            milestones:milestones};
  } catch(e){return {ok:false,error:e.message};}
}

function apiSetChapterGoal(p) {
  if (p.role!=='growth'&&p.role!=='mc') return {ok:false,error:'Permission denied'};
  var goal=parseFloat(p.goal)||0;
  if (goal<=0) return {ok:false,error:'เป้าหมายต้องมากกว่า 0'};
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName('⚙️ SETTINGS')||ss.insertSheet('⚙️ SETTINGS');
  var data=sh.getDataRange().getValues();
  for(var i=0;i<data.length;i++){if(String(data[i][0]).trim()==='CHAPTER_GOAL'){sh.getRange(i+1,2).setValue(goal);return{ok:true,goal:goal};}}
  sh.appendRow(['CHAPTER_GOAL',goal]);
  return {ok:true,goal:goal};
}

// ── 2. Power Team CRUD ─────────────────────────────────────────
function apiGetPTMembers(p) {
  if (p.role!=='growth'&&p.role!=='mc') return {ok:false,error:'Permission denied'};
  try { var ss=SpreadsheetApp.getActiveSpreadsheet(); var pd=_readPTData(ss); return {ok:true,teams:pd.teams,teamNames:pd.teams.map(function(t){return t.team;})}; }
  catch(e){return {ok:false,error:e.message};}
}
function apiSavePTMember(p) {
  if (p.role!=='growth'&&p.role!=='mc') return {ok:false,error:'Permission denied'};
  try {
    var ss=SpreadsheetApp.getActiveSpreadsheet(); var sh=_getPTSheet(ss);
    var row=[p.team||'',p.firstName||'',p.lastName||'',p.nick||'',p.profession||'',p.tl||'',parseFloat(p.bniGoal)||0,parseFloat(p.recv)||0,parseFloat(p.refPerWeek)||0];
    if (parseInt(p.row)>1){sh.getRange(parseInt(p.row),1,1,9).setValues([row]);}else{sh.appendRow(row);}
    return {ok:true};
  } catch(e){return {ok:false,error:e.message};}
}
function apiDeletePTMember(p) {
  if (p.role!=='growth'&&p.role!=='mc') return {ok:false,error:'Permission denied'};
  var row=parseInt(p.row)||0; if(row<2) return {ok:false,error:'Invalid row'};
  try { _getPTSheet(SpreadsheetApp.getActiveSpreadsheet()).deleteRow(row); return {ok:true}; }
  catch(e){return {ok:false,error:e.message};}
}
function apiMovePTMember(p) {
  if (p.role!=='growth'&&p.role!=='mc') return {ok:false,error:'Permission denied'};
  var row=parseInt(p.row)||0; if(row<2||!p.newTeam) return {ok:false,error:'ต้องระบุ row และ newTeam'};
  try { _getPTSheet(SpreadsheetApp.getActiveSpreadsheet()).getRange(row,1).setValue(p.newTeam); return {ok:true}; }
  catch(e){return {ok:false,error:e.message};}
}

// ── 3. Cross-Team 1-2-1 Intelligence ──────────────────────────
var CT_SHEET='📋 CROSS TEAM 121';
var CT_HDR=['Nick 1','Nick 2','ทีม 1','ทีม 2','สถานะ','วันที่ assign','หมายเหตุ'];

function apiGetCrossTeamSynergy(p) {
  if (p.role!=='growth'&&p.role!=='mc') return {ok:false,error:'Permission denied'};
  try {
    var ss=SpreadsheetApp.getActiveSpreadsheet();
    var pd=_readPTData(ss); var memberPool=pd.memberPool;
    if (!memberPool.length){var fb=apiGetGrowthPowerTeams(p);if(fb.ok){fb.teams.forEach(function(t){(t.members||[]).forEach(function(m){memberPool.push(Object.assign({team:t.team},m));});});}}
    var ctSh=ss.getSheetByName(CT_SHEET); var saved=[]; var savedKeys={};
    if (ctSh&&ctSh.getLastRow()>1){ctSh.getRange(2,1,ctSh.getLastRow()-1,7).getValues().forEach(function(r,i){if(!r[0])return;var k=[String(r[0]),String(r[1])].sort().join('|');savedKeys[k]=true;saved.push({row:i+2,nick1:String(r[0]),nick2:String(r[1]),team1:String(r[2]),team2:String(r[3]),status:String(r[4]||'pending'),assignedAt:String(r[5]||''),notes:String(r[6]||'')});});}
    var recs=[]; var seen={};
    memberPool.forEach(function(a){memberPool.forEach(function(b){
      if(a.team===b.team) return;
      var key=[a.nick,b.nick].sort().join('|');
      if(seen[key]) return; seen[key]=true;
      var score=0,reasons=[];
      var avgDeal=(a.avgDeal||0)+(b.avgDeal||0);
      if(avgDeal>=1000000){score+=35;reasons.push('Deal ใหญ่มาก');}else if(avgDeal>=200000){score+=20;reasons.push('Deal ดี');}else if(avgDeal>0){score+=8;}
      var aNet=(a.refIn||0)-(a.refOut||0); var bNet=(b.refIn||0)-(b.refOut||0);
      if(aNet<-3&&bNet>3){score+=25;reasons.push('Balance Referral สูง');}else if(aNet<0&&bNet>0){score+=12;reasons.push('Referral ไม่สมดุล');}
      if((a.goalPct||0)<50&&(b.goalPct||0)<50){score+=15;reasons.push('ต่างต้องการ Referral');}
      if(a.tl==='R'||a.tl==='Y') score+=8; if(b.tl==='R'||b.tl==='Y') score+=8;
      if(!savedKeys[key]) score+=5;
      if(score>=25||savedKeys[key]){recs.push({key:key,nick1:a.nick,team1:a.team,prof1:a.profession||'',recv1:a.recv||0,tl1:a.tl||'',nick2:b.nick,team2:b.team,prof2:b.profession||'',recv2:b.recv||0,tl2:b.tl||'',score:score,reasons:reasons,isSaved:!!savedKeys[key]});}
    });});
    recs.sort(function(a,b){return b.score-a.score;});
    return {ok:true,recommendations:recs.slice(0,30),savedPairs:saved};
  } catch(e){return {ok:false,error:e.message};}
}

function apiSaveCrossTeamPair(p) {
  if (p.role!=='growth'&&p.role!=='mc') return {ok:false,error:'Permission denied'};
  try {
    var ss=SpreadsheetApp.getActiveSpreadsheet(); var sh=ss.getSheetByName(CT_SHEET);
    if(!sh){sh=ss.insertSheet(CT_SHEET);sh.getRange(1,1,1,CT_HDR.length).setValues([CT_HDR]).setBackground('#1E2A3A').setFontColor('#F0B429').setFontWeight('bold');sh.setFrozenRows(1);}
    var now=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'dd/MM/yyyy');
    if(p.field==='delete'&&parseInt(p.row)>1){sh.deleteRow(parseInt(p.row));return{ok:true};}
    if(p.field==='status'&&parseInt(p.row)>1){sh.getRange(parseInt(p.row),5).setValue(p.value);return{ok:true};}
    if(p.field==='notes'&&parseInt(p.row)>1){sh.getRange(parseInt(p.row),7).setValue(p.value);return{ok:true};}
    sh.appendRow([p.nick1||'',p.nick2||'',p.team1||'',p.team2||'','pending',now,p.notes||'']);
    return {ok:true};
  } catch(e){return {ok:false,error:e.message};}
}

// ── 4. Monthly Sprint Board ────────────────────────────────────
var SP_SHEET='📅 MONTHLY SPRINT';
var SP_HDR=['ปี','เดือน','ทีม','เป้า(฿)','สมาชิก Focus','คู่ 1-2-1','สถานะ','หมายเหตุ','บันทึกเมื่อ'];

function apiGetSprintBoard(p) {
  if (p.role!=='growth'&&p.role!=='mc') return {ok:false,error:'Permission denied'};
  try {
    var ss=SpreadsheetApp.getActiveSpreadsheet(); var sh=ss.getSheetByName(SP_SHEET);
    if(!sh||sh.getLastRow()<2) return {ok:true,sprints:[],currentSprint:[]};
    var data=sh.getRange(2,1,sh.getLastRow()-1,9).getValues();
    var sprints=data.map(function(r,i){return {row:i+2,year:parseInt(r[0])||0,month:parseInt(r[1])||0,team:String(r[2]||''),target:parseFloat(r[3])||0,focus:String(r[4]||''),pairs:String(r[5]||''),status:String(r[6]||'pending'),notes:String(r[7]||''),savedAt:String(r[8]||'')};}).filter(function(s){return s.year>0&&s.month>0;});
    var now=new Date(); var curY=now.getFullYear(),curM=now.getMonth()+1;
    return {ok:true,sprints:sprints,currentSprint:sprints.filter(function(s){return s.year===curY&&s.month===curM;})};
  } catch(e){return {ok:false,error:e.message};}
}

function apiSaveSprintPlan(p) {
  if (p.role!=='growth'&&p.role!=='mc') return {ok:false,error:'Permission denied'};
  try {
    var ss=SpreadsheetApp.getActiveSpreadsheet(); var sh=ss.getSheetByName(SP_SHEET);
    if(!sh){sh=ss.insertSheet(SP_SHEET);sh.getRange(1,1,1,SP_HDR.length).setValues([SP_HDR]).setBackground('#1E2A3A').setFontColor('#F0B429').setFontWeight('bold');sh.setFrozenRows(1);}
    var now=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'dd/MM/yyyy HH:mm');
    if(p.field==='delete'&&parseInt(p.row)>1){sh.deleteRow(parseInt(p.row));return{ok:true};}
    if(p.field==='status'&&parseInt(p.row)>1){sh.getRange(parseInt(p.row),7).setValue(p.value);return{ok:true};}
    if(p.field==='notes'&&parseInt(p.row)>1){sh.getRange(parseInt(p.row),8).setValue(p.value);return{ok:true};}
    var d=new Date();
    sh.appendRow([parseInt(p.year)||d.getFullYear(),parseInt(p.month)||d.getMonth()+1,p.team||'ทุกทีม',parseFloat(p.target)||0,p.focus||'',p.pairs||'','pending',p.notes||'',now]);
    return {ok:true};
  } catch(e){return {ok:false,error:e.message};}
}

// ── 5. Referral Flow ───────────────────────────────────────────
function apiGetReferralFlow(p) {
  if (p.role!=='growth'&&p.role!=='mc') return {ok:false,error:'Permission denied'};
  try {
    var ss=SpreadsheetApp.getActiveSpreadsheet(); var pd=_readPTData(ss);
    var memberPool=pd.memberPool, teams=pd.teams;
    if(!memberPool.length){var fb=apiGetGrowthPowerTeams(p);if(fb.ok){teams=fb.teams;fb.teams.forEach(function(t){(t.members||[]).forEach(function(m){memberPool.push(Object.assign({team:t.team},m));});});}}
    var tStats={};
    teams.forEach(function(t){var ri=0,ro=0;(t.members||[]).forEach(function(m){ri+=(m.refIn||0);ro+=(m.refOut||0);});tStats[t.team]={team:t.team,refIn:ri,refOut:ro,recv:t.teamRecv||0,memberCount:t.memberCount||0};});
    var totIn=Object.values(tStats).reduce(function(s,t){return s+t.refIn;},0);
    var flow=[];
    Object.values(tStats).forEach(function(a){Object.values(tStats).forEach(function(b){if(a.team===b.team||!totIn) return;var est=Math.round(a.refOut*(b.refIn/totIn));if(est>=1)flow.push({fromTeam:a.team,toTeam:b.team,refCount:est});});});
    flow.sort(function(a,b){return b.refCount-a.refCount;});
    memberPool.sort(function(a,b){return (b.refOut||0)-(a.refOut||0);});
    return {ok:true,flow:flow.slice(0,20),teamStats:Object.values(tStats),
            topGivers:memberPool.slice(0,10),
            topReceivers:memberPool.slice().sort(function(a,b){return (b.refIn||0)-(a.refIn||0);}).slice(0,10),
            imbalanced:memberPool.filter(function(m){return (m.refIn||0)>(m.refOut||0)*2&&(m.refIn||0)>3;}).sort(function(a,b){return b.refIn-a.refIn;}).slice(0,10)};
  } catch(e){return {ok:false,error:e.message};}
}

// ── Check-In: Save from Desktop upload ────────────────────────
function apiSaveCheckin(p) {
  if (p.role !== 'mc' && p.role !== 'growth') return { ok:false, error:'Permission denied' };
  if (!p.members || !p.members.length) return { ok:false, error:'No members' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('📋 CHECKIN LOG');
  if (!sh) {
    sh = ss.insertSheet('📋 CHECKIN LOG');
    sh.getRange(1,1,1,6).setValues([['date','name','status','sub_for','looking_for','mentor']]);
    sh.getRange(1,1,1,6).setBackground('#1E2A3A').setFontColor('#F0B429').setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  var listSh = ss.getSheetByName('รายชื่อทั้งหมด');
  var mentorMap = {};
  if (listSh && listSh.getLastRow() >= 3) {
    listSh.getRange(3,2,listSh.getLastRow()-2,3).getValues().forEach(function(r) {
      var nm = String(r[0]||'').trim(); if (nm) mentorMap[nm] = String(r[2]||'').trim();
    });
  }
  var now = new Date();
  var dateStr = p.date || Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  var week = p.week || (function(){
    var d=now, soy=new Date(d.getFullYear(),0,1);
    var wn=Math.ceil((((d-soy)/86400000)+soy.getDay()+1)/7);
    return ('0'+wn).slice(-2)+'/'+d.getFullYear();
  })();
  var rows = p.members.map(function(m) {
    return [dateStr, m.name||'', m.status||'สมาชิก', m.sub_for||'', m.looking_for||'', mentorMap[m.name]||''];
  });
  sh.getRange(sh.getLastRow()+1, 1, rows.length, 6).setValues(rows);
  return { ok:true, saved:rows.length, week:week };
}

// ── Check-In: Read log for desktop history view ────────────────
function apiGetCheckinLog(p) {
  if (p.role !== 'mc' && p.role !== 'growth') return { ok:false, error:'Permission denied' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('📋 CHECKIN LOG');
  if (!sh || sh.getLastRow() < 2) return { ok:true, weeks:[], members:[], currentWeek:'' };
  var data = sh.getRange(2,1,sh.getLastRow()-1,6).getValues();
  var weekMap = {};
  data.forEach(function(row) {
    var date = String(row[0]||'').trim();
    if (!date) return;
    var d = new Date(date.replace(/(\d{2})\/(\d{2})\/(\d{4})/,'$3-$2-$1'));
    var key = '';
    if (!isNaN(d.getTime())) {
      var soy = new Date(d.getFullYear(),0,1);
      var wn = Math.ceil((((d-soy)/86400000)+soy.getDay()+1)/7);
      key = ('0'+wn).slice(-2)+'/'+d.getFullYear();
    } else { key = date; }
    if (!weekMap[key]) weekMap[key] = 0;
    weekMap[key]++;
  });
  var weeks = Object.keys(weekMap).sort(function(a,b){
    var pa=a.split('/'), pb=b.split('/');
    var va=parseInt(pa[1])*100+parseInt(pa[0]), vb=parseInt(pb[1])*100+parseInt(pb[0]);
    return vb-va;
  }).map(function(w){ return {week:w, count:weekMap[w]}; });
  var targetWeek = p.week || (weeks[0]||{}).week || '';
  var members = [];
  if (targetWeek) {
    data.forEach(function(row) {
      var date = String(row[0]||'').trim(); if (!date) return;
      var d = new Date(date.replace(/(\d{2})\/(\d{2})\/(\d{4})/,'$3-$2-$1'));
      var key = '';
      if (!isNaN(d.getTime())) {
        var soy = new Date(d.getFullYear(),0,1);
        var wn = Math.ceil((((d-soy)/86400000)+soy.getDay()+1)/7);
        key = ('0'+wn).slice(-2)+'/'+d.getFullYear();
      } else { key = date; }
      if (key === targetWeek) {
        members.push({ date:date, name:String(row[1]||''), status:String(row[2]||''),
                       sub_for:String(row[3]||''), looking_for:String(row[4]||''), mentor:String(row[5]||'') });
      }
    });
  }
  return { ok:true, weeks:weeks, members:members, currentWeek:targetWeek };
}

// ============================================================
// BNI IDEAL — Script N: Update Given / Received (Apr 26)
// อัปเดตเฉพาะ Active Members (53 คน — กรองคนดรอปออกแล้ว)
//
// วิธีใช้: เมนู BNI Sync → 💰 อัปเดต Given/Received (Apr 26)
// ============================================================

var GIVEN_RECEIVED = {
  'Thitima Hemarak':              { given: 30119051, recv: 1972782 },
  'Archara Pagarat':              { given: 905090,   recv: 29425 },
  'Chiranan Sathitsamphan':       { given: 1521129,  recv: 1350 },
  'Jakrapong Visetpanpong':       { given: 64059,    recv: 40370 },
  'Kanoknat Nakhonthai':          { given: 1516306,  recv: 713576 },
  'Nipawee Supachaisakron':       { given: 1017204,  recv: 807744 },
  'Palat Thanasrivanichai':       { given: 958275,   recv: 640532 },
  'Pongpat Chanthai':             { given: 238703,   recv: 251810 },
  'Pariphon Jaroonthiravith':     { given: 4563641,  recv: 820671 },
  'Preeda Noita':                 { given: 1804108,  recv: 26040948 },
  'Suporn Wongchompoo':           { given: 273993,   recv: 107368 },
  'Duangkamon Chanthaboon':       { given: 518510,   recv: 21734 },
  'Korranat Worawongthep':        { given: 107691,   recv: 672350 },
  'Ophat Taerattanachai':         { given: 252136,   recv: 3156119 },
  'Phanuwat Promwong':            { given: 1170184,  recv: 2779000 },
  'Phitarn Sakulthanaphetch':     { given: 322951,   recv: 25250 },
  'Pisit Akarapanichayakul':      { given: 131302,   recv: 0 },
  'Praputsorn Kongsarppaisal':    { given: 940769,   recv: 2768870 },
  'Sirimon Sanoi':                { given: 9695,     recv: 63499 },
  'Chananan Saengplao':           { given: 100225,   recv: 987719 },
  'Itthipol Rattanapirote':       { given: 185396,   recv: 342151 },
  'Kanpong Ritchainimit':         { given: 755600,   recv: 2484246 },
  'Prakorn Sirimars':             { given: 205688,   recv: 32681 },
  'Samrit Pholjan':               { given: 177014,   recv: 107300 },
  'Yosita Niyomrat':              { given: 354187,   recv: 288241 },
  'Adisak Pankhot':               { given: 684010,   recv: 1000 },
  'Atthachai Somboon':            { given: 34291,    recv: 0 },
  'Jirayu Boonlert':              { given: 739234,   recv: 417064 },
  'Nilin Waroha':                 { given: 268300,   recv: 82393 },
  'Preyawal Vatcharachaithanin':  { given: 84436,    recv: 45582 },
  'Rewat Sanpet':                 { given: 430189,   recv: 190130 },
  'Wisnugorn Udornwong':          { given: 421084,   recv: 314655 },
  'Kittathat Jaruchaikul':        { given: 329246,   recv: 44700 },
  'Narin Lourujirakul':           { given: 126633,   recv: 221830 },
  'Orapan Pougpralub':            { given: 245298,   recv: 229382 },
  'Pemika Siriyotha':             { given: 243907,   recv: 159380 },
  'Ploypachcha Tararattanapawn':  { given: 215932,   recv: 330315 },
  'Weerawat Suepadkon':           { given: 136759,   recv: 208513 },
  'Jetsada Sanudomchok':          { given: 1324954,  recv: 20000 },
  'Krisada Kotama':               { given: 6900,     recv: 0 },
  'Naruporn Supittayapornpong':   { given: 151826,   recv: 278160 },
  'Tanyaluck Treepornwasu':       { given: 118664,   recv: 109511 },
  'Thanyalak Samreeloy':          { given: 1211380,  recv: 650913 },
  'Ekawat Suwannahong':           { given: 55850,    recv: 626500 },
  'Gomen Khotsopa':               { given: 273256,   recv: 132620 },
  'Ittipon Setthawattananon':     { given: 48940,    recv: 12990 },
  'Thanakrit Wathport':           { given: 336690,   recv: 1445763 },
  'Thanongsak Seriumnuay':        { given: 1012073,  recv: 294000 },
  'Phannakorn Kittikool':         { given: 192780,   recv: 1448900 },
  'Theerawut Piyaphinthu':        { given: 114328,   recv: 634826 },
  'Wasawat Rattanakornpipat':     { given: 138641,   recv: 270524 },
  'Nattawut Amsri':               { given: 17406,    recv: 32500 },
  'Nantawat Mahaeknan':           { given: 194433,   recv: 2827657 },
};

// ── Main ──────────────────────────────────────────────────────
function updateGivenReceived() {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var updated = 0;
  var skipped = [];

  // 1. Mentor Sheets — col C=name, col T(20)=Given, col U(21)=Received, col V(22)=Balance
  ['TOOMTAM','Aof','Draft','PHAI','AMP'].forEach(function(shName) {
    var sh = ss.getSheetByName(shName);
    if (!sh) return;
    for (var r = 4; r <= 11; r++) {
      var name = sh.getRange(r, 3).getDisplayValue().trim();
      if (!name) continue;
      var d = _find(name);
      if (!d) { skipped.push(name + ' [' + shName + ']'); return; }
      sh.getRange(r, 20).setValue(d.given);
      sh.getRange(r, 21).setValue(d.recv);
      sh.getRange(r, 22).setValue(d.given - d.recv);
      updated++;
    }
  });

  // 2. รายชื่อทั้งหมด — col B=name, col G(7)=Given, col H(8)=Received, col I(9)=Balance
  _updateSheet(ss, 'รายชื่อทั้งหมด', 2, 3, 7, 8, 9);

  // 3. 👀 NON-MENTOR — same layout as รายชื่อทั้งหมด
  _updateSheet(ss, '👀 NON-MENTOR', 2, 3, 7, 8, 9);

  var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  var msg = '✅ อัปเดต Given/Received เสร็จแล้ว!\n\n'
    + 'Mentor Sheets: ' + updated + ' คน\n'
    + 'ข้อมูล: Apr 2026 (เฉพาะ Active Members)\n'
    + 'เวลา: ' + ts;
  if (skipped.length)
    msg += '\n\n⚠️ หาไม่พบ ' + skipped.length + ' คน:\n' + skipped.slice(0,10).join('\n');

  Browser.msgBox(msg);
}

function _updateSheet(ss, shName, nameCol, startRow, givenCol, recvCol, balCol) {
  var sh = ss.getSheetByName(shName);
  if (!sh) return;
  var last = sh.getLastRow();
  for (var r = startRow; r <= last; r++) {
    var name = sh.getRange(r, nameCol).getDisplayValue().trim();
    if (!name) continue;
    var d = _find(name);
    if (!d) continue;
    sh.getRange(r, givenCol).setValue(d.given);
    sh.getRange(r, recvCol).setValue(d.recv);
    if (balCol) sh.getRange(r, balCol).setValue(d.given - d.recv);
  }
}

function _find(name) {
  if (!name) return null;
  var n = name.trim().replace(/\s+/g, ' ');
  if (GIVEN_RECEIVED[n]) return GIVEN_RECEIVED[n];
  var keys = Object.keys(GIVEN_RECEIVED);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === n.toLowerCase()) return GIVEN_RECEIVED[keys[i]];
  }
  return null;
}
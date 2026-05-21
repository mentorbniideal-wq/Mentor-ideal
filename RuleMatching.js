// ============================================================
// BNI IDEAL — Rule-Based 1-2-1 Matching Engine
// ไม่มีค่าใช้จ่าย AI — ทำงานใน Apps Script ล้วนๆ
//
// วิธีใช้: แทนที่ apiGetAIMatching เดิมใน CheckIn_System.gs
// dispatch(): if (a==='getAIMatching') return apiGetRuleMatching(payload);
// ============================================================

// ── Keyword Categories ────────────────────────────────────────
// เพิ่ม keyword ได้ตามธุรกิจจริงของ BNI IDEAL
var MATCH_CATEGORIES = {
  'ก่อสร้าง':         ['ก่อสร้าง','ผู้รับเหมา','วัสดุ','บ้าน','อาคาร','ฟาซาด','ต่อเติม','รีโนเวท','สร้าง','ฝ้า','พื้น'],
  'อาหาร/ร้านค้า':   ['ร้านอาหาร','อาหาร','คลีน','บุฟเฟ่','ปลา','เมนู','จัดเลี้ยง','ร้านค้า','ร้าน','catering','ของกิน'],
  'ยานยนต์':         ['รถ','ยานยนต์','โชว์รูม','กระบะ','BYD','EV','ไฟฟ้า','zeeker','ซ่อม','อะไหล่'],
  'อสังหาริมทรัพย์': ['บ้าน','คอนโด','ที่ดิน','อสังหา','โกดัง','สำนักงาน','เช่า','ขาย','นิติ','หมู่บ้าน'],
  'สุขภาพ/ความงาม':  ['คลินิก','หมอ','ฟัน','สุขภาพ','โรงพยาบาล','จัดฟัน','ฟันปลอม','สปา','ความงาม','ผิว'],
  'การเงิน/ประกัน':  ['ประกัน','การเงิน','สินเชื่อ','เทอร์โบ','บัญชี','ภาษี','ลงทุน','กองทุน','ธนาคาร'],
  'ไอที/ดิจิทัล':    ['เว็บไซต์','แอป','ดิจิทัล','content','คลิป','โซเชียล','IT','ซอฟต์แวร์','โปรแกรม','ออนไลน์'],
  'การตลาด/สื่อ':    ['ป้าย','บิลบอร์ด','โฆษณา','ประชาสัมพันธ์','สื่อ','marketing','สปอต','ไวนิล'],
  'โรงแรม/ท่องเที่ยว':['โรงแรม','ที่พัก','ท่องเที่ยว','รีสอร์ท','backpacker','เที่ยว','พัก'],
  'เกษตร/โรงงาน':   ['ฟาร์ม','เกษตร','โรงงาน','ผลิต','แปรรูป','หมู','ไก่','นํ้าดื่ม'],
  'งานอีเวนต์':      ['แต่งงาน','งาน','อีเวนต์','จัดงาน','พิธี','ออกบูธ','party','ปาร์ตี้'],
  'แฟชั่น/ไลฟ์สไตล์':['แต่งตัว','แฟชั่น','ของขวัญ','ของฝาก','เสื้อผ้า','เครื่องประดับ','ทอง','จิวเวลรี่'],
  'ทำความสะอาด':    ['แม่บ้าน','ทำความสะอาด','ล้างแอร์','คลีนนิ่ง','พนักงาน'],
  'สื่อสาร/มือถือ':  ['มือถือ','โทรศัพท์','ผ่อน','อุปกรณ์','ไอที','network'],
  'การศึกษา':        ['โรงเรียน','อนุบาล','สถาบัน','คอร์ส','อบรม','เรียน','สอน'],
  'ออกแบบ/ตกแต่ง':  ['ออกแบบ','ตกแต่ง','interior','design','สถาปนิก','landscape'],
  'logistics/ขนส่ง': ['ขนส่ง','โลจิสติกส์','ส่งของ','delivery','ดิสบิวเตอร์','โกดัง','freight'],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// apiGetRuleMatching — แทน apiGetAIMatching
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function apiGetRuleMatching(p) {
  if (p.role !== 'growth' && p.role !== 'mc') return { ok:false, error:'Permission denied' };

  var members = p.members || [];
  if (!members.length) return { ok:false, error:'ไม่มีข้อมูลสมาชิก' };

  // กรองเฉพาะสมาชิกจริงที่มี Looking For
  var real = members.filter(function(m) {
    return m.status === 'สมาชิก' && m.looking_for && m.looking_for.trim();
  });

  if (real.length < 2) return { ok:false, error:'ต้องมีสมาชิกที่มี Looking For อย่างน้อย 2 คน' };

  var matches = [];

  // เปรียบเทียบทุกคู่
  for (var i = 0; i < real.length; i++) {
    for (var j = i + 1; j < real.length; j++) {
      var a = real[i];
      var b = real[j];

      var result = _scoreMatch(a, b);
      if (result.score >= 2) {
        matches.push({
          person_a:  a.name,
          mentor_a:  a.mentor || '—',
          lf_a:      a.looking_for,
          person_b:  b.name,
          mentor_b:  b.mentor || '—',
          lf_b:      b.looking_for,
          score:     result.score,
          reasons:   result.reasons,
          match_type:result.matchType,
          cross_team:(a.mentor !== b.mentor),
          priority:  result.score >= 6 ? 'high' : result.score >= 4 ? 'medium' : 'low'
        });
      }
    }
  }

  // เรียงลำดับ: cross-team ขึ้นก่อน → score สูงสุด
  matches.sort(function(a, b) {
    if (a.cross_team !== b.cross_team) return a.cross_team ? -1 : 1;
    return b.score - a.score;
  });

  // สรุป
  var summary = _buildSummary(matches, real.length);

  return {
    ok:      true,
    matches: matches.slice(0, 15), // แสดงสูงสุด 15 คู่
    summary: summary,
    total:   matches.length
  };
}

// ── คำนวณ score ระหว่างคู่ ────────────────────────────────────
function _scoreMatch(a, b) {
  var score   = 0;
  var reasons = [];
  var matchType = [];

  var lfA = (a.looking_for || '').toLowerCase();
  var lfB = (b.looking_for || '').toLowerCase();

  // ── Rule 1: Category overlap ──────────────────────────────
  var catsA = _getCategories(lfA);
  var catsB = _getCategories(lfB);
  var commonCats = catsA.filter(function(c){ return catsB.indexOf(c) >= 0; });
  if (commonCats.length > 0) {
    score += commonCats.length * 2;
    reasons.push('ธุรกิจใกล้กัน: ' + commonCats.join(', '));
    matchType.push('category');
  }

  // ── Rule 2: A looking for B's business ───────────────────
  // ดูว่า Looking For ของ A มี keyword ที่เชื่อมกับ category ของ B
  var bOnlyCats = catsB.filter(function(c){ return catsA.indexOf(c) < 0; });
  bOnlyCats.forEach(function(cat) {
    var keywords = MATCH_CATEGORIES[cat] || [];
    keywords.forEach(function(kw) {
      if (lfA.indexOf(kw.toLowerCase()) >= 0) {
        score += 3;
        reasons.push('A ต้องการสิ่งที่ B ทำได้: "' + kw + '"');
        matchType.push('a_needs_b');
      }
    });
  });

  // ── Rule 3: B looking for A's business ───────────────────
  var aOnlyCats = catsA.filter(function(c){ return catsB.indexOf(c) < 0; });
  aOnlyCats.forEach(function(cat) {
    var keywords = MATCH_CATEGORIES[cat] || [];
    keywords.forEach(function(kw) {
      if (lfB.indexOf(kw.toLowerCase()) >= 0) {
        score += 3;
        reasons.push('B ต้องการสิ่งที่ A ทำได้: "' + kw + '"');
        matchType.push('b_needs_a');
      }
    });
  });

  // ── Rule 4: Direct keyword match ─────────────────────────
  var wordsA = _tokenize(lfA);
  var wordsB = _tokenize(lfB);
  var common = wordsA.filter(function(w){ return wordsB.indexOf(w) >= 0; });
  if (common.length > 0) {
    score += common.length;
    reasons.push('มีคำตรงกัน: "' + common.slice(0,3).join('", "') + '"');
    matchType.push('keyword');
  }

  // ── Rule 5: Bonus ถ้า cross-team ─────────────────────────
  if (a.mentor && b.mentor && a.mentor !== b.mentor && score >= 2) {
    score += 1; // bonus เล็กน้อยสำหรับ cross-team
  }

  return {
    score:     score,
    reasons:   reasons,
    matchType: matchType
  };
}

// ── Helper: หา categories จาก text ──────────────────────────
function _getCategories(text) {
  var result = [];
  var keys = Object.keys(MATCH_CATEGORIES);
  for (var i = 0; i < keys.length; i++) {
    var cat = keys[i];
    var keywords = MATCH_CATEGORIES[cat];
    for (var j = 0; j < keywords.length; j++) {
      if (text.indexOf(keywords[j].toLowerCase()) >= 0) {
        if (result.indexOf(cat) < 0) result.push(cat);
        break;
      }
    }
  }
  return result;
}

// ── Helper: tokenize text ────────────────────────────────────
function _tokenize(text) {
  return text.split(/[\s/,&+]+/)
    .map(function(w){ return w.trim(); })
    .filter(function(w){ return w.length >= 3; });
}

// ── Helper: สร้างข้อความสรุป ──────────────────────────────────
function _buildSummary(matches, totalMembers) {
  var highCount   = matches.filter(function(m){ return m.priority==='high'; }).length;
  var crossTeam   = matches.filter(function(m){ return m.cross_team; }).length;
  var sameTeam    = matches.length - crossTeam;

  if (matches.length === 0) {
    return 'สัปดาห์นี้ไม่พบคู่ที่ Looking For ตรงกัน ลองดู cross-team ด้วยตนเองครับ';
  }

  return 'พบ ' + matches.length + ' คู่จากสมาชิก ' + totalMembers + ' คน | ' +
    'สำคัญ: ' + highCount + ' คู่ | ' +
    'ข้ามทีม: ' + crossTeam + ' คู่ | ' +
    'ทีมเดียวกัน: ' + sameTeam + ' คู่';
}
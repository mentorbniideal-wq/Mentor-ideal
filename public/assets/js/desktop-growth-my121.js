/* Growth's MY121 care view is read-only. Pair creation and verification stay in MY121. */
(function () {
  'use strict';
  var cached = null;
  function root() { return document.getElementById('cross-content'); }
  function safe(value) { return esc(value == null ? '' : String(value)); }
  function render(data) {
    var target = root(); if (!target) return;
    var recent = (data.recent || []).map(function (row) {
      return '<article style="padding:12px;border:1px solid var(--bd);border-radius:10px;background:var(--sf2)"><b>' + safe(row.member || 'สมาชิก') + '</b><div style="color:var(--sub);font-size:11px;margin-top:4px">บันทึกเมื่อ ' + safe(row.loggedAt ? new Date(row.loggedAt).toLocaleDateString('th-TH') : 'ไม่ระบุวัน') + '</div></article>';
    });
    target.innerHTML = '<div style="border:1px solid var(--bd);border-radius:12px;padding:16px;background:var(--sf2)"><strong>บันทึก MY121 ใน Chapter: ' + Number(data.total || 0) + '</strong><p style="font-size:12px;color:var(--sub);margin:7px 0 0">เป็นจำนวน log ไม่ใช่จำนวนคู่ที่ยืนยันแล้ว และไม่ใช่หลักฐาน Referral หรือรายได้ การนัดและการยืนยันผลทำใน MY121 เท่านั้น</p></div>' +
      '<h3 style="font-size:13px;margin:20px 0 10px">บันทึกล่าสุด</h3>' +
      (recent.length ? '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:9px">' + recent.join('') + '</div>' : '<p style="color:var(--sub)">ยังไม่มีบันทึก MY121 ที่แสดงได้</p>');
  }
  window.growth121Load = function (force) {
    var target = root(); if (!target) return;
    if (cached && !force) { render(cached); return; }
    target.innerHTML = '<p role="status">⏳ กำลังโหลด MY121…</p>';
    gsr('getAll121Logs', {}, function (result) {
      if (!result || !result.ok) { cached = null; target.innerHTML = '<p role="alert">โหลด MY121 ไม่สำเร็จ: ' + safe(result && result.error || 'กรุณาลองใหม่') + '</p><button type="button" class="bsm" onclick="growth121Load(true)">ลองใหม่</button>'; return; }
      // The API intentionally omits private notes for Growth. Never render
      // `note` even if an unexpected response contains it.
      cached = result; render(result);
    });
  };
})();

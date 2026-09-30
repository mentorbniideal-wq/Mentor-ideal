(function () {
  'use strict';
  var state = null, loading = false, query = '', selectedId = '';
  function escape(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function call(action, payload) { return new Promise(function (resolve, reject) { gsr(action, payload || {}, function (result) { if (!result || !result.ok) reject(new Error(result && result.error || 'ดำเนินการไม่สำเร็จ')); else resolve(result); }); }); }
  function box() { return document.getElementById('pulse-pilot-admin'); }
  function draw(message) {
    var el = box(); if (!el || !state) return;
    var members = state.members || [], enabled = new Set(state.enabledMemberIds || []);
    var found = members.filter(function (m) { return (String(m.name || '') + ' ' + String(m.nickname || '')).toLowerCase().includes(query); });
    el.innerHTML = '<section class="mg-panel" aria-labelledby="pulsePilotTitle"><h4 id="pulsePilotTitle">ทดลอง Member Pulse เฉพาะรายคน</h4>' +
      '<p class="mg-muted">ระบบปกติยังปิดอยู่ · เปิดสิทธิ์ให้สมาชิกที่ผูก LINE แล้วพิมพ์ “Pulse” ในแชทเพื่อเปิดแบบสอบถาม · ไม่มีการส่ง LINE อัตโนมัติ</p>' +
      '<label for="pulsePilotSearch">ค้นหาสมาชิก</label><input id="pulsePilotSearch" type="search" autocomplete="off" value="' + escape(query) + '" placeholder="ชื่อหรือชื่อเล่น">' +
      '<label for="pulsePilotMember">เลือกสมาชิกใน Chapter</label><select id="pulsePilotMember"><option value="">เลือกสมาชิก</option>' +
      found.map(function (m) { return '<option value="' + escape(m.id) + '"' + (selectedId === m.id ? ' selected' : '') + '>' + escape(m.name || m.nickname || m.id) + (m.nickname ? ' (' + escape(m.nickname) + ')' : '') + (enabled.has(m.id) ? ' · เปิดทดลอง' : '') + '</option>'; }).join('') + '</select>' +
      '<p id="pulsePilotState" role="status">' + escape(message || (selectedId ? (enabled.has(selectedId) ? 'บัญชีนี้เปิดทดลองอยู่' : 'บัญชีนี้ยังไม่ได้เปิดทดลอง') : 'เลือกสมาชิกเพื่อเปิดหรือปิดสิทธิ์')) + '</p>' +
      '<button type="button" class="bsm" id="pulsePilotEnable"' + (!selectedId ? ' disabled' : '') + '>เปิดให้ทดลอง</button> <button type="button" class="bsm" id="pulsePilotDisable"' + (!selectedId ? ' disabled' : '') + '>ปิดสิทธิ์ทดลอง</button></section>';
  }
  window.renderMemberPulsePilotAdmin = function () {
    var el = box(); if (!el) return;
    if (state) { draw(); return; }
    if (loading) { el.textContent = 'กำลังโหลดสิทธิ์ทดลอง…'; return; }
    loading = true; el.textContent = 'กำลังโหลดสิทธิ์ทดลอง…';
    call('getMemberPulsePilotAccess', {}).then(function (result) { state = result; draw(); }).catch(function (error) {
      if (box()) box().textContent = /เฉพาะ Chapter Admin/.test(error.message) ? '' : 'โหลดสิทธิ์ทดลองไม่ได้: ' + error.message;
    }).finally(function () { loading = false; });
  };
  document.addEventListener('input', function (event) {
    if (event.target.id !== 'pulsePilotSearch') return;
    query = event.target.value.toLowerCase(); selectedId = ''; draw();
    var input = document.getElementById('pulsePilotSearch'); if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  });
  document.addEventListener('change', function (event) { if (event.target.id === 'pulsePilotMember') { selectedId = event.target.value; draw(); } });
  document.addEventListener('click', function (event) {
    var enabled = event.target.id === 'pulsePilotEnable';
    if (!enabled && event.target.id !== 'pulsePilotDisable') return;
    if (!selectedId || !window.confirm((enabled ? 'เปิด' : 'ปิด') + 'สิทธิ์ทดลอง Member Pulse ของสมาชิกที่เลือก?')) return;
    event.target.disabled = true;
    call('setMemberPulsePilotAccess', { memberId: selectedId, enabled: enabled }).then(function () {
      state.enabledMemberIds = enabled ? Array.from(new Set((state.enabledMemberIds || []).concat(selectedId))) : (state.enabledMemberIds || []).filter(function (id) { return id !== selectedId; });
      draw(enabled ? 'เปิดสิทธิ์แล้ว สมาชิกพิมพ์ Pulse ในแชทเพื่อทดลองได้' : 'ปิดสิทธิ์แล้ว');
    }).catch(function (error) { draw(error.message); });
  });
})();

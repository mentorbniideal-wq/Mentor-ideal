(function () {
  'use strict';
  var files = new Map(), previews = new Map(), history = [], busy = '', error = '';
  function el(id) { return document.getElementById(id); }
  function safe(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]; }); }
  function call(action, payload) { return new Promise(function (resolve, reject) { gsr(action, payload, function (result) { result && result.ok ? resolve(result) : reject(new Error(result && result.error || 'ดำเนินการไม่สำเร็จ')); }); }); }
  function localMonth() { var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit' }).format(new Date()).split('-'); return Number(parts[0]) * 12 + Number(parts[1]) - 2; }
  function monthKey(index) { var year = Math.floor(index / 12), month = index % 12 + 1; return year + '-' + String(month).padStart(2, '0'); }
  function monthIndex(key) { var parts = String(key || '').split('-'); return Number(parts[0]) * 12 + Number(parts[1]) - 1; }
  function monthLabel(key) { var parts = key.split('-'); return new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(new Date(Number(parts[0]), Number(parts[1]) - 1, 1)); }
  function fileState(period) { if (!files.has(period)) files.set(period, {}); return files.get(period); }
  function shownBatch(period) { return history.find(function (row) { return row.period_year + '-' + String(row.period_month).padStart(2, '0') === period && row.status !== 'previewed'; }); }
  function batchStatus(row) {
    if (!row) return { text: 'ยังไม่มีข้อมูล', tone: 'empty' };
    var hashes = row.file_hashes || {};
    if (row.status === 'completed' && hashes.trafficLightEvolution && hashes.memberTrafficLight && hashes.reporting2You) return { text: 'COMPLETE', tone: 'complete' };
    if (row.status === 'failed') return { text: 'FAILED', tone: 'error' };
    if (row.status === 'running') return { text: 'กำลังนำเข้า', tone: 'pending' };
    return { text: 'PARTIAL', tone: 'partial' };
  }
  function fileControl(period, key, label) {
    var file = fileState(period)[key], name = file ? file.name : 'เลือกไฟล์ CSV';
    return '<label class="history-file' + (file ? ' selected' : '') + '"><span class="history-file-label">' + safe(label) + '</span><span class="history-file-name" title="' + safe(name) + '">' + safe(name) + '</span><input type="file" accept=".csv,text/csv" data-history-file="' + key + '" data-history-period="' + period + '" aria-label="' + safe(label + ' งวด ' + period) + '"></label>';
  }
  function row(period) {
    var batch = shownBatch(period), state = batchStatus(batch), chosen = fileState(period);
    var ready = Boolean(chosen.trafficLightEvolution && chosen.memberTrafficLight && chosen.reporting2You);
    return '<div class="history-row" data-period="' + period + '"><div class="history-period"><b>' + safe(monthLabel(period)) + '</b><small>' + period + '</small></div>' +
      fileControl(period, 'trafficLightEvolution', 'Evolution') + fileControl(period, 'memberTrafficLight', 'Member TL') + fileControl(period, 'reporting2You', 'Reporting2You') +
      '<div class="history-state"><span class="history-status ' + state.tone + '">' + state.text + '</span></div>' +
      '<button type="button" class="history-review" data-history-preview="' + period + '"' + (!ready || busy ? ' disabled' : '') + '>ตรวจไฟล์ <span aria-hidden="true">↗</span></button></div>';
  }
  function canUseHistory() { return Boolean(S.token && S.isVerifiedAdmin && !S.isReadOnly && !S.isViewer); }
  window.moveHistoryWindow = function (delta) {
    var input = el('history-window-end');
    input.value = monthKey(Math.min(localMonth(), monthIndex(input.value) + delta));
    window.renderHistoryGrid();
  };
  window.renderHistoryGrid = function () {
    var grid = el('history-grid'), input = el('history-window-end'); if (!grid || !input) return;
    var end = Math.min(localMonth(), monthIndex(input.value || monthKey(localMonth())));
    if (!Number.isFinite(end)) end = localMonth();
    input.value = monthKey(end); input.max = monthKey(localMonth());
    grid.innerHTML = '<div class="history-head" aria-hidden="true"><span>งวดรายงาน</span><span>TRAFFIC LIGHTS EVOLUTION</span><span>MEMBER TRAFFIC LIGHT</span><span>REPORTING2YOU</span><span>สถานะ</span><span>ดำเนินการ</span></div>' +
      Array.from({ length: 10 }, function (_, index) { return row(monthKey(end - index)); }).join('');
  };
  window.loadHistoryGrid = function () {
    var grid = el('history-grid'); if (!grid) return;
    if (!canUseHistory()) { grid.innerHTML = '<p class="history-error" role="alert">หน้านี้สำหรับเจ้าของระบบหรือ Admin ที่เข้าสู่ระบบด้วย Google เท่านั้น</p>'; return; }
    if (!el('history-window-end').value) el('history-window-end').value = monthKey(localMonth());
    grid.textContent = 'กำลังโหลดสถานะรายงวด…';
    return call('getMonthlySyncHistory', { role: S.role }).then(function (result) {
      history = (result.rows || []).slice().sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
      error = ''; window.renderHistoryGrid();
    }).catch(function (reason) { error = reason.message; grid.innerHTML = '<p class="history-error" role="alert">โหลดประวัติไม่สำเร็จ: ' + safe(error) + ' <button type="button" onclick="loadHistoryGrid()">ลองใหม่</button></p>'; });
  };
  function readFile(file) { return new Promise(function (resolve, reject) {
    if (file.size > 8 * 1024 * 1024) return reject(new Error(file.name + ' ใหญ่เกิน 8 MB'));
    var reader = new FileReader(); reader.onload = function () { resolve(String(reader.result || '')); }; reader.onerror = function () { reject(new Error('อ่าน ' + file.name + ' ไม่สำเร็จ')); }; reader.readAsText(file, 'UTF-8');
  }); }
  function previewArea(html) { var target = el('history-preview'); if (target) { target.innerHTML = html; target.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }
  async function preview(period) {
    if (busy) return;
    var selected = fileState(period), keys = ['trafficLightEvolution', 'memberTrafficLight', 'reporting2You'];
    if (!keys.every(function (key) { return selected[key]; })) return;
    busy = period; window.renderHistoryGrid(); previewArea('<p role="status">กำลังอ่านและตรวจทั้ง 3 ไฟล์ของงวด ' + period + '…</p>');
    try {
      var values = await Promise.all(keys.map(function (key) { return readFile(selected[key]); }));
      var payload = { role: S.role, reportingPeriod: period, tlCsv: values[0], memberTLCsv: values[1], r2yCsv: values[2],
        sourceFiles: { trafficLightEvolution: selected.trafficLightEvolution.name, memberTrafficLight: selected.memberTrafficLight.name, reporting2You: selected.reporting2You.name } };
      var result = await call('previewHistoricalBackfill', payload);
      previews.set(period, { payload: payload, result: result });
      var quality = result.quality || {};
      previewArea('<div class="history-preview-card"><span class="history-eyebrow">PREVIEW · ' + period + '</span><h4>ตรวจงวด ' + safe(monthLabel(period)) + '</h4>' +
        '<div class="history-preview-stats"><div><strong>' + Number(quality.affectedMembers || 0) + '</strong><span>สมาชิกที่จับคู่ได้</span></div><div><strong>' + Number(quality.evolutionRows || 0) + '</strong><span>คะแนน Evolution</span></div><div><strong>' + (Number(quality.memberTrafficLightRows || 0) + Number(quality.reporting2YouRows || 0)) + '</strong><span>Snapshot จาก 2 รายงาน</span></div></div>' +
        '<p class="history-preview-note">' + (quality.memberTrafficLightPeriodVerified ? '✓ เดือนใน Member Traffic Light ตรงกับงวดที่เลือก' : '⚠️ ไฟล์ Member Traffic Light ไม่ระบุเดือนที่ตรวจได้ โปรดยืนยันจากต้นฉบับ') + '</p>' +
        (result.replacingPeriod ? '<p class="history-preview-alert">งวดนี้มีข้อมูลแล้ว การยืนยันจะใช้ไฟล์ชุดนี้เป็น snapshot ล่าสุด โดยเก็บ hash และ batch เดิมไว้ตรวจสอบ</p>' : '') +
        (result.alreadyCompleted ? '<p class="history-preview-note">ไฟล์ชุดนี้นำเข้าแล้ว ไม่สร้างรายการซ้ำ</p>' : '<button type="button" class="history-commit" data-history-commit="' + period + '">ยืนยันบันทึก Snapshot งวดนี้</button>') + '</div>');
    } catch (reason) { previews.delete(period); previewArea('<p class="history-error" role="alert">ตรวจไฟล์ไม่สำเร็จ: ' + safe(reason.message) + '</p>'); }
    finally { busy = ''; window.renderHistoryGrid(); }
  }
  async function commit(period) {
    var record = previews.get(period); if (!record || busy) return;
    if (!window.confirm('ยืนยันนำเข้ารายงาน ' + period + ' ทั้ง 3 ไฟล์?\nโหมดนี้จะเก็บเฉพาะ Historical Snapshot ไม่แก้ค่าปัจจุบันของสมาชิก')) return;
    busy = period; window.renderHistoryGrid(); previewArea('<p role="status">กำลังบันทึก Historical Snapshot ' + period + '…</p>');
    try {
      var result = await call('commitHistoricalBackfill', Object.assign({}, record.payload, { batchId: record.result.batchId, previewToken: record.result.previewToken, confirmed: true }));
      previews.delete(period); files.delete(period);
      previewArea('<p class="history-success" role="status">✓ บันทึก ' + safe(period) + ' สำเร็จ · ' + Number(result.importedSnapshots || 0) + ' snapshot · ไม่เปลี่ยนข้อมูลปัจจุบัน</p>');
      await window.loadHistoryGrid();
    } catch (reason) { previewArea('<p class="history-error" role="alert">บันทึกไม่สำเร็จ: ' + safe(reason.message) + '</p>'); }
    finally { busy = ''; window.renderHistoryGrid(); }
  }
  document.addEventListener('change', function (event) {
    var input = event.target; if (!input || !input.dataset || !input.dataset.historyFile) return;
    var period = input.dataset.historyPeriod, key = input.dataset.historyFile;
    fileState(period)[key] = input.files && input.files[0] || null;
    previews.delete(period); if (el('history-preview')) el('history-preview').innerHTML = '';
    window.renderHistoryGrid();
  });
  document.addEventListener('click', function (event) {
    var review = event.target.closest('[data-history-preview]'), save = event.target.closest('[data-history-commit]');
    if (review) preview(review.dataset.historyPreview);
    if (save) commit(save.dataset.historyCommit);
  });
})();

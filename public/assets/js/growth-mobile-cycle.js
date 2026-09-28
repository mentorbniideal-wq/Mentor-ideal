(function () {
  'use strict';
  var api = window.growthMobileApi;
  var state = window.growthMobileState;
  var board = null, pending = null, detail = null, context = null;
  var tab = 'due', month = 1, search = '';

  function root() { return document.getElementById('gm-cycle-root'); }
  function safe(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]; }); }
  function label(value) { return {not_recorded:'ยังไม่มีบันทึก',open:'เปิดอยู่',in_progress:'กำลังติดตาม',waiting_member:'รอสมาชิก',completed:'เสร็จแล้ว'}[value] || value || 'ยังไม่มีบันทึก'; }
  function date(value) { return value ? safe(value) : 'ยังไม่มีวันที่ยืนยัน'; }
  function active() { return !!document.getElementById('gm-view-cycle')?.classList.contains('is-active'); }
  function canWrite() { return !!detail?.canManage && !state.isReadOnly && (state.capabilities || []).some(function (cap) { return cap === '*' || cap === 'growth.coordinate'; }); }
  function notice(message) { if (window.growthMobileToast) window.growthMobileToast(message); }
  function showError(message) { if (root()) root().innerHTML = '<div class="gm-empty" role="alert">'+safe(message)+'<br><button type="button" class="gm-cycle-retry" data-cycle-refresh>ลองใหม่</button></div>'; }
  function ensureButton() {
    var sheet = document.getElementById('gm-sheet-body');
    if (!sheet) return;
    var actions = sheet.querySelector('.gm-task-actions'), source = sheet.querySelector('[data-growth-action][data-growth-member]');
    if (!actions || !source || actions.querySelector('[data-growth-cycle]')) return;
    var button = document.createElement('button');
    button.type = 'button'; button.dataset.growthCycle = source.dataset.growthMember;
    button.textContent = '🗓️ รอบสมาชิก 12 เดือน'; actions.appendChild(button);
  }
  function homeDue() {
    var el = document.getElementById('gm-cycle-due'); if (!el) return;
    var rows = board?.dueWork || [];
    el.innerHTML = rows.length ? rows.slice(0, 5).map(function (row) {
      return '<button type="button" class="gm-card" data-growth-cycle="'+safe(row.memberId)+'" data-cycle-month="'+Number(row.month)+'"><b>'+safe(row.memberName)+'</b><div class="gm-meta">เดือน '+Number(row.month)+' · '+safe(row.milestone)+' · '+date(row.dueDate)+'</div></button>';
    }).join('') + '<button type="button" class="gm-cycle-link" data-cycle-nav>ดูงานและสมาชิกทั้งหมด →</button>' : '<div class="gm-empty">ยังไม่มี Growth Cycle follow-up ใน 30 วันข้างหน้า</div><button type="button" class="gm-cycle-link" data-cycle-nav>เปิดรอบสมาชิก →</button>';
  }
  function navigation() {
    return '<nav class="gm-cycle-tabs" aria-label="มุมมองรอบสมาชิก">'+[
      ['due','งานถึงกำหนด'],['members','สมาชิก'],['timeline','Timeline รายคน'],['overview','ภาพรวม Chapter']
    ].map(function (item) { return '<button type="button" data-cycle-tab="'+item[0]+'" '+(tab === item[0] ? 'aria-current="page"' : '')+'>'+item[1]+'</button>'; }).join('')+'</nav>';
  }
  function summary() {
    var s = board?.summary || {};
    return '<div class="gm-cycle-summary"><article><b>'+Number(s.activeMembers || 0)+'</b><span>สมาชิกในทะเบียน</span></article><article><b>'+Number(s.dueNow || 0)+'</b><span>งานถึงกำหนด/เกินกำหนด</span></article><article><b>'+Number(s.missingExpiry || 0)+'</b><span>ยังไม่มีวันหมดอายุที่ยืนยัน</span></article></div>';
  }
  function dueView() {
    var rows = board?.dueWork || [];
    return '<h3>งานช่วง 30 วัน</h3><p class="gm-meta">เรียงเกินกำหนด → ใกล้ถึงกำหนด → กำลังจะถึง · ไม่ใช่ Growth Tasks ทั้งหมด</p>'+summary()+
      (rows.length ? '<div class="gm-list">'+rows.map(function (row) { return '<button type="button" class="gm-card" data-cycle-open="'+safe(row.memberId)+'" data-cycle-month="'+Number(row.month)+'"><span class="gm-cycle-row-head"><b>'+safe(row.memberName)+'</b><small>'+date(row.dueDate)+'</small></span><span class="gm-meta">เดือน '+Number(row.month)+' · '+safe(row.milestone)+' · '+safe(row.owner)+'</span><span class="gm-cycle-status">'+safe({overdue:'เกินกำหนด',due_soon:'ใกล้ถึงกำหนด',upcoming:'กำลังจะถึง'}[row.urgency] || '')+' · '+safe(label(row.status))+'</span></button>'; }).join('')+'</div>' : '<div class="gm-empty">ไม่มีงาน Growth Cycle ใน 30 วันข้างหน้า</div>');
  }
  function membersView() {
    var rows = (board?.members || []).filter(function (row) { return !search || String((row.name || '')+' '+(row.nickname || '')).toLowerCase().includes(search); });
    return '<h3>ทะเบียนสมาชิก</h3><p class="gm-meta">เลือกรายชื่อเพื่อดูรอบสมาชิกและงานที่เกี่ยวข้อง</p><label class="gm-cycle-search">ค้นหาสมาชิก<input type="search" id="gm-cycle-search" placeholder="ชื่อหรือชื่อเล่น" value="'+safe(search)+'" autocomplete="off"></label><p class="gm-meta">แสดง '+rows.length+' จาก '+(board?.members || []).length+' คน</p>'+
      '<div class="gm-list" id="gm-cycle-members">'+(rows.length ? rows.map(function (row) { return '<button type="button" class="gm-card" data-cycle-open="'+safe(row.memberId)+'"><b>'+safe(row.nickname || row.name)+'</b><span class="gm-meta">'+safe(row.isNewMember ? 'สมาชิกใหม่' : 'สมาชิก')+' · หมดอายุ '+date(row.expiryDate)+'</span><span class="gm-meta">'+safe(row.nextMilestone || 'ยังไม่มี milestone ถัดไป')+' · '+safe(row.currentMonth ? 'เดือน '+row.currentMonth : 'ยังไม่มีรอบที่ยืนยัน')+'</span></button>'; }).join('') : '<div class="gm-empty">ไม่พบสมาชิกตามคำค้น</div>')+'</div>';
  }
  function overviewView() {
    var s = board?.summary || {};
    return '<h3>ภาพรวม Chapter</h3><p class="gm-meta">ข้อมูลตามรอบสมาชิกที่ยืนยันแล้ว · ไม่ใช่การประเมินผลสมาชิก</p>'+summary()+
      '<article class="gm-context-card"><h3>จังหวะงานที่ควรทบทวน</h3><p>งานถึงกำหนดหรือเกินกำหนด '+Number(s.dueNow || 0)+' รายการ · งานใกล้ถึงกำหนด '+Number(s.dueSoon || 0)+' รายการ</p><p class="gm-meta">เปิด Timeline รายคนเพื่อดูสถานะและข้อมูลที่ได้รับอนุญาต</p></article>';
  }
  function timelineView() {
    if (!detail) return '<div class="gm-empty">เลือกสมาชิกจากแท็บ “สมาชิก” หรือ “งานถึงกำหนด” ก่อน</div>';
    if (detail.unavailable) return '<h3>'+safe(detail.member?.nickname || detail.member?.name)+'</h3><div class="gm-empty">'+safe(detail.unavailable)+'</div>';
    var cycles = [detail.expiryDate].concat(detail.cycleHistory || []).filter(function (value, index, list) { return value && list.indexOf(value) === index; });
    var node = (detail.nodes || []).find(function (item) { return Number(item.month) === month; }) || {};
    var entry = (detail.entries || []).find(function (item) { return Number(item.month) === month; }) || {};
    var notes = entry.detailRestricted ? [] : (detail.notes || []).filter(function (item) { return String(item.entry_id) === String(entry.id); });
    var writable = canWrite() && month !== 3 && month !== 12;
    var bp = (context?.blueprints || []).filter(function (item) { return item.status === 'submitted'; }).slice(-1)[0];
    return '<div class="gm-cycle-head"><h3>'+safe(detail.member.nickname || detail.member.name)+'</h3><span>เริ่ม '+date(detail.cycleStartDate)+' · หมดอายุ '+date(detail.expiryDate)+'</span></div>'+
      (cycles.length > 1 ? '<label class="gm-cycle-search">เลือกรอบสมาชิก<select id="gm-cycle-history">'+cycles.map(function (value) { return '<option value="'+safe(value)+'" '+(value === detail.expiryDate ? 'selected' : '')+'>'+safe(value)+'</option>'; }).join('')+'</select></label>' : '')+
      '<div class="gm-cycle-timeline" role="group" aria-label="Timeline 12 เดือน">'+(detail.nodes || []).map(function (item) { return '<button type="button" class="gm-cycle-node" data-cycle-select="'+Number(item.month)+'" aria-current="'+(item.month === month ? 'step' : 'false')+'"><span class="gm-cycle-dot">'+Number(item.month)+'</span><span><b>เดือน '+Number(item.month)+(item.milestone ? ' · '+safe(item.milestone.label) : '')+'</b><small>'+date(item.dueDate)+' · '+safe(label(item.status))+(item.hasNote ? ' · มีบันทึก' : '')+'</small></span></button>'; }).join('')+'</div>'+
      '<article class="gm-context-card gm-cycle-panel"><h3>เดือน '+month+' · '+safe(node.milestone?.label || 'เช็กความคืบหน้า')+'</h3><p class="gm-meta">ผู้รับผิดชอบ: '+safe(node.milestone?.owner || 'Growth')+' · กำหนด '+date(node.dueDate)+'</p>'+
      (month === 1 ? '<p class="gm-meta">เป้าหมายจาก Blueprint ปัจจุบัน: '+(bp?.businessTargetThb != null ? safe(Number(bp.businessTargetThb).toLocaleString('th-TH'))+' บาท' : 'ไม่มีข้อมูลที่ได้รับอนุญาต')+' · Looking For: '+safe(context?.business?.lookingForCategories?.join(', ') || 'ไม่มีข้อมูลที่ได้รับอนุญาต')+'</p>' : '')+
      (month === 3 ? '<p class="gm-meta">Mentor review: '+(detail.mentorReview?.status === 'completed' ? 'มีบันทึกยืนยันวันที่ '+date(detail.mentorReview.reviewDate) : 'ยังไม่มีบันทึกยืนยัน')+' · ไม่แสดง Mentor-private</p>' : '')+
      (month === 6 ? '<p class="gm-meta">ผลตาม Blueprint ปี '+safe(bp?.year || '—')+': '+(bp?.actualReceivedThb != null ? safe(Number(bp.actualReceivedThb).toLocaleString('th-TH'))+' บาท' : 'ไม่มีข้อมูลที่ได้รับอนุญาต')+' · เทียบเป้า '+(bp?.achievementPercent != null ? safe(bp.achievementPercent)+'%' : 'คำนวณไม่ได้หรือเป้าเป็น 0')+'</p>' : '')+
      (month === 12 ? '<p class="gm-meta">สถานะต่ออายุจาก Membership: '+safe(detail.renewalStatus || 'Unknown')+'</p>' : '')+
      (entry.detailRestricted ? '<p class="gm-cycle-restricted">รายละเอียดถูกจำกัดตาม consent ปัจจุบัน · สถานะและวันติดตามยังแสดงได้</p>' : '')+
      '<p>สถานะ: '+safe(label(entry.status || node.status))+' · วันติดตาม: '+date(entry.followUpDate)+'</p>'+
      (!entry.detailRestricted && entry.result ? '<p><b>ผล:</b> '+safe(entry.result)+'</p>' : '')+
      (!entry.detailRestricted && entry.issue ? '<p><b>ปัญหา:</b> '+safe(entry.issue)+'</p>' : '')+
      (!entry.detailRestricted && entry.nextAction ? '<p><b>งานถัดไป:</b> '+safe(entry.nextAction)+'</p>' : '')+
      '<p class="gm-meta">Growth Task: '+safe(entry.relatedGrowthTaskId ? 'เชื่อมแล้ว' : 'ยังไม่เชื่อม')+' · MY121 ที่ยืนยัน: '+safe(entry.relatedMy121Id ? 'เชื่อมแล้ว' : 'ยังไม่เชื่อม')+' · Handoff: '+safe(entry.handoffStatus || 'ยังไม่ส่ง')+'</p>'+
      (writable ? '<form id="gm-cycle-entry"><label>สถานะ<select name="status">'+['open','in_progress','waiting_member','completed'].map(function (value) { return '<option value="'+value+'" '+(value === entry.status ? 'selected' : '')+'>'+safe(label(value))+'</option>'; }).join('')+'</select></label><label>ผล<input name="result" maxlength="1000" value="'+safe(entry.detailRestricted ? '' : entry.result || '')+'"></label><label>ปัญหา<input name="issue" maxlength="1000" value="'+safe(entry.detailRestricted ? '' : entry.issue || '')+'"></label><label>งานถัดไป<input name="nextAction" maxlength="1000" value="'+safe(entry.detailRestricted ? '' : entry.nextAction || '')+'"></label><label>วันติดตาม<input name="followUpDate" type="date" value="'+safe(entry.followUpDate || '')+'"></label><button type="submit" class="gm-primary">บันทึก</button></form>' : '')+
      (writable && entry.id ? '<form id="gm-cycle-note"><label>เพิ่มบันทึกใหม่ (แก้ย้อนหลังไม่ได้)<textarea name="body" maxlength="2000" required></textarea></label><button type="submit" class="gm-primary">เพิ่มบันทึก</button></form>' : '')+
      '<h4>ประวัติบันทึก</h4>'+(notes.length ? notes.map(function (item) { return '<div class="gm-card"><small>'+safe(item.created_at)+' · '+safe(item.created_by)+'</small><p>'+safe(item.body)+'</p></div>'; }).join('') : '<p class="gm-meta">'+(entry.detailRestricted ? 'บันทึกถูกจำกัด' : 'ยังไม่มีบันทึก')+'</p>')+'</article>';
  }
  function render() { if (!active() || !root()) return; root().innerHTML = navigation() + (tab === 'due' ? dueView() : tab === 'members' ? membersView() : tab === 'overview' ? overviewView() : timelineView()); }
  function loadBoard(force) {
    if (!force && board) { homeDue(); render(); return Promise.resolve(board); }
    if (pending) return pending;
    if (force) { board = null; detail = null; context = null; }
    var el = document.getElementById('gm-cycle-due'); if (el) el.innerHTML = '<div class="gm-empty">กำลังโหลด Growth Cycle…</div>';
    if (active() && root()) root().innerHTML = '<div class="gm-empty" role="status">กำลังโหลด Member Growth…</div>';
    pending = api('getMemberGrowthBoard').then(function (result) { board = result; homeDue(); render(); return result; }).catch(function (err) {
      if (el) el.innerHTML = '<div class="gm-empty" role="alert">'+safe(err.message || 'โหลด Growth Cycle ไม่สำเร็จ')+' <button type="button" data-cycle-refresh>ลองใหม่</button></div>';
      if (active()) showError(err.message || 'โหลด Growth Cycle ไม่สำเร็จ');
      throw err;
    }).finally(function () { pending = null; });
    return pending;
  }
  function open(memberId, selected, expiryDate) {
    var nav = document.querySelector('.gm-nav [data-view="cycle"]'); if (nav && !active()) nav.click();
    tab = 'timeline'; month = Number(selected) || 1;
    detail = null; context = null;
    if (root()) root().innerHTML = '<div class="gm-empty" role="status">กำลังโหลด Timeline…</div>';
    return Promise.all([api('getMemberGrowthTimeline', { memberId: memberId, expiryDate: expiryDate || undefined }),
      api('getGrowthMemberContext', { memberId: memberId }).catch(function () { return null; })]).then(function (results) {
      detail = results[0]; context = results[1]; render();
    }).catch(function (err) { showError(err.message || 'โหลด Timeline ไม่สำเร็จ'); });
  }
  function refreshDetail() {
    if (!detail?.member?.id) return;
    var memberId = detail.member.id, selected = month, expiry = detail.expiryDate;
    return loadBoard(true).catch(function () { return null; }).then(function () { return open(memberId, selected, expiry); });
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-growth-cycle],[data-cycle-open],[data-cycle-nav],[data-cycle-select],[data-cycle-tab],[data-cycle-refresh]');
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (button.hasAttribute('data-cycle-refresh')) { loadBoard(true).catch(function () {}); return; }
    if (button.hasAttribute('data-cycle-nav')) { document.querySelector('.gm-nav [data-view="cycle"]')?.click(); return; }
    if (button.dataset.cycleTab) { tab = button.dataset.cycleTab; render(); return; }
    if (button.dataset.cycleSelect) { month = Number(button.dataset.cycleSelect); render(); return; }
    open(button.dataset.growthCycle || button.dataset.cycleOpen, button.dataset.cycleMonth);
  }, true);
  document.addEventListener('input', function (event) {
    if (event.target?.id !== 'gm-cycle-search') return;
    search = event.target.value.toLowerCase();
    var list = document.getElementById('gm-cycle-members'); if (!list) return;
    var rows = (board?.members || []).filter(function (row) { return String((row.name || '')+' '+(row.nickname || '')).toLowerCase().includes(search); });
    list.innerHTML = rows.map(function (row) { return '<button type="button" class="gm-card" data-cycle-open="'+safe(row.memberId)+'"><b>'+safe(row.nickname || row.name)+'</b><span class="gm-meta">'+safe(row.isNewMember ? 'สมาชิกใหม่' : 'สมาชิก')+' · หมดอายุ '+date(row.expiryDate)+'</span><span class="gm-meta">'+safe(row.nextMilestone || 'ยังไม่มี milestone ถัดไป')+' · '+safe(row.currentMonth ? 'เดือน '+row.currentMonth : 'ยังไม่มีรอบที่ยืนยัน')+'</span></button>'; }).join('') || '<div class="gm-empty">ไม่พบสมาชิกตามคำค้น</div>';
    var count = document.querySelector('#gm-cycle-root > .gm-meta'); if (count) count.textContent = 'แสดง '+rows.length+' จาก '+(board?.members || []).length+' คน';
  });
  document.addEventListener('change', function (event) { if (event.target?.id === 'gm-cycle-history' && detail?.member?.id) open(detail.member.id, 1, event.target.value); });
  document.addEventListener('submit', function (event) {
    var form = event.target; if (!form || !['gm-cycle-entry','gm-cycle-note'].includes(form.id)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!canWrite() || !detail?.member?.id || month === 3 || month === 12) return;
    var action = form.id === 'gm-cycle-entry' ? 'saveMemberGrowthEntry' : 'appendMemberGrowthNote';
    var payload = { memberId: detail.member.id, month: month };
    new FormData(form).forEach(function (value, key) { payload[key] = value; });
    if (action === 'appendMemberGrowthNote') payload.requestKey = 'growth-note:'+crypto.randomUUID();
    var button = form.querySelector('button[type="submit"]'); if (button) button.disabled = true;
    api(action, payload).then(function () { notice('บันทึกแล้ว'); return refreshDetail(); }).catch(function (err) { notice(err.message || 'บันทึกไม่สำเร็จ'); }).finally(function () { if (button) button.disabled = false; });
  }, true);
  document.querySelector('.gm-nav [data-view="cycle"]')?.addEventListener('click', function () { loadBoard().catch(function () {}); });
  document.getElementById('gm-refresh')?.addEventListener('click', function () { loadBoard(true).catch(function () {}); });
  var sheet = document.getElementById('gm-sheet-body'); if (sheet) new MutationObserver(ensureButton).observe(sheet, { childList: true, subtree: true });
  var app = document.getElementById('gm-app'); if (app) new MutationObserver(function () { if (!app.hidden) loadBoard().catch(function () {}); }).observe(app, { attributes: true, attributeFilter: ['hidden'] });
  if (app && !app.hidden) loadBoard().catch(function () {});
})();

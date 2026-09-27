/* Growth Mobile Action Board: composes existing safe, server-scoped DTOs.
 * It creates no records and deliberately routes actions to existing workflows. */
(function () {
  'use strict';

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function state() { return window.growthMobileState || {}; }
  function coordinator() { return !!(window.growthMobileCanCoordinate && window.growthMobileCanCoordinate()); }
  function done(task) { return ['completed', 'cancelled', 'done'].includes(String(task && task.status || '').toLowerCase()); }
  function openTask(task) { return '<button class="gm-card-action" data-go="tasks">เปิด Task</button>'; }
  function openMember(id, label) { return id ? '<button class="gm-card-action" data-member="' + esc(id) + '">' + esc(label || 'ดูสมาชิก') + '</button>' : '<button class="gm-card-action" data-go="members">ดูสมาชิก</button>'; }
  function card(item) {
    return '<article class="gm-card gm-today-card' + (item.restricted ? ' is-restricted' : '') + '"><div class="gm-card-top"><span class="gm-avatar">' + esc(item.icon || '•') + '</span><span class="gm-card-main"><b>' + esc(item.member || item.title || 'Growth action') + '</b><div class="gm-meta">' + esc(item.kind || 'Growth') + ' · ' + esc(item.status || 'ต้องติดตาม') + '</div></span></div><p class="gm-card-reason">' + esc(item.reason || 'มีรายการที่ต้องตรวจสอบ') + '</p><p class="gm-card-evidence">หลักฐาน: ' + esc(item.evidence || 'ข้อมูลจากระบบ') + (item.owner ? ' · ผู้ดูแล: ' + esc(item.owner) : '') + (item.due ? ' · กำหนด: ' + esc(item.due) : '') + '</p>' + item.action + '</article>';
  }
  function section(title, hint, cards) { return cards.length ? '<section class="gm-action-section"><h3>' + esc(title) + ' <span class="gm-meta">' + cards.length + '</span></h3><p>' + esc(hint) + '</p><div class="gm-list">' + cards.join('') + '</div></section>' : ''; }

  function render() {
    var s = state(), today = document.getElementById('gm-next-actions'), summary = document.getElementById('gm-today-summary'), power = document.getElementById('gm-power-actions');
    if (!today) return;
    var tasks = (s.tasks || []).filter(function (t) { return !done(t); });
    var handoffs = coordinator() ? (s.handoffs || []).filter(function (h) { return !h.taskId && !['resolved', 'cancelled'].includes(String(h.status || '')); }) : [];
    var connections = (s.connections || []).filter(function (x) { return !x.existingTask; });
    var opportunities = s.opportunities || [];
    var followups = tasks.filter(function (t) { return String(t.status) === 'waiting_member' || (t.dueDate && new Date(t.dueDate + 'T23:59:59') < new Date()); });
    var handoffCards = handoffs.map(function (h) { return card({ icon: '↗', member: h.memberName, kind: 'MENTOR HANDOFF', status: h.status || 'NEW', reason: h.detailRestricted ? 'รายละเอียดถูกจำกัดตามสิทธิ์และการยินยอม' : (h.reason || 'Mentor ขอให้ช่วยเรื่องธุรกิจ'), evidence: 'member_signal · safe handoff', owner: h.assignedOwnerName || 'รอมอบหมาย', due: h.dueDate, restricted: h.detailRestricted, action: '<button class="gm-card-action" data-go="support">รับเรื่องและมอบหมาย</button>' }); });
    var taskCards = followups.map(function (t) { return card({ icon: '✓', member: t.memberName, kind: 'FOLLOW-UP', status: t.status, reason: t.note || 'Task นี้มีสถานะหรือกำหนดติดตามที่ต้องขยับ', evidence: t.status === 'waiting_member' ? 'กำลังรอสมาชิกตอบ' : 'เลยกำหนดติดตาม', owner: t.assignedOwnerName || t.assignedOwnerEmail || 'ยังไม่มอบหมาย', due: t.dueDate, action: openTask(t) }); });
    var connectionCards = connections.slice(0, 4).map(function (x) { var ids = x.memberIds || []; return card({ icon: '↔', member: x.title, kind: 'CONNECTION OPPORTUNITY', status: x.confidence || 'REVIEW', reason: x.why, evidence: (x.evidence || []).join(' · '), action: openMember(ids[0], 'ดูบริบทสมาชิก') }); });
    var priorityCards = (s.priorities || []).filter(function (x) { return x.type !== 'GROWTH_FOLLOW_UP'; }).slice(0, 4).map(function (x) { var people = x.affectedMembers || [], first = people[0] || {}; return card({ icon: '•', member: first.nickname || first.name || x.title, kind: x.type || 'BLUEPRINT', status: x.confidence || 'REVIEW', reason: x.why || x.recommendedAction, evidence: (x.evidence || []).join(' · ') || x.source, action: openMember(first.id, 'ดู Action') }); });
    var html = section('Mentor → Growth Inbox', 'รับเรื่องที่ Mentor ส่งต่ออย่างปลอดภัย', handoffCards) + section('Follow-up ที่รออยู่', 'งานค้างหรือรอสมาชิกตอบ ต้องไม่หายหลังจากกด action', taskCards) + section('Connection ที่ควรตรวจ', 'คำแนะนำอธิบายได้จาก Blueprint และไม่เท่ากับ Referral', connectionCards) + section('สมาชิกที่ควรช่วย', 'ข้อมูล Blueprint/Power Team ที่มีเหตุผลรองรับ', priorityCards);
    today.innerHTML = html || '<div class="gm-empty">วันนี้ยังไม่มี action ที่ปลอดภัยและมีข้อมูลรองรับ</div>';
    if (summary) {
      var metrics = [['งานเปิด', tasks.length, 'tasks'], ['Connection', connections.length, 'members'], ['Follow-up', followups.length, 'tasks'], ['Handoff', handoffs.length, 'support'], ['Power gap', opportunities.filter(function (x) { return !x.covered; }).length, 'power']];
      summary.innerHTML = metrics.map(function (m) { return '<button data-go="' + m[2] + '"><b>' + m[1] + '</b>' + m[0] + '</button>'; }).join('');
    }
    if (power) {
      var powerCards = opportunities.slice(0, 12).map(function (x) { var member = (x.affectedMembers || [])[0] || {}; return card({ icon: '⌘', member: x.category || x.title, kind: x.covered ? 'POWER TEAM CONNECTION' : 'POWER TEAM GAP', status: x.confidence || 'REVIEW', reason: x.why, evidence: (x.evidence || []).join(' · '), action: openMember(member.id, 'ดู Opportunities') }); });
      power.innerHTML = powerCards.join('') || '<div class="gm-empty">ยังไม่มี Power Team opportunity ที่ข้อมูล/consent อนุญาตให้แสดง</div>';
    }
  }
  window.growthMobileActionBoardRefresh = render;
  document.addEventListener('DOMContentLoaded', function () {
    render();
    // Dynamic action cards are inserted after the base navigation binds.
    // This only navigates to existing views; it grants no additional action.
    document.body.addEventListener('click', function (event) {
      var go = event.target.closest('[data-go]');
      if (!go || !go.dataset.go) return;
      var tab = Array.prototype.find.call(document.querySelectorAll('.gm-nav [data-view]'), function (item) { return item.dataset.view === go.dataset.go; });
      if (tab) { event.preventDefault(); tab.click(); return; }
      var view = document.getElementById('gm-view-' + go.dataset.go);
      if (view) { event.preventDefault(); document.querySelectorAll('.gm-view').forEach(function (item) { item.classList.toggle('is-active', item === view); }); window.scrollTo(0, 0); }
    });
  });
}());

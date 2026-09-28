/* Growth Desktop Power Team hub. Mutations still require server authorization. */
(function () {
  'use strict';
  var state = null;
  var busy = false;
  var labels = { draft: 'ทีมร่าง', proposed: 'เสนอแล้ว', assigned: 'มอบหมายแล้ว', exploring: 'กำลังสำรวจ', active: 'พร้อมเสนอเป็นทีมจริง', closed: 'ปิดข้อเสนอ', archived: 'เก็บเข้าประวัติ' };
  function el() { return document.getElementById('pt-mgr-content'); }
  function safe(value) { return esc(value == null ? '' : String(value)); }
  function note(value) { return '<div style="color:var(--sub);font-size:12px;margin-top:7px">' + safe(value) + '</div>'; }
  function button(label, action, id) { return '<button type="button" class="bsm" data-pt-action="' + action + '" data-pt-id="' + safe(id) + '">' + safe(label) + '</button>'; }
  function memberNames(rows) { return (rows || []).map(function (row) { var member = row.members || row; return safe(member.nickname || member.name || 'สมาชิก'); }).join(' · '); }
  function card(body, actions) { return '<article style="border:1px solid var(--bd);background:var(--sf2);border-radius:12px;padding:14px;margin:9px 0"><div>' + body + '</div>' + (actions ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' + actions + '</div>' : '') + '</article>'; }
  function section(title, rows, empty) { return '<section style="margin:22px 0"><h3 style="font-size:14px;margin:0 0 10px">' + safe(title) + ' <small style="color:var(--sub)">(' + rows.length + ')</small></h3>' + (rows.join('') || note(empty)) + '</section>'; }
  function render() {
    var root = el(); if (!root || !state) return;
    var canCoordinate = state.canCoordinate === true, canApprove = state.canApprove === true;
    var me = String(state.viewerEmail || '').toLowerCase();
    var candidates = (state.candidates || []).map(function (candidate, index) {
      return card('<b>' + safe(candidate.category) + '</b>' + note('กลุ่มลูกค้าที่คาดร่วมกัน: ' + (candidate.targetCustomerGroup || 'ยังไม่มีข้อมูล')) + note('สมาชิก: ' + memberNames(candidate.members)) + note(candidate.rationale), canCoordinate ? button('สร้าง Proposal', 'create', index) : '');
    });
    var proposals = (state.proposals || []).filter(function (proposal) { return !proposal.officialStatus; }).map(function (proposal) {
      var restricted = proposal.detailRestricted === true;
      var body = '<b>' + (restricted ? 'รายละเอียดจำกัดตาม consent' : safe(proposal.title)) + '</b> <small>' + safe(labels[proposal.status] || proposal.status || 'Proposal') + '</small>';
      body += note('ผู้รับผิดชอบ: ' + (proposal.assigned_owner_name || proposal.assigned_owner_email || 'ยังไม่มอบหมาย'));
      if (!restricted) body += note('กลุ่มลูกค้า: ' + (proposal.target_customer_group || 'ยังไม่มีข้อมูล')) + note('สมาชิก: ' + memberNames(proposal.power_team_proposal_members));
      var own = me && String(proposal.assigned_owner_email || '').toLowerCase() === me;
      var actions = '';
      if (canCoordinate) actions += button('มอบหมาย', 'assign', proposal.id);
      if (canCoordinate || (own && state.canManageAssigned === true)) actions += button('อัปเดตสถานะ', 'status', proposal.id);
      if (canApprove && proposal.status === 'active') actions += button('อนุมัติทีมจริง', 'publish', proposal.id);
      return card(body, actions);
    });
    var official = (state.officialTeams || []).map(function (team) {
      var body = '<b>' + (team.detailRestricted ? 'รายละเอียดจำกัดตาม consent' : safe(team.title)) + '</b> <small>' + (team.status === 'archived' ? 'เก็บเข้าประวัติ' : 'ทีมจริง') + '</small>';
      body += note('เผยแพร่: ' + (team.publishedAt ? new Date(team.publishedAt).toLocaleDateString('th-TH') : 'ไม่ทราบวัน'));
      body += note('สมาชิก ' + Number(team.memberCount || 0) + ' คน');
      if (!team.detailRestricted) body += note('สมาชิก: ' + memberNames(team.members)) + note('กลุ่มลูกค้า: ' + (team.targetCustomerGroup || 'ยังไม่มีข้อมูล'));
      return card(body, canApprove && team.status === 'active' ? button('เก็บทีมเข้าประวัติ', 'archive', team.id) : '');
    });
    root.innerHTML = '<p style="color:var(--sub);font-size:12px">ทีมร่างเป็นเพียงข้อเสนอจาก Blueprint ที่ submit แล้ว ไม่ใช่ Referral หรือรายได้ที่ยืนยันแล้ว · ข้อมูลที่ถูกจำกัดตาม consent จะไม่แสดง</p>' +
      section('ทีมร่างจาก Blueprint', candidates, canCoordinate ? 'ยังไม่มีหมวดที่สมาชิกยินยอมและมีอย่างน้อย 2 คนในปีแผนปัจจุบัน' : 'เฉพาะ Coordinator เท่านั้นที่ดูทีมร่าง') +
      section('Proposal ที่กำลังดำเนินการ', proposals, 'ยังไม่มี Proposal ที่เข้าถึงได้') +
      section('Power Team จริง', official, 'ยังไม่มีทีมจริงที่ Admin อนุมัติ');
  }
  function request(action, payload, success) {
    if (busy) return;
    busy = true;
    gsr(action, payload, function (result) {
      busy = false;
      if (!result || !result.ok) { toast((result && result.error) || 'ดำเนินการไม่สำเร็จ', 'err'); return; }
      toast(success, 'ok'); window.ptLoad(true);
    });
  }
  window.ptLoad = function (force) {
    if (!force && state) { render(); return; }
    var root = el(); if (!root) return;
    root.innerHTML = '<p role="status">⏳ กำลังโหลด Power Team…</p>';
    gsr('getPowerTeamProposals', {}, function (result) {
      if (!result || !result.ok) { state = null; root.innerHTML = '<p role="alert">โหลด Power Team ไม่สำเร็จ: ' + safe(result && result.error || 'กรุณาลองใหม่') + '</p><button class="bsm" type="button" onclick="ptLoad(true)">ลองใหม่</button>'; return; }
      state = result; render();
    });
  };
  document.addEventListener('click', function (event) {
    var control = event.target.closest('[data-pt-action]');
    if (!control || !el() || !el().contains(control) || !state) return;
    var action = control.getAttribute('data-pt-action'), id = control.getAttribute('data-pt-id');
    if (action === 'create' && state.canCoordinate) {
      var candidate = (state.candidates || [])[Number(id)]; if (!candidate) return;
      var title = prompt('ชื่อ Proposal:', candidate.category); if (title === null) return;
      var target = prompt('กลุ่มลูกค้าเป้าหมาย:', candidate.targetCustomerGroup || ''); if (target === null) return;
      var reason = prompt('เหตุผลที่ควรทดลอง:', candidate.rationale || ''); if (reason === null) return;
      request('savePowerTeamProposal', { title: title, targetCustomerGroup: target, rationale: reason, sourceCategory: candidate.category, memberIds: candidate.memberIds }, 'สร้าง Proposal แล้ว');
    } else if (action === 'assign' && state.canCoordinate) {
      var email = prompt('OAuth email ของ Growth owner:'); if (!email) return;
      request('assignPowerTeamProposal', { proposalId: id, ownerEmail: email.trim() }, 'มอบหมายแล้ว');
    } else if (action === 'status') {
      var proposal = (state.proposals || []).find(function (item) { return String(item.id) === id; }); if (!proposal) return;
      var canCoordinate = state.canCoordinate === true;
      var own = String(proposal.assigned_owner_email || '').toLowerCase() === String(state.viewerEmail || '').toLowerCase();
      if (!canCoordinate && !(own && state.canManageAssigned === true)) return;
      var choices = canCoordinate ? 'assigned, exploring, active, closed, archived' : 'exploring, closed';
      var status = prompt('สถานะใหม่ (' + choices + '):', proposal.status || 'exploring'); if (!status) return;
      status = status.trim().toLowerCase();
      if (!(canCoordinate ? ['assigned','exploring','active','closed','archived'] : ['exploring','closed']).includes(status)) { toast('สถานะไม่ถูกต้อง', 'warn'); return; }
      var closeReason = status === 'closed' ? prompt('เหตุผล/ผลลัพธ์การปิด Proposal:') : '';
      if (status === 'closed' && !closeReason) return;
      request('updatePowerTeamProposal', { proposalId: id, status: status, closeReason: closeReason }, 'อัปเดต Proposal แล้ว');
    } else if (action === 'publish' && state.canApprove) {
      if (confirm('ยืนยันให้ Proposal นี้เป็น Power Team จริง? การดำเนินการนี้จะล็อก Proposal และสมาชิกเดิม')) request('publishGrowthPowerTeam', { proposalId: id, confirmed: true }, 'เผยแพร่ Power Team แล้ว');
    } else if (action === 'archive' && state.canApprove) {
      if (confirm('ยืนยันเก็บ Power Team นี้เข้าประวัติ?')) request('archiveGrowthPowerTeam', { publicationId: id, confirmed: true }, 'เก็บ Power Team เข้าประวัติแล้ว');
    }
  });
})();

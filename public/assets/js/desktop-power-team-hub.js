/* Growth Desktop Power Team hub. Mutations still require server authorization. */
(function () {
  'use strict';
  var state = null;
  var busy = false;
  var loadVersion=0;
  var selectedView = null;
  var labels = { draft: 'ทีมร่าง', proposed: 'เสนอแล้ว', assigned: 'มอบหมายแล้ว', exploring: 'กำลังสำรวจ', active: 'พร้อมเสนอเป็นทีมจริง', closed: 'ปิดข้อเสนอ', archived: 'เก็บเข้าประวัติ' };
  function el() { return document.getElementById('pt-mgr-content'); }
  function safe(value) { return esc(value == null ? '' : String(value)); }
  function note(value) { return '<div style="color:var(--sub);font-size:12px;margin-top:7px">' + safe(value) + '</div>'; }
  function button(label, action, id) { return '<button type="button" class="bsm" data-pt-action="' + action + '" data-pt-id="' + safe(id) + '">' + safe(label) + '</button>'; }
  function memberNames(rows,leader) { return (rows || []).map(function (row) { var member = row.members || row; return safe(member.nickname || member.name || 'สมาชิก')+(leader&&String(row.member_id||member.id)===String(leader)?' (ผู้ประสานงาน)':''); }).join(' · '); }
  function card(body, actions) { return '<article class="pt-card"><div class="pt-card-body">' + body + '</div>' + (actions ? '<div class="pt-card-actions">' + actions + '</div>' : '') + '</article>'; }
  function section(title, rows, empty) { return '<section class="pt-results" aria-label="'+safe(title)+'"><div class="pt-results-heading"><h3>' + safe(title) + '</h3><span>' + rows.length + ' รายการ</span></div><div class="pt-card-grid">' + (rows.join('') || '<div class="pt-empty"><span class="pt-empty-icon" aria-hidden="true">◇</span><h4>ยังไม่มีรายการในขั้นนี้</h4><p>'+safe(empty)+'</p></div>') + '</div></section>'; }
  function render() {
    var root = el(); if (!root || !state) return;
    var canCoordinate = state.canCoordinate === true, canApprove = state.canApprove === true;
    var me = String(state.viewerEmail || '').toLowerCase();
    if (!selectedView) selectedView = (state.proposals || []).some(function(p){return !p.officialStatus && !['closed','archived'].includes(p.status);}) ? 'proposals' : 'candidates';
    var candidates = (state.candidates || []).map(function (candidate, index) {
      return card('<b>' + safe(candidate.category) + '</b>' + note('กลุ่มลูกค้าที่คาดร่วมกัน: ' + (candidate.targetCustomerGroup || 'ยังไม่มีข้อมูล')) + note('สมาชิก: ' + memberNames(candidate.members)) + note(candidate.rationale), canCoordinate ? button('สร้าง Proposal', 'create', index) : '');
    });
    var proposals = (state.proposals || []).filter(function (proposal) { return !proposal.officialStatus && (selectedView === 'history' ? ['closed','archived'].includes(proposal.status) : !['closed','archived'].includes(proposal.status)); }).map(function (proposal) {
      var restricted = proposal.detailRestricted === true;
      var body = '<span class="pt-status">' + safe(labels[proposal.status] || proposal.status || 'Proposal') + '</span><h4>' + (restricted ? 'รายละเอียดจำกัดตาม consent' : safe(proposal.title)) + '</h4>';
      body += note('ผู้รับผิดชอบ: ' + (proposal.assigned_owner_name || proposal.assigned_owner_email || 'ยังไม่มอบหมาย'));
      if (!restricted) body += note('กลุ่มลูกค้า: ' + (proposal.target_customer_group || 'ยังไม่มีข้อมูล')) + note('สมาชิก: ' + memberNames(proposal.power_team_proposal_members,proposal.leader_member_id));
      if(!restricted){var memberTotal=(proposal.power_team_proposal_members||[]).length;var accepted=(proposal.power_team_proposal_members||[]).filter(function(m){return m.participation_status==='accepted';}).length;body+='<div class="pt-response"><div><span>การตอบรับของสมาชิก</span><strong>'+accepted+' / '+memberTotal+' คน</strong></div><progress max="'+Math.max(1,memberTotal)+'" value="'+accepted+'" aria-label="สมาชิกที่ตอบรับแล้ว"></progress><small>สมาชิกตอบรับเองใน MY121 → Power Team ของฉัน</small></div>';}
      var own = me && String(proposal.assigned_owner_email || '').toLowerCase() === me;
      var actions = '';
      if (canCoordinate) actions += button('มอบหมาย', 'assign', proposal.id);
      if (canCoordinate || (own && state.canManageAssigned === true)) actions += button('อัปเดตสถานะ', 'status', proposal.id);
      if (canApprove && proposal.status === 'active') actions += button('อนุมัติทีมจริง', 'publish', proposal.id);
      return card(body, actions);
    });
    var official = (state.officialTeams || []).filter(function(team){return selectedView === 'history' ? team.status === 'archived' : team.status !== 'archived';}).map(function (team) {
      var body = '<b>' + (team.detailRestricted ? 'รายละเอียดจำกัดตาม consent' : safe(team.title)) + '</b> <small>' + (team.status === 'archived' ? 'เก็บเข้าประวัติ' : 'ทีมจริง') + '</small>';
      body += note('เผยแพร่: ' + (team.publishedAt ? new Date(team.publishedAt).toLocaleDateString('th-TH') : 'ไม่ทราบวัน'));
      body += note('สมาชิก ' + Number(team.memberCount || 0) + ' คน');
      if (!team.detailRestricted) body += note('สมาชิก: ' + memberNames(team.members,team.leaderMemberId)) + note('กลุ่มลูกค้า: ' + (team.targetCustomerGroup || 'ยังไม่มีข้อมูล'));
      return card(body, canApprove && team.status === 'active' ? button('สร้างฉบับปรับปรุง','revise',team.id)+button('เก็บทีมเข้าประวัติ', 'archive', team.id) : '');
    });
    var coverage=state.coverage||{};
    var openCount=(state.proposals||[]).filter(function(p){return !p.officialStatus&&!['closed','archived'].includes(p.status);}).length;
    var officialCount=(state.officialTeams||[]).filter(function(t){return t.status!=='archived';}).length;
    var historyCount=(state.proposals||[]).filter(function(p){return !p.officialStatus&&['closed','archived'].includes(p.status);}).length+(state.officialTeams||[]).filter(function(t){return t.status==='archived';}).length;
    var views=[['candidates','01','ค้นหาโอกาส',candidates.length],['proposals','02','จัดการข้อเสนอ',openCount],['official','03','ทีมที่อนุมัติแล้ว',officialCount],['history','↺','ประวัติ',historyCount]];
    root.innerHTML='<div class="pt-workspace"><div class="pt-summary"><div><span class="pt-eyebrow">BLUEPRINT · '+safe(state.blueprintYear||'—')+'</span><h3>สร้างทีมจากโอกาสที่มีร่วมกัน</h3><p>เริ่มจากกลุ่มลูกค้าเดียวกัน ทดลองร่วมงาน แล้วค่อยพัฒนาเป็นทีม</p></div>'+(canCoordinate?'<div class="pt-primary">'+button('+ สร้างข้อเสนอเอง','manual','')+'</div>':'')+'</div><div class="pt-metrics"><div><span>ส่ง Blueprint แล้ว</span><strong>'+Number(coverage.submitted||0)+'<small> / '+Number(coverage.activeMembers||0)+' คน</small></strong></div><div><span>ยินยอมแชร์หมวดให้ Growth</span><strong>'+Number(coverage.sharedCategories||0)+'<small> คน</small></strong></div><div><span>ข้อเสนอระหว่างดำเนินการ</span><strong>'+openCount+'<small> ข้อเสนอ</small></strong></div><div><span>ทีมที่อนุมัติแล้ว</span><strong>'+officialCount+'<small> ทีม</small></strong></div></div><nav class="pt-stages" aria-label="ขั้นตอน Power Team">'+views.map(function(v){return '<button type="button" data-pt-action="view" data-pt-id="'+v[0]+'" '+(selectedView===v[0]?'aria-current="page"':'')+'><span class="pt-stage-number">'+v[1]+'</span><span>'+v[2]+'</span><span class="pt-count">'+v[3]+'</span></button>';}).join('')+'</nav><div class="pt-toolbar"><p>'+safe(selectedView==='candidates'?'หมวดที่สมาชิกยินยอมแชร์และมีความสนใจร่วมกันอย่างน้อย 2 คน':selectedView==='proposals'?'มอบหมายผู้ดูแล ติดตามการตอบรับ และเตรียมเสนออนุมัติ':selectedView==='official'?'ทีมที่ผ่านการตอบรับของสมาชิกและการอนุมัติแล้ว':'ข้อเสนอที่ปิดและทีมที่เก็บเข้าประวัติ ข้อมูลเดิมยังคงอยู่')+'</p><label class="pt-search"><span>ค้นหาในหน้านี้</span><input type="search" data-pt-search placeholder="ชื่อทีม / สมาชิก / กลุ่มลูกค้า" aria-label="ค้นหารายการ Power Team"></label></div>'+(selectedView==='candidates'?section('ทีมร่างจาก Blueprint',candidates,canCoordinate?'ยังไม่มีกลุ่มที่ตรงเงื่อนไข สมาชิกต้องเลือกแชร์หมวดให้ Growth ใน Blueprint ก่อน หรือเริ่มสร้างข้อเสนอเองได้':'เฉพาะ Coordinator เท่านั้นที่ดูทีมร่าง'):selectedView==='proposals'?section('Proposal ที่กำลังดำเนินการ',proposals,'เริ่มจากค้นหาโอกาส หรือสร้างข้อเสนอเอง สมาชิกจะเห็นคำเชิญใน MY121 → Power Team ของฉัน'):selectedView==='official'?section('Power Team จริง',official,'เมื่อสมาชิกตอบรับครบ Admin จึงอนุมัติข้อเสนอที่พร้อมเป็นทีมจริงได้'):section('ข้อเสนอที่ปิด',proposals,'ยังไม่มีข้อเสนอที่ปิด')+section('ทีมที่เก็บเข้าประวัติ',official,'ยังไม่มีทีมที่เก็บเข้าประวัติ'))+'<p class="pt-no-match" role="status" hidden>ไม่พบรายการที่ตรงกับคำค้น</p><details class="pt-policy"><summary>หลักการใช้ข้อมูลและการสร้างทีม</summary><p>ทีมร่างเป็นเพียงข้อเสนอ ไม่ใช่ Referral หรือรายได้ที่ยืนยันแล้ว หมวดเหมือนกันยังไม่ยืนยันว่าลูกค้าเหมือนกัน การแชร์แยกจาก MY121 และข้อมูลที่จำกัดตาม consent จะไม่แสดง ไม่มีการส่ง LINE อัตโนมัติจากหน้านี้</p></details></div>';
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
    var version=++loadVersion;
    // Always revalidate scope/consent on entry; never reuse another session DTO.
    var root = el(); if (!root) return;
    root.innerHTML = '<p role="status">⏳ กำลังโหลด Power Team…</p>';
    gsr('getPowerTeamProposals', {}, function (result) {
      if(version!==loadVersion)return;
      if (!result || !result.ok) { state = null; root.innerHTML = '<p role="alert">โหลด Power Team ไม่สำเร็จ: ' + safe(result && result.error || 'กรุณาลองใหม่') + '</p><button class="bsm" type="button" onclick="ptLoad(true)">ลองใหม่</button>'; return; }
      state = result; render();
    });
  };
  document.addEventListener('click', function (event) {
    var control = event.target.closest('[data-pt-action]');
    if (!control || !el() || !el().contains(control) || !state) return;
    var action = control.getAttribute('data-pt-action'), id = control.getAttribute('data-pt-id');
    if(action==='view'&&['candidates','proposals','official','history'].includes(id)){selectedView=id;render();var active=el().querySelector('[aria-current="page"]');if(active)active.focus();return;}
    if(action==='assign'||action==='status'){
      var item=(state.proposals||[]).find(function(p){return String(p.id)===id;});if(!item)return;
      var own=state.viewerEmail&&String(item.assigned_owner_email||'').toLowerCase()===String(state.viewerEmail).toLowerCase();
      if(action==='assign'&&!state.canCoordinate)return;
      if(action==='status'&&!state.canCoordinate&&!(own&&state.canManageAssigned))return;
      openPowerTeamOperationDialog(state,action,item,function(){window.ptLoad(true);});return;
    }
    if(['manual','create','revise'].includes(action)&&state.canCoordinate){
      var seed=action==='create'?(state.candidates||[])[Number(id)]:{};
      if(action==='revise'){var team=(state.officialTeams||[]).find(function(t){return String(t.id)===id;});if(!team)return;seed={title:team.title,targetCustomerGroup:team.targetCustomerGroup,leaderMemberId:team.leaderMemberId,memberIds:(team.members||[]).map(function(m){return String(m.member_id);}),supersedesPublicationId:team.id};}
      openPowerTeamProposalBuilder(state,seed,function(){window.ptLoad(true);});return;
    }
    if (action === 'create' && state.canCoordinate) {
      var candidate = (state.candidates || [])[Number(id)]; if (!candidate) return;
      var title = prompt('ชื่อ Proposal:', candidate.category); if (title === null) return;
      var target = prompt('กลุ่มลูกค้าเป้าหมาย:', candidate.targetCustomerGroup || ''); if (target === null) return;
      var reason = prompt('เหตุผลที่ควรทดลอง:', candidate.rationale || ''); if (reason === null) return;
      request('savePowerTeamProposal', { title: title, targetCustomerGroup: target, rationale: reason, sourceCategory: candidate.category, memberIds: candidate.memberIds }, 'สร้าง Proposal แล้ว');
    } else if (action === 'assign' && state.canCoordinate) {
      var email = prompt('OAuth email ของ Growth owner:'); if (!email) return;
      var assignedProposal=(state.proposals||[]).find(function(p){return String(p.id)===id;});
      request('assignPowerTeamProposal', { proposalId: id, ownerEmail: email.trim(),expectedUpdatedAt:assignedProposal&&assignedProposal.updated_at }, 'มอบหมายแล้ว');
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
      request('updatePowerTeamProposal', { proposalId: id, status: status, closeReason: closeReason,expectedUpdatedAt:proposal.updated_at }, 'อัปเดต Proposal แล้ว');
    } else if (action === 'publish' && state.canApprove) {
      if (confirm('ยืนยันให้ Proposal นี้เป็น Power Team จริง? การดำเนินการนี้จะล็อก Proposal และสมาชิกเดิม')) request('publishGrowthPowerTeam', { proposalId: id, confirmed: true }, 'เผยแพร่ Power Team แล้ว');
    } else if (action === 'archive' && state.canApprove) {
      if (confirm('ยืนยันเก็บ Power Team นี้เข้าประวัติ?')) request('archiveGrowthPowerTeam', { publicationId: id, confirmed: true }, 'เก็บ Power Team เข้าประวัติแล้ว');
    }
  });
  document.addEventListener('input',function(event){if(!event.target.matches||!event.target.matches('[data-pt-search]')||!el()||!el().contains(event.target))return;var query=event.target.value.trim().toLocaleLowerCase();var shown=0;el().querySelectorAll('.pt-card').forEach(function(card){card.hidden=!!query&&!card.textContent.toLocaleLowerCase().includes(query);if(!card.hidden)shown++;});el().querySelector('.pt-no-match').hidden=!query||shown>0;});
})();

const helpStatusCopy={new:['รับเรื่องแล้ว',''],acknowledged:['ทีมรับทราบแล้ว','progress'],in_progress:['กำลังดูแล','progress'],waiting_member:['รอข้อมูลจากคุณ','progress'],snoozed:['นัดติดตามแล้ว','progress'],resolved:['เสร็จแล้ว','done'],cancelled:['ปิดคำขอแล้ว','done']};
const helpCategoryCopy={mentor:'Mentor ดูแลสมาชิก',goal:'เป้าหมาย',growth:'เป้าหมาย',visitor:'Visitor',renewal:'ต่ออายุ',training:'อบรม',absence:'แจ้งลา / ส่งแทน',referral:'Connection / Referral',profile:'ข้อมูลธุรกิจ',profile_update:'ข้อมูลธุรกิจ',one_to_one:'ระบบ 1-2-1',presentation:'Presentation',confidential:'เรื่องเป็นความลับ',technical:'ใช้งานระบบ'};

async function loadIssueHistory(force=false){
  const box=$('#issueHistory');
  if(!box||box._loaded&&!force)return;
  box.innerHTML='<div class="help-empty">กำลังโหลดคำขอของคุณ…</div>';
  const r=await api({action:'get-issues'},{latestKey:'get-issues'});
  if(!r.ok){box.innerHTML=`<div class="help-empty">${escHtml(r.error||'โหลดคำขอไม่สำเร็จ')}<br><button class="oto-history-refresh" type="button" onclick="loadIssueHistory(true)">ลองใหม่</button></div>`;return;}
  box._loaded=true;
  const issues=Array.isArray(r.issues)?r.issues:[];
  if(!issues.length){box.innerHTML='<div class="help-empty">ยังไม่มีคำขอที่ส่งไว้<br>เมื่อส่งเรื่องแล้วสามารถกลับมาตรวจสถานะที่นี่ได้</div>';return;}
  box.innerHTML=`<div class="help-history-head"><h3>คำขอของฉัน</h3><button type="button" onclick="loadIssueHistory(true)">รีเฟรช</button></div>${issues.map(helpIssueCard).join('')}`;
}

function helpIssueCard(item){
  const date=item.reported_at?new Date(item.reported_at).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit'}):'';
  const inferred=item.resolved_at?'resolved':item.mentor_response?'in_progress':item.status||'new';
  const status=helpStatusCopy[inferred]||helpStatusCopy.new;
  const route=item.assigned_role||(Array.isArray(item.routing)&&item.routing.length?item.routing.join(' · '):'ทีมที่เกี่ยวข้อง');
  return `<article class="help-item"><div class="help-item-top"><span class="help-item-date">${escHtml(date)}</span><span class="help-status ${status[1]}">${status[0]}</span></div><div class="help-item-route">${escHtml(helpCategoryCopy[item.category]||item.category||'คำขอความช่วยเหลือ')} · ${escHtml(route)}</div><p>${escHtml(item.issue_text||'')}</p>${item.mentor_response?`<div class="help-reply"><b>คำตอบจากทีมดูแล</b><br>${escHtml(item.mentor_response)}</div>`:''}<button class="help-detail-btn" type="button" onclick="loadIssueDetail('${escHtml(item.id)}',this)">ดูขั้นตอนการดำเนินการ</button><div class="help-timeline" id="help-timeline-${escHtml(item.id)}" hidden></div></article>`;
}

async function loadIssueDetail(issueId,button){
  const box=document.getElementById(`help-timeline-${issueId}`);if(!box)return;
  if(!box.hidden){box.hidden=true;button.textContent='ดูขั้นตอนการดำเนินการ';return;}
  box.hidden=false;box.innerHTML='<span>กำลังโหลด…</span>';button.textContent='ซ่อนรายละเอียด';
  const r=await api({action:'get-issue-detail',issueId},{latestKey:`issue-detail:${issueId}`});
  if(!r.ok){box.innerHTML=`<span class="help-timeline-error">${escHtml(r.error||'โหลดรายละเอียดไม่สำเร็จ')}</span>`;return;}
  const signal=r.signal||{},rows=[{label:'ส่งคำขอแล้ว',at:(r.issue||{}).reported_at}];
  (r.timeline||[]).forEach(ev=>rows.push({label:ev.event_type==='assignment_changed'?'ส่งต่อผู้รับผิดชอบ':(helpStatusCopy[ev.to_status]||[ev.to_status])[0],at:ev.created_at}));
  if((r.issue||{}).mentor_response)rows.push({label:'ทีมดูแลตอบกลับแล้ว',at:signal.updated_at});
  box.innerHTML=`<strong>ลำดับการดำเนินการ</strong>${rows.map(x=>`<div><i></i><span>${escHtml(x.label||'อัปเดตคำขอ')}<small>${x.at?new Date(x.at).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}):''}</small></span></div>`).join('')}`;
}

const helpStatusCopy={new:['รับเรื่องแล้ว',''],acknowledged:['ทีมรับทราบแล้ว','progress'],in_progress:['กำลังดูแล','progress'],waiting_member:['รอข้อมูลจากคุณ','progress'],snoozed:['นัดติดตามแล้ว','progress'],resolved:['เสร็จแล้ว','done'],cancelled:['ปิดคำขอแล้ว','done']};

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
  return `<article class="help-item"><div class="help-item-top"><span class="help-item-date">${escHtml(date)}</span><span class="help-status ${status[1]}">${status[0]}</span></div><p>${escHtml(item.issue_text||'')}</p>${item.mentor_response?`<div class="help-reply">💬 ${escHtml(item.mentor_response)}</div>`:''}</article>`;
}

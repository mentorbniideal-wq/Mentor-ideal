// ── LINE Compose (Desktop) ────────────────────────────────────
var _dLineTarget = null;
var DESK_LINE_TMPLS = [
  {l:'📊 ติดตามคะแนน', t:'สวัสดีครับ คุณ{nick} 👋\n\nอยากติดตามคะแนน BNI ของคุณนะครับ\nพิมพ์ "สถานะ" ใน LINE Bot เพื่อดูคะแนน + Action Plan ได้เลยครับ 📊'},
  {l:'📅 นัด 1-2-1',    t:'สวัสดีครับ คุณ{nick}\n\nสัปดาห์นี้มีเวลา 1-2-1 กันไหมครับ?\nอยากคุยเรื่องโอกาส Referral และ Action Plan ของคุณครับ 🤝'},
  {l:'🔔 เตือนประชุม',  t:'สวัสดีครับ คุณ{nick} 👋\n\n⏰ เตือนนะครับ — ประชุม BNI IDEAL อาทิตย์นี้\nอย่าลืมมาด้วยนะครับ เชียร์กันอยู่! 🏆'},
  {l:'💪 ให้กำลังใจ',   t:'สวัสดีครับ คุณ{nick} 💪\n\nอยากให้กำลังใจนะครับ ทำต่อเนื่องไปเรื่อยๆ\nBNI IDEAL เชียร์คุณอยู่เสมอครับ! 🚀'},
  {l:'👋 ยินดีต้อนรับ',  t:'สวัสดีครับ คุณ{nick} 👋\n\nยินดีต้อนรับสู่ BNI IDEAL ครับ!\nยินดีให้คำปรึกษาและช่วยเหลือเสมอนะครับ 🙏'},
];

function _renderDeskLineTpls(nick) {
  var container=document.getElementById('desk-line-tpls');
  container.replaceChildren();
  DESK_LINE_TMPLS.forEach(function(t,i){
    var button=document.createElement('button');
    button.type='button';
    button.style.cssText='font-size:11px;padding:3px 7px;background:var(--sf2);border:1px solid var(--bd);border-radius:5px;color:var(--tx);cursor:pointer';
    button.textContent=t.l;
    button.addEventListener('click',function(){deskLineUseTpl(i,String(nick||''));});
    container.appendChild(button);
  });
}

function deskLineUseTpl(i, nick) {
  document.getElementById('desk-line-txt').value = DESK_LINE_TMPLS[i].t.replace(/\{nick\}/g, nick);
}

function openDeskLineCompose(name, nick) {
  _dLineTarget = {name:name, nick:nick, broadcast:false};
  document.getElementById('desk-line-title').textContent = '📲 ส่ง LINE — '+(nick||name.split(' ')[0]);
  document.getElementById('desk-line-bcast-info').style.display = 'none';
  document.getElementById('desk-line-txt').value = '';
  _renderDeskLineTpls(nick||name.split(' ')[0]);
  document.getElementById('desk-line-modal').style.display = 'flex';
}

function openDeskLineBroadcast(teamName) {
  _dLineTarget = {broadcast:true, teamName:teamName};
  document.getElementById('desk-line-title').textContent = '📢 Broadcast — ทีม '+teamName;
  document.getElementById('desk-line-bcast-info').style.display = 'block';
  document.getElementById('desk-line-txt').value = '';
  _renderDeskLineTpls('ทีม');
  document.getElementById('desk-line-modal').style.display = 'flex';
}

function closeDeskLine() { document.getElementById('desk-line-modal').style.display='none'; }

var _lineReviewConfirm=null;
function openLineSendReview(options){
  options=options||{};var shade=document.getElementById('line-send-review'),message=document.getElementById('line-review-message');
  if(!shade||!message)return;
  document.getElementById('line-review-title').textContent=options.title||'ตรวจข้อความก่อนส่ง';
  document.getElementById('line-review-audience').textContent=options.audience||'สมาชิก';
  message.value=String(options.message||'');message.disabled=false;_lineReviewConfirm=typeof options.onConfirm==='function'?options.onConfirm:null;var confirmBtn=document.getElementById('line-review-confirm'),testBtn=document.getElementById('line-review-test'),backBtn=document.querySelector('#line-send-review .line-review-back');if(confirmBtn){confirmBtn.style.display='';confirmBtn.disabled=false;confirmBtn.textContent='📲 ยืนยันส่ง LINE';}if(testBtn){testBtn.style.display=S.role==='mc'?'':'none';testBtn.disabled=false;testBtn.textContent='🧪 ส่งทดสอบให้ฉัน';}if(backBtn)backBtn.textContent='← กลับไปแก้';
  var meta=document.getElementById('line-review-meta'),warning=document.getElementById('line-review-warning'),result=document.getElementById('line-review-result'),m=options.meta||{};
  if(meta){var quota=m.quota||{},remaining=quota.unlimited?'ไม่จำกัด':quota.remaining!==undefined?Number(quota.remaining).toLocaleString('th-TH'):'ตรวจไม่ได้';meta.innerHTML='<div>ผู้รับจริง<b>'+Number(m.recipientCount||0).toLocaleString('th-TH')+' คน</b></div><div>คาดว่าจะใช้<b>'+Number(m.estimatedMessages||m.recipientCount||0).toLocaleString('th-TH')+' ข้อความ</b></div><div>คงเหลือ<b>'+remaining+'</b></div>';meta.hidden=!options.meta;}
  if(warning){var warnings=[];if(Number(m.dailyCapCount||0)>0)warnings.push('Admin ยืนยันข้าม Daily cap '+Number(m.dailyCapCount)+' คน');if(Number(m.recentDuplicateCount||0)>0)warnings.push('พบข้อความเหมือนกัน '+Number(m.recentDuplicateCount)+' รายการใน 24 ชั่วโมงที่ผ่านมา');if(m.quietHoursWarning)warnings.push('ขณะนี้อยู่ในช่วงงดรบกวน');if(Number(m.recipientCount||0)===0&&options.meta)warnings.push('ไม่พบผู้รับที่เชื่อม LINE');warning.textContent=warnings.join(' · ');warning.hidden=!warnings.length;}
  if(result){result.hidden=true;result.className='line-review-result';result.innerHTML='';}
  shade.hidden=false;document.body.style.overflow='hidden';updateLineReviewCount();setTimeout(function(){message.focus();message.setSelectionRange(message.value.length,message.value.length);},30);
}
function updateLineReviewCount(){var el=document.getElementById('line-review-message'),count=document.getElementById('line-review-chars');if(el&&count)count.textContent=el.value.length.toLocaleString('th-TH')+' / 5,000 ตัวอักษร';}
function closeLineSendReview(){var shade=document.getElementById('line-send-review'),drawer=document.getElementById('w121-pair-shade');if(shade)shade.hidden=true;document.body.style.overflow=drawer&&drawer.classList.contains('on')?'hidden':'';_lineReviewConfirm=null;}
function confirmLineSendReview(){var el=document.getElementById('line-review-message'),message=String(el&&el.value||'').trim(),done=_lineReviewConfirm;if(!message){toast('กรุณาพิมพ์ข้อความก่อนส่ง','err');return;}if(!done)return;_lineReviewConfirm=null;var btn=document.getElementById('line-review-confirm');btn.disabled=true;btn.textContent='⏳ กำลังส่ง...';done(message,function(result){btn.disabled=false;btn.textContent='📲 ยืนยันส่ง LINE';if(!result){closeLineSendReview();return;}var box=document.getElementById('line-review-result'),ok=!!result.ok,sent=Number(result.sentCount!==undefined?result.sentCount:result.sent===true?1:result.sent||0),skipped=Number(result.skipped||0),failed=Number(result.failed||0);if(box){box.hidden=false;box.className='line-review-result'+(ok?'':' error');box.innerHTML=ok?'✅ <b>ดำเนินการเสร็จแล้ว</b><br>ส่งสำเร็จ '+sent+' · ข้าม/ป้องกัน '+skipped+' · ล้มเหลว '+failed:'❌ <b>ยังส่งไม่สำเร็จ</b><br>'+esc(result.error||'กรุณาตรวจสอบแล้วลองใหม่');}btn.style.display='none';if(el)el.disabled=true;var back=document.querySelector('#line-send-review .line-review-back');if(back)back.textContent='ปิด';});}
function testLineSendReview(){var el=document.getElementById('line-review-message'),message=String(el&&el.value||'').trim(),btn=document.getElementById('line-review-test');if(!message){toast('กรุณาพิมพ์ข้อความก่อนส่ง','err');return;}if(!confirm('ส่งข้อความทดสอบนี้ให้ LINE ของ Mentor Co. เท่านั้น?\n\nยังไม่ส่งให้สมาชิกจริง'))return;btn.disabled=true;btn.textContent='⏳ กำลังทดสอบ...';gsr('testManualLineMessage',{role:S.role,message:message,confirmed:true},function(r){btn.disabled=false;btn.textContent='🧪 ส่งทดสอบให้ฉัน';toast(r&&r.ok?'ส่ง Test ให้ Mentor Co. แล้ว · สมาชิกยังไม่ได้รับ':'❌ '+(r&&r.error||'ส่ง Test ไม่ได้'),r&&r.ok?'ok':'err');});}
var _lineBulkProcess=null;
function lineProcessReason(reason,error){var labels={daily_cap:'วันนี้ได้รับข้อความแล้ว — Admin ยังไม่ได้ยืนยัน Override',weekly_cap:'ครบจำนวน Reminder รายสัปดาห์',cooldown:'ยังอยู่ในช่วงพักการแจ้งเตือน',duplicate:'ข้อความนี้ส่งสำเร็จไปแล้ว',quiet_hours:'อยู่ในช่วงงดรบกวน',no_line:'ยังไม่เชื่อม LINE',provider_error:'LINE Provider ปฏิเสธหรือเชื่อมต่อไม่สำเร็จ',request_error:'หน้าเว็บติดต่อระบบไม่สำเร็จ'};return String(error||labels[reason]||reason||'รอดำเนินการ');}
function ensureLineProcessDialog(){var old=document.getElementById('line-bulk-process');if(old)return old;var shade=document.createElement('div');shade.id='line-bulk-process';shade.className='line-review-shade';shade.hidden=true;shade.setAttribute('role','dialog');shade.setAttribute('aria-modal','true');shade.setAttribute('aria-labelledby','line-process-title');shade.innerHTML='<section class="line-review-card line-process-card"><header><div><small>LINE DELIVERY PROCESS</small><h2 id="line-process-title">กำลังส่งข้อความ</h2></div><button type="button" data-close aria-label="ปิดหน้าต่าง">✕</button></header><div class="line-process-summary" aria-live="polite"></div><div class="line-process-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div><div class="line-process-list" aria-live="polite"></div><div class="line-process-actions"><button type="button" class="copy" data-copy hidden>Copy Error Report</button><button type="button" class="retry" data-retry hidden>ส่งซ้ำเฉพาะรายการที่ล้มเหลว</button><button type="button" data-done disabled>ปิด</button></div></section>';document.body.appendChild(shade);shade.querySelector('[data-close]').onclick=closeLineBulkProcess;shade.querySelector('[data-done]').onclick=closeLineBulkProcess;shade.querySelector('[data-copy]').onclick=copyLineBulkErrorReport;shade.querySelector('[data-retry]').onclick=retryLineBulkFailures;return shade;}
function renderLineBulkProcess(){var state=_lineBulkProcess,shade=ensureLineProcessDialog();if(!state)return;var counts={queued:0,sending:0,sent:0,skipped:0,failed:0};state.rows.forEach(function(row){counts[row.status]=(counts[row.status]||0)+1;});var complete=counts.sent+counts.skipped+counts.failed,total=state.rows.length,pct=total?Math.round(complete/total*100):100;shade.querySelector('#line-process-title').textContent=complete===total?'ผลการส่ง LINE':'กำลังส่ง LINE · '+complete+'/'+total;shade.querySelector('.line-process-summary').innerHTML='<div>ทั้งหมด<b>'+total+'</b></div><div>ส่งสำเร็จ<b>'+counts.sent+'</b></div><div>ข้าม/ป้องกัน<b>'+counts.skipped+'</b></div><div>ล้มเหลว<b>'+counts.failed+'</b></div>';var bar=shade.querySelector('.line-process-bar');bar.setAttribute('aria-valuenow',String(pct));bar.querySelector('span').style.width=pct+'%';var labels={queued:'รอส่ง',sending:'กำลังส่ง',sent:'ส่งสำเร็จ',skipped:'ไม่ได้ส่ง',failed:'ส่งไม่สำเร็จ'};shade.querySelector('.line-process-list').innerHTML=state.rows.map(function(row){return '<div class="line-process-row"><b>'+esc(row.name||'สมาชิก')+'</b><span class="line-process-state '+row.status+'">'+labels[row.status]+'</span><span class="line-process-detail">'+esc(lineProcessReason(row.reason,row.error))+'</span></div>';}).join('');var done=complete===total&&!counts.sending&&!counts.queued;shade.querySelector('[data-done]').disabled=!done;shade.querySelector('[data-copy]').hidden=!counts.failed;shade.querySelector('[data-retry]').hidden=!done||!counts.failed||typeof state.retry!=='function';shade.hidden=false;document.body.style.overflow='hidden';}
function openLineBulkProcess(options){closeLineSendReview();_lineBulkProcess={title:options.title||'LINE delivery',batchId:options.batchId||((crypto.randomUUID&&crypto.randomUUID())||String(Date.now())),rows:(options.recipients||[]).map(function(row){return{memberId:String(row.memberId||''),name:String(row.name||'สมาชิก'),status:'queued',reason:'',error:''};}),retry:options.retry||null};renderLineBulkProcess();return _lineBulkProcess;}
function updateLineBulkRows(ids,status,results){if(!_lineBulkProcess)return;var byId=new Map((results||[]).map(function(row){return[String(row.memberId||''),row];}));_lineBulkProcess.rows.forEach(function(row){if(ids&&ids.indexOf(row.memberId)<0)return;var result=byId.get(row.memberId);row.status=result?String(result.status||status):status;if(result){row.reason=String(result.reason||'');row.error=String(result.error||'');}else if(status==='queued'||status==='sending'){row.reason='';row.error='';}});renderLineBulkProcess();}
function closeLineBulkProcess(){var shade=document.getElementById('line-bulk-process');if(shade)shade.hidden=true;document.body.style.overflow='';}
function lineBulkErrorText(){var s=_lineBulkProcess;if(!s)return'';var failed=s.rows.filter(function(row){return row.status==='failed';});return['BNI Mentor · LINE Delivery Error Report','เวลา: '+new Date().toLocaleString('th-TH'),'Batch: '+s.batchId,'งาน: '+s.title,'ผลรวม: สำเร็จ '+s.rows.filter(function(x){return x.status==='sent';}).length+' / ล้มเหลว '+failed.length,'',].concat(failed.map(function(row,index){return(index+1)+'. '+row.name+' | '+lineProcessReason(row.reason,row.error);})).join('\n');}
function copyLineBulkErrorReport(){var text=lineBulkErrorText();if(!text)return;navigator.clipboard.writeText(text).then(function(){toast('คัดลอก Error Report แล้ว','ok');}).catch(function(){prompt('Copy Error Report',text);});}
function logLineBulkClientError(operation,batchId,memberIds,error){gsr('logLineDeliveryClientError',{operation:operation,batchId:batchId,memberIds:memberIds,error:String(error||'client request failed').slice(0,1000)},function(){});}
function retryLineBulkFailures(){var state=_lineBulkProcess;if(!state||typeof state.retry!=='function')return;var ids=state.rows.filter(function(row){return row.status==='failed';}).map(function(row){return row.memberId;});if(!ids.length)return;if(!confirm('ส่งใหม่เฉพาะ '+ids.length+' คนที่ล้มเหลว?'))return;state.retry(ids,state.batchId);}
document.addEventListener('input',function(e){if(e.target&&e.target.id==='line-review-message')updateLineReviewCount();});

function previewManualLineSend(options){
  options=options||{};gsr('previewManualLineSend',{role:S.role,scope:options.scope||'member',memberName:options.memberName||'',teamName:options.teamName||'',message:options.message||''},function(pre){
    if(!pre||!pre.ok){toast('เปิดตัวอย่างไม่ได้: '+(pre&&pre.error||'error'),'err');return;}
    if(!Number(pre.recipientCount||0)){toast('ไม่พบผู้รับที่เชื่อม LINE','err');return;}
    openLineSendReview({title:options.title,audience:options.audience||((pre.recipientCount||0)+' คน'),message:pre.message||options.message,meta:pre,onConfirm:function(edited,finish){options.onConfirm(edited,finish,pre);}});
  });
}

function doDeskSendLine() {
  var text = (document.getElementById('desk-line-txt').value||'').trim();
  if (!text) { toast('กรุณาพิมพ์ข้อความครับ','err'); return; }
  var t = _dLineTarget; if (!t) return;
  previewManualLineSend({scope:t.broadcast?'team':'member',memberName:t.name,teamName:t.teamName,title:t.broadcast?'ตรวจ Broadcast ก่อนส่ง':'ตรวจข้อความก่อนส่ง',audience:t.broadcast?'ทีม '+t.teamName:(t.nick||t.name),message:text,onConfirm:function(edited,finish,pre){var btn=document.getElementById('desk-line-send-btn');btn.disabled=true;btn.textContent='⏳ กำลังส่ง...';var action=t.broadcast?'sendLineBroadcast':'sendLineMessage',payload=t.broadcast?{role:S.role,teamName:t.teamName,message:edited,confirmed:true}:{role:S.role,memberName:t.name,message:edited,confirmed:true};if(t.broadcast&&Number(pre.recipientCount||0)>1){finish();var process=openLineBulkProcess({title:'Broadcast · ทีม '+t.teamName,recipients:pre.recipients||[],retry:function(failedIds,batchId){updateLineBulkRows(failedIds,'sending',[]);gsr('sendLineBroadcast',{role:S.role,teamName:t.teamName,memberIds:failedIds,message:edited,confirmed:true,clientBatchId:batchId},function(retryResult){if(!retryResult||!retryResult.ok)logLineBulkClientError('manual_team_broadcast_retry',batchId,failedIds,(retryResult&&retryResult.error)||'ติดต่อระบบไม่สำเร็จ');updateLineBulkRows(failedIds,'failed',retryResult&&retryResult.results||failedIds.map(function(id){return{memberId:id,status:'failed',reason:'request_error',error:(retryResult&&retryResult.error)||'ติดต่อระบบไม่สำเร็จ'};}));});}});var ids=process.rows.map(function(row){return row.memberId;});payload.clientBatchId=process.batchId;updateLineBulkRows(ids,'sending',[]);gsr(action,payload,function(r){btn.disabled=false;btn.textContent='📤 ส่ง LINE';if(!r||!r.ok)logLineBulkClientError('manual_team_broadcast',process.batchId,ids,(r&&r.error)||'ติดต่อระบบไม่สำเร็จ');updateLineBulkRows(ids,'failed',r&&r.results||ids.map(function(id){return{memberId:id,status:'failed',reason:'request_error',error:(r&&r.error)||'ติดต่อระบบไม่สำเร็จ'};}));if(r&&r.ok)closeDeskLine();});return;}gsr(action,payload,function(r){btn.disabled=false;btn.textContent='📤 ส่ง LINE';finish(r||{ok:false,error:'ส่งไม่สำเร็จ'});if(!r||!r.ok){toast((r&&r.error)||'ส่งไม่สำเร็จ','err');return;}if(!t.broadcast&&!r.sent){toast('⚠️ '+t.name+' ยังไม่ได้ลงทะเบียน LINE Bot ครับ','err');return;}toast('📲 ส่งสำเร็จ ✅','ok');closeDeskLine();});}});
}

function loadDeskLineMembers() {
  gsr('getLineMembers',{role:S.role},function(r){
    if(r&&r.ok) {
      // API returns array [{lineUserId, name, ...}] — convert to {name: lineUserId} map
      var m={};
      (r.members||[]).forEach(function(i){if(i.name)m[i.name]=i.lineUserId;});
      D.lineMembers=m;
      _populateLineMemberSelects();
    }
  });
}

function _populateLineMemberSelects() {
  var names = Object.keys(D.lineMembers||{}).sort();
  ['mc-line-id-member'].forEach(function(id) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var first = sel.options[0];
    sel.innerHTML = '';
    sel.appendChild(first);
    names.forEach(function(n) {
      var o = document.createElement('option');
      o.value = n; o.textContent = n;
      sel.appendChild(o);
    });
  });
  _populateLinkMemberSelect();
}

function deskSendBroadcast() {
  var team = (document.getElementById('line-bc-team').value||'').trim();
  var text = (document.getElementById('line-bc-text').value||'').trim();
  if (!text) { toast('พิมพ์ข้อความก่อนครับ','err'); return; }
  var label = team || 'สมาชิกทุกคน';
  previewManualLineSend({scope:team?'team':'all',teamName:team||'',title:'ตรวจ Broadcast ก่อนส่ง',audience:label,message:text,onConfirm:function(edited,finish,pre){if(Number(pre.recipientCount||0)>1){finish();var process=openLineBulkProcess({title:'Broadcast · '+label,recipients:pre.recipients||[],retry:function(failedIds,batchId){updateLineBulkRows(failedIds,'sending',[]);gsr('sendLineBroadcast',{role:S.role,teamName:team||null,memberIds:failedIds,message:edited,confirmed:true,clientBatchId:batchId},function(retryResult){if(!retryResult||!retryResult.ok)logLineBulkClientError('manual_team_broadcast_retry',batchId,failedIds,(retryResult&&retryResult.error)||'ติดต่อระบบไม่สำเร็จ');updateLineBulkRows(failedIds,'failed',retryResult&&retryResult.results||failedIds.map(function(id){return{memberId:id,status:'failed',reason:'request_error',error:(retryResult&&retryResult.error)||'ติดต่อระบบไม่สำเร็จ'};}));});}}),ids=process.rows.map(function(row){return row.memberId;});updateLineBulkRows(ids,'sending',[]);gsr('sendLineBroadcast',{role:S.role,teamName:team||null,message:edited,confirmed:true,clientBatchId:process.batchId},function(r){if(!r||!r.ok)logLineBulkClientError('manual_team_broadcast',process.batchId,ids,(r&&r.error)||'ติดต่อระบบไม่สำเร็จ');updateLineBulkRows(ids,'failed',r&&r.results||ids.map(function(id){return{memberId:id,status:'failed',reason:'request_error',error:(r&&r.error)||'ติดต่อระบบไม่สำเร็จ'};}));if(r&&r.ok)document.getElementById('line-bc-text').value='';});return;}gsr('sendLineBroadcast',{role:S.role,teamName:team||null,message:edited,confirmed:true},function(r){finish(r||{ok:false,error:'ส่งไม่สำเร็จ'});if(!r||!r.ok){toast((r&&r.error)||'ส่งไม่สำเร็จ','err');return;}toast('ส่งสำเร็จ','ok');document.getElementById('line-bc-text').value='';});}});
}

function deskTriggerCheckinReminder() {
  if (!confirm('ส่ง Check-In Reminder ถึงสมาชิกทุกคนตอนนี้เลยไหมครับ?')) return;
  gsr('triggerCheckinReminder',{role:S.role},function(r){
    if (r&&r.ok) toast('📅 ส่ง Reminder แล้ว ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

function deskTriggerScoreAlert() {
  if (!confirm('ส่ง Low Score Alert ถึงสมาชิกที่คะแนนลด 2 เดือนติดต่อกันตอนนี้ไหมครับ?')) return;
  gsr('triggerScoreAlert',{role:S.role},function(r){
    if (r&&r.ok) toast('⚠️ Alert ส่งแล้ว '+r.alerted+' คน ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

function deskTriggerAnniversary() {
  if (!confirm('ส่ง BNI Anniversary แจ้งเตือนสมาชิกที่ครบรอบใน 30 วันตอนนี้ไหมครับ?')) return;
  gsr('triggerAnniversary',{role:S.role},function(r){
    if (r&&r.ok) toast('🎂 Anniversary Alert ส่งแล้ว '+r.sent+' คน ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

var _absenceLoaded = false;
function loadAbsenceLog(force) {
  if (_absenceLoaded && !force) return;
  gsr('getAbsenceLog',{role:S.role},function(r){
    _absenceLoaded = true;
    var wrap = document.getElementById('absence-wrap');
    var cntEl = document.getElementById('absence-count');
    if (!r||!r.ok) { wrap.innerHTML='<div style="color:var(--re);padding:16px;font-size:12px">❌ '+(r&&r.error||'error')+'</div>'; return; }
    var list = (r.list||[]).slice(0,20);
    cntEl.textContent = r.list.length + ' รายการ';
    if (!list.length) {
      wrap.innerHTML='<div style="color:var(--sub);font-size:12px;text-align:center;padding:20px">ยังไม่มีการแจ้งขาด</div>';
      return;
    }
    var TEAM_C={TOOMTAM:'#3b82f6',Aof:'var(--gr)',Draft:'var(--ye)',PHAI:'#f97316',AMP:'#a855f7'};
    var rows = list.map(function(a){
      var tc = TEAM_C[a.team]||'var(--sub)';
      var isSub = a.type==='ส่ง sub';
      var typeClr = isSub ? '#06C755' : 'var(--ye)';
      return '<tr>'
        +'<td style="font-size:11px;color:var(--sub)">'+esc(a.reportedAt)+'</td>'
        +'<td style="font-weight:600;font-size:12px">'+esc(a.nick||a.name)+'</td>'
        +'<td><span style="font-size:10px;font-weight:700;color:'+tc+'">'+esc(a.team)+'</span></td>'
        +'<td><span style="font-size:10px;font-weight:700;color:'+typeClr+'">'+esc(a.type||'ลา')+'</span></td>'
        +'<td style="font-size:11px;color:var(--sub)">'+esc(a.absDate)+'</td>'
        +'<td style="font-size:11px;color:var(--tx)">'+esc(a.detail||a.reason||'—')+'</td>'
        +'</tr>';
    }).join('');
    wrap.innerHTML='<table class="usage-log-tbl"><thead><tr>'
      +'<th>แจ้งเมื่อ</th><th>ชื่อเล่น</th><th>ทีม</th><th>ประเภท</th><th>วันที่ขาด</th><th>รายละเอียด</th>'
      +'</tr></thead><tbody>'+rows+'</tbody></table>';
  });
}

function deskSetMCLineId() {
  var name = (document.getElementById('mc-line-id-member').value||'').trim();
  if (!name) { toast('เลือกชื่อก่อนครับ','err'); return; }
  gsr('setMCLineId',{role:S.role,memberName:name},function(r){
    if (!r||!r.ok) { toast(r&&r.error||'ไม่สำเร็จ','err'); return; }
    toast('✅ บันทึก LINE ID ของ '+r.name+' เป็น MC แล้ว','ok');
  });
}

function deskTriggerChapterPulse() {
  if (!confirm('ส่ง Chapter Pulse สรุปภาพรวม Chapter ให้ MC ตอนนี้เลยไหมครับ?')) return;
  gsr('triggerChapterPulse',{role:S.role},function(r){
    if (r&&r.ok) toast('🏆 Chapter Pulse ส่งให้ MC แล้ว ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

function deskTriggerLeaderboard() {
  if (!confirm('ส่ง Team Leaderboard ให้สมาชิกทุกคนตอนนี้เลยไหมครับ?')) return;
  gsr('triggerTeamLeaderboard',{role:S.role},function(r){
    if (r&&r.ok) toast('🏆 Team Leaderboard ส่งแล้ว ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

var _lineIssuesLoaded = false;
function loadLineIssues(force) {
  if (_lineIssuesLoaded && !force) return;
  document.getElementById('line-issues-wrap').innerHTML='<div style="color:var(--sub);font-size:12px;text-align:center;padding:20px">⏳ กำลังโหลด...</div>';
  gsr('getLineIssues',{role:S.role},function(r){
    _lineIssuesLoaded = true;
    var wrap = document.getElementById('line-issues-wrap');
    var cntEl = document.getElementById('line-issues-count');
    if (!r||!r.ok) { wrap.innerHTML='<div style="color:var(--re);padding:16px;font-size:12px">❌ '+(r&&r.error||'error')+'</div>'; return; }
    var list = r.list||[];
    D.lineIssues = list;
    var open = list.filter(function(i){ return i.status==='รอดำเนินการ'||i.status==='กำลังดำเนินการ'; });
    D.lineIssueOpen = open.length;
    updateBadges();
    renderFocusBar();
    cntEl.textContent = open.length ? open.length+' รอดำเนินการ' : 'ไม่มี';
    cntEl.style.color = open.length ? 'var(--ye)' : 'var(--sub)';
    if (!list.length) { wrap.innerHTML='<div style="color:var(--sub);font-size:12px;text-align:center;padding:20px">ยังไม่มี Core Issues ที่แจ้งผ่าน LINE</div>'; return; }
    var statusColor = {'รอดำเนินการ':'var(--ye)','กำลังดำเนินการ':'#60a5fa','เสร็จสิ้น':'var(--gr)','ยกเลิก':'var(--sub)'};
    var rows = list.slice(0,20).map(function(i){
      var sc = statusColor[i.status]||'var(--sub)';
      var issueId = JSON.stringify(i.id || '');
      var memberName = JSON.stringify(i.name || '');
      var response = i.response
        ? '<div style="font-size:10px;color:#06C755;margin-top:4px">ตอบแล้ว: '+esc(String(i.response).slice(0,80))+(String(i.response).length>80?'…':'')+'</div>'
        : '';
      var actions = i.status==='เสร็จสิ้น'
        ? '<button onclick="lineIssueReopen('+issueId+')" style="font-size:10px;padding:3px 7px;background:rgba(96,165,250,.12);border:1px solid rgba(96,165,250,.3);border-radius:5px;color:#60a5fa;cursor:pointer">เปิดใหม่</button>'
        : '<button onclick="lineIssueReply('+issueId+','+memberName+',false)" style="font-size:10px;padding:3px 7px;background:rgba(6,199,85,.12);border:1px solid rgba(6,199,85,.3);border-radius:5px;color:#06C755;cursor:pointer;margin-right:4px">ตอบ</button>'
          +'<button onclick="lineIssueReply('+issueId+','+memberName+',true)" style="font-size:10px;padding:3px 7px;background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.3);border-radius:5px;color:var(--ye);cursor:pointer;margin-right:4px">ตอบ+ปิด</button>'
          +'<button onclick="lineIssueClose('+issueId+')" style="font-size:10px;padding:3px 7px;background:rgba(148,163,184,.12);border:1px solid rgba(148,163,184,.3);border-radius:5px;color:var(--sub);cursor:pointer">ปิด</button>';
      return '<tr>'
        +'<td style="font-size:11px;color:var(--sub)">'+esc(i.date)+'</td>'
        +'<td style="font-weight:600;font-size:12px">'+esc(i.name)+'<br><span style="font-size:10px;color:var(--sub)">'+(i.nick?'('+esc(i.nick)+')':'')+'</span></td>'
        +'<td style="font-size:10px;font-weight:700;color:#fb923c">'+esc(i.team)+'</td>'
        +'<td style="font-size:11px;max-width:220px">'+esc(i.detail.slice(0,90))+(i.detail.length>90?'…':'')+response+'</td>'
        +'<td><span style="font-size:10px;font-weight:700;color:'+sc+'">'+esc(i.status)+'</span></td>'
        +'<td style="white-space:nowrap">'+actions+'</td>'
        +'</tr>';
    }).join('');
    wrap.innerHTML='<table class="usage-log-tbl"><thead><tr><th>วันที่</th><th>สมาชิก</th><th>ทีม</th><th>รายละเอียด</th><th>สถานะ</th><th>Action</th></tr></thead><tbody>'+rows+'</tbody></table>';
  });
}

function lineIssueReply(issueId,memberName,closeIssue){
  var msg=prompt('ตอบกลับ '+memberName+' ทาง LINE:', closeIssue?'รับทราบครับ ทีม Mentor จะช่วยดูแลเรื่องนี้ และขอปิดเคสนี้ไว้ก่อนนะครับ':'');
  if(msg===null)return;
  msg=String(msg||'').trim();
  if(!msg){toast('กรุณาพิมพ์ข้อความตอบกลับ','err');return;}
  openLineSendReview({title:closeIssue?'ตรวจข้อความตอบกลับและปิดเคส':'ตรวจข้อความตอบกลับ',audience:memberName,message:msg,onConfirm:function(edited,finish){gsr('replyLineIssue',{role:S.role,issueId:issueId,response:edited,closeIssue:!!closeIssue,confirmed:true},function(r){finish();if(!r||!r.ok){toast('❌ '+(r&&r.error||'ตอบกลับไม่สำเร็จ'),'err',5000);return;}toast(closeIssue?'💬 ตอบกลับและปิดเคสแล้ว ✅':'💬 ตอบกลับแล้ว ✅','ok');_lineIssuesLoaded=false;_lineActivityLoaded=false;loadLineIssues(true);loadLineActivityTimeline(true);loadLineIssueBadge(true);});}});
}
function lineIssueClose(issueId){
  if(!confirm('ปิดเคสนี้โดยไม่ส่งข้อความหา member?'))return;
  gsr('updateLineIssueStatus',{role:S.role,issueId:issueId,status:'closed'},function(r){
    if(!r||!r.ok){toast('❌ '+(r&&r.error||'ปิดเคสไม่สำเร็จ'),'err');return;}
    toast('✅ ปิดเคสแล้ว','ok');
    _lineIssuesLoaded=false;_lineActivityLoaded=false;
    loadLineIssues(true);loadLineActivityTimeline(true);loadLineIssueBadge(true);
  });
}
function lineIssueReopen(issueId){
  gsr('updateLineIssueStatus',{role:S.role,issueId:issueId,status:'open'},function(r){
    if(!r||!r.ok){toast('❌ '+(r&&r.error||'เปิดเคสไม่สำเร็จ'),'err');return;}
    toast('🔄 เปิดเคสใหม่แล้ว','ok');
    _lineIssuesLoaded=false;_lineActivityLoaded=false;
    loadLineIssues(true);loadLineActivityTimeline(true);loadLineIssueBadge(true);
  });
}

function deskTriggerPostMeeting() {
  if (!confirm('ส่ง Friday Prep Prompt เตรียมประชุมวันศุกร์ให้สมาชิกทุกคนตอนนี้เลยไหมครับ?')) return;
  gsr('triggerPostMeetingPrompt',{role:S.role},function(r){
    if (r&&r.ok) toast('📋 Friday Prep Prompt ส่งแล้ว ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

function deskTriggerWednesdayNudge() {
  if (!confirm('ส่ง Friday Meeting Reminder เตือนประชุมวันศุกร์ตอนนี้เลยไหมครับ?')) return;
  gsr('triggerWednesdayNudge',{role:S.role},function(r){
    if (r&&r.ok) toast('⏰ Friday Meeting Reminder ส่งแล้ว ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

function deskSetupAllTriggers() {
  if (!confirm('ตั้งค่า Auto Trigger ทั้งหมดให้ถูกต้อง?\n(จะลบ Trigger เก่าและสร้างใหม่)')) return;
  gsr('setupAllTriggers',{role:S.role},function(r){
    if (!r||!r.ok) { toast((r&&r.error)||'เกิดข้อผิดพลาด','err'); return; }
    var msg = (r.results||[]).join('\n');
    alert('ผลการตั้งค่า Trigger:\n\n' + msg);
    toast('⚙️ ตั้งค่า Triggers แล้ว ✅','ok');
  });
}

function deskTriggerWeeklyScore() {
  if (!confirm('ส่ง Weekly Score Card ถึงสมาชิกทุกคนตอนนี้เลยไหมครับ?')) return;
  gsr('triggerWeeklyScorePush',{role:S.role},function(r){
    if (r&&r.ok) toast('📊 Score Card ส่งแล้ว '+(r.sentCount||0)+' คน ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

function deskTriggerMondayBrief() {
  if (!confirm('ส่ง Monday Morning Brief ให้สมาชิกทุกคนตอนนี้เลยไหมครับ?')) return;
  gsr('triggerMondayBrief',{role:S.role},function(r){
    if (r&&r.ok) toast('🌅 Monday Brief ส่งแล้ว ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

function deskTriggerMonthlyRecap() {
  if (!confirm('ส่ง Monthly Recap ให้สมาชิกทุกคนตอนนี้เลย?\n(ปกติส่งอัตโนมัติจันทร์แรกของเดือน)')) return;
  gsr('triggerMonthlyRecap',{role:S.role},function(r){
    if (r&&r.ok) toast('📊 Monthly Recap ส่งแล้ว ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

function deskTrigger121Reminder() {
  if (!confirm('ส่ง 1-2-1 Auto-Reminder ให้คนที่มีนัดค้างอยู่ตอนนี้เลยไหมครับ?')) return;
  gsr('trigger121Reminder',{role:S.role},function(r){
    if (r&&r.ok) toast('⏰ 1-2-1 Reminder ส่งแล้ว ✅','ok');
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

function deskCopyLineCommandGuide() {
  var txt = [
    'BNI IDEAL LINE Bot — คำสั่งที่สมาชิกใช้ได้',
    '',
    '📊 สถานะ — ดูคะแนนล่าสุด',
    '📈 ประวัติ — ดูสี/คะแนนย้อนหลัง',
    '🎯 ทำอะไร / next — ดูสิ่งที่ควรทำเร็วที่สุดเพื่อขยับสี',
    '🎯 เป้า — ดูเป้าสั้นใน LINE',
    '✍️ เป้า ref 8 — ตั้งเป้าสั้น เช่น Referral 8 ใบ',
    '📋 Blueprint — เปิดฟอร์มแผนธุรกิจประจำปี',
    '🆘 ขอความช่วยเหลือ — ดูวิธีแจ้งเรื่องให้ทีมดูแล',
    '',
    '🤝 แนะนำ — หาเพื่อน 1-2-1',
    'นัด [ชื่อ] — บันทึกนัด 1-2-1 เช่น นัด Pete',
    'เจอแล้ว — ปิดนัด 1-2-1 ล่าสุด',
    '',
    '🙋 ลา [เหตุผล] — แจ้งลา เช่น ลา ติดประชุมลูกค้า',
    '👥 ส่ง sub [ชื่อ] — แจ้งคนแทน เช่น ส่ง sub คุณสมชาย',
    'ยกเลิกลา — ยกเลิกรายการล่าสุด',
    '',
    '💬 ถาม [คำถาม] — ให้ AI ช่วยคิด เช่น ถาม จะเพิ่ม Referral ยังไงดี',
  ].join('\n');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(txt).then(function(){toast('📋 Copy คู่มือคำสั่ง LINE แล้ว','ok');});
  } else {
    var t=document.createElement('textarea');t.value=txt;document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);toast('📋 Copy คู่มือคำสั่ง LINE แล้ว','ok');
  }
}

function deskMentorBroadcast() {
  var msg = (document.getElementById('mentor-broadcast-msg').value||'').trim();
  if (!msg) { toast('กรุณาพิมพ์ข้อความก่อนครับ','err'); return; }
  var audience=S.role==='mc'?'สมาชิกทุกคน':'ทีม '+S.role;
  previewManualLineSend({scope:'team',teamName:S.teamName||'',title:'ตรวจ Mentor Broadcast ก่อนส่ง',audience:audience,message:msg,onConfirm:function(edited,finish,pre){if(Number(pre.recipientCount||0)>1){finish();var process=openLineBulkProcess({title:'Mentor Broadcast · '+audience,recipients:pre.recipients||[],retry:function(failedIds,batchId){updateLineBulkRows(failedIds,'sending',[]);gsr('mentorBroadcast',{role:S.role,memberIds:failedIds,message:edited,confirmed:true,clientBatchId:batchId},function(retryResult){if(!retryResult||!retryResult.ok)logLineBulkClientError('mentor_broadcast_retry',batchId,failedIds,(retryResult&&retryResult.error)||'ติดต่อระบบไม่สำเร็จ');updateLineBulkRows(failedIds,'failed',retryResult&&retryResult.results||failedIds.map(function(id){return{memberId:id,status:'failed',reason:'request_error',error:(retryResult&&retryResult.error)||'ติดต่อระบบไม่สำเร็จ'};}));});}}),ids=process.rows.map(function(row){return row.memberId;});updateLineBulkRows(ids,'sending',[]);gsr('mentorBroadcast',{role:S.role,message:edited,confirmed:true,clientBatchId:process.batchId},function(r){if(!r||!r.ok)logLineBulkClientError('mentor_broadcast',process.batchId,ids,(r&&r.error)||'ติดต่อระบบไม่สำเร็จ');updateLineBulkRows(ids,'failed',r&&r.results||ids.map(function(id){return{memberId:id,status:'failed',reason:'request_error',error:(r&&r.error)||'ติดต่อระบบไม่สำเร็จ'};}));if(r&&r.ok)document.getElementById('mentor-broadcast-msg').value='';});return;}gsr('mentorBroadcast',{role:S.role,message:edited,confirmed:true},function(r){finish(r||{ok:false,error:'ส่งไม่สำเร็จ'});if(r&&r.ok){toast('📢 ส่งแล้ว '+(r.sentCount||0)+' คน ✅','ok');document.getElementById('mentor-broadcast-msg').value='';}else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');});}});
}

function deskTestLineToken() {
  toast('🔌 กำลังทดสอบ LINE Token...','ok');
  gsr('testLineConnection',{role:S.role},function(r){
    if (!r||!r.ok) { toast('❌ LINE Token ไม่ถูกต้อง: '+(r&&r.error||'error'),'err'); return; }
    alert('✅ LINE Bot เชื่อมต่อสำเร็จ!\n\nBot: '+r.botName+'\nFollowers: '+r.followers+' คน\nลงทะเบียนแล้ว: '+r.registered+' คน');
  });
}

function deskSetupRichMenu() {
  if (!confirm('ตั้งค่า LINE Rich Menu (เมนูถาวรที่ด้านล่าง chat)?\nระบบจะอัปโหลดภาพเมนูเวอร์ชันล่าสุดและมอบหมายให้สมาชิกที่เชื่อม LINE')) return;
  gsr('setupRichMenu',{role:S.role},function(r){
    if (r&&r.ok) alert('✅ Rich Menu ตั้งค่าแล้ว!\n\n'+r.note);
    else toast((r&&r.error)||'เกิดข้อผิดพลาด','err');
  });
}

function deskSetupRichMenuTabs(dryRun) {
  if (!dryRun && !confirm('เปิด Rich Menu แบบ 2 หน้าให้สมาชิกที่เชื่อม LINE ทุกคนตอนนี้ใช่ไหม?\nระบบจะเก็บเมนูเดิมไว้เพื่อย้อนกลับ')) return;
  toast(dryRun?'กำลังตรวจ Rich Menu 2 หน้า…':'กำลังเปิด Rich Menu 2 หน้า…','ok');
  gsr('setupRichMenuTabs',{role:S.role,dryRun:dryRun},function(r){
    if (!r||!r.ok) { toast((r&&r.error)||'ตั้งค่า Rich Menu ไม่สำเร็จ','err'); return; }
    if (dryRun) alert('✅ Dry-run ผ่าน\n\nพบเมนู 2 หน้าและ Alias พร้อมใช้งาน\nยังไม่ได้เปลี่ยนเมนูของสมาชิก');
    else alert('✅ เปิด Rich Menu 2 หน้าแล้ว\n\nอัปเดตสมาชิก '+(r.assignedUsers||0)+' คน\nหากพบปัญหา กด “ย้อนกลับเมนูเดิม” ได้ทันที');
  });
}

function deskRollbackRichMenuTabs() {
  if (!confirm('ย้อนกลับไปใช้ Rich Menu เดิมให้สมาชิกทุกคนใช่ไหม?')) return;
  gsr('rollbackRichMenuTabs',{role:S.role},function(r){
    if (r&&r.ok) alert('✅ ย้อนกลับเมนูเดิมแล้ว\nอัปเดตสมาชิก '+(r.assignedUsers||0)+' คน');
    else toast((r&&r.error)||'ย้อนกลับไม่สำเร็จ','err');
  });
}

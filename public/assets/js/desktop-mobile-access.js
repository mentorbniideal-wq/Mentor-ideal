(function(){
  'use strict';
  var ctx=null;
  function e(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
  function call(body){return new Promise(function(resolve){adminCall(body,function(r){resolve(r||{});});});}
  function close(){var x=document.getElementById('mma-shade');if(x)x.remove();ctx=null;}
  function statusText(a,invite){
    if(a)return'<span class="mma-ok">● พร้อมใช้งาน</span>';
    if(invite&&invite.status==='pending')return'<span class="mma-warn">● ส่งคำเชิญแล้ว · รอผู้ใช้ยืนยัน</span>';
    return'<span class="mma-warn">● ยังไม่ได้ผูกบัญชี</span>';
  }
  function shell(member,item){
    var shade=document.createElement('div');shade.id='mma-shade';shade.className='mma-shade';shade.onclick=function(ev){if(ev.target===shade)close();};
    shade.innerHTML='<section class="mma-card" role="dialog" aria-modal="true" aria-labelledby="mma-title"><header><div><small>MENTOR MOBILE ACCESS</small><h2 id="mma-title">'+e(member.nickname||member.name||'สมาชิก')+'</h2><p>'+e(item.label||item.role||'Mentor Team')+'</p></div><button type="button" id="mma-close" aria-label="ปิด">✕</button></header><div id="mma-body" class="mma-body"><div class="mma-loading">กำลังตรวจสอบบัญชี…</div></div></section>';
    document.body.appendChild(shade);document.getElementById('mma-close').onclick=close;
  }
  function render(r){
    var body=document.getElementById('mma-body'),a=r.assignment,inv=r.latestInvite||{},email=a&&a.email||'';
    body.innerHTML='<div class="mma-status">'+statusText(a,inv)+'</div><div class="mma-info"><div><span>Gmail ที่ใช้เข้า</span><strong>'+(email?e(email):'ยังไม่ได้ผูก')+'</strong></div><div><span>PIN 4 ตัว</span><strong>'+(a?'ตั้งโดยผู้ใช้บนเครื่อง':'ยังไม่ได้ตั้ง')+'</strong></div></div><div class="mma-note"><b>PIN เดิมจะไม่แสดงในระบบ</b><br>PIN ใช้ปลดล็อกเฉพาะอุปกรณ์ของผู้ใช้ หากลืมรหัส ให้ส่งลิงก์ตั้ง PIN ใหม่ และให้เจ้าตัวเปิดลิงก์บนเครื่องที่จะใช้งาน</div>'+(a?'<label class="mma-label">เปลี่ยน Gmail ที่ผูก</label><div class="mma-row"><input id="mma-email" type="email" autocomplete="off" value="'+e(email)+'" placeholder="name@gmail.com"><button id="mma-save-email">บันทึกอีเมล</button></div>':'')+'<button id="mma-reset" class="mma-primary">'+(a?'ส่งลิงก์ตั้ง PIN ใหม่':'ส่งคำเชิญเข้า Mentor Mobile')+'</button><div id="mma-msg" class="mma-msg"></div>';
    var save=document.getElementById('mma-save-email');if(save)save.onclick=saveEmail;
    document.getElementById('mma-reset').onclick=sendInvite;
  }
  async function load(){var r=await call({action:'getMentorMobileAccess',memberId:ctx.memberId});if(!r.ok){document.getElementById('mma-body').innerHTML='<div class="mma-error">'+e(r.error||'โหลดข้อมูลไม่สำเร็จ')+'</div>';return;}ctx.data=r;render(r);}
  async function saveEmail(){var input=document.getElementById('mma-email'),msg=document.getElementById('mma-msg'),email=(input.value||'').trim().toLowerCase();if(!email){msg.textContent='กรุณากรอก Gmail';return;}if(!confirm('เปลี่ยน Gmail สำหรับเข้า Mentor Mobile เป็น\n'+email+' ?'))return;msg.textContent='กำลังบันทึก…';var r=await call({action:'updateMentorMobileEmail',memberId:ctx.memberId,email:email});if(!r.ok){msg.textContent='❌ '+(r.error||'เปลี่ยนอีเมลไม่ได้');return;}toast('✅ เปลี่ยน Gmail ที่ผูกแล้ว','ok');await load();}
  async function sendInvite(){var member=ctx.member;if(!member.lineLinked){document.getElementById('mma-msg').textContent='❌ สมาชิกยังไม่ได้เชื่อม LINE';return;}if(!confirm((ctx.data&&ctx.data.assignment?'ส่งลิงก์ให้ตั้ง PIN ใหม่':'ส่งคำเชิญเข้า Mentor Mobile')+' ผ่าน LINE ให้ '+(member.nickname||member.name)+' ?'))return;var msg=document.getElementById('mma-msg');msg.textContent='กำลังสร้างลิงก์…';var r=await call({action:'createMobileAccessInvite',memberId:ctx.memberId,approvedRole:ctx.access.role,teamName:ctx.access.team});if(!r.ok){msg.textContent='❌ '+(r.error||'สร้างลิงก์ไม่ได้');return;}var sent=await call({action:'sendMobileAccessInvite',inviteId:r.inviteId,inviteToken:r.inviteToken});if(!sent.ok){msg.textContent='❌ '+(sent.error||'ส่ง LINE ไม่สำเร็จ');return;}toast('✅ ส่งลิงก์ Mentor Mobile แล้ว','ok');await load();}
  window.openMentorMobileAccess=function(index){var d=window._ltTeamData||{},item=(d.roles||[])[index],access=item&&ltMentorAccess(item.role),memberId=(document.getElementById('lt-main-'+index)||{}).value||'',member=(d.members||[]).find(function(x){return x.id===memberId;});if(!access||!member){toast('❌ กรุณาเลือกและบันทึกผู้รับตำแหน่งก่อน','err');return;}ctx={index:index,item:item,access:access,memberId:memberId,member:member};shell(member,item);load();};
  window.closeMentorMobileAccess=close;
})();

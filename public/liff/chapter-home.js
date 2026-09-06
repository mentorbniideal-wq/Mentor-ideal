let chapterHomeLoaded=false;

function chapterHomeGo(view){
  show(view);
  window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}

function chapterHomeAction(icon,title,detail,view,label){
  return `<div class="chapter-action"><span>${icon}</span><div><b>${escHtml(title)}</b><small>${escHtml(detail)}</small></div><button type="button" onclick="chapterHomeGo('${view}')">${escHtml(label)}</button></div>`;
}

function chapterHomeHelp(category){
  chapterHomeGo('issue');
  const option=document.querySelector(`[name="issueCategory"][value="${category}"]`);
  if(option){option.checked=true;document.getElementById('issueText')?.focus();}
}

async function loadChapterHome(force=false){
  const box=$('#chapterHomeContent');
  if(!box||chapterHomeLoaded&&!force)return;
  box.innerHTML='<div class="loading" style="padding:28px 0">กำลังรวมเรื่องสำคัญ…</div>';
  let r;
  if(new URLSearchParams(location.search).get('preview')==='1'){
    r={ok:true,profileCompleteness:60,pair:{status:'matched',partnerName:'เพื่อนสมาชิก'},pendingVisitors:1,openRequests:1,daysToExpiry:120,upcomingTraining:2,pendingFollowUps:1};
  }else{
    r=await api({action:'member-home'},{latestKey:'member-home'});
  }
  if(!r.ok){
    box.innerHTML=`<div class="oto-history-empty">${escHtml(r.error||'โหลดหน้าวันนี้ไม่สำเร็จ')}<br><button class="oto-history-refresh" style="margin-top:10px" onclick="loadChapterHome(true)">ลองใหม่</button></div>`;
    return;
  }
  chapterHomeLoaded=true;
  const actions=[];
  if(Number(r.profileCompleteness||0)<100)actions.push(chapterHomeAction('👤','เติม Business Profile',`กรอกแล้ว ${r.profileCompleteness||0}% · ช่วยให้คู่รู้จักคุณล่วงหน้า`,'121','เติมข้อมูล'));
  if(r.pair)actions.push(chapterHomeAction('🤝',`คู่ 1-2-1 · ${r.pair.partnerName||'คู่ของคุณ'}`,r.pair.nextAction||'เปิด MY121 เพื่อดูขั้นตอนถัดไป','121','เปิด MY121'));
  if(Number(r.pendingFollowUps||0)>0)actions.push(chapterHomeAction('✅','สิ่งที่ตกลงไว้',`ยังมี ${r.pendingFollowUps} รายการที่ต้องทำต่อ`,'121','ดูรายการ'));
  if(Number(r.daysToExpiry||0)>0&&Number(r.daysToExpiry)<=60)actions.push(chapterHomeAction('🔄','ตรวจสอบการต่ออายุ',`เหลือ ${r.daysToExpiry} วัน · ดูข้อมูลก่อนตัดสินใจ`,'renewal','ดูรายละเอียด'));
  if(!actions.length)actions.push(chapterHomeAction('🎯','ตั้งเป้าหมายถัดไป','งานสำคัญครบแล้ว ลองเลือกเรื่องที่อยากพัฒนา','goal','เปิดเป้าหมาย'));
  box.innerHTML=`<section class="chapter-next"><h3>ทำต่อก่อน 1–3 เรื่อง</h3>${actions.slice(0,3).join('')}</section><div class="chapter-pulse"><div><b>${r.pendingVisitors||0}</b><small>Visitor ที่ติดตาม</small></div><div><b>${r.upcomingTraining||0}</b><small>การอบรมที่กำลังมา</small></div><div><b>${r.openRequests||0}</b><small>คำขอที่กำลังดูแล</small></div></div><div class="chapter-links chapter-links-primary"><button type="button" onclick="chapterHomeGo('absence')"><b>🗓️ แจ้งลา / ส่งตัวแทน</b><small>แจ้งทีมประชุมล่วงหน้า</small></button><button type="button" onclick="chapterHomeGo('visitor')"><b>👥 มี Visitor มา</b><small>ลงทะเบียนและติดตามแขก</small></button><button type="button" onclick="chapterHomeHelp('referral')"><b>🔗 Connection / Referral</b><small>ให้ทีมช่วยเปิดโอกาสทางธุรกิจ</small></button><button type="button" onclick="chapterHomeGo('goal')"><b>🎯 ตั้งเป้าหมาย</b><small>เลือกเรื่องสำคัญที่อยากพัฒนา</small></button><button type="button" onclick="chapterHomeGo('ceu')"><b>🎓 อบรมและต่ออายุ</b><small>ดูหลักสูตรและเรื่องสมาชิกภาพ</small></button><button type="button" onclick="chapterHomeGo('issue')"><b>💬 ขอความช่วยเหลือ</b><small>ระบบส่งต่อให้ทีมที่เหมาะสม</small></button></div>`;
}

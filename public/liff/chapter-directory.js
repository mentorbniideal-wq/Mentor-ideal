let chapterDirectoryLoaded=false;
let chapterDirectoryTimer=0;
let chapterDirectoryFilter='ready';

const directoryPreviewRows=[
  {id:'preview-1',name:'มินตรา วัฒนกิจ',nickname:'มิ้นท์',profession:'นักวางแผนการเงิน',companyName:'Ideal Wealth',directoryOptIn:true,businessSummary:'ช่วยเจ้าของธุรกิจวางแผนการเงินส่วนตัวและธุรกิจให้ไปด้วยกันได้',lookingFor:'เจ้าของธุรกิจที่กำลังขยายทีม หรือเตรียมส่งต่อกิจการ',idealClient:'ผู้บริหารอายุ 35–55 ปีที่พร้อมวางแผนระยะยาว',referralTrigger:'ได้ยินว่า “เงินบริษัทกับเงินส่วนตัวยังปนกันอยู่”'},
  {id:'preview-2',name:'นนท์ พัฒนาการ',nickname:'นนท์',profession:'ที่ปรึกษาการตลาด',companyName:'Growth Studio',directoryOptIn:true,businessSummary:'วางระบบการตลาดให้ SME เปลี่ยนความสนใจเป็นยอดขายที่วัดผลได้',lookingFor:'ธุรกิจบริการที่มีทีมขาย แต่ Lead ยังไม่สม่ำเสมอ',idealClient:'SME ที่มีสินค้าแข็งแรงและต้องการขยายตลาด',referralTrigger:'เจ้าของธุรกิจบอกว่า “ยิงโฆษณาแล้ว แต่ไม่รู้ว่าลูกค้ามาจากไหน”'},
  {id:'preview-3',name:'ชลธิชา สุขใจ',nickname:'แป้ง',profession:'ผู้ประกอบการสุขภาพ',companyName:'Better Living',directoryOptIn:false,businessSummary:'',lookingFor:'',idealClient:'',referralTrigger:''},
];

function directoryInitial(value){return String(value||'?').trim().charAt(0).toLocaleUpperCase('th-TH');}
function directoryMeta(row){return [row.profession,row.companyName].filter(Boolean).join(' · ')||'สมาชิก Chapter';}
function directoryMatchesPreview(row,query){const q=String(query||'').trim().toLocaleLowerCase('th-TH');if(!q)return true;return [row.name,row.nickname,row.profession,row.companyName,row.businessSummary,row.lookingFor,row.idealClient,row.referralTrigger].join(' ').toLocaleLowerCase('th-TH').includes(q);}

function renderChapterDirectory(rows,notice,total=rows.length,savedCount=0){
  const box=$('#directoryResults');if(!box)return;
  const status=$('#directoryStatus');if(status)status.textContent=chapterDirectoryFilter==='saved'?`บันทึก ${total} คน`:`พบ ${total} คน${savedCount?` · บันทึก ${savedCount}`:''}`;
  if(!rows.length){box.innerHTML='<div class="directory-empty"><b>ยังไม่พบสมาชิกที่ตรงคำค้น</b>ลองใช้ชื่อ อาชีพ ปัญหาของลูกค้า หรือคำที่ได้ยินจากลูกค้า</div>';return;}
  box.innerHTML=`<div class="directory-list">${rows.map(row=>{const readiness=Number(row.referralReadiness?.percent||0),updated=directoryUpdatedText(row.profileUpdatedAt),matches=row.matchReasons||[];return `<article class="directory-item"><div class="directory-person"><span class="directory-avatar">${escHtml(directoryInitial(row.nickname||row.name))}</span><div><b>${escHtml(row.nickname?`คุณ ${row.nickname}`:row.name||'สมาชิก')}</b><small>${escHtml(directoryMeta(row))}</small></div></div>${matches.length?`<div class="directory-match">${matches.map(x=>`<span>ตรงกับ · ${escHtml(x)}</span>`).join('')}</div>`:''}${row.businessSummary?`<p class="directory-summary">${escHtml(row.businessSummary)}</p>`:''}${row.directoryOptIn?`<div class="directory-signals">${row.lookingFor?`<div class="directory-signal"><b>Looking for</b> · ${escHtml(row.lookingFor)}</div>`:''}${row.referralTrigger?`<div class="directory-signal"><b>Referral Trigger</b> · ${escHtml(row.referralTrigger)}</div>`:''}</div><div class="directory-readiness"><span>${escHtml(directoryReadinessText(row))} ${readiness}%</span><i style="--readiness:${readiness}%"></i>${updated?`<span class="directory-updated">${escHtml(updated)}</span>`:''}</div>`:'<p class="directory-locked">🔒 สมาชิกท่านนี้ยังไม่ได้เปิดแชร์ Referral Focus</p>'}<div class="directory-card-actions"><button type="button" onclick="openDirectoryProfile('${escHtml(row.id)}')">${row.directoryOptIn?'ดู Referral Focus':'ดูข้อมูลพื้นฐาน'}</button><button type="button" class="directory-bookmark ${row.isBookmarked?'on':''}" aria-label="${row.isBookmarked?'นำออกจากรายการที่บันทึก':'บันทึกคนนี้ไว้'}" onclick="toggleDirectoryBookmark('${escHtml(row.id)}',${!row.isBookmarked},this)">${row.isBookmarked?'★':'☆'}</button></div></article>`;}).join('')}</div>${notice?`<p class="directory-privacy">${escHtml(notice)}</p>`:''}`;
}

async function loadChapterDirectory(force=false){
  const box=$('#directoryResults'),input=$('#directoryQuery');if(!box)return;
  const query=String(input?.value||'').trim();if(chapterDirectoryLoaded&&!force&&!query)return;
  box.innerHTML='<div class="loading" style="padding:24px 0">กำลังค้นหาโอกาสใน Chapter…</div>';
  let r;
  if(new URLSearchParams(location.search).get('preview')==='1'){let rows=directoryPreviewRows.filter(row=>directoryMatchesPreview(row,query)).map(row=>({...row,referralReadiness:{percent:row.directoryOptIn?78:0},profileUpdatedAt:new Date().toISOString(),matchReasons:query?['ข้อมูลธุรกิจ']:[],isBookmarked:row.id==='preview-1'}));rows=rows.filter(row=>chapterDirectoryFilter==='all'||chapterDirectoryFilter==='ready'&&row.directoryOptIn||chapterDirectoryFilter==='saved'&&row.isBookmarked);r={ok:true,results:rows,total:rows.length,savedCount:1};}
  else r=await api({action:'chapter-directory',query,filter:chapterDirectoryFilter},{latestKey:'chapter-directory'});
  if(r.stale)return;
  if(!r.ok){box.innerHTML=`<div class="directory-empty"><b>ค้นหารายชื่อไม่สำเร็จ</b>${escHtml(r.error||'กรุณาลองใหม่')}<br><button class="oto-history-refresh" style="margin-top:10px" onclick="loadChapterDirectory(true)">ลองใหม่</button></div>`;return;}
  chapterDirectoryLoaded=true;renderChapterDirectory(r.results||[],r.privacyNotice||'',Number(r.total||0),Number(r.savedCount||0));
}

function directorySuggestion(value){const input=$('#directoryQuery');if(!input)return;input.value=value;input.focus();loadChapterDirectory(true);}

function closeDirectoryProfile(){const root=$('#directoryProfile');if(!root)return;root.hidden=true;root.innerHTML='';document.body.style.overflow='';}
function directoryProfileField(label,value,wide=false){return value?`<div class="directory-profile-field ${wide?'wide':''}"><b>${escHtml(label)}</b><p>${escHtml(value)}</p></div>`:'';}

async function openDirectoryProfile(memberId){
  const root=$('#directoryProfile');if(!root)return;root.hidden=false;root.innerHTML='<div class="loading">กำลังเปิด Business Profile…</div>';document.body.style.overflow='hidden';
  let r;
  if(new URLSearchParams(location.search).get('preview')==='1'){
    const member=directoryPreviewRows.find(row=>row.id===memberId)||directoryPreviewRows[0];
    r={ok:true,member,profile:member.directoryOptIn?{business_summary:member.businessSummary,looking_for:member.lookingFor,ideal_client:member.idealClient,referral_trigger:member.referralTrigger,good_referral:'ผู้บริหารที่มีอำนาจตัดสินใจและพร้อมทบทวนข้อมูล',before_intro_question:'ตอนนี้อยากแก้ปัญหานี้ภายในช่วงเวลาใด?'}:null,currentPairId:memberId==='preview-1'?'preview-pair':null,privacyNotice:'ใช้ข้อมูลนี้เพื่อมองเห็นโอกาส Referral กรุณาไม่ส่งต่อข้อมูลโดยไม่ได้รับอนุญาต'};
  }else r=await api({action:'chapter-directory-profile',memberId},{latestKey:'chapter-directory-profile'});
  if(!r.ok){root.innerHTML=`<div class="directory-modal-wrap"><div class="directory-empty"><b>เปิดโปรไฟล์ไม่สำเร็จ</b>${escHtml(r.error||'กรุณาลองใหม่')}</div><button class="directory-pair-action" onclick="closeDirectoryProfile()">กลับ</button></div>`;return;}
  const m=r.member||{},p=r.profile||{};
  const fields=[directoryProfileField('ธุรกิจช่วยใครและทำอะไร',p.business_summary,true),directoryProfileField('กลุ่มลูกค้าหลัก',p.target_clients),directoryProfileField('ปัญหาที่ช่วยแก้',p.problems_solved),directoryProfileField('สินค้า/บริการหลัก',p.primary_services),directoryProfileField('จุดแตกต่าง',p.differentiators),directoryProfileField('พื้นที่ให้บริการ',p.service_area),directoryProfileField('Looking for',p.looking_for,true),directoryProfileField('Ideal Client',p.ideal_client),directoryProfileField('Referral Trigger',p.referral_trigger),directoryProfileField('Good Referral',p.good_referral),directoryProfileField('กรณีที่ยังไม่เหมาะ',p.not_a_fit),directoryProfileField('ก่อนแนะนำควรถามอะไร',p.before_intro_question),directoryProfileField('สิ่งที่ไม่ควรรับปากแทน',p.promise_boundaries),directoryProfileField('Credibility Story',p.credibility_story,true),directoryProfileField('ประโยคแนะนำ',p.introduction_script,true)].filter(Boolean).join('');
  root.innerHTML=`<header class="directory-modal-head"><button type="button" onclick="closeDirectoryProfile()">‹</button><div><b>${escHtml(m.nickname?`คุณ ${m.nickname}`:m.name||'Business Profile')}</b><small>${escHtml(directoryMeta(m))}</small></div></header><div class="directory-modal-wrap"><section class="directory-profile-hero"><small>SMART CHAPTER DIRECTORY</small><h2>${escHtml(m.nickname?`รู้จักคุณ ${m.nickname}`:m.name||'สมาชิก')}</h2><p>${escHtml(m.businessSummary||'ดูหมวดอาชีพและข้อมูลธุรกิจที่สมาชิกเลือกเปิดแชร์')}</p></section>${fields?`<div class="directory-profile-grid">${fields}</div>`:'<div class="directory-empty"><b>ข้อมูลพื้นฐานพร้อมใช้งาน</b>สมาชิกท่านนี้ยังไม่ได้เปิดแชร์ Business Profile เชิงลึก</div>'}<p class="directory-profile-note">🔒 ${escHtml(r.privacyNotice||'ใช้ข้อมูลนี้ภายใน Chapter และไม่ส่งต่อโดยไม่ได้รับอนุญาต')}<br>GAINS, อีเมล และเบอร์โทรจะไม่แสดงใน Directory</p>${r.currentPairId?'<button class="directory-pair-action" type="button" onclick="closeDirectoryProfile();show(\'121\')">เปิด MY121 ของคู่คนนี้</button>':''}</div>`;
}

document.addEventListener('DOMContentLoaded',()=>{
  const input=$('#directoryQuery'),clear=$('#directoryClear');
  input?.addEventListener('input',()=>{clearTimeout(chapterDirectoryTimer);chapterDirectoryTimer=setTimeout(()=>loadChapterDirectory(true),300);});
  input?.addEventListener('search',()=>loadChapterDirectory(true));
  clear?.addEventListener('click',()=>{if(input)input.value='';loadChapterDirectory(true);input?.focus();});
  const requestedMember=new URLSearchParams(location.search).get('member');
  if(getRequestedAction?.()==='directory'&&requestedMember)openDirectoryProfile(requestedMember);
});

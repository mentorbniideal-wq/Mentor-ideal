(function(){
  'use strict';
  var cache=null,loading=false,filters={kind:'all',status:'all',query:''};
  function e(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
  function date(v){if(!v)return'ยังไม่เคยส่ง';try{return new Date(v).toLocaleString('th-TH',{dateStyle:'short',timeStyle:'short'});}catch(_){return String(v);}}
  function kpi(label,value,sub,tone){return'<div class="lac-kpi"><small>'+e(label)+'</small><b class="'+(tone||'')+'">'+e(value)+'</b><span>'+e(sub||'')+'</span></div>';}
  function quotaText(q){if(!q||!q.ok)return'ตรวจไม่ได้';return q.unlimited?'∞':Number(q.remaining||0).toLocaleString('th-TH');}
  function kindLabel(v){return({scheduled:'ตามเวลา',event:'ตามเหตุการณ์',manual:'ผู้ดูแลกดส่ง',system:'งานระบบ'})[v]||'ยังไม่จัดประเภท';}
  function decisionLabel(v){return({keep:'ควรเก็บ',limit:'ใช้แบบพอดี',disable:'ซ้ำ / ควรปิด',system:'งานระบบ',review:'รอตรวจ'})[v]||'รอตรวจ';}
  function card(x,canEdit){
    var s=x.stats||{},enabled=!!x.enabled,protectedFlag=!!x.protected;
    return'<article class="lac-panel lac-card '+(enabled?'':'off')+'">'
      +'<div class="lac-card-head"><div><div class="lac-title">'+e(x.name)+'</div><div class="lac-tags">'
      +'<span class="lac-tag decision-'+e(x.decision)+'">'+e(decisionLabel(x.decision))+' · '+e(x.value_score||0)+'/100</span>'
      +'<span class="lac-tag kind-'+e(x.delivery_kind)+'">'+e(kindLabel(x.delivery_kind))+'</span>'
      +'<span class="lac-tag '+e(x.importance)+'">'+e(x.importance)+'</span><span class="lac-tag">Quota '+e(x.quota_impact)+'</span></div></div>'
      +'<button class="lac-toggle '+(enabled?'on':'')+'" '+((!canEdit||protectedFlag)?'disabled':'')+' onclick="lineAutoToggle(\''+e(x.automation_key)+'\','+(!enabled)+')">'+(protectedFlag?'🔒 จำเป็น':enabled?'เปิดอยู่':'ปิดอยู่')+'</button></div>'
      +'<dl class="lac-detail"><dt>เวลา</dt><dd>'+e(x.schedule_label)+'</dd><dt>ผู้รับ</dt><dd>'+e(x.audience)+'</dd><dt>เหตุผล</dt><dd>'+e(x.purpose)+'</dd>'
      +'<dt>30 วัน</dt><dd>ส่ง '+e(s.sent||0)+' · ล้มเหลว '+e(s.failed||0)+' · ระงับ '+e(s.suppressed||0)+'</dd>'
      +'<dt>ผลต่อเนื่อง</dt><dd>'+e(s.actions||0)+' คนมี Action ภายใน 72 ชม. ('+e(s.actionRate||0)+'%)'+(s.messagesPerAction?' · '+e(s.messagesPerAction)+' msg/action':'')+'</dd>'
      +'<dt>ปิดรับ</dt><dd>'+e(s.muted||0)+' คน</dd><dt>ล่าสุด</dt><dd>'+e(date(s.lastSentAt))+'</dd><dt>ต้นทาง</dt><dd>'+e(x.source)+' / '+e(x.notification_type||'ไม่ส่งข้อความ')+'</dd></dl>'
      +'<div class="lac-rec">'+(x.duplicate_note?'🔎 '+e(x.duplicate_note)+'<br>':'')+'💡 '+e(x.recommendation||'ทบทวนตามประโยชน์และจำนวนผู้รับจริง')+'</div>'
      +'<div class="lac-card-foot"><span>Action rate เป็นค่าประมาณจากกิจกรรมหลังส่ง</span><span>'+(x.updated_by?'แก้โดย '+e(x.updated_by):'ค่าเริ่มต้นระบบ')+'</span></div></article>';
  }
  function wanted(rows){return rows.filter(function(x){
    var text=[x.name,x.notification_type,x.module,x.audience,x.purpose].join(' ').toLowerCase();
    return(filters.kind==='all'||x.delivery_kind===filters.kind)
      &&(filters.status==='all'||(filters.status==='on'&&x.enabled)||(filters.status==='off'&&!x.enabled)||(filters.status==='duplicate'&&x.decision==='disable')||(filters.status==='high'&&x.quota_impact==='high'))
      &&(!filters.query||text.indexOf(filters.query.toLowerCase())>=0);
  });}
  function render(r){
    var q=r.quota||{},s=r.summary||{},controls=r.controls||[],visible=wanted(controls),broad=controls.filter(function(x){return x.enabled&&x.quota_impact==='high';}).length;
    var badge=document.getElementById('badge-line-auto');if(badge){badge.textContent=broad||'';badge.style.display=broad?'inline-flex':'none';}
    var html='<div class="lac-kpis">'+kpi('LINE คงเหลือ',quotaText(q),q.unlimited?'Unlimited':('ส่งแล้ว '+Number(q.used||0).toLocaleString('th-TH')),(q.remaining!=null&&q.remaining<100)?'lac-bad':'lac-good')+kpi('Auto ทั้งหมด',s.total||0,'ทุกระบบใน Desktop','')+kpi('เปิดใช้งาน',s.enabled||0,'รวมงานระบบที่จำเป็น','lac-good')+kpi('Broadcast กว้าง',s.broadEnabled||0,'ควรเหลือให้น้อยที่สุด',s.broadEnabled>1?'lac-warn':'lac-good')+kpi('ส่งเดือนนี้',s.monthSent||0,'จาก Delivery Log','')+'</div>';
    html+='<section class="lac-panel lac-toolbar"><div><h3>รูปแบบการส่ง</h3><p>แนะนำ “เฉพาะจำเป็น” เพื่อให้สมาชิกได้รับเฉพาะข้อความที่นำไปทำต่อได้</p></div><div class="lac-presets">'+(r.canEdit?'<button onclick="lineAutoPreset(\'essential\')">✓ เฉพาะจำเป็น</button><button onclick="lineAutoPreset(\'balanced\')">สมดุล</button><button onclick="lineAutoPreset(\'all\')">เปิดทั้งหมด</button>':'<span class="lac-tag">Mentor Co. ดูได้ · Chapter Admin แก้ไขได้</span>')+'</div></section>';
    html+='<section class="lac-panel lac-filters"><input aria-label="ค้นหาข้อความ Auto" placeholder="ค้นหาชื่อข้อความ ผู้รับ หรือระบบ…" value="'+e(filters.query)+'" oninput="lineAutoFilter(\'query\',this.value)"><select aria-label="ประเภทข้อความ" onchange="lineAutoFilter(\'kind\',this.value)"><option value="all">ทุกประเภท</option><option value="scheduled" '+(filters.kind==='scheduled'?'selected':'')+'>ตามเวลา</option><option value="event" '+(filters.kind==='event'?'selected':'')+'>ตามเหตุการณ์</option><option value="manual" '+(filters.kind==='manual'?'selected':'')+'>ผู้ดูแลกดส่ง</option><option value="system" '+(filters.kind==='system'?'selected':'')+'>งานระบบ</option></select><select aria-label="สถานะข้อความ" onchange="lineAutoFilter(\'status\',this.value)"><option value="all">ทุกสถานะ</option><option value="on" '+(filters.status==='on'?'selected':'')+'>เปิดอยู่</option><option value="off" '+(filters.status==='off'?'selected':'')+'>ปิดอยู่</option><option value="duplicate" '+(filters.status==='duplicate'?'selected':'')+'>ข้อความซ้ำ</option><option value="high" '+(filters.status==='high'?'selected':'')+'>ใช้โควตาสูง</option></select><span>พบ '+visible.length+' รายการ</span></section>';
    var groups=[['keep','ควรเก็บ — ส่งเฉพาะเมื่อมีเรื่องให้ทำ'],['limit','ใช้แบบพอดี — จำกัดความถี่'],['disable','ซ้ำหรือประโยชน์ต่ำ — ปิดไว้'],['review','ค้นพบใหม่ — รอตรวจ'],['system','งานระบบ — ไม่กินโควตา']];
    groups.forEach(function(g){var rows=visible.filter(function(x){return(x.decision||'review')===g[0];}).sort(function(a,b){return Number(b.value_score||0)-Number(a.value_score||0);});if(rows.length)html+='<div class="lac-group"><h3>'+e(g[1])+' <span>'+rows.length+' รายการ</span></h3><div class="lac-grid">'+rows.map(function(x){return card(x,r.canEdit);}).join('')+'</div></div>';});
    if(!visible.length)html+='<div class="lac-state">ไม่พบข้อความตามตัวกรองนี้</div>';
    var recent=r.recent||[];html+='<section class="lac-panel lac-recent"><h3>ข้อความล่าสุดจากทุกเส้นทาง</h3>'+(recent.length?recent.map(function(x){return'<div class="lac-recent-row"><b>'+e(x.notification_type||'system')+'</b><span>'+e(x.source||'ไม่ทราบต้นทาง')+' · '+e(x.status)+'</span><span>'+e(x.estimated_count||1)+' msg</span><span>'+e(date(x.sent_at||x.created_at))+'</span></div>';}).join(''):'<div class="lac-state">ยังไม่มี Delivery Log</div>')+'</section>';
    document.getElementById('line-auto-root').innerHTML=html;
  }
  window.loadLineAutoControlCenter=function(force){if(loading)return;if(cache&&!force){render(cache);return;}loading=true;var root=document.getElementById('line-auto-root');if(root)root.innerHTML='<div class="lac-state">กำลังตรวจทุกระบบที่ส่ง LINE อัตโนมัติ…</div>';gsr('getLineAutoControlCenter',{days:30},function(r){loading=false;if(!r||!r.ok){root.innerHTML='<div class="lac-state lac-bad">โหลด LINE AUTO ไม่สำเร็จ<br>'+e(r&&r.error||'unknown')+'</div>';return;}cache=r;render(r);});};
  window.lineAutoFilter=function(key,value){filters[key]=value;if(cache)render(cache);};
  window.lineAutoToggle=function(key,enabled){var x=(cache&&cache.controls||[]).find(function(row){return row.automation_key===key;})||{};var impact=Number((x.stats||{}).sent||0);var msg=(enabled?'เปิด':'ปิด')+' “'+(x.name||key)+'” ?\nผู้รับ: '+(x.audience||'—')+'\nเวลา: '+(x.schedule_label||'—')+'\n30 วันที่ผ่านมา: '+impact+' ข้อความ';if(!confirm(msg))return;gsr('setLineAutomationControl',{automationKey:key,enabled:enabled},function(r){if(!r||!r.ok){toast('❌ '+(r&&r.error||'บันทึกไม่ได้'),'err');return;}toast('✅ บันทึกแล้ว','ok');cache=null;loadLineAutoControlCenter(true);});};
  window.lineAutoPreset=function(preset){var labels={essential:'เฉพาะจำเป็น',balanced:'สมดุล',all:'เปิดทั้งหมด'},rows=(cache&&cache.controls||[]).filter(function(x){return!x.discovered;}),changed=0,estimate=0;rows.forEach(function(x){var desired=!!x.protected||preset==='all'||(preset==='balanced'&&['keep','limit','system'].includes(x.decision))||(preset==='essential'&&['keep','system'].includes(x.decision)&&['critical','high','system'].includes(x.importance));if(desired!==!!x.enabled){changed++;if(desired)estimate+=Number((x.stats||{}).sent||({high:50,targeted:5,medium:15,low:1,none:0}[x.quota_impact]||5));}});if(!confirm('ใช้รูปแบบ “'+labels[preset]+'” ?\n\nจะเปลี่ยน '+changed+' รายการ\nคาดว่าอาจเพิ่มการส่งประมาณ '+estimate+' ข้อความ/30 วัน\n\nข้อความสำคัญที่ล็อกไว้จะไม่ถูกปิด'))return;gsr('applyLineAutomationPreset',{preset:preset},function(r){if(!r||!r.ok){toast('❌ '+(r&&r.error||'ปรับรูปแบบไม่ได้'),'err');return;}toast('✅ ใช้รูปแบบ '+labels[preset]+' แล้ว','ok');cache=null;loadLineAutoControlCenter(true);});};
})();

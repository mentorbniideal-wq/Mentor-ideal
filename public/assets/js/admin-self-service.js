(function(){
  'use strict';
  var tools=[
    ['configuration','Chapter และปี Blueprint','ชื่อ วันประชุม และปีที่เปิดรับ Blueprint','/admin/settings.html'],
    ['access','บัญชีและสิทธิ์','เพิ่มผู้ใช้ เปลี่ยนบทบาท ระงับสิทธิ์ และกำหนดวันสิ้นสุด','mc-access'],
    ['people','ข้อมูลสมาชิก','แก้ข้อมูลสมาชิก ทีม Mentor และการเชื่อม LINE','mc-mem'],
    ['roles','ตำแหน่งและงานดูแล','กำหนด LT และติดตามงานที่ส่งต่อระหว่างทีม','mc-lt-team'],
    ['line','ข้อความอัตโนมัติ','แก้ข้อความ เวลาเปิดใช้งาน และตรวจผลส่งใน LINE AUTO','mc-line-auto'],
    ['scores','นำเข้าคะแนนรายเดือน','ตรวจ Preview นำเข้า และดูประวัติ/ย้อน batch ล่าสุด','sync'],
    ['aliases','ชื่อที่ระบบจำไว้','แก้ชื่อในไฟล์ที่เคยผูกสมาชิกผิด พร้อมประวัติการเปลี่ยน','aliases'],
    ['pairs','จัดการ 1-2-1','ตรวจคู่ นัดหมาย การรับรอง และรายการที่ต้องช่วย','mc-w121'],
    ['blueprint','Blueprint ของสมาชิก','ดูแผนและติดตามการส่งข้อมูลของสมาชิก','mc-msb'],
    ['health','ตรวจสุขภาพระบบ','ข้อมูลซ้ำ ความพร้อมบัญชี และ audit การเปลี่ยนแปลง','mc-chapter-center']
  ];
  var returnFocus;
  function allowed(){return window.S&&S.isAdmin&&!S.isViewer;}
  window.openAdminSelfService=function(){
    if(!allowed())return;
    var dialog=document.getElementById('admin-self-service');
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='admin-self-service';dialog.setAttribute('aria-labelledby','admin-tools-title');
      dialog.style.cssText='box-sizing:border-box;width:min(820px,calc(100vw - 24px));max-height:calc(100dvh - 32px);overflow:auto;border:1px solid var(--bd);border-radius:18px;padding:20px;background:var(--sf);color:var(--tx)';
      dialog.innerHTML='<div style="display:flex;align-items:center;gap:12px"><h2 id="admin-tools-title" style="font-size:18px;flex:1;margin:0">เครื่องมือ Admin</h2><button type="button" class="bsm" data-close>ปิด</button></div><p style="font-size:13px;color:var(--sub);line-height:1.6">เลือกงานที่ต้องการจัดการ ระบบจะเปิดหน้าดูแลที่เกี่ยวข้อง</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:10px">'+tools.map(function(t){return '<button type="button" class="bsm" data-admin-tool="'+t[0]+'" style="text-align:left;white-space:normal;padding:14px;min-height:86px"><b style="display:block;font-size:14px">'+t[1]+'</b><small style="display:block;color:var(--sub);font-size:12px;line-height:1.6;margin-top:5px">'+t[2]+'</small></button>';}).join('')+'</div>';
      dialog.addEventListener('click',function(event){var close=event.target.closest('[data-close]'),button=event.target.closest('[data-admin-tool]');if(close){dialog.close();return;}if(button)openTool(button.dataset.adminTool);});
      dialog.addEventListener('close',function(){if(returnFocus)returnFocus.focus();});
      document.body.appendChild(dialog);
    }
    returnFocus=document.activeElement;dialog.showModal();
  };
  function openTool(key){
    if(!allowed())return;
    var tool=tools.find(function(t){return t[0]===key;});if(!tool)return;
    document.getElementById('admin-self-service').close();
    var target=tool[3];
    if(target.charAt(0)==='/'){window.open(target,'_blank','noopener');return;}
    if(target==='sync'){openSyncModal();return;}
    if(target==='aliases'){
      sw('mc-w121',null,'mc');w121View('rounds',document.querySelector('[data-w121-view="rounds"]'));
      var details=document.getElementById('w121-alias-manager');details.open=true;details.scrollIntoView({block:'center'});return;
    }
    sw(target,null,'mc');
    if(target==='mc-access')loadAccessMgmt();
    if(target==='mc-msb')msbLoad('mc');
    if(target==='mc-lt-team')loadLtTeam();
    if(target==='mc-line-auto')loadLineAutoControlCenter();
    if(target==='mc-chapter-center')loadChapterOperationsCenter();
    if(target==='mc-w121')w121OpenSystem();
  }
})();

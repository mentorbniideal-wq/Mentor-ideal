(function(){
  'use strict';
  var views=[['today','☀️','งานวันนี้'],['health','♥','สุขภาพ Chapter'],['opportunities','✦','โอกาสจาก MSB'],['balance','↔','Referral Balance'],['trend','↗','แนวโน้มและรายงาน']];
  window.GROWTH_HEALTH_VIEW='today';
  window.growthHealthOpen=function(view,button){
    view=views.some(function(item){return item[0]===view;})?view:'today';window.GROWTH_HEALTH_VIEW=view;
    document.querySelectorAll('#gr-ov [data-growth-health-view]').forEach(function(panel){panel.hidden=panel.getAttribute('data-growth-health-view')!==view;});
    document.querySelectorAll('#gr-ov [data-growth-health-button]').forEach(function(tab){var active=tab.getAttribute('data-growth-health-button')===view;tab.classList.toggle('on',active);tab.setAttribute('aria-pressed',active?'true':'false');});
    var activeButton=button||document.querySelector('#gr-ov [data-growth-health-button="'+view+'"]');if(activeButton&&activeButton.scrollIntoView)activeButton.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});
    requestAnimationFrame(function(){if(view==='balance'&&window.jc&&window.jc.resize)window.jc.resize();if(view==='trend'&&window.tdc&&window.tdc.resize)window.tdc.resize();});
  };
  window.openGrowthBlueprint=function(view){
    var tab=document.querySelector('#gr-tabs .tb[onclick*="gr-msb"]');if(typeof window.sw==='function')window.sw('gr-msb',tab,'gr');if(typeof window.msbLoad==='function')window.msbLoad('gr');setTimeout(function(){if(typeof window.msbOpenView==='function')window.msbOpenView(view);},0);
  };
  var shell=document.getElementById('growth-health-shell');
  if(shell){
    var tabs=views.map(function(item,index){return '<button type="button" class="growth-health-tab'+(index===0?' on':'')+'" data-growth-health-button="'+item[0]+'" aria-pressed="'+(index===0?'true':'false')+'" onclick="growthHealthOpen(\''+item[0]+'\',this)">'+item[1]+' '+item[2]+'</button>';}).join('');
    shell.innerHTML='<div class="growth-health-head"><div><span>GROWTH OPERATING SYSTEM</span><h2>Chapter Growth Health</h2><p>เริ่มจากงานวันนี้ แล้วใช้ MSB เพื่อเปลี่ยนข้อมูลเป็นการช่วยเหลือที่ติดตามผลได้</p></div><button class="bsm" onclick="loadGrowth()">↻ อัปเดตข้อมูล</button></div><nav class="growth-health-nav" aria-label="เลือกมุมมอง Chapter Growth Health">'+tabs+'</nav><section class="growth-msb-actions" aria-label="ทางลัดใช้ข้อมูล Blueprint"><div><b>ใช้ข้อมูล MSB ต่อทันที</b><span>เปิดเครื่องมือเฉพาะงานโดยไม่ต้องค้นหาในตารางยาว</span></div><button onclick="openGrowthBlueprint(\'radar\')">🧭 ใครควรช่วยก่อน</button><button onclick="openGrowthBlueprint(\'quality\')">🧹 ข้อมูลใครไม่ครบ</button><button onclick="openGrowthBlueprint(\'pairs\')">🤝 คู่ที่น่าแนะนำ</button><button onclick="openGrowthBlueprint(\'comparison\')">↗ เป้าหมายเปลี่ยนอย่างไร</button></section>';
  }
})();

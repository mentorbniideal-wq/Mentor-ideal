(function(){
  'use strict';
  var views=[
    ['table','📋','Chapter Blueprint Table'],
    ['radar','🧭','Member Support Radar'],
    ['followups','📌','Follow-Up Summary'],
    ['quality','🧹','Data Quality Center'],
    ['pairs','🤝','Pair Matching Engine'],
    ['calendar','📅','Monthly Demand Calendar'],
    ['comparison','↗','เปรียบเทียบเป้าหมาย']
  ];
  window.MSB_GROWTH_VIEW='table';
  window.msbOpenView=function(view,button){
    view=views.some(function(item){return item[0]===view;})?view:'table';window.MSB_GROWTH_VIEW=view;
    document.querySelectorAll('#gr-msb [data-msb-view]').forEach(function(panel){panel.hidden=panel.getAttribute('data-msb-view')!==view;});
    document.querySelectorAll('#gr-msb [data-msb-view-button]').forEach(function(tab){var active=tab.getAttribute('data-msb-view-button')===view;tab.classList.toggle('on',active);tab.setAttribute('aria-pressed',active?'true':'false');});
    var activeButton=button||document.querySelector('#gr-msb [data-msb-view-button="'+view+'"]');
    if(activeButton&&activeButton.scrollIntoView)activeButton.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});
  };
  var nav=document.getElementById('msb-growth-workspace-nav');
  if(nav)nav.innerHTML=views.map(function(item,index){return '<button type="button" class="msb-workspace-tab'+(index===0?' on':'')+'" data-msb-view-button="'+item[0]+'" aria-pressed="'+(index===0?'true':'false')+'" onclick="msbOpenView(\''+item[0]+'\',this)">'+item[1]+' <span>'+item[2]+'</span></button>';}).join('');
})();

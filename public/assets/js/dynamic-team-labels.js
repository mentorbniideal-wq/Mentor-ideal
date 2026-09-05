(function(){
  'use strict';
  var api=window.SUPABASE_API||'https://itwyjhlfemxsfbimshby.supabase.co/functions/v1/api';
  var anon=window.SUPABASE_ANON||'sb_publishable_vTX2pRpd9axDyAuMHTVhDQ_zfS1VE-j';
  var labels={};
  var roleCodes={toomtam:'TOOMTAM',aof:'Aof',draft:'Draft',phai:'PHAI',amp:'AMP'};
  function display(code,fallback){return String(labels[code]||fallback||code||'—');}
  function apply(root){
    var host=root&&root.querySelectorAll?root:document;
    host.querySelectorAll('[data-team-label]').forEach(function(el){var code=el.getAttribute('data-team-label');el.textContent=display(code,el.getAttribute('data-team-fallback'));});
    host.querySelectorAll('select option').forEach(function(option){
      var select=option.parentElement,id=String(select&&(select.id||select.name)||'');
      if(!(select&&select.hasAttribute('data-team-select'))&&!/(team|mentor|role)/i.test(id))return;
      var code=roleCodes[String(option.value||'').toLowerCase()]||option.value;
      if(labels[code])option.textContent=(option.getAttribute('data-prefix')||'')+display(code);
    });
  }
  function load(){return fetch(api,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+anon},body:JSON.stringify({action:'getPublicTeamCatalog'})}).then(function(res){if(!res.ok)throw new Error('team catalog '+res.status);return res.json();}).then(function(r){if(!r||!r.ok)throw new Error((r&&r.error)||'team catalog unavailable');(r.teams||[]).forEach(function(t){if(t.code)labels[t.code]=t.displayName||t.code;});apply(document);window.dispatchEvent(new CustomEvent('bni:team-labels',{detail:{labels:Object.assign({},labels)}}));return labels;}).catch(function(){return labels;});}
  window.BNITeamLabels={labels:labels,display:display,apply:apply,load:load};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();

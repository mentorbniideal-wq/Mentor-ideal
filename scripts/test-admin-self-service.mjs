// Browser fixtures only: no live identity, database writes or LINE sends.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true});
try {
  const page=await browser.newPage();
  await page.setContent('<button id="launch">Admin</button><div id="w121-aliases"></div><div id="mentor-121-care-list"></div>');
  await page.evaluate(()=>{
    window.S={isAdmin:true,isViewer:false,teamName:'C'};
    window.esc=window.escHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    window.toast=()=>{};
    window.requests=[];
    window.gsr=(action,payload,done)=>{requests.push({action,payload});if(action==='getWeekly121NameAliases')done({ok:true,aliases:[{id:'alias',normalized_name:'old name',member_id:'a'}],members:[{id:'a',name:'First'},{id:'b',name:'Second'}]});else done({ok:true});};
    window.confirm=()=>true;
  });
  await page.addScriptTag({path:'public/assets/js/desktop-one-to-one.js'});
  await page.addScriptTag({path:'public/assets/js/admin-self-service.js'});
  for(const width of [375,768,1440]){
    await page.setViewportSize({width,height:700});
    await page.locator('#launch').focus();
    await page.evaluate(()=>openAdminSelfService());
    assert.equal(await page.locator('#admin-self-service [data-admin-tool]').count(),10);
    const rect=await page.locator('#admin-self-service').boundingBox();
    assert.ok(rect.x>=0&&rect.x+rect.width<=width+1&&rect.height<=700);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#admin-self-service').isVisible(),false);
  }
  await page.evaluate(()=>{S.isAdmin=false;openAdminSelfService();});
  assert.equal(await page.locator('#admin-self-service').isVisible(),false);
  await page.evaluate(()=>{S.isAdmin=true;w121LoadAliases();});
  await page.locator('#w121-alias-search').fill('unknown');
  assert.equal(await page.locator('[data-alias]').count(),0);
  await page.locator('#w121-alias-search').fill('old');
  await page.locator('[data-alias] select').selectOption('b');
  await page.locator('[data-alias] button').click();
  const correction=await page.evaluate(()=>requests.find(x=>x.action==='correctWeekly121NameAlias'));
  assert.deepEqual(correction.payload,{aliasId:'alias',expectedMemberId:'a',memberId:'b',confirmed:true});
  await page.evaluate(()=>{
    document.body.insertAdjacentHTML('beforeend','<div id="w121-pair-sub"></div><div id="w121-pair-body"></div>');
    w121RenderPairAction({pair:{id:'pair',member_a:{id:'a',name:'First'},member_b:{id:'b',name:'Second'},member_c:{id:'c',name:'Third'},status:'partially_verified'},deliveries:[{member_id:'a',status:'sent'},{member_id:'b',status:'sent'}],verifications:[{member_id:'a',verified_partner_code_at:'now'},{member_id:'b',verified_partner_code_at:'now'}],feedbackSummary:{sharedMemberIds:['a','b']}});
  });
  assert.ok((await page.locator('#w121-pair-sub').innerText()).includes('Third'));
  assert.equal(await page.locator('#w121-pair-body .w121-action-member').count(),3);
  assert.equal(await page.locator('.w121-stage span').filter({hasText:'LINE'}).evaluate(el=>el.classList.contains('done')),false);
  assert.equal(await page.locator('.w121-stage span').filter({hasText:'Reflection'}).evaluate(el=>el.classList.contains('done')),false);
  const mobile=readFileSync('public/assets/js/mobile-operations.js','utf8');
  const helper=mobile.slice(mobile.indexOf('function mentor121PairMember('),mobile.indexOf('function renderMentor121CareLegacy('));
  await page.addScriptTag({content:helper});
  assert.equal(await page.evaluate(()=>mentor121PairMember({member_a:{id:'a',mentor_team:'A'},member_b:{id:'b',mentor_team:'B'},member_c:{id:'c',mentor_team:'C'}}).id),'c');
  const timeline=mobile.slice(mobile.indexOf('function mentor121Timeline('),mobile.indexOf('function copyMentor121Summary('));
  await page.evaluate(()=>{window.mentor121Name=m=>esc(m?.name||'');window.call=(_action,_payload,done)=>done(null,{ok:true,member:{name:'Third'},stats:{},timeline:[{partners:[{name:'First'},{name:'Second'}],status:'verified'}]});});
  await page.addScriptTag({content:timeline});
  await page.evaluate(()=>mentor121Timeline('c'));
  assert.ok((await page.locator('#mentor-121-care-list').innerText()).includes('First และ Second'));
  console.log('PASS Admin dialog responsive/keyboard, restricted entry, alias search/correction contract, trio member selection and history');
} finally { await browser.close(); }

// Requires Playwright + Chromium. All API responses below are fixtures; no messages are sent.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:375,height:812}});
 const styles=readFileSync('public/liff/index.html','utf8').match(/<style[^>]*>[\s\S]*?<\/style>/g)?.join('')||'';
 await page.setContent(styles+'<main><div id="otoFlow"></div></main>');
 await page.addScriptTag({content:readFileSync('public/liff/verification-help.js','utf8')});
 await page.evaluate(()=>{
  window.calls=[];window.mode='legacy';window.saved=false;
  window.confirm=()=>true;window.copyVerify121Code=()=>{};window.submitVerify121=()=>{};
  window.api=async body=>{
   window.calls.push(body);
   if(body.action==='start-one-to-one-verification'){
    if(window.mode==='error')throw new Error('network');
    if(window.mode==='complete')return {ok:true,complete:true};
    if(window.mode==='legacy')return {ok:true,legacy:true,message:'รหัสรุ่นเก่า'};
    return {ok:true,code:'123456',ownVerified:false};
   }
   if(body.action==='get-one-to-one-verification-help')return {ok:true,state:window.saved?'pending':'none',message:window.saved?'ส่งคำขอแล้ว':''};
   if(body.action==='request-one-to-one-verification-help'){
    if(window.mode==='submitError')return {ok:false,error:'ส่งไม่สำเร็จ'};
    window.saved=true;return {ok:true,state:'pending',message:'ส่งคำขอแล้ว'};
   }
   throw new Error('Unexpected action');
  };
 });
 await page.evaluate(()=>startVerify121('pair-a'));
 assert.equal(await page.locator('#otoPartnerCode').count(),0,'Legacy code has a clear recovery path');
 const request=page.getByRole('button',{name:'แจ้งปัญหารหัส / ขอรีเซ็ต',exact:true});
 await request.click();
 assert.ok(await page.getByRole('button',{name:'ส่งคำขอแล้ว',exact:true}).isDisabled());
 await page.evaluate(()=>startVerify121('pair-a'));
 assert.ok(await page.getByRole('button',{name:'ส่งคำขอแล้ว',exact:true}).isDisabled(),'Reload keeps pending request');
 let calls=await page.evaluate(()=>window.calls.filter(x=>x.action==='request-one-to-one-verification-help'));
 assert.deepEqual(calls,[{action:'request-one-to-one-verification-help',pairId:'pair-a'}],'Only pair ID is sent, never own or partner code');
 await page.evaluate(()=>{window.mode='error';window.saved=false;return startVerify121('pair-a');});
 assert.ok(await page.getByText('เชื่อมต่อไม่สำเร็จ กรุณาลองโหลดรหัสอีกครั้ง').isVisible());
 assert.ok(await page.getByRole('button',{name:'ลองโหลดรหัสอีกครั้ง',exact:true}).isEnabled());
 assert.ok(await request.isEnabled(),'Network errors still allow help');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Help UI fits narrow screen');
 if(process.env.VERIFICATION_SCREENSHOT)await page.screenshot({path:process.env.VERIFICATION_SCREENSHOT});
 await page.evaluate(()=>{window.mode='submitError';return startVerify121('pair-a');});
 await request.click();assert.ok(await request.isEnabled(),'Failed request can retry');
 assert.ok(await page.getByText('ส่งไม่สำเร็จ',{exact:true}).isVisible());
 await page.evaluate(()=>{window.mode='code';return startVerify121('pair-a');});
 assert.equal(await page.locator('.oto-code').innerText(),'123456');
 assert.equal(await page.locator('#otoPartnerCode').getAttribute('inputmode'),'numeric');
 await page.evaluate(()=>{window.mode='complete';return startVerify121('pair-a');});
 assert.equal(await page.locator('button').count(),0,'Complete pair cannot request reset');
 await page.addScriptTag({content:readFileSync('public/assets/js/desktop-one-to-one.js','utf8')});
 await page.evaluate(()=>{
  window.esc=value=>String(value).replace(/"/g,'&quot;');
  window.opened='';window.w121OpenPairAction=id=>window.opened=id;
  document.body.insertAdjacentHTML('beforeend',w121AttentionPairButton({pair_id:'pair-a'}));
 });
 await page.getByRole('button',{name:'จัดการคู่ / ตรวจรหัส',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.opened),'pair-a');
 console.log('PASS MY121: missing/legacy codes, retry, request status across reload, failure recovery, completed state, safe request payload, admin pair shortcut');
}finally{await browser.close();}

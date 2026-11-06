import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true});
try {
const page=await browser.newPage();
const fixture={ok:true,blueprintYear:2027,coverage:{submitted:12,activeMembers:20,sharedCategories:8},canCoordinate:true,canApprove:true,viewerEmail:'admin@test.invalid',candidates:[{category:'Sample customer group',targetCustomerGroup:'Sample market',rationale:'Synthetic test only',members:[{nickname:'Sample A'},{nickname:'Sample B'}]}],proposals:[{id:'p1',title:'Sample proposal',status:'exploring',assigned_owner_name:'Sample owner',power_team_proposal_members:[{participation_status:'accepted',members:{nickname:'Sample A'}},{participation_status:'invited',members:{nickname:'Sample B'}}]},{id:'p2',title:'Closed sample',status:'closed',power_team_proposal_members:[]}],officialTeams:[{id:'t1',title:'Sample official team',status:'active',memberCount:2,members:[]},{id:'t2',title:'Archived sample',status:'archived',members:[]}]};
await page.setContent('<html><head></head><body><main id="gr-pt"><div class="pt-page-header"><div><h2>Power Team</h2><p>Growth Workspace · Synthetic preview</p></div></div><div id="pt-mgr-content"></div></main></body></html>');
await page.addStyleTag({content:':root{--sf:#faf8f2;--sf2:#f0eee6;--tx:#203b35;--sub:#596e67;--ac:#80651c;--bd:#d8ddd3}body{margin:0;padding:30px;font-family:Arial,sans-serif;background:var(--sf2)}*{box-sizing:border-box}.bsm{border:1px solid var(--bd);background:var(--sf);color:var(--tx);padding:8px 12px;cursor:pointer}[hidden]{display:none!important}'});
await page.addStyleTag({content:readFileSync('public/assets/css/desktop-power-team.css','utf8')});
await page.evaluate(f=>{window.esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));window.gsr=(a,p,cb)=>cb(f);window.toast=()=>{};},fixture);
await page.addScriptTag({content:readFileSync('public/assets/js/desktop-power-team-hub.js','utf8')});
await page.evaluate(()=>window.ptLoad());
assert.equal(await page.locator('.pt-card').count(),1);
await page.locator('[data-pt-search]').fill('no matching sample');
assert.equal(await page.locator('.pt-card:visible').count(),0);
assert.equal(await page.locator('.pt-no-match').isVisible(),true);
await page.locator('[data-pt-search]').fill('Sample proposal');
assert.equal(await page.locator('.pt-card:visible').count(),1);
for(const view of ['candidates','official','history','proposals']){
 await page.locator('[data-pt-id="'+view+'"]').click();
 assert.equal(await page.locator('[aria-current="page"]').getAttribute('data-pt-id'),view);
 if(view==='history')assert.equal(await page.locator('.pt-card').count(),2);
 if(view==='official')assert.equal(await page.locator('.pt-card').count(),1);
}
for(const dark of [false,true]){
 await page.evaluate(dark=>{document.documentElement.style.cssText=dark?'--sf:#101c1b;--sf2:#172725;--tx:#edf4f1;--sub:#a4b8b0;--ac:#d7bd77;--bd:#334b44':'';},dark);
 for(const width of [375,768,1440]){
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow '+width);
  assert.equal(await page.locator('.pt-primary button').isVisible(),true);
 }
}
await page.setViewportSize({width:1440,height:1000});
await page.screenshot({path:'/tmp/power-team-workspace-preview.png',fullPage:true});
console.log('PASS Power Team workspace: stage isolation, search, archive, 3 widths / 2 themes');
} finally {await browser.close();}

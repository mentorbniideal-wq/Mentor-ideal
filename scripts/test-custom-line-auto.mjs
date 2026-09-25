import fs from 'node:fs';
import assert from 'node:assert/strict';

const ui = fs.readFileSync('public/assets/js/line-auto-control-center.js', 'utf8');
const css = fs.readFileSync('public/assets/css/line-auto-control-center.css', 'utf8');
const deliveryCss = fs.readFileSync('public/assets/css/line-delivery-control.css', 'utf8');
const desktopCss = fs.readFileSync('public/assets/css/desktop-operations.css', 'utf8');
const page = fs.readFileSync('public/dashboard.html', 'utf8');

for (const action of ['saveLineCustomAutomation','setLineCustomAutomationEnabled','archiveLineCustomAutomation']) {
  assert.ok(ui.includes(`gsr('${action}'`), `${action} must be wired to the LINE AUTO UI`);
}
assert.ok(ui.includes("selected=new Set(row.recipientIds||[])"), 'editing must restore the exact recipient allow-list');
assert.ok(ui.includes("new Date(local)") && ui.includes('dt.toISOString()'), 'browser-local schedule must be sent as an unambiguous instant');
assert.ok(ui.includes('บันทึกแล้วจะยังไม่ส่ง') && ui.includes('บันทึกแบบปิด'), 'UI must explain the safe disabled-by-default workflow');
assert.ok(ui.includes("e(x.message).replace(/\\n/g,' · ')") && ui.includes("e(row.message||'')"), 'stored message content must be HTML escaped');
assert.ok(css.includes('.lac-custom-dialog') && css.includes('@media(max-width:760px)'), 'custom editor must include responsive styling');
assert.ok(ui.includes("activeTab='overview'") && ui.includes("lineAutoTab(\\'custom\\')"), 'custom automation must be available as a LINE AUTO submenu');
assert.ok(ui.includes("if(activeTab==='custom')") && css.includes('.lac-subnav'), 'submenu must render a focused custom-automation view with responsive styling');
assert.ok(!desktopCss.includes('\nheader{background:'), 'only the command bar may receive global desktop header styling');
assert.ok(deliveryCss.includes('.ldc-head{display:flex') && deliveryCss.includes('background:transparent!important'), 'Delivery Truth must inherit semantic light/dark surface colors');
assert.ok(page.includes('line-auto-control-center.js?v=20260925b') && page.includes('line-auto-control-center.css?v=20260925b') && page.includes('line-delivery-control.css?v=20260925b'), 'production HTML must invalidate cached UI assets');

console.log('Custom LINE Auto UI contract: PASS');

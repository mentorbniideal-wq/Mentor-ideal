import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const elements = Object.fromEntries(['history-window-end','history-grid','history-preview'].map(id => [id, {
  id, hidden: false, value: '', innerHTML: '', textContent: '', max: '',
  classList: { toggle() {} }, setAttribute(name, value) { this[name] = value; }, scrollIntoView() {},
}]));
const listeners = {}, calls = [];
const context = { window: { confirm: () => true }, document: { getElementById: id => elements[id] || null, addEventListener: (type, fn) => { listeners[type] = fn; } },
  S: { role: 'mc', token: 'synthetic-oauth', isAdmin: true, isViewer: false, isReadOnly: false }, Intl, Date, Map, Set, Promise, Number, String, Array,
  gsr(action, payload, cb) { calls.push({ action, payload }); cb(action === 'getMonthlySyncHistory' ? { ok: true, rows: [] } :
    action === 'previewHistoricalBackfill' ? { ok: true, batchId: 'batch-1', previewToken: 'token-1', quality: { affectedMembers: 1, evolutionRows: 1, memberTrafficLightRows: 1, reporting2YouRows: 1 } } :
    { ok: true, importedSnapshots: 2 }); },
  FileReader: class { readAsText(file) { this.result = file.content; this.onload(); } },
};
vm.runInNewContext(readFileSync(new URL('../public/assets/js/desktop-monthly-history.js', import.meta.url), 'utf8'), context);
const html = readFileSync(new URL('../public/dashboard.html', import.meta.url), 'utf8');
assert.match(html, /id="mc-history" class="sec" data-admin-only="1"/);
assert.doesNotMatch(html.slice(html.indexOf('id="gr-tabs"'), html.indexOf('id="mc-ov"')), /openHistoryBackfill|Monthly History/);
context.window.loadHistoryGrid();
await new Promise(resolve => setImmediate(resolve));
assert.equal((elements['history-grid'].innerHTML.match(/class="history-row"/g) || []).length, 10);
assert.equal((elements['history-grid'].innerHTML.match(/data-history-file=/g) || []).length, 30);
assert.match(elements['history-grid'].innerHTML, /2026-09/);
const period = '2026-08';
for (const [key, name] of [['trafficLightEvolution','evolution.csv'], ['memberTrafficLight','member.csv'], ['reporting2You','r2y.csv']]) {
  listeners.change({ target: { dataset: { historyFile: key, historyPeriod: period }, files: [{ name, size: 100, content: 'synthetic csv' }] } });
}
assert.match(elements['history-grid'].innerHTML, /data-history-preview="2026-08"/);
listeners.click({ target: { closest: selector => selector === '[data-history-preview]' ? { dataset: { historyPreview: period } } : null } });
await new Promise(resolve => setImmediate(resolve));
assert.equal(calls.at(-1).action, 'previewHistoricalBackfill');
assert.equal(calls.at(-1).payload.reportingPeriod, period);
assert.match(elements['history-preview'].innerHTML, /ยืนยันบันทึก Snapshot งวดนี้/);
listeners.click({ target: { closest: selector => selector === '[data-history-commit]' ? { dataset: { historyCommit: period } } : null } });
await new Promise(resolve => setImmediate(resolve));
assert.ok(calls.some(call => call.action === 'commitHistoricalBackfill' && call.payload.confirmed === true));
assert.ok(!calls.some(call => call.action === 'monthlySync'), 'historical path never invokes operational Sync');
const beforeDenied = calls.length;
context.S.isAdmin = false;
context.window.loadHistoryGrid();
assert.equal(calls.length, beforeDenied, 'non-admin cannot request archive from UI');
assert.match(elements['history-grid'].innerHTML, /เจ้าของระบบหรือ Admin/);
console.log('PASS Monthly History 10-period grid, source selection, preview and history-only commit');

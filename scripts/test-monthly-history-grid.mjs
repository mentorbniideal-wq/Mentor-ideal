import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const elements = Object.fromEntries(['sync-modal','sync-operational-panel','sync-history-panel','sync-current-tab','sync-history-tab','history-window-end','history-grid','history-preview'].map(id => [id, {
  id, hidden: false, value: '', innerHTML: '', textContent: '', max: '',
  classList: { toggle() {} }, setAttribute(name, value) { this[name] = value; }, scrollIntoView() {},
}]));
const listeners = {}, calls = [];
const context = { window: { confirm: () => true }, document: { getElementById: id => elements[id] || null, addEventListener: (type, fn) => { listeners[type] = fn; } },
  S: { role: 'growth' }, Intl, Date, Map, Set, Promise, Number, String, Array,
  gsr(action, payload, cb) { calls.push({ action, payload }); cb(action === 'getMonthlySyncHistory' ? { ok: true, rows: [] } :
    action === 'previewHistoricalBackfill' ? { ok: true, batchId: 'batch-1', previewToken: 'token-1', quality: { affectedMembers: 1, evolutionRows: 1, memberTrafficLightRows: 1, reporting2YouRows: 1 } } :
    { ok: true, importedSnapshots: 2 }); },
  FileReader: class { readAsText(file) { this.result = file.content; this.onload(); } },
};
vm.runInNewContext(readFileSync(new URL('../public/assets/js/desktop-monthly-history.js', import.meta.url), 'utf8'), context);
context.window.switchSyncView('history');
await new Promise(resolve => setImmediate(resolve));
assert.equal((elements['history-grid'].innerHTML.match(/class="history-row"/g) || []).length, 10);
assert.equal((elements['history-grid'].innerHTML.match(/data-history-file=/g) || []).length, 30);
assert.match(elements['history-grid'].innerHTML, /2026-09/);
assert.equal(elements['sync-operational-panel'].hidden, true);
assert.equal(elements['sync-history-tab']['aria-selected'], 'true');
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
console.log('PASS Monthly History 10-period grid, source selection, preview and history-only commit');

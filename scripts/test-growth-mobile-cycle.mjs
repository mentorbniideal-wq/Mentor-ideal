import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/growth-mobile.html', import.meta.url), 'utf8');
assert.match(html, /id="gm-view-cycle"/);
assert.match(html, /data-view="cycle"/);
assert.match(html, /growth-mobile-cycle\.css/);

const listeners = new Map();
const elements = new Map();
const view = { classList: { contains: () => true } };
const root = { innerHTML: '' };
const due = { innerHTML: '' };
const app = { hidden: false };
const nav = { click() { listeners.get('nav')?.(); }, addEventListener(_type, callback) { listeners.set('nav', callback); } };
elements.set('gm-view-cycle', view);
elements.set('gm-cycle-root', root);
elements.set('gm-cycle-due', due);
elements.set('gm-app', app);
elements.set('gm-refresh', { addEventListener() {} });
elements.set('gm-sheet-body', { querySelector() { return null; } });
const document = {
  getElementById: id => elements.get(id) || null,
  querySelector: selector => selector === '.gm-nav [data-view="cycle"]' ? nav : null,
  addEventListener(type, callback) { listeners.set(type, callback); },
};
let boardCalls = 0;
const board = { ok: true, dueWork: [{ memberId: 'member-1', memberName: '<Unsafe>', month: 1, milestone: 'เริ่มรอบ', owner: 'Growth', dueDate: '2027-01-01', urgency: 'overdue', status: 'open' }], members: [{ memberId: 'member-1', name: 'Test', nickname: 'Test', expiryDate: '2027-12-31' }], summary: { activeMembers: 1, dueNow: 1, dueSoon: 0, missingExpiry: 0 } };
const timeline = { ok: true, member: { id: 'member-1', name: 'Test', nickname: 'Test' }, expiryDate: '2027-12-31', cycleStartDate: '2027-01-31', canManage: true,
  nodes: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, dueDate: '2027-01-31', status: 'not_recorded' })),
  entries: [{ id: 'entry-1', month: 1, status: 'open', detailRestricted: true, result: 'REVOKED_TEXT' }],
  notes: [{ entry_id: 'entry-1', body: 'PRIVATE_NOTE' }] };
const state = { capabilities: [], isReadOnly: false };
const window = { growthMobileApi(action) { if (action === 'getMemberGrowthBoard') { boardCalls++; return Promise.resolve(board); } return Promise.resolve(action === 'getMemberGrowthTimeline' ? timeline : { ok: true, business: {} }); }, growthMobileState: state };
const context = { window, document, MutationObserver: class { observe() {} }, Promise, FormData, crypto: globalThis.crypto };
vm.runInNewContext(readFileSync(new URL('../public/assets/js/growth-mobile-cycle.js', import.meta.url), 'utf8'), context);
await new Promise(resolve => setImmediate(resolve));
assert.equal(boardCalls, 1, 'initial board read happens once');
assert.match(root.innerHTML, /งานช่วง 30 วัน/);
assert.match(root.innerHTML, /&lt;Unsafe&gt;/);
assert.doesNotMatch(root.innerHTML, /<Unsafe>/);
listeners.set('nav', () => {});
const button = { dataset: { cycleOpen: 'member-1', cycleMonth: '1' }, hasAttribute: name => name === 'data-cycle-open' };
listeners.get('click')({ target: { closest: () => button }, preventDefault() {}, stopImmediatePropagation() {} });
await new Promise(resolve => setImmediate(resolve));
assert.equal((root.innerHTML.match(/data-cycle-select=/g) || []).length, 12);
assert.match(root.innerHTML, /รายละเอียดถูกจำกัด/);
assert.doesNotMatch(root.innerHTML, /REVOKED_TEXT|PRIVATE_NOTE|id="gm-cycle-entry"/);
assert.equal(boardCalls, 1, 'opening timeline reuses the loaded board');
state.capabilities = ['growth.coordinate'];
const select = { dataset: { cycleSelect: '1' }, hasAttribute: () => false };
listeners.get('click')({ target: { closest: () => select }, preventDefault() {}, stopImmediatePropagation() {} });
assert.match(root.innerHTML, /id="gm-cycle-entry"/, 'coordinator can see existing update form');
console.log('Growth Mobile Cycle navigation, single board read, 12 nodes, escaping, redaction and capability visibility: PASS');

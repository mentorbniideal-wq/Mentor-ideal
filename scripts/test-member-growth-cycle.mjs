import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = { innerHTML: '' };
const document = { getElementById(id) { return id === 'member-growth-root' ? root : null; }, addEventListener() {} };
const nodes = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, dueDate: `2027-${String(index + 1).padStart(2, '0')}-28`,
  milestone: index === 0 ? { label: 'เริ่มรอบ / ตั้งเป้า', owner: 'Growth' } : index === 2 ? { label: 'New Member Review', owner: 'Mentor' } : null,
  status: 'not_recorded' }));
const detail = { ok: true, member: { id: 'member-1', name: '<img src=x onerror=alert(1)>', nickname: 'Test' },
  expiryDate: '2027-12-28', cycleStartDate: '2027-01-28', currentMonth: 6, renewalStatus: 'pending_contact', nodes,
  entries: [{ id: 'entry-1', month: 1, status: 'open', result: 'SECRET_HISTORICAL_TEXT', detailRestricted: true }],
  notes: [{ entry_id: 'entry-1', body: 'SECRET_NOTE', created_by: 'test', created_at: '2027-01-01' }], canManage: false };
const board = { ok: true, members: [{ memberId: 'member-1', name: 'Test', nickname: 'Test', currentMonth: 6 }], dueWork: [], summary: { activeMembers: 1, dueNow: 0, missingExpiry: 0 } };
const window = { G: { tasks: [] } };
const context = { window, document, gsr(action, _data, callback) { callback(action === 'getMemberGrowthBoard' ? board : action === 'getMemberGrowthTimeline' ? detail : { ok: true, blueprints: [] }); },
  console, Promise, FormData, crypto: globalThis.crypto };
vm.runInNewContext(readFileSync(new URL('../public/assets/js/member-growth-cycle.js', import.meta.url), 'utf8'), context);
window.memberGrowthLoad();
await new Promise(resolve => setImmediate(resolve));
assert.match(root.innerHTML, /งานถึงกำหนด/);
window.memberGrowthOpen('member-1');
await new Promise(resolve => setImmediate(resolve));
assert.equal((root.innerHTML.match(/data-mg-select=/g) || []).length, 12);
assert.match(root.innerHTML, /aria-label="Month 3 New Member Review"/);
assert.doesNotMatch(root.innerHTML, /SECRET_HISTORICAL_TEXT|SECRET_NOTE|<img/);
console.log('Member Growth Desktop timeline, 12 nodes, and restricted-detail rendering: PASS');

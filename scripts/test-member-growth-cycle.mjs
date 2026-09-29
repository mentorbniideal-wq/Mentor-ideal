import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = { innerHTML: '', contains: () => true };
const handlers = new Map();
const document = { getElementById(id) { return id === 'member-growth-root' ? root : null; }, addEventListener(type, handler) { handlers.set(type, handler); } };
const nodes = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, dueDate: `2027-${String(index + 1).padStart(2, '0')}-28`,
  milestone: index === 0 ? { label: 'เริ่มรอบ / ตั้งเป้า', owner: 'Growth' } : index === 2 ? { label: 'New Member Review', owner: 'Mentor' } : null,
  status: 'not_recorded' }));
const detail = { ok: true, member: { id: 'member-1', name: '<img src=x onerror=alert(1)>', nickname: 'Test' },
  expiryDate: '2027-12-28', cycleStartDate: '2027-01-28', currentMonth: 6, renewalStatus: 'pending_contact', nodes,
  membershipStartDate: '2024-03-01', membershipStartSource: 'bni_joined_date', membershipDays: 942,
  lastRenewedOn: '2026-03-02', latestExpiryDate: '2027-12-28', expirySource: 'bni_connect_membership_dues', expiryReportedAt: '2026-09-01T00:00:00Z',
  entries: [{ id: 'entry-1', month: 1, status: 'open', result: 'SECRET_HISTORICAL_TEXT', detailRestricted: true }],
  notes: [{ entry_id: 'entry-1', body: 'SECRET_NOTE', created_by: 'test', created_at: '2027-01-01' }], canManage: false };
const board = { ok: true, members: [{ memberId: 'member-1', name: 'Test', nickname: 'Test', currentMonth: 6, membershipStartSource: 'bni_joined_date', membershipDays: 942, lastRenewedOn: '2026-03-02', expiryDate: '2027-12-28' }], dueWork: [], summary: { activeMembers: 1, dueNow: 0, missingExpiry: 0 } };
const window = { G: { tasks: [] } };
const context = { window, document, gsr(action, _data, callback) { callback(action === 'getMemberGrowthBoard' ? board : action === 'getMemberGrowthTimeline' ? detail : { ok: true, blueprints: [] }); },
  console, Promise, FormData, crypto: globalThis.crypto };
vm.runInNewContext(readFileSync(new URL('../public/assets/js/member-growth-cycle.js', import.meta.url), 'utf8'), context);
window.memberGrowthLoad();
await new Promise(resolve => setImmediate(resolve));
assert.match(root.innerHTML, /งานถึงกำหนด/);
assert.match(root.innerHTML, /ภาพรวม Chapter/);
handlers.get('click')({ target: { closest: selector => selector === '[data-mg-open-board]' ? null : ({ dataset: { mgTab: 'overview' }, hasAttribute: () => false, matches: () => false }) } });
assert.match(root.innerHTML, /จังหวะงานที่ควรทบทวน/);
handlers.get('click')({ target: { closest: selector => selector === '[data-mg-open-board]' ? null : ({ dataset: { mgTab: 'members' }, hasAttribute: () => false, matches: () => false }) } });
assert.match(root.innerHTML, /อยู่ใน BNI 942 วัน/);
assert.match(root.innerHTML, /ต่ออายุล่าสุด: 2026-03-02/);
window.memberGrowthOpen('member-1');
await new Promise(resolve => setImmediate(resolve));
assert.equal((root.innerHTML.match(/data-mg-select=/g) || []).length, 12);
assert.match(root.innerHTML, /aria-label="เดือน 3 New Member Review/);
assert.match(root.innerHTML, /mg-cycle-hero|เส้นทาง 12 เดือน/);
assert.match(root.innerHTML, /หมดอายุล่าสุดตามระบบ/);
assert.match(root.innerHTML, /2027-12-28/);
assert.match(root.innerHTML, /BNI Connect Membership Dues/);
assert.doesNotMatch(root.innerHTML, /SECRET_HISTORICAL_TEXT|SECRET_NOTE|<img/);
detail.canManage = true;
detail.entries[0].detailRestricted = false;
window.memberGrowthOpen('member-1');
await new Promise(resolve => setImmediate(resolve));
assert.match(root.innerHTML, /<details class="mg-editor"><summary>✎ บันทึกความคืบหน้า<\/summary>/);
assert.match(root.innerHTML, /id="mg-entry-form"/);
console.log('Member Growth Desktop timeline, 12 nodes, and restricted-detail rendering: PASS');

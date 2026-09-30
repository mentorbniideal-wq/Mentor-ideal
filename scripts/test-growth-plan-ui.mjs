import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/assets/js/desktop-operations.js', import.meta.url), 'utf8');
const start = source.indexOf('var _rvData=null');
const end = source.indexOf('function rvOpenAdd(', start);
assert.ok(start >= 0 && end > start);
const elements = new Map();
const document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', style: {}, value: '' });
    return elements.get(id);
  },
  querySelectorAll() { return []; },
};
const sample = {
  planningYear: 2027, reportingYear: 2026,
  summary: { totalTarget: 100000, totalReceived: 40000, pct: 40, revenueGap: 60000,
    totalMsbGoal: 250000, totalLegacyTarget: 100000, memberCount: 1,
    submittedBlueprints: 1, reviewNeeded: 1, reviewedGoals: 0, avgDataQuality: 80 },
  groups: [{ name: 'TEST_GROUP', members: [{ memberId: 'member-1', sheetRow: 'row-1',
    name: 'TEST_MEMBER', nick: 'Test', target: 100000, legacyTarget: 100000,
    msbGoal: 250000, activeGoal: 100000, received: 40000, gap: 60000, pct: 40,
    blueprintStatus: 'submitted', goalReviewNeeded: true, dataQualityScore: 80,
    dataQualityGrade: 'good', dataQualityMissing: [] }], totalRow: {
    received: 40000, target: 100000, reviewNeeded: 1, submittedBlueprints: 1 },
  }],
};
const context = { document, S: { token: 'TEST_OAUTH_TOKEN', capabilities: ['growth.coordinate'], isReadOnly: false },
  esc: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  gsr() {}, toast() {}, prompt() {}, console };
vm.runInNewContext(source.slice(start, end), context);
context._rvData = sample;
vm.runInNewContext('rvRender()', context);
const hero = elements.get('rv-hero').innerHTML;
const table = elements.get('rv-tbody').innerHTML;
assert.match(hero, /เป้า 2026/);
assert.match(hero, /รับจริงล่าสุด/);
assert.match(hero, /Blueprint Goal 2027/);
assert.match(elements.get('rv-thead').innerHTML, /เทียบเป้า \(ประมาณ\)/);
assert.match(table, /ยืนยันการทบทวน/);
assert.doesNotMatch(table, /class="rv-edt"/);
context.S.capabilities = ['growth.member.manage'];
vm.runInNewContext('rvRenderTable()', context);
assert.match(elements.get('rv-tbody').innerHTML, /class="rv-edt"/);
assert.doesNotMatch(elements.get('rv-tbody').innerHTML, /ยืนยันการทบทวน/);
context.S.token = null;
vm.runInNewContext('rvRenderTable()', context);
assert.doesNotMatch(elements.get('rv-tbody').innerHTML, /class="rv-edt"|ยืนยันการทบทวน/);
console.log('Growth Plan separates reporting and planning years and gates edit actions: PASS');

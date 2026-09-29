import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const listeners = {};
const elements = {
  pulseContent: { textContent: '', innerHTML: '' },
  pulseMessage: { textContent: '' },
};
let result = { ok: true, available: true,
  campaign: { id: 'campaign-a', status: 'due', completedAt: null },
  template: { title: '<img src=x onerror=alert(1)>', questions: [
    { id: 'happiness', label: '<script>alert(1)</script>', type: 'scale', required: true },
  ] }, answers: null };
const calls = [];
const context = { window: { confirm: () => true }, document: {
  getElementById: (id) => elements[id] || null,
  addEventListener: (type, handler) => { listeners[type] = handler; },
}, api: async (payload) => { calls.push(payload); return payload.action === 'get-my-pulse' ? result : { ok: true }; },
  FormData: class { constructor(form) { this.form = form; } get(id) { return this.form.values[id] ?? null; } },
};
vm.runInNewContext(readFileSync(new URL('../public/liff/member-pulse.js', import.meta.url), 'utf8'), context);
await context.window.loadMemberPulse();
assert.match(elements.pulseContent.innerHTML, /&lt;img/);
assert.match(elements.pulseContent.innerHTML, /&lt;script&gt;/);
assert.doesNotMatch(elements.pulseContent.innerHTML, /<script>alert/);
assert.match(elements.pulseContent.innerHTML, /ส่งคำตอบ/);

const button = { disabled: false };
const form = { id: 'memberPulseForm', values: { happiness: '8' }, querySelector: () => button };
await listeners.submit({ target: form, preventDefault() {} });
assert.equal(JSON.stringify(calls.find((call) => call.action === 'submit-my-pulse').answers), '{"happiness":8}');

result = { ...result, campaign: { ...result.campaign, status: 'completed', completedAt: '2026-09-29T00:00:00Z' },
  answers: { happiness: 8 } };
await context.window.loadMemberPulse();
assert.doesNotMatch(elements.pulseContent.innerHTML, /type="submit"/);
result = { ok: true, available: false, reason: 'no_campaign' };
await context.window.loadMemberPulse();
assert.match(elements.pulseContent.textContent, /ยังไม่มีแบบสอบถาม/);
console.log('PASS Member Pulse LIFF rendering, escaping, submit payload and empty/completed states');

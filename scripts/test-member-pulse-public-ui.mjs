import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../public/pulse/index.html', import.meta.url), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
assert.ok(inline, 'public Pulse page has its own application script');
new vm.Script(inline, { filename: 'public/pulse/index.html' });

function makePage({ search = '', result = null } = {}) {
  const root = { innerHTML: '', querySelector: (selector) => selector === 'form' && root.innerHTML.includes('<form') ? form : selector === '#submit' ? button : null };
  const form = {
    addEventListener() {},
    reportValidity: () => true,
    querySelector: () => ({ max: 0, value: 0, textContent: '' }),
  };
  const button = { disabled: false, addEventListener(_event, callback) { this.click = callback; } };
  const nodes = { formRoot: root, status: { textContent: '' }, title: { textContent: '' }, intro: { textContent: '' } };
  let requests = 0;
  const context = {
    document: { getElementById: (id) => nodes[id] },
    location: { search },
    URLSearchParams,
    FormData: class { get() { return ''; } },
    window: { MY_IDEAL_RUNTIME: true, SUPABASE_API: 'https://staging.example.test/api', SUPABASE_ANON: 'public-test-key' },
    fetch: async (_url, options) => { requests++; const body = JSON.parse(options.body); return { ok: true, json: async () => result ? result(body) : ({ ok: true }) }; },
    confirm: () => true,
    setTimeout,
    clearTimeout,
    console,
  };
  vm.runInNewContext(inline, context);
  return { root, nodes, get requests() { return requests; }, button };
}

const missing = makePage();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.match(missing.root.innerHTML, /ลิงก์แบบสอบถามไม่ถูกต้อง/);
assert.equal(missing.requests, 0, 'missing bearer token makes no API request');

const xss = '<img src=x onerror=alert(1)>';
const active = makePage({ search: '?token=' + 'a'.repeat(64), result: async ({ action }) => action === 'getMemberPulseByToken' ? ({
  ok: true,
  campaign: { id: 'campaign', stage: 'experience', status: 'sent', expired: false },
  template: { title: xss, questions: [{ id: 'q1', label: xss, type: 'choice', options: [xss, 'OK'], required: true }] },
  answers: {},
}) : ({ ok: true, completed: true }) });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(active.nodes.title.textContent, xss, 'heading is assigned as text, not HTML');
assert.ok(active.root.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;'));
assert.ok(!active.root.innerHTML.includes(xss), 'question labels/options are escaped');
assert.match(active.root.innerHTML, /pulseProgress/);
assert.equal(active.requests, 1);

const completed = makePage({ search: '?token=' + 'b'.repeat(64), result: async () => ({ ok: true, campaign: { status: 'completed', completedAt: 'now' }, template: { title: 'Pulse', questions: [] }, answers: {} }) });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.match(completed.root.innerHTML, /ส่งคำตอบแล้ว/);
assert.equal(completed.root.innerHTML.includes('<form'), false);

const expired = makePage({ search: '?token=' + 'c'.repeat(64), result: async () => ({ ok: true, campaign: { status: 'sent', expired: true }, template: { title: 'Pulse', questions: [] }, answers: {} }) });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.match(expired.root.innerHTML, /ลิงก์หมดอายุแล้ว/);
assert.equal(expired.root.innerHTML.includes('<form'), false);

console.log('PASS public Member Pulse UI: bearer validation, safe question rendering, progress, completed and expired states');

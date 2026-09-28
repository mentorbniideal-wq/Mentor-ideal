import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../public/assets/js/desktop-growth-my121.js', import.meta.url), 'utf8');
const box = { innerHTML: '' };
const calls = [];
let response = { ok: true, total: 1, recent: [{ member: '<script>x</script>', loggedAt: '2026-09-28', note: 'PRIVATE_TEXT' }] };
const context = {
  document: { getElementById: id => id === 'cross-content' ? box : null }, window: {},
  esc: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  gsr: (action, payload, callback) => { calls.push(action); callback(response); },
};
vm.runInNewContext(code, context);
context.window.growth121Load(true);
assert.deepEqual(calls, ['getAll121Logs']);
assert.match(box.innerHTML, /&lt;script&gt;/);
assert.doesNotMatch(box.innerHTML, /PRIVATE_TEXT/);
assert.match(box.innerHTML, /ไม่ใช่หลักฐาน Referral/);
context.window.growth121Load();
assert.equal(calls.length, 1, 'cached reopen does not refetch');
response = { ok: false, error: 'denied' };
context.window.growth121Load(true);
assert.match(box.innerHTML, /denied/);
console.log('Growth Desktop MY121 read-only view: PASS');

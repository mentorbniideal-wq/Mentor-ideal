import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const listeners = {};
const element = { innerHTML: '', textContent: '' };
const search = { value: '', focus() {}, setSelectionRange() {} };
const calls = [];
const context = {
  window: { confirm: () => true },
  document: {
    getElementById(id) { return id === 'pulse-pilot-admin' ? element : id === 'pulsePilotSearch' ? search : null; },
    addEventListener(type, fn) { listeners[type] = fn; },
  },
  gsr(action, payload, callback) {
    calls.push({ action, payload });
    callback(action === 'getMemberPulsePilotAccess'
      ? { ok: true, members: [{ id: 'stable-id', name: 'Phitarn Sakulthanaphetch', nickname: 'ตูมตาม' }], enabledMemberIds: [] }
      : { ok: true });
  },
};
vm.runInNewContext(readFileSync(new URL('../public/assets/js/member-pulse-pilot-admin.js', import.meta.url), 'utf8'), context);
context.window.renderMemberPulsePilotAdmin();
await Promise.resolve();
assert.match(element.innerHTML, /Phitarn Sakulthanaphetch/);
listeners.change({ target: { id: 'pulsePilotMember', value: 'stable-id' } });
listeners.click({ target: { id: 'pulsePilotEnable', disabled: false } });
await Promise.resolve();
assert.equal(calls.at(-1).action, 'setMemberPulsePilotAccess');
assert.equal(JSON.stringify(calls.at(-1).payload), JSON.stringify({ memberId: 'stable-id', enabled: true }));
assert.match(element.innerHTML, /เปิดทดลอง/);
console.log('PASS Pulse pilot Admin selection uses stable member ID');

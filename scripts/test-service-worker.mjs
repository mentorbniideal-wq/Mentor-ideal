import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const handlers = {};
const opened = [];
const origin = 'https://mentor.example.test';
const context = {
  URL, Date, Boolean, String,
  self: {
    location: { origin },
    addEventListener: (name, handler) => { handlers[name] = handler; },
    clients: { matchAll: async () => [], openWindow: async url => { opened.push(url); } },
  },
};
vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), context);
async function click(url) {
  let task;
  handlers.notificationclick({ notification: { data: { url }, close() {} }, waitUntil(value) { task = value; } });
  await task;
}
for (const url of ['https://external.test/path?secret=x', '//external.test/path', 'javascript:alert(1)', 'https://[', 'https://user:pass@mentor.example.test/']) {
  await click(url);
  assert.equal(opened.pop(), origin + '/', `Unsafe URL: ${url}`);
}
await click('/?pane=notifications#latest');
assert.equal(opened.pop(), origin + '/?pane=notifications#latest');
let navigated = false, focused = false;
context.self.clients.matchAll = async () => [{
  async navigate(url) { assert.equal(url, origin + '/'); navigated = true; return { async focus() { focused = true; } }; },
  async focus() { throw new Error('Must focus the navigated window'); },
}];
await click('/');
assert.ok(navigated && focused);
console.log('PASS service worker safe URLs and navigation completion');

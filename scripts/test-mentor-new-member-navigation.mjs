import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const desktop = readFileSync(new URL('../public/dashboard.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../public/assets/js/mobile-operations.js', import.meta.url), 'utf8');

assert.match(desktop, /onclick="sw\('mc-8w',this,'mc'\);load8WProgress\(\)"[^>]*>👶 New Members · 8 Week/);
assert.doesNotMatch(desktop, /onclick="sw\('mc-8w',this,'mc'\);load8WProgress\(\)" style="display:none"/);
assert.match(html, /id="mc-dashboard"[\s\S]*?onclick="mct\('newmembers',null\)"/);
assert.match(html, /id="mentor-myteam"[\s\S]*?onclick="mentorOpenSection\('newmembers'\)"/);
assert.match(html, /id="mentor-newmembers"[\s\S]*?id="mentor-nm-list"/);

const start = source.indexOf('function nmWeekState(');
const end = source.indexOf('// ── Checklist Panel', start);
assert.ok(start > 0 && end > start);
const nodes = { 'mentor-nm-list': { innerHTML: '' }, 'mc-nm-list': { innerHTML: '' } };
const context = {
  document: { getElementById: id => nodes[id] },
  escHtml: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
  mobileTeamDisplay: value => value || '—',
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
const state = context.nmWeekState;
assert.equal(state({ joinedDate: '2026-09-01', progress: 20, checklistDone: 8, checklistTotal: 41 }, '2026-09-01').label, 'สัปดาห์ที่ 1 / 8 · Checklist 8/41');
assert.equal(state({ joinedDate: '2026-09-01', progress: 20 }, '2026-10-26').label, 'สัปดาห์ที่ 8 / 8 · Checklist 0/41');
assert.equal(state({ joinedDate: '2026-09-01', progress: 20 }, '2026-10-27').rank, 0);
assert.match(state({ joinedDate: '2026-09-01', progress: 100 }, '2026-10-27').label, /ตรวจหลักฐาน/);
assert.equal(state({ joinedDate: '' }, '2026-10-27').rank, 2);
assert.equal(state({ joinedDate: '2026-02-30' }, '2026-10-27').rank, 2);

const originalDate = context.Date;
context.Date = class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-27T12:00:00Z'])); } };
const member = (name, joinedDate, progress) => ({ id: name, name, nick: name, mentor: 'Team', joinedDate, startDate: joinedDate, w8Date: '2026-10-27', progress, checklistDone: 8, checklistTotal: 41, status: '8/41 ข้อ', fileUrl: name });
context.renderNewMembers('mentor', [member('<script>', '2026-10-27', 10), member('Review', '2026-09-01', 20)]);
const markup = nodes['mentor-nm-list'].innerHTML;
assert.ok(markup.indexOf('Review') < markup.indexOf('&lt;script&gt;'));
assert.doesNotMatch(markup, /<script>/);
assert.match(markup, /ครบกรอบ 8 สัปดาห์แต่ Checklist ยังไม่ครบ 1 คน/);
assert.doesNotMatch(markup, /เพิ่มสมาชิกใหม่|นำเข้าหลายคน/);
context.Date = originalDate;

console.log('Mentor new-member entry points and 8-week follow-up view: PASS');

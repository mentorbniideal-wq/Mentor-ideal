import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('public/assets/js/mobile-operations.js', 'utf8');
const start = source.indexOf('function buildMentorJourney(d)');
const end = source.indexOf('function buildDetail(d)', start);
assert.ok(start >= 0 && end > start, 'Mentor Journey renderer must be present');
const journey = source.slice(start, end);
assert.ok(journey.includes('m360.passport') && journey.includes('passport.sessions'), 'Journey uses Member 360 Passport DTO');
assert.ok(journey.includes('m360.reviews') && journey.includes("'90 วัน'"), 'Journey shows persisted 90-day evidence');
assert.ok(journey.includes("'30 วัน','ยังไม่มีหลักฐานการทบทวน'") && journey.includes("'5 เดือน','ยังไม่มีหลักฐานการทบทวน'"), 'Missing milestones remain unavailable');
assert.ok(journey.includes('m360.signals') && journey.includes('one.followUps'), 'Journey composes canonical signals and MY121 follow-ups');
assert.ok(journey.includes('attention.length') && journey.includes('Traffic Light'), 'Journey includes MY121 care and Traffic Light indicators');
assert.ok(journey.includes('Growth Coordinator') && journey.includes('ยังไม่มีข้อมูลที่อนุญาต'), 'Handoff projection stays safe when owner/due date are unavailable');
assert.ok(journey.includes('escHtml('), 'User-controlled Journey text is escaped');
const buildDetail = source.slice(end, source.indexOf('function loadScorecard()', end));
assert.ok(buildDetail.includes('+buildMentorJourney(d)'), 'Member 360 mounts Mentor Journey');
assert.ok(!buildDetail.includes('loadMemberPassportCard('), 'Mentor Journey must not call the MC-only Passport Board');
console.log('PASS Mentor Journey: safe Member 360 composition and unavailable-state guards');

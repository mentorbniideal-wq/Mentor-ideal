import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync('supabase/functions/liff-api/index.ts', 'utf8');
const liff = readFileSync('public/liff/index.html', 'utf8');
const notifier = readFileSync('supabase/functions/_shared/line-issue-notify.ts', 'utf8');

const trainingBlock = api.match(/if \(action === 'training-interest'\) \{[\s\S]*?\n  \}\n\n  if \(action === 'visitor'\)/)?.[0] || '';
assert.ok(trainingBlock, 'training-interest handler exists');
assert.match(trainingBlock, /await notifyIssueStakeholders\(db,\{/, 'training interest dispatches through the audited LINE delivery path');
assert.match(trainingBlock, /signalType:'training'/, 'training interest keeps the ST/NEC routing scope');
assert.match(trainingBlock, /idempotencyKey:`liff:training:\$\{memberId\}:\$\{eventId\}:\$\{intent\}`/, 'each member, event and intent has idempotent delivery');
assert.match(trainingBlock, /delivery\.sent>0/, 'API reports successful delivery only when a recipient was actually sent a message');
assert.match(trainingBlock, /ยังไม่ได้ตั้งผู้รับ ST \/ NEC/, 'API reports a missing recipient truthfully');
assert.doesNotMatch(trainingBlock, /return response\(\{ok:true,message:intent==='cancelled'\?'ยกเลิกความสนใจแล้ว':'ส่งข้อมูลให้ทีม ST \/ NEC แล้ว'\}\)/, 'unconditional success copy is removed');
assert.match(notifier, /notificationType: notice\.notificationType \|\| 'issue_alert'/, 'delivery ledger identifies training notifications separately');
assert.match(liff, /Number\(r\.delivery\?\.sent\|\|0\)>0\?'แจ้งแล้ว ✓':'บันทึกแล้ว ✓'/, 'LIFF distinguishes a delivered LINE message from a saved request');

console.log('PASS LIFF training interest: audited LINE dispatch and truthful delivery status');

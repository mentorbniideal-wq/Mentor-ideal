import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync('supabase/functions/liff-api/index.ts', 'utf8');
const liff = readFileSync('public/liff/index.html', 'utf8');
const notifier = readFileSync('supabase/functions/_shared/line-issue-notify.ts', 'utf8');

const trainingBlock = api.match(/if \(action === 'training-interest'\) \{[\s\S]*?\n  \}\n\n  if \(action === 'visitor'\)/)?.[0] || '';
assert.ok(trainingBlock, 'training-interest handler exists');
assert.match(trainingBlock, /await notifyIssueStakeholders\(db,\{/, 'training interest dispatches through the audited LINE delivery path');
assert.match(trainingBlock, /signalType:'training'/, 'training interest keeps the ST/NEC routing scope');
assert.match(trainingBlock, /select\('id,name,event_date,category'\)/, 'training notification reads the persisted course category');
assert.match(trainingBlock, /memberLine:`Member : \$\{String\(identity\.member\.nickname/, 'training notification labels the member directly');
assert.match(trainingBlock, /categoryLabel:eventCategory/, 'training notification presents the real course category');
assert.match(trainingBlock, /ทีม ST หรือ NEC โปรดส่งข้อความส่วนตัวโดยตรงถึง Member รายนี้/, 'training notification gives the requested LT follow-up instruction');
assert.match(trainingBlock, /idempotencyKey:`liff:training:\$\{memberId\}:\$\{eventId\}:\$\{intent\}`/, 'each member, event and intent has idempotent delivery');
assert.match(trainingBlock, /delivery\.sent>0/, 'API reports successful delivery only when a recipient was actually sent a message');
assert.match(trainingBlock, /ยังไม่ได้ตั้งผู้รับ ST \/ NEC/, 'API reports a missing recipient truthfully');
assert.doesNotMatch(trainingBlock, /return response\(\{ok:true,message:intent==='cancelled'\?'ยกเลิกความสนใจแล้ว':'ส่งข้อมูลให้ทีม ST \/ NEC แล้ว'\}\)/, 'unconditional success copy is removed');
assert.match(notifier, /notificationType: notice\.notificationType \|\| 'issue_alert'/, 'delivery ledger identifies training notifications separately');
assert.match(notifier, /notice\.memberLine \|\|/, 'operational message layout supports a safe member label override');
assert.match(notifier, /notice\.categoryLabel \|\| notice\.routeLabel/, 'operational message layout supports a safe category label override');
assert.match(liff, /Number\(r\.delivery\?\.sent\|\|0\)>0\?'แจ้งแล้ว ✓':'บันทึกแล้ว ✓'/, 'LIFF distinguishes a delivered LINE message from a saved request');

const goalBlock = api.match(/if \(action === 'goal'\) \{[\s\S]*?\n  \}\n\n  if \(action === 'renewal'\)/)?.[0] || '';
assert.ok(goalBlock, 'goal handler exists');
assert.match(goalBlock, /const goalChanged/, 'goal updates determine whether a real goal change occurred');
assert.match(goalBlock, /await notifyIssueStakeholders\(db, \{/, 'changed goals dispatch through the LINE delivery path');
assert.match(goalBlock, /signalType: 'goal'/, 'goal updates route to Growth recipients');
assert.match(goalBlock, /!goalChanged[\s\S]*?ไม่ส่ง LINE ซ้ำ/, 'unchanged goals do not send duplicate notifications');
assert.match(goalBlock, /skippedReason === 'no_recipient'/, 'goal response reports missing recipients truthfully');

const renewalBlock = api.match(/if \(action === 'renewal-intent'\) \{[\s\S]*?\n  \}\n\n  if \(action === 'training-interest'\)/)?.[0] || '';
assert.ok(renewalBlock, 'renewal intent handler exists');
assert.match(renewalBlock, /if\(intent==='not_now'\)return response/, 'not-now is saved without an unwanted operational notification');
assert.match(renewalBlock, /await notifyIssueStakeholders\(db,\{/, 'renewal requests dispatch through the LINE delivery path');
assert.match(renewalBlock, /signalType:'renewal'/, 'renewal requests route to Membership and Secretary/Treasurer');
assert.match(renewalBlock, /ยังไม่ได้ตั้งผู้รับทีมต่ออายุ/, 'renewal response reports missing recipients truthfully');

console.log('PASS LIFF operational notifications: training, goal and renewal use audited delivery with truthful status');

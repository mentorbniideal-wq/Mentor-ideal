import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const liff = readFileSync(new URL('../public/liff/index.html', import.meta.url), 'utf8');
const api = readFileSync(new URL('../supabase/functions/liff-api/index.ts', import.meta.url), 'utf8');

// Parse the inline application script so malformed M2M client JavaScript fails CI.
const scripts = [...liff.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.ok(scripts.length, 'expected inline LIFF application script');
new Function(scripts.at(-1)[1]);

for (const source of ['m2m-audience', 'preview-m2m', 'send-m2m', 'm2mPreview', 'm2mSend']) {
  assert.ok(liff.includes(source), `LIFF must include ${source}`);
}
assert.match(liff, /<option value="selected">ส่งเฉพาะคน/);
assert.match(liff, /<option value="all">ส่งสมาชิกทุกคน/);
assert.match(liff, /id="m2mMemberSearch"/);
assert.match(liff, /m2mToggleVisibleMembers/);
assert.match(liff, /m2mSelectedMemberIds/);
assert.match(liff, /id="m2mSenderRole"/);
assert.match(liff, /senderRole:/);
assert.match(liff, /confirmed: true/);
assert.match(liff, /lt-m2m-tab hidden/);

assert.match(api, /const M2M_CATEGORIES/);
assert.match(api, /requireActiveLt/);
assert.match(api, /\.eq\('chapter_id', chapterId\)/);
assert.match(api, /action === 'm2m-audience'/);
assert.match(api, /action === 'preview-m2m' \|\| action === 'send-m2m'/);
assert.match(api, /body\.confirmed !== true/);
assert.match(api, /message_digest/);
assert.match(api, /audience_digest/);
assert.match(api, /senderRole/);
assert.match(api, /roles\.includes\(senderRole\)/);
assert.match(api, /ข้อความจากทีม LT/);
assert.match(api, /line_notif_settings/);
assert.match(api, /linePush\(recipient\.lineUserId/);
assert.match(api, /event_type: 'lt_m2m_sent'/);

console.log('LIFF M2M contract checks passed');

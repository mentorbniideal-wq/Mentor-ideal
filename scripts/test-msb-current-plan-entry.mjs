import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const form = readFileSync('public/member-success-blueprint.html', 'utf8');
const handler = readFileSync('supabase/functions/api/handlers/member-success-blueprints.ts', 'utf8');
const liff = readFileSync('supabase/functions/liff-api/index.ts', 'utf8');

const referralStep = form.match(/if\(step===1\)html=([\s\S]*?)if\(step===2\)/)?.[1] || '';
assert.match(referralStep, /new_customer_revenue_from_bni/, 'new BNI revenue is entered on the Referral calculation step');
assert.match(referralStep, /id="ref"/, 'Referral result is displayed on the same step');
assert.match(referralStep, /รายได้เฉลี่ยที่เกิดจากลูกค้า 1 คนต่อปี/, 'annual customer value is explicitly labelled per one customer');
assert.match(form, /var cust=avg>0\?Math\.ceil\(fresh\/avg\):0;/, 'customer requirement uses new BNI revenue');
assert.match(form, /syncConversionFromInputs\(\);\s*syncHelperStateFromData\(\);\s*var c=calc\(\);/, 'live calculation synchronizes inputs before calculating');
assert.match(form, /ข้อมูลอ้างอิงจาก Excel/, '2026 historic goal is labelled as reference-only');

assert.match(handler, /const entryYear = await resolveMsbPlanningYear\(db, \{ chapterId: scope\.chapterId, memberId \}\)/, 'dashboard-generated entry links use configured planning year');
assert.match(handler, /async function currentMemberPlanningYear/, 'member entry endpoints enforce the current configured planning year');
assert.match(handler, /ลิงก์ Blueprint ปี \$\{tokenYear\} เป็นข้อมูลอ้างอิงแล้ว/, 'old entry links are rejected instead of reopening historic entry');
assert.match(liff, /import \{ resolveMsbPlanningYear \} from '..\/_shared\/msb-planning-year\.ts';/, 'LIFF imports the planning-year resolver');
assert.doesNotMatch(liff, /const blueprintYear = new Date\(\)\.getFullYear\(\);/, 'LIFF does not create MSB links from calendar year');
assert.match(liff, /const blueprintYear = await resolveMsbPlanningYear\(db, \{ memberId \}\);/, 'LIFF home and link paths use configured planning year');

const scripts = [...form.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
for (const script of scripts) new Function(script);

console.log('PASS MSB current-plan entry: configured planning year, reference-only historic goal, and live Referral calculation');

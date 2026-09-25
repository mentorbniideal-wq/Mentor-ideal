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
assert.doesNotMatch(form.match(/function updateLive\(skipCoach\)\{([\s\S]*?)function categoriesAllowed/)?.[1] || '', /syncConversionFromInputs/, 'live rendering never overwrites a directly entered conversion rate');
assert.match(form, /categoryDraft\[key\]=String\(input\.value\|\|''\)/, 'custom category draft survives asynchronous rerenders');
assert.match(form, /event\.preventDefault\(\)/, 'Enter adds a custom category without triggering another navigation action');
assert.match(form, /function addCategoryValue\(current,value\)/, 'custom category addition uses a testable normalized operation');
assert.doesNotMatch(form, /onclick="toggleArr\(&quot;power_team_categories&quot;/, 'Power Team suggestions use the delegated selection path');
assert.match(form, /remainingCategoryChoices\(powerList,'power_team'\)/, 'popular Power Team categories are not rendered as duplicate selection buttons');
assert.match(form, /ข้อมูลอ้างอิงจาก Excel/, '2026 historic goal is labelled as reference-only');

assert.match(handler, /const entryYear = await resolveMsbPlanningYear\(db, \{ chapterId: scope\.chapterId, memberId \}\)/, 'dashboard-generated entry links use configured planning year');
assert.match(handler, /async function currentMemberPlanningYear/, 'member entry endpoints enforce the current configured planning year');
assert.match(handler, /ลิงก์ Blueprint ปี \$\{tokenYear\} เป็นข้อมูลอ้างอิงแล้ว/, 'old entry links are rejected instead of reopening historic entry');
assert.match(liff, /import \{ resolveMsbPlanningYear \} from '..\/_shared\/msb-planning-year\.ts';/, 'LIFF imports the planning-year resolver');
assert.doesNotMatch(liff, /const blueprintYear = new Date\(\)\.getFullYear\(\);/, 'LIFF does not create MSB links from calendar year');
assert.match(liff, /const blueprintYear = await resolveMsbPlanningYear\(db, \{ memberId \}\);/, 'LIFF home and link paths use configured planning year');

const scripts = [...form.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
for (const script of scripts) new Function(script);

const inline = scripts.at(-1).replace(/\s*init\(\);\s*$/, `
  return { data, helperState, categoryDraft, categorySuggestions, calc, setInput, setConversionCalc, addCategoryValue, remainingCategoryChoices };
`);
const elements = new Map();
const documentMock = {
  activeElement: null,
  addEventListener() {},
  getElementById(id) { return elements.get(id) || null; },
};
const storage = new Map();
const api = new Function('document', 'window', 'localStorage', 'fetch', 'AbortController', 'setTimeout', inline)(
  documentMock,
  {},
  { setItem: (key, value) => storage.set(key, value), getItem: key => storage.get(key) || null, removeItem: key => storage.delete(key) },
  () => Promise.reject(new Error('network disabled in behavioral test')),
  class {},
  () => 0,
);

api.data.new_customer_revenue_from_bni = '600000';
api.data.average_customer_value_year = '30000';
api.setInput('conversion_rate_percent', '25');
assert.equal(api.data.conversion_rate_percent, '25', 'direct Conversion input is not rounded or overwritten');
assert.deepEqual(api.helperState, { avgMonthly: '2500', convReferrals: '100', convClosed: '25' }, 'conversion helper mirrors direct percentages exactly');
assert.equal(api.calc().cust, 20, 'customer demand uses new BNI revenue divided by annual value per customer');
assert.equal(api.calc().ref, 80, 'Referral demand uses the exact entered Conversion rate');

api.setConversionCalc('convReferrals', '8');
api.setConversionCalc('convClosed', '2');
assert.equal(api.data.conversion_rate_percent, '25.0', 'helper calculator intentionally updates Conversion when its inputs change');

const categories = api.addCategoryValue(['Finance'], ' finance ');
assert.deepEqual(categories, ['Finance'], 'custom team category does not duplicate an equivalent existing value');
assert.deepEqual(api.addCategoryValue(categories, 'Property'), ['Finance', 'Property'], 'custom team category is added once');

api.categorySuggestions.power_team = [{ name: 'Finance', count: 3 }];
assert.deepEqual(api.remainingCategoryChoices(['Finance', 'Legal'], 'power_team'), ['Legal'], 'popular Power Team choices appear only once');

console.log('PASS MSB current-plan entry: configured planning year, reference-only historic goal, and live Referral calculation');

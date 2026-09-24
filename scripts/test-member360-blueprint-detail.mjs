import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const member360 = readFileSync('public/assets/js/desktop-member-360.js', 'utf8');
const operations = readFileSync('public/assets/js/desktop-operations.js', 'utf8');
const handler = readFileSync('supabase/functions/api/handlers/member-success-blueprints.ts', 'utf8');

assert.match(member360, /function blueprintDetail\(rows\)/, 'Member 360 has a dedicated annual Blueprint detail renderer');
assert.match(member360, /เป้ายอดขายรวม\/ปี/, 'Member 360 exposes the annual sales target');
assert.match(member360, /เป้ารายได้จาก BNI\/ปี/, 'Member 360 exposes the BNI target');
assert.match(member360, /จากลูกค้า BNI เดิม/, 'Member 360 shows the existing-customer component');
assert.match(member360, /จากลูกค้า BNI ใหม่/, 'Member 360 shows the new-customer component');
assert.match(member360, /แผนการตลาดรายเดือน/, 'Member 360 reports a bounded monthly-plan summary');
assert.match(member360, /m\.annualGrowthGoals/, 'Member 360 keeps the imported annual goal separate from Blueprint records');
assert.match(member360, /function e\(v\)/, 'Member 360 continues to escape user-controlled values');
assert.doesNotMatch(member360, /innerHTML\s*=\s*b\.looking_for_detail/, 'Member 360 does not inject Blueprint free text directly');

assert.match(handler, /historicalGoalCoverage/, 'Dashboard bundle returns separate historical-goal coverage');
assert.match(handler, /source: 'member_annual_growth_goals'/, 'Historical-goal coverage identifies its source');
assert.match(handler, /yearComparison: \{[\s\S]*previousGoal/, 'Growth member intelligence returns a scoped year comparison');
assert.match(handler, /const historicalGoals = await loadHistoricalGrowthGoals\(db, \[row\], year - 1\)/, 'Growth comparison uses only the already Chapter-scoped member row');

assert.match(operations, /var ps=r\.planSummary\|\|\{\}, as=r\.actualSummary\|\|\{\}, gs=r\.gapSummary\|\|\{\}, yc=r\.yearComparison\|\|\{\}/, 'Growth detail reads the explicit year-comparison DTO');
assert.match(operations, /ดูรายละเอียด Blueprint ปี/, 'Growth detail offers a progressively disclosed Blueprint summary');
assert.match(operations, /yc\.previousGoal===null/, 'Growth UI handles a missing historical target honestly');

console.log('PASS Member 360 Blueprint detail: separate annual targets, safe detail rendering, and scoped Growth comparison');

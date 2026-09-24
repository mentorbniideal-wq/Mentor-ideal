import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const dashboard = readFileSync('public/dashboard.html', 'utf8');
const exporter = readFileSync('public/assets/js/desktop-blueprint-summary.js', 'utf8');

assert.ok(dashboard.includes("msbExportPdf('mc')") && dashboard.includes("msbExportPdf('gr')"), 'Mentor and Growth Blueprint views expose PDF export');
assert.ok(dashboard.includes('desktop-blueprint-summary.js?v=20260924.3'), 'Blueprint summary module has an explicit cache key');
assert.ok(dashboard.includes('📄 Save as PDF'), 'Blueprint views describe the browser PDF action clearly');
assert.ok(dashboard.includes('id="msb-gr-meeting-summary"'), 'Growth Blueprint includes the meeting summary entry point');
assert.match(exporter, /row\.status==='submitted'/, 'Only submitted Blueprints are included');
assert.match(exporter, /safePlanByMember/, 'Category values come from the consent-projected plan DTO');
assert.match(exporter, /lookingForCategories/);
assert.match(exporter, /powerTeamCategories/);
assert.doesNotMatch(exporter, /b\.(looking_for_detail|power_team_detail|personal_goal_detail)|plan\.(lookingForDetail|powerTeamDetail)|safe_summary/, 'Restricted free-text fields are not exported');
assert.match(exporter, /esc\(displayName\((row|member)\)\)/, 'Member display names are escaped');
assert.match(exporter, /map\(esc\)/, 'User-controlled category labels are escaped');
assert.match(exporter, /@page\{size:A4 landscape/);
assert.match(exporter, /window\.print\(\)/, 'Export uses the browser PDF/print workflow');
assert.match(exporter, /ยังไม่มี Blueprint ที่ส่งสมบูรณ์/, 'Empty export has an honest state');
assert.doesNotMatch(exporter, /gsr\(/, 'Export does not broaden API access or create a second fetch path');

const context = {
  console,
  Date,
  Number,
  Math,
  confirm: () => false,
  toast: () => {},
  esc: value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;'),
};
context.window = context;
vm.runInNewContext(exporter, context);
const state = {
  year: 2027,
  rows: [
    { memberId: 'm1', name: '<script>alert(1)</script>', nickname: 'ทดสอบ', mentorTeam: 'ทีม A', status: 'submitted', blueprint: { total_sales_target_year: 1000000, expected_sales_from_bni_year: 300000, existing_customer_revenue_from_bni: 200000, new_customer_revenue_from_bni: 100000, average_customer_value_year: 50000, conversion_rate_percent: 25, customer_needed: 6, referral_needed: 24, referral_per_week: 0.5, looking_for_detail: 'PRIVATE DETAIL' } },
    { memberId: 'm2', name: 'Draft Member', status: 'draft', blueprint: { expected_sales_from_bni_year: 999999 } },
  ],
  intelRows: [{ memberId: 'm1', lookingForCategories: ['Allowed <A>'], powerTeamCategories: [] }],
  coverage: {
    availableYears: [2027, 2026],
    byYear: [
      { year: 2027, totalMembers: 3, submitted: 1, draft: 1, missing: 1 },
      { year: 2026, totalMembers: 3, submitted: 1, draft: 0, missing: 2 },
    ],
    members: [
      { memberId: 'm1', name: '<script>alert(1)</script>', nickname: 'ทดสอบ', years: [{ year: 2027, status: 'submitted' }, { year: 2026, status: 'submitted' }] },
      { memberId: 'm2', name: 'Draft Member', nickname: '', years: [{ year: 2027, status: 'draft' }] },
      { memberId: 'm3', name: 'Missing Member', nickname: '', years: [] },
    ],
  },
  historicalGoalCoverage: { year: 2026, totalMembers: 3, available: 2, missing: 1, source: 'member_annual_growth_goals' },
};
const html = context.BlueprintMeetingSummary.buildPdf('gr', state);
assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && !html.includes('<script>alert(1)</script>'), 'Member text is HTML escaped');
assert.ok(html.includes('Allowed &lt;A&gt;'), 'Consent-projected category is included and escaped');
assert.ok(!html.includes('PRIVATE DETAIL'), 'Blueprint free-text is excluded');
assert.ok(html.includes('Draft Member') && html.includes('Missing Member'), 'Meeting coverage includes members who still need follow-up');
assert.ok(!html.includes('999,999'), 'Draft Blueprint values are excluded from the submitted detail table');
assert.ok(html.includes('2027') && html.includes('2026'), 'Meeting report shows Blueprint coverage by year');
const summaryRoot = { innerHTML: '' };
context.document = { getElementById: id => id === 'msb-gr-meeting-summary' ? summaryRoot : null };
context.BlueprintMeetingSummary.render(state);
assert.ok(summaryRoot.innerHTML.includes('ส่งแล้ว') && summaryRoot.innerHTML.includes('Draft') && summaryRoot.innerHTML.includes('ยังไม่กรอก'), 'Dashboard summary shows all submission states');
assert.ok(summaryRoot.innerHTML.includes('Draft Member') && summaryRoot.innerHTML.includes('Missing Member'), 'Dashboard summary identifies members who need follow-up');
assert.ok(summaryRoot.innerHTML.includes('2027') && summaryRoot.innerHTML.includes('2026'), 'Dashboard summary shows per-year coverage');
assert.ok(summaryRoot.innerHTML.includes('สถานะการกรอก Blueprint') && summaryRoot.innerHTML.includes('ไม่ใช่ยอดเป้า Growth เดิม'), 'Dashboard distinguishes Blueprint submissions from historical Growth goals');
assert.ok(summaryRoot.innerHTML.includes('มี 2/3 คน'), 'Dashboard shows the separate historical Growth-goal coverage');
assert.ok(summaryRoot.innerHTML.includes('Copy สรุปส่ง LINE') && summaryRoot.innerHTML.includes('Save as PDF'), 'Meeting summary exposes both approved sharing actions');
const copyText = context.BlueprintMeetingSummary.buildCopyText(state);
assert.ok(copyText.includes('Blueprint Meeting Summary ปี 2027'), 'LINE summary identifies its reporting year');
assert.ok(copyText.includes('ส่งแล้ว 1 คน') && copyText.includes('Draft 1 คน') && copyText.includes('ยังไม่กรอก 1 คน'), 'LINE summary contains submission counts');
assert.ok(copyText.includes('Draft Member — Draft') && copyText.includes('Missing Member — ยังไม่กรอก'), 'LINE summary identifies follow-up members');
assert.ok(copyText.includes('Blueprint 2026') && copyText.includes('เป้า Growth ปี 2026 จากไฟล์เดิม: มีข้อมูล 2/3 คน'), 'LINE summary distinguishes historical targets from Blueprint submissions');
assert.ok(!copyText.includes('PRIVATE DETAIL') && !copyText.includes('Allowed <A>'), 'LINE summary contains no Blueprint business content');
assert.ok(copyText.length <= 4500, 'LINE summary stays within the client safety limit');

console.log('PASS Blueprint meeting summary: year coverage, follow-up roster, consent-safe A4 report');

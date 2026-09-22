import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const dashboard = readFileSync('public/dashboard.html', 'utf8');
const source = readFileSync('public/assets/js/desktop-operations.js', 'utf8');
const start = source.indexOf('function msbPdfNumber(v,d)');
const end = source.indexOf('function msbActionBtn(', start);

assert.ok(start >= 0 && end > start, 'Blueprint PDF exporter must be present');
const exporter = source.slice(start, end);

assert.ok(dashboard.includes("msbExportPdf('mc')") && dashboard.includes("msbExportPdf('gr')"), 'Mentor and Growth Blueprint views expose PDF export');
assert.ok(dashboard.includes('desktop-operations.js?v=20260922-blueprint-pdf.1'), 'Desktop asset cache key includes this release');
assert.match(exporter, /row\.status==='submitted'/, 'Only submitted Blueprints are included');
assert.match(exporter, /safePlanByMember/, 'Category values come from the consent-projected plan DTO');
assert.match(exporter, /lookingForCategories/);
assert.match(exporter, /powerTeamCategories/);
assert.doesNotMatch(exporter, /b\.(looking_for_detail|power_team_detail|personal_goal_detail)|plan\.(lookingForDetail|powerTeamDetail)|safe_summary/, 'Restricted free-text fields are not exported');
assert.match(exporter, /esc\(row\.nickname/);
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
  window: {},
  MSB: {},
  toast: () => {},
  esc: value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;'),
};
vm.runInNewContext(exporter, context);
const html = context.msbBuildBlueprintPdfReport('gr', {
  year: 2027,
  rows: [
    { memberId: 'm1', name: '<script>alert(1)</script>', nickname: 'ทดสอบ', mentorTeam: 'ทีม A', status: 'submitted', blueprint: { total_sales_target_year: 1000000, expected_sales_from_bni_year: 300000, existing_customer_revenue_from_bni: 200000, new_customer_revenue_from_bni: 100000, average_customer_value_year: 50000, conversion_rate_percent: 25, customer_needed: 6, referral_needed: 24, referral_per_week: 0.5, looking_for_detail: 'PRIVATE DETAIL' } },
    { memberId: 'm2', name: 'Draft Member', status: 'draft', blueprint: { expected_sales_from_bni_year: 999999 } },
  ],
  intelRows: [{ memberId: 'm1', lookingForCategories: ['Allowed <A>'], powerTeamCategories: [] }],
});
assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && !html.includes('<script>alert(1)</script>'), 'Member text is HTML escaped');
assert.ok(html.includes('Allowed &lt;A&gt;'), 'Consent-projected category is included and escaped');
assert.ok(!html.includes('PRIVATE DETAIL'), 'Blueprint free-text is excluded');
assert.ok(!html.includes('Draft Member') && !html.includes('999,999'), 'Draft rows are excluded');

console.log('PASS Blueprint PDF export: submitted-only, consent-safe, escaped A4 report');

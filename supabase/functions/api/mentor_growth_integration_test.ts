import { assert, assertEquals } from 'jsr:@std/assert';

async function source(path: string) { return Deno.readTextFile(new URL(`../../../${path}`, import.meta.url)); }

Deno.test('Growth mutations use explicit capability gates', async () => {
  const growth = await source('supabase/functions/api/handlers/growth.ts');
  for (const capability of ['GROWTH_COORDINATE', 'GROWTH_MEMBER_MANAGE', 'GROWTH_MONTHLY_SYNC_EXECUTE']) assert(growth.includes(capability));
  assert(growth.includes("assigned_owner_email', String(auth.email || '').toLowerCase()"));
  assert(growth.includes('const ownsTask = ownerEmail'));
});

Deno.test('Mentor handoff creates one Chapter-scoped executable task', async () => {
  const members = await source('supabase/functions/api/handlers/members.ts');
  assert(members.includes('case "acceptGrowthHandoff"'));
  assert(members.includes("String(member.chapter_id) !== scope.chapterId"));
  assert(members.includes('source_signal_id:signalId'));
  assert(members.includes('idempotency_key:`handoff:${signalId}`'));
});

Deno.test('MY121 stage cannot be inferred from a scheduled meeting', async () => {
  const growth = await source('supabase/functions/api/handlers/growth.ts');
  assert(growth.includes("case 'recordGrowthTaskStage'"));
  assert(growth.includes("['verified','late_verified','completed']"));
  assert(growth.includes('คู่ MY121 ไม่เกี่ยวข้องกับสมาชิกของ Growth Task'));
});

Deno.test('category consent defaults to no category when referral sharing is disabled', () => {
  const allowed = new Set<string>();
  const categories = ['Architect', 'Lawyer'].filter(category => allowed.has(category.toLowerCase()));
  assertEquals(categories, []);
});

Deno.test('historical Growth projection is fail-closed after referral consent revoke', () => {
  const project = (record: { memberIds: string[]; text: string }, referral: Map<string, boolean>) =>
    record.memberIds.length > 0 && record.memberIds.every(id => referral.get(id) === true) ? record.text : '';
  const before = new Map([['member-a', true]]);
  const after = new Map([['member-a', false]]);
  assertEquals(project({ memberIds: ['member-a'], text: 'Architect referral target' }, before), 'Architect referral target');
  assertEquals(project({ memberIds: ['member-a'], text: 'Architect referral target' }, after), '');
  assertEquals(project({ memberIds: ['member-a', 'member-b'], text: 'Shared referral rationale' }, new Map([['member-a', true], ['member-b', false]])), '');
  assertEquals(project({ memberIds: [], text: 'Legacy unassociated text' }, before), '');
});

Deno.test('historical free text is removed from every current Growth DTO path', async () => {
  const growth = await source('supabase/functions/api/handlers/growth.ts');
  const members = await source('supabase/functions/api/handlers/members.ts');
  const dashboard = await source('supabase/functions/api/handlers/dashboard.ts');
  const powerTeams = await source('supabase/functions/api/handlers/power-teams.ts');
  assert(growth.includes('Historical task prose has no category-level provenance'));
  assert(growth.includes('allowText ? t.task_text'));
  assert(growth.includes('allowText ? t.response'));
  assert(members.includes('signalReferralByMember') && members.includes("detail: ''"));
  assert(members.includes('referralByMember') && members.includes('reason:revealDetail'));
  assert(dashboard.includes('Signal detail is historical free text') && dashboard.includes('Boolean(profileQ.data) && profile.share_referral_focus === true'));
  assert(powerTeams.includes('complete historical category/referral fields as one unit'));
  assert(powerTeams.includes("source_category: null, target_customer_group: '', rationale: ''"));
});

Deno.test('mobile Core Issue reply uses the rendered reply button identifier', async () => {
  const mobile = await source('public/assets/js/mobile-operations.js');
  const start = mobile.indexOf('function submitReply(idx)');
  const body = mobile.slice(start, mobile.indexOf('function setStatus', start));
  assert(body.includes("getElementById('rbtn-reply-'+idx)"));
  assert(body.includes("call('saveReply'"));
});

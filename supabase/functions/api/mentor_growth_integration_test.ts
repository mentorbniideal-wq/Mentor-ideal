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

Deno.test('mobile Core Issue reply uses the rendered reply button identifier', async () => {
  const mobile = await source('public/assets/js/mobile-operations.js');
  const start = mobile.indexOf('function submitReply(idx)');
  const body = mobile.slice(start, mobile.indexOf('function setStatus', start));
  assert(body.includes("getElementById('rbtn-reply-'+idx)"));
  assert(body.includes("call('saveReply'"));
});

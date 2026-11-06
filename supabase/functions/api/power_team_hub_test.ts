import { assert, assertEquals } from 'jsr:@std/assert';

async function source(path: string) { return Deno.readTextFile(new URL(`../../../${path}`, import.meta.url)); }

Deno.test('Power Team hub has an Admin-only official publication path', async () => {
  const handler = await source('supabase/functions/api/handlers/power-teams.ts');
  const migration = await source('supabase/migrations/20260928000001_growth_power_team_publications.sql');
  assert(handler.includes("case 'publishGrowthPowerTeam'"));
  assert(handler.includes('if (!auth.isAdmin || !auth.email)'));
  assert(handler.includes("if (p.confirmed !== true)"));
  assert(handler.includes("proposal.status !== 'active'"));
  assert(handler.includes(".eq('chapter_id', scope.chapterId)"));
  assert(migration.includes('proposal_id UUID NOT NULL UNIQUE'));
  assert(migration.includes('Published Power Team Proposal is immutable'));
  assert(migration.includes('Published Power Team membership is immutable'));
  assert(migration.includes('growth_power_team_published'));
});

Deno.test('Power Team candidate categories require the active Blueprint year and consent', async () => {
  const handler = await source('supabase/functions/api/handlers/power-teams.ts');
  assert(handler.includes('resolveMsbPlanningYear'));
  assert(handler.includes(".eq('blueprint_year', year).eq('status', 'submitted')"));
  assert(handler.includes(".eq('chapter_id',chapterId)"));
  assert(handler.includes('consent?.share_referral_focus !== true'));
  assert(handler.includes('profile?.share_business === true'));
  assert(handler.includes('projectBlueprintProposal'));
  assert(handler.includes("from('member_blueprint_growth_consents')"));
  assert(!handler.includes("from('member_one_to_one_profiles')"));
  const categoryProjection = (categories: string[], fullShare: boolean, _activeGrants: string[]) => fullShare ? categories : [];
  assertEquals(categoryProjection(['A', 'B'], false, []), []);
  assertEquals(categoryProjection(['A', 'B'], false, ['a']), []); // MY121/legacy grants cannot enable annual Blueprint sharing
  assertEquals(categoryProjection(['A', 'B'], false, []), []); // after revoke, next request
  assertEquals(categoryProjection(['A', 'B'], true, []), ['A', 'B']);
});

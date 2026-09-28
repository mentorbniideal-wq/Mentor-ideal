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
  assert(handler.includes(".eq('category_type', 'power_team').is('revoked_at', null)"));
  assert(handler.includes('consent?.share_referral_focus !== true'));
  assert(handler.includes('profile?.share_business === true'));
  assert(handler.includes('detailRestricted: true'));
  const categoryProjection = (categories: string[], fullShare: boolean, activeGrants: string[]) => fullShare
    ? categories : categories.filter(category => activeGrants.includes(category.toLowerCase()));
  assertEquals(categoryProjection(['A', 'B'], false, []), []);
  assertEquals(categoryProjection(['A', 'B'], false, ['a']), ['A']);
  assertEquals(categoryProjection(['A', 'B'], false, []), []); // after revoke, next request
  assertEquals(categoryProjection(['A', 'B'], true, []), ['A', 'B']);
});

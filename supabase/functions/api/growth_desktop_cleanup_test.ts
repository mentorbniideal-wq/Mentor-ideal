import { assert, assertEquals } from 'jsr:@std/assert';
import { buildGrowthCategoryPairs } from './handlers/member-success-blueprints.ts';

async function source(path: string) { return Deno.readTextFile(new URL(`../../../${path}`, import.meta.url)); }

Deno.test('Growth Desktop retires Sprint and synthetic Connection Map without deleting history', async () => {
  const page = await source('public/dashboard.html');
  const desktop = await source('public/assets/js/desktop-operations.js');
  assert(!page.includes('gr-sprint'));
  assert(!page.includes('Connection Map'));
  assert(page.includes("growth121Load()"));
  assert(!desktop.includes("gsr('saveCrossTeamPair'"));
  assert(!desktop.includes("gsr('saveSprintPlan'"));
  const care = await source('public/assets/js/desktop-growth-my121.js');
  assert(care.includes("gsr('getAll121Logs'"));
  assert(!care.includes('row.note'));
  const mobile = await source('public/assets/js/mobile-operations.js');
  assert(mobile.includes("gsr('getAll121Logs'"));
  assert(!mobile.includes("gsr('getCrossTeamSynergy'"));
  assert(!mobile.includes("gsr('saveCrossTeamPair'"));
  const powerTeams = await source('supabase/functions/api/handlers/power-teams.ts');
  assert(powerTeams.includes("case 'getCrossTeamSynergy':\n    case 'saveCrossTeamPair':"));
  assert(powerTeams.includes("return errResponse('Legacy Connection Map is retired; use MY121', 410)"));
});

Deno.test('Matching excludes empty-profession wildcard and defaults Growth consent to deny', async () => {
  const blueprint = await source('supabase/functions/api/handlers/member-success-blueprints.ts');
  assert(blueprint.includes('flags.share_referral_focus === true'));
  assert(blueprint.includes('flags.share_business === true'));
  assert(blueprint.includes(".eq('status', 'submitted').in('member_id', candidateIds)"));
  assert(!blueprint.includes('cat.includes(profession)'));
  const desired = ['architecture', 'finance'];
  const projected = (declared: string[], fullSharing: boolean, grants: string[]) =>
    desired.filter(category => (fullSharing ? declared : grants).includes(category));
  assertEquals(projected([], true, []), []);
  assertEquals(projected(['architecture'], true, []), ['architecture']);
  assertEquals(projected(['architecture'], false, []), []);
  assertEquals(projected(['architecture'], false, ['architecture']), ['architecture']);
  assertEquals(projected(['architecture'], false, []), []); // after revoke
});

Deno.test('Growth pair prompts require submitted plans and a mutually permitted category', () => {
  type Row = Parameters<typeof buildGrowthCategoryPairs>[0][number];
  const make = (id: string, categories: string[], status = 'submitted') => ({
    memberId: id, name: id, nickname: id, blueprintStatus: status,
    lookingForCategories: categories, powerTeamCategories: [],
  }) as unknown as Row;
  assertEquals(buildGrowthCategoryPairs([make('a', ['Architecture']), make('b', [])]).pairs.length, 0);
  assertEquals(buildGrowthCategoryPairs([make('a', ['Architecture']), make('b', ['Architecture'], 'draft')]).pairs.length, 0);
  const matching = buildGrowthCategoryPairs([make('a', ['Architecture']), make('b', ['architecture'])]);
  assertEquals(matching.pairs.length, 1);
  assertEquals(matching.summary.highConfidence, 0);
  assertEquals(matching.pairs[0].score, null);
  assertEquals((matching.pairs[0].source as Record<string, unknown>).mentorTeam, '');
});

Deno.test('Referral view reports Chapter-scoped counts, not inferred team-to-team transfers', async () => {
  const meetings = await source('supabase/functions/api/handlers/meetings.ts');
  const block = meetings.slice(meetings.indexOf("case 'getReferralFlow':"));
  assert(block.includes('resolveChapterScope(db, auth)'));
  assert(block.includes(".eq('chapter_id', scope.chapterId)"));
  assert(block.includes(".in('id', ids)"));
  assert(block.includes('directionalFlowAvailable: false'));
  assert(!block.includes('mentor_team'));
  assert(!block.includes('imbalanced'));
});

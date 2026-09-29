import { assertEquals } from 'jsr:@std/assert';
import { buildBlueprintSubmissionCoverage, isActiveMsbPlan, preferPlanningBlueprint } from './msb-submission-coverage.ts';

Deno.test('Blueprint coverage reports every scoped member and year without Blueprint content', () => {
  const coverage = buildBlueprintSubmissionCoverage(
    [
      { id: 'm1', name: 'Member One', nickname: 'One' },
      { id: 'm2', name: 'Member Two', nickname: 'Two' },
      { id: 'm3', name: 'Member Three', nickname: 'Three' },
    ],
    [
      { member_id: 'm1', blueprint_year: 2027, status: 'submitted', updated_at: '2026-09-24T01:00:00Z', looking_for_detail: 'must not project' },
      { member_id: 'm1', blueprint_year: 2026, source: 'member_form_2026_superseded', status: 'submitted' },
      { member_id: 'm2', blueprint_year: 2027, status: 'draft' },
      { member_id: 'other-chapter', blueprint_year: 2027, status: 'submitted' },
    ],
    2027,
  );

  assertEquals(coverage.availableYears, [2027]);
  assertEquals(coverage.byYear, [
    { year: 2027, totalMembers: 3, submitted: 1, draft: 1, missing: 1 },
  ]);
  assertEquals(coverage.members[0].years.length, 1);
  assertEquals(Object.keys(coverage.members[0]).sort(), ['memberId', 'name', 'nickname', 'years']);
});

Deno.test('legacy 2026 member form counts once as 2027 and submitted beats a newer draft', () => {
  const coverage = buildBlueprintSubmissionCoverage(
    [{ id: 'm1', name: 'Member' }, { id: 'm2', name: 'Other' }],
    [
      { member_id: 'm1', blueprint_year: 2026, source: 'member_form_2026_superseded', status: 'submitted', updated_at: '2026-01-01' },
      { member_id: 'm1', blueprint_year: 2027, status: 'draft', updated_at: '2026-09-01' },
    ],
    2027,
  );
  assertEquals(coverage.byYear, [{ year: 2027, totalMembers: 2, submitted: 1, draft: 0, missing: 1 }]);
  assertEquals(coverage.members[0].years.length, 1);
});

Deno.test('submitted legacy form wins over new draft; submitted 2027 wins over submitted legacy', () => {
  const legacy = { blueprint_year: 2026, status: 'submitted' };
  const newDraft = { blueprint_year: 2027, status: 'draft' };
  const newSubmitted = { blueprint_year: 2027, status: 'submitted' };
  assertEquals(preferPlanningBlueprint(newDraft, legacy), legacy);
  assertEquals(preferPlanningBlueprint(legacy, newSubmitted), newSubmitted);
});

Deno.test('Member 360 excludes only the superseded form, not the 2026 Growth baseline', () => {
  assertEquals(isActiveMsbPlan({ blueprint_year: 2026, source: 'member_form_2026_superseded' }), false);
  assertEquals(isActiveMsbPlan({ blueprint_year: 2027, source: 'member_form_2026_reclassified' }), true);
  assertEquals(isActiveMsbPlan({ blueprint_year: 2026, source: 'member_form' }), true);
});

Deno.test('Blueprint coverage keeps the selected year visible when no submissions exist', () => {
  const coverage = buildBlueprintSubmissionCoverage([{ id: 'm1', name: 'Member' }], [], 2027);
  assertEquals(coverage.availableYears, [2027]);
  assertEquals(coverage.byYear[0], { year: 2027, totalMembers: 1, submitted: 0, draft: 0, missing: 1 });
});

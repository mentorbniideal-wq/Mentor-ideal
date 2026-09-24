import { assertEquals } from 'jsr:@std/assert';
import { buildBlueprintSubmissionCoverage } from './msb-submission-coverage.ts';

Deno.test('Blueprint coverage reports every scoped member and year without Blueprint content', () => {
  const coverage = buildBlueprintSubmissionCoverage(
    [
      { id: 'm1', name: 'Member One', nickname: 'One' },
      { id: 'm2', name: 'Member Two', nickname: 'Two' },
      { id: 'm3', name: 'Member Three', nickname: 'Three' },
    ],
    [
      { member_id: 'm1', blueprint_year: 2027, status: 'submitted', updated_at: '2026-09-24T01:00:00Z', looking_for_detail: 'must not project' },
      { member_id: 'm1', blueprint_year: 2026, status: 'submitted' },
      { member_id: 'm2', blueprint_year: 2027, status: 'draft' },
      { member_id: 'other-chapter', blueprint_year: 2027, status: 'submitted' },
    ],
    2027,
  );

  assertEquals(coverage.availableYears, [2027, 2026]);
  assertEquals(coverage.byYear, [
    { year: 2027, totalMembers: 3, submitted: 1, draft: 1, missing: 1 },
    { year: 2026, totalMembers: 3, submitted: 1, draft: 0, missing: 2 },
  ]);
  assertEquals(coverage.members[0].years.length, 2);
  assertEquals(Object.keys(coverage.members[0]).sort(), ['memberId', 'name', 'nickname', 'years']);
});

Deno.test('Blueprint coverage keeps the selected year visible when no submissions exist', () => {
  const coverage = buildBlueprintSubmissionCoverage([{ id: 'm1', name: 'Member' }], [], 2027);
  assertEquals(coverage.availableYears, [2027]);
  assertEquals(coverage.byYear[0], { year: 2027, totalMembers: 1, submitted: 0, draft: 0, missing: 1 });
});

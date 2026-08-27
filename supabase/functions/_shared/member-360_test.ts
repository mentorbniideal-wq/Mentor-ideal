import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { sortMember360Timeline, summarizeMember360Health } from './member-360.ts';

Deno.test('Member 360 health reports missing fields and rounded completion', () => {
  const result = summarizeMember360Health([
    { key: 'line', label: 'LINE', ok: true },
    { key: 'email', label: 'Email', ok: false },
    { key: 'profile', label: 'Profile', ok: true },
  ]);
  strictEqual(result.completed, 2);
  strictEqual(result.percent, 67);
  deepStrictEqual(result.missing.map((item) => item.key), ['email']);
});

Deno.test('Member 360 timeline drops undated rows, sorts newest first and limits', () => {
  const result = sortMember360Timeline([
    { id: 'old', at: '2026-01-01T00:00:00Z' },
    { id: 'none' },
    { id: 'new', at: '2026-08-27T00:00:00Z' },
  ], 1);
  deepStrictEqual(result.map((item) => item.id), ['new']);
});

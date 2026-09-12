import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveChapterScope } from './chapter-scope.ts';

function dbFor(memberships: unknown[], chapters: unknown[] = [{ id: 'ideal', chapter_key: 'bni-ideal' }]) {
  return { from(table: string) {
    const result = { data: table === 'chapter_memberships' ? memberships : chapters, error: null };
    const query = { select() { return query; }, eq() { return query; }, limit() { return Promise.resolve(result); }, then(resolve: (value: unknown) => unknown) { return Promise.resolve(result).then(resolve); } };
    return query;
  } } as any;
}

Deno.test('chapter scope uses the server membership default', async () => {
  const result = await resolveChapterScope(dbFor([{ chapter_id: 'ideal', is_default: true, chapter_profiles: { id: 'ideal', chapter_key: 'bni-ideal', is_active: true } }]), { email: 'member@example.com' });
  assertEquals(result, { ok: true, chapterId: 'ideal', chapterKey: 'bni-ideal', source: 'membership' });
});

Deno.test('chapter scope rejects ambiguous memberships without a default', async () => {
  const result = await resolveChapterScope(dbFor([{ chapter_id: 'a', is_default: false, chapter_profiles: { id: 'a', chapter_key: 'a', is_active: true } }, { chapter_id: 'b', is_default: false, chapter_profiles: { id: 'b', chapter_key: 'b', is_active: true } }]), { email: 'member@example.com' });
  assertEquals(result.ok, false);
});

Deno.test('legacy PIN scope only works with one active Chapter', async () => {
  const result = await resolveChapterScope(dbFor([], [{ id: 'ideal', chapter_key: 'bni-ideal' }]), {});
  assertEquals(result, { ok: true, chapterId: 'ideal', chapterKey: 'bni-ideal', source: 'single_active_legacy' });
});

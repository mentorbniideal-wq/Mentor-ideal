import { assertEquals } from 'jsr:@std/assert';
import { uniqueMemberNameMap } from './member-import-identity.ts';

const normalize = (value: unknown) => String(value || '').trim().toLowerCase();

Deno.test('import identity map never assigns a shared nickname to an arbitrary member', () => {
  const result = uniqueMemberNameMap([
    { id: 'a', name: 'Person A', nickname: 'Pete' },
    { id: 'b', name: 'Person B', nickname: 'Pete' },
  ], normalize);
  assertEquals(result.memberMap['person a'], 'a');
  assertEquals(result.memberMap['person b'], 'b');
  assertEquals(result.memberMap.pete, undefined);
  assertEquals(result.ambiguous, ['pete']);
});

Deno.test('same member name and nickname is not falsely ambiguous', () => {
  const result = uniqueMemberNameMap([{ id: 'a', name: 'Pete', nickname: 'Pete' }], normalize);
  assertEquals(result.memberMap.pete, 'a');
  assertEquals(result.ambiguous, []);
});

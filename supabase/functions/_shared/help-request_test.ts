import { helpRequestRoute } from './help-request.ts';

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test('help center routes member care to Mentor Team', () => {
  assertEquals(helpRequestRoute('mentor'), { signalType: 'member_help', label: 'Mentor Team' });
  assertEquals(helpRequestRoute('one_to_one'), { signalType: 'member_help', label: 'Mentor Team' });
});

Deno.test('help center routes chapter operations to the responsible LT scope', () => {
  assertEquals(helpRequestRoute('visitor')?.signalType, 'visitor');
  assertEquals(helpRequestRoute('growth')?.signalType, 'goal');
  assertEquals(helpRequestRoute('training')?.signalType, 'training');
  assertEquals(helpRequestRoute('renewal')?.signalType, 'renewal');
  assertEquals(helpRequestRoute('referral')?.signalType, 'referral');
  assertEquals(helpRequestRoute('profile')?.signalType, 'profile_update');
  assertEquals(helpRequestRoute('presentation')?.signalType, 'presentation');
  assertEquals(helpRequestRoute('confidential')?.confidential, true);
});

Deno.test('help center rejects unknown categories', () => {
  assertEquals(helpRequestRoute('unknown'), null);
  assertEquals(helpRequestRoute(''), null);
});

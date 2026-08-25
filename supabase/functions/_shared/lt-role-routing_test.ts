import { ltRolesForScope } from './lt-role-routing.ts';

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test('absence routes to Committee and Secretary/Treasurer', () => {
  assertEquals(ltRolesForScope('absence'), ['Membership Committee', 'Secretary/Treasurer']);
});

Deno.test('visitor routes to Visitor Host and Event Coordinator', () => {
  assertEquals(ltRolesForScope('visitor'), ['Visitor Host', 'Event Coordinator']);
});

Deno.test('unknown LT notification scope has no recipients', () => {
  assertEquals(ltRolesForScope('unknown'), []);
});

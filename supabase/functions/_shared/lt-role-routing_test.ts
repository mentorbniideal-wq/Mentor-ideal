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

Deno.test('goal routes to Growth Coordinator', () => {
  assertEquals(ltRolesForScope('goal'), ['Growth Coordinator']);
});

Deno.test('training routes to Secretary/Treasurer and NEC', () => {
  assertEquals(ltRolesForScope('training'), ['Secretary/Treasurer', 'Network Education Coordinator']);
});

Deno.test('renewal routes to Committee and Secretary/Treasurer', () => {
  assertEquals(ltRolesForScope('renewal'), ['Membership Committee', 'Secretary/Treasurer']);
});

Deno.test('referral routes to Mentor and Growth coordinators', () => {
  assertEquals(ltRolesForScope('referral'), ['Mentor Coordinator', 'Growth Coordinator']);
});

Deno.test('profile updates route to Committee and Secretary/Treasurer', () => {
  assertEquals(ltRolesForScope('profile_update'), ['Membership Committee', 'Secretary/Treasurer']);
});

Deno.test('presentation support routes to Vice President and NEC', () => {
  assertEquals(ltRolesForScope('presentation'), ['Vice President', 'Network Education Coordinator']);
});

Deno.test('confidential requests have a restricted LT route', () => {
  assertEquals(ltRolesForScope('confidential'), ['President', 'Vice President', 'Membership Committee']);
});

Deno.test('unknown LT notification scope has no recipients', () => {
  assertEquals(ltRolesForScope('unknown'), []);
});

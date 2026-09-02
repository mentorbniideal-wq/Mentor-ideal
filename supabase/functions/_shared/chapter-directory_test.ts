import { directoryMatchReasons, directoryProfileProjection, directoryReferralReadiness, directoryResult, directorySearchScore } from './chapter-directory.ts';

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const member = { id: 'm1', name: 'Phitarn Sakulthanaphetch', nickname: 'พีท', profession: 'ที่ปรึกษาธุรกิจ', company_name: 'Mentor Co.' };
const profile = { share_directory: true, business_summary: 'วางระบบธุรกิจ', looking_for: 'เจ้าของธุรกิจที่กำลังขยายทีม', referral_trigger: 'งานทุกอย่างต้องผ่านผม', gains_goals: 'ข้อมูลส่วนตัวห้ามแสดง' };

Deno.test('directory projection requires explicit opt-in and excludes GAINS', () => {
  assertEquals(directoryProfileProjection({ ...profile, share_directory: false }), null);
  const projected = directoryProfileProjection(profile);
  if (!projected || 'gains_goals' in projected) throw new Error('GAINS leaked into directory');
});

Deno.test('directory search finds roster identity and opted-in referral focus', () => {
  assertEquals(directorySearchScore({ member, profile }, 'พีท'), 100);
  assertEquals(directorySearchScore({ member, profile }, 'ที่ปรึกษา'), 60);
  assertEquals(directorySearchScore({ member, profile }, 'ขยายทีม'), 40);
  assertEquals(directorySearchScore({ member, profile: { ...profile, share_directory: false } }, 'ขยายทีม'), 0);
});

Deno.test('directory result exposes basic roster but hides referral fields without consent', () => {
  const result = directoryResult({ member, profile: { ...profile, share_directory: false } });
  assertEquals(result.directoryOptIn, false);
  assertEquals(result.lookingFor, '');
  assertEquals(result.profession, 'ที่ปรึกษาธุรกิจ');
});

Deno.test('directory explains matches without reading hidden profile fields', () => {
  assertEquals(directoryMatchReasons({ member, profile }, 'ขยายทีม'), ['Looking for']);
  assertEquals(directoryMatchReasons({ member, profile: { ...profile, share_directory: false } }, 'ขยายทีม'), []);
  assertEquals(directoryMatchReasons({ member, profile }, 'พีท'), ['ชื่อสมาชิก']);
});

Deno.test('directory readiness is guidance and requires directory consent', () => {
  assertEquals(directoryReferralReadiness({ ...profile, share_directory: false }).status, 'not_shared');
  const readiness = directoryReferralReadiness(profile);
  assertEquals(readiness.completed, 3);
  assertEquals(readiness.total, 9);
});

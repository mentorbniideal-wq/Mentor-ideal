import { lineAutomationDefaultPreview } from './line-automation-preview.ts';
function assertEquals(actual: unknown, expected: unknown) { if (actual !== expected) throw new Error(`Expected ${expected}, received ${actual}`); }
function assertStringIncludes(actual: string, expected: string) { if (!actual.includes(expected)) throw new Error(`Expected “${actual}” to include “${expected}”`); }
Deno.test('LINE Auto ทุก workflow ที่ส่งข้อความมีตัวอย่างมาตรฐาน', () => {
  for (const key of ['mentorTeamAlert','renewalPush','passportLtReminder','line121AutoReminder','visitorFollowUpReminder','wednesdayNudge','mondayBriefMc','monthlyPersonalReport','fridayLeaderboardMc','thursdayBotPush','fridayRecapMembers','mondayBriefMembers','monthlyRecap']) {
    const preview = lineAutomationDefaultPreview(key); assertEquals(preview.sendsLine, true); if (!preview.defaultPreview.trim()) throw new Error(`${key} has no preview`);
  }
});
Deno.test('งาน coordinator และ maintenance อธิบายว่าไม่มีข้อความ LINE', () => {
  const preview = lineAutomationDefaultPreview('provisionLineExperience'); assertEquals(preview.sendsLine, false); assertStringIncludes(preview.defaultPreview, 'งานเบื้องหลัง');
});

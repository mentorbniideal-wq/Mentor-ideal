import { assertEquals } from "jsr:@std/assert";
import { canManageMemberPulse, canUseMemberPulseStaff, canViewPulseMember, canViewPulseVisibility, pulseReminderDay, pulseReminderDue } from "./member-pulse-access.ts";

Deno.test("Growth Pulse writes require OAuth email and explicit coordinator capability", () => {
  assertEquals(canManageMemberPulse({ role: "growth", email: "g@example.test", capabilities: ["growth.coordinate"] }), true);
  assertEquals(canManageMemberPulse({ role: "growth", email: "g@example.test", capabilities: [] }), false);
  assertEquals(canManageMemberPulse({ role: "growth", capabilities: ["growth.coordinate"] }), false);
  assertEquals(canManageMemberPulse({ role: "growth", email: "g@example.test", capabilities: ["growth.coordinate"], isReadOnly: true }), false);
});

Deno.test("Pulse Member access is exact Mentor team or authenticated MC; Chapter checked by caller", () => {
  const mentor = { isMentor: true, teamName: "Team A" };
  assertEquals(canUseMemberPulseStaff(mentor), true);
  assertEquals(canViewPulseMember(mentor, { mentor_team: "team a" }), true);
  assertEquals(canViewPulseMember(mentor, { mentor_team: "Team B" }), false);
  assertEquals(canViewPulseMember({ isMentor: true }, { mentor_team: "Team A" }), false);
  assertEquals(canViewPulseMember({ isMC: true }, { mentor_team: "Team B" }), true);
});

Deno.test("response visibility scopes are least-privilege and fail closed", () => {
  const growth = { role: "growth", email: "g@example.test", capabilities: ["growth.coordinate"] };
  const mentor = { role: "toomtam", teamName: "Team A", isMentor: true };
  const mc = { role: "mc", isMC: true };
  assertEquals(canViewPulseVisibility(growth, "member"), false);
  assertEquals(canViewPulseVisibility(growth, "mentor_growth"), true);
  assertEquals(canViewPulseVisibility(mentor, "mentor_growth"), true);
  assertEquals(canViewPulseVisibility(mentor, "leadership_only"), false);
  assertEquals(canViewPulseVisibility(mc, "leadership_only"), true);
  assertEquals(canViewPulseVisibility(mc, "unknown"), false);
});

Deno.test("automated reminder schedule stops after Day 7", () => {
  assertEquals(pulseReminderDay(0), 3);
  assertEquals(pulseReminderDay(1), 7);
  assertEquals(pulseReminderDay(2), null);
  assertEquals(pulseReminderDay(3), null);
  assertEquals(pulseReminderDue(0, 2.9), false);
  assertEquals(pulseReminderDue(0, 3), true);
  assertEquals(pulseReminderDue(0, 7), false); // Never call a missed first reminder "Reminder 2".
  assertEquals(pulseReminderDue(1, 6.9), false);
  assertEquals(pulseReminderDue(1, 7), true);
  assertEquals(pulseReminderDue(2, 8), false);
});

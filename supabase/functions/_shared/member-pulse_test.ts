import { assertEquals } from "jsr:@std/assert";
import {
  decideMemberPulse,
  type PulsePolicy,
  validatePulseAnswers,
} from "./member-pulse.ts";

// Test policy illustrates the approved Phase 1B cadence; policies stay disabled
// until Staging acceptance and explicit Chapter enablement.
const policy: PulsePolicy = {
  enabled: true,
  milestones: [
    { stage: "onboarding", months: 3 },
    { stage: "activation", months: 6 },
    { stage: "experience", months: 12, repeatMonths: 6 },
  ],
  renewalDaysBefore: 90,
  dueSoonDays: 7,
  cooldownDays: 60,
};

Deno.test("Member Pulse selects 3, 6 and 12-month stages from join date", () => {
  for (
    const [today, stage] of [
      ["2026-04-01", "onboarding"],
      ["2026-07-01", "activation"],
      ["2027-01-01", "experience"],
    ]
  ) {
    const decision = decideMemberPulse({
      today,
      joinedOn: "2026-01-01",
      expiresOn: "2027-12-31",
      history: today === "2026-04-01" ? [] : [
        {
          stage: "onboarding",
          cycleKey: "onboarding:2026-04-01",
          status: "completed",
          sentOn: "2026-04-01",
        },
        ...(today === "2027-01-01"
          ? [{
            stage: "activation" as const,
            cycleKey: "activation:2026-07-01",
            status: "completed" as const,
            sentOn: "2026-07-01",
          }]
          : []),
      ],
    }, policy);
    assertEquals(decision.stage, stage);
  }
});

Deno.test("Renewal due 90 days before expiry wins over a lifecycle milestone", () => {
  const decision = decideMemberPulse({
    today: "2026-10-03",
    joinedOn: "2026-04-03",
    expiresOn: "2027-01-01",
  }, policy);
  assertEquals(decision.stage, "renewal");
  assertEquals(decision.dueOn, "2026-10-03");
  assertEquals(decision.status, "DUE");
});

Deno.test("Member Pulse avoids duplicate campaign and respects cooldown", () => {
  const base = {
    today: "2026-04-01",
    joinedOn: "2026-01-01",
    expiresOn: "2027-12-31",
  };
  const current = decideMemberPulse({
    ...base,
    history: [{
      stage: "onboarding",
      cycleKey: "onboarding:2026-04-01",
      status: "sent",
      sentOn: "2026-04-01",
    }],
  }, policy);
  assertEquals(current.status, "SENT");
  const cooldown = decideMemberPulse({
    ...base,
    history: [{
      stage: "activation",
      cycleKey: "other",
      status: "sent",
      sentOn: "2026-03-25",
    }],
  }, policy);
  assertEquals(cooldown.status, "SUPPRESSED");
  const boundary = decideMemberPulse({ ...base, today: "2026-05-24", history: [{ stage: "onboarding", cycleKey: "other", status: "sent", sentOn: "2026-03-25" }] }, policy);
  assertEquals(boundary.reason, undefined);
});

Deno.test("Missing dates, expired membership and no policy fail closed", () => {
  assertEquals(
    decideMemberPulse({
      today: "2026-04-01",
      joinedOn: null,
      expiresOn: "2027-01-01",
    }, policy).status,
    "MISSING_DATE",
  );
  assertEquals(
    decideMemberPulse({
      today: "2026-04-01",
      joinedOn: "2026-01-01",
      expiresOn: null,
    }, policy).status,
    "MISSING_DATE",
  );
  assertEquals(
    decideMemberPulse({
      today: "2026-04-01",
      joinedOn: "2025-01-01",
      expiresOn: "2026-03-31",
    }, policy).status,
    "EXPIRED_MEMBERSHIP",
  );
  assertEquals(
    decideMemberPulse({
      today: "2026-04-01",
      joinedOn: "2026-01-01",
      expiresOn: "2027-01-01",
    }, null).status,
    "NOT_CONFIGURED",
  );
  assertEquals(
    decideMemberPulse({
      today: "2026-04-01",
      joinedOn: "2026-01-01",
      expiresOn: "2027-01-01",
    }, { ...policy, enabled: false }).status,
    "NOT_CONFIGURED",
  );
});

Deno.test("Overdue stage is reported and renewal does not preempt an earlier stage before its window", () => {
  const decision = decideMemberPulse({
    today: "2026-04-02",
    joinedOn: "2026-01-01",
    expiresOn: "2027-06-01",
  }, policy);
  assertEquals(decision.stage, "onboarding");
  assertEquals(decision.status, "OVERDUE");
});

Deno.test("Calendar-month arithmetic clamps short months and forecasts future work", () => {
  const decision = decideMemberPulse({
    today: "2026-04-23",
    joinedOn: "2026-01-31",
    expiresOn: "2027-12-31",
  }, policy);
  assertEquals(decision.stage, "onboarding");
  assertEquals(decision.dueOn, "2026-04-30");
  assertEquals(decision.status, "DUE_SOON");
});

Deno.test("Short membership never schedules renewal before joining", () => {
  const decision = decideMemberPulse({
    today: "2026-09-01",
    joinedOn: "2026-09-01",
    expiresOn: "2026-10-01",
  }, policy);
  assertEquals(decision.stage, "renewal");
  assertEquals(decision.dueOn, "2026-09-01");
});

Deno.test("Pulse answers accept only server-template fields and typed values", () => {
  const spec = [
    { id: "happiness", label: "ความสุข", type: "scale", required: true },
    {
      id: "intent",
      label: "การต่ออายุ",
      type: "choice",
      options: ["yes", "unsure", "no"],
    },
    { id: "need", label: "สิ่งที่อยากให้ช่วย", type: "text" },
  ];
  assertEquals(
    validatePulseAnswers(spec, {
      happiness: 8,
      intent: "unsure",
      need: "ช่วยแนะนำ",
    }).ok,
    true,
  );
  assertEquals(
    validatePulseAnswers(spec, { happiness: 8, privateNote: "leak" }).ok,
    false,
  );
  assertEquals(validatePulseAnswers(spec, { happiness: 11 }).ok, false);
  assertEquals(validatePulseAnswers(spec, { happiness: "8" }).ok, false);
  assertEquals(
    validatePulseAnswers(spec, { happiness: 8, intent: "maybe" }).ok,
    false,
  );
  assertEquals(validatePulseAnswers(spec, { intent: "yes" }).ok, false);
});

Deno.test("Partial Pulse saves may omit required answers but final submission may not", () => {
  const spec = [{ id: "need", label: "สิ่งที่อยากให้ช่วย", type: "text", required: true }];
  assertEquals(validatePulseAnswers(spec, {}, true).ok, true);
  assertEquals(validatePulseAnswers(spec, {}).ok, false);
});

Deno.test("Recurring experience Pulse repeats every six months after month 12", () => {
  const decision = decideMemberPulse({ today: "2027-07-01", joinedOn: "2026-01-01", expiresOn: "2028-01-01", history: [
    { stage: "onboarding", cycleKey: "onboarding:2026-04-01", status: "completed", sentOn: "2026-04-01" },
    { stage: "activation", cycleKey: "activation:2026-07-01", status: "completed", sentOn: "2026-07-01" },
    { stage: "experience", cycleKey: "experience:2027-01-01", status: "completed", sentOn: "2027-01-01" },
  ] }, policy);
  assertEquals(decision.stage, "experience");
  assertEquals(decision.dueOn, "2027-07-01");
});

Deno.test("Renewal priority wins when Renewal and Lifecycle enter due window together", () => {
  const decision = decideMemberPulse({ today: "2027-09-01", joinedOn: "2026-09-01", expiresOn: "2027-12-01" }, policy);
  assertEquals(decision.stage, "renewal");
  assertEquals(decision.dueOn, "2027-09-02");
});

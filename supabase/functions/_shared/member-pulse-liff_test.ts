import { assertEquals } from "jsr:@std/assert";
import { handleMemberPulseLiff } from "./member-pulse-liff.ts";

type Row = Record<string, unknown>;
const chapterA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const chapterB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const memberA = "11111111-1111-4111-8111-111111111111";
const memberB = "22222222-2222-4222-8222-222222222222";
const template = {
  id: "template-a",
  chapter_id: chapterA,
  stage: "onboarding",
  title: "TEST_Pulse",
  active: true,
  version: 1,
  question_spec: [{
    id: "happiness",
    label: "ความสุข",
    type: "scale",
    required: true,
  }],
};
const campaign = {
  id: "campaign-a",
  chapter_id: chapterA,
  member_id: memberA,
  template_id: template.id,
  stage: "onboarding",
  due_on: "2026-09-29",
  status: "due",
  created_at: "2026-09-29T00:00:00Z",
};

function fakeDb() {
  const tables: Record<string, Row[]> = {
    members: [
      { id: memberA, chapter_id: chapterA, is_archived: false },
      { id: memberB, chapter_id: chapterA, is_archived: false },
    ],
    member_pulse_policies: [{ chapter_id: chapterA, enabled: true }, {
      chapter_id: chapterB,
      enabled: true,
    }],
    member_pulse_templates: [{ ...template }],
    member_pulse_campaigns: [{ ...campaign }],
    member_pulse_responses: [],
    member_pulse_pilot_access: [],
  };
  const db = {
    from(table: string) {
      const filters: [string, unknown][] = [];
      let mutation: Row | null = null;
      let operation = "read";
      let conflictColumns: string[] = [];
      const query = {
        select(_columns: string) {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return query;
        },
        order(_column: string, _direction: unknown) {
          return query;
        },
        limit(_count: number) {
          return query;
        },
        update(value: Row) {
          operation = "update";
          mutation = value;
          return query;
        },
        upsert(value: Row, options: { onConflict?: string }) {
          operation = "upsert";
          mutation = value;
          conflictColumns = String(options?.onConflict || "campaign_id").split(",");
          return query;
        },
        async maybeSingle() {
          const rows = tables[table];
          let row = rows.find((item) =>
            filters.every(([column, value]) => item[column] === value)
          );
          if (operation === "upsert") {
            row = rows.find((item) => conflictColumns.every((key) => item[key] === mutation?.[key]));
            if (!row) {
              row = { ...(table === "member_pulse_campaigns" ? { id: "pilot-campaign" } : {}), ...mutation };
              rows.push(row);
            } else row = undefined;
          } else if (operation === "update" && row) {
            Object.assign(row, mutation);
          }
          return { data: row ? { ...row } : null, error: null };
        },
      };
      return query;
    },
  };
  return { db, tables };
}

Deno.test("Member Pulse LIFF returns only own Chapter campaign and never another member's answers", async () => {
  const { db, tables } = fakeDb();
  tables.member_pulse_responses.push({
    campaign_id: campaign.id,
    chapter_id: chapterA,
    answers: { happiness: 8 },
    completed_at: "2026-09-29T01:00:00Z",
  });
  const own = await handleMemberPulseLiff(
    db,
    { chapterId: chapterA, memberId: memberA },
    "get-my-pulse",
    {},
  );
  assertEquals(own.body.available, true);
  assertEquals(own.body.answers, { happiness: 8 });
  const other = await handleMemberPulseLiff(
    db,
    { chapterId: chapterA, memberId: memberB },
    "get-my-pulse",
    {},
  );
  assertEquals(other.body.available, false);
  const cross = await handleMemberPulseLiff(
    db,
    { chapterId: chapterB, memberId: memberA },
    "get-my-pulse",
    {},
  );
  assertEquals(cross.status, 403);
});

Deno.test("Member Pulse LIFF denies forged campaign and disabled policy", async () => {
  const { db, tables } = fakeDb();
  const forged = await handleMemberPulseLiff(
    db,
    { chapterId: chapterA, memberId: memberB },
    "submit-my-pulse",
    {
      campaignId: campaign.id,
      answers: { happiness: 8 },
      memberId: memberA,
      chapterId: chapterA,
    },
  );
  assertEquals(forged.status, 404);
  assertEquals(tables.member_pulse_responses.length, 0);
  tables.member_pulse_policies[0].enabled = false;
  const disabled = await handleMemberPulseLiff(
    db,
    { chapterId: chapterA, memberId: memberA },
    "submit-my-pulse",
    { campaignId: campaign.id, answers: { happiness: 8 } },
  );
  assertEquals(disabled.status, 403);
  tables.members[0].is_archived = true;
  const archived = await handleMemberPulseLiff(
    db,
    { chapterId: chapterA, memberId: memberA },
    "get-my-pulse",
    {},
  );
  assertEquals(archived.status, 403);
});

Deno.test("Member Pulse LIFF validates and deduplicates completion", async () => {
  const { db, tables } = fakeDb();
  tables.member_pulse_campaigns[0].status = "sent";
  const invalid = await handleMemberPulseLiff(
    db,
    { chapterId: chapterA, memberId: memberA },
    "submit-my-pulse",
    { campaignId: campaign.id, answers: { happiness: 99 } },
  );
  assertEquals(invalid.status, 400);
  const first = await handleMemberPulseLiff(
    db,
    { chapterId: chapterA, memberId: memberA },
    "submit-my-pulse",
    { campaignId: campaign.id, answers: { happiness: 8 } },
  );
  assertEquals(first.body.ok, true);
  assertEquals(tables.member_pulse_responses.length, 1);
  const again = await handleMemberPulseLiff(
    db,
    { chapterId: chapterA, memberId: memberA },
    "submit-my-pulse",
    { campaignId: campaign.id, answers: { happiness: 9 } },
  );
  assertEquals(again.body.duplicate, true);
  assertEquals(tables.member_pulse_responses[0].answers, { happiness: 8 });
});

Deno.test("Member Pulse LIFF cannot submit a due campaign before Growth sends it", async () => {
  const { db, tables } = fakeDb();
  const result = await handleMemberPulseLiff(db, { chapterId: chapterA, memberId: memberA }, "submit-my-pulse", { campaignId: campaign.id, answers: { happiness: 8 } });
  assertEquals(result.status, 409);
  assertEquals(tables.member_pulse_responses.length, 0);
});

Deno.test("private pilot starts only for explicitly allowed linked member and never sends LINE", async () => {
  const { db, tables } = fakeDb();
  tables.member_pulse_policies[0].enabled = false;
  tables.member_pulse_pilot_access.push({ chapter_id: chapterA, member_id: memberA, enabled: true });
  tables.member_pulse_templates.push({ ...template, id: "pilot-template", stage: "experience", version: 1000, active: false });
  const allowed = await handleMemberPulseLiff(db, { chapterId: chapterA, memberId: memberA }, "get-my-pulse", {});
  assertEquals(allowed.status, 200);
  assertEquals(allowed.body.available, true);
  assertEquals(tables.member_pulse_campaigns.filter((row) => row.cycle_key === "pilot:v1").length, 1);
  const denied = await handleMemberPulseLiff(db, { chapterId: chapterA, memberId: memberB }, "get-my-pulse", {});
  assertEquals(denied.body.available, false);
  const repeated = await handleMemberPulseLiff(db, { chapterId: chapterA, memberId: memberA }, "get-my-pulse", {});
  assertEquals(repeated.status, 200);
  assertEquals(tables.member_pulse_campaigns.filter((row) => row.cycle_key === "pilot:v1").length, 1);
  tables.member_pulse_pilot_access[0].enabled = false;
  const revoked = await handleMemberPulseLiff(db, { chapterId: chapterA, memberId: memberA }, "get-my-pulse", {});
  assertEquals(revoked.body.available, false);
  const blockedSubmit = await handleMemberPulseLiff(db, { chapterId: chapterA, memberId: memberA }, "submit-my-pulse", { campaignId: (repeated.body.campaign as Row).id, answers: { happiness: 8 } });
  assertEquals(blockedSubmit.status, 403);
});

Deno.test("Member Pulse LIFF fails closed on completed campaign without persisted response", async () => {
  const { db, tables } = fakeDb();
  tables.member_pulse_campaigns[0].status = "completed";
  const result = await handleMemberPulseLiff(
    db,
    { chapterId: chapterA, memberId: memberA },
    "submit-my-pulse",
    { campaignId: campaign.id, answers: { happiness: 8 } },
  );
  assertEquals(result.status, 409);
  assertEquals(tables.member_pulse_responses.length, 0);
});

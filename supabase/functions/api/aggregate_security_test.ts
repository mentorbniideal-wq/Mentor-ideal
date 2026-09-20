import { assertEquals } from "jsr:@std/assert";
import { getMentorActivityData } from "./handlers/dashboard.ts";

type Row = Record<string, unknown>;
type Filter = { kind: "eq" | "in"; key: string; value: unknown };

// A small multi-Chapter query double.  It models the service-client calls made
// by the production aggregate helper, so the test proves records are scoped
// before the view and score aggregation run.
class Query {
  private filters: Filter[] = [];
  constructor(private readonly table: string, private readonly fixtures: Record<string, Row[]>) {}
  select(_columns: string) { return this; }
  eq(key: string, value: unknown) { this.filters.push({ kind: "eq", key, value }); return this; }
  in(key: string, value: unknown[]) { this.filters.push({ kind: "in", key, value }); return this; }
  order(_key: string, _options?: unknown) { return this; }
  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const data = (this.fixtures[this.table] || []).filter((row) => this.filters.every((filter) => {
      const value = row[filter.key];
      return filter.kind === "eq" ? value === filter.value : (filter.value as unknown[]).includes(value);
    }));
    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  }
}

function multiChapterDb() {
  const fixtures: Record<string, Row[]> = {
    members: [
      { id: "a-member", chapter_id: "chapter-a", is_archived: false },
      { id: "b-member", chapter_id: "chapter-b", is_archived: false },
    ],
    v_member_dashboard: [
      { id: "a-member", name: "A Member", mentor_team: "TOOMTAM", is_archived: false, open_core_issue: false, core_issue_opened_at: null, display_score: 60 },
      { id: "b-member", name: "B Member", mentor_team: "TOOMTAM", is_archived: false, open_core_issue: true, core_issue_opened_at: "2026-01-01", display_score: 90 },
    ],
    monthly_scores: [
      { member_id: "a-member", score: 60, year: 2026, month: 2 },
      { member_id: "a-member", score: 50, year: 2026, month: 1 },
      { member_id: "b-member", score: 90, year: 2026, month: 2 },
      { member_id: "b-member", score: 80, year: 2026, month: 1 },
    ],
  };
  return { from: (table: string) => new Query(table, fixtures) };
}

Deno.test("synthetic Chapters: mentor activity aggregates only server-scoped member records", async () => {
  const teams = await getMentorActivityData(multiChapterDb() as never, "chapter-a");
  const toomtam = teams.find((team) => team.team === "TOOMTAM");
  assertEquals(toomtam?.memberCount, 1);
  assertEquals(toomtam?.scoreUp, 1);
  assertEquals(toomtam?.reportCount, 0);
  assertEquals(toomtam?.notReported, ["A Member"]);
});

Deno.test("synthetic Chapters: missing scope produces no aggregate records", async () => {
  const teams = await getMentorActivityData(multiChapterDb() as never, "missing-chapter");
  assertEquals(teams.every((team) => team.memberCount === 0), true);
});

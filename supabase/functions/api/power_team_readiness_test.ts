import { assert, assertEquals } from "jsr:@std/assert";
import { powerTeamCandidates } from "./handlers/power-teams.ts";
type Row = Record<string, unknown>;
class Query {
  filters: ((row: Row) => boolean)[] = [];
  count = Infinity;
  constructor(private rows: Row[]) {}
  select(_columns: string) {
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters.push((row) => row[key] === value);
    return this;
  }
  in(key: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[key]));
    return this;
  }
  order(_key: string, _options?: unknown) {
    return this;
  }
  limit(count: number) {
    this.count = count;
    return this;
  }
  result() {
    return this.rows.filter((row) => this.filters.every((f) => f(row))).slice(
      0,
      this.count,
    );
  }
  maybeSingle() {
    return Promise.resolve({ data: this.result()[0] || null, error: null });
  }
  then<T>(
    resolve: (result: { data: Row[]; error: null }) => T | PromiseLike<T>,
  ) {
    return Promise.resolve(resolve({ data: this.result(), error: null }));
  }
}
function database(secondMember: boolean, shareSecond = true) {
  const tables: Record<string, Row[]> = {
    chapter_profiles: [{
      id: "chapter",
      is_active: true,
      msb_planning_year: 2027,
    }],
    members: [
      { id: "a", chapter_id: "chapter", is_archived: false, name: "A" },
      { id: "b", chapter_id: "chapter", is_archived: false, name: "B" },
      { id: "other", chapter_id: "other", is_archived: false, name: "Other" },
    ],
    member_success_blueprints: [{
      member_id: "a",
      blueprint_year: 2027,
      status: "submitted",
      power_team_categories: [" Finance ", "finance"],
      power_team_detail: "private a",
    }, {
      member_id: "b",
      blueprint_year: 2027,
      status: secondMember ? "submitted" : "draft",
      power_team_categories: ["FINANCE"],
      power_team_detail: "private b",
    }, {
      member_id: "other",
      blueprint_year: 2027,
      status: "submitted",
      power_team_categories: ["Finance"],
      power_team_detail: "other Chapter",
    }],
    member_blueprint_growth_consents: [{
      member_id: "a",
      chapter_id: "chapter",
      blueprint_year: 2027,
      share_referral_focus: true,
      share_business: false,
      share_details: false,
    }, {
      member_id: "b",
      chapter_id: "chapter",
      blueprint_year: 2027,
      share_referral_focus: shareSecond,
      share_business: false,
      share_details: false,
    }],
  };
  return { from: (table: string) => new Query(tables[table] || []) };
}
Deno.test("Actual candidate helper excludes other Chapters/drafts and does not count duplicate categories as people", async () => {
  assertEquals(
    await powerTeamCandidates(database(false) as never, "chapter", true),
    [],
  );
  const candidates = await powerTeamCandidates(
    database(true) as never,
    "chapter",
    true,
  );
  assertEquals(candidates.length, 1);
  assertEquals(candidates[0].memberIds, ["a", "b"]);
  assert(!candidates[0].targetCustomerGroup.includes("private"));
  assertEquals(
    await powerTeamCandidates(database(true, false) as never, "chapter", true),
    [],
  );
});
Deno.test("Sharing-only and invitation writes retain verified member identity boundaries", async () => {
  const source = await Deno.readTextFile(
    new URL("./handlers/member-success-blueprints.ts", import.meta.url),
  );
  const sharing =
    source.split("case 'saveMemberBlueprintGrowthConsentByToken':")[1].split(
      "case 'saveMemberSuccessBlueprintByToken':",
    )[0];
  assert(sharing.includes("resolveWebAccessToken"));
  assert(sharing.includes("p_member_id:identity.memberId"));
  assert(sharing.includes("p_chapter_id:member.chapter_id"));
  assert(!sharing.includes("p.chapterId"));
  const liff = await Deno.readTextFile(
    new URL("../liff-api/index.ts", import.meta.url),
  );
  const invitation =
    liff.split("if(action==='respond-power-team-invitation')")[1].split(
      "if (action === 'get-my-pulse'",
    )[0];
  assert(invitation.includes("p_member_id:memberId"));
  assert(!invitation.includes("body.memberId"));
  assert(invitation.includes("body.confirmed!==true"));
});

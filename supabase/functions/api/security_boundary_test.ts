import { assert, assertEquals } from "jsr:@std/assert";

async function read(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(`../../../${path}`, import.meta.url));
}

function actionBlock(
  source: string,
  action: string,
  nextAction: string,
): string {
  const start = source.indexOf(`case '${action}'`);
  const end = source.indexOf(`case '${nextAction}'`, start + 1);
  assert(start >= 0, `${action} case missing`);
  return source.slice(start, end >= 0 ? end : source.length);
}

Deno.test("Growth cannot call broad Mentor Member Detail", async () => {
  const source = await read("supabase/functions/api/handlers/dashboard.ts");
  const block = actionBlock(source, "getMemberDetail", "getMyTeam");
  assert(block.includes("['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp']"));
  assert(!block.match(/requireAuth\([^\n]+growth/));
});

Deno.test("Growth contexts are Chapter-scoped and consent-minimised", async () => {
  const source = await read("supabase/functions/api/handlers/dashboard.ts");
  for (
    const [action, next] of [
      ["getSharedMemberSupportContext", "getGrowthMemberContext"],
      ["getGrowthMemberContext", "getMemberDetail"],
    ]
  ) {
    const block = actionBlock(source, action, next);
    assert(block.includes("resolveChapterScope(db, auth)"));
    assert(block.includes(".eq('chapter_id', scope.chapterId)"));
    assert(!block.includes("member_one_to_one_profiles').select('*')"));
    assert(!block.includes("mentor_logs').select"));
    assert(!block.includes("ninety_day_reviews').select"));
  }
  const growth = actionBlock(
    source,
    "getGrowthMemberContext",
    "getMemberDetail",
  );
  assert(growth.includes("profile.share_business"));
  assert(growth.includes("profile.share_referral_focus"));
});

Deno.test("Blueprint intelligence and matching derive Chapter scope", async () => {
  const source = await read(
    "supabase/functions/api/handlers/member-success-blueprints.ts",
  );
  assert(source.includes("import { resolveChapterScope }"));
  assert(source.includes(".eq('chapter_id', chapterId)"));
  const matching = actionBlock(source, "getMSBMatchingSuggestions", "");
  assert(matching.includes("resolveChapterScope(db, auth)"));
  assert(matching.includes(".eq('chapter_id', scope.chapterId)"));
  assert(matching.includes("share_business") && matching.includes("share_referral_focus"), 'Growth matching must apply business and referral consent');
});

Deno.test("MY121 aggregates derive Chapter scope before every log query", async () => {
  const source = await read("supabase/functions/api/handlers/121.ts");
  for (const [action, next] of [["getAll121Logs", "get121Tracker"], ["get121Tracker", ""]] as const) {
    const block = actionBlock(source, action, next);
    assert(block.includes("resolveChapterScope(db, auth)"), `${action} must derive Chapter scope`);
    assert(block.includes(".eq('chapter_id', scope.chapterId)"), `${action} must scope members to the Chapter`);
    assert(block.includes(".in('initiator_id', scopedIds)"), `${action} must scope every MY121 log read`);
    assert(block.includes(".eq('initiator.chapter_id', scope.chapterId)"), `${action} must scope the initiator join`);
  }
  const tracker = actionBlock(source, "get121Tracker", "");
  assert(tracker.includes(".eq('partner.chapter_id', scope.chapterId)"), 'tracker must scope the partner join');
  assert(tracker.includes("auth.role === 'growth' ? ''"), 'Growth MY121 DTO must omit Mentor-private free text');
});

Deno.test("synthetic two-Chapter and consent-disabled fixtures preserve the Growth projection", () => {
  const members = [
    { id: 'a-1', chapterId: 'chapter-a', companyName: 'Visible Co.', powerTeams: ['Architect'], shareBusiness: true, shareReferral: true },
    { id: 'a-2', chapterId: 'chapter-a', companyName: 'Hidden Co.', powerTeams: ['Lawyer'], shareBusiness: false, shareReferral: false },
    { id: 'b-1', chapterId: 'chapter-b', companyName: 'Other Chapter Co.', powerTeams: ['Architect'], shareBusiness: true, shareReferral: true },
  ];
  const growthProjection = members
    .filter(member => member.chapterId === 'chapter-a')
    .map(member => ({
      id: member.id,
      companyName: member.shareBusiness ? member.companyName : '',
      powerTeams: member.shareReferral ? member.powerTeams : [],
    }));
  assertEquals(growthProjection, [
    { id: 'a-1', companyName: 'Visible Co.', powerTeams: ['Architect'] },
    { id: 'a-2', companyName: '', powerTeams: [] },
  ]);
});

Deno.test("Member Team and mentoring mode writes cannot cross Chapter", async () => {
  const dashboard = await read("supabase/functions/api/handlers/dashboard.ts");
  const team = actionBlock(dashboard, "getMyTeam", "getMentorActivity");
  assert(team.includes("resolveChapterScope(db, auth)"));
  assert(team.includes(".eq('chapter_id', scope.chapterId)"));
  assert(team.includes(".in('id', scopedMemberIds)"));

  const members = await read("supabase/functions/api/handlers/members.ts");
  const mode = members.slice(
    members.indexOf('case "setMentoringMode"'),
    members.indexOf('case "saveStatus"'),
  );
  assert(mode.includes("resolveChapterScope(db, auth)"));
  assert(mode.includes("findMemberByLegacyPayload(db, p, scope.chapterId)"));
});

Deno.test("Mentor-only role cannot execute Growth Coordinator mutations", async () => {
  const source = await read("supabase/functions/api/handlers/growth.ts");
  const actions = [
    "saveGrowthGoalReview",
    "saveMSBCategoryAlias",
    "createGrowthTask",
    "previewMonthlySync",
    "monthlySync",
    "updateGrowthMember",
    "addGrowthMember",
    "moveGrowthMember",
  ];
  for (let i = 0; i < actions.length; i++) {
    const start = source.indexOf(`case '${actions[i]}'`);
    const next = source.indexOf("\n    case ", start + 1);
    const block = source.slice(start, next >= 0 ? next : source.length);
    assert(
      block.includes("requireAuth(db, p, ['mc', 'growth'])"),
      `${actions[i]} must be Growth Coordinator only`,
    );
    assert(
      !block.includes("'toomtam'"),
      `${actions[i]} must reject Mentor Coordinator`,
    );
  }
  assertEquals(actions.length, 8);
});

Deno.test("Growth Desktop never requests broad Member Detail", async () => {
  const desktop = await read("public/assets/js/desktop-operations.js");
  assert(
    desktop.includes(
      "S.role==='growth'?'getGrowthMemberContext':'getMemberDetail'",
    ),
  );
  const modal = await read("public/assets/js/desktop-member-360.js");
  assert(modal.includes("String(window.S.role||'').toLowerCase()==='growth'"));
});

Deno.test("aggregate dashboard reads derive Chapter scope before querying member data", async () => {
  const source = await read("supabase/functions/api/handlers/dashboard.ts");
  assert(source.includes("async function scopedActiveMemberIds"));
  assert(source.includes(".eq('chapter_id', chapterId)"));
  assert(source.includes(".in('id', scopedMemberIds)"));

  const scopedActions: Array<[string, string]> = [
    ["getDashboard", "getSharedMemberSupportContext"],
    ["getChapterPulse", "getLeaderboard"],
    ["getLeaderboard", "getScorecard"],
    ["getChapterTrend", "getTrafficLightMonthlySummary"],
    ["getTrafficLightMonthlySummary", ""],
  ];
  for (const [action, next] of scopedActions) {
    const block = actionBlock(source, action, next);
    assert(block.includes("resolveChapterScope(db, auth)"), `${action} must resolve scope on the server`);
    assert(!block.includes("p.chapterId") && !block.includes("p.chapter_id"), `${action} must not trust browser Chapter input`);
  }

  const pulse = actionBlock(source, "getChapterPulse", "getLeaderboard");
  assert(pulse.includes(".in('member_id', scopedMemberIds)"), "score history must be restricted before movement aggregation");
  const trend = actionBlock(source, "getChapterTrend", "getTrafficLightMonthlySummary");
  assert(trend.includes(".eq('chapter_id', scope.chapterId)"), "Chapter trend must scope monthly scores at query time");
  const traffic = actionBlock(source, "getTrafficLightMonthlySummary", "");
  assert(traffic.includes(".eq('chapter_id', scope.chapterId)"), "traffic summary must scope scores at query time");
});

Deno.test("Growth cannot call Mentor accountability aggregate endpoints", async () => {
  const dashboard = await read("supabase/functions/api/handlers/dashboard.ts");
  const growth = await read("supabase/functions/api/handlers/growth.ts");
  for (const source of [dashboard, growth]) {
    for (const [action, next] of [["getMentorActivity", "getMentorPerformance"], ["getMentorPerformance", "getChapterPulse"]]) {
      const block = actionBlock(source, action, next);
      assert(block.includes("requireAuth(db, p, ['mc'])"), `${action} must be Mentor Co. only`);
      assert(block.includes("resolveChapterScope(db, auth)"), `${action} must resolve a server Chapter scope`);
    }
  }
});

Deno.test("Growth cannot call the broad operational dashboard", async () => {
  const dashboard = await read("supabase/functions/api/handlers/dashboard.ts");
  const block = actionBlock(dashboard, "getDashboard", "getSharedMemberSupportContext");
  assert(block.includes("['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp', 'mentor_support']"));
  assert(block.includes("resolveChapterScope(db, auth)"));
});

Deno.test("scorecard remains Mentor Co. only because it returns team member breakdowns", async () => {
  const dashboard = await read("supabase/functions/api/handlers/dashboard.ts");
  const block = actionBlock(dashboard, "getScorecard", "getMCCoaching");
  assert(block.includes("requireAuth(db, p, ['mc'])"));
  assert(block.includes("resolveChapterScope(db, auth)"));
  assert(block.includes(".in('id', scopedMemberIds)"));
});

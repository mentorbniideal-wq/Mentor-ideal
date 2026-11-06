// Actual migrations in a no-network PostgreSQL engine; synthetic identities only.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { PGlite } = await import(
  process.env.PGLITE_MODULE || "@electric-sql/pglite"
);
const db = new PGlite();
const id = (n) => "10000000-0000-0000-0000-" + String(n).padStart(12, "0");
const chapter = id(1),
  other = id(2),
  a = id(3),
  b = id(4),
  outsider = id(5),
  request = id(6);
try {
  await db.exec(
    `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
    CREATE TABLE chapter_profiles(id uuid PRIMARY KEY,msb_planning_year integer);
    CREATE TABLE members(id uuid PRIMARY KEY,chapter_id uuid,is_archived boolean,bni_goal numeric);
    CREATE TABLE chapter_audit_events(chapter_id uuid,event_type text,actor_role text,actor_ref text,subject_type text,subject_ref text,metadata jsonb);`,
  );
  await db.exec(
    "CREATE TABLE role_assignments(chapter_id uuid,email text,display_name text,role text,access_status text,access_starts_at timestamptz,access_expires_at timestamptz,read_only_after timestamptz)",
  );
  for (
    const name of [
      "20260708000049_member_success_blueprints.sql",
      "20260911000004_msb_goal_setting_worksheet.sql",
      "20260911000003_power_team_proposals.sql",
    ]
  ) await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
  await db.exec(
    `ALTER TABLE power_team_proposals ADD COLUMN assigned_owner_email text; ALTER TABLE power_team_proposals ADD COLUMN assigned_owner_name text; ALTER TABLE power_team_proposals ADD COLUMN assigned_at timestamptz;`,
  );
  await db.exec(
    `ALTER TABLE power_team_proposals DROP CONSTRAINT power_team_proposals_status_check; ALTER TABLE power_team_proposals ADD CONSTRAINT power_team_proposals_status_check CHECK(status IN ('proposed','draft','assigned','exploring','active','closed','archived'));`,
  );
  for (
    const name of [
      "20260928000001_growth_power_team_publications.sql",
      "20261106000001_blueprint_growth_safety.sql",
    ]
  ) await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
  await db.query("INSERT INTO chapter_profiles VALUES($1,2027),($2,2027)", [
    chapter,
    other,
  ]);
  await db.query(
    "INSERT INTO members VALUES($1,$2,false,0),($3,$2,false,0),($4,$5,false,0)",
    [a, chapter, b, outsider, other],
  );
  const plan = {
    total_sales_target_year: 1000,
    expected_sales_from_bni_year: 300,
    existing_customer_revenue_from_bni: 100,
    new_customer_revenue_from_bni: 200,
    average_customer_value_year: 50,
    conversion_rate_percent: 20,
    looking_for_categories: ["A"],
    looking_for_detail: "target",
    power_team_categories: ["A"],
    power_team_detail: "partners",
    personal_goal_category: "learning",
    status: "submitted",
    source: "member_form",
    monthly_marketing_plan: [],
  };
  const consent = {
    share_referral_focus: true,
    share_details: false,
    share_business: false,
  };
  const save = (
    scope = chapter,
    req = request,
    expected = null,
    p = plan,
    c = consent,
  ) =>
    db.query(
      "SELECT save_blueprint_growth_atomic($1,$2,2027,$3,$4,$5,$6) result",
      [scope, a, req, expected, p, c],
    );
  await assert.rejects(() => save(other));
  await assert.rejects(() =>
    save(chapter, request, null, plan, {
      ...consent,
      share_referral_focus: false,
      share_details: true,
    })
  );
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM member_success_blueprints"))
      .rows[0].n,
    0,
  );
  const first = (await save()).rows[0].result;
  await save();
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM chapter_audit_events")).rows[0]
      .n,
    1,
  );
  await assert.rejects(() =>
    save(chapter, request, null, { ...plan, total_sales_target_year: 2000 })
  );
  await assert.rejects(() => save(chapter, id(7), null));
  await save(chapter, id(7), first.blueprint.updated_at, plan, {
    _expected_updated_at: first.growthConsent.updated_at,
    share_referral_focus: false,
    share_details: false,
    share_business: false,
  });
  assert.equal(
    (await db.query(
      "SELECT share_referral_focus FROM member_blueprint_growth_consents",
    )).rows[0].share_referral_focus,
    false,
  );
  assert.equal(
    Number(
      (await db.query("SELECT bni_goal FROM members WHERE id=$1", [a])).rows[0]
        .bni_goal,
    ),
    300,
  );
  const data = {
    title: "Shared customer",
    targetCustomerGroup: "New households",
    rationale: "Shared customer hypothesis",
  };
  const create = (req, members = [a, b], scope = chapter, p = data) =>
    db.query(
      "SELECT create_power_team_proposal_atomic($1,$2,$3,$4,$5) result",
      [scope, req, "coordinator@fixture.invalid", p, members],
    );
  await assert.rejects(() => create(id(8), [a, outsider]));
  await assert.rejects(() =>
    create(id(8), [a, b], chapter, { ...data, leaderMemberId: outsider })
  );
  const proposal = (await create(id(8))).rows[0].result.proposalId;
  await create(id(8));
  const proposalVersion = (await db.query(
    "SELECT updated_at::text version FROM power_team_proposals WHERE id=$1",
    [proposal],
  )).rows[0].version;
  const update = (expected, patch, scope = chapter) =>
    db.query("SELECT update_power_team_proposal_atomic($1,$2,$3,$4,$5)", [
      scope,
      proposal,
      expected,
      "coordinator@fixture.invalid",
      patch,
    ]);
  await db.query(
    "INSERT INTO role_assignments(chapter_id,email,role,access_status,access_expires_at) VALUES($1,'expired@fixture.invalid','growth','active',now()-interval '1 hour')",
    [chapter],
  );
  await assert.rejects(() =>
    update(proposalVersion, {
      status: "assigned",
      assigned_owner_email: "expired@fixture.invalid",
    })
  );
  await assert.rejects(() =>
    update(proposalVersion, { status: "exploring" }, other)
  );
  await update(proposalVersion, { status: "exploring" });
  await update(proposalVersion, { status: "exploring" });
  await assert.rejects(() => update(proposalVersion, { status: "active" }));
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM power_team_proposals")).rows[0]
      .n,
    1,
  );
  await assert.rejects(() =>
    create(id(8), [a, b], chapter, { ...data, title: "Different payload" })
  );
  // Fail audit after inserts: every Proposal/link/request must roll back.
  await db.exec(
    `CREATE FUNCTION fail_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type IN ('power_team_proposal_created','blueprint_saved') THEN RAISE EXCEPTION 'fixture audit failure'; END IF;RETURN NEW;END $$;CREATE TRIGGER fixture_fail BEFORE INSERT ON chapter_audit_events FOR EACH ROW EXECUTE FUNCTION fail_test_audit();`,
  );
  await assert.rejects(() => create(id(9)));
  const planVersion = (await db.query(
    "SELECT updated_at::text version FROM member_success_blueprints WHERE member_id=$1",
    [a],
  )).rows[0].version;
  const consentVersion = (await db.query(
    "SELECT updated_at::text version FROM member_blueprint_growth_consents WHERE member_id=$1",
    [a],
  )).rows[0].version;
  await assert.rejects(() =>
    save(chapter, id(12), planVersion, {
      ...plan,
      expected_sales_from_bni_year: 600,
      new_customer_revenue_from_bni: 500,
    }, { ...consent, _expected_updated_at: consentVersion })
  );
  assert.equal(
    Number(
      (await db.query("SELECT bni_goal FROM members WHERE id=$1", [a])).rows[0]
        .bni_goal,
    ),
    300,
  );
  assert.equal(
    (await db.query(
      "SELECT share_referral_focus FROM member_blueprint_growth_consents WHERE member_id=$1",
      [a],
    )).rows[0].share_referral_focus,
    false,
  );
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM power_team_proposals")).rows[0]
      .n,
    1,
  );
  await db.exec("DROP TRIGGER fixture_fail ON chapter_audit_events");
  const consentOnly = (
    scope = chapter,
    req = id(13),
    flags = { ...consent, _expected_updated_at: consentVersion },
  ) =>
    db.query("SELECT save_blueprint_growth_consent($1,$2,2027,$3,$4) result", [
      scope,
      a,
      req,
      flags,
    ]);
  await assert.rejects(() => consentOnly(other));
  await consentOnly();
  await consentOnly();
  assert.equal(
    (await db.query(
      "SELECT updated_at::text version FROM member_success_blueprints WHERE member_id=$1",
      [a],
    )).rows[0].version,
    planVersion,
  );
  await assert.rejects(() =>
    save(chapter, id(14), planVersion, plan, {
      ...consent,
      _expected_updated_at: consentVersion,
    })
  );
  const respond = (who, scope = chapter, status = "accepted", pid = proposal) =>
    db.query("SELECT respond_power_team_invitation($1,$2,$3,$4)", [
      scope,
      who,
      pid,
      status,
    ]);
  await assert.rejects(() => respond(outsider, other));
  await db.query(
    "UPDATE power_team_proposals SET status='active' WHERE id=$1",
    [proposal],
  );
  const publish = (pid) =>
    db.query(
      "INSERT INTO growth_power_team_publications(chapter_id,proposal_id,published_by_email) VALUES($1,$2,'admin@fixture.invalid') RETURNING id",
      [chapter, pid],
    );
  await assert.rejects(() => publish(proposal));
  await respond(a);
  await respond(a);
  await respond(b);
  const publication = (await publish(proposal)).rows[0].id;
  await assert.rejects(() => respond(a));
  const revision = (await create(id(10), [a, b], chapter, {
    ...data,
    supersedesPublicationId: publication,
  })).rows[0].result.proposalId;
  await respond(a, chapter, "accepted", revision);
  await respond(b, chapter, "accepted", revision);
  await db.query(
    "UPDATE power_team_proposals SET status='active' WHERE id=$1",
    [revision],
  );
  await publish(revision);
  assert.equal(
    (await db.query(
      "SELECT status FROM growth_power_team_publications WHERE id=$1",
      [publication],
    )).rows[0].status,
    "archived",
  );
  assert.equal(
    (await db.query(
      "SELECT count(*)::int n FROM growth_power_team_publications WHERE status='active'",
    )).rows[0].n,
    1,
  );
  await db.exec("SET ROLE anon");
  await assert.rejects(() => consentOnly());
  await assert.rejects(() => save());
  await assert.rejects(() => create(id(11)));
  await assert.rejects(() => respond(a));
  await db.exec("RESET ROLE");
  await db.exec("SET ROLE authenticated");
  await assert.rejects(() => consentOnly());
  await assert.rejects(() => save());
  await assert.rejects(() => create(id(11)));
  await assert.rejects(() => respond(a));
  await db.exec("RESET ROLE");
  console.log(
    "PASS PostgreSQL: scope, atomic plan/consent/goal/audit, stale conflict, replay, rollback, invitations, publication and immutable version history",
  );
} finally {
  await db.close();
}

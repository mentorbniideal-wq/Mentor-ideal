# Power Team / Blueprint implementation — 6 November 2026

## Delivery state

Implemented in the isolated worktree
`/Users/tfenice/bni-mentor-system-power-team-readiness`, branch
`feature/power-team-blueprint-readiness`, based on delivered revision `450b8f9`.
The original IDE worktree and its pending score-import/other changes were not
overwritten. Pete approved commit/push, the targeted additive migration and
Production deployment after checks on 6 November 2026. Code revision
`3abb4a40237d5a22762f5207530e47ed10ce0f08` is on `origin/main` and deployed.
No consent
backfill, real team creation, member test write or LINE send is authorized.

## Operator workflow

1. Members open their personal Blueprint and use **ตั้งค่าหรือถอนการแชร์ให้
   Growth**. Three optional annual choices cover categories, free text and
   profession/company, independently from MY121 partner preferences. **บันทึก
   เฉพาะการแชร์** works even when worksheet data is incomplete and never changes
   goals. Numeric goal/status staff access remains the pre-existing policy.
2. Desktop Power Team Hub shows submitted coverage separately from shareable
   categories. Normalized category overlap is a hypothesis, not a verified
   common market. It never silently assigns Mentor ownership or reports results.
3. Coordinator chooses a candidate or **สร้างข้อเสนอเอง**, specifies customer
   group/evidence, selects at least two active Chapter members, and optionally
   chooses a coordinating member from that selection. This grants no staff role.
4. Coordinator assigns an eligible Growth owner and updates the Proposal using
   native form dialogs. Expired, not-yet-active or read-only owners are rejected.
5. Members open **MY121 → Power Team ของฉัน** and accept or decline their own
   invitation. Invitations are displayed in LIFF; no LINE push is sent. Someone
   must tell the pilot members where to open them; do not claim delivery.
6. Admin with a real OAuth identity publishes an `active` Proposal only after
   every selected member accepted. The database independently enforces scope,
   active membership and acceptance. Historic pre-candidate proposals remain
   subject to their existing publication policy; review them before reuse.
7. To change a team, Admin creates a revised Proposal from the current official
   team, adjusts the selection/market/coordinator, obtains new responses, and
   publishes. The old publication is archived atomically when the new version
   succeeds; original membership and audit history are not rewritten.

## Data and security changes

- Additive migration `20261106000001_blueprint_growth_safety.sql` introduces
  service-only annual Blueprint Growth choices, a protected request ledger,
  Proposal year/coordinating-member/version links, invitation response fields,
  transactional write RPCs and publication guards. No existing sharing choices
  are inferred, migrated or granted automatically.
- Expect Growth's new annual sharing coverage initially to be zero after this
  migration, even where MY121 sharing was previously enabled. Existing Blueprint
  submissions and numerical goals stay intact. Explain the purpose change to
  members, and ask them to choose explicitly; do not run an automatic backfill.
- Plan/goal/permission/audit writes are atomic. Permission-only saves have their
  own transaction and replay identity. Stale plan AND stale permission versions
  are rejected, including two-tab saves after another tab revoked sharing.
- Proposal creation, link creation and audit are atomic with per-request replay
  protection. Assignment/status changes have row locks, expected versions,
  temporal eligibility checks and audit. Publication/archive use existing
  immutable history and database audit triggers.
- Legacy Power Team reads/writes return authenticated HTTP 410. Their unsafe
  global Mentor-team grouping, name-based goal/amount updates, member archiving
  and Mentor-team moves were removed from the handler. Old data is retained.
  The legacy Mobile candidate overview is read-only and labelled as hypotheses,
  not official teams or revenue caused by a Power Team.
- Growth Blueprint lists, historical comparisons, monthly calendar, matching,
  category demand, Growth workspace and proposal/publication DTOs apply annual
  Blueprint permissions. Business fields require separate business permission.
  Other MY121/private task sharing policies are not reinterpreted as Blueprint
  permission. Member category suggestions now use configuration taxonomy, not
  private cross-Chapter plan demand or fabricated popularity counts.
- Draft storage uses an opaque server-generated member/year scope, never a raw
  access token or a year-only key. Unowned legacy year-only drafts are not
  silently loaded, reassigned or deleted.
- Client dialogs escape displayed text, retain input after failed saves and
  preserve logical request IDs on retry. Changed content gets a new identity.
  Hub entry revalidates Chapter/permission data and ignores stale load responses.

## Verification

- Backend Deno suite: 296 tests / 18 steps passed before final delivery checks.
- API and LIFF entrypoint `deno check` passed. JavaScript syntax and
  `git diff --check` passed.
- Exact migration tested in isolated PGlite using synthetic identities: active
  Chapter isolation; plan/consent/goal/audit rollback; stale writes; replay and
  request-content conflict; owner expiry; coordinating member selection;
  invitation ownership/idempotence; acceptance-before-publication; immutable
  revisions; service-only RPC execution, including anon/authenticated denial.
- Read-only Production schema inspection confirmed the relevant existing
  Blueprint/Proposal/role columns. Four active Growth account records have
  Chapter scope and none of the active Growth records lack it; this is not an
  OAuth sign-in or temporal-eligibility acceptance test.
- Browser fixtures: annual consent defaults, permission-only save with an
  incomplete worksheet, member/year draft isolation, ignored unowned legacy
  draft, Proposal form at 375/768/1440px, Escape/focus return, retry identity,
  escaped member invitation display and self-response payload.
- Existing Power Team Hub, Growth Mobile, current-year Blueprint, Member 360,
  Rich Menu entry and Desktop six-width/two-theme regressions passed.
- These are synthetic/source/browser checks, not signed-in Production OAuth,
  LINE identity or phone delivery acceptance. No live member was used as a test.

Run from this worktree:

```sh
MY_IDEAL_ENV=local PUBLIC_APP_URL=http://localhost:3000 SUPABASE_URL=http://localhost:54321 deno test --node-modules-dir=none --allow-read --allow-env --allow-net supabase/functions/_shared supabase/functions/api
deno check --node-modules-dir=none supabase/functions/api/index.ts supabase/functions/liff-api/index.ts
node scripts/test-blueprint-power-team-db.mjs
node scripts/test-blueprint-power-team-ui.mjs
```

PGlite and Playwright are optional test dependencies; `PGLITE_MODULE` and
`PLAYWRIGHT_MODULE` can point to external installations. They are not new browser
runtime dependencies and no package secrets belong in the repository.

## Controlled rollout and rollback

### Verified Production rollout

- Only migration `20261106000001` was applied in an explicit transaction and
  recorded once in migration history. New tables have RLS enabled; direct
  anon/authenticated table access and write RPC execution are denied.
- API version 331 and LIFF API version 75 are ACTIVE. Other functions were not
  deployed. Downloaded pre-rollout API/LIFF source matched base `450b8f9`;
  separate rollback backups are under `/tmp/bni-power-team-rollout.cVKZ7K/`.
- Vercel Git integration deployed code `3abb4a4`, deployment
  `dpl_Anjj5EAJ5RpHDc9hCqKa9FnDrrz3`, Ready on the Production alias.
  Direct CLI deployment returned Not authorized; this was not treated as
  success. The Git-created deployment was independently inspected.
- Dashboard, Blueprint form, Proposal builder, Hub, Mobile operations, LIFF
  index and member Power Team script each returned HTTP 200 and SHA-256 matched
  local source. Runtime configuration identified Production, the correct
  Supabase project and full code revision `3abb4a4`.
- Invalid staff credential, invalid private Blueprint token and both LIFF
  invitation read/response calls without LINE identity returned HTTP 401.
  These do not prove positive-account acceptance.
- After migration: consent rows 0, request ledger rows 0, proposals 0 and
  official publications 0. No automatic sharing grants, real team writes or
  LINE sends were made by this rollout.
- Final backend rerun: 296 tests / 18 steps passed; entrypoints typechecked.
  Final exact SQL and browser regression reruns passed, including stale draft
  consent not overriding the latest server choices.

Next acceptance: Pete opens Desktop Power Team Hub with the intended Admin/
Growth account; consenting pilot members explicitly choose sharing in Blueprint
and open MY121 -> Power Team ของฉัน. Verify own invitation response and
Admin publication with real authorized pilot records, not fabricated members.

Production rollout approval was received. Before rollout, compare the latest
deployed API/LIFF/static source with this base and preserve any newer changes.
Apply only this additive migration transaction, then deploy `api`, `liff-api`
and static assets. Do not apply unrelated pending migrations or rewrite history.
Retest service-only table/function ACLs, invalid authentication and static source
hashes; use a designated consenting pilot group for positive-account acceptance.

Rollback code to the preceding release if acceptance fails. Keep additive
schema, consent decisions, request records and publication/audit history; do not
drop tables or reset member data. A rollback to older Growth readers may not
honour the new independent permissions: disable those readers until a compatible
rollback projection is deployed. Never silently roll privacy back.

## Intentionally not activated

- No automatic team creation, inferred member acceptance or consent grants.
- No LINE broadcast/invitation push or Rich Menu reassignment.
- No verified referral/revenue result inferred from category overlap or team
  publication; existing MY121 and outcome workflows remain authoritative.
- No multi-Chapter LINE Token/Secret migration or scoring/KPI definition changes.
- The new sharing form manages the configured planning year. Historical annual
  permission self-service beyond that year requires an explicit follow-up UI;
  a future-year rollout must include that before retiring old member entry links.

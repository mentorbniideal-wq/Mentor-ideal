# Member Pulse — Phase 1A foundation (candidate only)

Member Pulse is a support signal, never a member score or ranking. The desired
loop is detect → ask → understand → help → measure again. The foundation commit
contains a dormant schema candidate and pure scheduling decision. The following
member-form candidate adds an authenticated LIFF page and own-response endpoint.
The staff candidate adds a metadata-only Member Pulse tab under existing Member
Growth on Desktop and Mobile. It still does not create campaigns, expose answers
to staff, send LINE, or alter Production.

## Existing system reused

| Need | Existing source |
| --- | --- |
| Member identity, join date | `members.id`, `members.joined_date` |
| Expiry and renewal state | `renewals.expiry_date`, renewal workflow |
| Chapter scope | `resolveChapterScope` and `members.chapter_id` |
| Growth follow-up | `growth_tasks` and `member_signals` |
| Member authentication | LIFF access token → `liff-api` → `line_members` |
| LINE delivery | Existing LINE delivery guard and ledger; not invoked in 1A |
| Audit metadata | `chapter_audit_events`; never store survey free text there |

## Phase 1A contract

- `decideMemberPulse` takes a Chapter-approved policy and Chapter-local date. It
  returns a due/suppressed decision only; no write and no automatic send.
- Lifecycle milestones are *policy data*, not hardcoded product thresholds.
  The tests illustrate 3/6/12 months and annual experience, but no policy row
  or survey template is seeded by the migration.
- Renewal has priority when it overlaps a lifecycle milestone. A matching
  campaign cycle key or a recent send suppresses duplicates.
- `member_pulse_templates` locks historical question versions. Campaigns refer
  to the exact template and member/Chapter; answers are stored separately under
  service-only access. The migration has no token or delivery table yet.
- A missing date or missing/disabled policy produces no campaign. A completed
  milestone is not inferred from membership age or other activity.

## Before Phase 1B / any deployment

1. Pete approves the actual Chapter cadence, cooldown, due-soon window, and
   whether a renewal pulse replaces a nearby lifecycle pulse.
2. Pete approves the precise free-text visibility policy. Safe default proposal:
   member sees own answers; Growth Coordinator and Chapter Admin see individual
   answers; ordinary Growth and Mentor see only explicit shareable follow-up
   status until additional consent is designed. Confidential leadership feedback
   is deferred.
3. The LIFF member-submit contract and metadata-only Desktop/Mobile Pulse views
   are implemented but need signed-in Staging acceptance. Build consent-aware
   Member Health read only after its visibility decision. No public token link
   until Phase 2 threat review.
4. Validate this migration against isolated Staging schema and synthetic Chapter
   fixtures, including RLS, foreign-key guards, immutable templates, and
   rollback by leaving dormant tables in place. Do not delete response history.
5. No LINE send, automatic reminder, bulk send, AI classification, or historical
   Happiness Survey import is part of Phase 1A.

## Member-form candidate contract

- Existing LINE access-token verification resolves the member and Chapter on the
  server. Browser-supplied member and Chapter IDs are ignored. Only the latest
  assigned campaign in that Chapter is returned to that member.
- Policy must be enabled and the campaign's exact versioned template must be
  active to accept a submission. A template question has `id`, `label`,
  `type` (`scale` 1–10, `choice`, or `text` up to 1,000 characters), optional
  `required`, and `options` for `choice`. Unknown answer keys are rejected.
- A repeat submission cannot overwrite a completed answer. The member can read
  only their own answer. There is deliberately no staff endpoint for answers
  until Pete approves a per-question visibility/consent rule.
- Growth staff get only campaign stage, due date, status, completion timestamp,
  and a Chapter-scoped member label through `getMemberPulseBoard`. They cannot
  read question text, ratings, or free-text answers from this API.
- LIFF Staging testing requires isolated LINE channel/LIFF configuration and a
  synthetic linked test member; existing Staging checklist currently defers
  real LIFF. Do not connect Production LINE or real members to Staging.
- The CLI in this worktree is presently linked to Production Supabase. Never
  run `db push` or apply a migration from this state. Re-link and verify the
  exact Staging project before any Staging-only migration.

## Deployment order after acceptance

Staging backup → additive migration → policy/template configuration (disabled)
→ API/member UI → signed-in Chapter/role/consent acceptance → controlled enable.
If UI/API must roll back after migration, leave empty/new tables in place and
keep policy disabled. Historical responses must never be destructively rolled
back.

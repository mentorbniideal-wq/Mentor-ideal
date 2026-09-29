# Member Pulse — Phase 1A foundation (candidate only)

Member Pulse is a support signal, never a member score or ranking. The desired
loop is detect → ask → understand → help → measure again. This commit contains
only a dormant schema candidate and a pure scheduling decision with tests. It
does not create campaigns, expose responses, send LINE, or alter Production.

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
3. Build server-authorized Member Health read and LIFF member-submit contracts,
   then Desktop/Mobile states. No public token link until Phase 2 threat review.
4. Validate this migration against isolated Staging schema and synthetic Chapter
   fixtures, including RLS, foreign-key guards, immutable templates, and
   rollback by leaving dormant tables in place. Do not delete response history.
5. No LINE send, automatic reminder, bulk send, AI classification, or historical
   Happiness Survey import is part of Phase 1A.

## Deployment order after acceptance

Staging backup → additive migration → policy/template configuration (disabled)
→ API/member UI → signed-in Chapter/role/consent acceptance → controlled enable.
If UI/API must roll back after migration, leave empty/new tables in place and
keep policy disabled. Historical responses must never be destructively rolled
back.

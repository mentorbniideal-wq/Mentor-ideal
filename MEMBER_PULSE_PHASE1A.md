# Member Pulse — candidate architecture and Phase 1B

Member Pulse is a support signal, not a score or member ranking. This branch
contains the dormant Phase 1A schema plus a Phase 1B implementation candidate.
Production is not deployed or migrated by this work.

## Approved cadence and safeguards

- Onboarding at month 3; Activation at month 6; Member Experience at month 12,
  then every 6 months. Renewal is due 90 days before expiry and outranks all
  lifecycle/recurring candidates. Cooldown is 60 days. Lower-priority eligible
  pulses are suppressed while a higher-priority campaign is actionable.
- Delivery is human initiated: the due scan creates due records only. An
  authorized Growth user previews then presses Send. There is no automatic
  initial-send scheduler.
- Reminders are limited to Day 3 and Day 7 (two total), only while incomplete;
  no third reminder. Reminder delivery reuses existing LINE delivery guard,
  idempotency, and ledger. Bearer tokens are hashed at rest and redacted from
  delivery previews/log payloads.
- A higher-priority Renewal Due replaces only an unsent lower-priority Due;
  the old campaign is retained as `superseded` for audit. A send is denied if
  another actionable campaign remains for the same member. If Day 3 was
  missed entirely, the system does not mislabel a first reminder as Day 7's
  second reminder or send a late duplicate.
- Policies are disabled by default. Staging delivery remains governed by
  `LINE_DELIVERY_ENABLED` and the existing environment safety guard.
- Template visibility is one of `member`, `mentor_growth`, or
  `leadership_only`. API history authorization is server-side; a scope grants
  visibility only to the member, an authorized Mentor/Growth viewer, or an
  authorized Chapter leader respectively. RLS keeps answer/token tables
  inaccessible to browser roles; the service API must enforce viewer scope.

## Existing system reused

| Need | Existing source |
| --- | --- |
| Member and joined date | `members.id`, `members.joined_date` |
| Renewal expiry | `renewals.expiry_date` |
| Chapter scope | `resolveChapterScope`, `members.chapter_id` |
| Growth authorization | server role/capability resolution |
| Mentor scope | persisted Mentor assignment/team scope |
| Member authentication | existing server auth/session; Pulse link is an opaque bearer token |
| LINE delivery | `linePush`, delivery governance guard, idempotency and ledger |
| Audit | `chapter_audit_events`; never put answer/free-text content there |

## Phase 1B implementation contract

- `createMemberPulseDue` is an explicit, authorized due scan. It never sends.
  It uses the approved cadence and idempotency/cooldown rules to create due
  campaigns. No policy/template is seeded; activation requires an explicit
  authorized configuration action.
- Growth dashboard groups Due Now, Due This Week, Waiting, Completed,
  Overdue, and upcoming records. Preview is read-only. Send and Remind require
  server capabilities and successful delivery-guard/idempotency checks.
- Member access uses a random opaque token, stored only as SHA-256; token,
  expiry, campaign/member linkage, chapter, and status are checked on every
  request. A member can only access their own campaign through the issued token.
  Partial answers may be saved; submit validates required questions and closes
  the response. Expired/completed/revoked tokens fail closed.
- Staff history is Chapter-scoped. Mentor history additionally requires the
  member to be in the viewer's persisted Mentor assignment scope. Each answer
  is projected only when that question's visibility scope authorizes the
  viewer. Client-side filtering is not authorization.
- Member UI is `/pulse/`; Growth Desktop composition is in
  `public/assets/js/member-growth-cycle.js` under Member Growth.
- The reminder job is implemented in the existing `cron-jobs` function but is
  not scheduled/enabled by this change. The due scan currently requires an
  authorized explicit request; a safe recurring due-detection schedule remains
  an operational follow-up. Neither job automatically sends an initial Pulse.

## Migration / rollout

Migrations are additive and leave Pulse disabled. Staging currently has older
pending Growth migrations in addition to the Pulse foundation and Phase 1B
migrations. Applying the candidate migration chain may therefore apply all
four pending migrations; verify the linked project ref and dry-run output first.
After the initial Staging application, additive migration
`20260929000004_member_pulse_superseded_due.sql` adds the `superseded` status
needed for priority replacement; it does not enable a policy or delivery.
No Production project, migration, environment, role, consent, or LINE setting
may be changed. Keep new tables if rolling back application code; do not delete
responses or rewrite deployed migrations.

Before broader enablement, use synthetic Staging members and signed-in accounts
to test Growth, Mentor assignment scope, unauthorized members, Chapter
isolation, direct API access, expired/tampered tokens, revoked sessions, and
another member's campaign. Test actual LINE delivery only with Staging-safe
delivery disabled or an approved test destination; never target Production
members from Staging.

## Phase 1B remaining acceptance gates

- Signed-in Staging OAuth acceptance for member, Growth, Mentor, and leadership
  scopes, including cross-Chapter and revoked-session denial.
- Browser acceptance for `/pulse/`, Member Detail, Growth Desktop and Mobile.
- Confirm manual due scan is operationally sufficient or separately approve a
  scheduled detection job. Automatic sending is explicitly out of scope.
- Confirm templates and question scopes using synthetic data before enabling a
  Chapter policy. No Production enablement is included in Phase 1B.

# Member Growth Cycle — candidate integration

Status: code-only candidate. No Production migration, API deployment, frontend deployment, role assignment, or member data change has been made for this feature.

## Existing sources retained

- `members` is the only member identity source; `renewals.expiry_date` is the current cycle anchor. `membership_start_date` is the original join date, not automatically the current cycle start. Month 1 is derived as expiry minus 11 calendar months with end-of-month clamping. A missing expiry produces an explicit unavailable state.
- Member Success Blueprint remains the current goal/category source. Growth Desktop reads it through the already consent-projected `getGrowthMemberContext`; it is not copied into cycle rows. The reported actual and achievement percentage are shown only with current business-sharing consent and a positive target.
- `growth_tasks`, `power_team_proposals`, verified `matching_pairs`, and `member_signals` remain their workflow sources. The new cycle only stores validated references. A MY121 booking or Task closure never becomes a referral or business result automatically.
- Month 9 creates a `member_signals` renewal handoff addressed to Membership Committee with one idempotency key per member/expiry. Its existing signal status supplies acknowledgment progress; no competing handoff queue is introduced.

## New schema and API

Migration `20260928000002_member_growth_cycle.sql` adds `member_growth_cycles`, `member_growth_entries`, and append-only `member_growth_notes`. Unique keys prevent duplicate cycles/month entries; triggers reject cross-Chapter/member Task, Proposal, MY121, and handoff links. Entry/note writes record a Chapter audit event without copying free text into the audit metadata. All new tables deny direct `anon`/`authenticated` access.

The API handler `member-growth.ts` provides `getMemberGrowthBoard`, `getMemberGrowthTimeline`, `saveMemberGrowthEntry`, `appendMemberGrowthNote`, `linkMemberGrowthTask`, `linkMemberGrowthMy121`, and `createMemberGrowthRenewalHandoff`. Reads require an existing Access-authorized OAuth email, derive Chapter from authentication, and return only current-consent-approved prose; legacy PIN cannot access this new module. Writes require that verified email plus existing `growth.coordinate` capability (or Admin), and are blocked for read-only/viewer sessions. No new capability or Production assignment is needed.

Month 3 is shown only for `members.is_new_member`, with Mentor as owner. A persisted `ninety_day_reviews` record in the same cycle supplies only a completion/date indicator; `content`, Mentor notes and coaching never leave the Mentor boundary. Month 12 shows the Membership workflow status and is not editable by Growth. These milestones do not infer completion from missing Mentor/Committee evidence. General monthly check-ins are optional. Prior cycles remain readable but not editable through the current-cycle writer.

## Deployment order and rollback

Production has an outstanding `20260920000001_mentor_growth_operational_links.sql` migration in local history while the live schema is missing its columns/tables. Reconcile and test that prerequisite separately before applying either `20260928000001_growth_power_team_publications.sql` or this migration. Do **not** use an unreviewed `supabase db push --include-all` against Production.

After backup/schema verification and migration rehearsal: apply prerequisite migrations in reviewed order, verify constraints/table grants, deploy the API, then frontend. Use only existing named OAuth accounts in Access; check that Coordinator accounts already carry `growth.coordinate`. Do not create accounts or grant broader roles for this feature. Complete signed-in Growth Coordinator, Growth Member, Mentor-private, consent-revoke, Chapter isolation, Desktop/Mobile, and Membership Committee handoff acceptance before widening access.

If API/frontend must roll back, leave additive tables and historical notes intact; roll back code/capability assignment, not member history. Do not delete historical cycle rows or rewrite notes. Migration execution and signed-in browser acceptance are **NOT TESTED** for this candidate.

## Intentional limitations

- There is no new automatic case creation from Traffic Light, MY121, or Blueprint. A Coordinator creates/owns an existing Growth Task and may link it to a cycle Month; no parallel task list is created.
- A verified MY121 can be linked, but the link itself is not a verified referral or revenue outcome.
- The overview shows only operational counts that have an authoritative source. It does not invent Mentor support need, missing goal evidence, or a member's business category when consent/data are insufficient.

# BNI IDEAL 1-2-1 System — Architecture and Rollout

## Workflow hardening — 2026-08-24

Migration `20260824000063_one_to_one_workflow_hardening.sql` links Reflection-derived Follow-up and Mentor Attention records back to their source Feedback, so editing a Reflection updates the existing work item instead of creating duplicates. Guided Commitments carry their source Session, Referral Trigger writes accept an idempotent client action ID, and `biz_profiles.looking_for` is the canonical fallback when a weekly import has no current value.

Pilot controls are now explicit: Chapter Rollout controls notification eligibility, Access Gate optionally limits MY121 to selected Pilot Members, and Emergency Stop blocks member writes while preserving read-only access. Access Gate defaults off to avoid locking out existing Production users during migration.

MC Member History and Mentor Mobile Journey include Guided mode, duration, shared content, approved Referral Triggers, and Introduction Scripts. Private Guided Notes are never returned. Members can approve or archive Referral Triggers that belong to them. Legacy `one_to_one_logs` are included in the member Journey totals.

Offline behavior remains intentionally bounded: Shared Guided content, Private Notes, and Referral Trigger drafts can recover/sync after connectivity returns. Completion, Digital Handshake, Profile confirmation, and Reflection still require a live server response because they create verified or permission-sensitive records. Realtime presence remains deferred; optimistic version conflict remains the safe multi-device behavior.

## Guided 1-2-1 Session — 2026-08-23

Guided Session extends the existing `matching_pairs` workflow; it does not replace Pair Matching, Digital Handshake, Reflection, Follow-up, LINE notification control, or status history.

- UI: `public/liff/index.html` inside MY121, using the existing LIFF identity.
- API: `supabase/functions/liff-api/index.ts`; every action reuses `ownPair()` authorization.
- Shared rules/tests: `supabase/functions/_shared/guided-one-to-one.ts` and `_test.ts`.
- Migration: `20260823000061_guided_one_to_one_sessions.sql` adds one idempotent session per pair, owner-only private notes, relational referral triggers, and owner-confirmed profile drafts.
- Commitments reuse `one_to_one_follow_up_actions`; completion reuses `one_to_one_status_events`; Close opens the existing Handshake and Reflection.
- Guided actions do not send LINE push messages.

Shared content never stores private notes, private Mentor feedback, or handshake codes. Profile changes are drafts until the owning member confirms them. Auto-save uses optimistic `version`; offline data remains local until sync and the server remains the source of truth.

Same-device conversation and secure multi-device resume are supported. Realtime presence/cursors are intentionally deferred until participant-scoped Realtime authorization and merge behavior are tested; the schema already carries version, current speaker, and timestamps for that future phase.

### Guided deploy and rollback

1. Apply migration `20260823000061_guided_one_to_one_sessions.sql`.
2. Deploy `liff-api`, then deploy static web.
3. Pilot with one pair and verify repeated taps resume the same Session.

No new environment variable is required. For rollback, remove the web entry/API handlers first and retain the additive Guided tables so history is not lost. Drop the four new tables in dependency order only after an approved export; no existing 1-2-1 table was destructively changed.

### Guided manual QA

- iPhone/Android 390×844 and iPad 1024×768: seven steps, Thai wrapping, sticky navigation, 48px targets, Notes sheet, keyboard and reduced motion.
- A/B can open and resume; unrelated members/guessed IDs get 403; repeated entry creates one Session.
- Refresh restores the current step; a stale second device gets `VERSION_CONFLICT` rather than overwriting.
- Shared notes are pair-visible, Private Notes remain owner-only, and Profile updates require the owner.
- Discover/Deepen recommendation follows completed relationship history; Referral Focus remains selectable.
- Completion requires a Commitment (including explicit no-action), creates Follow-up once, and proceeds to existing Handshake/Reflection.
- Verify loading, missing pair, denied, cancelled, completed, offline, save error, history incomplete and Handshake-not-ready states.
- Confirm no Guided action writes LINE delivery/notification records.

## Architecture before and after

Before: MC Desktop imported check-in CSV into `matching_rounds` / `matching_import_rows`, generated `matching_pairs`, and sent through the shared LINE delivery ledger. Odd pools became a group of three. Historical 1-2-1 notes were stored separately in `one_to_one_logs`.

After: the same import, members, authentication, LINE sender, delivery ledger, and MC Desktop are reused. Version 2 rounds add eligibility and a fair waiting list, enforce exactly two members per new pair in both application code and PostgreSQL, and provide relational foundations for schedules, verification, feedback, follow-up, attention, event history, contact preferences, and notification budgets. Legacy trios remain readable as `Legacy Group`.

## Data and permissions

- All new operational tables enable RLS and revoke direct `anon` / `authenticated` access. The existing authenticated Edge API/service-role pattern remains the authorization boundary.
- `round_eligibility` separates attendees, absent opt-ins, owner opt-ins, and manual inclusion.
- `pairing_waitlist.priority_points` carries fairness forward. Waiting caused by an odd pool is explicitly not an attention signal.
- `one_to_one_feedback` separates respondent, subject, and `shared` / `private_mentor` visibility.
- Verification stores only hashes, attempt counts, expiry, and lock state. Plain codes must only exist transiently in the future LINE/LIFF enrollment flow.
- Timestamps are stored as `TIMESTAMPTZ` (UTC) and displayed using `Asia/Bangkok`.

## Notification rules

No second delivery engine is introduced. The existing `linePush` + `line_message_deliveries` idempotency ledger remains central, with a shared notification guard in front of 1-2-1 sends. Budget configuration starts at global 15,000/month and 1-2-1 hard cap 3,000/month, with one proactive message/day, three reminders/week, cooldown, duplicate prevention, member mute/snooze, and quiet hours 20:00–08:00. Suppressed sends are logged once with an explainable reason. Real sends still require preview and explicit confirmation; development and pilot default to dry-run.

## Rollout

1. Apply migrations `20260822000057_one_to_one_system.sql` through `20260822000059_notification_orchestrator_and_pilot.sql`.
2. Deploy Edge API and static dashboard with `FEATURE_ONE_TO_ONE_SYSTEM=false`.
3. Use a new round with dry-run only and verify that odd attendance creates one waiting-list row and no trio.
4. Pilot with test users. Do not send to the whole chapter.
5. Enable the feature setting only after import, pairing, permission, and delivery QA.

## Manual QA checklist

- Import CSV with UTF-8 BOM, duplicate member, substitute, missing member, and missing LINE.
- Generate even and odd pools; confirm every version 2 pair has two people and odd member is shown in Waiting List.
- Regenerate; confirm a member with carry priority is not selected to wait again when alternatives exist.
- Lock and swap pairs; verify locked pairs remain unchanged and repeat/forbidden constraints still apply.
- Preview and test-send; confirm dry-run makes no provider call and real send requires confirmation.
- Open legacy round containing a trio; confirm it displays `Legacy Group` and remains unchanged.
- Verify Overview counts and all 1-2-1 navigation items on desktop and narrow screens.
- Confirm members cannot read private feedback or attention tables directly.

## Deployment and rollback

Deploy in order: database migration, Edge API, then Vercel static site. The migration is additive. To roll back application behavior, disable `FEATURE_ONE_TO_ONE_SYSTEM` and deploy the previous API/UI; do not drop the new tables. Version 1 history continues to work. If a pilot round must be abandoned, leave it archived/draft for audit rather than deleting history.

## Environment variables

Add `ONE_TO_ONE_CODE_PEPPER` as a long random Edge Function secret. It is used with Pair ID and Member ID when hashing Digital Handshake codes and must not be stored in the database or frontend. Existing Supabase URL/service role and LINE channel credentials remain in Edge Function secrets.

## Implemented member workflow

The existing LIFF Action Center now resolves the signed-in LINE member server-side and only returns pairs containing that member. It supports two-party schedule confirmation, reschedule/cancel events, Google Calendar and `.ics` payloads, Digital Handshake initialization and partner-code verification, Shared Reflection, Private Mentor Feedback, and automatic Follow-up/Attention creation. Verification accepts codes only after the member explicitly starts the flow, limits failures to five attempts, locks for 15 minutes, checks expiry, and stores no plaintext code.

The MY121 experience now also offers 2–3 schedule choices, LINE Share Target Picker contact copy, Referral Opportunity preparation, and a personal relationship journey summary. Schedule proposals, confirmations, and Digital Handshake starts notify the partner through the unified LINE sender with idempotency protection. Choosing “คุยกับ Mentor” creates an Attention item containing the request context, an in-app notification visible to MC and the member's Mentor team, and a deduplicated LINE alert to both the resolved team Mentor and MC.

Rich Menu contract v13 deep-links every personal action directly into the matching LIFF view (`progress`, `121`, `absence`, `goal`, and `issue`) for Member, Mentor, MC, and Growth aliases. Re-run LINE provisioning after deploying v13 so existing per-user menu assignments are replaced as well as the default menu.

## Mentor Mobile 1-2-1 Care

Mentor Mobile includes a team-scoped `1-2-1 Care` workspace under Work. It combines private Mentor requests, active/stalled pairs, pending follow-ups, Referral Opportunities, Team Pulse metrics, and per-member Journey timelines. Mentor actions include acknowledge, snooze, resolve, escalate to MC, send a member reminder, and reissue a verification code. Resolution and escalation automatically create Mentor Log and status-event evidence. Weekly team summaries are copy-ready for LINE/MC reporting.

All Mentor Mobile reads and writes use the dedicated `mentor-121` API handler. Team scope is resolved from the authenticated role on the server; client-supplied team names are never trusted. Mentor roles cannot access matching, templates, chapter sends, pilot settings, budgets, or another team's private feedback.

MC Desktop queue views now load real Active 1-2-1, Waiting List, Follow-up, and Needs Attention data. Completing a follow-up or overriding/resolving an attention item is handled by the authenticated API and creates an event audit record.

The full Member Profile now includes a 1-2-1 History tab with completion KPIs, partner relationship history, round history, schedules, feedback, next actions, waiting-list records, attention items, and readable legacy groups. MC Desktop also includes Pilot Control and Message Control: MC can select pilot members, keep the global feature disabled while piloting, trigger an emergency stop, and inspect monthly usage, forecast, failures, top recipients, and suppression reasons.

Each draft round stores its selected LINE message template. MC can choose from five standard styles—Business Opportunity, Warm Connection, Referral Focus, Story & Trust, and Quick Action—then inspect the recipient-specific dry-run before confirming a send. Pair cards also provide a direct business-profile editor. Matching and copy resolve business context from `biz_profiles.description`, then fall back to `members.profession` and `members.company_name`; the latter two fields are populated by the Chapter Roster PDF sync, not by the weekly Check-in CSV.

For two-person pilots, MC can create a locked manual round without a Check-in CSV: select two distinct active members with linked LINE accounts, choose the start date and message template, then continue through the same dry-run, guarded test send, scheduling, handshake, feedback, and follow-up workflow.

## Known limitations and next increments

- A dedicated Outlook Calendar deep link is not implemented yet; Google Calendar and standards-based `.ics` are available through the authenticated member route.
- The LIFF UI exposes the primary schedule, handshake, and reflection paths. More polished datetime picker, contact preference editor, and full relationship timeline remain future increments.
- The shared notification guard is active for 1-2-1 round sends. Existing non-1-2-1 cron modules still need staged adoption before every LINE notification is governed by the same caps.
- Future work: Smart Referral Matching, mentor-assisted late opt-in pairing, Outlook deep links, richer completion insights, and retention automation for private feedback.

## Member Relationship Follow-up

MY121 now aggregates member-owned Follow-up actions across all pairs, supports due-date changes and a closed set of completion outcomes, and writes an audit status event for every member update. A member may see shared work related to a pair but may only change actions where they are the owner.

Relationship Profile is derived from existing Pair History, approved Referral Triggers, Shared Reflection, business profile, and Follow-up records. It does not create a second relationship-history store. The “คุยต่อครั้งหน้า” helper is copy-only and does not send a LINE push.

`member_referral_trigger_bookmarks` stores only a member-owned pointer to an existing active, owner-approved Trigger. The API verifies that the Trigger belongs to one of the member's pairs before adding or removing a bookmark. Direct client access is revoked and RLS remains enabled.

Deployment order for this increment is migration `20260824000064_member_referral_trigger_bookmarks.sql`, `liff-api`, then the static LIFF page. Application rollback is to deploy the prior API/UI; keep the additive bookmark table for audit and compatibility. If a database rollback is explicitly required, export the bookmark rows first, then drop only `member_referral_trigger_bookmarks`—never drop Trigger, Pair, Feedback, or Follow-up tables.

## Pre-meeting 1-2-1 Profile

MY121 provides a member-owned reusable profile containing a Business Snapshot, Referral/LCD Focus and GAINS. Basic identity stays in `members`, canonical short business fields stay in `biz_profiles`, and only the additional conversation fields live in `member_one_to_one_profiles`. Members can update their own profile at any time. Section-level visibility is enforced by the server before a partner receives data; Networks defaults to hidden.

Only a verified participant in the existing Pair may open the partner profile or use `one_to_one_premeeting_questions`. Each member can keep at most ten active questions per pair. Questions are available in Guided Session without generating an automatic LINE push. The question audit events contain IDs and state only, not question or answer text.

While a Guided Session remains an unstarted draft, `one_to_one_profile_snapshots` is refreshed from the owner's shareable projection. Once the Session starts, the snapshot is no longer replaced, preserving the profile context used for that historical conversation. Private/hidden GAINS fields, contact details, verification codes and Mentor feedback are never copied into the snapshot.

Deploy migration `20260824000065_member_one_to_one_profiles.sql` before `liff-api` and the static LIFF page. For application rollback, deploy the prior API/UI and keep the additive tables. A database rollback, if explicitly required after exporting data, must drop only `one_to_one_profile_snapshots`, `one_to_one_premeeting_questions`, and `member_one_to_one_profiles` in that dependency order.

## MY121 Information Architecture

The LIFF `action=121` route is a MY121 hub with five focused subpages: Current Pair (default), My Profile, Prepare, History, and Next Actions. The current randomized pair remains the default entry point from the Rich Menu. History and follow-up data load only when the member opens those sections, reducing first-screen density and unnecessary API work.

Subpages use `section=profile|prepare|history|actions`; the pair page omits the parameter. Browser Back restores the previous MY121 section, and LIFF login preserves the requested section. Guided Session and profile editors remain full-screen focused tools. This change is UI-only: it adds no database object, workflow, notification, environment variable, or LINE push.

## Member Goal Coach

The LIFF Goal page reuses `v_member_dashboard` as the current score/PALMS source of truth, `line_goals` for member-owned short goals, and `line_notif_settings.notif_type = 'score'` for the existing Thursday score summary and monthly report. It does not create a second goal store or a new notification schedule.

Goal recommendations are guidance based on the current PALMS component gaps and official sustainable activity levels. Current values are labelled as cumulative round data, while goal units are explicitly weekly, monthly, or per round. Saving a goal never claims to recalculate the imported score immediately. Members may enable or mute the existing score summaries from the same page; existing cron idempotency, quota, and mute controls remain authoritative.

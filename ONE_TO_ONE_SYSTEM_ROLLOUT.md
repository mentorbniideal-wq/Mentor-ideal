# BNI IDEAL 1-2-1 System — Architecture and Rollout

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

MC Desktop queue views now load real Active 1-2-1, Waiting List, Follow-up, and Needs Attention data. Completing a follow-up or overriding/resolving an attention item is handled by the authenticated API and creates an event audit record.

The full Member Profile now includes a 1-2-1 History tab with completion KPIs, partner relationship history, round history, schedules, feedback, next actions, waiting-list records, attention items, and readable legacy groups. MC Desktop also includes Pilot Control and Message Control: MC can select pilot members, keep the global feature disabled while piloting, trigger an emergency stop, and inspect monthly usage, forecast, failures, top recipients, and suppression reasons.

Each draft round stores its selected LINE message template. MC can choose from five standard styles—Business Opportunity, Warm Connection, Referral Focus, Story & Trust, and Quick Action—then inspect the recipient-specific dry-run before confirming a send. Pair cards also provide a direct business-profile editor. Matching and copy resolve business context from `biz_profiles.description`, then fall back to `members.profession` and `members.company_name`; the latter two fields are populated by the Chapter Roster PDF sync, not by the weekly Check-in CSV.

For two-person pilots, MC can create a locked manual round without a Check-in CSV: select two distinct active members with linked LINE accounts, choose the start date and message template, then continue through the same dry-run, guarded test send, scheduling, handshake, feedback, and follow-up workflow.

## Known limitations and next increments

- A dedicated Outlook Calendar deep link is not implemented yet; Google Calendar and standards-based `.ics` are available through the authenticated member route.
- The LIFF UI exposes the primary schedule, handshake, and reflection paths. More polished datetime picker, contact preference editor, and full relationship timeline remain future increments.
- The shared notification guard is active for 1-2-1 round sends. Existing non-1-2-1 cron modules still need staged adoption before every LINE notification is governed by the same caps.
- Future work: Smart Referral Matching, mentor-assisted late opt-in pairing, Outlook deep links, richer completion insights, and retention automation for private feedback.

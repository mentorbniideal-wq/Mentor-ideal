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

No second notification engine is introduced. The existing `linePush` + `line_message_deliveries` idempotency ledger remains central. New budget configuration starts at global 15,000/month and 1-2-1 hard cap 3,000/month, with one proactive message/day, three reminders/week, 24-hour cooldown, and quiet hours 20:00–08:00. Pure policy tests cover quota thresholds. Real sends still require preview and explicit confirmation; development and pilot default to dry-run.

## Rollout

1. Apply migration `20260822000057_one_to_one_system.sql`.
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

MC Desktop queue views now load real Active 1-2-1, Waiting List, Follow-up, and Needs Attention data. Completing a follow-up or overriding/resolving an attention item is handled by the authenticated API and creates an event audit record.

## Known limitations and next increments

- Relationship-history in the full Member Profile and a dedicated Outlook Calendar deep link are not implemented yet; Google Calendar and standards-based `.ics` are available through the authenticated member route.
- The LIFF UI exposes the primary schedule, handshake, and reflection paths. More polished datetime picker, contact preference editor, and full relationship timeline remain future increments.
- Notification policy is implemented as a tested decision function, but all existing cron modules still need staged adoption of the shared budget decision before the global orchestrator is complete.
- Future work: Smart Referral Matching, mentor-assisted late opt-in pairing, Outlook deep links, richer completion insights, and retention automation for private feedback.

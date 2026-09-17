# Growth + Blueprint launch readiness — 18 September 2026

## Launch decision

Status: **Ready after the pending migration and Edge/Web deployment are applied.**

The launch must use Blueprint year 2027. Existing 2026 submissions and links
remain historical records and are not rewritten.

## Verified before launch

- 58 active members are Chapter-scoped and all 58 have a linked LINE identity.
- The active LT Growth roster has one Lead and two Co-Leads.
- Growth Mobile structure/privacy/action regression check passes.
- Growth intelligence and LINE automation unit tests pass (12/12).
- Production negative-auth smoke passes without member writes or LINE sends.
- Production currently contains 6 submitted 2026 Blueprints and 43 reusable
  2026 links. These remain untouched.
- Growth Tasks currently has no open rows. This is a valid empty state, not a
  failed load.

## Launch fix in this change

- `chapter_profiles.msb_planning_year` makes the intake year configurable per
  Chapter; BNI IDEAL is configured for 2027.
- LINE `Blueprint` links derive the year from the linked member's Chapter.
- Growth/MC Blueprint Dashboard asks the server for the configured year on its
  first load, while keeping manual historical-year selection.
- The member form now times out cleanly and provides a retryable error instead
  of appearing stuck on an incomplete/non-JSON response.
- Growth Desktop includes a 2026-to-2027 member comparison table with the old
  goal, new goal, amount/percentage change, and explicit incomplete-data state.
- Member 360 shows the same 2026-to-2027 comparison and never substitutes a
  guessed goal when either year is missing.
- Historical 2026 Growth goals come from `IDEAL Power Team & Goal 2026 -
  Summary.csv` (SHA-256
  `00d068671764b5a2694ea3bbc4648ac3fba412d3ef37fbd81cb006e46dd9ed5c`).
  The additive import uses exact full-name matching only and keeps current
  monthly actual revenue separate.
- Source audit found 69 person rows, 54 rows with a 2026 BNI goal, 58 exact
  matches to current Active members, and 47 current Active members with a
  usable 2026 goal. Former or unmatched rows are not silently assigned.
- One legacy nickname collision was confirmed: the historical row for
  `Thanakrit Wathport` had been linked to `Sumintra Putthakee`. The migration
  unlinks that row and does not guess a replacement member.

## Operational checklist

1. Apply the additive migration and deploy `api` plus `line-webhook`.
2. Deploy the updated static Dashboard and Blueprint form.
3. Use one designated member account to type `Blueprint`; confirm the form
   heading and saved record show 2027. Do not reuse a 2026 link for this test.
4. Confirm the Growth Desktop Chapter Blueprint view defaults to 2027 and shows
   all 58 active members, with the test member marked submitted.
5. Confirm Growth Mobile can open the same member and create one real follow-up
   only if the operator genuinely needs it; otherwise keep acceptance read-only.
6. During the meeting, tell members to type `Blueprint` themselves. Do not post
   another member's private URL or expose tokens on the shared Dashboard.

## LINE AUTO product decision

Keep automation small and action-based. BNI's official member value centers on
trusted relationships, referrals, learning, accountability, and recognition;
messages should help a member take one useful next action, not repeat Dashboard
information.

Keep enabled:

- Friday meeting preparation: one concise weekly reminder.
- Renewal milestones: targeted to the affected member.
- Visitor follow-up: targeted only while an outcome is unresolved.
- 1-2-1 follow-up: targeted only for a real incomplete action.
- Mentor care alert: to the responsible Mentor, not a public member ranking.

Do not enable as broad recurring member pushes:

- generic Monday brief;
- generic score card;
- post-meeting checklist or team leaderboard;
- monthly recap without member opt-in.

Candidate next increments, only after launch evidence:

1. Referral close-the-loop reminder when a received referral has no recorded
   outcome after a configured interval.
2. Member-controlled weekly Blueprint action reminder, opt-in and pausable.
3. Positive recognition for a concrete contribution, with human review and no
   public ranking of low performers.
4. New-member learning milestone tied to Member Success Program completion,
   targeted rather than broadcast.

No new LINE automation should be activated on launch day. First observe form
completion, support requests, failures, and quota for one full cycle.

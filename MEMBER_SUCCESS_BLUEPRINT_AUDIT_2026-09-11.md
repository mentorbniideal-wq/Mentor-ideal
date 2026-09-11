# Member Success Blueprint audit — 11 September 2026

## Verified current flow

1. A linked member sends `Blueprint`, `MSB`, `Goal`, or an equivalent supported command to LINE.
2. The canonical Supabase LINE webhook resolves the linked member server-side, reuses/creates one opaque annual `msb_access_tokens` link, replies with one Flex card, and records the webhook/delivery with an event-based idempotency key.
3. The browser form resolves only that personal token, validates required annual-plan fields, derives referral demand, saves the member/year Blueprint, and synchronizes the existing `members.bni_goal` value.
4. MC and Growth read the same data through `member-success-blueprints` with server-derived role scope. Growth gets Chapter-wide aggregated planning, gap, support-radar, and matching data; team roles remain team-scoped.

## Fixed in this audit

- The `Chapter Blueprint` tab was implemented but hidden in the Growth navigation. It is now visible and loads `getMSBDashboardBundle` using the authenticated Growth role.
- The Growth team filter was hard-coded to a small installation-specific team list. It now derives its options from returned Blueprint rows, preserving configuration readiness and avoiding silently missing a team.

## Deliberately not changed

- LINE sends only a member-requested private Flex link. Dashboard link generation remains copy-only, so a staff click cannot silently send a member LINE.
- The form does not proactively send a LINE confirmation after save. This avoids an extra unsolicited message; the success screen and MC/Growth refresh remain the delivery truth.

## Recommended next increment

1. Consolidate the retired `member_success_blueprint_tokens` design with `msb_access_tokens`, then store only hashes for newly issued web tokens. Migrate without invalidating current links and retain an expiry/revocation audit.
2. Add an opt-in “Blueprint submitted” in-app notification to the assigned Mentor/Growth queue; do not make it an automatic LINE push without a notification-policy decision.
3. Add handler-level tests for token expiry, role scope (Growth versus team Mentor), and the one-Flex-reply LINE Blueprint command.

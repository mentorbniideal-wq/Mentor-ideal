# Growth Desktop Power Team Hub

Candidate-only implementation. Do not treat this document or automated tests as signed-in acceptance.

## Boundaries and data flow

- The existing `getPowerTeamProposals` response supplies submitted Blueprint candidates for the Chapter planning year, saved Proposals, and official publications. Growth candidate categories are projected from current `share_referral_focus` or active explicit `power_team` category grants; an absent profile/grant denies the category. Historic proposal text is hidden from Growth if any linked member lacks full referral sharing. The response is recalculated for each request, not cached in the API.
- A candidate is not a team. Growth Coordinator can save and assign an existing Proposal. Assigned Growth owners can update only their own Proposal with the existing capability; server authorization remains authoritative. Proposal closure does not assert a connection, MY121, referral, or revenue result.
- `growth_power_team_publications` records an Admin-approved official team based on an active Proposal. One Proposal can be published at most once. Publication requires two active members in the authenticated Chapter and freezes the Proposal and its member links. Archiving retains history. Database triggers emit Chapter audit events. Legacy `power_teams` pairings and Mentor Teams are not migrated or repurposed.

## Release order and verification

1. Back up the target database and verify existing Proposal tables, Chapter audit table, and current schema migration ledger. Apply `20260928000001_growth_power_team_publications.sql` before deploying the API; it is additive and has no backfill.
2. Verify the new table, unique Proposal constraint, Chapter index, RLS/revokes, guards, and audit triggers. Confirm existing Proposal rows are unchanged. A migration-only state leaves the existing API and UI behavior intact.
3. Deploy the API and then Desktop assets as one controlled release. Verify Growth owner, Coordinator and Admin accounts using real OAuth sessions, including other-Chapter denial, consent revoke followed by a fresh request, unauthorized publish denial, duplicate publish behavior, and Admin archive. Verify Mentor workflows remain unchanged.
4. Browser-check loading/empty/error states and narrow Desktop widths. Automated tests do not replace this step.

## Rollback

- If API or Desktop verification fails, roll back the API and Desktop assets to the previous release. Leave the additive table and historical publication/audit rows in place; do not drop it or rewrite historic records. Disable access to publish by restoring the old API. Reconcile any publication created during the window before a later retry.
- No Production migration, capability assignment, deploy, or LINE send is authorized by this runbook itself.

## Known limitation

The existing Proposal create action inserts the Proposal and member links in separate requests, not a database transaction. A failure in the second insert can leave an unlinked draft. Publication rejects such drafts; atomic Proposal creation is separate follow-up work, not silently changed in this Hub.

## Growth Desktop cleanup in this candidate

- Sprint is removed from Growth Desktop navigation and presentation; saved Sprint history and APIs are not deleted.
- The old Desktop Connection Map no longer reads or writes the separate `cross_team_synergy` pairing store. Its Growth tab now displays safe, read-only `getAll121Logs` status. Suggested categories do not book or verify MY121; the MY121 workflow remains authoritative.
- Growth Blueprint pair suggestions require two submitted plans and a category currently shareable by both members. They do not use Mentor Team, Traffic Light, profession-derived guesses, free text, or a numerical confidence score. Revocation removes a category from the next API response.
- `getReferralFlow` now returns Chapter-scoped reported RG/RR totals only. The dashboard source does not identify verified sender→recipient edges, so the old estimated team-to-team arrows and individual “taker” list are retired. The UI calls this Referral Outcomes, but clearly labels figures as reported activity, not verified business outcomes.
- The legacy `getCrossTeamSynergy` / `saveCrossTeamPair` actions now return HTTP 410 after authentication. Desktop and legacy Mobile Growth tabs read `getAll121Logs` instead; existing `cross_team_synergy` rows are retained. Growth's MY121 DTO omits Mentor Team grouping and private notes. This avoids claiming that a legacy assigned pair is a verified MY121.
- Before release, verify that no deployed or external client still depends on the retired actions. Signed-in OAuth checks for Growth and Mentor, and browser checks on both Growth views, remain mandatory; automated tests alone cannot establish that acceptance.

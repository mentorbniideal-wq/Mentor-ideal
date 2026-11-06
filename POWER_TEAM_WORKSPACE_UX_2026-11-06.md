# Power Team workspace UX refresh

Pete explicitly approved commit/push/Production deployment of this UI refresh
on 6 November 2026, following the deployed Power Team readiness release.
Release through main's Vercel integration, then verify runtime revision and
static hashes. No schema/API deployment, consent grant, member mutation or LINE
send is part of this UI refresh. Preserve the original IDE worktree's unrelated edits.

## Pattern and workflow

- Use existing Desktop semantic theme tokens (`sf`, `sf2`, `tx`, `sub`, `ac`,
  `bd`) rather than a separate Chapter-specific palette. Isolated stylesheet
  and dialog class prevent changes to unrelated modules.
- Summary separates Blueprint submissions, explicit Growth sharing, open
  proposals and official teams. All counts use the server DTO; no estimates.
- Four labelled navigation stages: opportunities, open proposals, official
  teams and history. Closed proposals/archived teams are not mixed into active
  work. Native buttons are keyboard accessible and expose `aria-current`.
- Search filters only currently visible, authorized cards locally; navigation
  resets the query. No new API calls or writes. Empty and no-match states differ.
- Proposal cards show status, owner, customer group, members and actual response
  progress. Consent-restricted details remain hidden using the existing DTO flag.
- Reuse existing native dialogs for selection, assignment and status with the
  same visual controls, visible focus, disabled busy state and original validation.
- Secondary privacy explanation is collapsible. It explicitly states that
  overlap is a hypothesis and that no automatic LINE invitation is sent.

## Verification

Run `node scripts/test-desktop-power-team-hub.mjs`, existing Blueprint/Proposal
browser fixtures, and `scripts/test-power-team-workspace-ui.mjs` with Playwright.
The latter uses synthetic local fixtures only: stage isolation, local search,
history separation, 375/768/1440px, light/dark and overflow checks. It is not a
signed-in Production acceptance test. A screenshot is a synthetic preview, not
actual Chapter data. The Hub behavior, both browser suites, JS syntax and
`git diff --check` were rerun before release. Positive signed-in acceptance is
distinct from these automated fixture checks.

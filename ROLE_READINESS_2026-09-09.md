# Audit release and role readiness — 9 September 2026

## Scope

Close the pending audit fixes in shared OAuth authorization, API/Admin/LIFF/Cron JSON validation, Mobile read-only state and Push navigation. Desktop responsive was previously published and is recorded separately in Git. No schema migration, production secret change, token architecture change or LINE message test is included.

## Automated authorization evidence

- 140 Deno tests with 18 role substeps pass.
- OAuth and PIN matrices cover MC, five mentor roles, Mentor Support, Growth and Viewer.
- OAuth uses the verified assignment, ignoring client role/Admin/Chapter claims; unassigned admin sections and cross-team access are denied.
- Viewer writes fail; assigned editors remain functional; read-only deadlines preserve read scope and deny writes.
- Inactive, not-yet-active and expired assignments fail; invalid JWT never falls back to supplied PIN.
- Only the existing verified System Owner identity receives unrestricted Admin access. DB admin/wildcard flags alone do not grant it.
- Existing member-signal tests cover confidential-case visibility, Mentor own-team scope, Growth referral visibility and Mentor Support restrictions.
- Entry callbacks reject invalid JSON shapes before database access. Browser/Node guards cover responsive Desktop, LINE counts, safe template rendering and same-origin Push URLs.

These are synthetic identity/database tests, not authenticated production sign-ins or actual cross-Chapter RLS tests.

## Approved real account and remaining gate

Pete approved `phitarn.p@gmail.com` for testing. No authenticated session for that account is available to the agent. Owner OAuth login and positive production reads therefore remain **not verified**. No other real role account has been approved. Do not create sessions or impersonate a user to bypass this gate.

For the approved owner, follow Gate 1 in `PRODUCTION_E2E_RUNBOOK.md`: sign in, run System Health and read-only Smoke Test, review Dashboard/Work Queue/LT/1-2-1/LINE Activity results. Other real-role acceptance needs approved role-specific accounts. No test broadcast or member mutation is needed for this release.

## Deployment and rollback

Before deployment, downloaded and compared each live function source. Only the intended audit files differ. Persistent rollback source is kept outside Git under `migration-exports/bni-audit-function-backups-0elh2c3s/`, with separate directories per function and `versions-before.json`.

Previous versions: API 263, Admin API 61, LIFF API 54, Cron 58. API/Admin JWT verification stays enabled; LIFF/Cron retain their existing custom authentication and disabled gateway JWT checks. LINE webhook 72 is outside scope.

Rollback one function from its saved directory, preserving the saved configuration:

```sh
supabase functions deploy api --project-ref itwyjhlfemxsfbimshby --use-api --workdir migration-exports/bni-audit-function-backups-0elh2c3s/api
```

Substitute both occurrences of `api` for the function to roll back. Do not use `--prune` or change secrets. Frontend rollback reference is `dpl_AGbxyz8vJVERUrPWWbSSLBUJR3vX`, the Desktop responsive production release.

Negative production verification is reproducible with `node scripts/test-production-readiness.mjs`. It uses only the public application key, invalid/missing user credentials and read-only/invalid requests; it must never return member data. Real-user sign-in remains a separate acceptance gate.

## Commercial readiness debt

The existing active-Chapter resolver/global role-assignment model and `get` read-only naming convention remain unchanged. Product/engineering owns replacing these with session-derived tenant memberships and explicit action semantics in the roadmap. No claim of full multi-tenant isolation is made by these tests.

## Published outcome

- Release source: `b62bc6d` on `fix/system-audit-readiness-20260909`, pushed to origin. Desktop tracking commit: `88520ef`. After production checks, `main` was fast-forwarded to the reviewed release history; no unrelated remote changes were overwritten.
- Supabase production: API **264**, Admin API **62**, LIFF API **55**, Cron **59**, all ACTIVE. JWT verification flags match pre-release values; LINE webhook stays **72**.
- Production negative-auth smoke: **9 requests passed**. Invalid bodies return 400; missing/invalid credentials are denied with no member data; unauthenticated Cron returns 401. No valid-account request or member write was sent.
- Vercel preview `dpl_AX5wThsSdfrg8tFxnhD3s3Zey5fH` verified before promotion. Production `dpl_8MNS34J6GzCF6msjWSCxnU6s31ow` is Ready at https://bni-mentor-system.vercel.app.
- Exact production file checks pass for Desktop HTML/CSS/JS, Mobile HTML/JS, service worker and LIFF HTML.
- Production Chromium smoke passes on Desktop and Mobile entry pages at four widths, with no page exceptions. POST requests were blocked in the browser smoke.
- Account-specific positive OAuth login and authenticated System Health/Smoke Test remain pending because no signed-in owner session is available. This does not count as a passed production role acceptance test.

# System bug audit — 9 September 2026

## Scope and outcome

Reviewed the public web entrypoints, browser JavaScript/HTML assets, shared authentication and capability checks, API/Admin/LIFF/Cron request parsing, service worker navigation, Desktop navigation and LINE compose UI. Ran the available automated suite and type-checked all five Edge Function entrypoints. This is a local audit and repair pass, not a claim that every production workflow is defect-free.

Confirmed defects repaired:

1. Compact navigation labels were clipped by the navigation scrollport. Labels now render in a body-level tooltip, support keyboard focus and Escape, and dismiss on scroll/resize. Folded navigation remains scrollable.
2. OAuth ignored `read_only_after` and did not enforce Viewer write restrictions. Shared authentication now derives read-only state from the verified assignment and rejects writes, with an additional admin-section guard. Desktop/Mobile retain the state and return a clear View Only error. Existing role restrictions remain in place; read-only conversion grants no additional server access.
3. OAuth email lookup treated SQL wildcard characters as patterns. It now escapes pattern characters and checks the returned email against the verified identity before granting access.
4. Push notification navigation changed an external URL's path without changing its origin. Unsafe/malformed URLs now resolve to the local home screen; valid same-origin paths/query/hash remain intact. Focusing waits for navigation to finish.
5. API, Admin API, LIFF and Cron accepted valid JSON with an invalid top-level type, causing exceptions on `null` or incorrect dispatch. They now reject null/arrays/scalars with HTTP 400 before database access. Cron also requires a non-empty string job.
6. Desktop LINE template buttons interpolated member nicknames into inline JavaScript/HTML. They now use DOM text and event listeners, retaining literal nicknames without executable markup.
7. LINE review displayed any nonzero numeric `sent` result as 1. It now distinguishes boolean and numeric results and preserves explicit `sentCount`.
8. Desktop operations exceeded its existing 730,000-byte ceiling. LINE compose/delivery UI moved into `desktop-line-compose.js`, loaded immediately after operations. The original ceiling remains unchanged; the extracted module has its own budget. Browser assets and service-worker cache version were refreshed.

## Verification

- Deno functional/contract tests: 134 passing, including verified identity, read-only authorization and malformed requests against actual captured entrypoint callbacks.
- Type checks: API, Admin API, LIFF, Cron and LINE webhook.
- Existing Node guards: login responsiveness, mobile navigation, notifications, retention migration, team identity and web budgets.
- Service worker regression: external, protocol-relative, JavaScript, malformed and credential-bearing URLs; valid local URL; navigation/focus order.
- Chromium fixture using actual dashboard markup/styles and the new navigation/LINE modules: 820/1024/1180/1440px, hover/focus/Escape/scroll, literal nickname rendering, boolean/numeric LINE counts. External requests are blocked and no LINE/API sends are made.
- Static scan: public JavaScript and inline scripts parse; no duplicate IDs or missing local script/style/image references in public HTML.
- `git diff --check`.

Commands:

```sh
deno test --allow-read --allow-env supabase/functions/
deno check supabase/functions/api/index.ts supabase/functions/admin-api/index.ts supabase/functions/liff-api/index.ts supabase/functions/cron-jobs/index.ts supabase/functions/line-webhook/index.ts
node scripts/test-service-worker.mjs
node scripts/check-web-budgets.mjs
# Requires an installed Playwright package and Chromium:
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/test-desktop-ui.mjs
```

## Commercial readiness and remaining coverage

No deployed migration, production configuration, LINE secret, tenant resolver or messaging delivery policy was changed. Authorization remains server-derived. No new Chapter/person/credential-specific logic was introduced. Existing working-tree changes to the iPad layout and its contract test were preserved.

Owner: product/engineering, following `COMMERCIAL_MULTI_CHAPTER_ROADMAP.md`.

- Full cross-Chapter data isolation remains Phase 2 debt; this pass tests role isolation, not an actual second tenant. Existing active-Chapter/global role-assignment architecture is unchanged.
- The read-only action classification follows the existing `get` convention. A future centralized action registry should declare read/write semantics explicitly, with tests for getters that perform incidental writes.
- LINE templates moved unchanged except for safe nickname rendering. Existing installation-specific template copy remains configuration-extraction debt under Phase 1.
- Production OAuth, real database/RLS execution, iOS Safari/Web Push presentation, live LINE delivery/retry and real device touch behavior require staging/device validation. The Chromium fixture does not substitute for authenticated end-to-end tests.
- No deployment or production mutation was performed. Token/Secret migration remains parked.


Release follow-up and expanded role tests are tracked in `ROLE_READINESS_2026-09-09.md`; the deployment statements above describe the original audit pass.

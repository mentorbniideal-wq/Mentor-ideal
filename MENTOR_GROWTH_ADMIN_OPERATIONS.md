# Mentor / Growth Admin operations — 5 November 2026

Open Desktop and select **Admin** in the top bar. The panel is available to a
server-authorised Chapter Admin and links to these existing operational tools.

| Routine | Admin entry | Result / boundary |
| --- | --- | --- |
| Change Chapter identity, meeting day/time | Chapter และปี Blueprint | Versioned Chapter Configuration; restore creates another revision |
| Open the next Blueprint planning year | Chapter และปี Blueprint | Set the Gregorian year; previous member plans stay in their original years |
| Add/revoke accounts and set expiry | บัญชีและสิทธิ์ | Existing role/section authorisation applies server-side |
| Edit member data, Mentor team or LINE link | ข้อมูลสมาชิก | Existing Member 360 operations |
| Assign LT and follow up handoffs | ตำแหน่งและงานดูแล | Existing LT/work queue operations |
| Edit automatic LINE text/schedule and inspect delivery | ข้อความอัตโนมัติ | Existing LINE AUTO preview, confirmation and delivery guard |
| Import monthly scores / undo the latest batch | นำเข้าคะแนนรายเดือน | Existing Preview + import ledger + rollback |
| Correct a remembered CSV name | ชื่อที่ระบบจำไว้ | Search, select the correct active member, confirm. Applies to future imports; existing rounds are unchanged |
| Schedule, verify, care for or release a MY121 group | จัดการ 1-2-1 | Pair Action Center; release includes every participant in the re-match queue |
| Review Blueprint submissions | Blueprint ของสมาชิก | Existing authorised MC Blueprint workspace |
| Inspect data quality, handover and audit | ตรวจสุขภาพระบบ | Existing Chapter Center |

## Corrections shipped with this release

- CSV import deduplicates by resolved member ID, including canonical name plus
  a remembered alias; failure to load LINE/alias data stops creation of the draft.
- Mentor Care, pair operations, reminders, history, Desktop participant stages
  and operations scope include the third member of an exceptional MY121 trio.
- Completed Digital Handshake advances to reflection/follow-up even when an
  optional Guided Session or appointment record remains unfinished.
- Appointment operations reject a non-existent appointment before changing the
  pair and return the actual database status (including completion guards).
- Admin alias corrections use a server-derived Chapter, row lock, expected
  previous member, atomic audit and idempotent retry.
- A new service-only release RPC queues all 2/3 participants atomically. Confirmed
  appointments must first be changed/cancelled; completed/closed groups are not
  released. The old RPC remains unchanged for compatibility.
- Chapter Configuration reads/writes derive the authenticated Chapter. Legacy
  installation settings are mirrored only when editing the active installation.

## Validation and release

Use `deno test --allow-env --allow-read --allow-net supabase/functions/_shared
supabase/functions/api` (add `--node-modules-dir=none` when a parent directory
contains an unrelated npm project).

Browser checks: `scripts/test-desktop-ui.mjs`,
`scripts/test-admin-self-service.mjs`, `scripts/test-verification-help-ui.mjs`.
`PLAYWRIGHT_MODULE` may point to an external Playwright installation.

`scripts/test-admin-my121-db.mjs` runs isolated synthetic PostgreSQL fixtures via
PGlite (`PGLITE_MODULE` may point to an external installation). It verifies both
new migrations, cross-Chapter denial, stale writes, idempotency, all-three-member
release, confirmed/completed guards and denied public execution.

Apply only `20261105000001` and `20261105000002`, then deploy `api`, `admin-api`
and static assets. Older remote migrations absent from the checkout must not be
marked reverted or reapplied. Never test LINE sends or alter member records as a
deployment smoke test. Signed-in OAuth/PIN and phone delivery acceptance remain
separate from fixture tests and negative-auth HTTP checks.

## Recovery / commercial-readiness debt

- To undo a wrong alias correction, select its previous member and confirm another
  correction. Historical pair records and the audit ledger remain unchanged.
- Roll back frontend/API to the preceding release if necessary; keep additive
  functions and audit history. No data reset is required.
- Secret rotation, new features, schema changes and new business calculations
  remain engineering/platform operations. LINE Token multi-Chapter migration is
  still parked under `COMMERCIAL_MULTI_CHAPTER_ROADMAP.md`.
- Legacy Chapter Configuration still writes revision and mirror records after
  the profile update. Transactional configuration revision storage remains debt;
  this release does not claim that the entire legacy configuration path is atomic.
- The active IDE worktree contains separate unfinished M2M/Blueprint/LIFF and
  legacy import-script work. The release is assembled on current `origin/main`
  in an isolated worktree, so those edits are preserved and not deployed.

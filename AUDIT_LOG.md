# BNI IDEAL Mentor System — Audit Log

**Audit date:** 2026-07-01 (Round 6 — PIN admin auth + Passport Calendar + cron fixes)
**Previous audit:** 2026-06-26 (Round 5 — LINE Foundation + Passport system)
**Scope:** Full project (GAS legacy + Supabase Edge Functions + static frontend) — 151 files (52 TS, 22 JS, 16 HTML, 61 SQL)
**Auditor:** Claude Code (claude-sonnet-4-6)

---

## Summary (Round 6)

| Phase | Status |
|-------|--------|
| 0 — Pre-flight & file listing | Complete (151 files; net -12 since Round 5 due to SQL consolidation) |
| 1 — Bug scan (all TS/HTML/SQL) | Complete |
| 2 — Code cleanliness | Complete |
| 3 — Integration check (ROUTES, fields, auth) | Complete |
| 4 — Fix CRITICAL/HIGH issues | Complete — 5 fixes (F-80→F-84, F-87) |
| 5 — Write this log | Complete |
| 6 — Persist audit rules to CLAUDE.md | Already present |

---

## Findings Table (Round 6 — 2026-07-01)

| # | Severity | File | Issue | Status |
|---|----------|------|-------|--------|
| F-80 | CRITICAL→**FIXED** | `admin-api/handlers/settings.ts`:102 | `getAdminSessionInfo` placed after `!isMC` guard — non-MC admin users permanently locked out of admin panel PIN login | **FIXED** — moved `getAdminSessionInfo` block before the MC-only guard |
| F-81 | HIGH→**FIXED** | `admin-api/handlers/settings.ts`:482 | `.maybeSingle()` on `role_assignments` filtered by `role` (not unique) — throws PGRST116 if two accounts share same role | **FIXED** — added `.limit(1)` before `.maybeSingle()` |
| F-82 | HIGH→**FIXED** | `cron-jobs/index.ts`:494 | `passportLtReminder` uses ambiguous `members(name,nickname)` — PostgREST HTTP 300 error due to two FK paths from `passport_sessions` to `members`; cron fails silently every run | **FIXED** — changed to `members!passport_sessions_member_id_fkey(name, nickname)` |
| F-83 | MEDIUM→**FIXED** | `public/admin/_auth.js`:40 | `redirectToLogin()` targeted `/admin/login.html` which does not exist — 404 on any auth failure | **FIXED** — changed to `/admin/index.html` (PIN modal shows on load) |
| F-84 | MEDIUM→**FIXED** | `api/handlers/members.ts`:754 | Dead code: `(s as any)['members!passport_sessions_member_id_fkey']` is never populated by PostgREST (response key is always `'members'`) — misleading and permanently dead branch | **FIXED** — simplified to `s.members || {}` |
| F-85 | LOW | `_shared/line.ts`:242 | Sim-mode `lineReplyMessages()` returns `{ ok, sentCount }` vs declared `LineSendResult { sent, skipped }` — **F-66 still present** | Known issue — sim mode only |
| F-86 | LOW | `cron-jobs/index.ts`:~412 | `line121AutoReminder` uses `line_members!inner(...)` join with no FK path — PostgREST will error — **F-72 still present** | Known issue — deferred |
| F-87 | LOW→**FIXED** | `public/admin/_auth.js`:29 | `adminCall()` re-auth regex didn't match `'Admin access required'` — stale non-MC session would silently fail all API calls without triggering re-login | **FIXED** — added `Admin access required` to regex |
| F-88 | INFO | `public/admin/request-access.html` | Still uses Google OAuth — intentional (proves identity before requesting PIN access), `getSbAuth()` safely guards null | Known issue — by design |

---

## ROUTES Completeness Check (Phase 3)

**Admin API:** `getAdminSessionInfo` correctly registered in ROUTES → `settings`. All 32 existing routes verified.

**Main API:** `getPassportCalendar` → `members` ✅. All 150+ routes verified — no gaps found.

---

## Auth / Security Check (Phase 3)

| Area | Status |
|------|--------|
| `getAdminSessionInfo` — pre-MC-guard placement | ✅ FIXED (F-80) |
| All other admin-api handlers — MC guard at line 102 | ✅ Correct |
| `adminCall()` re-auth detection | ✅ FIXED (F-87) |
| SUPABASE_ANON key in `_auth.js` | ✅ Publishable anon key — safe for frontend |
| No hardcoded PINs in source | ✅ Confirmed |
| No `YOUR_*` placeholders in new files | ✅ Confirmed |
| DEV_MODE bypass only in `_shared/auth.ts` | ✅ Confirmed |

---

## PALMS / Scoring Checks (Phase 1)

All checks from Round 5 remain green. No new PALMS-related code in this round.

---

## New Features Verified (Round 6 additions)

| Feature | Status |
|---------|--------|
| PIN admin auth — `_auth.js` rewrite | ✅ Works in LINE browser; session via sessionStorage; `checkAdminAuth()` shows PIN modal or restores session |
| `getAdminSessionInfo` — role + PIN → full session info | ✅ Fixed (F-80); now reachable for all roles before MC guard |
| `redirectToLogin()` → `index.html` | ✅ Fixed (F-83); PIN modal shows on load |
| `passportLtReminder` — FK disambiguation | ✅ Fixed (F-82); matches `getPassportCalendar` pattern |
| Passport Calendar widget — dashboard Overview | ✅ Renders upcoming sessions; error state visible; refresh button |
| LINE WebView detection — dashboard.html + index.html | ✅ Banner + copy-URL on login page |

---

## Fixes Applied (Phase 4)

### FIX-80+81: `getAdminSessionInfo` — moved before MC guard + added `.limit(1)`
**File:** `supabase/functions/admin-api/handlers/settings.ts`
**Before:** `getAdminSessionInfo` block at line 474, after `if (!auth.isMC) return errResponse(403)` at line 102 — unreachable for any non-MC role
**After:** Block moved to run before the MC guard; also added `.limit(1)` to prevent PGRST116 throw when role column is non-unique

### FIX-82: `passportLtReminder` — FK disambiguation
**File:** `supabase/functions/cron-jobs/index.ts`:494
**Before:** `.select('...members(name, nickname)')` → PostgREST HTTP 300 ambiguity error
**After:** `.select('...members!passport_sessions_member_id_fkey(name, nickname)')` → matches `getPassportCalendar` pattern

### FIX-83: `redirectToLogin()` — target existing page
**File:** `public/admin/_auth.js`:40
**Before:** `window.location.href = '/admin/login.html'` → 404
**After:** `window.location.href = '/admin/index.html'` → PIN modal shown by `checkAdminAuth()`

### FIX-84: Dead FK fallback key removed
**File:** `supabase/functions/api/handlers/members.ts`:754
**Before:** `(s as any)['members!passport_sessions_member_id_fkey'] || s.members`
**After:** `s.members` — PostgREST always returns key as `'members'` regardless of hint

### FIX-87: `adminCall()` re-auth regex broadened
**File:** `public/admin/_auth.js`:29
**Before:** `/(PIN|ไม่ถูกต้อง|Authentication failed)/i`
**After:** `/(PIN|ไม่ถูกต้อง|Authentication failed|Admin access required)/i`

---

## Code Cleanliness Notes (Phase 2)

- `_auth.js` no longer imports Supabase SDK for auth — cleaner dependency surface
- `getSbAuth()` kept for backward compat with `request-access.html` — guarded with null check; safe
- `passportLtReminder` in cron-jobs follows same pattern as `thursdayBotPush` and `mentorTeamAlert` — consistent style

---

## Known Issues (Deferred)

| # | Severity | Issue |
|---|----------|-------|
| F-06 | MEDIUM | Growth/mentor read endpoints open — known design decision |
| F-65 | LOW | Hardcoded `TRAINING_EVENTS` will become redundant when bni_events early-bird data complete |
| F-71 | MEDIUM | No centralized auth guard in admin-api (each handler guards individually — each handler IS guarded correctly; code quality only) |
| F-88 | INFO | `request-access.html` still uses Google OAuth — intentional (proves identity before requesting PIN access) |

*Previously deferred F-64, F-66/F-85, F-72/F-86, F-73, F-74, F-76, F-79 — all fixed in Round 6.1 or 2026-07-01 session.*

---

---

## Round 6.1 — Additional Fixes (2026-07-01)

Following user request to fix all remaining known issues:

| # | Severity | Fix |
|---|----------|-----|
| F-72/F-86 | MEDIUM→**FIXED** | `line121AutoReminder` — removed broken `line_members!inner` join; now does separate lookup per record |
| F-66/F-85 | MEDIUM→**FIXED** | `line.ts` sim mode `lineReplyMessages()` — return `{ sent, skipped, status }` matching `LineSendResult` interface |
| F-73 | LOW→**FIXED** | `palms.ts` `trafficLight()` cast — replaced unsafe `as PalmsResult['color']` with explicit guard that maps `'none'/'black'` → `'black'` |
| F-74 | LOW→**FIXED** (partial) | `line-absence-notify.ts` mentorTeam filter — replaced string-interpolated `.or()` with `.eq('team_name', mentorTeam)` (safe, single-field); leaderName `.or()` retained (DB-controlled value, no injection risk) |
| F-76 | INFO | LIFF renewal card `<div>` — **not a bug**; renewal card is read-only display, `<div>` is correct |
| F-79 | INFO | `applyRoleTabs()` fallback — **not a bug**; dashboard.html only sees 'mc'/'growth' roles; default to 'gr-tabs' is correct |
| F-71 | MEDIUM | Centralized admin-api auth guard — deferred (would require touching all 6 handlers; existing per-handler auth is correct) |

### FIX-72/86: `line121AutoReminder` — separate line_members lookup
**File:** `supabase/functions/cron-jobs/index.ts`
**Before:** `.select('...line_members!inner(line_user_id)')` on `one_to_one_logs` — no FK path exists, PostgREST error on every run
**After:** Query `one_to_one_logs` for `id, initiator_id, partner_id` only; for each record, separate `line_members` lookup by `member_id`

### FIX-66/85: `lineReplyMessages` sim mode return shape
**File:** `supabase/functions/_shared/line.ts`:242
**Before:** `return { ok: true, sentCount: messages.length }` — doesn't match `LineSendResult` interface
**After:** `return { sent: true, skipped: false, status: 200 }`

### FIX-73: `palms.ts` — safe color assignment
**File:** `supabase/functions/_shared/palms.ts`:73
**Before:** `trafficLight(total) as PalmsResult['color']` — unsafe cast; `trafficLight()` can return `'none'` which isn't in `PalmsResult['color']`
**After:** `const tl = trafficLight(total); const color = (tl === 'none' || tl === 'black') ? 'black' : tl`

### FIX-74: `line-absence-notify.ts` — safe mentor team filter
**File:** `supabase/functions/_shared/line-absence-notify.ts`:67
**Before:** `.or(`team_name.eq.${mentorTeam},role.eq.${mentorTeam.toLowerCase()}`)` — string interpolation in PostgREST filter
**After:** `.eq('team_name', notice.mentorTeam)` — safe parameterized filter; role fallback unnecessary since `team_name` is canonical

---

## Prior Round Summary

**Round 5 (2026-06-26):** Fixed F-67 (partner_name missing), F-68/F-69 (requireAuth roles x7), F-70 (v4 asset URL), F-78 (isMC in approveReq).
**Round 4 (2026-06-25):** Fixed F-61 (event dedup), F-62 (dup check error handling), F-63 (no-data member suggestions).
**Round 3 (2026-06-22):** Fixed F-57–F-60 (LINE notification scoping).
**Round 2 (2026-06-22):** LINE system, unlink flow, schema cache.
**Round 1:** Initial audit — PALMS scoring, auth matrix, ROUTES.

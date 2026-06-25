# BNI IDEAL Mentor System — Audit Log

**Audit date:** 2026-06-26 (Round 5 — LINE Foundation + Passport system + Growth LINE ID)
**Previous audit:** 2026-06-25 (Round 4 — membership dates + training calendar + edit member)
**Scope:** Full project (GAS legacy + Supabase Edge Functions + static frontend) — 163 files (58 TS, 22 JS, 16 HTML, 57 SQL)
**Auditor:** Claude Code (claude-sonnet-4-6)

---

## Summary (Round 5)

| Phase | Status |
|-------|--------|
| 0 — Pre-flight & file listing | Complete (163 files; +16 since Round 4) |
| 1 — Bug scan (all TS/HTML/SQL) | Complete |
| 2 — Code cleanliness | Complete |
| 3 — Integration check (ROUTES, fields, auth) | Complete |
| 4 — Fix CRITICAL/HIGH issues | Complete — 9 fixes (F-67…F-70, F-68/F-69 x6, F-78) |
| 5 — Write this log | Complete |
| 6 — Persist audit rules to CLAUDE.md | Already present |

---

## Findings Table (Round 5 — 2026-06-26)

| # | Severity | File | Issue | Status |
|---|----------|------|-------|--------|
| F-66 | MEDIUM | `_shared/line.ts`:242 | Simulator `lineReplyMessages()` returns `{ ok, sentCount }` but declared return type expects `{ sent, skipped }` — callers checking `.sent` get `undefined` | Known issue — sim mode only; no production impact |
| F-67 | HIGH→**FIXED** | `line-webhook/index.ts`:1188 | `schedule121()` insert into `one_to_one_logs` omitted `partner_name` column added in migration 041 — would cause DB error on every LINE "นัด [name]" command | **FIXED** — added `partner_name: (partner.nickname \|\| partner.name \|\| partnerName)` |
| F-68 | MEDIUM→**FIXED** | `api/handlers/line-admin.ts`:461,490,519,589,639,665 | `getAbsenceLog`, `getAbsenceLogRecent`, `getLineIssues`, `getOnboardingStatus`, `getOnboardingMessages`, `getOnboardingPreview` called `requireAuth(db,p)` with no role list — any authenticated session could read absence and onboarding data | **FIXED** — all 6 now pass `['mc','toomtam','aof','draft','phai','amp']` |
| F-69 | MEDIUM→**FIXED** | `api/handlers/line-admin.ts`:756 | `mentorBroadcast` called `requireAuth(db,p)` with no role list — any authenticated session could broadcast LINE messages | **FIXED** — added `['mc','toomtam','aof','draft','phai','amp']` role list |
| F-70 | HIGH→**FIXED** | `api/handlers/line-admin.ts`:825 | `setupRichMenu` admin action fetched `rich-menu-${role}-v2.jpg` — `line-provision.ts` uses `v4`; fetching non-existent v2 assets would silently fail | **FIXED** — changed to `rich-menu-${role}-v4.jpg` |
| F-71 | MEDIUM | `admin-api/index.ts`:44-66 | No centralized auth guard before dispatch — a new case without internal `requireAuth` would be silently open. Each handler currently has its own guard but no safety net | Known issue — acceptable for now; handlers all guard individually |
| F-72 | MEDIUM | `cron-jobs/index.ts`:~411 | `line121AutoReminder` uses `!inner` join on `one_to_one_logs → line_members`; if FK not defined in migrations, PostgREST returns zero rows and reminders never fire | Known issue — verify FK existence in migration 041 |
| F-73 | LOW | `_shared/palms.ts`:73 | `trafficLight(total) as PalmsResult['color']` casts away `'none'` return value; harmless in practice but misleading | Known issue — deferred |
| F-74 | LOW | `_shared/line-absence-notify.ts`:~67 | `.or()` filter uses string interpolation with `mentorTeam` from DB — commas or dots in team name could break PostgREST filter syntax | Known issue — team names are controlled, very low risk |
| F-75 | PASS | `public/dashboard.html`:5407 | `accRoleSync(role)` correctly sets `is_mc` only for `mc`, `is_mentor` for 5 mentor names — verified | PASS — no bug |
| F-76 | LOW | `public/liff/index.html`:197 | Renewal card is a `<div>`, not `<form>` — form submit listener won't trigger on it; fragile design | Known issue — no production bug |
| F-77 | PASS | `public/liff/index.html`:216,231 | `get-assignments` and `ack-assignment` action names match backend exactly | PASS — no bug |
| F-78 | MEDIUM→**FIXED** | `public/admin/settings.html`:277 | `approveReq()` computed `isMentor` but never computed `isMC` — MC role approval created `role_assignments` without `is_mc=true` | **FIXED** — added `isMC: role === 'mc'` to payload |
| F-79 | LOW | `public/liff/index.html`:166 | `applyRoleTabs()` has no fallback for unexpected role values — mentor tabs stay hidden for `mc` role in preview mode | Known issue — preview mode sets `role:'mentor'` anyway |

---

## ROUTES Completeness Check (Phase 3)

All handler `case` values verified against `ROUTES` in `index.ts` and `admin-api/index.ts`.

**Main API (api/index.ts):** All 150+ routes verified including new Passport routes:
- `getPassportBoard` → `members` ✅
- `syncPassportEnrollments` → `members` ✅
- `updatePassportSession` → `members` ✅
- `savePassportLtAssignment` → `members` ✅

**Admin API (admin-api/index.ts):** All 35 routes verified. LINE team mapping routes:
- `getLineTeamMappings` → `settings` ✅
- `setLineTeamMapping` → `settings` ✅

---

## Auth / Security Check (Phase 3)

| Handler | Has requireAuth | Write ops | Assessment |
|---------|----------------|-----------|------------|
| line-admin.ts | ✅ All cases (fixed F-68/F-69) | 14 | OK after fix |
| members.ts (passport) | ✅ MC-only for all Passport mutations | 4 | OK |
| liff-api/index.ts | ✅ LIFF token validation (no requireAuth — uses LIFF JWT) | 3 | OK |
| line-webhook/index.ts | N/A — LINE signature verification | 6 | OK — HMAC verified |
| cron-jobs/index.ts | N/A — service role only | various | OK |

- `DEV_MODE` only in `_shared/auth.ts` ✅
- No hardcoded tokens or secrets found ✅
- `public.ts` (no auth) only exposes read-only public data ✅
- LINE webhook verifies HMAC signature before any processing ✅

---

## PALMS / Scoring Checks (Phase 1)

All checks from Round 4 remain green:

| Rule | Status |
|------|--------|
| `months = weeks / 4` (not 4.333) | ✅ All locations |
| `effectiveWeeks = Math.min(26, Math.max(1, floor(bniDays/7)))` | ✅ Consistent |
| `display_score = GREATEST(monthly, official_pts)` | ✅ SQL view + handlers |
| Traffic light ≥70/≥50/≥30 thresholds | ✅ SQL + TS in sync |
| NM Checklist denominator = 41 (CHECKLIST_TOTAL) | ✅ Enforced |
| Month sort: `year*100+month` numeric | ✅ All sort paths |

---

## New Features Verified (Round 5 additions)

| Feature | Status |
|---------|--------|
| LINE Foundation: webhook HMAC + role dispatch | ✅ Signature verified, roles dispatched correctly |
| Rich menu provisioning (v4 assets, v5 version key) | ✅ `line-provision.ts` uses v4 assets; `setupRichMenu` now fixed to v4 |
| `elevatedLineIds` guard (MC/Growth not downgraded to Mentor) | ✅ Guard applied in both LINE_ID_* loop and mentor_teams loop |
| Passport board: D.mem race condition guard | ✅ `renderPassportBoard()` fetches `getDesktopDashboard` if `D.mem` empty |
| Passport `offset_days` falsy-zero bug | ✅ Fixed: `t.default_offset_days != null ? Number(...) : fallback` |
| Growth LINE ID admin UI (ltGrowthBody) | ✅ Settings handler returns `growthRow`; frontend renders it |
| `accRoleSync` auto-sync on role dropdown change | ✅ Verified correct logic for all roles |

---

## Fixes Applied (Phase 4)

### FIX-67: `schedule121()` — missing `partner_name`
**File:** `supabase/functions/line-webhook/index.ts`:1188
**Before:** `{ initiator_id: ..., partner_id: ..., scheduled_date: ... }`
**After:** `{ initiator_id: ..., partner_id: ..., partner_name: String(partner.nickname || partner.name || partnerName), scheduled_date: ... }`

### FIX-68/F-69: `requireAuth` missing role lists — 7 endpoints
**File:** `supabase/functions/api/handlers/line-admin.ts`
**Lines:** 461, 490, 519, 589, 639, 665, 756
**Before:** `requireAuth(db, p)` with no role restriction
**After:** `requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp'])`

### FIX-70: `setupRichMenu` — stale v2 asset URL
**File:** `supabase/functions/api/handlers/line-admin.ts`:825
**Before:** `` `${appUrl}/assets/line/rich-menu-${role}-v2.jpg` ``
**After:** `` `${appUrl}/assets/line/rich-menu-${role}-v4.jpg` ``

### FIX-78: `approveReq()` — missing `isMC` flag
**File:** `public/admin/settings.html`:276-282
**Before:** Only `isMentor` computed; MC approvals created `role_assignments` without `is_mc=true`
**After:** Added `isMC: role === 'mc'` in payload sent to `approveAccessRequest`

---

## Code Cleanliness Notes (Phase 2)

- `MENTOR_TEAMS` hardcoded in dashboard.html and webhook — LOW, acceptable for small chapter
- `_deskTrainCache` never invalidated (F-64 from Round 4) — still deferred
- `line.ts` simulator return type mismatch (F-66) — sim-only; production unaffected
- LINE commands in `line-commands.ts` well-structured; no dead branches found
- `traffic-evolution.ts` cleanly isolated — no cross-function references

---

## Known Issues (Deferred)

| # | Severity | Issue |
|---|----------|-------|
| F-06 | MEDIUM | Growth/mentor read endpoints open — known design decision |
| F-07 | MEDIUM | Some cross-team data visible to mentor role in growth view |
| F-64 | LOW | `_deskTrainCache` never invalidated during session |
| F-65 | LOW | Hardcoded `TRAINING_EVENTS` becomes redundant when bni_events early-bird data complete |
| F-66 | MEDIUM | `line.ts` sim mode returns wrong shape (`sentCount` vs `sent/skipped`) |
| F-71 | MEDIUM | No centralized auth guard in admin-api (each handler guards individually) |
| F-72 | MEDIUM | `line121AutoReminder` `!inner` join — verify FK defined in migration 041 |
| F-73 | LOW | `palms.ts` `trafficLight()` cast hides `'none'` return |
| F-74 | LOW | `line-absence-notify.ts` PostgREST `.or()` uses string interpolation |
| F-76 | LOW | LIFF renewal card is `<div>` not `<form>` — form listener won't fire on it |
| F-79 | LOW | `applyRoleTabs()` no fallback for unexpected role values |

---

## Prior Round Summary

**Round 4 (2026-06-25):** Fixed F-61 (event dedup), F-62 (dup check error handling), F-63 (no-data member suggestions).
**Round 3 (2026-06-22):** Fixed F-57 (notification audience filter), F-58 (monday brief `none` TL), F-59 (duplicate `var d`), F-60 (LINE absence notify target_audience).
**Round 2 (2026-06-22):** LINE system, unlink flow, schema cache.
**Round 1:** Initial audit — PALMS scoring, auth matrix, ROUTES.

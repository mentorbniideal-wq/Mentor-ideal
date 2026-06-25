# BNI IDEAL Mentor System — Audit Log

**Audit date:** 2026-06-25 (Round 4 — membership dates + training calendar + edit member + 4 improvements)
**Previous audit:** 2026-06-22 (Round 3 — LINE system + notification scoping)
**Scope:** Full project (GAS legacy + Supabase Edge Functions + static frontend) — 147 files (52 TS, 22 JS, 16 HTML, 57 SQL)
**Auditor:** Claude Code (claude-sonnet-4-6)

---

## Summary (Round 4)

| Phase | Status |
|-------|--------|
| 0 — Pre-flight & file listing | Complete (147 files; +40 since Round 3) |
| 1 — Bug scan (all TS/HTML/SQL) | Complete |
| 2 — Code cleanliness | Complete |
| 3 — Integration check (ROUTES, fields, auth) | Complete |
| 4 — Fix CRITICAL/HIGH issues | Complete — 3 fixes (F-61…F-63) |
| 5 — Write this log | Complete |
| 6 — Persist audit rules to CLAUDE.md | Already present |

---

## Findings Table (Round 4 — 2026-06-25)

| # | Severity | File | Issue | Status |
|---|----------|------|-------|--------|
| F-61 | HIGH→**FIXED** | `public/index.html trAllEvents()` | No deduplication between hardcoded `TRAINING_EVENTS` array and `_trCustomEvents` from `bni_events` API — MSP (Jul 7, Jul 22), Advanced MSP (Jul 17), 1-2-1 Training (Jul 3), Club events appeared TWICE in calendar | **FIXED** — dedup by `date+title.slice(0,10)` key; hardcoded wins (has early-bird detail), API skips duplicates |
| F-62 | MEDIUM→**FIXED** | `handlers/members.ts updateMember` | Duplicate name check query `const { data: dup } = await db.from(...)` didn't destructure `error` — silent fail if DB error, proceeds past dup check | **FIXED** — destructure `{ data: dup, error: dupErr }` and return error |
| F-63 | MEDIUM→**FIXED** | `public/dashboard.html injectTrainSuggestions()` | When `m.cats` is null (member has no PALMS data), `cats = {}` and all threshold checks (`cats.training < 20`) evaluated to `false` (undefined < 20 = false in JS) — showed "ไม่มี Event" for all no-data members instead of default MSP suggestions | **FIXED** — added `noCats` flag; when no PALMS data, default to showing MSP/Advanced MSP events |
| F-64 | LOW | `public/dashboard.html _deskTrainCache` | Training event cache never invalidated during session — stale if new events added mid-session. Acceptable for read-heavy calendar with <1hr sessions | Known issue — deferred |
| F-65 | LOW | `public/index.html TRAINING_EVENTS` | Hardcoded array will grow stale as `bni_events` coverage expands. Current dedup (F-61 fix) handles overlap; hardcoded provides early-bird detail not yet in DB | Known issue — empty array after full early-bird data seeded to bni_events |

---

## ROUTES Completeness Check (Phase 3)

All handler `case` values verified against `ROUTES` in `index.ts` and `admin-api/index.ts`.

**Main API:** All 140+ routes verified. New route `updateMember` correctly wired to `members` handler.

**Admin API:** All 35 routes verified against handlers.

---

## Auth / Security Check (Phase 3)

| Handler | Has requireAuth | Write ops | Assessment |
|---------|----------------|-----------|------------|
| 121.ts | ✅ 5x | 1 | OK |
| alerts.ts | ✅ 5x | 2 | OK |
| copilot.ts | ✅ 2x | 0 | OK |
| dashboard.ts | ✅ 14x | 1 | OK |
| growth.ts | ✅ 15x | 19 | OK |
| line-admin.ts | ✅ 38x | 14 | OK |
| members.ts | ✅ 31x | 38 | OK — new `updateMember` gated by `['mc']` |
| notifications.ts | ✅ 5x | 3 | OK |
| power-teams.ts | ✅ 11x | 6 | OK |
| renewal.ts | ✅ 4x | 4 | OK |
| meetings.ts | ✅ 13x | 10 | OK |

- `DEV_MODE` only in `_shared/auth.ts` ✅
- No hardcoded tokens or secrets found ✅
- `public.ts` (no auth) only exposes read-only public data ✅

---

## PALMS / Scoring Checks (Phase 1)

| Rule | Status |
|------|--------|
| `months = weeks / 4` (not 4.333) | ✅ All 6 locations use `/4` |
| `effectiveWeeks = Math.min(26, Math.max(1, floor(bniDays/7)))` | ✅ Consistent across all handlers |
| `display_score = GREATEST(monthly, official_pts)` | ✅ SQL view + all handler paths |
| Traffic light ≥70/≥50/≥30 thresholds | ✅ SQL function + TS function match |
| NM Checklist denominator = 41 (CHECKLIST_TOTAL) | ✅ Constant enforced, never `items.length` |
| Month sort: `year*100+month` numeric | ✅ All sort paths use numeric key |

---

## New Features Verified (Round 4 additions)

| Feature | Status |
|---------|--------|
| `updateMember` — seat transfer / rename | ✅ MC-only, validates date format, deduplicates name |
| `getTrainingEvents` — field mapping (title/course/format/time/audience[]) | ✅ Correct mapping from bni_events schema |
| Training Calendar `onsite-bkk` / `onsite-province` filter | ✅ `venueRegion` nil-safe; hardcoded events (no venueRegion) correctly pass BKK filter |
| Renewal Risk Score (`calcRenRisk`) | ✅ Safe: early return for `bniTl==='none'`; undefined fields handled |
| Trend Arrow ↑↓ in member list | ✅ Filters `score > 0`, sorts numerically |
| AI Copilot with training calendar context | ✅ Events injected with `|| []` fallback |
| Edit Member modal form | ✅ Confirm before clearing scores, date validated YYYY-MM-DD |

---

## Fixes Applied (Phase 4)

### FIX-61: `trAllEvents()` — Duplicate event deduplication
**File:** `public/index.html`
**Before:** `return TRAINING_EVENTS.concat(_trCustomEvents).filter(...)` — no dedup; events duplicated
**After:** Seen-set keyed by `date+'|'+title.toLowerCase().slice(0,10)`; hardcoded wins (has early-bird data), API events skipped for duplicates

### FIX-62: `updateMember` — Dup check missing error handling
**File:** `supabase/functions/api/handlers/members.ts`
**Before:** `const { data: dup } = await db.from(...)` — DB error silently ignored
**After:** `const { data: dup, error: dupErr } = ...` → returns `errResponse(dupErr.message)` on failure

### FIX-63: `injectTrainSuggestions` — No-data members showed "no events"
**File:** `public/dashboard.html`
**Before:** `cats = m.cats || {}` → `undefined < 20 = false` in JS → no events picked for members without PALMS
**After:** `noCats = !m.cats` flag → defaults to MSP/Advanced MSP when no PALMS data

---

## Code Cleanliness Notes (Phase 2)

- `MENTOR_TEAMS` array hardcoded in dashboard.html in 3+ places — LOW, acceptable for small chapter
- `_deskTrainCache` never invalidated — LOW, read-heavy use case
- `copilot.ts` system prompt updated with new field reference (membership_start_date, bni_days, expiry_date) — good practice
- `TRAINING_EVENTS` hardcoded array should be emptied when `bni_events` early-bird data is complete

---

## Known Issues (Deferred)

| # | Severity | Issue |
|---|----------|-------|
| F-06 | MEDIUM | Growth/mentor read endpoints open — known design decision |
| F-07 | MEDIUM | Some cross-team data visible to mentor role in growth view |
| F-64 | LOW | `_deskTrainCache` never invalidated during session |
| F-65 | LOW | Hardcoded `TRAINING_EVENTS` will become redundant when bni_events early-bird data is complete |

---

## Prior Round Summary

**Round 3 (2026-06-22):** Fixed F-57 (notification audience filter), F-58 (monday brief `none` TL), F-59 (duplicate `var d`), F-60 (LINE absence notify target_audience).
**Round 2 (2026-06-22):** LINE system, unlink flow, schema cache.
**Round 1:** Initial audit — PALMS scoring, auth matrix, ROUTES.

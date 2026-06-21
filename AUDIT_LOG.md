# BNI IDEAL Mentor System — Audit Log

**Audit date:** 2026-06-19 (security, role-flow, accessibility remediation + F-32 fast-track tier fix)
**Scope:** Full project (GAS legacy + Supabase Edge Functions + static frontend)
**Auditor:** Claude Code (claude-sonnet-4-6)

---

## Summary

| Phase | Status |
|-------|--------|
| 0 — Pre-flight & file listing | Complete |
| 1 — Bug scan (all TS/JS/HTML/SQL) | Complete |
| 2 — Code cleanliness | Complete |
| 3 — Integration check | Complete |
| 4 — Fix CRITICAL/HIGH issues | Complete — 19 fixes applied (13 prior + 5 new + 1 follow-up) |
| 5 — Write this log | Complete |
| 6 — Persist audit rules to CLAUDE.md | Already present — no change needed |

**File counts:** ~35 `.ts`, ~22 `.js`, ~3 `.html` (public), ~25 `.sql` (105 total)

---

## Remediation — 2026-06-19

- Added a central authentication gate before all non-public API actions.
- Enforced team/member ownership on detail, scores, notes, checklist, coaching, 1-2-1, Growth Tasks, assignments, renewal and sprint operations.
- Removed public contact PII and replaced public `select('*')` with explicit safe fields.
- Added delegated Admin permissions by section with View/Edit enforcement.
- Added RLS for access requests and per-recipient notification receipts.
- Replaced the empty scoring verifier with live PALMS comparison results.
- Fixed Admin API type errors and SQL cron helper lint findings.
- Added meaningful 1-2-1 partner identity fields.
- Enabled zoom, improved touch targets, added accessible labels and keyboard semantics, and removed duplicate report-control IDs.
- Marked the legacy PIN/manual document as superseded by the current Playbook.

## Findings Table

| # | Severity | File | Issue | Status |
|---|----------|------|-------|--------|
| F-01 | HIGH | `handlers/index.ts` | `deleteMember` missing from ROUTES | **FIXED** (2026-06-11) |
| F-02 | HIGH | `handlers/alerts.ts` | `getAlertCenter` blocked non-MC roles | **FIXED** (2026-06-11) |
| F-03 | HIGH | `_shared/palms.ts` | Visitor rate used `weeks / 4.333` | **FIXED** (2026-06-11) |
| F-04 | HIGH | `handlers/dashboard.ts` | `nextTl` wrongly returned 'green' for yellow-zone members | **FIXED** (2026-06-11) |
| F-05 | HIGH | `handlers/checkin.ts` | Invalid Anthropic model ID `claude-haiku-4-5-20251001` | **FIXED** (2026-06-11) |
| F-06 | CRITICAL | `handlers/members.ts` | `ensureSlot` no auth — unauthenticated member insert | **FIXED** (2026-06-15) |
| F-07 | CRITICAL | `handlers/members.ts` | `getArchivedMembers`, `saveMemberNote`, `getMemberNote`, `saveNMCheckItem`, `getNMChecklist` — no auth | **FIXED** (2026-06-15) |
| F-08 | CRITICAL | `handlers/growth.ts` | `respondGrowthTask` no auth — unauthenticated write | **FIXED** (2026-06-15) |
| F-09 | CRITICAL | `handlers/growth.ts` | `getRiskMembers`, `getGrowthData`, `getMentorActivity`, `getGrowthSheetData` no auth | **FIXED** (2026-06-15) |
| F-10 | CRITICAL | `handlers/growth.ts` | `getWeeklyActions` no auth; role spoofable via `p.role` | **FIXED** (2026-06-15) |
| F-11 | CRITICAL | `handlers/renewal.ts` | `getRenewal` no auth; role spoofable via `p.role` | **FIXED** (2026-06-15) |
| F-12 | CRITICAL | `handlers/members.ts` | `getNewMembers` conditional auth — skipped when no token/role | **FIXED** (2026-06-15) |
| F-13 | HIGH | `handlers/coaching.ts` | `nextTl` list-mode: `score>=50?'green'` wrong | **FIXED** (2026-06-15) |
| F-14 | HIGH | `handlers/coaching.ts` | `nextTl` single-member: `score>=50?'green'` wrong | **FIXED** (2026-06-15) |
| F-15 | CRITICAL | `handlers/auth.ts` | `changePIN` checked `p.role === 'mc'` (untrusted payload) | **FIXED** (2026-06-18) |
| F-16 | HIGH | `handlers/dashboard.ts` | 11 cases had no `requireAuth` — member score data exposed anonymously | **FIXED** (2026-06-18) |
| F-17 | HIGH | `handlers/growth.ts` | `getWeeklyActions` allowed mc/growth but errored on TEAM_ROLE lookup | **FIXED** (2026-06-18) |
| F-18 | HIGH | `handlers/power-teams.ts` | Destructive ops (`setPTMemberStatus`, `movePTMember`, etc.) lacked MC restriction | **FIXED** (2026-06-18) |
| F-19 | CRITICAL | `cron-jobs/index.ts` | `getMemberData` queried non-existent columns (`absence_pts`, `rgi_total`, `visitor_total`, `oto_total`, `absent_count`, `effective_weeks`) — view exposes `palms_detail` JSONB + `rg`, `visitors`, `one_to_one`, `absent` | **FIXED** (2026-06-18 post-impl audit) |
| F-20 | CRITICAL | `cron-jobs/index.ts` | `mentorTeamAlert` queried `mentor_teams.mentor_id` — column does not exist; `mentor_teams` only has `leader_name` TEXT | **FIXED** (2026-06-18 post-impl audit) |
| F-21 | HIGH | `public/index.html` | Mentor/growth theme buttons lost `.theme-btn` class during header cleanup; `toggleTheme()` JS wouldn't update their emoji on mode switch | **FIXED** (2026-06-18 post-impl audit) |
| F-22 | MEDIUM | `line-webhook/index.ts` | Unused imports `calcPalmsScore`, `trafficLight` — dead code causing Deno lint warnings | **FIXED** (2026-06-18 post-impl audit) |
| F-23 | MEDIUM | `migrations/022` | `call_cron_job()` only defined in seed (runs after migrations in Supabase CLI); migration would fail on fresh DB | **FIXED** (2026-06-18 post-impl audit) — added DO block guard |
| F-24 | MEDIUM | `handlers/notifications.ts` | All roles share one notifications pool; any role can dismiss any notification | **FIXED** (2026-06-19) — per-recipient receipts |
| F-25 | MEDIUM | `handlers/meetings.ts` | `updateVisitor` no ownership check; `saveSprintPlan` delete op no MC restriction | **FIXED** (2026-06-19) |
| F-26 | MEDIUM | `handlers/comms.ts` | `ackAssignment` no team ownership check | **FIXED** (2026-06-19) |
| F-27 | LOW | `handlers/dashboard.ts` | `getMentorActivity` / `getMentorPerformance` dead code — routing sends both to growth.ts | Known issue |
| F-33 | HIGH | `handlers/dashboard.ts` | `scoreHistory` in `getMemberDetail` / `getMyTeam` missing `year` + numeric `month` fields → frontend `(a.year*100+a.month)` sort returned NaN → chronological order broken | **FIXED** (2026-06-21) |
| F-34 | HIGH | `handlers/dashboard.ts` | `wks` in fastTrack block missing `Math.min(26,…)` cap in `getMemberDetail` (line 571) → long-tenure members show inflated referral/1-2-1 targets vs `computeGaps()` which was already capped | **FIXED** (2026-06-21) |
| F-35 | MEDIUM | `handlers/dashboard.ts` | `renewalSoon` field never set on member objects in `getDashboard` → mobile renewal badge (`.mr-act` "💳 Renewal ใกล้") never rendered | **FIXED** (2026-06-21) |
| F-36 | MEDIUM | `_shared/palms.ts` | `trafficLight(0)` returned `'black'` but SQL `fn_traffic_light(0)` returns `'none'` → `verifyScoring` reported false mismatches for zero-score members | **FIXED** (2026-06-21) |
| F-37 | MEDIUM | `handlers/public.ts` | `getSimulateData` never returned `scoreHistory` → TL Evolution dots in public member directory profile never rendered | **FIXED** (2026-06-21) |
| F-38 | MEDIUM | `handlers/public.ts` | `computeFastTrack()` missing `Math.min(26,…)` cap on `wks` → same inflated target bug as F-34 in public directory fast-track suggestions | **FIXED** (2026-06-21) |
| F-28 | LOW | `handlers/usage.ts` | `logUsage` no auth — analytics data pollutable | **FIXED** (2026-06-19) — central API auth gate |
| F-29 | LOW | `handlers/alerts.ts` | Stub handlers (dismissAlert, getDismissedAlerts, getTeamNotifs, etc.) no auth | **FIXED** (2026-06-19) — central API auth gate |
| F-30 | LOW | `handlers/public.ts` | Uses `getServiceClient()` (bypasses RLS) for public endpoints | **MITIGATED** (2026-06-19) — safe-column allowlists; contact PII removed |
| F-31 | LOW | `migrations/20260615000017_seed_growth_revenue.sql` | All `membership_age` seeded as `'#REF!'` (Excel artifact); runtime guards correctly | Known issue |
| F-32 | HIGH | `handlers/dashboard.ts` | `computeGaps()` line 109: `ftNextTl` returned goal tier ('green' for yellow-zone) instead of current tier | **FIXED** (2026-06-19) |

---

## Fixes Applied (Phase 4 — 2026-06-18 post-impl audit)

### FIX-19: `getMemberData` — wrong column names
**File:** `supabase/functions/cron-jobs/index.ts`
**Before:** Queried `absence_pts`, `referral_pts`, `visitor_pts`, `oto_pts`, `ceu_pts`, `tyfb_pts`, `effective_weeks`, `rgi_total`, `visitor_total`, `oto_total`, `absent_count` — none exist in `v_member_dashboard`.
**After:** Queries `palms_detail` (JSONB), `rg`, `visitors`, `one_to_one`, `absent` (actual view columns). `MemberRow` interface and `getTopAction()` updated to use `m.palms_detail.absence/referral/oneToOne/visitor/ceu` and `m.rg`/`m.visitors`/`m.one_to_one`.

### FIX-20: `mentorTeamAlert` — `mentor_id` column does not exist
**File:** `supabase/functions/cron-jobs/index.ts`
**Before:** `db.from('mentor_teams').select('name, mentor_id')` — `mentor_id` doesn't exist; returns null → all LINE lookups fail → no alerts sent.
**After:** Selects `name, leader_name` (TEXT), then resolves `leader_name → members.id` via `ilike` on name/nickname, then looks up `line_members.line_user_id` by that UUID.

### FIX-21: `index.html` theme buttons
**File:** `public/index.html`
**Before:** Mentor and Growth header theme buttons had class `hdr-btn-icon` only; `toggleTheme()` selector `.theme-btn,#themeBtn` missed them → emoji stayed ☀️ after switching to dark mode.
**After:** Theme buttons in both headers get class `hdr-btn-icon theme-btn`, caught by `.theme-btn` selector in `toggleTheme()`.

### FIX-22: Unused imports in line-webhook
**File:** `supabase/functions/line-webhook/index.ts`
**Before:** `import { calcPalmsScore, trafficLight } from '../_shared/palms.ts'` — neither function is called.
**After:** Import line removed.

### FIX-23: Migration 022 — `call_cron_job` dependency guard
**File:** `supabase/migrations/20260618000022_add_mentor_alert_cron.sql`
**Before:** Directly called `cron.schedule(... call_cron_job(...))` — would fail on fresh DB where seed hasn't run yet.
**After:** Added `DO $$ IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'call_cron_job') THEN CREATE FUNCTION ... END $$` guard before the schedule call.

### FIX-32: `computeGaps()` — `ftNextTl` returned goal tier instead of current tier
**File:** `supabase/functions/api/handlers/dashboard.ts` line 109
**Before:** `const ftNextTl = ftTarget >= 70 ? 'green' : 'yellow'` — returns 'green' for yellow-zone members (score 50–69) because their ftTarget is 70.
**After:** `const ftNextTl = totalScore >= 70 ? 'green' : totalScore >= 50 ? 'yellow' : totalScore >= 30 ? 'yellow' : 'red'` — returns current tier color, matching CLAUDE.md audit rule.

---

## Prior Fixes (Phase 4 — 2026-06-18 audit)

### FIX-15: `changePIN` — replace `p.role` bypass with `requireAuth`
Added `requireAuth(db, p, ['mc'])` to `changePIN`; removed `p.role === 'mc'` check on untrusted payload.

### FIX-16: `dashboard.ts` — 11 unauthenticated cases
Added `requireAuth(db, p, [...])` as first statement in `getDashboard`, `getMCData`, `getDesktopDashboard`, `getMemberDetail`, `getMyTeam`, `getMentorActivity`, `getChapterPulse`, `getLeaderboard`, `getScorecard`, `getMCCoaching`, `getCurrentMonth`.

### FIX-17: `getWeeklyActions` — narrow to mentor-only roles
`requireAuth(db, p, ['mc', 'toomtam', ...])` → `requireAuth(db, p, ['toomtam', 'aof', 'draft', 'phai', 'amp'])` — MC and growth were accepted but immediately rejected by TEAM_ROLE lookup, making them unusable.

### FIX-18: `power-teams.ts` — restrict destructive operations to MC
`setPTMemberStatus`, `movePTMember`, `moveSynMember`, `deletePTMember` now require `['mc']`.

---

## Code Cleanliness Notes

- **Dead cases in dashboard.ts:** `getMentorActivity` and `getMentorPerformance` are unreachable (ROUTES routes both to growth.ts). Secured with auth for defense-in-depth.
- **Seed data `#REF!`:** `migrations/20260615000017_seed_growth_revenue.sql` has Excel artifacts. Runtime handler guards correctly.
- **Duplicated absence log:** `getAbsenceLog` vs `getAbsenceLogRecent` in `line-admin.ts` differ only by limit(50) vs limit(10).
- **Hardcoded team names:** `TOOMTAM`, `Aof`, `Draft`, `PHAI`, `AMP` scattered across handlers. No central config — acceptable for this project size.
- **`v_member_dashboard` exposes `is_archived`:** View already filters archived members via WHERE clause; handler `.eq('is_archived', false)` filters are redundant but harmless.

---

## Integration Notes

- **ROUTES coverage:** All 80+ actions in ROUTES map to implemented handler cases. `importScoreHistory` confirmed in ROUTES (line 103 of index.ts) and guarded by `requireAuth(db, p, ['mc'])`.
- **Score display rule:** `display_score` from `v_member_dashboard` confirmed as `ms.score` (latest monthly_scores period). `GREATEST(monthly, official)` approach confirmed in view via LEFT JOIN.
- **NM Checklist denominator:** `CHECKLIST_TOTAL = 41` constant — never `items.length`. Confirmed.
- **Month key sort:** `(year * 100 + month)` numeric — correct. `sort_key` column in `v_score_history` confirmed.
- **`months = weeks / 4`:** No `4.333` remaining — confirmed in both TypeScript and SQL layers.
- **Anthropic model ID:** `claude-haiku-4-5` in checkin.ts — valid.
- **Role-based access:** All write operations require MC or specific mentor roles. Public endpoints (`getMemberDirectory`, `getSimulateData`, `getMemberPublicDetail`) remain unauthenticated — confirmed intentional.

---

## Known Issues (MEDIUM/LOW — deferred)

| # | Finding | Why deferred |
|---|---------|--------------|
| F-27 | Dead cases in dashboard.ts (`getMentorActivity`, `getMentorPerformance`) | Harmless dead code |
| F-30 | `getServiceClient()` in public.ts bypasses RLS | Public data only; no PII exposure |
| F-31 | Seed `membership_age = '#REF!'` | Runtime handler guards correctly; data not displayed |

# BNI IDEAL Mentor System — Audit Log

**Audit date:** 2026-06-18
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
| 4 — Fix CRITICAL/HIGH issues | Complete — 13 fixes applied |
| 5 — Write this log | Complete |
| 6 — Persist audit rules to CLAUDE.md | Already present — no change needed |

**File counts:** ~35 `.ts`, ~20 `.js`, ~12 `.html`, ~25 `.sql` (105 total)

---

## Findings Table

| # | Severity | File | Issue | Status |
|---|----------|------|-------|--------|
| F-01 | HIGH | `handlers/index.ts` | `deleteMember` missing from ROUTES | **FIXED** (2026-06-11 audit) |
| F-02 | HIGH | `handlers/alerts.ts` | `getAlertCenter` blocked non-MC roles | **FIXED** (2026-06-11 audit) |
| F-03 | HIGH | `_shared/palms.ts` | Visitor rate used `weeks / 4.333` | **FIXED** (2026-06-11 audit) |
| F-04 | HIGH | `handlers/dashboard.ts` | `nextTl` wrongly returned 'green' for yellow-zone members | **FIXED** (2026-06-11 audit) |
| F-05 | HIGH | `handlers/checkin.ts` | Invalid Anthropic model ID `claude-haiku-4-5-20251001` | **FIXED** (2026-06-11 audit) |
| F-06 | CRITICAL | `handlers/members.ts` | `ensureSlot` no auth — unauthenticated member insert | **FIXED** (2026-06-15 audit) |
| F-07 | CRITICAL | `handlers/members.ts` | `getArchivedMembers`, `saveMemberNote`, `getMemberNote`, `saveNMCheckItem`, `getNMChecklist` — no auth | **FIXED** (2026-06-15 audit) |
| F-08 | CRITICAL | `handlers/growth.ts` | `respondGrowthTask` no auth — unauthenticated write | **FIXED** (2026-06-15 audit) |
| F-09 | CRITICAL | `handlers/growth.ts` | `getRiskMembers`, `getGrowthData`, `getMentorActivity`, `getGrowthSheetData` no auth | **FIXED** (2026-06-15 audit) |
| F-10 | CRITICAL | `handlers/growth.ts` | `getWeeklyActions` no auth; role spoofable via `p.role` | **FIXED** (2026-06-15 audit) |
| F-11 | CRITICAL | `handlers/renewal.ts` | `getRenewal` no auth; role spoofable via `p.role` | **FIXED** (2026-06-15 audit) |
| F-12 | CRITICAL | `handlers/members.ts` | `getNewMembers` conditional auth — skipped when no token/role | **FIXED** (2026-06-15 audit) |
| F-13 | HIGH | `handlers/coaching.ts` | `nextTl` list-mode: `score>=50?'green'` wrong | **FIXED** (2026-06-15 audit) |
| F-14 | HIGH | `handlers/coaching.ts` | `nextTl` single-member: `score>=50?'green'` wrong | **FIXED** (2026-06-15 audit) |
| F-15 | CRITICAL | `handlers/auth.ts` | `changePIN` checked `p.role === 'mc'` (untrusted payload) — any caller could change any PIN | **FIXED** (this audit) |
| F-16 | HIGH | `handlers/dashboard.ts` | 9 cases (`getDashboard`, `getMCData`, `getDesktopDashboard`, `getMemberDetail`, `getMyTeam`, `getChapterPulse`, `getLeaderboard`, `getScorecard`, `getMCCoaching`, `getCurrentMonth`, `getMentorActivity`) had no `requireAuth` — full member score/contact data exposed anonymously | **FIXED** (this audit) |
| F-17 | HIGH | `handlers/growth.ts` | `getWeeklyActions` allowed `mc`/`growth` roles but immediately errored on TEAM_ROLE lookup — unusable even when authenticated | **FIXED** (this audit) |
| F-18 | HIGH | `handlers/power-teams.ts` | `setPTMemberStatus`, `movePTMember`, `moveSynMember`, `deletePTMember` — any authenticated role could archive members or move them between teams | **FIXED** (this audit) |
| F-19 | MEDIUM | `handlers/notifications.ts` | All roles share one notifications pool; any role can dismiss any notification (needs `target_role` column in DB) | Known issue — needs migration |
| F-20 | MEDIUM | `handlers/meetings.ts` | `updateVisitor` no ownership check; `saveSprintPlan` delete op no MC restriction | Known issue |
| F-21 | MEDIUM | `handlers/comms.ts` | `ackAssignment` no team ownership check | Known issue |
| F-22 | LOW | `handlers/dashboard.ts` | `getMentorActivity` / `getMentorPerformance` in dashboard.ts are dead code — routing sends both to growth.ts | Known issue |
| F-23 | LOW | `handlers/usage.ts` | `logUsage` no auth — analytics data pollutable | Known issue |
| F-24 | LOW | `handlers/alerts.ts` | `dismissAlert`, `getDismissedAlerts`, `getTeamNotifs`, `ackTeamNotifs`, `getUnreadCounts` are stubs with no auth | Known issue |
| F-25 | LOW | `handlers/public.ts` | Uses `getServiceClient()` (bypasses RLS) for public endpoints — `getAnonClient()` would be safer | Known issue |
| F-26 | LOW | `migrations/20260615000017_seed_growth_revenue.sql` | All `membership_age` values seeded as `'#REF!'` (Excel artifact); runtime handler guards against this | Known issue |

---

## Fixes Applied (Phase 4 — this audit)

### FIX-15: `changePIN` — replace `p.role` bypass with `requireAuth`
**File:** `supabase/functions/api/handlers/auth.ts`
**Before:** `if (callerRole !== 'mc') { ... }` where `callerRole = String(p.role)` — any request with `role: 'mc'` in payload bypassed auth entirely.
**After:** `const authResult = await requireAuth(db, p, ['mc']); if (!authResult.ok || !authResult.isMC) return error;`
Also added `requireAuth` to import from `_shared/auth.ts`.

### FIX-16: `dashboard.ts` — 11 unauthenticated cases
**File:** `supabase/functions/api/handlers/dashboard.ts`
Added `requireAuth(db, p, [...])` as first statement in each open case:
- `getDashboard`/`getMCData`/`getDesktopDashboard` → any mentor/mc/growth role
- `getMemberDetail` → any mentor/mc/growth role
- `getMyTeam` → any role; `role` now derived from `auth.role` not `p.role`
- `getMentorActivity` → any authenticated role
- `getChapterPulse` → any authenticated role
- `getLeaderboard` → any authenticated role
- `getScorecard` → any authenticated role
- `getMCCoaching` → `['mc']` only (full cross-team coaching pipeline)
- `getCurrentMonth` → any authenticated role

### FIX-17: `getWeeklyActions` — narrow to mentor-only roles
**File:** `supabase/functions/api/handlers/growth.ts`
**Before:** `requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp', 'growth'])` — MC and growth were allowed but immediately rejected by `TEAM_ROLE[role]` lookup.
**After:** `requireAuth(db, p, ['toomtam', 'aof', 'draft', 'phai', 'amp'])` — only roles that have a corresponding team entry.

### FIX-18: `power-teams.ts` — restrict destructive operations to MC
**File:** `supabase/functions/api/handlers/power-teams.ts`
- `setPTMemberStatus`: `requireAuth(db, p)` → `requireAuth(db, p, ['mc'])` — archives/unarchives members
- `movePTMember`/`moveSynMember`: same — moves members between teams
- `deletePTMember`: same — deletes power_teams pairs

---

## Code Cleanliness Notes (Phase 2)

- **Dead cases in dashboard.ts:** `getMentorActivity` and `getMentorPerformance` (lines 533–554) are unreachable — ROUTES routes both to `growth.ts`. Now secured with auth for defense-in-depth but still dead code.
- **Seed data with `#REF!`:** `migrations/20260615000017_seed_growth_revenue.sql` has Excel artifacts as `membership_age`. Runtime handler guards correctly.
- **Duplicated absence log:** `getAbsenceLog` vs `getAbsenceLogRecent` in `line-admin.ts` differ only by limit(50) vs limit(10).
- **Hardcoded team names:** `TOOMTAM`, `Aof`, `Draft`, `PHAI`, `AMP` scattered across all handlers. No central config — acceptable for this project size.

---

## Integration Notes (Phase 3)

- **ROUTES coverage:** All 80+ actions in ROUTES map to implemented handler cases. `updateRenewalStatus` (new in renewal.ts) confirmed present in ROUTES at line 93 of index.ts.
- **Score display rule:** `GREATEST(COALESCE(ms.score,0), COALESCE(r.official_pts,0))` as `display_score` in `v_member_dashboard` — confirmed in all handlers.
- **NM Checklist denominator:** `CHECKLIST_TOTAL = 41` constant — never `items.length`. Confirmed.
- **8W threshold:** All `bniDays <= 56` — prior 84-day bug confirmed fixed.
- **Month key sort:** `(year * 100 + month)` numeric — correct.
- **`months = weeks / 4`:** No `4.333` remaining — confirmed.
- **Anthropic model ID:** `claude-haiku-4-5` in checkin.ts — valid.
- **Role-based access matrix post-fixes:** All write operations require MC or specific mentor roles. `getMCCoaching` restricted to `['mc']`. Public endpoints (`getMemberDirectory`, `getSimulateData`, `getMemberPublicDetail`) remain unauthenticated — confirmed intentional.

---

## Known Issues (MEDIUM/LOW — deferred)

| # | Finding | Why deferred |
|---|---------|--------------|
| F-19 | Notifications pool shared across all roles | Needs schema migration (add `target_role` column) |
| F-20 | `updateVisitor`/`saveSprintPlan` missing ownership checks | Low exploitability; data is non-sensitive |
| F-21 | `ackAssignment` no team ownership check | Low exploitability |
| F-22 | Dead code in dashboard.ts | Harmless; cleanup only |
| F-23 | `logUsage` no auth | Analytics pollution only; no PII |
| F-24 | Alert stub endpoints no auth | No DB access; stubs return static data |
| F-25 | `public.ts` uses service client | RLS defense-in-depth improvement only |
| F-26 | Seed `#REF!` artifacts | Runtime-guarded; cosmetic DB cleanup |

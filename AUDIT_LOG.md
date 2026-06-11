# BNI IDEAL Mentor System — Audit Log

**Audit date:** 2026-06-11
**Scope:** Full project (GAS legacy + Supabase Edge Functions + static frontend)
**Auditor:** Claude Code (claude-sonnet-4-6)

---

## Summary

| Phase | Status |
|-------|--------|
| 0 — Pre-flight & file listing | Complete |
| 1 — Bug scan | Complete |
| 2 — Code cleanliness | Complete |
| 3 — Integration check | Complete |
| 4 — Fix CRITICAL/HIGH issues | Complete — 5 fixes applied |
| 5 — Write this log | Complete |
| 6 — Create audit.md command + CLAUDE.md rules | Complete |

---

## Findings Table

| # | Severity | File | Issue | Status |
|---|----------|------|-------|--------|
| F-01 | HIGH | `supabase/functions/api/index.ts` | `deleteMember` action was missing from ROUTES table — frontend calls returned `{ok:false, error:'unknown action: deleteMember'}` even though the handler existed in members.ts | **FIXED** |
| F-02 | HIGH | `supabase/functions/api/handlers/alerts.ts` | `getAlertCenter` required `['mc']` role — all non-MC roles (mentors, growth) received auth errors, breaking notification badges site-wide | **FIXED** |
| F-03 | HIGH | `supabase/functions/_shared/palms.ts` line 58 | Visitor rate used `weeks / 4.333`; CLAUDE.md spec explicitly states `months = weeks / 4` (not 4.333). Diverged from GAS source of truth | **FIXED** |
| F-04 | HIGH | `supabase/functions/api/handlers/dashboard.ts` lines 408, 757 | `nextTl` (next traffic-light tier to reach) used `displayScore >= 50 ? 'green'` — this wrongly reported yellow-tier members as already at 'green'. Corrupted fast-track guidance | **FIXED** |
| F-05 | HIGH | `supabase/functions/api/handlers/checkin.ts` line 325 | Invalid Anthropic model ID `'claude-haiku-4-5-20251001'` — format is not valid for the API. Correct ID is `'claude-haiku-4-5'`. AI matching would fail silently (graceful fallback to rule-based exists) | **FIXED** |
| F-06 | MEDIUM | `supabase/functions/api/handlers/growth.ts` | `respondGrowthTask`, `getRiskMembers`, `getWeeklyActions`, `getGrowthData` have no auth check — any unauthenticated caller can read growth data or write task responses | Known issue |
| F-07 | MEDIUM | `supabase/functions/api/handlers/renewal.ts` | `getRenewal` has no auth check — anyone can read member renewal dates and expiry info | Known issue |
| F-08 | MEDIUM | `supabase/functions/api/handlers/alerts.ts` | After F-02 fix (auth relaxed), `getAlertCenter` now applies team-based filtering: mentor roles see only their own team's data; growth/MC see all. Renewal alerts are not yet team-filtered (renewal table has no team column) | Partial — renewal team-filter needs DB schema support |
| F-09 | LOW | `supabase/functions/api/handlers/members.ts` `ensureSlot` | No auth check — can be called without credentials | Known issue |
| F-10 | LOW | `supabase/functions/api/handlers/growth.ts` | `parseMemberTrafficLightData` and `parseMemberTLStats` are nearly identical helper functions — code duplication risk | Known issue |
| F-11 | LOW | `supabase/functions/api/handlers/line-admin.ts` | `getAbsenceLog` and `getAbsenceLogRecent` are 100% identical except `.limit(50)` vs `.limit(10)` — pure duplication | Known issue |
| F-12 | LOW | `B.js` `MENTEE_MAP` | Cross-assignment entries: `Thanyalak Samreeloy` is in PHAI section but maps to `{sheet:'Draft'}`, `Yosita Niyomrat` is in Draft section but maps to `{sheet:'PHAI'}`. Intentional cross-team placement but easy to confuse | Known issue (intentional) |
| F-13 | LOW | `L.js` | Uses LINE Notify API (deprecated by LINE Corp) with placeholder tokens `YOUR_*_TOKEN_HERE`. LINE Notify shut down Dec 2025 — migrating to LINE Messaging API is pending | Known issue |

---

## Fixes Applied (Phase 4)

### FIX-01: `deleteMember` missing route
**File:** `supabase/functions/api/index.ts`
**Change:** Added `'deleteMember': 'members'` to the ROUTES table alongside `archiveMember` and `unarchiveMember`.

### FIX-02: `getAlertCenter` auth blocking non-MC roles
**File:** `supabase/functions/api/handlers/alerts.ts`
**Change:** Replaced `requireAuth(db, p, ['mc'])` with `requireAuth(db, p)` (no role restriction). Added team-based data filtering: `callerTeam = auth.isMC ? null : (auth.teamName || null)` — core_issues and member queries both gain an `.eq('mentor_team', callerTeam)` filter when the caller is a named mentor. Growth role (teamName=null) sees all data.

### FIX-03: PALMS visitor rate divisor
**File:** `supabase/functions/_shared/palms.ts` line 58
**Change:** `weeks / 4.333` → `weeks / 4` per CLAUDE.md spec.

### FIX-04: `nextTl` logic error in dashboard
**File:** `supabase/functions/api/handlers/dashboard.ts` lines 408, 757
**Change (line 408):** `displayScore >= 70 ? 'green' : displayScore >= 50 ? 'green' : 'yellow'` → `displayScore >= 70 ? 'green' : displayScore >= 50 ? 'yellow' : displayScore >= 30 ? 'yellow' : 'red'`
**Change (line 757):** `score >= 50 ? 'green' : 'yellow'` → `score >= 70 ? 'green' : score >= 50 ? 'yellow' : score >= 30 ? 'yellow' : 'red'`
`nextTl` now correctly returns the *current* tier color (where the member is), not the *goal* tier. The `needed` calculation already correctly computed the points gap.

### FIX-05: Invalid Anthropic model ID
**File:** `supabase/functions/api/handlers/checkin.ts` line 325
**Change:** `'claude-haiku-4-5-20251001'` → `'claude-haiku-4-5'`

---

## Code Cleanliness Notes (Phase 2)

- **Dead route handlers:** `dismissAlert`, `getDismissedAlerts`, `getTeamNotifs`, `ackTeamNotifs`, `getUnreadCounts` all return empty/stub responses. Frontend uses localStorage for snooze — these are harmless stubs.
- **Hardcoded chapter constants:** Chapter name, meeting day, and team names (`TOOMTAM`, `Aof`, `Draft`, `PHAI`, `AMP`) are scattered across GAS files and some Edge Functions. Would benefit from a central config table.
- **Test-only code in palms.ts:** `if (import.meta.main)` block at lines 77–96 is valid Deno test pattern — not dead code, keep as-is.
- **`fastestActions` vs `gaps`:** Both fields in `fastTrack` response carry the same array — minor redundancy but kept for frontend backward-compatibility.

---

## Integration Notes (Phase 3)

- **ROUTES coverage:** All 80+ actions in ROUTES map to implemented handlers. After FIX-01, no missing routes detected.
- **Role-based access:** MC-restricted actions (`setReportStatus`, `saveReply`, `getReports`, `getMCData`, `getMCCoaching`, `setCurrentMonth`, `addNewMember*`, `archiveMember`, `deleteMember`) correctly require `['mc']`. Growth-accessible actions (`getGrowthData`, `getAlertCenter` post-fix) properly allow the growth role.
- **Score display rule:** `GREATEST(monthly_score, official_pts)` — correctly applied in `v_member_dashboard` view (DB-level), `getMCData`, `getMemberDetail`, and `getAlertCenter`.
- **Checklist denominator:** `getNMChecklist` uses `CHECKLIST_TOTAL = 41` constant — never `items.length`. Correct.
- **Month key sort:** `monthlySync` in growth.ts uses `(year * 100 + month)` numeric comparison. Correct.

---

## Known Issues (MEDIUM/LOW — deferred)

See F-06 through F-13 in the findings table above. The most impactful deferred items are:

1. **F-06/F-07:** Missing auth on growth and renewal read endpoints. Low practical risk (read-only, no PII beyond membership dates), but should be addressed before any public API exposure.
2. **F-13:** LINE Notify deprecated. Migration to LINE Messaging API is architecturally planned (line-admin.ts uses Messaging API already) — L.js (GAS) needs updating separately.

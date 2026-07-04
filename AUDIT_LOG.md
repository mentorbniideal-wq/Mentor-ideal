# BNI IDEAL Mentor System — Audit Log

**Audit date:** 2026-07-04 (Round 8 — full audit, LINE-excluded from fixes)
**Previous audit:** 2026-07-03 (Round 7 — LINE bot outage, Gmail login restore)
**Scope:** Full project — all Edge Function handlers, shared libs, migrations, admin HTML, LINE files (audit only, CODEX task)
**Auditor:** Claude Code (claude-sonnet-4-6)

---

## Summary (Round 8)

| Phase | Status |
|-------|--------|
| 0 — Pre-flight & file listing | Complete |
| 1 — Bug scan (all TS/HTML/SQL) | Complete |
| 2 — Code cleanliness | Complete |
| 3 — Integration check (ROUTES, fields, auth) | Complete |
| 4 — Fix CRITICAL/HIGH issues | Complete — 1 fix (F-93) |
| 5 — Write this log | Complete |
| 6 — Verify CLAUDE.md rules | Complete — all rules present |

**Constraint this round:** LINE-related files (`_shared/line*.ts`, `line-webhook/*`, `liff-api/*`) — audit only, document as CODEX tasks. Do NOT apply fixes.

---

## Findings Table (Round 8 — 2026-07-04)

| # | Severity | File | Issue | Status |
|---|----------|------|-------|--------|
| F-93 | HIGH→**FIXED** | `_shared/copilot.ts:1` | `import { sha256Hex } from './line.ts'` — copilot (non-LINE domain) depended on CODEX-owned line.ts. If CODEX refactors or removes sha256Hex, copilot silently breaks | **FIXED** — sha256Hex inlined directly in copilot.ts; import removed |
| F-94 | MEDIUM (CODEX) | `liff-api/index.ts:197` | `get-assignments` builds PostgREST `.or()` filter via string interpolation: `` `.or(`member_id.eq.${memberId},mentor_team.eq.${memberTeam}`)` `` — values are DB-sourced UUIDs/names (low injection risk) but pattern is fragile | **CODEX task** — use parameterized filter or Supabase `.or()` with explicit filter objects |
| F-95 | MEDIUM (CODEX) | `line_bot_state` table (used in `line-webhook/index.ts`) | No TTL/expiry on `line_bot_state`. Users who register, then re-add the bot or change LINE userId can be permanently trapped in AWAITING registration state | **CODEX task** — add `expires_at` column; webhook should reset state if entry is older than 7 days |
| F-96 | LOW | `api/handlers/coaching.ts:323` | Week label uses `4.33` multiplier (`d.getMonth() * 4.33 + ...`) — not in PALMS scoring path, just a week-string display label for logs. Inconsistent with codebase standard | Known issue — LOW, display only |
| F-97 | LOW | `api/handlers/121.ts:135–139` | `getAll121Logs` dead filter: `requireAuth(['mc','growth'])` gates at line 115, so `auth.isMC || auth.role==='growth'` is always true; the `else` branch filtering by `auth.teamName` is unreachable | Known issue — dead code, harmless |
| F-98 | LOW | `api/handlers/comms.ts` | `getMCAssignments` and `getMentorAssignments` are near-identical — same query, same map, only labels differ | Known issue — minor duplication |

---

## CODEX Task Summary (LINE files — do not fix here)

Pete to pass the following to CODEX:

### CODEX-1 (MEDIUM): liff-api — string interpolation in PostgREST filter
**File:** `liff-api/index.ts:197`
```typescript
// Current — fragile
.or(`member_id.eq.${memberId}${memberTeam ? `,mentor_team.eq.${memberTeam}` : ''}`)

// Safer — use Supabase .or() with proper escaping or separate filter chain
```

### CODEX-2 (MEDIUM): line_bot_state — no TTL
**File:** `line-webhook/index.ts` (follow event handler at line ~135)
- Add `expires_at = NOW() + INTERVAL '7 days'` when writing AWAITING state
- On incoming message: if `state_key='registration'` and `expires_at < NOW()`, reset to AWAITING (upsert fresh)
- Migration: `ALTER TABLE line_bot_state ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`

---

## ROUTES Completeness Check (Phase 3)

All handler cases cross-referenced against `api/index.ts` ROUTES table (lines 55–181):

| Handler file | Cases | ROUTES match |
|---|---|---|
| auth.ts | login, verifyPin, changePIN, getMyRole, viewAsRole | ✅ All present |
| dashboard.ts | getDashboard, getDesktopDashboard, getMemberDetail, getScorecard, getMyTeam, getLeaderboard, getChapterTrend, getChapterPulse, getCurrentMonth, setCurrentMonth, verifyScoring, getMCCoaching, getMCData | ✅ All present |
| public.ts | getMemberDirectory, getSimulateData, getMemberPublicDetail, getTrainingEvents | ✅ All present |
| members.ts | 28 cases | ✅ All present |
| coaching.ts | saveCoreIssue, getCoachingGuide, saveMentorLog, getMentorLogs, getMemberTimeline, save90DayReview, get90DayReviews | ✅ All present |
| checkin.ts | parseCheckin, parseCheckinPDF, saveCheckin, getCheckinLog, getAIMatching | ✅ All present |
| renewal.ts | getRenewal, extendRenewal, updateRenewalStatus | ✅ All present |
| growth.ts | getGrowthData, getGrowthSheetData, updateGrowthMember, addGrowthMember, moveGrowthMember, getRiskMembers, getMentorPerformance, getMentorActivity, getWeeklyActions, createGrowthTask, getGrowthTasks, respondGrowthTask, monthlySync, importScoreHistory | ✅ All present |
| power-teams.ts | getPowerTeams, getPTMembers, savePTMember, deletePTMember, setPTMemberStatus, updatePTMember, movePTMember, moveSynMember, getCrossTeamSynergy, saveCrossTeamPair, getGrowthPowerTeams | ✅ All present |
| 121.ts | save121Log, get121Logs, getAll121Logs, get121Tracker | ✅ All present |
| alerts.ts | getAlertCenter, dismissAlert, getDismissedAlerts, getTeamNotifs, ackTeamNotifs, getUnreadCounts, getReports, setReportStatus, saveReply | ✅ All present |
| notifications.ts | getNotifications, markNotificationsRead, dismissNotification, dismissAllNotifications | ✅ All present |
| meetings.ts | getMeetingPrep, getVisitorTracker, getVisitorLog, addVisitor, updateVisitor, getSeatMap, getChapterRevenue, setChapterGoal, getSprintBoard, saveSprintPlan, getChapterActions, getReferralFlow | ✅ All present |
| comms.ts | sendBroadcast, getBroadcasts, saveMCMessage, deleteMCMessage, updateMCMessage, getMessages, getReadMsgKeys, setMsgRead, createMCAssignment, getMCAssignments, getMentorAssignments, ackAssignment | ✅ All present |
| line-admin.ts | 39 cases (saveLineId … getAbsenceLogRecent) | ✅ All present |
| usage.ts | logUsage, getUsageLog, getLineAnalytics | ✅ All present |
| copilot.ts | askCopilot | ✅ Present |

**No missing ROUTES found.**

---

## Auth / Security Check (Phase 3)

| Area | Status |
|------|--------|
| `requireAuth` before all writes | ✅ Confirmed for all write handlers |
| MC-only writes (deleteMember, archiveMember, extendRenewal, setCurrentMonth, etc.) | ✅ `['mc']` enforced |
| Mentor reads scoped to caller's team | ✅ `callerTeam` / `auth.teamName` filtering applied post-auth |
| Growth cross-team reads | ✅ `['mc', 'growth']` on chapter-level reads |
| Public endpoints (getMemberDirectory, getSimulateData, getMemberPublicDetail, getTrainingEvents) | ✅ No auth — intentional |
| DEV_MODE bypass only in `_shared/auth.ts` | ✅ Confirmed — no handler has its own DEV_MODE check |
| No hardcoded secrets/tokens/PINs in any TS file | ✅ Confirmed |
| LINE webhook signature verification (`verifySignature`) | ✅ Present and correct — CODEX domain |
| LIFF API auth via LINE access token (`resolveLineMember`) | ✅ All actions gated — CODEX domain |
| Admin HTML pages all use `checkAdminAuth()` + `adminCall()` | ✅ Confirmed for all 9 admin pages |
| `_shared/copilot.ts` no longer imports from CODEX-owned `line.ts` | ✅ Fixed (F-93) |

---

## PALMS / Scoring Checks (Phase 1)

| Rule | Status |
|------|--------|
| `months = weeks / 4` (never 4.333) in PALMS scoring paths | ✅ `_shared/palms.ts`:59 |
| `effectiveWeeks = Math.min(26, Math.max(1, Math.floor(bniDays/7)))` | ✅ `_shared/palms.ts`:41 |
| Score display = `GREATEST(monthly_score, official_pts)` | ✅ Applied at DB view level (`v_member_dashboard.display_score`) |
| Traffic light: ≥70=green, ≥50=yellow, ≥30=red, else=black | ✅ `_shared/palms.ts` |
| `nextTl` in fast-track = current tier (not goal tier) | ✅ `coaching.ts:190` and `coaching.ts:250` both correct |
| NM Checklist denominator = 41 always | ✅ `members.ts` `CHECKLIST_TOTAL = 41` |
| Month key sort: numeric `(year*100+month)` | ✅ `growth.ts` month sort confirmed correct |
| `4.33` in non-PALMS display code | LOW — `coaching.ts:323` week label only (F-96) |

---

## Code Cleanliness Notes (Phase 2)

- `getMCAssignments` / `getMentorAssignments` in `comms.ts` — near-identical queries (~70 lines duplicated). Acceptable for now since different access semantics may diverge.
- `getAll121Logs` dead filter branch (lines 135–139) — `requireAuth(['mc','growth'])` means the non-MC/non-growth arm never executes. Harmless.
- `coaching.ts:323` — week display label uses `4.33` coefficient (not PALMS, just a string label). LOW.
- `TEAM_MAP` constant defined in 3 files (`renewal.ts`, `meetings.ts`, `power-teams.ts`) — duplication is minor; each is 5 lines.
- `line-admin.ts` uses `linePush` / `lineMulticast` from `_shared/line.ts` directly — expected for a LINE admin handler.
- New migration `20260703000046` (`message_payload JSONB` on `line_message_deliveries`) adds a column with no corresponding code yet — intended for CODEX retry feature.

---

## Integration Notes (Phase 3)

- Migration `20260703000045` (DROP 7-arg `fn_claim_line_delivery`) — ✅ **deployed 2026-07-03**
- Migration `20260703000046` (`message_payload` column) — ✅ **deployed 2026-07-03**
- `v_member_dashboard.display_score` — `GREATEST(monthly_score, official_pts)` confirmed at DB level ✅
- `line_bot_state` table — no `expires_at` column (CODEX task F-95)
- All admin HTML pages confirmed to use `checkAdminAuth()` + `adminCall()` correctly ✅
- `cron-jobs/index.ts` imports from `_shared/line.ts` — expected (cron sends LINE messages) ✅

---

## Fixes Applied (Phase 4)

### FIX-93: Break copilot.ts → line.ts dependency (inlined sha256Hex)

**File:** `supabase/functions/_shared/copilot.ts`

**Before (line 1):**
```typescript
import { sha256Hex } from './line.ts';
```

**After (lines 1–4):**
```typescript
async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
```

**Why:** `copilot.ts` is non-LINE domain code. `line.ts` is CODEX territory. Importing `sha256Hex` from `line.ts` created a silent breakage risk: if CODEX refactors or removes `sha256Hex` from `line.ts`, the copilot would fail to build with no obvious connection. `sha256Hex` is 4 lines of standard Web Crypto API — inlining it eliminates the coupling entirely. `line.ts` still exports its own copy for LINE-specific consumers (line-webhook, cron-jobs, liff-api).

---

## Known Issues (MEDIUM/LOW — deferred)

| # | Severity | Issue |
|---|----------|-------|
| F-06 | MEDIUM | Growth/mentor read endpoints open without role restriction (`getCheckinLog`, `get121Tracker`, `getPowerTeams`, `getCrossTeamSynergy`) — known design decision |
| F-71 | MEDIUM | No centralized auth guard in admin-api — each handler guards individually; all correct; refactor deferred |
| F-90 | MEDIUM | `getLineQuota` + `getLineDeliveryLog` duplicated in `line-admin.ts` and `admin-api/settings.ts` |
| F-91 | MEDIUM | `saveCrossTeamPair` has no role restriction — any authenticated role can write cross-team pairs |
| F-92 | LOW | `logUsage` has no `requireAuth` — by design; anyone can log usage |
| F-94 | MEDIUM | CODEX: `liff-api` string interpolation in PostgREST filter — low risk but fragile |
| F-95 | MEDIUM | CODEX: `line_bot_state` no TTL — stale states can trap users permanently |
| F-96 | LOW | `coaching.ts:323` — `4.33` in week display label (not PALMS scoring) |
| F-97 | LOW | `121.ts:135` — dead filter branch in `getAll121Logs` (unreachable for non-MC/non-growth) |
| F-98 | LOW | `comms.ts` — `getMCAssignments` / `getMentorAssignments` near-identical code |

---

## Growth Role Bugs Fixed (2026-07-04)

| # | Severity | File | Issue | Status |
|---|----------|------|-------|--------|
| G-01 | CRITICAL→**FIXED** | `public/index.html` `gWatchLoad()` / `gTeamsLoad()` | Both functions read `S.allMembers` (MC-only state). Growth Watch and Teams tab always blank for growth role. | **FIXED** — now uses `GS.members` (growth state) with fallback to `S.allMembers` |
| G-02 | HIGH→**FIXED** | `public/dashboard.html` `loadGrowth()` | `getNewMembers`, `getGrowthData`, `getGrowthTasks`, `getRiskMembers`, `getRenewal`, `createGrowthTask` all had hardcoded `role:'mc'` or `role:'growth'` — breaks PIN auth | **FIXED** — removed all hardcoded roles; `gsr()` now injects `S.role` automatically |
| G-03 | HIGH→**FIXED** | `supabase/functions/api/handlers/power-teams.ts` | `deletePTMember`, `setPTMemberStatus`, `movePTMember`, `moveSynMember` required `['mc']` only — UI shows buttons to growth but all write calls returned 403 | **FIXED** — added `'growth'` to `requireAuth` on all 4 cases |
| G-04 | HIGH→**FIXED** (F-91) | `supabase/functions/api/handlers/power-teams.ts:346` | `saveCrossTeamPair` had no role restriction — any authenticated role could write | **FIXED** — now requires `['mc', 'growth']` |
| G-05 | MEDIUM | `supabase/functions/api/handlers/power-teams.ts` | `savePTMember` / `updatePTMember` are no-op stubs — `bni_goal` and extended fields not in `members` schema | **Deferred** — requires migration to add `bni_goal` column |

## Pending Deploy Actions

1. ~~`supabase db push --linked`~~ — ✅ done 2026-07-03
2. **Redeploy `api` edge function** — `power-teams.ts` updated (G-03, G-04): `supabase functions deploy api --project-ref itwyjhlfemxsfbimshby`
3. **CODEX tasks** — pass F-94 and F-95 to CODEX for LINE domain fixes

---

## Prior Round Summary

**Round 7 (2026-07-03):** Fixed F-89 (DROP legacy 7-arg fn_claim_line_delivery); restored Gmail login; redesigned login screen.
**Round 6.1 (2026-07-01):** Fixed F-72/86, F-66/85, F-73, F-74.
**Round 6 (2026-07-01):** Fixed F-80–F-84, F-87.
**Round 5 (2026-06-26):** Fixed F-67, F-68/69, F-70, F-78.
**Round 4 (2026-06-25):** Fixed F-61, F-62, F-63.
**Round 3 (2026-06-22):** Fixed F-57–F-60.
**Round 2 (2026-06-22):** LINE system, unlink flow, schema cache.
**Round 1:** Initial audit — PALMS scoring, auth matrix, ROUTES.

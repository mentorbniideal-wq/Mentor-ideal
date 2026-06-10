# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Google Apps Script (GAS)** project for BNI IDEAL Chapter — a mentor management system deployed as a WebApp backed by Google Sheets. All `.js` files are GAS scripts; there is no Node.js, no package manager, and no local runtime.

## Deployment

```bash
clasp push          # Push all local files to Apps Script
clasp deploy        # Create a new deployment version
clasp open          # Open the script in browser editor
```

The script ID is in `.clasp.json`. After `clasp push`, open the Apps Script editor → Deploy → Manage Deployments to publish a new WebApp version. The WebApp is configured as `executeAs: USER_DEPLOYING, access: ANYONE_ANONYMOUS`.

There are no tests, no build step, and no linter. Changes go live after `clasp push` + redeploy.

**Quick deploy (active deployment ID):**
```bash
clasp push && clasp deploy --deploymentId AKfycbwPXGSB6qHYBAtXlkNxwB6bPbUFoUyoN_gLPr323U2wQRD7Vm_ru1bWqNEo4QiBH2HK
```

## Architecture

### Script files (A–N naming)

Each lettered `.js` file is a self-contained GAS script focused on one feature area:

| File | Role |
|------|------|
| `WEBAPP.js` | Main WebApp server — `doGet()`, `dispatch()`, all API handlers, PALMS scoring engine |
| `Code.js` (Script A) | Builds "📥 UPDATE SCORES" and "👀 NON-MENTOR" sheets |
| `B.js` (Script B) | Syncs CSV → Mentor Sheets → Master List; contains `MENTEE_MAP` |
| `Coach.js` | `onOpen()` menus, coaching sheet builder, renewal check |
| `C.js` | Shared style utilities (`styleCell`, `addBorder`, color constants `C`) |
| `D.js` | Builds central "📊 ALL SCORES" sheet from all sources |
| `E.js` | Quick fix: update Non-Mentor scores in master list |
| `F.js` | Reporting2You data sync |
| `G.js` | Mentor Team Scorecard with grades (A/B/C/D) |
| `J.js` | 1-Click CSV Importer dialog (Traffic Lights + Reporting2You) |
| `K.js` | ACTION LOGS sheet — mentor accountability tracker |
| `L.js` | LINE Notify proactive trigger (Thursday 07:00) |
| `CheckIn_System.js` | Check-in sheet setup and WebApp server functions |
| `CheckIn_ParseText.js` | Text-based check-in parsing |
| `CheckIn_ParsePDF.js` | PDF-based check-in parsing |
| `RuleMatching.js` | Rule-based 1-2-1 business matching engine (replaces AI matching) |
| `Reports_API.js` | MC-only core issue reports API |
| `ScriptN_UpdateGivenReceived.gs.js` | One-time Given/Received data update |
| `SystemCheck.js` | Full system health check across all sheets |

### HTML files

- `dashboard.html` — Desktop WebApp UI (dark theme, Chart.js, role-based tabs)
- `index.html` — Mobile/Growth WebApp UI
- `CheckIn.html` — Check-in interface

### Google Sheets structure

All business data lives in the backing Spreadsheet. Scripts must find sheets by name:

**Core sheets (required):**
- `รายชื่อทั้งหมด` — Master member list; data starts row 3; col B=name, C=nick, D=mentor, E=latest score, G=given(฿), H=received(฿)
- `Reporting2You` — BNI performance import; data starts row 2; col 1=member, 2=RG, 3=RR, 4=Visi, 5=1-2-1, 6=CEU, 7=TYFCB, 8=Points, 9=BNI Days, 10=P, 11=A

**Mentor sheets** (one per mentor): `TOOMTAM`, `Aof`, `Draft`, `PHAI`, `AMP`
- Data rows 4–11; col C=member name, D=nick, E=JAN score … P=DEC score, X=core issue JSON

**Generated/managed sheets:** `📊 DASHBOARD`, `📥 UPDATE SCORES`, `👀 NON-MENTOR`, `📜 ACTION LOGS`, `📋 CHECKIN LOG`, `REPORTING2YOU_SYNC`, `📊 ALL SCORES`

### WebApp request flow

`doGet(e)` → parses `e.parameter` → `dispatch(action, payload)` → individual `api*()` functions → returns `ContentService` JSON.

Authentication is PIN-based. Roles: `mc` (full access), `toomtam`/`aof`/`draft`/`phai`/`amp` (mentor), `growth`. PINs are hardcoded in `PINS` object in `WEBAPP.js`.

Public endpoints (no role required): `getMemberDirectory`, `getSimulateData`, `getMemberPublicDetail`.

### PALMS Scoring (in `WEBAPP.js`)

`calcPALMSScore(d)` computes a 0–100 score from 6 components. **Critical thresholds** verified against real BNI data:
- Absence (15 pts): 0 abs→15, 1→10, 2→5, 3+→0
- Referral/week (15 pts): ≥2→15, ≥1→10, else→0 (no 5-pt tier)
- Visitor/month (20 pts): ≥1/mo→20, any→10, else→0
- 1-2-1/week (15 pts): ≥2→15, ≥1→10, >0→5
- CEU (20 pts): ≥4→20, 3→15, ≥2→10, ≥1→5
- TYFB (15 pts): ≥฿500k→15, ≥฿200k→10, ≥฿100k→5

Color thresholds: ≥70=green, ≥50=yellow, ≥30=red, else=black. `runTests()` in `WEBAPP.js` validates against 7 reference members.

**Score display rule (all APIs):** always use `Math.max(masterSheetColE, r2yOfficialPts)` — never show only one source. Applied in `apiGetDesktopDashboard`, `apiGetMCData`, `apiGetMemberDetail`, `apiGetAlertCenter`.

**Period calculation:** effective weeks = `Math.min(26, Math.max(1, Math.floor(bniDays/7)))`. `bniDays` in R2Y col 9 is total membership days, NOT the period length — never use it raw as a week count.

**Gap calculation:** `months = weeks / 4` (not 4.333). Visitor gap uses `ceil(months) - currentVisitors`.

### Member name mapping

`MENTEE_MAP` in `B.js` maps full English names → `{ sheet, row }`. Members with `sheet:'NONE'` are non-mentored (President, LT mentors). This map must be updated manually when new members join. `syncScoresFromCSV()` also builds a dynamic map from live sheet data to catch members added via WebApp.

### Monthly score columns (Mentor Sheets)

Months map to fixed columns: JAN→col 5(E), FEB→6, MAR→7 … DEC→16. CSV headers use format `MM/YY` (e.g., `05/25`, `01/26`). `detectMonthColumns()` in `B.js` handles dynamic detection.

**MONTH_LABELS array** (WEBAPP.js line 25): index 5='JAN', 6='FEB', ..., 16='DEC'. When reading data array `shData[r][c]` (0-indexed, where c=2=col E=JAN), label via `MONTH_LABELS[c+3]`.

**Month key sort**: MM/YY keys must be sorted chronologically, not lexicographically. Use `(year*100+month)` numeric comparison — string sort gives `'12/25' > '01/26'` which is wrong at year boundary.

**R2Y sync in B.js** (`syncScoresFromCSV`): writes latest month's score to R2Y col 8 (0-indexed col 7 = Points). This keeps `Math.max(masterScore, r2yScore)` consistent. The R2Y "Points" column is NOT BNI's official score — it's our cached latest monthly score.

### Notification Center (index.html)

Alerts come from `apiGetAlertCenter` (live, no stored state). Types: `no_report` (declining score + no Core Issue), `stale_case` (Core Issue open >14 days), `renewal` (membership expiry ≤45 days).

Snooze uses `localStorage['notif_snoozed']` keyed by `"team|name|type"` string. Snoozed alerts are hidden for 7 days client-side. Badge count updates via `updateNotifBadgeLocal()` after dismiss.

### BNI MEMBER Directory (public, no PIN)

`openDirProfile(name)` shows full PALMS breakdown + fast-track suggestions by loading `getSimulateData`. Data is cached in `_ssMembers` after first load. The directory card uses `m.score` (master sheet col E); the detail panel uses `dm.bniScore` (R2Y official) via `(dm&&dm.bniScore)||m.score`.

## LINE Notify setup

Tokens in `L.js` (`LINE_TOKENS` object) are placeholders. Replace `YOUR_*_TOKEN_HERE` values with real tokens from notify-bot.line.me, then run `setupThursdayTrigger()` once to install the weekly trigger.

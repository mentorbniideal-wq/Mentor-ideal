# BNI IDEAL Mentor System — Supabase Migration Plan

> **Scope**: GAS + Google Sheets → Supabase (PostgreSQL + Edge Functions)
> **Constraint**: Existing GAS system must remain fully operational throughout all phases.
> **Critical path**: LINE member registrations must be preserved — no forced re-registration.

---

## Phase Overview

| Phase | What | Duration | GAS Status |
|-------|------|----------|------------|
| 0 | Setup & pre-checks | 1–2 days | ✅ Running normally |
| 1 | Data export from Sheets | 1 day | ✅ Running normally |
| 2 | Data import to Supabase | 1–2 days | ✅ Running normally |
| 3 | Parallel run & validation | 2–4 weeks | ✅ Both systems active |
| 4 | Cutover | 1 day | ⏸ Supabase takes over |
| 5 | Post-cutover monitoring | 2 weeks | 🔒 GAS frozen (kept as rollback) |
| 6 | Decommission GAS | 30 days post-cutover | 🗑 Delete after confidence |

---

## Phase 0 — Setup & Pre-checks

### 0.1 Supabase Project

1. Create new Supabase project at [supabase.com](https://supabase.com)
2. Note the **Project Reference** (`<PROJECT_REF>`) — used in all URLs
3. Enable extensions in **Database → Extensions**:
   - `pgcrypto` (for `crypt()` in PIN hashing)
   - `pg_cron` (scheduled jobs)
   - `pg_net` (HTTP calls from pg_cron)
4. Copy `.env.example` to `.env` and fill in:
   ```
   SUPABASE_URL=https://<PROJECT_REF>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<from Project Settings → API>
   SUPABASE_ANON_KEY=<from Project Settings → API>
   ```

### 0.2 Run Database Migrations

```bash
# Install Supabase CLI if not already installed
brew install supabase/tap/supabase

# Link to your project
supabase link --project-ref <PROJECT_REF>

# Run all migrations in order
supabase db push
```

Migration order (all in `supabase/migrations/`):
1. `20260610000001_core_schema.sql` — mentor_teams, roles, members
2. `20260610000002_scores.sql` — r2y_stats, monthly_scores
3. `20260610000003_coaching.sql` — core_issues, action_logs, mentor_logs
4. `20260610000004_checkin.sql` — checkin_sessions, entries, ai_matching
5. `20260610000005_line_bot.sql` — line_members, line_bot_state, etc.
6. `20260610000006_operational.sql` — one_to_one_logs, visitor_log, etc.
7. `20260610000007_system.sql` — settings, app_usage, seat_map
8. `20260610000008_postgres_functions.sql` — fn_palms_score, fn_verify_pin, views
9. `20260610000009_rls_policies.sql` — Row Level Security on all tables
10. `20260610000010_corrections.sql` — dismissed_alerts, mentor_status, growth tables

### 0.3 Seed Initial Data

```bash
# Run in order — settings before cron
psql $DATABASE_URL < supabase/seed/02_settings.sql

# Update PINs BEFORE seeding roles — never commit real PINs
# Edit 01_roles_seed.sql, replace REAL_PIN_HERE with actual PINs
psql $DATABASE_URL < supabase/seed/01_roles_seed.sql
# ⚠️  After running, delete or git-ignore 01_roles_seed.sql if it has real PINs

# Cron jobs (after replacing <PROJECT_REF> in the file)
sed 's/<PROJECT_REF>/<your-project-ref>/g' supabase/seed/03_cron_jobs.sql | psql $DATABASE_URL

# Set CRON_SECRET so pg_cron can authenticate to Edge Functions
psql $DATABASE_URL -c "ALTER SYSTEM SET app.cron_secret = '<your-cron-secret>';"
psql $DATABASE_URL -c "SELECT pg_reload_conf();"
```

### 0.4 LINE Messaging API Setup

> LINE Notify was discontinued. The new system uses **LINE Messaging API**.

1. Go to [LINE Developers Console](https://developers.line.biz/)
2. Create or use existing **Messaging API channel**
3. Copy `Channel Access Token` (long-lived) and `Channel Secret`
4. Add to Supabase Edge Function secrets:
   ```bash
   supabase secrets set LINE_CHANNEL_ACCESS_TOKEN=<token>
   supabase secrets set LINE_CHANNEL_SECRET=<secret>
   supabase secrets set ANTHROPIC_API_KEY=<key>
   supabase secrets set CRON_SECRET=<same-as-step-0.3>
   ```
5. Deploy Edge Functions:
   ```bash
   supabase functions deploy api
   supabase functions deploy line-webhook
   supabase functions deploy cron-jobs
   ```
6. Note the webhook URL: `https://<PROJECT_REF>.supabase.co/functions/v1/line-webhook`
   > **Do NOT set this in LINE Console yet** — only after Phase 3 parallel validation.

### 0.5 Anthropic API Key

Store in **Supabase Vault** (never in settings table):
```bash
# Via Supabase Dashboard → Vault, or:
supabase secrets set ANTHROPIC_API_KEY=<your-anthropic-api-key>
```

---

## Phase 1 — Data Export from Google Sheets

Export each sheet as CSV. Open Google Sheets → select the tab → File → Download → CSV.

### Export checklist

| Sheet name | Save as | Notes |
|------------|---------|-------|
| `รายชื่อทั้งหมด` | `members.csv` | Master member list |
| `TOOMTAM` | `TOOMTAM.csv` | Mentor sheet |
| `Aof` | `Aof.csv` | Mentor sheet |
| `Draft` | `Draft.csv` | Mentor sheet |
| `PHAI` | `PHAI.csv` | Mentor sheet |
| `AMP` | `AMP.csv` | Mentor sheet |
| `Reporting2You` | `Reporting2You.csv` | R2Y stats |
| `📱 LINE MEMBERS` | `line_members.csv` | **CRITICAL** — preserve registrations |
| `📜 ACTION LOGS` | `action_logs.csv` | Coaching history |
| `📋 CHECKIN LOG` | `checkin_log.csv` | Check-in history |

Save all CSVs to a local `migration-exports/` folder (add to `.gitignore` — contains PII).

---

## Phase 2 — Data Import to Supabase

Run scripts in this **exact FK dependency order**. Each step depends on the previous.

```bash
export SUPABASE_URL=https://<PROJECT_REF>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<key>
```

### Step 2.1 — Members (foundation of all FKs)

```bash
deno run --allow-read --allow-net --allow-env \
  scripts/import-members.ts migration-exports/members.csv
```

Verify: check `members` table in Supabase Dashboard — count should match your sheet rows.

### Step 2.2 — Monthly scores (mentor sheets)

```bash
deno run --allow-read --allow-net --allow-env \
  scripts/import-scores.ts --monthly \
  migration-exports/TOOMTAM.csv \
  migration-exports/Aof.csv \
  migration-exports/Draft.csv \
  migration-exports/PHAI.csv \
  migration-exports/AMP.csv
```

### Step 2.3 — R2Y stats

```bash
deno run --allow-read --allow-net --allow-env \
  scripts/import-scores.ts --r2y migration-exports/Reporting2You.csv
```

### Step 2.4 — LINE members (CRITICAL ⚠️)

This step preserves all existing LINE chat registrations.
If any name in `line_members.csv` doesn't exactly match `members.name` in Supabase,
the script will report them as UNMATCHED.

```bash
deno run --allow-read --allow-net --allow-env \
  scripts/import-line-members.ts migration-exports/line_members.csv
```

If there are unmatched names, create `name-patches.json`:
```json
{
  "Name in LINE sheet": "Exact name in Supabase members table"
}
```

Then re-run with patch:
```bash
deno run --allow-read --allow-net --allow-env \
  scripts/import-line-members.ts migration-exports/line_members.csv --patch name-patches.json
```

> **Do not proceed to Phase 3 if there are unmatched LINE members.**
> Every unmatched registration means that member will be disconnected and must re-register.

### Step 2.5 — Core Issues (coaching)

Import open core issues from mentor sheet column X (JSON field):

```bash
# Manual: read each mentor sheet, parse col X (JSON), insert into core_issues
# The JSON format in GAS is: { "issue": "...", "openDate": "DD/MM/YYYY", "status": "open" }
# Map: member_name → member_id, mentor_team_name → mentor_team_id
# Insert: member_id, owner_mentor_team_id, description, opened_at, status='open'
```

> This step can be done manually in the Supabase Table Editor if the number of open issues is small (typically <10 at any time).

### Step 2.6 — Action Logs (coaching history)

```bash
# Manual import from action_logs.csv
# Columns: date, mentor, member, action, status, notes
# Map mentor name → mentor_team_id, member name → member_id
# Insert into action_logs table
```

### Step 2.7 — Verify import

```bash
deno run --allow-read --allow-net --allow-env scripts/verify-migration.ts
```

All checks must pass before continuing.

---

## Phase 3 — Parallel Run (2–4 weeks)

During parallel run:
- GAS WebApp continues to handle all production traffic
- Supabase WebApp runs in **read-only shadow mode** (no writes go to Supabase yet)
- Team uses Supabase WebApp via a separate test URL to validate data

### 3.1 Shadow testing procedure

1. Share the Supabase WebApp URL with MC and one or two mentors
2. They use it alongside the GAS system for 1–2 weeks
3. Compare data between the two systems:
   - Member scores match?
   - PALMS breakdowns are correct?
   - LINE bot responses are identical?
   - Core issue tracking works?

### 3.2 Ongoing sync during parallel run

The GAS system remains the **source of truth**. Re-export and re-import CSVs weekly:

```bash
# Week 1, 2, 3... — refresh data from GAS into Supabase
deno run --allow-read --allow-net --allow-env \
  scripts/import-scores.ts --r2y migration-exports/Reporting2You.csv
# (members and LINE registrations shouldn't change during parallel run)
```

### 3.3 Cutover readiness checklist

Before moving to Phase 4, confirm ALL of the following:

- [ ] `verify-migration.ts` passes all checks
- [ ] MC has tested login with PIN on Supabase WebApp
- [ ] All 5 mentors have tested mentor dashboard on Supabase WebApp
- [ ] LINE bot responds correctly to: สถานะ, ประวัติ, ลา, นัด, เจอแล้ว
- [ ] PALMS scores match between GAS and Supabase for 5+ members
- [ ] Score history view shows correct chronological order
- [ ] Alert center shows same alerts as GAS
- [ ] No unmatched LINE members
- [ ] All 7 PIN roles verified working
- [ ] Cron jobs scheduled (check `cron.job` table)
- [ ] Supabase backup enabled in Dashboard

---

## Phase 4 — Cutover

**Cutover window: ~30 minutes. Do at low-traffic time (Sunday morning or weekday before 07:00 TH).**

### 4.1 Pre-cutover: final data sync

```bash
# Export fresh CSVs from GAS
# Re-run all import steps to get latest data
deno run --allow-read --allow-net --allow-env \
  scripts/import-members.ts migration-exports/members.csv
deno run --allow-read --allow-net --allow-env \
  scripts/import-scores.ts --r2y migration-exports/Reporting2You.csv
# (LINE members already imported — no need to re-run unless new members joined)
```

### 4.2 Switch LINE Messaging webhook

1. Go to LINE Developers Console → Messaging API channel → Webhook settings
2. Change webhook URL from (nothing/old) to:
   `https://<PROJECT_REF>.supabase.co/functions/v1/line-webhook`
3. Enable "Use webhook"
4. Click "Verify" — should return 200 OK

> From this moment, all LINE messages go to Supabase. GAS LINE handler stops receiving events.

### 4.3 Update frontend API URL

In `dashboard.html` and `index.html`, find the `BASE_URL` / API endpoint constant and change it from the GAS WebApp URL to the Supabase Edge Function URL:

```javascript
// Before:
const API_BASE = 'https://script.google.com/macros/s/.../exec';

// After:
const API_BASE = 'https://<PROJECT_REF>.supabase.co/functions/v1/api';
```

Then push and redeploy via `clasp push` + redeploy (HTML files are served by GAS but can call Supabase API).

> Alternatively, if serving HTML from Supabase Storage or another host, update the deployment target.

### 4.4 Smoke test

Immediately after switching:
1. Open dashboard — does it load member data from Supabase?
2. Send "สถานะ" in LINE — does bot reply with scores from Supabase?
3. MC: log in with PIN — does authentication work?
4. Mentor: view mentee list — does it show current scores?
5. Try saving a score — does it persist?

### 4.5 Freeze GAS

- Unpublish the GAS WebApp deployment (or change access to "Only myself")
- Do NOT delete the GAS project — keep it as rollback
- Add a note in the GAS project editor: "FROZEN YYYY-MM-DD — cutover to Supabase"

---

## Phase 5 — Post-cutover Monitoring (2 weeks)

### Daily checks (week 1)

- [ ] Check Supabase Dashboard → Edge Function logs for errors
- [ ] Verify Thursday LINE push executed (check cron.job_run_details)
- [ ] Check alert center for new alerts
- [ ] Confirm new score entries are being saved

### Week 2

- [ ] All 9 cron jobs have executed at least once
- [ ] No error reports from MC or mentors
- [ ] LINE bot responding correctly in production
- [ ] PALMS scores updating from R2Y sync

### Key monitoring queries

```sql
-- Check for Edge Function errors
SELECT * FROM app_usage WHERE action LIKE '%error%' ORDER BY logged_at DESC LIMIT 20;

-- Check cron job execution
SELECT jobname, runid, status, start_time FROM cron.job_run_details
ORDER BY start_time DESC LIMIT 20;

-- Verify LINE bot active registrations
SELECT COUNT(*) FROM line_members;

-- Spot-check a member score
SELECT * FROM v_member_dashboard WHERE name = 'Full Member Name Here';
```

---

## Phase 6 — Decommission GAS (30 days post-cutover)

After 30 days of stable Supabase operation:

1. Export a final archive CSV of all GAS sheets (for records)
2. Delete the GAS WebApp deployment from Apps Script
3. Optionally delete the Apps Script project entirely
4. Remove `.clasp.json` reference or archive the GAS files to a `/legacy-gas/` folder in git

---

## Rollback Plan

If Supabase fails at any point, revert in under 5 minutes:

### Rollback steps

1. **LINE webhook**: Go to LINE Developers Console → revert webhook URL to old GAS URL, or disable webhook (LINE messages go to the old GAS handler immediately)
2. **Frontend API**: Revert `BASE_URL` in HTML files back to GAS WebApp URL → `clasp push` + redeploy
3. **GAS WebApp**: Restore "Anyone" access in GAS Deploy settings if it was restricted

> GAS continues to hold all data written before cutover. Data written to Supabase during the cutover window is NOT automatically synced back to GAS. If rollback happens more than a few minutes after cutover, manually export any new data from Supabase and re-enter in GAS.

### Rollback trigger conditions

Roll back immediately if:
- LINE bot stops responding and the issue can't be fixed in Supabase in <10 minutes
- Dashboard fails to load for 2+ users simultaneously
- Score save fails for any mentor
- Authentication (PIN) stops working

---

## LINE Integration Notes

### LINE Notify → LINE Messaging API

**LINE Notify was shut down on March 31, 2025.** The Supabase system uses **LINE Messaging API** exclusively:

| Feature | LINE Notify (GAS, deprecated) | LINE Messaging API (Supabase) |
|---------|-------------------------------|-------------------------------|
| Push message | `UrlFetchApp.fetch(notify_url)` | `linePush(userId, text)` in `_shared/line.ts` |
| Group/broadcast | Not available | `lineMulticast(userIds, text)` |
| Webhook (inbound) | Not available | `line-webhook/index.ts` |
| Auth | Token per group | Channel Secret + Access Token |
| Granularity | Notifies a LINE group | Targets individual LINE User IDs |

### LINE member data migration details

The `📱 LINE MEMBERS` sheet in GAS contains rows of:
```
LINE User ID | Member Name | Nickname | Registered At
```

These map to the `line_members` table:
```sql
line_members(line_user_id TEXT PK, member_id UUID FK → members.id, ...)
```

**import-line-members.ts** handles the name lookup and FK resolution. Name mismatches are the only failure mode — fix them with a patch file as documented in the script.

---

## FK Import Dependency Order

```
mentor_teams          (seed data — already in migration 001)
   └── members        (Step 2.1)
       ├── r2y_stats  (Step 2.3)
       ├── monthly_scores (Step 2.2)
       ├── line_members   (Step 2.4) ← CRITICAL
       ├── core_issues    (Step 2.5)
       ├── action_logs    (Step 2.6)
       ├── renewals       (manual)
       └── ...            (other tables)
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `supabase/migrations/` | All 10 SQL migrations (run via `supabase db push`) |
| `supabase/seed/01_roles_seed.sql` | PIN update template — **never commit with real PINs** |
| `supabase/seed/02_settings.sql` | App settings initial values |
| `supabase/seed/03_cron_jobs.sql` | pg_cron job schedule setup |
| `supabase/functions/api/` | Unified API Edge Function (replaces GAS `dispatch()`) |
| `supabase/functions/line-webhook/` | LINE Bot handler (replaces GAS `doPost()`) |
| `supabase/functions/cron-jobs/` | Scheduled jobs (replaces `ScriptApp.newTrigger()`) |
| `supabase/functions/_shared/` | Shared utilities: auth, db, palms, line, cors |
| `supabase/GAS_TO_SUPABASE_MAP.md` | Complete mapping of all GAS actions → Edge Function handlers |
| `scripts/import-members.ts` | Import `รายชื่อทั้งหมด` sheet |
| `scripts/import-line-members.ts` | Import LINE registrations (**critical**) |
| `scripts/import-scores.ts` | Import monthly scores + R2Y stats |
| `scripts/verify-migration.ts` | Post-import verification suite |
| `.env.example` | Environment variable template |

---

## Security Notes

- **PINs**: Stored as bcrypt hashes in `roles.pin_hash`. `fn_verify_pin()` is `SECURITY DEFINER` — hash is never sent to client.
- **Anon key**: Only 3 endpoints are public (getMemberDirectory, getSimulateData, getMemberPublicDetail). All others require PIN auth via Edge Function.
- **Service role key**: Used only server-side in Edge Functions. Never exposed to browser.
- **LINE secrets**: In Supabase Edge Function secrets (Vault). Never in `settings` table.
- **Anthropic API key**: In Supabase Edge Function secrets. Never committed to git.
- **Migration CSVs**: Contain member PII — add `migration-exports/` to `.gitignore`, never commit.

```gitignore
# Add to .gitignore
.env
migration-exports/
supabase/seed/01_roles_seed.sql  # if it contains real PINs
```

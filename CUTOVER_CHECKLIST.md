# Cutover Checklist — GAS → Supabase

This checklist is the canonical cutover plan for moving the BNI IDEAL Mentor System from the legacy Google Apps Script / Sheets WebApp to the Supabase + Vercel stack.

Use the checkboxes to mark progress. This file is intended for humans and other AI tools to inspect what has been completed and what remains.

---

## Current parity audit — 2026-06-11

### Current safe operating mode

- [x] Legacy GAS WebApp is isolated from the Supabase/Vercel work by `.claspignore`
- [x] `public/**` is excluded from `clasp push`
- [x] `supabase/**` is excluded from `clasp push`
- [x] Legacy GAS WebApp deployment has been repushed after file-scope cleanup
- [x] Legacy GAS `/exec` returns the BNI IDEAL Mentor System HTML instead of `ReferenceError: window is not defined`
- [ ] Keep GAS as production until every blocker below is closed
- [ ] Treat Supabase/Vercel as staging until a full MC + mentor smoke test passes

### Route coverage

- [x] GAS dispatch actions have matching Supabase `api` routes
- [x] `getChapterRevenue` shape has been updated toward the dashboard contract
- [x] `getCrossTeamSynergy` returns `savedPairs` and `recommendations`
- [x] Unified Supabase API passes `deno check supabase/functions/api/index.ts`
- [ ] Route existence is not enough for cutover; payload contracts below still need verification

### Cutover blockers

- [x] Fix or adapt `assignToTeam` contract
  - Current public frontend sends `name`, `nick`, `mentor`, `expDate`
  - Supabase handler currently expects `memberId` and `targetTeam`
  - Compatibility added: handler can resolve legacy name/nick payloads to `memberId`
- [x] Fix or adapt `saveScore` contract
  - Current mentor UI can send `teamName`, `memberName`, `month`, `score`
  - Supabase handler currently expects `memberId`, `year`, `month`, `score`
  - Compatibility added: handler can resolve legacy `memberName` payloads and defaults year to Bangkok current year
- [x] Fix or adapt `saveStatus` contract
  - Current mentor UI can send `row`, `memberName`, `status`
  - Supabase handler currently expects `memberId`, `status`
  - Compatibility added: handler can resolve legacy `memberName` payloads to `memberId`
- [x] Verify `addNewMember` payload aliases
  - Frontend variants may use `nick` and `mentor`
  - Supabase handler currently uses `nickname` and `mentorTeam`
  - Compatibility added: `nick`, `mentor`, `email`, and `phone` aliases are accepted
- [x] Replace `parseCheckinPDF` with CSV/text upload workflow
  - Decision: users will upload CSV/text and the app will extract text rows into data
  - Public mobile and desktop upload UI now accepts CSV only
  - Supabase handler rejects `parseCheckinPDF` with a CSV/text-only message
- [ ] Choose professional LINE Rich Menu setup path
  - Recommendation: design and publish Rich Menu in LINE OA Manager, store the final menu/link settings in Supabase, and keep API automation only for validation or future bulk updates
  - Current Supabase handler returns a note that rich menu setup is not implemented
  - This is more professional than dynamically generating the menu from the app because LINE OA Manager gives safer visual control and less operational risk
- [ ] Enforce `allowed_emails` as the real admin/mentor access whitelist
  - Decision: access-controlled work pages should be limited to assigned people only
  - Public/member-facing pages can exist separately as read-only directory, score lookup, or simulator pages
  - Current Google OAuth enforcement uses `role_assignments`, not `allowed_emails`
  - Next implementation should either merge `allowed_emails` into `role_assignments` or extend the admin panel so adding an email also assigns role/team
  - Do not enforce `allowed_emails` globally until real seed data exists, otherwise valid users can be locked out
- [ ] Validate migration `20260611000007_fix_scoring_none_color.sql` on a Supabase clone or staging database
  - Risk: `CREATE OR REPLACE VIEW` can fail if the existing view has an incompatible column shape
- [ ] Confirm `allowed_emails` RLS behavior with service role and anon role
  - Risk: admin access management may appear present but be inaccessible from the intended path

### High-priority runtime tests before cutover

- [ ] MC login with Google OAuth
- [ ] MC login with PIN fallback if still supported for the workflow
- [ ] Mentor login with Google OAuth
- [ ] Mentor login with PIN fallback if still supported for the workflow
- [ ] MC dashboard loads member totals, alerts, revenue, and Power Team views
- [ ] Mentor dashboard loads only the mentor's team data
- [ ] Add new member
- [ ] Assign new member to team
- [ ] Move existing member between teams
- [ ] Save monthly score
- [ ] Save mentor status
- [ ] Save and read member note
- [ ] Save core issue and close/resolve it
- [ ] Parse check-in from text
- [ ] Confirm PDF check-in is out of scope in user-facing SOP
- [ ] Save check-in log
- [ ] Get AI matching after check-in
- [ ] Save 1-2-1 log
- [ ] Get 1-2-1 tracker
- [ ] Monthly R2Y sync or CSV import
- [ ] Renewal extension
- [ ] LINE member registration lookup
- [ ] LINE push message
- [ ] LINE broadcast
- [ ] LINE onboarding messages
- [ ] Manual cron trigger endpoints

### Decision gate

- [ ] No cutover until all cutover blockers are closed
- [ ] No cutover until all high-priority runtime tests pass against current Supabase data
- [ ] No cutover until GAS rollback steps are documented and tested

---

## 1. Pre-cutover readiness

- [ ] `supabase` project created and linked
- [ ] `.env` configured with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `DEV_MODE=true` set for internal testing, `DEV_MODE=false` reserved for production
- [ ] `supabase db push` completed successfully for all migrations in `supabase/migrations/`
- [ ] `supabase/seed/02_settings.sql` applied
- [ ] `supabase/seed/01_roles_seed.sql` applied with real PINs and seed file cleaned up afterward
- [ ] `supabase/seed/03_cron_jobs.sql` applied with correct `<PROJECT_REF>`
- [ ] Secrets stored in Supabase Vault:
  - `LINE_CHANNEL_ACCESS_TOKEN`
  - `LINE_CHANNEL_SECRET`
  - `ANTHROPIC_API_KEY`
  - `CRON_SECRET`
- [ ] `supabase/functions/api` deployed
- [ ] `supabase/functions/line-webhook` deployed
- [ ] `supabase/functions/cron-jobs` deployed
- [ ] `public/` frontend configured for the Supabase API endpoint
- [ ] `verify-migration.ts` passes all checks
- [ ] MC has tested Supabase WebApp login
- [ ] All mentors have tested their dashboards on Supabase
- [ ] LINE bot commands validated: `สถานะ`, `ประวัติ`, `ลา`, `นัด`, `เจอแล้ว`
- [ ] PALMS scores match between GAS and Supabase for a representative sample
- [ ] Alerts and Core Issue views match expected GAS behavior
- [ ] LINE member registrations are migrated and no unmatched users remain
- [ ] Cron jobs are scheduled and visible in Supabase cron configuration
- [ ] Supabase backup enabled in the Dashboard

---

## 2. Cutover execution

### 2.1 Final data sync

- [ ] Export fresh CSVs from GAS immediately before cutover:
  - `members.csv`
  - `Reporting2You.csv`
  - `line_members.csv` (if there are new registrations)
- [ ] Re-import final data to Supabase:
  - `deno run --allow-read --allow-net --allow-env scripts/import-members.ts migration-exports/members.csv`
  - `deno run --allow-read --allow-net --allow-env scripts/import-scores.ts --r2y migration-exports/Reporting2You.csv`
- [ ] Confirm latest member data and scores in Supabase

### 2.2 Switch LINE webhook

- [ ] Update LINE Developers webhook URL to:
  - `https://<PROJECT_REF>.supabase.co/functions/v1/line-webhook`
- [ ] If Supabase LINE webhook is not ready yet, keep LINE webhook pointed at the legacy GAS WebApp URL instead
- [ ] Enable webhook in LINE Console
- [ ] Verify LINE webhook returns 200 OK

### 2.3 Update frontend API URL

- [ ] Change frontend API endpoint in the served HTML (or hosted frontend) from GAS WebApp URL to Supabase API URL
- [ ] Confirm `public/index.html` and `public/dashboard.html` use the correct `SUPABASE_API` and `SUPABASE_ANON` values
- [ ] If hosting the frontend on Vercel, verify `vercel.json` and deployment settings are correct

### 2.4 Smoke test after switch

- [ ] Open dashboard and confirm member data loads from Supabase
- [ ] Test LINE "สถานะ" reply
- [ ] MC login and role-specific access check
- [ ] Mentor login and mentee dashboard view
- [ ] Write/save a score or note and verify persistence
- [ ] Confirm LINE bot actions still work after cutover

### 2.5 Freeze GAS

- [ ] Unpublish GAS WebApp deployment or restrict it to internal use only
- [ ] Add a note in the GAS project: `FROZEN YYYY-MM-DD — cutover to Supabase`
- [ ] Keep the GAS project as rollback source until cutover is stable

---

## 3. Post-cutover monitoring (2 weeks)

- [ ] Check Edge Function logs daily for errors
- [ ] Verify scheduled cron jobs execute successfully
- [ ] Confirm new score entries are saving normally
- [ ] Confirm LINE bot remains responsive
- [ ] Monitor alert center and core issue updates
- [ ] Confirm no regressions in member data or score calculations

---

## 4. Rollback / decommission

- [ ] Keep GAS as a rollback source for at least 30 days
- [ ] If rollback is required, export any new Supabase data not present in GAS before switching back
- [ ] Once stable and confirmed, decommission GAS deployment and archive the old project

---

## Notes

- This file is intended to be the shared cutover checklist for humans and automated review.
- Update the checkboxes as tasks complete.
- Keep `MIGRATION_PLAN.md` as the broader migration reference and use this file for the actual cutover execution state.

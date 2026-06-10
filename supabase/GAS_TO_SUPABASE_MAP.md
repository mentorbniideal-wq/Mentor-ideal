# GAS Function → Supabase Location Mapping

> Phase 1 reference. Updated as migration progresses.

## Legend
- **Edge Function** = `supabase/functions/<name>/index.ts`
- **Postgres fn** = function in migration `008_postgres_functions.sql`
- **DB Trigger** = trigger + function in Postgres
- **pg_cron** = scheduled Postgres job
- **Frontend** = client-side JS in index.html / dashboard.html
- **Dropped** = GAS-specific, not needed in new stack

---

## Auth

| GAS (WEBAPP.js) | Supabase location | Notes |
|---|---|---|
| `PINS` object | `roles.pin_hash` (bcrypt) | Never store plain PIN |
| `apiLogin()` | Edge Function `api` + `fn_verify_pin()` | Same dispatch pattern |
| `apiChangePIN()` | Edge Function `api` | `UPDATE roles SET pin_hash = crypt(...)` |
| `_getSettingsValue()` / `_setSettingsValue()` | `settings` table | Key-value store |

---

## Scoring & Business Logic

| GAS | Supabase location | Notes |
|---|---|---|
| `calcPALMSScore()` | `fn_palms_score()` (Postgres) + `palms.ts` (Edge Fn) | Both exist; use Postgres fn for DB queries, TS for gap calculations |
| `calcGaps()` | `palms.ts` → Edge Function | Pure math, stays in Edge Function |
| `_bniFastTrack()` | `palms.ts` → Edge Function | Same |
| `_getColor()` / `trafficLight()` | `fn_traffic_light()` (Postgres) + `palms.ts` | |
| `_getNextColorGap()` | Edge Function (inline) | Simple calculation |
| `fn_effective_weeks()` | `fn_effective_weeks()` (Postgres) + `palms.ts` | |
| `runTests()` | `palms.ts` → `deno test` | Run: `deno test supabase/functions/_shared/palms.ts` |

---

## API Endpoints → Edge Functions

All ~80 dispatch actions will move to one or more Edge Functions.
Recommended grouping (one function per domain = manageable cold starts):

| Action(s) | Edge Function | Auth |
|---|---|---|
| `login`, `changePIN` | `api-auth` | public + role |
| `getDashboard`, `getDesktopDashboard`, `getMemberDetail`, `getScorecard`, `getMyTeam`, `getLeaderboard`, `getChapterTrend`, `getChapterPulse` | `api-dashboard` | role |
| `getMemberDirectory`, `getSimulateData` | `api-public` (anon key OK) | none |
| `getMemberList`, `addNewMember`, `addNewMembersBatch`, `assignToTeam`, `archiveMember`, `unarchiveMember`, `removeNewMember`, `getArchivedMembers`, `saveMemberNote`, `getMemberNote`, `saveScore`, `saveStatus`, `ensureSlot`, `getNMChecklist`, `saveNMCheckItem` | `api-members` | role (mc/mentor) |
| `saveCoreIssue`, `getCoachingGuide`, `getMCCoaching`, `saveMentorLog`, `getMentorLogs`, `save90DayReview`, `get90DayReviews` | `api-coaching` | mentor + mc |
| `parseCheckin`, `parseCheckinPDF`, `saveCheckin`, `getCheckinLog`, `getAIMatching` | `api-checkin` | growth + mc |
| `getRenewal`, `extendRenewal` | `api-renewal` | mc |
| `getGrowthData`, `getGrowthSheetData`, `updateGrowthMember`, `addGrowthMember`, `moveGrowthMember`, `getGrowthPowerTeams`, `getRiskMembers`, `getMentorPerformance`, `getMentorActivity`, `getWeeklyActions`, `createGrowthTask`, `getGrowthTasks`, `respondGrowthTask`, `monthlySync` | `api-growth` | mc + mentor |
| `getPowerTeams`, `getPTMembers`, `savePTMember`, `deletePTMember`, `setPTMemberStatus`, `updatePTMember`, `movePTMember`, `moveSynMember`, `getCrossTeamSynergy`, `saveCrossTeamPair` | `api-power-teams` | mc |
| `save121Log`, `get121Logs`, `getAll121Logs`, `get121Tracker` | `api-121` | role |
| `getAlertCenter`, `dismissAlert`, `getDismissedAlerts`, `getTeamNotifs`, `ackTeamNotifs`, `getUnreadCounts` | `api-alerts` | role |
| `getReports`, `setReportStatus`, `saveReply` | `api-reports` | mc |
| `getMeetingPrep`, `getVisitorTracker`, `getVisitorLog`, `addVisitor`, `updateVisitor`, `getSeatMap`, `getChapterRevenue`, `setChapterGoal`, `getSprintBoard`, `saveSprintPlan`, `getChapterActions`, `getReferralFlow` | `api-meetings` | role |
| `sendBroadcast`, `getBroadcasts`, `createMCAssignment`, `getMCAssignments`, `getMentorAssignments`, `ackAssignment`, `getMessages`, `saveMCMessage`, `getReadMsgKeys`, `setMsgRead` | `api-comms` | mc + mentor |
| `saveLineId`, `getLineIds`, `getLineMembers`, `getLineMembersDetail`, `sendLineMessage`, `sendLineBroadcast`, `sendLineIntro`, `setMCLineId`, `getAbsenceLog`, `getLineIssues`, `enrollOnboarding`, `removeOnboarding`, `sendOnboardingWeek`, `getOnboardingStatus`, `getOnboardingMessages`, `saveOnboardingMessage`, `mentorBroadcast`, `setupRichMenu`, `setupAllTriggers` | `api-line-admin` | mc |
| `triggerScoreAlert`, `triggerAnniversary`, `triggerCheckinReminder`, `triggerChapterPulse`, `triggerPostMeetingPrompt`, `triggerWednesdayNudge`, `triggerTeamLeaderboard`, `triggerWeeklyScorePush`, `triggerMondayBrief`, `triggerMonthlyRecap`, `trigger121Reminder` | `api-line-admin` (manual trigger) OR pg_cron (scheduled) | mc |
| `logUsage`, `getUsageLog` | `api-usage` | role |

---

## Scheduled Tasks → pg_cron / Supabase Scheduled Functions

| GAS Trigger | Schedule | Supabase replacement |
|---|---|---|
| `thursdayBotPush()` — LINE score summary | Thu 07:00 TH | pg_cron `0 0 * * 4` (UTC = 00:00 = TH 07:00) → calls `api-line-admin/weekly-score-push` |
| `wednesdayNudge()` | Wed morning | pg_cron → LINE Edge Function |
| `fridayEveningReminder()` | Fri 17:00 TH | pg_cron |
| `fridayPostMeetingPrompt()` | Fri post-meeting | pg_cron |
| `fridayTeamLeaderboard()` | Fri | pg_cron |
| `mondayMorningBrief()` | Mon 08:00 TH | pg_cron |
| `monthlyRecap()` | 1st of month | pg_cron |
| `line121AutoReminder()` | Weekly | pg_cron |
| `_lineRenewalPush()` | Daily | pg_cron → check expiry_date in renewals table |

---

## Google Services → Replacements

| Google Service | Usage | Supabase/Standard replacement |
|---|---|---|
| `SpreadsheetApp` | All data storage | Supabase Postgres |
| `PropertiesService` | API keys, LINE state | Supabase Vault (secrets) + `line_bot_state` table |
| `UrlFetchApp` | LINE API, Anthropic API | `fetch()` in Deno Edge Functions |
| `ScriptApp.newTrigger()` | Time-based triggers | pg_cron + Supabase Scheduled Functions |
| `DriveApp` | PDF handling for check-in | Supabase Storage (upload PDF → Edge Function parses) |
| `HtmlService` | Serve dashboard.html / index.html | Static hosting (Vercel/Netlify) or Supabase Edge Function |
| `Utilities.formatDate()` | Date formatting | `date-fns` or `Intl.DateTimeFormat` |
| `Utilities.parseCsv()` | CSV parsing | `csv-parse` npm package or custom |
| `Utilities.sleep()` | Retry delays | `setTimeout` / `Deno.sleepSync` |
| `Session.getScriptTimeZone()` | Timezone | Env var `TZ=Asia/Bangkok` |
| `ContentService` | Return JSON | `new Response(JSON.stringify(...))` |
| `Browser.msgBox()` | Sheet-only UI | N/A — only used in non-webapp scripts |

---

## LINE Integration

| Current (GAS) | New (Supabase) |
|---|---|
| `doPost(e)` — LINE webhook | Edge Function `line-webhook/index.ts` |
| `_lineReply()` — LINE Messaging API | `fetch()` with LINE_CHANNEL_ACCESS_TOKEN from Vault |
| `PropertiesService.LINE_REG_*` | `line_bot_state` table |
| `📱 LINE MEMBERS` sheet | `line_members` table (must migrate existing data) |
| `_lineGetMemberData()` | DB query via Supabase client |
| LINE Notify (deprecated) | LINE Messaging API Push Messages |

**Note:** LINE Notify ปิดบริการแล้ว — ระบบใหม่ใช้ LINE Messaging API (Push Message) แทนทั้งหมด.
Token เก็บใน Supabase Vault ภายใต้ key `LINE_CHANNEL_ACCESS_TOKEN`.

---

## Files NOT migrated (GAS-only utilities)

| File | เหตุผล |
|---|---|
| `Code.js` | Builds "📥 UPDATE SCORES" sheet — replaced by Edge Function CSV importer |
| `C.js` | `styleCell()` color utilities — GAS Sheet formatting only |
| `D.js` | Builds "📊 ALL SCORES" sheet — replaced by `v_score_history` view |
| `E.js` | Quick fix script — one-time operation, done |
| `F.js` | Reporting2You sync — replaced by CSV importer Edge Function |
| `G.js` | Mentor Team Scorecard with grades — replaced by dashboard view |
| `J.js` | CSV Importer dialog — replaced by web UI file upload |
| `ScriptN_*.js` | One-time data migration — already applied |
| `SystemCheck.js` | GAS health check — can rewrite as Edge Function later |
| `Coach.js` `onOpen()` menus | Google Sheets UI — not needed in Supabase app |

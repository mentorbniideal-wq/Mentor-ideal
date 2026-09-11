# Legacy Google Apps Script retirement audit — 10 September 2026

## Decision applied

Supabase is the only permitted scheduler for LINE delivery. Google Apps Script
may remain as a rollback source, but it must not create or run scheduled LINE
delivery or delete operational history.

On 11 September 2026, LINE Developers was visually verified to use the active
Supabase endpoint `https://itwyjhlfemxsfbimshby.supabase.co/functions/v1/line-webhook`.
All versioned public GAS deployments were removed. The remaining read-only
`@HEAD` deployment has a retired `doPost` handler that returns 200 without
parsing or replying to LINE events.

## Evidence checked

- The remote Apps Script project (`1EJJg475cFraTIZyurjXa69EmVt6pzhdyWV_Ua5RN0SoGjV_gRD3Ca1R1`) was cloned after the update.
- The remote source contains no `ScriptApp.newTrigger` call.
- Every known legacy scheduled LINE handler returns before any LINE API call:
  `thursdayMorningAlert`, `thursdayBotPush`, `fridayEveningReminder`,
  `fridayTeamLeaderboard`, `fridayPostMeetingPrompt`, `wednesdayNudge`,
  `mondayMorningBrief`, `monthlyRecap`, `line121AutoReminder`,
  `_lineChapterPulse`, and `_lineBNIAnniversary`.
- `autoCleanupOldCases` is a no-op so an already-installed legacy trigger cannot
  delete closed-case history from Sheets.
- `setupThursdayTrigger`, `setupThursdayBotTrigger`,
  `setupFridayEveningTrigger`, and `setupAnniversaryCheckTrigger` now retire
  their respective trigger instead of creating one. `setupCleanupTrigger` does
  the same for the destructive cleanup task.

## What remains intentionally

- The legacy GAS Web App and its event-driven LINE reply/manual-send code remain
  as a rollback artifact only. Removing or disabling its `doPost` handler would
  break the bot if LINE Developers is still pointed to its Web App URL.
- LINE webhook routing must be verified in LINE Developers before freezing or
  unpublishing the GAS Web App. Repository source cannot prove this external
  console setting.
- Existing installable triggers can only be listed or deleted by their creator
  in Apps Script. The source-level no-op guards are active even if such a
  trigger remains, so they cannot send LINE or delete case history.

## Retirement candidates requiring a separate approval

1. Freeze/unpublish the legacy GAS Web App after confirming the LINE webhook
   URL points to Supabase and signed-in regression tests pass.
2. Remove legacy direct-send and LINE Notify code only after the rollback window
   ends; event-driven notifications must first be checked against the matching
   Supabase delivery-ledger workflows.
3. Archive, rather than delete, the GAS project after final data-export and
   rollback requirements in `CUTOVER_CHECKLIST.md` are closed.

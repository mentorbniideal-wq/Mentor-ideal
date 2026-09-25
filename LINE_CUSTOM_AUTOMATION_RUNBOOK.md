# LINE Custom Auto Message

## Scope

Chapter Admin can create a text message, choose an exact active-member allow-list,
and schedule it once, daily, weekly, or monthly. Saving or editing always disables
the schedule; the Admin must review the card and explicitly enable it.

The dispatcher runs every five minutes. It derives the Chapter on the server,
revalidates active members, applies notification mute/quota/quiet-hour guards,
and uses one delivery-ledger idempotency key per schedule occurrence and member.

## Release order

1. Back up and apply `20260925000001_custom_line_automations.sql`.
2. Verify both tables, the recipient-scope trigger, the claim RPC, and the
   `custom-line-automations-dispatch` cron row.
3. Deploy the unified `api` Edge Function.
4. Deploy the frontend assets.
5. Sign in as Chapter Admin, create a disabled one-recipient test schedule, and
   confirm that a read-only or Mentor Co. account cannot edit it.
6. Enable the test only after Preview-by-card and quota checks are satisfactory.

Never deploy the API before the migration: `getLineAutoControlCenter` reads the
new tables. No Production schedule is created by the migration itself; the cron
dispatcher has no work until an Admin creates and explicitly enables a record.

## Rollback

Disable every custom schedule first. The frontend and API can then be rolled back
while retaining the additive tables and delivery/audit history. Do not drop the
tables or delete delivery records as part of rollback.

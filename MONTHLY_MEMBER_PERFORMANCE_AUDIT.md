# Monthly Member Performance History — Phase 0 audit

Status: audited in code; source-file metric semantics and live data coverage are **not yet verified**. Do not promote snapshot values as monthly activity.

## Current state

The Admin Monthly Sync modal accepts (1) Member Traffic Light CSV, (2) Traffic Lights Evolution CSV, and (3) Reporting2You CSV. `previewMonthlySync` / `monthlySync` in `supabase/functions/api/handlers/growth.ts` process them as one selected `YYYY-MM` batch. `monthly_sync_batches` records Chapter, period, file hashes/names, status, affected IDs, quality and before/after rollback snapshots; raw CSV is not retained. An identical combined hash is idempotent, but another file set for the same period may produce a separate batch.

`monthly_scores` retains per-member, per-month Traffic Light points. `palms_key_snapshots` retains five key raw snapshot values (referrals given, visitor, 1-2-1, CEU, TYFCB given) per member and month. Both use `(member_id, year, month)` uniqueness, but the key snapshots have no batch/source reference and do not store Referral Received or TYFCB Received. `r2y_stats` and `members.given_thb` / `received_thb` are latest-state upserts, so prior received values are overwritten. Growth Plan currently reads the latter and cannot attribute that value to a reporting year. Member Growth Cycle reads its own `member_growth_cycles` / `member_growth_entries` and does not read performance history.

All three CSV pipelines match source rows to `members.id` via normalized name/nickname. Historical rows retain the stable ID after a rename, but a new import may fail to match a changed name or resolve an ambiguous name to the wrong member. Existing FK constraints on `monthly_scores` and `palms_key_snapshots` use `ON DELETE CASCADE`; archival is safe, physical deletion is not. Existing rollback can replace score/key snapshots from the batch's before-state. It does not restore `members.given_thb` / `received_thb`, which is a data-integrity risk.

## Metric semantics from the current importer

| Source | Supported fields | What code proves | Monthly derivation |
| --- | --- | --- | --- |
| Traffic Lights Evolution | monthly score columns, rolling average | score is explicitly keyed to a column month; average is separate | score itself is a period snapshot, not activity |
| Member Traffic Light | score, RGI/RR, visitor, 1-2-1, CEU, TYFCB given/received, attendance | importer reads one current row and assigns the selected period; source window is not parsed | **needs verification**; no subtraction |
| Reporting2You | RGI/RR, visitor, 1-2-1, CEU, TYFCB given, attendance, BNI days | latest `r2y_stats` and five-key snapshots; no parsed From/To interval here | **needs verification**; no subtraction |

Migration comments call Reporting2You cumulative per period, but neither the CSV parser nor stored record establishes whether that period is a month, rolling window, membership year or lifetime. Negative differences may represent corrections/reset, not negative activity.

## Smallest safe path

1. Reuse `monthly_scores`, `palms_key_snapshots` and `monthly_sync_batches`; show historical snapshot values as snapshots only, with source and period labels. No month-on-month *activity* claims until a real file header/report interval is verified.
2. First safe increment implemented: the already Chapter-scoped, OAuth-authorized Member Growth Timeline now returns 12 recent source snapshots and renders a read-only history panel. Keep gaps/unknowns visible; do not manufacture zeros or trends. This does **not** yet satisfy the requested true monthly-activity / MoM definition of done.
3. After inspecting representative files (redacted where possible), extend the existing key snapshot and sync ledger additively with source-window semantics, Referral Received / TYFCB Received, batch provenance and safe same-period replacement. Snapshot capture should be tied to a successful import step and Chapter/member ID validation, not name alone.
4. Backfill only verified historical batch snapshots. Existing `monthly_scores` and `palms_key_snapshots` can seed source snapshots, but no historical received activity can be reconstructed from latest `members.received_thb`. Never fill absent periods from current state.
5. Before live enablement, test re-import, correction/reset, rollback, identity ambiguity, inactive members, and cross-Chapter denial with signed-in accounts. Do not deploy Production as part of this audit/task without a separate approved release decision.

# Phase 2D — Weekly MY121 Tenant Scope

สถานะ: Implemented in repository; not yet applied to production

วันที่: 14 กันยายน 2569

## Outcome

Weekly MY121 and matching now use the Chapter derived by the backend from the authenticated account. The browser cannot choose a `chapter_id`.

This phase covers:

- `matching_rounds`, `matching_forbidden_pairs`, and remembered CSV-name aliases
- creation, replacement, history, queues, member history, delivery overview, and round detail reads
- database-owned member invitation and replacement-round functions
- cross-Chapter database guards for round participants, forbidden pairs, and aliases
- Chapter-scoped audit metadata for the Weekly MY121 writes touched in this phase

Existing BNI IDEAL behavior remains the compatibility baseline. The migration backfills old rounds from their participant records first and uses the installed BNI IDEAL Chapter only for legacy rounds without participant evidence.

## Security boundary

1. `requireAuth` verifies the operator.
2. `resolveChapterScope` derives the active Chapter from `chapter_memberships`.
3. Root reads and writes constrain `matching_rounds.chapter_id`.
4. Child records are accessed only after their member, pair, or round root is proven to belong to that Chapter.
5. Database triggers reject a pair, forbidden-pair rule, or remembered alias whose members do not belong to the root Chapter.

## Migration runbook

Before production application:

1. Back up the database and record row counts for the three tables receiving `chapter_id`.
2. Apply `20260914000000_phase_2d_scoped_one_to_one.sql` in staging first.
3. Confirm the migration's null and cross-Chapter verification blocks complete without an exception.
4. Run a dry-run import, open an existing round, create/delete a draft round, and test a member invitation in staging.
5. Verify a synthetic second-Chapter operator cannot read or mutate the first Chapter's round IDs.
6. Apply to production only after explicit approval and a rollback window.

Rollback is application-first: deploy the previous API before reverting constraints. Do not drop `chapter_id` or delete backfilled values during an incident; leave the additive columns in place and restore the previous function definitions only if required.

## Intentional debt / next phase

- MY121 feature flags, pilot settings, notification budgets, and LINE credentials are still installation-wide. The API now filters member and delivery data by Chapter, but per-Chapter policy storage remains Phase 2E/Phase 3 work.
- `chapter_audit_events.chapter_id` remains nullable temporarily because older modules still write legacy audit events without a tenant field. New Weekly MY121 events include it.
- LINE Token/Secret migration remains explicitly parked under Phase 3.
- การทดสอบฐานข้อมูล Docker local เมื่อ 14 กันยายน 2569 ผ่าน: สร้าง Chapter จำลอง, ยืนยันว่า pair/alias/forbidden-pair ข้าม Chapter ถูก database guard ปฏิเสธ, ยืนยัน alias ชื่อเดียวกันแยกตาม Chapter ได้ และ replacement round คง `chapter_id` เดิม. ข้อมูลทดสอบทั้งหมดอยู่ใน transaction ที่ rollback แล้ว
- Local Supabase fresh bootstrap ยังมี debt จาก migration เก่าที่เรียก `cron.schedule` ก่อนเปิด `pg_cron`; ห้ามแก้ migration ที่ deploy แล้ว ให้สร้าง bootstrap/CI harness แยกก่อนใช้เป็น acceptance environment ของ Phase 2E.

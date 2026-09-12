# Phase 2A — Tenant foundation

## Delivered scope

- `chapter_profiles` remains the canonical Chapter catalog; its UUID is the stable tenant ID.
- `chapter_memberships` binds a verified email to a Chapter, status and default Chapter.
- Existing `role_assignments` are backfilled into `bni-ideal` idempotently.
- `resolveChapterScope` derives scope from membership and rejects ambiguous memberships. It never accepts a browser `chapter_id`.
- Legacy PIN sessions retain a temporary compatibility fallback only while exactly one Chapter is active.

## Phase 2B migration order

1. Add nullable `chapter_id` plus indexes to `members`, `mentor_teams`, `role_assignments`, `member_signals`, `lt_*`, scores and renewals.
2. Backfill IDEAL using the verified `chapter_profiles.id`; capture row counts and null counts before/after each table.
3. Move handlers to `resolveChapterScope`, then add composite unique constraints only after verification.
4. Create a synthetic Chapter with isolated fixtures and run cross-tenant read/write denial tests.
5. Remove the single-active-Chapter PIN fallback only after all operational paths derive tenant scope.

## Explicitly not included

No second Chapter, real member data, LINE credential, webhook, notification token or active Chapter setting is created or changed in Phase 2A.

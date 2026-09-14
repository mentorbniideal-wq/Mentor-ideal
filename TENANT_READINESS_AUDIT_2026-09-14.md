# Tenant Readiness Audit — 14 September 2026

## Current position

| Priority | Domain | Status | Next gate |
| --- | --- | --- | --- |
| P0 | Identity and Chapter membership | Foundation complete | synthetic second-Chapter authentication test |
| P0 | Members, Member 360, LT terms | Scoped | cross-tenant mutation test |
| P0 | Renewals and score history | Scoped | staging migration verification |
| P0 | Growth intelligence and tasks | Scoped | signed-in role matrix acceptance |
| P0 | Weekly MY121 and matching | Phase 2D local isolation verified | apply migration in staging before production |
| P0 | Smart Chapter Directory and member invitations | Not tenant-scoped end-to-end | scope directory search/profile/bookmarks/events to server-derived member Chapter |
| P0 | Mentor MY121 operations | Team-filtered but not rooted in Chapter scope | combine Chapter boundary with existing Mentor-team boundary |
| P1 | Chapter settings and MY121 policy | Partial | move feature flags/pilot policy from global settings to Chapter configuration |
| P1 | Notification budget and delivery reporting | Read data is filtered; policy is global | design per-Chapter policy without moving secrets |
| Parked | LINE token, secret, webhook routing | Not started by design | Phase 3 readiness conditions and Pete approval |

## Phase 2E recommendation

Build an automated tenant-isolation acceptance suite around a synthetic second Chapter. The database-level MY121 scenarios below passed in Docker local on 14 September 2026; retain them as automated coverage and add signed-in API coverage. The minimum scenarios are:

1. An IDEAL operator can read and mutate only IDEAL members and MY121 rounds.
2. A synthetic-Chapter operator receives not-found/forbidden for IDEAL member and round IDs.
3. Creating a pair with members from different Chapters fails at the database boundary.
4. CSV aliases with the same normalized name can resolve independently in two Chapters.
5. Chapter settings and notification policy are separated without touching LINE Token/Secret storage.

Production data must not be used to simulate the second tenant. Run these scenarios in a staging or isolated local database with fixture-only identities.

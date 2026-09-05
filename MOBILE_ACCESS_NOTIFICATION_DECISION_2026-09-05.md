# Mobile Access & Notification Decision — 2026-09-05

## Access behavior

- Mentor roles enter their assigned Mobile workspace immediately after verified email or PIN login.
- Mentor Co. can choose only MC Desktop or MC Mobile.
- The verified system owner can choose MC Desktop, Growth Desktop, or MC Mobile and can open Settings or switch operational views.
- UI visibility is convenience only. Sensitive Settings and role assumption are enforced by server-derived `isSystemOwner`.

## Notification behavior

- MC, Mentor, Mentor Support, and Growth use one persistent Notification Center.
- A browser push endpoint may retain multiple server-derived recipient keys so changing an authorized view does not silently replace its prior notification scope.
- Push self-test targets one subscription only. Provider acceptance is shown as delivery infrastructure status and is not described as proof that the OS displayed it.
- Operational push/job history is retained for a bounded period to control database growth.

## Commercial-readiness debt

- Legacy PIN roles remain Chapter-wide for backward compatibility. Replace them with tenant-bound identities before onboarding a second Chapter.
- Automatic notification tenant assignment is allowed only when exactly one active Chapter exists. Multi-Chapter rollout must require explicit server-derived tenant context.
- The parked multi-Chapter LINE Token/Secret migration remains out of scope.

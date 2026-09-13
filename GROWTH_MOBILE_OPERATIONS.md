# Growth Mobile Operations

## Product boundary

Growth Mobile is the field workflow for helping one member turn a short business conversation into a trackable next action. Chapter planning and deeper analysis remain in Growth Desktop.

The operational loop is:

`Member -> Business context -> Conversation -> Action -> Handoff -> Follow-up -> Outcome`

## Data and privacy

- Member cards use `getGrowthMemberContext`, a Growth-safe, consent-aware projection.
- Chapter scope comes from the authenticated server session. The client does not choose the Chapter.
- Growth Mobile does not request Mentor notes, reviews, private coaching records, GAINS, phone numbers, or email addresses.
- Growth-to-Mentor handoffs expose only Growth-created `safe_context` and shared status; Mentor-private follow-up stays private.

## Operational controls

- The home queue prioritizes overdue work, new support requests, open work, and member risk signals.
- Workload shows open, overdue, unowned, and waiting-member work by owner.
- Conversation, profile-confirmation, and referral-opportunity actions become Growth Tasks.
- Generated actions use Chapter-scoped idempotency keys so retries and concurrent taps do not create duplicate work.
- A Growth Task cannot be completed without a recorded outcome.

## Acceptance boundary

Automated contracts cover authorization, tenant scope, privacy exclusions, retry safety, and required UI actions. Signed-in production acceptance should verify real Chapter data at mobile widths without creating test member records.

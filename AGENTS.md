# Repository Instructions

## Commercial product direction

Before changing code, schema, configuration, authentication, LINE delivery, or UI, read `COMMERCIAL_MULTI_CHAPTER_ROADMAP.md` and apply its Commercial-readiness Definition of Done.

All future work, including small fixes, must preserve a path from the current BNI IDEAL installation to a sellable multi-Chapter product:

- Do not add new Chapter-, team-, person-, email-, PIN-, token-, branding-, or threshold-specific behavior when configuration can represent it.
- Treat tenant scope as server-derived. Never authorize access from a client-supplied `chapter_id` or role alone.
- Keep current BNI IDEAL behavior backward compatible while making touched code tenant-ready.
- Protect secrets and personal data; never expose tokens to clients or logs.
- Require authorization, auditability, idempotency, observable outcomes, and proportional tests for sensitive operations.
- Prefer additive migrations with backfill and verification; never rewrite a deployed migration.
- Include loading, empty, error, success, confirmation, responsive, and accessible states where relevant.
- Document architectural decisions and any intentional commercial-readiness debt.

The large multi-Chapter LINE Token/Secret migration is explicitly parked. Do not begin it or move production secrets without Pete's explicit approval after the readiness conditions in the roadmap are met.

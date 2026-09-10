# MY121 verification help

Members open MY121 → verification to retry loading their existing code or request help. A confirmation explains that this is a request only and an eventual admin reset invalidates every participant's code and clears the group's verification. Completed pairs do not show a reset action.

The new LIFF actions `get-one-to-one-verification-help` and `request-one-to-one-verification-help` validate the LINE identity and pair membership (including the third participant) before accessing the existing attention ledger. Requests use the database's existing unique key `verification-help:<pair UUID>:<maximum code version>`. Both participants and repeated clicks share one request. SQL unique conflicts are treated as already received, without sending a second notification.

Request evidence includes the verified requester, pair, time and code version only. No plaintext code, code hash, partner input or free-text report is collected. General Help Center messages keep their existing behavior. Mentor/MC notifications reuse the existing path; the attention queue remains the source of truth if delivery fails.

Desktop → 1-2-1 → ต้องดูแล → จัดการคู่ / ตรวจรหัส opens the existing pair action center. Only Admin/MC can use the existing confirmed reset endpoint. The reset closes request keys belonging to the prior code versions; a request for the new version is not closed by this cleanup. The member sees the new-code state on reopening/reloading. If the admin resolves a request without reset, the member sees that it was reviewed and can contact Mentor Co. for further help.

No schema migration or secret change is needed. Existing tenant-isolation debt is documented in the commercial roadmap. No production message or reset is sent during verification.

Validation:

- `deno test --allow-read --allow-env supabase/functions/`
- `deno check supabase/functions/liff-api/index.ts supabase/functions/api/index.ts`
- `PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/test-verification-help-ui.mjs`
- `node scripts/check-web-budgets.mjs`

Tests cover non-participants, cancelled/archived/completed pairs, duplicate requests across participants, trios, code generation changes, query/insert failures, concurrent unique conflicts, request status on reload, network errors, no codes in requests and the admin pair shortcut. Browser requests use fixtures. Positive LINE-account end-to-end delivery/reset still requires an approved signed-in test participant and a controlled test pair under `PRODUCTION_E2E_RUNBOOK.md`.

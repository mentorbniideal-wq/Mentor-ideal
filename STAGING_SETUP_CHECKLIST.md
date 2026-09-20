# MY IDEAL — Isolated Staging Setup Checklist

Use this checklist only after Pete approves external infrastructure creation. It does not authorize Production changes.

## 1. Create isolated services

1. Create a new Supabase project and record its project ref. Do not clone Production Member data or reuse its service-role key.
2. Create a separate Vercel project connected to the approved release branch/commit. Use its stable `*.vercel.app` URL; a temporary Preview URL is not an OAuth redirect target.
3. Before OAuth, compare the Staging project ref and URL against Production. They must differ.

## 2. Configure variables

Copy `.env.staging.example` into the protected environment-variable stores, not the repository.

- **Vercel build environment:** `MY_IDEAL_ENV`, `RELEASE_SHA`, `PUBLIC_APP_URL`, `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PRODUCTION_SUPABASE_URL`, `LINE_DELIVERY_ENABLED=false`.
- **Supabase Edge Function secrets:** `MY_IDEAL_ENV`, `RELEASE_SHA`, `PUBLIC_APP_URL`, `MSB_FORM_URL`, `LINE_LIFF_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PRODUCTION_SUPABASE_URL`, `ONE_TO_ONE_CODE_PEPPER`, `CRON_SECRET`, and the Staging safety gates.
- Do not configure LINE channel token/secret, LIFF ID, Production credentials, or real member identifiers. LIFF is intentionally deferred.

The Vercel build generates `public/assets/js/runtime-config.js`; it must not be committed. The build fails if the environment is missing, unknown, points Staging at the protected Production Supabase URL, or enables Staging LINE delivery.

## 3. Verify isolation before OAuth

1. Generate and validate the runtime artifact during build.
2. Inspect it for the Production project ref and server-secret names; neither may appear.
3. Confirm browser API/admin/LIFF endpoints have the Staging project ref.
4. Confirm Edge Function `MY_IDEAL_ENV=staging`, `LINE_DELIVERY_ENABLED=false`, and `LINE_WEBHOOK_ENABLED=false`.
5. Do not proceed if any Staging URL, Blueprint URL, LIFF web route, or API endpoint resolves to Production.

## 4. OAuth owner action

After isolation passes, set Supabase Auth Site URL and allowed redirects to the stable Staging URL. In Google Cloud, register only the Supabase Staging callback:

`https://<staging-project-ref>.supabase.co/auth/v1/callback`

Use synthetic OAuth accounts and synthetic Chapter fixtures only. Do not use a Production Member account.

## 5. Before Phase 2 acceptance

Record Vercel and Supabase revisions, apply the complete local migration history to Staging, deploy API then frontend from the same approved commit, and confirm the two release fingerprints agree. Keep LINE and LIFF disabled.

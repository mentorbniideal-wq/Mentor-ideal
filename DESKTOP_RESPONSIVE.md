# Desktop responsive layout

Desktop remains `/dashboard.html`; Mobile remains its existing entrypoint. Screen width changes presentation only, never role, authentication, Chapter scope or device routing.

`public/assets/css/desktop-responsive.css` loads after the existing Desktop styles and owns shell sizing and responsive overrides:

- Above 1180px: full sidebar; the user's manual folded preference still applies.
- 701–1180px: compact vertical navigation with existing tooltip labels.
- At or below 700px: horizontally scrollable text navigation and wrapping header controls. Desktop functionality remains available.
- The header uses natural height. Navigation and workspace occupy the remaining dynamic viewport height and scroll independently.
- Cards and selected legacy inline grids use fluid columns; forms stack on narrower screens. Wide tables retain their table layout and scroll inside their wrappers.
- Dialogs are bounded by viewport width and height. No layout containment is introduced around legacy fixed-position dialogs.

The new stylesheet is loaded only by Desktop. No backend, Mobile routing, tenant configuration, secrets or business rules change in this work. Existing audit changes in the working tree remain separate prior work.

Validation: Chromium fixture with actual Desktop HTML/styles, all static sections at 375/600/768/1024/1440/1920px in light and dark themes; navigation interactions at intermediate widths; seven existing dialogs at 375×600; wide table and form fixture; LINE review regression. Performance budgets and diff whitespace checks pass. Test command:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/test-desktop-ui.mjs
```

Limits: dynamically loaded feature content is not exhaustively covered by the fixture. Validate authenticated workflows with production-like data on staging, including Safari/iPad. Feature owners should use fluid grids and local table scroll wrappers when extending modules; avoid new fixed minimum widths that exceed their parent. The legacy Desktop styles remain compatibility debt owned by product/engineering and can be consolidated incrementally without changing Mobile.

## Production release — 9 September 2026

Published to https://bni-mentor-system.vercel.app/dashboard.html.

- Production deployment: `dpl_AGbxyz8vJVERUrPWWbSSLBUJR3vX` (`bni-mentor-system-ggtp8ydbp-mentor-ideal-s-projects.vercel.app`), Ready.
- Preview: `dpl_D4qfWARMbgSwyUxY6PKTkuF7yMzq`; inspected before promotion.
- Rollback reference: preceding production `dpl_FMN7vhEiBE35W16SiZaxqNoSVLqP` (`bni-mentor-system-g4eh8bl2f-mentor-ideal-s-projects.vercel.app`).
- Isolated static release based on commit `b721e92`, with six Desktop files overlaid: dashboard HTML, Desktop UX CSS, responsive CSS, operations JS, LINE compose JS and navigation JS. No workspace-only documents, CSV, Supabase functions or unrelated pending changes were uploaded.
- Verified exact production bytes for all six Desktop files and unchanged Mobile HTML/JS, LIFF HTML and service worker.
- Production Chromium smoke: Desktop login loads at 375/768/1024/1440px, new stylesheet and compose module load, no page exceptions. POST requests were blocked during smoke; authenticated workflows and real device Safari remain outside this release verification.
- Prior audit backend/Mobile/service-worker fixes remain local pending work; they were not included in this Desktop release.

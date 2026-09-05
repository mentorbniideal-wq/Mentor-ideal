# Desktop Dashboard Page Overrides

> **PROJECT:** BNI Mentor Desktop
> **Generated:** 2026-09-05 17:20:21
> **Page Type:** Dashboard / Data View

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Adopted implementation direction

- Preserve the current Quiet Luxury gold/cream visual identity and current
  light/dark behavior; it overrides generated palette and font suggestions.
- Desktop navigation is organized into: overview/control, members/teams,
  tracking/communication, Chapter development, and system/access.
- Overview should answer three questions in order: what needs attention now,
  what changed, and where the operator should act.
- At 1220px, stack the command rail below primary content instead of squeezing
  both columns. Keep role/workspace actions available.
- Use explicit current-page, loading and collapsed-navigation semantics.
- Tables may scroll horizontally inside their own container; the page itself
  must not acquire horizontal overflow.

### Approved visual direction — IDEAL Operations Room

- Pete approved the 2026-09-05 mockup: cinematic near-black workspace, subtle
  smoky waves, warm ivory typography and restrained brass accents.
- Dark mode is the default for new browsers; explicit Light selection persists.
- Use asymmetrical information hierarchy: Chapter Pulse dominates, operational
  ledgers and contextual intelligence remain visually quiet.
- Avoid neon gradients, equal-card walls, decorative 3D charts and excessive
  glass. Status colors remain semantic and always include text.
- This is a presentation-layer decision only; tenant scope, authorization,
  delivery confirmation and audit behavior must remain server-controlled.


### Layout Overrides

- **Max Width:** 1400px or full-width
- **Grid:** 12-column grid for data flexibility
- **Sections:** 1. Intro hook, 2. Chapter 1 (problem), 3. Chapter 2 (journey), 4. Chapter 3 (solution), 5. Climax CTA

### Spacing Overrides

- **Content Density:** High — optimize for information display

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

- **Strategy:** Progressive reveal. Each chapter has distinct color. Building intensity.

### Component Overrides

- Avoid: Leave UI frozen with no feedback
- Avoid: Icon buttons without labels
- Avoid: Keyboard traps or illogical tab order

---

## Page-Specific Components

- No unique components for this page

---

## Recommendations

- Effects: Hover tooltips, chart zoom on click, row highlighting on hover, smooth filter animations, data loading spinners
- Animation: Use skeleton screens or spinners
- Accessibility: Add aria-label for icon-only buttons
- Accessibility: Tab order matches visual order
- CTA Placement: End of each chapter (mini) + Final climax CTA

import {
  palmsPeriodDays,
  shouldUpdateCurrentPalms,
} from "./bni-report-import.ts";

Deno.test("PALMS current-window imports may update operational stats", () => {
  if (!shouldUpdateCurrentPalms("2026-01-01", "2026-08-31")) {
    throw new Error("current window rejected");
  }
});

Deno.test("multi-year PALMS imports remain historical snapshots", () => {
  if (shouldUpdateCurrentPalms("2024-03-01", "2026-08-31")) {
    throw new Error("historical range accepted");
  }
  if (palmsPeriodDays("2024-03-01", "2026-08-31") !== 914) {
    throw new Error("wrong inclusive day count");
  }
});

Deno.test("invalid PALMS periods never update operational stats", () => {
  if (shouldUpdateCurrentPalms("2026-09-01", "2026-08-31")) {
    throw new Error("reverse range accepted");
  }
});

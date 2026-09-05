export type PdfTextEntry = { page: number; x: number; y: number; text: string };

export type StructuredReportType =
  | "membership_dues"
  | "absence"
  | "speaker"
  | "training_gap"
  | "chapter_visitor"
  | "profession_opportunity";

export type StructuredReport = {
  reportType: StructuredReportType;
  runAt: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  rows: Array<Record<string, unknown>>;
};

const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;
const MONTHS: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

function clean(parts: string[]): string {
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function usDate(value: string): string | null {
  const m = value.trim().match(DATE_RE);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  const month = Number(m[1]), day = Number(m[2]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return date.toISOString().slice(0, 10);
}

function wordDate(parts: string[]): string | null {
  const text = clean(parts).replace(/\s+,/g, ",");
  const m = text.match(/\b([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})\b/);
  if (!m || !MONTHS[m[1]]) return null;
  return `${m[3]}-${String(MONTHS[m[1]]).padStart(2, "0")}-${
    String(Number(m[2])).padStart(2, "0")
  }`;
}

function runAt(entries: PdfTextEntry[]): string | null {
  const pageOne = entries.filter((e) =>
    e.page === entries[0]?.page && e.y > 490
  );
  const date = wordDate(pageOne.map((e) => e.text));
  return date ? `${date}T00:00:00+07:00` : null;
}

function parameterDate(entries: PdfTextEntry[], label: RegExp): string | null {
  const marker = entries.find((e) => label.test(e.text.trim()));
  if (!marker) return null;
  const candidates = entries.filter((e) =>
    e.page === marker.page && e.x > marker.x && Math.abs(e.y - marker.y) < 3
  );
  return usDate(clean(candidates.map((e) => e.text))) ||
    wordDate(candidates.map((e) => e.text));
}

function rowEntries(
  entries: PdfTextEntry[],
  anchor: PdfTextEntry,
  anchors: PdfTextEntry[],
  depth = 45,
): PdfTextEntry[] {
  const below = Math.max(
    -Infinity,
    ...anchors.filter((e) => e.page === anchor.page && e.y < anchor.y - 2).map(
      (e) => e.y,
    ),
  );
  const bottom = Number.isFinite(below)
    ? Math.max(below + 1, anchor.y - depth)
    : anchor.y - depth;
  return entries.filter((e) =>
    e.page === anchor.page && e.y <= anchor.y + 2 && e.y > bottom
  );
}

function atX(row: PdfTextEntry[], min: number, max: number): string {
  return clean(
    row.filter((e) => e.x >= min && e.x < max).sort((a, b) =>
      b.y - a.y || a.x - b.x
    ).map((e) => e.text),
  );
}

function reportTitle(entries: PdfTextEntry[]): string {
  return entries.find((e) => /Chapter\s*>/.test(e.text))?.text || "";
}

export function detectStructuredReportType(
  entries: PdfTextEntry[],
): StructuredReportType | null {
  const title = reportTitle(entries).toLowerCase();
  if (title.includes("membership dues report")) return "membership_dues";
  if (title.includes("absence report")) return "absence";
  if (title.includes("speaker report")) return "speaker";
  if (title.includes("member training report")) return "training_gap";
  if (title.includes("chapter visitor report")) return "chapter_visitor";
  if (title.includes("professions not in chapter")) {
    return "profession_opportunity";
  }
  return null;
}

function parseDues(entries: PdfTextEntry[]): Array<Record<string, unknown>> {
  const numbered = entries.filter((e) =>
    e.x >= 30 && e.x < 45 && /^\d+$/.test(e.text)
  );
  const dropped = entries.filter((e) => e.x > 280 && /^Dropped$/i.test(e.text))
    .map((e) => ({ ...e, x: 32, text: "0" }));
  const anchors = [...numbered, ...dropped];
  return anchors.map((anchor) => {
    const row = rowEntries(entries, anchor, anchors, 42);
    const status = row.find((e) =>
      /^(Active|Late|Dropped|Expired)$/i.test(e.text)
    )?.text || "";
    return {
      rowNumber: Number(anchor.text) || null,
      rawName: atX(row, 30, 129).replace(/^\d+\s+/, ""),
      profession: atX(row, 129, 207),
      membershipType: atX(row, 207, 258),
      membershipStatus: status,
      dueDate: wordDate(row.map((e) => e.text)),
      autorenewalEnabled: /^y(es)?$/i.test(atX(row, 341, 390)),
    };
  }).filter((row) => row.rawName && row.dueDate);
}

function parseAbsence(entries: PdfTextEntry[]): Array<Record<string, unknown>> {
  const anchors = entries.filter((e) =>
    e.x < 200 && !/^\d+$/.test(e.text) &&
    entries.filter((n) =>
        n.page === e.page && Math.abs(n.y - e.y) < 2 && n.x > 250 &&
        /^\d+$/.test(n.text)
      ).length >= 4
  );
  return anchors.map((anchor) => {
    const same = entries.filter((e) =>
      e.page === anchor.page && Math.abs(e.y - anchor.y) < 2
    );
    const num = (min: number, max: number) =>
      Number(
        clean(same.filter((e) => e.x >= min && e.x < max).map((e) => e.text)),
      ) || 0;
    return {
      rawName: anchor.text.trim(),
      absent: num(250, 292),
      medical: num(292, 326),
      late: num(326, 360),
      substitute: num(360, 405),
    };
  });
}

function parseSpeakers(
  entries: PdfTextEntry[],
): Array<Record<string, unknown>> {
  const anchors = entries.filter((e) => e.x > 300 && DATE_RE.test(e.text));
  return anchors.map((anchor) => {
    const same = entries.filter((e) =>
      e.page === anchor.page && Math.abs(e.y - anchor.y) < 2
    );
    return {
      rawName: atX(same, 20, 200),
      chapterName: atX(same, 200, 300),
      meetingDate: usDate(anchor.text),
    };
  }).filter((row) => row.rawName && row.meetingDate);
}

function parseTrainingGaps(
  entries: PdfTextEntry[],
): Array<Record<string, unknown>> {
  const anchors = entries.filter((e) => e.x >= 275 && /@/.test(e.text));
  return anchors.map((anchor) => {
    const row = rowEntries(entries, anchor, anchors, 32);
    return {
      rawName: atX(row, 20, 99),
      eventType: atX(row, 99, 198),
      joinDate: usDate(atX(row, 198, 229)),
      phone: atX(row, 229, 282),
      email: anchor.text.trim().toLowerCase(),
      gapStatus: "not_attended",
    };
  }).filter((row) => row.rawName && row.eventType);
}

function parseVisitors(
  entries: PdfTextEntry[],
): Array<Record<string, unknown>> {
  const anchors = entries.filter((e) =>
    e.x >= 215 && e.x < 350 && /@/.test(e.text)
  );
  return anchors.map((anchor) => {
    const row = rowEntries(entries, anchor, anchors, 38);
    return {
      visitorName: atX(row, 20, 118),
      company: atX(row, 118, 162),
      profession: atX(row, 162, 215),
      email: anchor.text.trim().toLowerCase(),
      visitDate: wordDate(
        row.filter((e) => e.x >= 350 && e.x < 379).map((e) => e.text),
      ),
      invitedBy: atX(row, 379, 500),
    };
  }).filter((row) => row.visitorName && row.visitDate);
}

function parseProfessionOpportunities(
  entries: PdfTextEntry[],
): Array<Record<string, unknown>> {
  const anchors = entries.filter((e) => e.x > 350 && /^\d+$/.test(e.text));
  return anchors.map((anchor) => {
    const same = entries.filter((e) =>
      e.page === anchor.page && Math.abs(e.y - anchor.y) < 2
    );
    return {
      profession: atX(same, 20, 340),
      nearbyChapterCount: Number(anchor.text),
    };
  }).filter((row) => row.profession);
}

export function parseStructuredReport(
  entries: PdfTextEntry[],
): StructuredReport | null {
  const reportType = detectStructuredReportType(entries);
  if (!reportType) return null;
  const parsers = {
    membership_dues: parseDues,
    absence: parseAbsence,
    speaker: parseSpeakers,
    training_gap: parseTrainingGaps,
    chapter_visitor: parseVisitors,
    profession_opportunity: parseProfessionOpportunities,
  };
  const periodFrom = parameterDate(entries, /^(Start Date:|From:)$/i);
  const periodTo = parameterDate(entries, /^(End Date:|To:)$/i);
  return {
    reportType,
    runAt: runAt(entries),
    periodFrom,
    periodTo,
    rows: parsers[reportType](entries),
  };
}

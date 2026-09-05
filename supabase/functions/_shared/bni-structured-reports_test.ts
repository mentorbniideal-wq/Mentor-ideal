import {
  detectStructuredReportType,
  parseStructuredReport,
  type PdfTextEntry,
} from "./bni-structured-reports.ts";

function entry(x: number, y: number, text: string): PdfTextEntry {
  return { page: 0, x, y, text };
}

Deno.test("detects all structured BNI report titles without guessing generic PDFs", () => {
  const titles: Array<[string, string]> = [
    ["Membership Dues Report", "membership_dues"],
    ["Absence Report", "absence"],
    ["Speaker Report", "speaker"],
    ["Member Training Report", "training_gap"],
    ["Chapter Visitor Report", "chapter_visitor"],
    ["Professions Not In Chapter", "profession_opportunity"],
  ];
  for (const [title, expected] of titles) {
    const actual = detectStructuredReportType([
      entry(10, 10, `Chapter > ${title}`),
    ]);
    if (actual !== expected) {
      throw new Error(`${title}: expected ${expected}, got ${actual}`);
    }
  }
  if (
    detectStructuredReportType([entry(10, 10, "Chapter > Unknown Report")]) !==
      null
  ) throw new Error("generic PDF must not be guessed");
});

Deno.test("parses membership dues as renewal facts", () => {
  const report = parseStructuredReport([
    entry(10, 550, "Chapter > Membership Dues Report"),
    entry(35, 400, "1"),
    entry(51, 400, "Jane"),
    entry(51, 391, "Member"),
    entry(258, 400, "Active"),
    entry(318, 400, "Sep"),
    entry(325, 391, "1,"),
    entry(315, 382, "2027"),
    entry(342, 400, "N"),
  ]);
  if (
    report?.rows.length !== 1 || report.rows[0].dueDate !== "2027-09-01" ||
    report.rows[0].membershipStatus !== "Active"
  ) {
    throw new Error(`unexpected dues parse: ${JSON.stringify(report)}`);
  }
});

Deno.test("training report remains a not-attended gap", () => {
  const report = parseStructuredReport([
    entry(10, 550, "Chapter > Member Training Report"),
    entry(31, 240, "Jane Member"),
    entry(100, 240, "Member Success Program"),
    entry(199, 240, "9/1/26"),
    entry(230, 240, "081 234 5678"),
    entry(283, 240, "jane@example.com"),
  ]);
  if (report?.rows[0]?.gapStatus !== "not_attended") {
    throw new Error("training gaps must never become completions");
  }
});

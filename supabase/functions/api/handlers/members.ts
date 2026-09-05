// Handler: members
// Covers: getMemberList, moveMemberToTeam, assignToTeam,
//         archiveMember, unarchiveMember, addNewMember, saveScore, saveStatus, etc.
import { requireAuth } from "../../_shared/auth.ts";
import {
  errResponse,
  getServiceClient,
  jsonResponse,
} from "../../_shared/db.ts";
import { canAccessTeam } from "../../_shared/authorization.ts";
import { calcPalmsScore } from "../../_shared/palms.ts";
import {
  canManageMemberSignal,
  canTransitionMemberSignal,
  canViewMemberSignal,
} from "../../_shared/member-signal-access.ts";
import { linePush, sha256Hex } from "../../_shared/line.ts";
import {
  evaluateNotificationGuard,
  logSuppressedNotification,
} from "../../_shared/notification-orchestrator.ts";
import {
  detectBniReportTypeFromLabels,
  palmsPeriodDays,
  shouldUpdateCurrentPalms,
} from "../../_shared/bni-report-import.ts";
import {
  parseStructuredReport,
  type StructuredReport,
} from "../../_shared/bni-structured-reports.ts";

const VALID_TEAMS = new Set(["TOOMTAM", "Aof", "Draft", "PHAI", "AMP"]);
const GROWTH_WATCH_MIN_SCORE = 65;
const LT_ROLE_CATALOG = [
  { role: "President", label: "President", scopes: [] },
  { role: "Vice President", label: "Vice President", scopes: [] },
  {
    role: "Secretary/Treasurer",
    label: "Secretary / Treasurer",
    scopes: ["absence", "renewal", "training"],
  },
  {
    role: "Membership Committee",
    label: "Membership Committee",
    scopes: ["absence", "renewal"],
  },
  { role: "Visitor Host", label: "Visitor Host", scopes: ["visitor"] },
  {
    role: "Event Coordinator",
    label: "Event Coordinator",
    scopes: ["visitor"],
  },
  {
    role: "Mentor Coordinator",
    label: "Mentor Coordinator",
    scopes: ["member_help", "new_member"],
  },
  { role: "Growth Coordinator", label: "Growth Coordinator", scopes: ["goal"] },
  { role: "Web Master", label: "Web Master", scopes: [] },
  {
    role: "Network Education Coordinator",
    label: "NEC · Network Education Coordinator",
    scopes: ["training"],
  },
  {
    role: "Mentor Co.",
    label: "Mentor Co.",
    scopes: ["member_help", "new_member"],
  },
  // Durable role values keep historical team membership intact. The labels are
  // human positions; Desktop derives each team name from the assigned Mentor.
  {
    role: "Mentor Team · TOOMTAM",
    label: "Mentor member 1",
    scopes: ["member_help"],
  },
  {
    role: "Mentor Team · Aof",
    label: "Mentor member 2",
    scopes: ["member_help"],
  },
  {
    role: "Mentor Team · Draft",
    label: "Mentor member 3",
    scopes: ["member_help"],
  },
  {
    role: "Mentor Team · PHAI",
    label: "Mentor member 4",
    scopes: ["member_help"],
  },
  {
    role: "Mentor Team · AMP",
    label: "Mentor member 5",
    scopes: ["member_help"],
  },
  {
    role: "Mentor Support 1",
    label: "Mentor support 1",
    scopes: ["member_help"],
  },
  {
    role: "Mentor Support 2",
    label: "Mentor support 2",
    scopes: ["member_help"],
  },
] as const;

type MemberRef = {
  id: string;
  name: string;
  nickname: string | null;
  mentor_team: string | null;
};

type RosterMemberRow = {
  rawName: string;
  profession: string;
  companyName: string;
  phone: string;
  referralsGiven90d: number;
  referralsReceived90d: number;
  visitors90d: number;
  oneToOne90d: number;
  late90d: number;
  absent90d: number;
};

type ParsedRosterReport = {
  runAt: string | null;
  chapter: string | null;
  memberCountLabel: number | null;
  rows: RosterMemberRow[];
};

async function buildLtHandoverLinePreview(
  db: ReturnType<typeof getServiceClient>,
  termId: string,
) {
  const [
    { data: term },
    { data: assignments },
    { data: items },
    { data: links },
    { data: members },
  ] = await Promise.all([
    db.from("lt_terms").select("id,name,starts_on,ends_on,status").eq(
      "id",
      termId,
    ).maybeSingle(),
    db.from("passport_lt_assignments").select("lt_role,assigned_member_id").eq(
      "term_id",
      termId,
    ),
    db.from("lt_role_handover_items").select(
      "lt_role,label,status,due_at,incoming_member_id",
    ).eq("to_term_id", termId),
    db.from("line_members").select("member_id,line_user_id"),
    db.from("members").select("id,name,nickname"),
  ]);
  if (!term) return { error: "ไม่พบวาระ" };
  const nameById = new Map(
    ((members || []) as Record<string, unknown>[]).map(
      (row) => [String(row.id), String(row.nickname || row.name || "สมาชิก")],
    ),
  );
  const lineById = new Map(
    ((links || []) as Record<string, unknown>[]).map(
      (row) => [String(row.member_id), String(row.line_user_id || "")],
    ),
  );
  const rolesByMember = new Map<string, string[]>();
  for (const row of (assignments || []) as Record<string, unknown>[]) {
    const memberId = String(row.assigned_member_id || "");
    if (memberId) {
      (rolesByMember.get(memberId) ||
        rolesByMember.set(memberId, []).get(memberId)!).push(
          String(row.lt_role || ""),
        );
    }
  }
  const itemRows = (items || []) as Record<string, unknown>[];
  const recipients = [...rolesByMember.entries()].map(([memberId, roles]) => {
    const pending = itemRows.filter((row) =>
      roles.includes(String(row.lt_role)) &&
      !["ready", "not_applicable"].includes(String(row.status))
    );
    const name = nameById.get(memberId) || "สมาชิก";
    const taskLines = pending.slice(0, 6).map((row) =>
      `• ${String(row.lt_role)} — ${String(row.label)}`
    );
    const message = `🤝 ส่งมอบวาระ LT · ${
      String((term as Record<string, unknown>).name)
    }\n\nสวัสดีครับคุณ${name}\nตำแหน่งของคุณ: ${roles.join(", ")}\nเริ่มวาระ: ${
      String((term as Record<string, unknown>).starts_on)
    }\n\n${
      taskLines.length
        ? `รายการที่ต้องรับมอบ\n${taskLines.join("\n")}`
        : "รายการส่งมอบของคุณพร้อมแล้ว"
    }\n\nกรุณาเปิด Chapter Center เพื่อตรวจรายละเอียดและยืนยันรับมอบครับ`;
    return {
      memberId,
      name,
      roles,
      pendingCount: pending.length,
      lineUserId: lineById.get(memberId) || "",
      message,
    };
  });
  const previewToken = await sha256Hex(
    JSON.stringify({
      termId,
      recipients: recipients.map(
        (row) => [row.memberId, row.lineUserId, row.message],
      ),
    }),
  );
  return { term, recipients, previewToken };
}

type PalmsSummaryRow = {
  rawName: string;
  present: number;
  absent: number;
  late: number;
  medical: number;
  substitute: number;
  rgi: number;
  rgo: number;
  rri: number;
  rro: number;
  visitors: number;
  oneToOne: number;
  revenueGivenThb: number;
  ceu: number;
  revenueReceivedThb: number;
  calculatedScore: number;
  calculatedColor: string;
  palmsDetail: Record<string, unknown>;
};

type ParsedPalmsSummaryReport = {
  runAt: string | null;
  chapter: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  rows: PalmsSummaryRow[];
};

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTeam(value: unknown): string | null {
  const raw = textValue(value);
  if (!raw) return null;
  const found = [...VALID_TEAMS].find((team) =>
    team.toLowerCase() === raw.toLowerCase()
  );
  return found || raw;
}

function currentBangkokYear(): number {
  const year = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).format(new Date());
  return Number(year);
}

function ymdDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseYmdDate(value: unknown): Date | null {
  const raw = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nextFridayOnOrAfter(dateValue: unknown): string | null {
  const d = parseYmdDate(dateValue);
  if (!d) return null;
  const day = d.getUTCDay(); // 0 Sun ... 5 Fri
  const add = (5 - day + 7) % 7;
  d.setUTCDate(d.getUTCDate() + add);
  return ymdDate(d);
}

function addDaysYmd(dateValue: string, days: number): string {
  const d = parseYmdDate(dateValue) || new Date(`${dateValue}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return ymdDate(d);
}

function currentPassportWeek(startFriday: unknown): number {
  const start = parseYmdDate(startFriday);
  if (!start) return 0;
  const today = new Date();
  const now = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
      12,
    ),
  );
  const diff = Math.floor((now.getTime() - start.getTime()) / 86400000);
  if (diff < 0) return 0;
  return Math.min(8, Math.floor(diff / 7) + 1);
}

async function syncPassportEnrollments(
  db: any,
): Promise<{ enrolled: number; sessionsCreated: number }> {
  const { data: templates, error: tplErr } = await db
    .from("passport_templates")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  if (tplErr) throw new Error(tplErr.message);
  const tplRows = (templates || []) as Record<string, unknown>[];
  if (!tplRows.length) return { enrolled: 0, sessionsCreated: 0 };

  const { data: assignmentRows, error: asgErr } = await db
    .from("passport_lt_assignments")
    .select("*")
    .eq("is_active", true);
  if (asgErr) throw new Error(asgErr.message);
  const assignments: Record<string, Record<string, unknown>> = {};
  for (const a of (assignmentRows || []) as Record<string, unknown>[]) {
    assignments[String(a.lt_role || "")] = a;
  }

  const { data: memberRows, error: memErr } = await db
    .from("members")
    .select("id, name, nickname, mentor_team, joined_date")
    .eq("is_archived", false)
    .eq("is_new_member", true)
    .not("joined_date", "is", null);
  if (memErr) throw new Error(memErr.message);
  const members = (memberRows || []) as Record<string, unknown>[];
  if (!members.length) return { enrolled: 0, sessionsCreated: 0 };

  const memberIds = members.map((m) => String(m.id)).filter(Boolean);
  const { data: existingRows, error: exErr } = await db
    .from("passport_enrollments")
    .select("*")
    .in("member_id", memberIds);
  if (exErr) throw new Error(exErr.message);
  const byMember: Record<string, Record<string, unknown>> = {};
  for (const e of (existingRows || []) as Record<string, unknown>[]) {
    byMember[String(e.member_id)] = e;
  }

  let enrolled = 0;
  for (const m of members) {
    const memberId = String(m.id || "");
    if (!memberId || byMember[memberId]) continue;
    const startFriday = nextFridayOnOrAfter(m.joined_date);
    if (!startFriday) continue;
    const { data: created, error } = await db.from("passport_enrollments")
      .insert({
        member_id: memberId,
        joined_date: String(m.joined_date).slice(0, 10),
        start_friday: startFriday,
        status: "active",
      }).select("*").single();
    if (error) throw new Error(error.message);
    byMember[memberId] = created as Record<string, unknown>;
    enrolled++;
  }

  const enrollmentIds = Object.values(byMember).map((e) => String(e.id)).filter(
    Boolean,
  );
  const { data: sessionRows, error: sessErr } = await db
    .from("passport_sessions")
    .select("enrollment_id, template_id, template_key, week_no, lt_role")
    .in("enrollment_id", enrollmentIds);
  if (sessErr) throw new Error(sessErr.message);
  const sessionKey = new Set(
    (sessionRows || []).map((s: Record<string, unknown>) => {
      const tplKey = String(
        s.template_key || s.template_id || `${s.week_no}:${s.lt_role}`,
      );
      return `${s.enrollment_id}:${tplKey}`;
    }),
  );

  const inserts: Record<string, unknown>[] = [];
  for (const enrollment of Object.values(byMember)) {
    const startFriday = String(enrollment.start_friday || "");
    const enrollmentId = String(enrollment.id || "");
    const memberId = String(enrollment.member_id || "");
    if (!startFriday || !enrollmentId || !memberId) continue;
    for (const t of tplRows) {
      const weekNo = Number(t.week_no) || 0;
      const tplKey = String(t.template_key || t.id || `${weekNo}:${t.lt_role}`);
      if (!weekNo || sessionKey.has(`${enrollmentId}:${tplKey}`)) continue;
      const ltRole = String(t.lt_role || "");
      const asg = assignments[ltRole] || {};
      const scheduledDate = addDaysYmd(
        startFriday,
        t.default_offset_days != null
          ? Number(t.default_offset_days)
          : (weekNo - 1) * 7,
      );
      inserts.push({
        enrollment_id: enrollmentId,
        template_id: t.id || null,
        template_key: tplKey,
        member_id: memberId,
        week_no: weekNo,
        scheduled_date: scheduledDate,
        original_scheduled_date: scheduledDate,
        title: String(t.title || `Week ${weekNo}`),
        description: String(t.description || ""),
        lt_role: ltRole || null,
        assigned_lt_member_id: asg.assigned_member_id || null,
        assigned_lt_name: asg.assigned_name || null,
        status: "scheduled",
      });
    }
  }

  if (inserts.length) {
    const { error } = await db.from("passport_sessions").insert(inserts);
    if (error) throw new Error(error.message);
  }
  return { enrolled, sessionsCreated: inserts.length };
}

async function getPassportBoardData(db: any) {
  const sync = await syncPassportEnrollments(db);
  const { data: enrollments, error: enErr } = await db
    .from("passport_enrollments")
    .select("*, members(id, name, nickname, mentor_team)")
    .order("start_friday", { ascending: true });
  if (enErr) throw new Error(enErr.message);
  const enrollmentRows = (enrollments || []) as Record<string, unknown>[];
  const ids = enrollmentRows.map((e) => String(e.id)).filter(Boolean);
  let sessions: Record<string, unknown>[] = [];
  if (ids.length) {
    const { data, error } = await db
      .from("passport_sessions")
      .select("*")
      .in("enrollment_id", ids)
      .order("scheduled_date", { ascending: true })
      .order("week_no", { ascending: true });
    if (error) throw new Error(error.message);
    sessions = (data || []) as Record<string, unknown>[];
  }
  const byEnrollment: Record<string, Record<string, unknown>[]> = {};
  for (const s of sessions) {
    const key = String(s.enrollment_id || "");
    if (!byEnrollment[key]) byEnrollment[key] = [];
    byEnrollment[key].push(s);
  }
  const members = enrollmentRows.map((e) => {
    const list = byEnrollment[String(e.id)] || [];
    const done = list.filter((s) => s.status === "completed").length;
    const currentWeek = currentPassportWeek(e.start_friday);
    const nextSession = list.find((s) =>
      !["completed", "missed"].includes(String(s.status || ""))
    ) || list[list.length - 1] || null;
    return {
      ...e,
      sessions: list,
      done,
      total: list.length,
      currentWeek,
      nextSession,
    };
  });
  const { data: templates } = await db.from("passport_templates").select("*")
    .order("sort_order");
  const { data: assignments } = await db.from("passport_lt_assignments").select(
    "*",
  ).eq("is_active", true).order("lt_role");
  return {
    sync,
    members,
    sessions,
    templates: templates || [],
    assignments: assignments || [],
  };
}

function normalizeMemberName(value: unknown): string {
  return String(value || "")
    .replace(/\s*\(bni ideal\)\s*/gi, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9ก-๙]+/g, "");
}

function normalizePhone(value: unknown): string {
  return String(value || "").replace(/\D+/g, "");
}

function decodeBase64Pdf(value: unknown): Uint8Array {
  const raw = textValue(value).replace(/^data:application\/pdf;base64,/i, "");
  if (!raw) throw new Error("pdfBase64 required");
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function inflatePdfStream(raw: Uint8Array): Promise<Uint8Array | null> {
  try {
    const rawBuffer = raw.buffer.slice(
      raw.byteOffset,
      raw.byteOffset + raw.byteLength,
    ) as ArrayBuffer;
    const stream = new Blob([rawBuffer]).stream().pipeThrough(
      new DecompressionStream("deflate"),
    );
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

async function extractPdfStreams(pdf: Uint8Array): Promise<string[]> {
  const text = new TextDecoder("latin1").decode(pdf);
  const streams: string[] = [];
  const marker = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = marker.exec(text))) {
    const start = m.index + m[0].length;
    const end = text.indexOf("endstream", start);
    if (end < 0) continue;
    let raw = pdf.slice(start, end);
    while (
      raw.length && (raw[raw.length - 1] === 10 || raw[raw.length - 1] === 13)
    ) raw = raw.slice(0, -1);
    const inflated = await inflatePdfStream(raw);
    if (!inflated) continue;
    streams.push(new TextDecoder("latin1").decode(inflated));
  }
  return streams;
}

function parseCMap(streams: string[]): Record<number, string> {
  const cmap: Record<number, string> = {};
  const lines = streams.join("\n").split(/\r?\n/);
  for (const line of lines) {
    const m = line.trim().match(
      /^<([0-9A-Fa-f]{2})><([0-9A-Fa-f]{2})><([0-9A-Fa-f]{4})>/,
    );
    if (!m) continue;
    const from = parseInt(m[1], 16);
    const to = parseInt(m[2], 16);
    const uni = parseInt(m[3], 16);
    for (let code = from; code <= to; code++) {
      cmap[code] = String.fromCharCode(uni + code - from);
    }
  }
  return cmap;
}

function unescapePdfLiteral(value: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i);
    if (ch !== 92) {
      out.push(ch & 255);
      continue;
    }
    i++;
    if (i >= value.length) break;
    const esc = value[i];
    const map: Record<string, number> = {
      n: 10,
      r: 13,
      t: 9,
      b: 8,
      f: 12,
      "(": 40,
      ")": 41,
      "\\": 92,
    };
    if (map[esc] != null) {
      out.push(map[esc]);
    } else if (/[0-7]/.test(esc)) {
      let oct = esc;
      for (
        let j = 0;
        j < 2 && i + 1 < value.length && /[0-7]/.test(value[i + 1]);
        j++
      ) oct += value[++i];
      out.push(parseInt(oct, 8));
    } else if (esc === "\n" || esc === "\r") {
      if (esc === "\r" && value[i + 1] === "\n") i++;
    } else {
      out.push(esc.charCodeAt(0) & 255);
    }
  }
  return out;
}

function extractPdfLiteralBytes(body: string): number[] {
  const out: number[] = [];
  const re = /\((?:\\.|[^\\)])*\)/gs;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    out.push(...unescapePdfLiteral(m[0].slice(1, -1)));
  }
  return out;
}

function decodePdfText(
  body: string,
  font: string,
  cmap: Record<number, string>,
): string {
  const bytes = extractPdfLiteralBytes(body);
  if (font === "TT4") {
    return bytes.map((b) => cmap[b] || String.fromCharCode(b)).join("");
  }
  return bytes.map((b) => String.fromCharCode(b)).join("");
}

function parsePdfTextEntries(
  streams: string[],
): Array<{ page: number; x: number; y: number; text: string }> {
  const cmap = parseCMap(streams);
  const entries: Array<{ page: number; x: number; y: number; text: string }> =
    [];
  const blockRe =
    /q\s+[-0-9.]+\s+[-0-9.]+\s+[-0-9.]+\s+[-0-9.]+\s+([-0-9.]+)\s+([-0-9.]+)\s+cm\s+BT(.*?)ET\s+Q/gs;
  for (let page = 0; page < streams.length; page++) {
    const stream = streams[page];
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(stream))) {
      const body = m[3];
      const fontMatch = body.match(/\/(TT\d+)\s+\d+\s+Tf/);
      const text = decodePdfText(body, fontMatch?.[1] || "", cmap).replace(
        /\s+/g,
        " ",
      ).trim();
      if (!text) continue;
      entries.push({ page, x: Number(m[1]), y: Number(m[2]), text });
    }
  }
  return entries;
}

function cleanRosterText(parts: string[]): string {
  return parts
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/^[,.\s]+|[,.\s]+$/g, "")
    .trim();
}

function safeRosterImportText(value: unknown): string | null {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  // Some BNI PDFs embed Thai company names through a custom font mapping. If
  // decoding leaves controls, Latin-extended fragments, or PDF glyph markers,
  // keep the current database value rather than importing corrupted text.
  if (/[\u0000-\u001f\u007f\ufffd\u00c0-\u024f]/.test(clean)) return null;
  if (/[\u0e00-\u0e7f]/.test(clean) && /["#*+~\[\]\\^_]/.test(clean)) {
    return null;
  }
  return clean;
}

function isNameLine(y: number, anchorY: number): boolean {
  const delta = y - anchorY;
  return delta <= 2 && delta >= -12;
}

function parseRunAt(value: string): string | null {
  const m = value.match(
    /([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)/,
  );
  if (!m) return null;
  const months: Record<string, number> = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };
  let hour = Number(m[4]);
  if (m[6] === "PM" && hour < 12) hour += 12;
  if (m[6] === "AM" && hour === 12) hour = 0;
  const date = new Date(
    Date.UTC(
      Number(m[3]),
      months[m[1]] ?? 0,
      Number(m[2]),
      hour - 7,
      Number(m[5]),
    ),
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseUsDate(value: string): string | null {
  const m = String(value || "").trim().match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/,
  );
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  if (!month || !day || !year) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function pickInt(
  entries: Array<{ page?: number; x: number; y: number; text: string }>,
  minX: number,
  maxX: number,
  y: number,
  page?: number,
): number {
  const found = entries
    .filter((e) =>
      (page == null || e.page === page) && e.x >= minX && e.x < maxX &&
      Math.abs(e.y - y) <= 1.8
    )
    .map((e) => e.text)
    .join("");
  const n = Number(found.replace(/\D+/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function dominantPhoneX(
  entries: Array<{ page?: number; x: number; y: number; text: string }>,
): number | null {
  const buckets = new Map<number, { count: number; values: number[] }>();
  for (const entry of entries) {
    if (normalizePhone(entry.text).length < 9) continue;
    const bucket = Math.round(entry.x / 8) * 8;
    const current = buckets.get(bucket) || { count: 0, values: [] };
    current.count++;
    current.values.push(entry.x);
    buckets.set(bucket, current);
  }
  const winner = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!winner || winner.count < 2) return null;
  return winner.values.reduce((sum, value) => sum + value, 0) /
    winner.values.length;
}

function parseRosterReportFromEntries(
  entries: Array<{ page?: number; x: number; y: number; text: string }>,
): ParsedRosterReport {
  const runAtText =
    entries.find((e) => e.text.match(/^[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}/))
      ?.text || "";
  const chapterLabel = entries.find((e) =>
    /^Chapter(?::|\b)/.test(e.text.trim())
  );
  const chapterInline =
    chapterLabel?.text.match(/^Chapter:\s*(.+)$/)?.[1]?.trim() || "";
  const chapter = chapterInline ||
    (chapterLabel
      ? entries.filter((e) =>
        e.page === chapterLabel.page && e.x > chapterLabel.x &&
        Math.abs(e.y - chapterLabel.y) <= 2
      ).sort((a, b) => a.x - b.x)[0]?.text || null
      : null);
  const memberCountLabel = Number(
    (entries.find((e) => /\d+\s+Members/.test(e.text))?.text || "").match(
      /(\d+)/,
    )?.[1] || "",
  ) || null;
  // BNI Connect has shipped the same report at multiple PDF scales. Infer the
  // member-table phone column from the dominant phone position instead of
  // binding imports to one historical set of coordinates.
  const phoneX = dominantPhoneX(entries) || 312;
  const phoneTolerance = Math.max(12, phoneX * 0.075);
  const phoneAnchors = entries
    .filter((e) =>
      Math.abs(e.x - phoneX) <= phoneTolerance &&
      normalizePhone(e.text).length >= 9
    )
    .sort((a, b) => b.y - a.y);

  const rosterHeaders = ["Member Name", "Profession", "Company Name", "Phone"]
    .map((label) =>
      entries.find((entry) => entry.text.trim() === label)?.x || 0
    );
  const hasRosterHeaders =
    detectBniReportTypeFromLabels(entries.map((entry) => entry.text)) ===
      "chapter_roster" &&
    rosterHeaders.every((x) => x > 0);
  if (!hasRosterHeaders) {
    return {
      runAt: parseRunAt(runAtText),
      chapter,
      memberCountLabel,
      rows: [],
    };
  }
  const nameMaxX = hasRosterHeaders
    ? (rosterHeaders[0] + rosterHeaders[1]) / 2
    : phoneX * 0.34;
  const professionMinX = nameMaxX;
  const professionMaxX = hasRosterHeaders
    ? (rosterHeaders[1] + rosterHeaders[2]) / 2
    : phoneX * 0.61;
  const companyMinX = professionMaxX;
  const companyMaxX = hasRosterHeaders
    ? (rosterHeaders[2] + rosterHeaders[3]) / 2
    : phoneX * 0.99;
  const metricCenters = [1.27, 1.42, 1.56, 1.60, 1.70, 1.80].map((ratio) =>
    phoneX * ratio
  );
  const metricBounds = metricCenters.map((center, index) => {
    const left = index === 0
      ? center - (metricCenters[1] - center) * 0.5
      : (metricCenters[index - 1] + center) / 2;
    const right = index === metricCenters.length - 1
      ? center + (center - metricCenters[index - 1]) * 0.5
      : (center + metricCenters[index + 1]) / 2;
    return [left, right] as [number, number];
  });

  const rows: RosterMemberRow[] = [];
  const seen = new Set<string>();
  for (const anchor of phoneAnchors) {
    const y = anchor.y;
    // Bound the row by the next phone anchor on the same page. The old fixed
    // 38-point window could absorb profession/company text from the next row.
    const nextAnchorY = Math.max(
      -Infinity,
      ...phoneAnchors
        .filter((candidate) =>
          candidate.page === anchor.page && candidate.y < y - 2
        )
        .map((candidate) => candidate.y),
    );
    const rowBottom = Number.isFinite(nextAnchorY) ? nextAnchorY + 2 : y - 45;
    const near = entries.filter((e) =>
      e.page === anchor.page && e.y <= y + 2 && e.y > rowBottom
    );
    const name = cleanRosterText(
      near.filter((e) => e.x >= 20 && e.x < nameMaxX && isNameLine(e.y, y))
        .sort((a, b) => b.y - a.y || a.x - b.x).map((e) => e.text),
    );
    if (
      !name ||
      /Member Name|Running User|Parameters|Officers|Regional Leadership/.test(
        name,
      )
    ) continue;
    const key = normalizeMemberName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    rows.push({
      rawName: name,
      profession: cleanRosterText(
        near.filter((e) => e.x >= professionMinX && e.x < professionMaxX).sort((
          a,
          b,
        ) => b.y - a.y || a.x - b.x).map((e) => e.text),
      ),
      companyName: cleanRosterText(
        near.filter((e) => e.x >= companyMinX && e.x < companyMaxX).sort((
          a,
          b,
        ) => b.y - a.y || a.x - b.x).map((e) => e.text),
      ),
      phone: anchor.text.replace(/\s+/g, " ").trim(),
      referralsGiven90d: pickInt(entries, ...metricBounds[0], y, anchor.page),
      referralsReceived90d: pickInt(
        entries,
        ...metricBounds[1],
        y,
        anchor.page,
      ),
      visitors90d: pickInt(entries, ...metricBounds[2], y, anchor.page),
      oneToOne90d: pickInt(entries, ...metricBounds[3], y, anchor.page),
      late90d: pickInt(entries, ...metricBounds[4], y, anchor.page),
      absent90d: pickInt(entries, ...metricBounds[5], y, anchor.page),
    });
  }

  return { runAt: parseRunAt(runAtText), chapter, memberCountLabel, rows };
}

export async function parseRosterPdf(
  pdfBase64: unknown,
): Promise<ParsedRosterReport> {
  const bytes = decodeBase64Pdf(pdfBase64);
  const streams = await extractPdfStreams(bytes);
  if (!streams.length) {
    throw new Error("อ่าน PDF ไม่ได้ หรือไม่พบ compressed stream");
  }
  const entries = parsePdfTextEntries(streams);
  const report = parseRosterReportFromEntries(entries);
  if (!report.rows.length) throw new Error("อ่าน Chapter Roster ไม่พบแถวสมาชิก");
  return report;
}

function pickNumber(
  entries: Array<{ page?: number; x: number; y: number; text: string }>,
  minX: number,
  maxX: number,
  y: number,
  page?: number,
): number {
  const found = entries
    .filter((e) =>
      (page == null || e.page === page) && e.x >= minX && e.x < maxX &&
      Math.abs(e.y - y) <= 1.8
    )
    .sort((a, b) => a.x - b.x)
    .map((e) => e.text)
    .join("");
  const cleaned = found.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return cleaned ? Number(cleaned[0]) : 0;
}

function parsePalmsSummaryReportFromEntries(
  entries: Array<{ page?: number; x: number; y: number; text: string }>,
): ParsedPalmsSummaryReport {
  const runAtText =
    entries.find((e) => e.text.match(/^[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}/))
      ?.text || "";
  const chapterLabel = entries.find((e) =>
    /^Chapter(?::|\b)/.test(e.text.trim())
  );
  const chapterInline =
    chapterLabel?.text.match(/^Chapter:\s*(.+)$/)?.[1]?.trim() || "";
  const chapter = chapterInline ||
    (chapterLabel
      ? entries.filter((e) =>
        e.page === chapterLabel.page && e.x > chapterLabel.x &&
        Math.abs(e.y - chapterLabel.y) <= 2
      ).sort((a, b) => a.x - b.x)[0]?.text || null
      : null);
  const dateEntries = entries.filter((e) =>
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(e.text)
  );
  const fromText = dateEntries[0]?.text || "";
  const toText = dateEntries[1]?.text || "";
  const headerLabels = [
    "P",
    "A",
    "L",
    "M",
    "S",
    "RGI",
    "RGO",
    "RRI",
    "RRO",
    "Visitors",
    "1-2-1",
    "Rev Given",
    "CEU",
    "Rev Rcvd",
  ];
  if (
    detectBniReportTypeFromLabels(entries.map((entry) => entry.text)) !==
      "summary_palms"
  ) {
    return {
      runAt: parseRunAt(runAtText),
      chapter,
      periodFrom: parseUsDate(fromText),
      periodTo: parseUsDate(toText),
      rows: [],
    };
  }
  const headerEntries = headerLabels.map((label) =>
    entries.find((e) => e.text.trim() === label)
  );
  const centers = headerEntries.map((entry) => entry?.x ?? 0);
  const hasAdaptiveHeaders = centers.every((x) => x > 0);
  const pCenter = hasAdaptiveHeaders ? centers[0] : 137;
  const bounds = centers.map((center, index) => {
    if (!hasAdaptiveHeaders) return null;
    // Numeric values are right-aligned while the PDF header labels are
    // left-aligned. Put boundaries three quarters of the way to the adjacent
    // label so a Visitors value cannot be concatenated into the 1-2-1 value.
    const left = index === 0
      ? center - (centers[1] - center) * 0.35
      : centers[index - 1] + (center - centers[index - 1]) * 0.75;
    const right = index === centers.length - 1
      ? center + (center - centers[index - 1]) * 1.35
      : center + (centers[index + 1] - center) * 0.75;
    return [left, right] as [number, number];
  });
  const anchors = entries
    .filter((e) =>
      Math.abs(e.x - pCenter) < Math.max(10, pCenter * 0.1) &&
      /^\d+(?:\.\d+)?$/.test(e.text) && e.y < (headerEntries[0]?.y ?? 590)
    )
    .sort((a, b) => b.y - a.y);

  const rows: PalmsSummaryRow[] = [];
  const seen = new Set<string>();
  for (const anchor of anchors) {
    const y = anchor.y;
    const nextAnchorY = Math.max(
      -Infinity,
      ...anchors
        .filter((candidate) =>
          candidate.page === anchor.page && candidate.y < y - 2
        )
        .map((candidate) => candidate.y),
    );
    const rowBottom = Number.isFinite(nextAnchorY) ? nextAnchorY + 2 : y - 14;
    const near = entries.filter((e) =>
      e.page === anchor.page && e.y <= y + 2 && e.y > rowBottom
    );
    const rawName = cleanRosterText(
      near.filter((e) =>
        e.x >= 20 && e.x < pCenter * 0.92 && isNameLine(e.y, y)
      ).sort((a, b) => b.y - a.y || a.x - b.x).map((e) => e.text),
    );
    const key = normalizeMemberName(rawName);
    if (
      !key || seen.has(key) || /Member Name|Parameters|Chapter/.test(rawName)
    ) continue;
    if (/^(Visitors?|BNI|Total)$/i.test(rawName)) continue;
    seen.add(key);

    const legacy = [
      [128, 148],
      [155, 172],
      [176, 192],
      [196, 214],
      [220, 240],
      [245, 267],
      [274, 294],
      [302, 322],
      [332, 350],
      [354, 397],
      [402, 426],
      [428, 488],
      [488, 516],
      [520, 568],
    ] as Array<[number, number]>;
    const valueAt = (index: number) =>
      pickNumber(entries, ...(bounds[index] || legacy[index]), y, anchor.page);
    const present = valueAt(0);
    const absent = valueAt(1);
    const late = valueAt(2);
    const medical = valueAt(3);
    const substitute = valueAt(4);
    const rgi = valueAt(5);
    const rgo = valueAt(6);
    const rri = valueAt(7);
    const rro = valueAt(8);
    const visitors = valueAt(9);
    const oneToOne = valueAt(10);
    const revenueGivenThb = valueAt(11);
    const ceu = valueAt(12);
    const revenueReceivedThb = valueAt(13);
    const palms = calcPalmsScore({
      attend: present,
      absent,
      late,
      medical,
      sub: substitute,
      rgi,
      rgo,
      visitor: visitors,
      oto: oneToOne,
      ceu,
      tyfb: revenueGivenThb,
      bniDays: 0,
    });

    rows.push({
      rawName,
      present,
      absent,
      late,
      medical,
      substitute,
      rgi,
      rgo,
      rri,
      rro,
      visitors,
      oneToOne,
      revenueGivenThb,
      ceu,
      revenueReceivedThb,
      calculatedScore: palms.total,
      calculatedColor: palms.color,
      palmsDetail: palms as unknown as Record<string, unknown>,
    });
  }

  return {
    runAt: parseRunAt(runAtText),
    chapter,
    periodFrom: parseUsDate(fromText),
    periodTo: parseUsDate(toText),
    rows,
  };
}

export async function parsePalmsSummaryPdf(
  pdfBase64: unknown,
): Promise<ParsedPalmsSummaryReport> {
  const bytes = decodeBase64Pdf(pdfBase64);
  const streams = await extractPdfStreams(bytes);
  if (!streams.length) {
    throw new Error("อ่าน PDF ไม่ได้ หรือไม่พบ compressed stream");
  }
  const entries = parsePdfTextEntries(streams);
  const report = parsePalmsSummaryReportFromEntries(entries);
  if (!report.periodFrom || !report.periodTo) {
    throw new Error("อ่านช่วงวันที่ From/To ใน Summary PALMS ไม่ได้");
  }
  if (!report.rows.length) throw new Error("อ่าน Summary PALMS ไม่พบแถวสมาชิก");
  return report;
}

export async function buildRosterPreview(
  db: ReturnType<typeof getServiceClient>,
  report: ParsedRosterReport,
) {
  const { data, error } = await db
    .from("members")
    .select("id, name, nickname, phone, profession, company_name, is_archived")
    .eq("is_archived", false);
  if (error) throw new Error(error.message);

  const members = (data || []) as Array<Record<string, unknown>>;
  const byName = new Map<string, Record<string, unknown>>();
  const byPhone = new Map<string, Record<string, unknown>>();
  for (const m of members) {
    byName.set(normalizeMemberName(m.name), m);
    if (m.nickname) byName.set(normalizeMemberName(m.nickname), m);
    const ph = normalizePhone(m.phone);
    if (ph) byPhone.set(ph, m);
  }

  const rows = report.rows.map((row) => {
    const nameKey = normalizeMemberName(row.rawName);
    const phoneKey = normalizePhone(row.phone);
    const matched = byName.get(nameKey) || byPhone.get(phoneKey) || null;
    const matchMethod = matched
      ? (byName.get(nameKey) ? "name" : "phone")
      : null;
    return {
      ...row,
      safeProfession: safeRosterImportText(row.profession),
      safeCompanyName: safeRosterImportText(row.companyName),
      importWarnings: [
        row.profession && !safeRosterImportText(row.profession)
          ? "profession_decode"
          : "",
        row.companyName && !safeRosterImportText(row.companyName)
          ? "company_decode"
          : "",
      ].filter(Boolean),
      matched: !!matched,
      matchMethod,
      memberId: matched?.id || null,
      memberName: matched?.name || null,
      memberNick: matched?.nickname || null,
      currentPhone: matched?.phone || null,
      currentProfession: matched?.profession || null,
      currentCompanyName: matched?.company_name || null,
    };
  });

  return {
    ok: true,
    runAt: report.runAt,
    chapter: report.chapter,
    memberCountLabel: report.memberCountLabel,
    totalRows: rows.length,
    matched: rows.filter((r) => r.matched).length,
    unmatched: rows.filter((r) => !r.matched).length,
    rows,
  };
}

export async function buildPalmsSummaryPreview(
  db: ReturnType<typeof getServiceClient>,
  report: ParsedPalmsSummaryReport,
) {
  const { data, error } = await db
    .from("members")
    .select("id, name, nickname, phone, is_archived")
    .eq("is_archived", false);
  if (error) throw new Error(error.message);

  const members = (data || []) as Array<Record<string, unknown>>;
  const byName = new Map<string, Record<string, unknown>>();
  for (const m of members) {
    byName.set(normalizeMemberName(m.name), m);
    if (m.nickname) byName.set(normalizeMemberName(m.nickname), m);
  }

  const rows = report.rows.map((row) => {
    const matched = byName.get(normalizeMemberName(row.rawName)) || null;
    return {
      ...row,
      matched: !!matched,
      matchMethod: matched ? "name" : null,
      memberId: matched?.id || null,
      memberName: matched?.name || null,
      memberNick: matched?.nickname || null,
    };
  });

  return {
    ok: true,
    runAt: report.runAt,
    chapter: report.chapter,
    periodFrom: report.periodFrom,
    periodTo: report.periodTo,
    periodDays: palmsPeriodDays(report.periodFrom, report.periodTo),
    historicalOnly: !shouldUpdateCurrentPalms(
      report.periodFrom,
      report.periodTo,
    ),
    totalRows: rows.length,
    matched: rows.filter((r) => r.matched).length,
    unmatched: rows.filter((r) => !r.matched).length,
    avgScore: rows.length
      ? Math.round(
        rows.reduce((s, r) => s + Number(r.calculatedScore || 0), 0) /
          rows.length,
      )
      : 0,
    rows,
  };
}

const BNI_REPORT_PARSER_VERSION = "2026.09.05.2";

function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function rowsToCsv(headers: string[], rows: unknown[][]): string {
  return `\uFEFF${
    [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")
  }`;
}

function rosterPreviewCsv(rows: Array<Record<string, unknown>>): string {
  return rowsToCsv(
    [
      "member_name",
      "matched",
      "member_id",
      "match_method",
      "profession",
      "company_name",
      "phone",
      "referrals_given_90d",
      "referrals_received_90d",
      "visitors_90d",
      "one_to_one_90d",
      "late_90d",
      "absent_90d",
      "warnings",
    ],
    rows.map((
      row,
    ) => [
      row.rawName,
      row.matched,
      row.memberId,
      row.matchMethod,
      row.safeProfession,
      row.safeCompanyName,
      row.phone,
      row.referralsGiven90d,
      row.referralsReceived90d,
      row.visitors90d,
      row.oneToOne90d,
      row.late90d,
      row.absent90d,
      Array.isArray(row.importWarnings) ? row.importWarnings.join("|") : "",
    ]),
  );
}

function palmsPreviewCsv(rows: Array<Record<string, unknown>>): string {
  return rowsToCsv(
    [
      "member_name",
      "matched",
      "member_id",
      "present",
      "absent",
      "late",
      "medical",
      "substitute",
      "rgi",
      "rgo",
      "rri",
      "rro",
      "visitors",
      "one_to_one",
      "revenue_given_thb",
      "ceu",
      "revenue_received_thb",
      "calculated_score",
      "calculated_color",
    ],
    rows.map((
      row,
    ) => [
      row.rawName,
      row.matched,
      row.memberId,
      row.present,
      row.absent,
      row.late,
      row.medical,
      row.substitute,
      row.rgi,
      row.rgo,
      row.rri,
      row.rro,
      row.visitors,
      row.oneToOne,
      row.revenueGivenThb,
      row.ceu,
      row.revenueReceivedThb,
      row.calculatedScore,
      row.calculatedColor,
    ]),
  );
}

const STRUCTURED_REPORT_LABELS: Record<string, string> = {
  membership_dues: "Membership Dues",
  absence: "Absence",
  speaker: "Speaker History",
  training_gap: "Training Gaps",
  chapter_visitor: "Chapter Visitors",
  profession_opportunity: "Professions Not In Chapter",
};

export async function buildStructuredPreview(
  db: ReturnType<typeof getServiceClient>,
  report: StructuredReport,
) {
  const { data, error } = await db.from("members")
    .select("id,name,nickname,email,phone,is_archived").eq(
      "is_archived",
      false,
    );
  if (error) throw new Error(error.message);
  const members = (data || []) as Array<Record<string, unknown>>;
  const byName = new Map<string, Record<string, unknown>>();
  const byEmail = new Map<string, Record<string, unknown>>();
  const byPhone = new Map<string, Record<string, unknown>>();
  for (const member of members) {
    byName.set(normalizeMemberName(member.name), member);
    if (member.nickname) {
      byName.set(normalizeMemberName(member.nickname), member);
    }
    if (member.email) {
      byEmail.set(String(member.email).trim().toLowerCase(), member);
    }
    const phone = normalizePhone(member.phone);
    if (phone) byPhone.set(phone, member);
  }
  const rows = report.rows.map((row) => {
    const rawName = String(row.rawName || "");
    const member = rawName
      ? byName.get(normalizeMemberName(rawName)) ||
        byEmail.get(String(row.email || "").toLowerCase()) ||
        byPhone.get(normalizePhone(row.phone)) || null
      : null;
    const related = report.reportType === "chapter_visitor"
      ? byName.get(normalizeMemberName(row.invitedBy)) || null
      : null;
    const intrinsicallyMatched =
      report.reportType === "profession_opportunity" ||
      (report.reportType === "membership_dues" &&
        String(row.membershipStatus).toLowerCase() !== "active");
    return {
      ...row,
      rawName: rawName || String(row.visitorName || row.profession || ""),
      matched: intrinsicallyMatched ||
        (report.reportType === "chapter_visitor"
          ? Boolean(related)
          : Boolean(member)),
      matchMethod: member
        ? (byName.get(normalizeMemberName(rawName))
          ? "name"
          : byEmail.get(String(row.email || "").toLowerCase())
          ? "email"
          : "phone")
        : related
        ? "invited_by_name"
        : intrinsicallyMatched
        ? "catalog"
        : null,
      memberId: member?.id || null,
      memberName: member?.name || null,
      memberNick: member?.nickname || null,
      relatedMemberId: related?.id || null,
      relatedMemberName: related?.name || null,
    };
  });
  return {
    ok: true,
    runAt: report.runAt,
    periodFrom: report.periodFrom,
    periodTo: report.periodTo,
    historicalOnly: report.reportType !== "membership_dues",
    totalRows: rows.length,
    requiresFullMatch: report.reportType === "membership_dues",
    matched: rows.filter((row) => row.matched).length,
    unmatched: rows.filter((row) => !row.matched).length,
    rows,
  };
}

function structuredPreviewCsv(rows: Array<Record<string, unknown>>): string {
  const keys = [
    ...new Set(
      rows.flatMap((row) => Object.keys(row)).filter((key) =>
        !["memberName", "memberNick", "relatedMemberName"].includes(key)
      ),
    ),
  ];
  return rowsToCsv(
    keys,
    rows.map((row) =>
      keys.map((key) => {
        const value = row[key];
        return value && typeof value === "object"
          ? JSON.stringify(value)
          : value;
      })
    ),
  );
}

export async function syncStructuredReport(
  db: ReturnType<typeof getServiceClient>,
  chapterId: string,
  batchId: string,
  report: StructuredReport,
) {
  const preview = await buildStructuredPreview(db, report) as Record<
    string,
    unknown
  >;
  const rows = (preview.rows || []) as Array<Record<string, unknown>>;
  if (
    report.reportType === "membership_dues" &&
    rows.some((row) =>
      String(row.membershipStatus).toLowerCase() === "active" && !row.memberId
    )
  ) {
    throw new Error(
      "Membership Dues ยังมีสมาชิกที่จับคู่ไม่ได้ กรุณาตรวจ Preview ก่อนอัปเดต Renewal",
    );
  }
  const now = new Date().toISOString();
  const records: Array<Record<string, unknown>> = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const identity = JSON.stringify([
      report.reportType,
      row.memberId,
      row.relatedMemberId,
      row.rawName,
      row.dueDate,
      row.meetingDate,
      row.visitDate,
      row.eventType,
      row.profession,
      index,
    ]);
    records.push({
      chapter_id: chapterId,
      batch_id: batchId,
      report_type: report.reportType,
      record_key: await sha256Hex(identity),
      member_id: row.memberId || null,
      related_member_id: row.relatedMemberId || null,
      occurred_on: row.dueDate || row.meetingDate || row.visitDate ||
        report.periodTo || null,
      payload: Object.fromEntries(
        Object.entries(row).filter(([key]) =>
          ![
            "matched",
            "matchMethod",
            "memberId",
            "memberName",
            "memberNick",
            "relatedMemberId",
            "relatedMemberName",
          ].includes(key)
        ),
      ),
      contains_personal_data: report.reportType === "chapter_visitor" ||
        report.reportType === "training_gap",
      imported_at: now,
    });
  }
  for (let offset = 0; offset < records.length; offset += 400) {
    const { error } = await db.from("bni_structured_report_records").upsert(
      records.slice(offset, offset + 400),
      { onConflict: "chapter_id,batch_id,record_key" },
    );
    if (error) throw new Error(error.message);
  }
  let updatedRenewals = 0;
  if (report.reportType === "membership_dues") {
    for (const row of rows) {
      if (
        !row.memberId || !row.dueDate ||
        String(row.membershipStatus).toLowerCase() !== "active"
      ) continue;
      const { error: renewalError } = await db.from("renewals").upsert({
        member_id: row.memberId,
        expiry_date: row.dueDate,
        source: "bni_connect_membership_dues",
        source_reported_at: report.runAt || now,
        source_metadata: {
          membership_type: String(row.membershipType || "Member"),
          membership_status: String(row.membershipStatus || ""),
          autorenewal_enabled: Boolean(row.autorenewalEnabled),
          import_batch_id: batchId,
        },
        updated_at: now,
      }, { onConflict: "member_id" });
      if (renewalError) {
        throw new Error(`${row.rawName}: ${renewalError.message}`);
      }
      updatedRenewals++;
    }
  }
  return {
    ok: true,
    reportType: report.reportType,
    totalRows: rows.length,
    matched: Number(preview.matched) || 0,
    unmatched: Number(preview.unmatched) || 0,
    insertedSnapshots: records.length,
    updatedRenewals,
    historicalOnly: report.reportType !== "membership_dues",
  };
}

async function activeChapterId(
  db: ReturnType<typeof getServiceClient>,
): Promise<string> {
  const { data, error } = await db.from("chapter_profiles").select("id").eq(
    "is_active",
    true,
  ).order("created_at").limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("ยังไม่ได้ตั้งค่า Active Chapter");
  return String(data.id);
}

async function bniPdfFingerprint(
  pdfBase64: unknown,
): Promise<{ hash: string; size: number }> {
  const bytes = decodeBase64Pdf(pdfBase64);
  const input = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return {
    hash: [...new Uint8Array(digest)].map((n) =>
      n.toString(16).padStart(2, "0")
    ).join(""),
    size: bytes.length,
  };
}

export async function rawPdfCsvPreview(pdfBase64: unknown) {
  const bytes = decodeBase64Pdf(pdfBase64);
  const streams = await extractPdfStreams(bytes);
  const entries = parsePdfTextEntries(streams);
  if (!entries.length) throw new Error("PDF ไม่มี text layer ที่ระบบอ่านได้");
  return {
    rows: entries.slice(0, 100).map((entry) => ({
      rawName: entry.text,
      page: entry.page + 1,
      x: Math.round(entry.x * 10) / 10,
      y: Math.round(entry.y * 10) / 10,
    })),
    totalRows: entries.length,
    matched: 0,
    unmatched: 0,
    csv: rowsToCsv(
      ["page", "x", "y", "text"],
      entries.map((entry) => [entry.page + 1, entry.x, entry.y, entry.text]),
    ),
  };
}

export async function parseStructuredPdf(
  pdfBase64: unknown,
): Promise<StructuredReport | null> {
  const bytes = decodeBase64Pdf(pdfBase64);
  const streams = await extractPdfStreams(bytes);
  if (!streams.length) {
    throw new Error("อ่าน PDF ไม่ได้ หรือไม่พบ compressed stream");
  }
  return parseStructuredReport(parsePdfTextEntries(streams));
}

async function findMemberByLegacyPayload(
  db: ReturnType<typeof getServiceClient>,
  p: Record<string, unknown>,
): Promise<{ member?: MemberRef; error?: string }> {
  const directId = textValue(p.memberId || p.member_id);
  if (directId) {
    const { data, error } = await db
      .from("members")
      .select("id, name, nickname, mentor_team")
      .eq("id", directId)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: `Member not found: ${directId}` };
    return { member: data as MemberRef };
  }

  const name = textValue(p.memberName || p.name);
  const nick = textValue(p.nick || p.nickname);
  const team = normalizeTeam(p.teamName || p.mentor || p.mentorTeam);
  if (!name && !nick) return { error: "memberId or memberName required" };

  let query = db
    .from("members")
    .select("id, name, nickname, mentor_team")
    .eq("is_archived", false);
  if (team && VALID_TEAMS.has(team)) query = query.eq("mentor_team", team);
  if (name) query = query.ilike("name", name);
  else query = query.ilike("nickname", nick);

  const { data, error } = await query.limit(2);
  if (error) return { error: error.message };
  const rows = (data || []) as MemberRef[];
  if (rows.length === 1) return { member: rows[0] };

  if (!rows.length && nick) {
    let nickQuery = db
      .from("members")
      .select("id, name, nickname, mentor_team")
      .eq("is_archived", false)
      .ilike("nickname", nick);
    if (team && VALID_TEAMS.has(team)) {
      nickQuery = nickQuery.eq("mentor_team", team);
    }

    const { data: nickData, error: nickError } = await nickQuery.limit(2);
    if (nickError) return { error: nickError.message };
    const nickRows = (nickData || []) as MemberRef[];
    if (nickRows.length === 1) return { member: nickRows[0] };
    if (nickRows.length > 1) return { error: `พบสมาชิกชื่อเล่นซ้ำ: ${nick}` };
  }

  if (rows.length > 1) return { error: `พบสมาชิกชื่อซ้ำ: ${name || nick}` };
  return { error: `Member not found: ${name || nick}` };
}

export async function handleMembers(
  p: Record<string, unknown>,
): Promise<Response> {
  const db = getServiceClient();
  const action = String(p.action || "");

  switch (action) {
    // ── GET: all members with team info (MC only) ─────────────
    case "getMemberList": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);

      const { data, error } = await db
        .from("v_members_by_team")
        .select("*");
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true, members: data });
    }

    // ── Chapter LT Team & six-month terms (MC only) ───────────
    case "getLtTeam": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);
      const [
        { data: terms, error: termErr },
        { data: assignments, error: assignmentErr },
        { data: members, error: memberErr },
        { data: mentorTeams, error: mentorTeamErr },
      ] = await Promise.all([
        db.from("lt_terms").select("*").order("starts_on", {
          ascending: false,
        }),
        db.from("passport_lt_assignments").select("*").order("lt_role"),
        db.from("members").select("id,name,nickname,email,is_archived").eq(
          "is_archived",
          false,
        ).order("name"),
        db.from("mentor_teams").select(
          "name,leader_name,leader_member_id,display_name,active_term_id,updated_at",
        ).order("id"),
      ]);
      if (termErr || assignmentErr || memberErr || mentorTeamErr) {
        return errResponse(
          termErr?.message || assignmentErr?.message || memberErr?.message ||
            mentorTeamErr?.message || "โหลด LT Team ไม่สำเร็จ",
        );
      }
      const memberIds = ((members || []) as Record<string, unknown>[]).map(
        (m) => String(m.id),
      );
      const { data: links } = memberIds.length
        ? await db.from("line_members").select("member_id,line_user_id").in(
          "member_id",
          memberIds,
        )
        : { data: [] };
      const linked = new Set(
        (links || []).map((row: Record<string, unknown>) =>
          String(row.member_id)
        ),
      );
      const memberRows = ((members || []) as Record<string, unknown>[]).map(
        (m) => ({ ...m, lineLinked: linked.has(String(m.id)) }),
      );
      return jsonResponse({
        ok: true,
        terms: terms || [],
        assignments: assignments || [],
        members: memberRows,
        mentorTeams: mentorTeams || [],
        roles: LT_ROLE_CATALOG,
      });
    }

    // Unified Chapter Admin control plane. This projects existing sources of
    // truth instead of duplicating member, queue, notification or access data.
    case "getChapterOperationsCenter": {
      const auth = await requireAuth(db, p, ["admin"]);
      if (!auth.ok || !auth.isAdmin) {
        return errResponse("เฉพาะ Chapter Admin เท่านั้น", 403);
      }
      const monthStart = new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
      ).toISOString();
      const [
        termResult,
        assignmentsResult,
        membersResult,
        linksResult,
        accessResult,
        signalsResult,
        deliveriesResult,
        budgetsResult,
        profilesResult,
        auditResult,
      ] = await Promise.all([
        db.from("lt_terms").select(
          "id,name,starts_on,ends_on,status,created_by,created_at,updated_at",
        ).order("starts_on", { ascending: false }).limit(12),
        db.from("passport_lt_assignments").select(
          "id,lt_role,assigned_member_id,assigned_name,fallback_member_id,term_id,notification_scopes,is_active,term_start,term_end",
        ).order("lt_role"),
        db.from("members").select(
          "id,name,nickname,email,mentor_team,is_archived",
        ).eq("is_archived", false).order("name"),
        db.from("line_members").select("member_id,line_user_id"),
        db.from("role_assignments").select(
          "email,role,display_name,team_name,member_id,is_mc,is_mentor,is_admin,admin_sections,admin_edit_access,capabilities,access_status,access_starts_at,access_expires_at,read_only_after,term_id,created_at,updated_at",
        ).order("role"),
        db.from("member_signals").select(
          "id,member_id,signal_type,status,priority,assigned_role,assigned_member_id,sla_due_at,target_roles,created_at",
        ).in("status", ["new", "acknowledged", "in_progress"]).order(
          "created_at",
          { ascending: false },
        ).limit(500),
        db.from("line_message_deliveries").select(
          "id,member_id,module,category,priority,status,suppression_reason,attempts,created_at,sent_at,last_error",
        ).gte("created_at", monthStart).order("created_at", {
          ascending: false,
        }).limit(2500),
        db.from("notification_budget_config").select("*").order("module"),
        db.from("member_one_to_one_profiles").select(
          "member_id,business_summary,target_clients,looking_for,referral_trigger,gains_goals,published_at,updated_at",
        ),
        db.from("chapter_audit_events").select(
          "id,event_type,actor_role,actor_ref,subject_type,subject_ref,metadata,created_at",
        ).order("created_at", { ascending: false }).limit(80),
      ]);
      const firstError = [
        termResult,
        assignmentsResult,
        membersResult,
        linksResult,
        accessResult,
        signalsResult,
        deliveriesResult,
        budgetsResult,
        profilesResult,
        auditResult,
      ].find((result) => result.error)?.error;
      if (firstError) return errResponse(firstError.message);
      const terms = (termResult.data || []) as Record<string, unknown>[];
      const activeTerm = terms.find((row) => String(row.status) === "active") ||
        null;
      const targetTerm = terms.find((row) => String(row.status) === "draft") ||
        activeTerm;
      const previousTerm = targetTerm
        ? terms.find((row) =>
          String(row.id) !== String(targetTerm.id) &&
          String(row.ends_on || "") < String(targetTerm.starts_on || "")
        ) || null
        : null;
      const assignments = (assignmentsResult.data || []) as Record<
        string,
        unknown
      >[];
      const members = (membersResult.data || []) as Record<string, unknown>[];
      const links = (linksResult.data || []) as Record<string, unknown>[];
      const access = (accessResult.data || []) as Record<string, unknown>[];
      const signals = (signalsResult.data || []) as Record<string, unknown>[];
      const deliveries = (deliveriesResult.data || []) as Record<
        string,
        unknown
      >[];
      const profiles = (profilesResult.data || []) as Record<string, unknown>[];
      const linkedIds = new Set(
        links.map((row) => String(row.member_id || "")).filter(Boolean),
      );
      const accessByMember = new Map(
        access.filter((row) => row.member_id).map(
          (row) => [String(row.member_id), row],
        ),
      );
      const profileByMember = new Map(
        profiles.map((row) => [String(row.member_id), row]),
      );
      const activeAssignments = assignments.filter((row) =>
        !activeTerm || String(row.term_id || "") === String(activeTerm.id)
      );
      const targetAssignments = assignments.filter((row) =>
        targetTerm && String(row.term_id || "") === String(targetTerm.id)
      );
      const previousAssignments = assignments.filter((row) =>
        previousTerm && String(row.term_id || "") === String(previousTerm.id)
      );
      const mentorRoles = new Set([
        "Mentor Co.",
        "Mentor Team · TOOMTAM",
        "Mentor Team · Aof",
        "Mentor Team · Draft",
        "Mentor Team · PHAI",
        "Mentor Team · AMP",
        "Mentor Support 1",
        "Mentor Support 2",
      ]);
      const assignedIds = activeAssignments.map((row) =>
        String(row.assigned_member_id || "")
      ).filter(Boolean);
      const mentorAssignedIds = activeAssignments.filter((row) =>
        mentorRoles.has(String(row.lt_role))
      ).map((row) => String(row.assigned_member_id || "")).filter(Boolean);
      const now = Date.now();
      const overdueSignals = signals.filter((row) =>
        row.sla_due_at && new Date(String(row.sla_due_at)).getTime() < now
      );
      const failedDeliveries = deliveries.filter((row) =>
        String(row.status) === "failed"
      );
      const suppressedDeliveries = deliveries.filter((row) =>
        Boolean(row.suppression_reason)
      );
      const profileRows = members.map((member) => {
        const id = String(member.id), profile = profileByMember.get(id) || {};
        const essentials = [
          "business_summary",
          "target_clients",
          "looking_for",
          "referral_trigger",
          "gains_goals",
        ];
        const complete = essentials.filter((key) =>
          String(profile[key] || "").trim()
        ).length;
        return {
          memberId: id,
          name: member.nickname || member.name,
          mentorTeam: member.mentor_team || null,
          completion: Math.round(complete / essentials.length * 100),
          lineLinked: linkedIds.has(id),
          hasEmail: Boolean(member.email),
        };
      });
      const checklistDefaults = [
        ["positions", "people", "กำหนดผู้รับตำแหน่งครบทุกตำแหน่ง"],
        ["line_ready", "accounts", "ผู้รับตำแหน่งเชื่อม LINE พร้อมรับงาน"],
        ["mobile_access", "accounts", "ทีม Mentor ผูก Gmail และ Mentor Mobile"],
        ["open_work", "work", "ทบทวนและส่งมอบงานสมาชิกที่ยังไม่จบ"],
        ["member_data", "data", "ตรวจความครบถ้วนของข้อมูลสมาชิก"],
        ["notification_health", "system", "ตรวจโควตาและข้อความ LINE ที่ส่งไม่สำเร็จ"],
        ["permission_review", "security", "ตรวจสิทธิ์และวันสิ้นสุดของทีมชุดเดิม"],
        ["handover_meeting", "people", "ประชุมส่งมอบระหว่างทีมเดิมและทีมใหม่"],
      ];
      let handover: Record<string, unknown>[] = [];
      if (activeTerm?.id) {
        if (!auth.isViewer) {
          await db.from("lt_term_handover_items").upsert(
            checklistDefaults.map((item) => ({
              term_id: activeTerm.id,
              item_key: item[0],
              category: item[1],
              label: item[2],
            })),
            { onConflict: "term_id,item_key", ignoreDuplicates: true },
          );
        }
        const { data } = await db.from("lt_term_handover_items").select("*").eq(
          "term_id",
          String(activeTerm.id),
        ).order("category").order("item_key");
        handover = (data || []) as Record<string, unknown>[];
      }
      let roleHandover: Record<string, unknown>[] = [];
      let snapshots: Record<string, unknown>[] = [];
      if (targetTerm?.id) {
        const roleDefaults = [
          ["open_work", "work", "ส่งมอบงานค้างและสมาชิกที่ต้องติดตาม"],
          ["documents", "knowledge", "ส่งมอบเอกสาร ลิงก์ และวิธีทำงานสำคัญ"],
          ["access", "access", "ตรวจ LINE, Mobile และสิทธิ์ที่จำเป็น"],
        ];
        const targetByRole = new Map(
          targetAssignments.map((row) => [String(row.lt_role || ""), row]),
        );
        const previousByRole = new Map(
          previousAssignments.map((row) => [String(row.lt_role || ""), row]),
        );
        const seeded = LT_ROLE_CATALOG.flatMap((role) =>
          roleDefaults.map((item) => ({
            from_term_id: previousTerm?.id || null,
            to_term_id: targetTerm.id,
            lt_role: role.role,
            item_key: item[0],
            category: item[1],
            label: item[2],
            outgoing_member_id:
              previousByRole.get(role.role)?.assigned_member_id || null,
            incoming_member_id:
              targetByRole.get(role.role)?.assigned_member_id || null,
            due_at: `${String(targetTerm.starts_on)}T09:00:00+07:00`,
          }))
        );
        if (!auth.isViewer) {
          await db.from("lt_role_handover_items").upsert(seeded, {
            onConflict: "to_term_id,lt_role,item_key",
            ignoreDuplicates: true,
          });
          for (const role of LT_ROLE_CATALOG) {
            await db.from("lt_role_handover_items").update({
              outgoing_member_id:
                previousByRole.get(role.role)?.assigned_member_id || null,
              incoming_member_id:
                targetByRole.get(role.role)?.assigned_member_id || null,
              updated_at: new Date().toISOString(),
            }).eq("to_term_id", String(targetTerm.id)).eq("lt_role", role.role);
          }
        }
        const [{ data: roleRows }, { data: snapshotRows }] = await Promise.all([
          db.from("lt_role_handover_items").select("*").eq(
            "to_term_id",
            String(targetTerm.id),
          ).order("lt_role").order("item_key"),
          db.from("lt_term_snapshots").select(
            "id,term_id,snapshot_type,created_by,created_at",
          ).eq("term_id", String(targetTerm.id)).order("created_at", {
            ascending: false,
          }),
        ]);
        const names = new Map(
          members.map(
            (row) => [
              String(row.id),
              String(row.nickname || row.name || "สมาชิก"),
            ],
          ),
        );
        roleHandover = ((roleRows || []) as Record<string, unknown>[]).map(
          (row) => ({
            ...row,
            outgoing_name: row.outgoing_member_id
              ? names.get(String(row.outgoing_member_id)) || "ไม่พบชื่อ"
              : null,
            incoming_name: row.incoming_member_id
              ? names.get(String(row.incoming_member_id)) || "ไม่พบชื่อ"
              : null,
          }),
        );
        snapshots = (snapshotRows || []) as Record<string, unknown>[];
      }
      const readinessFacts = {
        positionsReady:
          activeAssignments.filter((row) => row.assigned_member_id).length,
        positionsTotal: LT_ROLE_CATALOG.length,
        assignedLineReady: assignedIds.filter((id) => linkedIds.has(id)).length,
        assignedTotal: assignedIds.length,
        mentorMobileReady:
          mentorAssignedIds.filter((id) =>
            accessByMember.has(id) &&
            String(accessByMember.get(id)?.access_status || "active") ===
              "active"
          ).length,
        mentorTotal: mentorAssignedIds.length,
      };
      const moduleSummary: Record<
        string,
        { sent: number; failed: number; suppressed: number }
      > = {};
      deliveries.forEach((row) => {
        const key = String(row.module || "operational");
        if (!moduleSummary[key]) {
          moduleSummary[key] = { sent: 0, failed: 0, suppressed: 0 };
        }
        if (String(row.status) === "sent") moduleSummary[key].sent++;
        if (String(row.status) === "failed") moduleSummary[key].failed++;
        if (row.suppression_reason) moduleSummary[key].suppressed++;
      });
      const healthIssues = [
        ...(readinessFacts.positionsReady < readinessFacts.positionsTotal
          ? [{
            level: "warning",
            area: "LT Team",
            message: `ยังไม่กำหนด ${
              readinessFacts.positionsTotal - readinessFacts.positionsReady
            } ตำแหน่ง`,
          }]
          : []),
        ...(readinessFacts.assignedLineReady < readinessFacts.assignedTotal
          ? [{
            level: "warning",
            area: "LINE",
            message: `ผู้รับตำแหน่ง ${
              readinessFacts.assignedTotal - readinessFacts.assignedLineReady
            } คนยังไม่เชื่อม LINE`,
          }]
          : []),
        ...(readinessFacts.mentorMobileReady < readinessFacts.mentorTotal
          ? [{
            level: "warning",
            area: "Mentor Mobile",
            message: `ทีม Mentor ${
              readinessFacts.mentorTotal - readinessFacts.mentorMobileReady
            } คนยังไม่พร้อม`,
          }]
          : []),
        ...(overdueSignals.length
          ? [{
            level: "critical",
            area: "Work Queue",
            message: `มีงานเกิน SLA ${overdueSignals.length} รายการ`,
          }]
          : []),
        ...(failedDeliveries.length
          ? [{
            level: "critical",
            area: "LINE Delivery",
            message: `ข้อความล้มเหลวเดือนนี้ ${failedDeliveries.length} รายการ`,
          }]
          : []),
        ...(profileRows.filter((row) => row.completion < 60).length
          ? [{
            level: "info",
            area: "Member Data",
            message: `สมาชิก ${
              profileRows.filter((row) => row.completion < 60).length
            } คนมี Business Profile ต่ำกว่า 60%`,
          }]
          : []),
      ];
      return jsonResponse({
        ok: true,
        generatedAt: new Date().toISOString(),
        activeTerm,
        targetTerm,
        previousTerm,
        terms,
        readinessFacts,
        handover,
        roleHandover,
        snapshots,
        permissions: access,
        workspace: {
          open: signals.length,
          overdue: overdueSignals.length,
          signals,
        },
        memberCoverage: {
          total: members.length,
          lineLinked: profileRows.filter((row) => row.lineLinked).length,
          emailReady: profileRows.filter((row) => row.hasEmail).length,
          profilePublished: profiles.filter((row) => row.published_at).length,
          profiles: profileRows,
        },
        notifications: {
          monthStart,
          total: deliveries.length,
          failed: failedDeliveries.length,
          suppressed: suppressedDeliveries.length,
          moduleSummary,
          budgets: budgetsResult.data || [],
          recentFailures: failedDeliveries.slice(0, 20),
        },
        health: {
          status: healthIssues.some((item) => item.level === "critical")
            ? "attention"
            : healthIssues.length
            ? "watch"
            : "healthy",
          issues: healthIssues,
        },
        audit: auditResult.data || [],
      });
    }

    case "updateChapterHandoverItem": {
      const auth = await requireAuth(db, p, ["admin"]);
      if (!auth.ok || !auth.isAdmin) {
        return errResponse("เฉพาะ Chapter Admin เท่านั้น", 403);
      }
      const id = textValue(p.id),
        status = textValue(p.status),
        note = textValue(p.note).slice(0, 1000);
      if (!id || !["pending", "ready", "not_applicable"].includes(status)) {
        return errResponse("สถานะรายการส่งมอบไม่ถูกต้อง");
      }
      const now = new Date().toISOString(),
        actor = String(auth.displayName || auth.role || "Chapter Admin");
      const { data, error } = await db.from("lt_term_handover_items").update({
        status,
        note: note || null,
        completed_by: status === "ready" ? actor : null,
        completed_at: status === "ready" ? now : null,
        updated_at: now,
      }).eq("id", id).select("*").maybeSingle();
      if (error || !data) {
        return errResponse(error?.message || "ไม่พบรายการส่งมอบ");
      }
      await db.from("chapter_audit_events").insert({
        event_type: "handover_item_updated",
        actor_role: auth.role,
        actor_ref: actor,
        subject_type: "lt_handover",
        subject_ref: id,
        metadata: { status, note: note || null },
      });
      return jsonResponse({ ok: true, item: data });
    }

    case "updateLtRoleHandoverItem": {
      const auth = await requireAuth(db, p, ["admin"]);
      if (!auth.ok || !auth.isAdmin) {
        return errResponse("เฉพาะ Chapter Admin เท่านั้น", 403);
      }
      const id = textValue(p.id),
        status = textValue(p.status),
        side = textValue(p.side);
      const note = textValue(p.note).replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim().slice(0, 1200);
      if (
        !id ||
        !["pending", "in_progress", "ready", "blocked", "not_applicable"]
          .includes(status)
      ) return errResponse("สถานะการส่งมอบไม่ถูกต้อง");
      if (side && !["outgoing", "incoming"].includes(side)) {
        return errResponse("ผู้ยืนยันไม่ถูกต้อง");
      }
      const now = new Date().toISOString();
      const { data: current } = await db.from("lt_role_handover_items").select(
        "*",
      ).eq("id", id).maybeSingle();
      if (!current) return errResponse("ไม่พบรายการส่งมอบ", 404);
      const changes: Record<string, unknown> = {
        status,
        note: note || null,
        reviewed_by: String(auth.displayName || auth.role || "Chapter Admin"),
        updated_at: now,
      };
      if (side === "outgoing") changes.outgoing_accepted_at = now;
      if (side === "incoming") changes.incoming_accepted_at = now;
      const outgoingAccepted =
        Boolean((current as Record<string, unknown>).outgoing_accepted_at) ||
        side === "outgoing" ||
        !(current as Record<string, unknown>).outgoing_member_id;
      const incomingAccepted =
        Boolean((current as Record<string, unknown>).incoming_accepted_at) ||
        side === "incoming" ||
        !(current as Record<string, unknown>).incoming_member_id;
      if (
        (status === "ready" || status === "not_applicable") &&
        outgoingAccepted && incomingAccepted
      ) changes.completed_at = now;
      else changes.completed_at = null;
      const { data, error } = await db.from("lt_role_handover_items").update(
        changes,
      ).eq("id", id).select("*").single();
      if (error) return errResponse(error.message);
      await db.from("chapter_audit_events").insert({
        event_type: "role_handover_updated",
        actor_role: auth.role,
        actor_ref: String(auth.displayName || "Chapter Admin"),
        subject_type: "lt_role_handover",
        subject_ref: id,
        metadata: { status, side: side || null },
      });
      return jsonResponse({ ok: true, item: data });
    }

    case "createLtTermSnapshot": {
      const auth = await requireAuth(db, p, ["admin"]);
      if (!auth.ok || !auth.isAdmin) {
        return errResponse("เฉพาะ Chapter Admin เท่านั้น", 403);
      }
      const termId = textValue(p.termId),
        snapshotType = textValue(p.snapshotType || "handover");
      if (
        !termId || !["baseline", "handover", "closing"].includes(snapshotType)
      ) return errResponse("ข้อมูล Snapshot ไม่ถูกต้อง");
      const [
        { data: term },
        { data: assignments },
        { data: handover },
        { data: openSignals },
        { data: members },
      ] = await Promise.all([
        db.from("lt_terms").select("*").eq("id", termId).maybeSingle(),
        db.from("passport_lt_assignments").select(
          "lt_role,assigned_member_id,assigned_name,fallback_member_id,notification_scopes",
        ).eq("term_id", termId),
        db.from("lt_role_handover_items").select(
          "lt_role,item_key,status,note,outgoing_member_id,incoming_member_id,outgoing_accepted_at,incoming_accepted_at,completed_at",
        ).eq("to_term_id", termId),
        db.from("member_signals").select(
          "id,member_id,signal_type,status,priority,assigned_role,assigned_member_id,sla_due_at,created_at",
        ).in("status", ["new", "acknowledged", "in_progress"]),
        db.from("members").select("id,name,nickname,mentor_team,is_archived"),
      ]);
      if (!term) return errResponse("ไม่พบวาระ", 404);
      const snapshot = {
        schemaVersion: 1,
        capturedAt: new Date().toISOString(),
        term,
        assignments: assignments || [],
        handover: handover || [],
        openWork: openSignals || [],
        members: members || [],
      };
      const { data, error } = await db.from("lt_term_snapshots").insert({
        term_id: termId,
        snapshot_type: snapshotType,
        snapshot,
        created_by: String(auth.displayName || auth.role || "Chapter Admin"),
      }).select("id,term_id,snapshot_type,created_by,created_at").single();
      if (error) {
        return errResponse(
          error.code === "23505"
            ? "Snapshot ประเภทนี้ถูกบันทึกแล้วและไม่สามารถเขียนทับได้"
            : error.message,
        );
      }
      await db.from("chapter_audit_events").insert({
        event_type: "term_snapshot_created",
        actor_role: auth.role,
        actor_ref: String(auth.displayName || "Chapter Admin"),
        subject_type: "lt_term",
        subject_ref: termId,
        metadata: { snapshot_type: snapshotType },
      });
      return jsonResponse({ ok: true, snapshot: data });
    }

    case "applyLtAccessLifecycle": {
      const auth = await requireAuth(db, p, ["admin"]);
      if (!auth.ok || !auth.isAdmin) {
        return errResponse("เฉพาะ Chapter Admin เท่านั้น", 403);
      }
      const { data, error } = await db.rpc("fn_apply_lt_access_lifecycle");
      if (error) return errResponse(error.message);
      await db.from("chapter_audit_events").insert({
        event_type: "access_lifecycle_applied",
        actor_role: auth.role,
        actor_ref: String(auth.displayName || "Chapter Admin"),
        subject_type: "lt_term",
        metadata: { result: data || [] },
      });
      return jsonResponse({ ok: true, result: data || [] });
    }

    case "previewLtHandoverLine": {
      const auth = await requireAuth(db, p, ["admin"]);
      if (!auth.ok || !auth.isAdmin) {
        return errResponse("เฉพาะ Chapter Admin เท่านั้น", 403);
      }
      const termId = textValue(p.termId);
      if (!termId) return errResponse("กรุณาเลือกวาระ");
      const preview = await buildLtHandoverLinePreview(db, termId);
      if ("error" in preview) {
        return errResponse(String(preview.error || "สร้าง Preview ไม่สำเร็จ"));
      }
      return jsonResponse({
        ok: true,
        dryRun: true,
        ...preview,
        summary: {
          total: preview.recipients.length,
          ready: preview.recipients.filter((row) => row.lineUserId).length,
          missingLine: preview.recipients.filter((row) =>
            !row.lineUserId
          ).length,
        },
      });
    }

    case "sendLtHandoverLine": {
      const auth = await requireAuth(db, p, ["admin"]);
      if (!auth.ok || !auth.isAdmin) {
        return errResponse("เฉพาะ Chapter Admin เท่านั้น", 403);
      }
      if (p.confirmed !== true) {
        return errResponse("ต้อง Preview และยืนยันก่อนส่ง LINE");
      }
      const termId = textValue(p.termId),
        suppliedToken = textValue(p.previewToken);
      const preview = await buildLtHandoverLinePreview(db, termId);
      if ("error" in preview) {
        return errResponse(String(preview.error || "สร้าง Preview ไม่สำเร็จ"));
      }
      if (!suppliedToken || suppliedToken !== preview.previewToken) {
        return errResponse("ข้อมูลเปลี่ยนหลัง Preview กรุณาตรวจ Preview ใหม่");
      }
      const batchId = crypto.randomUUID(),
        results: Record<string, unknown>[] = [];
      for (const row of preview.recipients) {
        if (!row.lineUserId) {
          results.push({
            memberId: row.memberId,
            name: row.name,
            status: "missing_line",
          });
          continue;
        }
        const input = {
          memberId: row.memberId,
          module: "chapter_handover",
          category: "lt_handover_summary",
          priority: "action_required" as const,
        };
        const guard = await evaluateNotificationGuard(db, input);
        const key = `lt-handover:${termId}:${row.memberId}:${batchId}`;
        if (!guard.allowed) {
          await logSuppressedNotification(
            db,
            input,
            guard,
            key,
            row.lineUserId,
          );
          results.push({
            memberId: row.memberId,
            name: row.name,
            status: "suppressed",
            reason: guard.reason,
          });
          continue;
        }
        try {
          const sent = await linePush(row.lineUserId, row.message, {
            db,
            memberId: row.memberId,
            idempotencyKey: key,
            notificationType: "lt_handover_summary",
            source: "api/lt-handover",
          });
          results.push({
            memberId: row.memberId,
            name: row.name,
            status: sent.skipped ? "skipped" : "sent",
            deliveryId: sent.deliveryId || null,
          });
        } catch (error) {
          results.push({
            memberId: row.memberId,
            name: row.name,
            status: "failed",
            error: error instanceof Error ? error.message : "LINE send failed",
          });
        }
      }
      const sentCount = results.filter((row) => row.status === "sent").length;
      await db.from("chapter_audit_events").insert({
        event_type: "lt_handover_line_batch",
        actor_role: auth.role,
        actor_ref: String(auth.displayName || "Chapter Admin"),
        subject_type: "lt_term",
        subject_ref: termId,
        metadata: {
          batch_id: batchId,
          total: results.length,
          sent: sentCount,
          failed: results.length - sentCount,
        },
      });
      return jsonResponse({
        ok: true,
        batchId,
        total: results.length,
        sent: sentCount,
        results,
      });
    }

    case "getLtTermComparison": {
      const auth = await requireAuth(db, p, ["admin"]);
      if (!auth.ok || !auth.isAdmin) {
        return errResponse("เฉพาะ Chapter Admin เท่านั้น", 403);
      }
      const termId = textValue(p.termId);
      const { data, error } = await db.from("lt_term_snapshots").select(
        "snapshot_type,snapshot,created_at",
      ).eq("term_id", termId).in("snapshot_type", ["baseline", "closing"]);
      if (error) return errResponse(error.message);
      const rows = (data || []) as Record<string, unknown>[],
        baseline = rows.find((row) => row.snapshot_type === "baseline"),
        closing = rows.find((row) => row.snapshot_type === "closing");
      if (!baseline || !closing) {
        return jsonResponse({
          ok: true,
          ready: false,
          missing: [!baseline ? "baseline" : "", !closing ? "closing" : ""]
            .filter(Boolean),
        });
      }
      const summarize = (source: Record<string, unknown>) => {
        const snap = source.snapshot as Record<string, unknown> || {},
          work = (snap.openWork || []) as Record<string, unknown>[],
          people = (snap.members || []) as Record<string, unknown>[],
          handover = (snap.handover || []) as Record<string, unknown>[];
        return {
          members: people.filter((row) => !row.is_archived).length,
          openWork: work.length,
          overdue: work.filter((row) =>
            row.sla_due_at &&
            new Date(String(row.sla_due_at)).getTime() <
              new Date(String(snap.capturedAt || source.created_at)).getTime()
          ).length,
          handoverComplete: handover.filter((row) => row.completed_at).length,
          handoverTotal: handover.length,
        };
      };
      const before = summarize(baseline), after = summarize(closing);
      return jsonResponse({
        ok: true,
        ready: true,
        before,
        after,
        delta: {
          members: after.members - before.members,
          openWork: after.openWork - before.openWork,
          overdue: after.overdue - before.overdue,
          handoverComplete: after.handoverComplete - before.handoverComplete,
        },
      });
    }

    case "setChapterAccessStatus": {
      const auth = await requireAuth(db, p, ["admin"]);
      if (!auth.ok || !auth.isAdmin) {
        return errResponse("เฉพาะ Chapter Admin เท่านั้น", 403);
      }
      const email = textValue(p.email).trim().toLowerCase(),
        status = textValue(p.status),
        expiresAt = textValue(p.expiresAt) || null;
      if (!email || !["active", "suspended", "revoked"].includes(status)) {
        return errResponse("ข้อมูลสิทธิ์ไม่ถูกต้อง");
      }
      const { data: current } = await db.from("role_assignments").select(
        "email,role,is_admin,access_status,access_expires_at",
      ).eq("email", email).maybeSingle();
      if (!current) return errResponse("ไม่พบบัญชี");
      if (Boolean(current.is_admin) || String(current.role) === "admin") {
        return errResponse("ไม่สามารถระงับ Chapter Admin จากหน้านี้ได้");
      }
      const { data, error } = await db.from("role_assignments").update({
        access_status: status,
        access_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }).eq("email", email).select(
        "email,role,display_name,access_status,access_expires_at",
      ).single();
      if (error) return errResponse(error.message);
      await db.from("chapter_audit_events").insert({
        event_type: "access_status_changed",
        actor_role: auth.role,
        actor_ref: String(auth.displayName || "Chapter Admin"),
        subject_type: "role_assignment",
        subject_ref: email,
        metadata: {
          from: current.access_status || "active",
          to: status,
          expires_at: expiresAt,
        },
      });
      return jsonResponse({ ok: true, assignment: data });
    }

    // Stable codes + term-aware labels shared by Desktop, Mentor Mobile and LIFF.
    case "getTeamCatalog": {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);
      const { data, error } = await db.from("mentor_teams")
        .select(
          "name,leader_name,leader_member_id,display_name,active_term_id,updated_at",
        )
        .order("id");
      if (error) return errResponse(error.message);
      const teams = ((data || []) as Record<string, unknown>[]).map((team) => ({
        code: String(team.name || ""),
        displayName: String(
          team.display_name ||
            `ทีม ${String(team.leader_name || team.name || "")}`,
        ),
        leaderName: String(team.leader_name || ""),
        leaderMemberId: team.leader_member_id
          ? String(team.leader_member_id)
          : null,
        activeTermId: team.active_term_id ? String(team.active_term_id) : null,
        updatedAt: team.updated_at ? String(team.updated_at) : null,
      }));
      return jsonResponse({ ok: true, teams });
    }

    case "getMemberSignals": {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);
      const status = textValue(p.status), signalType = textValue(p.signalType);
      let query = db.from("member_signals")
        .select(
          "*,members!member_signals_member_id_fkey(name,nickname,mentor_team)",
        )
        .order("created_at", { ascending: false }).limit(200);
      if (status) query = query.eq("status", status);
      else query = query.in("status", ["new", "acknowledged", "in_progress"]);
      if (signalType) query = query.eq("signal_type", signalType);
      const { data, error } = await query;
      if (error) return errResponse(error.message);
      let activeLtRoles: string[] = [];
      if (auth.memberId && !auth.isAdmin) {
        const { data: ltRows } = await db.from("passport_lt_assignments")
          .select("lt_role")
          .eq("is_active", true).or(
            `assigned_member_id.eq.${auth.memberId},fallback_member_id.eq.${auth.memberId}`,
          );
        activeLtRoles = ((ltRows || []) as Record<string, unknown>[]).map(
          (row) => String(row.lt_role || ""),
        ).filter(Boolean);
      }
      const rows = ((data || []) as Record<string, unknown>[])
        .filter((row) => canViewMemberSignal(auth, row, activeLtRoles));
      const counts = rows.reduce((acc: Record<string, number>, row) => {
        const key = String(row.signal_type || "other");
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      let assignees: Record<string, unknown>[] = [];
      if (auth.isAdmin) {
        const { data: people } = await db.from("role_assignments")
          .select("member_id,display_name,role,team_name").not(
            "member_id",
            "is",
            null,
          ).order("display_name");
        assignees = (people || []) as Record<string, unknown>[];
      }
      return jsonResponse({
        ok: true,
        signals: rows,
        counts,
        activeLtRoles,
        assignees,
      });
    }

    case "getMemberSignalHistory": {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);
      const id = textValue(p.id);
      if (!id) return errResponse("ไม่พบงานที่ต้องการดู");
      const { data: signal, error: signalError } = await db.from(
        "member_signals",
      )
        .select(
          "*,members!member_signals_member_id_fkey(name,nickname,mentor_team)",
        ).eq("id", id).maybeSingle();
      if (signalError || !signal) return errResponse("ไม่พบงานที่ต้องการดู", 404);
      let activeLtRoles: string[] = [];
      if (auth.memberId && !auth.isAdmin) {
        const { data: ltRows } = await db.from("passport_lt_assignments")
          .select("lt_role")
          .eq("is_active", true).or(
            `assigned_member_id.eq.${auth.memberId},fallback_member_id.eq.${auth.memberId}`,
          );
        activeLtRoles = ((ltRows || []) as Record<string, unknown>[]).map(
          (row) => String(row.lt_role || ""),
        ).filter(Boolean);
      }
      if (
        !canViewMemberSignal(
          auth,
          signal as Record<string, unknown>,
          activeLtRoles,
        )
      ) return errResponse("ไม่มีสิทธิ์ดูประวัติงานนี้", 403);
      const { data: events, error } = await db.from("member_signal_events")
        .select("*")
        .eq("signal_id", id).order("created_at", { ascending: false }).limit(
          100,
        );
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true, signal, events: events || [] });
    }

    case "updateMemberSignal": {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);
      const id = textValue(p.id), status = textValue(p.status);
      if (
        !id ||
        !["acknowledged", "in_progress", "resolved", "cancelled"].includes(
          status,
        )
      ) return errResponse("สถานะงานไม่ถูกต้อง");
      const { data: current, error: currentError } = await db.from(
        "member_signals",
      )
        .select("*,members!member_signals_member_id_fkey(mentor_team)").eq(
          "id",
          id,
        ).maybeSingle();
      if (currentError || !current) {
        return errResponse("ไม่พบงานที่ต้องการอัปเดต", 404);
      }
      if (
        !canTransitionMemberSignal(
          String((current as Record<string, unknown>).status || ""),
          status,
        )
      ) {
        return errResponse(
          "งานนี้ปิดแล้ว หากต้องเปิดใหม่ให้สร้างคำขอใหม่เพื่อรักษาประวัติเดิม",
          409,
        );
      }
      let activeLtRoles: string[] = [];
      if (auth.memberId && !auth.isAdmin) {
        const { data: ltRows } = await db.from("passport_lt_assignments")
          .select("lt_role")
          .eq("is_active", true).or(
            `assigned_member_id.eq.${auth.memberId},fallback_member_id.eq.${auth.memberId}`,
          );
        activeLtRoles = ((ltRows || []) as Record<string, unknown>[]).map(
          (row) => String(row.lt_role || ""),
        ).filter(Boolean);
      }
      if (
        !canManageMemberSignal(
          auth,
          current as Record<string, unknown>,
          activeLtRoles,
        )
      ) return errResponse("ไม่มีสิทธิ์จัดการงานนี้", 403);
      const now = new Date().toISOString(),
        actor = String(auth.displayName || auth.role || "Chapter Admin");
      const changes: Record<string, unknown> = { status, updated_at: now };
      const assignedRole = textValue(p.assignedRole).slice(0, 120);
      const assignedMemberId = textValue(p.assignedMemberId);
      if (assignedRole) changes.assigned_role = assignedRole;
      if (
        assignedMemberId && (auth.isAdmin || assignedMemberId === auth.memberId)
      ) changes.assigned_member_id = assignedMemberId;
      if (
        status === "in_progress" && auth.memberId &&
        !(current as Record<string, unknown>).assigned_member_id
      ) changes.assigned_member_id = auth.memberId;
      if (status === "acknowledged" || status === "in_progress") {
        Object.assign(changes, {
          acknowledged_by: actor,
          acknowledged_at: now,
        });
      }
      if (status === "resolved" || status === "cancelled") {
        Object.assign(changes, {
          resolved_by: actor,
          resolved_at: now,
          resolution_code: textValue(p.resolutionCode).slice(0, 80) || status,
          resolution_note: textValue(p.resolutionNote).slice(0, 1000) || null,
        });
      }
      let update = db.from("member_signals").update(changes).eq("id", id);
      const expectedVersion = Number(p.expectedVersion || 0);
      if (expectedVersion > 0) update = update.eq("version", expectedVersion);
      const { data, error } = await update.select("*").maybeSingle();
      if (error) return errResponse(error.message);
      if (!data) {
        return errResponse("ข้อมูลถูกแก้ไขจากอีกอุปกรณ์ กรุณารีเฟรชแล้วลองใหม่", 409);
      }
      return jsonResponse({ ok: true, signal: data });
    }

    case "addMemberSignalNote": {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);
      const id = textValue(p.id),
        note = textValue(p.note).replace(/[\u0000-\u001f\u007f]/g, " ").trim()
          .slice(0, 1000);
      if (!id || !note) return errResponse("กรุณาใส่บันทึกภายใน");
      const { data: signal } = await db.from("member_signals")
        .select("*,members!member_signals_member_id_fkey(mentor_team)").eq(
          "id",
          id,
        ).maybeSingle();
      if (!signal) return errResponse("ไม่พบงานที่ต้องการบันทึก", 404);
      let activeLtRoles: string[] = [];
      if (auth.memberId && !auth.isAdmin) {
        const { data: ltRows } = await db.from("passport_lt_assignments")
          .select("lt_role")
          .eq("is_active", true).or(
            `assigned_member_id.eq.${auth.memberId},fallback_member_id.eq.${auth.memberId}`,
          );
        activeLtRoles = ((ltRows || []) as Record<string, unknown>[]).map(
          (row) => String(row.lt_role || ""),
        ).filter(Boolean);
      }
      if (
        !canViewMemberSignal(
          auth,
          signal as Record<string, unknown>,
          activeLtRoles,
        )
      ) return errResponse("ไม่มีสิทธิ์บันทึกในงานนี้", 403);
      const { data, error } = await db.from("member_signal_events").insert({
        signal_id: id,
        event_type: "internal_note",
        actor_ref: String(auth.displayName || auth.role || "ทีมงาน"),
        metadata: { note },
      }).select("*").single();
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true, event: data });
    }

    case "reopenMemberSignal": {
      const auth = await requireAuth(db, p, ["admin"]);
      if (!auth.ok || !auth.isAdmin) {
        return errResponse(
          "เฉพาะ Chapter Admin เท่านั้นที่เปิดงานใหม่จากงานเดิมได้",
          403,
        );
      }
      const id = textValue(p.id);
      const { data: oldSignal } = await db.from("member_signals").select("*")
        .eq("id", id).maybeSingle();
      if (!oldSignal) return errResponse("ไม่พบงานเดิม", 404);
      const old = oldSignal as Record<string, unknown>;
      if (!["resolved", "cancelled"].includes(String(old.status || ""))) {
        return errResponse("งานนี้ยังไม่ปิด ไม่จำเป็นต้องเปิดใหม่");
      }
      const reason = textValue(p.reason).replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim().slice(0, 500);
      if (!reason) return errResponse("กรุณาระบุเหตุผลที่เปิดงานใหม่");
      const { data: created, error } = await db.from("member_signals").insert({
        member_id: old.member_id,
        signal_type: old.signal_type,
        subject_type: "member_signal",
        subject_id: id,
        title: String(old.title || "ติดตามงานต่อ"),
        detail: reason,
        payload: { reopened_from: id },
        target_roles: old.target_roles || [],
        status: "new",
        priority: old.priority || "normal",
        assigned_role: old.assigned_role || null,
        assigned_member_id: old.assigned_member_id || null,
        source_surface: "chapter_admin",
        consent_at: old.consent_at || null,
        idempotency_key: `reopen:${id}:${crypto.randomUUID()}`,
      }).select("*").single();
      if (error || !created) {
        return errResponse(error?.message || "เปิดงานใหม่ไม่สำเร็จ");
      }
      await db.from("member_signal_events").insert([
        {
          signal_id: id,
          event_type: "reopened_as",
          actor_ref: String(auth.displayName || "Chapter Admin"),
          metadata: { new_signal_id: created.id, reason },
        },
        {
          signal_id: created.id,
          event_type: "reopened_from",
          actor_ref: String(auth.displayName || "Chapter Admin"),
          metadata: { previous_signal_id: id, reason },
        },
      ]);
      return jsonResponse({ ok: true, signal: created });
    }

    case "saveLtTeamAssignment": {
      const auth = await requireAuth(db, p, ["admin"]);
      if (!auth.ok) return errResponse(auth.error!);
      const ltRole = textValue(p.ltRole);
      if (!LT_ROLE_CATALOG.some((item) => item.role === ltRole)) {
        return errResponse("ตำแหน่ง LT ไม่ถูกต้อง");
      }
      const assignedMemberId = textValue(p.assignedMemberId);
      const fallbackMemberId = textValue(p.fallbackMemberId);
      if (assignedMemberId && assignedMemberId === fallbackMemberId) {
        return errResponse("ผู้รับผิดชอบหลักและผู้สำรองต้องเป็นคนละคน");
      }
      const { data: term } = await db.from("lt_terms").select("*").eq(
        "status",
        "active",
      ).maybeSingle();
      if (!term) return errResponse("ยังไม่มีวาระ LT ที่กำลังใช้งาน");
      const { data: currentAssignment } = await db.from(
        "passport_lt_assignments",
      )
        .select("id,assigned_member_id,assigned_name,fallback_member_id")
        .eq("lt_role", ltRole).eq(
          "term_id",
          (term as Record<string, unknown>).id,
        )
        .eq("is_active", true).maybeSingle();
      if (!currentAssignment) return errResponse("ไม่พบตำแหน่งในวาระปัจจุบัน", 404);
      let assignedName: string | null = null;
      if (assignedMemberId) {
        const { data: member } = await db.from("members").select(
          "name,nickname",
        ).eq("id", assignedMemberId).eq("is_archived", false).maybeSingle();
        if (!member) return errResponse("ไม่พบสมาชิกที่เลือก");
        assignedName =
          textValue((member as Record<string, unknown>).nickname) ||
          textValue((member as Record<string, unknown>).name) || null;
      }
      const outgoingMemberId = textValue(
        (currentAssignment as Record<string, unknown>).assigned_member_id,
      );
      const transition =
        outgoingMemberId === assignedMemberId && assignedMemberId
          ? "continued"
          : outgoingMemberId && assignedMemberId
          ? "transferred"
          : assignedMemberId
          ? "assigned"
          : "vacated";
      if (p.confirmed !== true) {
        return jsonResponse({
          ok: true,
          preview: true,
          transition,
          outgoingMemberId: outgoingMemberId || null,
          outgoingName: textValue(
            (currentAssignment as Record<string, unknown>).assigned_name,
          ) || null,
          incomingMemberId: assignedMemberId || null,
          incomingName: assignedName,
          oldAccessWillBeSuspended: Boolean(
            outgoingMemberId && outgoingMemberId !== assignedMemberId &&
              ltRole.startsWith("Mentor"),
          ),
          existingAccessWillBeExtended: Boolean(
            assignedMemberId && outgoingMemberId === assignedMemberId &&
              ltRole.startsWith("Mentor"),
          ),
        });
      }
      if (textValue(p.expectedOutgoingMemberId) !== outgoingMemberId) {
        return errResponse("ผู้รับตำแหน่งถูกเปลี่ยนหลังเปิดตัวอย่าง กรุณาตรวจใหม่", 409);
      }
      const { data: transitioned, error: transitionError } = await db.rpc(
        "fn_transition_lt_assignment",
        {
          p_lt_role: ltRole,
          p_incoming_member_id: assignedMemberId || null,
          p_fallback_member_id: fallbackMemberId || null,
          p_expected_outgoing_member_id: outgoingMemberId || null,
          p_actor: String(auth.displayName || auth.role || "Chapter Admin"),
        },
      );
      if (transitionError) return errResponse(transitionError.message);
      return jsonResponse({ ok: true, assignment: transitioned });
    }

    case "previewLtTerm": {
      const auth = await requireAuth(db, p, ["admin"]);
      if (!auth.ok) return errResponse(auth.error!);
      const name = textValue(p.name).slice(0, 120),
        startsOn = textValue(p.startsOn),
        endsOn = textValue(p.endsOn);
      if (
        !name || !parseYmdDate(startsOn) || !parseYmdDate(endsOn) ||
        endsOn < startsOn
      ) return errResponse("กรุณาระบุชื่อและช่วงวันที่วาระให้ถูกต้อง");
      const [
        { data: terms, error: termError },
        { data: roles, error: roleError },
      ] = await Promise.all([
        db.from("lt_terms").select("id,name,starts_on,ends_on,status").order(
          "starts_on",
          { ascending: false },
        ),
        db.from("passport_lt_assignments").select(
          "lt_role,assigned_member_id,fallback_member_id,assigned_name",
        ).eq("is_active", true),
      ]);
      if (termError) return errResponse(termError.message);
      if (roleError) return errResponse(roleError.message);
      const active =
        ((terms || []) as Record<string, unknown>[]).find((t) =>
          String(t.status || "") === "active"
        ) || null;
      const overlaps = ((terms || []) as Record<string, unknown>[]).filter(
        (t) =>
          String(t.status || "") !== "archived" &&
          String(t.starts_on || "") <= endsOn &&
          String(t.ends_on || "") >= startsOn,
      );
      const assignments = (roles || []) as Record<string, unknown>[];
      return jsonResponse({
        ok: true,
        preview: {
          name,
          startsOn,
          endsOn,
          activeTerm: active,
          overlapTerms: overlaps,
          assignmentCount: assignments.filter((a) =>
            a.assigned_member_id
          ).length,
          fallbackCount: assignments.filter((a) => a.fallback_member_id).length,
          emptyRoles: assignments.filter((a) => !a.assigned_member_id).map(
            (a) => String(a.lt_role || ""),
          ),
          copyPrevious: p.copyPrevious !== false,
        },
      });
    }

    case "createLtTerm": {
      const auth = await requireAuth(db, p, ["admin"]);
      if (!auth.ok) return errResponse(auth.error!);
      const name = textValue(p.name).slice(0, 120),
        startsOn = textValue(p.startsOn),
        endsOn = textValue(p.endsOn);
      if (
        !name || !parseYmdDate(startsOn) || !parseYmdDate(endsOn) ||
        endsOn < startsOn
      ) return errResponse("กรุณาระบุชื่อและช่วงวันที่วาระให้ถูกต้อง");
      const { data, error } = await db.rpc("fn_create_lt_term", {
        p_name: name,
        p_starts_on: startsOn,
        p_ends_on: endsOn,
        p_copy_previous: p.copyPrevious !== false,
        p_actor: String(auth.displayName || auth.role || "mc"),
      });
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true, termId: data });
    }

    // ── Passport to Success Scheduler (MC only) ────────────────
    case "getPassportCalendar": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);
      try {
        const today = new Date(
          new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }),
        );
        const from = today.toISOString().split("T")[0];
        const toDate = new Date(today);
        toDate.setDate(today.getDate() + 28);
        const to = toDate.toISOString().split("T")[0];
        const { data, error } = await db
          .from("passport_sessions")
          .select(
            "id, scheduled_date, title, lt_role, assigned_lt_name, assigned_lt_member_id, status, week_no, member_id, members!passport_sessions_member_id_fkey(name, nickname)",
          )
          .gte("scheduled_date", from)
          .lte("scheduled_date", to)
          .in("status", ["scheduled", "notified"])
          .order("scheduled_date", { ascending: true })
          .order("week_no", { ascending: true });
        if (error) return errResponse(error.message);
        const sessions = ((data || []) as Record<string, unknown>[]).map(
          (s) => {
            const m = (s.members || {}) as Record<string, unknown>;
            return {
              id: String(s.id || ""),
              date: String(s.scheduled_date || ""),
              memberName: String(m.name || ""),
              memberNick: String(m.nickname || m.name || ""),
              title: String(s.title || s.lt_role || ""),
              ltRole: String(s.lt_role || ""),
              ltName: String(s.assigned_lt_name || ""),
              ltMemberId: s.assigned_lt_member_id
                ? String(s.assigned_lt_member_id)
                : null,
              status: String(s.status || "scheduled"),
              weekNo: Number(s.week_no) || 0,
            };
          },
        );
        return jsonResponse({ ok: true, sessions });
      } catch (e) {
        return errResponse(
          e instanceof Error ? e.message : "Passport calendar failed",
        );
      }
    }

    case "getPassportBoard": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);
      try {
        const data = await getPassportBoardData(db);
        return jsonResponse({ ok: true, ...data });
      } catch (e) {
        return errResponse(
          e instanceof Error ? e.message : "Passport board failed",
        );
      }
    }

    case "syncPassportEnrollments": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);
      try {
        const sync = await syncPassportEnrollments(db);
        return jsonResponse({ ok: true, sync });
      } catch (e) {
        return errResponse(
          e instanceof Error ? e.message : "Passport sync failed",
        );
      }
    }

    case "updatePassportSession": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);
      const sessionId = String(p.sessionId || p.id || "");
      if (!sessionId) return errResponse("sessionId required");
      const allowed = new Set([
        "scheduled",
        "notified",
        "confirmed",
        "declined",
        "rescheduled",
        "completed",
        "missed",
      ]);
      const status = textValue(p.status);
      const scheduledDate = textValue(p.scheduledDate);
      const notes = textValue(p.notes);

      const { data: current, error: curErr } = await db
        .from("passport_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();
      if (curErr) return errResponse(curErr.message);
      if (!current) return errResponse("session not found", 404);

      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (status) {
        if (!allowed.has(status)) {
          return errResponse(`invalid status: ${status}`);
        }
        patch.status = status;
        if (status === "confirmed") {
          patch.confirmed_at = new Date().toISOString();
        }
        if (status === "completed") {
          patch.completed_at = new Date().toISOString();
        }
      }
      if (scheduledDate) {
        if (!parseYmdDate(scheduledDate)) {
          return errResponse("scheduledDate must be YYYY-MM-DD");
        }
        if (
          scheduledDate !==
            String((current as Record<string, unknown>).scheduled_date || "")
        ) {
          patch.scheduled_date = scheduledDate;
          patch.status = status || "rescheduled";
          patch.rescheduled_from =
            (current as Record<string, unknown>).rescheduled_from ||
            (current as Record<string, unknown>).scheduled_date;
        }
      }
      if ("assignedLtMemberId" in p) {
        patch.assigned_lt_member_id = textValue(p.assignedLtMemberId) || null;
      }
      if ("assignedLtName" in p) {
        patch.assigned_lt_name = textValue(p.assignedLtName) || null;
      }
      if ("notes" in p) patch.notes = notes || null;

      const { data, error } = await db
        .from("passport_sessions")
        .update(patch)
        .eq("id", sessionId)
        .select("*")
        .single();
      if (error) return errResponse(error.message);

      await db.from("passport_session_events").insert({
        session_id: sessionId,
        event_type: status || (scheduledDate ? "rescheduled" : "updated"),
        actor: String(auth.role || "mc"),
        note: notes || null,
        data: { before: current, after: patch },
      });
      return jsonResponse({ ok: true, session: data });
    }

    case "savePassportLtAssignment": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);
      const ltRole = textValue(p.ltRole || p.lt_role);
      if (!ltRole) return errResponse("ltRole required");
      const assignedMemberId = textValue(
        p.assignedMemberId || p.assigned_member_id,
      );
      let assignedName = textValue(p.assignedName || p.assigned_name);
      if (assignedMemberId) {
        const { data: member } = await db.from("members").select(
          "name, nickname",
        ).eq("id", assignedMemberId).maybeSingle();
        if (member) {
          assignedName =
            textValue((member as Record<string, unknown>).nickname) ||
            textValue((member as Record<string, unknown>).name) || assignedName;
        }
      }
      const row = {
        lt_role: ltRole,
        assigned_member_id: assignedMemberId || null,
        assigned_name: assignedName || null,
        fallback_member_id:
          textValue(p.fallbackMemberId || p.fallback_member_id) || null,
        term_start: textValue(p.termStart || p.term_start) || null,
        term_end: textValue(p.termEnd || p.term_end) || null,
        notes: textValue(p.notes) || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      };
      const { data: existing } = await db
        .from("passport_lt_assignments")
        .select("id")
        .eq("lt_role", ltRole)
        .eq("is_active", true)
        .maybeSingle();
      const q = existing
        ? db.from("passport_lt_assignments").update(row).eq(
          "id",
          (existing as Record<string, unknown>).id,
        ).select("*").single()
        : db.from("passport_lt_assignments").insert(row).select("*").single();
      const { data, error } = await q;
      if (error) return errResponse(error.message);

      await db.from("passport_sessions")
        .update({
          assigned_lt_member_id: assignedMemberId || null,
          assigned_lt_name: assignedName || null,
          updated_at: new Date().toISOString(),
        })
        .eq("lt_role", ltRole)
        .in("status", ["scheduled", "notified"]);
      return jsonResponse({ ok: true, assignment: data });
    }

    // ── GET: members grouped by team for team management UI ───
    case "getMembersByTeam": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);

      const [{ data, error }, { data: mentorTeams, error: teamError }] =
        await Promise.all([
          db.from("v_members_by_team").select(
            "id, name, nickname, mentor_team, is_mentored, latest_score, traffic_light",
          ),
          db.from("mentor_teams").select("name,leader_name,display_name").order(
            "id",
          ),
        ]);
      if (error || teamError) {
        return errResponse(
          error?.message || teamError?.message || "โหลด Mentor Team ไม่สำเร็จ",
        );
      }

      // Group by team
      const teams: Record<string, unknown[]> = {
        TOOMTAM: [],
        Aof: [],
        Draft: [],
        PHAI: [],
        AMP: [],
        unassigned: [],
      };
      for (const m of (data || []) as Record<string, unknown>[]) {
        const team = String(m.mentor_team || "");
        const key = VALID_TEAMS.has(team) ? team : "unassigned";
        teams[key].push(m);
      }

      const teamLabels = Object.fromEntries(
        ((mentorTeams || []) as Record<string, unknown>[]).map((team) => [
          String(team.name),
          String(
            team.display_name || `ทีม ${String(team.leader_name || team.name)}`,
          ),
        ]),
      );
      const teamCatalog = ((mentorTeams || []) as Record<string, unknown>[])
        .map((team) => ({
          code: String(team.name || ""),
          displayName: String(
            team.display_name || `ทีม ${String(team.leader_name || team.name)}`,
          ),
          leaderName: String(team.leader_name || ""),
        }));
      return jsonResponse({ ok: true, teams, teamLabels, teamCatalog });
    }

    // ── MOVE: MC moves a member to a different team ───────────
    // This is the core feature: MC can freely reassign any member
    // including LT/President who previously had no team.
    case "moveMemberToTeam":
    case "assignToTeam": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);

      const lookup = await findMemberByLegacyPayload(db, p);
      if (lookup.error || !lookup.member) {
        return errResponse(lookup.error || "member not found");
      }

      const memberId = lookup.member.id;
      const targetTeam = normalizeTeam(
        p.targetTeam ?? p.mentor ?? p.mentorTeam,
      );
      const note = textValue(p.note) || null;

      if (action === "assignToTeam" && !targetTeam) {
        return errResponse("targetTeam required");
      }

      // Validate team name if provided
      if (targetTeam !== null && !VALID_TEAMS.has(targetTeam)) {
        return errResponse(
          `Invalid team "${targetTeam}". Must be one of: ${
            [...VALID_TEAMS].join(", ")
          }`,
        );
      }

      // Use atomic DB function that also logs history
      const { data, error } = await db.rpc("fn_move_member_team", {
        p_member_id: memberId,
        p_target_team: targetTeam,
        p_moved_by: String(auth.role || "mc"),
        p_note: note,
      });
      if (error) return errResponse(error.message);

      const result = data as {
        ok: boolean;
        error?: string;
        changed?: boolean;
        member?: string;
        from_team?: string;
        to_team?: string;
      };
      if (!result.ok) return errResponse(result.error || "Move failed");

      // If expDate provided, upsert into renewals table
      const expDate = textValue(p.expDate || p.expiryDate || p.expiry);
      if (expDate) {
        await db.from("renewals").upsert(
          { member_id: memberId, expiry_date: expDate },
          { onConflict: "member_id" },
        );
      }

      return jsonResponse({ ...result, warnings: [] });
    }

    case "bulkMoveMembersToTeam": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);
      const memberIds = [
        ...new Set(
          (Array.isArray(p.memberIds) ? p.memberIds : []).map(String).filter(
            (id) => /^[0-9a-f-]{36}$/i.test(id),
          ),
        ),
      ];
      if (!memberIds.length || memberIds.length > 100) {
        return errResponse("กรุณาเลือกสมาชิก 1–100 คน");
      }
      const targetTeam = normalizeTeam(p.targetTeam);
      if (targetTeam !== null && !VALID_TEAMS.has(targetTeam)) {
        return errResponse("ทีมปลายทางไม่ถูกต้อง");
      }
      const note = textValue(p.note).slice(0, 500) ||
        `Bulk team move via Mentor Team Manager`;
      const { data, error } = await db.rpc("fn_bulk_move_members_team", {
        p_member_ids: memberIds,
        p_target_team: targetTeam,
        p_moved_by: String(auth.displayName || auth.role || "mc"),
        p_note: note,
      });
      if (error) return errResponse(error.message);
      return jsonResponse(data as Record<string, unknown>);
    }

    // ── GET: team move history for a member ──────────────────
    case "getTeamHistory": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);

      const memberId = String(p.memberId || p.member_id || "");
      if (!memberId) return errResponse("memberId required");

      const { data, error } = await db
        .from("member_team_history")
        .select("from_team, to_team, moved_by_role, note, moved_at")
        .eq("member_id", memberId)
        .order("moved_at", { ascending: false })
        .limit(20);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true, history: data });
    }

    case "getTeamMoveHistory": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);
      const { data, error } = await db.from("member_team_history")
        .select(
          "id,member_id,from_team,to_team,moved_by_role,note,moved_at,members(name,nickname)",
        )
        .order("moved_at", { ascending: false }).limit(100);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true, history: data || [] });
    }

    // ── ARCHIVE member ────────────────────────────────────────
    // Frontend sends { memberName: name } — resolve by name then archive
    case "archiveMember": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);

      const lookup = await findMemberByLegacyPayload(db, p);
      if (lookup.error || !lookup.member) {
        return errResponse(lookup.error || "member not found");
      }
      if (!canAccessTeam(auth, lookup.member.mentor_team)) {
        return errResponse("ไม่มีสิทธิ์อัปเดตสถานะสมาชิกทีมอื่น", 403);
      }

      const { error } = await db
        .from("members")
        .update({
          is_archived: true,
          is_new_member: false,
          archived_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", lookup.member.id);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    // ── UNARCHIVE member ──────────────────────────────────────
    // Frontend sends { memberName: name } — resolve by name then unarchive
    case "unarchiveMember": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);

      // For unarchive, allow searching archived members too
      const memberNameRaw = textValue(p.memberName || p.name);
      if (!memberNameRaw) return errResponse("memberName required");
      const { data: mRow, error: mErr } = await db.from("members").select("id")
        .ilike("name", memberNameRaw).maybeSingle();
      if (mErr) return errResponse(mErr.message);
      if (!mRow) return errResponse(`ไม่พบสมาชิก: ${memberNameRaw}`);

      const { error } = await db
        .from("members")
        .update({
          is_archived: false,
          archived_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", String((mRow as Record<string, unknown>).id));
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    // ── ADD new member ────────────────────────────────────────
    case "addNewMember": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);

      const name = textValue(p.name || p.memberName);
      const nickname = textValue(p.nickname || p.nick) || null;
      const mentorTeam = normalizeTeam(
        p.mentorTeam ?? p.mentor ?? p.targetTeam,
      );
      const email = textValue(p.email) || null;
      const phone = textValue(p.phone) || null;
      const business =
        textValue(p.business || p.businessCategory || p.description) || null;
      // joinDate: the actual BNI join date (YYYY-MM-DD) — distinct from created_at
      const joinDateRaw = textValue(p.joinDate || p.startDate);
      const joinDate = joinDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(joinDateRaw)
        ? joinDateRaw
        : null;

      if (!name) return errResponse("name required");
      if (mentorTeam && !VALID_TEAMS.has(mentorTeam)) {
        return errResponse(`Invalid team "${mentorTeam}"`);
      }

      const { data, error } = await db
        .from("members")
        .insert({
          name,
          nickname,
          mentor_team: mentorTeam,
          is_mentored: mentorTeam !== null,
          is_archived: false,
          is_new_member: true,
          email,
          phone,
          joined_date: joinDate,
        })
        .select("id, name, nickname, mentor_team, email, phone, joined_date")
        .single();
      if (error) return errResponse(error.message);

      // Save business description to biz_profiles (shared with LINE bot)
      if (business) {
        const memberId0 = (data as Record<string, unknown>).id as string;
        await db.from("biz_profiles").upsert({
          member_id: memberId0,
          description: business,
          updated_at: new Date().toISOString(),
        }, { onConflict: "member_id" });
      }
      const d = data as Record<string, unknown>;
      const memberId = d.id as string;

      // Auto-create renewal record: expiry = joined_date + 365 days
      const warnings: string[] = [];
      if (joinDate) {
        const expiryDate = new Date(joinDate);
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        const expiryStr = expiryDate.toISOString().split("T")[0];
        const { error: renErr } = await db.from("renewals").insert({
          member_id: memberId,
          expiry_date: expiryStr,
          notes: "Auto-created on member add",
        });
        if (renErr) warnings.push(`renewal: ${renErr.message}`);
      } else {
        warnings.push("ไม่ได้ระบุ joinDate — ไม่ได้สร้าง Renewal record");
      }

      // Calculate 8W end date for display
      const w8Date = joinDate
        ? (() => {
          const d2 = new Date(joinDate);
          d2.setDate(d2.getDate() + 56);
          return d2.toISOString().split("T")[0];
        })()
        : null;

      return jsonResponse({
        ok: true,
        name: d.name,
        nick: d.nickname,
        joinedDate: d.joined_date,
        w8Date,
        expiryDate: joinDate
          ? (() => {
            const d2 = new Date(joinDate);
            d2.setFullYear(d2.getFullYear() + 1);
            return d2.toISOString().split("T")[0];
          })()
          : null,
        member: data,
        ...(warnings.length ? { warnings } : {}),
      });
    }

    // ── DELETE member permanently (MC only) ──────────────────
    // ── UPDATE member info (name / nick / membership_start_date) ──
    // Used for seat transfers: new person takes over existing seat & membership history.
    case "updateMember": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);

      const lookup = await findMemberByLegacyPayload(db, p);
      if (lookup.error || !lookup.member) {
        return errResponse(lookup.error || "member not found");
      }
      const mid = lookup.member.id;

      const newName = String(p.newName || "").trim();
      const newNick = String(p.newNick || "").trim();
      const startRaw = String(p.membershipStartDate || "").trim();
      const clearScores = Boolean(p.clearScoreHistory);

      if (!newName) return errResponse("ต้องระบุชื่อใหม่");

      // Validate date format
      if (startRaw && !/^\d{4}-\d{2}-\d{2}$/.test(startRaw)) {
        return errResponse("รูปแบบวันต้องเป็น YYYY-MM-DD");
      }

      // Check for duplicate name (excluding self)
      if (newName !== lookup.member.name) {
        const { data: dup, error: dupErr } = await db.from("members").select(
          "id",
        ).eq("name", newName).neq("id", mid).limit(1);
        if (dupErr) return errResponse(dupErr.message);
        if (dup && dup.length > 0) {
          return errResponse(`ชื่อ "${newName}" มีอยู่ในระบบแล้ว`);
        }
      }

      const updates: Record<string, unknown> = {
        name: newName,
        nickname: newNick || lookup.member.nickname,
        updated_at: new Date().toISOString(),
      };
      if (startRaw) {
        updates.membership_start_date = startRaw;
        updates.joined_date = startRaw;
      }

      const { error: updErr } = await db.from("members").update(updates).eq(
        "id",
        mid,
      );
      if (updErr) return errResponse(updErr.message);

      await db.from("member_admin_events").insert({
        member_id: mid,
        event_type: clearScores
          ? "seat_transfer_updated"
          : "member_profile_updated",
        actor_role: String(auth.role || "mc"),
        actor_ref: String(auth.role || "mc"),
        metadata: {
          old_name: lookup.member.name,
          new_name: newName,
          nickname_changed: newNick !== String(lookup.member.nickname || ""),
          membership_start_changed: Boolean(startRaw),
          score_history_cleared: clearScores,
        },
      });

      // If seat transfer: recalculate bni_days in r2y_stats
      if (startRaw) {
        const daysSince = Math.max(
          1,
          Math.floor((Date.now() - new Date(startRaw).getTime()) / 86400000),
        );
        await db.from("r2y_stats").update({ bni_days: daysSince }).eq(
          "member_id",
          mid,
        );
      }

      // Clear monthly score history if requested (seat transfer to fresh person)
      if (clearScores) {
        await db.from("monthly_scores").delete().eq("member_id", mid);
      }

      return jsonResponse({
        ok: true,
        updated: newName,
        clearedScores: clearScores,
      });
    }

    case "deleteMember": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);

      const lookup = await findMemberByLegacyPayload(db, p);
      if (lookup.error || !lookup.member) {
        return errResponse(lookup.error || "member not found");
      }
      const mid = lookup.member.id;

      // Manually clean up tables without ON DELETE CASCADE before deleting member
      await db.from("one_to_one_logs").delete().eq("initiator_id", mid);
      await db.from("one_to_one_logs").delete().eq("partner_id", mid);
      await db.from("power_teams").delete().or(
        `member_a_id.eq.${mid},member_b_id.eq.${mid}`,
      );
      await db.from("cross_team_synergy").delete().or(
        `member_a_id.eq.${mid},member_b_id.eq.${mid}`,
      );
      await db.from("visitor_log").update({ invited_by: null }).eq(
        "invited_by",
        mid,
      );
      await db.from("mc_assignments").update({ member_id: null }).eq(
        "member_id",
        mid,
      );
      await db.from("growth_tasks").update({ member_id: null }).eq(
        "member_id",
        mid,
      );
      await db.from("checkin_entries").update({ member_id: null }).eq(
        "member_id",
        mid,
      );
      await db.from("team_notifs").update({ member_id: null }).eq(
        "member_id",
        mid,
      );

      const { error } = await db.from("members").delete().eq("id", mid);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true, deleted: lookup.member.name });
    }

    // ── SAVE monthly score ────────────────────────────────────
    case "saveScore": {
      const auth = await requireAuth(db, p, [
        "mc",
        "toomtam",
        "aof",
        "draft",
        "phai",
        "amp",
      ]);
      if (!auth.ok) return errResponse(auth.error!);

      const lookup = await findMemberByLegacyPayload(db, p);
      if (lookup.error || !lookup.member) {
        return errResponse(lookup.error || "member not found");
      }
      if (!canAccessTeam(auth, lookup.member.mentor_team)) {
        return errResponse("ไม่มีสิทธิ์บันทึกคะแนนสมาชิกทีมอื่น", 403);
      }

      const memberId = lookup.member.id;
      const year = Number(p.year || currentBangkokYear());
      const month = Number(p.month);
      const score = Number(p.score);

      if (!memberId || !year || !month || isNaN(score)) {
        return errResponse("memberId, year, month, score required");
      }

      const { error } = await db.from("monthly_scores").upsert({
        member_id: memberId,
        year,
        month,
        score,
        source: "manual",
      }, { onConflict: "member_id,year,month" });
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    // ── SAVE mentor status ────────────────────────────────────
    // ── SET mentoring mode (Active / Growth Watch) ───────────
    case "setMentoringMode": {
      const auth = await requireAuth(db, p, ["mc", "growth"]);
      if (!auth.ok) return errResponse(auth.error!);

      const mode = textValue(p.mode).toLowerCase();
      if (!["active", "growth_watch"].includes(mode)) {
        return errResponse("mode must be active or growth_watch");
      }

      const lookup = await findMemberByLegacyPayload(db, p);
      if (lookup.error || !lookup.member) {
        return errResponse(lookup.error || "member not found");
      }

      if (mode === "growth_watch") {
        const { data: dashboardMember, error: scoreError } = await db
          .from("v_member_dashboard")
          .select("display_score")
          .eq("id", lookup.member.id)
          .maybeSingle();
        if (scoreError) return errResponse(scoreError.message);
        const score = Number(
          (dashboardMember as Record<string, unknown> | null)?.display_score,
        ) || 0;
        if (score < GROWTH_WATCH_MIN_SCORE) {
          return errResponse(
            `Growth Watch รับเฉพาะสมาชิกคะแนน ${GROWTH_WATCH_MIN_SCORE}+ (คะแนนปัจจุบัน ${score})`,
          );
        }
      }

      const { error } = await db.from("members").update({
        mentoring_mode: mode,
        mode_changed_at: new Date().toISOString(),
        mode_changed_by: textValue(
          p.changedBy || auth.displayName || auth.role,
        ),
        updated_at: new Date().toISOString(),
      }).eq("id", lookup.member.id);
      if (error) {
        const msg = error.message.includes("mentoring_mode")
          ? "ยังไม่ได้รัน Migration 018 — กรุณาเพิ่มคอลัมน์ mentoring_mode ใน Supabase Dashboard ก่อน"
          : error.message;
        return errResponse(msg);
      }
      return jsonResponse({ ok: true, mode, memberName: lookup.member.name });
    }

    case "saveStatus": {
      const auth = await requireAuth(db, p, [
        "mc",
        "toomtam",
        "aof",
        "draft",
        "phai",
        "amp",
      ]);
      if (!auth.ok) return errResponse(auth.error!);

      const lookup = await findMemberByLegacyPayload(db, p);
      if (lookup.error || !lookup.member) {
        return errResponse(lookup.error || "member not found");
      }
      if (!canAccessTeam(auth, lookup.member.mentor_team)) {
        return errResponse("ไม่มีสิทธิ์อัปเดตสถานะสมาชิกทีมอื่น", 403);
      }

      const memberId = lookup.member.id;
      const status = textValue(p.status);

      const { error } = await db
        .from("members")
        .update({ mentor_status: status, updated_at: new Date().toISOString() })
        .eq("id", memberId);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    // ── ENSURE slot: look up or create a member row ───────────
    case "ensureSlot": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);
      const memberName = String(p.memberName || "").trim();
      const nick = p.nick ? String(p.nick).trim() : "";
      if (!memberName) return errResponse("memberName required");

      // Try to find existing member
      const { data: existing, error: findErr } = await db
        .from("members")
        .select("id, mentor_team")
        .eq("name", memberName)
        .limit(1)
        .maybeSingle();
      if (findErr) return errResponse(findErr.message);

      if (existing) {
        return jsonResponse({ ok: true, existed: true, memberId: existing.id });
      }

      // Not found — insert
      const { data: inserted, error: insErr } = await db
        .from("members")
        .insert({
          name: memberName,
          nickname: nick,
          is_new_member: true,
          is_archived: false,
        })
        .select("id")
        .single();
      if (insErr) return errResponse(insErr.message);
      return jsonResponse({ ok: true, existed: false, memberId: inserted.id });
    }

    // ── GET archived members ──────────────────────────────────
    case "getArchivedMembers": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);
      const { data, error } = await db
        .from("members")
        .select("id, name, nickname, mentor_team")
        .eq("is_archived", true)
        .order("name");
      if (error) return errResponse(error.message);
      const members = (data || []).map((m: Record<string, unknown>) => ({
        id: m.id,
        name: m.name,
        nick: m.nickname,
        mentorTeam: m.mentor_team,
      }));
      return jsonResponse({ ok: true, members });
    }

    // ── SAVE member note (upsert within 24 h) ─────────────────
    case "saveMemberNote": {
      const auth = await requireAuth(db, p, [
        "mc",
        "toomtam",
        "aof",
        "draft",
        "phai",
        "amp",
      ]);
      if (!auth.ok) return errResponse(auth.error!);
      const memberName = String(p.memberName || "").trim();
      const note = String(p.note ?? "");
      if (!memberName) return errResponse("memberName required");

      // Resolve member id
      const { data: member, error: mErr } = await db
        .from("members")
        .select("id, mentor_team")
        .eq("name", memberName)
        .limit(1)
        .maybeSingle();
      if (mErr) return errResponse(mErr.message);
      if (!member) return errResponse(`Member not found: ${memberName}`);
      if (!canAccessTeam(auth, String(member.mentor_team || ""))) {
        return errResponse("ไม่มีสิทธิ์บันทึก Note ของสมาชิกทีมอื่น", 403);
      }
      const memberId = member.id as string;

      // Check for an existing note updated within the last 24 h
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: existing, error: nErr } = await db
        .from("member_notes")
        .select("id")
        .eq("member_id", memberId)
        .gte("updated_at", cutoff)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (nErr) return errResponse(nErr.message);

      if (existing) {
        const { error: upErr } = await db
          .from("member_notes")
          .update({ note, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (upErr) return errResponse(upErr.message);
      } else {
        const { error: insErr } = await db
          .from("member_notes")
          .insert({
            member_id: memberId,
            note,
            author_role: String(auth.role || ""),
          });
        if (insErr) return errResponse(insErr.message);
      }

      return jsonResponse({ ok: true });
    }

    // ── GET latest member note ────────────────────────────────
    case "getMemberNote": {
      const auth = await requireAuth(db, p, [
        "mc",
        "toomtam",
        "aof",
        "draft",
        "phai",
        "amp",
      ]);
      if (!auth.ok) return errResponse(auth.error!);
      const memberName = String(p.memberName || "").trim();
      if (!memberName) return errResponse("memberName required");

      const { data: member, error: mErr } = await db
        .from("members")
        .select("id, mentor_team")
        .eq("name", memberName)
        .limit(1)
        .maybeSingle();
      if (mErr) return errResponse(mErr.message);
      if (!member) return jsonResponse({ ok: true, note: "" });
      if (!canAccessTeam(auth, String(member.mentor_team || ""))) {
        return errResponse("ไม่มีสิทธิ์ดู Note ของสมาชิกทีมอื่น", 403);
      }
      const memberId = member.id as string;

      const { data, error } = await db
        .from("member_notes")
        .select("note")
        .eq("member_id", memberId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true, note: (data?.note as string) || "" });
    }

    // ── SAVE new-member checklist item ────────────────────────
    case "saveNMCheckItem": {
      const auth = await requireAuth(db, p, [
        "mc",
        "toomtam",
        "aof",
        "draft",
        "phai",
        "amp",
      ]);
      if (!auth.ok) return errResponse(auth.error!);
      const memberName = String(p.memberName || p.fileUrl || "").trim();
      const itemKey = String(p.itemKey || "").trim();
      // pass=true → passed, pass=false+nopass=true → no-pass, pass=null → reset
      const passRaw = p.pass;
      const nopassRaw = p.nopass;
      const hasStatus = passRaw !== null && passRaw !== undefined ||
        nopassRaw !== null && nopassRaw !== undefined;
      const pass = passRaw === null || passRaw === undefined
        ? false
        : Boolean(passRaw);
      const nopass = nopassRaw === null || nopassRaw === undefined
        ? false
        : Boolean(nopassRaw);
      const isDone = pass;
      const comment = p.mentor_comment !== undefined
        ? String(p.mentor_comment || "").trim()
        : undefined;
      if (!memberName || !itemKey) {
        return errResponse("memberName and itemKey required");
      }

      const { data: member, error: mErr } = await db
        .from("members")
        .select("id, mentor_team")
        .eq("name", memberName)
        .limit(1)
        .maybeSingle();
      if (mErr) return errResponse(mErr.message);
      if (!member) return errResponse(`Member not found: ${memberName}`);
      if (!canAccessTeam(auth, String(member.mentor_team || ""))) {
        return errResponse("ไม่มีสิทธิ์แก้ Checklist ของสมาชิกทีมอื่น", 403);
      }
      const memberId = member.id as string;

      const now = new Date().toISOString();
      const upsertData: Record<string, unknown> = {
        member_id: memberId,
        item_key: itemKey,
        updated_at: now,
      };
      if (hasStatus) {
        upsertData.is_done = isDone;
        upsertData.pass = pass;
        upsertData.nopass = nopass;
        upsertData.done_at = isDone ? now : null;
      }
      if (comment !== undefined) upsertData.mentor_comment = comment;

      const { error } = await db
        .from("new_member_checklist")
        .upsert(upsertData, { onConflict: "member_id,item_key" });
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    // ── GET new-member checklist ──────────────────────────────
    case "getNMChecklist": {
      const auth = await requireAuth(db, p, [
        "mc",
        "toomtam",
        "aof",
        "draft",
        "phai",
        "amp",
        "growth",
      ]);
      if (!auth.ok) return errResponse(auth.error!);
      // fileUrl = member name (legacy identifier from GAS version)
      const memberName = String(p.memberName || p.fileUrl || "").trim();
      if (!memberName) return errResponse("memberName required");

      const { data: member, error: mErr } = await db
        .from("members")
        .select("id, name, nickname, mentor_team, created_at")
        .eq("name", memberName)
        .limit(1)
        .maybeSingle();
      if (mErr) return errResponse(mErr.message);
      if (!member) {
        return jsonResponse({
          ok: true,
          checklist: [],
          tasks: [],
          total: 0,
          done: 0,
          pct: 0,
        });
      }
      const m = member as Record<string, unknown>;
      if (
        !canAccessTeam(auth, String(m.mentor_team || ""), { allowGrowth: true })
      ) {
        return errResponse("ไม่มีสิทธิ์ดู Checklist ของสมาชิกทีมอื่น", 403);
      }
      const memberId = String(m.id);

      // BNI Chapter Ideal — Full 41-task mentoring program template
      const TEMPLATE = [
        // 8-Week Mentoring Program
        {
          itemKey: "orientation",
          phase: "🗓 8-Week Program",
          timeline: "Orientation",
          task: "New Member Orientation",
          link: "",
        },
        {
          itemKey: "w1_visitor_day",
          phase: "🗓 8-Week Program",
          timeline: "1st Week",
          task: "Visitor Day — นำสมาชิกมาร่วมประชุม",
          link: "",
        },
        {
          itemKey: "w2_30sec",
          phase: "🗓 8-Week Program",
          timeline: "2nd Week",
          task: "30 Seconds Presentation",
          link: "",
        },
        {
          itemKey: "w3_referral",
          phase: "🗓 8-Week Program",
          timeline: "3rd Week",
          task: "Referral — ส่งงานให้สมาชิก",
          link: "",
        },
        {
          itemKey: "w4_121",
          phase: "🗓 8-Week Program",
          timeline: "4th Week",
          task: "121 Meeting — จัดนัด 1-2-1",
          link: "",
        },
        {
          itemKey: "w5_121_followup",
          phase: "🗓 8-Week Program",
          timeline: "5th Week",
          task: "121 Follow Up",
          link: "",
        },
        {
          itemKey: "w6_5min_feature",
          phase: "🗓 8-Week Program",
          timeline: "6th Week",
          task: "5 Minutes Feature Presentation",
          link: "",
        },
        {
          itemKey: "w7_power_team",
          phase: "🗓 8-Week Program",
          timeline: "7th Week",
          task: "Power Team — สร้างกลุ่มอาชีพ",
          link: "",
        },
        {
          itemKey: "w8_substitute",
          phase: "🗓 8-Week Program",
          timeline: "8th Week",
          task: "Substitute — ส่งตัวแทนเข้าประชุม",
          link: "",
        },
        // Needed Training
        {
          itemKey: "t_msp",
          phase: "📚 Needed Training",
          timeline: "60 Days",
          task: "MSP — Member Success Program",
          link: "",
        },
        {
          itemKey: "t_lcd_review",
          phase: "📚 Needed Training",
          timeline: "60 Days",
          task: "Review LCD After MSP",
          link: "",
        },
        {
          itemKey: "t_adv_msp",
          phase: "📚 Needed Training",
          timeline: "60 Days",
          task: "Advanced MSP",
          link: "",
        },
        {
          itemKey: "t_1yr_club",
          phase: "📚 Needed Training",
          timeline: "60 Days",
          task: "1st Year Club",
          link: "",
        },
        // New Member Tools
        {
          itemKey: "tool_one_page",
          phase: "🛠 New Member Tools",
          timeline: "60 Days",
          task: "One Page (Business Profile)",
          link: "",
        },
        {
          itemKey: "tool_bni_app",
          phase: "🛠 New Member Tools",
          timeline: "60 Days",
          task: "BNI Connect Mobile App",
          link: "",
        },
        {
          itemKey: "tool_r2y",
          phase: "🛠 New Member Tools",
          timeline: "60 Days",
          task: "Reporting2You App",
          link: "https://bit.ly/r2you",
        },
        {
          itemKey: "tool_slide_121",
          phase: "🛠 New Member Tools",
          timeline: "60 Days",
          task: "Slide Template สำหรับ 1-2-1",
          link: "",
        },
        {
          itemKey: "tool_30s_script",
          phase: "🛠 New Member Tools",
          timeline: "60 Days",
          task: "30s Script — สคริปต์นำเสนอ",
          link: "",
        },
        {
          itemKey: "tool_passport",
          phase: "🛠 New Member Tools",
          timeline: "60 Days",
          task: "Passport Program",
          link: "",
        },
        {
          itemKey: "tool_sunshine",
          phase: "🛠 New Member Tools",
          timeline: "60 Days",
          task: "Sunshine Concept",
          link: "",
        },
        {
          itemKey: "tool_ref_partner",
          phase: "🛠 New Member Tools",
          timeline: "60 Days",
          task: "Referral Partner Setup",
          link: "",
        },
        {
          itemKey: "tool_goal_form",
          phase: "🛠 New Member Tools",
          timeline: "60 Days",
          task: "Member Goal Setting Form",
          link: "",
        },
        {
          itemKey: "tool_green_2mo",
          phase: "🛠 New Member Tools",
          timeline: "60 Days",
          task: "Green Member — ภายใน 2 เดือน",
          link: "",
        },
        // 3 Months
        {
          itemKey: "m3_gains_121",
          phase: "📊 3 Months Program",
          timeline: "3 Months",
          task: "Review : GAINS & 121 Meeting",
          link: "",
        },
        {
          itemKey: "m3_msp_review",
          phase: "📊 3 Months Program",
          timeline: "3 Months",
          task: "Review : MSP & Advanced MSP",
          link: "",
        },
        {
          itemKey: "m3_survey",
          phase: "📊 3 Months Program",
          timeline: "3 Months",
          task: "Member Survey : 3 Months",
          link: "",
        },
        // 6 Months
        {
          itemKey: "m6_pd_care",
          phase: "📈 6 Months Program",
          timeline: "6 Months",
          task: "PD & Support Care Call",
          link: "",
        },
        {
          itemKey: "m6_adv_skill",
          phase: "📈 6 Months Program",
          timeline: "6 Months",
          task: "Advanced Skill Training",
          link: "",
        },
        {
          itemKey: "m6_lt_support",
          phase: "📈 6 Months Program",
          timeline: "6 Months",
          task: "Assist Leadership Team Support",
          link: "",
        },
        {
          itemKey: "m6_survey",
          phase: "📈 6 Months Program",
          timeline: "6 Months",
          task: "Member Survey : 6 Months",
          link: "",
        },
        // 7 Months
        {
          itemKey: "m7_become_mentor",
          phase: "🚀 7 Months Program",
          timeline: "7 Months",
          task: "Become a Mentor",
          link: "",
        },
        {
          itemKey: "m7_sponsor",
          phase: "🚀 7 Months Program",
          timeline: "7 Months",
          task: "Sponsor a New Member",
          link: "",
        },
        {
          itemKey: "m7_power_team",
          phase: "🚀 7 Months Program",
          timeline: "7 Months",
          task: "Engage in Power Team",
          link: "",
        },
        // 9 Months
        {
          itemKey: "m9_renewal_ann",
          phase: "🔄 9 Months Program",
          timeline: "9 Months",
          task: "ST : Renewal Announcement",
          link: "",
        },
        {
          itemKey: "m9_renewal_int",
          phase: "🔄 9 Months Program",
          timeline: "9 Months",
          task: "MCC : Renewal Interview",
          link: "",
        },
        {
          itemKey: "m9_renewal_pay",
          phase: "🔄 9 Months Program",
          timeline: "9 Months",
          task: "Renewal Payment & Process",
          link: "",
        },
        // 10 Months
        {
          itemKey: "m10_renewal_fu",
          phase: "💎 10 Months Program",
          timeline: "10 Months",
          task: "MCC : Renewal Follow Up",
          link: "",
        },
        // 12 Months
        {
          itemKey: "m12_refresh_msp",
          phase: "🎓 12 Months Program",
          timeline: "12 Months",
          task: "Refresh MSP",
          link: "",
        },
        {
          itemKey: "m12_adv_msp",
          phase: "🎓 12 Months Program",
          timeline: "12 Months",
          task: "Refresh Advanced MSP",
          link: "",
        },
        {
          itemKey: "m12_1yr_club",
          phase: "🎓 12 Months Program",
          timeline: "12 Months",
          task: "Refresh 1st Year Club",
          link: "",
        },
        {
          itemKey: "m12_survey",
          phase: "🎓 12 Months Program",
          timeline: "12 Months",
          task: "Member Survey : 12 Months",
          link: "",
        },
      ];

      const { data: clData, error: clErr } = await db
        .from("new_member_checklist")
        .select(
          "item_key, is_done, done_at, pass, nopass, mentor_comment, updated_at",
        )
        .eq("member_id", memberId);
      if (clErr) return errResponse(clErr.message);

      const doneMap: Record<
        string,
        {
          isDone: boolean;
          pass: boolean;
          nopass: boolean;
          doneAt: string | null;
          comment: string;
        }
      > = {};
      for (const r of (clData || []) as Record<string, unknown>[]) {
        doneMap[String(r.item_key)] = {
          isDone: Boolean(r.is_done),
          pass: Boolean(r.pass),
          nopass: Boolean(r.nopass),
          doneAt: r.done_at ? String(r.done_at) : null,
          comment: String(r.mentor_comment || ""),
        };
      }

      const tasks = TEMPLATE.map((t) => {
        const state = doneMap[t.itemKey];
        const pass = state?.pass ?? false;
        const nopass = state?.nopass ?? false;
        const doneAt = state?.doneAt ?? null;
        return {
          itemKey: t.itemKey,
          phase: t.phase,
          timeline: t.timeline,
          task: t.task,
          link: t.link || "",
          pass,
          nopass,
          date: doneAt ? doneAt.split("T")[0] : "",
          by: "",
          comment: state?.comment || "",
          status: pass ? "ผ่านแล้ว" : nopass ? "ยังไม่ผ่าน" : "ยังไม่ดำเนินการ",
        };
      });

      const totalCount = tasks.length;
      const doneCount = tasks.filter((t) => t.pass).length;
      const pct = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0;

      const createdAt = String(m.created_at || "");
      const startDate = createdAt.split("T")[0] || "";

      return jsonResponse({
        ok: true,
        memberName: String(m.name),
        nick: String(m.nickname || ""),
        mentor: String(m.mentor_team || ""),
        startDate,
        total: totalCount,
        done: doneCount,
        pct,
        tasks,
        fileUrl: String(m.name),
      });
    }

    // ── BATCH add new members (MC only) ──────────────────────
    case "addNewMembersBatch": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);

      const rawMembers = Array.isArray(p.members)
        ? p.members as Record<string, unknown>[]
        : [];
      if (!rawMembers.length) return errResponse("members array required");

      const businessMap: Record<string, string> = {};
      const rows = rawMembers.map((m) => {
        const jd = String(m.joined_date || m.startDate || m.joinDate || "")
          .trim();
        const biz = String(m.business || m.description || "").trim();
        const nm = String(m.name || "").trim();
        if (biz && nm) businessMap[nm] = biz;
        return {
          name: nm,
          nickname: String(m.nick || m.nickname || "").trim(),
          mentor_team: m.mentor_team || m.mentorTeam
            ? String(m.mentor_team || m.mentorTeam)
            : null,
          is_new_member: true,
          is_archived: false,
          joined_date: /^\d{4}-\d{2}-\d{2}$/.test(jd) ? jd : null,
        };
      }).filter((m) => m.name);

      const { data: inserted, error } = await db
        .from("members")
        .upsert(rows, { onConflict: "name", ignoreDuplicates: false })
        .select("id, joined_date");
      if (error) return errResponse(error.message);

      // Auto-create renewal records for members with joined_date
      const renewalRows = (inserted || [])
        .filter((m: Record<string, unknown>) => m.joined_date)
        .map((m: Record<string, unknown>) => {
          const exp = new Date(String(m.joined_date));
          exp.setFullYear(exp.getFullYear() + 1);
          return {
            member_id: m.id,
            expiry_date: exp.toISOString().split("T")[0],
            notes: "Auto-created on batch add",
          };
        });
      if (renewalRows.length) {
        await db.from("renewals").upsert(renewalRows, {
          onConflict: "member_id",
          ignoreDuplicates: true,
        });
      }

      // Save business descriptions to biz_profiles for members that provided one
      if (Object.keys(businessMap).length > 0) {
        const insertedRows = (inserted || []) as Record<string, unknown>[];
        // Re-fetch names for the inserted IDs
        const { data: nameRows } = await db.from("members").select("id, name")
          .in("id", insertedRows.map((r) => r.id));
        const bizRows = (nameRows || [])
          .filter((r: Record<string, unknown>) => businessMap[String(r.name)])
          .map((r: Record<string, unknown>) => ({
            member_id: r.id,
            description: businessMap[String(r.name)],
            updated_at: new Date().toISOString(),
          }));
        if (bizRows.length) {
          await db.from("biz_profiles").upsert(bizRows, {
            onConflict: "member_id",
          });
        }
      }

      return jsonResponse({ ok: true, count: rows.length });
    }

    // ── GET new members with checklist progress + latest note ─
    case "getNewMembers": {
      // Mentors see only their own team; MC sees everyone
      const auth = await requireAuth(db, p, [
        "mc",
        "toomtam",
        "aof",
        "draft",
        "phai",
        "amp",
        "growth",
      ]);
      if (!auth.ok) return errResponse(auth.error!);
      let callerTeam: string | null = null;
      if (auth.role && auth.role !== "mc" && auth.role !== "growth") {
        callerTeam = auth.teamName ?? null;
      }

      // Query 1: members explicitly flagged as new
      let q1 = db
        .from("members")
        .select("id, name, nickname, mentor_team, created_at, joined_date")
        .eq("is_new_member", true)
        .eq("is_archived", false);
      if (callerTeam) q1 = q1.eq("mentor_team", callerTeam);
      const { data: flaggedMembers, error: mErr } = await q1.order("name");
      if (mErr) return errResponse(mErr.message);

      // Query 2: members with r2y bni_days <= 56 (8-week window) but not already flagged
      const flaggedIds = new Set(
        (flaggedMembers || []).map((m: Record<string, unknown>) =>
          m.id as string
        ),
      );
      // Get member IDs where r2y bni_days is in the 8-week window
      const { data: r2yRows } = await db
        .from("r2y_stats")
        .select("member_id")
        .gt("bni_days", 0)
        .lte("bni_days", 56);
      const recentIds = ((r2yRows || []) as Record<string, unknown>[])
        .map((r) => r.member_id as string)
        .filter((id) => !flaggedIds.has(id));
      let extraMembers: Record<string, unknown>[] = [];
      if (recentIds.length > 0) {
        let q2 = db
          .from("members")
          .select("id, name, nickname, mentor_team, created_at, joined_date")
          .in("id", recentIds)
          .eq("is_archived", false);
        if (callerTeam) q2 = q2.eq("mentor_team", callerTeam);
        const { data: recentByDays } = await q2;
        extraMembers = (recentByDays || []) as Record<string, unknown>[];
      }

      const members = [...(flaggedMembers || []), ...extraMembers];
      if (members.length === 0) return jsonResponse({ ok: true, members: [] });

      const memberIds = (members as Record<string, unknown>[]).map((m) =>
        m.id as string
      );

      // Fetch checklist rows for all these members (include item_key for milestone detection)
      const CHECKLIST_TOTAL = 41; // must match TEMPLATE.length in getNMChecklist
      const { data: clRows, error: clErr } = await db
        .from("new_member_checklist")
        .select("member_id, item_key, is_done, pass")
        .in("member_id", memberIds);
      if (clErr) return errResponse(clErr.message);

      // Fetch latest notes for all these members
      const { data: noteRows, error: noteErr } = await db
        .from("member_notes")
        .select("member_id, note, updated_at")
        .in("member_id", memberIds)
        .order("updated_at", { ascending: false });
      if (noteErr) return errResponse(noteErr.message);

      // Fetch renewal/expiry dates
      const { data: renewalRows } = await db
        .from("renewals")
        .select("member_id, expiry_date")
        .in("member_id", memberIds);
      const expiryMap: Record<string, string> = {};
      for (const r of (renewalRows || []) as Record<string, unknown>[]) {
        expiryMap[String(r.member_id)] = String(r.expiry_date || "");
      }

      // Build lookup maps
      type ClRow = {
        member_id: string;
        item_key?: string;
        is_done: boolean | null;
        pass?: boolean | null;
      };
      type NoteRow = { member_id: string; note: string };

      const clByMember: Record<string, ClRow[]> = {};
      // Track milestone-relevant checklist items completed per member
      const MILESTONE_121_KEYS = new Set(["w4_121", "w5_121_followup"]);
      const MILESTONE_REF_KEYS = new Set(["w3_referral"]);
      const MILESTONE_VIS_KEYS = new Set(["w1_visitor_day"]);
      const MILESTONE_TRAIN_KEYS = new Set([
        "t_msp",
        "t_lcd_review",
        "t_adv_msp",
        "t_1yr_club",
      ]);
      const milestoneDone: Record<
        string,
        {
          has121: boolean;
          hasReferral: boolean;
          hasVisitor: boolean;
          hasTraining: boolean;
        }
      > = {};
      for (const r of (clRows || []) as ClRow[]) {
        (clByMember[r.member_id] ??= []).push(r);
        if ((Boolean(r.pass) || Boolean(r.is_done)) && r.item_key) {
          const ms = (milestoneDone[r.member_id] ??= {
            has121: false,
            hasReferral: false,
            hasVisitor: false,
            hasTraining: false,
          });
          if (MILESTONE_121_KEYS.has(r.item_key)) ms.has121 = true;
          if (MILESTONE_REF_KEYS.has(r.item_key)) ms.hasReferral = true;
          if (MILESTONE_VIS_KEYS.has(r.item_key)) ms.hasVisitor = true;
          if (MILESTONE_TRAIN_KEYS.has(r.item_key)) ms.hasTraining = true;
        }
      }
      const latestNoteByMember: Record<string, string> = {};
      for (const r of (noteRows || []) as NoteRow[]) {
        if (!(r.member_id in latestNoteByMember)) {
          latestNoteByMember[r.member_id] = r.note;
        }
      }

      const enriched = (members as Record<string, unknown>[]).map((m) => {
        const id = m.id as string;
        const items = clByMember[id] || [];
        const done = items.filter((r) =>
          Boolean(r.pass) || Boolean(r.is_done)
        ).length;
        const total = CHECKLIST_TOTAL; // always 41, never items.length
        const pct = Math.round(done / total * 100);

        // Use joined_date (actual BNI join date), fall back to created_at
        const joinedDate = String(m.joined_date || "").split("T")[0];
        const createdAt = String(m.created_at || "");
        const startDate = joinedDate || createdAt.split("T")[0] || "";
        let w8Date = "";
        if (startDate) {
          const d = new Date(startDate);
          d.setDate(d.getDate() + 56); // 8 weeks = 56 days
          w8Date = d.toISOString().split("T")[0];
        }

        const statusText = pct >= 100
          ? "ครบทุกข้อ"
          : done > 0
          ? `${done}/${total} ข้อ`
          : "ยังไม่ได้เริ่ม";

        const ms = milestoneDone[id] ||
          {
            has121: false,
            hasReferral: false,
            hasVisitor: false,
            hasTraining: false,
          };
        return {
          id,
          name: m.name,
          nick: m.nickname,
          mentor: m.mentor_team, // frontend uses nm.mentor
          mentorTeam: m.mentor_team,
          checklistDone: done,
          checklistTotal: total,
          progress: pct,
          joinedDate: startDate, // actual BNI join date
          startDate, // alias kept for backward compat
          w8Date,
          expDate: expiryMap[id] || "",
          status: statusText,
          fileUrl: String(m.name), // used as identifier for checklist panel
          latestNote: latestNoteByMember[id] || "",
          // Checklist-based milestone flags (fallback when R2Y data not yet imported)
          clHas121: ms.has121,
          clHasReferral: ms.hasReferral,
          clHasVisitor: ms.hasVisitor,
          clHasTraining: ms.hasTraining,
        };
      });

      return jsonResponse({ ok: true, members: enriched });
    }

    // ── REMOVE new-member flag (MC only) ─────────────────────
    case "removeNewMember": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || "").trim();
      if (!memberName) return errResponse("memberName required");

      const { error } = await db
        .from("members")
        .update({ is_new_member: false, updated_at: new Date().toISOString() })
        .eq("name", memberName);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    // ── Admin: email whitelist (MC + TOOMTAM only) ───────────────
    case "getAdminEmails": {
      const auth = await requireAuth(db, p, ["mc", "toomtam"]);
      if (!auth.ok || !auth.isSystemOwner) return errResponse("เฉพาะเจ้าของระบบเท่านั้น", 403);

      const { data, error } = await db
        .from("allowed_emails")
        .select("id, email, label, added_by, added_at")
        .order("added_at", { ascending: false });
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true, emails: data || [] });
    }

    case "addAdminEmail": {
      const auth = await requireAuth(db, p, ["mc", "toomtam"]);
      if (!auth.ok || !auth.isSystemOwner) return errResponse("เฉพาะเจ้าของระบบเท่านั้น", 403);

      const email = String(p.email || "").trim().toLowerCase();
      const label = String(p.label || "").trim() || null;
      if (!email || !email.includes("@")) return errResponse("อีเมลไม่ถูกต้อง");

      const { error } = await db.from("allowed_emails").insert({
        email,
        label,
        added_by: auth.role || "unknown",
        added_at: new Date().toISOString(),
      });
      if (error) {
        if (error.code === "23505") return errResponse("อีเมลนี้มีอยู่แล้ว");
        return errResponse(error.message);
      }
      return jsonResponse({ ok: true });
    }

    case "removeAdminEmail": {
      const auth = await requireAuth(db, p, ["mc", "toomtam"]);
      if (!auth.ok || !auth.isSystemOwner) return errResponse("เฉพาะเจ้าของระบบเท่านั้น", 403);

      const email = String(p.email || "").trim().toLowerCase();
      if (!email) return errResponse("email required");

      const { error } = await db.from("allowed_emails").delete().eq(
        "email",
        email,
      );
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    // ── Unified BNI Connect Report Import Center (MC only) ──────
    case "previewBniReportImport": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);
      const fileName = String(p.fileName || "BNI-report.pdf").replace(
        /[\\/]/g,
        "_",
      ).trim().slice(0, 255);
      const requestedType = String(p.reportType || "auto");
      try {
        const chapterId = await activeChapterId(db);
        const fingerprint = await bniPdfFingerprint(p.pdfBase64);
        if (fingerprint.size > 10 * 1024 * 1024) {
          return errResponse("ไฟล์ PDF ต้องไม่เกิน 10 MB");
        }

        let reportType = "";
        let preview: Record<string, unknown>;
        let csv = "";
        const parserErrors: string[] = [];
        if (requestedType === "auto" || requestedType === "chapter_roster") {
          try {
            const report = await parseRosterPdf(p.pdfBase64);
            preview = await buildRosterPreview(db, report) as Record<
              string,
              unknown
            >;
            reportType = "chapter_roster";
            csv = rosterPreviewCsv(
              (preview.rows || []) as Array<Record<string, unknown>>,
            );
          } catch (error) {
            parserErrors.push(`Roster: ${(error as Error).message}`);
          }
        }
        if (
          !reportType &&
          (requestedType === "auto" || requestedType === "summary_palms")
        ) {
          try {
            const report = await parsePalmsSummaryPdf(p.pdfBase64);
            preview = await buildPalmsSummaryPreview(db, report) as Record<
              string,
              unknown
            >;
            reportType = "summary_palms";
            csv = palmsPreviewCsv(
              (preview.rows || []) as Array<Record<string, unknown>>,
            );
          } catch (error) {
            parserErrors.push(`PALMS: ${(error as Error).message}`);
          }
        }
        if (!reportType && requestedType === "auto") {
          try {
            const report = await parseStructuredPdf(p.pdfBase64);
            if (report?.rows.length) {
              preview = await buildStructuredPreview(db, report) as Record<
                string,
                unknown
              >;
              reportType = report.reportType;
              csv = structuredPreviewCsv(
                (preview.rows || []) as Array<Record<string, unknown>>,
              );
            }
          } catch (error) {
            parserErrors.push(`Structured: ${(error as Error).message}`);
          }
        }
        if (!reportType || !preview!) {
          const raw = await rawPdfCsvPreview(p.pdfBase64);
          reportType = "raw_text";
          preview = {
            ok: true,
            rows: raw.rows,
            totalRows: raw.totalRows,
            matched: 0,
            unmatched: 0,
            historicalOnly: true,
            parserWarnings: parserErrors,
          };
          csv = raw.csv;
        }

        const { data: existing } = await db.from("bni_report_import_batches")
          .select("*")
          .eq("chapter_id", chapterId).eq("report_type", reportType).eq(
            "file_sha256",
            fingerprint.hash,
          ).maybeSingle();
        const warningCount =
          ((preview.rows || []) as Array<Record<string, unknown>>)
            .filter((row) =>
              Array.isArray(row.importWarnings) && row.importWarnings.length
            ).length;
        let batch = existing as Record<string, unknown> | null;
        if (!batch) {
          const { data, error } = await db.from("bni_report_import_batches")
            .insert({
              chapter_id: chapterId,
              report_type: reportType,
              original_file_name: fileName || "BNI-report.pdf",
              file_sha256: fingerprint.hash,
              file_size_bytes: fingerprint.size,
              parser_version: BNI_REPORT_PARSER_VERSION,
              status: "previewed",
              report_run_at: preview.runAt || null,
              period_from: preview.periodFrom || null,
              period_to: preview.periodTo || null,
              total_rows: Number(preview.totalRows) || 0,
              matched_rows: Number(preview.matched) || 0,
              unmatched_rows: Number(preview.unmatched) || 0,
              warning_count: warningCount,
              historical_only: Boolean(preview.historicalOnly),
              created_by: String(
                auth.displayName || auth.role || "Chapter Admin",
              ),
            }).select("*").single();
          if (error) throw new Error(error.message);
          batch = data as Record<string, unknown>;
        }
        return jsonResponse({
          ...preview,
          reportType,
          reportLabel: reportType === "chapter_roster"
            ? "Chapter Roster"
            : reportType === "summary_palms"
            ? "Summary PALMS"
            : STRUCTURED_REPORT_LABELS[reportType] || "PDF Text → CSV",
          canImport: reportType !== "raw_text",
          batchId: batch.id,
          duplicate: Boolean(existing),
          alreadyImported: batch.status === "imported",
          fileName,
          fileSizeBytes: fingerprint.size,
          parserVersion: BNI_REPORT_PARSER_VERSION,
          csv,
        });
      } catch (error) {
        return errResponse((error as Error).message || "ตรวจรายงานไม่สำเร็จ");
      }
    }

    case "syncBniReportImport": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);
      if (!Boolean(p.confirmed)) {
        return errResponse("ต้อง Preview และยืนยันก่อนนำเข้าข้อมูล");
      }
      const batchId = String(p.batchId || "");
      if (!batchId) return errResponse("ไม่พบ Import batch");
      try {
        const chapterId = await activeChapterId(db);
        const fingerprint = await bniPdfFingerprint(p.pdfBase64);
        const { data: batch, error: batchError } = await db.from(
          "bni_report_import_batches",
        ).select("*")
          .eq("id", batchId).eq("chapter_id", chapterId).maybeSingle();
        if (batchError) throw new Error(batchError.message);
        if (!batch) return errResponse("ไม่พบ Import batch ของ Chapter นี้", 404);
        if (String(batch.file_sha256) !== fingerprint.hash) {
          return errResponse("ไฟล์ไม่ตรงกับ Preview กรุณา Preview ใหม่");
        }
        if (batch.status === "imported") {
          return jsonResponse({
            ok: true,
            duplicate: true,
            alreadyImported: true,
            batchId,
            result: batch.result_summary || {},
          });
        }
        const reportType = String(batch.report_type);
        if (reportType === "raw_text") {
          return errResponse(
            "ไฟล์นี้แปลงเป็น CSV สำหรับตรวจสอบได้ แต่ยังไม่มี Structured Adapter สำหรับนำเข้าฐานข้อมูล",
          );
        }
        let result: Record<string, unknown>;
        let resultStatus = 200;
        if (reportType === "chapter_roster" || reportType === "summary_palms") {
          const childAction = reportType === "chapter_roster"
            ? "syncRosterImport"
            : "syncPalmsSummaryImport";
          const childResponse = await handleMembers({
            ...p,
            action: childAction,
          });
          result = await childResponse.json() as Record<string, unknown>;
          resultStatus = childResponse.status;
        } else {
          const report = await parseStructuredPdf(p.pdfBase64);
          if (!report || report.reportType !== reportType) {
            return errResponse("ชนิดรายงานไม่ตรงกับ Preview กรุณา Preview ใหม่");
          }
          result = await syncStructuredReport(db, chapterId, batchId, report);
        }
        if (!result.ok) {
          await db.from("bni_report_import_batches").update({
            status: "failed",
            error_summary: String(result.error || "Import failed").slice(
              0,
              1000,
            ),
          }).eq("id", batchId);
          return jsonResponse(result, resultStatus);
        }
        const now = new Date().toISOString();
        await db.from("bni_report_import_batches").update({
          status: "imported",
          imported_at: now,
          result_summary: result,
          error_summary: null,
        }).eq("id", batchId);
        await db.from("chapter_audit_events").insert({
          event_type: "bni_report_imported",
          actor_role: String(auth.role || "mc"),
          actor_ref: String(auth.displayName || auth.role || "Chapter Admin"),
          subject_type: "bni_report_import",
          subject_ref: batchId,
          metadata: {
            report_type: reportType,
            total_rows: result.totalRows || 0,
            matched: result.matched || 0,
            historical_only: Boolean(result.historicalOnly),
            parser_version: BNI_REPORT_PARSER_VERSION,
          },
        });
        return jsonResponse({ ...result, batchId, duplicate: false });
      } catch (error) {
        return errResponse((error as Error).message || "นำเข้ารายงานไม่สำเร็จ");
      }
    }

    case "getBniReportImportHistory": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);
      try {
        const chapterId = await activeChapterId(db);
        const { data, error } = await db.from("bni_report_import_batches")
          .select(
            "id,report_type,original_file_name,file_size_bytes,parser_version,status,report_run_at,period_from,period_to,total_rows,matched_rows,unmatched_rows,warning_count,historical_only,created_by,created_at,imported_at",
          )
          .eq("chapter_id", chapterId).order("created_at", { ascending: false })
          .limit(50);
        if (error) throw new Error(error.message);
        return jsonResponse({ ok: true, rows: data || [] });
      } catch (error) {
        return errResponse(
          (error as Error).message || "โหลดประวัติ Import ไม่สำเร็จ",
        );
      }
    }

    // ── BNI Connect Chapter Roster PDF preview/sync (legacy UI) ─
    case "previewRosterImport": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);

      try {
        const report = await parseRosterPdf(p.pdfBase64);
        const preview = await buildRosterPreview(db, report);
        return jsonResponse(preview);
      } catch (e) {
        return errResponse(
          (e as Error).message || "อ่าน Chapter Roster ไม่สำเร็จ",
        );
      }
    }

    case "syncRosterImport": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);

      let report: ParsedRosterReport;
      try {
        report = await parseRosterPdf(p.pdfBase64);
      } catch (e) {
        return errResponse(
          (e as Error).message || "อ่าน Chapter Roster ไม่สำเร็จ",
        );
      }

      const preview = await buildRosterPreview(db, report) as Record<
        string,
        unknown
      >;
      const rows = (preview.rows || []) as Array<Record<string, unknown>>;
      const matchedRows = rows.filter((r) => r.matched && r.memberId);
      const reportRunAt = report.runAt || new Date().toISOString();
      const now = new Date().toISOString();

      let updatedProfiles = 0;
      let insertedSnapshots = 0;
      const errors: string[] = [];

      for (const row of matchedRows) {
        const memberId = String(row.memberId);
        const phone = textValue(row.phone) || null;
        const profession = safeRosterImportText(row.profession);
        const companyName = safeRosterImportText(row.companyName);
        const updates: Record<string, unknown> = { roster_synced_at: now };
        if (phone) updates.phone = phone;
        if (profession) updates.profession = profession;
        if (companyName) updates.company_name = companyName;

        const { error: updateErr } = await db.from("members").update(updates)
          .eq("id", memberId);
        if (updateErr) {
          errors.push(`${row.rawName}: ${updateErr.message}`);
        } else {
          updatedProfiles++;
        }

        const { error: snapErr } = await db.from("bni_roster_snapshots").upsert(
          {
            member_id: memberId,
            report_run_at: reportRunAt,
            report_chapter: report.chapter,
            raw_name: textValue(row.rawName),
            profession,
            company_name: companyName,
            phone,
            referrals_given_90d: Number(row.referralsGiven90d) || 0,
            referrals_received_90d: Number(row.referralsReceived90d) || 0,
            visitors_90d: Number(row.visitors90d) || 0,
            one_to_one_90d: Number(row.oneToOne90d) || 0,
            late_90d: Number(row.late90d) || 0,
            absent_90d: Number(row.absent90d) || 0,
            raw: row,
            imported_at: now,
          },
          { onConflict: "member_id,report_run_at" },
        );
        if (snapErr) errors.push(`${row.rawName} snapshot: ${snapErr.message}`);
        else insertedSnapshots++;
      }

      return jsonResponse({
        ok: true,
        runAt: reportRunAt,
        chapter: report.chapter,
        totalRows: rows.length,
        matched: matchedRows.length,
        unmatched: rows.length - matchedRows.length,
        updatedProfiles,
        insertedSnapshots,
        errors,
      });
    }

    case "previewPalmsSummaryImport": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);

      try {
        const report = await parsePalmsSummaryPdf(p.pdfBase64);
        const preview = await buildPalmsSummaryPreview(db, report);
        return jsonResponse(preview);
      } catch (e) {
        return errResponse((e as Error).message || "อ่าน Summary PALMS ไม่สำเร็จ");
      }
    }

    case "syncPalmsSummaryImport": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);

      let report: ParsedPalmsSummaryReport;
      try {
        report = await parsePalmsSummaryPdf(p.pdfBase64);
      } catch (e) {
        return errResponse((e as Error).message || "อ่าน Summary PALMS ไม่สำเร็จ");
      }
      if (!report.periodFrom || !report.periodTo) {
        return errResponse("periodFrom/periodTo missing");
      }

      const preview = await buildPalmsSummaryPreview(db, report) as Record<
        string,
        unknown
      >;
      const rows = (preview.rows || []) as Array<Record<string, unknown>>;
      const matchedRows = rows.filter((r) => r.matched && r.memberId);
      const updateOperationalStats = shouldUpdateCurrentPalms(
        report.periodFrom,
        report.periodTo,
      );
      const memberIds = updateOperationalStats
        ? matchedRows.map((r) => String(r.memberId))
        : [];
      const { data: existingStats } = memberIds.length
        ? await db.from("r2y_stats").select("member_id, bni_days").in(
          "member_id",
          memberIds,
        )
        : { data: [] };
      const bniDaysMap: Record<string, number> = {};
      for (const s of (existingStats || []) as Record<string, unknown>[]) {
        bniDaysMap[String(s.member_id)] = Number(s.bni_days) || 0;
      }
      // Members NOT in bniDaysMap have no prior r2y_stats row — don't write bni_days:0 for them

      const now = new Date().toISOString();
      const errors: string[] = [];
      let insertedSnapshots = 0;
      let updatedR2Y = 0;

      for (const row of matchedRows) {
        const memberId = String(row.memberId);
        const raw = row;
        const { error: snapErr } = await db.from("bni_palms_summary_snapshots")
          .upsert({
            member_id: memberId,
            period_from: report.periodFrom,
            period_to: report.periodTo,
            report_run_at: report.runAt,
            report_chapter: report.chapter,
            raw_name: textValue(row.rawName),
            present: Number(row.present) || 0,
            absent: Number(row.absent) || 0,
            late: Number(row.late) || 0,
            medical: Number(row.medical) || 0,
            substitute: Number(row.substitute) || 0,
            rgi: Number(row.rgi) || 0,
            rgo: Number(row.rgo) || 0,
            rri: Number(row.rri) || 0,
            rro: Number(row.rro) || 0,
            visitors: Number(row.visitors) || 0,
            one_to_one: Number(row.oneToOne) || 0,
            revenue_given_thb: Number(row.revenueGivenThb) || 0,
            ceu: Number(row.ceu) || 0,
            revenue_received_thb: Number(row.revenueReceivedThb) || 0,
            calculated_score: Number(row.calculatedScore) || 0,
            calculated_color: textValue(row.calculatedColor) || "black",
            palms_detail: row.palmsDetail || {},
            raw,
            imported_at: now,
          }, { onConflict: "member_id,period_from,period_to" });
        if (snapErr) errors.push(`${row.rawName} snapshot: ${snapErr.message}`);
        else insertedSnapshots++;

        if (updateOperationalStats) {
          const r2yUpsertRow: Record<string, unknown> = {
            member_id: memberId,
            rg: (Number(row.rgi) || 0) + (Number(row.rgo) || 0),
            rr: (Number(row.rri) || 0) + (Number(row.rro) || 0),
            visitors: Number(row.visitors) || 0,
            one_to_one: Number(row.oneToOne) || 0,
            ceu: Number(row.ceu) || 0,
            tyfcb_thb: Number(row.revenueGivenThb) || 0,
            official_pts: Number(row.calculatedScore) || 0,
            attend: Number(row.present) || 0,
            absent: Number(row.absent) || 0,
            late: Number(row.late) || 0,
            medical: Number(row.medical) || 0,
            sub: Number(row.substitute) || 0,
            synced_at: now,
          };
          // Only include bni_days if member has an existing r2y_stats row — prevents overwriting
          // valid bni_days (set from R2Y CSV) with 0 on first PALMS import for new members
          if (memberId in bniDaysMap) {
            r2yUpsertRow.bni_days = bniDaysMap[memberId];
          }
          const { error: r2yErr } = await db.from("r2y_stats").upsert(
            r2yUpsertRow,
            { onConflict: "member_id", ignoreDuplicates: false },
          );
          if (r2yErr) errors.push(`${row.rawName} r2y: ${r2yErr.message}`);
          else updatedR2Y++;
        }
      }

      return jsonResponse({
        ok: true,
        runAt: report.runAt,
        chapter: report.chapter,
        periodFrom: report.periodFrom,
        periodTo: report.periodTo,
        totalRows: rows.length,
        matched: matchedRows.length,
        unmatched: rows.length - matchedRows.length,
        insertedSnapshots,
        updatedR2Y,
        historicalOnly: !updateOperationalStats,
        periodDays: palmsPeriodDays(report.periodFrom, report.periodTo),
        errors,
      });
    }

    // ── Training Event management (MC only) ──────────────────────
    case "saveTrainingEvent": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);
      const event = p.event as Record<string, unknown>;
      if (!event?.date || !event?.title) {
        return errResponse("date และ title จำเป็นต้องมี");
      }

      const { data: cur } = await db.from("settings")
        .select("value").eq("key", "TRAINING_CUSTOM_EVENTS").maybeSingle();
      let events: unknown[] = [];
      try {
        events = JSON.parse(
          (cur as Record<string, unknown> | null)?.value as string || "[]",
        );
      } catch {
        events = [];
      }
      if (!Array.isArray(events)) events = [];

      const idx = (events as Record<string, unknown>[]).findIndex((e) =>
        e._id === event._id
      );
      const toSave = { ...event, _id: event._id || crypto.randomUUID() };
      if (idx >= 0) events[idx] = toSave;
      else events.push(toSave);

      const { error } = await db.from("settings").upsert(
        { key: "TRAINING_CUSTOM_EVENTS", value: JSON.stringify(events) },
        { onConflict: "key" },
      );
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true, event: toSave });
    }

    case "deleteTrainingEvent": {
      const auth = await requireAuth(db, p, ["mc"]);
      if (!auth.ok) return errResponse(auth.error!);
      const id = String(p.id || "");
      if (!id) return errResponse("id required");

      const { data: cur } = await db.from("settings")
        .select("value").eq("key", "TRAINING_CUSTOM_EVENTS").maybeSingle();
      let events: unknown[] = [];
      try {
        events = JSON.parse(
          (cur as Record<string, unknown> | null)?.value as string || "[]",
        );
      } catch {
        events = [];
      }
      if (!Array.isArray(events)) events = [];

      const filtered = (events as Record<string, unknown>[]).filter((e) =>
        e._id !== id
      );
      const { error } = await db.from("settings").upsert(
        { key: "TRAINING_CUSTOM_EVENTS", value: JSON.stringify(filtered) },
        { onConflict: "key" },
      );
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    default:
      return errResponse(`Unknown members action: ${action}`);
  }
}

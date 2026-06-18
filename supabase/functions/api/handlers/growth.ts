// Handler: growth — getRiskMembers, getWeeklyActions, getGrowthData, etc.
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';
import { getMentorActivityData } from './dashboard.ts';

const TEAM_ROLE: Record<string, string> = {
  toomtam: 'TOOMTAM', aof: 'Aof', draft: 'Draft', phai: 'PHAI', amp: 'AMP',
};

function normalizeName(value: unknown): string {
  return String(value || '')
    .replace(/\s*\(bni ideal\)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseNumber(value: unknown): number {
  const text = String(value || '').replace(/[\s,฿$]/g, '');
  const num = parseFloat(text);
  return Number.isFinite(num) ? num : 0;
}

function parseCsvString(csvString: string | null | undefined): string[][] {
  if (!csvString) return [];
  const rows: string[][] = [];
  const lines = csvString.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const row: string[] = [];
    let inQuotes = false;
    let cell = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        row.push(cell.trim());
        cell = '';
      } else {
        cell += ch;
      }
    }
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

function findHeaderRow(rows: string[][], predicate: (row: string[]) => boolean): { row: string[]; idx: number } | null {
  const limit = Math.min(rows.length, 10);
  for (let i = 0; i < limit; i++) {
    if (predicate(rows[i])) return { row: rows[i], idx: i };
  }
  return null;
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map(h => String(h || '').toLowerCase().trim());
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate);
    if (idx >= 0) return idx;
  }
  for (const candidate of candidates) {
    if (candidate.length < 3) continue;
    const idx = normalized.findIndex(h => h.includes(candidate));
    if (idx >= 0) return idx;
  }
  return -1;
}

function latestScorePeriod(
  rows: Array<{ year: number; month: number }>,
  fallbackDate = new Date(),
): { year: number; month: number } {
  let bestKey = 0;
  let best = { year: fallbackDate.getFullYear(), month: fallbackDate.getMonth() + 1 };
  for (const row of rows) {
    const key = row.year * 100 + row.month;
    if (key > bestKey) {
      bestKey = key;
      best = { year: row.year, month: row.month };
    }
  }
  return best;
}

async function getExistingLatestScorePeriod(
  db: ReturnType<typeof getServiceClient>,
): Promise<{ year: number; month: number }> {
  const fallback = new Date();
  const { data } = await db
    .from('monthly_scores')
    .select('year, month')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1);
  const latest = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
  const year = Number(latest?.year);
  const month = Number(latest?.month);
  if (year >= 2020 && month >= 1 && month <= 12) return { year, month };
  return { year: fallback.getFullYear(), month: fallback.getMonth() + 1 };
}

function findNameColumnIndex(headers: string[], rows: string[][], startIdx: number, memberMap: Record<string, string>): number {
  const idx = findColumnIndex(headers, [
    'name -surname', 'name - surname', 'name-surname', 'name surname',
    'name', 'member name', 'member', 'ชื่อ - นามสกุล', 'ชื่อ-นามสกุล', 'ชื่อสมาชิก', 'ชื่อ',
  ]);
  if (idx >= 0) return idx;

  const maxCols = Math.min(headers.length || 12, 12);
  let bestIdx = -1;
  let bestMatches = 0;
  const end = Math.min(rows.length, startIdx + 40);
  for (let ci = 0; ci < maxCols; ci++) {
    let matches = 0;
    for (let ri = startIdx; ri < end; ri++) {
      const name = normalizeName(rows[ri]?.[ci]);
      if (name && memberMap[name]) matches++;
    }
    if (matches > bestMatches) {
      bestMatches = matches;
      bestIdx = ci;
    }
  }
  return bestMatches > 0 ? bestIdx : -1;
}

function findMonthlyColumns(headers: string[]): Array<{ idx: number; year: number; month: number }> {
  const result: Array<{ idx: number; year: number; month: number }> = [];
  const normalize = (h: string) => String(h || '').toLowerCase().trim();
  const monthNames: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };
  const currentYear = new Date().getFullYear();

  for (let i = 0; i < headers.length; i++) {
    const raw = normalize(headers[i]);
    const mmyy = raw.match(/^(\d{1,2})\/(\d{2,4})$/);
    if (mmyy) {
      const month = Number(mmyy[1]);
      let year = Number(mmyy[2]);
      if (year < 100) year += 2000;
      if (month >= 1 && month <= 12 && year >= 2020 && year <= 2100) {
        result.push({ idx: i, year, month });
        continue;
      }
    }
    if (monthNames[raw]) {
      result.push({ idx: i, year: currentYear, month: monthNames[raw] });
      continue;
    }
    const monthYear = raw.match(/^(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)[\s\-_/]+(\d{2,4})$/);
    if (monthYear) {
      let year = Number(monthYear[2]);
      if (year < 100) year += 2000;
      result.push({ idx: i, year, month: monthNames[monthYear[1]] });
    }
  }

  return result;
}

function parseMonthlyScores(rows: string[][], memberMap: Record<string, string>): Array<{ member_id: string; year: number; month: number; score: number; source: string }> {
  if (!rows || rows.length === 0) return [];
  const headerInfo = findHeaderRow(rows, row => {
    const normalized = row.map(c => String(c || '').toLowerCase().trim());
    return findMonthlyColumns(normalized).length > 0;
  });
  if (!headerInfo) return [];

  const headers = headerInfo.row.map(c => String(c || '').toLowerCase().trim());
  const nameIdx = findNameColumnIndex(headers, rows, headerInfo.idx + 1, memberMap);
  const monthCols = findMonthlyColumns(headers);
  if (nameIdx < 0 || monthCols.length === 0) return [];

  const scores: Array<{ member_id: string; year: number; month: number; score: number; source: string }> = [];
  for (let ri = headerInfo.idx + 1; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row || row.length <= nameIdx) continue;
    const rawName = normalizeName(row[nameIdx]);
    if (!rawName) continue;
    const memberId = memberMap[rawName];
    if (!memberId) continue;

    for (const col of monthCols) {
      if (row.length <= col.idx) continue;
      const score = parseNumber(row[col.idx]);
      if (score > 0) {
        scores.push({ member_id: memberId, year: col.year, month: col.month, score, source: 'traffic_light_csv' });
      }
    }
  }
  return scores;
}

function parseMemberTLCurrentScores(
  rows: string[][],
  memberMap: Record<string, string>,
  year: number,
  month: number,
): Array<{ member_id: string; year: number; month: number; score: number; source: string }> {
  const data = parseMemberTLStats(rows);
  const scores: Array<{ member_id: string; year: number; month: number; score: number; source: string }> = [];
  for (const [name, item] of Object.entries(data)) {
    const memberId = memberMap[name];
    if (!memberId || !item.score) continue;
    scores.push({ member_id: memberId, year, month, score: item.score, source: 'traffic_light_csv' });
  }
  return scores;
}

function parseMemberTrafficLightData(rows: string[][]): Record<string, {
  given: number; received: number; rg: number; rr: number; visitors: number; one_to_one: number;
  ceu: number; score: number; p: number; a: number; l: number; m: number; s: number;
}> {
  const normalizedRows = rows.map(r => r.map(c => String(c || '').toLowerCase().trim()));
  const headerInfo = findHeaderRow(normalizedRows, row => row.some(c => c === 'total score') && row.some(c => c === 'traffic light'));
  if (!headerInfo) return {};

  const headers = normalizedRows[headerInfo.idx];
  const nameIdx = findColumnIndex(headers, [
    'name -surname', 'name - surname', 'name-surname', 'name surname',
    'name', 'member name', 'member', 'ชื่อ - นามสกุล', 'ชื่อ-นามสกุล', 'ชื่อสมาชิก', 'ชื่อ',
  ]);
  const givenIdx = findColumnIndex(headers, ['value of business given (baht)', 'value of business given', 'given (baht)', 'given', 'tyfcb given', 'business given']);
  const recvIdx = findColumnIndex(headers, ['value of business received (baht)', 'value of business received', 'received (baht)', 'received', 'tyfcb received', 'business received']);
  const rgIdx = findColumnIndex(headers, ['referral', 'rg', 'referrals given']);
  const rrIdx = findColumnIndex(headers, ['rr', 'received referrals', 'rri', 'rro']);
  const rriIdx = findColumnIndex(headers, ['rri']);
  const rroIdx = findColumnIndex(headers, ['rro']);
  const visitorsIdx = findColumnIndex(headers, ['v', 'visi', 'visitor', 'visitors']);
  const otoIdx = findColumnIndex(headers, ['121', 'one to one', 'one-to-one', 'one_to_one']);
  const ceuIdx = findColumnIndex(headers, ['training', 'ceu']);
  const scoreIdx = findColumnIndex(headers, ['total score', 'score', 'points']);
  const pIdx = findColumnIndex(headers, ['p']);
  const aIdx = findColumnIndex(headers, ['a']);
  const lIdx = findColumnIndex(headers, ['l']);
  const mIdx = findColumnIndex(headers, ['m']);
  const sIdx = findColumnIndex(headers, ['s']);

  if (nameIdx < 0 || givenIdx < 0 || recvIdx < 0) return {};

  const map: Record<string, any> = {};
  for (let ri = headerInfo.idx + 1; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row || row.length <= Math.max(nameIdx, givenIdx, recvIdx)) continue;
    const no = String(row[0] || '').trim();
    if (!no || isNaN(parseInt(no, 10))) continue;
    const rawName = normalizeName(row[nameIdx]);
    if (!rawName) continue;

    const rg = parseNumber(row[rgIdx]);
    const rr = parseNumber(row[rrIdx]);
    const rri = parseNumber(row[rriIdx]);
    const rro = parseNumber(row[rroIdx]);
    const visitors = parseNumber(row[visitorsIdx]);
    const one_to_one = parseNumber(row[otoIdx]);
    const ceu = parseNumber(row[ceuIdx]);
    const score = parseNumber(row[scoreIdx]);
    const p = parseNumber(row[pIdx]);
    const a = parseNumber(row[aIdx]);
    const l = parseNumber(row[lIdx]);
    const m = parseNumber(row[mIdx]);
    const s = parseNumber(row[sIdx]);
    const given = parseNumber(row[givenIdx]);
    const received = parseNumber(row[recvIdx]);

    map[rawName] = {
      given, received, rg, rr: rr || rri + rro, visitors, one_to_one,
      ceu, score, p, a, l, m, s,
    };
  }

  return map;
}

async function upsertMonthlyScores(db: ReturnType<typeof getServiceClient>, rows: Array<{ member_id: string; year: number; month: number; score: number; source: string }>): Promise<number> {
  if (!rows.length) return 0;
  const deduped = Array.from(
    new Map(rows.map(row => [`${row.member_id}|${row.year}|${row.month}`, row])).values(),
  );
  const BATCH = 100;
  let imported = 0;
  for (let i = 0; i < deduped.length; i += BATCH) {
    const batch = deduped.slice(i, i + BATCH);
    const { error } = await db.from('monthly_scores').upsert(batch, {
      onConflict: 'member_id,year,month',
      ignoreDuplicates: false,
    });
    if (error) throw new Error(error.message);
    imported += batch.length;
  }
  return imported;
}

async function upsertR2YStats(db: ReturnType<typeof getServiceClient>, rows: Array<Record<string, unknown>>): Promise<number> {
  if (!rows.length) return 0;
  const BATCH = 100;
  let imported = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH) as Record<string, unknown>[];
    const { error } = await db.from('r2y_stats').upsert(batch, {
      onConflict: 'member_id',
      ignoreDuplicates: false,
    });
    if (error) throw new Error(error.message);
    imported += batch.length;
  }
  return imported;
}

function parseR2YRows(
  rows: string[][],
  memberMap: Record<string, string>,
  unmatched?: string[],
): Array<Record<string, unknown>> {
  if (!rows || rows.length < 2) return [];
  const dataRows = rows.slice(1);
  const parsed: Array<Record<string, unknown>> = [];

  for (const row of dataRows) {
    const rawName = normalizeName(row[0]);
    if (!rawName) continue;
    const memberId = memberMap[rawName];
    if (!memberId) {
      // Track names that exist in R2Y but have no matching member in DB
      if (unmatched && rawName.length > 1) unmatched.push(row[0]?.trim() || rawName);
      continue;
    }

    parsed.push({
      member_id:  memberId,
      rg:         parseNumber(row[1]),
      rr:         parseNumber(row[2]),
      visitors:   parseNumber(row[3]),
      one_to_one: parseNumber(row[4]),
      ceu:        parseNumber(row[5]),
      tyfcb_thb:  parseNumber(row[6]),
      official_pts: parseNumber(row[7]),
      bni_days:   parseNumber(row[8]),
      attend:     parseNumber(row[9]),
      absent:     parseNumber(row[10]),
      late:       parseNumber(row[11]),
      medical:    parseNumber(row[12]),
      sub:        parseNumber(row[13]),
      synced_at:  new Date().toISOString(),
    });
  }

  return parsed;
}

function parseR2YContactInfo(rows: string[][], memberMap: Record<string, string>): Record<string, { email: string; phone: string }> {
  if (!rows || rows.length < 2) return {};
  const header = (rows[0] || []).map(h => String(h || '').toLowerCase().trim());
  let emailIdx = header.findIndex(h => h.includes('email'));
  let phoneIdx = header.findIndex(h => h.includes('phone') || h.includes('tel') || h.includes('mobile'));
  if (emailIdx < 0) emailIdx = 14;
  if (phoneIdx < 0) phoneIdx = 15;
  const result: Record<string, { email: string; phone: string }> = {};
  for (const row of rows.slice(1)) {
    const rawName = normalizeName(row[0]);
    if (!rawName || !memberMap[rawName]) continue;
    const email = String(row[emailIdx] || '').trim();
    const phone = String(row[phoneIdx] || '').trim();
    if (email || phone) result[rawName] = { email, phone };
  }
  return result;
}

async function updateMembersContactInfo(db: ReturnType<typeof getServiceClient>, contactMap: Record<string, { email: string; phone: string }>, memberMap: Record<string, string>): Promise<number> {
  let updated = 0;
  const ts = new Date().toISOString();
  for (const [name, info] of Object.entries(contactMap)) {
    const memberId = memberMap[name];
    if (!memberId) continue;
    const fields: Record<string, unknown> = { updated_at: ts };
    if (info.email) fields.email = info.email;
    if (info.phone) fields.phone = info.phone;
    const { error } = await db.from('members').update(fields).eq('id', memberId);
    if (!error) updated++;
  }
  return updated;
}

function ymd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function nextRenewalFromBniDays(bniDays: number, today = new Date()): string | null {
  if (!Number.isFinite(bniDays) || bniDays <= 0) return null;
  const base = new Date(today);
  base.setHours(12, 0, 0, 0);
  const joined = new Date(base);
  joined.setDate(base.getDate() - Math.floor(bniDays));

  const renewal = new Date(base);
  renewal.setMonth(joined.getMonth(), joined.getDate());
  renewal.setHours(12, 0, 0, 0);
  if (renewal.getTime() < base.getTime()) {
    renewal.setFullYear(renewal.getFullYear() + 1);
  }
  return ymd(renewal);
}

async function syncRenewalsFromR2YStats(db: ReturnType<typeof getServiceClient>): Promise<number> {
  const { data: stats, error: statsError } = await db
    .from('r2y_stats')
    .select('member_id, bni_days')
    .gt('bni_days', 0);
  if (statsError) throw new Error(statsError.message);
  if (!stats || !stats.length) return 0;

  const { data: members, error: memberError } = await db
    .from('members')
    .select('id')
    .eq('is_archived', false);
  if (memberError) throw new Error(memberError.message);

  const activeIds = new Set((members || []).map((m: Record<string, unknown>) => String(m.id)));
  const { data: existingRows, error: existingError } = await db
    .from('renewals')
    .select('member_id, expiry_date, workflow_status');
  if (existingError) throw new Error(existingError.message);
  const existingMap = new Map(
    (existingRows || []).map((row: Record<string, unknown>) => [String(row.member_id), row]),
  );
  const today = new Date();
  const rows = (stats as Record<string, unknown>[])
    .map((row) => {
      const memberId = String(row.member_id || '');
      if (!activeIds.has(memberId)) return null;
      const existing = existingMap.get(memberId);
      const calculatedExpiry = nextRenewalFromBniDays(Number(row.bni_days), today);
      if (!calculatedExpiry) return null;
      const existingExpiry = String(existing?.expiry_date || '');
      const existingStatus = String(existing?.workflow_status || 'pending_contact');
      // A completed renewal has already advanced one year. Do not let the next
      // R2Y sync pull it back to the anniversary in the previous cycle.
      const expiryDate = existingStatus === 'completed' && existingExpiry > calculatedExpiry
        ? existingExpiry
        : calculatedExpiry;
      const expiryChanged = !!existing && existingExpiry !== expiryDate;
      return {
        member_id: memberId,
        expiry_date: expiryDate,
        workflow_status: expiryChanged
          ? 'pending_contact'
          : existingStatus,
        ...(expiryChanged ? {
          contacted_at: null,
          contacted_by: null,
          decision_at: null,
          decision_by: null,
          payment_at: null,
          payment_by: null,
          completed_at: null,
          completed_by: null,
          decline_reason: null,
        } : {}),
        notes: 'Synced from Reporting2You BNI Days',
        updated_at: new Date().toISOString(),
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;

  if (!rows.length) return 0;
  const { error } = await db.from('renewals').upsert(rows, {
    onConflict: 'member_id',
    ignoreDuplicates: false,
  });
  if (error) throw new Error(error.message);
  return rows.length;
}

// Auto-enroll members whose bni_days < 56 (not yet 8 weeks) as is_new_member = true.
// Sets joined_date from bni_days if not already set.
async function autoEnrollNewMembers(db: ReturnType<typeof getServiceClient>): Promise<number> {
  // Find members with bni_days < 56 who are not yet enrolled and not archived
  const { data: rows } = await db
    .from('r2y_stats')
    .select('member_id, bni_days')
    .gt('bni_days', 0)
    .lt('bni_days', 56);
  if (!rows || !rows.length) return 0;

  const today = new Date();
  let enrolled = 0;
  for (const row of rows as Array<{ member_id: string; bni_days: number }>) {
    const joinedDate = new Date(today);
    joinedDate.setDate(today.getDate() - row.bni_days);
    const joinedDateStr = joinedDate.toISOString().split('T')[0];

    // Only update if not already a new member
    const { data: m } = await db
      .from('members')
      .select('id, is_new_member, is_archived, joined_date')
      .eq('id', row.member_id)
      .maybeSingle();
    if (!m || (m as Record<string, unknown>).is_archived) continue;
    if ((m as Record<string, unknown>).is_new_member) continue;

    const upd: Record<string, unknown> = {
      is_new_member: true,
      updated_at: new Date().toISOString(),
    };
    if (!(m as Record<string, unknown>).joined_date) {
      upd.joined_date = joinedDateStr;
    }
    const { error } = await db.from('members').update(upd).eq('id', row.member_id);
    if (!error) enrolled++;
  }
  return enrolled;
}

async function updateMembersGivenReceived(db: ReturnType<typeof getServiceClient>, data: Record<string, { given: number; received: number }>, memberMap: Record<string, string>): Promise<number> {
  const entries = Object.entries(data).filter(([name]) => memberMap[name]);
  if (!entries.length) return 0;
  const ts = new Date().toISOString();
  let updated = 0;
  // Use UPDATE (not upsert) to avoid NOT NULL constraint on members.name during INSERT phase
  for (const [name, item] of entries) {
    const { error } = await db.from('members')
      .update({ given_thb: item.given, received_thb: item.received, updated_at: ts })
      .eq('id', memberMap[name]);
    if (error) throw new Error(error.message);
    updated++;
  }
  return updated;
}

function parseMemberTLStats(rows: string[][]): Record<string, {
  given: number; received: number; rg: number; rr: number; visitors: number; one_to_one: number;
  ceu: number; score: number; p: number; a: number; l: number; m: number; s: number;
}> {
  if (!rows || rows.length === 0) return {};
  const normalizedRows = rows.map(row => row.map(cell => String(cell || '').toLowerCase().trim()));
  const headerInfo = findHeaderRow(normalizedRows, row => row.some(cell => cell === 'total score') && row.some(cell => cell === 'traffic light'));
  if (!headerInfo) return {};

  const headers = headerInfo.row;
  const nameIdx = findColumnIndex(headers, [
    'name -surname', 'name - surname', 'name-surname', 'name surname',
    'name', 'member name', 'member', 'ชื่อ - นามสกุล', 'ชื่อ-นามสกุล', 'ชื่อสมาชิก', 'ชื่อ',
  ]);
  const givenIdx = findColumnIndex(headers, ['value of business given (baht)', 'value of business given', 'given (baht)', 'given', 'tyfcb given', 'business given']);
  const recvIdx = findColumnIndex(headers, ['value of business received (baht)', 'value of business received', 'received (baht)', 'received', 'tyfcb received', 'business received']);
  if (nameIdx < 0 || givenIdx < 0 || recvIdx < 0) return {};

  const rgIdx = findColumnIndex(headers, ['referral', 'rg', 'referrals given']);
  const rrIdx = findColumnIndex(headers, ['rr', 'received referrals']);
  const rriIdx = findColumnIndex(headers, ['rri']);
  const rroIdx = findColumnIndex(headers, ['rro']);
  const visitorsIdx = findColumnIndex(headers, ['v', 'visi', 'visitor', 'visitors']);
  const otoIdx = findColumnIndex(headers, ['121', 'one to one', 'one-to-one', 'one_to_one']);
  const ceuIdx = findColumnIndex(headers, ['training', 'ceu']);
  const scoreIdx = findColumnIndex(headers, ['total score', 'score', 'points']);
  const pIdx = findColumnIndex(headers, ['p']);
  const aIdx = findColumnIndex(headers, ['a']);
  const lIdx = findColumnIndex(headers, ['l']);
  const mIdx = findColumnIndex(headers, ['m']);
  const sIdx = findColumnIndex(headers, ['s']);

  const map: Record<string, any> = {};
  for (let ri = headerInfo.idx + 1; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row || row.length <= Math.max(nameIdx, givenIdx, recvIdx)) continue;
    const no = String(row[0] || '').trim();
    if (!no || isNaN(parseInt(no, 10))) continue;

    const rawName = normalizeName(row[nameIdx]);
    if (!rawName) continue;

    const rg = parseNumber(row[rgIdx]);
    const rr = parseNumber(row[rrIdx]);
    const rri = parseNumber(row[rriIdx]);
    const rro = parseNumber(row[rroIdx]);
    map[rawName] = {
      given: parseNumber(row[givenIdx]),
      received: parseNumber(row[recvIdx]),
      rg,
      rr: rr || rri + rro,
      visitors: parseNumber(row[visitorsIdx]),
      one_to_one: parseNumber(row[otoIdx]),
      ceu: parseNumber(row[ceuIdx]),
      score: parseNumber(row[scoreIdx]),
      p: parseNumber(row[pIdx]),
      a: parseNumber(row[aIdx]),
      l: parseNumber(row[lIdx]),
      m: parseNumber(row[mIdx]),
      s: parseNumber(row[sIdx]),
    };
  }
  return map;
}

export async function handleGrowth(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    // ── Risk Monitor: คะแนนลดต่อเนื่อง ──────────────────────
    case 'getRiskMembers': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);
      const { data: members } = await db
        .from('v_member_dashboard')
        .select('id, name, nickname, mentor_team, display_score, traffic_light')
        .eq('is_archived', false)
        .not('mentor_team', 'is', null);

      const memberIds = (members || []).map((m: Record<string, unknown>) => String(m.id));
      const { data: allScores } = await db
        .from('monthly_scores')
        .select('member_id, score, year, month')
        .in('member_id', memberIds)
        .order('year', { ascending: false })
        .order('month', { ascending: false });

      const scoreMap: Record<string, number[]> = {};
      for (const s of (allScores || []) as Record<string, unknown>[]) {
        const mid = String(s.member_id);
        if (!scoreMap[mid]) scoreMap[mid] = [];
        scoreMap[mid].push(Number(s.score));
      }

      const memberById: Record<string, Record<string, unknown>> = {};
      for (const m of (members || []) as Record<string, unknown>[]) {
        memberById[String(m.id)] = m;
      }

      const risks: Record<string, unknown>[] = [];
      for (const [mid, scores] of Object.entries(scoreMap)) {
        if (scores.length < 3) continue;
        let streak = 0;
        // scores[0] = latest (DESC order), check if each is lower than previous
        for (let k = 0; k < scores.length - 1; k++) {
          if (scores[k] < scores[k + 1]) streak++;
          else break;
        }
        if (streak < 2) continue;

        const m = memberById[mid];
        if (!m) continue;
        const latest       = scores[0];
        const peak         = scores[streak]; // highest monthly score before streak
        const displayScore = Number(m.display_score) || latest;
        risks.push({
          name: m.name, nick: m.nickname, team: m.mentor_team,
          score: displayScore, tl: String(m.traffic_light || 'none'),
          streak: streak + 1, decline: Math.round(peak - latest),
          recentScores: scores.slice(0, 5).reverse(),
        });
      }

      risks.sort((a, b) => {
        const as_ = Number(a.streak), bs = Number(b.streak);
        if (bs !== as_) return bs - as_;
        return Number(a.score) - Number(b.score);
      });

      return jsonResponse({ ok: true, risks });
    }

    // ── Weekly Action List (Mentor) ───────────────────────────
    case 'getWeeklyActions': {
      const auth = await requireAuth(db, p, ['toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);
      const role = String(auth.role || p.role || '').toLowerCase();
      const teamName = TEAM_ROLE[role];
      if (!teamName) return errResponse('ไม่ใช่ Mentor role');

      const { data: members, error } = await db
        .from('v_member_dashboard')
        .select('id, name, nickname, display_score, traffic_light, absent, open_core_issue, rg, visitors, one_to_one, ceu, tyfcb_thb, bni_days')
        .eq('mentor_team', teamName).eq('is_archived', false);
      if (error) return errResponse(error.message);

      const actions = (members || []).map((m: Record<string, unknown>) => {
        const score  = Number(m.display_score) || 0;
        const tl     = String(m.traffic_light || 'none');
        const absent = Number(m.absent) || 0;
        const hasOpenCase = !!m.open_core_issue;

        const priorities: { type: string; title: string; action: string; target: string }[] = [];
        if (hasOpenCase) priorities.push({ type: 'warning', title: '📋 มี Core Issue ค้าง', action: 'อัปเดตความคืบหน้าให้ MC', target: 'Update ให้ MC ทราบ' });
        if (absent >= 5) priorities.push({ type: 'emergency', title: `⚠️ ขาด ${absent} ครั้ง`, action: 'ด่วน! ต้องติดตามการขาดประชุม', target: 'ลด absent ≤ 4 ครั้ง' });
        else if (absent >= 3) priorities.push({ type: 'warning', title: `⚠️ ขาด ${absent} ครั้ง`, action: 'ติดตามและกระตุ้นให้ attend', target: 'ลด absent ≤ 2 ครั้ง' });
        if (score > 0 && score < 30) priorities.push({ type: 'emergency', title: '⚫ คะแนนต่ำมาก', action: 'ต้องนัด 1-2-1 ด่วน + วางแผน', target: 'เพิ่มคะแนน 30+' });
        else if (score > 0 && score < 50) priorities.push({ type: 'warning', title: '🔴 คะแนนต่ำกว่า 50', action: 'เพิ่ม referral และ visitor', target: 'คะแนน 50+' });
        if (!priorities.length) priorities.push({ type: 'ok', title: '✅ ทุกอย่างดี', action: 'ไม่มี action ด่วนสัปดาห์นี้', target: '' });

        const top = priorities[0];
        let urgency = top.type === 'emergency' ? 1 : top.type === 'warning' ? 2 : top.type === 'quick' ? 3 : 5;
        if (tl === 'black') urgency = Math.min(urgency, 1);
        else if (tl === 'red') urgency = Math.min(urgency, 2);

        return {
          name: m.name, nick: m.nickname, score, tl, absent, urgency,
          topType: top.type, topTitle: top.title, topAction: top.action, topTarget: top.target,
          totalActions: priorities.length,
        };
      });

      actions.sort((a, b) => a.urgency !== b.urgency ? a.urgency - b.urgency : (a.score || 99) - (b.score || 99));
      return jsonResponse({ ok: true, teamName, actions });
    }

    // ── Growth Data / Sheet (Growth Coordinator) ──────────────
    case 'getGrowthData': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);
      // Flat member list for MC/mentor dashboard (not the growth sheet UI)
      const { data: rows, error } = await db
        .from('v_member_dashboard')
        .select('name, nickname, mentor_team, display_score, traffic_light, given_thb, received_thb, tyfcb_thb, absent, attend, rg, rr, visitors, one_to_one, ceu, bni_days')
        .eq('is_archived', false)
        .order('display_score', { ascending: true });
      if (error) return errResponse(error.message);

      let totalTYFCB = 0, totalVisitors = 0, total121 = 0;
      let chapterAttend = 0, chapterAbsent = 0;
      let highGiverLowRecv = 0, lowGiverHighRecv = 0, balanced = 0;

      const members = (rows || []).map((m: Record<string, unknown>) => {
        const tl       = String(m.traffic_light || 'none');
        const rgCount  = Number(m.rg)            || 0;
        const rrCount  = Number(m.rr)            || 0;
        const total    = rgCount + rrCount;
        const giveRatio = total > 0 ? Math.round(rgCount / total * 100) : 50;
        const given    = Number(m.given_thb)     || 0;
        const recv     = Number(m.received_thb)  || 0;
        const tyfcb    = Number(m.tyfcb_thb)     || 0;
        const vis      = Number(m.visitors)      || 0;
        const r121     = Number(m.one_to_one)    || 0;
        const ceu      = Number(m.ceu)           || 0;
        const absent   = Number(m.absent)        || 0;
        const attend   = Number(m.attend)        || 0;

        totalTYFCB    += tyfcb || given;
        totalVisitors += vis;
        total121      += r121;
        chapterAttend += attend;
        chapterAbsent += absent;
        let zone: string;
        if (total < 5) {
          zone = 'insufficient';
        } else if (giveRatio > 60) {
          zone = 'highGiverLowRecv'; highGiverLowRecv++;
        } else if (giveRatio < 40) {
          zone = 'lowGiverHighRecv'; lowGiverHighRecv++;
        } else {
          zone = 'balanced'; balanced++;
        }
        const bniDaysN = Number(m.bni_days) || 0;
        return {
          name: m.name, nick: m.nickname, mentor: m.mentor_team,
          score: Number(m.display_score) || 0, tl, zone,
          given, recv, tyfcb, absent, attend,
          rg: rgCount, rr: rrCount, rgCount, rrCount, giveRatio,
          visitors: vis, r121, oToOne: r121, ceu,
          bniDays: bniDaysN,
          tyfcbPerDay: bniDaysN > 0 ? Math.round(tyfcb / bniDaysN) : 0,
        };
      });
      const chapterAttendRate = (chapterAttend + chapterAbsent) > 0
        ? Math.round(chapterAttend / (chapterAttend + chapterAbsent) * 100) : 0;
      return jsonResponse({ ok: true, members, summary: {
        total: members.length, totalTYFCB, totalVisitors, total121,
        chapterAttend, chapterAbsent, chapterAttendRate,
        highGiverLowRecv, lowGiverHighRecv, balanced,
      }});
    }

    case 'getGrowthSheetData': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);
      // Grouped structure for the Growth Sheet UI
      // Columns: 0=seq, 1=ชื่อ-สกุล, 2=ชื่อเล่น, 3=อายุสมาชิก, 4=หมายเหตุ, 5=เป้าหมาย ฿, 6=รับจริง ฿, 7=%ทำได้
      const HEADERS = ['', 'ชื่อ-สกุล', 'ชื่อเล่น', 'อายุสมาชิก', 'หมายเหตุ', 'เป้าหมาย ฿', 'รับจริง ฿', '%ทำได้'];
      const COL_MAP = { name: 1, nick: 2, memberAge: 3, note: 4, target: 5, received: 6, pct: 7 };

      const { data: groupRows, error: gErr } = await db
        .from('growth_referral_groups')
        .select('id, name, sort_order')
        .order('sort_order', { ascending: true });
      if (gErr) return errResponse(gErr.message);

      const { data: memberRows, error: mErr } = await db
        .from('growth_referral_members')
        .select('id, group_id, member_id, raw_name, nickname, seq_no, target_thb, received_thb, membership_age, note')
        .order('seq_no', { ascending: true });
      if (mErr) return errResponse(mErr.message);

      // Fetch bni_days for members who are linked (to compute membership age dynamically)
      const linkedIds = ((memberRows || []) as Record<string, unknown>[])
        .map(m => m.member_id).filter(Boolean) as string[];
      const bniDaysMap: Record<string, number> = {};
      if (linkedIds.length) {
        const { data: r2yRows } = await db
          .from('r2y_stats').select('member_id, bni_days').in('member_id', linkedIds);
        for (const r of (r2yRows || []) as Record<string, unknown>[]) {
          bniDaysMap[String(r.member_id)] = Number(r.bni_days) || 0;
        }
      }

      function computeMemberAge(bniDays: number): string {
        if (!bniDays) return '';
        const months = Math.floor(bniDays / 30);
        const years  = Math.floor(months / 12);
        if (years >= 1) return years + ' ปี ' + (months % 12 ? (months % 12) + ' เดือน' : '');
        return months + ' เดือน';
      }

      const membersByGroup: Record<string, Record<string, unknown>[]> = {};
      for (const m of (memberRows || []) as Record<string, unknown>[]) {
        const gid = String(m.group_id);
        if (!membersByGroup[gid]) membersByGroup[gid] = [];
        membersByGroup[gid].push(m);
      }

      let totalTarget = 0, totalReceived = 0;
      const groups = (groupRows || []).map((g: Record<string, unknown>) => {
        const gid    = String(g.id);
        const mems   = membersByGroup[gid] || [];
        let gTarget = 0, gReceived = 0;

        const members = mems.map((m: Record<string, unknown>) => {
          const tgt  = Number(m.target_thb)   || 0;
          const recv = Number(m.received_thb) || 0;
          const pct  = tgt > 0 ? Math.round(recv / tgt * 100) : 0;
          gTarget   += tgt;
          gReceived += recv;
          // Compute membership age from bni_days if linked, else use stored value (skip #REF! garbage)
          const storedAge = String(m.membership_age || '');
          const memberId  = String(m.member_id || '');
          const bniDays   = memberId ? (bniDaysMap[memberId] || 0) : 0;
          const ageLabel  = bniDays > 0 ? computeMemberAge(bniDays)
            : (storedAge && !storedAge.includes('#') ? storedAge : '');
          return {
            sheetRow: String(m.id),
            name:     String(m.raw_name || ''),
            nick:     String(m.nickname || ''),
            target:   tgt,
            received: recv,
            cells: [
              Number(m.seq_no) || 0,    // 0
              m.raw_name || '',          // 1 name
              m.nickname || '',          // 2 nick
              ageLabel,                  // 3 membership age (computed)
              m.note || '',              // 4
              tgt,                       // 5 target
              recv,                      // 6 received
              pct + '%',                 // 7 pct
            ],
          };
        });

        totalTarget   += gTarget;
        totalReceived += gReceived;
        const gPct = gTarget > 0 ? Math.round(gReceived / gTarget * 100) : 0;

        return {
          id: gid, name: String(g.name),
          members,
          totalRow: { received: gReceived, target: gTarget, pct: gPct, cells: ['รวม', '', '', '', '', gTarget, gReceived, gPct + '%'] },
        };
      });

      const overallPct = totalTarget > 0 ? Math.round(totalReceived / totalTarget * 100) : 0;
      return jsonResponse({
        ok: true,
        headers: HEADERS,
        colMap: COL_MAP,
        groups,
        summary: {
          totalTarget, totalReceived, pct: overallPct,
          groupCount: groups.length,
          memberCount: (memberRows || []).length,
        },
      });
    }

    // ── Mentor Activity + Performance (Growth can view) ───────
    case 'getMentorActivity': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);
      const teams = await getMentorActivityData(db);
      return jsonResponse({ ok: true, teams });
    }

    case 'getMentorPerformance': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);
      const teams = await getMentorActivityData(db);
      for (const t of teams) {
        const { data: issues } = await db.from('core_issues').select('opened_at')
          .eq('mentor_team', (t as Record<string, unknown>).team as string).eq('status', 'open');
        let oldest = 0;
        for (const ci of (issues || []) as Record<string, unknown>[]) {
          const age = Math.floor((Date.now() - new Date(String(ci.opened_at)).getTime()) / 86400000);
          if (age > oldest) oldest = age;
        }
        (t as Record<string, unknown>).oldestOpenDays = oldest;
      }
      return jsonResponse({ ok: true, teams });
    }

    // ── Growth Tasks ──────────────────────────────────────────
    case 'createGrowthTask': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);
      // Accept both old (assignedTo/taskText) and new (teamName/memberName/taskType/note) params
      const assignedTo  = String(p.assignedTo || p.teamName || '').toLowerCase();
      const taskText    = String(p.taskText || p.task || p.note || '').trim();
      const memberName  = String(p.memberName || '').trim();
      const taskType    = String(p.taskType || 'ทั่วไป').trim();
      const priority    = String(p.priority || '📋');
      if (!assignedTo) return errResponse('assignedTo or teamName required');

      // Look up member_id if memberName provided
      let memberId: string | null = null;
      if (memberName) {
        const { data: mem } = await db.from('members').select('id').eq('name', memberName).maybeSingle();
        if (mem) memberId = (mem as Record<string, unknown>).id as string;
      }

      const { error } = await db.from('growth_tasks').insert({
        created_by:  String(auth.role || 'growth'),
        assigned_to: assignedTo,
        task_text:   taskText,
        member_id:   memberId,
        member_name: memberName || null,
        task_type:   taskType,
        priority,
      });
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    case 'getGrowthTasks': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);
      const role = String(p.role || auth.role || '').toLowerCase();
      const statusFilter = String(p.statusFilter || 'all');

      let query = db.from('growth_tasks').select('id, created_by, assigned_to, task_text, response, responded_at, created_at, priority, task_type, member_name');
      // Mentors only see tasks assigned to them; MC/growth see all
      if (role !== 'mc' && role !== 'growth') query = query.eq('assigned_to', role);
      // Status filter
      if (statusFilter === 'open')  query = query.is('responded_at', null);
      if (statusFilter === 'done')  query = query.not('responded_at', 'is', null);

      const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
      if (error) return errResponse(error.message);

      const tasks = (data || []).map((t: Record<string, unknown>) => ({
        id:          t.id,
        memberName:  t.member_name  || '',
        team:        t.assigned_to  || '',
        taskType:    t.task_type    || 'ทั่วไป',
        note:        t.task_text    || '',
        priority:    t.priority     || '📋',
        status:      t.responded_at ? 'done' : 'open',
        response:    t.response     || '',
        respondedAt: t.responded_at ? String(t.responded_at).split('T')[0] : '',
        createdAt:   t.created_at   ? String(t.created_at).split('T')[0] : '',
      }));

      return jsonResponse({ ok: true, tasks });
    }

    case 'respondGrowthTask': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);
      const taskId   = String(p.taskId || p.id || '');
      const response = String(p.response || '').trim();
      if (!taskId) return errResponse('taskId required');
      const { error } = await db.from('growth_tasks')
        .update({ response, responded_at: new Date().toISOString() })
        .eq('id', taskId);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    // ── Monthly sync from CSV uploads ─────────────────────────────
    case 'monthlySync': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);

      const tlCsv = typeof p.tlCsv === 'string' ? p.tlCsv : null;
      const r2yCsv = typeof p.r2yCsv === 'string' ? p.r2yCsv : null;
      const memberTLCsv = typeof p.memberTLCsv === 'string' ? p.memberTLCsv : null;

      if (!tlCsv && !memberTLCsv && !r2yCsv) {
        return errResponse('ต้องส่งไฟล์ Member Traffic Light หรือ Traffic Lights หรือ Reporting2You อย่างน้อย 1 ไฟล์');
      }

      const tlRows = parseCsvString(tlCsv);
      const mtlRows = parseCsvString(memberTLCsv);
      const r2yRows = parseCsvString(r2yCsv);

      const { data: members, error: memberError } = await db.from('members').select('id, name, nickname');
      if (memberError) return errResponse(memberError.message);
      const memberMap: Record<string, string> = {};
      for (const row of (members || []) as Array<Record<string, unknown>>) {
        const name = normalizeName(row.name);
        if (name) memberMap[name] = String(row.id);
        const nickname = normalizeName(row.nickname);
        if (nickname && !memberMap[nickname]) memberMap[nickname] = String(row.id);
      }
      if (!Object.keys(memberMap).length) {
        return errResponse('ไม่พบสมาชิกในระบบ');
      }

      let nonMentorOk = true, counterOk = true, r2yOk = true, r2ySyncOk = true;
      let renewalOk = true, grOk = true, mtlOk = true;
      let importedScores = 0, importedR2Y = 0, updatedGR = 0;
      const stepErrors: string[] = [];

      // Steps 3+4: upsert monthly scores. Traffic Light Evolution keeps history;
      // Member Traffic Light is the current score source for the active sync.
      const tlScoreRows = tlRows.length ? parseMonthlyScores(tlRows, memberMap) : [];
      const existingScorePeriod = await getExistingLatestScorePeriod(db);
      const scorePeriod = tlScoreRows.length
        ? latestScorePeriod(tlScoreRows)
        : existingScorePeriod;
      const mtlScoreRows = mtlRows.length
        ? parseMemberTLCurrentScores(mtlRows, memberMap, scorePeriod.year, scorePeriod.month)
        : [];
      const scoreRows = [...tlScoreRows, ...mtlScoreRows];
      if ((tlRows.length || mtlRows.length) && !scoreRows.length) {
        return errResponse('ไม่พบคะแนนจากไฟล์ Sync: กรุณาตรวจว่ามีคอลัมน์ชื่อสมาชิก และคอลัมน์คะแนน/เดือนใน Traffic Light CSV');
      }
      if (scoreRows.length) {
        try {
          importedScores = await upsertMonthlyScores(db, scoreRows);
        } catch (e) {
          nonMentorOk = false; counterOk = false;
          stepErrors.push(`scores: ${(e as Error).message}`);
        }
      }

      // Steps 5+6: upsert R2Y stats from R2Y CSV
      const r2yUnmatched: string[] = [];
      if (r2yRows.length) {
        const r2yParsed = parseR2YRows(r2yRows, memberMap, r2yUnmatched);
        if (r2yParsed.length) {
          try {
            importedR2Y += await upsertR2YStats(db, r2yParsed);
          } catch (e) {
            r2yOk = false; r2ySyncOk = false;
            stepErrors.push(`r2y: ${(e as Error).message}`);
          }
        }
        // Step 6b: save email/phone from last 2 columns to members table
        const contactInfo = parseR2YContactInfo(r2yRows, memberMap);
        if (Object.keys(contactInfo).length) {
          try {
            await updateMembersContactInfo(db, contactInfo, memberMap);
          } catch (e) {
            stepErrors.push(`contact: ${(e as Error).message}`);
          }
        }
      }

      // Steps 7+8+9: MTL data → given/received + R2Y stats
      const mtlData = parseMemberTLStats(mtlRows);
      let updatedGRCount = 0;
      if (Object.keys(mtlData).length) {
        const grMap: Record<string, { given: number; received: number }> = {};
        const r2yUpserts: Array<Record<string, unknown>> = [];
        for (const [name, item] of Object.entries(mtlData)) {
          const memberId = memberMap[name];
          if (!memberId) continue;
          grMap[name] = { given: item.given, received: item.received };
          r2yUpserts.push({
            member_id: memberId,
            rg: item.rg, rr: item.rr, visitors: item.visitors,
            one_to_one: item.one_to_one, ceu: item.ceu, tyfcb_thb: item.given,
            official_pts: item.score, attend: item.p, absent: item.a,
            late: item.l, medical: item.m, sub: item.s,
            synced_at: new Date().toISOString(),
          });
        }
        if (Object.keys(grMap).length) {
          try {
            updatedGRCount = await updateMembersGivenReceived(db, grMap, memberMap);
            updatedGR = updatedGRCount;
          } catch (e) {
            grOk = false;
            stepErrors.push(`gr: ${(e as Error).message}`);
          }
        }
        if (r2yUpserts.length) {
          try {
            importedR2Y += await upsertR2YStats(db, r2yUpserts);
          } catch (e) {
            mtlOk = false;
            stepErrors.push(`mtl-r2y: ${(e as Error).message}`);
          }
        }
      }

      // Auto-enroll new members: anyone with bni_days < 56 who isn't already enrolled
      let autoEnrolled = 0;
      try {
        autoEnrolled = await autoEnrollNewMembers(db);
      } catch (e) {
        stepErrors.push(`autoEnroll: ${(e as Error).message}`);
      }

      try {
        await syncRenewalsFromR2YStats(db);
      } catch (e) {
        renewalOk = false;
        stepErrors.push(`renewal: ${(e as Error).message}`);
      }

      // Check Growth Watch members for score drops → create in-app notifications
      try {
        const { data: gwMembers } = await db
          .from('v_member_dashboard')
          .select('id, name, mentor_team, display_score')
          .eq('mentoring_mode', 'growth_watch')
          .eq('is_archived', false);

        if (gwMembers && (gwMembers as unknown[]).length > 0) {
          const warnings: Array<{ name: string; score: number; team: string }> = [];
          const urgents:  Array<{ name: string; score: number; team: string }> = [];
          for (const m of gwMembers as Record<string, unknown>[]) {
            const score = Number(m.display_score) || 0;
            if (score > 0 && score < 30) urgents.push({ name: String(m.name), score, team: String(m.mentor_team || '') });
            else if (score < 65) warnings.push({ name: String(m.name), score, team: String(m.mentor_team || '') });
          }
          // Clear previous unread GW notifications to avoid stale duplicates
          await db.from('notifications')
            .update({ dismissed_at: new Date().toISOString() })
            .in('type', ['growth_watch_warning', 'growth_watch_urgent'])
            .is('dismissed_at', null);

          if (urgents.length) {
            await db.from('notifications').insert({
              type: 'growth_watch_urgent', severity: 'urgent',
              title: `🔴 Growth Watch — ${urgents.length} คน เข้า Red/Black Zone`,
              body:  urgents.map(m => `• ${m.name} (${m.score} pts)`).join('\n'),
              data:  { members: urgents },
            });
          }
          if (warnings.length) {
            await db.from('notifications').insert({
              type: 'growth_watch_warning', severity: 'warning',
              title: `⚠️ Growth Watch — ${warnings.length} คน คะแนนต่ำกว่าเกณฑ์ 65 pts`,
              body:  warnings.map(m => `• ${m.name} (${m.score} pts)`).join('\n'),
              data:  { members: warnings },
            });
          }
        }
      } catch (_e) { /* non-fatal — don't fail the whole sync */ }

      return jsonResponse({
        ok: true,
        nonMentorOk, counterOk, r2yOk, r2ySyncOk, renewalOk, grOk, mtlOk,
        importedScores, importedR2Y, updatedGivenReceived: updatedGR,
        autoEnrolled,
        scoreYear: scoreRows.length ? scorePeriod.year : null,
        scoreMonth: scoreRows.length ? scorePeriod.month : null,
        ...(r2yUnmatched.length ? { r2yUnmatched } : {}),
        ...(stepErrors.length ? { errors: stepErrors } : {}),
      });
    }

    case 'updateGrowthMember': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberId = String(p.sheetRow || '');
      if (!memberId) return errResponse('sheetRow required');

      // col is 1-based; map to DB field
      const COL_TO_FIELD: Record<number, string> = {
        3: 'nickname', 4: 'membership_age', 5: 'note',
        6: 'target_thb', 7: 'received_thb',
      };
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const u of (Array.isArray(p.updates) ? p.updates : []) as { col: number; val: unknown }[]) {
        const field = COL_TO_FIELD[u.col];
        if (field) updates[field] = u.val;
      }

      const { error } = await db.from('growth_referral_members').update(updates).eq('id', memberId);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    case 'addGrowthMember': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);

      const name      = String(p.name      || '').trim();
      const groupName = String(p.groupName || '').trim();
      if (!name)      return errResponse('name required');
      if (!groupName) return errResponse('groupName required');

      const { data: grp, error: gErr } = await db
        .from('growth_referral_groups')
        .select('id')
        .eq('name', groupName)
        .single();
      if (gErr || !grp) return errResponse('กลุ่ม "' + groupName + '" ไม่มีอยู่');

      const { data: lastRow } = await db
        .from('growth_referral_members')
        .select('seq_no')
        .eq('group_id', (grp as Record<string, unknown>).id)
        .order('seq_no', { ascending: false })
        .limit(1)
        .single();
      const nextSeq = lastRow ? (Number((lastRow as Record<string, unknown>).seq_no) || 0) + 1 : 1;

      const { error } = await db.from('growth_referral_members').insert({
        group_id:     (grp as Record<string, unknown>).id,
        raw_name:     name,
        nickname:     String(p.nick || ''),
        target_thb:   Number(p.target) || 0,
        received_thb: 0,
        seq_no:       nextSeq,
      });
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    case 'moveGrowthMember': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberId  = String(p.sheetRow    || '');
      const groupName = String(p.targetGroup || '').trim();
      if (!memberId)  return errResponse('sheetRow required');
      if (!groupName) return errResponse('targetGroup required');

      const { data: grp, error: gErr } = await db
        .from('growth_referral_groups')
        .select('id')
        .eq('name', groupName)
        .single();
      if (gErr || !grp) return errResponse('กลุ่ม "' + groupName + '" ไม่มีอยู่');

      const { error } = await db
        .from('growth_referral_members')
        .update({ group_id: (grp as Record<string, unknown>).id, updated_at: new Date().toISOString() })
        .eq('id', memberId);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    default:
      return errResponse(`Unknown growth action: ${action}`);
  }
}

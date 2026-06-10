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
  return -1;
}

function findMonthlyColumns(headers: string[]): Array<{ idx: number; year: number; month: number }> {
  const result: Array<{ idx: number; year: number; month: number }> = [];
  const normalize = (h: string) => String(h || '').toLowerCase().trim();
  const monthNames: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
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
    }
  }

  return result;
}

function parseMonthlyScores(rows: string[][], memberMap: Record<string, string>): Array<{ member_id: string; year: number; month: number; score: number; source: string }> {
  if (!rows || rows.length === 0) return [];
  const headerInfo = findHeaderRow(rows, row => {
    const normalized = row.map(c => String(c || '').toLowerCase().trim());
    return findMonthlyColumns(normalized).length > 0 && normalized.some(c => c.includes('name') || c.includes('member'));
  });
  if (!headerInfo) return [];

  const headers = headerInfo.row.map(c => String(c || '').toLowerCase().trim());
  const nameIdx = findColumnIndex(headers, ['name -surname', 'name-surname', 'name', 'member name', 'member']);
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

function parseMemberTrafficLightData(rows: string[][]): Record<string, {
  given: number; received: number; rg: number; rr: number; visitors: number; one_to_one: number;
  ceu: number; score: number; p: number; a: number; l: number; m: number; s: number;
}> {
  const normalizedRows = rows.map(r => r.map(c => String(c || '').toLowerCase().trim()));
  const headerInfo = findHeaderRow(normalizedRows, row => row.some(c => c === 'total score') && row.some(c => c === 'traffic light'));
  if (!headerInfo) return {};

  const headers = normalizedRows[headerInfo.idx];
  const nameIdx = findColumnIndex(headers, ['name -surname', 'name-surname', 'name', 'member name', 'member']);
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
  const BATCH = 100;
  let imported = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
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

function parseR2YRows(rows: string[][], memberMap: Record<string, string>): Array<Record<string, unknown>> {
  if (!rows || rows.length < 2) return [];
  const dataRows = rows.slice(1);
  const parsed: Array<Record<string, unknown>> = [];

  for (const row of dataRows) {
    const rawName = normalizeName(row[0]);
    if (!rawName) continue;
    const memberId = memberMap[rawName];
    if (!memberId) continue;

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
  const nameIdx = findColumnIndex(headers, ['name -surname', 'name-surname', 'name', 'member name', 'member']);
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
        const displayScore = Number(m.display_score) || latest; // GREATEST(monthly, r2y official)
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
      const role = String(p.role || '').toLowerCase();
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
    case 'getGrowthData':
    case 'getGrowthSheetData': {
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

        if (total >= 5) {
          if (giveRatio > 60) highGiverLowRecv++;
          else if (giveRatio < 40) lowGiverHighRecv++;
          else balanced++;
        }

        return {
          name: m.name, nick: m.nickname, mentor: m.mentor_team,
          score: Number(m.display_score) || 0, tl, zone: tl,
          given, recv, tyfcb, absent, attend,
          rg: rgCount, rr: rrCount,
          rgCount, rrCount, giveRatio,
          visitors: vis, r121, oToOne: r121, ceu,
          bniDays: Number(m.bni_days) || 0,
        };
      });

      const total = members.length;
      const chapterAttendRate = (chapterAttend + chapterAbsent) > 0
        ? Math.round(chapterAttend / (chapterAttend + chapterAbsent) * 100) : 0;

      const summary = {
        total, totalTYFCB, totalVisitors, total121,
        chapterAttend, chapterAbsent, chapterAttendRate,
        highGiverLowRecv, lowGiverHighRecv, balanced,
      };

      return jsonResponse({ ok: true, members, summary });
    }

    // ── Mentor Activity + Performance (Growth can view) ───────
    case 'getMentorActivity': {
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
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);
      const assignedTo = String(p.assignedTo || '');
      const taskText   = String(p.taskText || p.task || '').trim();
      if (!assignedTo || !taskText) return errResponse('assignedTo and taskText required');
      const { error } = await db.from('growth_tasks').insert({ created_by: 'mc', assigned_to: assignedTo, task_text: taskText });
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    case 'getGrowthTasks': {
      const role = String(p.role || '').toLowerCase();
      let query = db.from('growth_tasks').select('id, created_by, assigned_to, task_text, response, responded_at, created_at');
      if (role !== 'mc' && role !== 'growth') query = query.eq('assigned_to', role);
      const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true, tasks: data || [] });
    }

    case 'respondGrowthTask': {
      const taskId   = String(p.taskId || '');
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
      const auth = await requireAuth(db, p, ['mc', 'growth']);
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

      const { data: members, error: memberError } = await db.from('members').select('id, name');
      if (memberError) return errResponse(memberError.message);
      const memberMap: Record<string, string> = {};
      for (const row of (members || []) as Array<Record<string, unknown>>) {
        const name = normalizeName(row.name);
        if (name) memberMap[name] = String(row.id);
      }
      if (!Object.keys(memberMap).length) {
        return errResponse('ไม่พบสมาชิกในระบบ');
      }

      let nonMentorOk = true, counterOk = true, r2yOk = true, r2ySyncOk = true;
      let renewalOk = true, grOk = true, mtlOk = true;
      let importedScores = 0, importedR2Y = 0, updatedGR = 0;
      const stepErrors: string[] = [];

      // Steps 3+4: upsert monthly scores from TL CSV or MTL CSV
      const scoreRows = tlRows.length ? parseMonthlyScores(tlRows, memberMap) : [];
      const fallbackScoreRows = scoreRows.length ? scoreRows : parseMonthlyScores(mtlRows, memberMap);
      if (fallbackScoreRows.length) {
        try {
          importedScores = await upsertMonthlyScores(db, fallbackScoreRows);
        } catch (e) {
          nonMentorOk = false; counterOk = false;
          stepErrors.push(`scores: ${(e as Error).message}`);
        }
      }

      // Steps 5+6: upsert R2Y stats from R2Y CSV
      if (r2yRows.length) {
        const r2yParsed = parseR2YRows(r2yRows, memberMap);
        if (r2yParsed.length) {
          try {
            importedR2Y += await upsertR2YStats(db, r2yParsed);
          } catch (e) {
            r2yOk = false; r2ySyncOk = false;
            stepErrors.push(`r2y: ${(e as Error).message}`);
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

      return jsonResponse({
        ok: true,
        nonMentorOk, counterOk, r2yOk, r2ySyncOk, renewalOk, grOk, mtlOk,
        importedScores, importedR2Y, updatedGivenReceived: updatedGR,
        ...(stepErrors.length ? { errors: stepErrors } : {}),
      });
    }

    // ── Stubs ─────────────────────────────────────────────────
    case 'updateGrowthMember':
    case 'addGrowthMember':
    case 'moveGrowthMember':
    case 'getGrowthPowerTeams':
      return jsonResponse({ ok: true, message: 'not yet implemented' });

    default:
      return errResponse(`Unknown growth action: ${action}`);
  }
}

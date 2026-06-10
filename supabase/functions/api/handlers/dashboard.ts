// Handler: dashboard — getDashboard, getMemberDetail, getMentorActivity, getMyTeam, etc.
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

const TEAMS = ['TOOMTAM', 'Aof', 'Draft', 'PHAI', 'AMP'];
const TEAM_ROLE: Record<string, string> = {
  toomtam: 'TOOMTAM', aof: 'Aof', draft: 'Draft', phai: 'PHAI', amp: 'AMP',
};
const MONTH_LABELS: Record<number, string> = {1:'JAN',2:'FEB',3:'MAR',4:'APR',5:'MAY',6:'JUN',7:'JUL',8:'AUG',9:'SEP',10:'OCT',11:'NOV',12:'DEC'};

export async function getMentorActivityData(db: ReturnType<typeof getServiceClient>) {
  const result = [];
  for (const teamName of TEAMS) {
    const { data: members } = await db
      .from('v_member_dashboard')
      .select('id, name, open_core_issue, core_issue_opened_at, display_score')
      .eq('mentor_team', teamName)
      .eq('is_archived', false);

    if (!members || (members as unknown[]).length === 0) {
      result.push({ team: teamName, memberCount: 0, scoreUp: 0, scoreDown: 0, scoreSame: 0, noScoreYet: 0, reportCount: 0, openCount: 0, notReported: [], daysSince: null, statusFlag: 'none' });
      continue;
    }

    const mArr = members as Record<string, unknown>[];
    const memberIds = mArr.map(m => String(m.id));

    const { data: allScores } = await db
      .from('monthly_scores')
      .select('member_id, score, year, month')
      .in('member_id', memberIds)
      .order('year', { ascending: false })
      .order('month', { ascending: false });

    const memberScores: Record<string, number[]> = {};
    for (const s of (allScores || []) as Record<string, unknown>[]) {
      const mid = String(s.member_id);
      if (!memberScores[mid]) memberScores[mid] = [];
      if (memberScores[mid].length < 2) memberScores[mid].push(Number(s.score) || 0);
    }

    let scoreUp = 0, scoreDown = 0, scoreSame = 0, noScoreYet = 0;
    let reportCount = 0, openCount = 0;
    const notReported: string[] = [];
    let latestTs: string | null = null;

    for (const m of mArr) {
      const scores = memberScores[String(m.id)] || [];
      if (scores.length >= 2) {
        const [curr, prev] = scores;
        if (curr > prev + 2) scoreUp++;
        else if (curr < prev - 2) scoreDown++;
        else scoreSame++;
      } else { noScoreYet++; }

      if (m.open_core_issue) {
        reportCount++;
        openCount++;
        const ts = String(m.core_issue_opened_at || '');
        if (!latestTs || ts > latestTs) latestTs = ts;
      } else {
        notReported.push(String(m.name));
      }
    }

    let daysSince: number | null = null;
    if (latestTs) daysSince = Math.floor((Date.now() - new Date(latestTs).getTime()) / 86400000);

    const statusFlag = reportCount === 0 ? 'none'
      : daysSince !== null && daysSince > 21 ? 'stale'
      : notReported.length > 0 ? 'partial' : 'ok';

    result.push({ team: teamName, memberCount: mArr.length, scoreUp, scoreDown, scoreSame, noScoreYet, reportCount, openCount, notReported, daysSince, statusFlag });
  }
  return result;
}

export async function handleDashboard(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    case 'getDashboard':
    case 'getMCData':
    case 'getDesktopDashboard': {
      const { data: rows, error } = await db
        .from('v_member_dashboard')
        .select('name, nickname, mentor_team, display_score, traffic_light, given_thb, received_thb, tyfcb_thb, absent, palms_detail')
        .eq('is_archived', false)
        .order('display_score', { ascending: false });
      if (error) return errResponse(error.message);

      const summary = { green: 0, yellow: 0, red: 0, black: 0, none: 0 };
      const members = (rows || []).map((m: Record<string, unknown>) => {
        const tl = String(m.traffic_light || 'none');
        if (tl in summary) (summary as Record<string, number>)[tl]++;
        return {
          name: m.name, nick: m.nickname, mentor: m.mentor_team,
          score: Number(m.display_score) || 0, tl,
          given: Number(m.given_thb) || 0, recv: Number(m.received_thb) || 0,
          tyfcb: Number(m.tyfcb_thb) || 0, absent: Number(m.absent) || 0,
          bniScore: Number(m.display_score) || 0, bniTl: tl,
          cats: m.palms_detail || null,
        };
      });

      return jsonResponse({ ok: true, members, summary });
    }

    case 'getMemberDetail': {
      const memberName = String(p.memberName || p.name || '').replace(/\s*\([^)]+\)\s*$/,'').trim();
      if (!memberName) return errResponse('memberName required');

      const { data: m, error: mErr } = await db
        .from('v_member_dashboard').select('*').eq('name', memberName).single();
      if (mErr || !m) return errResponse(`ไม่พบ "${memberName}"`);

      const mv = m as Record<string, unknown>;
      const memberId = String(mv.id);

      const { data: scores } = await db.from('monthly_scores').select('year, month, score')
        .eq('member_id', memberId).order('year', { ascending: true }).order('month', { ascending: true });
      const scoreHistory = (scores || []).map((s: Record<string, unknown>) => ({
        month: MONTH_LABELS[Number(s.month)] || String(s.month),
        score: Number(s.score) || null,
      }));

      const { data: info } = await db.from('members').select('phone, email').eq('id', memberId).single();
      const inf = (info || {}) as Record<string, unknown>;

      const bniDays = Number(mv.bni_days) || 0;
      const weeks = bniDays > 0 ? Math.min(26, Math.max(1, Math.floor(bniDays / 7))) : 1;
      const actual = {
        rg: Number(mv.rg) || 0, rr: Number(mv.rr) || 0,
        visitor: Number(mv.visitors) || 0, oToOne: Number(mv.one_to_one) || 0,
        ceu: Number(mv.ceu) || 0, tyfcb: Number(mv.tyfcb_thb) || 0,
        bniDays, attend: Number(mv.attend) || 0, absent: Number(mv.absent) || 0,
        late: Number(mv.late) || 0, sub: Number(mv.sub) || 0,
        email: String(inf.email || ''), phone: String(inf.phone || ''),
      };
      const target = {
        referral: weeks * 2, visitor: Math.max(1, Math.ceil((weeks / 26) * 2)),
        oToOne: weeks * 2, ceu: Math.max(1, Math.ceil((weeks / 26) * 4)), attend: weeks,
      };

      const displayScore = Number(mv.display_score) || 0;
      const tl = String(mv.traffic_light || 'none');

      return jsonResponse({
        ok: true, name: mv.name, nick: mv.nickname, mentor: mv.mentor_team,
        score: displayScore, tl, bniScore: displayScore, bniTl: tl,
        cats: mv.palms_detail,
        given: Number(mv.given_thb) || 0, recv: Number(mv.received_thb) || 0,
        actual, target, weeks, scoreHistory,
        coreIssue: mv.open_core_issue ? { coreIssue: mv.open_core_issue, savedAt: mv.core_issue_opened_at } : null,
        renewal: mv.expiry_date || '',
      });
    }

    case 'getMyTeam': {
      const role = String(p.role || '').toLowerCase();
      const teamName = String(p.teamName || TEAM_ROLE[role] || '');
      if (!teamName) return errResponse('ไม่พบทีม');

      const { data: members, error } = await db
        .from('v_member_dashboard')
        .select('id, name, nickname, display_score, traffic_light, absent, tyfcb_thb, open_core_issue, given_thb, received_thb, palms_detail')
        .eq('mentor_team', teamName).eq('is_archived', false)
        .order('display_score', { ascending: false });
      if (error) return errResponse(error.message);

      const memberIds = (members || []).map((m: Record<string, unknown>) => String(m.id));
      const { data: scoreHist } = await db.from('monthly_scores')
        .select('member_id, year, month, score').in('member_id', memberIds)
        .order('year', { ascending: true }).order('month', { ascending: true });

      const histMap: Record<string, { month: string; score: number | null }[]> = {};
      for (const s of (scoreHist || []) as Record<string, unknown>[]) {
        const mid = String(s.member_id);
        if (!histMap[mid]) histMap[mid] = [];
        histMap[mid].push({ month: MONTH_LABELS[Number(s.month)] || '', score: Number(s.score) || null });
      }

      const memberList = (members || []).map((m: Record<string, unknown>) => ({
        name: m.name, nick: m.nickname,
        score: Number(m.display_score) || 0, tl: String(m.traffic_light || 'none'),
        absent: Number(m.absent) || 0, tyfcb: Number(m.tyfcb_thb) || 0,
        given: Number(m.given_thb) || 0, recv: Number(m.received_thb) || 0,
        hasOpenCase: !!m.open_core_issue, cats: m.palms_detail || null,
        scoreHistory: histMap[String(m.id)] || [],
      }));

      return jsonResponse({ ok: true, teamName, members: memberList });
    }

    case 'getMentorActivity': {
      const teams = await getMentorActivityData(db);
      return jsonResponse({ ok: true, teams });
    }

    case 'getMentorPerformance': {
      const auth = await requireAuth(db, p, ['mc']);
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

    case 'getChapterPulse': {
      const { data: rows, error } = await db
        .from('v_member_dashboard')
        .select('nickname, mentor_team, display_score, traffic_light, given_thb, received_thb')
        .eq('is_archived', false);
      if (error) return errResponse(error.message);

      const tlCount = { green: 0, yellow: 0, red: 0, black: 0, none: 0 };
      let totalScore = 0, memberCount = 0, totalGiven = 0, totalRecv = 0;

      for (const m of (rows || []) as Record<string, unknown>[]) {
        const score = Number(m.display_score) || 0;
        if (score === 0) continue;
        memberCount++; totalScore += score;
        totalGiven += Number(m.given_thb) || 0; totalRecv += Number(m.received_thb) || 0;
        const tl = String(m.traffic_light || 'none') as keyof typeof tlCount;
        if (tl in tlCount) tlCount[tl]++;
      }

      const { data: hist } = await db.from('v_score_history').select('nickname, score, sort_key').order('sort_key', { ascending: false });
      const trendMap: Record<string, { curr: number; prev: number }> = {};
      const seen: Record<string, number> = {};
      for (const s of (hist || []) as Record<string, unknown>[]) {
        const nick = String(s.nickname || '');
        if (!nick) continue;
        seen[nick] = (seen[nick] || 0) + 1;
        if (seen[nick] === 1) trendMap[nick] = { curr: Number(s.score), prev: 0 };
        else if (seen[nick] === 2) trendMap[nick].prev = Number(s.score);
      }

      const movers = (rows || []).map((m: Record<string, unknown>) => {
        const nick = String(m.nickname || '');
        const t = trendMap[nick];
        if (!t || !t.prev) return null;
        return { nick, tl: m.traffic_light, score: t.curr, prev: t.prev, delta: t.curr - t.prev };
      }).filter(Boolean) as Record<string, unknown>[];

      const risers  = movers.filter(m => Number(m.delta) > 2).sort((a, b) => Number(b.delta) - Number(a.delta)).slice(0, 3);
      const fallers = movers.filter(m => Number(m.delta) < -2).sort((a, b) => Number(a.delta) - Number(b.delta)).slice(0, 3);

      return jsonResponse({ ok: true, memberCount, avgScore: memberCount ? Math.round(totalScore / memberCount) : 0, tlCount, totalGiven, totalRecv, risers, fallers });
    }

    case 'getLeaderboard': {
      const { data: rows, error } = await db
        .from('v_member_dashboard')
        .select('name, nickname, mentor_team, display_score, traffic_light, given_thb, received_thb')
        .eq('is_archived', false).order('display_score', { ascending: false });
      if (error) return errResponse(error.message);
      const members = (rows || []).map((m: Record<string, unknown>) => ({
        name: m.name, nick: m.nickname, mentor: m.mentor_team,
        score: Number(m.display_score) || 0, tl: String(m.traffic_light || 'none'),
        given: Number(m.given_thb) || 0, recv: Number(m.received_thb) || 0,
      }));
      return jsonResponse({ ok: true, members });
    }

    case 'getScorecard': {
      const teamName = String(p.teamName || p.team || '');
      let query = db.from('v_member_dashboard')
        .select('name, nickname, mentor_team, display_score, traffic_light, absent, given_thb, received_thb')
        .eq('is_archived', false);
      if (teamName) query = query.eq('mentor_team', teamName);
      const { data, error } = await query.order('display_score', { ascending: false });
      if (error) return errResponse(error.message);
      const members = (data || []).map((m: Record<string, unknown>) => ({
        name: m.name, nick: m.nickname, mentor: m.mentor_team,
        score: Number(m.display_score) || 0, tl: String(m.traffic_light || 'none'),
        absent: Number(m.absent) || 0, given: Number(m.given_thb) || 0, recv: Number(m.received_thb) || 0,
      }));
      return jsonResponse({ ok: true, members });
    }

    case 'getMCCoaching': {
      const { data: rows, error } = await db
        .from('v_member_dashboard')
        .select('name, nickname, mentor_team, display_score, traffic_light, open_core_issue, palms_detail')
        .eq('is_archived', false).order('display_score', { ascending: true });
      if (error) return errResponse(error.message);
      const guides = (rows || []).map((m: Record<string, unknown>) => {
        const score = Number(m.display_score) || 0;
        const bniTl = String(m.traffic_light || 'none');
        return { name: m.name, nick: m.nickname, mentor: m.mentor_team, score, bniTl, bniScore: score,
          coreIssue: m.open_core_issue || null, noData: score === 0,
          fastTrack: { score: { tl: bniTl, total: score } }, palms: m.palms_detail };
      });
      return jsonResponse({ ok: true, guides });
    }

    case 'getCurrentMonth': {
      const { data } = await db.from('settings').select('value').eq('key', 'CURRENT_MONTH').single();
      return jsonResponse({ ok: true, month: (data as Record<string, unknown>)?.value || '' });
    }

    case 'setCurrentMonth': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);
      const month = String(p.month || '').trim();
      if (!month) return errResponse('month required');
      await db.from('settings').upsert({ key: 'CURRENT_MONTH', value: month });
      return jsonResponse({ ok: true });
    }

    case 'verifyScoring':
      return jsonResponse({ ok: true, results: [] });

    case 'getChapterRevenue':
    case 'getChapterTrend':
    case 'getChapterActions':
    case 'getVisitorTracker':
    case 'getSprintBoard':
    case 'saveSprintPlan':
    case 'getCrossTeamSynergy':
    case 'saveCrossTeamPair':
      return jsonResponse({ ok: true, teams: [], sprints: [], recommendations: [], savedPairs: [], chapterPct: 0, totalRecv: 0, chapterGoal: 0, gap: 0 });

    default:
      return errResponse(`Unknown dashboard action: ${action}`);
  }
}

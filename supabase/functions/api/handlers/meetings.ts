// FILE: meetings.ts
// Handler: meetings — getMeetingPrep, getVisitorTracker, getVisitorLog, addVisitor,
//   updateVisitor, getSeatMap, getChapterRevenue, setChapterGoal,
//   getSprintBoard, saveSprintPlan, getChapterActions, getReferralFlow
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

const TEAM_MAP: Record<string, string> = {
  toomtam: 'TOOMTAM', aof: 'Aof', draft: 'Draft', phai: 'PHAI', amp: 'AMP',
};

const ALL_TEAMS = ['TOOMTAM', 'Aof', 'Draft', 'PHAI', 'AMP'];

/** BNI year starts April 1. Returns { mElapsed, mRemain } relative to today. */
function bniYearMonths(): { mElapsed: number; mRemain: number } {
  const now = new Date();
  const yr = now.getFullYear();
  const aprilThisYear = new Date(yr, 3, 1); // month is 0-indexed
  const aprilStart = now >= aprilThisYear ? aprilThisYear : new Date(yr - 1, 3, 1);
  const aprilEnd   = new Date(aprilStart.getFullYear() + 1, 3, 1);

  // Fractional months elapsed since April 1
  const msElapsed = now.getTime() - aprilStart.getTime();
  const msTotal   = aprilEnd.getTime() - aprilStart.getTime();
  const mElapsed  = Math.max(1, msElapsed / (msTotal / 12));
  const mRemain   = Math.max(0, 12 - mElapsed);

  return { mElapsed, mRemain };
}

export async function handleMeetings(p: Record<string, unknown>): Promise<Response> {
  const db     = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    // ── Meeting Prep: summary + risk members + visitors + open cases ──
    case 'getMeetingPrep': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const { data: members, error: mErr } = await db
        .from('v_member_dashboard')
        .select('name, nickname, mentor_team, display_score, traffic_light, absent, rg, visitors, one_to_one, ceu, tyfcb_thb, given_thb, received_thb, bni_days, open_core_issue')
        .eq('is_archived', false);
      if (mErr) return errResponse(mErr.message);

      const rows = (members || []) as Record<string, unknown>[];

      let green = 0, yellow = 0, red = 0, black = 0, totalScore = 0, scoredCount = 0;
      let totalGiven = 0, totalRecv = 0;
      const topGiversRaw: { name: string; given: number }[] = [];

      for (const m of rows) {
        const tl    = String(m.traffic_light || 'none');
        const score = Number(m.display_score) || 0;
        const rg    = Number(m.rg)            || 0;
        const given = Number(m.given_thb)     || 0;
        const recv  = Number(m.received_thb)  || 0;
        if (tl === 'green')  green++;
        else if (tl === 'yellow') yellow++;
        else if (tl === 'red')   red++;
        else if (tl === 'black') black++;
        if (score > 0) { totalScore += score; scoredCount++; }
        totalGiven += given; totalRecv += recv;
        topGiversRaw.push({ name: String(m.nickname || m.name || ''), given: rg });
      }
      const avgScore    = scoredCount ? Math.round(totalScore / scoredCount) : 0;
      const memberCount = rows.length;

      topGiversRaw.sort((a, b) => b.given - a.given);
      const topGivers = topGiversRaw.filter(g => g.given > 0).slice(0, 5);

      const noVisitor    = rows.filter(m => !(Number(m.visitors) > 0)).map(m => String(m.nickname || m.name || ''));
      const pendingTYFCB = rows.filter(m => !(Number(m.tyfcb_thb) > 0) && !(Number(m.received_thb) > 0)).map(m => String(m.nickname || m.name || ''));

      const tlCount = { green, yellow, red, black };
      const stats   = { memberCount, avgScore, totalGiven, totalRecv, tlCount };

      // Risk members: red/black TL or absent > 4, sorted by absent desc
      const riskMembers = rows
        .filter(m => String(m.traffic_light || 'none') === 'red' || String(m.traffic_light || 'none') === 'black' || Number(m.absent) > 4)
        .sort((a, b) => (Number(b.absent) || 0) - (Number(a.absent) || 0))
        .map(m => ({
          name:    String(m.name   || ''),
          nick:    String(m.nickname || m.name || ''),
          team:    m.mentor_team,
          score:   Number(m.display_score) || 0,
          tl:      String(m.traffic_light || 'none'),
          absent:  Number(m.absent) || 0,
        }));

      // Recent visitors (last 30 days)
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      const { data: visitorRows } = await db
        .from('visitor_log')
        .select('id, visitor_name, invited_by, visit_date, status, notes')
        .gte('visit_date', since30)
        .order('visit_date', { ascending: false })
        .limit(10);

      const inviterIds = [...new Set(
        (visitorRows || []).map((v: Record<string, unknown>) => v.invited_by).filter(Boolean)
      )] as string[];
      let inviterMap: Record<string, string> = {};
      if (inviterIds.length) {
        const { data: inv } = await db.from('members').select('id, name').in('id', inviterIds);
        for (const i of (inv || []) as Record<string, unknown>[]) inviterMap[String(i.id)] = String(i.name);
      }

      const visitors = (visitorRows || []).map((v: Record<string, unknown>) => ({
        id: v.id, visitorName: v.visitor_name,
        invitedBy: v.invited_by ? (inviterMap[String(v.invited_by)] || null) : null,
        visitDate: v.visit_date, status: v.status, notes: v.notes,
      }));

      // Open core issues
      const { data: caseRows } = await db
        .from('core_issues')
        .select('id, member_id, mentor_team, issue_text, opened_at, updated_at')
        .eq('status', 'open')
        .order('opened_at', { ascending: true });

      const caseIds = [...new Set(
        (caseRows || []).map((c: Record<string, unknown>) => c.member_id).filter(Boolean)
      )] as string[];
      let memberMap: Record<string, string> = {};
      if (caseIds.length) {
        const { data: caseMembers } = await db.from('members').select('id, name').in('id', caseIds);
        for (const cm of (caseMembers || []) as Record<string, unknown>[]) memberMap[String(cm.id)] = String(cm.name);
      }

      const openCases = (caseRows || []).map((c: Record<string, unknown>) => ({
        id: c.id, memberName: memberMap[String(c.member_id)] || String(c.member_id),
        team: c.mentor_team, issueText: c.issue_text, openedAt: c.opened_at,
        updatedAt: c.updated_at,
        ageDays: Math.floor((Date.now() - new Date(String(c.opened_at)).getTime()) / 86400000),
      }));

      return jsonResponse({
        ok: true,
        stats,                                    // frontend reads r.stats
        summary: stats,                           // keep alias
        memberCount,
        topGivers, noVisitor, pendingTYFCB,
        riskMembers, visitors, openCases,
      });
    }

    // ── Visitor Tracker ──────────────────────────────────────────
    case 'getVisitorTracker': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const { data: members, error } = await db
        .from('v_member_dashboard')
        .select('name, nickname, mentor_team, visitors, bni_days, display_score, traffic_light')
        .eq('is_archived', false)
        .order('visitors', { ascending: false });
      if (error) return errResponse(error.message);

      const rows = (members || []) as Record<string, unknown>[];
      let withVisitor = 0, noVisitor = 0;

      const membersList = rows.map(m => {
        const bniDays = Number(m.bni_days) || 0;
        const vis     = Number(m.visitors) || 0;
        const weeks   = Math.min(26, Math.max(1, Math.floor(bniDays / 7)));
        const months  = weeks / 4;
        const target  = Math.max(1, Math.round(months / 3)); // ~1 per 13 wks
        const status  = vis >= target ? 'ok' : vis > 0 ? 'behind' : 'zero';

        if (vis > 0) withVisitor++; else noVisitor++;

        return {
          name:   m.name,  nick:  m.nickname,
          team:   m.mentor_team,
          visitors: vis,   target, weeks,
          tl:     String(m.traffic_light || 'none'),
          score:  Number(m.display_score) || 0,
          status,
        };
      });

      // Recent 20 log entries
      const { data: logRows } = await db
        .from('visitor_log')
        .select('id, visitor_name, invited_by, visit_date, status, notes, created_at')
        .order('visit_date', { ascending: false })
        .limit(20);

      const inviterIds2 = [...new Set(
        (logRows || []).map((v: Record<string, unknown>) => v.invited_by).filter(Boolean)
      )] as string[];
      let invMap: Record<string, string> = {};
      if (inviterIds2.length) {
        const { data: inv } = await db.from('members').select('id, name').in('id', inviterIds2);
        for (const i of (inv || []) as Record<string, unknown>[]) {
          invMap[String(i.id)] = String(i.name);
        }
      }

      const recentLog = (logRows || []).map((v: Record<string, unknown>) => ({
        id:          v.id,
        visitorName: v.visitor_name,
        invitedBy:   v.invited_by ? (invMap[String(v.invited_by)] || null) : null,
        visitDate:   v.visit_date,
        status:      v.status,
        notes:       v.notes,
        createdAt:   v.created_at,
      }));

      return jsonResponse({ ok: true, visitors: membersList, withVisitor, noVisitor, recentLog });
    }

    // ── Visitor Log ──────────────────────────────────────────────
    case 'getVisitorLog': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const { data: rows, error } = await db
        .from('visitor_log')
        .select('id, visitor_name, invited_by, visit_date, status, notes, created_at')
        .order('visit_date', { ascending: false })
        .limit(50);
      if (error) return errResponse(error.message);

      const inviterIds = [...new Set(
        (rows || []).map((v: Record<string, unknown>) => v.invited_by).filter(Boolean)
      )] as string[];
      let invMap: Record<string, string> = {};
      if (inviterIds.length) {
        const { data: inv } = await db.from('members').select('id, name').in('id', inviterIds);
        for (const i of (inv || []) as Record<string, unknown>[]) {
          invMap[String(i.id)] = String(i.name);
        }
      }

      const visitors = (rows || []).map((v: Record<string, unknown>) => ({
        id:          v.id,
        row:         v.id,             // UUID used as row key for update/delete
        name:        String(v.visitor_name || ''),
        visitorName: v.visitor_name,
        invitedBy:   v.invited_by ? (invMap[String(v.invited_by)] || null) : null,
        date:        String(v.visit_date || ''),
        visitDate:   v.visit_date,
        status:      v.status,
        notes:       v.notes,
        profession:  '',               // not in schema; default empty
        createdAt:   v.created_at,
      }));

      return jsonResponse({ ok: true, visitors, log: visitors });
    }

    // ── Add Visitor ──────────────────────────────────────────────
    case 'addVisitor': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const visitorName    = String(p.visitorName || '').trim();
      const invitedByName  = p.invitedByName ? String(p.invitedByName).trim() : null;
      const visitDate      = p.visitDate ? String(p.visitDate) : new Date().toISOString().split('T')[0];
      const notes          = p.notes ? String(p.notes).trim() : null;

      if (!visitorName) return errResponse('visitorName required');

      // Look up invited_by member UUID (nullable)
      let invitedById: string | null = null;
      if (invitedByName) {
        const { data: inv } = await db.from('members').select('id').eq('name', invitedByName).single();
        if (inv) invitedById = String((inv as Record<string, unknown>).id);
      }

      const { error } = await db.from('visitor_log').insert({
        visitor_name: visitorName,
        invited_by:   invitedById,
        visit_date:   visitDate,
        notes,
      });
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true });
    }

    // ── Update Visitor ───────────────────────────────────────────
    case 'updateVisitor': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      // Accept `row` (UUID from getVisitorLog response) or `visitorId`
      const visitorId = String(p.visitorId || p.row || '');
      if (!visitorId) return errResponse('visitorId or row required');

      // Handle delete
      if (p.field === 'delete') {
        const { error } = await db.from('visitor_log').delete().eq('id', visitorId);
        if (error) return errResponse(error.message);
        return jsonResponse({ ok: true });
      }

      // Handle field update (status, notes, etc.)
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (p.field === 'status' && p.value !== undefined) {
        update.status = String(p.value);
      } else {
        if (p.status !== undefined) update.status = String(p.status);
        if (p.notes  !== undefined) update.notes  = String(p.notes);
      }

      const { error } = await db.from('visitor_log').update(update).eq('id', visitorId);
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true });
    }

    // ── Seat Map ─────────────────────────────────────────────────
    case 'getSeatMap': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      // Query seat_map gracefully — return empty if table doesn't exist or is empty
      let members: Record<string, unknown>[] = [];
      try {
        const { data: seatRows, error } = await db
          .from('seat_map')
          .select('id, seat_number, member_id, updated_at')
          .order('seat_number', { ascending: true });

        if (!error && seatRows && (seatRows as unknown[]).length > 0) {
          const memberIds = (seatRows as Record<string, unknown>[])
            .map(s => s.member_id).filter(Boolean) as string[];

          const tlShort: Record<string, string> = { green: 'G', yellow: 'Y', red: 'R', black: 'B', none: '' };
          let memberMap: Record<string, { name: string; nick: string; team: string; tl: string }> = {};
          if (memberIds.length) {
            const { data: mem } = await db
              .from('v_member_dashboard')
              .select('id, name, nickname, mentor_team, traffic_light')
              .in('id', memberIds);
            for (const m of (mem || []) as Record<string, unknown>[]) {
              const rawTl = String(m.traffic_light || 'none');
              memberMap[String(m.id)] = {
                name: String(m.name),
                nick: String(m.nickname || ''),
                team: String(m.mentor_team || ''),
                tl:   tlShort[rawTl] ?? '',
              };
            }
          }

          members = (seatRows as Record<string, unknown>[]).map(s => ({
            seatNumber: s.seat_number,
            memberId:   s.member_id,
            memberName: s.member_id ? (memberMap[String(s.member_id)]?.name || null) : null,
            nick:       s.member_id ? (memberMap[String(s.member_id)]?.nick || null) : null,
            team:       s.member_id ? (memberMap[String(s.member_id)]?.team || null) : null,
            tl:         s.member_id ? (memberMap[String(s.member_id)]?.tl  || 'none') : 'none',
          }));
        }
      } catch {
        // Table may not exist yet — return empty map
      }

      return jsonResponse({ ok: true, members });
    }

    // ── Chapter Revenue ──────────────────────────────────────────
    case 'getChapterRevenue': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const { data: members, error } = await db
        .from('v_member_dashboard')
        .select('name, nickname, mentor_team, given_thb, received_thb, display_score, traffic_light')
        .eq('is_archived', false);
      if (error) return errResponse(error.message);

      const rows = (members || []) as Record<string, unknown>[];

      // Fetch chapter goal
      const { data: goalRow } = await db
        .from('chapter_revenue_goals')
        .select('target, goal_thb')
        .eq('goal_type', 'tyfcb')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const chapterGoal = goalRow
        ? (Number((goalRow as Record<string, unknown>).target)
          || Number((goalRow as Record<string, unknown>).goal_thb)
          || 1_000_000_000)
        : 1_000_000_000;

      // Per-team aggregates
      const teamMap: Record<string, {
        memberCount: number; totalRecv: number; totalGiven: number; totalScore: number; scoredCount: number;
      }> = {};
      for (const team of ALL_TEAMS) {
        teamMap[team] = { memberCount: 0, totalRecv: 0, totalGiven: 0, totalScore: 0, scoredCount: 0 };
      }

      let totalRecv = 0;
      const topAll: { name: string; nick: string; team: string; recv: number }[] = [];

      for (const m of rows) {
        const recv  = Number(m.received_thb) || 0;
        const given = Number(m.given_thb)    || 0;
        const score = Number(m.display_score) || 0;
        const team  = String(m.mentor_team || '');
        totalRecv += recv;
        topAll.push({ name: String(m.name), nick: String(m.nickname || ''), team, recv });

        if (team && teamMap[team]) {
          teamMap[team].memberCount++;
          teamMap[team].totalRecv  += recv;
          teamMap[team].totalGiven += given;
          if (score > 0) { teamMap[team].totalScore += score; teamMap[team].scoredCount++; }
        }
      }

      const totalMembers = rows.length;
      const fairShareGoal = totalMembers > 0 ? Math.round(chapterGoal / totalMembers) : chapterGoal;

      const teams = ALL_TEAMS.map(team => {
        const t = teamMap[team];
        const avgScore  = t.scoredCount ? Math.round(t.totalScore / t.scoredCount) : 0;
        const teamRecv  = t.totalRecv;
        const teamPct   = chapterGoal > 0 ? Math.round((teamRecv / chapterGoal) * 10000) / 100 : 0;
        const teamGap   = Math.max(0, chapterGoal - teamRecv);
        const allocPct  = totalMembers > 0 ? Math.round((t.memberCount / totalMembers) * 100) : 0;
        return {
          team,
          memberCount:   t.memberCount,
          totalRecv:     teamRecv,
          teamRecv,                    // alias for frontend compatibility
          totalGiven:    t.totalGiven,
          avgScore,
          chapterPct:    teamPct,
          chapterTarget: chapterGoal,  // full chapter goal (for display context)
          teamGoal:      Math.round(chapterGoal * (allocPct / 100)),  // team's proportional goal
          gap:           teamGap,
          allocPct,
        };
      });

      topAll.sort((a, b) => b.recv - a.recv);
      const topPerformers = topAll.slice(0, 5);

      // Members needing attention (low TYFCB received)
      const avgRecv = totalMembers > 0 ? totalRecv / totalMembers : 0;
      const needAttention = topAll
        .filter(m => m.recv < avgRecv * 0.5)  // below 50% of average
        .sort((a, b) => a.recv - b.recv)
        .slice(0, 10)
        .map(m => ({
          nick:    m.nick || m.name,
          name:    m.name,
          team:    m.team,
          recv:    m.recv,
          bniGoal: fairShareGoal,
          goalPct: fairShareGoal > 0 ? Math.round((m.recv / fairShareGoal) * 100) : 0,
        }));

      // Milestone markers
      const milestones = [
        { label: '25%',  emoji: '🌱', pct: 25,  reached: false },
        { label: '50%',  emoji: '🌿', pct: 50,  reached: false },
        { label: '75%',  emoji: '🌳', pct: 75,  reached: false },
        { label: '100%', emoji: '🏆', pct: 100, reached: false },
      ];

      // BNI year timing
      const { mElapsed, mRemain } = bniYearMonths();
      const runRate   = mElapsed > 0 ? totalRecv / mElapsed : 0;
      const projected = totalRecv + runRate * mRemain;
      const chapterPct = chapterGoal > 0 ? Math.round((totalRecv / chapterGoal) * 10000) / 100 : 0;
      const projectedPct = chapterGoal > 0 ? Math.round((projected / chapterGoal) * 10000) / 100 : 0;
      const gap = Math.max(0, chapterGoal - totalRecv);

      for (const ms of milestones) ms.reached = chapterPct >= ms.pct;

      return jsonResponse({
        ok: true,
        chapterGoal, totalRecv, chapterPct, gap,
        runRate: Math.round(runRate), mElapsed: Math.round(mElapsed * 10) / 10,
        mRemain: Math.round(mRemain * 10) / 10,
        projected: Math.round(projected), projectedPct,
        teams, topPerformers, needAttention, milestones,
      });
    }

    // ── Set Chapter Goal ─────────────────────────────────────────
    case 'setChapterGoal': {
      const auth = await requireAuth(db, p, ['mc', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);

      const goal = Number(p.goal);
      if (isNaN(goal) || goal <= 0) return errResponse('goal must be a positive number');

      const now = new Date();
      const row = {
        goal_type:  'tyfcb',
        target:     goal,
        goal_thb:   Math.round(goal),
        year:       now.getFullYear(),
        month:      now.getMonth() + 1,
        period:     'current',
        updated_at: new Date().toISOString(),
      };

      const { data: existing, error: findError } = await db
        .from('chapter_revenue_goals')
        .select('id')
        .eq('year', row.year)
        .eq('month', row.month)
        .eq('goal_type', 'tyfcb')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (findError) return errResponse(findError.message);

      const existingId = existing ? String((existing as Record<string, unknown>).id) : '';
      const { error } = existingId
        ? await db.from('chapter_revenue_goals').update(row).eq('id', existingId)
        : await db.from('chapter_revenue_goals').insert(row);
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true, goal });
    }

    // ── Sprint Board ─────────────────────────────────────────────
    case 'getSprintBoard': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const role     = String(p.role || '').toLowerCase();
      const isMC     = role === 'mc' || role === 'growth';
      const teamName = auth.teamName || TEAM_MAP[role] || null;

      const now = new Date();
      const curYear = now.getFullYear(), curMonth = now.getMonth() + 1;

      let query = db.from('sprint_board')
        .select('id, mentor_team, year, month, target, focus, pairs, status, updated_at')
        .order('year', { ascending: false })
        .order('month', { ascending: false });
      if (!isMC && teamName) query = query.eq('mentor_team', teamName);

      const { data, error } = await query;
      if (error) return errResponse(error.message);

      const sprints = (data || []).map((b: Record<string, unknown>) => ({
        id:        b.id,
        row:       b.id,   // frontend uses `s.row` for delete/update
        team:      b.mentor_team,
        year:      b.year,
        month:     b.month,
        target:    b.target,
        focus:     b.focus,
        pairs:     b.pairs,
        status:    b.status,
        updatedAt: b.updated_at,
      }));

      const currentSprint = sprints.filter(
        (s: Record<string, unknown>) => s.year === curYear && s.month === curMonth
      );
      return jsonResponse({ ok: true, sprints, currentSprint, curYear, curMonth });
    }

    // ── Save Sprint Plan ─────────────────────────────────────────
    case 'saveSprintPlan': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      // row-based update/delete (sprintUpdateStatus / sprintDelete in dashboard.html)
      if (p.row) {
        const rowId = String(p.row);
        if (p.field === 'delete') {
          const { error } = await db.from('sprint_board').delete().eq('id', rowId);
          if (error) return errResponse(error.message);
          return jsonResponse({ ok: true });
        }
        if (p.field === 'status') {
          const { error } = await db.from('sprint_board')
            .update({ status: String(p.value || 'pending'), updated_at: new Date().toISOString() })
            .eq('id', rowId);
          if (error) return errResponse(error.message);
          return jsonResponse({ ok: true });
        }
      }

      // New sprint creation: accepts `team` or `teamName`
      const role     = String(p.role || '').toLowerCase();
      const isMC     = role === 'mc' || role === 'growth';
      const teamName = p.team ? String(p.team)
        : isMC ? (p.teamName ? String(p.teamName) : (auth.teamName || 'ทุกทีม'))
        : (auth.teamName || TEAM_MAP[role] || '');

      const now = new Date();
      const year  = p.year  ? Number(p.year)  : now.getFullYear();
      const month = p.month ? Number(p.month) : now.getMonth() + 1;

      const { error } = await db.from('sprint_board').upsert({
        mentor_team: teamName,
        year,
        month,
        target:     p.target  != null ? Number(p.target)  : 0,
        focus:      p.focus   ? String(p.focus)   : null,
        pairs:      p.pairs   ? String(p.pairs)   : null,
        status:     p.status  ? String(p.status)  : 'pending',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'mentor_team,year,month' });
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true });
    }

    // ── Chapter Actions (all teams) ──────────────────────────────
    case 'getChapterActions': {
      const auth = await requireAuth(db, p, ['mc', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);

      const { data: members, error } = await db
        .from('v_member_dashboard')
        .select('name, nickname, mentor_team, display_score, traffic_light, absent, open_core_issue, rg, visitors, one_to_one, ceu, tyfcb_thb, bni_days')
        .eq('is_archived', false)
        .not('mentor_team', 'is', null);
      if (error) return errResponse(error.message);

      const actions = (members || []).map((m: Record<string, unknown>) => {
        const score       = Number(m.display_score) || 0;
        const tl          = String(m.traffic_light || 'none');
        const absent      = Number(m.absent) || 0;
        const hasOpenCase = !!m.open_core_issue;

        const alerts: { icon: string; text: string }[] = [];
        let topLevel = 'ok';

        if (hasOpenCase) { alerts.push({ icon: '📋', text: 'มี Core Issue ค้าง — อัปเดตให้ MC' }); if (topLevel === 'ok') topLevel = 'warning'; }
        if (absent >= 5) { alerts.push({ icon: '🚨', text: `ขาด ${absent} ครั้ง — ด่วน! ติดตามการขาดประชุม` }); topLevel = 'emergency'; }
        else if (absent >= 3) { alerts.push({ icon: '⚠️', text: `ขาด ${absent} ครั้ง — กระตุ้นให้ attend` }); if (topLevel === 'ok') topLevel = 'warning'; }
        if (score > 0 && score < 30) { alerts.push({ icon: '⚫', text: 'คะแนนต่ำมาก — นัด 1-2-1 ด่วน' }); topLevel = 'emergency'; }
        else if (score > 0 && score < 50) { alerts.push({ icon: '🔴', text: 'คะแนนต่ำกว่า 50 — เพิ่ม referral + visitor' }); if (topLevel === 'ok') topLevel = 'warning'; }

        if (!alerts.length) alerts.push({ icon: '✅', text: 'ทุกอย่างดี ไม่มี action ด่วนสัปดาห์นี้' });

        return {
          name:     String(m.name     || ''),
          nick:     String(m.nickname || m.name || ''),
          team:     m.mentor_team,
          score, tl, absent,
          topLevel,
          alerts,
        };
      }).filter(a => a.topLevel !== 'ok');

      // Sort: emergency first, then warning; within type by score asc
      const urgencyOrder: Record<string, number> = { emergency: 1, warning: 2, ok: 3 };
      actions.sort((a, b) => {
        const ua = urgencyOrder[String(a.topLevel)] || 9;
        const ub = urgencyOrder[String(b.topLevel)] || 9;
        if (ua !== ub) return ua - ub;
        return (Number(a.score) || 99) - (Number(b.score) || 99);
      });

      return jsonResponse({ ok: true, actions, total: actions.length });
    }

    // ── Referral Flow ────────────────────────────────────────────
    case 'getReferralFlow': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const { data: members, error } = await db
        .from('v_member_dashboard')
        .select('name, nickname, mentor_team, rg, rr, received_thb, given_thb')
        .eq('is_archived', false);
      if (error) return errResponse(error.message);

      const tData: Record<string, { rg: number; rr: number; recv: number; memberCount: number }> = {};
      for (const team of ALL_TEAMS) tData[team] = { rg: 0, rr: 0, recv: 0, memberCount: 0 };

      const imbalanced: { nick: string; firstName: string; team: string; refIn: number; refOut: number }[] = [];

      for (const m of (members || []) as Record<string, unknown>[]) {
        const team = String(m.mentor_team || '');
        const rg   = Number(m.rg) || 0;
        const rr   = Number(m.rr) || 0;
        const recv = Number(m.received_thb) || 0;
        if (team && tData[team]) {
          tData[team].rg          += rg;
          tData[team].rr          += rr;
          tData[team].recv        += recv;
          tData[team].memberCount += 1;
        }
        if (rg > 0 && rr > rg * 2) {
          imbalanced.push({ nick: String(m.nickname || ''), firstName: String(m.name || ''), team, refIn: rr, refOut: rg });
        }
      }

      const teamStats = ALL_TEAMS.map(team => ({
        team, memberCount: tData[team].memberCount,
        refOut: tData[team].rg, refIn: tData[team].rr, recv: tData[team].recv,
      }));

      // Estimate cross-team flow: each team's RG distributed proportionally to other teams' sizes
      const chapterRG  = teamStats.reduce((s, t) => s + t.refOut, 0);
      const flow: { fromTeam: string; toTeam: string; refCount: number }[] = [];
      if (chapterRG > 0) {
        for (const from of teamStats) {
          for (const to of teamStats) {
            if (from.team === to.team) continue;
            const est = Math.round(from.refOut * (to.memberCount / (members?.length || 1)));
            if (est > 0) flow.push({ fromTeam: from.team, toTeam: to.team, refCount: est });
          }
        }
        flow.sort((a, b) => b.refCount - a.refCount);
      }

      imbalanced.sort((a, b) => (b.refIn - b.refOut) - (a.refIn - a.refOut));
      return jsonResponse({ ok: true, teamStats, flow, imbalanced: imbalanced.slice(0, 10) });
    }

    default:
      return errResponse(`Unknown meetings action: ${action}`);
  }
}

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
        .select('name, nickname, mentor_team, display_score, traffic_light, absent, rg, visitors, one_to_one, ceu, tyfcb_thb, bni_days, open_core_issue')
        .eq('is_archived', false);
      if (mErr) return errResponse(mErr.message);

      const rows = (members || []) as Record<string, unknown>[];

      // Summary counts
      let green = 0, yellow = 0, red = 0, black = 0, totalScore = 0, scoredCount = 0;
      for (const m of rows) {
        const tl    = String(m.traffic_light || 'none');
        const score = Number(m.display_score) || 0;
        if (tl === 'green')  green++;
        else if (tl === 'yellow') yellow++;
        else if (tl === 'red')   red++;
        else if (tl === 'black') black++;
        if (score > 0) { totalScore += score; scoredCount++; }
      }
      const avgScore = scoredCount ? Math.round(totalScore / scoredCount) : 0;

      // Risk members: red/black TL or absent > 4, sorted by absent desc
      const riskMembers = rows
        .filter(m => {
          const tl     = String(m.traffic_light || 'none');
          const absent = Number(m.absent) || 0;
          return tl === 'red' || tl === 'black' || absent > 4;
        })
        .sort((a, b) => (Number(b.absent) || 0) - (Number(a.absent) || 0))
        .map(m => ({
          name:    m.name,    nick:    m.nickname,
          team:    m.mentor_team, score: Number(m.display_score) || 0,
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

      // Enrich with inviter name
      const inviterIds = [...new Set(
        (visitorRows || []).map((v: Record<string, unknown>) => v.invited_by).filter(Boolean)
      )] as string[];
      let inviterMap: Record<string, string> = {};
      if (inviterIds.length) {
        const { data: inv } = await db.from('members').select('id, name').in('id', inviterIds);
        for (const i of (inv || []) as Record<string, unknown>[]) {
          inviterMap[String(i.id)] = String(i.name);
        }
      }

      const visitors = (visitorRows || []).map((v: Record<string, unknown>) => ({
        id:          v.id,
        visitorName: v.visitor_name,
        invitedBy:   v.invited_by ? (inviterMap[String(v.invited_by)] || null) : null,
        visitDate:   v.visit_date,
        status:      v.status,
        notes:       v.notes,
      }));

      // Open core issues
      const { data: caseRows } = await db
        .from('core_issues')
        .select('id, member_id, mentor_team, issue_text, opened_at, updated_at')
        .eq('status', 'open')
        .order('opened_at', { ascending: true });

      // Enrich open cases with member name
      const caseIds = [...new Set(
        (caseRows || []).map((c: Record<string, unknown>) => c.member_id).filter(Boolean)
      )] as string[];
      let memberMap: Record<string, string> = {};
      if (caseIds.length) {
        const { data: caseMembers } = await db.from('members').select('id, name').in('id', caseIds);
        for (const cm of (caseMembers || []) as Record<string, unknown>[]) {
          memberMap[String(cm.id)] = String(cm.name);
        }
      }

      const openCases = (caseRows || []).map((c: Record<string, unknown>) => ({
        id:         c.id,
        memberName: memberMap[String(c.member_id)] || String(c.member_id),
        team:       c.mentor_team,
        issueText:  c.issue_text,
        openedAt:   c.opened_at,
        updatedAt:  c.updated_at,
        ageDays:    Math.floor((Date.now() - new Date(String(c.opened_at)).getTime()) / 86400000),
      }));

      return jsonResponse({
        ok: true,
        summary:     { total: rows.length, green, yellow, red, black, avgScore },
        riskMembers,
        visitors,
        openCases,
        memberCount: rows.length,
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

      return jsonResponse({ ok: true, members: membersList, withVisitor, noVisitor, recentLog });
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

      const log = (rows || []).map((v: Record<string, unknown>) => ({
        id:          v.id,
        visitorName: v.visitor_name,
        invitedBy:   v.invited_by ? (invMap[String(v.invited_by)] || null) : null,
        visitDate:   v.visit_date,
        status:      v.status,
        notes:       v.notes,
        createdAt:   v.created_at,
      }));

      return jsonResponse({ ok: true, log });
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

      const visitorId = String(p.visitorId || '');
      if (!visitorId) return errResponse('visitorId required');

      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (p.status !== undefined) update.status = String(p.status);
      if (p.notes  !== undefined) update.notes  = String(p.notes);

      const { error } = await db.from('visitor_log').update(update).eq('id', visitorId);
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true });
    }

    // ── Seat Map ─────────────────────────────────────────────────
    case 'getSeatMap': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      // Query seat_map gracefully — return empty if table doesn't exist or is empty
      let seats: Record<string, unknown>[] = [];
      try {
        const { data: seatRows, error } = await db
          .from('seat_map')
          .select('id, seat_number, member_id, updated_at')
          .order('seat_number', { ascending: true });

        if (!error && seatRows && (seatRows as unknown[]).length > 0) {
          const memberIds = (seatRows as Record<string, unknown>[])
            .map(s => s.member_id).filter(Boolean) as string[];

          let memberMap: Record<string, { name: string; nick: string }> = {};
          if (memberIds.length) {
            const { data: mem } = await db.from('members').select('id, name, nickname').in('id', memberIds);
            for (const m of (mem || []) as Record<string, unknown>[]) {
              memberMap[String(m.id)] = { name: String(m.name), nick: String(m.nickname || '') };
            }
          }

          seats = (seatRows as Record<string, unknown>[]).map(s => ({
            seatNumber: s.seat_number,
            memberId:   s.member_id,
            memberName: s.member_id ? (memberMap[String(s.member_id)]?.name || null) : null,
            nick:       s.member_id ? (memberMap[String(s.member_id)]?.nick || null) : null,
          }));
        }
      } catch {
        // Table may not exist yet — return empty map
      }

      return jsonResponse({ ok: true, seats });
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
        .select('target')
        .eq('goal_type', 'tyfcb')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const chapterGoal = goalRow
        ? (Number((goalRow as Record<string, unknown>).target) || 1_000_000_000)
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

      const teams = ALL_TEAMS.map(team => {
        const t = teamMap[team];
        const avgScore = t.scoredCount ? Math.round(t.totalScore / t.scoredCount) : 0;
        return {
          team, memberCount: t.memberCount, totalRecv: t.totalRecv,
          totalGiven: t.totalGiven, avgScore,
          chapterPct: chapterGoal > 0 ? Math.round((t.totalRecv / chapterGoal) * 10000) / 100 : 0,
        };
      });

      topAll.sort((a, b) => b.recv - a.recv);
      const topPerformers = topAll.slice(0, 5);

      // BNI year timing
      const { mElapsed, mRemain } = bniYearMonths();
      const runRate   = mElapsed > 0 ? totalRecv / mElapsed : 0;
      const projected = totalRecv + runRate * mRemain;
      const chapterPct = chapterGoal > 0 ? Math.round((totalRecv / chapterGoal) * 10000) / 100 : 0;
      const projectedPct = chapterGoal > 0 ? Math.round((projected / chapterGoal) * 10000) / 100 : 0;
      const gap = Math.max(0, chapterGoal - totalRecv);

      return jsonResponse({
        ok: true,
        chapterGoal, totalRecv, chapterPct, gap,
        runRate: Math.round(runRate), mElapsed: Math.round(mElapsed * 10) / 10,
        mRemain: Math.round(mRemain * 10) / 10,
        projected: Math.round(projected), projectedPct,
        teams, topPerformers,
      });
    }

    // ── Set Chapter Goal ─────────────────────────────────────────
    case 'setChapterGoal': {
      const auth = await requireAuth(db, p, ['mc', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);

      const goal = Number(p.goal);
      if (isNaN(goal) || goal <= 0) return errResponse('goal must be a positive number');

      const { error } = await db.from('chapter_revenue_goals').upsert({
        goal_type:  'tyfcb',
        target:     goal,
        period:     'current',
        updated_at: new Date().toISOString(),
      });
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

      let query = db.from('sprint_board').select('id, mentor_team, plan_data, updated_at');
      if (!isMC && teamName) {
        query = query.eq('mentor_team', teamName);
      }

      const { data, error } = await query.order('mentor_team', { ascending: true });
      if (error) return errResponse(error.message);

      const boards = (data || []).map((b: Record<string, unknown>) => ({
        team:      b.mentor_team,
        planData:  b.plan_data,
        updatedAt: b.updated_at,
      }));

      return jsonResponse({ ok: true, boards });
    }

    // ── Save Sprint Plan ─────────────────────────────────────────
    case 'saveSprintPlan': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      // MC can specify any team; mentor uses their own team
      const role     = String(p.role || '').toLowerCase();
      const isMC     = role === 'mc' || role === 'growth';
      const teamName = isMC
        ? (p.teamName ? String(p.teamName) : (auth.teamName || ''))
        : (auth.teamName || TEAM_MAP[role] || '');

      if (!teamName) return errResponse('teamName required');

      const planData = p.planData !== undefined ? p.planData : {};

      const { error } = await db.from('sprint_board').upsert({
        mentor_team: teamName,
        plan_data:   planData,
        updated_at:  new Date().toISOString(),
      }, { onConflict: 'mentor_team' });
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
        const score      = Number(m.display_score) || 0;
        const tl         = String(m.traffic_light || 'none');
        const absent     = Number(m.absent) || 0;
        const hasOpenCase = !!m.open_core_issue;

        const priorities: { type: string; title: string; action: string }[] = [];

        if (hasOpenCase) priorities.push({
          type: 'warning', title: '📋 มี Core Issue ค้าง', action: 'อัปเดตความคืบหน้าให้ MC',
        });
        if (absent >= 5) priorities.push({
          type: 'emergency', title: `⚠️ ขาด ${absent} ครั้ง`, action: 'ด่วน! ติดตามการขาดประชุม',
        });
        else if (absent >= 3) priorities.push({
          type: 'warning', title: `⚠️ ขาด ${absent} ครั้ง`, action: 'กระตุ้นให้ attend',
        });
        if (score > 0 && score < 30) priorities.push({
          type: 'emergency', title: '⚫ คะแนนต่ำมาก', action: 'นัด 1-2-1 ด่วน + วางแผน',
        });
        else if (score > 0 && score < 50) priorities.push({
          type: 'warning', title: '🔴 คะแนนต่ำกว่า 50', action: 'เพิ่ม referral และ visitor',
        });
        if (!priorities.length) priorities.push({
          type: 'ok', title: '✅ ทุกอย่างดี', action: 'ไม่มี action ด่วนสัปดาห์นี้',
        });

        const top = priorities[0];
        return {
          name:      m.name,  nick:      m.nickname,
          team:      m.mentor_team, score, tl, absent,
          topType:   top.type, topTitle: top.title, topAction: top.action,
        };
      });

      // Sort: emergency first, then warning, then ok; within type by score asc
      const urgencyOrder: Record<string, number> = { emergency: 1, warning: 2, ok: 3 };
      actions.sort((a, b) => {
        const ua = urgencyOrder[String(a.topType)] || 9;
        const ub = urgencyOrder[String(b.topType)] || 9;
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
        .select('name, nickname, mentor_team, rg, received_thb, given_thb, one_to_one')
        .eq('is_archived', false);
      if (error) return errResponse(error.message);

      const teamStats: Record<string, {
        totalRG: number; totalRecv: number; totalGiven: number;
        totalOTO: number; memberCount: number;
      }> = {};
      for (const team of ALL_TEAMS) {
        teamStats[team] = { totalRG: 0, totalRecv: 0, totalGiven: 0, totalOTO: 0, memberCount: 0 };
      }

      for (const m of (members || []) as Record<string, unknown>[]) {
        const team = String(m.mentor_team || '');
        if (!team || !teamStats[team]) continue;
        teamStats[team].totalRG    += Number(m.rg) || 0;
        teamStats[team].totalRecv  += Number(m.received_thb) || 0;
        teamStats[team].totalGiven += Number(m.given_thb) || 0;
        teamStats[team].totalOTO   += Number(m.one_to_one) || 0;
        teamStats[team].memberCount++;
      }

      const flow = ALL_TEAMS.map(team => {
        const t = teamStats[team];
        return {
          team, totalRG: t.totalRG, totalRecv: t.totalRecv,
          totalGiven: t.totalGiven, memberCount: t.memberCount,
          avgRG: t.memberCount ? Math.round((t.totalRG / t.memberCount) * 10) / 10 : 0,
        };
      });

      return jsonResponse({ ok: true, flow });
    }

    default:
      return errResponse(`Unknown meetings action: ${action}`);
  }
}

// Handler: growth — getRiskMembers, getWeeklyActions, getGrowthData, etc.
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';
import { getMentorActivityData } from './dashboard.ts';

const TEAM_ROLE: Record<string, string> = {
  toomtam: 'TOOMTAM', aof: 'Aof', draft: 'Draft', phai: 'PHAI', amp: 'AMP',
};

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
        const latest = scores[0];
        const peak   = scores[streak]; // highest before the streak
        risks.push({
          name: m.name, nick: m.nickname, team: m.mentor_team,
          score: latest, tl: String(m.traffic_light || 'none'),
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
        .select('name, nickname, mentor_team, display_score, traffic_light, given_thb, received_thb, absent, rg, visitors, one_to_one, ceu, bni_days')
        .eq('is_archived', false)
        .order('display_score', { ascending: true });
      if (error) return errResponse(error.message);

      const members = (rows || []).map((m: Record<string, unknown>) => ({
        name: m.name, nick: m.nickname, mentor: m.mentor_team,
        score: Number(m.display_score) || 0, tl: String(m.traffic_light || 'none'),
        given: Number(m.given_thb) || 0, recv: Number(m.received_thb) || 0,
        absent: Number(m.absent) || 0, rg: Number(m.rg) || 0,
        visitors: Number(m.visitors) || 0, oToOne: Number(m.one_to_one) || 0,
        ceu: Number(m.ceu) || 0, bniDays: Number(m.bni_days) || 0,
      }));

      return jsonResponse({ ok: true, members });
    }

    // ── Mentor Activity + Performance (Growth can view) ───────
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

    // ── Stubs ─────────────────────────────────────────────────
    case 'updateGrowthMember':
    case 'addGrowthMember':
    case 'moveGrowthMember':
    case 'getGrowthPowerTeams':
    case 'monthlySync':
      return jsonResponse({ ok: true, message: 'not yet implemented' });

    default:
      return errResponse(`Unknown growth action: ${action}`);
  }
}

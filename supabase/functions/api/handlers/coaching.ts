// Handler: coaching — saveCoreIssue, getCoachingGuide, saveMentorLog, getMentorLogs
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';
import { memberAccessError, resolveMemberAccess } from '../../_shared/authorization.ts';

export async function handleCoaching(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    case 'saveCoreIssue': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || p.name || '').trim();
      const issueText  = String(p.issue || p.coreIssue || p.issueText || '').trim();
      const statusVal  = String(p.status || 'open');
      const actionTaken= String(p.actionTaken || p.action_taken || '').trim() || null;
      const followUpAt = String(p.followUpAt || p.follow_up_at || '').trim() || null;

      if (!memberName || !issueText) return errResponse('memberName and issue required');
      if (issueText === '__other__') return errResponse('กรุณาระบุเหตุผลอื่น ๆ ให้ชัดเจน');
      if (issueText.length > 300) return errResponse('เหตุผลต้องไม่เกิน 300 ตัวอักษร');

      // Look up member id
      const lookup = await resolveMemberAccess(db, p);
      if (!lookup.member) return errResponse(lookup.error!);
      const denied = memberAccessError(auth, lookup.member);
      if (denied) return errResponse(denied, 403);
      const memberId = lookup.member.id;

      // Check existing open issue
      const { data: existing } = await db.from('core_issues')
        .select('id').eq('member_id', memberId).eq('status', 'open').single();

      const actionPlan = String(p.plan || p.actionPlan || p.action_plan || '').trim() || null;

      if (existing) {
        const { error } = await db.from('core_issues')
          .update({
            issue_text: issueText,
            action_taken: actionTaken,
            action_plan: actionPlan,
            follow_up_at: followUpAt,
            status: statusVal,
            updated_at: new Date().toISOString(),
          })
          .eq('id', String((existing as Record<string, unknown>).id));
        if (error) return errResponse(error.message);
      } else {
        const { error } = await db.from('core_issues').insert({
          member_id: memberId,
          mentor_team: lookup.member.mentorTeam,
          issue_text: issueText,
          action_taken: actionTaken,
          action_plan: actionPlan,
          follow_up_at: followUpAt,
          status: 'open',
        });
        if (error) return errResponse(error.message);
      }

      return jsonResponse({ ok: true });
    }

    case 'getMemberTimeline': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || p.name || '').trim();
      if (!memberName) return errResponse('memberName required');

      const { data: member } = await db.from('members')
        .select('id, mentor_team').eq('name', memberName).maybeSingle();
      if (!member) return jsonResponse({ ok: true, events: [] });

      const memberId = String((member as Record<string, unknown>).id);
      const memberTeam = String((member as Record<string, unknown>).mentor_team || '');
      if (!auth.isMC && auth.teamName && auth.teamName !== memberTeam) {
        return errResponse('ไม่มีสิทธิ์ดูข้อมูลสมาชิกทีมอื่น');
      }

      const [issuesRes, logsRes, oneRes, renewalRes, assignmentsRes] = await Promise.all([
        db.from('core_issues')
          .select('id, issue_text, action_taken, action_plan, mc_reply, replied_at, status, opened_at, closed_at, follow_up_at')
          .eq('member_id', memberId).order('opened_at', { ascending: false }).limit(30),
        db.from('mentor_logs')
          .select('id, session_date, notes, next_actions, created_at')
          .eq('member_id', memberId).order('created_at', { ascending: false }).limit(30),
        db.from('one_to_one_logs')
          .select('id, notes, outcome, met_at, created_at')
          .eq('initiator_id', memberId).order('created_at', { ascending: false }).limit(30),
        db.from('renewal_events')
          .select('id, from_status, to_status, reason, actor_role, created_at')
          .eq('member_id', memberId).order('created_at', { ascending: false }).limit(30),
        db.from('mc_assignments')
          .select('id, assignment_text, due_date, acknowledged_at, created_at')
          .eq('member_id', memberId).order('created_at', { ascending: false }).limit(30),
      ]);

      const events: Record<string, unknown>[] = [];
      for (const row of (issuesRes.data || []) as Record<string, unknown>[]) {
        events.push({
          id: row.id, type: 'report', icon: '📝', title: String(row.issue_text || 'Core Issue'),
          detail: String(row.action_taken || row.action_plan || ''),
          status: String(row.status || 'open'), at: row.opened_at,
        });
        if (row.mc_reply) events.push({
          id: `${row.id}-reply`, type: 'reply', icon: '💬', title: 'MC ตอบกลับรายงาน',
          detail: String(row.mc_reply), status: 'replied', at: row.replied_at || row.opened_at,
        });
      }
      for (const row of (logsRes.data || []) as Record<string, unknown>[]) events.push({
        id: row.id, type: 'mentor_log', icon: '📓', title: String(row.notes || 'Mentor Activity'),
        detail: String(row.next_actions || ''), status: 'logged', at: row.created_at || row.session_date,
      });
      for (const row of (oneRes.data || []) as Record<string, unknown>[]) events.push({
        id: row.id, type: 'one_to_one', icon: '🤝', title: 'บันทึก 1-2-1',
        detail: [row.notes, row.outcome].filter(Boolean).join(' · '), status: 'logged',
        at: row.met_at || row.created_at,
      });
      for (const row of (renewalRes.data || []) as Record<string, unknown>[]) events.push({
        id: row.id, type: 'renewal', icon: '💳',
        title: `Renewal: ${String(row.from_status || 'เริ่มต้น')} → ${String(row.to_status || '')}`,
        detail: String(row.reason || `อัปเดตโดย ${String(row.actor_role || '')}`),
        status: String(row.to_status || ''), at: row.created_at,
      });
      for (const row of (assignmentsRes.data || []) as Record<string, unknown>[]) events.push({
        id: row.id, type: 'assignment', icon: '📌', title: String(row.assignment_text || 'งานจาก MC'),
        detail: row.due_date ? `กำหนด ${String(row.due_date)}` : '',
        status: row.acknowledged_at ? 'done' : 'pending', at: row.created_at,
      });

      events.sort((a, b) => new Date(String(b.at || 0)).getTime() - new Date(String(a.at || 0)).getTime());
      return jsonResponse({ ok: true, events: events.slice(0, 80) });
    }

    case 'getCoachingGuide': {
      const memberName = String(p.memberName || p.name || '').trim();
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);

      // List mode: no memberName → return guides[] for caller's whole team
      if (!memberName) {
        const teamFilter = auth.isMC || auth.role === 'growth'
          ? String(p.teamName || '').trim()
          : String(auth.teamName || '');
        let q = db.from('v_member_dashboard')
          .select('name, nickname, mentor_team, display_score, traffic_light, rg, visitors, one_to_one, ceu, tyfcb_thb, bni_days, absent, palms_detail, open_core_issue')
          .eq('is_archived', false)
          .order('display_score', { ascending: true });
        if (teamFilter) q = q.eq('mentor_team', teamFilter);
        const { data: rows, error: rowErr } = await q;
        if (rowErr) return errResponse(rowErr.message);
        const fmtThb2 = (v: number) => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? Math.round(v / 1000) + 'K' : String(Math.round(v));
        const guides = ((rows || []) as Record<string, unknown>[]).map(mv => {
          const score = Number(mv.display_score) || 0;
          const tl = String(mv.traffic_light || 'none');
          const pd = (mv.palms_detail || {}) as Record<string, unknown>;
          const cats = Object.keys(pd).length > 0 ? {
            absent: Number(pd.absence) || 0, ref: Number(pd.referral) || 0,
            tyfcb: Number(pd.tyfb) || 0, visitor: Number(pd.visitor) || 0,
            one21: Number(pd.oneToOne) || 0, training: Number(pd.ceu) || 0,
          } : null;
          const status = score >= 70 ? 'good' : score >= 50 ? 'attention' : score >= 30 ? 'warning' : 'critical';

          const bniDays = Number(mv.bni_days) || 0;
          const wks2    = Math.max(1, Math.min(26, Math.floor(bniDays / 7)));
          const mos2    = Math.max(1, wks2 / 4);
          const absCnt  = Number(mv.absent)     || 0;
          const rgCnt   = Number(mv.rg)         || 0;
          const visCnt  = Number(mv.visitors)   || 0;
          const otoCnt  = Number(mv.one_to_one) || 0;
          const ceuCnt  = Number(mv.ceu)        || 0;
          const tyfcbAmt= Number(mv.tyfcb_thb)  || 0;

          type FA2 = { icon: string; cat: string; action: string; gain: number; curVal: string; tgtVal: string };
          const fastestActions: FA2[] = [];
          if (cats) {
            if (cats.absent   < 15) fastestActions.push({ icon: '📅', cat: 'ลดการขาด',    gain: 5,                       action: 'ลดการขาดประชุม',                 curVal: `ขาด ${absCnt} ครั้ง`,                            tgtVal: 'ขาด 0 ครั้ง' });
            if (cats.ref      < 15) fastestActions.push({ icon: '💡', cat: 'Referral',     gain: cats.ref === 0 ? 10 : 5, action: 'ให้ Referral เพิ่มขึ้น',          curVal: `${(rgCnt / wks2).toFixed(1)} ใบ/สัปดาห์`,       tgtVal: cats.ref === 0 ? '1 ใบ/สัปดาห์' : '2 ใบ/สัปดาห์' });
            if (cats.visitor  < 20) fastestActions.push({ icon: '👥', cat: 'Visitor',      gain: 10,                      action: 'พาคนนอกมาเยี่ยม Chapter',         curVal: `${visCnt} คน (${(visCnt / mos2).toFixed(1)}/เดือน)`, tgtVal: '≥1 คน/เดือน' });
            if (cats.one21    < 15) fastestActions.push({ icon: '🤝', cat: '1-2-1',        gain: 5,                       action: 'เพิ่มการนัด 1-2-1',                 curVal: `${(otoCnt / wks2).toFixed(1)} ครั้ง/สัปดาห์`,   tgtVal: '1 ครั้ง/สัปดาห์' });
            if (cats.training < 20) fastestActions.push({ icon: '📚', cat: 'CEU/Training', gain: 5,                       action: 'เข้าร่วม Training / CEU เพิ่ม',     curVal: `${ceuCnt} CEU`,                                   tgtVal: '4+ CEU' });
            if (cats.tyfcb    < 15) fastestActions.push({ icon: '💰', cat: 'TYFCB',        gain: 5,                       action: 'เพิ่ม Closed Business',             curVal: `฿${fmtThb2(tyfcbAmt)}`,                          tgtVal: '฿500K' });
            fastestActions.sort((a, b) => b.gain - a.gain);
            fastestActions.splice(4);
          }
          const nextTl2 = score >= 70 ? 'green' : score >= 50 ? 'yellow' : score >= 30 ? 'yellow' : 'red';
          const needed2 = score >= 70 ? 0 : score >= 50 ? 70 - score : score >= 30 ? 50 - score : 30 - score;

          return {
            name: mv.name, nick: mv.nickname, mentor: mv.mentor_team, score, tl,
            bniTl: tl, bniScore: score, status, noData: score === 0,
            coreIssue: mv.open_core_issue || null, cats, palms: mv.palms_detail,
            fastTrack: {
              score: { tl, total: score, absent: cats?.absent ?? 0, ref: cats?.ref ?? 0, tyfcb: cats?.tyfcb ?? 0, visitor: cats?.visitor ?? 0, one21: cats?.one21 ?? 0, training: cats?.training ?? 0 },
              nextTl: nextTl2, needed: needed2, fastestActions, gaps: fastestActions,
            },
          };
        });
        return jsonResponse({ ok: true, guides });
      }

      const lookup = await resolveMemberAccess(db, p);
      if (!lookup.member) return errResponse(lookup.error!);
      const denied = memberAccessError(auth, lookup.member);
      if (denied) return errResponse(denied, 403);

      const { data: m } = await db.from('v_member_dashboard')
        .select('name, nickname, mentor_team, display_score, traffic_light, rg, visitors, one_to_one, ceu, tyfcb_thb, bni_days, absent, palms_detail, open_core_issue')
        .eq('name', memberName).single();
      if (!m) return errResponse(`ไม่พบ "${memberName}"`);
      const mv = m as Record<string, unknown>;

      const score  = Number(mv.display_score) || 0;
      const bniDays = Number(mv.bni_days) || 0;
      const weeks  = bniDays > 0 ? Math.min(26, Math.max(1, Math.floor(bniDays / 7))) : 1;

      const absent  = Number(mv.absent) || 0;
      const rg      = Number(mv.rg) || 0;
      const vis     = Number(mv.visitors) || 0;
      const oto     = Number(mv.one_to_one) || 0;
      const ceu     = Number(mv.ceu) || 0;
      const tyfcb   = Number(mv.tyfcb_thb) || 0;
      const wks     = Math.max(1, Math.floor(bniDays / 7));
      const mos     = Math.max(1, wks / 4);
      const fmt     = (v: number) => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? Math.round(v / 1000) + 'K' : String(Math.round(v));

      const pd   = (mv.palms_detail || {}) as Record<string, unknown>;
      const cats = Object.keys(pd).length > 0 ? {
        absent:   Number(pd.absence)  || 0, ref:      Number(pd.referral) || 0,
        tyfcb:    Number(pd.tyfb)     || 0, visitor:  Number(pd.visitor)  || 0,
        one21:    Number(pd.oneToOne) || 0, training: Number(pd.ceu)      || 0,
      } : null;

      const fastestActions: { icon: string; cat: string; action: string; gain: number; curVal: string; tgtVal: string }[] = [];
      if (cats) {
        if (cats.absent < 15) fastestActions.push({ icon: '📅', cat: 'ลดการขาด', gain: 5, action: 'ลดการขาดประชุม', curVal: `ขาด ${absent} ครั้ง`, tgtVal: 'ขาด 0 ครั้ง' });
        if (cats.ref < 15) fastestActions.push({ icon: '💡', cat: 'Referral', gain: cats.ref === 0 ? 10 : 5, action: 'ให้ Referral เพิ่มขึ้น', curVal: `${(rg / wks).toFixed(1)} ใบ/สัปดาห์`, tgtVal: cats.ref === 0 ? '1 ใบ/สัปดาห์' : '2 ใบ/สัปดาห์' });
        if (cats.visitor < 20) fastestActions.push({ icon: '👥', cat: 'Visitor', gain: 10, action: 'พาคนนอกมาเยี่ยม Chapter', curVal: `${vis} คน (${(vis / mos).toFixed(1)}/เดือน)`, tgtVal: '≥1 คน/เดือน' });
        if (cats.one21 < 15) fastestActions.push({ icon: '🤝', cat: '1-2-1', gain: 5, action: 'เพิ่มการนัด 1-2-1', curVal: `${(oto / wks).toFixed(1)} ครั้ง/สัปดาห์`, tgtVal: '1 ครั้ง/สัปดาห์' });
        if (cats.training < 20) fastestActions.push({ icon: '📚', cat: 'CEU/Training', gain: 5, action: 'เข้าร่วม Training / CEU เพิ่ม', curVal: `${ceu} CEU`, tgtVal: '4+ CEU' });
        if (cats.tyfcb < 15) fastestActions.push({ icon: '💰', cat: 'TYFCB', gain: 5, action: 'เพิ่ม Closed Business', curVal: `฿${fmt(tyfcb)}`, tgtVal: '฿500K' });
        fastestActions.sort((a, b) => b.gain - a.gain);
        fastestActions.splice(4);
      }

      const nextTl = score >= 70 ? 'green' : score >= 50 ? 'yellow' : score >= 30 ? 'yellow' : 'red';
      const needed = score >= 70 ? 0 : score >= 50 ? 70 - score : score >= 30 ? 50 - score : 30 - score;
      const tl     = String(mv.traffic_light || 'none');
      const status = score >= 70 ? 'good' : score >= 50 ? 'attention' : score >= 30 ? 'warning' : 'critical';

      const fastTrack = {
        score: { tl, total: score, absent: cats?.absent ?? 0, ref: cats?.ref ?? 0, tyfcb: cats?.tyfcb ?? 0, visitor: cats?.visitor ?? 0, one21: cats?.one21 ?? 0, training: cats?.training ?? 0 },
        nextTl, needed, gaps: fastestActions, fastestActions,
      };

      return jsonResponse({
        ok: true, status,
        name: mv.name, nick: mv.nickname, mentor: mv.mentor_team,
        score, tl, palms: mv.palms_detail, cats,
        coreIssue: mv.open_core_issue || null,
        fastTrack, weeks,
      });
    }

    case 'saveMentorLog': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || p.menteeName || p.name || '').trim();
      // Frontend sends activity (type) and notes (extra comments) separately.
      // Store activity in `notes` column (displayed as activity) and notes in `next_actions`.
      const notes      = String(p.activity || p.notes || '').trim();
      const nextActions= String(p.nextActions || (p.activity ? String(p.notes || '') : '') || '').trim();
      if (!memberName) return errResponse('memberName required');

      const lookup = await resolveMemberAccess(db, p);
      if (!lookup.member) return errResponse(lookup.error!);
      const denied = memberAccessError(auth, lookup.member);
      if (denied) return errResponse(denied, 403);

      const { error } = await db.from('mentor_logs').insert({
        member_id: lookup.member.id,
        mentor_team: lookup.member.mentorTeam,
        session_date: new Date().toISOString().split('T')[0],
        notes, next_actions: nextActions,
      });
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    case 'getMentorLogs': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);

      let query = db.from('mentor_logs')
        .select('id, mentor_team, session_date, notes, next_actions, created_at, members(name, nickname)')
        .order('session_date', { ascending: false })
        .limit(100);

      // Filter by team unless MC
      if (!auth.isMC && auth.teamName) {
        query = query.eq('mentor_team', auth.teamName);
      }

      // Filter by mentee name if provided
      const menteeFilter = String(p.menteeName || '').trim();
      if (menteeFilter) {
        const { data: mRow } = await db.from('members').select('id').ilike('name', `%${menteeFilter}%`).limit(1).single();
        if (mRow) query = query.eq('member_id', String((mRow as Record<string, unknown>).id));
      }

      const { data, error } = await query;
      if (error) return errResponse(error.message);

      type LogRow = { id: string; mentor_team: string; session_date: string; notes: string | null; next_actions: string | null; created_at: string; members: { name: string; nickname: string | null } | null };
      const logs = ((data || []) as unknown as LogRow[]).map((row) => {
        const dateStr = row.session_date || row.created_at || '';
        const d = new Date(dateStr);
        const week = isNaN(d.getTime()) ? '' : `${d.getFullYear()}-W${String(Math.ceil((d.getMonth() * 4.33 + Math.ceil(d.getDate() / 7)))).padStart(2, '0')}`;
        return {
          id:          row.id,
          date:        dateStr.split('T')[0] || dateStr,
          mentorName:  row.mentor_team,
          menteeName:  row.members?.name ?? '—',
          menteeNick:  row.members?.nickname ?? '',
          team:        row.mentor_team,
          week,
          activity:    row.notes || '—',
          notes:       row.next_actions || '',
          createdAt:   row.created_at,
        };
      });

      return jsonResponse({ ok: true, logs });
    }

    case 'save90DayReview': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);

      // Accept both `menteeName` (from frontend) and `memberName` (canonical)
      const memberName = String(p.menteeName || p.memberName || '').trim();
      const mentorName = String(p.mentorName || '').trim();
      if (!memberName) return errResponse('menteeName required');
      const lookup = await resolveMemberAccess(db, p);
      if (!lookup.member) return errResponse(lookup.error!);
      const denied = memberAccessError(auth, lookup.member);
      if (denied) return errResponse(denied, 403);

      // Pack flat fields into content JSONB, or accept pre-packed content
      const content = p.content && typeof p.content === 'object' ? p.content : {
        mentorName,
        palmsScore:      p.palmsScore      != null ? Number(p.palmsScore)          : null,
        passportOK:      p.passportOK      != null ? Boolean(p.passportOK)         : null,
        palmsPass:       p.palmsPass       != null ? Boolean(p.palmsPass)          : null,
        graduateReady:   p.graduateReady   != null ? Boolean(p.graduateReady)      : null,
        extendMentoring: p.extendMentoring != null ? Boolean(p.extendMentoring)    : null,
        notes:           p.notes ? String(p.notes).trim() : null,
      };

      const { error } = await db.from('ninety_day_reviews').insert({
        member_id:   lookup.member.id,
        mentor_team: lookup.member.mentorTeam,
        review_date: new Date().toISOString().split('T')[0],
        content,
      });
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    case 'get90DayReviews': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);

      let query = db.from('ninety_day_reviews')
        .select('id, member_id, mentor_team, review_date, content, members(name, nickname)')
        .order('review_date', { ascending: false }).limit(50);
      if (auth.isMentor && auth.teamName) {
        query = query.eq('mentor_team', auth.teamName);
      }
      const { data, error } = await query;
      if (error) return errResponse(error.message);

      // Unpack content JSONB into flat fields expected by the frontend
      const reviews = ((data || []) as Record<string, unknown>[]).map(row => {
        const mem     = (row.members || {}) as Record<string, unknown>;
        const content = (row.content || {}) as Record<string, unknown>;
        return {
          id:              row.id,
          menteeName:      String(mem.name     || ''),
          menteeNick:      String(mem.nickname || ''),
          mentorName:      String(content.mentorName || ''),
          date:            String(row.review_date || ''),
          team:            String(row.mentor_team  || ''),
          palmsScore:      content.palmsScore      ?? null,
          passportOK:      content.passportOK      ?? null,
          palmsPass:       content.palmsPass        ?? null,
          graduateReady:   content.graduateReady    ?? null,
          extendMentoring: content.extendMentoring  ?? null,
          notes:           content.notes ? String(content.notes) : '',
        };
      });

      return jsonResponse({ ok: true, reviews });
    }

    default:
      return errResponse(`Unknown coaching action: ${action}`);
  }
}

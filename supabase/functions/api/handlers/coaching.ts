// Handler: coaching — saveCoreIssue, getCoachingGuide, saveMentorLog, getMentorLogs
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

export async function handleCoaching(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    case 'saveCoreIssue': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || p.name || '').trim();
      const issueText  = String(p.issue || p.coreIssue || p.issueText || '').trim();
      const statusVal  = String(p.status || 'open');
      const teamName   = String(p.teamName || p.team || auth.teamName || '').trim();

      if (!memberName || !issueText) return errResponse('memberName and issue required');

      // Look up member id
      const { data: member } = await db.from('members').select('id').eq('name', memberName).single();
      if (!member) return errResponse(`ไม่พบสมาชิก: ${memberName}`);
      const memberId = String((member as Record<string, unknown>).id);

      // Check existing open issue
      const { data: existing } = await db.from('core_issues')
        .select('id').eq('member_id', memberId).eq('status', 'open').single();

      if (existing) {
        const { error } = await db.from('core_issues')
          .update({ issue_text: issueText, status: statusVal, updated_at: new Date().toISOString() })
          .eq('id', String((existing as Record<string, unknown>).id));
        if (error) return errResponse(error.message);
      } else {
        const { error } = await db.from('core_issues').insert({
          member_id: memberId,
          mentor_team: teamName || 'TOOMTAM',
          issue_text: issueText,
          status: 'open',
        });
        if (error) return errResponse(error.message);
      }

      return jsonResponse({ ok: true });
    }

    case 'getCoachingGuide': {
      const memberName = String(p.memberName || p.name || '').trim();
      if (!memberName) return errResponse('memberName required');

      const { data: m } = await db.from('v_member_dashboard')
        .select('name, nickname, mentor_team, display_score, traffic_light, rg, visitors, one_to_one, ceu, tyfcb_thb, bni_days, absent, palms_detail, open_core_issue')
        .eq('name', memberName).single();
      if (!m) return errResponse(`ไม่พบ "${memberName}"`);
      const mv = m as Record<string, unknown>;

      const score  = Number(mv.display_score) || 0;
      const bniDays = Number(mv.bni_days) || 0;
      const weeks  = bniDays > 0 ? Math.min(26, Math.max(1, Math.floor(bniDays / 7))) : 1;

      // Fast-track suggestions
      const fastTrack: string[] = [];
      const absent  = Number(mv.absent) || 0;
      const rg      = Number(mv.rg) || 0;
      const vis     = Number(mv.visitors) || 0;
      const oto     = Number(mv.one_to_one) || 0;
      const ceu     = Number(mv.ceu) || 0;
      const tyfcb   = Number(mv.tyfcb_thb) || 0;

      if (absent >= 2) fastTrack.push(`ลดการขาดประชุม (ปัจจุบัน ${absent} ครั้ง)`);
      if (rg / weeks < 1) fastTrack.push(`เพิ่ม referral ให้ถึง ${weeks} ใบ (ปัจจุบัน ${rg})`);
      if (vis === 0) fastTrack.push('พาผู้เยี่ยมชมมาสักคน');
      if (oto / weeks < 1) fastTrack.push(`เพิ่ม 1-2-1 ให้ถึง ${weeks} ครั้ง (ปัจจุบัน ${oto})`);
      if (ceu < 2) fastTrack.push(`เพิ่ม CEU ให้ถึง 2+ (ปัจจุบัน ${ceu})`);
      if (tyfcb < 100000) fastTrack.push('รายงาน TYFCB ให้ถึง ฿100,000+');

      return jsonResponse({
        ok: true,
        name: mv.name, nick: mv.nickname, mentor: mv.mentor_team,
        score, tl: mv.traffic_light, palms: mv.palms_detail,
        coreIssue: mv.open_core_issue || null,
        fastTrack, weeks,
      });
    }

    case 'saveMentorLog': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || p.name || '').trim();
      const notes      = String(p.notes || '').trim();
      const nextActions= String(p.nextActions || '').trim();
      const teamName   = String(p.teamName || auth.teamName || '').trim();

      if (!memberName) return errResponse('memberName required');

      const { data: member } = await db.from('members').select('id').eq('name', memberName).single();
      if (!member) return errResponse(`ไม่พบสมาชิก: ${memberName}`);

      const { error } = await db.from('mentor_logs').insert({
        member_id: String((member as Record<string, unknown>).id),
        mentor_team: teamName || 'TOOMTAM',
        session_date: new Date().toISOString().split('T')[0],
        notes, next_actions: nextActions,
      });
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    case 'getMentorLogs': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const mentorName = String(p.mentorName || auth.teamName || '').trim();

      const { data, error } = await db.from('mentor_logs')
        .select('id, member_id, session_date, notes, next_actions, created_at, members(name, nickname)')
        .eq('mentor_team', mentorName)
        .order('session_date', { ascending: false })
        .limit(50);
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true, logs: data || [] });
    }

    case 'save90DayReview': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || '').trim();
      const content    = p.content || {};
      const teamName   = String(p.teamName || auth.teamName || '').trim();

      if (!memberName) return errResponse('memberName required');
      const { data: member } = await db.from('members').select('id').eq('name', memberName).single();
      if (!member) return errResponse(`ไม่พบสมาชิก: ${memberName}`);

      const { error } = await db.from('ninety_day_reviews').insert({
        member_id: String((member as Record<string, unknown>).id),
        mentor_team: teamName || 'TOOMTAM',
        review_date: new Date().toISOString().split('T')[0],
        content,
      });
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    case 'get90DayReviews': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);
      // Mentors see only their team's reviews; MC sees all
      let query = db.from('ninety_day_reviews')
        .select('id, member_id, mentor_team, review_date, content, members(name, nickname)')
        .order('review_date', { ascending: false }).limit(50);
      if (auth.isMentor && auth.teamName) {
        query = query.eq('mentor_team', auth.teamName);
      }
      const { data, error } = await query;
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true, reviews: data || [] });
    }

    default:
      return errResponse(`Unknown coaching action: ${action}`);
  }
}

import { corsHeaders } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/db.ts';
import { trackLineEvent } from '../_shared/analytics.ts';
import { buildIdempotencyKey } from '../_shared/line.ts';
import { notifyAbsenceStakeholders } from '../_shared/line-absence-notify.ts';

type Db = ReturnType<typeof getServiceClient>;

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function resolveLineMember(db: Db, accessToken: string) {
  if (!accessToken) return { error: 'LINE access token required' };
  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) return { error: 'LINE session ไม่ถูกต้องหรือหมดอายุ' };
  const profile = await profileRes.json() as Record<string, unknown>;
  const userId = String(profile.userId || '');
  const { data } = await db.from('line_members')
    .select('member_id, members(id, name, nickname, mentor_team, email)')
    .eq('line_user_id', userId)
    .maybeSingle();
  if (!data) return { error: 'บัญชี LINE นี้ยังไม่ได้เชื่อมกับสมาชิก', userId, profile };
  const member = (data as Record<string, unknown>).members as Record<string, unknown>;
  return { userId, profile, member, memberId: String((data as Record<string, unknown>).member_id) };
}

async function resolveLeaderTeam(db: Db, member: Record<string, unknown>): Promise<string | null> {
  if (!member) return null;
  const nameLower = String(member.name || '').toLowerCase();
  const nickLower = String(member.nickname || '').toLowerCase();
  // Fetch all teams (only 5) and do bidirectional substring matching.
  // This handles cases where member.name is longer than leader_name (e.g. 'Samrit Kaocharoen' vs 'Samrit').
  const { data: teams } = await db.from('mentor_teams').select('name, leader_name');
  for (const t of (teams || []) as Record<string, unknown>[]) {
    const ln = String(t.leader_name || '').toLowerCase();
    if (!ln) continue;
    if ((nameLower && (nameLower.includes(ln) || ln.includes(nameLower))) ||
        (nickLower && (nickLower.includes(ln) || ln.includes(nickLower)))) {
      return String(t.name);
    }
  }
  const email = String(member.email || '').trim().toLowerCase();
  if (email) {
    const { data: ra } = await db.from('role_assignments')
      .select('team_name')
      .ilike('email', email)
      .eq('is_mentor', true)
      .maybeSingle();
    const teamName = String((ra as Record<string, unknown> | null)?.team_name || '');
    if (teamName) return teamName;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ ok: false, error: 'Method not allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return response({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const db = getServiceClient();
  const identity = await resolveLineMember(db, String(body.accessToken || ''));
  if ('error' in identity) return response({ ok: false, error: identity.error }, 401);
  const action = String(body.action || 'bootstrap');
  const member = identity.member;
  const memberId = identity.memberId;

  if (action === 'bootstrap') {
    const [{ data: dashboard }, { data: goals }, { data: notif }] = await Promise.all([
      db.from('v_member_dashboard')
        .select('display_score, traffic_light, palms_detail, days_to_expiry, absent')
        .eq('id', memberId).maybeSingle(),
      db.from('line_goals').select('goal_type, target').eq('member_id', memberId),
      db.from('line_notif_settings').select('notif_type, is_muted').eq('member_id', memberId),
    ]);
    await trackLineEvent(db, 'liff_opened', {
      lineUserId: identity.userId,
      memberId,
      source: 'liff',
    });
    const leaderTeamName = await resolveLeaderTeam(db, member);
    return response({
      ok: true,
      profile: identity.profile,
      member,
      dashboard,
      goals: goals || [],
      notifications: notif || [],
      role: leaderTeamName ? 'mentor' : 'member',
      mentorTeamName: leaderTeamName,
    });
  }

  if (action === 'absence') {
    const absenceType = String(body.absenceType || 'ลา');
    if (!['ลา', 'ส่ง sub'].includes(absenceType)) return response({ ok: false, error: 'ประเภทไม่ถูกต้อง' }, 400);
    const meetingDate = String(body.meetingDate || '');
    if (!meetingDate) return response({ ok: false, error: 'meetingDate required' }, 400);
    const detail = absenceType === 'ส่ง sub'
      ? String(body.subName || '').trim()
      : String(body.reason || '').trim();
    const { error } = await db.from('line_absence_log').insert({
      member_id: memberId,
      absence_type: absenceType,
      sub_name: absenceType === 'ส่ง sub' ? detail || null : null,
      reason: absenceType === 'ลา' ? detail || null : null,
      week_date: meetingDate,
    });
    if (error) return response({ ok: false, error: error.message }, 400);
    const noticeKey = await buildIdempotencyKey([memberId, meetingDate, absenceType, detail]);
    await notifyAbsenceStakeholders(db, {
      memberId,
      memberName: String(identity.member.name || ''),
      nickname: String(identity.member.nickname || identity.member.name || ''),
      mentorTeam: String(identity.member.mentor_team || ''),
      absenceType,
      detail,
      meetingDate,
      idempotencyKey: `liff:absence:${noticeKey}`,
      source: 'liff-api',
    });
    await trackLineEvent(db, 'liff_absence_submitted', {
      lineUserId: identity.userId, memberId, source: 'liff', properties: { absenceType },
    });
    return response({ ok: true, message: 'บันทึกการแจ้งแล้ว' });
  }

  if (action === 'issue') {
    const issueText = String(body.issueText || '').trim();
    if (issueText.length < 3) return response({ ok: false, error: 'กรุณาระบุรายละเอียดเพิ่มเติม' }, 400);
    const { error } = await db.from('line_issues').insert({ member_id: memberId, issue_text: issueText });
    if (error) return response({ ok: false, error: error.message }, 400);
    await trackLineEvent(db, 'liff_issue_submitted', {
      lineUserId: identity.userId, memberId, source: 'liff',
    });
    return response({ ok: true, message: 'ส่งเรื่องให้ทีม Mentor แล้ว' });
  }

  if (action === '121') {
    const partnerName = String(body.partnerName || '').trim();
    const meetingDate = String(body.meetingDate || '').trim();
    if (!partnerName || !meetingDate) return response({ ok: false, error: 'กรุณาระบุคู่ 1-2-1 และวันที่' }, 400);
    const { data: partner } = await db.from('members')
      .select('id, name').or(`name.ilike.%${partnerName}%,nickname.ilike.%${partnerName}%`)
      .eq('is_archived', false).limit(1).maybeSingle();
    if (!partner) return response({ ok: false, error: `ไม่พบ "${partnerName}"` }, 404);
    const { error } = await db.from('one_to_one_logs').insert({
      initiator_id: memberId,
      partner_id: String((partner as Record<string, unknown>).id),
      partner_name: String((partner as Record<string, unknown>).name),
      scheduled_date: meetingDate,
    });
    if (error) return response({ ok: false, error: error.message }, 400);
    await trackLineEvent(db, 'liff_121_scheduled', {
      lineUserId: identity.userId, memberId, source: 'liff',
    });
    return response({ ok: true, message: 'บันทึกนัด 1-2-1 แล้ว' });
  }

  if (action === 'goal') {
    const goalType = String(body.goalType || '').trim();
    const target = Number(body.target);
    if (!['ref', 'visitor', 'oto', 'ceu', 'tyfb'].includes(goalType) || !Number.isFinite(target) || target <= 0) {
      return response({ ok: false, error: 'เป้าหมายไม่ถูกต้อง' }, 400);
    }
    const { error } = await db.from('line_goals').upsert({
      member_id: memberId, goal_type: goalType, target, set_at: new Date().toISOString(),
    }, { onConflict: 'member_id,goal_type' });
    if (error) return response({ ok: false, error: error.message }, 400);
    await trackLineEvent(db, 'liff_goal_saved', {
      lineUserId: identity.userId, memberId, source: 'liff', properties: { goalType },
    });
    return response({ ok: true, message: 'บันทึกเป้าหมายแล้ว' });
  }

  if (action === 'mentor-log') {
    const menteeName = String(body.menteeName || '').trim();
    const sessionDate = String(body.sessionDate || '').trim();
    const notes = String(body.notes || '').trim();
    const nextActions = body.nextActions ? String(body.nextActions).trim() : null;
    if (!menteeName) return response({ ok: false, error: 'กรุณาระบุชื่อสมาชิก' }, 400);
    if (!sessionDate) return response({ ok: false, error: 'sessionDate required' }, 400);
    if (notes.length < 3) return response({ ok: false, error: 'กรุณาระบุ notes เพิ่มเติม' }, 400);
    const teamName = await resolveLeaderTeam(db, member);
    if (!teamName) return response({ ok: false, error: 'ต้องเป็น Mentor เท่านั้น' }, 403);
    const { data: mentee } = await db.from('members')
      .select('id')
      .or(`name.ilike.%${menteeName}%,nickname.ilike.%${menteeName}%`)
      .eq('is_archived', false)
      .eq('mentor_team', teamName)
      .limit(1).maybeSingle();
    if (!mentee) return response({ ok: false, error: `ไม่พบ "${menteeName}" ในทีม ${teamName}` }, 404);
    const { error } = await db.from('mentor_logs').insert({
      mentor_team: teamName,
      member_id: String((mentee as Record<string, unknown>).id),
      session_date: sessionDate,
      notes,
      next_actions: nextActions,
    });
    if (error) return response({ ok: false, error: error.message }, 400);
    await trackLineEvent(db, 'liff_mentor_log_saved', {
      lineUserId: identity.userId, memberId, source: 'liff',
    });
    return response({ ok: true, message: 'บันทึก Mentor Log แล้วครับ' });
  }

  if (action === 'follow-up') {
    const memberName = String(body.memberName || '').trim();
    const note = String(body.note || '').trim();
    if (!memberName) return response({ ok: false, error: 'กรุณาระบุชื่อสมาชิก' }, 400);
    if (note.length < 3) return response({ ok: false, error: 'กรุณาระบุบันทึก follow-up' }, 400);
    const teamName = await resolveLeaderTeam(db, member);
    if (!teamName) return response({ ok: false, error: 'ต้องเป็น Mentor เท่านั้น' }, 403);
    const { data: targetMember } = await db.from('members')
      .select('id')
      .or(`name.ilike.%${memberName}%,nickname.ilike.%${memberName}%`)
      .eq('is_archived', false)
      .eq('mentor_team', teamName)
      .limit(1).maybeSingle();
    if (!targetMember) return response({ ok: false, error: `ไม่พบ "${memberName}" ในทีม ${teamName}` }, 404);
    const targetId = String((targetMember as Record<string, unknown>).id);
    // Find latest open issue or create one
    const { data: openIssue } = await db.from('core_issues')
      .select('id')
      .eq('member_id', targetId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1).maybeSingle();
    let error;
    if (openIssue) {
      ({ error } = await db.from('core_issues')
        .update({ action_taken: note, follow_up_at: new Date().toISOString() })
        .eq('id', String((openIssue as Record<string, unknown>).id)));
    } else {
      ({ error } = await db.from('core_issues').insert({
        member_id: targetId,
        mentor_team: teamName,
        issue_text: note,
        action_taken: note,
        follow_up_at: new Date().toISOString(),
        opened_at: new Date().toISOString(),
      }));
    }
    const err = error;
    if (err) return response({ ok: false, error: err.message }, 400);
    await trackLineEvent(db, 'liff_followup_saved', {
      lineUserId: identity.userId, memberId, source: 'liff',
    });
    return response({ ok: true, message: 'บันทึก Follow-up แล้วครับ' });
  }

  if (action === 'renewal') {
    const { data: dash } = await db.from('v_member_dashboard')
      .select('days_to_expiry, display_score, traffic_light, name, nickname')
      .eq('id', memberId)
      .maybeSingle();
    const d = dash as Record<string, unknown> | null;
    const daysToExpiry = d?.days_to_expiry != null ? Number(d.days_to_expiry) : null;
    return response({
      ok: true,
      daysToExpiry,
      trafficLight: String(d?.traffic_light ?? 'red'),
      score: Number(d?.display_score ?? 0),
      renewalUrgent: daysToExpiry !== null && daysToExpiry <= 45,
    });
  }

  if (action === 'visitor') {
    const visitorName = String(body.visitorName || '').trim();
    const visitDate = String(body.visitDate || '').trim();
    const notes = body.notes ? String(body.notes).trim() : null;
    if (!visitorName) return response({ ok: false, error: 'visitorName required' }, 400);
    if (!visitDate) return response({ ok: false, error: 'visitDate required' }, 400);
    const { error } = await db.from('visitor_log').insert({
      visitor_name: visitorName,
      invited_by: memberId,
      visit_date: visitDate,
      notes,
      status: 'pending',
    });
    if (error) return response({ ok: false, error: error.message }, 400);
    await trackLineEvent(db, 'liff_visitor_logged', {
      lineUserId: identity.userId, memberId, source: 'liff',
    });
    return response({ ok: true, message: 'บันทึกแขกพิเศษแล้วครับ' });
  }

  if (action === 'get-assignments') {
    const memberTeam = String(member.mentor_team || '');
    const { data: assignments } = await db.from('mc_assignments')
      .select('id, assignment_text, due_date, mentor_team')
      .or(`member_id.eq.${memberId}${memberTeam ? `,mentor_team.eq.${memberTeam}` : ''}`)
      .is('acknowledged_at', null)
      .order('due_date', { ascending: true })
      .limit(10);
    return response({ ok: true, assignments: assignments || [] });
  }

  if (action === 'ack-assignment') {
    const assignmentId = String(body.assignmentId || '').trim();
    if (!assignmentId) return response({ ok: false, error: 'assignmentId required' }, 400);
    const memberTeam = String(member.mentor_team || '');
    const orFilter = memberTeam
      ? `member_id.eq.${memberId},mentor_team.eq.${memberTeam}`
      : `member_id.eq.${memberId}`;
    const { error } = await db.from('mc_assignments')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', assignmentId)
      .or(orFilter);
    if (error) return response({ ok: false, error: error.message }, 400);
    return response({ ok: true, message: 'รับทราบแล้วครับ' });
  }

  if (action === 'progress') {
    const [{ data: dash }, { data: goals }] = await Promise.all([
      db.from('v_member_dashboard')
        .select('palms_detail, rg, visitors, one_to_one, ceu, tyfcb_thb, absent, bni_days')
        .eq('id', memberId).maybeSingle(),
      db.from('line_goals').select('goal_type, target').eq('member_id', memberId),
    ]);
    const d = dash as Record<string, unknown> | null;
    const actuals = {
      referrals: Number(d?.rg ?? 0),
      visitors: Number(d?.visitors ?? 0),
      oneToOne: Number(d?.one_to_one ?? 0),
      ceu: Number(d?.ceu ?? 0),
      tyfbThb: Number(d?.tyfcb_thb ?? 0),
      absent: Number(d?.absent ?? 0),
      weeks: Math.min(26, Math.max(1, Math.floor(Number(d?.bni_days ?? 7) / 7))),
    };
    const goalMap: Record<string, number> = {};
    for (const g of (goals || []) as Record<string, unknown>[]) {
      goalMap[String(g.goal_type)] = Number(g.target);
    }
    const pd = (d?.palms_detail ?? {}) as Record<string, unknown>;
    const actionComponents = [
      { pts: Number(pd.referral ?? 0),  max: 15, hint: 'ส่ง Referral เพิ่ม 1 ใบ' },
      { pts: Number(pd.visitor  ?? 0),  max: 20, hint: 'พา Visitor มาอีก 1 คน' },
      { pts: Number(pd.oneToOne ?? 0),  max: 15, hint: 'นัด 1-2-1 อีก 1 ครั้ง' },
      { pts: Number(pd.ceu      ?? 0),  max: 20, hint: 'เข้า CEU เพิ่มอีก 1 ครั้ง' },
      { pts: Number(pd.tyfb     ?? 0),  max: 15, hint: 'ส่ง TYFCB ให้มากขึ้น' },
      { pts: Number(pd.absence  ?? 0),  max: 15, hint: 'รักษาการเข้าร่วมประชุม' },
    ];
    const top = actionComponents.reduce(
      (best, c) => (c.max - c.pts > best.max - best.pts ? c : best),
      actionComponents[0],
    );
    const topAction = top.max > top.pts ? { hint: top.hint, gain: top.max - top.pts } : null;
    return response({ ok: true, palmsDetail: d?.palms_detail ?? {}, actuals, goals: goalMap, topAction });
  }

  if (action === 'get-121-pending') {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const { data: pending } = await db.from('one_to_one_logs')
      .select('id, partner_name, scheduled_date, met_at')
      .eq('initiator_id', memberId)
      .is('met_at', null)
      .gte('scheduled_date', cutoff)
      .order('scheduled_date', { ascending: true })
      .limit(5);
    return response({ ok: true, pending: pending || [] });
  }

  if (action === 'confirm-121') {
    const logId = String(body.logId || '').trim();
    if (!logId) return response({ ok: false, error: 'logId required' }, 400);
    const { error } = await db.from('one_to_one_logs')
      .update({ met_at: new Date().toISOString() })
      .eq('id', logId)
      .eq('initiator_id', memberId);
    if (error) return response({ ok: false, error: error.message }, 400);
    await trackLineEvent(db, 'liff_121_confirmed', { lineUserId: identity.userId, memberId, source: 'liff' });
    return response({ ok: true, message: 'ยืนยัน 1-2-1 สำเร็จแล้ว ✓' });
  }

  if (action === 'get-issues') {
    const { data: issues } = await db.from('line_issues')
      .select('id, issue_text, reported_at, mentor_response, resolved_at')
      .eq('member_id', memberId)
      .order('reported_at', { ascending: false })
      .limit(5);
    return response({ ok: true, issues: issues || [] });
  }

  if (action === 'get-visitors') {
    const { data: visitors } = await db.from('visitor_log')
      .select('id, visitor_name, visit_date, status, notes')
      .eq('invited_by', memberId)
      .order('visit_date', { ascending: false })
      .limit(5);
    return response({ ok: true, visitors: visitors || [] });
  }

  return response({ ok: false, error: `Unknown action: ${action}` }, 400);
});

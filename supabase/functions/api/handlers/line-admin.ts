// FILE: line-admin.ts
// Handler: line-admin — saveLineId, getLineIds, sendLineMessage, onboarding, triggers, etc.
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

// ── LINE Push helper — no-op when token is absent (dev mode) ──
const LINE_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '';

async function sendLineMsg(userId: string, text: string): Promise<void> {
  if (!LINE_TOKEN) return; // no-op in dev mode
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LINE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: userId, messages: [{ type: 'text', text }] }),
  }).catch(() => {});
}

// ── Resolve member_id by name (case-insensitive) ──────────────
async function findMemberId(
  db: ReturnType<typeof getServiceClient>,
  name: string,
): Promise<string | null> {
  const { data } = await db
    .from('members')
    .select('id')
    .ilike('name', name)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return String((data as Record<string, unknown>).id);
}

// ── Resolve LINE user_id for a member by name ─────────────────
async function findLineUserId(
  db: ReturnType<typeof getServiceClient>,
  memberName: string,
): Promise<string | null> {
  const memberId = await findMemberId(db, memberName);
  if (!memberId) return null;

  const { data } = await db
    .from('line_members')
    .select('line_user_id')
    .eq('member_id', memberId)
    .maybeSingle();
  if (!data) return null;
  return String((data as Record<string, unknown>).line_user_id);
}

// ─────────────────────────────────────────────────────────────
export async function handleLineAdmin(p: Record<string, unknown>): Promise<Response> {
  const db     = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    // ── SAVE: register a member's LINE user ID ────────────────
    case 'saveLineId': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || '').trim();
      const lineUserId = String(p.lineUserId || '').trim();
      if (!memberName || !lineUserId) return errResponse('memberName and lineUserId required');

      const memberId = await findMemberId(db, memberName);
      if (!memberId) return errResponse(`ไม่พบสมาชิก: ${memberName}`);

      const { error } = await db.from('line_members').upsert(
        { line_user_id: lineUserId, member_id: memberId, registered_at: new Date().toISOString() },
        { onConflict: 'line_user_id' },
      );
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true });
    }

    // ── GET: all registered LINE members with member info (MC) ─
    case 'getLineIds': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const { data, error } = await db
        .from('line_members')
        .select('line_user_id, registered_at, members(name, nickname, mentor_team)');
      if (error) return errResponse(error.message);

      const members = ((data || []) as Record<string, unknown>[]).map(row => {
        const m = (row.members || {}) as Record<string, unknown>;
        return {
          lineUserId:   String(row.line_user_id || ''),
          memberName:   String(m.name || ''),
          nick:         String(m.nickname || ''),
          mentorTeam:   String(m.mentor_team || ''),
          registeredAt: String(row.registered_at || ''),
        };
      });

      return jsonResponse({ ok: true, members });
    }

    // ── GET: simpler LINE members list (any auth) ─────────────
    case 'getLineMembers': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const { data, error } = await db
        .from('line_members')
        .select('line_user_id, members(name, nickname, mentor_team)');
      if (error) return errResponse(error.message);

      const members = ((data || []) as Record<string, unknown>[]).map(row => {
        const m = (row.members || {}) as Record<string, unknown>;
        return {
          lineUserId: String(row.line_user_id || ''),
          name:       String(m.name || ''),
          nick:       String(m.nickname || ''),
          team:       String(m.mentor_team || ''),
        };
      });

      return jsonResponse({ ok: true, members });
    }

    // ── GET: LINE members with dashboard scores (MC only) ──────
    case 'getLineMembersDetail': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const { data: lineRows, error } = await db
        .from('line_members')
        .select('line_user_id, members(id, name, nickname, mentor_team)');
      if (error) return errResponse(error.message);

      const memberIds = ((lineRows || []) as Record<string, unknown>[]).map(r => {
        const m = (r.members || {}) as Record<string, unknown>;
        return String(m.id || '');
      }).filter(Boolean);

      let scoreMap: Record<string, { score: number; tl: string }> = {};
      if (memberIds.length > 0) {
        const { data: dash } = await db
          .from('v_member_dashboard')
          .select('id, display_score, traffic_light')
          .in('id', memberIds);
        for (const d of ((dash || []) as Record<string, unknown>[])) {
          scoreMap[String(d.id)] = {
            score: Number(d.display_score) || 0,
            tl:    String(d.traffic_light || 'none'),
          };
        }
      }

      const members = ((lineRows || []) as Record<string, unknown>[]).map(row => {
        const m  = (row.members || {}) as Record<string, unknown>;
        const id = String(m.id || '');
        const sd = scoreMap[id] || { score: 0, tl: 'none' };
        return {
          lineUserId: String(row.line_user_id || ''),
          name:       String(m.name || ''),
          nick:       String(m.nickname || ''),
          team:       String(m.mentor_team || ''),
          score:      sd.score,
          tl:         sd.tl,
        };
      });

      return jsonResponse({ ok: true, members });
    }

    // ── SET: store MC's own LINE ID in settings ───────────────
    case 'setMCLineId': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const lineUserId = String(p.lineUserId || '').trim();
      if (!lineUserId) return errResponse('lineUserId required');

      const { error } = await db.from('settings').upsert(
        { key: 'MC_LINE_ID', value: lineUserId },
        { onConflict: 'key' },
      );
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true });
    }

    // ── SEND: push a custom message to one member (MC only) ───
    case 'sendLineMessage': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || '').trim();
      const message    = String(p.message || '').trim();
      if (!memberName || !message) return errResponse('memberName and message required');

      const userId = await findLineUserId(db, memberName);
      if (!userId) return jsonResponse({ ok: true, sent: false });

      await sendLineMsg(userId, message);
      return jsonResponse({ ok: true, sent: true });
    }

    // ── BROADCAST: push message to all (or filtered) members (MC) ──
    case 'sendLineBroadcast': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const message    = String(p.message || '').trim();
      const targetRole = p.targetRole ? String(p.targetRole).trim() : null;
      if (!message) return errResponse('message required');

      const { data, error } = await db
        .from('line_members')
        .select('line_user_id, members(mentor_team)');
      if (error) return errResponse(error.message);

      let rows = (data || []) as Record<string, unknown>[];
      if (targetRole) {
        rows = rows.filter(r => {
          const m = (r.members || {}) as Record<string, unknown>;
          return String(m.mentor_team || '').toLowerCase() === targetRole.toLowerCase();
        });
      }

      let sentCount = 0;
      for (const row of rows) {
        const uid = String(row.line_user_id || '');
        if (uid) { await sendLineMsg(uid, message); sentCount++; }
      }

      return jsonResponse({ ok: true, sentCount });
    }

    // ── INTRO: send a standard welcome message to a member ────
    case 'sendLineIntro': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || '').trim();
      if (!memberName) return errResponse('memberName required');

      const userId = await findLineUserId(db, memberName);
      if (!userId) return jsonResponse({ ok: true, sent: false });

      const introText =
        `🌟 ยินดีต้อนรับสู่ BNI IDEAL Chapter!\n\n` +
        `สวัสดีคุณ ${memberName} 👋\n\n` +
        `ระบบนี้จะช่วยติดตามคะแนน PALMS, แจ้งเตือนประชุม, และสื่อสารกับ Mentor ของคุณ\n\n` +
        `พิมพ์ "สถานะ" เพื่อดูคะแนนปัจจุบัน`;

      await sendLineMsg(userId, introText);
      return jsonResponse({ ok: true, sent: true });
    }

    // ── GET: absence log (last 50) ────────────────────────────
    case 'getAbsenceLog': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const { data, error } = await db
        .from('line_absence_log')
        .select('id, logged_at, absence_date, notes, members(name, nickname)')
        .order('logged_at', { ascending: false })
        .limit(50);
      if (error) return errResponse(error.message);

      const log = ((data || []) as Record<string, unknown>[]).map(row => {
        const m = (row.members || {}) as Record<string, unknown>;
        return {
          memberName:   String(m.name || ''),
          nick:         String(m.nickname || ''),
          absenceDate:  String(row.absence_date || ''),
          notes:        String(row.notes || ''),
          loggedAt:     String(row.logged_at || ''),
        };
      });

      return jsonResponse({ ok: true, log });
    }

    // ── GET: absence log (last 10) ────────────────────────────
    case 'getAbsenceLogRecent': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const { data, error } = await db
        .from('line_absence_log')
        .select('id, logged_at, absence_date, notes, members(name, nickname)')
        .order('logged_at', { ascending: false })
        .limit(10);
      if (error) return errResponse(error.message);

      const log = ((data || []) as Record<string, unknown>[]).map(row => {
        const m = (row.members || {}) as Record<string, unknown>;
        return {
          memberName:  String(m.name || ''),
          nick:        String(m.nickname || ''),
          absenceDate: String(row.absence_date || ''),
          notes:       String(row.notes || ''),
          loggedAt:    String(row.logged_at || ''),
        };
      });

      return jsonResponse({ ok: true, log });
    }

    // ── GET: LINE issue reports (last 30) ─────────────────────
    case 'getLineIssues': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const { data, error } = await db
        .from('line_issues')
        .select('id, reported_at, issue_text, status, members(name)')
        .order('reported_at', { ascending: false })
        .limit(30);
      if (error) return errResponse(error.message);

      const issues = ((data || []) as Record<string, unknown>[]).map(row => {
        const m = (row.members || {}) as Record<string, unknown>;
        return {
          id:         String(row.id || ''),
          memberName: String(m.name || ''),
          issueText:  String(row.issue_text || ''),
          status:     String(row.status || ''),
          reportedAt: String(row.reported_at || ''),
        };
      });

      return jsonResponse({ ok: true, issues });
    }

    // ── ENROLL: mark member as enrolled in onboarding ─────────
    case 'enrollOnboarding': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || '').trim();
      if (!memberName) return errResponse('memberName required');

      const memberId = await findMemberId(db, memberName);
      if (!memberId) return errResponse(`ไม่พบสมาชิก: ${memberName}`);

      // Use week_num=0 as the "enrolled" marker
      const { error } = await db.from('onboarding_sends').upsert(
        { member_id: memberId, week_num: 0, sent_at: new Date().toISOString() },
        { onConflict: 'member_id,week_num' },
      );
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true });
    }

    // ── REMOVE: un-enroll member from onboarding ──────────────
    case 'removeOnboarding': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || '').trim();
      if (!memberName) return errResponse('memberName required');

      const memberId = await findMemberId(db, memberName);
      if (!memberId) return errResponse(`ไม่พบสมาชิก: ${memberName}`);

      const { error } = await db
        .from('onboarding_sends')
        .delete()
        .eq('member_id', memberId);
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true });
    }

    // ── GET: onboarding status for all enrolled members ───────
    case 'getOnboardingStatus': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      // Find all members who have week_num=0 (enrolled marker)
      const { data: enrolledRows, error: enrErr } = await db
        .from('onboarding_sends')
        .select('member_id')
        .eq('week_num', 0);
      if (enrErr) return errResponse(enrErr.message);

      const enrolledIds = ((enrolledRows || []) as Record<string, unknown>[])
        .map(r => String(r.member_id));

      if (enrolledIds.length === 0) return jsonResponse({ ok: true, enrolled: [] });

      // For each enrolled member, count weeks completed (week_num > 0)
      const { data: sendRows, error: sendErr } = await db
        .from('onboarding_sends')
        .select('member_id, week_num')
        .in('member_id', enrolledIds)
        .gt('week_num', 0);
      if (sendErr) return errResponse(sendErr.message);

      const weekCounts: Record<string, number> = {};
      for (const r of ((sendRows || []) as Record<string, unknown>[])) {
        const mid = String(r.member_id);
        weekCounts[mid] = (weekCounts[mid] || 0) + 1;
      }

      // Fetch member names
      const { data: memberRows } = await db
        .from('members')
        .select('id, name, nickname')
        .in('id', enrolledIds);

      const enrolled = ((memberRows || []) as Record<string, unknown>[]).map(m => ({
        memberName:     String(m.name || ''),
        nick:           String(m.nickname || ''),
        weeksCompleted: weekCounts[String(m.id)] || 0,
      }));

      return jsonResponse({ ok: true, enrolled });
    }

    // ── GET: onboarding message templates ─────────────────────
    case 'getOnboardingMessages': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const { data, error } = await db
        .from('onboarding_messages')
        .select('id, week_num, message_text')
        .order('week_num', { ascending: true });
      if (error) return errResponse(error.message);

      const messages = ((data || []) as Record<string, unknown>[]).map(r => ({
        id:          String(r.id || ''),
        weekNum:     Number(r.week_num) || 0,
        messageText: String(r.message_text || ''),
      }));

      return jsonResponse({ ok: true, messages });
    }

    // ── SAVE: upsert an onboarding message template (MC only) ─
    case 'saveOnboardingMessage': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const weekNum     = Number(p.weekNum);
      const messageText = String(p.messageText || '').trim();
      if (!weekNum || !messageText) return errResponse('weekNum and messageText required');

      const { error } = await db.from('onboarding_messages').upsert(
        { week_num: weekNum, message_text: messageText },
        { onConflict: 'week_num' },
      );
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true });
    }

    // ── SEND: send a specific onboarding week's message ───────
    case 'sendOnboardingWeek': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || '').trim();
      const weekNum    = Number(p.weekNum);
      if (!memberName || !weekNum) return errResponse('memberName and weekNum required');

      const memberId = await findMemberId(db, memberName);
      if (!memberId) return errResponse(`ไม่พบสมาชิก: ${memberName}`);

      // Get message template
      const { data: msgRow } = await db
        .from('onboarding_messages')
        .select('message_text')
        .eq('week_num', weekNum)
        .maybeSingle();

      const msgText = msgRow
        ? String((msgRow as Record<string, unknown>).message_text || '')
        : `[Week ${weekNum} onboarding message]`;

      // Get LINE user ID
      const { data: lmRow } = await db
        .from('line_members')
        .select('line_user_id')
        .eq('member_id', memberId)
        .maybeSingle();

      const userId = lmRow ? String((lmRow as Record<string, unknown>).line_user_id || '') : null;
      let sent = false;

      if (userId) {
        await sendLineMsg(userId, msgText);
        sent = true;
      }

      // Record in onboarding_sends regardless of delivery
      await db.from('onboarding_sends').upsert(
        { member_id: memberId, week_num: weekNum, sent_at: new Date().toISOString() },
        { onConflict: 'member_id,week_num' },
      );

      return jsonResponse({ ok: true, sent });
    }

    // ── MENTOR BROADCAST: mentor sends to own team members ────
    case 'mentorBroadcast': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const message  = String(p.message || '').trim();
      const teamName = String(auth.teamName || p.teamName || '').trim();
      if (!message) return errResponse('message required');
      if (!teamName) return errResponse('ไม่พบทีม — mentorBroadcast ต้องการ role ที่เป็น mentor');

      // Get all members in this team who have LINE IDs
      const { data: memberRows } = await db
        .from('members')
        .select('id')
        .eq('mentor_team', teamName)
        .eq('is_archived', false);

      const memberIds = ((memberRows || []) as Record<string, unknown>[]).map(m => String(m.id));
      if (memberIds.length === 0) return jsonResponse({ ok: true, sentCount: 0 });

      const { data: lineRows } = await db
        .from('line_members')
        .select('line_user_id')
        .in('member_id', memberIds);

      let sentCount = 0;
      for (const row of ((lineRows || []) as Record<string, unknown>[])) {
        const uid = String(row.line_user_id || '');
        if (uid) { await sendLineMsg(uid, message); sentCount++; }
      }

      return jsonResponse({ ok: true, sentCount });
    }

    // ── ADMIN SETUP STUBS ─────────────────────────────────────
    case 'setupRichMenu':
    case 'setupAllTriggers':
      return jsonResponse({ ok: true, message: 'requires LINE admin setup' });

    // ── TRIGGER: score alert — send to members with score < 50 ─
    case 'triggerScoreAlert': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const { data: lowScoreMembers } = await db
        .from('v_member_dashboard')
        .select('id, name, display_score, traffic_light')
        .lt('display_score', 50)
        .eq('is_archived', false);

      if (!lowScoreMembers || (lowScoreMembers as unknown[]).length === 0) {
        return jsonResponse({ ok: true, message: 'trigger queued', sentCount: 0 });
      }

      const memberIds = ((lowScoreMembers) as Record<string, unknown>[]).map(m => String(m.id));
      const { data: lineRows } = await db
        .from('line_members')
        .select('line_user_id, member_id')
        .in('member_id', memberIds);

      const scoreByMemberId: Record<string, number> = {};
      for (const m of (lowScoreMembers as Record<string, unknown>[])) {
        scoreByMemberId[String(m.id)] = Number(m.display_score) || 0;
      }

      let sentCount = 0;
      for (const row of ((lineRows || []) as Record<string, unknown>[])) {
        const uid      = String(row.line_user_id || '');
        const mid      = String(row.member_id || '');
        const score    = scoreByMemberId[mid] ?? 0;
        if (uid) {
          const alertMsg = `⚠️ แจ้งเตือนคะแนน PALMS\n\nคะแนนปัจจุบันของคุณอยู่ที่ ${score} คะแนน\nกรุณาพัฒนาผลงานเพื่อรักษาสมาชิกภาพ BNI\n\nพิมพ์ "สถานะ" เพื่อดูรายละเอียด`;
          await sendLineMsg(uid, alertMsg);
          sentCount++;
        }
      }

      return jsonResponse({ ok: true, message: 'trigger queued', sentCount });
    }

    // ── TRIGGER STUBS (scheduled push notifications) ──────────
    case 'triggerAnniversary':
    case 'triggerCheckinReminder':
    case 'triggerChapterPulse':
    case 'triggerPostMeetingPrompt':
    case 'triggerWednesdayNudge':
    case 'triggerTeamLeaderboard':
    case 'triggerWeeklyScorePush':
    case 'triggerMondayBrief':
    case 'triggerMonthlyRecap':
    case 'trigger121Reminder':
      return jsonResponse({ ok: true, message: 'trigger scheduled' });

    // ── Default stub ──────────────────────────────────────────
    default:
      return jsonResponse({ ok: true, message: 'not yet implemented' });
  }
}

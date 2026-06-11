// FILE: line-admin.ts
// Handler: line-admin — saveLineId, getLineIds, sendLineMessage, onboarding, triggers, etc.
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

// ── LINE Push helper — no-op when token is absent (dev mode) ──
const LINE_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '';

async function sendLineMsg(userId: string, text: string): Promise<boolean> {
  if (!LINE_TOKEN) return false;
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LINE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: userId, messages: [{ type: 'text', text }] }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[sendLineMsg] LINE API error ${res.status}: ${body}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[sendLineMsg] fetch error:', e);
    return false;
  }
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

    // ── SAVE: store role LINE User ID in settings table ──────────
    // Frontend sends { target: roleKey, lineId: lineUserId }
    // roleKey: 'mc' | 'TOOMTAM' | 'Aof' | 'Draft' | 'PHAI' | 'AMP' | 'growth'
    case 'saveLineId': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const target  = String(p.target  || p.memberName || '').trim();
      const lineId  = String(p.lineId  || p.lineUserId || '').trim();
      if (!target || !lineId) return errResponse('target and lineId required');

      const settingKey = `LINE_ID_${target.toUpperCase()}`;
      const { error } = await db.from('settings').upsert(
        { key: settingKey, value: lineId },
        { onConflict: 'key' },
      );
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true });
    }

    // ── GET: role LINE IDs from settings table (MC settings panel) ─
    // Returns { ids: { mc: 'Uxxxx', TOOMTAM: 'Uxxxx', ... }, hasToken: bool }
    case 'getLineIds': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const ROLE_KEYS = ['mc', 'TOOMTAM', 'Aof', 'Draft', 'PHAI', 'AMP', 'growth'];
      const settingKeys = ROLE_KEYS.map(k => `LINE_ID_${k.toUpperCase()}`);

      const { data, error } = await db
        .from('settings')
        .select('key, value')
        .in('key', settingKeys);
      if (error) return errResponse(error.message);

      const ids: Record<string, string> = {};
      for (const role of ROLE_KEYS) {
        const dbKey  = `LINE_ID_${role.toUpperCase()}`;
        const row    = ((data || []) as Record<string, unknown>[]).find(r => r.key === dbKey);
        ids[role]    = row ? String(row.value || '') : '';
      }

      const hasToken = !!LINE_TOKEN;
      return jsonResponse({ ok: true, ids, hasToken });
    }

    // ── GET: simpler LINE members list (any auth) ─────────────
    // Returns both an array (list) and a name-keyed map (members) for S.lineMembers[name] lookups
    case 'getLineMembers': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const { data, error } = await db
        .from('line_members')
        .select('line_user_id, members(name, nickname, mentor_team)');
      if (error) return errResponse(error.message);

      const list = ((data || []) as Record<string, unknown>[]).map(row => {
        const m = (row.members || {}) as Record<string, unknown>;
        return {
          lineUserId: String(row.line_user_id || ''),
          name:       String(m.name || ''),
          nick:       String(m.nickname || ''),
          team:       String(m.mentor_team || ''),
        };
      });

      // Build name-keyed map so frontend can do S.lineMembers[member.name]
      const members: Record<string, unknown> = {};
      for (const item of list) members[item.name] = item;

      return jsonResponse({ ok: true, members, list });
    }

    // ── GET: LINE members with dashboard scores (MC only) ──────
    case 'getLineMembersDetail': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const { data: lineRows, error } = await db
        .from('line_members')
        .select('line_user_id, registered_at, members(id, name, nickname, mentor_team)')
        .order('registered_at', { ascending: false });
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

      // Frontend expects: list key, userId (not lineUserId), lastScore, registeredAt
      const list = ((lineRows || []) as Record<string, unknown>[]).map(row => {
        const m  = (row.members || {}) as Record<string, unknown>;
        const id = String(m.id || '');
        const sd = scoreMap[id] || { score: 0, tl: 'none' };
        const regAt = row.registered_at ? new Date(String(row.registered_at)).toLocaleDateString('th-TH') : '—';
        return {
          userId:       String(row.line_user_id || ''),
          name:         String(m.name || ''),
          nick:         String(m.nickname || ''),
          team:         String(m.mentor_team || ''),
          lastScore:    sd.score || null,
          tl:           sd.tl,
          registeredAt: regAt,
        };
      });

      return jsonResponse({ ok: true, list });
    }

    // ── SET: store MC's own LINE ID in settings ───────────────
    case 'setMCLineId': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      // Accept either lineUserId directly or memberName (look up from line_members)
      let lineUserId = String(p.lineUserId || '').trim();
      let resolvedName = '';

      if (!lineUserId && p.memberName) {
        const memberName = String(p.memberName).trim();
        const mid = await findMemberId(db, memberName);
        if (!mid) return errResponse(`ไม่พบสมาชิก: ${memberName}`);
        const { data: lm } = await db
          .from('line_members').select('line_user_id')
          .eq('member_id', mid).maybeSingle();
        if (!lm) return errResponse(`${memberName} ยังไม่ได้ลงทะเบียน LINE Bot ครับ`);
        lineUserId = String((lm as Record<string, unknown>).line_user_id || '');
        resolvedName = memberName;
      }

      if (!lineUserId) return errResponse('lineUserId หรือ memberName required');

      const { error } = await db.from('settings').upsert(
        { key: 'MC_LINE_ID', value: lineUserId },
        { onConflict: 'key' },
      );
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true, name: resolvedName });
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
      // Accept teamName (from LINE activity panel) or targetRole (legacy)
      const targetRole = (p.teamName ? String(p.teamName) : p.targetRole ? String(p.targetRole) : '').trim() || null;
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

      return jsonResponse({ ok: true, sent: sentCount, sentCount });
    }

    // ── INTRO: send 1-2-1 introduction between 2 members ─────
    case 'sendLineIntro': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const name1 = String(p.name1 || p.memberName || '').trim();
      const name2 = String(p.name2 || '').trim();
      if (!name1) return errResponse('name1 required');

      // Single member intro (legacy) or 2-person mutual intro
      if (!name2) {
        const userId = await findLineUserId(db, name1);
        if (!userId) return jsonResponse({ ok: true, sent: false, sentTo: [] });
        const introText = `🌟 ยินดีต้อนรับสู่ BNI IDEAL Chapter!\n\nสวัสดีคุณ ${name1} 👋\n\nระบบนี้จะช่วยติดตามคะแนน PALMS, แจ้งเตือนประชุม, และสื่อสารกับ Mentor ของคุณ\n\nพิมพ์ "สถานะ" เพื่อดูคะแนนปัจจุบัน`;
        await sendLineMsg(userId, introText);
        return jsonResponse({ ok: true, sent: true, sentTo: [name1] });
      }

      // 2-person mutual intro
      const [uid1, uid2] = await Promise.all([
        findLineUserId(db, name1),
        findLineUserId(db, name2),
      ]);

      // Get nicknames
      const { data: m1Row } = await db.from('members').select('nickname').ilike('name', name1).maybeSingle();
      const { data: m2Row } = await db.from('members').select('nickname').ilike('name', name2).maybeSingle();
      const nick1 = String((m1Row as Record<string, unknown> | null)?.nickname || name1.split(' ')[0]);
      const nick2 = String((m2Row as Record<string, unknown> | null)?.nickname || name2.split(' ')[0]);

      const sentTo: string[] = [];
      if (uid1) {
        await sendLineMsg(uid1,
          `🤝 BNI IDEAL — แนะนำให้รู้จัก!\n\nสวัสดีคุณ${nick1} 👋\n\nอยากแนะนำให้รู้จักกับ คุณ${nick2} (${name2}) จาก BNI IDEAL Chapter ของเรานะครับ\n\nลองนัด 1-2-1 คุยกันดูครับ! 😊`);
        sentTo.push(nick1);
      }
      if (uid2) {
        await sendLineMsg(uid2,
          `🤝 BNI IDEAL — แนะนำให้รู้จัก!\n\nสวัสดีคุณ${nick2} 👋\n\nอยากแนะนำให้รู้จักกับ คุณ${nick1} (${name1}) จาก BNI IDEAL Chapter ของเรานะครับ\n\nลองนัด 1-2-1 คุยกันดูครับ! 😊`);
        sentTo.push(nick2);
      }

      if (sentTo.length === 0) return jsonResponse({ ok: true, sent: false, sentTo: [] });
      return jsonResponse({ ok: true, sent: true, sentTo });
    }

    // ── GET: absence log (last 50) ────────────────────────────
    case 'getAbsenceLog': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const { data, error } = await db
        .from('line_absence_log')
        .select('id, created_at, week_date, absence_type, sub_name, reason, members(name, nickname, mentor_team)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return errResponse(error.message);

      const list = ((data || []) as Record<string, unknown>[]).map(row => {
        const m = (row.members || {}) as Record<string, unknown>;
        const isSub = String(row.absence_type || '') === 'ส่ง sub';
        return {
          name:       String(m.name || ''),
          nick:       String(m.nickname || ''),
          team:       String(m.mentor_team || ''),
          type:       isSub ? 'ส่ง sub' : 'ลา',
          reportedAt: String(row.created_at || '').slice(0, 16).replace('T', ' '),
          absDate:    String(row.week_date || ''),
          detail:     isSub ? `sub: ${row.sub_name || ''}` : String(row.reason || ''),
        };
      });

      return jsonResponse({ ok: true, list });
    }

    // ── GET: absence log (last 10) ────────────────────────────
    case 'getAbsenceLogRecent': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const { data, error } = await db
        .from('line_absence_log')
        .select('id, created_at, week_date, absence_type, sub_name, reason, members(name, nickname, mentor_team)')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) return errResponse(error.message);

      const list = ((data || []) as Record<string, unknown>[]).map(row => {
        const m = (row.members || {}) as Record<string, unknown>;
        const isSub = String(row.absence_type || '') === 'ส่ง sub';
        return {
          name:       String(m.name || ''),
          nick:       String(m.nickname || ''),
          team:       String(m.mentor_team || ''),
          type:       isSub ? 'ส่ง sub' : 'ลา',
          reportedAt: String(row.created_at || '').slice(0, 16).replace('T', ' '),
          absDate:    String(row.week_date || ''),
          detail:     isSub ? `sub: ${row.sub_name || ''}` : String(row.reason || ''),
        };
      });

      return jsonResponse({ ok: true, list });
    }

    // ── GET: LINE issue reports (last 30) ─────────────────────
    case 'getLineIssues': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const { data, error } = await db
        .from('line_issues')
        .select('id, reported_at, resolved_at, issue_text, members(name, nickname, mentor_team)')
        .order('reported_at', { ascending: false })
        .limit(30);
      if (error) return errResponse(error.message);

      const list = ((data || []) as Record<string, unknown>[]).map(row => {
        const m = (row.members || {}) as Record<string, unknown>;
        const isOpen = row.resolved_at == null;
        return {
          id:     String(row.id || ''),
          name:   String(m.name || ''),
          nick:   String(m.nickname || ''),
          team:   String(m.mentor_team || ''),
          status: isOpen ? 'รอดำเนินการ' : 'เสร็จสิ้น',
          detail: String(row.issue_text || ''),
          date:   String(row.reported_at || '').slice(0, 10),
        };
      });

      return jsonResponse({ ok: true, list });
    }

    // ── ENROLL: mark member as enrolled in onboarding ─────────
    case 'enrollOnboarding': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || '').trim();
      if (!memberName) return errResponse('memberName required');

      const memberId = await findMemberId(db, memberName);
      if (!memberId) return errResponse(`ไม่พบสมาชิก: ${memberName}`);

      const { error } = await db.from('onboarding_schedule').upsert(
        { member_id: memberId, enrolled_at: new Date().toISOString(), removed_at: null },
        { onConflict: 'member_id' },
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
        .from('onboarding_schedule')
        .update({ removed_at: new Date().toISOString() })
        .eq('member_id', memberId)
        .is('removed_at', null);
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true });
    }

    // ── GET: onboarding status for all enrolled members ───────
    case 'getOnboardingStatus': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      // Find active enrolled members (removed_at is null)
      const { data: enrolledRows, error: enrErr } = await db
        .from('onboarding_schedule')
        .select('member_id, enrolled_at, members(name, nickname)')
        .is('removed_at', null);
      if (enrErr) return errResponse(enrErr.message);

      const enrolledIds = ((enrolledRows || []) as Record<string, unknown>[])
        .map(r => String(r.member_id));

      if (enrolledIds.length === 0) return jsonResponse({ ok: true, enrolled: [] });

      // Count weeks completed per member
      const { data: sendRows, error: sendErr } = await db
        .from('onboarding_sends')
        .select('member_id, week_number')
        .in('member_id', enrolledIds);
      if (sendErr) return errResponse(sendErr.message);

      const weekCounts: Record<string, number> = {};
      for (const r of ((sendRows || []) as Record<string, unknown>[])) {
        const mid = String(r.member_id);
        weekCounts[mid] = (weekCounts[mid] || 0) + 1;
      }

      const members = ((enrolledRows || []) as Record<string, unknown>[]).map(r => {
        const m = (r.members || {}) as Record<string, unknown>;
        const weekSent = weekCounts[String(r.member_id)] || 0;
        const enrolledAt = String(r.enrolled_at || '');
        return {
          name:       String(m.name || ''),
          nick:       String(m.nickname || ''),
          weekSent,
          completed:  weekSent >= 8,
          startDate:  enrolledAt.split('T')[0] || enrolledAt,
          enrolledAt,
          // Keep canonical aliases
          memberName:     String(m.name || ''),
          weeksCompleted: weekSent,
        };
      });

      return jsonResponse({ ok: true, members, enrolled: members });
    }

    // ── GET: onboarding message templates ─────────────────────
    case 'getOnboardingMessages': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const { data, error } = await db
        .from('onboarding_messages')
        .select('week_number, message_text, updated_at')
        .order('week_number', { ascending: true });
      if (error) return errResponse(error.message);

      // Frontend reads r.messages[weekNum] and r.defaults[weekNum] as dicts
      const messages: Record<number, string> = {};
      const defaults: Record<number, string> = {};
      for (const r of ((data || []) as Record<string, unknown>[])) {
        const wk = Number(r.week_number) || 0;
        if (wk > 0) messages[wk] = String(r.message_text || '');
      }
      // Provide empty defaults for weeks 1-8 if not customized
      for (let w = 1; w <= 8; w++) {
        defaults[w] = messages[w] || `[Week ${w} — กำหนดข้อความได้ที่นี่]`;
      }

      return jsonResponse({ ok: true, messages, defaults });
    }

    // ── GET: preview a specific onboarding week message ───────
    case 'getOnboardingPreview': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const weekNum = Number(p.weekNum || 1);
      const { data: msgRow } = await db
        .from('onboarding_messages')
        .select('message_text')
        .eq('week_number', weekNum)
        .maybeSingle();

      const preview = msgRow
        ? String((msgRow as Record<string, unknown>).message_text || '')
        : `[Week ${weekNum} — ยังไม่มีข้อความ]`;

      return jsonResponse({ ok: true, weekNum, preview });
    }

    // ── SAVE: upsert an onboarding message template (MC only) ─
    case 'saveOnboardingMessage': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const weekNum     = Number(p.weekNum);
      const messageText = String(p.messageText || '').trim();
      if (!weekNum || !messageText) return errResponse('weekNum and messageText required');

      const { error } = await db.from('onboarding_messages').upsert(
        { week_number: weekNum, message_text: messageText, updated_at: new Date().toISOString() },
        { onConflict: 'week_number' },
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
        .eq('week_number', weekNum)
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
        { member_id: memberId, week_number: weekNum, sent_at: new Date().toISOString() },
        { onConflict: 'member_id,week_number' },
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

    // ── SETUP RICH MENU (stub) ────────────────────────────────
    case 'setupRichMenu': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);
      return jsonResponse({ ok: true, note: 'Rich Menu ต้องสร้างผ่าน LINE OA Manager แล้ว link ด้วย LINE API — ยังไม่ได้ implement' });
    }

    // ── SETUP ALL CRON TRIGGERS (calls DB function) ───────────
    case 'setupAllTriggers': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const { data, error } = await db.rpc('rebuild_line_cron_jobs');
      if (error) {
        // Likely migrations not run yet
        return errResponse(`ต้องรัน SQL migration ก่อน: 20260611000004_trigger_setup_fn.sql\n${error.message}`);
      }
      const result = data as Record<string, unknown>;
      if (!result.ok) {
        return errResponse(String(result.error || 'setup failed'));
      }
      return jsonResponse({ ok: true, results: result.results });
    }

    // ── TEST LINE CONNECTION ──────────────────────────────────
    case 'testLineConnection': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      if (!LINE_TOKEN) return errResponse('LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า');

      const res = await fetch('https://api.line.me/v2/bot/info', {
        headers: { 'Authorization': `Bearer ${LINE_TOKEN}` },
      }).catch(e => { throw new Error(`Network error: ${e.message}`); });

      if (!res.ok) {
        const body = await res.text();
        return errResponse(`LINE API error ${res.status}: ${body}`);
      }

      const info = await res.json() as Record<string, unknown>;

      // Count registered members
      const { count } = await db.from('line_members').select('*', { count: 'exact', head: true });

      return jsonResponse({
        ok: true,
        botName:    String(info.displayName || ''),
        botPicture: String(info.pictureUrl || ''),
        followers:  Number(info.followerCount || 0),
        registered: count || 0,
      });
    }

    // ── TRIGGER: score alert — send to members with score < 50 ─
    case 'triggerScoreAlert': {
      // Allow cron bypass: verify cron_secret from cron_config table
      const cronSecret = String(p.cron_secret || '');
      if (cronSecret) {
        const { data: cfg } = await db.from('cron_config').select('value').eq('key', 'cron_secret').single();
        if (!cfg || (cfg as Record<string, unknown>).value !== cronSecret) {
          return errResponse('Invalid cron_secret');
        }
        // Cron authenticated — proceed without role check
      } else {
        const auth = await requireAuth(db, p, ['mc']);
        if (!auth.ok) return errResponse(auth.error!);
      }

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

    // ── TRIGGER: Wednesday mentor nudge — remind mentors to check team scores ─
    case 'triggerWednesdayNudge': {
      const cronSecret = String(p.cron_secret || '');
      if (cronSecret) {
        const { data: cfg } = await db.from('cron_config').select('value').eq('key', 'cron_secret').single();
        if (!cfg || (cfg as Record<string, unknown>).value !== cronSecret) return errResponse('Invalid cron_secret');
      } else {
        const auth = await requireAuth(db, p, ['mc']);
        if (!auth.ok) return errResponse(auth.error!);
      }

      // Get mentors who have LINE IDs
      const { data: mentorMembers } = await db
        .from('members')
        .select('id, name, nickname, mentor_team')
        .eq('is_archived', false)
        .in('mentor_team', ['TOOMTAM', 'Aof', 'Draft', 'PHAI', 'AMP']);

      const mentorIds = ((mentorMembers || []) as Record<string, unknown>[]).map(m => String(m.id));
      const { data: lineRows } = await db
        .from('line_members')
        .select('line_user_id, member_id')
        .in('member_id', mentorIds);

      let sentCount = 0;
      for (const row of ((lineRows || []) as Record<string, unknown>[])) {
        const uid = String(row.line_user_id || '');
        if (uid) {
          const nudge = `📋 BNI IDEAL — สรุปสัปดาห์\n\nพรุ่งนี้เจอกันที่ประชุม! 🎯\nอย่าลืมเตรียม:\n• Referral ให้ทีม\n• ตรวจสอบ 1-2-1 ของลูกทีม\n• CEU และ Visitor ครบหรือยัง?\n\nพิมพ์ "สถานะ" เพื่อดูคะแนนล่าสุด`;
          await sendLineMsg(uid, nudge);
          sentCount++;
        }
      }
      return jsonResponse({ ok: true, message: 'wednesday nudge sent', sentCount });
    }

    // ── TRIGGER: Check-In Reminder — Thursday 6AM Bangkok ────────
    case 'triggerCheckinReminder': {
      const cronSecret = String(p.cron_secret || '');
      if (cronSecret) {
        const { data: cfg } = await db.from('cron_config').select('value').eq('key', 'cron_secret').single();
        if (!cfg || (cfg as Record<string, unknown>).value !== cronSecret) return errResponse('Invalid cron_secret');
      } else {
        const auth = await requireAuth(db, p, ['mc']);
        if (!auth.ok) return errResponse(auth.error!);
      }

      const { data: lineRows } = await db.from('line_members').select('line_user_id');
      const msg = `📋 BNI IDEAL — ประชุมวันนี้!\n\nอย่าลืมเตรียมตัว:\n✅ Referral ที่จะส่งวันนี้\n✅ Visitor ที่พาเข้ามา\n✅ 1-2-1 ที่นัดไว้\n\nพบกันเช้านี้ 💪`;
      let sentCount = 0;
      for (const row of ((lineRows || []) as Record<string, unknown>[])) {
        const uid = String(row.line_user_id || '');
        if (uid) { await sendLineMsg(uid, msg); sentCount++; }
      }
      return jsonResponse({ ok: true, message: 'checkin reminder sent', sentCount });
    }

    // ── TRIGGER: BNI Anniversary — Daily 9AM Bangkok ──────────
    case 'triggerAnniversary': {
      const cronSecret = String(p.cron_secret || '');
      if (cronSecret) {
        const { data: cfg } = await db.from('cron_config').select('value').eq('key', 'cron_secret').single();
        if (!cfg || (cfg as Record<string, unknown>).value !== cronSecret) return errResponse('Invalid cron_secret');
      } else {
        const auth = await requireAuth(db, p, ['mc']);
        if (!auth.ok) return errResponse(auth.error!);
      }

      // BNI anniversary = same month/day as expiry_date (member renewed same date each year)
      const today = new Date();
      const todayMM = today.getMonth() + 1;
      const todayDD = today.getDate();

      const { data: renewals } = await db
        .from('renewals')
        .select('member_id, expiry_date, members(name, nickname)')
        .not('expiry_date', 'is', null);

      let sentCount = 0;
      for (const r of ((renewals || []) as Record<string, unknown>[])) {
        const expiry = new Date(String(r.expiry_date));
        if ((expiry.getMonth() + 1) !== todayMM || expiry.getDate() !== todayDD) continue;
        const m = (r.members || {}) as Record<string, unknown>;
        const nick = String(m.nickname || m.name || '');

        const { data: lm } = await db.from('line_members').select('line_user_id')
          .eq('member_id', String(r.member_id)).maybeSingle();
        if (!lm) continue;
        const uid = String((lm as Record<string, unknown>).line_user_id || '');
        if (!uid) continue;

        await sendLineMsg(uid, `🎉 Happy BNI Anniversary, คุณ${nick}!\n\nขอบคุณที่เป็นส่วนหนึ่งของ BNI IDEAL Chapter\nขอให้ปีนี้ธุรกิจรุ่งเรืองยิ่งขึ้นนะครับ/ค่ะ 🌟`);
        sentCount++;
      }
      return jsonResponse({ ok: true, message: 'anniversary sent', sentCount });
    }

    // ── TRIGGER: Weekly Score Push — Friday 8AM Bangkok ──────
    case 'triggerWeeklyScorePush': {
      const cronSecret = String(p.cron_secret || '');
      if (cronSecret) {
        const { data: cfg } = await db.from('cron_config').select('value').eq('key', 'cron_secret').single();
        if (!cfg || (cfg as Record<string, unknown>).value !== cronSecret) return errResponse('Invalid cron_secret');
      } else {
        const auth = await requireAuth(db, p, ['mc']);
        if (!auth.ok) return errResponse(auth.error!);
      }

      const { data: members } = await db
        .from('v_member_dashboard')
        .select('id, name, nickname, display_score, traffic_light')
        .eq('is_archived', false);

      const { data: lineRows } = await db.from('line_members').select('line_user_id, member_id');
      const lineMap: Record<string, string> = {};
      for (const r of ((lineRows || []) as Record<string, unknown>[])) {
        lineMap[String(r.member_id)] = String(r.line_user_id);
      }

      const tlEmoji: Record<string, string> = { green: '🟢', yellow: '🟡', red: '🔴', black: '⚫' };
      let sentCount = 0;
      for (const m of ((members || []) as Record<string, unknown>[])) {
        const uid = lineMap[String(m.id)];
        if (!uid) continue;
        const score = Number(m.display_score) || 0;
        const tl    = String(m.traffic_light || 'black');
        const emoji = tlEmoji[tl] || '⚫';
        const nick  = String(m.nickname || m.name || '');

        const tips = score >= 70
          ? 'ยอดเยี่ยม! รักษาฟอร์มนี้ไว้นะครับ/ค่ะ 💪'
          : score >= 50
          ? 'ใกล้ดีแล้ว! เพิ่ม Visitor หรือ 1-2-1 อีกนิดนึง 🎯'
          : 'ขอแรงหน่อยนะครับ/ค่ะ — ลอง 1-2-1 สักสัปดาห์ละ 2 คน 🤝';

        await sendLineMsg(uid, `📊 สรุปคะแนน PALMS สัปดาห์นี้\nคุณ${nick}\n\n${emoji} ${score} คะแนน (${tl.toUpperCase()})\n\n${tips}\n\nพิมพ์ "สถานะ" เพื่อดูรายละเอียด`);
        sentCount++;
      }
      return jsonResponse({ ok: true, message: 'weekly score push sent', sentCount });
    }

    // ── TRIGGER: Chapter Pulse → MC — Friday 10AM Bangkok ────
    case 'triggerChapterPulse': {
      const cronSecret = String(p.cron_secret || '');
      if (cronSecret) {
        const { data: cfg } = await db.from('cron_config').select('value').eq('key', 'cron_secret').single();
        if (!cfg || (cfg as Record<string, unknown>).value !== cronSecret) return errResponse('Invalid cron_secret');
      } else {
        const auth = await requireAuth(db, p, ['mc']);
        if (!auth.ok) return errResponse(auth.error!);
      }

      // Get MC LINE ID
      const { data: mcSetting } = await db.from('settings').select('value').eq('key', 'MC_LINE_ID').maybeSingle();
      const mcUid = mcSetting ? String((mcSetting as Record<string, unknown>).value || '') : '';
      if (!mcUid) return jsonResponse({ ok: true, message: 'MC LINE ID not set', sentCount: 0 });

      const { data: rows } = await db
        .from('v_member_dashboard')
        .select('traffic_light, display_score, mentor_team')
        .eq('is_archived', false);

      const tl = { green: 0, yellow: 0, red: 0, black: 0 } as Record<string, number>;
      let total = 0, scoreSum = 0;
      for (const r of ((rows || []) as Record<string, unknown>[])) {
        const t = String(r.traffic_light || 'black');
        tl[t] = (tl[t] || 0) + 1;
        scoreSum += Number(r.display_score) || 0;
        total++;
      }
      const avg = total > 0 ? Math.round(scoreSum / total) : 0;

      const pulse = `📊 Chapter Pulse — สรุปสัปดาห์\n\n👥 สมาชิกทั้งหมด: ${total} คน\n⭐ คะแนนเฉลี่ย: ${avg} คะแนน\n\n🟢 เขียว: ${tl.green} คน\n🟡 เหลือง: ${tl.yellow} คน\n🔴 แดง: ${tl.red} คน\n⚫ ดำ: ${tl.black} คน\n\n${avg >= 70 ? '✅ Chapter สัปดาห์นี้ดีมาก!' : avg >= 50 ? '⚠️ ต้องช่วยกันดึงคะแนนขึ้น' : '🚨 หลายคนต้องการความช่วยเหลือด่วน'}`;

      await sendLineMsg(mcUid, pulse);
      return jsonResponse({ ok: true, message: 'chapter pulse sent', sentCount: 1 });
    }

    // ── TRIGGER: Post-Meeting Prompt — Thursday 2PM Bangkok ──
    case 'triggerPostMeetingPrompt': {
      const cronSecret = String(p.cron_secret || '');
      if (cronSecret) {
        const { data: cfg } = await db.from('cron_config').select('value').eq('key', 'cron_secret').single();
        if (!cfg || (cfg as Record<string, unknown>).value !== cronSecret) return errResponse('Invalid cron_secret');
      } else {
        const auth = await requireAuth(db, p, ['mc']);
        if (!auth.ok) return errResponse(auth.error!);
      }

      const { data: lineRows } = await db.from('line_members').select('line_user_id');
      const msg = `✅ BNI IDEAL — หลังประชุมวันนี้\n\nอย่าลืมบันทึก:\n📝 1-2-1 ที่นัดแล้ว\n🤝 Referral ที่รับ/ส่งวันนี้\n🎓 CEU ที่ทำในที่ประชุม\n\nพิมพ์ "สถานะ" เพื่อดูคะแนนอัพเดต`;
      let sentCount = 0;
      for (const row of ((lineRows || []) as Record<string, unknown>[])) {
        const uid = String(row.line_user_id || '');
        if (uid) { await sendLineMsg(uid, msg); sentCount++; }
      }
      return jsonResponse({ ok: true, message: 'post-meeting prompt sent', sentCount });
    }

    // ── TRIGGER: Team Leaderboard — Friday 9AM Bangkok ───────
    case 'triggerTeamLeaderboard': {
      const cronSecret = String(p.cron_secret || '');
      if (cronSecret) {
        const { data: cfg } = await db.from('cron_config').select('value').eq('key', 'cron_secret').single();
        if (!cfg || (cfg as Record<string, unknown>).value !== cronSecret) return errResponse('Invalid cron_secret');
      } else {
        const auth = await requireAuth(db, p, ['mc']);
        if (!auth.ok) return errResponse(auth.error!);
      }

      const { data: rows } = await db
        .from('v_member_dashboard')
        .select('mentor_team, display_score')
        .eq('is_archived', false)
        .not('mentor_team', 'is', null);

      // Calculate team averages
      const teamScores: Record<string, number[]> = {};
      for (const r of ((rows || []) as Record<string, unknown>[])) {
        const team = String(r.mentor_team || '');
        if (!team) continue;
        if (!teamScores[team]) teamScores[team] = [];
        teamScores[team].push(Number(r.display_score) || 0);
      }
      const teams = Object.entries(teamScores)
        .map(([name, scores]) => ({ name, avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) }))
        .sort((a, b) => b.avg - a.avg);

      const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
      const board = teams.map((t, i) => `${medals[i] || '▪️'} ${t.name}: ${t.avg} คะแนน`).join('\n');
      const msg = `🏆 Leaderboard ทีม BNI IDEAL\n\n${board}\n\nทีมไหนจะขึ้นอันดับ 1 สัปดาห์หน้า? 💪`;

      const { data: lineRows } = await db.from('line_members').select('line_user_id');
      let sentCount = 0;
      for (const row of ((lineRows || []) as Record<string, unknown>[])) {
        const uid = String(row.line_user_id || '');
        if (uid) { await sendLineMsg(uid, msg); sentCount++; }
      }
      return jsonResponse({ ok: true, message: 'leaderboard sent', sentCount, teams });
    }

    // ── TRIGGER: Monday Brief — Monday 8AM Bangkok ────────────
    case 'triggerMondayBrief': {
      const cronSecret = String(p.cron_secret || '');
      if (cronSecret) {
        const { data: cfg } = await db.from('cron_config').select('value').eq('key', 'cron_secret').single();
        if (!cfg || (cfg as Record<string, unknown>).value !== cronSecret) return errResponse('Invalid cron_secret');
      } else {
        const auth = await requireAuth(db, p, ['mc']);
        if (!auth.ok) return errResponse(auth.error!);
      }

      const { data: lineRows } = await db.from('line_members').select('line_user_id');
      const msg = `🌅 BNI IDEAL — ต้นสัปดาห์\n\nสัปดาห์ใหม่ เป้าหมายใหม่! 🎯\n\nเป้าสัปดาห์นี้:\n✅ 1-2-1 อย่างน้อย 1 คน\n✅ Referral 1 ใบ\n✅ Visitor 1 คน (ถ้าได้)\n\nพิมพ์ "สถานะ" เพื่อดูคะแนนปัจจุบัน`;
      let sentCount = 0;
      for (const row of ((lineRows || []) as Record<string, unknown>[])) {
        const uid = String(row.line_user_id || '');
        if (uid) { await sendLineMsg(uid, msg); sentCount++; }
      }
      return jsonResponse({ ok: true, message: 'monday brief sent', sentCount });
    }

    // ── TRIGGER: Monthly Recap — Last day of month 9AM Bangkok
    case 'triggerMonthlyRecap': {
      const cronSecret = String(p.cron_secret || '');
      if (cronSecret) {
        const { data: cfg } = await db.from('cron_config').select('value').eq('key', 'cron_secret').single();
        if (!cfg || (cfg as Record<string, unknown>).value !== cronSecret) return errResponse('Invalid cron_secret');
      } else {
        const auth = await requireAuth(db, p, ['mc']);
        if (!auth.ok) return errResponse(auth.error!);
      }

      const { data: members } = await db
        .from('v_member_dashboard')
        .select('id, name, nickname, display_score, traffic_light, given_thb, received_thb')
        .eq('is_archived', false);

      const { data: lineRows } = await db.from('line_members').select('line_user_id, member_id');
      const lineMap: Record<string, string> = {};
      for (const r of ((lineRows || []) as Record<string, unknown>[])) {
        lineMap[String(r.member_id)] = String(r.line_user_id);
      }

      const monthNames = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
      const now = new Date();
      const monthLabel = monthNames[now.getMonth()];

      let sentCount = 0;
      for (const m of ((members || []) as Record<string, unknown>[])) {
        const uid = lineMap[String(m.id)];
        if (!uid) continue;
        const score  = Number(m.display_score) || 0;
        const given  = Number(m.given_thb) || 0;
        const recv   = Number(m.received_thb) || 0;
        const nick   = String(m.nickname || m.name || '');
        const tl     = String(m.traffic_light || 'black');
        const status = tl === 'green' ? 'ยอดเยี่ยม 🌟' : tl === 'yellow' ? 'ดี ⭐' : tl === 'red' ? 'ต้องพัฒนา ⚠️' : 'ต้องปรับปรุงด่วน 🚨';

        await sendLineMsg(uid, `📅 สรุปเดือน${monthLabel} — BNI IDEAL\nคุณ${nick}\n\n🏆 คะแนน PALMS: ${score} (${status})\n💰 Given: ฿${given.toLocaleString()}\n🤝 Received: ฿${recv.toLocaleString()}\n\nขอบคุณที่ร่วมสร้าง Chapter ที่แข็งแกร่ง! 💪`);
        sentCount++;
      }
      return jsonResponse({ ok: true, message: 'monthly recap sent', sentCount });
    }

    // ── TRIGGER: 1-2-1 Reminder — Wednesday 6PM Bangkok ──────
    case 'trigger121Reminder': {
      const cronSecret = String(p.cron_secret || '');
      if (cronSecret) {
        const { data: cfg } = await db.from('cron_config').select('value').eq('key', 'cron_secret').single();
        if (!cfg || (cfg as Record<string, unknown>).value !== cronSecret) return errResponse('Invalid cron_secret');
      } else {
        const auth = await requireAuth(db, p, ['mc']);
        if (!auth.ok) return errResponse(auth.error!);
      }

      // Find members who have done 1-2-1 this week
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
      weekStart.setHours(0, 0, 0, 0);

      const { data: recentLogs } = await db
        .from('one_to_one_logs')
        .select('initiator_id')
        .gte('met_at', weekStart.toISOString());

      const doneIds = new Set(((recentLogs || []) as Record<string, unknown>[]).map(r => String(r.initiator_id)));

      // Get all LINE members
      const { data: lineRows } = await db
        .from('line_members')
        .select('line_user_id, member_id, members(nickname, name)');

      let sentCount = 0;
      for (const row of ((lineRows || []) as Record<string, unknown>[])) {
        const mid = String(row.member_id || '');
        if (doneIds.has(mid)) continue; // Already done 1-2-1 this week
        const uid  = String(row.line_user_id || '');
        const m    = (row.members || {}) as Record<string, unknown>;
        const nick = String(m.nickname || m.name || '');
        if (!uid) continue;

        await sendLineMsg(uid, `🤝 Reminder — 1-2-1 สัปดาห์นี้\nคุณ${nick}\n\nสัปดาห์นี้ยังไม่มีรายการ 1-2-1!\nพรุ่งนี้ประชุม — ลองนัดเพื่อนร่วม Chapter สักคนก่อนนะครับ/ค่ะ\n\nทำ 1-2-1 ช่วยเพิ่มคะแนน PALMS ได้ถึง 15 คะแนน 💡`);
        sentCount++;
      }
      return jsonResponse({ ok: true, message: '1-2-1 reminder sent', sentCount });
    }

    // ── Default stub ──────────────────────────────────────────
    default:
      return errResponse(`unknown action: ${p.action}`);
  }
}

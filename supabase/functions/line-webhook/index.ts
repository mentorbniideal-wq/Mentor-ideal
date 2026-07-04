// ============================================================
// BNI IDEAL — LINE Webhook Edge Function
// Replaces: doPost(e) in WEBAPP.js
//
// LINE calls this URL when a user messages the Bot.
// Must respond within 5 seconds or LINE retries.
// Heavy work is done via getServiceClient() async calls.
// ============================================================
// deno-lint-ignore-file no-explicit-any
// Supabase relation payloads are dynamic because this project does not yet generate database types.

import { corsHeaders } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/db.ts';
import {
  lineReplyMessages,
  eventIdFor, normalizeLinkToken, parseWebhookBody, sha256Hex, verifySignature,
  SIM_CAPTURES,
  type LineEvent,
} from '../_shared/line.ts';
import { commandCardFlex, memberScoreFlex, nextColorAdvice, type CardAction } from '../_shared/line-flex.ts';
import { trackLineEvent } from '../_shared/analytics.ts';
import { runCopilot } from '../_shared/copilot.ts';
import { teamCommandMode, type LineRole } from '../_shared/line-roles.ts';
import { parseLineCommand, type LineCommand } from '../_shared/line-commands.ts';
import { notifyAbsenceStakeholders } from '../_shared/line-absence-notify.ts';

Deno.serve(async (req: Request) => {
  // LINE sends POST requests only
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // Emergency kill switch. The Supabase webhook is the canonical implementation;
  // set this explicitly to "false" only during rollback to the legacy GAS webhook.
  if (Deno.env.get('LINE_WEBHOOK_ENABLED') === 'false') {
    return new Response(
      'Supabase LINE webhook is disabled by emergency kill switch.',
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } },
    );
  }

  const rawBody = await req.text();

  // ── Simulator bypass (admin-api only, validated by service role key) ──────
  const simKey = req.headers.get('X-BNI-Sim') || '';
  if (simKey) {
    if (simKey !== (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '')) {
      return new Response('Unauthorized', { status: 401 });
    }
    const simBody = JSON.parse(rawBody) as { text: string; userId: string };
    const simToken = `sim-${crypto.randomUUID()}`;
    const db = getServiceClient();
    SIM_CAPTURES.set(simToken, []);
    const fakeEvent: LineEvent = {
      type: 'message',
      replyToken: simToken,
      source: { type: 'user', userId: simBody.userId },
      message: { type: 'text', id: 'sim', text: simBody.text },
      timestamp: Date.now(),
      deliveryContext: { isRedelivery: false },
    };
    try {
      await handleEvent(db, fakeEvent, `sim-${Date.now()}`);
    } catch (_) { /* sim errors are non-fatal */ }
    const captured = SIM_CAPTURES.get(simToken) || [];
    SIM_CAPTURES.delete(simToken);
    return new Response(JSON.stringify({ ok: true, messages: captured }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Verify LINE webhook signature (security — reject forged requests)
  const signature = req.headers.get('X-Line-Signature') || '';
  const valid = await verifySignature(rawBody, signature);
  if (!valid) {
    console.warn('[line-webhook] Invalid signature — request rejected');
    return new Response('Unauthorized', { status: 401 });
  }

  const events = parseWebhookBody(rawBody);
  const db = getServiceClient();

  // LINE can redeliver the same event. Each handler atomically claims its event ID.
  await Promise.all(events.map(async (event) => {
    const eventId = await eventIdFor(event);
    const { data: claimed, error: claimError } = await db.rpc('fn_claim_line_webhook_event', {
      p_event_id: eventId,
      p_event_type: event.type,
      p_source_user_id: event.source?.userId || null,
      p_message_id: event.message?.id || null,
      p_metadata: {
        sourceType: event.source?.type || null,
        messageType: event.message?.type || null,
        isRedelivery: event.deliveryContext?.isRedelivery === true,
      },
    });
    if (claimError) {
      console.error('[line-webhook] Cannot claim event:', claimError.message);
      return;
    }
    if (!claimed) return;

    try {
      await handleEvent(db, event, eventId);
      await db.from('line_webhook_events').update({
        status: 'processed',
        processed_at: new Date().toISOString(),
        last_error: null,
      }).eq('event_id', eventId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[line-webhook] Event ${eventId} failed:`, message);
      await db.from('line_webhook_events').update({
        status: 'failed',
        last_error: message.slice(0, 2000),
      }).eq('event_id', eventId);
    }
  }));

  // LINE requires a 200 OK — always return quickly
  return new Response('OK', { status: 200 });
});

// ── Event dispatcher ─────────────────────────────────────────
async function handleEvent(
  db: ReturnType<typeof getServiceClient>,
  ev: LineEvent,
  eventId: string,
): Promise<void> {
  const userId = ev.source?.userId;
  if (!userId) return;

  // ── Follow event: new user adds the Bot ──────────────────────
  if (ev.type === 'follow') {
    await db.from('line_bot_state').upsert({
      line_user_id: userId,
      state_key:    'registration',
      state_value:  'AWAITING',
      updated_at:   new Date().toISOString(),
    });
    if (ev.replyToken) {
      await lineReplyMessages(ev.replyToken, [
        commandCardFlex('ยินดีต้อนรับ', buildWelcomeMessage(), {
          eyebrow: 'BNI IDEAL · START HERE',
          actions: [{ label: 'วิธีเชื่อมบัญชี', type: 'message', text: 'เชื่อม' }],
        }),
      ], {
        db,
        idempotencyKey: `webhook:${eventId}:reply`,
        notificationType: 'welcome',
        source: 'line-webhook',
      });
    }
    return;
  }

  // ── Only handle text messages ────────────────────────────────
  if (ev.type !== 'message' || ev.message?.type !== 'text') return;
  const text = (ev.message.text || '').trim();
  if (!text) return;

  // Look up registered member
  const { data: lineRec } = await db
    .from('line_members')
    .select('member_id, members(name, nickname, mentor_team)')
    .eq('line_user_id', userId)
    .maybeSingle();

  const memberName: string | null = (lineRec as any)?.members?.name ?? null;
  const normalized = text.toLowerCase();
  const role = memberName ? await resolveLineRole(db, userId) : undefined;
  await trackLineEvent(db, 'line_command_received', {
    lineUserId: userId,
    memberId: lineRec?.member_id ? String(lineRec.member_id) : null,
    source: 'line-webhook',
    properties: { command: normalized.split(/\s+/)[0].slice(0, 30) },
  });

  if (memberName && (normalized.startsWith('ถาม ') || normalized.startsWith('copilot ')) && ev.replyToken) {
    const question = text.replace(/^(ถาม|copilot)\s+/i, '').trim();
    const memberData = await getMemberData(db, memberName);
    const context: Record<string, unknown> = role === 'member'
      ? { member: memberData }
      : {
          actor: { role, memberName },
          ownMember: memberData,
          team: role === 'mentor'
            ? await getMentorTeamContext(db, String((lineRec as any)?.members?.mentor_team || ''))
            : undefined,
          chapter: role && ['mc', 'growth'].includes(role) ? await getChapterContext(db) : undefined,
        };
    const answer = await runCopilot({
      db,
      question,
      actorRole: role || 'member',
      source: 'line',
      context,
      memberId: lineRec?.member_id ? String(lineRec.member_id) : null,
      lineUserId: userId,
    });
    await lineReplyMessages(ev.replyToken, [
      commandCardFlex('AI COPILOT', answer, {
        eyebrow: 'IDEAL · MENTOR INTELLIGENCE',
        actions: [{ label: 'ดูสถานะของฉัน', type: 'message', text: 'สถานะ' }],
        quickReplyItems: quickRepliesFor(role, true),
      }),
    ], {
      db,
      idempotencyKey: `webhook:${eventId}:copilot`,
      memberId: lineRec?.member_id ? String(lineRec.member_id) : null,
      notificationType: 'copilot',
      source: 'line-webhook',
    });
    await trackLineEvent(db, 'copilot_answered', {
      lineUserId: userId,
      memberId: lineRec?.member_id ? String(lineRec.member_id) : null,
      role: role || 'member',
      source: 'line-webhook',
    });
    return;
  }
  if (memberName && ['สถานะ', 'score', 'คะแนน'].includes(normalized) && ev.replyToken) {
    const data = await getMemberData(db, memberName);
    if (data) {
      await lineReplyMessages(
        ev.replyToken,
        [withQuickReplies(
          memberScoreFlex(data, Deno.env.get('LINE_LIFF_URL') || ''),
          quickRepliesFor(role, true, data),
        )],
        {
          db,
          idempotencyKey: `webhook:${eventId}:score-flex`,
          memberId: lineRec?.member_id ? String(lineRec.member_id) : null,
          notificationType: 'score_card',
          source: 'line-webhook',
        },
      );
      return;
    }
  }
  const parsedCommand = parseLineCommand(text);
  const replyText = await processCommand(db, userId, text, memberName, eventId, role);

  if (replyText && ev.replyToken) {
    const isRegistered = !!memberName;
    const qrData = memberName ? await getMemberData(db, memberName) : null;
    const qrButtons = quickRepliesFor(role, isRegistered, qrData || undefined, parsedCommand.name);
    const presentation = commandPresentation(parsedCommand.name, role, replyText);
    await lineReplyMessages(
      ev.replyToken,
      [commandCardFlex(presentation.title, replyText, {
        eyebrow: presentation.eyebrow,
        tone: presentation.tone,
        actions: presentation.actions,
        quickReplyItems: qrButtons,
      })],
      {
        db,
        idempotencyKey: `webhook:${eventId}:reply`,
        memberId: lineRec?.member_id ? String(lineRec.member_id) : null,
        notificationType: 'command_reply',
        source: 'line-webhook',
      },
    );
  }
}

function qr(label: string, text: string): unknown {
  return { type: 'action', action: { type: 'message', label, text } };
}

function quickRepliesFor(
  role: LineRole | undefined,
  isRegistered: boolean,
  data?: Record<string, unknown>,
  currentCommand?: LineCommand,
): unknown[] | undefined {
  if (!isRegistered) return undefined;
  const advice = data ? nextColorAdvice(data) : null;
  const actionFirst = Boolean(advice && advice.pointsNeeded > 0 && currentCommand !== 'action-plan');
  const primary = actionFirst
    ? [
      qr('🎯 ทำอะไร', 'ทำอะไร'),
      qr('📊 สถานะ', 'สถานะ'),
      qr('📈 ประวัติ', 'ประวัติ'),
    ]
    : [
      qr('📊 สถานะ', 'สถานะ'),
      qr('📈 ประวัติ', 'ประวัติ'),
      qr('🎯 ทำอะไร', 'ทำอะไร'),
    ];
  const secondary = [
    qr('👥 ทีม', 'ทีม'),
    qr('🤝 แนะนำ', 'แนะนำ'),
    qr('🙋 ลา', 'ลา'),
    qr('👥 ส่ง sub', 'ส่ง sub'),
    qr('🧭 ช่วยเหลือ', 'ช่วยเหลือ'),
  ];
  // Elevated LINE roles now use the same member-support command set.
  if (role === 'mentor' || role === 'mc' || role === 'growth') return [...primary, ...secondary];
  return [...primary, ...secondary];
}

function withQuickReplies(message: Record<string, unknown>, items?: unknown[]): Record<string, unknown> {
  if (items?.length) message.quickReply = { items: items.slice(0, 13) };
  return message;
}

function commandPresentation(
  command: LineCommand,
  role: LineRole | undefined,
  body: string,
): {
  title: string;
  eyebrow?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  actions?: CardAction[];
} {
  const chapterRole = role === 'mc' || role === 'growth';
  const definitions: Partial<Record<LineCommand, { title: string; actions?: CardAction[] }>> = {
    'debug-id': { title: 'LINE ACCOUNT' },
    status: { title: 'WEEKLY PULSE', actions: [{ label: 'ดูประวัติ', type: 'message', text: 'ประวัติ' }] },
    'action-plan': {
      title: 'TODAY’S MOVE',
      actions: [
        { label: 'ดูสถานะ', type: 'message', text: 'สถานะ' },
        { label: 'ดูประวัติ', type: 'message', text: 'ประวัติ' },
      ],
    },
    history: { title: 'SCORE TREND', actions: [{ label: 'ดูสถานะล่าสุด', type: 'message', text: 'สถานะ' }] },
    team: {
      title: chapterRole ? 'MENTOR TEAMS' : 'MY MENTOR TEAM',
      actions: [{
        label: chapterRole ? 'ดู Chapter Pulse' : 'ดูสถานะของฉัน',
        type: 'message',
        text: chapterRole ? 'chapter pulse' : 'สถานะ',
      }],
    },
    focus3: { title: 'FOCUS 3', actions: [{ label: 'ดูทีมทั้งหมด', type: 'message', text: 'ทีม' }] },
    'chapter-pulse': { title: 'CHAPTER PULSE', actions: [{ label: 'ดูทุกทีม', type: 'message', text: 'ทีม' }] },
    'chapter-trend': { title: 'CHAPTER TREND', actions: [{ label: 'ดูทุกทีม', type: 'message', text: 'ทีม' }] },
    tracking: { title: '1-2-1 TRACKER', actions: [{ label: 'ดูคำแนะนำคู่ใหม่', type: 'message', text: 'แนะนำ' }] },
    goals: { title: 'MY GOALS' },
    notifications: { title: 'NOTIFICATIONS' },
    issues: { title: 'MENTOR SUPPORT' },
    met: { title: '1-2-1 CHECK-IN' },
    match: { title: 'SMART MATCH', actions: [{ label: 'ดูประวัติ 1-2-1', type: 'message', text: 'ติดตาม' }] },
    schedule: { title: '1-2-1 SCHEDULE', actions: [{ label: 'ดูรายการติดตาม', type: 'message', text: 'ติดตาม' }] },
    absence: { title: 'ABSENCE NOTICE', actions: [{ label: 'ยกเลิกการลา', type: 'message', text: 'ยกเลิกลา' }] },
    substitute: { title: 'SUBSTITUTE NOTICE', actions: [{ label: 'ยกเลิกรายการ', type: 'message', text: 'ยกเลิกลา' }] },
    'cancel-absence': { title: 'NOTICE UPDATED' },
    'report-issue': { title: 'MENTOR SUPPORT', actions: [{ label: 'ดูเรื่องที่แจ้ง', type: 'message', text: 'ปัญหา' }] },
    'delete-account': { title: 'ACCOUNT UNLINKED' },
    'business-profile': { title: 'BUSINESS PROFILE', actions: [{ label: 'ค้นหาคู่ 1-2-1', type: 'message', text: 'แนะนำ' }] },
    'set-goal': { title: 'GOAL UPDATED', actions: [{ label: 'ดูเป้าหมาย', type: 'message', text: 'เป้า' }] },
    'mute-notification': { title: 'NOTIFICATIONS UPDATED' },
    'unmute-notification': { title: 'NOTIFICATIONS UPDATED' },
    help: { title: 'COMMAND GUIDE', actions: [{ label: 'ดูสถานะของฉัน', type: 'message', text: 'สถานะ' }] },
  };
  const definition = definitions[command] || definitions.help!;
  return {
    ...definition,
    tone: /❌|ไม่สามารถ|ผิดพลาด/.test(body)
      ? 'danger'
      : /⚠️|ยังไม่มี|ไม่พบ|กรุณา/.test(body)
      ? 'warning'
      : /✅|สำเร็จ|บันทึกแล้ว|รับทราบ|ยินดีต้อนรับ/.test(body)
      ? 'success'
      : 'default',
  };
}

async function resolveLineRole(
  db: ReturnType<typeof getServiceClient>,
  userId: string,
): Promise<LineRole> {
  const [{ data: lineIds }, { data: aliases }] = await Promise.all([
    db.from('settings').select('key, value').like('key', 'LINE_ID_%'),
    db.from('settings').select('key, value').in('key', [
      'LINE_ID_MC',
      'MC_LINE_ID',
      'MC_LINE_USER_ID',
      'LINE_ID_GROWTH',
      'GROWTH_LINE_ID',
      'GROWTH_LINE_USER_ID',
    ]),
  ]);
  const data = [...(lineIds || []), ...(aliases || [])];
  const match = (data || []).find((row: Record<string, unknown>) => String(row.value || '') === userId);
  const key = String((match as Record<string, unknown> | undefined)?.key || '');
  // LINE is intentionally a member-support layer only. MC, Growth, and Mentor work
  // lives in the web app where context, permissions, and audit trails are clearer.
  if (['LINE_ID_MC', 'MC_LINE_ID', 'MC_LINE_USER_ID'].includes(key)) return 'member';
  if (['LINE_ID_GROWTH', 'GROWTH_LINE_ID', 'GROWTH_LINE_USER_ID'].includes(key)) return 'member';
  if (key.startsWith('LINE_ID_')) return 'member';

  // Mentor accounts do not get elevated LINE behavior; normal mentors remain
  // member experience in LINE.
  const { data: linked } = await db.from('line_members')
    .select('members(name, nickname, email)')
    .eq('line_user_id', userId)
    .maybeSingle();
  const member = (linked as any)?.members;
  const identities = [member?.name, member?.nickname]
    .map((value) => normalizePersonName(String(value || '')))
    .filter(Boolean);
  if (identities.length) {
    const { data: teams } = await db.from('mentor_teams').select('leader_name');
    const leadsTeam = (teams || []).some((team: Record<string, unknown>) => {
      const leader = normalizePersonName(String(team.leader_name || ''));
      if (!leader) return false;
      return identities.some((identity) =>
        leader === identity || leader.includes(identity) || identity.includes(leader)
      );
    });
    if (leadsTeam) return 'member';
  }

  // Email-based fallback: match member email against role_assignments
  const email = String(member?.email || '').trim().toLowerCase();
  if (email) {
    const { data: ra } = await db.from('role_assignments')
      .select('role, is_mentor')
      .ilike('email', email)
      .maybeSingle();
    if (ra) {
      if (String((ra as any).role) === 'mc') return 'member';
      if ((ra as any).is_mentor) return 'member';
    }
  }

  return 'member';
}

function normalizePersonName(value: string): string {
  return value.toLocaleLowerCase('en-US').replace(/[^a-z0-9ก-๙]/g, '');
}

async function getMentorTeamContext(
  db: ReturnType<typeof getServiceClient>,
  team: string,
) {
  if (!team) return [];
  const { data } = await db.from('v_member_dashboard')
    .select('name, nickname, display_score, traffic_light, open_core_issue, days_to_expiry')
    .eq('mentor_team', team)
    .eq('is_archived', false)
    .order('display_score', { ascending: true })
    .limit(20);
  return data || [];
}

async function getChapterContext(db: ReturnType<typeof getServiceClient>) {
  const { data } = await db.from('v_member_dashboard')
    .select('mentor_team, display_score, traffic_light, days_to_expiry')
    .eq('is_archived', false);
  const rows = (data || []) as Record<string, unknown>[];
  return {
    totalMembers: rows.length,
    averageScore: rows.length
      ? Math.round(rows.reduce((sum, row) => sum + Number(row.display_score || 0), 0) / rows.length)
      : 0,
    traffic: rows.reduce((acc: Record<string, number>, row) => {
      const key = String(row.traffic_light || 'none');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    renewalsWithin45Days: rows.filter((row) => Number(row.days_to_expiry) <= 45).length,
  };
}

// ── Command processor ────────────────────────────────────────
async function processCommand(
  db: ReturnType<typeof getServiceClient>,
  userId: string,
  text: string,
  memberName: string | null,
  eventId: string,
  role: LineRole = 'member',
): Promise<string> {
  const t = text.toLowerCase().trim();

  // ── Not registered: registration flow ───────────────────────
  if (!memberName) {
    const secureLink = text.match(/^(?:เชื่อม|link)\s+(.+)$/i);
    if (secureLink) return await consumeSecureLink(db, userId, secureLink[1]);
    return await handleRegistration(db, userId, text);
  }

  // ── Registered member commands ───────────────────────────────
  const pending = await getPendingState(db, userId);

  // Pending states from previous interactions
  if (pending?.key === 'absence' && pending.value === 'AWAITING_SUB') {
    await clearState(db, userId, 'absence');
    if (t === 'ยกเลิก' || t === 'cancel') return '✅ ยกเลิกแล้วครับ';
    return await logAbsence(db, memberName, text.trim(), 'ส่ง sub', eventId);
  }
  if (pending?.key === '121_outcome') {
    const partnerId = pending.value;
    await clearState(db, userId, '121_outcome');
    return await log121Outcome(db, memberName, userId, partnerId, text.trim());
  }

  const command = parseLineCommand(text);
  switch (command.name) {
    case 'debug-id':
      return `🆔 LINE User ID:\n${userId}`;
    case 'status':
      // fast-path in handleEvent sends Flex for registered members; this fallback handles unregistered
      return memberName ? await replyStatus(db, memberName) : 'กรุณาเชื่อมบัญชี LINE กับระบบก่อนครับ 📱';
    case 'action-plan':
      return await replyActionPlan(db, memberName);
    case 'history':
      return await replyHistory(db, memberName);
    case 'team':
      return teamCommandMode(role) === 'all-teams'
        ? await replyAllTeams(db)
        : await replyTeam(db, memberName);
    case 'focus3':
      return await replyFocus3(db, memberName, userId);
    case 'chapter-pulse':
      return await replyChapterPulse(db, role);
    case 'chapter-trend':
      return await replyChapterTrend(db);
    case 'tracking':
      return await reply121(db, memberName);
    case 'goals':
      return await replyGoals(db, memberName);
    case 'notifications':
      return await replyNotifSettings(db, memberName);
    case 'issues':
      return await replyIssues(db, memberName);
    case 'met':
      return await confirm121Met(db, memberName, userId);
    case 'match':
      return await replyMatch(db, memberName, command.argument);
    case 'schedule':
      return await schedule121(db, memberName, command.argument);
    case 'absence':
      return await logAbsence(db, memberName, command.argument, 'ลา', eventId);
    case 'substitute':
      if (command.argument) {
        return await logAbsence(db, memberName, command.argument, 'ส่ง sub', eventId);
      }
      await setState(db, userId, 'absence', 'AWAITING_SUB');
      return '👥 ส่ง Sub\nพิมพ์ชื่อคนที่จะมาแทนคุณได้เลยครับ';
    case 'cancel-absence':
      return await cancelAbsence(db, memberName, userId);
    case 'report-issue':
      return await reportIssue(db, memberName, command.argument);
    case 'delete-account':
      return await unregister(db, userId, memberName);
    case 'business-profile':
      return await setBizProfile(db, memberName, command.argument);
    case 'set-goal':
      return await setGoal(db, memberName, command.argument);
    case 'mute-notification':
      return await toggleNotif(db, memberName, command.argument, true);
    case 'unmute-notification':
      return await toggleNotif(db, memberName, command.argument, false);
    case 'help':
      return buildHelpMessage(memberName);
  }
}

// ── Registration flow ────────────────────────────────────────
async function handleRegistration(
  db: ReturnType<typeof getServiceClient>,
  userId: string,
  text: string,
): Promise<string> {
  const allowLegacy = Deno.env.get('LINE_ALLOW_LEGACY_NAME_REGISTRATION') === 'true';
  if (!allowLegacy) {
    return (
      '🔐 เพื่อความปลอดภัย กรุณาใช้รหัสเชื่อมบัญชีจาก Mentor Coordinator\n\n' +
      'พิมพ์: เชื่อม ABCD1234\n\n' +
      'รหัสใช้ได้ครั้งเดียวและมีวันหมดอายุครับ'
    );
  }

  const state = await getState(db, userId, 'registration');

  if (!state || state === 'AWAITING') {
    await setState(db, userId, 'registration', 'AWAITING');
    // Search by name OR nickname (Thai/English both work)
    const { data: matches } = await db
      .from('members')
      .select('name, nickname, mentor_team')
      .or(`name.ilike.%${text}%,nickname.ilike.%${text}%`)
      .eq('is_archived', false)
      .limit(3);

    if (!matches?.length) {
      return `❌ ไม่พบ "${text}" ใน BNI IDEAL\n\nลองส่งชื่อ-นามสกุล BNI (ภาษาอังกฤษ) อีกครั้งนะครับ\nเช่น: Phitarn Sakulthanaphetch`;
    }
    if (matches.length === 1) {
      await setState(db, userId, 'registration', `CONFIRM:${matches[0].name}`);
      return `✅ พบสมาชิก:\n${matches[0].nickname || matches[0].name.split(' ')[0]} (${matches[0].name})\nทีม: ${matches[0].mentor_team || '—'}\n\nใช่คุณไหมครับ? ตอบ "ใช่" หรือ "ไม่ใช่"`;
    }
    const opts = matches.map((m: { name: string; nickname: string }, i: number) =>
      `${i + 1}. ${m.nickname || m.name.split(' ')[0]} (${m.name})`).join('\n');
    await setState(db, userId, 'registration', `CHOOSE:${matches.map((m: { name: string }) => m.name).join('|')}`);
    return `พบหลายคนที่คล้ายกัน:\n${opts}\n\nตอบ 1, 2 หรือ 3 ครับ`;
  }

  if (state.startsWith('CONFIRM:')) {
    const pending = state.slice(8);
    const t = text.toLowerCase();
    if (t === 'ใช่' || t === 'yes' || t === 'ok' || t === 'ยืนยัน' || t === '1') {
      await registerMember(db, userId, pending);
      const { data: m } = await db.from('members').select('nickname').eq('name', pending).single();
      return `ยินดีต้อนรับสู่ BNI IDEAL ครับ คุณ${(m as any)?.nickname || pending.split(' ')[0]}! 🎉\nพิมพ์ "สถานะ" ดูคะแนนแรกเลยครับ`;
    }
    await setState(db, userId, 'registration', 'AWAITING');
    return 'โอเครับ ลองส่งชื่ออีกครั้งนะครับ';
  }

  if (state.startsWith('CHOOSE:')) {
    const names = state.slice(7).split('|');
    const idx = parseInt(text) - 1;
    if (idx >= 0 && idx < names.length) {
      await registerMember(db, userId, names[idx]);
      const { data: m } = await db.from('members').select('nickname').eq('name', names[idx]).single();
      return `ยินดีต้อนรับสู่ BNI IDEAL ครับ คุณ${(m as any)?.nickname || names[idx].split(' ')[0]}! 🎉\nพิมพ์ "สถานะ" ดูคะแนนแรกเลยครับ`;
    }
    return 'ตอบ 1, 2 หรือ 3 ครับ';
  }

  await setState(db, userId, 'registration', 'AWAITING');
  return buildRegistrationPrompt();
}

async function consumeSecureLink(
  db: ReturnType<typeof getServiceClient>,
  userId: string,
  rawToken: string,
): Promise<string> {
  const token = normalizeLinkToken(rawToken);
  if (token.length < 8) return '⚠️ รหัสเชื่อมบัญชีไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่ครับ';

  const tokenHash = await sha256Hex(token);
  const { data, error } = await db.rpc('fn_consume_line_link_token', {
    p_token_hash: tokenHash,
    p_line_user_id: userId,
  });
  if (error) {
    console.warn('[line-webhook] Secure link rejected:', error.message);
    return '⚠️ ไม่สามารถเชื่อมบัญชีได้ รหัสอาจถูกใช้แล้ว หมดอายุ หรือบัญชีถูกเชื่อมไว้แล้วครับ';
  }

  const row = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
  if (!row) return '⚠️ ไม่พบรหัสนี้ หรือรหัสหมดอายุแล้ว กรุณาขอรหัสใหม่จาก Mentor Coordinator ครับ';

  const nick = String(row.nickname || row.member_name || '').trim();

  // Assign member rich menu immediately so the user sees the right menu without waiting for cron
  const LINE_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '';
  if (LINE_TOKEN) {
    const { data: menuSetting } = await db.from('settings')
      .select('value').eq('key', 'LINE_RICH_MENU_MEMBER').maybeSingle();
    const menuId = String((menuSetting as Record<string, unknown> | null)?.value || '');
    if (menuId) {
      fetch(`https://api.line.me/v2/bot/user/${userId}/richmenu/${menuId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${LINE_TOKEN}` },
      }).catch((e: Error) => console.warn('[consumeSecureLink] Rich menu assign failed:', e.message));
    }
  }

  return `เชื่อมบัญชีสำเร็จแล้วครับ คุณ${nick || 'สมาชิก'}! 🎉\nพิมพ์ "สถานะ" ดูคะแนนแรกเลยครับ`;
}

// ── State management helpers ─────────────────────────────────
async function getState(db: ReturnType<typeof getServiceClient>, userId: string, key: string): Promise<string | null> {
  const { data } = await db.from('line_bot_state')
    .select('state_value').eq('line_user_id', userId).eq('state_key', key).single();
  return (data as any)?.state_value ?? null;
}

async function setState(db: ReturnType<typeof getServiceClient>, userId: string, key: string, value: string): Promise<void> {
  await db.from('line_bot_state').upsert({
    line_user_id: userId, state_key: key, state_value: value, updated_at: new Date().toISOString(),
  });
}

async function clearState(db: ReturnType<typeof getServiceClient>, userId: string, key: string): Promise<void> {
  await db.from('line_bot_state').delete().eq('line_user_id', userId).eq('state_key', key);
}

async function getPendingState(db: ReturnType<typeof getServiceClient>, userId: string): Promise<{ key: string; value: string } | null> {
  const { data } = await db.from('line_bot_state')
    .select('state_key, state_value')
    .eq('line_user_id', userId)
    .in('state_key', ['absence', '121_outcome'])
    .limit(1).single();
  if (!data) return null;
  return { key: (data as any).state_key, value: (data as any).state_value };
}

// ── Member data ───────────────────────────────────────────────
async function getMemberData(db: ReturnType<typeof getServiceClient>, name: string) {
  const { data } = await db
    .from('v_member_dashboard')
    .select('*')
    .eq('name', name)
    .single();
  return data as Record<string, unknown> | null;
}

// ── Command implementations ───────────────────────────────────
async function replyStatus(db: ReturnType<typeof getServiceClient>, memberName: string): Promise<string> {
  const d = await getMemberData(db, memberName);
  if (!d) return '⚠️ ยังไม่มีข้อมูลคะแนนเดือนนี้\nรอ Coordinator import CSV ก่อนนะครับ';

  const score = Number(d.display_score || 0);
  const tl    = String(d.traffic_light || 'black');
  const nick  = String(d.nickname || memberName.split(' ')[0]);
  const palms = d.palms_detail as Record<string, number> | null;

  const headerMap: Record<string, string> = {
    green:  `🟢 ${nick} ${score}/100 — ระดับท็อปเลย! 🔥`,
    yellow: `🟡 ${nick} ${score}/100 — ใกล้เขียวแล้ว`,
    red:    `🔴 ${nick} ${score}/100 — ยังไปต่อได้ครับ`,
    black:  `⚫ ${nick} ${score}/100 — มาเริ่มกันใหม่ครับ`,
    none:   `⚫ ${nick} ${score}/100`,
  };

  const rows = [
    `${bar(palms?.absence,  15)}  ขาดประชุม  ${palms?.absence  ?? 0}/15`,
    `${bar(palms?.referral, 15)}  Referral   ${palms?.referral ?? 0}/15`,
    `${bar(palms?.oneToOne, 15)}  1-2-1      ${palms?.oneToOne ?? 0}/15`,
    `${bar(palms?.visitor,  20)}  Visitor    ${palms?.visitor  ?? 0}/20`,
    `${bar(palms?.ceu,      20)}  CEU        ${palms?.ceu      ?? 0}/20`,
    `${bar(palms?.tyfb,     15)}  TYFCB      ${palms?.tyfb     ?? 0}/15`,
  ];

  // Pick highest-impact gap (Visitor/CEU rank first — higher max)
  const comps: { label: string; got: number; max: number; hint: string }[] = [
    { label: 'Visitor',  got: palms?.visitor   ?? 0, max: 20, hint: 'พา Visitor 1 คนมาประชุม' },
    { label: 'CEU',      got: palms?.ceu       ?? 0, max: 20, hint: 'เข้า CEU เพิ่ม' },
    { label: 'Referral', got: palms?.referral  ?? 0, max: 15, hint: 'ส่ง Referral สัปดาห์นี้' },
    { label: '1-2-1',    got: palms?.oneToOne  ?? 0, max: 15, hint: 'นัด 1-2-1 สัปดาห์นี้' },
    { label: 'Absence',  got: palms?.absence   ?? 0, max: 15, hint: 'เข้าประชุมสม่ำเสมอ' },
  ];
  const topGap = comps.reduce((a, b) => (b.max - b.got) > (a.max - a.got) ? b : a);
  const gap = topGap.max - topGap.got;

  const closingMap: Record<string, string> = {
    green:  gap > 0 ? `อีก ${gap}pt: ${topGap.hint} 💪` : `🏆 Full Score! Givers Gain ครับ`,
    yellow: `จุดด่วน: ${topGap.label} +${gap}pt → ${topGap.hint}`,
    red:    `ด่วน: ${topGap.hint} → +${gap}pt\nพิมพ์ "ปัญหา [เรื่อง]" ให้ Mentor ช่วยได้เลย`,
    black:  `เริ่มจาก: ${topGap.hint}\nพิมพ์ "ปัญหา [เรื่อง]" ให้ Mentor ช่วยได้เลยครับ`,
    none:   gap > 0 ? `🎯 ${topGap.hint}` : '',
  };

  const parts = [headerMap[tl] || headerMap.black, '', ...rows];
  const closing = closingMap[tl] || '';
  if (closing) parts.push('', closing);
  parts.push('พิมพ์ "ประวัติ" ดู Trend ↑↓');
  return parts.join('\n');
}

function memberActionTemplate(action: string): { why: string; today: string; script: string } {
  if (/Visitor|ชวน Visitor/i.test(action)) {
    return {
      why: 'Visitor มักขยับคะแนนเร็ว และช่วยเพิ่มโอกาส referral ในห้อง',
      today: 'เลือก 1 คนที่น่าจะได้ connection จาก BNI แล้วชวนมาศุกร์นี้',
      script: '“ศุกร์นี้ผมมีประชุมกลุ่มธุรกิจที่ส่ง referral กันจริงจัง อยากชวนมาลองรู้จักเพื่อน ๆ ครับ”',
    };
  }
  if (/Referral|ส่ง Referral/i.test(action)) {
    return {
      why: 'Referral เป็น action ที่ทำได้ทันที และช่วยให้ทีมเห็นโอกาสของคุณ',
      today: 'เปิดรายชื่อลูกค้า/เพื่อน 10 คน แล้วจับคู่ให้สมาชิก 1 คน',
      script: '“ผมนึกถึงคนนี้ว่าอาจเหมาะกับบริการของคุณ เดี๋ยวผมแนะนำให้รู้จักนะครับ”',
    };
  }
  if (/1-2-1|121/i.test(action)) {
    return {
      why: '1-2-1 ช่วยให้คนจำธุรกิจคุณได้ชัดขึ้น และมักต่อยอดเป็น referral',
      today: 'นัด 1 คนใน chapter แบบ 20 นาที ภายในสัปดาห์นี้',
      script: '“สัปดาห์นี้สะดวก 1-2-1 กัน 20 นาทีไหมครับ อยากรู้จักธุรกิจคุณให้ส่งต่อได้ดีขึ้น”',
    };
  }
  if (/CEU|เรียน/i.test(action)) {
    return {
      why: 'CEU เป็นวิธีปิด gap ที่จบเป็นชิ้นงานเดียวและคุมเวลาได้ง่าย',
      today: 'เลือก training 1 รายการ แล้วจองเวลาทำให้จบก่อนประชุมครั้งถัดไป',
      script: 'พิมพ์ “Training Check” ในระบบเพื่อดูหัวข้อที่ใช้ส่งต่อสมาชิกได้',
    };
  }
  if (/TYFCB|TYFB|บาท/i.test(action)) {
    return {
      why: 'TYFCB สะท้อนผลลัพธ์ธุรกิจจริง และช่วยให้ chapter เห็นพลังของ referral',
      today: 'รวบรวมยอดปิดดีลจาก referral ล่าสุด แล้วบันทึก/แจ้งยอดให้ครบ',
      script: '“ดีลนี้เกิดจาก referral ของ BNI ครับ ขอส่ง TYFCB ให้ระบบครบถ้วน”',
    };
  }
  return {
    why: 'จุดนี้เป็น action ที่ทำให้คะแนนขยับได้เร็วที่สุดจากข้อมูลล่าสุด',
    today: 'ทำ action นี้ 1 ครั้งก่อนประชุมครั้งถัดไป',
    script: 'เริ่มจาก 1 action เล็ก ๆ วันนี้ แล้วค่อยต่อยอดในสัปดาห์นี้ครับ',
  };
}

async function replyActionPlan(db: ReturnType<typeof getServiceClient>, memberName: string): Promise<string> {
  const d = await getMemberData(db, memberName);
  if (!d) return '⚠️ ยังไม่มีข้อมูลคะแนนเดือนนี้\nรอ Coordinator import CSV ก่อนนะครับ';

  const nick = String(d.nickname || memberName.split(' ')[0]);
  const score = Math.round(Number(d.display_score || 0));
  const advice = nextColorAdvice(d);
  const template = memberActionTemplate(advice.action);
  const targetLine = advice.pointsNeeded > 0
    ? `${advice.currentLabel} → ${advice.nextLabel} · ขาด ${advice.pointsNeeded}pt`
    : `${advice.currentLabel} · รักษาความสม่ำเสมอ`;

  return [
    `🎯 ${nick} · ทำวันนี้`,
    targetLine,
    '',
    `1️⃣ ${advice.action}`,
    `ทำไม: ${template.why}`,
    '',
    `2️⃣ วันนี้ให้ทำ`,
    template.today,
    '',
    `3️⃣ ข้อความพร้อมใช้`,
    template.script,
    '',
    'พิมพ์ “สถานะ” เพื่อดูคะแนนเต็ม',
  ].join('\n');
}

async function replyFocus3(db: ReturnType<typeof getServiceClient>, memberName: string, userId?: string): Promise<string> {
  const tlIcon: Record<string, string> = { green: '🟢', yellow: '🟡', red: '🔴', black: '⚫', none: '⚫' };
  const nums = ['1️⃣', '2️⃣', '3️⃣'];

  // Determine role — Mentors see their team's top 3 members needing help
  const role = userId ? await resolveLineRole(db, userId) : 'member';

  if (role === 'mentor') {
    // Find the team led by this mentor
    const { data: meRow } = await db.from('members').select('nickname').eq('name', memberName).single();
    const nick = String((meRow as any)?.nickname || '');
    const { data: ledTeam } = await db.from('mentor_teams')
      .select('name')
      .or(`leader_name.ilike.%${memberName}%${nick ? `,leader_name.ilike.%${nick}%` : ''}`)
      .limit(1)
      .single();
    const teamName = (ledTeam as any)?.name ?? null;

    if (!teamName) {
      // Fall back to own PALMS if team not found
    } else {
      // Fetch team members ordered by score ascending (neediest first), exclude green
      const { data: teamMembers } = await db
        .from('v_member_dashboard')
        .select('name, nickname, display_score, traffic_light, palms_detail')
        .eq('mentor_team', teamName)
        .eq('is_archived', false)
        .neq('traffic_light', 'green')
        .order('display_score', { ascending: true })
        .limit(3);

      if (teamMembers && (teamMembers as Record<string, unknown>[]).length > 0) {
        const lines = [`🎯 Focus 3 — ทีม ${teamName}`, ''];
        (teamMembers as Record<string, unknown>[]).forEach((m, i) => {
          const mNick = String(m.nickname || String(m.name).split(' ')[0]);
          const mScore = Number(m.display_score || 0);
          const mTl = String(m.traffic_light || 'black');
          const palms = m.palms_detail as Record<string, number> | null;

          // Find largest gap for this member
          const comps = [
            { label: 'Visitor',  got: palms?.visitor  ?? 0, max: 20 },
            { label: 'CEU',      got: palms?.ceu      ?? 0, max: 20 },
            { label: 'Referral', got: palms?.referral ?? 0, max: 15 },
            { label: '1-2-1',   got: palms?.oneToOne ?? 0, max: 15 },
            { label: 'Absence',  got: palms?.absence  ?? 0, max: 15 },
            { label: 'TYFCB',   got: palms?.tyfb     ?? 0, max: 15 },
          ];
          const topGap = comps.reduce((a, b) => (b.max - b.got) > (a.max - a.got) ? b : a);
          const gapPts = topGap.max - topGap.got;

          lines.push(`${nums[i]} ${tlIcon[mTl] || '⚫'} ${mNick}  ${mScore}pt`);
          if (gapPts > 0) lines.push(`   → ช่องว่าง ${topGap.label} ${topGap.got}/${topGap.max}`);
        });
        lines.push('', 'พิมพ์ "ทีม" ดูอันดับทีมทั้งหมด');
        return lines.join('\n');
      }

      // All members are green
      return `🏆 ทีม ${teamName} ทุกคนเขียวหมดแล้วครับ! ยอดเยี่ยมมาก 💪\nพิมพ์ "ทีม" ดูอันดับทีม`;
    }
  }

  // Member / MC / growth path — show own PALMS gaps
  const d = await getMemberData(db, memberName);
  if (!d) return '⚠️ ยังไม่มีข้อมูลคะแนนเดือนนี้ครับ';

  const nick  = String(d.nickname || memberName.split(' ')[0]);
  const score = Number(d.display_score || 0);
  const tl    = String(d.traffic_light || 'black');
  const palms = d.palms_detail as Record<string, number> | null;

  const gaps = [
    { label: 'Visitor',  got: palms?.visitor   ?? 0, max: 20, action: 'พา Visitor มาประชุม' },
    { label: 'CEU',      got: palms?.ceu       ?? 0, max: 20, action: 'เข้า CEU เพิ่ม' },
    { label: 'Referral', got: palms?.referral  ?? 0, max: 15, action: 'ส่ง Referral สัปดาห์นี้' },
    { label: '1-2-1',    got: palms?.oneToOne  ?? 0, max: 15, action: 'นัด 1-2-1 สัปดาห์นี้' },
    { label: 'Absence',  got: palms?.absence   ?? 0, max: 15, action: 'เข้าประชุมสม่ำเสมอ' },
    { label: 'TYFCB',   got: palms?.tyfb      ?? 0, max: 15, action: 'ปิดดีล / ส่งต่อ TYFCB' },
  ]
  .filter(c => c.max - c.got > 0)
  .sort((a, b) => (b.max - b.got) - (a.max - a.got));

  if (!gaps.length) {
    return `🏆 ${nick} Full Score แล้วครับ! ${tlIcon[tl] || '🟢'} ${score}/100\nยอดมาก — Givers Gain ครับ! 💪`;
  }

  const top3 = gaps.slice(0, 3);
  const lines = [
    `🎯 ${nick} — Focus 3 เดือนนี้`,
    `${tlIcon[tl] || '⚫'} คะแนนปัจจุบัน ${score}/100`,
    '',
    ...top3.map((c, i) => `${nums[i]} ${c.label} (${c.got}/${c.max}) — ${c.action}`),
    '',
    'พิมพ์ "สถานะ" ดูรายละเอียดทุกหมวด',
  ];
  return lines.join('\n');
}

async function replyChapterPulse(
  db: ReturnType<typeof getServiceClient>,
  role: LineRole = 'member',
): Promise<string> {
  const { data } = await db.from('v_member_dashboard')
    .select('display_score, traffic_light, days_to_expiry')
    .eq('is_archived', false);
  const rows = (data || []) as Record<string, unknown>[];
  if (!rows.length) return '⚠️ ยังไม่มีข้อมูลสมาชิกในระบบครับ';

  const totalMembers = rows.length;
  const avgScore = Math.round(rows.reduce((sum, r) => sum + Number(r.display_score || 0), 0) / totalMembers);
  const greenCount  = rows.filter(r => String(r.traffic_light) === 'green').length;
  const yellowCount = rows.filter(r => String(r.traffic_light) === 'yellow').length;
  const redCount    = rows.filter(r => String(r.traffic_light) === 'red').length;
  const blackCount  = rows.filter(r => !['green','yellow','red'].includes(String(r.traffic_light))).length;
  const renewalCount = rows.filter(r => Number(r.days_to_expiry) <= 45 && Number(r.days_to_expiry) >= 0).length;

  const pct = (n: number) => Math.round((n / totalMembers) * 100);

  const lines = [
    '📊 Chapter Pulse — BNI IDEAL',
    '',
    `สมาชิก ${totalMembers} คน · เฉลี่ย ${avgScore}pt`,
    '',
    `🟢 เขียว   ${String(greenCount).padStart(3)}  (${pct(greenCount)}%)`,
    `🟡 เหลือง  ${String(yellowCount).padStart(3)}  (${pct(yellowCount)}%)`,
    `🔴 แดง     ${String(redCount).padStart(3)}  (${pct(redCount)}%)`,
    `⚫ ดำ      ${String(blackCount).padStart(3)}  (${pct(blackCount)}%)`,
  ];
  if (renewalCount > 0) {
    lines.push('', `⏰ ต่ออายุใน 45 วัน: ${renewalCount} คน`);
  }
  lines.push(
    role === 'mc' || role === 'growth'
      ? 'กด "ทุกทีม" เพื่อดูภาพรวมแยกตาม Mentor Team'
      : 'กด "ทีม" เพื่อดูรายละเอียดทีมของคุณ',
  );
  return lines.join('\n');
}

async function replyChapterTrend(db: ReturnType<typeof getServiceClient>): Promise<string> {
  const { data } = await db.from('v_score_history')
    .select('month_label, sort_key, score')
    .order('sort_key', { ascending: false })
    .limit(500);
  const rows = (data || []) as Record<string, unknown>[];
  if (!rows.length) return '⚠️ ยังไม่มีประวัติคะแนนของ Chapter ในระบบครับ';

  const grouped = new Map<string, { label: string; scores: number[] }>();
  for (const row of rows) {
    const key = String(row.sort_key || row.month_label || '');
    if (!key) continue;
    const entry = grouped.get(key) || { label: String(row.month_label || key), scores: [] };
    entry.scores.push(Number(row.score || 0));
    grouped.set(key, entry);
  }
  const months = [...grouped.entries()].slice(0, 3).reverse();
  if (!months.length) return '⚠️ ยังไม่มีข้อมูล Trend ที่พร้อมแสดงครับ';

  const averages = months.map(([, value]) => ({
    label: value.label,
    average: Math.round(value.scores.reduce((sum, score) => sum + score, 0) / value.scores.length),
    members: value.scores.length,
  }));
  const lines = averages.map((month, index) => {
    const previous = index ? averages[index - 1].average : null;
    const delta = previous === null ? '' : month.average > previous
      ? `  ↑ +${month.average - previous}`
      : month.average < previous
      ? `  ↓ ${month.average - previous}`
      : '  →';
    return `${month.label} · เฉลี่ย ${month.average}pt${delta}\nสมาชิก ${month.members} คน`;
  });
  const first = averages[0].average;
  const latest = averages[averages.length - 1].average;
  const narrative = latest > first
    ? `ภาพรวมดีขึ้น ${latest - first} คะแนน รักษาโมเมนตัมนี้ไว้ครับ`
    : latest < first
    ? `ภาพรวมลดลง ${first - latest} คะแนน ควรใช้ Focus 3 ในแต่ละทีม`
    : 'ภาพรวมทรงตัว ควรเร่ง Visitor, Referral และ 1-2-1';
  return [...lines, '', narrative].join('\n\n');
}

async function replyAllTeams(db: ReturnType<typeof getServiceClient>): Promise<string> {
  const { data: teams } = await db.from('mentor_teams').select('name').order('id');
  const { data: members } = await db.from('v_member_dashboard')
    .select('mentor_team, display_score, traffic_light')
    .eq('is_archived', false)
    .not('mentor_team', 'is', null);

  const rows = (members || []) as Record<string, unknown>[];
  if (!rows.length) return '⚠️ ยังไม่มีข้อมูล Mentor Team ในระบบครับ';

  const icons: Record<string, string> = { green: '🟢', yellow: '🟡', red: '🔴', black: '⚫', none: '⚫' };
  const lines = ['👥 Mentor Teams — BNI IDEAL', ''];
  for (const teamRow of (teams || []) as { name: string }[]) {
    const teamMembers = rows.filter((row) => String(row.mentor_team || '') === teamRow.name);
    if (!teamMembers.length) continue;
    const avg = Math.round(
      teamMembers.reduce((sum, row) => sum + Number(row.display_score || 0), 0) / teamMembers.length,
    );
    const counts: Record<string, number> = { green: 0, yellow: 0, red: 0, black: 0 };
    for (const member of teamMembers) {
      const traffic = String(member.traffic_light || 'black');
      const key = ['green', 'yellow', 'red'].includes(traffic) ? traffic : 'black';
      counts[key]++;
    }
    lines.push(
      `${teamRow.name} · ${teamMembers.length} คน · เฉลี่ย ${avg}pt`,
      `${icons.green}${counts.green}  ${icons.yellow}${counts.yellow}  ${icons.red}${counts.red}  ${icons.black}${counts.black}`,
      '',
    );
  }
  lines.push('กด "Chapter Pulse" เพื่อดูภาพรวมทั้ง Chapter');
  return lines.join('\n').trim();
}

function bar(got: number | undefined, max: number): string {
  const pct = max > 0 ? (got ?? 0) / max : 0;
  if (pct >= 1)   return '✅';
  if (pct >= 0.6) return '🔸';
  return '⚠️';
}

function trafficLightFromScore(score: number): 'green' | 'yellow' | 'red' | 'black' | 'none' {
  if (!Number.isFinite(score) || score <= 0) return 'none';
  if (score >= 70) return 'green';
  if (score >= 50) return 'yellow';
  if (score >= 30) return 'red';
  return 'black';
}

async function replyHistory(db: ReturnType<typeof getServiceClient>, memberName: string): Promise<string> {
  const { data: member } = await db.from('members')
    .select('id, nickname')
    .eq('name', memberName)
    .single();
  if (!member) return '⚠️ ไม่พบข้อมูลสมาชิกครับ';
  const memberId = String((member as any).id || '');

  const [{ data: monthlyScores }, { data: evolutionSummary }, { data: keySnapshots }] = await Promise.all([
    db.from('monthly_scores')
      .select('year, month, score, source')
      .eq('member_id', memberId)
      .gt('score', 0)
      .order('year', { ascending: false })
      .order('month', { ascending: false }),
    db.from('traffic_light_evolution_summary')
      .select('average_score, source_column')
      .eq('member_id', memberId)
      .maybeSingle(),
    db.from('palms_key_snapshots')
      .select(
        'year, month, referral_pts, visitor_pts, one_to_one_pts, ceu_pts, tyfcb_pts, ' +
        'referral_value, visitor_value, one_to_one_value, ceu_value, tyfcb_value',
      )
      .eq('member_id', memberId)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(2),
  ]);
  const hist = ((monthlyScores || []) as Record<string, unknown>[]).map((row) => {
    const year = Number(row.year || 0);
    const month = Number(row.month || 0);
    const score = Number(row.score || 0);
    return {
      year,
      month,
      score,
      traffic_light: trafficLightFromScore(score),
      sort_key: year * 100 + month,
      month_label: monthLabel(month),
    };
  });
  if (!hist?.length) return '⚠️ ยังไม่มีประวัติคะแนนในระบบครับ';
  const nick = String((member as any).nickname || memberName.split(' ')[0]);
  const tlIcon: Record<string, string> = { green: '🟢', yellow: '🟡', red: '🔴', black: '⚫', none: '⚪' };
  const monthNames: Record<string, string> = {
    Jan: 'ม.ค.', Feb: 'ก.พ.', Mar: 'มี.ค.', Apr: 'เม.ย.',
    May: 'พ.ค.', Jun: 'มิ.ย.', Jul: 'ก.ค.', Aug: 'ส.ค.',
    Sep: 'ก.ย.', Oct: 'ต.ค.', Nov: 'พ.ย.', Dec: 'ธ.ค.',
  };
  const shortMonth = (month: number, year: number): string => {
    const label = monthNames[monthLabel(month)] || String(month);
    return `${label}${String(year).slice(-2)}`;
  };
  const scoreRows = hist.map((h) => {
    const traffic = String(h.traffic_light || 'none');
    const icon = tlIcon[traffic] || '⚪';
    return `${icon} ${shortMonth(Number(h.month), Number(h.year))} ${Math.round(Number(h.score))}`;
  });

  const storedAverage = Number((evolutionSummary as any)?.average_score);
  const calculatedAverage = hist.length
    ? hist.reduce((sum: number, row) => sum + Number(row.score || 0), 0) / hist.length
    : 0;
  const average = Number.isFinite(storedAverage) && storedAverage > 0
    ? storedAverage
    : calculatedAverage;
  const keySnapshotRows = (keySnapshots || []) as unknown as Record<string, unknown>[];
  const latestKeys = keySnapshotRows[0];
  const previousKeys = keySnapshotRows[1];
  const keyDefinitions = [
    ['📨 Ref', 'referral_pts', 15, 'ใบ'],
    ['👥 Vis', 'visitor_pts', 20, 'คน'],
    ['🤝 121', 'one_to_one_pts', 15, 'ครั้ง'],
    ['🎓 CEU', 'ceu_pts', 20, 'หน่วย'],
    ['💰 ฿', 'tyfcb_pts', 15, 'บาท'],
  ] as [string, string, number, string][];
  const keyPeriodLabel = latestKeys
    ? shortMonth(Number(latestKeys.month), Number(latestKeys.year))
    : '';
  const previousKeyPeriodLabel = previousKeys
    ? shortMonth(Number(previousKeys.month), Number(previousKeys.year))
    : '';
  const keyMovements = latestKeys
    ? keyDefinitions.map(([label, field, max, unit]) => {
      const valueField = field.replace('_pts', '_value');
      const current = Number(latestKeys[field] || 0);
      const previous = previousKeys ? Number(previousKeys[field] || 0) : null;
      const delta = previous === null ? null : current - previous;
      const currentValue = Number(latestKeys[valueField] || 0);
      const previousValue = previousKeys ? Number(previousKeys[valueField] || 0) : null;
      const valueDelta = previousValue === null ? null : currentValue - previousValue;
      return { label, max, unit, current, previous, delta, currentValue, previousValue, valueDelta };
    })
    : [];
  const keyRows = latestKeys
    ? [
      previousKeys
        ? `${keyPeriodLabel} vs ${previousKeyPeriodLabel}`
        : `${keyPeriodLabel} · ยังไม่มีเดือนก่อน`,
      ...keyMovements.map(k => {
        const valueText = k.unit === 'บาท'
          ? `${Math.round(k.currentValue).toLocaleString('en-US')} ${k.unit}`
          : `${Math.round(k.currentValue)} ${k.unit}`;
        if (k.previous === null) return `${k.label} ${k.current}/${k.max} · ${valueText}`;
        const movement = (k.delta ?? 0) > 0
          ? `⬆️+${k.delta}`
          : (k.delta ?? 0) < 0
          ? `⬇️${Math.abs(k.delta || 0)}`
          : '→';
        const rawMove = (k.valueDelta ?? 0) > 0
          ? `⬆️${k.unit === 'บาท' ? Math.round(k.valueDelta || 0).toLocaleString('en-US') : Math.round(k.valueDelta || 0)}`
          : (k.valueDelta ?? 0) < 0
          ? `⬇️${k.unit === 'บาท' ? Math.round(Math.abs(k.valueDelta || 0)).toLocaleString('en-US') : Math.round(Math.abs(k.valueDelta || 0))}`
          : '→';
        const previousValueText = k.unit === 'บาท'
          ? Math.round(k.previousValue || 0).toLocaleString('en-US')
          : String(Math.round(k.previousValue || 0));
        const currentValueText = k.unit === 'บาท'
          ? Math.round(k.currentValue).toLocaleString('en-US')
          : String(Math.round(k.currentValue));
        return `${k.label} ${k.previous}→${k.current}/${k.max} ${movement} · ${previousValueText}→${currentValueText}${k.unit === 'บาท' ? '฿' : ''} ${rawMove}`;
      }),
    ]
    : [
      'ยังไม่มีข้อมูล 5 Key',
      'ต้อง sync R2Y รายเดือน',
    ];

  // History is newest first, so compare the two latest months.
  const last = hist[0];
  const prev = hist.length > 1 ? hist[1] : null;
  const diff = prev ? Math.round(Number(last.score) - Number(prev.score)) : 0;
  let trendMsg = '';
  if (!prev) trendMsg = 'เดือนแรก — สู้ต่อครับ! 💪';
  else if (diff > 10) trendMsg = 'โมเมนตัมดีมาก! สู้ต่อครับ 🔥';
  else if (diff > 0)  trendMsg = 'ดีขึ้นเรื่อยๆ ครับ 👍';
  else if (diff < -10) trendMsg = 'ลดลงมาก — Mentor จะติดตามเร็วๆ นี้';
  else if (diff < 0)   trendMsg = 'ลดลงนิดหน่อย ยังแก้ได้ทันครับ';
  else trendMsg = 'คะแนนนิ่ง — ลอง Visitor หรือ Referral เพิ่มครับ';

  return [
    `📈 ${nick} · Score Trend`,
    `ย้อนหลัง ${hist.length} เดือน · Avg ${average.toFixed(1)}`,
    ...scoreRows,
    '',
    '🔎 5 Key',
    ...keyRows,
    '',
    trendMsg,
  ].join('\n');
}

function monthLabel(month: number): string {
  return ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month] || '';
}

async function replyTeam(db: ReturnType<typeof getServiceClient>, memberName: string): Promise<string> {
  // Step 1: Check if this member belongs to a team (regular member path)
  const { data: me } = await db.from('members').select('mentor_team, nickname, email').eq('name', memberName).maybeSingle();
  let team: string | null = (me as any)?.mentor_team ?? null;

  // Step 2: If no team found, check if memberName IS a team leader (mentor path)
  if (!team) {
    const nick = String((me as any)?.nickname || '');
    const { data: ledTeam } = await db.from('mentor_teams')
      .select('name')
      .or(`leader_name.ilike.%${memberName}%${nick ? `,leader_name.ilike.%${nick}%` : ''}`)
      .limit(1)
      .maybeSingle();
    team = (ledTeam as any)?.name ?? null;

    // Fallback: email-based role_assignments lookup
    if (!team) {
      const email = String((me as any)?.email || '').trim().toLowerCase();
      if (email) {
        const { data: ra } = await db.from('role_assignments')
          .select('team_name')
          .ilike('email', email)
          .eq('is_mentor', true)
          .maybeSingle();
        team = String((ra as any)?.team_name || '') || null;
      }
    }
  }

  // Step 3: Still no team → unassigned member or incomplete team setup.
  if (!team) {
    return 'ยังไม่ได้ระบุ Mentor Team ของบัญชีนี้ครับ\nกรุณาติดต่อ MC เพื่อจัดทีมให้เรียบร้อย';
  }

  const { data: members } = await db
    .from('v_member_dashboard')
    .select('name, nickname, display_score, traffic_light')
    .eq('mentor_team', team)
    .eq('is_archived', false)
    .order('display_score', { ascending: false });
  if (!members?.length) return '⚠️ ไม่พบสมาชิกในทีมครับ';
  const TL: Record<string, string> = { green: '🟢', yellow: '🟡', red: '🔴', black: '⚫', none: '⚫' };
  const medals = ['🥇', '🥈', '🥉'];
  const lines = [`👥 ทีม ${team} — เดือนนี้`];
  (members as Record<string, unknown>[]).forEach((m, i) => {
    const nick = String(m.nickname || String(m.name).split(' ')[0]);
    const rank = medals[i] ?? ' ';
    const isMe = String(m.name) === memberName ? ' ← คุณ' : '';
    lines.push(`${rank} ${TL[String(m.traffic_light)] || '⚫'} ${nick}  ${m.display_score ?? '?'}pt${isMe}`);
  });
  lines.push('', 'พิมพ์ "สถานะ" ดูรายละเอียดของคุณ');
  return lines.join('\n');
}

async function logAbsence(
  db: ReturnType<typeof getServiceClient>,
  memberName: string,
  detail: string,
  type: string,
  eventId: string,
): Promise<string> {
  const { data: m } = await db.from('members').select('id, nickname, mentor_team').eq('name', memberName).single();
  if (!m) return '⚠️ ไม่พบข้อมูลสมาชิกครับ';
  const today = new Date();
  const dow = today.getDay();
  const daysToFri = ((5 - dow + 7) % 7) || 7;
  const nextFri = new Date(today);
  nextFri.setDate(today.getDate() + daysToFri);

  const weekDate = nextFri.toISOString().split('T')[0];
  const { error: insertError } = await db.from('line_absence_log').insert({
    member_id:    (m as any).id,
    absence_type: type,
    sub_name:     type === 'ส่ง sub' ? detail : null,
    reason:       type === 'ลา' ? detail : null,
    week_date:    weekDate,
  });
  if (insertError) return `⚠️ บันทึกไม่สำเร็จ: ${insertError.message}`;

  const nick = (m as any).nickname || memberName.split(' ')[0];
  const notification = await notifyAbsenceStakeholders(db, {
    memberId: String((m as any).id),
    memberName,
    nickname: String(nick),
    mentorTeam: String((m as any).mentor_team || ''),
    absenceType: type,
    detail,
    meetingDate: weekDate,
    idempotencyKey: `webhook:${eventId}:absence-notify`,
    source: 'line-webhook',
  });
  const friDate = nextFri.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  const notified = notification.mcReady && notification.mentorReady
    ? 'MC และหัวหน้าทีมได้รับแจ้งแล้ว'
    : notification.mcReady
    ? 'MC ได้รับแจ้งแล้ว และระบบแจ้งให้ MC เชื่อมบัญชีหัวหน้าทีมเพิ่มเติม'
    : 'บันทึกแล้ว แต่ยังไม่พบบัญชี LINE ของผู้รับแจ้ง';
  if (type === 'ส่ง sub') {
    return `โอเคครับ ${nick} 👍\nส่ง Sub: ${detail} — วันศุกร์ ${friDate}\n\n${notified}\nถ้าแผนเปลี่ยนพิมพ์ "ยกเลิกลา"`;
  }
  return `โอเคครับ ${nick} 👍\nลาวันศุกร์ ${friDate} (${detail || 'ไม่ระบุเหตุผล'})\n\n${notified}\nถ้าแผนเปลี่ยนพิมพ์ "ยกเลิกลา"`;
}

async function cancelAbsence(db: ReturnType<typeof getServiceClient>, memberName: string, _userId: string): Promise<string> {
  const { data: m } = await db.from('members').select('id, nickname').eq('name', memberName).single();
  if (!m) return '⚠️ ไม่พบข้อมูลสมาชิกครับ';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
  const { data: rec } = await db.from('line_absence_log')
    .select('id').eq('member_id', (m as any).id)
    .gte('created_at', weekStart.toISOString())
    .is('cancelled_at', null)
    .order('created_at', { ascending: false }).limit(1).single();
  if (!rec) return '⚠️ ไม่พบรายการแจ้งลาของสัปดาห์นี้ครับ';
  await db.from('line_absence_log').update({ cancelled_at: new Date().toISOString() }).eq('id', (rec as any).id);
  const nick = (m as any).nickname || memberName.split(' ')[0];
  return `ยกเลิกแล้วครับ ${nick} — แผนเปลี่ยนใหม่ก็แจ้งได้เลยนะครับ 👋`;
}

async function reportIssue(db: ReturnType<typeof getServiceClient>, memberName: string, issueText: string): Promise<string> {
  if (!issueText.trim()) return '⚠️ กรุณาพิมพ์รายละเอียด เช่น “ปัญหา นัด Mentor ไม่ได้”';
  const { data: m } = await db.from('members').select('id, nickname').eq('name', memberName).single();
  if (!m) return '⚠️ ไม่พบข้อมูลสมาชิกครับ';
  await db.from('line_issues').insert({ member_id: (m as any).id, issue_text: issueText });
  const nick = (m as any).nickname || memberName.split(' ')[0];
  return `รับเรื่องแล้วครับ ${nick} 📨\nMentor จะติดต่อกลับเร็วๆ นี้`;
}

async function replyIssues(db: ReturnType<typeof getServiceClient>, memberName: string): Promise<string> {
  const { data: m } = await db.from('members').select('id').eq('name', memberName).single();
  if (!m) return '⚠️ ไม่พบข้อมูลครับ';
  const { data: issues } = await db.from('line_issues')
    .select('issue_text, reported_at, resolved_at')
    .eq('member_id', (m as any).id)
    .order('reported_at', { ascending: false }).limit(3);
  if (!issues?.length) return '✅ ไม่มีเรื่องที่แจ้งไว้ครับ';
  const lines = ['📋 เรื่องที่แจ้งไว้', ''];
  (issues as Record<string, unknown>[]).forEach((iss) => {
    const status = iss.resolved_at ? '✅' : '⏳';
    lines.push(`${status} ${iss.issue_text}`);
  });
  return lines.join('\n');
}

async function schedule121(db: ReturnType<typeof getServiceClient>, memberName: string, partnerName: string): Promise<string> {
  if (!partnerName.trim()) return '⚠️ กรุณาระบุชื่อ เช่น “นัด Pete”';
  const { data: me } = await db.from('members').select('id').eq('name', memberName).single();
  const { data: matches } = await db.from('members')
    .select('id, name, nickname')
    .or(`name.ilike.%${partnerName}%,nickname.ilike.%${partnerName}%`)
    .eq('is_archived', false)
    .limit(3);
  const candidates = (matches || []).filter((row: Record<string, unknown>) => row.id !== (me as any)?.id);
  if (!me || !candidates.length) return `⚠️ ไม่พบ "${partnerName}" ในระบบครับ`;
  if (candidates.length > 1) {
    const names = candidates.map((row: Record<string, unknown>) =>
      `• ${row.nickname || row.name}`
    ).join('\n');
    return `⚠️ พบชื่อใกล้เคียงหลายคน\n${names}\n\nกรุณาพิมพ์ชื่อให้ละเอียดขึ้นครับ`;
  }
  const partner = candidates[0];
  await db.from('one_to_one_logs').insert({ initiator_id: (me as any).id, partner_id: (partner as any).id, partner_name: String((partner as any).nickname || (partner as any).name || partnerName), scheduled_date: new Date().toISOString().split('T')[0] });
  return `นัด 1-2-1 กับ ${(partner as any).nickname || partnerName} บันทึกแล้วครับ 🤝\nเจอกันแล้วพิมพ์ "เจอแล้ว" นะครับ`;
}

async function confirm121Met(db: ReturnType<typeof getServiceClient>, memberName: string, userId: string): Promise<string> {
  const { data: me } = await db.from('members').select('id').eq('name', memberName).single();
  const { data: pending } = await db.from('one_to_one_logs')
    .select('id, partner_id, members!partner_id(nickname, name)')
    .eq('initiator_id', (me as any)?.id).is('met_at', null)
    .order('created_at', { ascending: false }).limit(1).single();
  if (!pending) return '⚠️ ไม่พบการนัด 1-2-1 ที่รอยืนยันครับ';
  await setState(db, userId, '121_outcome', String((pending as any).id));
  const pName = (pending as any).members?.nickname || (pending as any).members?.name || 'คู่ 1-2-1';
  return `เยี่ยมเลยครับ! เจอกับ ${pName} แล้ว 🤝\n\nบอกผลการคุยสั้นๆ ได้เลยครับ\n(หรือพิมพ์ "skip" ถ้าไม่อยากบันทึก)`;
}

async function log121Outcome(db: ReturnType<typeof getServiceClient>, _memberName: string, _userId: string, logId: string, outcome: string): Promise<string> {
  if (outcome.toLowerCase() !== 'skip') {
    await db.from('one_to_one_logs').update({ met_at: new Date().toISOString(), outcome }).eq('id', logId);
  } else {
    await db.from('one_to_one_logs').update({ met_at: new Date().toISOString() }).eq('id', logId);
  }
  return '1-2-1 สม่ำเสมอคือ Givers Gain ที่ดีที่สุดเลยครับ 🤝';
}

async function reply121(db: ReturnType<typeof getServiceClient>, memberName: string): Promise<string> {
  const { data: me } = await db.from('members').select('id').eq('name', memberName).single();
  const { data: logs } = await db.from('one_to_one_logs')
    .select('scheduled_date, met_at, outcome, members!partner_id(nickname, name)')
    .eq('initiator_id', (me as any)?.id)
    .order('created_at', { ascending: false }).limit(5);
  if (!logs?.length) return '🤝 ยังไม่มีประวัติ 1-2-1 ครับ\nพิมพ์ "นัด [ชื่อ]" เพื่อเริ่มได้เลย';
  const lines = ['🤝 1-2-1 ล่าสุด', ''];
  (logs as Record<string, unknown>[]).forEach((l) => {
    const pName = (l.members as Record<string, string>)?.nickname || (l.members as Record<string, string>)?.name || '?';
    const status = l.met_at ? '✅' : '⏳';
    lines.push(`${status} ${pName}${l.outcome ? `  "${String(l.outcome).slice(0, 25)}..."` : ''}`);
  });
  return lines.join('\n');
}

async function replyGoals(db: ReturnType<typeof getServiceClient>, memberName: string): Promise<string> {
  const { data: m } = await db.from('members').select('id').eq('name', memberName).single();
  const { data: goals } = await db.from('line_goals').select('*').eq('member_id', (m as any)?.id);
  if (!goals?.length) return '🎯 ยังไม่ได้ตั้งเป้าหมายครับ\nพิมพ์ "เป้า ref 8" = ตั้งเป้า Referral 8 ใบ';
  const lines = ['🎯 เป้าหมายของคุณ', ''];
  (goals as Record<string, unknown>[]).forEach((g) => lines.push(`· ${g.goal_type}: ${g.target}`));
  return lines.join('\n');
}

async function setGoal(db: ReturnType<typeof getServiceClient>, memberName: string, text: string): Promise<string> {
  const parts = text.trim().split(/\s+/);
  const type = parts[0] || '';
  const target = parseFloat(parts[1] || '0');
  if (!type || !Number.isFinite(target) || target <= 0) return '⚠️ รูปแบบ: เป้า [ประเภท] [ค่า] เช่น "เป้า ref 8"';
  const { data: m } = await db.from('members').select('id').eq('name', memberName).single();
  await db.from('line_goals').upsert({ member_id: (m as any)?.id, goal_type: type, target, set_at: new Date().toISOString() });
  return `✅ ตั้งเป้า ${type} = ${target} แล้วครับ 🎯`;
}

async function replyNotifSettings(db: ReturnType<typeof getServiceClient>, memberName: string): Promise<string> {
  const { data: m } = await db.from('members').select('id').eq('name', memberName).single();
  const { data: settings } = await db.from('line_notif_settings').select('*').eq('member_id', (m as any)?.id);
  const muted = (settings as Record<string, unknown>[] || []).filter((s) => s.is_muted).map((s) => s.notif_type);
  const mutedText = muted.length ? `ปิดอยู่: ${muted.join(', ')}` : '✅ เปิดทุกการแจ้งเตือน';
  return `🔔 การแจ้งเตือน\n${mutedText}\n\nพิมพ์ "ปิด nudge" หรือ "เปิด nudge" เพื่อปรับครับ`;
}

async function toggleNotif(db: ReturnType<typeof getServiceClient>, memberName: string, type: string, mute: boolean): Promise<string> {
  if (!type.trim()) return `⚠️ กรุณาระบุประเภท เช่น “${mute ? 'ปิด' : 'เปิด'} nudge”`;
  const { data: m } = await db.from('members').select('id').eq('name', memberName).single();
  await db.from('line_notif_settings').upsert({ member_id: (m as any)?.id, notif_type: type, is_muted: mute, updated_at: new Date().toISOString() });
  return `✅ ${mute ? 'ปิด' : 'เปิด'} การแจ้งเตือน "${type}" แล้วครับ`;
}

async function setBizProfile(db: ReturnType<typeof getServiceClient>, memberName: string, desc: string): Promise<string> {
  if (!desc.trim()) return '⚠️ กรุณาอธิบายธุรกิจ เช่น “ธุรกิจ ที่ปรึกษาการเงินสำหรับเจ้าของกิจการ”';
  const { data: m } = await db.from('members').select('id').eq('name', memberName).single();
  await db.from('biz_profiles').upsert({ member_id: (m as any)?.id, description: desc, updated_at: new Date().toISOString() });
  return `บันทึก Profile ธุรกิจแล้วครับ 📌\n"${desc}"\n\nพิมพ์ "แนะนำ" ให้ Bot ช่วยจับคู่ 1-2-1 ที่เหมาะกัน`;
}

async function replyMatch(db: ReturnType<typeof getServiceClient>, memberName: string, filter: string): Promise<string> {
  const { data: me } = await db.from('members')
    .select('id, mentor_team')
    .eq('name', memberName)
    .single();
  if (!me) return '⚠️ ไม่พบข้อมูลสมาชิกสำหรับการจับคู่ครับ';
  const { data: myProfile } = await db.from('biz_profiles').select('description')
    .eq('member_id', (me as any)?.id).single();

  const { data: recent } = await db.from('one_to_one_logs')
    .select('partner_id')
    .eq('initiator_id', (me as any)?.id)
    .order('created_at', { ascending: false })
    .limit(10);
  const recentIds = new Set((recent || []).map((row: Record<string, unknown>) => String(row.partner_id)));
  const { data: profiles } = await db.from('biz_profiles')
    .select('member_id, description, members!member_id(name, nickname, mentor_team, is_archived)')
    .neq('member_id', (me as any)?.id)
    .limit(100);
  const profileByMember = new Map(
    (profiles || []).map((profile: Record<string, unknown>) => [
      String(profile.member_id),
      String(profile.description || ''),
    ]),
  );
  const { data: candidates } = await db.from('v_member_dashboard')
    .select('id, name, nickname, mentor_team, display_score, traffic_light')
    .eq('is_archived', false)
    .neq('id', (me as any)?.id)
    .limit(150);

  const filterTerms = keywordSet(filter);
  const myTerms = keywordSet(String((myProfile as any)?.description || ''));
  const ranked = (candidates || [])
    .map((member: Record<string, unknown>) => {
      const description = profileByMember.get(String(member.id)) || '';
      const terms = keywordSet(description);
      const filterHits = [...filterTerms].filter((term) => terms.has(term)).length;
      const sharedContext = [...myTerms].filter((term) => terms.has(term)).length;
      const crossTeam = String(member.mentor_team || '') !== String((me as any)?.mentor_team || '') ? 2 : 0;
      const freshness = recentIds.has(String(member.id)) ? 0 : 3;
      const hasProfile = description ? 2 : 0;
      return {
        nickname: String(member.nickname || String(member.name || '').split(' ')[0]),
        description: description || buildMatchFallback(member),
        score: freshness + crossTeam + hasProfile + filterHits * 4 + Math.min(sharedContext, 2),
      };
    })
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 3) as { nickname: string; description: string; score: number }[];

  if (!ranked.length) return '⚠️ ยังไม่มีสมาชิกคนอื่นเพียงพอสำหรับแนะนำคู่ 1-2-1 ครับ';
  const lines = ranked.flatMap((candidate, index) => [
    `${index + 1}. ${candidate.nickname}`,
    candidate.description.slice(0, 120),
    '',
  ]);
  lines.push('เลือกคนที่สนใจแล้วพิมพ์ “นัด [ชื่อ]” ได้เลยครับ');
  if (!myProfile) {
    lines.push('', 'เพื่อให้แนะนำแม่นขึ้น พิมพ์ “ธุรกิจ [คำอธิบายธุรกิจ]”');
  }
  return lines.join('\n').trim();
}

function buildMatchFallback(member: Record<string, unknown>): string {
  const team = String(member.mentor_team || 'ยังไม่ระบุทีม');
  const score = Math.round(Number(member.display_score || 0));
  const traffic = String(member.traffic_light || 'black');
  const opportunity = traffic === 'green'
    ? 'แลกเปลี่ยนวิธีรักษาผลงานและโอกาสส่งต่อ'
    : traffic === 'yellow'
    ? 'ช่วยกันหาโอกาส Referral หรือ Visitor เพื่อขึ้นเขียว'
    : 'เริ่มจากทำความรู้จักธุรกิจและหา Quick Win ร่วมกัน';
  return `ทีม ${team} · ${score}pt · ${opportunity}`;
}

function keywordSet(value: string): Set<string> {
  return new Set(
    value.toLocaleLowerCase('th-TH')
      .split(/[\s,./|()[\]{}:;!?'"“”]+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2),
  );
}

async function registerMember(db: ReturnType<typeof getServiceClient>, userId: string, memberName: string): Promise<void> {
  const { data: m } = await db.from('members').select('id').eq('name', memberName).single();
  if (!m) return;
  await db.from('line_members').upsert({
    line_user_id:  userId,
    member_id:     (m as any).id,
    registered_at: new Date().toISOString(),
  });
  await clearState(db, userId, 'registration');
}

async function unregister(db: ReturnType<typeof getServiceClient>, userId: string, _memberName: string): Promise<string> {
  await db.from('line_members').delete().eq('line_user_id', userId);
  await db.from('line_bot_state').delete().eq('line_user_id', userId);
  return 'ลบข้อมูลแล้วครับ ส่งข้อความใหม่เพื่อลงทะเบียนอีกครั้ง';
}

// ── Static message builders ──────────────────────────────────
function buildWelcomeMessage(): string {
  return (
    `สวัสดีครับ! 👋\n\n` +
    `BNI IDEAL Bot ช่วยคุณได้เรื่อง:\n` +
    `📊 ดูคะแนน PALMS แบบ real-time\n` +
    `📅 แจ้งลา / ส่ง Sub ล่วงหน้า\n` +
    `🤝 บันทึกและติดตาม 1-2-1\n` +
    `🤖 ถามคำถาม → AI ตอบทันที\n\n` +
    `เริ่มต้น: ขอรหัสจาก Mentor Coordinator\n` +
    `แล้วพิมพ์ "เชื่อม ตามด้วยรหัส" ได้เลยครับ`
  );
}

function buildRegistrationPrompt(): string {
  return 'พิมพ์ "เชื่อม ตามด้วยรหัส" ที่ได้รับจาก Mentor Coordinator ครับ 🔐';
}

function buildHelpMessage(memberName: string): string {
  const nick = memberName.split(' ')[0];
  return (
    `🧭 คุณ${nick} ใช้คำสั่งเหล่านี้ได้ครับ\n\n` +
    `📊 สถานะ — ดูคะแนนล่าสุด\n` +
    `📈 ประวัติ — ดูสี/คะแนนย้อนหลัง\n` +
    `🎯 ทำอะไร — สิ่งที่ควรทำวันนี้\n` +
    `👥 ทีม — ดู Mentor Team\n` +
    `🤝 แนะนำ — หาเพื่อน 1-2-1\n` +
    `🙋 ลา [เหตุผล] — แจ้งลา\n` +
    `👥 ส่ง sub [ชื่อ] — แจ้งคนแทน\n` +
    `💬 ถาม [คำถาม] — ให้ AI ช่วยคิด\n\n` +
    `พิมพ์คำสั่งได้เลย หรือกดปุ่ม Quick Reply ด้านล่างครับ`
  );
}

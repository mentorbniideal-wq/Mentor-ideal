// ============================================================
// BNI IDEAL — LINE Webhook Edge Function
// Replaces: doPost(e) in WEBAPP.js
//
// LINE calls this URL when a user messages the Bot.
// Must respond within 5 seconds or LINE retries.
// Heavy work is done via getServiceClient() async calls.
// ============================================================

import { corsHeaders } from '../_shared/cors.ts';
import { getServiceClient, jsonResponse } from '../_shared/db.ts';
import {
  lineReply, linePush, LINE_QR_MAIN,
  parseWebhookBody, verifySignature,
  type LineEvent,
} from '../_shared/line.ts';
import { calcPalmsScore, trafficLight } from '../_shared/palms.ts';

Deno.serve(async (req: Request) => {
  // LINE sends POST requests only
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const allowSupabaseLine = Deno.env.get('LINE_WEBHOOK_ENABLED') === 'true';
  if (!allowSupabaseLine) {
    return new Response(
      'Supabase LINE webhook is currently disabled. Use the legacy GAS WebApp LINE webhook URL until Supabase is ready.',
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } },
    );
  }

  const rawBody = await req.text();

  // Verify LINE webhook signature (security — reject forged requests)
  const signature = req.headers.get('X-Line-Signature') || '';
  const valid = await verifySignature(rawBody, signature);
  if (!valid) {
    console.warn('[line-webhook] Invalid signature — request rejected');
    return new Response('Unauthorized', { status: 401 });
  }

  const events = parseWebhookBody(rawBody);
  const db = getServiceClient();

  // Process all events concurrently (LINE allows up to 10 events per webhook call)
  await Promise.all(events.map((ev) => handleEvent(db, ev)));

  // LINE requires a 200 OK — always return quickly
  return new Response('OK', { status: 200 });
});

// ── Event dispatcher ─────────────────────────────────────────
async function handleEvent(db: ReturnType<typeof getServiceClient>, ev: LineEvent): Promise<void> {
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
      await lineReply(ev.replyToken, buildWelcomeMessage());
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
    .single();

  const memberName: string | null = (lineRec as any)?.members?.name ?? null;
  const replyText = await processCommand(db, userId, text, memberName);

  if (replyText && ev.replyToken) {
    const isRegistered = !!memberName;
    await lineReply(
      ev.replyToken,
      replyText,
      isRegistered ? LINE_QR_MAIN : undefined,
    );
  }
}

// ── Command processor ────────────────────────────────────────
async function processCommand(
  db: ReturnType<typeof getServiceClient>,
  userId: string,
  text: string,
  memberName: string | null,
): Promise<string> {
  const t = text.toLowerCase().trim();

  // Debug: return own LINE ID
  if (t === 'myid' || t === 'id') return `🆔 LINE User ID:\n${userId}`;

  // ── Not registered: registration flow ───────────────────────
  if (!memberName) {
    return await handleRegistration(db, userId, text);
  }

  // ── Registered member commands ───────────────────────────────
  const pending = await getPendingState(db, userId);

  // Pending states from previous interactions
  if (pending?.key === 'absence' && pending.value === 'AWAITING_SUB') {
    await clearState(db, userId, 'absence');
    if (t === 'ยกเลิก' || t === 'cancel') return '✅ ยกเลิกแล้วครับ';
    return await logAbsence(db, memberName, text.trim(), 'ส่ง sub');
  }
  if (pending?.key === '121_outcome') {
    const partnerId = pending.value;
    await clearState(db, userId, '121_outcome');
    return await log121Outcome(db, memberName, userId, partnerId, text.trim());
  }

  // Main command routing
  if (t === 'สถานะ' || t === 'score' || t === 'คะแนน') return await replyStatus(db, memberName);
  if (t === 'ประวัติ' || t === 'trend' || t === 'history')  return await replyHistory(db, memberName);
  if (t === 'ทีม'    || t === 'team')                       return await replyTeam(db, memberName);
  if (t === 'ทำอะไร' || t === 'action')                     return await replyStatus(db, memberName);
  if (t === 'ติดตาม' || t === '1-2-1')                      return await reply121(db, memberName);
  if (t === 'เป้า'   || t === 'goal' || t === 'goals')      return await replyGoals(db, memberName);
  if (t === 'แจ้งเตือน' || t === 'notif')                   return await replyNotifSettings(db, memberName);
  if (t === 'ปัญหา'  || t === 'issue')                      return await replyIssues(db, memberName);
  if (t === 'เจอแล้ว' || t === 'met')                       return await confirm121Met(db, memberName, userId);

  if (t.startsWith('แนะนำ')) return await replyMatch(db, memberName, text.slice(5).trim());
  if (t.startsWith('นัด ') || t.startsWith('นัด121 '))
    return await schedule121(db, memberName, text.replace(/^นัด(121)?\s+/i, '').trim());

  if (t === 'ลา' || t.startsWith('ลา ')) {
    const reason = text.slice(2).trim();
    return await logAbsence(db, memberName, reason, 'ลา');
  }
  if (t === 'ส่ง sub' || t.startsWith('ส่ง sub ')) {
    const subName = text.slice(8).trim();
    if (!subName) {
      await setState(db, userId, 'absence', 'AWAITING_SUB');
      return '👥 ส่ง Sub\n─────────────────\nพิมพ์ชื่อคนที่จะมาแทนคุณครับ';
    }
    return await logAbsence(db, memberName, subName, 'ส่ง sub');
  }
  if (t === 'ยกเลิกลา' || t === 'cancel') return await cancelAbsence(db, memberName, userId);
  if (t.startsWith('ปัญหา ') || t.startsWith('issue '))
    return await reportIssue(db, memberName, text.replace(/^(ปัญหา|issue)\s+/i, '').trim());
  if (t === 'ยกเลิก' || t === 'ลบ') return await unregister(db, userId, memberName);
  if (t.startsWith('ธุรกิจ ')) return await setBizProfile(db, memberName, text.slice(7).trim());
  if (t.startsWith('เป้า ')) return await setGoal(db, memberName, text.slice(5).trim());
  if (t.startsWith('ปิด ')) return await toggleNotif(db, memberName, text.slice(4).trim(), true);
  if (t.startsWith('เปิด ')) return await toggleNotif(db, memberName, text.slice(5).trim(), false);

  return buildHelpMessage(memberName);
}

// ── Registration flow ────────────────────────────────────────
async function handleRegistration(
  db: ReturnType<typeof getServiceClient>,
  userId: string,
  text: string,
): Promise<string> {
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
      return `🎉 ลงทะเบียนสำเร็จ!\n\nยินดีต้อนรับ ${(m as any)?.nickname || pending.split(' ')[0]} 👋\n\nพิมพ์ "สถานะ" เพื่อดูคะแนน\nพิมพ์ "help" เพื่อดูคำสั่ง`;
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
      return `🎉 ลงทะเบียนสำเร็จ!\n\nยินดีต้อนรับ ${(m as any)?.nickname || names[idx].split(' ')[0]} 👋`;
    }
    return 'ตอบ 1, 2 หรือ 3 ครับ';
  }

  await setState(db, userId, 'registration', 'AWAITING');
  return buildRegistrationPrompt();
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
  if (!d) return '⚠️ ยังไม่พบข้อมูลคะแนนในระบบครับ\n(รอ Coordinator import CSV ประจำเดือน)';

  const score = Number(d.display_score || 0);
  const tl    = String(d.traffic_light || 'black');
  const nick  = String(d.nickname || memberName.split(' ')[0]);
  const palms = d.palms_detail as Record<string, number> | null;
  const tlIcon: Record<string, string> = { green: '🟢', yellow: '🟡', red: '🔴', black: '⚫' };
  const nextZone: Record<string, string> = { black: 'เป้า: 🔴 แดง +30pt', red: 'เป้า: 🟡 เหลือง +50pt', yellow: 'เป้า: 🟢 เขียว +70pt' };

  // Find weakest component for action suggestion
  const comps: { label: string; got: number; max: number; hint: string }[] = [
    { label: 'Referral',  got: palms?.referral  ?? 0, max: 15, hint: 'ส่ง Referral เพิ่ม' },
    { label: '1-2-1',     got: palms?.oneToOne  ?? 0, max: 15, hint: 'นัด 1-2-1 เพิ่ม' },
    { label: 'Visitor',   got: palms?.visitor   ?? 0, max: 20, hint: 'พา Visitor มาประชุม' },
    { label: 'CEU',       got: palms?.ceu       ?? 0, max: 20, hint: 'เข้า CEU เพิ่ม' },
    { label: 'Absence',   got: palms?.absence   ?? 0, max: 15, hint: 'เข้าประชุมสม่ำเสมอ' },
  ];
  const topGap = comps.reduce((a, b) => (b.max - b.got) > (a.max - a.got) ? b : a);
  const actionHint = topGap.max - topGap.got > 0
    ? `🎯 Action: ${topGap.hint} → +${topGap.max - topGap.got}pt (${topGap.label})`
    : '🏆 ยอดเยี่ยม! ทุก component ครบแล้ว';

  const lines = [
    `📊 คุณ${nick} — BNI Score`,
    `${tlIcon[tl] || '📊'} ${score}/100  ${nextZone[tl] || ''}`,
    '─────────────────',
    `✅/🔸/⚠️  หมวด        ได้/เต็ม`,
    `${bar(palms?.absence,  15)}  ขาดประชุม  ${palms?.absence  ?? 0}/15`,
    `${bar(palms?.referral, 15)}  Referral   ${palms?.referral ?? 0}/15`,
    `${bar(palms?.oneToOne, 15)}  1-2-1      ${palms?.oneToOne ?? 0}/15`,
    `${bar(palms?.visitor,  20)}  Visitor    ${palms?.visitor  ?? 0}/20`,
    `${bar(palms?.ceu,      20)}  CEU        ${palms?.ceu      ?? 0}/20`,
    `${bar(palms?.tyfb,     15)}  TYFCB      ${palms?.tyfb     ?? 0}/15`,
    '─────────────────',
    actionHint,
    'พิมพ์ "ประวัติ" ดู Trend 3 เดือน',
  ];
  return lines.join('\n');
}

function bar(got: number | undefined, max: number): string {
  const pct = max > 0 ? (got ?? 0) / max : 0;
  if (pct >= 1)   return '✅';
  if (pct >= 0.6) return '🔸';
  return '⚠️';
}

async function replyHistory(db: ReturnType<typeof getServiceClient>, memberName: string): Promise<string> {
  const { data: hist } = await db
    .from('v_score_history')
    .select('month_label, year, score, traffic_light')
    .eq('name', memberName)
    .order('sort_key', { ascending: false })
    .limit(3);
  if (!hist?.length) return '⚠️ ยังไม่มีประวัติคะแนนในระบบครับ';
  const reversed = [...hist].reverse();
  const nick = memberName.split(' ')[0];
  const lines = [`📈 Trend — คุณ${nick}`, '─────────────────'];
  reversed.forEach((h: Record<string, unknown>, i: number) => {
    const icon = String(h.traffic_light || 'black') === 'green' ? '🟢' : String(h.traffic_light) === 'yellow' ? '🟡' : String(h.traffic_light) === 'red' ? '🔴' : '⚫';
    const delta = i > 0 ? Number(h.score) - Number(reversed[i-1].score) : 0;
    const deltaStr = i > 0 ? (delta > 0 ? `  ↑+${Math.round(delta)}` : delta < 0 ? `  ↓${Math.round(delta)}` : '  →') : '';
    lines.push(`${icon} ${h.month_label}/${String(h.year).slice(2)}: ${Math.round(Number(h.score))} pt${deltaStr}`);
  });
  lines.push('─────────────────', 'พิมพ์ "สถานะ" ดูรายละเอียดทุกหมวด');
  return lines.join('\n');
}

async function replyTeam(db: ReturnType<typeof getServiceClient>, memberName: string): Promise<string> {
  const { data: me } = await db.from('members').select('mentor_team').eq('name', memberName).single();
  const team = (me as any)?.mentor_team;
  if (!team) return '⚠️ ไม่พบข้อมูลทีมครับ';
  const { data: members } = await db
    .from('v_member_dashboard')
    .select('name, nickname, display_score, traffic_light')
    .eq('mentor_team', team)
    .eq('is_archived', false)
    .order('display_score', { ascending: false });
  if (!members?.length) return '⚠️ ไม่พบสมาชิกในทีมครับ';
  const TL: Record<string, string> = { green: '🟢', yellow: '🟡', red: '🔴', black: '⚫' };
  const medals = ['🥇', '🥈', '🥉'];
  const lines = [`👥 ทีม ${team}`, '─────────────────'];
  (members as Record<string, unknown>[]).forEach((m, i) => {
    const nick = String(m.nickname || String(m.name).split(' ')[0]);
    const rank = medals[i] ?? '  ';
    const isMe = String(m.name) === memberName ? ' ← คุณ' : '';
    lines.push(`${rank} ${TL[String(m.traffic_light)] || '⚫'} ${nick} — ${m.display_score ?? '?'}/100${isMe}`);
  });
  lines.push('─────────────────');
  lines.push('พิมพ์ "สถานะ" ดูรายละเอียดของคุณ');
  return lines.join('\n');
}

async function logAbsence(db: ReturnType<typeof getServiceClient>, memberName: string, detail: string, type: string): Promise<string> {
  const { data: m } = await db.from('members').select('id, nickname, mentor_team').eq('name', memberName).single();
  if (!m) return '⚠️ ไม่พบข้อมูลสมาชิกครับ';
  const today = new Date();
  const dow = today.getDay();
  const daysToFri = ((5 - dow + 7) % 7) || 7;
  const nextFri = new Date(today);
  nextFri.setDate(today.getDate() + daysToFri);

  await db.from('line_absence_log').insert({
    member_id:    (m as any).id,
    absence_type: type,
    sub_name:     type === 'ส่ง sub' ? detail : null,
    reason:       type === 'ลา' ? detail : null,
    week_date:    nextFri.toISOString().split('T')[0],
  });

  // Notify MC
  const { data: mcSetting } = await db.from('settings').select('value').eq('key', 'MC_LINE_USER_ID').single();
  const mcId = (mcSetting as any)?.value;
  if (mcId) {
    const nick = (m as any).nickname || memberName.split(' ')[0];
    await linePush(mcId, `${type === 'ส่ง sub' ? '👥 แจ้งส่ง Sub!' : '🙋 แจ้งลา!'}\n${nick} [ทีม ${(m as any).mentor_team || '—'}]\nวันศุกร์ ${nextFri.toLocaleDateString('th-TH')}\n${type === 'ส่ง sub' ? `Sub: ${detail}` : `เหตุผล: ${detail}`}`);
  }

  const nick = (m as any).nickname || memberName.split(' ')[0];
  return `✅ รับทราบแล้วครับ ${nick}\n─────────────────\n${type === 'ส่ง sub' ? `👥 ส่ง Sub: ${detail}` : `🙋 ลา: ${detail}`}\n📅 วันศุกร์ ${nextFri.toLocaleDateString('th-TH')}\n\nMentor Coordinator ได้รับแจ้งแล้วครับ 👍\nพิมพ์ "ยกเลิกลา" ถ้าแผนเปลี่ยนครับ`;
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
  return `✅ ยกเลิกการแจ้งลาแล้วครับ ${nick}\nMentor Coordinator ได้รับแจ้งแล้วครับ`;
}

async function reportIssue(db: ReturnType<typeof getServiceClient>, memberName: string, issueText: string): Promise<string> {
  const { data: m } = await db.from('members').select('id, nickname').eq('name', memberName).single();
  if (!m) return '⚠️ ไม่พบข้อมูลสมาชิกครับ';
  await db.from('line_issues').insert({ member_id: (m as any).id, issue_text: issueText });
  const nick = (m as any).nickname || memberName.split(' ')[0];
  return `✅ รับเรื่องแล้วครับ ${nick}\n"${issueText}"\nจะแจ้ง Mentor ของคุณครับ 📨`;
}

async function replyIssues(db: ReturnType<typeof getServiceClient>, memberName: string): Promise<string> {
  const { data: m } = await db.from('members').select('id').eq('name', memberName).single();
  if (!m) return '⚠️ ไม่พบข้อมูลครับ';
  const { data: issues } = await db.from('line_issues')
    .select('issue_text, reported_at, resolved_at')
    .eq('member_id', (m as any).id)
    .order('reported_at', { ascending: false }).limit(3);
  if (!issues?.length) return '✅ ไม่มีเรื่องที่แจ้งไว้ครับ';
  const lines = ['📋 เรื่องที่แจ้งไว้:', '─────────────────'];
  (issues as Record<string, unknown>[]).forEach((iss) => {
    const status = iss.resolved_at ? '✅ แก้แล้ว' : '⏳ รอดำเนินการ';
    lines.push(`${status} ${iss.issue_text}`);
  });
  return lines.join('\n');
}

async function schedule121(db: ReturnType<typeof getServiceClient>, memberName: string, partnerName: string): Promise<string> {
  const { data: me } = await db.from('members').select('id').eq('name', memberName).single();
  const { data: partner } = await db.from('members').select('id, nickname').ilike('name', `%${partnerName}%`).single();
  if (!me || !partner) return `⚠️ ไม่พบ "${partnerName}" ในระบบครับ`;
  await db.from('one_to_one_logs').insert({ initiator_id: (me as any).id, partner_id: (partner as any).id, scheduled_date: new Date().toISOString().split('T')[0] });
  return `✅ บันทึกนัด 1-2-1 กับ ${(partner as any).nickname || partnerName} แล้วครับ\nพิมพ์ "เจอแล้ว" หลังจากพบกันเพื่อบันทึกผลครับ`;
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
  return `✅ เจอกับ ${pName} แล้ว!\n─────────────────\nผลการพูดคุยเป็นอย่างไรบ้างครับ?\n(พิมพ์สรุปสั้นๆ หรือ "skip" ถ้าไม่อยากบันทึก)`;
}

async function log121Outcome(db: ReturnType<typeof getServiceClient>, _memberName: string, _userId: string, logId: string, outcome: string): Promise<string> {
  if (outcome.toLowerCase() !== 'skip') {
    await db.from('one_to_one_logs').update({ met_at: new Date().toISOString(), outcome }).eq('id', logId);
  } else {
    await db.from('one_to_one_logs').update({ met_at: new Date().toISOString() }).eq('id', logId);
  }
  return '✅ บันทึกแล้วครับ! ดี 1-2-1 ทุกสัปดาห์นะครับ 🤝';
}

async function reply121(db: ReturnType<typeof getServiceClient>, memberName: string): Promise<string> {
  const { data: me } = await db.from('members').select('id').eq('name', memberName).single();
  const { data: logs } = await db.from('one_to_one_logs')
    .select('scheduled_date, met_at, outcome, members!partner_id(nickname, name)')
    .eq('initiator_id', (me as any)?.id)
    .order('created_at', { ascending: false }).limit(5);
  if (!logs?.length) return '📊 ยังไม่มีประวัติ 1-2-1 ครับ\nพิมพ์ "นัด [ชื่อ]" เพื่อบันทึกนัดครับ';
  const lines = ['📊 ประวัติ 1-2-1:', '─────────────────'];
  (logs as Record<string, unknown>[]).forEach((l) => {
    const pName = (l.members as Record<string, string>)?.nickname || (l.members as Record<string, string>)?.name || '?';
    const status = l.met_at ? `✅ เจอแล้ว` : '⏳ รอเจอ';
    lines.push(`${status} ${pName}${l.outcome ? ` — ${String(l.outcome).slice(0, 30)}` : ''}`);
  });
  return lines.join('\n');
}

async function replyGoals(db: ReturnType<typeof getServiceClient>, memberName: string): Promise<string> {
  const { data: m } = await db.from('members').select('id').eq('name', memberName).single();
  const { data: goals } = await db.from('line_goals').select('*').eq('member_id', (m as any)?.id);
  if (!goals?.length) return '🎯 ยังไม่ได้ตั้งเป้าหมายครับ\nพิมพ์ "เป้า ref 8" เพื่อตั้งเป้า Referral 8 ใบ';
  const lines = ['🎯 เป้าหมายของคุณ:', '─────────────────'];
  (goals as Record<string, unknown>[]).forEach((g) => lines.push(`• ${g.goal_type}: ${g.target}`));
  return lines.join('\n');
}

async function setGoal(db: ReturnType<typeof getServiceClient>, memberName: string, text: string): Promise<string> {
  const parts = text.trim().split(/\s+/);
  const type = parts[0] || '';
  const target = parseFloat(parts[1] || '0');
  if (!type || isNaN(target)) return '⚠️ รูปแบบ: เป้า [ประเภท] [ค่า] เช่น "เป้า ref 8"';
  const { data: m } = await db.from('members').select('id').eq('name', memberName).single();
  await db.from('line_goals').upsert({ member_id: (m as any)?.id, goal_type: type, target, set_at: new Date().toISOString() });
  return `✅ ตั้งเป้า ${type} = ${target} แล้วครับ 🎯`;
}

async function replyNotifSettings(db: ReturnType<typeof getServiceClient>, memberName: string): Promise<string> {
  const { data: m } = await db.from('members').select('id').eq('name', memberName).single();
  const { data: settings } = await db.from('line_notif_settings').select('*').eq('member_id', (m as any)?.id);
  const muted = (settings as Record<string, unknown>[] || []).filter((s) => s.is_muted).map((s) => s.notif_type);
  return `🔔 การแจ้งเตือนของคุณ\n─────────────────\n${muted.length ? `ปิด: ${muted.join(', ')}` : '✅ เปิดทั้งหมด'}\n\nพิมพ์ "ปิด nudge" เพื่อปิด Wednesday Nudge\nพิมพ์ "เปิด nudge" เพื่อเปิดใหม่`;
}

async function toggleNotif(db: ReturnType<typeof getServiceClient>, memberName: string, type: string, mute: boolean): Promise<string> {
  const { data: m } = await db.from('members').select('id').eq('name', memberName).single();
  await db.from('line_notif_settings').upsert({ member_id: (m as any)?.id, notif_type: type, is_muted: mute, updated_at: new Date().toISOString() });
  return `✅ ${mute ? 'ปิด' : 'เปิด'} การแจ้งเตือน "${type}" แล้วครับ`;
}

async function setBizProfile(db: ReturnType<typeof getServiceClient>, memberName: string, desc: string): Promise<string> {
  const { data: m } = await db.from('members').select('id').eq('name', memberName).single();
  await db.from('biz_profiles').upsert({ member_id: (m as any)?.id, description: desc, updated_at: new Date().toISOString() });
  return `✅ บันทึก Profile ธุรกิจแล้วครับ:\n"${desc}"\n\nพิมพ์ "แนะนำ" เพื่อให้ Bot หาคู่ 1-2-1 ให้อัตโนมัติ`;
}

async function replyMatch(db: ReturnType<typeof getServiceClient>, memberName: string, _filter: string): Promise<string> {
  const { data: myProfile } = await db.from('biz_profiles').select('description')
    .eq('member_id', (await db.from('members').select('id').eq('name', memberName).single()).data?.id).single();
  if (!myProfile) return '📌 ยังไม่ได้ตั้งค่าธุรกิจครับ\nพิมพ์: ธุรกิจ [คำอธิบาย] ก่อนนะครับ';
  return '🤝 ฟีเจอร์แนะนำ 1-2-1 อยู่ระหว่างพัฒนาครับ\nลองดูที่ App แทนได้เลยครับ';
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
    `🎉 สวัสดีครับ! ยินดีต้อนรับสู่\n` +
    `BNI IDEAL — Mentor Bot\n` +
    `────────────────────\n` +
    `Bot นี้ช่วยคุณ:\n` +
    `📊 เช็คคะแนน BNI แบบ real-time\n` +
    `🎯 รู้ทันทีว่าต้องทำอะไรต่อ\n` +
    `📈 ดู Trend คะแนน 3 เดือน\n` +
    `🤝 บันทึกนัด & ยืนยัน 1-2-1\n` +
    `────────────────────\n` +
    `🔐 เริ่มต้น: ส่งชื่อ-นามสกุล BNI\n(ภาษาอังกฤษ เช่น Phitarn S.)`
  );
}

function buildRegistrationPrompt(): string {
  return '🔐 ส่งชื่อ-นามสกุล BNI (ภาษาอังกฤษ) เพื่อลงทะเบียนครับ';
}

function buildHelpMessage(memberName: string): string {
  const nick = memberName.split(' ')[0];
  return (
    `👋 BNI Bot — คุณ${nick}\n` +
    `────────────────────\n` +
    `📊 คะแนน & ข้อมูล\n` +
    `  สถานะ → คะแนน + สิ่งที่ต้องทำ\n` +
    `  ประวัติ → Trend 3 เดือน\n` +
    `  ทีม → อันดับทีม\n` +
    `────────────────────\n` +
    `📅 แจ้งขาด/มาช้า\n` +
    `  ลา [เหตุผล] → แจ้งลา\n` +
    `  ส่ง sub [ชื่อ] → ส่งแทน\n` +
    `  ยกเลิกลา → ยกเลิก\n` +
    `────────────────────\n` +
    `🤝 1-2-1\n` +
    `  นัด [ชื่อ] → บันทึกนัด\n` +
    `  เจอแล้ว → ยืนยัน + บันทึกผล\n` +
    `  ติดตาม → ประวัติทั้งหมด\n` +
    `────────────────────\n` +
    `ข้อมูลอัพเดทหลัง import CSV ทุกเดือน`
  );
}

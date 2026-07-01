// ============================================================
// BNI IDEAL — Scheduled Cron Jobs Edge Function
// Replaces all ScriptApp.newTrigger() in WEBAPP.js + L.js
//
// Triggered by pg_cron (see supabase/seed/03_cron_jobs.sql).
// Each job calls this function with { job: string } in the body.
//
// pg_cron schedule reference (all times UTC, TH = UTC+7):
//   Mon 01:00 UTC = Mon 08:00 TH   → mondayMorningBrief  (MC + all members)
//   Wed 16:00 UTC = Wed 23:00 TH   → wednesdayNudge       (short pre-meeting ping)
//   Thu 00:00 UTC = Thu 07:00 TH   → thursdayBotPush      (personalized score + action)
//   Fri 06:00 UTC = Fri 13:00 TH   → fridayEveningReminder (post-meeting + leaderboard)
//   Fri 09:00 UTC = Fri 16:00 TH   → fridayTeamLeaderboard (no-op: merged into above)
//   1st of month 01:00 UTC          → monthlyRecap
//   Daily 10:00 UTC = Daily 17:00 TH → mentorTeamAlert
//   Daily 16:00 UTC = Daily 23:00 TH → line121AutoReminder + renewalCheck
//   Daily 17:00 UTC                 → purgeExpiredDismissals
// ============================================================

import { getServiceClient } from '../_shared/db.ts';
import {
  bangkokDateKey,
  bangkokWeekKey,
  buildIdempotencyKey,
  linePush,
  lineMulticast,
  renewalMilestone,
} from '../_shared/line.ts';
import { provisionLineExperience } from '../_shared/line-provision.ts';

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization') || '';
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  if (!cronSecret) return new Response('CRON_SECRET is not configured', { status: 503 });
  const expected   = `Bearer ${cronSecret}`;
  if (authHeader !== expected) return new Response('Unauthorized', { status: 401 });

  let body: { job: string };
  try { body = await req.json(); } catch { return new Response('Bad Request', { status: 400 }); }

  const db  = getServiceClient();
  const job = body.job;

  console.log(`[cron-jobs] Running job: ${job}`);

  try {
    switch (job) {
      case 'mondayMorningBrief':      await mondayMorningBrief(db);      break;
      case 'wednesdayNudge':          await wednesdayNudge(db);           break;
      case 'thursdayBotPush':         await thursdayBotPush(db);          break;
      case 'fridayEveningReminder':   await fridayEveningReminder(db);    break;
      case 'fridayTeamLeaderboard':   /* merged into fridayEveningReminder */ break;
      case 'monthlyRecap':            await monthlyRecap(db);             break;
      case 'mentorTeamAlert':         await mentorTeamAlert(db);          break;
      case 'line121AutoReminder':     await line121AutoReminder(db);      break;
      case 'renewalPush':             await renewalPush(db);              break;
      case 'purgeExpiredDismissals':  await purgeExpiredDismissals(db);   break;
      case 'passportLtReminder':      await passportLtReminder(db);      break;
      case 'monthlyPersonalReport':   await monthlyPersonalReport(db);   break;
      case 'visitorFollowUpReminder': await visitorFollowUpReminder(db); break;
      case 'provisionLineExperience': {
        const result = await provisionLineExperience(db);
        console.log('[cron-jobs] LINE provisioned:', JSON.stringify(result));
        break;
      }
      default:
        console.warn(`[cron-jobs] Unknown job: ${job}`);
    }
    return new Response(JSON.stringify({ ok: true, job }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(`[cron-jobs] ${job} failed:`, e);
    return new Response(JSON.stringify({ ok: false, job, error: (e as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});

// ── Types ─────────────────────────────────────────────────────
type DB = ReturnType<typeof getServiceClient>;

interface PalmsDetail {
  absence: number; referral: number; visitor: number;
  oneToOne: number; ceu: number; tyfb: number; weeks: number; total: number;
}

interface MemberRow {
  name: string;
  nickname: string;
  display_score: number;
  traffic_light: string;
  palms_detail: PalmsDetail | null;
  // Raw R2Y component columns (actual v_member_dashboard column names)
  rg:          number;  // referrals given
  visitors:    number;  // visitor count
  one_to_one:  number;  // 1-2-1 count
  absent:      number;  // absence count
}

async function getLineRecipients(db: DB, notificationType: string): Promise<string[]> {
  const { data: links } = await db.from('line_members').select('line_user_id, member_id');
  if (!links?.length) return [];
  const memberIds = links.map((row: { member_id: string }) => row.member_id);
  const { data: muted } = await db.from('line_notif_settings')
    .select('member_id, notif_type')
    .in('member_id', memberIds)
    .eq('is_muted', true)
    .in('notif_type', [notificationType, 'all']);
  const mutedIds = new Set((muted || []).map((row: { member_id: string }) => row.member_id));
  return links
    .filter((row: { member_id: string }) => !mutedIds.has(row.member_id))
    .map((row: { line_user_id: string }) => row.line_user_id);
}

async function getMcLineId(db: DB): Promise<string | null> {
  const { data } = await db.from('settings')
    .select('key, value')
    .in('key', ['MC_LINE_USER_ID', 'MC_LINE_ID', 'LINE_ID_MC']);
  for (const key of ['MC_LINE_USER_ID', 'MC_LINE_ID', 'LINE_ID_MC']) {
    const value = (data || []).find((row: { key: string }) => row.key === key)?.value;
    if (value) return String(value);
  }
  return null;
}

// ── Helper: get member data with PALMS breakdown ──────────────
async function getMemberData(db: DB, memberName: string): Promise<MemberRow | null> {
  const { data } = await db.from('v_member_dashboard')
    .select('name,nickname,display_score,traffic_light,palms_detail,rg,visitors,one_to_one,absent')
    .eq('name', memberName).single();
  if (!data) return null;
  return data as unknown as MemberRow;
}

// ── Helper: derive top action item for personalized nudge ─────
function getTopAction(m: MemberRow): string {
  const pd  = m.palms_detail;
  const wks = pd?.weeks || 1;

  // Find the component with the largest gap (most room to improve)
  const components = [
    { name: 'Referral',      pts: pd?.referral  || 0, max: 15, hint: `+${Math.max(0, wks - (m.rg || 0))} ใบ referral` },
    { name: 'Visitor',       pts: pd?.visitor   || 0, max: 20, hint: 'พา Visitor มาประชุม' },
    { name: '1-2-1',         pts: pd?.oneToOne  || 0, max: 15, hint: `+${Math.max(0, wks - (m.one_to_one || 0))} ครั้ง 1-2-1` },
    { name: 'CEU',           pts: pd?.ceu       || 0, max: 20, hint: 'เข้า CEU เพิ่ม' },
    { name: 'การเข้าร่วม',  pts: pd?.absence   || 0, max: 15, hint: 'เข้าประชุมสม่ำเสมอ' },
  ];

  // Sort ascending by gap size; last element has largest gap
  components.sort((a, b) => (a.max - a.pts) - (b.max - b.pts));
  const top = components[components.length - 1];

  if (top.max - top.pts === 0) return 'ยอดเยี่ยม! ทุก component อยู่ที่ max แล้ว 🏆';
  return `${top.hint} → +${top.max - top.pts}pt (${top.name})`;
}

// ── Traffic light emoji map ───────────────────────────────────
const TL: Record<string, string> = { green: '🟢', yellow: '🟡', red: '🔴', black: '⚫' };

// ══════════════════════════════════════════════════════════════
// SCHEDULED JOBS
// ══════════════════════════════════════════════════════════════

// ── Monday 08:00 TH: chapter overview → MC + short motivation → all ──
async function mondayMorningBrief(db: DB): Promise<void> {
  const weekKey = bangkokWeekKey();
  // MC detailed brief
  const mcId = await getMcLineId(db);

  if (mcId) {
    const { data: counts } = await db.from('v_member_dashboard')
      .select('traffic_light').eq('is_archived', false);
    const tally = { green: 0, yellow: 0, red: 0, black: 0, none: 0 };
    (counts || []).forEach((r: { traffic_light: string }) => {
      const k = (r.traffic_light || 'none') as keyof typeof tally;
      if (k in tally) tally[k]++; else tally.none++;
    });
    const total = tally.green + tally.yellow + tally.red + tally.black + tally.none;
    await linePush(mcId,
      `📊 BNI IDEAL — Monday Brief\n` +
      `────────────────────\n` +
      `🟢 เขียว : ${tally.green} คน\n` +
      `🟡 เหลือง: ${tally.yellow} คน\n` +
      `🔴 แดง  : ${tally.red} คน\n` +
      `⚫ ดำ   : ${tally.black} คน\n` +
      (tally.none ? `⬜ ยังไม่มีข้อมูล: ${tally.none} คน\n` : '') +
      `────────────────────\n` +
      `รวม ${total} คน · ดูรายละเอียดใน Dashboard`,
      {
        db,
        idempotencyKey: `cron:monday-brief:mc:${weekKey}`,
        notificationType: 'monday_brief',
        source: 'cron-jobs',
      },
    );
  }

  // Short motivation to all registered members
  const userIds = await getLineRecipients(db, 'monday_brief');
  if (userIds.length) {
    await lineMulticast(userIds,
      `🌅 สัปดาห์ใหม่ BNI IDEAL!\n` +
      `────────────────────\n` +
      `3 เป้าหมายสัปดาห์นี้:\n` +
      `✅ ส่ง Referral อย่างน้อย 1 ใบ\n` +
      `🤝 นัด 1-2-1 อย่างน้อย 1 ครั้ง\n` +
      `👥 ชวน Visitor มาประชุมวันพฤหัส\n` +
      `────────────────────\n` +
      `พิมพ์ "สถานะ" ดูคะแนนของคุณ`,
      {
        db,
        idempotencyKey: `cron:monday-brief:members:${weekKey}`,
        notificationType: 'monday_brief',
        source: 'cron-jobs',
      },
    );
  }
}

// ── Wednesday night TH: short pre-meeting ping ───────────────
async function wednesdayNudge(db: DB): Promise<void> {
  const ids = await getLineRecipients(db, 'nudge');
  if (ids.length) {
    await lineMulticast(ids,
      `⏰ พรุ่งนี้ประชุม BNI ครับ!\n` +
      `────────────────────\n` +
      `เตรียมอะไรไว้บ้างแล้ว?\n` +
      `• Referral ✍️\n• Visitor 👥\n• 1-2-1 🤝\n` +
      `────────────────────\n` +
      `ดูคะแนน → พิมพ์ "สถานะ"`,
      {
        db,
        idempotencyKey: `cron:wednesday-nudge:${bangkokWeekKey()}`,
        notificationType: 'nudge',
        source: 'cron-jobs',
      },
    );
  }
}

// ── Thursday 07:00 TH: personalized score + meeting-day action ──
async function thursdayBotPush(db: DB): Promise<void> {
  const { data: lineMembers } = await db.from('line_members')
    .select('line_user_id, member_id, members(name, nickname)');
  if (!lineMembers?.length) return;

  for (const rec of lineMembers as Record<string, unknown>[]) {
    const memberName = (rec.members as Record<string, string>)?.name;
    if (!memberName) continue;

    const m = await getMemberData(db, memberName);
    if (!m) continue;

    const nick = m.nickname || memberName.split(' ')[0] || '?';
    const tlIcon = TL[m.traffic_light] || '📊';
    const action = getTopAction(m);

    const msg =
      `🌅 BNI Good Morning, คุณ${nick}!\n` +
      `────────────────────\n` +
      `${tlIcon} คะแนนล่าสุด: ${m.display_score}/100 pt\n` +
      `────────────────────\n` +
      `🎯 วันนี้เน้น:\n${action}\n` +
      `────────────────────\n` +
      `✅ เช็คลิสต์ก่อนประชุม:\n` +
      `• Referral เตรียมไว้แล้ว?\n` +
      `• Visitor พามาด้วยไหม?\n` +
      `• 1-2-1 นัดไว้กับใคร?\n` +
      `────────────────────\n` +
      `พิมพ์ "สถานะ" ดูรายละเอียดครับ`;

    const memberId = String(rec.member_id || '');
    const { data: muted } = await db.from('line_notif_settings')
      .select('member_id')
      .eq('member_id', memberId)
      .eq('is_muted', true)
      .in('notif_type', ['score', 'all'])
      .limit(1);
    if (muted?.length) continue;

    await linePush(String(rec.line_user_id), msg, {
      db,
      idempotencyKey: `cron:thursday-score:${memberId}:${bangkokWeekKey()}`,
      memberId,
      notificationType: 'score',
      source: 'cron-jobs',
    });
  }
}

// ── Friday 13:00 TH: post-meeting recap + leaderboard ────────
async function fridayEveningReminder(db: DB): Promise<void> {
  // 1. Post-meeting message to all members
  const userIds = await getLineRecipients(db, 'post_meeting');
  if (userIds.length) {
    await lineMulticast(userIds,
      `🏆 BNI ประชุมเสร็จแล้ว! เยี่ยมมาก!\n` +
      `────────────────────\n` +
      `อย่าลืม 3 ข้อครับ:\n` +
      `✅ Follow-up Referral ที่ส่งวันนี้\n` +
      `🤝 จัดเวลา 1-2-1 กับเพื่อนที่นัดไว้\n` +
      `📝 ส่ง Thank You Note ให้คนที่ส่ง Ref ให้คุณ\n` +
      `────────────────────\n` +
      `พิมพ์ "สถานะ" เพื่อดูคะแนนอัปเดต`,
      {
        db,
        idempotencyKey: `cron:friday-recap:members:${bangkokWeekKey()}`,
        notificationType: 'post_meeting',
        source: 'cron-jobs',
      },
    );
  }

  // 2. Team leaderboard to MC
  const mcId = await getMcLineId(db);
  if (!mcId) return;

  const { data: teams } = await db.from('mentor_teams').select('name');
  const lines = ['🏆 Team Leaderboard — สัปดาห์นี้\n────────────────────'];

  for (const team of (teams || []) as { name: string }[]) {
    const { data: members } = await db.from('v_member_dashboard')
      .select('display_score, traffic_light').eq('mentor_team', team.name).eq('is_archived', false);
    if (!members?.length) continue;
    const avg = Math.round((members as { display_score: number }[])
      .reduce((s, m) => s + Number(m.display_score || 0), 0) / members.length);
    const g = (members as { traffic_light: string }[]).filter(m => m.traffic_light === 'green').length;
    const y = (members as { traffic_light: string }[]).filter(m => m.traffic_light === 'yellow').length;
    const r = (members as { traffic_light: string }[]).filter(m => m.traffic_light === 'red').length;
    const b = (members as { traffic_light: string }[]).filter(m => m.traffic_light === 'black').length;
    lines.push(`${team.name}\nAvg ${avg}pt  🟢${g} 🟡${y} 🔴${r} ⚫${b}`);
  }
  await linePush(mcId, lines.join('\n────\n'), {
    db,
    idempotencyKey: `cron:friday-leaderboard:mc:${bangkokWeekKey()}`,
    notificationType: 'chapter_pulse',
    source: 'cron-jobs',
  });
}

// ── Monthly: brief summary to MC ─────────────────────────────
async function monthlyRecap(db: DB): Promise<void> {
  const mcId = await getMcLineId(db);
  if (!mcId) return;
  await linePush(mcId,
    `📊 Monthly Recap\n────────────────────\n` +
    `เข้า Dashboard เพื่อดูสรุปประจำเดือน\n` +
    `และวางแผน Coaching เดือนหน้าครับ`,
    {
      db,
      idempotencyKey: `cron:monthly-recap:mc:${bangkokDateKey().slice(0, 7)}`,
      notificationType: 'monthly_recap',
      source: 'cron-jobs',
    },
  );
}

// ── Daily 17:00 TH: notify mentors when mentee is red/black ──
async function mentorTeamAlert(db: DB): Promise<void> {
  // mentor_teams has: name, leader_name (text nick), no mentor_id UUID
  const { data: mentors } = await db.from('mentor_teams').select('name, leader_name');
  if (!mentors?.length) return;

  for (const team of mentors as { name: string; leader_name: string }[]) {
    // Resolve leader_name → member UUID → LINE user ID
    const { data: mentorMember } = await db.from('members')
      .select('id')
      .or(`nickname.ilike.%${team.leader_name}%,name.ilike.%${team.leader_name}%`)
      .eq('is_archived', false)
      .limit(1).single();
    if (!mentorMember) continue;

    const { data: mentorLine } = await db.from('line_members')
      .select('line_user_id').eq('member_id', (mentorMember as { id: string }).id).single();
    if (!mentorLine) continue;
    const mentorUserId = String((mentorLine as Record<string, string>).line_user_id);

    // Find red/black team members
    const { data: members } = await db.from('v_member_dashboard')
      .select('name, nickname, display_score, traffic_light')
      .eq('mentor_team', team.name)
      .eq('is_archived', false)
      .in('traffic_light', ['red', 'black']);

    if (!members?.length) continue;

    const lines = [`⚠️ ทีม ${team.name} — สมาชิกที่ต้องดูแล:\n────────────────────`];
    for (const m of members as { name: string; nickname: string; display_score: number; traffic_light: string }[]) {
      const icon = TL[m.traffic_light] || '⚫';
      lines.push(`${icon} ${m.nickname || m.name}: ${m.display_score}pt`);
    }
    lines.push('────────────────────');
    lines.push('แนะนำนัด 1-2-1 เพื่อวาง Action Plan ครับ');

    const snapshotKey = await buildIdempotencyKey((members as {
      name: string; display_score: number; traffic_light: string;
    }[]).map((member) => `${member.name}:${member.display_score}:${member.traffic_light}`).sort());
    await linePush(mentorUserId, lines.join('\n'), {
      db,
      idempotencyKey: `cron:mentor-alert:${team.name}:${bangkokWeekKey()}:${snapshotKey}`,
      memberId: String((mentorMember as { id: string }).id),
      notificationType: 'mentor_alert',
      source: 'cron-jobs',
    });
  }
}

// ── Daily 23:00 TH: remind pending 1-2-1 ─────────────────────
async function line121AutoReminder(db: DB): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const { data: pending } = await db.from('one_to_one_logs')
    .select('id, initiator_id, partner_id')
    .lt('scheduled_date', cutoff.toISOString().split('T')[0])
    .is('met_at', null);
  for (const rec of (pending || []) as Record<string, unknown>[]) {
    const initiatorId = String(rec.initiator_id || '');
    if (!initiatorId) continue;
    const { data: lineLink } = await db.from('line_members')
      .select('line_user_id')
      .eq('member_id', initiatorId)
      .maybeSingle();
    const userId = (lineLink as Record<string, string> | null)?.line_user_id;
    if (!userId) continue;
    await linePush(userId,
      `🤝 มีนัด 1-2-1 ที่ยังค้างอยู่ครับ\n` +
      `────────────────────\n` +
      `พิมพ์ "เจอแล้ว" หลังจากพบกันแล้วนะครับ`,
      {
        db,
        idempotencyKey: `cron:121-reminder:${String(rec.id)}:${bangkokWeekKey()}`,
        memberId: String(rec.initiator_id),
        notificationType: '121_reminder',
        source: 'cron-jobs',
      },
    );
  }
}

// ── Daily: renewal expiry warnings ───────────────────────────
async function renewalPush(db: DB): Promise<void> {
  const in45 = new Date(); in45.setDate(in45.getDate() + 45);

  const { data: expiring } = await db.from('renewals')
    .select('member_id, expiry_date, members(name, nickname)')
    .lte('expiry_date', in45.toISOString().split('T')[0]);

  for (const rec of (expiring || []) as Record<string, unknown>[]) {
    const name = (rec.members as Record<string, string>)?.name;
    if (!name) continue;
    const { data: lineRec } = await db.from('line_members')
      .select('line_user_id').eq('member_id', String(rec.member_id)).single();
    if (!lineRec) continue;
    const days = Math.floor((new Date(String(rec.expiry_date)).getTime() - Date.now()) / 86400000);
    const nick = (rec.members as Record<string, string>)?.nickname || name.split(' ')[0];
    const userId = String((lineRec as Record<string, string>).line_user_id);
    const milestone = renewalMilestone(days);
    if (!milestone) continue;
    const { data: muted } = await db.from('line_notif_settings')
      .select('member_id')
      .eq('member_id', String(rec.member_id))
      .eq('is_muted', true)
      .in('notif_type', ['renewal', 'all'])
      .limit(1);
    if (muted?.length) continue;

    const message = days < 0
      ? `💳 คุณ${nick}: สมาชิกภาพหมดอายุแล้ว\nกรุณาติดต่อ MC เพื่อวางแผนขั้นตอนถัดไปครับ`
      : days <= 14
      ? `💳 คุณ${nick}: สมาชิกภาพเหลือ ${days} วัน ⚠️\nหากต้องการความช่วยเหลือเรื่องการต่ออายุ ติดต่อ Mentor หรือ MC ได้เลยครับ`
      : `💳 คุณ${nick}: สมาชิกภาพเหลือ ${days} วัน\nเริ่มวางแผนการต่ออายุล่วงหน้าได้แล้วครับ`;
    await linePush(userId, message, {
      db,
      idempotencyKey: `cron:renewal:${String(rec.member_id)}:${String(rec.expiry_date)}:${milestone}`,
      memberId: String(rec.member_id),
      notificationType: 'renewal',
      source: 'cron-jobs',
    });
  }
}

// ── Nightly: clean up expired alert dismissals ───────────────
async function purgeExpiredDismissals(db: DB): Promise<void> {
  const { error } = await db.rpc('fn_purge_expired_dismissals');
  if (error) console.error('[purge-dismissals] Error:', error);
}

// ── Daily 07:00 TH: remind LT of passport sessions in 2 days ─
async function passportLtReminder(db: DB): Promise<void> {
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '';
  if (!token) return;

  // Target date = today (Bangkok) + 2 days
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const target = new Date(now);
  target.setDate(target.getDate() + 2);
  const targetDate = target.toISOString().split('T')[0];

  const { data: sessions } = await db
    .from('passport_sessions')
    .select('id, title, lt_role, assigned_lt_member_id, assigned_lt_name, members!passport_sessions_member_id_fkey(name, nickname)')
    .eq('scheduled_date', targetDate)
    .in('status', ['scheduled', 'notified']);

  if (!sessions?.length) return;

  for (const s of (sessions as Record<string, unknown>[]) ) {
    const ltMemberId = s.assigned_lt_member_id ? String(s.assigned_lt_member_id) : null;
    if (!ltMemberId) continue;

    const { data: lineLink } = await db
      .from('line_members')
      .select('line_user_id')
      .eq('member_id', ltMemberId)
      .maybeSingle();
    if (!lineLink) continue;
    const userId = String((lineLink as Record<string, unknown>).line_user_id || '');
    if (!userId) continue;

    const m = (s.members || {}) as Record<string, unknown>;
    const memberName = String(m.nickname || m.name || 'New Member');
    const ltName = String(s.assigned_lt_name || s.lt_role || '');
    const sessionTitle = String(s.title || s.lt_role || 'Passport Session');

    await linePush(userId,
      `🗓️ Passport to Success — แจ้งเตือน\n` +
      `────────────────────\n` +
      (ltName ? `สวัสดีคุณ${ltName} 👋\n\n` : '') +
      `อีก 2 วัน คุณมีนัดพบ New Member:\n\n` +
      `👤 ${memberName}\n` +
      `📋 ${sessionTitle}\n` +
      `📅 ${targetDate}\n\n` +
      `เจอกันที่ประชุม BNI IDEAL นะครับ 🙏`,
      {
        db,
        idempotencyKey: `passport-lt-reminder:${String(s.id)}:${targetDate}`,
        notificationType: 'passport_lt_reminder',
        source: 'cron-jobs',
      },
    );
  }
}

// ── 1st of month 09:00 TH: personal monthly report to all LINE members ──
async function monthlyPersonalReport(db: DB): Promise<void> {
  const { data: lineMembers } = await db.from('line_members')
    .select('line_user_id, member_id, members(name, nickname)');
  if (!lineMembers?.length) return;

  const monthKey = bangkokDateKey().slice(0, 7); // YYYY-MM
  const [year, mon] = monthKey.split('-').map(Number);
  const thaiMonths = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const prevMon = mon === 1 ? 12 : mon - 1;
  const prevYear = mon === 1 ? year - 1 : year;
  const monthLabel = `${thaiMonths[prevMon]} ${prevYear + 543}`;

  for (const rec of lineMembers as Record<string, unknown>[]) {
    const memberName = (rec.members as Record<string, string>)?.name;
    if (!memberName) continue;
    const memberId = String(rec.member_id || '');

    const { data: muted } = await db.from('line_notif_settings')
      .select('member_id').eq('member_id', memberId).eq('is_muted', true)
      .in('notif_type', ['score', 'all']).limit(1);
    if (muted?.length) continue;

    const m = await getMemberData(db, memberName);
    if (!m) continue;

    const pd = m.palms_detail;
    const nick = m.nickname || memberName.split(' ')[0] || '?';
    const tlIcon = TL[m.traffic_light] || '📊';
    const topAction = getTopAction(m);

    const { data: goals } = await db.from('line_goals')
      .select('goal_type, target').eq('member_id', memberId);
    const goalMap: Record<string, number> = {};
    for (const g of (goals || []) as Record<string, unknown>[]) {
      goalMap[String(g.goal_type)] = Number(g.target);
    }

    const refGoal  = goalMap['ref']     ? ` / เป้า ${goalMap['ref']} ใบ`     : '';
    const visGoal  = goalMap['visitor'] ? ` / เป้า ${goalMap['visitor']} คน`  : '';
    const otoGoal  = goalMap['oto']     ? ` / เป้า ${goalMap['oto']} ครั้ง`  : '';
    const ceuGoal  = goalMap['ceu']     ? ` / เป้า ${goalMap['ceu']} ครั้ง`  : '';

    const msg =
      `📊 รายงานประจำเดือน ${monthLabel}\n` +
      `สวัสดีคุณ${nick} 👋\n` +
      `────────────────────\n` +
      `${tlIcon} คะแนนรวม: ${m.display_score}/100 pt\n` +
      `────────────────────\n` +
      `📌 รายละเอียด:\n` +
      `• Referral:  ${m.rg ?? 0} ใบ${refGoal}  (${pd?.referral ?? 0}/15 pt)\n` +
      `• Visitor:   ${m.visitors ?? 0} คน${visGoal}  (${pd?.visitor ?? 0}/20 pt)\n` +
      `• 1-2-1:     ${m.one_to_one ?? 0} ครั้ง${otoGoal}  (${pd?.oneToOne ?? 0}/15 pt)\n` +
      `• CEU:       ${(m as Record<string, unknown>).ceu ?? 0} ครั้ง${ceuGoal}  (${pd?.ceu ?? 0}/20 pt)\n` +
      `• ขาดประชุม: ${m.absent ?? 0} ครั้ง  (${pd?.absence ?? 0}/15 pt)\n` +
      `────────────────────\n` +
      `🎯 จุดที่ควรเน้นเดือนนี้:\n${topAction}\n` +
      `────────────────────\n` +
      `พิมพ์ "สถานะ" หรือเปิด LIFF ดูรายละเอียดครับ`;

    await linePush(String(rec.line_user_id), msg, {
      db,
      idempotencyKey: `cron:monthly-personal:${memberId}:${monthKey}`,
      memberId,
      notificationType: 'score',
      source: 'cron-jobs',
    });
  }
}

// ── Daily 08:00 TH: visitor follow-up reminder (14 days after visit) ──
async function visitorFollowUpReminder(db: DB): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const { data: visitors } = await db.from('visitor_log')
    .select('id, visitor_name, invited_by, visit_date')
    .eq('status', 'pending')
    .lte('visit_date', cutoffStr);

  for (const v of (visitors || []) as Record<string, unknown>[]) {
    const memberId = String(v.invited_by || '');
    if (!memberId) continue;

    const { data: lineLink } = await db.from('line_members')
      .select('line_user_id').eq('member_id', memberId).maybeSingle();
    const userId = String((lineLink as Record<string, unknown> | null)?.line_user_id || '');
    if (!userId) continue;

    const visitorName = String(v.visitor_name || 'แขก');
    const visitDate = String(v.visit_date || '');

    await linePush(userId,
      `👥 ติดตามแขกพิเศษ\n` +
      `────────────────────\n` +
      `คุณพา "${visitorName}" มาร่วมประชุมเมื่อ ${visitDate}\n\n` +
      `ผ่านมา 2 สัปดาห์แล้ว — เขา/เธอสนใจสมัครเป็นสมาชิกไหมครับ?\n\n` +
      `ถ้าสนใจ แจ้ง MC ได้เลยนะครับ 🙏`,
      {
        db,
        idempotencyKey: `cron:visitor-followup:${String(v.id)}:${visitDate}`,
        memberId,
        notificationType: 'visitor_followup',
        source: 'cron-jobs',
      },
    );
  }
}

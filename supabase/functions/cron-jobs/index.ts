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
import { linePush, lineMulticast } from '../_shared/line.ts';

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization') || '';
  const expected   = `Bearer ${Deno.env.get('CRON_SECRET') || ''}`;
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

// ── Helper: get all LINE user IDs ─────────────────────────────
async function getAllLineUserIds(db: DB): Promise<string[]> {
  const { data } = await db.from('line_members').select('line_user_id');
  return (data || []).map((r: { line_user_id: string }) => r.line_user_id);
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
  // MC detailed brief
  const { data: setting } = await db.from('settings').select('value').eq('key', 'MC_LINE_USER_ID').single();
  const mcId = (setting as Record<string, string>)?.value;

  if (mcId) {
    const { data: counts } = await db.from('v_member_dashboard')
      .select('traffic_light').eq('is_archived', false);
    const tally = { green: 0, yellow: 0, red: 0, black: 0 };
    (counts || []).forEach((r: { traffic_light: string }) => {
      const k = r.traffic_light as keyof typeof tally;
      if (k in tally) tally[k]++;
    });
    const total = tally.green + tally.yellow + tally.red + tally.black;
    await linePush(mcId,
      `📊 BNI IDEAL — Monday Brief\n` +
      `────────────────────\n` +
      `🟢 เขียว : ${tally.green} คน\n` +
      `🟡 เหลือง: ${tally.yellow} คน\n` +
      `🔴 แดง  : ${tally.red} คน\n` +
      `⚫ ดำ   : ${tally.black} คน\n` +
      `────────────────────\n` +
      `รวม ${total} คน · ดูรายละเอียดใน Dashboard`
    );
  }

  // Short motivation to all registered members
  const userIds = await getAllLineUserIds(db);
  if (userIds.length) {
    await lineMulticast(userIds,
      `🌅 สัปดาห์ใหม่ BNI IDEAL!\n` +
      `────────────────────\n` +
      `3 เป้าหมายสัปดาห์นี้:\n` +
      `✅ ส่ง Referral อย่างน้อย 1 ใบ\n` +
      `🤝 นัด 1-2-1 อย่างน้อย 1 ครั้ง\n` +
      `👥 ชวน Visitor มาประชุมวันพฤหัส\n` +
      `────────────────────\n` +
      `พิมพ์ "สถานะ" ดูคะแนนของคุณ`
    );
  }
}

// ── Wednesday night TH: short pre-meeting ping ───────────────
async function wednesdayNudge(db: DB): Promise<void> {
  const userIds = await getAllLineUserIds(db);
  // Filter muted
  const { data: muted } = await db.from('line_notif_settings')
    .select('member_id').eq('notif_type', 'nudge').eq('is_muted', true);
  const mutedSet = new Set((muted || []).map((r: { member_id: string }) => r.member_id));
  const { data: lm } = await db.from('line_members').select('line_user_id, member_id').in('line_user_id', userIds);
  const ids = (lm || []).filter((r: Record<string, unknown>) => !mutedSet.has(String(r.member_id)))
    .map((r: Record<string, unknown>) => String(r.line_user_id));
  if (ids.length) {
    await lineMulticast(ids,
      `⏰ พรุ่งนี้ประชุม BNI ครับ!\n` +
      `────────────────────\n` +
      `เตรียมอะไรไว้บ้างแล้ว?\n` +
      `• Referral ✍️\n• Visitor 👥\n• 1-2-1 🤝\n` +
      `────────────────────\n` +
      `ดูคะแนน → พิมพ์ "สถานะ"`
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

    await linePush(String(rec.line_user_id), msg);
  }
}

// ── Friday 13:00 TH: post-meeting recap + leaderboard ────────
async function fridayEveningReminder(db: DB): Promise<void> {
  // 1. Post-meeting message to all members
  const userIds = await getAllLineUserIds(db);
  if (userIds.length) {
    await lineMulticast(userIds,
      `🏆 BNI ประชุมเสร็จแล้ว! เยี่ยมมาก!\n` +
      `────────────────────\n` +
      `อย่าลืม 3 ข้อครับ:\n` +
      `✅ Follow-up Referral ที่ส่งวันนี้\n` +
      `🤝 จัดเวลา 1-2-1 กับเพื่อนที่นัดไว้\n` +
      `📝 ส่ง Thank You Note ให้คนที่ส่ง Ref ให้คุณ\n` +
      `────────────────────\n` +
      `พิมพ์ "สถานะ" เพื่อดูคะแนนอัปเดต`
    );
  }

  // 2. Team leaderboard to MC
  const { data: setting } = await db.from('settings').select('value').eq('key', 'MC_LINE_USER_ID').single();
  const mcId = (setting as Record<string, string>)?.value;
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
  await linePush(mcId, lines.join('\n────\n'));
}

// ── Monthly: brief summary to MC ─────────────────────────────
async function monthlyRecap(db: DB): Promise<void> {
  const { data: setting } = await db.from('settings').select('value').eq('key', 'MC_LINE_USER_ID').single();
  const mcId = (setting as Record<string, string>)?.value;
  if (!mcId) return;
  await linePush(mcId,
    `📊 Monthly Recap\n────────────────────\n` +
    `เข้า Dashboard เพื่อดูสรุปประจำเดือน\n` +
    `และวางแผน Coaching เดือนหน้าครับ`
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

    await linePush(mentorUserId, lines.join('\n'));
  }
}

// ── Daily 23:00 TH: remind pending 1-2-1 ─────────────────────
async function line121AutoReminder(db: DB): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const { data: pending } = await db.from('one_to_one_logs')
    .select('initiator_id, partner_id, members!initiator_id(name), line_members!inner(line_user_id)')
    .lt('scheduled_date', cutoff.toISOString().split('T')[0])
    .is('met_at', null);
  for (const rec of (pending || []) as Record<string, unknown>[]) {
    const userId = (rec.line_members as Record<string, string>)?.line_user_id;
    if (!userId) continue;
    await linePush(userId,
      `🤝 มีนัด 1-2-1 ที่ยังค้างอยู่ครับ\n` +
      `────────────────────\n` +
      `พิมพ์ "เจอแล้ว" หลังจากพบกันแล้วนะครับ`
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
    if (days < 0) {
      await linePush(userId, `💳 คุณ${nick}: สมาชิกภาพหมดอายุแล้ว ‼️\nกรุณาติดต่อ MC เพื่อต่ออายุด่วนครับ`);
    } else if (days <= 14) {
      await linePush(userId, `💳 คุณ${nick}: สมาชิกภาพเหลือ ${days} วัน ⚠️\nต่ออายุก่อนหมดเขตนะครับ`);
    } else {
      await linePush(userId, `💳 คุณ${nick}: สมาชิกภาพเหลือ ${days} วัน\nอย่าลืมวางแผนต่ออายุนะครับ`);
    }
  }
}

// ── Nightly: clean up expired alert dismissals ───────────────
async function purgeExpiredDismissals(db: DB): Promise<void> {
  const { error } = await db.rpc('fn_purge_expired_dismissals');
  if (error) console.error('[purge-dismissals] Error:', error);
}

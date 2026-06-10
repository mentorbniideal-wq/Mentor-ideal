// ============================================================
// BNI IDEAL — Scheduled Cron Jobs Edge Function
// Replaces all ScriptApp.newTrigger() in WEBAPP.js + L.js
//
// Triggered by pg_cron (see supabase/seed/03_cron_jobs.sql).
// Each job calls this function with { job: string } in the body.
//
// pg_cron schedule reference (all times UTC, TH = UTC+7):
//   Mon 01:00 UTC = Mon 08:00 TH   → mondayMorningBrief
//   Wed 23:00 UTC = Thu 06:00 TH   → wednesdayNudge (sends Wed night TH time)
//   Thu 00:00 UTC = Thu 07:00 TH   → thursdayBotPush (weekly score summary)
//   Fri 06:00 UTC = Fri 13:00 TH   → fridayEveningReminder (post-meeting)
//   Fri 09:00 UTC = Fri 16:00 TH   → fridayTeamLeaderboard
//   1st of month 01:00 UTC          → monthlyRecap
//   Daily 16:00 UTC = Daily 23:00 TH → line121AutoReminder + renewalCheck
//   Daily 17:00 UTC                 → purgeExpiredDismissals
// ============================================================

import { getServiceClient } from '../_shared/db.ts';
import { linePush, lineMulticast } from '../_shared/line.ts';

Deno.serve(async (req: Request) => {
  // Simple secret check so pg_cron can call this via pg_net
  const authHeader = req.headers.get('Authorization') || '';
  const expected   = `Bearer ${Deno.env.get('CRON_SECRET') || ''}`;
  if (authHeader !== expected) return new Response('Unauthorized', { status: 401 });

  let body: { job: string };
  try { body = await req.json(); } catch { return new Response('Bad Request', { status: 400 }); }

  const db = getServiceClient();
  const job = body.job;

  console.log(`[cron-jobs] Running job: ${job}`);

  try {
    switch (job) {
      case 'mondayMorningBrief':      await mondayMorningBrief(db);      break;
      case 'wednesdayNudge':          await wednesdayNudge(db);           break;
      case 'thursdayBotPush':         await thursdayBotPush(db);          break;
      case 'fridayEveningReminder':   await fridayEveningReminder(db);    break;
      case 'fridayTeamLeaderboard':   await fridayTeamLeaderboard(db);    break;
      case 'monthlyRecap':            await monthlyRecap(db);             break;
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

// ── Helper: get all registered LINE user IDs ─────────────────
async function getAllLineUserIds(db: ReturnType<typeof getServiceClient>): Promise<string[]> {
  const { data } = await db.from('line_members').select('line_user_id');
  return (data || []).map((r: { line_user_id: string }) => r.line_user_id);
}

// ── Helper: get member display score ─────────────────────────
async function getMemberScore(db: ReturnType<typeof getServiceClient>, memberName: string): Promise<{ score: number; tl: string } | null> {
  const { data } = await db.from('v_member_dashboard').select('display_score, traffic_light').eq('name', memberName).single();
  if (!data) return null;
  return { score: Number((data as Record<string, unknown>).display_score || 0), tl: String((data as Record<string, unknown>).traffic_light || 'black') };
}

// ── Thursday 07:00 TH: Weekly score summary to all LINE members ──
async function thursdayBotPush(db: ReturnType<typeof getServiceClient>): Promise<void> {
  const { data: lineMembers } = await db
    .from('line_members')
    .select('line_user_id, member_id, members(name, nickname)');
  if (!lineMembers?.length) return;

  for (const rec of lineMembers as Record<string, unknown>[]) {
    const memberName = (rec.members as Record<string, string>)?.name;
    const nick = (rec.members as Record<string, string>)?.nickname || memberName?.split(' ')[0] || '?';
    if (!memberName) continue;

    const s = await getMemberScore(db, memberName);
    if (!s) continue;

    const tlIcon = { green: '🟢', yellow: '🟡', red: '🔴', black: '⚫' }[s.tl] || '📊';
    const msg = `📊 BNI Weekly Update\nคุณ${nick}: ${tlIcon} ${s.score}/100\n─────────────────\nพิมพ์ "สถานะ" ดูรายละเอียดครับ`;
    await linePush(String(rec.line_user_id), msg);
  }
}

// ── Wednesday Night TH: nudge for Thu meeting ────────────────
async function wednesdayNudge(db: ReturnType<typeof getServiceClient>): Promise<void> {
  const userIds = await getAllLineUserIds(db);
  // Filter out those who muted nudge
  const { data: muted } = await db.from('line_notif_settings')
    .select('member_id').eq('notif_type', 'nudge').eq('is_muted', true);
  const mutedIds = new Set((muted || []).map((r: { member_id: string }) => r.member_id));

  const { data: lineMembers } = await db.from('line_members')
    .select('line_user_id, member_id').in('line_user_id', userIds);

  const toNotify = (lineMembers || []).filter((r: Record<string, unknown>) => !mutedIds.has(String(r.member_id)));
  const ids = toNotify.map((r: Record<string, unknown>) => String(r.line_user_id));
  if (ids.length) {
    await lineMulticast(ids, '🔔 พรุ่งนี้ประชุม BNI ครับ!\n─────────────────\n✅ เตรียม Referral ไว้แล้วไหม?\n👥 มีแผนพา Visitor มาไหม?\n🤝 นัด 1-2-1 กับใครบ้างไหม?\n─────────────────\nพิมพ์ "สถานะ" ดูคะแนนปัจจุบัน');
  }
}

// ── Monday 08:00 TH: Weekly brief ───────────────────────────
async function mondayMorningBrief(db: ReturnType<typeof getServiceClient>): Promise<void> {
  const { data: setting } = await db.from('settings').select('value').eq('key', 'MC_LINE_USER_ID').single();
  const mcId = (setting as Record<string, string>)?.value;
  if (!mcId) return;

  // Count by traffic light
  const { data: counts } = await db.from('v_member_dashboard')
    .select('traffic_light')
    .eq('is_archived', false);
  const tally = { green: 0, yellow: 0, red: 0, black: 0 };
  (counts || []).forEach((r: { traffic_light: string }) => {
    const k = r.traffic_light as keyof typeof tally;
    if (k in tally) tally[k]++;
  });

  await linePush(mcId, `📊 BNI Monday Brief\n─────────────────\n🟢 เขียว: ${tally.green} คน\n🟡 เหลือง: ${tally.yellow} คน\n🔴 แดง: ${tally.red} คน\n⚫ ดำ: ${tally.black} คน\n─────────────────\nดูรายละเอียดใน Dashboard`);
}

// ── Friday afternoon: post-meeting reminder ──────────────────
async function fridayEveningReminder(db: ReturnType<typeof getServiceClient>): Promise<void> {
  const userIds = await getAllLineUserIds(db);
  if (userIds.length) {
    await lineMulticast(userIds, '🌟 ประชุม BNI เสร็จแล้ว!\n─────────────────\nอย่าลืม:\n✅ ส่ง Referral ถ้ายังไม่ได้ส่ง\n🤝 นัด 1-2-1 กับเพื่อน\n📝 บันทึก Thank You Note\n─────────────────\nพิมพ์ "สถานะ" ดูคะแนนครับ');
  }
}

// ── Friday: Team leaderboard ─────────────────────────────────
async function fridayTeamLeaderboard(db: ReturnType<typeof getServiceClient>): Promise<void> {
  const { data: setting } = await db.from('settings').select('value').eq('key', 'MC_LINE_USER_ID').single();
  const mcId = (setting as Record<string, string>)?.value;
  if (!mcId) return;

  const { data: teams } = await db.from('mentor_teams').select('name');
  const lines = ['🏆 Team Leaderboard\n─────────────────'];

  for (const team of (teams || []) as { name: string }[]) {
    const { data: members } = await db.from('v_member_dashboard')
      .select('display_score, traffic_light').eq('mentor_team', team.name);
    if (!members?.length) continue;
    const avg = Math.round((members as { display_score: number }[]).reduce((s, m) => s + Number(m.display_score || 0), 0) / members.length);
    const green = (members as { traffic_light: string }[]).filter((m) => m.traffic_light === 'green').length;
    lines.push(`${team.name}: avg ${avg}/100 (🟢 ${green}/${members.length})`);
  }
  await linePush(mcId, lines.join('\n'));
}

// ── 1st of month: monthly recap ──────────────────────────────
async function monthlyRecap(db: ReturnType<typeof getServiceClient>): Promise<void> {
  const { data: setting } = await db.from('settings').select('value').eq('key', 'MC_LINE_USER_ID').single();
  const mcId = (setting as Record<string, string>)?.value;
  if (!mcId) return;
  await linePush(mcId, '📊 Monthly Recap\n─────────────────\nกรุณาเข้า Dashboard เพื่อดูสรุปประจำเดือนครับ');
}

// ── Daily: remind pending 1-2-1 ──────────────────────────────
async function line121AutoReminder(db: ReturnType<typeof getServiceClient>): Promise<void> {
  // Find 1-2-1s scheduled > 7 days ago and not yet met
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const { data: pending } = await db.from('one_to_one_logs')
    .select('initiator_id, partner_id, members!initiator_id(name), line_members!inner(line_user_id)')
    .lt('scheduled_date', cutoff.toISOString().split('T')[0])
    .is('met_at', null);
  for (const rec of (pending || []) as Record<string, unknown>[]) {
    const userId = (rec.line_members as Record<string, string>)?.line_user_id;
    if (!userId) continue;
    await linePush(userId, '🤝 มีนัด 1-2-1 ที่ยังไม่ได้เจอครับ\nพิมพ์ "เจอแล้ว" เมื่อพบกันครับ');
  }
}

// ── Daily: renewal expiry warnings ──────────────────────────
async function renewalPush(db: ReturnType<typeof getServiceClient>): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const in45  = new Date(); in45.setDate(in45.getDate() + 45);

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
    if (days < 0) {
      await linePush(String((lineRec as Record<string, string>).line_user_id),
        `💳 คุณ${nick}: สมาชิกภาพหมดอายุแล้ว! กรุณาต่ออายุด่วนครับ ‼️`);
    } else if (days <= 14) {
      await linePush(String((lineRec as Record<string, string>).line_user_id),
        `💳 คุณ${nick}: สมาชิกภาพเหลือ ${days} วัน ต่ออายุด่วนเลยครับ ⚠️`);
    } else {
      await linePush(String((lineRec as Record<string, string>).line_user_id),
        `💳 คุณ${nick}: สมาชิกภาพเหลือ ${days} วัน อย่าลืมต่ออายุนะครับ`);
    }
  }
}

// ── Nightly: clean up expired alert dismissals ──────────────
async function purgeExpiredDismissals(db: ReturnType<typeof getServiceClient>): Promise<void> {
  const { error } = await db.rpc('fn_purge_expired_dismissals');
  if (error) console.error('[purge-dismissals] Error:', error);
}

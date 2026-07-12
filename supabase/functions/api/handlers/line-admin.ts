// FILE: line-admin.ts
// Handler: line-admin — saveLineId, getLineIds, sendLineMessage, onboarding, triggers, etc.
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';
import {
  generateLinkToken,
  linePush,
  normalizeLinkToken,
  sha256Hex,
  type LineSendOptions,
} from '../../_shared/line.ts';
import {
  buildRichMenu,
  type RichMenuRole,
} from '../../_shared/line-rich-menu.ts';
import { trackLineEvent } from '../../_shared/analytics.ts';

// ── Unified LINE Push helper — no-op when token is absent (dev mode) ──
const LINE_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '';

async function sendLineMsg(
  userId: string,
  text: string,
  options: LineSendOptions = {},
): Promise<boolean> {
  if (!LINE_TOKEN) return false;
  try {
    const db = options.db || getServiceClient();
    const result = await linePush(userId, text, {
      ...options,
      db,
      idempotencyKey: options.idempotencyKey || `line-admin:${crypto.randomUUID()}`,
      source: options.source || 'api/line-admin',
    });
    return result.sent || result.skipped;
  } catch (e) {
    console.error('[sendLineMsg] LINE send error:', e);
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

function lineActivityTypeMeta(type: string): { icon: string; label: string; tone: string } {
  return ({
    command_received: { icon: '💬', label: 'Member พิมพ์', tone: '#38bdf8' },
    command_replied: { icon: '🤖', label: 'Bot ตอบ', tone: '#06C755' },
    absence: { icon: '🙋', label: 'แจ้งลา', tone: '#f59e0b' },
    substitute: { icon: '👥', label: 'ส่ง Sub', tone: '#f59e0b' },
    issue: { icon: '⚠️', label: 'ขอความช่วยเหลือ', tone: '#f87171' },
    goal: { icon: '🎯', label: 'ตั้งเป้าหมาย', tone: '#a78bfa' },
    one_to_one: { icon: '🤝', label: '1-2-1', tone: '#34d399' },
    liff: { icon: '📱', label: 'LIFF', tone: '#06C755' },
    delivery: { icon: '📤', label: 'ข้อความที่ส่ง', tone: '#94a3b8' },
  } as Record<string, { icon: string; label: string; tone: string }>)[type]
    || { icon: '•', label: type || 'Activity', tone: '#94a3b8' };
}

function memberFromJoined(row: Record<string, unknown>, key = 'members'): {
  memberName: string;
  memberNick: string;
  memberTeam: string;
} {
  const m = (row[key] || {}) as Record<string, unknown>;
  return {
    memberName: String(m.name || ''),
    memberNick: String(m.nickname || m.name || ''),
    memberTeam: String(m.mentor_team || ''),
  };
}

function txt(value: unknown): string {
  return String(value ?? '').trim();
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function daysBetween(fromIso: unknown, toMs = Date.now()): number | null {
  const raw = txt(fromIso);
  if (!raw) return null;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((toMs - t) / 86400000);
}

function daysUntil(dateIso: unknown, fromMs = Date.now()): number | null {
  const raw = txt(dateIso);
  if (!raw) return null;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - fromMs) / 86400000);
}

function canManageTeamIssue(auth: Awaited<ReturnType<typeof requireAuth>>, team: string): boolean {
  if (auth.isMC || auth.role === 'growth') return true;
  return Boolean(auth.teamName && team && auth.teamName === team);
}

async function buildUnifiedFollowUpInbox(
  db: ReturnType<typeof getServiceClient>,
  auth: Awaited<ReturnType<typeof requireAuth>>,
) {
  const canSeeAll = Boolean(auth.isMC || auth.role === 'growth');
  const teamName = txt(auth.teamName);
  const now = Date.now();
  const blueprintYear = new Date(now).getFullYear();
  const items: Record<string, unknown>[] = [];

  const push = (item: Record<string, unknown>) => {
    const team = txt(item.team);
    if (!canSeeAll && teamName && team && team !== teamName) return;
    const level = txt(item.level);
    const weight = level === 'critical' ? 400 : level === 'overdue' ? 350 : level === 'urgent' ? 300 : level === 'due_soon' ? 220 : 120;
    items.push({
      ...item,
      sortScore: weight + num(item.ageDays, 0) + num(item.priorityBoost, 0),
    });
  };

  const [
    lineIssuesRes,
    coreIssuesRes,
    growthTasksRes,
    renewalsRes,
    passportRes,
    msbRes,
  ] = await Promise.all([
    db.from('line_issues')
      .select('id, issue_text, reported_at, resolved_at, members(name, nickname, mentor_team)')
      .is('resolved_at', null)
      .order('reported_at', { ascending: true })
      .limit(40),
    db.from('core_issues')
      .select('id, member_id, mentor_team, issue_text, action_plan, follow_up_at, opened_at, status')
      .eq('status', 'open')
      .order('follow_up_at', { ascending: true, nullsFirst: false })
      .order('opened_at', { ascending: true })
      .limit(60),
    db.from('growth_tasks')
      .select('id, assigned_to, task_text, task_type, priority, member_name, created_at, responded_at')
      .is('responded_at', null)
      .order('created_at', { ascending: true })
      .limit(60),
    db.from('renewals')
      .select('id, expiry_date, workflow_status, members(name, nickname, mentor_team)')
      .lte('expiry_date', new Date(now + 45 * 86400000).toISOString().slice(0, 10))
      .order('expiry_date', { ascending: true })
      .limit(60),
    db.from('passport_sessions')
      .select('id, scheduled_date, status, title, week_no, lt_role, assigned_lt_name, members!passport_sessions_member_id_fkey(name, nickname, mentor_team)')
      .in('status', ['scheduled', 'notified', 'declined', 'rescheduled', 'missed'])
      .order('scheduled_date', { ascending: true })
      .limit(60),
    db.from('v_msb_plan_vs_actual')
      .select('member_id, name, nickname, mentor_team, blueprint_year, intelligence_status, revenue_gap, referral_gap, blueprint_status')
      .eq('blueprint_year', blueprintYear)
      .in('intelligence_status', ['no_plan', 'critical', 'behind'])
      .order('revenue_gap', { ascending: false, nullsFirst: false })
      .limit(80),
  ]);

  const firstError = lineIssuesRes.error || coreIssuesRes.error || growthTasksRes.error
    || renewalsRes.error || passportRes.error || msbRes.error;
  if (firstError) throw new Error(firstError.message);

  const coreMemberIds = Array.from(new Set(((coreIssuesRes.data || []) as Record<string, unknown>[])
    .map((row) => txt(row.member_id))
    .filter(Boolean)));
  const { data: coreMembers } = coreMemberIds.length
    ? await db.from('members').select('id, name, nickname, mentor_team').in('id', coreMemberIds)
    : { data: [] };
  const coreMemberById: Record<string, Record<string, unknown>> = {};
  for (const member of (coreMembers || []) as Record<string, unknown>[]) {
    coreMemberById[txt(member.id)] = member;
  }

  for (const row of (lineIssuesRes.data || []) as Record<string, unknown>[]) {
    const m = memberFromJoined(row);
    const ageDays = daysBetween(row.reported_at, now) ?? 0;
    push({
      id: `line:${row.id}`,
      source: 'line_issues',
      type: 'line_issue',
      icon: '🆘',
      level: ageDays >= 2 ? 'urgent' : 'due_soon',
      title: 'สมาชิกขอความช่วยเหลือผ่าน LINE',
      detail: txt(row.issue_text),
      memberName: m.memberName,
      nickname: m.memberNick,
      team: m.memberTeam,
      ageDays,
      dueText: ageDays ? `${ageDays} วันที่แล้ว` : 'วันนี้',
      nextAction: 'เปิด Help Case และตอบกลับสมาชิก',
      actionLabel: 'เปิด LINE Activity',
      actionTarget: 'line',
      priorityBoost: 30,
    });
  }

  for (const row of (coreIssuesRes.data || []) as Record<string, unknown>[]) {
    const ageDays = daysBetween(row.opened_at, now) ?? 0;
    const dueDays = daysUntil(row.follow_up_at, now);
    const overdue = dueDays !== null ? dueDays < 0 : ageDays >= 14;
    const member = coreMemberById[txt(row.member_id)] || {};
    push({
      id: `core:${row.id}`,
      source: 'core_issues',
      type: 'core_issue',
      icon: '📋',
      level: overdue ? 'overdue' : (dueDays !== null && dueDays <= 3) || ageDays >= 10 ? 'due_soon' : 'open',
      title: txt(row.issue_text) || 'Core Issue ค้าง',
      detail: txt(row.action_plan),
      memberName: txt(member.name),
      nickname: txt(member.nickname || member.name),
      team: txt(row.mentor_team || member.mentor_team),
      ageDays,
      dueText: dueDays === null ? `${ageDays} วันที่แล้ว` : dueDays < 0 ? `เลยกำหนด ${Math.abs(dueDays)} วัน` : `อีก ${dueDays} วัน`,
      nextAction: 'ติดตาม action plan และปิดเคสเมื่อจบ',
      actionLabel: 'Action Center',
      actionTarget: 'pq',
    });
  }

  for (const row of (growthTasksRes.data || []) as Record<string, unknown>[]) {
    const ageDays = daysBetween(row.created_at, now) ?? 0;
    push({
      id: `task:${row.id}`,
      source: 'growth_tasks',
      type: 'growth_task',
      icon: txt(row.priority) || '🎯',
      level: ageDays >= 7 ? 'overdue' : ageDays >= 3 ? 'due_soon' : 'open',
      title: txt(row.task_type) || 'Growth Task ค้าง',
      detail: txt(row.task_text),
      memberName: txt(row.member_name),
      nickname: '',
      team: txt(row.assigned_to).toUpperCase(),
      ageDays,
      dueText: ageDays ? `${ageDays} วันที่แล้ว` : 'วันนี้',
      nextAction: 'ให้ owner update หรือ mark done',
      actionLabel: 'Action Center',
      actionTarget: 'pq',
    });
  }

  for (const row of (renewalsRes.data || []) as Record<string, unknown>[]) {
    const m = memberFromJoined(row);
    const dueDays = daysUntil(row.expiry_date, now);
    if (dueDays !== null && dueDays > 45) continue;
    push({
      id: `renewal:${row.id}`,
      source: 'renewals',
      type: 'renewal',
      icon: '💳',
      level: dueDays !== null && dueDays <= 7 ? 'critical' : dueDays !== null && dueDays <= 30 ? 'urgent' : 'due_soon',
      title: 'Renewal ใกล้ถึงกำหนด',
      detail: `สถานะ: ${txt(row.workflow_status) || 'ยังไม่เริ่ม'}`,
      memberName: m.memberName,
      nickname: m.memberNick,
      team: m.memberTeam,
      ageDays: dueDays !== null ? Math.max(0, 45 - dueDays) : 0,
      dueText: dueDays === null ? 'ไม่ทราบวันหมดอายุ' : dueDays < 0 ? `หมดอายุแล้ว ${Math.abs(dueDays)} วัน` : `อีก ${dueDays} วัน`,
      nextAction: 'ติดต่อสมาชิกและอัปเดต renewal workflow',
      actionLabel: 'เปิด Renewal',
      actionTarget: 'renewal',
      priorityBoost: 20,
    });
  }

  for (const row of (passportRes.data || []) as Record<string, unknown>[]) {
    const m = memberFromJoined(row);
    const dueDays = daysUntil(row.scheduled_date, now);
    const status = txt(row.status);
    push({
      id: `passport:${row.id}`,
      source: 'passport_sessions',
      type: 'passport',
      icon: status === 'missed' || status === 'declined' ? '🚨' : '🛂',
      level: status === 'missed' || status === 'declined' ? 'urgent' : dueDays !== null && dueDays <= 1 ? 'due_soon' : 'open',
      title: `Passport W${row.week_no || '—'} · ${txt(row.title) || 'Session'}`,
      detail: `พบ ${txt(row.assigned_lt_name || row.lt_role) || 'ยังไม่กำหนด LT'} · status ${status || 'scheduled'}`,
      memberName: m.memberName,
      nickname: m.memberNick,
      team: m.memberTeam,
      ageDays: dueDays !== null && dueDays < 0 ? Math.abs(dueDays) : 0,
      dueText: dueDays === null ? 'ยังไม่ระบุวัน' : dueDays < 0 ? `เลย ${Math.abs(dueDays)} วัน` : dueDays === 0 ? 'วันนี้' : `อีก ${dueDays} วัน`,
      nextAction: 'ยืนยัน LT / เลื่อนนัด / mark completed',
      actionLabel: 'เปิด Passport',
      actionTarget: 'passport',
    });
  }

  const seenMsb = new Set<string>();
  for (const row of (msbRes.data || []) as Record<string, unknown>[]) {
    const memberId = txt(row.member_id);
    if (seenMsb.has(memberId)) continue;
    seenMsb.add(memberId);
    const status = txt(row.intelligence_status);
    push({
      id: `msb:${memberId || row.name}`,
      source: 'msb_intelligence',
      type: 'msb',
      icon: status === 'no_plan' ? '📝' : '🎯',
      level: status === 'no_plan' ? 'urgent' : status === 'critical' ? 'critical' : 'due_soon',
      title: status === 'no_plan' ? 'ยังไม่ได้กรอก Blueprint' : 'MSB Plan vs Actual ต้องตาม',
      detail: `Revenue gap ${Math.round(num(row.revenue_gap)).toLocaleString('th-TH')} · Referral gap ${Math.round(num(row.referral_gap)).toLocaleString('th-TH')}`,
      memberName: txt(row.name),
      nickname: txt(row.nickname),
      team: txt(row.mentor_team),
      ageDays: 0,
      dueText: txt(row.blueprint_year) || 'ปีนี้',
      nextAction: status === 'no_plan' ? 'ส่งลิงก์ Blueprint และให้ Mentor follow-up' : 'ให้ Growth/Mentor วาง action จาก gap',
      actionLabel: 'เปิด Blueprint',
      actionTarget: 'msb',
    });
  }

  const sorted = items.sort((a, b) => num(b.sortScore) - num(a.sortScore)).slice(0, 60);
  const counts: Record<string, number> = {};
  const levels: Record<string, number> = {};
  for (const item of sorted) {
    counts[txt(item.type)] = (counts[txt(item.type)] || 0) + 1;
    levels[txt(item.level)] = (levels[txt(item.level)] || 0) + 1;
  }
  return {
    total: sorted.length,
    counts,
    levels,
    generatedAt: new Date().toISOString(),
    items: sorted,
  };
}

async function getLineQuotaSnapshot(): Promise<Record<string, unknown>> {
  if (!LINE_TOKEN) {
    return { ok: false, configured: false, error: 'LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า' };
  }
  try {
    const [quotaRes, usageRes] = await Promise.all([
      fetch('https://api.line.me/v2/bot/message/quota', {
        headers: { Authorization: `Bearer ${LINE_TOKEN}` },
      }),
      fetch('https://api.line.me/v2/bot/message/quota/consumption', {
        headers: { Authorization: `Bearer ${LINE_TOKEN}` },
      }),
    ]);
    if (!quotaRes.ok || !usageRes.ok) {
      return {
        ok: false,
        configured: true,
        error: `LINE quota API error: ${quotaRes.status} / ${usageRes.status}`,
      };
    }
    const quota = await quotaRes.json() as Record<string, unknown>;
    const usage = await usageRes.json() as Record<string, unknown>;
    const type = String(quota.type || 'unknown');
    const unlimited = type === 'unlimited';
    const limit = unlimited ? null : Number(quota.value) || 0;
    const used = Number(usage.totalUsage) || 0;
    const remaining = unlimited ? null : Math.max(0, Number(limit) - used);
    const pct = !unlimited && Number(limit) > 0 ? Math.round(used / Number(limit) * 100) : 0;
    return { ok: true, configured: true, type, unlimited, limit, used, remaining, pct };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function lineQuotaMode(quota: Record<string, unknown>): {
  mode: 'normal' | 'save' | 'critical' | 'unlimited' | 'unknown';
  label: string;
  advice: string;
} {
  if (!quota.ok) return {
    mode: 'unknown',
    label: 'ตรวจ quota ไม่ได้',
    advice: 'ใช้ reply/manual ก่อน และตรวจ LINE token',
  };
  if (quota.unlimited) return {
    mode: 'unlimited',
    label: 'Unlimited',
    advice: 'ส่งข้อความสำคัญได้ตามปกติ',
  };
  const remaining = Number(quota.remaining || 0);
  const pct = Number(quota.pct || 0);
  if (remaining <= 50 || pct >= 90) return {
    mode: 'critical',
    label: 'Critical',
    advice: 'งด broadcast และใช้ reply/quick reply เป็นหลัก',
  };
  if (remaining <= 150 || pct >= 75) return {
    mode: 'save',
    label: 'Save Mode',
    advice: 'ส่งเฉพาะ renewal, help case, onboarding ที่จำเป็น',
  };
  return {
    mode: 'normal',
    label: 'Normal',
    advice: 'ส่ง auto message ได้ตามปกติ แต่ควรหลีกเลี่ยงข้อความที่ไม่จำเป็น',
  };
}

function lineAutomationLibrary(): Record<string, unknown>[] {
  return [
    {
      key: 'monday_brief',
      name: '🌅 Monday Brief',
      status: 'auto',
      schedule: 'จันทร์ 08:00',
      audience: 'MC + สมาชิกที่รับ brief',
      quotaImpact: 'medium',
      purpose: 'เริ่มสัปดาห์ด้วยภาพรวม/สิ่งที่ควรโฟกัส',
      guard: 'ปิดได้เมื่อ quota เข้า Save Mode',
    },
    {
      key: 'thursday_score',
      name: '📊 Thursday Score + Friday Prep',
      status: 'auto',
      schedule: 'พฤหัส 07:00',
      audience: 'สมาชิกที่ผูก LINE และไม่ mute score',
      quotaImpact: 'high',
      purpose: 'ส่ง score card และ action ก่อนประชุมวันศุกร์',
      guard: 'ถ้า quota ต่ำ ส่งเฉพาะ red/black/renewal risk',
    },
    {
      key: 'friday_meeting_reminder',
      name: '⏰ Friday Meeting Reminder',
      status: 'auto',
      schedule: 'พฤหัส 18:00',
      audience: 'สมาชิกที่รับ nudge',
      quotaImpact: 'high',
      purpose: 'เตือนว่ามีประชุมวันศุกร์',
      guard: 'สำคัญ แต่ควร short copy เพื่อประหยัด quota',
    },
    {
      key: 'friday_recap',
      name: '🏆 Friday Recap',
      status: 'auto',
      schedule: 'ศุกร์ 13:00',
      audience: 'สมาชิก + MC leaderboard',
      quotaImpact: 'medium',
      purpose: 'สรุปหลังประชุม/leaderboard',
      guard: 'งดส่งสมาชิกทั้งหมดเมื่อ quota ต่ำ',
    },
    {
      key: 'monthly_recap',
      name: '📆 Monthly Recap',
      status: 'auto',
      schedule: 'วันที่ 1 เวลา 08:00',
      audience: 'MC',
      quotaImpact: 'low',
      purpose: 'สรุปเดือนและสัญญาณสำคัญ',
      guard: 'ส่ง MC เท่านั้นจึงปลอดภัยต่อ quota',
    },
    {
      key: '121_pending',
      name: '🤝 1-2-1 Pending Reminder',
      status: 'auto',
      schedule: 'พุธ 18:00',
      audience: 'สมาชิกที่มีนัด 1-2-1 ค้างเกิน 7 วัน',
      quotaImpact: 'targeted',
      purpose: 'ช่วยปิด loop นัด 1-2-1',
      guard: 'ส่งเฉพาะรายการค้างจริง',
    },
    {
      key: 'renewal',
      name: '🔁 Renewal Reminder',
      status: 'event',
      schedule: 'ทุกวัน 10:00',
      audience: 'สมาชิกที่ใกล้ต่ออายุ milestone',
      quotaImpact: 'targeted',
      purpose: 'กัน renewal หลุด',
      guard: 'ควรส่งแม้ Save Mode เพราะเป็น high-value',
    },
    {
      key: 'onboarding',
      name: '📋 Onboarding / Passport',
      status: 'manual/event',
      schedule: 'ตาม week / กดส่งเอง',
      audience: 'สมาชิกใหม่',
      quotaImpact: 'targeted',
      purpose: 'พา member ใหม่เรียนรู้ตาม Passport',
      guard: 'ส่งเฉพาะคนที่ enroll แล้ว',
    },
  ];
}

function memberCommandGuide(): Record<string, unknown>[] {
  return [
    { group: 'Core', command: 'สถานะ', label: '📊 สถานะ', result: 'ดูคะแนนล่าสุด + คำแนะนำขึ้นสี', priority: 1 },
    { group: 'Core', command: 'ประวัติ', label: '📈 ประวัติ', result: 'ดู Traffic Light ย้อนหลัง + 5 Key เทียบเดือนก่อน', priority: 2 },
    { group: 'Core', command: 'ทำอะไร / next', label: '🎯 ทำอะไร', result: 'action ที่ควรทำเร็วที่สุด', priority: 3 },
    { group: 'Support', command: 'ขอความช่วยเหลือ', label: '🆘 ขอความช่วยเหลือ', result: 'เปิด Help Case ให้ทีมดูแล', priority: 4 },
    { group: 'Support', command: 'ปัญหา [รายละเอียด]', label: '⚠️ แจ้งปัญหา', result: 'บันทึกปัญหาแบบมีรายละเอียด', priority: 5 },
    { group: '1-2-1', command: 'แนะนำ', label: '🤝 แนะนำ', result: 'หา match 1-2-1', priority: 6 },
    { group: '1-2-1', command: 'นัด [ชื่อ]', label: '📅 นัด 1-2-1', result: 'บันทึกนัด 1-2-1', priority: 7 },
    { group: '1-2-1', command: 'เจอแล้ว', label: '✅ เจอแล้ว', result: 'ปิดรายการ 1-2-1 ล่าสุด', priority: 8 },
    { group: 'Meeting', command: 'ลา [เหตุผล]', label: '🙋 ลา', result: 'แจ้งลาและเข้าระบบ', priority: 9 },
    { group: 'Meeting', command: 'ส่ง sub [ชื่อ]', label: '👥 ส่ง sub', result: 'แจ้งคนมาแทน', priority: 10 },
    { group: 'Goal', command: 'เป้า', label: '🎯 เป้า', result: 'ดูเป้าสั้นใน LINE', priority: 11 },
    { group: 'Goal', command: 'เป้า ref 8', label: '✍️ ตั้งเป้าสั้น', result: 'ตั้งเป้าแบบเร็ว เช่น Referral / Visitor / 1-2-1', priority: 12 },
    { group: 'Goal', command: 'Blueprint', label: '📋 Blueprint', result: 'เปิดฟอร์ม Member Success Blueprint ประจำปี', priority: 13 },
    { group: 'AI', command: 'ถาม [คำถาม]', label: '🤖 ถาม AI', result: 'ให้ Copilot ช่วยคิดจากบริบทสมาชิก', priority: 14 },
  ];
}

// ─────────────────────────────────────────────────────────────
export async function handleLineAdmin(p: Record<string, unknown>): Promise<Response> {
  const db     = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    // ── SECURE LINK: create one-time member link token (MC only) ─
    case 'createLineLinkToken': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberId = String(p.memberId || '').trim()
        || await findMemberId(db, String(p.memberName || '').trim());
      if (!memberId) return errResponse('memberId หรือ memberName required');

      const { data: member } = await db.from('members')
        .select('id, name, nickname, is_archived')
        .eq('id', memberId)
        .maybeSingle();
      if (!member || (member as Record<string, unknown>).is_archived) {
        return errResponse('ไม่พบสมาชิกที่ใช้งานอยู่');
      }

      const { data: existingLink } = await db.from('line_members')
        .select('line_user_id')
        .eq('member_id', memberId)
        .maybeSingle();
      if (existingLink) return errResponse('สมาชิกคนนี้เชื่อม LINE แล้ว');

      await db.from('line_link_tokens').update({ revoked_at: new Date().toISOString() })
        .eq('member_id', memberId)
        .is('used_at', null)
        .is('revoked_at', null);

      const token = normalizeLinkToken(generateLinkToken(10));
      const expiresInMinutes = Math.min(
        Math.max(Number(p.expiresInMinutes) || 30, 5),
        1440,
      );
      const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000).toISOString();
      const { error } = await db.from('line_link_tokens').insert({
        member_id: memberId,
        token_hash: await sha256Hex(token),
        expires_at: expiresAt,
        created_by_role: auth.role || 'mc',
      });
      if (error) return errResponse(error.message);

      const displayName = String(
        (member as Record<string, unknown>).nickname
        || (member as Record<string, unknown>).name
        || '',
      );
      return jsonResponse({
        ok: true,
        memberId,
        displayName,
        token,
        command: `เชื่อม ${token}`,
        expiresAt,
      });
    }

    case 'revokeLineLinkTokens': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);
      const memberId = String(p.memberId || '').trim()
        || await findMemberId(db, String(p.memberName || '').trim());
      if (!memberId) return errResponse('memberId หรือ memberName required');
      const { error } = await db.from('line_link_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('member_id', memberId)
        .is('used_at', null)
        .is('revoked_at', null);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    // ── UNLINK: remove a member's LINE account binding (MC only) ─
    case 'unlinkLineMember': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberId = String(p.memberId || '').trim()
        || await findMemberId(db, String(p.memberName || '').trim());
      if (!memberId) return errResponse('memberId หรือ memberName required');

      const { data: existing } = await db.from('line_members')
        .select('line_user_id').eq('member_id', memberId).maybeSingle();
      if (!existing) return errResponse('สมาชิกคนนี้ไม่มีการเชื่อม LINE อยู่');

      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        db.from('line_members').delete().eq('member_id', memberId),
        db.from('line_bot_state').delete().eq('line_user_id',
          String((existing as Record<string, unknown>).line_user_id)),
      ]);
      if (e1) return errResponse(e1.message);
      // Revoke any pending tokens too
      await db.from('line_link_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('member_id', memberId)
        .is('used_at', null).is('revoked_at', null);
      return jsonResponse({ ok: true, unlinked: !e2 });
    }

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
      const rows = [{ key: settingKey, value: lineId }];
      if (target.toLowerCase() === 'mc') {
        rows.push(
          { key: 'MC_LINE_ID', value: lineId },
          { key: 'MC_LINE_USER_ID', value: lineId },
        );
      }
      const { error } = await db.from('settings').upsert(
        rows,
        { onConflict: 'key' },
      );
      if (error) return errResponse(error.message);

      const menuRole = 'MEMBER';
      const { data: menuSetting } = await db.from('settings')
        .select('value').eq('key', `LINE_RICH_MENU_${menuRole}`).maybeSingle();
      const richMenuId = String((menuSetting as Record<string, unknown> | null)?.value || '');
      let menuAssigned = false;
      if (richMenuId && LINE_TOKEN) {
        const assignRes = await fetch(
          `https://api.line.me/v2/bot/user/${lineId}/richmenu/${richMenuId}`,
          { method: 'POST', headers: { Authorization: `Bearer ${LINE_TOKEN}` } },
        );
        menuAssigned = assignRes.ok;
      }

      return jsonResponse({ ok: true, menuAssigned, menuRole: menuRole.toLowerCase() });
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
          memberId:     id,
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
        [
          { key: 'MC_LINE_ID', value: lineUserId },
          { key: 'MC_LINE_USER_ID', value: lineUserId },
          { key: 'LINE_ID_MC', value: lineUserId },
        ],
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

    // ── GET: unified LINE member activity timeline ────────────
    case 'getLineActivityTimeline': {
      const auth = await requireAuth(db, p, ['mc', 'growth', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);

      const limit = Math.min(160, Math.max(20, Number(p.limit) || 80));
      const filterType = String(p.type || '').trim();
      const filterTeam = String(p.team || '').trim();
      const allowedTeam = auth.isMC || auth.role === 'growth'
        ? filterTeam
        : String(auth.teamName || '');
      const since = new Date(Date.now() - 45 * 86400000).toISOString();
      const items: Record<string, unknown>[] = [];

      const pushItem = (item: Record<string, unknown>) => {
        const team = String(item.memberTeam || '');
        const type = String(item.type || '');
        if (allowedTeam && team && team !== allowedTeam) return;
        if (filterType && type !== filterType) return;
        const meta = lineActivityTypeMeta(type);
        items.push({ ...meta, ...item });
      };

      const [
        eventsRes,
        absenceRes,
        issuesRes,
        goalsRes,
        oneRes,
        deliveriesRes,
      ] = await Promise.all([
        db.from('line_product_events')
          .select('id, event_name, line_user_id, member_id, role, source, properties, occurred_at, members(name, nickname, mentor_team)')
          .gte('occurred_at', since)
          .order('occurred_at', { ascending: false })
          .limit(limit),
        db.from('line_absence_log')
          .select('id, created_at, week_date, absence_type, sub_name, reason, cancelled_at, members(name, nickname, mentor_team)')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(60),
        db.from('line_issues')
          .select('id, reported_at, resolved_at, issue_text, mentor_response, members(name, nickname, mentor_team)')
          .gte('reported_at', since)
          .order('reported_at', { ascending: false })
          .limit(60),
        db.from('line_goals')
          .select('id, goal_type, target, set_at, members(name, nickname, mentor_team)')
          .gte('set_at', since)
          .order('set_at', { ascending: false })
          .limit(60),
        db.from('one_to_one_logs')
          .select(`
            id, created_at, scheduled_date, met_at, outcome, partner_name,
            initiator:members!one_to_one_logs_initiator_id_fkey(name, nickname, mentor_team),
            partner:members!one_to_one_logs_partner_id_fkey(name, nickname, mentor_team)
          `)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(60),
        db.from('line_message_deliveries')
          .select('id, notification_type, source, status, created_at, sent_at, message_preview, last_error, members(name, nickname, mentor_team)')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(60),
      ]);

      const firstError = eventsRes.error || absenceRes.error || issuesRes.error || goalsRes.error
        || oneRes.error || deliveriesRes.error;
      if (firstError) return errResponse(firstError.message);

      for (const row of (eventsRes.data || []) as Record<string, unknown>[]) {
        const props = (row.properties || {}) as Record<string, unknown>;
        const eventName = String(row.event_name || '');
        const type = eventName === 'line_command_received'
          ? 'command_received'
          : eventName === 'line_command_replied'
          ? 'command_replied'
          : eventName.startsWith('liff_')
          ? 'liff'
          : eventName.includes('copilot')
          ? 'command_replied'
          : 'command_received';
        const member = memberFromJoined(row);
        const text = String(props.textPreview || props.replyPreview || props.commandName || eventName || '');
        pushItem({
          id: `evt:${row.id}`,
          type,
          occurredAt: String(row.occurred_at || ''),
          source: String(row.source || 'line'),
          title: eventName === 'line_command_replied'
            ? `Bot ตอบ: ${props.commandName || 'command'}`
            : `Member พิมพ์: ${props.commandName || props.command || eventName}`,
          detail: text,
          status: eventName === 'line_command_received' && props.isRegistered === false ? 'ยังไม่เชื่อมบัญชี' : 'บันทึกแล้ว',
          rawText: String(props.textPreview || ''),
          ...member,
        });
      }

      for (const row of (absenceRes.data || []) as Record<string, unknown>[]) {
        const member = memberFromJoined(row);
        const isSub = String(row.absence_type || '') === 'ส่ง sub';
        pushItem({
          id: `abs:${row.id}`,
          type: isSub ? 'substitute' : 'absence',
          occurredAt: String(row.created_at || ''),
          source: 'line_absence_log',
          title: isSub ? 'ส่ง Sub' : 'แจ้งลา',
          detail: isSub ? `ผู้มาแทน: ${row.sub_name || '—'}` : String(row.reason || 'ไม่ระบุเหตุผล'),
          status: row.cancelled_at ? 'ยกเลิกแล้ว' : `วันประชุม ${row.week_date || '—'}`,
          ...member,
        });
      }

      for (const row of (issuesRes.data || []) as Record<string, unknown>[]) {
        pushItem({
          id: `issue:${row.id}`,
          type: 'issue',
          occurredAt: String(row.reported_at || ''),
          source: 'line_issues',
          title: 'ขอความช่วยเหลือ',
          detail: String(row.mentor_response || row.issue_text || ''),
          status: row.resolved_at ? 'เสร็จสิ้น' : 'รอ Mentor/MC',
          ...memberFromJoined(row),
        });
      }

      for (const row of (goalsRes.data || []) as Record<string, unknown>[]) {
        pushItem({
          id: `goal:${row.id}`,
          type: 'goal',
          occurredAt: String(row.set_at || ''),
          source: 'line_goals',
          title: `ตั้งเป้า ${row.goal_type || ''}`,
          detail: `target ${row.target || '—'}`,
          status: 'บันทึกแล้ว',
          ...memberFromJoined(row),
        });
      }

      for (const row of (oneRes.data || []) as Record<string, unknown>[]) {
        const member = memberFromJoined(row, 'initiator');
        const partner = (row.partner || {}) as Record<string, unknown>;
        pushItem({
          id: `121:${row.id}`,
          type: 'one_to_one',
          occurredAt: String(row.created_at || ''),
          source: 'one_to_one_logs',
          title: `นัด 1-2-1 กับ ${partner.nickname || row.partner_name || partner.name || '—'}`,
          detail: row.outcome ? String(row.outcome) : `วันที่นัด ${row.scheduled_date || 'วันนี้'}`,
          status: row.met_at ? 'เจอแล้ว' : 'รอยืนยัน',
          ...member,
        });
      }

      for (const row of (deliveriesRes.data || []) as Record<string, unknown>[]) {
        pushItem({
          id: `delivery:${row.id}`,
          type: 'delivery',
          occurredAt: String(row.created_at || ''),
          source: String(row.source || 'line_message_deliveries'),
          title: `ส่งข้อความ: ${row.notification_type || 'line'}`,
          detail: String(row.message_preview || row.last_error || ''),
          status: String(row.status || ''),
          ...memberFromJoined(row),
        });
      }

      items.sort((a, b) =>
        new Date(String(b.occurredAt || '')).getTime() - new Date(String(a.occurredAt || '')).getTime()
      );

      const sliced = items.slice(0, limit);
      const summary = sliced.reduce((acc: Record<string, number>, item) => {
        const type = String(item.type || 'other');
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});
      return jsonResponse({ ok: true, items: sliced, summary, teamScope: allowedTeam || 'chapter' });
    }

    // ── GET: absence log (last 50) ────────────────────────────
    case 'getAbsenceLog': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
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
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
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
      const auth = await requireAuth(db, p, ['mc', 'growth', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);

      const { data, error } = await db
        .from('line_issues')
        .select('id, reported_at, resolved_at, issue_text, mentor_response, members(id, name, nickname, mentor_team)')
        .order('reported_at', { ascending: false })
        .limit(30);
      if (error) return errResponse(error.message);

      const visibleRows = ((data || []) as Record<string, unknown>[]).filter(row => {
        const m = (row.members || {}) as Record<string, unknown>;
        return canManageTeamIssue(auth, String(m.mentor_team || ''));
      });

      const list = visibleRows.map(row => {
        const m = (row.members || {}) as Record<string, unknown>;
        const isOpen = row.resolved_at == null;
        return {
          id:     String(row.id || ''),
          name:   String(m.name || ''),
          nick:   String(m.nickname || ''),
          team:   String(m.mentor_team || ''),
          status: isOpen ? 'รอดำเนินการ' : 'เสร็จสิ้น',
          detail: String(row.issue_text || ''),
          response: String(row.mentor_response || ''),
          memberId: String(m.id || ''),
          date:   String(row.reported_at || '').slice(0, 10),
          resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
        };
      });

      return jsonResponse({ ok: true, list });
    }

    case 'replyLineIssue': {
      const auth = await requireAuth(db, p, ['mc', 'growth', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);

      const issueId = String(p.issueId || '').trim();
      const responseText = String(p.response || p.message || '').trim();
      const closeIssue = Boolean(p.closeIssue);
      if (!issueId) return errResponse('issueId required');
      if (!responseText) return errResponse('response required');

      const { data: issue, error: issueErr } = await db
        .from('line_issues')
        .select('id, member_id, issue_text, members(name, nickname, mentor_team)')
        .eq('id', issueId)
        .maybeSingle();
      if (issueErr) return errResponse(issueErr.message);
      if (!issue) return errResponse('ไม่พบ issue นี้');

      const member = ((issue as Record<string, unknown>).members || {}) as Record<string, unknown>;
      const team = String(member.mentor_team || '');
      if (!canManageTeamIssue(auth, team)) return errResponse('ไม่มีสิทธิ์ตอบ issue ของทีมนี้');

      const memberId = String((issue as Record<string, unknown>).member_id || '');
      const memberName = String(member.name || '');
      const nick = String(member.nickname || member.name || 'สมาชิก');
      const { data: lineRow } = await db
        .from('line_members')
        .select('line_user_id')
        .eq('member_id', memberId)
        .maybeSingle();
      const lineUserId = String((lineRow as Record<string, unknown> | null)?.line_user_id || '');
      if (!lineUserId) return jsonResponse({ ok: false, error: `${memberName || nick} ยังไม่ได้เชื่อม LINE` });

      const actor = auth.displayName || auth.role || 'Mentor Team';
      const message = `💬 Mentor Team ตอบกลับคุณ${nick}\n\n${responseText}\n\nถ้ายังอยากให้ช่วยต่อ พิมพ์ “ปัญหา” ตามด้วยรายละเอียดเพิ่มเติมได้เลยครับ`;
      const sent = await sendLineMsg(lineUserId, message, {
        db,
        memberId,
        notificationType: 'issue_response',
        idempotencyKey: `line-issue:${issueId}:reply:${await sha256Hex(`${responseText}:${closeIssue}`)}`,
        source: 'api/line-admin',
      });
      if (!sent) return errResponse('ส่ง LINE ไม่สำเร็จ');

      const patch: Record<string, unknown> = {
        mentor_response: responseText,
      };
      if (closeIssue) patch.resolved_at = new Date().toISOString();
      const { error: updateErr } = await db.from('line_issues').update(patch).eq('id', issueId);
      if (updateErr) return errResponse(updateErr.message);

      await trackLineEvent(db, closeIssue ? 'line_issue_replied_and_closed' : 'line_issue_replied', {
        memberId,
        role: auth.role || null,
        source: 'api/line-admin',
        properties: {
          issueId,
          actor,
          responsePreview: responseText.slice(0, 240),
        },
      });

      return jsonResponse({ ok: true, sent: true, closed: closeIssue });
    }

    case 'updateLineIssueStatus': {
      const auth = await requireAuth(db, p, ['mc', 'growth', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);

      const issueId = String(p.issueId || '').trim();
      const status = String(p.status || '').trim();
      if (!issueId) return errResponse('issueId required');
      if (!['open', 'closed'].includes(status)) return errResponse('status must be open or closed');

      const { data: issue, error: issueErr } = await db
        .from('line_issues')
        .select('id, member_id, members(mentor_team)')
        .eq('id', issueId)
        .maybeSingle();
      if (issueErr) return errResponse(issueErr.message);
      if (!issue) return errResponse('ไม่พบ issue นี้');
      const member = ((issue as Record<string, unknown>).members || {}) as Record<string, unknown>;
      const team = String(member.mentor_team || '');
      if (!canManageTeamIssue(auth, team)) return errResponse('ไม่มีสิทธิ์แก้ issue ของทีมนี้');

      const { error } = await db.from('line_issues')
        .update({ resolved_at: status === 'closed' ? new Date().toISOString() : null })
        .eq('id', issueId);
      if (error) return errResponse(error.message);

      await trackLineEvent(db, status === 'closed' ? 'line_issue_closed' : 'line_issue_reopened', {
        memberId: String((issue as Record<string, unknown>).member_id || ''),
        role: auth.role || null,
        source: 'api/line-admin',
        properties: { issueId },
      });
      return jsonResponse({ ok: true, status });
    }

    // ── ENROLL: mark member as enrolled in onboarding ─────────
    case 'enrollOnboarding': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
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
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
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
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
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
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);

      const nick = String(p.nick || p.nickname || 'สมาชิก').trim() || 'สมาชิก';
      const requestedWeek = Number(p.weekNum || p.week || 0);
      const { data: rows, error } = await db
        .from('onboarding_messages')
        .select('week_number, message_text')
        .order('week_number', { ascending: true });
      if (error) return errResponse(error.message);

      const weeks: Record<number, string> = {};
      for (const row of (rows || []) as Record<string, unknown>[]) {
        const wk = Number(row.week_number) || 0;
        if (wk > 0) weeks[wk] = String(row.message_text || '').replace(/\{nick\}/g, nick);
      }
      for (let w = 1; w <= 8; w++) {
        if (!weeks[w]) weeks[w] = `[Week ${w} — ยังไม่มีข้อความ]`.replace(/\{nick\}/g, nick);
      }

      if (requestedWeek > 0) {
        return jsonResponse({ ok: true, weekNum: requestedWeek, preview: weeks[requestedWeek] || `[Week ${requestedWeek} — ยังไม่มีข้อความ]`, weeks });
      }
      return jsonResponse({ ok: true, weeks });
    }

    // ── SAVE: upsert an onboarding message template (MC only) ─
    case 'saveOnboardingMessage': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const weekNum     = Number(p.weekNum || p.week);
      const messageText = String(p.messageText || p.message || '').trim();
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
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || '').trim();
      const weekNum    = Number(p.weekNum || p.week);
      if (!memberName || !weekNum) return errResponse('memberName and weekNum required');

      const memberId = await findMemberId(db, memberName);
      // Auto-enroll if not already enrolled (mentor convenience)
      if (memberId) {
        await db.from('onboarding_schedule').upsert(
          { member_id: memberId, enrolled_at: new Date().toISOString(), removed_at: null },
          { onConflict: 'member_id' },
        );
      }
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

      return jsonResponse({ ok: true, sent, message: sent ? `ส่ง Week ${weekNum} แล้ว` : `บันทึก Week ${weekNum} แล้ว แต่สมาชิกยังไม่ได้ผูก LINE` });
    }

    // ── MENTOR BROADCAST: mentor sends to own team members ────
    case 'mentorBroadcast': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
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

    // ── SETUP ROLE-BASED RICH MENUS ───────────────────────────
    case 'setupRichMenu': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);
      if (!LINE_TOKEN) return errResponse('LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า');

      const appUrl = String(
        p.appUrl || Deno.env.get('PUBLIC_APP_URL') || 'https://bni-mentor-system.vercel.app',
      ).replace(/\/$/, '');
      const liffUrl = String(
        p.liffUrl || Deno.env.get('LINE_LIFF_URL') || `${appUrl}/liff/`,
      ).replace(/\/$/, '');
      const requestedRole = String(p.menuRole || p.targetRole || 'all').toLowerCase();
      const roles: RichMenuRole[] = requestedRole === 'all'
        ? ['member', 'mentor', 'mc', 'growth']
        : ['member', 'mentor', 'mc', 'growth'].includes(requestedRole)
        ? [requestedRole as RichMenuRole]
        : [];
      if (!roles.length) return errResponse('menuRole ต้องเป็น member, mentor, mc, growth หรือ all');

      const results: Record<string, unknown>[] = [];
      for (const role of roles) {
        const definition = buildRichMenu(role, liffUrl, appUrl);
        const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${LINE_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(definition),
        });
        const createBody = await createRes.text();
        if (!createRes.ok) {
          results.push({ role, ok: false, error: `create ${createRes.status}: ${createBody}` });
          continue;
        }
        const richMenuId = String((JSON.parse(createBody) as Record<string, unknown>).richMenuId || '');
        const assetRole = 'member';
        const imageUrl = `${appUrl}/assets/line/rich-menu-${assetRole}-v4.jpg`;
        const imageRes = await fetch(imageUrl);
        if (!imageRes.ok) {
          results.push({ role, ok: false, richMenuId, error: `image ${imageRes.status}: ${imageUrl}` });
          continue;
        }
        const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${LINE_TOKEN}`,
            'Content-Type': 'image/jpeg',
          },
          body: await imageRes.arrayBuffer(),
        });
        if (!uploadRes.ok) {
          results.push({
            role,
            ok: false,
            richMenuId,
            error: `upload ${uploadRes.status}: ${(await uploadRes.text()).slice(0, 500)}`,
          });
          continue;
        }

        await db.from('settings').upsert(
          { key: `LINE_RICH_MENU_${role.toUpperCase()}`, value: richMenuId },
          { onConflict: 'key' },
        );
        if (role === 'member') {
          const defaultRes = await fetch(
            `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`,
            { method: 'POST', headers: { Authorization: `Bearer ${LINE_TOKEN}` } },
          );
          if (!defaultRes.ok) {
            results.push({
              role, ok: false, richMenuId,
              error: `default ${defaultRes.status}: ${(await defaultRes.text()).slice(0, 500)}`,
            });
            continue;
          }
        }
        results.push({ role, ok: true, richMenuId, imageUrl });
      }

      return jsonResponse({
        ok: results.every((result) => result.ok === true),
        appUrl,
        liffUrl,
        results,
      });
    }

    case 'assignRichMenu': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);
      if (!LINE_TOKEN) return errResponse('LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า');
      const lineUserId = String(p.lineUserId || '').trim();
      const menuRole = String(p.menuRole || 'member').toUpperCase();
      if (!lineUserId) return errResponse('lineUserId required');
      const { data: setting } = await db.from('settings')
        .select('value').eq('key', `LINE_RICH_MENU_${menuRole}`).maybeSingle();
      const richMenuId = String((setting as Record<string, unknown> | null)?.value || '');
      if (!richMenuId) return errResponse(`ยังไม่มี Rich Menu สำหรับ ${menuRole}`);
      const response = await fetch(
        `https://api.line.me/v2/bot/user/${lineUserId}/richmenu/${richMenuId}`,
        { method: 'POST', headers: { Authorization: `Bearer ${LINE_TOKEN}` } },
      );
      if (!response.ok) return errResponse(`LINE API ${response.status}: ${await response.text()}`);
      return jsonResponse({ ok: true, lineUserId, menuRole, richMenuId });
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
          const nudge = `📋 BNI IDEAL — เตรียมประชุมวันศุกร์\n\nพรุ่งนี้วันศุกร์เจอกันที่ประชุมครับ 🎯\nอย่าลืมเตรียม:\n• Referral ให้ทีม\n• ตรวจสอบ 1-2-1 ของลูกทีม\n• CEU และ Visitor ครบหรือยัง?\n\nพิมพ์ "สถานะ" เพื่อดูคะแนนล่าสุด`;
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
      const msg = `📋 BNI IDEAL — พรุ่งนี้วันศุกร์มีประชุม!\n\nเช็คลิสต์เตรียมตัววันนี้:\n✅ Referral ที่จะส่งพรุ่งนี้\n✅ Visitor ที่จะพามายืนยันแล้วหรือยัง\n✅ 1-2-1 ที่อยากนัดหลังประชุม\n\nเจอกันพรุ่งนี้เช้าครับ 💪`;
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

    // ── TRIGGER: Friday Prep Prompt — Thursday 2PM Bangkok ──
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
      const msg = `✅ BNI IDEAL — เตรียมประชุมวันศุกร์\n\nก่อนเจอกันพรุ่งนี้ อย่าลืม:\n📝 เตรียม Referral ที่จะส่งให้ชัด\n🤝 เลือกคนที่อยากนัด 1-2-1 หลังประชุม\n👥 ยืนยัน Visitor / Sub ถ้ามี\n\nพิมพ์ "สถานะ" เพื่อดูคะแนนล่าสุด`;
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

    // ── LINE HEALTH CENTER ─────────────────────────────────────
    case 'getLineHealth': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const stalePendingCutoff = new Date(Date.now() - 5 * 60_000).toISOString();
      const quota = await getLineQuotaSnapshot();
      const quotaGuard = lineQuotaMode(quota);

      const [
        botInfoRes,
        activeMembersRes,
        linkedRes,
        failedDeliveriesRes,
        pendingDeliveriesRes,
        lastDeliveryRes,
        openIssuesRes,
        staleIssuesRes,
        latestWebhookRes,
        failedWebhookRes,
        richMenuRes,
      ] = await Promise.all([
        LINE_TOKEN
          ? fetch('https://api.line.me/v2/bot/info', {
            headers: { Authorization: `Bearer ${LINE_TOKEN}` },
          }).catch((error) => ({ ok: false, status: 0, text: async () => String(error) } as Response))
          : Promise.resolve(null),
        db.from('members').select('*', { count: 'exact', head: true }).eq('is_archived', false),
        db.from('line_members').select('*', { count: 'exact', head: true }),
        db.from('line_message_deliveries').select('*', { count: 'exact', head: true })
          .eq('status', 'failed').gte('created_at', since24h),
        db.from('line_message_deliveries').select('*', { count: 'exact', head: true })
          .eq('status', 'pending').lt('updated_at', stalePendingCutoff),
        db.from('line_message_deliveries').select('created_at, status, notification_type, source')
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        db.from('line_issues').select('*', { count: 'exact', head: true }).is('resolved_at', null),
        db.from('line_issues').select('*', { count: 'exact', head: true })
          .is('resolved_at', null).lt('reported_at', since24h),
        db.from('line_webhook_events').select('created_at, status, event_type, source_user_id')
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        db.from('line_webhook_events').select('*', { count: 'exact', head: true })
          .eq('status', 'failed').gte('created_at', since24h),
        db.from('settings').select('key, value').like('key', 'LINE_RICH_MENU_%'),
      ]);

      const botOk = Boolean(LINE_TOKEN && botInfoRes && 'ok' in botInfoRes && botInfoRes.ok);
      const activeMembers = activeMembersRes.count || 0;
      const linkedMembers = linkedRes.count || 0;
      const richMenus = ((richMenuRes.data || []) as Record<string, unknown>[])
        .filter(row => String(row.value || '').trim()).length;
      const healthItems = [
        {
          key: 'token',
          label: 'LINE Token',
          ok: Boolean(LINE_TOKEN),
          severity: LINE_TOKEN ? 'ok' : 'danger',
          detail: LINE_TOKEN ? 'ตั้งค่าแล้ว' : 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN',
        },
        {
          key: 'bot',
          label: 'Bot Info',
          ok: botOk,
          severity: botOk ? 'ok' : 'warning',
          detail: botOk ? 'LINE API ตอบกลับปกติ' : 'ยังตรวจ Bot Info ไม่ผ่าน',
        },
        {
          key: 'webhook',
          label: 'Webhook',
          ok: !latestWebhookRes.error && Boolean(latestWebhookRes.data),
          severity: failedWebhookRes.count ? 'danger' : latestWebhookRes.data ? 'ok' : 'warning',
          detail: latestWebhookRes.error
            ? `ยังอ่าน webhook log ไม่ได้: ${latestWebhookRes.error.message}`
            : latestWebhookRes.data
            ? `ล่าสุด ${String((latestWebhookRes.data as Record<string, unknown>).created_at || '')}`
            : 'ยังไม่พบ webhook event',
        },
        {
          key: 'linking',
          label: 'Account Linking',
          ok: linkedMembers > 0,
          severity: linkedMembers > 0 ? 'ok' : 'warning',
          detail: `${linkedMembers}/${activeMembers} คนผูก LINE แล้ว`,
        },
        {
          key: 'delivery',
          label: 'Delivery',
          ok: (failedDeliveriesRes.count || 0) === 0 && (pendingDeliveriesRes.count || 0) === 0,
          severity: (failedDeliveriesRes.count || 0) > 0 ? 'danger' : (pendingDeliveriesRes.count || 0) > 0 ? 'warning' : 'ok',
          detail: `24 ชม. failed ${failedDeliveriesRes.count || 0}, pending stale ${pendingDeliveriesRes.count || 0}`,
        },
        {
          key: 'issues',
          label: 'Help Cases',
          ok: (staleIssuesRes.count || 0) === 0,
          severity: (staleIssuesRes.count || 0) > 0 ? 'warning' : 'ok',
          detail: `open ${openIssuesRes.count || 0}, เกิน 24 ชม. ${staleIssuesRes.count || 0}`,
        },
        {
          key: 'rich_menu',
          label: 'Rich Menu',
          ok: richMenus >= 1,
          severity: richMenus >= 1 ? 'ok' : 'warning',
          detail: `พบ ${richMenus} menu setting`,
        },
        {
          key: 'quota',
          label: 'Quota Guard',
          ok: quotaGuard.mode !== 'critical' && quotaGuard.mode !== 'unknown',
          severity: quotaGuard.mode === 'critical' ? 'danger' : quotaGuard.mode === 'save' || quotaGuard.mode === 'unknown' ? 'warning' : 'ok',
          detail: `${quotaGuard.label}: ${quotaGuard.advice}`,
        },
      ];
      return jsonResponse({
        ok: true,
        summary: {
          healthy: healthItems.filter(item => item.severity === 'ok').length,
          warning: healthItems.filter(item => item.severity === 'warning').length,
          danger: healthItems.filter(item => item.severity === 'danger').length,
          activeMembers,
          linkedMembers,
          unlinkedMembers: Math.max(0, activeMembers - linkedMembers),
        },
        quota,
        quotaGuard,
        lastDelivery: lastDeliveryRes.data || null,
        items: healthItems,
      });
    }

    case 'testLineCommand': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const text = String(p.text || 'สถานะ').trim();
      const lineUserId = String(p.lineUserId || '').trim();
      const memberName = String(p.memberName || '').trim();
      let testUserId = lineUserId;
      if (!testUserId && memberName) testUserId = await findLineUserId(db, memberName) || '';
      if (!testUserId) {
        const { data: first } = await db.from('line_members')
          .select('line_user_id')
          .order('registered_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        testUserId = String((first as Record<string, unknown> | null)?.line_user_id || '');
      }
      if (!testUserId) return errResponse('ยังไม่มีสมาชิกที่ผูก LINE สำหรับทดสอบ');

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      if (!supabaseUrl || !serviceKey) return errResponse('SUPABASE_URL หรือ SERVICE_ROLE_KEY ไม่พร้อมสำหรับ self-test');

      const response = await fetch(`${supabaseUrl}/functions/v1/line-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BNI-Sim': serviceKey,
        },
        body: JSON.stringify({ text, userId: testUserId }),
      });
      const body = await response.text();
      if (!response.ok) return errResponse(`Webhook self-test failed ${response.status}: ${body.slice(0, 500)}`);
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(body) as Record<string, unknown>; } catch (_) { parsed = { raw: body }; }
      return jsonResponse({ ok: true, text, lineUserId: testUserId, result: parsed });
    }

    case 'getLineCommandGuide': {
      const auth = await requireAuth(db, p, ['mc', 'growth', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);
      return jsonResponse({ ok: true, commands: memberCommandGuide() });
    }

    case 'getUnifiedFollowUpInbox': {
      const auth = await requireAuth(db, p, ['mc', 'growth', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);
      try {
        const inbox = await buildUnifiedFollowUpInbox(db, auth);
        return jsonResponse({ ok: true, inbox });
      } catch (error) {
        return errResponse(error instanceof Error ? error.message : String(error));
      }
    }

    case 'getLineAutomationLibrary': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);
      const quota = await getLineQuotaSnapshot();
      return jsonResponse({
        ok: true,
        quota,
        quotaGuard: lineQuotaMode(quota),
        rows: lineAutomationLibrary(),
      });
    }

    case 'getLineMemberJourney': {
      const auth = await requireAuth(db, p, ['mc', 'growth', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);

      const days = Math.min(90, Math.max(7, Number(p.days) || 30));
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const allowedTeam = auth.isMC || auth.role === 'growth'
        ? String(p.team || '').trim()
        : String(auth.teamName || '');

      const [membersRes, eventsRes, issuesRes, deliveriesRes] = await Promise.all([
        db.from('v_member_dashboard')
          .select('id, name, nickname, mentor_team, display_score, traffic_light, open_core_issue, days_to_expiry')
          .eq('is_archived', false),
        db.from('line_product_events')
          .select('member_id, event_name, properties, occurred_at')
          .gte('occurred_at', since)
          .limit(2000),
        db.from('line_issues')
          .select('member_id, resolved_at, reported_at')
          .gte('reported_at', since),
        db.from('line_message_deliveries')
          .select('member_id, status, created_at')
          .gte('created_at', since)
          .limit(2000),
      ]);
      const firstError = membersRes.error || eventsRes.error || issuesRes.error || deliveriesRes.error;
      if (firstError) return errResponse(firstError.message);

      const eventsByMember: Record<string, Record<string, number>> = {};
      for (const row of ((eventsRes.data || []) as Record<string, unknown>[])) {
        const memberId = String(row.member_id || '');
        if (!memberId) continue;
        const eventName = String(row.event_name || '');
        const props = (row.properties || {}) as Record<string, unknown>;
        const commandName = String(props.commandName || props.command || '');
        eventsByMember[memberId] ||= {};
        eventsByMember[memberId].total = (eventsByMember[memberId].total || 0) + 1;
        if (commandName) eventsByMember[memberId][`cmd:${commandName}`] = (eventsByMember[memberId][`cmd:${commandName}`] || 0) + 1;
        eventsByMember[memberId][eventName] = (eventsByMember[memberId][eventName] || 0) + 1;
      }

      const issuesByMember: Record<string, { open: number; total: number }> = {};
      for (const row of ((issuesRes.data || []) as Record<string, unknown>[])) {
        const memberId = String(row.member_id || '');
        if (!memberId) continue;
        issuesByMember[memberId] ||= { open: 0, total: 0 };
        issuesByMember[memberId].total += 1;
        if (!row.resolved_at) issuesByMember[memberId].open += 1;
      }

      const deliveryByMember: Record<string, { sent: number; failed: number }> = {};
      for (const row of ((deliveriesRes.data || []) as Record<string, unknown>[])) {
        const memberId = String(row.member_id || '');
        if (!memberId) continue;
        deliveryByMember[memberId] ||= { sent: 0, failed: 0 };
        if (row.status === 'failed') deliveryByMember[memberId].failed += 1;
        if (row.status === 'sent') deliveryByMember[memberId].sent += 1;
      }

      const rows = ((membersRes.data || []) as Record<string, unknown>[])
        .filter(m => !allowedTeam || String(m.mentor_team || '') === allowedTeam)
        .map((m) => {
          const id = String(m.id || '');
          const ev = eventsByMember[id] || {};
          const iss = issuesByMember[id] || { open: 0, total: 0 };
          const del = deliveryByMember[id] || { sent: 0, failed: 0 };
          const commandCount = Number(ev.total || 0);
          const hasStatus = Boolean(ev['cmd:status']);
          const hasHistory = Boolean(ev['cmd:history']);
          const hasAction = Boolean(ev['cmd:action-plan']);
          const hasSupport = Boolean(ev['cmd:issues'] || ev['cmd:report-issue']);
          const has121 = Boolean(ev['cmd:tracking'] || ev['cmd:match'] || ev['cmd:schedule'] || ev['cmd:met']);
          const journeyScore = Math.max(0, Math.min(100,
            Math.round(
              Math.min(30, commandCount * 4)
              + (hasStatus ? 15 : 0)
              + (hasHistory ? 15 : 0)
              + (hasAction ? 15 : 0)
              + (has121 ? 10 : 0)
              + (hasSupport ? 5 : 0)
              + (del.failed ? -10 : 0)
              + (iss.open ? -10 : 0),
            ),
          ));
          const nextBestAction = !hasStatus
            ? 'ชวนกด/พิมพ์ “สถานะ”'
            : !hasHistory
            ? 'ชวนดู “ประวัติ”'
            : !hasAction
            ? 'ชวนพิมพ์ “ทำอะไร”'
            : iss.open
            ? 'ตอบ Help Case ให้จบ'
            : has121
            ? 'รักษา engagement'
            : 'ชวนใช้ 1-2-1 command';
          return {
            memberId: id,
            name: String(m.name || ''),
            nick: String(m.nickname || m.name || ''),
            team: String(m.mentor_team || ''),
            score: Number(m.display_score || 0),
            traffic: String(m.traffic_light || 'none'),
            commandCount,
            journeyScore,
            hasStatus,
            hasHistory,
            hasAction,
            has121,
            openIssues: iss.open,
            failedDeliveries: del.failed,
            nextBestAction,
          };
        })
        .sort((a, b) => a.journeyScore - b.journeyScore || a.score - b.score)
        .slice(0, 80);

      return jsonResponse({
        ok: true,
        days,
        teamScope: allowedTeam || 'chapter',
        rows,
        summary: {
          total: rows.length,
          quiet: rows.filter(r => r.commandCount === 0).length,
          needsHelp: rows.filter(r => r.openIssues > 0 || r.failedDeliveries > 0).length,
          averageJourney: rows.length
            ? Math.round(rows.reduce((sum, r) => sum + r.journeyScore, 0) / rows.length)
            : 0,
        },
      });
    }

    // ── LINE DELIVERY LOG ─────────────────────────────────────
    case 'getLineDeliveryLog': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);
      const pageSize = Math.min(100, Number(p.limit) || 50);
      const offset   = Number(p.offset) || 0;
      const filterStatus = p.status ? String(p.status) : null;
      const filterType   = p.notifType ? String(p.notifType) : null;
      const filterSource = p.source ? String(p.source) : null;

      let q = db
        .from('line_message_deliveries')
        .select(`
          id, channel, recipient_id, member_id, notification_type, source,
          status, created_at, sent_at, message_preview, last_error,
          members ( nickname, name, mentor_team )
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (filterStatus) q = q.eq('status', filterStatus);
      if (filterType)   q = q.eq('notification_type', filterType);
      if (filterSource) q = q.eq('source', filterSource);

      const { data, error, count } = await q;
      if (error) return errResponse(error.message);

      const rows = ((data || []) as Record<string, unknown>[]).map(r => {
        const m = (r.members || {}) as Record<string, unknown>;
        return {
          id:               String(r.id || ''),
          channel:          String(r.channel || ''),
          notifType:        String(r.notification_type || ''),
          source:           String(r.source || ''),
          status:           String(r.status || ''),
          createdAt:        String(r.created_at || ''),
          sentAt:           r.sent_at ? String(r.sent_at) : null,
          preview:          r.message_preview ? String(r.message_preview) : null,
          lastError:        r.last_error ? String(r.last_error).slice(0, 200) : null,
          memberNick:       String(m.nickname || m.name || ''),
          memberName:       String(m.name || ''),
          memberTeam:       String(m.mentor_team || ''),
        };
      });
      return jsonResponse({ ok: true, rows, total: count || 0, offset, pageSize });
    }

    // ── LINE OA MESSAGE QUOTA ─────────────────────────────────
    case 'getLineQuota': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);
      if (!LINE_TOKEN) return errResponse('LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า');
      const [quotaRes, usageRes] = await Promise.all([
        fetch('https://api.line.me/v2/bot/message/quota', {
          headers: { Authorization: `Bearer ${LINE_TOKEN}` },
        }),
        fetch('https://api.line.me/v2/bot/message/quota/consumption', {
          headers: { Authorization: `Bearer ${LINE_TOKEN}` },
        }),
      ]);
      if (!quotaRes.ok || !usageRes.ok) {
        return errResponse(`LINE quota API error: ${quotaRes.status} / ${usageRes.status}`);
      }
      const quota = await quotaRes.json() as Record<string, unknown>;
      const usage = await usageRes.json() as Record<string, unknown>;
      const type = String(quota.type || 'unknown');
      const isUnlimited = type === 'unlimited';
      const limit = isUnlimited ? null : Number(quota.value) || 0;
      const used  = Number(usage.totalUsage) || 0;
      return jsonResponse({
        ok: true,
        type,
        unlimited: isUnlimited,
        limit,
        used,
        remaining: isUnlimited ? null : Math.max(0, Number(limit) - used),
        pct: !isUnlimited && Number(limit) > 0 ? Math.round(used / Number(limit) * 100) : 0,
      });
    }

    // ── Default stub ──────────────────────────────────────────
    default:
      return errResponse(`unknown action: ${p.action}`);
  }
}

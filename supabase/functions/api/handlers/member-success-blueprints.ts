// Handler: Member Success Blueprint (MSB) MVP v1.0
// Isolated annual business planning module. Does not duplicate member-owned
// profile/team/performance data; dashboard rows join from existing members.
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';
import { sha256Hex } from '../../_shared/line.ts';

type Db = ReturnType<typeof getServiceClient>;

const DASHBOARD_ROLES = ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp', 'growth'];
const LINK_MANAGER_ROLES = ['mc', 'growth'];
const MSB_FORM_URL = (Deno.env.get('MSB_FORM_URL') || 'https://bni-mentor-system.vercel.app/member-success-blueprint').replace(/\/$/, '');

function num(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/[,฿\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function txt(value: unknown): string {
  return String(value ?? '').trim();
}

function arr(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(v => txt(v)).filter(Boolean);
}

function ceilSafe(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0;
}

function calculate(input: Record<string, unknown>) {
  const totalSales = num(input.total_sales_target_year);
  const bniSales = num(input.expected_sales_from_bni_year);
  const avgCustomer = num(input.average_customer_value_year);
  const conversion = num(input.conversion_rate_percent);
  const customerNeeded = ceilSafe(bniSales / avgCustomer);
  const referralNeeded = conversion > 0 ? ceilSafe(customerNeeded / (conversion / 100)) : 0;
  return {
    bni_contribution_percent: totalSales > 0 ? (bniSales / totalSales) * 100 : 0,
    customer_needed: customerNeeded,
    referral_needed: referralNeeded,
    referral_per_month: referralNeeded / 12,
    referral_per_week: referralNeeded / 52,
    calculated_at: new Date().toISOString(),
  };
}

function validate(input: Record<string, unknown>): string | null {
  if (num(input.total_sales_target_year) <= 0) return 'กรุณาระบุเป้ายอดขายรวมทั้งปี';
  if (num(input.expected_sales_from_bni_year) <= 0) return 'กรุณาระบุยอดขายที่คาดหวังจาก BNI';
  if (num(input.expected_sales_from_bni_year) > num(input.total_sales_target_year)) {
    return 'ยอดขายที่คาดหวังจาก BNI ไม่ควรมากกว่าเป้ายอดขายรวมทั้งปี';
  }
  if (num(input.average_customer_value_year) <= 0) return 'กรุณาระบุมูลค่าลูกค้าเฉลี่ยต่อปี';
  const conversion = num(input.conversion_rate_percent);
  if (conversion <= 0 || conversion > 100) return 'Conversion rate ต้องมากกว่า 0 และไม่เกิน 100';
  if (arr(input.looking_for_categories).length === 0) return 'กรุณาเลือกกลุ่มคนที่กำลังมองหา';
  if (!txt(input.looking_for_detail)) return 'กรุณาระบุรายละเอียดคนที่กำลังมองหา';
  if (arr(input.power_team_categories).length === 0) return 'กรุณาเลือกหมวด Power Team';
  if (!txt(input.power_team_detail)) return 'กรุณาระบุรายละเอียด Power Team';
  if (!txt(input.personal_goal_category)) return 'กรุณาเลือก Personal Goal';
  return null;
}

function buildWarnings(row: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  const calc = calculate(row);
  if (calc.referral_needed > 100) warnings.push('เป้านี้อาจต้องใช้ Referral มากกว่า 100 ใบ/ปี');
  if (num(row.conversion_rate_percent) < 10) warnings.push('Conversion rate ต่ำกว่า 10% ควรเพิ่มคุณภาพ Referral หรือระบบ Follow-up');
  if (calc.bni_contribution_percent > 50) warnings.push('สัดส่วนยอดขายจาก BNI สูงกว่า 50% ควรบริหารความเสี่ยงช่องทางรายได้');
  const existingNew = num(row.existing_customer_revenue_from_bni) + num(row.new_customer_revenue_from_bni);
  const expected = num(row.expected_sales_from_bni_year);
  if (existingNew > 0 && expected > 0 && Math.abs(existingNew - expected) / expected > 0.1) {
    warnings.push('ยอด Existing + New ยังไม่ใกล้เคียงยอดขายที่คาดหวังจาก BNI');
  }
  return warnings;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function newAccessToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function defaultExpiresAt(year: number): string {
  return new Date(`${year}-12-31T23:59:59+07:00`).toISOString();
}

function msbLink(token: string): string {
  return `${MSB_FORM_URL}?t=${encodeURIComponent(token)}`;
}

async function resolveLineMember(db: Db, accessToken: string): Promise<{
  memberId?: string;
  member?: Record<string, unknown>;
  blueprintYear?: number;
  error?: string;
}> {
  if (!accessToken) return { error: 'LINE access token required' };
  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) return { error: 'LINE session ไม่ถูกต้องหรือหมดอายุ' };
  const profile = await profileRes.json() as Record<string, unknown>;
  const userId = String(profile.userId || '');
  if (!userId) return { error: 'ไม่พบ LINE userId' };
  const { data, error } = await db.from('line_members')
    .select('member_id, members(id, name, nickname, mentor_team, email, bni_goal)')
    .eq('line_user_id', userId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'บัญชี LINE นี้ยังไม่ได้เชื่อมกับสมาชิก' };
  const rec = data as Record<string, unknown>;
  return {
    memberId: String(rec.member_id || ''),
    member: (rec.members || {}) as Record<string, unknown>,
  };
}

async function resolveBlueprintToken(db: Db, token: string): Promise<{
  memberId?: string;
  member?: Record<string, unknown>;
  blueprintYear?: number;
  error?: string;
}> {
  const raw = txt(token);
  if (!raw) return { error: 'Blueprint token required' };
  const tokenHash = await sha256Hex(raw);
  const { data, error } = await db.from('member_success_blueprint_tokens')
    .select('id, member_id, expires_at, revoked_at, members(id, name, nickname, mentor_team, email, bni_goal)')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'ลิงก์นี้ไม่ถูกต้องหรือหมดอายุ' };
  const rec = data as Record<string, unknown>;
  if (rec.revoked_at) return { error: 'ลิงก์นี้ถูกยกเลิกแล้ว' };
  if (new Date(String(rec.expires_at)).getTime() < Date.now()) return { error: 'ลิงก์นี้หมดอายุแล้ว กรุณาพิมพ์ Goal ใน LINE เพื่อขอลิงก์ใหม่' };
  await db.from('member_success_blueprint_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', String(rec.id));
  return {
    memberId: String(rec.member_id || ''),
    member: (rec.members || {}) as Record<string, unknown>,
  };
}

async function resolveWebAccessToken(db: Db, token: string): Promise<{
  memberId?: string;
  member?: Record<string, unknown>;
  blueprintYear?: number;
  tokenId?: string;
  error?: string;
}> {
  const raw = txt(token);
  if (!raw) return { error: 'กรุณาเปิดจากลิงก์ส่วนตัวของคุณ' };
  const { data, error } = await db.from('msb_access_tokens')
    .select('id, member_id, blueprint_year, expires_at, members(id, name, nickname, mentor_team, email, bni_goal)')
    .eq('token', raw)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'ลิงก์นี้ไม่ถูกต้อง กรุณาขอลิงก์ใหม่จาก MC หรือ Growth' };
  const rec = data as Record<string, unknown>;
  const expiresAt = rec.expires_at ? new Date(String(rec.expires_at)).getTime() : null;
  if (expiresAt && expiresAt < Date.now()) {
    return { error: 'ลิงก์นี้หมดอายุแล้ว กรุณาขอลิงก์ใหม่จาก MC หรือ Growth' };
  }
  await db.from('msb_access_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', String(rec.id));
  return {
    memberId: String(rec.member_id || ''),
    member: (rec.members || {}) as Record<string, unknown>,
    blueprintYear: Number(rec.blueprint_year || new Date().getFullYear()),
    tokenId: String(rec.id || ''),
  };
}

async function resolveMemberIdentity(db: Db, p: Record<string, unknown>) {
  const blueprintToken = String(p.blueprintToken || p.msbToken || p.token || '').trim();
  if (blueprintToken) return await resolveBlueprintToken(db, blueprintToken);
  const accessToken = String(p.lineAccessToken || p.accessToken || '');
  return await resolveLineMember(db, accessToken);
}

async function getBlueprint(db: Db, memberId: string, year: number) {
  const { data, error } = await db
    .from('member_success_blueprints')
    .select('*')
    .eq('member_id', memberId)
    .eq('blueprint_year', year)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

function normalizeBlueprint(row: Record<string, unknown> | null) {
  if (!row) return null;
  return { ...row, warnings: buildWarnings(row) };
}

async function saveBlueprintForMember(db: Db, memberId: string, year: number, p: Record<string, unknown>) {
  const error = validate(p);
  if (error) return { error, status: 400 };
  const calculated = calculate(p);
  const payload = {
    member_id: memberId,
    blueprint_year: year,
    total_sales_target_year: num(p.total_sales_target_year),
    expected_sales_from_bni_year: num(p.expected_sales_from_bni_year),
    existing_customer_revenue_from_bni: num(p.existing_customer_revenue_from_bni),
    new_customer_revenue_from_bni: num(p.new_customer_revenue_from_bni),
    average_customer_value_year: num(p.average_customer_value_year),
    conversion_rate_percent: num(p.conversion_rate_percent),
    ...calculated,
    looking_for_categories: arr(p.looking_for_categories),
    looking_for_detail: txt(p.looking_for_detail),
    power_team_categories: arr(p.power_team_categories),
    power_team_detail: txt(p.power_team_detail),
    personal_goal_category: txt(p.personal_goal_category),
    personal_goal_detail: txt(p.personal_goal_detail) || null,
    status: txt(p.status) === 'draft' ? 'draft' : 'submitted',
    source: 'member_form',
    updated_at: new Date().toISOString(),
  };
  const { data, error: upsertErr } = await db
    .from('member_success_blueprints')
    .upsert(payload, { onConflict: 'member_id,blueprint_year' })
    .select('*')
    .single();
  if (upsertErr) return { error: upsertErr.message, status: 400 };
  const { error: goalErr } = await db
    .from('members')
    .update({ bni_goal: payload.expected_sales_from_bni_year })
    .eq('id', memberId);
  if (goalErr) return { error: `บันทึก Blueprint แล้ว แต่ sync MSB Goal ไม่สำเร็จ: ${goalErr.message}`, status: 400 };
  return { blueprint: normalizeBlueprint(data as Record<string, unknown>) };
}

async function listDashboardRows(db: Db, auth: Awaited<ReturnType<typeof requireAuth>>, year: number) {
  let q = db
    .from('members')
    .select('id, name, nickname, mentor_team, bni_goal, is_archived')
    .eq('is_archived', false)
    .order('mentor_team')
    .order('name');
  if (!auth.isMC && String(auth.role) !== 'growth' && auth.teamName) {
    q = q.eq('mentor_team', auth.teamName);
  }
  const { data: members, error: memErr } = await q;
  if (memErr) throw new Error(memErr.message);
  const memberRows = (members || []) as Record<string, unknown>[];
  const memberIds = memberRows.map(m => String(m.id)).filter(Boolean);

  const { data: blueprints, error: bpErr } = memberIds.length
    ? await db.from('member_success_blueprints').select('*').eq('blueprint_year', year).in('member_id', memberIds)
    : { data: [], error: null };
  if (bpErr) throw new Error(bpErr.message);

  const { data: tokens, error: tokErr } = memberIds.length
    ? await db.from('msb_access_tokens')
        .select('member_id, blueprint_year, expires_at, used_at, created_at')
        .eq('blueprint_year', year)
        .in('member_id', memberIds)
    : { data: [], error: null };
  if (tokErr) throw new Error(tokErr.message);

  const bpByMember: Record<string, Record<string, unknown>> = {};
  for (const bp of (blueprints || []) as Record<string, unknown>[]) bpByMember[String(bp.member_id)] = bp;
  const tokenByMember: Record<string, Record<string, unknown>> = {};
  for (const token of (tokens || []) as Record<string, unknown>[]) tokenByMember[String(token.member_id)] = token;

  return memberRows.map(m => {
    const bp = bpByMember[String(m.id)] || null;
    const token = tokenByMember[String(m.id)] || null;
    return {
      memberId: m.id,
      name: m.name,
      nickname: m.nickname,
      mentorTeam: m.mentor_team,
      bniGoal: num(m.bni_goal),
      status: bp ? String(bp.status || 'draft') : 'missing',
      linkStatus: bp ? 'saved' : token ? 'link_created' : 'link_not_created',
      linkCreatedAt: token ? token.created_at : null,
      linkUsedAt: token ? token.used_at : null,
      linkExpiresAt: token ? token.expires_at : null,
      blueprint: normalizeBlueprint(bp),
    };
  });
}

export async function handleMemberSuccessBlueprints(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient();
  const action = String(p.action || '');
  const year = Number(p.blueprintYear || p.blueprint_year || new Date().getFullYear());

  switch (action) {
    case 'generateMemberSuccessBlueprintLink': {
      const auth = await requireAuth(db, p, LINK_MANAGER_ROLES);
      if (!auth.ok) return errResponse(auth.error!, 403);
      const memberId = txt(p.memberId || p.member_id);
      if (!memberId) return errResponse('memberId required', 400);

      const { data: member, error: memErr } = await db.from('members')
        .select('id, name, nickname, mentor_team')
        .eq('id', memberId)
        .maybeSingle();
      if (memErr) return errResponse(memErr.message, 400);
      if (!member) return errResponse('ไม่พบสมาชิกนี้', 404);

      const now = Date.now();
      const { data: existing, error: exErr } = await db.from('msb_access_tokens')
        .select('id, token, expires_at, created_at, used_at')
        .eq('member_id', memberId)
        .eq('blueprint_year', year)
        .maybeSingle();
      if (exErr) return errResponse(exErr.message, 400);

      let token = existing ? String((existing as Record<string, unknown>).token || '') : '';
      const expiresAtExisting = existing && (existing as Record<string, unknown>).expires_at
        ? new Date(String((existing as Record<string, unknown>).expires_at)).getTime()
        : null;
      let expiresAt = existing && (existing as Record<string, unknown>).expires_at
        ? String((existing as Record<string, unknown>).expires_at)
        : defaultExpiresAt(year);
      if (!token || (expiresAtExisting && expiresAtExisting < now)) {
        token = newAccessToken();
        expiresAt = defaultExpiresAt(year);
        const payload = {
          member_id: memberId,
          token,
          blueprint_year: year,
          expires_at: expiresAt,
          used_at: existing ? (existing as Record<string, unknown>).used_at || null : null,
          created_by: `dashboard:${String(auth.role || 'unknown')}`,
          created_at: new Date().toISOString(),
        };
        const { error: upsertErr } = await db.from('msb_access_tokens')
          .upsert(payload, { onConflict: 'member_id,blueprint_year' });
        if (upsertErr) return errResponse(upsertErr.message, 400);
      }

      return jsonResponse({
        ok: true,
        link: msbLink(token),
        token,
        blueprintYear: year,
        member,
        expiresAt,
      });
    }

    case 'getMemberSuccessBlueprintByToken': {
      const identity = await resolveWebAccessToken(db, String(p.token || p.t || p.msbToken || ''));
      if (identity.error || !identity.memberId) return errResponse(identity.error || 'Unauthorized', 401);
      const tokenYear = identity.blueprintYear || year;
      const blueprint = await getBlueprint(db, identity.memberId, tokenYear);
      return jsonResponse({
        ok: true,
        member: identity.member,
        blueprint: normalizeBlueprint(blueprint),
        blueprintYear: tokenYear,
      });
    }

    case 'saveMemberSuccessBlueprintByToken': {
      const identity = await resolveWebAccessToken(db, String(p.token || p.t || p.msbToken || ''));
      if (identity.error || !identity.memberId) return errResponse(identity.error || 'Unauthorized', 401);
      const tokenYear = identity.blueprintYear || year;
      const saved = await saveBlueprintForMember(db, identity.memberId, tokenYear, p);
      if (saved.error) return errResponse(saved.error, saved.status || 400);
      return jsonResponse({ ok: true, blueprint: saved.blueprint, blueprintYear: tokenYear });
    }

    case 'getMyMemberSuccessBlueprint': {
      const identity = await resolveMemberIdentity(db, p);
      if (identity.error || !identity.memberId) return errResponse(identity.error || 'Unauthorized', 401);
      const tokenYear = identity.blueprintYear || year;
      const blueprint = await getBlueprint(db, identity.memberId, tokenYear);
      return jsonResponse({
        ok: true,
        member: identity.member,
        blueprint: normalizeBlueprint(blueprint),
        blueprintYear: tokenYear,
      });
    }

    case 'saveMyMemberSuccessBlueprint': {
      const identity = await resolveMemberIdentity(db, p);
      if (identity.error || !identity.memberId) return errResponse(identity.error || 'Unauthorized', 401);
      const tokenYear = identity.blueprintYear || year;
      const saved = await saveBlueprintForMember(db, identity.memberId, tokenYear, p);
      if (saved.error) return errResponse(saved.error, saved.status || 400);
      return jsonResponse({ ok: true, blueprint: saved.blueprint, blueprintYear: tokenYear });
    }

    case 'getMemberSuccessBlueprintsForDashboard': {
      const auth = await requireAuth(db, p, DASHBOARD_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      const rows = await listDashboardRows(db, auth, year);
      return jsonResponse({ ok: true, rows, blueprintYear: year });
    }

    case 'getMemberSuccessBlueprintSummary': {
      const auth = await requireAuth(db, p, DASHBOARD_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      const rows = await listDashboardRows(db, auth, year);
      const submitted = rows.filter(r => r.status === 'submitted');
      const drafts = rows.filter(r => r.status === 'draft');
      const blueprints = rows.map(r => r.blueprint).filter(Boolean) as Record<string, unknown>[];
      const totalExpectedSalesFromBni = blueprints.reduce((s, b) => s + num(b.expected_sales_from_bni_year), 0);
      const totalReferralDemand = blueprints.reduce((s, b) => s + num(b.referral_needed), 0);
      const avgConversionRate = blueprints.length
        ? blueprints.reduce((s, b) => s + num(b.conversion_rate_percent), 0) / blueprints.length
        : 0;
      const avgReferralPerWeek = blueprints.length
        ? blueprints.reduce((s, b) => s + num(b.referral_per_week), 0) / blueprints.length
        : 0;
      const countTop = (field: string) => {
        const counts: Record<string, number> = {};
        for (const b of blueprints) for (const item of arr(b[field])) counts[item] = (counts[item] || 0) + 1;
        return Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([name, count]) => ({ name, count }));
      };
      return jsonResponse({
        ok: true,
        blueprintYear: year,
        summary: {
          totalMembers: rows.length,
          submitted: submitted.length,
          drafts: drafts.length,
          missing: rows.filter(r => r.status === 'missing').length,
          completionPct: rows.length ? Math.round((submitted.length / rows.length) * 100) : 0,
          totalExpectedSalesFromBni,
          totalReferralDemand,
          avgConversionRate,
          avgReferralPerWeek,
          topLookingForCategories: countTop('looking_for_categories'),
          topPowerTeamCategories: countTop('power_team_categories'),
        },
      });
    }
  }

  return errResponse(`unknown action: ${action}`);
}

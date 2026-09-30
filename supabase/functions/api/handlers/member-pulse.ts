import { requireAuth } from "../../_shared/auth.ts";
import { resolveChapterScope } from "../../_shared/chapter-scope.ts";
import { errResponse, getServiceClient, jsonResponse } from "../../_shared/db.ts";
import { evaluateNotificationGuard, logSuppressedNotification } from "../../_shared/notification-orchestrator.ts";
import { linePush, sha256Hex } from "../../_shared/line.ts";
import { canManageMemberPulse, canUseMemberPulseStaff, canViewPulseMember, canViewPulseVisibility, pulseReminderDay, pulseReminderDue } from "../../_shared/member-pulse-access.ts";
import { canReplaceDuePulse, decideMemberPulse, validatePulseAnswers, type PulseHistory, type PulsePolicy } from "../../_shared/member-pulse.ts";
import { projectPulseBoard } from "../../_shared/member-pulse-projection.ts";

type Row = Record<string, unknown>;
const s = (v: unknown) => String(v ?? "").trim();
const uuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s(v));
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, "0")).join("");
const bangkokToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function scopedMember(db: ReturnType<typeof getServiceClient>, auth: Row, chapterId: string, memberId: string) {
  const { data, error } = await db.from("members").select("id,name,nickname,mentor_team,chapter_id,is_archived").eq("id", memberId).eq("chapter_id", chapterId).eq("is_archived", false).maybeSingle();
  if (error || !data) return null;
  if (!canViewPulseMember(auth as never, data as Row)) return null;
  return data as Row;
}

async function tokenCampaign(db: ReturnType<typeof getServiceClient>, raw: string) {
  if (!/^[a-f0-9]{64}$/i.test(raw)) return null;
  const tokenHash = await sha256Hex(raw);
  const { data } = await db.from("member_pulse_tokens").select("id,campaign_id,chapter_id,expires_at,revoked_at").eq("token_hash", tokenHash).maybeSingle();
  if (!data || data.revoked_at || new Date(String(data.expires_at)).getTime() <= Date.now()) return null;
  return data as Row;
}

async function memberTokenAction(db: ReturnType<typeof getServiceClient>, p: Row) {
  const action = s(p.action), token = s(p.token);
  const link = await tokenCampaign(db, token);
  if (!link) return errResponse("ลิงก์แบบสอบถามหมดอายุหรือไม่ถูกต้อง", 403);
  const chapterId = s(link.chapter_id), campaignId = s(link.campaign_id);
  const { data: policy, error: policyError } = await db.from("member_pulse_policies").select("enabled").eq("chapter_id", chapterId).maybeSingle();
  if (policyError || policy?.enabled !== true) return errResponse("Member Pulse ถูกปิดใช้งานแล้ว", 410);
  const { data: campaign, error } = await db.from("member_pulse_campaigns").select("id,chapter_id,member_id,template_id,stage,due_on,status,expires_at,completed_at").eq("id", campaignId).eq("chapter_id", chapterId).maybeSingle();
  if (error || !campaign) return errResponse("ไม่พบแบบสอบถาม", 404);
  const { data: template } = await db.from("member_pulse_templates").select("title,question_spec,version,active").eq("id", campaign.template_id).eq("chapter_id", chapterId).eq("stage", campaign.stage).maybeSingle();
  if (!template) return errResponse("แบบสอบถามไม่พร้อมใช้งาน", 503);
  const { data: response } = await db.from("member_pulse_responses").select("answers,completed_at").eq("campaign_id", campaignId).eq("chapter_id", chapterId).maybeSingle();
  await db.from("member_pulse_tokens").update({ last_accessed_at: new Date().toISOString() }).eq("id", link.id);
  if (action === "getMemberPulseByToken" && campaign.status === "sent") await db.from("member_pulse_campaigns").update({ status: "opened", opened_at: new Date().toISOString() }).eq("id", campaignId).eq("chapter_id", chapterId).eq("status", "sent");
  if (action === "getMemberPulseByToken") return jsonResponse({ ok: true, campaign: { id: campaign.id, stage: campaign.stage, dueOn: campaign.due_on, status: campaign.status, completedAt: response?.completed_at || campaign.completed_at || null, expired: new Date(String(campaign.expires_at || link.expires_at)).getTime() <= Date.now() }, template: { title: template.title, version: template.version, questions: template.question_spec }, answers: response?.answers || {} });
  if (!["saveMemberPulseByToken", "submitMemberPulseByToken"].includes(action)) return errResponse("Unknown Member Pulse token action", 400);
  if (response?.completed_at || campaign.status === "completed") return jsonResponse({ ok: true, duplicate: true, completedAt: response?.completed_at || campaign.completed_at || null });
  if (!["sent", "opened", "in_progress"].includes(s(campaign.status)) || new Date(String(link.expires_at)).getTime() <= Date.now()) return errResponse("แบบสอบถามยังไม่เปิดหรือปิดรับคำตอบแล้ว", 410);
  const submitting = action === "submitMemberPulseByToken";
  const checked = validatePulseAnswers(template.question_spec, p.answers, !submitting);
  if (!checked.ok) return errResponse(checked.error, 400);
  const now = new Date().toISOString();
  const saved = await db.from("member_pulse_responses").upsert({ campaign_id: campaignId, chapter_id: chapterId, answers: checked.answers, completed_at: submitting ? now : null, updated_at: now }, { onConflict: "campaign_id" }).select("campaign_id").maybeSingle();
  if (saved.error) return errResponse("บันทึกคำตอบไม่สำเร็จ กรุณาลองใหม่", 503);
  // The response trigger advances the campaign in the same DB transaction.
  // Never acknowledge completion while the two records can diverge.
  return jsonResponse({ ok: true, saved: true, completed: submitting, completedAt: submitting ? now : null });
}

export async function handleMemberPulse(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient();
  const action = s(p.action);
  if (["getMemberPulseByToken", "saveMemberPulseByToken", "submitMemberPulseByToken"].includes(action)) return await memberTokenAction(db, p);
  const auth = await requireAuth(db, p, ["growth", "mc", "admin", "toomtam", "aof", "draft", "phai", "amp"]);
  if (!auth.ok) return errResponse(auth.error || "Authentication required", 401);
  const a = auth as unknown as Row;
  if (!canUseMemberPulseStaff(a as never)) return errResponse("ไม่มีสิทธิ์ใช้งาน Member Pulse", 403);
  const scope = await resolveChapterScope(db, auth);
  if (!scope.ok) return errResponse(scope.error, 403);
  const chapterId = scope.chapterId;

  if (action === "getMemberPulsePilotAccess" || action === "setMemberPulsePilotAccess") {
    if (!auth.isAdmin || !auth.email) return errResponse("เฉพาะ Chapter Admin ที่ Login ด้วย Google เท่านั้น", 403);
    if (action === "setMemberPulsePilotAccess") {
      if (auth.isReadOnly) return errResponse("บัญชีนี้แก้ไขสิทธิ์ไม่ได้", 403);
      const memberId = s(p.memberId);
      if (!uuid(memberId) || typeof p.enabled !== "boolean") return errResponse("ข้อมูลสิทธิ์ทดลองไม่ถูกต้อง", 400);
      const { data: member, error: memberError } = await db.from("members")
        .select("id").eq("chapter_id", chapterId).eq("id", memberId)
        .eq("is_archived", false).maybeSingle();
      if (memberError || !member) return errResponse("ไม่พบสมาชิกใน Chapter นี้", 404);
      const result = await db.from("member_pulse_pilot_access").upsert({
        chapter_id: chapterId, member_id: memberId,
        enabled: p.enabled, updated_by_email: auth.email,
      }, { onConflict: "chapter_id,member_id" });
      if (result.error) return errResponse("บันทึกสิทธิ์ทดลองไม่สำเร็จ", 503);
      if (!p.enabled) {
        const closed = await db.from("member_pulse_campaigns").update({ status: "expired" })
          .eq("chapter_id", chapterId).eq("member_id", memberId)
          .eq("cycle_key", "pilot:v1").in("status", ["sent", "opened", "in_progress"]);
        if (closed.error) return errResponse("ปิดสิทธิ์แล้ว แต่ปิดรอบทดลองไม่สำเร็จ กรุณาตรวจสอบ", 503);
      }
      return jsonResponse({ ok: true, memberId, enabled: p.enabled });
    }
    const [membersResult, accessResult] = await Promise.all([
      db.from("members").select("id,name,nickname").eq("chapter_id", chapterId)
        .eq("is_archived", false).order("name").limit(1001),
      db.from("member_pulse_pilot_access").select("member_id,enabled")
        .eq("chapter_id", chapterId).eq("enabled", true).limit(1001),
    ]);
    if (membersResult.error || accessResult.error || membersResult.data?.length === 1001 || accessResult.data?.length === 1001) return errResponse("อ่านรายชื่อทดลองไม่สำเร็จหรือข้อมูลเกินขอบเขต", 503);
    return jsonResponse({ ok: true, members: membersResult.data || [],
      enabledMemberIds: (accessResult.data || []).map((row: Row) => s(row.member_id)) });
  }

  if (action === "createMemberPulseDue") {
    if (!canManageMemberPulse(a as never)) return errResponse("Growth Coordinator capability required", 403);
    const { data: policy, error: policyError } = await db.from("member_pulse_policies").select("enabled,milestones,renewal_days_before,due_soon_days,cooldown_days").eq("chapter_id", chapterId).maybeSingle();
    if (policyError) return errResponse("อ่านนโยบาย Pulse ไม่สำเร็จ", 503);
    if (policy?.enabled !== true) return jsonResponse({ ok: true, enabled: false, created: 0, message: "Member Pulse ยังไม่เปิดใช้งาน" });
    const expiredCampaigns = await db.from("member_pulse_campaigns").update({ status: "expired" })
      .eq("chapter_id", chapterId).in("status", ["sent", "opened", "in_progress"])
      .lt("expires_at", new Date().toISOString());
    if (expiredCampaigns.error) return errResponse("ตรวจ Pulse ที่หมดอายุไม่สำเร็จ", 503);
    const [memberQ, renewQ, templateQ, historyQ] = await Promise.all([
      db.from("members").select("id,joined_date,membership_start_date").eq("chapter_id", chapterId).eq("is_archived", false).limit(1000),
      db.from("renewals").select("member_id,expiry_date").eq("chapter_id", chapterId).limit(2000),
      db.from("member_pulse_templates").select("id,stage").eq("chapter_id", chapterId).eq("active", true),
      db.from("member_pulse_campaigns").select("id,member_id,stage,cycle_key,status,sent_at,created_at,due_on").eq("chapter_id", chapterId).limit(5000),
    ]);
    for (const result of [memberQ, renewQ, templateQ, historyQ]) if (result.error) return errResponse("ตรวจรอบ Member Pulse ไม่สำเร็จ", 503);
    // Supabase returns at most the requested limit. Never silently omit a
    // member or prior campaign when deciding cooldown and duplicate sends.
    if (memberQ.data?.length === 1000 || renewQ.data?.length === 2000 || historyQ.data?.length === 5000) return errResponse("ข้อมูลเกินขอบเขตการตรวจรอบ กรุณาติดต่อผู้ดูแลก่อนส่ง Pulse", 503);
    const members = memberQ.data as Row[], renewals = new Map((renewQ.data as Row[]).map(row => [s(row.member_id), s(row.expiry_date)]));
    const templates = new Map((templateQ.data as Row[]).map(row => [s(row.stage), s(row.id)]));
    const history = historyQ.data as Row[];
    const pulsePolicy: PulsePolicy = { enabled: true, milestones: Array.isArray(policy.milestones) ? policy.milestones : [], renewalDaysBefore: Number(policy.renewal_days_before), dueSoonDays: Number(policy.due_soon_days), cooldownDays: Number(policy.cooldown_days ?? 60) };
    const today = bangkokToday(); let created = 0, skipped = 0;
    for (const member of members) {
      const memberId = s(member.id), joinedOn = s(member.joined_date || member.membership_start_date), expiresOn = renewals.get(memberId) || "";
      const rows = history.filter(row => s(row.member_id) === memberId);
      if (rows.some(row => ["sent", "opened", "in_progress"].includes(s(row.status)))) { skipped++; continue; }
      const decision = decideMemberPulse({ today, joinedOn: joinedOn || null, expiresOn: expiresOn || null, history: rows.filter(row => row.status !== "due").map(row => ({ stage: s(row.stage) as PulseHistory["stage"], cycleKey: s(row.cycle_key), status: s(row.status) as PulseHistory["status"], sentOn: s(row.sent_at || (s(row.cycle_key).startsWith("pilot:") ? row.created_at : "")).slice(0, 10) || undefined })) }, pulsePolicy);
      if (!["DUE", "DUE_SOON", "OVERDUE"].includes(decision.status) || !decision.stage || !decision.dueOn || !decision.cycleKey) { skipped++; continue; }
      const unsent = rows.filter(row => row.status === "due");
      if (!canReplaceDuePulse({ stage: decision.stage, dueOn: decision.dueOn, cycleKey: decision.cycleKey }, unsent.map(row => ({ stage: s(row.stage) as PulseHistory["stage"], dueOn: s(row.due_on), cycleKey: s(row.cycle_key) })), joinedOn)) { skipped++; continue; }
      const templateId = templates.get(decision.stage);
      if (!templateId) { skipped++; continue; }
      const result = await db.from("member_pulse_campaigns").upsert({ chapter_id: chapterId, member_id: memberId, template_id: templateId, stage: decision.stage, cycle_key: decision.cycleKey, due_on: decision.dueOn, status: "due" }, { onConflict: "chapter_id,member_id,cycle_key", ignoreDuplicates: true }).select("id").maybeSingle();
      if (result.error) return errResponse("สร้าง Due Pulse ไม่สำเร็จ", 503);
      if (result.data) {
        const oldIds = unsent.map(row => s(row.id));
        if (oldIds.length) {
          const replaced = await db.from("member_pulse_campaigns").update({ status: "superseded" }).eq("chapter_id", chapterId).eq("member_id", memberId).eq("status", "due").in("id", oldIds);
          if (replaced.error) return errResponse("มี Pulse ใหม่แล้ว แต่ปิด Due เดิมไม่สำเร็จ กรุณาตรวจคิว", 503);
        }
        created++;
      }
    }
    return jsonResponse({ ok: true, enabled: true, created, skipped, scanned: members.length, checkedOn: today, sentAutomatically: false });
  }

  if (action === "getMemberPulseBoard") {
    if (!canManageMemberPulse(a as never)) return errResponse("Growth Coordinator capability required", 403);
    const policy = await db.from("member_pulse_policies").select("enabled,cooldown_days,renewal_days_before,due_soon_days").eq("chapter_id", chapterId).maybeSingle();
    if (policy.error) return errResponse("Member Pulse ยังไม่พร้อมใช้งาน", 503);
    if (policy.data?.enabled !== true) return jsonResponse({ ok: true, enabled: false, campaigns: [], summary: { dueNow: 0, dueThisWeek: 0, waiting: 0, completed: 0, overdue: 0 }, cadence: { cooldownDays: 60, reminderDays: [3, 7] } });
    const { data: campaigns, error } = await db.from("member_pulse_campaigns").select("id,member_id,stage,due_on,status,created_at,completed_at,sent_at,reminders_sent").eq("chapter_id", chapterId).order("due_on", { ascending: true }).limit(500);
    if (error) return errResponse("โหลดรายการ Member Pulse ไม่สำเร็จ", 503);
    if (campaigns?.length === 500) return errResponse("รายการ Pulse เกินขอบเขตที่ตรวจสอบได้ กรุณาติดต่อผู้ดูแล", 503);
    const ids = [...new Set(((campaigns || []) as Row[]).map(row => s(row.member_id)))];
    const { data: members, error: memberError } = ids.length ? await db.from("members").select("id,name,nickname,mentor_team").eq("chapter_id", chapterId).eq("is_archived", false).in("id", ids) : { data: [], error: null };
    if (memberError) return errResponse("โหลดรายชื่อสมาชิกไม่สำเร็จ", 503);
    let projected = projectPulseBoard((campaigns || []) as Row[], (members || []) as Row[]);
    if (auth.isMentor && !auth.isMC) projected = { ...projected, campaigns: projected.campaigns.filter((row: Row) => ((members || []) as Row[]).some(m => s(m.id) === s(row.memberId) && s(m.mentor_team).toLowerCase() === s(auth.teamName).toLowerCase())) };
    const today = bangkokToday(), end = new Date(`${today}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 7); const week = end.toISOString().slice(0, 10);
    const rows = projected.campaigns.map((row: Row) => ({ ...row, bucket: row.status === "completed" ? "completed" : ["sent", "opened", "in_progress"].includes(s(row.status)) ? "waiting" : s(row.dueOn) < today ? "overdue" : s(row.dueOn) === today ? "due_now" : s(row.dueOn) <= week ? "due_this_week" : "upcoming", canSend: canManageMemberPulse(a as never) && row.status === "due", canRemind: canManageMemberPulse(a as never) && ["sent", "opened", "in_progress"].includes(s(row.status)) && pulseReminderDue(Number(row.remindersSent || 0), (Date.now() - new Date(s(row.sentAt)).getTime()) / 86400000) }));
    const summary = { dueNow: rows.filter((r: Row) => r.bucket === "due_now").length, dueThisWeek: rows.filter((r: Row) => r.bucket === "due_this_week").length, waiting: rows.filter((r: Row) => r.bucket === "waiting").length, completed: rows.filter((r: Row) => r.bucket === "completed").length, overdue: rows.filter((r: Row) => r.bucket === "overdue").length, upcoming: rows.filter((r: Row) => r.bucket === "upcoming").length };
    return jsonResponse({ ok: true, enabled: true, campaigns: rows, summary, cadence: { cooldownDays: Number(policy.data?.cooldown_days ?? 60), reminderDays: [3, 7] }, permissions: { canSend: canManageMemberPulse(a as never), canViewAnswers: Boolean(auth.isMC || auth.isAdmin) } });
  }

    if (action === "getMemberPulseHistory") {
    const memberId = s(p.memberId);
    if (!uuid(memberId)) return errResponse("memberId ไม่ถูกต้อง", 400);
    const member = await scopedMember(db, a, chapterId, memberId);
    if (!member) return errResponse("ไม่พบสมาชิกในขอบเขตที่คุณดูแล", 403);
    if (!auth.isMC && !auth.isAdmin && (auth.role === "growth" ? !canManageMemberPulse(a as never) : !auth.isMentor)) return errResponse("ไม่มีสิทธิ์ดูประวัติ Pulse", 403);
    const { data: campaigns, error } = await db.from("member_pulse_campaigns").select("id,template_id,stage,due_on,status,sent_at,completed_at,created_at").eq("chapter_id", chapterId).eq("member_id", memberId).order("due_on", { ascending: false }).limit(50);
    if (error) return errResponse("โหลดประวัติ Pulse ไม่สำเร็จ", 503);
    const rows: Row[] = [];
    for (const campaign of (campaigns || []) as Row[]) {
      const { data: template } = await db.from("member_pulse_templates").select("title,question_spec,visibility_scope").eq("id", campaign.template_id).eq("chapter_id", chapterId).maybeSingle();
      const scopeValue = s(template?.visibility_scope || "member");
      const canSeeScope = (value: string) => canViewPulseVisibility(a as never, value);
      const spec = Array.isArray(template?.question_spec) ? template.question_spec as Row[] : [];
      const canSeeAny = canSeeScope(scopeValue) || spec.some(q => canSeeScope(s(q.visibility_scope || scopeValue)));
      const { data: response } = canSeeAny ? await db.from("member_pulse_responses").select("answers,completed_at").eq("campaign_id", campaign.id).eq("chapter_id", chapterId).maybeSingle() : { data: null };
      const sourceAnswers = response?.answers && typeof response.answers === "object" ? response.answers as Row : {};
      const answers = Object.fromEntries(Object.entries(sourceAnswers).filter(([key]) => { const q = spec.find(item => s(item.id) === key); return q && canSeeScope(s(q.visibility_scope || scopeValue)); }));
      rows.push({ id: campaign.id, stage: campaign.stage, title: template?.title || null, dueOn: campaign.due_on, status: campaign.status, sentAt: campaign.sent_at || null, completedAt: campaign.completed_at || response?.completed_at || null, visibilityScope: scopeValue, answers: Object.keys(answers).length ? answers : null });
    }
    return jsonResponse({ ok: true, member: { id: member.id, name: member.name, nickname: member.nickname }, history: rows });
  }

  if (["previewMemberPulse", "sendMemberPulse", "remindMemberPulse"].includes(action)) {
    if (!canManageMemberPulse(a as never)) return errResponse("Growth Coordinator capability required", 403);
    const campaignId = s(p.campaignId);
    const { data: campaign } = await db.from("member_pulse_campaigns").select("id,member_id,chapter_id,stage,due_on,status,sent_at,reminders_sent").eq("id", campaignId).eq("chapter_id", chapterId).maybeSingle();
    if (!campaign) return errResponse("ไม่พบ Pulse ใน Chapter นี้", 404);
    const { data: member } = await db.from("members").select("id,name,nickname").eq("id", campaign.member_id).eq("chapter_id", chapterId).eq("is_archived", false).maybeSingle();
    if (!member) return errResponse("ไม่พบสมาชิกใน Chapter นี้", 403);
    if (action === "previewMemberPulse") return jsonResponse({ ok: true, member: member.nickname || member.name, stage: campaign.stage, dueOn: campaign.due_on, status: campaign.status, message: `BNI IDEAL ขอเชิญตอบแบบสอบถาม ${campaign.stage} ใช้เวลาประมาณ 1–2 นาที เพื่อให้ทีมดูแลสมาชิกได้ตรงความต้องการ`, deliveryReady: Boolean(Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") && Deno.env.get("LINE_DELIVERY_ENABLED") === "true") });
    const isReminder = action === "remindMemberPulse";
    const { data: overlapping, error: overlapError } = await db.from("member_pulse_campaigns")
      .select("id").eq("chapter_id", chapterId).eq("member_id", campaign.member_id)
      .in("status", ["due", "sent", "opened", "in_progress"]).neq("id", campaignId).limit(1);
    if (overlapError) return errResponse("ตรวจ Pulse ที่อาจส่งซ้อนไม่สำเร็จ", 503);
    if (overlapping?.length) return errResponse("มี Pulse อื่นที่ยังดำเนินการอยู่ กรุณาตรวจรายการก่อนส่ง", 409);
    let remindersCountAfter = Number(campaign.reminders_sent || 0) + 1;
    if (isReminder) {
      const count = Number(campaign.reminders_sent || 0);
      if (count >= 2) return errResponse("ส่ง Reminder ครบ 2 ครั้งแล้ว", 409);
      if (!campaign.sent_at || !["sent", "opened", "in_progress"].includes(s(campaign.status))) return errResponse("Pulse ยังไม่ได้ส่งหรือปิดรับคำตอบแล้ว", 409);
      const elapsed = (Date.now() - new Date(String(campaign.sent_at)).getTime()) / 86400000;
      remindersCountAfter = count + 1;
      const targetDay = pulseReminderDay(remindersCountAfter - 1);
      if (!targetDay) return errResponse("ส่ง Reminder ครบ 2 ครั้งแล้ว", 409);
      if (!pulseReminderDue(count, elapsed)) return errResponse(`Reminder ครั้งที่ ${remindersCountAfter} ส่งได้ตามรอบวันที่ ${targetDay} หลังส่งเท่านั้น`, 409);
    } else if (campaign.status !== "due") return errResponse("ส่งได้เฉพาะ Pulse ที่ยังไม่ส่ง", 409);
    const { data: link } = await db.from("line_members").select("line_user_id").eq("member_id", campaign.member_id).maybeSingle();
    if (!link?.line_user_id) return errResponse("สมาชิกยังไม่เชื่อม LINE", 409);
    const guardInput = { memberId: s(campaign.member_id), module: "member_pulse", category: isReminder ? "member_pulse_reminder" : "member_pulse_initial", priority: "reminder" as const };
    const guard = await evaluateNotificationGuard(db, guardInput);
    const key = `pulse:${campaign.id}:${isReminder ? `reminder:${remindersCountAfter}` : "initial"}`;
    if (!guard.allowed) { await logSuppressedNotification(db, guardInput, guard, key, s(link.line_user_id)); return jsonResponse({ ok: false, suppressed: true, reason: guard.reason, error: "ระบบยังไม่ส่งข้อความ เพื่อป้องกันการรบกวนสมาชิก" }, 429); }
    const base = s(Deno.env.get("PUBLIC_APP_URL"));
    if (!base || !base.startsWith("https://")) return errResponse("Staging PUBLIC_APP_URL ต้องเป็น HTTPS ก่อนสร้างลิงก์", 503);
    // Each initial send or reminder receives a fresh bearer token; raw token
    // values are returned only inside the LINE URL and never stored in DB.
    const token = randomToken();
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    const created = await db.from("member_pulse_tokens").insert({ campaign_id: campaign.id, chapter_id: chapterId, token_hash: await sha256Hex(token), expires_at: expiresAt, created_by_email: s(auth.email) }).select("id").single();
    if (created.error) return errResponse("สร้างลิงก์ Pulse ไม่สำเร็จ", 503);
    const tokenId = s(created.data.id);
    const url = new URL("/pulse/", base);
    url.searchParams.set("token", token);
    const message = `${isReminder ? "🔔 เตือนอีกครั้ง" : "💛 ขอรับฟังความคิดเห็นของคุณ"}\nแบบสอบถาม ${campaign.stage} ใช้เวลาประมาณ 1–2 นาที\n${url.toString()}`;
    try {
      const sent = await linePush(s(link.line_user_id), message, { db, idempotencyKey: key, memberId: s(campaign.member_id), notificationType: isReminder ? "member_pulse_reminder" : "member_pulse_initial", source: "api/member-pulse", module: "member_pulse", category: isReminder ? "member_pulse_reminder" : "member_pulse_initial", priority: "reminder", redactSensitiveLinks: true });
      if (sent.skipped) { await db.from("member_pulse_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", tokenId); return errResponse("ระบบไม่ได้ส่งข้อความ (delivery guard) กรุณาตรวจคิวส่ง", 409); }
      const changed = isReminder ? await db.from("member_pulse_campaigns").update({ reminders_sent: remindersCountAfter, last_reminded_at: new Date().toISOString() }).eq("id", campaign.id).eq("chapter_id", chapterId).eq("reminders_sent", remindersCountAfter - 1).in("status", ["sent", "opened", "in_progress"]).select("id").maybeSingle() : await db.from("member_pulse_campaigns").update({ status: "sent", sent_at: new Date().toISOString(), expires_at: expiresAt, sent_by_email: s(auth.email) }).eq("id", campaign.id).eq("chapter_id", chapterId).eq("status", "due").select("id").maybeSingle();
      if (changed.error || !changed.data) return errResponse("LINE ส่งแล้ว แต่บันทึกสถานะไม่สำเร็จ ต้องตรวจ delivery log ก่อนส่งซ้ำ", 503);
      return jsonResponse({ ok: true, sent: true, deliveryId: sent.deliveryId || null, remindersSent: isReminder ? remindersCountAfter : 0, tokenId: tokenId || undefined });
    } catch (error) {
      await db.from("member_pulse_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", tokenId);
      return errResponse(error instanceof Error ? error.message : "LINE delivery failed", 503);
    }
  }
  return errResponse("Unknown Member Pulse action", 400);
}

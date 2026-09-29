import { validatePulseAnswers } from "./member-pulse.ts";

type PulseDb = {
  from: (table: string) => any;
};
type PulseIdentity = { memberId: string; chapterId: string };

// The caller resolves LINE identity before entering this handler. No member or
// Chapter identifier from the request body participates in authorization.
export async function handleMemberPulseLiff(
  db: PulseDb,
  identity: PulseIdentity,
  action: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const fail = (status: number, error: string) => ({
    status,
    body: { ok: false, error },
  });
  if (!identity.chapterId || !identity.memberId) {
    return fail(403, "ยังไม่ทราบ Chapter ของสมาชิก");
  }
  const member = await db.from("members").select("id")
    .eq("id", identity.memberId).eq("chapter_id", identity.chapterId)
    .eq("is_archived", false).maybeSingle();
  if (member.error) return fail(503, "ตรวจสถานะสมาชิกไม่สำเร็จ");
  if (!member.data) return fail(403, "บัญชีสมาชิกนี้ไม่สามารถทำ Member Pulse ได้");
  const policy = await db.from("member_pulse_policies").select("enabled")
    .eq("chapter_id", identity.chapterId).maybeSingle();
  if (policy.error) return fail(503, "Member Pulse ยังไม่พร้อมใช้งาน");
  if (policy.data?.enabled !== true) {
    return action === "get-my-pulse"
      ? {
        status: 200,
        body: { ok: true, available: false, reason: "not_enabled" },
      }
      : fail(403, "Member Pulse ยังไม่เปิดใช้งาน");
  }
  const query = db.from("member_pulse_campaigns")
    .select("id,template_id,stage,due_on,status,created_at")
    .eq("chapter_id", identity.chapterId).eq("member_id", identity.memberId);
  const campaignResult = action === "get-my-pulse"
    ? await query.order("created_at", { ascending: false }).limit(1)
      .maybeSingle()
    : await query.eq("id", String(body.campaignId || "")).maybeSingle();
  if (campaignResult.error) return fail(503, "โหลด Member Pulse ไม่สำเร็จ");
  const campaign = campaignResult.data;
  if (!campaign) {
    return action === "get-my-pulse"
      ? {
        status: 200,
        body: { ok: true, available: false, reason: "no_campaign" },
      }
      : fail(404, "ไม่พบแบบสอบถามของคุณ");
  }
  const templateResult = await db.from("member_pulse_templates")
    .select("id,title,question_spec,active,version")
    .eq("id", campaign.template_id).eq("chapter_id", identity.chapterId)
    .eq("stage", campaign.stage).maybeSingle();
  if (templateResult.error || !templateResult.data) {
    return fail(503, "Template Member Pulse ไม่พร้อมใช้งาน");
  }
  const template = templateResult.data;
  const existing = await db.from("member_pulse_responses")
    .select("answers,completed_at").eq("chapter_id", identity.chapterId)
    .eq("campaign_id", campaign.id).maybeSingle();
  if (existing.error) return fail(503, "โหลดคำตอบไม่สำเร็จ");
  if (action === "get-my-pulse") {
    return {
      status: 200,
      body: {
        ok: true,
        available: true,
        campaign: {
          id: campaign.id,
          stage: campaign.stage,
          dueOn: campaign.due_on,
          status: campaign.status,
          completedAt: existing.data?.completed_at || null,
        },
        template: {
          title: template.title,
          version: template.version,
          questions: template.question_spec,
        },
        answers: existing.data?.answers || null,
      },
    };
  }
  if (action !== "submit-my-pulse") {
    return fail(400, "Unknown Member Pulse action");
  }
  if (existing.data?.completed_at && campaign.status !== "completed") {
    const repaired = await db.from("member_pulse_campaigns").update({
      status: "completed",
      completed_at: existing.data.completed_at,
    }).eq("id", campaign.id).eq("chapter_id", identity.chapterId)
      .eq("member_id", identity.memberId).select("id").maybeSingle();
    if (repaired.error || !repaired.data) {
      return fail(503, "บันทึกสถานะไม่สำเร็จ กรุณาลองใหม่");
    }
  }
  if (existing.data?.completed_at || campaign.status === "completed") {
    return {
      status: 200,
      body: {
        ok: true,
        duplicate: true,
        completedAt: existing.data?.completed_at || null,
      },
    };
  }
  if (!template.active || ["declined", "expired"].includes(campaign.status)) {
    return fail(409, "แบบสอบถามนี้ปิดรับคำตอบแล้ว");
  }
  const checked = validatePulseAnswers(template.question_spec, body.answers);
  if (!checked.ok) return fail(400, checked.error);
  const saved = await db.from("member_pulse_responses").upsert({
    campaign_id: campaign.id,
    chapter_id: identity.chapterId,
    answers: checked.answers,
    completed_at: new Date().toISOString(),
  }, { onConflict: "campaign_id", ignoreDuplicates: true }).select(
    "completed_at",
  ).maybeSingle();
  if (saved.error) return fail(503, "บันทึกคำตอบไม่สำเร็จ กรุณาลองใหม่");
  const updated = await db.from("member_pulse_campaigns").update({
    status: "completed",
    completed_at: saved.data?.completed_at || new Date().toISOString(),
  }).eq("id", campaign.id).eq("chapter_id", identity.chapterId)
    .eq("member_id", identity.memberId).select("id").maybeSingle();
  if (updated.error || !updated.data) {
    return fail(503, "บันทึกสถานะไม่สำเร็จ กรุณาลองใหม่");
  }
  return { status: 200, body: { ok: true, duplicate: !saved.data } };
}

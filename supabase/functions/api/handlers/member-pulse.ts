import { requireAuth } from "../../_shared/auth.ts";
import { resolveChapterScope } from "../../_shared/chapter-scope.ts";
import {
  errResponse,
  getServiceClient,
  jsonResponse,
} from "../../_shared/db.ts";
import { canReadGrowthCycle } from "../../_shared/member-growth-cycle.ts";
import { projectPulseBoard } from "../../_shared/member-pulse-projection.ts";

// Staff projection contains campaign metadata only. Answers, question text and
// individual dimensions stay unavailable pending an explicit privacy decision.
export async function handleMemberPulse(
  p: Record<string, unknown>,
): Promise<Response> {
  if (p.action !== "getMemberPulseBoard") {
    return errResponse("Unknown Member Pulse action", 400);
  }
  const db = getServiceClient();
  const auth = await requireAuth(db, p, ["growth", "mc"]);
  if (!auth.ok) {
    return errResponse(auth.error || "Authentication required", 401);
  }
  if (!canReadGrowthCycle(auth)) {
    return errResponse("Member Pulse ต้องใช้ OAuth ที่ได้รับสิทธิ์", 403);
  }
  const scope = await resolveChapterScope(db, auth);
  if (!scope.ok) return errResponse(scope.error, 403);
  const chapterId = scope.chapterId;
  const policy = await db.from("member_pulse_policies").select("enabled")
    .eq("chapter_id", chapterId).maybeSingle();
  if (policy.error) return errResponse("Member Pulse ยังไม่พร้อมใช้งาน", 503);
  if (policy.data?.enabled !== true) {
    return jsonResponse({
      ok: true,
      enabled: false,
      campaigns: [],
      summary: { due: 0, waiting: 0, completed: 0 },
    });
  }
  const campaigns = await db.from("member_pulse_campaigns")
    .select("id,member_id,stage,due_on,status,created_at,completed_at")
    .eq("chapter_id", chapterId).order("due_on", { ascending: true }).limit(
      500,
    );
  if (campaigns.error) {
    return errResponse("โหลดรายการ Member Pulse ไม่สำเร็จ", 503);
  }
  const memberIds = [
    ...new Set((campaigns.data || []).map((row) => String(row.member_id))),
  ];
  const members = memberIds.length
    ? await db.from("members").select("id,name,nickname").eq(
      "chapter_id",
      chapterId,
    )
      .eq("is_archived", false).in("id", memberIds)
    : { data: [], error: null };
  if (members.error) return errResponse("โหลดรายชื่อสมาชิกไม่สำเร็จ", 503);
  return jsonResponse({
    ok: true,
    enabled: true,
    ...projectPulseBoard(campaigns.data || [], members.data || []),
  });
}

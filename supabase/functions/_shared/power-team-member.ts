// Member identity and Chapter come exclusively from verified LINE identity.
import { getServiceClient } from "./db.ts";
type Db = ReturnType<typeof getServiceClient>;
export async function memberPowerTeams(
  db: Db,
  chapterId: string,
  memberId: string,
) {
  const { data: member, error: memberError } = await db.from("members").select(
    "id",
  ).eq("id", memberId).eq("chapter_id", chapterId).eq("is_archived", false)
    .maybeSingle();
  if (memberError || !member) throw new Error("ไม่พบสมาชิกที่ใช้งานอยู่");
  const { data: links, error } = await db.from("power_team_proposal_members")
    .select("proposal_id,participation_status").eq("member_id", memberId);
  if (error) throw new Error("โหลดคำเชิญไม่สำเร็จ");
  if (!links?.length) return [];
  const ids = links.map((r: Record<string, unknown>) => String(r.proposal_id));
  const [
    { data: proposals, error: proposalError },
    { data: publications, error: publicationError },
  ] = await Promise.all([
    db.from("power_team_proposals").select(
      "id,title,target_customer_group,status,blueprint_year,leader_member_id,power_team_proposal_members(member_id,members(id,name,nickname,chapter_id))",
    ).eq("chapter_id", chapterId).in("id", ids),
    db.from("growth_power_team_publications").select("proposal_id,status").eq(
      "chapter_id",
      chapterId,
    ).in("proposal_id", ids),
  ]);
  if (proposalError || publicationError) {
    throw new Error("โหลด Power Team ไม่สำเร็จ");
  }
  const own = new Map(
    links.map((
      r: Record<string, unknown>,
    ) => [String(r.proposal_id), r.participation_status]),
  );
  const published = new Map(
    (publications || []).map((
      r: Record<string, unknown>,
    ) => [String(r.proposal_id), r.status]),
  );
  return (proposals || []).filter((r: Record<string, unknown>) =>
    published.get(String(r.id)) === "active" ||
    (!published.has(String(r.id)) &&
      ["draft", "assigned", "exploring", "active"].includes(String(r.status)))
  ).map((r: Record<string, unknown>) => ({
    id: r.id,
    title: r.title,
    targetCustomerGroup: r.target_customer_group,
    year: r.blueprint_year,
    leaderMemberId: r.leader_member_id,
    official: published.get(String(r.id)) === "active",
    response: own.get(String(r.id)),
    members:
      ((r.power_team_proposal_members || []) as Record<string, unknown>[])
        .filter((l) =>
          (l.members as Record<string, unknown> | null)?.chapter_id ===
            chapterId
        ).map((l) => {
          const m = l.members as Record<string, unknown>;
          return {
            member_id: l.member_id,
            members: { id: m.id, name: m.name, nickname: m.nickname },
          };
        }),
  }));
}

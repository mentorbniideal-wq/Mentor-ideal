import { getServiceClient } from "./db.ts";
/** Staff-only aggregate, never a global service-role view. */
export async function blueprintCategoryDemand(
  db: ReturnType<typeof getServiceClient>,
  chapterId: string,
  year: number,
  respectGrowthConsent: boolean,
) {
  const { data: members, error: memberError } = await db.from("members").select(
    "id",
  ).eq("chapter_id", chapterId).eq("is_archived", false);
  if (memberError) throw new Error("โหลดสมาชิกไม่สำเร็จ");
  const ids = (members || []).map((m: Record<string, unknown>) => String(m.id));
  if (!ids.length) return [];
  const [
    { data: plans, error: planError },
    { data: permissions, error: permissionError },
  ] = await Promise.all([
    db.from("member_success_blueprints").select(
      "member_id,looking_for_categories,power_team_categories",
    ).eq("blueprint_year", year).eq("status", "submitted").in("member_id", ids),
    respectGrowthConsent
      ? db.from("member_blueprint_growth_consents").select("member_id").eq(
        "chapter_id",
        chapterId,
      ).eq("blueprint_year", year).eq("share_referral_focus", true)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (planError || permissionError) throw new Error("โหลดหมวดที่อนุญาตไม่สำเร็จ");
  const allowed = new Set(
    (permissions || []).map((p: Record<string, unknown>) =>
      String(p.member_id)
    ),
  );
  return (plans || []).filter((p: Record<string, unknown>) =>
    !respectGrowthConsent || allowed.has(String(p.member_id))
  ).flatMap((p: Record<string, unknown>) =>
    ["looking_for", "power_team"].flatMap((type) => {
      const values = p[type + "_categories"];
      return [...new Set(Array.isArray(values) ? values.map(String) : [])].map(
        (category) => ({ category_type: type, category }),
      );
    })
  );
}

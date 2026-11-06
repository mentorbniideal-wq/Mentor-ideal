type Row = Record<string, unknown>;
export function blueprintCategoryKey(value: unknown): string {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ")
    .toLocaleLowerCase("th");
}
export function projectBlueprintPlan(
  row: Row,
  permission: Row | undefined,
): Row {
  return {
    ...row,
    looking_for_categories: permission?.share_referral_focus === true
      ? row.looking_for_categories
      : [],
    power_team_categories: permission?.share_referral_focus === true
      ? row.power_team_categories
      : [],
    looking_for_detail: permission?.share_details === true
      ? row.looking_for_detail
      : "",
    power_team_detail: permission?.share_details === true
      ? row.power_team_detail
      : "",
    personal_goal_category: permission?.share_details === true
      ? row.personal_goal_category
      : "",
    personal_goal_detail: permission?.share_details === true
      ? row.personal_goal_detail
      : "",
    monthly_marketing_plan: permission?.share_details === true
      ? row.monthly_marketing_plan
      : [],
    growthShareStatus: {
      categories: permission?.share_referral_focus === true,
      details: permission?.share_details === true,
      business: permission?.share_business === true,
    },
  };
}
/** Permissions are annual, Blueprint-specific, and loaded for the server Chapter. */
export function projectBlueprintProposal(
  row: Row,
  permissions: Map<string, Row>,
): Row {
  const links =
    (Array.isArray(row.power_team_proposal_members)
      ? row.power_team_proposal_members
      : []) as Row[];
  const permission = (id: unknown) =>
    permissions.get(String(id) + ":" + String(row.blueprint_year));
  if (
    !links.length ||
    !links.every((link) => permission(link.member_id)?.share_details === true)
  ) {
    return {
      ...row,
      title: "",
      source_category: null,
      target_customer_group: "",
      rationale: "",
      leader_member_id: null,
      power_team_proposal_members: [],
      member_count: links.length,
      detailRestricted: true,
    };
  }
  return {
    ...row,
    power_team_proposal_members: links.map((link) => {
      const member = link.members as Row | null;
      return {
        ...link,
        members: member
          ? {
            ...member,
            profession: permission(link.member_id)?.share_business === true
              ? member.profession
              : "",
            company_name: permission(link.member_id)?.share_business === true
              ? member.company_name
              : "",
          }
          : null,
      };
    }),
  };
}

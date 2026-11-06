import { assertEquals } from "jsr:@std/assert";
import {
  blueprintCategoryKey,
  projectBlueprintPlan,
  projectBlueprintProposal,
} from "./blueprint-growth-privacy.ts";
Deno.test("Category identity normalizes presentation only, not semantic guesses", () => {
  assertEquals(
    blueprintCategoryKey("  Finance  Team "),
    blueprintCategoryKey("finance team"),
  );
  assertEquals(blueprintCategoryKey("ＡＢＣ"), blueprintCategoryKey("abc"));
  assertEquals(
    blueprintCategoryKey("property") === blueprintCategoryKey("insurance"),
    false,
  );
});
const row = {
  title: "market",
  rationale: "private details",
  target_customer_group: "customer",
  source_category: "category",
  blueprint_year: 2027,
  power_team_proposal_members: [{
    member_id: "a",
    members: {
      id: "a",
      name: "A",
      profession: "profession",
      company_name: "company",
    },
  }, {
    member_id: "b",
    members: {
      id: "b",
      name: "B",
      profession: "profession",
      company_name: "company",
    },
  }],
};
Deno.test("Blueprint proposals never infer permission from MY121 or another plan year", () => {
  assertEquals(projectBlueprintProposal(row, new Map()).detailRestricted, true);
  assertEquals(
    projectBlueprintProposal(
      row,
      new Map([["a:2026", { share_details: true }], ["b:2026", {
        share_details: true,
      }]]),
    ).power_team_proposal_members,
    [],
  );
});
Deno.test("Proposal detail and business sharing are independent, including after revoke", () => {
  const permissions = new Map([["a:2027", {
    share_details: true,
    share_business: false,
  }], ["b:2027", { share_details: true, share_business: true }]]);
  const projected = projectBlueprintProposal(row, permissions);
  const links = projected
    .power_team_proposal_members as typeof row.power_team_proposal_members;
  assertEquals(links[0].members.profession, "");
  assertEquals(links[1].members.company_name, "company");
  permissions.delete("b:2027");
  const revoked = projectBlueprintProposal(row, permissions);
  assertEquals(revoked.title, "");
  assertEquals(revoked.rationale, "");
  assertEquals(revoked.power_team_proposal_members, []);
});
Deno.test("Dashboard bundles and monthly calendar cannot bypass annual Blueprint permission", () => {
  const plan = {
    looking_for_categories: ["customer"],
    power_team_categories: ["partner"],
    looking_for_detail: "private",
    power_team_detail: "private",
    personal_goal_category: "personal",
    personal_goal_detail: "private",
    monthly_marketing_plan: [{ specific_looking_for: "private" }],
    expected_sales_from_bni_year: 300,
  };
  const restricted = projectBlueprintPlan(plan, undefined);
  assertEquals(restricted.power_team_categories, []);
  assertEquals(restricted.monthly_marketing_plan, []);
  assertEquals(restricted.personal_goal_detail, "");
  const categoriesOnly = projectBlueprintPlan(plan, {
    share_referral_focus: true,
    share_details: false,
  });
  assertEquals(categoriesOnly.looking_for_categories, ["customer"]);
  assertEquals(categoriesOnly.looking_for_detail, "");
  assertEquals(categoriesOnly.expected_sales_from_bni_year, 300);
});

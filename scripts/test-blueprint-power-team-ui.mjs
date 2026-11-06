// Browser fixtures only: no real member identity, database writes or LINE sends.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route("**/*", (r) => r.abort());
  const form = readFileSync("public/member-success-blueprint.html", "utf8");
  await page.setContent(
    form.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""),
  );
  await page.evaluate(() => {
    window.MY_IDEAL_RUNTIME = {
      apiUrl: "https://fixture.invalid",
      supabaseAnonKey: "fixture",
    };
    const data = new Map();
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: (k) => data.get(k) || null,
        setItem: (k, v) => data.set(k, v),
        removeItem: (k) => data.delete(k),
      },
    });
  });
  const code = [...form.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1]
    .replace(/\n\s*init\(\);\s*$/, "");
  await page.addScriptTag({ content: code });
  await page.evaluate(() => {
    draftScope = "member-a-2027";
    data.total_sales_target_year = "12345";
    persist();
    draftScope = "member-b-2027";
    data.total_sales_target_year = "";
    hydrateDraft();
  });
  assert.equal(await page.evaluate(() => data.total_sales_target_year), "");
  await page.evaluate(() => {
    localStorage.setItem(
      "msb_draft_2027",
      JSON.stringify({ total_sales_target_year: "private legacy" }),
    );
    hydrateDraft();
  });
  assert.equal(await page.evaluate(() => data.total_sales_target_year), "");
  await page.evaluate(() => {
    draftScope = "member-a-2027";
    localStorage.setItem(
      "msb_draft_" + draftScope,
      JSON.stringify({
        total_sales_target_year: "12345",
        growthConsent: {
          share_referral_focus: true,
          share_details: true,
          share_business: true,
        },
      }),
    );
    data.growthConsent = {
      share_referral_focus: false,
      share_details: false,
      share_business: false,
    };
    hydrateDraft();
  });
  assert.equal(
    await page.evaluate(() => data.growthConsent.share_referral_focus),
    false,
  );
  assert.equal(
    await page.evaluate(() => data.total_sales_target_year),
    "12345",
  );
  await page.evaluate(() => {
    step = 6;
    data.growthConsent = {
      share_referral_focus: false,
      share_details: false,
      share_business: false,
    };
    render();
  });
  assert.equal(await page.locator("fieldset input:checked").count(), 0);
  await page.getByLabel("แชร์รายละเอียดที่เขียนใน Blueprint เพื่อให้ Growth ช่วยวางแผน")
    .check();
  assert.equal(
    await page.evaluate(() => data.growthConsent.share_referral_focus),
    true,
  );
  await page.getByLabel("แชร์หมวด Looking For และ Power Team เพื่อช่วยหาโอกาสร่วมกัน")
    .uncheck();
  assert.equal(
    await page.evaluate(() => data.growthConsent.share_details),
    false,
  );
  await page.evaluate(() => {
    crypto.randomUUID = () => "10000000-0000-0000-0000-000000000099";
    data.total_sales_target_year = "";
    window.call = (action, payload, done) => {
      window.consentRequest = { action, payload };
      done({ ok: true, growthConsent: { updated_at: "2026-11-06T00:00:00Z" } });
    };
  });
  await page.locator("#save-growth-consent").click();
  const consentRequest = await page.evaluate(() => consentRequest);
  assert.equal(
    consentRequest.action,
    "saveMemberBlueprintGrowthConsentByToken",
  );
  assert.equal(
    consentRequest.payload.growthConsent.share_referral_focus,
    false,
  );
  assert.equal(await page.evaluate(() => data.total_sales_target_year), "");
  const builder = await browser.newPage();
  await builder.setContent('<button id="launch">Open</button>');
  await builder.evaluate(() => {
    crypto.randomUUID = () => "10000000-0000-0000-0000-000000000001";
    window.saved = 0;
    window.calls = [];
    window.gsr = (action, payload, done) => {
      calls.push({ action, payload });
      done(
        calls.length < 2
          ? { ok: false, error: "fixture failure" }
          : { ok: true },
      );
    };
  });
  await builder.addScriptTag({
    path: "public/assets/js/power-team-proposal-builder.js",
  });
  for (const width of [375, 768, 1440]) {
    await builder.setViewportSize({ width, height: 700 });
    await builder.locator("#launch").focus();
    await builder.evaluate(() =>
      openPowerTeamProposalBuilder(
        {
          eligibleMembers: [{ id: "a", name: "Member A" }, {
            id: "b",
            name: "Member B",
          }],
        },
        {},
        () => saved++,
      )
    );
    const box = await builder.locator("dialog").boundingBox();
    assert.ok(box.width <= width && box.height <= 700);
    if (width !== 1440) {
      await builder.keyboard.press("Escape");
      await builder.locator("dialog").waitFor({ state: "detached" });
      assert.equal(
        await builder.locator("#launch").evaluate((el) =>
          document.activeElement === el
        ),
        true,
      );
      continue;
    }
    await builder.locator('[name="title"]').fill("Shared customers");
    await builder.locator('[name="target"]').fill("Households");
    await builder.locator('[name="reason"]').fill("Shared customer hypothesis");
    await builder.locator('[name="member"][value="a"]').check();
    await builder.locator('[name="member"][value="b"]').check();
    await builder.locator('[name="confirmed"]').check();
    await builder.locator('button[type="submit"]').click();
    assert.equal(
      await builder.locator('[role="alert"]').innerText(),
      "fixture failure",
    );
    await builder.locator('button[type="submit"]').click();
    await builder.locator("dialog").waitFor({ state: "detached" });
    const calls = await builder.evaluate(() => calls);
    assert.equal(calls[0].payload.requestId, calls[1].payload.requestId);
    assert.deepEqual(calls[0].payload.memberIds, ["a", "b"]);
    assert.equal(await builder.evaluate(() => saved), 1);
  }
  const memberPage = await browser.newPage();
  await memberPage.setViewportSize({ width: 375, height: 700 });
  await memberPage.setContent("<button>MY121</button>");
  await memberPage.evaluate(() => {
    window.memberCalls = [];
    window.confirm = () => true;
    window.api = async (payload) => {
      memberCalls.push(payload);
      return payload.action === "get-my-power-teams"
        ? {
          ok: true,
          teams: [{
            id: "proposal",
            title: "<script>private</script>",
            targetCustomerGroup: "Households",
            year: 2027,
            official: false,
            response: "invited",
            members: [{ member_id: "a", members: { name: "Member A" } }],
          }],
        }
        : { ok: true };
    };
  });
  await memberPage.addScriptTag({ path: "public/liff/power-teams.js" });
  await memberPage.evaluate(() => openMyPowerTeams());
  assert.ok(
    (await memberPage.locator("dialog").innerText()).includes(
      "<script>private</script>",
    ),
  );
  assert.equal(await memberPage.locator("dialog script").count(), 0);
  await memberPage.locator('[data-pt-response="accepted"]').click();
  const response = await memberPage.evaluate(() =>
    memberCalls.find((c) => c.action === "respond-power-team-invitation")
  );
  assert.deepEqual(response, {
    action: "respond-power-team-invitation",
    proposalId: "proposal",
    status: "accepted",
    confirmed: true,
  });
  console.log(
    "PASS browser: member-isolated drafts, explicit annual Growth consent, responsive/keyboard manual Proposal and retry identity",
  );
} finally {
  await browser.close();
}

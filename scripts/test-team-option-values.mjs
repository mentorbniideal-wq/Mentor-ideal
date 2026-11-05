// Synthetic browser fixtures only. Never creates a live member.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
try {
  for (const file of ['public/dashboard.html', 'public/index.html']) {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    await page.setContent(readFileSync(file, 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
    await page.evaluate(() => {
      window.SUPABASE_API = 'https://fixture.invalid/api'; window.SUPABASE_ANON = 'synthetic-public-key';
      window.fetch = async () => ({ ok: true, json: async () => ({ ok: true, teams: [{ code: 'TOOMTAM', displayName: 'Mentor : Coordinator X' }] }) });
      document.body.insertAdjacentHTML('beforeend', '<select id="fixture-mentor"><option>TOOMTAM</option></select><select id="fixture-role"><option>toomtam</option></select>');
    });
    await page.addScriptTag({ path: 'public/assets/js/dynamic-team-labels.js' });
    await page.evaluate(() => BNITeamLabels.load());
    for (const selector of ['#fixture-mentor', '#fixture-role', file.includes('dashboard') ? '#nm-d-mentor' : '#nm-mentor']) {
      const expected = selector.includes('role') ? 'toomtam' : 'TOOMTAM';
      await page.locator(selector).selectOption(expected);
      await page.evaluate(() => { BNITeamLabels.apply(document); BNITeamLabels.apply(document); });
      assert.equal(await page.locator(selector).inputValue(), expected);
      assert.ok((await page.locator(selector + ' option:checked').innerText()).includes('Coordinator X'));
    }
    // The Desktop has a second label renderer. Verify either load order keeps
    // implicit role options and the member form's stored team code stable.
    if (file.includes('dashboard')) {
      const source = readFileSync('public/assets/js/desktop-operations.js', 'utf8');
      await page.addScriptTag({ content: source.slice(0, source.indexOf('function teamLeaderLabel(')) });
      await page.evaluate(() => {
        D.teamLabels = { TOOMTAM: 'Mentor : Coordinator Y' };
        document.body.insertAdjacentHTML('beforeend', '<select id="fixture-mentor-late"><option>TOOMTAM</option></select>');
        applyTeamDisplayLabels(); BNITeamLabels.apply(document); applyTeamDisplayLabels();
      });
      assert.equal(await page.locator('#fixture-mentor-late').inputValue(), 'TOOMTAM');
      assert.equal(await page.locator('#nm-d-mentor').inputValue(), 'TOOMTAM');
      assert.equal(await page.locator('#fixture-role').inputValue(), 'toomtam');
      const start = source.indexOf('function nmSave(){');
      const end = source.indexOf('\nfunction ', start + 1);
      await page.addScriptTag({ content: source.slice(start, end < 0 ? undefined : end) });
      await page.evaluate(() => {
        window.toast = () => {}; window.gsr = (action, payload, done) => { window.captured = { action, payload }; done({ ok: false, error: 'fixture only' }); };
        document.getElementById('nm-d-name').value = 'Synthetic Member';
        document.getElementById('nm-d-nick').value = 'Synthetic';
        document.getElementById('nm-d-date').value = '2026-11-05';
        nmSave();
      });
      const request = await page.evaluate(() => captured);
      assert.equal(request.action, 'addNewMember');
      assert.equal(request.payload.mentorTeam, 'TOOMTAM');
    }
    await page.close();
  }
  console.log('PASS team codes survive label updates, repeated renders, Desktop/Mobile and add-member payload');
} finally { await browser.close(); }

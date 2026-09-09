// Optional browser regression: PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/test-desktop-ui.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, extname } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve('public');
const server = createServer((req, res) => {
  try {
    const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(root + '/')) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', ({ '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png' })[extname(path)] || 'text/plain');
    res.end(readFileSync(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  let html = readFileSync('public/dashboard.html', 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace('<head>', `<head><base href="${origin}/">`);
  await page.setContent(html);
  await page.addScriptTag({ path: 'public/assets/js/desktop-navigation.js' });
  await page.addScriptTag({ path: 'public/assets/js/desktop-line-compose.js' });
  await page.evaluate(() => {
    document.body.classList.add('dark');
    document.querySelector('#login').style.display = 'none';
    document.querySelector('#ov').style.display = 'none';
    document.querySelector('#app').style.display = 'grid';
    document.querySelector('#mc-tabs-wrap').style.display = 'block';
    document.querySelector('#mc-tabs').style.display = 'flex';
    document.querySelectorAll('#mc-tabs .tb').forEach(button => {
      button.dataset.foldLabel = button.textContent.trim(); button.dataset.foldIcon = '●';
    });
    document.querySelector('#mc-ov').classList.add('on');
  });
  for (const width of [820, 1024, 1180, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.mouse.move(width - 10, 100);
    await page.locator('#app-workspace').focus();
    await page.locator('#mc-tabs').evaluate(el => { el.scrollTop = 0; });
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const layout = await page.evaluate(() => {
      const workspace = document.querySelector('#app-workspace').getBoundingClientRect();
      const rail = document.querySelector('#mc-tabs').getBoundingClientRect();
      return { x: workspace.x, y: workspace.y, width: workspace.width, railRight: rail.right };
    });
    assert.ok(layout.y < 200 && layout.width > 500 && layout.x >= layout.railRight - 2, `Visible workspace at ${width}: ${JSON.stringify(layout)}`);
    if (width <= 1180) {
      const tab = page.locator('#mc-tabs .tb').first();
      await tab.hover();
      const tip = page.locator('.desktop-nav-tooltip');
      assert.ok(await tip.isVisible(), `Tooltip at ${width}`);
      const bounds = await tip.boundingBox();
      assert.ok(bounds.x + bounds.width <= width && bounds.x >= layout.railRight, `Tooltip outside rail and inside viewport: ${JSON.stringify({width,bounds,layout})}`);
      await page.keyboard.press('Escape');
      assert.ok(!await tip.isVisible(), 'Escape dismisses tooltip');
      await tab.focus();
      assert.ok(await tip.isVisible(), 'Keyboard focus shows tooltip');
      await page.locator('#mc-tabs').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.waitForFunction(() => document.querySelector('.desktop-nav-tooltip').hidden);
    }
  }
  const overflow = [];
  for (const dark of [false, true]) {
    await page.evaluate(dark => document.body.classList.toggle('dark', dark), dark);
    for (const width of [375, 600, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const failures = await page.evaluate(() => {
        if(document.documentElement.scrollWidth > innerWidth + 2) return [{id:'document',width:document.documentElement.scrollWidth,available:innerWidth}];
        const workspace = document.querySelector('#app-workspace');
        const sections = [...workspace.querySelectorAll('.sec')];
        const failed = [];
        for (const section of sections) {
          sections.forEach(s => s.classList.remove('on'));
          section.classList.add('on');
          if (workspace.scrollWidth > workspace.clientWidth + 2) {
            failed.push({ id: section.id, width: workspace.scrollWidth, available: workspace.clientWidth });
          }
        }
        return failed;
      });
      if (failures.length) overflow.push({dark,width,failures});
    }
  }
  assert.deepEqual(overflow, [], 'Desktop sections must fit workspace (wide tables scroll inside their own wrapper)');
  const nickname = '\\"\'><img src=x onerror=alert(1)>';
  await page.evaluate(nick => { window.S = { role: 'mc' }; _renderDeskLineTpls(nick); }, nickname);
  assert.equal(await page.locator('#desk-line-tpls img').count(), 0, 'Nickname is not markup');
  await page.locator('#desk-line-tpls button').first().evaluate(button => button.click());
  assert.ok((await page.locator('#desk-line-txt').inputValue()).includes(nickname), 'Template retains literal nickname');
  for (const [result, count] of [[{ ok: true, sent: 25 }, 25], [{ ok: true, sent: true }, 1], [{ ok: true, sent: false }, 0], [{ ok: true, sentCount: 12 }, 12]]) {
    await page.evaluate(result => {
      window.esc = value => String(value);
      openLineSendReview({ message: 'Test only', onConfirm: (_message, done) => done(result) });
      confirmLineSendReview();
    }, result);
    assert.ok((await page.locator('#line-review-result').innerText()).includes(`ส่งสำเร็จ ${count} ·`), `Truthful sent count ${count}`);
  }
  await page.setViewportSize({width:375,height:600});
  const modal = await page.locator('.line-review-card').boundingBox();
  assert.ok(modal.x >= 0 && modal.x + modal.width <= 376 && modal.height <= 600, 'Review dialog fits short narrow viewport');
  await page.evaluate(() => closeLineSendReview());
  for(const id of ['bk-modal','gsh-modal','rd-modal','ml-modal','nm-modal','cmp-modal','cm-modal']) {
    const overlay=page.locator('#'+id);
    if(!await overlay.count()) continue;
    await overlay.evaluate(el=>el.style.display='flex');
    const box=await overlay.locator(':scope > div').first().boundingBox();
    assert.ok(box && box.x>=0 && box.x+box.width<=376 && box.height<=600, 'Dialog fits: '+id);
    await overlay.evaluate(el=>el.style.display='none');
  }
  await page.evaluate(() => {
    closeLineSendReview();
    const workspace=document.querySelector('#app-workspace');
    workspace.innerHTML='<section class="sec on"><h2>Responsive test</h2><div class="tw" tabindex="0"><table style="min-width:1200px"><tbody><tr><td>Long table content</td><td>Second column</td></tr></tbody></table></div><div class="desktop-fluid-grid" style="display:grid;grid-template-columns:1fr 1fr"><label>First field<input value="Test"></label><label>Second field<input value="Test"></label></div></section>';
  });
  const tableSize=await page.locator('.tw').evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth}));
  assert.ok(tableSize.scroll>tableSize.width,'Wide table scrolls locally');
  assert.ok(await page.locator('#app-workspace').evaluate(el=>el.scrollWidth<=el.clientWidth+2),'Populated content fits workspace');
  if(process.env.DESKTOP_SCREENSHOT_DIR){
    await page.screenshot({path:process.env.DESKTOP_SCREENSHOT_DIR+'/desktop-narrow.png'});
  }
  console.log('PASS Desktop: all static sections at 6 widths in both themes, compact navigation, narrow dialog, wide table, template escaping and LINE counts');
} finally { await browser.close(); await new Promise(done => server.close(done)); }

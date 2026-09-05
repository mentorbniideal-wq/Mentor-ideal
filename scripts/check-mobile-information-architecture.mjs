import { readFile } from 'node:fs/promises';

const html = await readFile('public/index.html', 'utf8');
const css = await readFile('public/assets/css/mobile-focus.css', 'utf8');
const js = await readFile('public/assets/js/mobile-operations.js', 'utf8');
const adminJs = await readFile('public/assets/js/mobile-operations-admin.js', 'utf8');
const auth = await readFile('supabase/functions/api/handlers/auth.ts', 'utf8');
const failures = [];

function between(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from + start.length);
  return from >= 0 && to > from ? html.slice(from, to) : '';
}
function expect(condition, message) {
  if (!condition) failures.push(message);
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
expect(!duplicates.length, `duplicate element IDs: ${duplicates.join(', ')}`);

expect(!between('id="mc-dashboard"', 'id="mc-memberhub"').includes('id="mc-members"'), 'MC Today must not contain the full member directory');
expect(!between('id="mentor-myteam"', 'id="mentor-work"').includes('id="mentor-members"'), 'Mentor Today must not contain the full member directory');
expect(!between('id="g-dashboard"', 'id="g-memberhub"').includes('id="g-members"'), 'Growth Today must not contain the full member directory');
expect(between('id="g-memberhub"', 'id="g-analytics"').includes('id="g-members"'), 'Growth member directory must remain accessible');
expect(html.includes('mobile-focus.css'), 'mobile focus stylesheet must be loaded');
expect(css.includes('position:fixed') && css.includes('safe-area-inset-bottom'), 'mobile navigation must be fixed and safe-area aware');
expect(js.includes("(r.isSystemOwner||r.role==='mc')"), 'only owner and Mentor Co. may see workspace chooser');
expect(js.includes("growth.style.display=isOwner?'flex':'none'"), 'Growth Desktop must be hidden from Mentor Co. chooser');
expect(!between('id="mentorApp"', '<!-- Growth App -->').includes('openRoleSwitcher()'), 'Mentor header must not expose role switching');
expect(adminJs.includes("if(!S||!S.isSystemOwner)"), 'admin panel and role switcher need owner guards');
expect(auth.includes('!authResult.isSystemOwner'), 'PIN changes must require the verified system owner');
expect(html.includes('id="welcomeTransition"'), 'authenticated mobile entry needs a welcome transition');
expect(js.includes('showWelcomeTransition(r'), 'all authenticated mobile roles need to pass through the welcome transition');
expect(js.includes('_skipWelcome:true'), 'welcome transition must run once per authenticated entry');

if (failures.length) {
  console.error(failures.map(item => `FAIL ${item}`).join('\n'));
  process.exit(1);
}
console.log('PASS mobile information architecture and navigation guards');

import { readFile } from 'node:fs/promises';

const html = await readFile('public/index.html', 'utf8');
const css = await readFile('public/assets/css/mobile-focus.css', 'utf8');
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

if (failures.length) {
  console.error(failures.map(item => `FAIL ${item}`).join('\n'));
  process.exit(1);
}
console.log('PASS mobile information architecture and navigation guards');


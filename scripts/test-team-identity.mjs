import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const shared = read('public/assets/js/dynamic-team-labels.js');
const desktop = read('public/assets/js/desktop-operations.js');
const mobile = read('public/assets/js/mobile-operations.js');
const adminAuth = read('public/admin/_auth.js');
const migration = read('supabase/migrations/20260906000000_sync_role_display_from_team_display.sql');

const failures = [];
for (const [name, source] of [['shared', shared], ['desktop', desktop], ['mobile', mobile]]) {
  if (/createTreeWalker/.test(source)) failures.push(`${name} still rewrites arbitrary text nodes`);
  if (/applyVisible(?:Mobile)?TeamLabels/.test(source)) failures.push(`${name} still contains the unsafe global label rewriter`);
}
if (/Mentor:\s*AMP/.test(adminAuth)) failures.push('legacy admin login exposes the retired leader label');
if (!/NULLIF\(btrim\(NEW\.display_name\)/.test(migration)) failures.push('role sync does not prefer mentor_teams.display_name');
if (!/team_name = NEW\.name/.test(migration)) failures.push('role sync no longer preserves the stable team code');
if (!/ย้ายไป\\s\+/.test(shared)) failures.push('team label replacement no longer preserves action prefixes');

if (failures.length) {
  console.error(failures.map((item) => `FAIL: ${item}`).join('\n'));
  process.exit(1);
}
console.log('Team identity regression checks passed.');

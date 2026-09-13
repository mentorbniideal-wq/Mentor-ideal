import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('public/growth-mobile.html', 'utf8');
const base = readFileSync('public/assets/js/growth-mobile.js', 'utf8');
const ops = readFileSync('public/assets/js/growth-mobile-ops.js', 'utf8');
const css = readFileSync('public/assets/css/growth-mobile.css', 'utf8');

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
assert.deepEqual(duplicates, [], `duplicate ids: ${duplicates.join(', ')}`);

for (const id of ['gm-home-search', 'gm-next-actions', 'gm-workload', 'gm-owner-workload', 'gm-handoffs', 'gm-opportunities', 'gm-sheet-body']) {
  assert.ok(html.includes(`id="${id}"`), `missing Growth Mobile target ${id}`);
}

assert.ok(html.includes('enterkeyhint="search"'), 'member search needs a mobile search action');
assert.ok(html.includes('/assets/js/growth-mobile-ops.js'), 'operational layer must be loaded');
assert.ok(!base.includes("api('getMemberDetail'"), 'Growth Mobile must not call the Mentor-private Member 360 contract');
assert.ok(ops.includes("api('getGrowthMemberContext'"), 'member card and conversation must use the Growth-safe context');
assert.ok(ops.includes("e.key!=='Enter'") && ops.includes('openGrowthMember(found.id||found.memberId)'), 'hero search must open a member card');
assert.ok(ops.includes('data-talk-member') && ops.includes('data-conversation-followup'), 'conversation must end in a tracked action');
assert.ok(ops.includes('data-open-growth-tasks'), 'memberless priorities must have a working fallback');
assert.ok(css.includes('env(safe-area-inset-bottom)'), 'mobile navigation must respect the device safe area');
assert.ok(css.includes('@media'), 'Growth Mobile must include responsive rules');

console.log('PASS Growth Mobile structure, privacy path, actions, and responsive guards');

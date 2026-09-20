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

assert.ok(html.includes('id="gm-view-weekly"') && html.includes('id="gm-weekly-board"'), 'Weekly Action Board needs a dedicated Mobile view');
assert.ok(html.includes('data-view="weekly"'), 'Weekly Action Board needs a Mobile navigation entry point');
assert.ok(html.includes('/assets/js/growth-weekly-board.js'), 'Weekly Action Board classifier must load before the Mobile workflow');
assert.ok(base.includes("section('ยังไม่มอบหมาย'") && base.includes("section('เกินกำหนด'") && base.includes("section('รอสมาชิก'"), 'Mobile Board must group each open task by the defined precedence');
const weeklyBoardSource = base.slice(base.indexOf('function renderWeeklyBoard'), base.indexOf('window.growthMobileIsDone'));
assert.ok(weeklyBoardSource.includes('data-go="tasks"') && weeklyBoardSource.includes('data-go="support"'), 'Board actions must reuse existing Task and Handoff workflows');
assert.ok(!weeklyBoardSource.includes("api('acceptGrowthHandoff'"), 'Board must not duplicate handoff mutations');
assert.ok(base.includes('window.growthMobileRenderedTaskState=state.tasks'), 'Task renderer must record the state already rendered to the Board');
assert.ok(ops.includes('window.growthMobileRenderedTaskState!==state.tasks&&window.growthMobileRenderTasks'), 'existing operations must refresh Task and Board views after replacing task state without another API call');

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

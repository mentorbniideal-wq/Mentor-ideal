import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('public/growth-mobile.html', 'utf8');
const base = readFileSync('public/assets/js/growth-mobile.js', 'utf8');
const ops = readFileSync('public/assets/js/growth-mobile-ops.js', 'utf8');
const css = readFileSync('public/assets/css/growth-mobile.css', 'utf8');
const actionBoard = readFileSync('public/assets/js/growth-mobile-action-board.js', 'utf8');

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
assert.deepEqual(duplicates, [], `duplicate ids: ${duplicates.join(', ')}`);

for (const id of ['gm-home-search', 'gm-next-actions', 'gm-today-summary', 'gm-power-actions', 'gm-workload', 'gm-owner-workload', 'gm-handoffs', 'gm-opportunities', 'gm-sheet-body']) {
  assert.ok(html.includes(`id="${id}"`), `missing Growth Mobile target ${id}`);
}

assert.ok(html.includes('id="gm-view-weekly"') && html.includes('id="gm-weekly-board"'), 'Weekly Action Board needs a dedicated Mobile view');
assert.ok(html.includes('data-view="today"') && html.includes('data-view="tasks"') && html.includes('data-view="members"') && html.includes('data-view="power"'), 'Mobile navigation must keep the four action-first destinations');
assert.ok(!html.includes('grid-template-columns:repeat(6,1fr)'), 'Mobile navigation must not retain the old six-tab layout');
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
assert.ok(ops.includes("api('getSharedMemberSupportContext'"), 'Growth 360 must compose the existing shared, privacy-safe support contract');
assert.ok(ops.includes('Growth 360 · Blueprint & การดูแลร่วม') && ops.includes('Number(row.year)===2026||Number(row.year)===2027'), 'member card must show the two planning years and shared operational status');
assert.ok(ops.includes('ไม่แสดง Mentor notes, coaching หรือ MY121 private text'), 'Growth 360 must explicitly preserve the Mentor and MY121 private-data boundary');
assert.ok(ops.includes("e.key!=='Enter'") && ops.includes('openGrowthMember(found.id||found.memberId)'), 'hero search must open a member card');
assert.ok(ops.includes('data-talk-member') && ops.includes('data-conversation-followup'), 'conversation must end in a tracked action');
assert.ok(ops.includes('data-open-growth-tasks'), 'memberless priorities must have a working fallback');
assert.ok(css.includes('env(safe-area-inset-bottom)'), 'mobile navigation must respect the device safe area');
assert.ok(css.includes('@media'), 'Growth Mobile must include responsive rules');
assert.ok(html.includes('/assets/js/growth-mobile-action-board.js'), 'action board must load after the existing Growth Mobile workflows');
assert.ok(actionBoard.includes('MENTOR HANDOFF') && actionBoard.includes('CONNECTION OPPORTUNITY') && actionBoard.includes('FOLLOW-UP'), 'Today must compose the approved explainable action types');
assert.ok(actionBoard.includes('detailRestricted') && actionBoard.includes('รายละเอียดถูกจำกัดตามสิทธิ์และการยินยอม'), 'restricted handoff detail must stay redacted in the action board');
assert.ok(actionBoard.includes("data-go=\"support\"") && actionBoard.includes("data-go=\"tasks\""), 'Today CTAs must navigate to existing workflows instead of duplicating mutations');
assert.ok(!actionBoard.includes('getMemberDetail') && !actionBoard.includes('createGrowthTask') && !actionBoard.includes('acceptGrowthHandoff'), 'action board must not broaden private reads or duplicate mutations');
assert.ok(base.includes('state.opportunities=results[4].value.opportunities') && base.includes('state.connections=results[4].value.connections'), 'existing Growth Priority response must power Today and Power Team composition');
assert.ok(base.includes('growthMobileActionBoardRefresh'), 'action board must refresh after safe Growth state loads');
assert.ok(base.includes('t.isAssignedOwner===true'), 'regular Growth must render task mutation controls only for server-marked owned tasks');

console.log('PASS Growth Mobile structure, privacy path, actions, and responsive guards');

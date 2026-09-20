import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/assets/js/growth-weekly-board.js',import.meta.url),'utf8');
const context={window:{},Intl,Date};vm.createContext(context);vm.runInContext(source,context);
const board=context.window.GrowthWeeklyBoard;
const mondayBangkok=new Date('2026-09-20T17:30:00Z'); // Mon 21 Sep, 00:30 Bangkok
assert.equal(board.dateKey(mondayBangkok),'2026-09-21');
assert.equal(board.weekEndKey(mondayBangkok),'2026-09-27');
const tasks=[
  {id:'unassigned',status:'new'},
  {id:'overdue',status:'waiting_member',assignedOwnerEmail:'owner@example.test',dueDate:'2026-09-20'},
  {id:'waiting',status:'waiting_member',assignedOwnerEmail:'owner@example.test',dueDate:'2026-10-01'},
  {id:'due',status:'new',assignedOwnerEmail:'owner@example.test',dueDate:'2026-09-27'},
  {id:'later',status:'new',assignedOwnerEmail:'owner@example.test',dueDate:'2026-09-28'},
  {id:'missing',status:'new',assignedOwnerEmail:'owner@example.test'},
  {id:'closed',status:'completed',assignedOwnerEmail:'owner@example.test',dueDate:'2026-09-20'},
  {id:'due',status:'new',assignedOwnerEmail:'owner@example.test',dueDate:'2026-09-27'}
];
const coordinator=board.classify(tasks,{coordinator:true,now:mondayBangkok});
assert.deepEqual(JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(coordinator.groups).map(([key,value])=>[key,value.map(task=>task.id)])))),{unassigned:['unassigned'],overdue:['overdue'],waiting:['waiting'],due:['due'],remaining:['later','missing']});
const member=board.classify(tasks,{coordinator:false,now:mondayBangkok});
assert.deepEqual(JSON.parse(JSON.stringify(member.groups.unassigned.map(task=>task.id))),[]);
assert.deepEqual(JSON.parse(JSON.stringify(member.groups.remaining.map(task=>task.id))),['unassigned','later','missing']);
assert.equal(board.safeDetail('private text',true),'รายละเอียดถูกจำกัดตามสิทธิ์และการยินยอม');
assert.equal(board.safeDetail('',false),'ไม่มีรายละเอียดที่แชร์ได้');
assert.deepEqual(JSON.parse(JSON.stringify(board.taskBadges(tasks[1],coordinator))),['เกินกำหนด','รอสมาชิก']);
const dashboard=fs.readFileSync(new URL('../public/dashboard.html',import.meta.url),'utf8');
const desktop=fs.readFileSync(new URL('../public/assets/js/desktop-growth-workspace.js',import.meta.url),'utf8');
assert.ok(dashboard.includes('data-growth-health-view="weekly"'), 'Desktop needs a dedicated Weekly Action Board panel');
assert.ok(desktop.includes("['weekly','▦','Weekly Action Board']"), 'Desktop needs a Weekly Action Board navigation entry');
assert.ok(desktop.includes("window.gsr('getGrowthTasks'"), 'Desktop Board must reuse the safe Growth Task read contract');
assert.ok(desktop.includes("window.gsr('getGrowthSupportHandoffs'"), 'Desktop Coordinator Board must reuse the safe handoff read contract');
assert.ok(desktop.includes("window.S&&window.S.capabilities"), 'Desktop Coordinator visibility must derive from server-returned capabilities');
console.log('growth weekly board tests passed');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../public/assets/js/desktop-power-team-hub.js', import.meta.url), 'utf8');
const events = {};
const root = { innerHTML: '', contains: () => true };
const calls = [];
let response;
const context = {
  document: { getElementById: id => id === 'pt-mgr-content' ? root : null, addEventListener: (name, fn) => { events[name] = fn; } },
  window: {},
  esc: text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
  gsr: (action, payload, done) => { calls.push({ action, payload }); done(action === 'getPowerTeamProposals' ? response : { ok: true }); },
  toast: () => {}, prompt: () => null, confirm: () => false,
};
vm.runInNewContext(code, context);

response = { ok: true, candidates: [], proposals: [{ id: 'p1', title: '<script>x</script>', status: 'assigned', assigned_owner_email: 'other@test.invalid', target_customer_group: 'private', power_team_proposal_members: [], detailRestricted: false }], officialTeams: [], canCoordinate: false, canApprove: false, canManageAssigned: true, viewerEmail: 'member@test.invalid' };
context.window.ptLoad(true);
assert.match(root.innerHTML, /&lt;script&gt;/);
assert.doesNotMatch(root.innerHTML, /data-pt-action="assign"|data-pt-action="status"|data-pt-action="publish"/);

response.proposals[0].assigned_owner_email = 'member@test.invalid';
response.proposals[0].detailRestricted = true;
context.window.ptLoad(true);
assert.match(root.innerHTML, /data-pt-action="status"/);
assert.doesNotMatch(root.innerHTML, /private|&lt;script&gt;/);

response.canCoordinate = true;
response.canApprove = true;
response.candidates = [{ category: 'A', memberIds: ['a','b'], members: [], targetCustomerGroup: 'A', rationale: 'safe' }];
response.proposals[0].status = 'active';
context.window.ptLoad(true);
assert.match(root.innerHTML, /data-pt-action="assign"/);
assert.match(root.innerHTML, /data-pt-action="publish"/);
assert.match(root.innerHTML, /ทีมร่างจาก Blueprint/);
assert.match(root.innerHTML, /Power Team จริง/);
assert.equal(calls.filter(call => call.action === 'getPowerTeamProposals').length, 3);
context.window.ptLoad();
assert.equal(calls.filter(call => call.action === 'getPowerTeamProposals').length, 3, 'reopening cached board must not duplicate fetch');
context.confirm = () => true;
events.click({ target: { closest: () => ({ getAttribute: name => name === 'data-pt-action' ? 'publish' : 'p1' }) } });
assert.equal(calls.filter(call => call.action === 'publishGrowthPowerTeam').length, 1);
assert.equal(calls.find(call => call.action === 'publishGrowthPowerTeam').payload.confirmed, true);
assert.equal(calls.filter(call => call.action === 'getPowerTeamProposals').length, 4, 'successful mutation refreshes once');
console.log('Desktop Power Team hub behavior: PASS');

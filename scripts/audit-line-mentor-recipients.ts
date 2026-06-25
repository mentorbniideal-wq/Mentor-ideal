// Read-only audit: verify MC and every Mentor Team leader can receive LINE alerts.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) throw new Error('Missing Supabase environment');
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: settings } = await db.from('settings')
  .select('key, value')
  .or('key.in.(MC_LINE_USER_ID,MC_LINE_ID,LINE_ID_MC),key.like.LINE_ID_%');
const mcReady = (settings || []).some(row => String(row.value || '').startsWith('U'));
console.log(`${mcReady ? 'PASS' : 'FAIL'}  MC LINE recipient`);

const [{ data: teams }, { data: members }, { data: links }, { data: assignments }] = await Promise.all([
  db.from('mentor_teams').select('name, leader_name').order('id'),
  db.from('members').select('id, name, nickname, email').eq('is_archived', false),
  db.from('line_members').select('member_id, line_user_id'),
  db.from('role_assignments').select('role, email, team_name, is_mentor'),
]);
const linkedIds = new Set((links || []).map(row => String(row.member_id)));
const mcAssignment = (assignments || []).find(row => String(row.role || '').toLowerCase() === 'mc');
let failed = mcReady ? 0 : 1;
for (const team of teams || []) {
  const leaderKey = normalize(team.leader_name);
  const leader = (members || []).find(member => {
    const name = normalize(member.name);
    const nickname = normalize(member.nickname);
    return leaderKey && (name.includes(leaderKey) || nickname.includes(leaderKey) || leaderKey.includes(nickname));
  });
  const settingKey = `LINE_ID_${String(team.name).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  const configured = (settings || []).some(row =>
    row.key === settingKey && String(row.value || '').startsWith('U')
  );
  const assignment = (assignments || []).find(row =>
    row.is_mentor === true &&
    String(row.team_name || '').toLowerCase() === String(team.name).toLowerCase() ||
    row.is_mentor === true &&
    String(row.role || '').toLowerCase() === String(team.name).toLowerCase()
  );
  const assignedMember = assignment
    ? (members || []).find(member =>
      String(member.email || '').toLowerCase() === String(assignment.email || '').toLowerCase()
    )
    : null;
  const ready = configured ||
    (mcReady && String(mcAssignment?.team_name || '').toLowerCase() === String(team.name).toLowerCase()) ||
    Boolean(leader && linkedIds.has(String(leader.id))) ||
    Boolean(assignedMember && linkedIds.has(String(assignedMember.id)));
  if (!ready) failed++;
  console.log(`${ready ? 'PASS' : 'FAIL'}  ${team.name} → ${team.leader_name}`);
}
if (failed) Deno.exit(1);

function normalize(value: unknown): string {
  return String(value || '').toLocaleLowerCase('th-TH').replace(/[^a-z0-9ก-๙]/g, '');
}

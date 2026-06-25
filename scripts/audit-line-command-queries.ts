// Read-only production query audit for LINE command dependencies.
// Run with: deno run --allow-env --allow-net --env-file=.env scripts/audit-line-command-queries.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

const db = createClient(url, key, { auth: { persistSession: false } });
const checks: { name: string; run: () => PromiseLike<{ data: unknown; error: { message: string } | null }> }[] = [
  {
    name: 'status / member dashboard',
    run: () => db.from('v_member_dashboard')
      .select('id, name, nickname, mentor_team, display_score, traffic_light, palms_detail, days_to_expiry')
      .eq('is_archived', false)
      .limit(1),
  },
  {
    name: 'history / chapter trend',
    run: () => db.from('v_score_history')
      .select('name, month_label, year, score, traffic_light, sort_key')
      .order('sort_key', { ascending: false })
      .limit(3),
  },
  {
    name: 'Traffic Lights Evolution average',
    run: () => db.from('traffic_light_evolution_summary')
      .select('member_id, average_score, source_column, synced_at')
      .limit(3),
  },
  {
    name: 'monthly PALMS five-key snapshots',
    run: () => db.from('palms_key_snapshots')
      .select('member_id, year, month, referral_pts, visitor_pts, one_to_one_pts, ceu_pts, tyfcb_pts')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(3),
  },
  {
    name: 'team definitions',
    run: () => db.from('mentor_teams').select('id, name, leader_name').order('id').limit(20),
  },
  {
    name: 'linked LINE member relation',
    run: () => db.from('line_members')
      .select('member_id, members(name, nickname, mentor_team)')
      .limit(1),
  },
  {
    name: '1-2-1 tracker relation',
    run: () => db.from('one_to_one_logs')
      .select('scheduled_date, met_at, outcome, members!partner_id(nickname, name)')
      .limit(1),
  },
  {
    name: 'smart-match business relation',
    run: () => db.from('biz_profiles')
      .select('member_id, description, members!member_id(name, nickname, mentor_team, is_archived)')
      .limit(3),
  },
  {
    name: 'goals',
    run: () => db.from('line_goals').select('member_id, goal_type, target').limit(3),
  },
  {
    name: 'notification preferences',
    run: () => db.from('line_notif_settings').select('member_id, notif_type, is_muted').limit(3),
  },
  {
    name: 'mentor support issues',
    run: () => db.from('line_issues').select('member_id, issue_text, reported_at, resolved_at').limit(3),
  },
  {
    name: 'absence records',
    run: () => db.from('line_absence_log').select('member_id, absence_type, week_date, cancelled_at').limit(3),
  },
];

let failed = 0;
for (const check of checks) {
  const { data, error } = await check.run();
  if (error) {
    failed++;
    console.error(`FAIL  ${check.name}: ${error.message}`);
    continue;
  }
  const count = Array.isArray(data) ? data.length : data ? 1 : 0;
  console.log(`PASS  ${check.name} (${count} sample row${count === 1 ? '' : 's'})`);
}

if (failed) {
  console.error(`\n${failed}/${checks.length} query contracts failed`);
  Deno.exit(1);
}
console.log(`\n${checks.length}/${checks.length} read-only query contracts passed`);

// Context builders intentionally exclude private notes, private mentor feedback,
// verification codes, LINE user IDs, contact details, and third-party identities.

type Db = { from: (table: string) => any };
type Row = Record<string, unknown>;

function settled<T>(result: { data?: T | null; error?: unknown }): T | null {
  return result.error ? null : result.data || null;
}

export async function buildMemberCopilotContext(
  db: Db,
  memberId: string,
  member: Row,
): Promise<Row> {
  if (!memberId) return { profile: member, contextStatus: 'member_id_missing' };
  const [goalsRes, bizRes, issuesRes, followupsRes, logsRes, blueprintRes] = await Promise.all([
    db.from('line_goals').select('goal_type, target, set_at').eq('member_id', memberId).order('set_at', { ascending: false }),
    db.from('biz_profiles').select('description, updated_at').eq('member_id', memberId).maybeSingle(),
    db.from('line_issues').select('reported_at, resolved_at, issue_text, mentor_response').eq('member_id', memberId)
      .order('reported_at', { ascending: false }).limit(5),
    db.from('one_to_one_follow_up_actions')
      .select('action_type, description, due_date, status, created_at')
      .eq('owner_member_id', memberId).in('status', ['pending', 'in_progress', 'overdue'])
      .order('due_date', { ascending: true }).limit(8),
    db.from('one_to_one_logs')
      .select('scheduled_date, met_at, outcome, initiator_id, partner_id, partner_name')
      .or(`initiator_id.eq.${memberId},partner_id.eq.${memberId}`)
      .order('created_at', { ascending: false }).limit(6),
    db.from('member_success_blueprints')
      .select('blueprint_year, looking_for_categories, looking_for_detail, personal_goal_category, personal_goal_detail, referral_per_month, status, updated_at')
      .eq('member_id', memberId).order('blueprint_year', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const issues = (settled<Row[]>(issuesRes) || []).map((row) => ({
    reportedAt: row.reported_at,
    status: row.resolved_at ? 'resolved' : 'open',
    request: row.issue_text,
    mentorResponse: row.mentor_response || null,
  }));
  return {
    profile: member,
    businessProfile: settled<Row>(bizRes),
    goals: settled<Row[]>(goalsRes) || [],
    blueprint: settled<Row>(blueprintRes),
    oneToOne: {
      recentCount: (settled<Row[]>(logsRes) || []).length,
      recent: settled<Row[]>(logsRes) || [],
      openFollowUps: settled<Row[]>(followupsRes) || [],
    },
    mentorSupport: {
      openCount: issues.filter((row) => row.status === 'open').length,
      recent: issues,
    },
  };
}

export async function enrichOperationalMembers(db: Db, members: Row[]): Promise<{
  members: Row[];
  operationalSummary: Row;
}> {
  const ids = members.map((row) => String(row.id || '')).filter(Boolean);
  if (!ids.length) return { members, operationalSummary: { dataStatus: 'no_members' } };
  const [issuesRes, followupsRes, attentionRes, goalsRes] = await Promise.all([
    db.from('line_issues').select('member_id, reported_at').in('member_id', ids).is('resolved_at', null),
    db.from('one_to_one_follow_up_actions').select('owner_member_id, due_date, status')
      .in('owner_member_id', ids).in('status', ['pending', 'in_progress', 'overdue']),
    db.from('one_to_one_attention_items').select('member_id, level, reason, due_date')
      .in('member_id', ids).in('status', ['open', 'reviewed', 'snoozed']),
    db.from('line_goals').select('member_id, goal_type, target').in('member_id', ids),
  ]);
  const issues = settled<Row[]>(issuesRes) || [];
  const followups = settled<Row[]>(followupsRes) || [];
  const attention = settled<Row[]>(attentionRes) || [];
  const goals = settled<Row[]>(goalsRes) || [];
  const count = (rows: Row[], key: string, id: string) => rows.filter((row) => String(row[key] || '') === id).length;
  return {
    members: members.map((member) => {
      const id = String(member.id || '');
      return {
        ...member,
        openHelpCases: count(issues, 'member_id', id),
        openFollowUps: count(followups, 'owner_member_id', id),
        attentionItems: attention.filter((row) => String(row.member_id || '') === id)
          .map(({ level, reason, due_date }) => ({ level, reason, dueDate: due_date })),
        activeGoals: goals.filter((row) => String(row.member_id || '') === id)
          .map(({ goal_type, target }) => ({ type: goal_type, target })),
      };
    }),
    operationalSummary: {
      openHelpCases: issues.length,
      openFollowUps: followups.length,
      overdueFollowUps: followups.filter((row) => row.status === 'overdue').length,
      attentionItems: attention.length,
      membersWithGoals: new Set(goals.map((row) => String(row.member_id || ''))).size,
    },
  };
}

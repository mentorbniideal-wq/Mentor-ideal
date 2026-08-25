// Resolve operational LINE recipients from the active LT term assignments.
type Db = { from: (table: string) => any };

export const LT_ROLE_SCOPES: Record<string, string[]> = {
  'Membership Committee': ['absence', 'renewal'],
  'Secretary/Treasurer': ['absence', 'renewal', 'training'],
  'Visitor Host': ['visitor'],
  'Event Coordinator': ['visitor'],
  'Mentor Coordinator': ['member_help', 'new_member'],
  'Growth Coordinator': ['goal'],
  'Network Education Coordinator': ['training'],
};

export function ltRolesForScope(scope: string): string[] {
  return Object.entries(LT_ROLE_SCOPES)
    .filter(([, scopes]) => scopes.includes(scope))
    .map(([role]) => role);
}

export async function resolveLtLineRecipients(
  db: Db,
  scope: string,
): Promise<{ recipients: string[]; roles: string[]; missingRoles: string[] }> {
  const roles = ltRolesForScope(scope);
  if (!roles.length) return { recipients: [], roles: [], missingRoles: [] };

  const { data: rows } = await db.from('passport_lt_assignments')
    .select('lt_role,assigned_member_id,fallback_member_id,notification_scopes,term_id,lt_terms!left(status,starts_on,ends_on)')
    .eq('is_active', true)
    .in('lt_role', roles);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const activeRows = (rows || []).filter((row: Record<string, unknown>) => {
    const term = row.lt_terms as Record<string, unknown> | null;
    if (!term) return true; // compatibility with assignments created before terms
    return term.status === 'active' && String(term.starts_on || '') <= today && String(term.ends_on || '') >= today;
  });
  const memberIds = [...new Set(activeRows.flatMap((row: Record<string, unknown>) =>
    [row.assigned_member_id, row.fallback_member_id].map(String).filter(Boolean)
  ))];
  const { data: links } = memberIds.length
    ? await db.from('line_members').select('member_id,line_user_id').in('member_id', memberIds)
    : { data: [] };
  const byMember = new Map<string, string>((links || []).map((row: Record<string, unknown>): [string, string] =>
    [String(row.member_id), String(row.line_user_id || '')]
  ));
  const recipients = new Set<string>();
  for (const row of activeRows as Record<string, unknown>[]) {
    const primary = byMember.get(String(row.assigned_member_id || ''));
    const fallback = byMember.get(String(row.fallback_member_id || ''));
    if (primary) recipients.add(primary);
    else if (fallback) recipients.add(fallback);
  }
  const configuredRoles = new Set(activeRows.map((row: Record<string, unknown>) => String(row.lt_role)));
  return {
    recipients: [...recipients],
    roles,
    missingRoles: roles.filter(role => !configuredRoles.has(role)),
  };
}

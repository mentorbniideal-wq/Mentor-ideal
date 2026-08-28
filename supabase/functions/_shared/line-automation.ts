type DbClient = { from: (table: string) => any };

export async function lineAutomationDecision(db: DbClient, automationKey: string) {
  const { data, error } = await db.from('line_automation_controls')
    .select('automation_key,name,enabled,protected,importance,custom_message')
    .eq('automation_key', automationKey)
    .maybeSingle();
  // Fail open during migration rollout so a missing table never breaks critical jobs.
  if (error || !data) return { allowed: true, reason: error ? 'control_unavailable' : 'not_catalogued' };
  return {
    allowed: Boolean(data.enabled) || Boolean(data.protected),
    reason: data.enabled ? 'enabled' : data.protected ? 'protected' : 'disabled_by_admin',
    control: data,
  };
}

export function lineAutomationMessage(decision: Record<string, any> | null | undefined, fallback: string): string {
  const custom = String(decision?.control?.custom_message || '').trim();
  return custom || fallback;
}

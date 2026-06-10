import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

export async function handleAdminSettings(p: Record<string, unknown>): Promise<Response> {
  const db   = getServiceClient();
  const auth = await requireAuth(db, p);
  if (!auth.ok) return errResponse(auth.error!);
  if (!auth.isMC) return errResponse('Admin access required', 403);

  const action = String(p.action);

  if (action === 'getRoleAssignments') {
    const { data, error } = await db
      .from('role_assignments')
      .select('email, role, display_name, team_name, is_mc, is_mentor, created_at')
      .order('role');
    if (error) return errResponse(error.message);
    return jsonResponse({ ok: true, assignments: data || [] });
  }

  if (action === 'addRoleAssignment') {
    const email       = String(p.email       || '').toLowerCase().trim();
    const role        = String(p.role        || '').toLowerCase().trim();
    const displayName = String(p.displayName || p.display_name || role).trim();
    const teamName    = p.teamName || p.team_name ? String(p.teamName || p.team_name) : null;
    const isMC        = Boolean(p.isMC    ?? p.is_mc    ?? false);
    const isMentor    = Boolean(p.isMentor ?? p.is_mentor ?? false);

    if (!email || !role) return errResponse('email and role required');
    const validRoles = ['mc','toomtam','aof','draft','phai','amp','growth'];
    if (!validRoles.includes(role)) return errResponse(`Invalid role. Must be one of: ${validRoles.join(', ')}`);

    const { error } = await db.from('role_assignments').upsert(
      { email, role, display_name: displayName, team_name: teamName, is_mc: isMC, is_mentor: isMentor },
      { onConflict: 'email' },
    );
    if (error) return errResponse(error.message);
    return jsonResponse({ ok: true });
  }

  if (action === 'removeRoleAssignment') {
    const email = String(p.email || '').toLowerCase().trim();
    if (!email) return errResponse('email required');
    const { error } = await db.from('role_assignments').delete().eq('email', email);
    if (error) return errResponse(error.message);
    return jsonResponse({ ok: true });
  }

  if (action === 'getConnectionStatus') {
    const { data, error } = await db.from('settings').select('key, value').in('key', ['APP_VERSION','MC_LINE_USER_ID']);
    const settings: Record<string, string> = {};
    for (const r of (data || []) as Record<string, string>[]) settings[r.key] = r.value;
    const lineToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '';
    return jsonResponse({
      ok: true,
      supabase: !error,
      lineConfigured: !!lineToken,
      appVersion: settings['APP_VERSION'] || '—',
      mcLineId:   settings['MC_LINE_USER_ID'] || '—',
    });
  }

  return errResponse(`Unknown settings action: ${action}`);
}

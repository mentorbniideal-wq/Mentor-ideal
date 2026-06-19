import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ADMIN_SECTIONS = ['dashboard','members','issues','checkin','revenue','broadcast'] as const;

export async function handleAdminSettings(p: Record<string, unknown>): Promise<Response> {
  const db     = getServiceClient();
  const action = String(p.action);

  // ── Public (Google-authenticated but NOT necessarily role-assigned) ──────────
  if (action === 'submitAccessRequest') {
    const token = String(p.token || '');
    if (!token) return errResponse('Authentication required');

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { data: { user }, error: userErr } = await anonClient.auth.getUser(token);
    if (userErr || !user?.email) return errResponse('Invalid session — please sign in with Google first');

    const email    = user.email.toLowerCase();
    const name     = String(p.name || '').trim().slice(0, 100);
    const sections = (Array.isArray(p.sections) ? p.sections as string[] : [])
      .filter(s => ADMIN_SECTIONS.includes(s as typeof ADMIN_SECTIONS[number]));
    const editAccess = Boolean(p.editAccess);
    const reason     = String(p.reason || '').trim().slice(0, 500);

    // Already role-assigned → tell frontend
    const { data: existing } = await db.from('role_assignments').select('email').eq('email', email).maybeSingle();
    if (existing) return jsonResponse({ ok: false, error: 'already_assigned' });

    // Deduplicate: pending request already exists
    const { data: dup } = await db
      .from('access_requests')
      .select('id')
      .eq('email', email)
      .eq('status', 'pending')
      .maybeSingle();
    if (dup) return jsonResponse({ ok: true, alreadyPending: true });

    const { error } = await db.from('access_requests').insert({
      email,
      name: name || (user.user_metadata?.full_name as string) || email.split('@')[0],
      requested_sections: sections,
      edit_access: editAccess,
      reason,
      status: 'pending',
    });
    if (error) return errResponse(error.message);
    return jsonResponse({ ok: true });
  }

  // ── MC-only actions ──────────────────────────────────────────────────────────
  const auth = await requireAuth(db, p);
  if (!auth.ok) return errResponse(auth.error!);
  if (!auth.isMC) return errResponse('Admin access required', 403);

  if (action === 'getRoleAssignments') {
    const { data, error } = await db
      .from('role_assignments')
      .select('email, role, display_name, team_name, is_mc, is_mentor, admin_sections, admin_edit_access, created_at')
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
    const hasAdminSections = Array.isArray(p.adminSections);
    const adminSections = (hasAdminSections ? p.adminSections as string[] : [])
      .filter(s => ADMIN_SECTIONS.includes(s as typeof ADMIN_SECTIONS[number]));

    if (!email || !role) return errResponse('email and role required');
    const validRoles = ['mc','toomtam','aof','draft','phai','amp','growth'];
    if (!validRoles.includes(role)) return errResponse(`Invalid role. Must be one of: ${validRoles.join(', ')}`);

    const assignment: Record<string, unknown> = {
      email, role, display_name: displayName, team_name: teamName,
      is_mc: isMC, is_mentor: isMentor,
    };
    if (hasAdminSections) assignment.admin_sections = adminSections;
    if (p.adminEditAccess !== undefined) {
      assignment.admin_edit_access = Boolean(p.adminEditAccess);
    }

    const { error } = await db.from('role_assignments').upsert(
      assignment,
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

  if (action === 'getAccessRequests') {
    const { data, error } = await db
      .from('access_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return errResponse(error.message);
    return jsonResponse({ ok: true, requests: data || [] });
  }

  if (action === 'approveAccessRequest') {
    const id       = String(p.id || '');
    const role     = String(p.role || '').toLowerCase().trim();
    const isMentor = Boolean(p.isMentor ?? false);
    const teamName = p.teamName ? String(p.teamName) : null;
    const approvedSections = (Array.isArray(p.sections) ? p.sections as string[] : [])
      .filter(s => ADMIN_SECTIONS.includes(s as typeof ADMIN_SECTIONS[number]));
    const editAccess = Boolean(p.editAccess);
    if (!id || !role) return errResponse('id and role required');
    const validRoles = ['mc','toomtam','aof','draft','phai','amp','growth'];
    if (!validRoles.includes(role)) return errResponse('Invalid role');

    const { data: req, error: fetchErr } = await db
      .from('access_requests').select('*').eq('id', id).single();
    if (fetchErr || !req) return errResponse('Request not found');
    const r = req as Record<string, unknown>;

    const { error: raErr } = await db.from('role_assignments').upsert({
      email:        String(r.email),
      role,
      display_name: String(r.name || r.email),
      team_name:    teamName,
      is_mc:        role === 'mc',
      is_mentor:    isMentor,
      admin_sections: approvedSections.length
        ? approvedSections
        : (Array.isArray(r.requested_sections) ? r.requested_sections : []),
      admin_edit_access: editAccess || Boolean(r.edit_access),
    }, { onConflict: 'email' });
    if (raErr) return errResponse(raErr.message);

    await db.from('access_requests').update({
      status:      'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: auth.displayName || 'MC',
    }).eq('id', id);

    return jsonResponse({ ok: true });
  }

  if (action === 'rejectAccessRequest') {
    const id = String(p.id || '');
    if (!id) return errResponse('id required');
    const { error } = await db.from('access_requests').update({
      status:      'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: auth.displayName || 'MC',
    }).eq('id', id);
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

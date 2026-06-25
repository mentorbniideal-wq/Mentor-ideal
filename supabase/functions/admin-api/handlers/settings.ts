import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { provisionLineExperience } from '../../_shared/line-provision.ts';

const ADMIN_SECTIONS = ['dashboard','members','issues','checkin','revenue','broadcast'] as const;
type LineMenuRole = 'member' | 'mentor' | 'mc' | 'growth';

function expectedMenuRole(settingKey: string): LineMenuRole {
  if (settingKey === 'LINE_ID_MC') return 'mc';
  if (settingKey === 'LINE_ID_GROWTH') return 'growth';
  return 'mentor';
}

async function getLineMenuForUser(token: string, lineUserId: string): Promise<{
  ok: boolean;
  richMenuId: string | null;
  error?: string;
}> {
  try {
    const response = await fetch(
      `https://api.line.me/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (response.status === 404) return { ok: true, richMenuId: null };
    const text = await response.text();
    if (!response.ok) return { ok: false, richMenuId: null, error: `LINE ${response.status}: ${text.slice(0, 160)}` };
    return { ok: true, richMenuId: String((JSON.parse(text) as Record<string, unknown>).richMenuId || '') || null };
  } catch (e) {
    return { ok: false, richMenuId: null, error: (e as Error).message };
  }
}

async function checkUrl(url: string): Promise<{ url: string; ok: boolean; status: number | null }> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    response.body?.cancel();
    return { url, ok: response.ok, status: response.status };
  } catch {
    return { url, ok: false, status: null };
  }
}

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

  if (action === 'getLineTeamMappings') {
    const [{ data: teams }, { data: settings }, { data: lineMembers }] = await Promise.all([
      db.from('mentor_teams').select('name, leader_name').order('name'),
      db.from('settings').select('key, value').like('key', 'LINE_ID_%'),
      db.from('line_members').select('line_user_id, member_id, members(name, nickname)').limit(200),
    ]);
    const settingsMap: Record<string, string> = {};
    for (const s of (settings || []) as Record<string, string>[]) settingsMap[s.key] = s.value;
    const memberMap: Record<string, Record<string, unknown>> = {};
    for (const lm of (lineMembers || []) as Record<string, unknown>[]) {
      memberMap[String(lm.line_user_id)] = lm;
    }
    const teamRows = (teams || []).map((team: Record<string, unknown>) => {
      const name = String(team.name || '');
      const key = `LINE_ID_${name.toUpperCase()}`;
      const currentLineId = settingsMap[key] || null;
      const linkedRec = currentLineId ? memberMap[currentLineId] : null;
      return {
        name,
        leader_name: String(team.leader_name || ''),
        currentLineId,
        linkedMember: linkedRec ? (linkedRec.members as Record<string, unknown>) : null,
      };
    });
    const growthLineId = settingsMap['LINE_ID_GROWTH'] || null;
    const growthLinkedRec = growthLineId ? memberMap[growthLineId] : null;
    const growthRow = {
      name: 'GROWTH',
      leader_name: 'Growth',
      currentLineId: growthLineId,
      linkedMember: growthLinkedRec ? (growthLinkedRec.members as Record<string, unknown>) : null,
      isSpecial: true,
    };
    const availableMembers = (lineMembers || []).map((lm: Record<string, unknown>) => ({
      lineUserId: String(lm.line_user_id),
      memberId: String(lm.member_id),
      name: String((lm.members as Record<string, unknown>)?.name || ''),
      nickname: String((lm.members as Record<string, unknown>)?.nickname || ''),
    }));
    return jsonResponse({ ok: true, teams: teamRows, growth: growthRow, availableMembers });
  }

  if (action === 'setLineTeamMapping') {
    const teamName = String(p.teamName || '').toUpperCase().replace(/[^A-Z0-9_]/g, '');
    const lineUserId = String(p.lineUserId || '').trim();
    if (!teamName) return errResponse('teamName required');
    const key = `LINE_ID_${teamName}`;
    if (lineUserId) {
      const { error } = await db.from('settings').upsert({ key, value: lineUserId }, { onConflict: 'key' });
      if (error) return errResponse(error.message);
    } else {
      await db.from('settings').delete().eq('key', key);
    }
    return jsonResponse({ ok: true });
  }

  if (action === 'simulateLineMessage') {
    const text       = String(p.text || '').trim();
    const memberName = String(p.memberName || '').trim();
    if (!text) return errResponse('text required');

    // Look up LINE user ID for the requested member (if any)
    let userId = String(p.userId || '').trim();
    if (!userId && memberName) {
      const { data: member } = await db.from('members').select('id').eq('name', memberName).maybeSingle();
      if (member) {
        const { data: link } = await db.from('line_members').select('line_user_id').eq('member_id', String((member as Record<string,unknown>).id)).maybeSingle();
        userId = String((link as Record<string,unknown>)?.line_user_id || '');
      }
    }
    if (!userId) {
      return jsonResponse({ ok: false, error: memberName ? `${memberName} ยังไม่ได้เชื่อม LINE ครับ` : 'userId required' });
    }

    const webhookUrl = `${Deno.env.get('SUPABASE_URL') || ''}/functions/v1/line-webhook`;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BNI-Sim': serviceKey,
        },
        body: JSON.stringify({ text, userId }),
      });
      const data = await res.json() as Record<string, unknown>;
      return jsonResponse(data);
    } catch (e) {
      return errResponse((e as Error).message);
    }
  }

  if (action === 'provisionLineMenus') {
    try {
      const result = await provisionLineExperience(db);
      return jsonResponse({ ok: true, ...result });
    } catch (e) {
      return errResponse((e as Error).message);
    }
  }

  if (action === 'getLineHealth') {
    const lineToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '';
    if (!lineToken) return errResponse('LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า');

    const appUrl = String(Deno.env.get('PUBLIC_APP_URL') || 'https://bni-mentor-system.vercel.app')
      .replace(/\/$/, '');
    const liffUrl = String(Deno.env.get('LINE_LIFF_URL') || `${appUrl}/liff/`)
      .replace(/\/$/, '');
    const [{ data: settings }, { data: lineMembers }, { data: teams }] = await Promise.all([
      db.from('settings').select('key, value')
        .or('key.like.LINE_ID_%,key.like.LINE_RICH_MENU_%,key.eq.LINE_PROVISIONED_AT'),
      db.from('line_members').select('line_user_id, member_id, members(name, nickname)').limit(300),
      db.from('mentor_teams').select('name, leader_name').order('name'),
    ]);

    const settingMap: Record<string, string> = {};
    for (const row of (settings || []) as Record<string, unknown>[]) {
      settingMap[String(row.key || '')] = String(row.value || '');
    }
    const linkedMap = new Map<string, Record<string, unknown>>();
    for (const row of (lineMembers || []) as Record<string, unknown>[]) {
      linkedMap.set(String(row.line_user_id || ''), row);
    }

    const assignmentSeed: Record<string, unknown>[] = [
      { key: 'LINE_ID_MC', label: 'MC', expectedRole: 'mc' },
      { key: 'LINE_ID_GROWTH', label: 'Growth', expectedRole: 'growth' },
      ...(teams || []).map((team: Record<string, unknown>) => ({
        key: `LINE_ID_${String(team.name || '').toUpperCase()}`,
        label: `Mentor · ${String(team.name || '')}`,
        expectedRole: 'mentor',
        leaderName: String(team.leader_name || ''),
      })),
    ];

    const rolePriority: Record<LineMenuRole, number> = { member: 0, mentor: 1, growth: 2, mc: 3 };
    const effectiveRoleByLineId = new Map<string, LineMenuRole>();
    const resolvedAssignments: Record<string, unknown>[] = [];
    const missingAssignments: Record<string, unknown>[] = [];
    for (const seed of assignmentSeed) {
      const key = String(seed.key);
      const lineUserId = settingMap[key] || '';
      if (!lineUserId) {
        missingAssignments.push({ ...seed, lineUserId: null, status: 'missing_link' });
        continue;
      }
      const nextRole = expectedMenuRole(key);
      const currentRole = effectiveRoleByLineId.get(lineUserId) || 'member';
      if (rolePriority[nextRole] > rolePriority[currentRole]) {
        effectiveRoleByLineId.set(lineUserId, nextRole);
      }
      resolvedAssignments.push({ ...seed, lineUserId });
    }

    const actualMenuPromises = new Map<string, Promise<{
      ok: boolean;
      richMenuId: string | null;
      error?: string;
    }>>();
    const checkedAssignments = await Promise.all(
      resolvedAssignments.map(async seed => {
        const lineUserId = String(seed.lineUserId);
        const configuredRole = String(seed.expectedRole) as LineMenuRole;
        const expectedRole = effectiveRoleByLineId.get(lineUserId) || configuredRole;
        const expectedMenuId = settingMap[`LINE_RICH_MENU_${expectedRole.toUpperCase()}`] || null;
        if (!actualMenuPromises.has(lineUserId)) {
          actualMenuPromises.set(lineUserId, getLineMenuForUser(lineToken, lineUserId));
        }
        const actual = await actualMenuPromises.get(lineUserId)!;
        const linked = linkedMap.get(lineUserId);
        const member = linked?.members as Record<string, unknown> | undefined;
        const status = !actual.ok
          ? 'error'
          : !expectedMenuId
          ? 'missing_menu'
          : actual.richMenuId === expectedMenuId
          ? 'ok'
          : 'drift';
        return {
          ...seed,
          configuredRole,
          expectedRole,
          expectedMenuId,
          actualMenuId: actual.richMenuId,
          linkedMember: member ? {
            name: String(member.name || ''),
            nickname: String(member.nickname || ''),
          } : null,
          status,
          error: actual.error || null,
        };
      }),
    );

    const actions = ['mentor-log', 'follow-up', 'issue', 'renewal', 'assignments'];
    const urlChecks = await Promise.all([
      checkUrl(`${appUrl}/liff/`),
      ...actions.map(item => checkUrl(`${appUrl}/liff/${item}?preview=1`)),
      checkUrl(`${liffUrl}?action=mentor-log`),
    ]);
    const menuRoles: LineMenuRole[] = ['member', 'mentor', 'mc', 'growth'];
    const menus = Object.fromEntries(menuRoles.map(role => [
      role,
      settingMap[`LINE_RICH_MENU_${role.toUpperCase()}`] || null,
    ]));
    const allAssignments = [...checkedAssignments, ...missingAssignments];
    return jsonResponse({
      ok: true,
      summary: {
        total: allAssignments.length,
        healthy: allAssignments.filter(row => row.status === 'ok').length,
        drift: allAssignments.filter(row => row.status === 'drift').length,
        missing: allAssignments.filter(row => String(row.status).startsWith('missing')).length,
        errors: allAssignments.filter(row => row.status === 'error').length,
        urlsOk: urlChecks.filter(row => row.ok).length,
        urlsTotal: urlChecks.length,
      },
      assignments: allAssignments,
      menus,
      menuVersion: settingMap.LINE_RICH_MENU_VERSION || null,
      menuSource: settingMap.LINE_RICH_MENU_SOURCE || null,
      provisionedAt: settingMap.LINE_PROVISIONED_AT || null,
      appUrl,
      liffUrl,
      urlChecks,
    });
  }

  if (action === 'reassignLineMenu') {
    const lineToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '';
    if (!lineToken) return errResponse('LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า');
    const lineUserId = String(p.lineUserId || '').trim();
    const menuRole = String(p.menuRole || '').toLowerCase() as LineMenuRole;
    if (!lineUserId) return errResponse('lineUserId required');
    if (!['member', 'mentor', 'mc', 'growth'].includes(menuRole)) return errResponse('Invalid menuRole');

    const { data: linked } = await db.from('line_members')
      .select('line_user_id').eq('line_user_id', lineUserId).maybeSingle();
    const { data: mapped } = await db.from('settings')
      .select('key').like('key', 'LINE_ID_%').eq('value', lineUserId).limit(1);
    if (!linked && !(mapped || []).length) return errResponse('LINE account นี้ไม่ได้อยู่ในระบบ');

    const { data: menuSetting } = await db.from('settings')
      .select('value').eq('key', `LINE_RICH_MENU_${menuRole.toUpperCase()}`).maybeSingle();
    const richMenuId = String((menuSetting as Record<string, unknown> | null)?.value || '');
    if (!richMenuId) return errResponse(`ไม่พบ Rich Menu สำหรับ ${menuRole}`);
    const response = await fetch(
      `https://api.line.me/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu/${encodeURIComponent(richMenuId)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${lineToken}` },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) return errResponse(`LINE ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return jsonResponse({ ok: true, lineUserId, menuRole, richMenuId });
  }

  // ── PIN-based admin session verification ────────────────────
  if (action === 'getAdminSessionInfo') {
    const auth = await requireAuth(db, p);
    if (!auth.ok) return errResponse(auth.error!);
    // Look up admin_sections and admin_edit_access from role_assignments (PIN auth doesn't include these)
    const { data: ra } = await db
      .from('role_assignments')
      .select('admin_sections, admin_edit_access, display_name')
      .eq('role', auth.role!)
      .maybeSingle();
    const sections: string[] = Array.isArray((ra as Record<string,unknown>)?.admin_sections)
      ? ((ra as Record<string,unknown>).admin_sections as unknown[]).map(String)
      : [];
    return jsonResponse({
      ok:           true,
      role:         auth.role,
      isMC:         auth.isMC,
      isMentor:     auth.isMentor,
      displayName:  auth.displayName,
      adminSections:    sections,
      adminEditAccess:  Boolean((ra as Record<string,unknown>)?.admin_edit_access ?? auth.isMC),
    });
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

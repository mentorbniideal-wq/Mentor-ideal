import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { provisionLineExperience } from '../../_shared/line-provision.ts';
import { linePushMessages } from '../../_shared/line.ts';

const ADMIN_SECTIONS = ['dashboard','members','issues','checkin','revenue','broadcast'] as const;
type LineMenuRole = 'member' | 'mentor' | 'mc' | 'growth';

function expectedMenuRole(settingKey: string): LineMenuRole {
  if (settingKey === 'LINE_ID_MC') return 'member';
  if (settingKey === 'LINE_ID_GROWTH') return 'member';
  return 'member';
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

  // ── PIN session verification (open to all authenticated roles) ──────────────
  if (action === 'getAdminSessionInfo') {
    const auth = await requireAuth(db, p);
    if (!auth.ok) return errResponse(auth.error!);
    const { data: ra } = await db
      .from('role_assignments')
      .select('admin_sections, admin_edit_access, display_name')
      .eq('role', auth.role!)
      .limit(1)
      .maybeSingle();
    const sections: string[] = Array.isArray((ra as Record<string,unknown>)?.admin_sections)
      ? ((ra as Record<string,unknown>).admin_sections as unknown[]).map(String)
      : [];
    return jsonResponse({
      ok:              true,
      role:            auth.role,
      isMC:            auth.isMC,
      isMentor:        auth.isMentor,
      displayName:     auth.displayName,
      adminSections:   sections,
      adminEditAccess: Boolean((ra as Record<string,unknown>)?.admin_edit_access ?? auth.isMC),
    });
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
      { key: 'LINE_ID_MC', label: 'MC', expectedRole: 'member' },
      { key: 'LINE_ID_GROWTH', label: 'Growth', expectedRole: 'member' },
      ...(teams || []).map((team: Record<string, unknown>) => ({
        key: `LINE_ID_${String(team.name || '').toUpperCase()}`,
        label: `Mentor · ${String(team.name || '')}`,
        expectedRole: 'member',
        leaderName: String(team.leader_name || ''),
      })),
    ];
    const seededLineIds = new Set(
      assignmentSeed
        .map(seed => settingMap[String(seed.key || '')])
        .filter(Boolean),
    );
    for (const row of (lineMembers || []) as Record<string, unknown>[]) {
      const lineUserId = String(row.line_user_id || '');
      if (!lineUserId || seededLineIds.has(lineUserId)) continue;
      seededLineIds.add(lineUserId);
      const member = row.members as Record<string, unknown> | undefined;
      assignmentSeed.push({
        key: `LINE_MEMBER_${lineUserId}`,
        label: `Member · ${String(member?.nickname || member?.name || 'LINE')}`,
        expectedRole: 'member',
        lineUserId,
      });
    }

    const rolePriority: Record<LineMenuRole, number> = { member: 0, mentor: 1, growth: 2, mc: 3 };
    const effectiveRoleByLineId = new Map<string, LineMenuRole>();
    const resolvedAssignments: Record<string, unknown>[] = [];
    const missingAssignments: Record<string, unknown>[] = [];
    for (const seed of assignmentSeed) {
      const key = String(seed.key);
      const lineUserId = String(seed.lineUserId || settingMap[key] || '');
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

    const actions = ['renewal', 'assignments'];
    const urlChecks = await Promise.all([
      ...actions.map(item => checkUrl(`${appUrl}/liff/${item}?preview=1`)),
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

  if (action === 'getLineQuota') {
    const lineToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '';
    if (!lineToken) return errResponse('LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า');
    const [quotaRes, usageRes] = await Promise.all([
      fetch('https://api.line.me/v2/bot/message/quota', { headers: { Authorization: `Bearer ${lineToken}` } }),
      fetch('https://api.line.me/v2/bot/message/quota/consumption', { headers: { Authorization: `Bearer ${lineToken}` } }),
    ]);
    if (!quotaRes.ok || !usageRes.ok) return errResponse(`LINE quota API error: ${quotaRes.status}/${usageRes.status}`);
    const quota = await quotaRes.json() as Record<string, unknown>;
    const usage = await usageRes.json() as Record<string, unknown>;
    const type = String(quota.type || 'unknown');
    const isUnlimited = type === 'unlimited';
    const limit = isUnlimited ? null : Number(quota.value) || 0;
    const used  = Number(usage.totalUsage) || 0;
    return jsonResponse({
      ok: true,
      type,
      unlimited: isUnlimited,
      limit,
      used,
      remaining: isUnlimited ? null : Math.max(0, Number(limit) - used),
      pct: !isUnlimited && Number(limit) > 0 ? Math.round(used / Number(limit) * 100) : 0,
    });
  }

  if (action === 'getLineDeliveryLog') {
    const pageSize = Math.min(100, Number(p.limit) || 50);
    const offset   = Number(p.offset) || 0;
    let q = db.from('line_message_deliveries')
      .select(`id, channel, recipient_id, member_id, notification_type, source,
               status, created_at, sent_at, message_preview, message_payload, last_error,
               members ( nickname, name, mentor_team )`, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (p.status)    q = q.eq('status',            String(p.status));
    if (p.notifType) q = q.eq('notification_type', String(p.notifType));
    if (p.source)    q = q.eq('source',            String(p.source));
    const { data, error, count } = await q;
    if (error) return errResponse(error.message);
    const rows = ((data || []) as Record<string, unknown>[]).map(r => {
      const m = (r.members || {}) as Record<string, unknown>;
      return {
        id: String(r.id || ''), channel: String(r.channel || ''),
        notifType: String(r.notification_type || ''), source: String(r.source || ''),
        status: String(r.status || ''), createdAt: String(r.created_at || ''),
        sentAt: r.sent_at ? String(r.sent_at) : null,
        preview: r.message_preview ? String(r.message_preview) : null,
        lastError: r.last_error ? String(r.last_error).slice(0, 200) : null,
        canRetry: r.status === 'failed' && r.channel === 'push' && Array.isArray(r.message_payload),
        memberNick: String(m.nickname || m.name || ''), memberName: String(m.name || ''),
        memberTeam: String(m.mentor_team || ''),
      };
    });
    return jsonResponse({ ok: true, rows, total: count || 0, offset, pageSize });
  }

  if (action === 'retryLineDelivery') {
    const deliveryId = String(p.deliveryId || '');
    if (!deliveryId) return errResponse('deliveryId required');

    const { data: row, error } = await db
      .from('line_message_deliveries')
      .select('id, channel, recipient_id, member_id, notification_type, message_payload, status')
      .eq('id', deliveryId)
      .maybeSingle();
    if (error) return errResponse(error.message);
    if (!row) return errResponse('ไม่พบรายการส่งข้อความนี้');

    const channel = String(row.channel || '');
    if (channel !== 'push') return errResponse('Retry รองรับเฉพาะข้อความแบบ push รายบุคคลตอนนี้');
    const recipientId = String(row.recipient_id || '');
    const payload = row.message_payload;
    if (!recipientId || !Array.isArray(payload) || payload.length === 0) {
      return errResponse('รายการนี้ไม่มีข้อมูลข้อความสำหรับ Retry');
    }

    const retrySeed = `retry:${deliveryId}:${Date.now()}`;
    const result = await linePushMessages(recipientId, payload as Record<string, unknown>[], {
      db,
      memberId: row.member_id ? String(row.member_id) : null,
      notificationType: `${String(row.notification_type || 'manual')}:retry`,
      source: 'admin-api/retryLineDelivery',
      idempotencyKey: retrySeed,
      lineRetryKey: retrySeed,
    });
    return jsonResponse({ ok: true, result });
  }

  return errResponse(`Unknown settings action: ${action}`);
}

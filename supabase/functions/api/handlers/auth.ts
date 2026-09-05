// Auth handler — login + changePIN + getMyRole (Google OAuth)
import { getServiceClient, jsonResponse } from '../../_shared/db.ts';
import { verifyPin, verifyToken, requireAuth } from '../../_shared/auth.ts';
import { canAssumeOperationalView } from '../../_shared/capabilities.ts';

async function getTeamIdentity(db: ReturnType<typeof getServiceClient>, teamName?: string | null) {
  const { data } = await db.from('mentor_teams').select('name,leader_name,display_name').order('id');
  const teamLabels: Record<string, string> = {};
  for (const row of (data || []) as Record<string, unknown>[]) {
    const code = String(row.name || '');
    if (!code) continue;
    teamLabels[code] = String(row.display_name || `ทีม ${String(row.leader_name || code)}`);
  }
  return {
    teamLabels,
    teamDisplayName: teamName ? (teamLabels[teamName] || teamName) : null,
  };
}

export async function handleAuth(p: Record<string, unknown>): Promise<Response> {
  const db     = getServiceClient();
  const action = String(p.action || '');

  // ── login ────────────────────────────────────────────────────
  if (action === 'login') {
    const role = String(p.role || '').toLowerCase();
    const pin = String(p.pin || '');

    if (!role) {
      return jsonResponse({ ok: false, error: 'Role is required' });
    }

    const auth = await verifyPin(db, role, pin);
    if (!auth.ok) return jsonResponse({ ok: false, error: auth.error });

    const { data: ver } = await db
      .from('settings')
      .select('key, value')
      .in('key', ['APP_VERSION']);
    const version = ver?.find((r: { key: string }) => r.key === 'APP_VERSION')?.value || 'v4.0';
    const teamIdentity = await getTeamIdentity(db, auth.teamName);

    return jsonResponse({
      ok:          true,
      role:        auth.role,
      isMC:        auth.isMC,
      isAdmin:     auth.isAdmin,
      isSystemOwner: Boolean(auth.isSystemOwner),
      teamName:    auth.teamName,
      displayName: auth.displayName,
      ...teamIdentity,
      capabilities: auth.capabilities || [],
      isViewer:     Boolean(auth.isViewer),
      version,
    });
  }

  // ── verifyPin ────────────────────────────────────────────────
  // Compatibility endpoint for older role-switch UI. Prefer `login`
  // with an explicit role whenever the caller already knows the target.
  if (action === 'verifyPin') {
    const pin = String(p.pin || '');
    const explicitRole = String(p.targetRole || p.role || '').toLowerCase();
    const roles = explicitRole
      ? [explicitRole]
      : ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp', 'mentor_support', 'growth', 'viewer'];

    for (const role of roles) {
      const auth = await verifyPin(db, role, pin);
      if (auth.ok) {
        const { data: ver } = await db
          .from('settings')
          .select('key, value')
          .in('key', ['APP_VERSION']);
        const version = ver?.find((r: { key: string }) => r.key === 'APP_VERSION')?.value || 'v4.0';
        const teamIdentity = await getTeamIdentity(db, auth.teamName);
        return jsonResponse({
          ok:          true,
          role:        auth.role,
          isMC:        auth.isMC,
          isMentor:    auth.isMentor,
          teamName:    auth.teamName,
          displayName: auth.displayName,
          ...teamIdentity,
          capabilities: auth.capabilities || [],
          isViewer:     Boolean(auth.isViewer),
          isSystemOwner: Boolean(auth.isSystemOwner),
          version,
        });
      }
    }

    return jsonResponse({ ok: false, error: 'PIN ไม่ถูกต้อง' });
  }

  // ── viewAsRole ───────────────────────────────────────────────
  // Lets MC/TOOMTAM switch to any role view without knowing that role's PIN.
  // Requires a valid Google OAuth token. Subsequent API calls still use the
  // original token (authenticating as TOOMTAM/MC) which works because growth.ts
  // allows 'toomtam' in allowedRoles for all growth actions.
  if (action === 'viewAsRole') {
    const token      = String(p.token || '').trim();
    const targetRole = String(p.targetRole || '').toLowerCase();
    if (!token)      return jsonResponse({ ok: false, error: 'token required' });
    if (!targetRole) return jsonResponse({ ok: false, error: 'targetRole required' });

    const result = await verifyToken(db, token);
    if (!result.ok) return jsonResponse({ ok: false, error: result.error });
    if (!result.isSystemOwner || !canAssumeOperationalView(result, targetRole)) {
      if (targetRole === 'admin') {
        return jsonResponse({ ok: false, error: 'เฉพาะ Chapter Admin เท่านั้นที่เปิดมุมมอง Chapter Admin ได้' });
      }
      return jsonResponse({ ok: false, error: 'ต้องเป็น MC หรือ TOOMTAM จึงจะสลับ Role ได้โดยไม่ใช้ PIN' });
    }

    const RINFO: Record<string, { displayName: string; teamName: string | null; isMC: boolean; isMentor: boolean; isAdmin?: boolean }> = {
      admin:   { displayName: 'Chapter Admin', teamName: null, isMC: true, isMentor: false, isAdmin: true },
      mc:      { displayName: 'Mentor Co.', teamName: null,   isMC: true,  isMentor: false },
      toomtam: { displayName: 'TOOMTAM', teamName: 'TOOMTAM', isMC: false, isMentor: true  },
      aof:     { displayName: 'Aof',     teamName: 'Aof',     isMC: false, isMentor: true  },
      draft:   { displayName: 'Draft',   teamName: 'Draft',   isMC: false, isMentor: true  },
      phai:    { displayName: 'PHAI',    teamName: 'PHAI',    isMC: false, isMentor: true  },
      amp:     { displayName: 'AMP',     teamName: 'AMP',     isMC: false, isMentor: true  },
      mentor_support: { displayName: 'Mentor Support', teamName: null, isMC: false, isMentor: true },
      growth:  { displayName: 'Growth',  teamName: null,      isMC: false, isMentor: false },
    };
    const baseInfo = RINFO[targetRole];
    const teamIdentity = await getTeamIdentity(db, baseInfo?.teamName);
    const info = baseInfo && baseInfo.teamName
      ? { ...baseInfo, displayName: teamIdentity.teamDisplayName || baseInfo.displayName }
      : baseInfo;
    if (!info) return jsonResponse({ ok: false, error: `Unknown role: ${targetRole}` });

    const { data: ver } = await db.from('settings').select('key, value').in('key', ['APP_VERSION']);
    const version = ver?.find((r: { key: string }) => r.key === 'APP_VERSION')?.value || 'v4.0';

    return jsonResponse({ ok: true, role: targetRole, ...info, ...teamIdentity, isAdmin: true, isSystemOwner: true, version });
  }

  // ── changePIN ────────────────────────────────────────────────
  // MC admin action: change any role's PIN without needing old PIN.
  // Frontend sends { target: roleKey, newPin } from the Settings panel.
  if (action === 'changePIN') {
    // Accept 'target' (frontend) or 'role' (canonical)
    const targetRole = String(p.target || p.role || '').toLowerCase();
    const newPin     = String(p.newPin || '');

    if (!targetRole || !newPin) {
      return jsonResponse({ ok: false, error: 'ต้องระบุ target/role และ newPin' });
    }
    if (!/^\d{4,8}$/.test(newPin)) {
      return jsonResponse({ ok: false, error: 'PIN ต้องเป็นตัวเลข 4-8 หลัก' });
    }

    // Verify caller is MC via PIN or OAuth token — never trust raw p.role
    const authResult = await requireAuth(db, p, ['mc']);
    if (!authResult.ok || !authResult.isSystemOwner) {
      return jsonResponse({ ok: false, error: 'เฉพาะ Chapter Admin เท่านั้นที่เปลี่ยน PIN ได้' });
    }

    // Update with new bcrypt hash via DB function
    const { error: updateErr } = await db.rpc('fn_update_pin', {
      p_role:    targetRole,
      p_new_pin: newPin,
    });
    if (updateErr) return jsonResponse({ ok: false, error: updateErr.message });

    return jsonResponse({ ok: true, message: `เปลี่ยน PIN ของ ${targetRole} แล้ว` });
  }

  // ── getMyRole ────────────────────────────────────────────────
  // Verify a Supabase OAuth JWT and return the caller's role info.
  if (action === 'getMyRole') {
    const token = String(p.token || '').trim();
    if (!token) return jsonResponse({ ok: false, error: 'token required' });

    const result = await verifyToken(db, token);
    if (!result.ok) return jsonResponse({ ok: false, error: result.error });

    const { data: ver } = await db
      .from('settings')
      .select('key, value')
      .in('key', ['APP_VERSION']);
    const version = ver?.find((r: { key: string }) => r.key === 'APP_VERSION')?.value || 'v4.0';
    const teamIdentity = await getTeamIdentity(db, result.teamName);

    return jsonResponse({
      ok:          true,
      role:        result.role,
      isMC:        result.isMC,
      isMentor:    result.isMentor,
      isAdmin:     result.isAdmin,
      isSystemOwner: Boolean(result.isSystemOwner),
      teamName:    result.teamName,
      displayName: result.displayName,
      ...teamIdentity,
      adminSections: result.adminSections || [],
      adminEditAccess: Boolean(result.adminEditAccess),
      capabilities: result.capabilities || [],
      version,
    });
  }

  return jsonResponse({ ok: false, error: `unknown auth action: ${action}` });
}

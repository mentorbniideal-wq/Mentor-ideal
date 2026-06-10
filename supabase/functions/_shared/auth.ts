// PIN-based auth helper — replaces apiLogin() in WEBAPP.js
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AuthResult {
  ok: boolean;
  role?: string;
  displayName?: string;
  teamName?: string | null;
  isMC?: boolean;
  isMentor?: boolean;
  error?: string;
}

const DEV_MODE = String(Deno.env.get('DEV_MODE') || 'false').toLowerCase() === 'true';

const ROLE_INFO: Record<string, { displayName: string; teamName: string | null; isMC: boolean; isMentor: boolean }> = {
  mc:      { displayName: 'MC',      teamName: null,      isMC: true,  isMentor: false },
  toomtam: { displayName: 'TOOMTAM', teamName: 'TOOMTAM', isMC: false, isMentor: true  },
  aof:     { displayName: 'Aof',     teamName: 'Aof',     isMC: false, isMentor: true  },
  draft:   { displayName: 'Draft',   teamName: 'Draft',   isMC: false, isMentor: true  },
  phai:    { displayName: 'PHAI',    teamName: 'PHAI',    isMC: false, isMentor: true  },
  amp:     { displayName: 'AMP',     teamName: 'AMP',     isMC: false, isMentor: true  },
  growth:  { displayName: 'Growth',  teamName: null,      isMC: false, isMentor: false },
};

const KNOWN_ROLES = new Set(Object.keys(ROLE_INFO));

export async function verifyPin(
  _supabase: SupabaseClient,
  role: string,
  pin: string,
): Promise<AuthResult> {
  const r = role.toLowerCase();
  if (!KNOWN_ROLES.has(r)) return { ok: false, error: `Unknown role: ${role}` };
  const info = ROLE_INFO[r];

  if (DEV_MODE) {
    return { ok: true, role: r, ...info };
  }

  if (!pin) {
    return { ok: false, error: 'PIN is required' };
  }

  const { data, error } = await _supabase
    .rpc('fn_verify_pin', { p_role: r, p_pin: pin })
    .single();

  if (error) {
    return { ok: false, error: 'Authentication failed' };
  }
  if (!data || typeof data !== 'object' || !('role' in data)) {
    return { ok: false, error: 'Invalid role or PIN' };
  }

  const row = data as Record<string, unknown>;
  return {
    ok: true,
    role: String(row.role),
    displayName: String(row.display_name || info.displayName),
    teamName: row.team_name != null ? String(row.team_name) : info.teamName,
    isMC: Boolean(row.is_mc ?? info.isMC),
    isMentor: Boolean(row.is_mentor ?? info.isMentor),
  };
}

export async function requireAuth(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  allowedRoles?: string[],
): Promise<AuthResult> {
  let role = String(payload.role || '').toLowerCase();

  if (!role) {
    if (DEV_MODE) {
      role = 'mc';
    } else {
      return { ok: false, error: 'Role is required' };
    }
  }

  if (!KNOWN_ROLES.has(role)) {
    return { ok: false, error: `Unknown role: ${role}` };
  }

  const pin = String(payload.pin || '');
  const result = await verifyPin(supabase, role, pin);
  if (!result.ok) return result;

  if (allowedRoles && !allowedRoles.includes(result.role!)) {
    return { ok: false, error: 'ไม่มีสิทธิ์ใช้งาน action นี้' };
  }

  return result;
}

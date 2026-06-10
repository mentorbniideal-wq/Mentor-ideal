// PIN-based auth helper — replaces apiLogin() in WEBAPP.js
// DEV MODE: PIN check bypassed — re-enable before production
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
  _pin: string,
): Promise<AuthResult> {
  // DEV MODE: accept any role without PIN
  const r = role.toLowerCase();
  if (!KNOWN_ROLES.has(r)) return { ok: false, error: `Unknown role: ${role}` };
  const info = ROLE_INFO[r];
  return { ok: true, role: r, ...info };
}

export async function requireAuth(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  allowedRoles?: string[],
): Promise<AuthResult> {
  const role = String(payload.role || '').toLowerCase();

  // DEV MODE: if no role provided, default to mc
  const effectiveRole = KNOWN_ROLES.has(role) ? role : 'mc';

  const result = await verifyPin(supabase, effectiveRole, '');
  if (!result.ok) return result;

  if (allowedRoles && !allowedRoles.includes(result.role!)) {
    return { ok: false, error: 'ไม่มีสิทธิ์ใช้งาน action นี้' };
  }

  return result;
}

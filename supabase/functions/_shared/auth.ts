// Auth helper — supports Google OAuth JWT tokens and (legacy) PIN-based auth
import { SupabaseClient, createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AuthResult {
  ok: boolean;
  role?: string;
  displayName?: string;
  teamName?: string | null;
  isMC?: boolean;
  isMentor?: boolean;
  isAdmin?: boolean;
  adminSections?: string[];
  adminEditAccess?: boolean;
  error?: string;
}

const DEV_MODE = String(Deno.env.get('DEV_MODE') || 'false').toLowerCase() === 'true';

const ROLE_INFO: Record<string, { displayName: string; teamName: string | null; isMC: boolean; isMentor: boolean; isAdmin?: boolean }> = {
  admin:   { displayName: 'Chapter Admin', teamName: null, isMC: true, isMentor: false, isAdmin: true },
  mc:      { displayName: 'MC',      teamName: null,      isMC: true,  isMentor: false },
  toomtam: { displayName: 'TOOMTAM', teamName: 'TOOMTAM', isMC: false, isMentor: true  },
  aof:     { displayName: 'Aof',     teamName: 'Aof',     isMC: false, isMentor: true  },
  draft:   { displayName: 'Draft',   teamName: 'Draft',   isMC: false, isMentor: true  },
  phai:    { displayName: 'PHAI',    teamName: 'PHAI',    isMC: false, isMentor: true  },
  amp:     { displayName: 'AMP',     teamName: 'AMP',     isMC: false, isMentor: true  },
  growth:  { displayName: 'Growth',  teamName: null,      isMC: false, isMentor: false },
};

const KNOWN_ROLES = new Set(Object.keys(ROLE_INFO));

// ── Token-based auth (Google OAuth via Supabase) ───────────────
export async function verifyToken(
  supabase: SupabaseClient,
  token: string,
): Promise<AuthResult> {
  if (!token) return { ok: false, error: 'Token required' };

  // Verify the JWT using a user-context client
  const supabaseUrl  = Deno.env.get('SUPABASE_URL')  ?? '';
  const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  let email: string | null = null;
  try {
    // Use anon client to validate the user JWT (not service role)
    const anonClient = createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false },
    });
    const { data: { user }, error } = await anonClient.auth.getUser(token);
    if (error || !user?.email) {
      return { ok: false, error: 'Session ไม่ถูกต้องหรือหมดอายุ กรุณา Login ใหม่' };
    }
    email = user.email.trim().toLowerCase();
  } catch {
    return { ok: false, error: 'ไม่สามารถตรวจสอบ Session ได้' };
  }

  // Look up role_assignments by email (service client can read this)
  const { data: ra, error: raErr } = await supabase
    .from('role_assignments')
    .select('role, display_name, team_name, is_mc, is_mentor, is_admin, admin_sections, admin_edit_access')
    .ilike('email', email)
    .maybeSingle();

  if (raErr) return { ok: false, error: 'ข้อผิดพลาดในการค้นหาสิทธิ์' };
  if (!ra) return { ok: false, error: `ไม่มีสิทธิ์ใช้งาน (${email}) กรุณาติดต่อ MC` };

  const r = ra as Record<string, unknown>;
  return {
    ok:          true,
    role:        String(r.role),
    displayName: String(r.display_name || r.role),
    teamName:    r.team_name != null ? String(r.team_name) : null,
    isMC:        Boolean(r.is_mc),
    isMentor:    Boolean(r.is_mentor),
    isAdmin:     Boolean(r.is_admin) || String(r.role) === 'admin',
    adminSections: Array.isArray(r.admin_sections) ? r.admin_sections.map(String) : [],
    adminEditAccess: Boolean(r.admin_edit_access),
  };
}

// ── PIN-based auth (legacy) ────────────────────────────────────
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
    isAdmin: Boolean(row.is_admin ?? info.isAdmin),
  };
}

// ── requireAuth: token-first, PIN fallback ─────────────────────
export async function requireAuth(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  allowedRoles?: string[],
): Promise<AuthResult> {
  // DEV MODE: skip all auth
  if (DEV_MODE) {
    const role = String(payload.role || 'mc').toLowerCase();
    const info = ROLE_INFO[role] ?? ROLE_INFO['mc'];
    return { ok: true, role, ...info };
  }

  // 1. Token-based auth (Google OAuth) — preferred
  const token = String(payload.token || payload.jwt || '').trim();
  if (token) {
    const result = await verifyToken(supabase, token);
    if (!result.ok) return result;
    if (allowedRoles && allowedRoles.length > 0 && !result.isAdmin && !allowedRoles.includes(result.role!)) {
      return { ok: false, error: 'ไม่มีสิทธิ์ใช้งาน action นี้' };
    }
    return result;
  }

  // 2. PIN-based auth (legacy fallback)
  let role = String(payload.role || '').toLowerCase();
  if (!role) return { ok: false, error: 'Role หรือ Token is required' };
  if (!KNOWN_ROLES.has(role)) return { ok: false, error: `Unknown role: ${role}` };

  const pin = String(payload.pin || '');
  const result = await verifyPin(supabase, role, pin);
  if (!result.ok) return result;

  if (allowedRoles && allowedRoles.length > 0 && !result.isAdmin && !allowedRoles.includes(result.role!)) {
    return { ok: false, error: 'ไม่มีสิทธิ์ใช้งาน action นี้' };
  }

  return result;
}

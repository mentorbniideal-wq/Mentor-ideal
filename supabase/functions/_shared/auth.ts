// Auth helper — supports Google OAuth JWT tokens and (legacy) PIN-based auth
import { SupabaseClient, createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { defaultCapabilities } from './capabilities.ts';

export interface AuthResult {
  ok: boolean;
  email?: string;
  role?: string;
  displayName?: string;
  teamName?: string | null;
  memberId?: string | null;
  isMC?: boolean;
  isMentor?: boolean;
  isAdmin?: boolean;
  isSystemOwner?: boolean;
  adminSections?: string[];
  adminEditAccess?: boolean;
  capabilities?: string[];
  error?: string;
}

const DEV_MODE = String(Deno.env.get('DEV_MODE') || 'false').toLowerCase() === 'true';
export const SYSTEM_OWNER_EMAIL = 'phitarn.p@gmail.com';

const ROLE_INFO: Record<string, { displayName: string; teamName: string | null; isMC: boolean; isMentor: boolean; isAdmin?: boolean }> = {
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
    .select('role, display_name, team_name, member_id, is_mc, is_mentor, is_admin, admin_sections, admin_edit_access, capabilities, access_status, access_expires_at')
    .ilike('email', email)
    .maybeSingle();

  if (raErr) return { ok: false, error: 'ข้อผิดพลาดในการค้นหาสิทธิ์' };
  if (!ra) return { ok: false, error: `ไม่มีสิทธิ์ใช้งาน (${email}) กรุณาติดต่อ MC` };

  const r = ra as Record<string, unknown>;
  if (String(r.access_status || 'active') !== 'active') {
    return { ok: false, error: 'บัญชีนี้ถูกระงับสิทธิ์ กรุณาติดต่อ Chapter Admin' };
  }
  if (r.access_expires_at && new Date(String(r.access_expires_at)).getTime() <= Date.now()) {
    return { ok: false, error: 'สิทธิ์ของบัญชีนี้หมดอายุแล้ว กรุณาติดต่อ Chapter Admin' };
  }
  // Full, unrestricted access is deliberately tied to one verified Google
  // identity. Database flags cannot accidentally promote another account.
  const isSystemOwner = email === SYSTEM_OWNER_EMAIL;
  const isAdmin = isSystemOwner;
  const capabilities = isSystemOwner
    ? defaultCapabilities('admin', true)
    : (Array.isArray(r.capabilities) ? r.capabilities.map(String).filter(x => x !== '*') : []);
  return {
    ok:          true,
    email,
    role:        String(r.role),
    displayName: String(r.display_name || r.role),
    teamName:    r.team_name != null ? String(r.team_name) : null,
    memberId:    r.member_id != null ? String(r.member_id) : null,
    isMC:        Boolean(r.is_mc),
    isMentor:    Boolean(r.is_mentor),
    isAdmin,
    isSystemOwner,
    adminSections: Array.isArray(r.admin_sections) ? r.admin_sections.map(String) : [],
    adminEditAccess: Boolean(r.admin_edit_access),
    capabilities,
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
    return { ok: true, role: r, ...info, capabilities: defaultCapabilities(r, Boolean(info.isAdmin)) };
  }

  if (!pin) {
    return { ok: false, error: 'PIN is required' };
  }
  if (r === 'admin') {
    return { ok: false, error: 'Full Access ต้องเข้าสู่ระบบด้วย Google บัญชีเจ้าของระบบเท่านั้น' };
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
  const isAdmin = Boolean(row.is_admin ?? info.isAdmin);
  return {
    ok: true,
    role: String(row.role),
    displayName: String(row.display_name || info.displayName),
    teamName: row.team_name != null ? String(row.team_name) : info.teamName,
    isMC: Boolean(row.is_mc ?? info.isMC),
    isMentor: Boolean(row.is_mentor ?? info.isMentor),
    isAdmin,
    capabilities: defaultCapabilities(r, isAdmin),
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
    return { ok: true, role, ...info, capabilities: defaultCapabilities(role, Boolean(info.isAdmin)) };
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

// PIN-based auth helper — replaces apiLogin() in WEBAPP.js
// Called by every Edge Function that needs role verification.
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

/**
 * Verify role + PIN against the roles table (bcrypt-checked by fn_verify_pin).
 * Returns the role info on success, error string on failure.
 */
export async function verifyPin(
  supabase: SupabaseClient,
  role: string,
  pin: string,
): Promise<AuthResult> {
  const { data, error } = await supabase
    .rpc('fn_verify_pin', { p_role: role.toLowerCase(), p_pin: pin })
    .single();

  if (error || !data) {
    return { ok: false, error: 'PIN ไม่ถูกต้อง' };
  }

  return {
    ok: true,
    role: data.role,
    displayName: data.display_name,
    teamName: data.team_name,
    isMC: data.is_mc,
    isMentor: data.is_mentor,
  };
}

/**
 * Extract and verify role+pin from request payload.
 * All API payloads carry { role, pin, action, ...rest }.
 */
export async function requireAuth(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  allowedRoles?: string[],  // omit = any valid role
): Promise<AuthResult> {
  const role = String(payload.role || '').toLowerCase();
  const pin  = String(payload.pin  || '');

  if (!role || !pin) {
    return { ok: false, error: 'กรุณาระบุ role และ PIN' };
  }

  const result = await verifyPin(supabase, role, pin);
  if (!result.ok) return result;

  if (allowedRoles && !allowedRoles.includes(result.role!)) {
    return { ok: false, error: 'ไม่มีสิทธิ์ใช้งาน action นี้' };
  }

  return result;
}

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth, type AuthResult } from './auth.ts';
import { canAccessAdminSection } from './capabilities.ts';

export async function requireAdminAccess(
  db: SupabaseClient,
  payload: Record<string, unknown>,
  section: string,
  options: { write?: boolean; mcOnly?: boolean } = {},
): Promise<AuthResult> {
  const auth = await requireAuth(db, payload);
  if (!auth.ok) return auth;
  if (options.mcOnly && !auth.isMC && !auth.isAdmin) {
    return { ok: false, error: 'Mentor Co access required' };
  }
  if (!canAccessAdminSection(auth, section, Boolean(options.write))) {
    if ((auth.adminSections || []).includes(section) && options.write) {
      return { ok: false, error: 'บัญชีนี้เป็น View Only ไม่สามารถแก้ไขข้อมูลได้' };
    }
    return { ok: false, error: `ไม่มีสิทธิ์เข้าถึงหมวด ${section}` };
  }
  return auth;
}

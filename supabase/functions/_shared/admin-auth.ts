import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth, type AuthResult } from './auth.ts';

export async function requireAdminAccess(
  db: SupabaseClient,
  payload: Record<string, unknown>,
  section: string,
  options: { write?: boolean; mcOnly?: boolean } = {},
): Promise<AuthResult> {
  const auth = await requireAuth(db, payload);
  if (!auth.ok) return auth;
  if (auth.isMC) return auth;
  if (options.mcOnly) return { ok: false, error: 'MC access required' };

  const sections = auth.adminSections || [];
  if (!sections.includes(section)) {
    return { ok: false, error: `ไม่มีสิทธิ์เข้าถึงหมวด ${section}` };
  }
  if (options.write && !auth.adminEditAccess) {
    return { ok: false, error: 'บัญชีนี้เป็น View Only ไม่สามารถแก้ไขข้อมูลได้' };
  }
  return auth;
}

// Phase 2A server-side tenant resolver. No client-provided chapter identifier
// is accepted. Legacy PIN sessions are supported only while one Chapter is
// active; Phase 2B will remove that compatibility fallback.
import type { AuthResult } from './auth.ts';

type Db = { from: (table: string) => any };
export type ChapterScope = { ok: true; chapterId: string; chapterKey: string; source: 'membership' | 'single_active_legacy' } | { ok: false; error: string };

function normalizedEmail(value: unknown): string { return String(value || '').trim().toLowerCase(); }

export async function resolveChapterScope(db: Db, auth: Pick<AuthResult, 'email'>): Promise<ChapterScope> {
  const email = normalizedEmail(auth.email);
  if (email) {
    const { data, error } = await db.from('chapter_memberships')
      .select('chapter_id,is_default,chapter_profiles!inner(id,chapter_key,is_active)')
      .eq('email', email).eq('access_status', 'active');
    if (error) return { ok: false, error: 'ไม่สามารถตรวจสอบ Chapter membership ได้' };
    const rows = (data || []).filter((row: Record<string, unknown>) => {
      const chapter = row.chapter_profiles as Record<string, unknown> | null;
      return Boolean(chapter?.is_active);
    });
    const selected = rows.find((row: Record<string, unknown>) => row.is_default) || (rows.length === 1 ? rows[0] : null);
    if (selected) {
      const chapter = selected.chapter_profiles as Record<string, unknown>;
      return { ok: true, chapterId: String(selected.chapter_id), chapterKey: String(chapter.chapter_key), source: 'membership' };
    }
    if (rows.length > 1) return { ok: false, error: 'บัญชีนี้มีหลาย Chapter กรุณาเลือก Chapter ผ่าน session ที่ระบบออกให้' };
  }
  const { data, error } = await db.from('chapter_profiles').select('id,chapter_key').eq('is_active', true).limit(2);
  if (error) return { ok: false, error: 'ไม่สามารถตรวจสอบ Active Chapter ได้' };
  if ((data || []).length !== 1) return { ok: false, error: 'Legacy session ต้องมี Active Chapter เดียวเท่านั้น' };
  return { ok: true, chapterId: String(data![0].id), chapterKey: String(data![0].chapter_key), source: 'single_active_legacy' };
}

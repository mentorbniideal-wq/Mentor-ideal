import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function verificationHelpKey(pairId: string, version: number): string {
  return `verification-help:${pairId}:${version}`;
}

// Caller must first resolve the pair through the authenticated member's ownPair query.
export async function verificationHelp(db: SupabaseClient, pair: Record<string, unknown>, memberId: string, submit: boolean) {
  const pairId = String(pair.id || '');
  if (!pairId || ![pair.member_a_id, pair.member_b_id, pair.optional_member_c_id].includes(memberId)) {
    return { ok: false, error: 'ไม่มีสิทธิ์ขอความช่วยเหลือสำหรับคู่นี้' };
  }
  if (['verified', 'late_verified'].includes(String(pair.status))) return { ok: true, state: 'complete', message: 'สมาชิกในคู่รับรองครบแล้ว ไม่ต้องขอรีเซ็ต' };
  if (pair.archived_at || pair.status === 'cancelled') return { ok: false, error: 'คู่นี้ปิดแล้ว ไม่สามารถขอรีเซ็ตได้' };
  const { data: versions, error: versionError } = await db.from('one_to_one_verifications').select('code_version').eq('pair_id', pairId);
  if (versionError) return { ok: false, error: 'ตรวจสถานะรหัสไม่สำเร็จ กรุณาลองอีกครั้ง' };
  const version = Math.max(0, ...(versions || []).map(row => Number(row.code_version || 0)));
  const key = verificationHelpKey(pairId, version);
  const { data: items, error: readError } = await db.from('one_to_one_attention_items')
    .select('id,status,idempotency_key,created_at').eq('pair_id', pairId)
    .like('idempotency_key', `verification-help:${pairId}:%`).order('created_at', { ascending: false });
  if (readError) return { ok: false, error: 'ตรวจสถานะคำขอไม่สำเร็จ กรุณาลองอีกครั้ง' };
  const current = (items || []).find(row => row.idempotency_key === key);
  if (current) return { ok: true, state: ['resolved', 'no_action_required'].includes(current.status) ? 'reviewed' : 'pending', requestId: current.id, message: ['resolved', 'no_action_required'].includes(current.status) ? 'ผู้ดูแลตรวจเรื่องแล้ว ลองโหลดรหัสอีกครั้ง หากยังติดขัดให้ติดต่อ Mentor Co.' : 'ส่งคำขอแล้ว ผู้ดูแลจะตรวจสอบก่อนรีเซ็ต กรุณากลับมาลองโหลดรหัสอีกครั้ง' };
  if (!submit) return { ok: true, state: items?.length ? 'reset' : 'none', message: items?.length ? 'มีรหัสรุ่นใหม่แล้ว กรุณาลองโหลดรหัสอีกครั้ง' : '' };
  const { data: created, error } = await db.from('one_to_one_attention_items').insert({
    pair_id: pairId, member_id: memberId, level: 'mentor_review_required',
    reason: 'สมาชิกแจ้งปัญหารหัส 6 หลัก / ขอให้ตรวจสอบการรีเซ็ต',
    evidence: [{ reason: 'verification', codeVersion: version }],
    positive_context: ['สมาชิกแจ้งด้วยตนเอง ไม่มีรหัสหรือข้อความส่วนตัวแนบมา'],
    suggested_action: 'เปิดจัดการคู่ ตรวจการรับรอง แล้วให้ Admin/Mentor Co. ยืนยันรีเซ็ตหากจำเป็น การรีเซ็ตจะล้างการรับรองของทุกคน',
    status: 'open', idempotency_key: key, updated_at: new Date().toISOString(),
  }).select('id').single();
  if (error?.code === '23505') return { ok: true, state: 'pending', message: 'ส่งคำขอของคู่นี้ไว้แล้ว ผู้ดูแลจะตรวจสอบให้' };
  if (error || !created) return { ok: false, error: 'ส่งคำขอไม่สำเร็จ กรุณาลองอีกครั้ง' };
  // The attention row itself is the durable audit of the authenticated requester.
  return { ok: true, state: 'pending', requestId: created.id, created: true, message: 'ส่งคำขอแล้ว ผู้ดูแลจะตรวจสอบก่อนรีเซ็ต กรุณากลับมาลองโหลดรหัสอีกครั้ง' };
}

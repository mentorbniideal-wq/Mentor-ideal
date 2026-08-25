import { ltRolesForScope } from './lt-role-routing.ts';

type Db = { from: (table: string) => any };

export async function upsertMemberSignal(db: Db, input: {
  memberId: string; signalType: string; title: string; detail?: string;
  subjectType?: string; subjectId?: string; payload?: Record<string, unknown>;
  priority?: string; idempotencyKey: string; consent?: boolean;
}) {
  const now = new Date().toISOString();
  return await db.from('member_signals').upsert({
    member_id: input.memberId, signal_type: input.signalType,
    subject_type: input.subjectType || null, subject_id: input.subjectId || null,
    title: input.title, detail: input.detail || null, payload: input.payload || {},
    target_roles: ltRolesForScope(input.signalType), priority: input.priority || 'normal',
    consent_at: input.consent ? now : null, status: 'new', updated_at: now,
    idempotency_key: input.idempotencyKey,
  }, { onConflict: 'idempotency_key' }).select('id,status,target_roles').single();
}

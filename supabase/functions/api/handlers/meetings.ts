// Handler: meetings
// TODO: Implement all actions routed to this handler.
// See GAS_TO_SUPABASE_MAP.md for the full action list.
// Copy _stub.ts as a starting template.
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse } from '../../_shared/db.ts';

export async function handlemeetings(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient();
  const auth = await requireAuth(db, p);
  if (!auth.ok && p.action !== 'getMemberDirectory' && p.action !== 'getSimulateData' && p.action !== 'getMemberPublicDetail') {
    return jsonResponse({ ok: false, error: auth.error });
  }
  return jsonResponse({ ok: false, error: `not yet implemented: ${p.action}` });
}

// FILE: usage.ts
// Handler: usage — logUsage, getUsageLog
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

export async function handleUsage(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    // ── logUsage ───────────────────────────────────────────────
    // Insert a usage record. Never fails (always returns ok:true).
    // The main index.ts already fire-and-forgets usage logging for every
    // non-logUsage request; this action handles explicit client calls.
    case 'logUsage': {
      const role     = String(p.role     || '').trim();
      const team     = String(p.team     || p.role || '').trim();
      const platform = String(p.platform || '').trim() || null;
      // GAS sends the action-to-log as `logAction`; fall back to `detail`
      const loggedAction = String(p.logAction || p.detail || '').trim();
      const detail       = String(p.detail    || '').trim();

      // Validate platform against the DB CHECK constraint; default null if unknown
      const validPlatforms = new Set(['mobile', 'desktop', 'line']);
      const platformVal = validPlatforms.has(platform || '') ? platform : null;

      // Fire-and-forget — swallow any DB error so the client never sees a failure
      try {
        await db.from('app_usage').insert({
          role:     role     || null,
          team:     team     || null,
          platform: platformVal,
          action:   loggedAction || null,
          detail:   detail   || null,
        });
      } catch (_e) {
        // intentionally swallowed
      }

      return jsonResponse({ ok: true });
    }

    // ── getUsageLog ────────────────────────────────────────────
    // Get recent usage rows. MC only.
    case 'getUsageLog': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const limit = Math.min(Number(p.limit) || 100, 500);

      const { data, error } = await db
        .from('app_usage')
        .select('id, logged_at, role, team, platform, action, detail')
        .order('logged_at', { ascending: false })
        .limit(limit);
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true, logs: data || [] });
    }

    default:
      return errResponse(`Unknown usage action: ${action}`);
  }
}

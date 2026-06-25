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

      const now = Date.now();
      const DAYS = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

      const teamStats: Record<string, { count7: number; count30: number; lastDate: string; daysAgoLast: number; lastPlatform: string }> = {};

      const logs = ((data || []) as Record<string, unknown>[]).map(row => {
        const ts = new Date(String(row.logged_at || ''));
        const msAgo = Number.isFinite(ts.getTime()) ? now - ts.getTime() : Infinity;
        const daysAgo = Number.isFinite(msAgo) ? Math.floor(msAgo / 86400000) : 999;
        const dateStr = Number.isFinite(ts.getTime()) ? ts.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
        const dayStr  = Number.isFinite(ts.getTime()) ? DAYS[ts.getDay()] : '';
        const timeStr = Number.isFinite(ts.getTime()) ? ts.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '';

        // Build per-team stats
        const key = String(row.team || row.role || 'unknown').toLowerCase();
        if (!teamStats[key]) teamStats[key] = { count7: 0, count30: 0, lastDate: '', daysAgoLast: 999, lastPlatform: '' };
        const ts2 = teamStats[key];
        if (daysAgo <= 7) ts2.count7++;
        if (daysAgo <= 30) ts2.count30++;
        if (daysAgo < ts2.daysAgoLast) {
          ts2.daysAgoLast = daysAgo;
          ts2.lastDate = dateStr;
          ts2.lastPlatform = String(row.platform || '');
        }

        return {
          id:       row.id,
          loggedAt: String(row.logged_at || ''),
          date:     dateStr,
          day:      dayStr,
          time:     timeStr,
          daysAgo,
          role:     String(row.role || ''),
          team:     String(row.team || row.role || ''),
          platform: String(row.platform || ''),
          action:   String(row.action || ''),
          detail:   String(row.detail || ''),
        };
      });

      return jsonResponse({ ok: true, logs, teamStats });
    }

    case 'getLineAnalytics': {
      const auth = await requireAuth(db, p, ['mc', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);
      const days = Math.min(Math.max(Number(p.days) || 30, 1), 180);
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const [eventsRes, deliveryRes, aiRes] = await Promise.all([
        db.from('line_product_events')
          .select('event_name, source, member_id, occurred_at')
          .gte('occurred_at', since),
        db.from('line_message_deliveries')
          .select('status, notification_type, source, created_at')
          .gte('created_at', since),
        db.from('ai_copilot_runs')
          .select('status, actor_role, source, latency_ms, input_tokens, output_tokens, created_at')
          .gte('created_at', since),
      ]);
      if (eventsRes.error) return errResponse(eventsRes.error.message);
      if (deliveryRes.error) return errResponse(deliveryRes.error.message);
      if (aiRes.error) return errResponse(aiRes.error.message);

      const events = (eventsRes.data || []) as Record<string, unknown>[];
      const deliveries = (deliveryRes.data || []) as Record<string, unknown>[];
      const aiRuns = (aiRes.data || []) as Record<string, unknown>[];
      const countBy = (rows: Record<string, unknown>[], key: string) =>
        rows.reduce((acc: Record<string, number>, row) => {
          const value = String(row[key] || 'unknown');
          acc[value] = (acc[value] || 0) + 1;
          return acc;
        }, {});
      const sent = deliveries.filter((row) => row.status === 'sent').length;
      const failed = deliveries.filter((row) => row.status === 'failed').length;
      const activeMembers = new Set(events.map((row) => row.member_id).filter(Boolean)).size;
      const completedAi = aiRuns.filter((row) => row.status === 'completed');
      const avgLatencyMs = completedAi.length
        ? Math.round(completedAi.reduce((sum, row) => sum + Number(row.latency_ms || 0), 0) / completedAi.length)
        : 0;

      return jsonResponse({
        ok: true,
        periodDays: days,
        summary: {
          totalEvents: events.length,
          activeMembers,
          messagesSent: sent,
          messagesFailed: failed,
          deliverySuccessRate: sent + failed ? Math.round(sent * 1000 / (sent + failed)) / 10 : null,
          copilotRuns: aiRuns.length,
          copilotCompleted: completedAi.length,
          avgCopilotLatencyMs: avgLatencyMs,
        },
        eventsByName: countBy(events, 'event_name'),
        deliveriesByType: countBy(deliveries, 'notification_type'),
        aiByRole: countBy(aiRuns, 'actor_role'),
      });
    }

    default:
      return errResponse(`Unknown usage action: ${action}`);
  }
}

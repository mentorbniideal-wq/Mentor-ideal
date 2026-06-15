// Handler: notifications — in-app persistent notifications for MC/Growth
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

export async function handleNotifications(p: Record<string, unknown>): Promise<Response> {
  const db     = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    // ── Get all active (non-dismissed) notifications ──────────
    case 'getNotifications': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);

      const { data, error } = await db
        .from('notifications')
        .select('id, type, severity, title, body, data, created_at, read_at')
        .is('dismissed_at', null)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return errResponse(error.message);

      const notifications = (data || []).map((n: Record<string, unknown>) => ({
        id:        n.id,
        type:      n.type,
        severity:  n.severity,
        title:     n.title,
        body:      n.body || '',
        data:      n.data || {},
        createdAt: n.created_at,
        isRead:    !!n.read_at,
      }));

      const unreadCount = notifications.filter((n: Record<string, unknown>) => !n.isRead).length;
      return jsonResponse({ ok: true, notifications, unreadCount });
    }

    // ── Mark notifications as read ────────────────────────────
    case 'markNotificationsRead': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);

      const ids = Array.isArray(p.ids) ? p.ids.map(String) : [];
      if (!ids.length) {
        // Mark all unread as read
        const { error } = await db.from('notifications')
          .update({ read_at: new Date().toISOString() })
          .is('read_at', null).is('dismissed_at', null);
        if (error) return errResponse(error.message);
      } else {
        const { error } = await db.from('notifications')
          .update({ read_at: new Date().toISOString() })
          .in('id', ids);
        if (error) return errResponse(error.message);
      }
      return jsonResponse({ ok: true });
    }

    // ── Dismiss a notification ────────────────────────────────
    case 'dismissNotification': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);

      const id = String(p.id || '');
      if (!id) return errResponse('id required');

      const { error } = await db.from('notifications')
        .update({ dismissed_at: new Date().toISOString(), read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    // ── Dismiss ALL notifications ─────────────────────────────
    case 'dismissAllNotifications': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const { error } = await db.from('notifications')
        .update({ dismissed_at: new Date().toISOString() })
        .is('dismissed_at', null);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    default:
      return errResponse(`Unknown notifications action: ${action}`);
  }
}

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
      const recipientKey = auth.teamName
        ? `team:${auth.teamName}`
        : `role:${String(auth.role || '')}`;

      const { data, error } = await db
        .from('notifications')
        .select('id, type, severity, title, body, data, created_at, read_at')
        .is('dismissed_at', null)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return errResponse(error.message);

      const ids = (data || []).map((n: Record<string, unknown>) => String(n.id));
      const { data: receiptRows } = ids.length
        ? await db.from('notification_receipts')
            .select('notification_id, read_at, dismissed_at')
            .eq('recipient_key', recipientKey)
            .in('notification_id', ids)
        : { data: [] };
      const receipts: Record<string, Record<string, unknown>> = {};
      for (const receipt of (receiptRows || []) as Record<string, unknown>[]) {
        receipts[String(receipt.notification_id)] = receipt;
      }

      const notifications = (data || []).filter((n: Record<string, unknown>) => {
        return !receipts[String(n.id)]?.dismissed_at;
      }).map((n: Record<string, unknown>) => ({
        id:        n.id,
        type:      n.type,
        severity:  n.severity,
        title:     n.title,
        body:      n.body || '',
        data:      n.data || {},
        createdAt: n.created_at,
        isRead:    !!receipts[String(n.id)]?.read_at,
      }));

      const unreadCount = notifications.filter((n: Record<string, unknown>) => !n.isRead).length;
      return jsonResponse({ ok: true, notifications, unreadCount });
    }

    // ── Mark notifications as read ────────────────────────────
    case 'markNotificationsRead': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);
      const recipientKey = auth.teamName
        ? `team:${auth.teamName}`
        : `role:${String(auth.role || '')}`;

      const ids = Array.isArray(p.ids) ? p.ids.map(String) : [];
      let targetIds = ids;
      if (!targetIds.length) {
        const { data: active } = await db.from('notifications')
          .select('id').is('dismissed_at', null).limit(100);
        targetIds = (active || []).map((row: Record<string, unknown>) => String(row.id));
      }
      if (targetIds.length) {
        const now = new Date().toISOString();
        const { error } = await db.from('notification_receipts').upsert(
          targetIds.map(id => ({ notification_id: id, recipient_key: recipientKey, read_at: now })),
          { onConflict: 'notification_id,recipient_key' },
        );
        if (error) return errResponse(error.message);
      }
      return jsonResponse({ ok: true });
    }

    // ── Dismiss a notification ────────────────────────────────
    case 'dismissNotification': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);
      const recipientKey = auth.teamName
        ? `team:${auth.teamName}`
        : `role:${String(auth.role || '')}`;

      const id = String(p.id || '');
      if (!id) return errResponse('id required');

      const now = new Date().toISOString();
      const { error } = await db.from('notification_receipts').upsert({
        notification_id: id,
        recipient_key: recipientKey,
        dismissed_at: now,
        read_at: now,
      }, { onConflict: 'notification_id,recipient_key' });
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    // ── Dismiss ALL notifications ─────────────────────────────
    case 'dismissAllNotifications': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const { data: active, error: activeError } = await db.from('notifications')
        .select('id').is('dismissed_at', null).limit(100);
      if (activeError) return errResponse(activeError.message);
      const now = new Date().toISOString();
      const rows = (active || []).map((row: Record<string, unknown>) => ({
        notification_id: String(row.id),
        recipient_key: 'role:mc',
        dismissed_at: now,
        read_at: now,
      }));
      if (rows.length) {
        const { error } = await db.from('notification_receipts')
          .upsert(rows, { onConflict: 'notification_id,recipient_key' });
        if (error) return errResponse(error.message);
      }
      return jsonResponse({ ok: true });
    }

    default:
      return errResponse(`Unknown notifications action: ${action}`);
  }
}

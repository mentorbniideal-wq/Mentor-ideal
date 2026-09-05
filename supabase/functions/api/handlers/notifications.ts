// Handler: notifications — in-app persistent notifications for MC/Growth
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

const NOTIFICATION_ROLES = ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp', 'mentor_support', 'growth'];

function recipientKey(auth: { teamName?: string | null; role?: string }): string {
  return auth.teamName ? `team:${auth.teamName}` : `role:${String(auth.role || '')}`;
}

async function activeChapterId(db: ReturnType<typeof getServiceClient>): Promise<string | null> {
  const { data } = await db.from('chapter_profiles').select('id')
    .eq('is_active', true).order('created_at').limit(1).maybeSingle();
  return data?.id ? String(data.id) : null;
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map(x => x.toString(16).padStart(2, '0')).join('');
}

export async function handleNotifications(p: Record<string, unknown>): Promise<Response> {
  const db     = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    // ── Get all active (non-dismissed) notifications ──────────
    case 'getNotifications': {
      const auth = await requireAuth(db, p, NOTIFICATION_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      const key = recipientKey(auth);
      const chapterId = await activeChapterId(db);

      // Filter by target_audience: null means broadcast to all, otherwise must include recipientKey
      const { data, error } = await db
        .from('notifications')
        .select('id, type, severity, title, body, data, action_url, expires_at, created_at')
        .is('dismissed_at', null)
        .or(`target_audience.is.null,target_audience.cs.{"${key}"}`)
        .or(chapterId ? `chapter_id.is.null,chapter_id.eq.${chapterId}` : 'chapter_id.is.null')
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return errResponse(error.message);

      const ids = (data || []).map((n: Record<string, unknown>) => String(n.id));
      const { data: receiptRows } = ids.length
        ? await db.from('notification_receipts')
            .select('notification_id, read_at, dismissed_at')
            .eq('recipient_key', key)
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
        actionUrl: n.action_url || (n.data as Record<string, unknown> | null)?.actionUrl || null,
        createdAt: n.created_at,
        isRead:    !!receipts[String(n.id)]?.read_at,
      }));

      const unreadCount = notifications.filter((n: Record<string, unknown>) => !n.isRead).length;
      return jsonResponse({ ok: true, notifications, unreadCount });
    }

    case 'getWebPushConfig': {
      const auth = await requireAuth(db, p, NOTIFICATION_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      const publicKey = String(Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY') || '');
      return jsonResponse({ ok: true, enabled: Boolean(publicKey), publicKey });
    }

    case 'getWebPushStatus': {
      const auth = await requireAuth(db, p, NOTIFICATION_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      const endpoint = String(p.endpoint || '');
      if (!endpoint) return errResponse('endpoint required', 400);
      const chapterId = await activeChapterId(db);
      const endpointHash = await sha256(endpoint);
      const { data, error } = await db.from('web_push_subscriptions')
        .select('status,last_seen_at,last_success_at,last_error_code,recipient_keys')
        .eq('chapter_id', chapterId).eq('endpoint_hash', endpointHash).maybeSingle();
      if (error) return errResponse(error.message);
      const keys = Array.isArray(data?.recipient_keys) ? data.recipient_keys.map(String) : [];
      if (!data || !keys.includes(recipientKey(auth))) return errResponse('ไม่พบ Push ของสิทธิ์นี้', 404);
      return jsonResponse({ ok: true, status: data.status, lastSeenAt: data.last_seen_at, lastSuccessAt: data.last_success_at, lastErrorCode: data.last_error_code });
    }

    case 'sendWebPushTest': {
      const auth = await requireAuth(db, p, NOTIFICATION_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      const endpoint = String(p.endpoint || '');
      if (!endpoint) return errResponse('endpoint required', 400);
      const chapterId = await activeChapterId(db);
      if (!chapterId) return errResponse('ยังไม่ได้ตั้งค่า Chapter ที่ใช้งาน', 503);
      const endpointHash = await sha256(endpoint);
      const key = recipientKey(auth);
      const { data: sub } = await db.from('web_push_subscriptions').select('id,recipient_keys,status')
        .eq('chapter_id', chapterId).eq('endpoint_hash', endpointHash).eq('status', 'active').maybeSingle();
      const keys = Array.isArray(sub?.recipient_keys) ? sub.recipient_keys.map(String) : [];
      if (!sub || !keys.includes(key)) return errResponse('กรุณาเปิด Push บนเครื่องนี้ก่อน', 409);
      const minute = new Date().toISOString().slice(0, 16);
      const { data: notification, error } = await db.from('notifications').insert({
        chapter_id: chapterId, type: 'web_push_test', severity: 'info',
        title: 'Push พร้อมใช้งาน', body: `สวัสดี ${auth.displayName || 'ครับ'} เครื่องนี้รับการแจ้งเตือนได้แล้ว`,
        target_audience: [`subscription:${endpointHash}`], action_url: '/', expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        dedupe_key: `push-test:${endpointHash}:${minute}`,
      }).select('id').single();
      if (error) return errResponse(error.code === '23505' ? 'ส่งทดสอบไปแล้วในนาทีนี้ กรุณารอสักครู่' : error.message, error.code === '23505' ? 409 : 500);
      return jsonResponse({ ok: true, queued: true, notificationId: notification?.id });
    }

    case 'subscribeWebPush': {
      const auth = await requireAuth(db, p, NOTIFICATION_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      const chapterId = await activeChapterId(db);
      if (!chapterId) return errResponse('ยังไม่ได้ตั้งค่า Chapter ที่ใช้งาน', 503);
      const subscription = p.subscription as Record<string, unknown> | undefined;
      const endpoint = String(subscription?.endpoint || '');
      const keys = subscription?.keys as Record<string, unknown> | undefined;
      const p256dh = String(keys?.p256dh || '');
      const authSecret = String(keys?.auth || '');
      if (!endpoint.startsWith('https://') || endpoint.length > 2048 || !p256dh || !authSecret) {
        return errResponse('Push subscription ไม่ถูกต้อง', 400);
      }
      const endpointHash = await sha256(endpoint);
      const key = recipientKey(auth);
      const { data: existing } = await db.from('web_push_subscriptions').select('recipient_keys')
        .eq('chapter_id', chapterId).eq('endpoint_hash', endpointHash).maybeSingle();
      const recipientKeys = [...new Set([...(Array.isArray(existing?.recipient_keys) ? existing.recipient_keys.map(String) : []), key, `subscription:${endpointHash}`])];
      const row = {
        chapter_id: chapterId, recipient_key: key, recipient_keys: recipientKeys, endpoint,
        endpoint_hash: endpointHash, p256dh, auth_secret: authSecret,
        status: 'active', user_agent: String(p.userAgent || '').slice(0, 500) || null,
        platform: String(p.platform || '').slice(0, 80) || null,
        failure_count: 0, last_seen_at: new Date().toISOString(),
        last_error_code: null, updated_at: new Date().toISOString(),
      };
      const { error } = await db.from('web_push_subscriptions').upsert(row, {
        onConflict: 'chapter_id,endpoint_hash',
      });
      if (error) return errResponse(error.message);
      try {
        await db.from('chapter_audit_events').insert({
          event_type: 'web_push_subscribed', actor_role: auth.role,
          actor_ref: auth.email || auth.role, subject_type: 'web_push_subscription',
          subject_ref: endpointHash.slice(0, 16),
          metadata: { chapterId, recipientKey: row.recipient_key, platform: row.platform },
        });
      } catch { /* Notification consent must not fail because audit storage is unavailable. */ }
      return jsonResponse({ ok: true, subscribed: true });
    }

    case 'unsubscribeWebPush': {
      const auth = await requireAuth(db, p, NOTIFICATION_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      const endpoint = String(p.endpoint || '');
      if (!endpoint) return errResponse('endpoint required', 400);
      const chapterId = await activeChapterId(db);
      const endpointHash = await sha256(endpoint);
      let find = db.from('web_push_subscriptions').select('id,recipient_keys').eq('endpoint_hash', endpointHash);
      if (chapterId) find = find.eq('chapter_id', chapterId);
      const { data: current } = await find.maybeSingle();
      const kept = (Array.isArray(current?.recipient_keys) ? current.recipient_keys.map(String) : []).filter((x: string) => x !== recipientKey(auth));
      const hasRecipient = kept.some((x: string) => !x.startsWith('subscription:'));
      const remaining = hasRecipient ? kept : [];
      const { error } = current ? await db.from('web_push_subscriptions').update({
        recipient_keys: remaining, status: remaining.length ? 'active' : 'revoked', updated_at: new Date().toISOString(),
      }).eq('id', current.id) : { error: null };
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true, subscribed: false });
    }

    // ── Mark notifications as read ────────────────────────────
    case 'markNotificationsRead': {
      const auth = await requireAuth(db, p, NOTIFICATION_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      const recipientKey = auth.teamName ? `team:${auth.teamName}` : `role:${String(auth.role || '')}`;

      const ids = Array.isArray(p.ids) ? p.ids.map(String) : [];
      const chapterId = await activeChapterId(db);
      let visible = db.from('notifications').select('id').is('dismissed_at', null)
        .or(`target_audience.is.null,target_audience.cs.{"${recipientKey}"}`)
        .or(chapterId ? `chapter_id.is.null,chapter_id.eq.${chapterId}` : 'chapter_id.is.null')
        .limit(100);
      if (ids.length) visible = visible.in('id', ids);
      const { data: active, error: visibleError } = await visible;
      if (visibleError) return errResponse(visibleError.message);
      const targetIds = (active || []).map((row: Record<string, unknown>) => String(row.id));
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
      const auth = await requireAuth(db, p, NOTIFICATION_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      const recipientKey = auth.teamName
        ? `team:${auth.teamName}`
        : `role:${String(auth.role || '')}`;

      const id = String(p.id || '');
      if (!id) return errResponse('id required');

      const chapterId = await activeChapterId(db);
      const { data: visible } = await db.from('notifications').select('id').eq('id', id)
        .is('dismissed_at', null)
        .or(`target_audience.is.null,target_audience.cs.{"${recipientKey}"}`)
        .or(chapterId ? `chapter_id.is.null,chapter_id.eq.${chapterId}` : 'chapter_id.is.null')
        .maybeSingle();
      if (!visible) return errResponse('ไม่พบการแจ้งเตือนในสิทธิ์ของคุณ', 404);

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
      const auth = await requireAuth(db, p, NOTIFICATION_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      // Use the same dynamic recipientKey as every other case — never hardcode 'role:mc'
      const recipientKey = auth.teamName
        ? `team:${auth.teamName}`
        : `role:${String(auth.role || '')}`;

      const chapterId = await activeChapterId(db);
      const { data: active, error: activeError } = await db.from('notifications')
        .select('id').is('dismissed_at', null)
        .or(`target_audience.is.null,target_audience.cs.{"${recipientKey}"}`)
        .or(chapterId ? `chapter_id.is.null,chapter_id.eq.${chapterId}` : 'chapter_id.is.null')
        .limit(100);
      if (activeError) return errResponse(activeError.message);
      const now = new Date().toISOString();
      const rows = (active || []).map((row: Record<string, unknown>) => ({
        notification_id: String(row.id),
        recipient_key: recipientKey,
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

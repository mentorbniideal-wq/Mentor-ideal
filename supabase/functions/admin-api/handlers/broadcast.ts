import { requireAdminAccess } from '../../_shared/admin-auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';
import { lineMulticast, linePush, sha256Hex } from '../../_shared/line.ts';

export async function handleAdminBroadcast(p: Record<string, unknown>): Promise<Response> {
  const db   = getServiceClient();
  const action = String(p.action);
  const auth = await requireAdminAccess(db, p, 'broadcast', {
    write: action === 'sendAdminBroadcast',
  });
  if (!auth.ok) return errResponse(auth.error!);

  if (action === 'getAdminBroadcasts') {
    const { data, error } = await db
      .from('broadcasts')
      .select('id, title, message, target_scope, sent_at, line_delivered, recipient_count')
      .order('sent_at', { ascending: false })
      .limit(50);
    if (error) return errResponse(error.message);
    return jsonResponse({ ok: true, broadcasts: data || [] });
  }

  if (action === 'sendAdminBroadcast') {
    const message     = String(p.message     || '').trim();
    const title       = String(p.title       || '').trim() || null;
    const targetScope = String(p.targetScope || 'all').trim();
    const targetUserId= String(p.targetUserId|| '').trim();

    if (!message) return errResponse('message required');

    let lineDelivered   = false;
    let recipientCount  = 0;

    if (Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')) {
      try {
        // Treat retries/double-clicks with the same payload in a five-minute
        // window as one send while still allowing a deliberate later resend.
        const windowKey = Math.floor(Date.now() / 300000);
        const digest = await sha256Hex(`${targetScope}|${targetUserId}|${message}`);
        const sendKey = `admin-broadcast:${digest.slice(0, 24)}:${windowKey}`;

        if (targetUserId) {
          const result = await linePush(targetUserId, message, {
            db,
            idempotencyKey: sendKey,
            notificationType: 'admin_broadcast',
            source: 'admin-api/broadcast',
            module: 'manual',
            category: 'admin_broadcast',
            priority: 'informational',
          });
          lineDelivered = result.sent || result.skipped;
          recipientCount = lineDelivered ? 1 : 0;
        } else {
          // Send only to registered members, preserving access and audit boundaries.
          const { data: links } = await db.from('line_members').select('line_user_id');
          const userIds = ((links || []) as { line_user_id: string }[])
            .map((row) => row.line_user_id)
            .filter(Boolean);
          const results = await lineMulticast(userIds, message, {
            db,
            idempotencyKey: sendKey,
            notificationType: 'admin_broadcast',
            source: 'admin-api/broadcast',
            module: 'manual',
            category: 'admin_broadcast',
            priority: 'informational',
          });
          lineDelivered = results.length > 0 && results.every((result) => result.sent || result.skipped);
          recipientCount = lineDelivered ? userIds.length : 0;
        }
      } catch (error) {
        console.error('[admin-broadcast] LINE delivery failed:', error);
      }
    }

    const sentAt = new Date().toISOString();
    const { error } = await db.from('broadcasts').insert({
      sender_role:     'mc',
      title,
      message,
      target_scope:    targetScope,
      sent_at:         sentAt,
      line_delivered:  lineDelivered,
      recipient_count: recipientCount,
    });
    if (error) return errResponse(error.message);

    return jsonResponse({ ok: true, sentAt, lineDelivered, recipientCount });
  }

  return errResponse(`Unknown broadcast action: ${action}`);
}

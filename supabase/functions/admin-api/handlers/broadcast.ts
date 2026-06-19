import { requireAdminAccess } from '../../_shared/admin-auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

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

    const LINE_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '';
    let lineDelivered   = false;
    let recipientCount  = 0;

    if (LINE_TOKEN) {
      try {
        const msgs = [{ type: 'text', text: message }];

        if (targetUserId) {
          // Push to specific user
          const res = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_TOKEN}` },
            body: JSON.stringify({ to: targetUserId, messages: msgs }),
          });
          lineDelivered  = res.ok;
          recipientCount = lineDelivered ? 1 : 0;
        } else {
          // Broadcast to all followers
          const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_TOKEN}` },
            body: JSON.stringify({ messages: msgs }),
          });
          lineDelivered  = res.ok;
          recipientCount = lineDelivered ? -1 : 0; // -1 = all
        }
      } catch { /* swallow — still log to DB */ }
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

// Unified LINE Messaging API client.
// Supports reply, push, multicast, delivery logging, and idempotent sends.

const LINE_API = 'https://api.line.me/v2/bot/message';

// Simulator capture: replyTokens starting with "sim-" store messages here instead of calling LINE API
export const SIM_CAPTURES = new Map<string, LineMessage[][]>();

type LineMessage = Record<string, unknown>;

interface LineDatabase {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message?: string } | null;
  }>;
  from: (table: string) => any;
}

export interface LineSendOptions {
  db?: LineDatabase;
  idempotencyKey?: string;
  lineRetryKey?: string;
  memberId?: string | null;
  notificationType?: string;
  source?: string;
  module?: string;
  category?: string;
  priority?: 'critical' | 'action_required' | 'reminder' | 'informational';
}

export interface LineSendResult {
  sent: boolean;
  skipped: boolean;
  deliveryId?: string;
  requestId?: string;
  status?: number;
}

function getToken(): string {
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN not set in environment');
  return token;
}

export const LINE_QR_MEMBER = [
  { type: 'action', action: { type: 'message', label: '📊 สถานะ', text: 'สถานะ' } },
  { type: 'action', action: { type: 'message', label: '📈 ประวัติ', text: 'ประวัติ' } },
  { type: 'action', action: { type: 'message', label: '🤝 แนะนำ', text: 'แนะนำ' } },
  { type: 'action', action: { type: 'message', label: '👥 ทีม', text: 'ทีม' } },
  { type: 'action', action: { type: 'message', label: '🙋 ลา', text: 'ลา' } },
  { type: 'action', action: { type: 'message', label: '👥 ส่ง sub', text: 'ส่ง sub' } },
];

export const LINE_QR_MENTOR = [
  { type: 'action', action: { type: 'message', label: '📊 สถานะ', text: 'สถานะ' } },
  { type: 'action', action: { type: 'message', label: '📈 ประวัติ', text: 'ประวัติ' } },
  { type: 'action', action: { type: 'message', label: '🤝 แนะนำ', text: 'แนะนำ' } },
  { type: 'action', action: { type: 'message', label: '👥 ทีม', text: 'ทีม' } },
  { type: 'action', action: { type: 'message', label: '🙋 ลา', text: 'ลา' } },
  { type: 'action', action: { type: 'message', label: '👥 ส่ง sub', text: 'ส่ง sub' } },
];

export const LINE_QR_MC = [
  { type: 'action', action: { type: 'message', label: '📊 สถานะ', text: 'สถานะ' } },
  { type: 'action', action: { type: 'message', label: '📈 ประวัติ', text: 'ประวัติ' } },
  { type: 'action', action: { type: 'message', label: '🤝 แนะนำ', text: 'แนะนำ' } },
  { type: 'action', action: { type: 'message', label: '👥 ทีม', text: 'ทีม' } },
  { type: 'action', action: { type: 'message', label: '🙋 ลา', text: 'ลา' } },
  { type: 'action', action: { type: 'message', label: '👥 ส่ง sub', text: 'ส่ง sub' } },
];

export const LINE_QR_GROWTH = [
  { type: 'action', action: { type: 'message', label: '📊 สถานะ', text: 'สถานะ' } },
  { type: 'action', action: { type: 'message', label: '📈 ประวัติ', text: 'ประวัติ' } },
  { type: 'action', action: { type: 'message', label: '🤝 แนะนำ', text: 'แนะนำ' } },
  { type: 'action', action: { type: 'message', label: '👥 ทีม', text: 'ทีม' } },
  { type: 'action', action: { type: 'message', label: '🙋 ลา', text: 'ลา' } },
  { type: 'action', action: { type: 'message', label: '👥 ส่ง sub', text: 'ส่ง sub' } },
];

// Backward-compat alias
export const LINE_QR_MAIN = LINE_QR_MEMBER;

export function textMessage(text: string, quickReplyItems?: unknown[]): LineMessage {
  const message: LineMessage = { type: 'text', text };
  if (quickReplyItems?.length) {
    message.quickReply = { items: quickReplyItems.slice(0, 13) };
  }
  return message;
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizeLinkToken(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function generateLinkToken(length = 10): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
}

export async function buildIdempotencyKey(parts: unknown[]): Promise<string> {
  return sha256Hex(parts.map((part) => String(part ?? '')).join('|'));
}

export function bangkokDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function bangkokWeekKey(date = new Date()): string {
  const bangkokDate = bangkokDateKey(date);
  const [year, month, day] = bangkokDate.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const weekday = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - weekday);
  const weekYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, '0')}`;
}

export function renewalMilestone(daysRemaining: number): string | null {
  if (daysRemaining < 0) return `expired:${Math.floor(Math.abs(daysRemaining) / 7)}`;
  if (daysRemaining === 0) return '0';
  if (daysRemaining <= 1) return '1';
  if (daysRemaining <= 3) return '3';
  if (daysRemaining <= 7) return '7';
  if (daysRemaining <= 14) return '14';
  if (daysRemaining <= 30) return '30';
  if (daysRemaining <= 45) return '45';
  return null;
}

async function claimDelivery(
  options: LineSendOptions,
  channel: 'reply' | 'push' | 'multicast',
  recipientId: string,
  messages: LineMessage[],
): Promise<{ deliveryId?: string; shouldSend: boolean }> {
  if (!options.db || !options.idempotencyKey) return { shouldSend: true };

  const payloadHash = await sha256Hex(JSON.stringify(messages));
  const notificationType = String(options.notificationType || '');
  const notificationSource = String(options.source || '');
  const inferredModule = options.module || (
    notificationType.startsWith('one_to_one') || notificationType.includes('121') || notificationSource.includes('121') ? 'one_to_one' :
    notificationType.startsWith('visitor') ? 'visitor' :
    notificationType.startsWith('renewal') ? 'renewal' :
    notificationType.startsWith('training') ? 'training' :
    notificationType.startsWith('goal') ? 'goal' : 'operational'
  );
  // Extract first 300 chars of the primary text message for the activity log
  const firstText = messages.find(m => m.type === 'text' && typeof m.text === 'string');
  const messagePreview = firstText ? String(firstText.text).slice(0, 300) : null;
  const baseArgs = {
    p_idempotency_key: options.idempotencyKey,
    p_channel: channel,
    p_recipient_id: recipientId,
    p_member_id: options.memberId || null,
    p_notification_type: options.notificationType || null,
    p_source: options.source || null,
    p_payload_hash: payloadHash,
    p_module: inferredModule,
    p_category: options.category || notificationType || null,
    p_priority: options.priority || 'informational',
  };
  const { data, error } = await options.db.rpc('fn_claim_line_delivery', {
    ...baseArgs,
    p_message_preview: messagePreview,
  });
  if (error) throw new Error(`Cannot claim LINE delivery: ${error.message || 'unknown error'}`);

  const row = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
  return {
    deliveryId: row?.delivery_id ? String(row.delivery_id) : undefined,
    shouldSend: row?.should_send !== false,
  };
}

async function updateDelivery(
  db: LineDatabase | undefined,
  deliveryId: string | undefined,
  values: Record<string, unknown>,
): Promise<void> {
  if (!db || !deliveryId) return;
  const { error } = await db.from('line_message_deliveries')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', deliveryId);
  if (error) console.error('[line] Cannot update delivery log:', error.message);
}

export async function lineRetryKeyFor(
  options: LineSendOptions,
  channel: 'reply' | 'push' | 'multicast',
): Promise<string | undefined> {
  if (channel === 'reply') return undefined;
  const seed = options.lineRetryKey || options.idempotencyKey;
  if (!seed) return undefined;
  const hex = await sha256Hex(seed);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function sendLineRequest(
  channel: 'reply' | 'push' | 'multicast',
  recipientId: string,
  body: Record<string, unknown>,
  messages: LineMessage[],
  options: LineSendOptions = {},
): Promise<LineSendResult> {
  const claim = await claimDelivery(options, channel, recipientId, messages);
  if (!claim.shouldSend) {
    return { sent: false, skipped: true, deliveryId: claim.deliveryId };
  }

  try {
    await updateDelivery(options.db, claim.deliveryId, {
      message_payload: messages.slice(0, 5),
    });
    const retryKey = await lineRetryKeyFor(options, channel);
    const response = await fetch(`${LINE_API}/${channel}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
        ...(retryKey ? { 'X-Line-Retry-Key': retryKey } : {}),
      },
      body: JSON.stringify(body),
    });
    const responseBody = await response.text();
    const requestId = response.headers.get('x-line-request-id') || undefined;

    if (!response.ok) {
      await updateDelivery(options.db, claim.deliveryId, {
        status: 'failed',
        response_status: response.status,
        response_body: responseBody.slice(0, 2000),
        provider_request_id: requestId || null,
        last_error: `LINE API ${response.status}`,
      });
      throw new Error(`LINE API ${response.status}: ${responseBody.slice(0, 500)}`);
    }

    await updateDelivery(options.db, claim.deliveryId, {
      status: 'sent',
      response_status: response.status,
      response_body: responseBody.slice(0, 2000),
      provider_request_id: requestId || null,
      sent_at: new Date().toISOString(),
      last_error: null,
    });
    return {
      sent: true,
      skipped: false,
      deliveryId: claim.deliveryId,
      requestId,
      status: response.status,
    };
  } catch (error) {
    await updateDelivery(options.db, claim.deliveryId, {
      status: 'failed',
      last_error: error instanceof Error ? error.message.slice(0, 2000) : String(error),
    });
    throw error;
  }
}

export async function lineReplyMessages(
  replyToken: string,
  messages: LineMessage[],
  options: LineSendOptions = {},
): Promise<LineSendResult> {
  // Simulator mode: capture instead of sending to LINE API
  if (replyToken.startsWith('sim-')) {
    const bucket = SIM_CAPTURES.get(replyToken);
    if (bucket !== undefined) bucket.push(messages.slice(0, 5));
    return { sent: true, skipped: false, status: 200 };
  }
  return sendLineRequest(
    'reply',
    replyToken,
    { replyToken, messages: messages.slice(0, 5) },
    messages.slice(0, 5),
    options,
  );
}

export async function linePushMessages(
  userId: string,
  messages: LineMessage[],
  options: LineSendOptions = {},
): Promise<LineSendResult> {
  return sendLineRequest(
    'push',
    userId,
    { to: userId, messages: messages.slice(0, 5) },
    messages.slice(0, 5),
    options,
  );
}

export async function lineReply(
  replyToken: string,
  text: string,
  quickReplyItems?: unknown[],
  options: LineSendOptions = {},
): Promise<LineSendResult> {
  return lineReplyMessages(replyToken, [textMessage(text, quickReplyItems)], options);
}

export async function linePush(
  userId: string,
  text: string,
  options: LineSendOptions = {},
): Promise<LineSendResult> {
  return linePushMessages(userId, [textMessage(text)], options);
}

export async function lineMulticast(
  userIds: string[],
  text: string,
  options: LineSendOptions = {},
): Promise<LineSendResult[]> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const chunks = chunkArray(uniqueIds, 500);
  const results: LineSendResult[] = [];

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    const messages = [textMessage(text)];
    const chunkOptions = options.idempotencyKey
      ? { ...options, idempotencyKey: `${options.idempotencyKey}:chunk:${index}` }
      : options;
    results.push(await sendLineRequest(
      'multicast',
      `multicast:${await sha256Hex(chunk.slice().sort().join('|'))}`,
      { to: chunk, messages },
      messages,
      chunkOptions,
    ));
  }
  return results;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export interface LineEvent {
  webhookEventId?: string;
  timestamp?: number;
  type: string;
  replyToken?: string;
  source: { type: string; userId?: string };
  message?: { type: string; text?: string; id?: string };
  postback?: { data: string };
  deliveryContext?: { isRedelivery?: boolean };
}

export function parseWebhookBody(raw: string): LineEvent[] {
  try {
    const body = JSON.parse(raw);
    return Array.isArray(body.events) ? body.events : [];
  } catch {
    return [];
  }
}

export async function eventIdFor(event: LineEvent): Promise<string> {
  if (event.webhookEventId) return event.webhookEventId;
  return buildIdempotencyKey([
    event.type,
    event.timestamp,
    event.source?.type,
    event.source?.userId,
    event.message?.id,
    event.postback?.data,
  ]);
}

export async function verifySignature(body: string, signature: string): Promise<boolean> {
  const secret = Deno.env.get('LINE_CHANNEL_SECRET');
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const calculated = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const computed = btoa(String.fromCharCode(...new Uint8Array(calculated)));
  if (computed.length !== signature.length) return false;
  let mismatch = 0;
  for (let index = 0; index < computed.length; index++) {
    mismatch |= computed.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  return mismatch === 0;
}

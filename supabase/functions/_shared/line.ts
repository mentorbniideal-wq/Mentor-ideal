// LINE Messaging API helper — replaces _lineReply() and _sendLineMsg() in WEBAPP.js
// Uses LINE Messaging API (Push + Reply), NOT LINE Notify (deprecated).
// Channel Access Token stored in Supabase Vault: LINE_CHANNEL_ACCESS_TOKEN

const LINE_API = 'https://api.line.me/v2/bot/message';

function getToken(): string {
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN not set in environment');
  return token;
}

// ── Quick Reply button items (mirrors LINE_QR_MAIN in WEBAPP.js) ──────────
export const LINE_QR_MAIN = [
  { type: 'action', action: { type: 'message', label: '📊 สถานะ',   text: 'สถานะ' } },
  { type: 'action', action: { type: 'message', label: '📈 ประวัติ',  text: 'ประวัติ' } },
  { type: 'action', action: { type: 'message', label: '🤝 แนะนำ',   text: 'แนะนำ' } },
  { type: 'action', action: { type: 'message', label: '👥 ทีม',     text: 'ทีม' } },
  { type: 'action', action: { type: 'message', label: '🙋 ลา',      text: 'ลา' } },
  { type: 'action', action: { type: 'message', label: '👥 ส่ง sub', text: 'ส่ง sub' } },
];

/** Reply to a LINE message (uses replyToken — one-time use). */
export async function lineReply(
  replyToken: string,
  text: string,
  quickReplyItems?: unknown[],
): Promise<void> {
  const msg: Record<string, unknown> = { type: 'text', text };
  if (quickReplyItems?.length) {
    msg.quickReply = { items: quickReplyItems.slice(0, 13) };
  }
  await fetch(`${LINE_API}/reply`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body:    JSON.stringify({ replyToken, messages: [msg] }),
  });
}

/** Push a message to a specific LINE userId (server-initiated). */
export async function linePush(userId: string, text: string): Promise<void> {
  await fetch(`${LINE_API}/push`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body:    JSON.stringify({ to: userId, messages: [{ type: 'text', text }] }),
  });
}

/** Broadcast to multiple users (max 500 per call). */
export async function lineMulticast(userIds: string[], text: string): Promise<void> {
  const chunks = chunkArray(userIds, 500);
  for (const chunk of chunks) {
    await fetch(`${LINE_API}/multicast`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body:    JSON.stringify({ to: chunk, messages: [{ type: 'text', text }] }),
    });
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

/** Parse LINE webhook body — returns array of events. */
export interface LineEvent {
  type:       string;
  replyToken?: string;
  source:     { type: string; userId: string };
  message?:   { type: string; text?: string; id?: string };
  postback?:  { data: string };
}

export function parseWebhookBody(raw: string): LineEvent[] {
  try {
    const body = JSON.parse(raw);
    return Array.isArray(body.events) ? body.events : [];
  } catch {
    return [];
  }
}

/** Verify LINE webhook signature (X-Line-Signature header). */
export async function verifySignature(body: string, signature: string): Promise<boolean> {
  const secret = Deno.env.get('LINE_CHANNEL_SECRET');
  if (!secret) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return computed === signature;
}

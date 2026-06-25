export async function trackLineEvent(
  db: any,
  eventName: string,
  context: {
    lineUserId?: string | null;
    memberId?: string | null;
    role?: string | null;
    source?: string;
    properties?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    await db.from('line_product_events').insert({
      event_name: eventName,
      line_user_id: context.lineUserId || null,
      member_id: context.memberId || null,
      role: context.role || null,
      source: context.source || 'line',
      properties: context.properties || {},
    });
  } catch (error) {
    console.warn('[analytics] event dropped:', error);
  }
}


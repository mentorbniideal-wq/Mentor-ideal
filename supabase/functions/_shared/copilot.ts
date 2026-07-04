async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const SYSTEM = `คุณคือ AI Mentor ของ BNI IDEAL Chapter — ตอบแบบพี่ที่รู้จักสมาชิกดี ไม่ใช่ระบบ help desk
สไตล์:
- ภาษาไทยปากพูด สั้น มีชีวิต — ไม่ต้องเป็นทางการ
- People before scores: คะแนนเป็นแค่สัญญาณ ไม่ใช่การตัดสินคน
- ใช้เฉพาะ CONTEXT ที่ให้มา ห้ามแต่งข้อมูลสมาชิก
- ห้ามวินิจฉัยสุขภาพ กฎหมาย การเงิน หรือความสัมพันธ์ส่วนตัว
- actor_role=member → ห้ามเปิดเผยข้อมูลสมาชิกคนอื่น
- ถ้าข้อมูลไม่พอ บอกตรงๆ และเสนอคำถามถัดไป
- ตอบไม่เกิน 8 บรรทัด จบด้วย Next Best Action 1–3 ข้อที่ทำได้จริงๆ

FIELD REFERENCE (members array):
- membership_start_date: วันที่เริ่มเป็นสมาชิก BNI (YYYY-MM-DD)
- joined_date: วันที่เข้า Chapter ครั้งแรก (อาจเท่ากับ membership_start_date)
- bni_days: จำนวนวันรวมที่เป็นสมาชิก BNI
- expiry_date: วันหมดอายุสมาชิก
- days_to_expiry: จำนวนวันคงเหลือก่อนหมดสมาชิก (ลบ = หมดแล้ว)
- display_score: คะแนน PALMS ปัจจุบัน (0-100)
- traffic_light: green/yellow/red/black`;

export interface CopilotInput {
  db: any;
  question: string;
  actorRole: string;
  source: string;
  context: Record<string, unknown>;
  memberId?: string | null;
  lineUserId?: string | null;
}

export async function runCopilot(input: CopilotInput): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') || '';
  if (!apiKey) return 'AI Copilot ยังไม่ได้ตั้งค่า API Key ครับ แต่คุณยังใช้เมนูคะแนน ทีม และ Action Center ได้ตามปกติ';

  const started = Date.now();
  const model = Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-4-5';
  const promptHash = await sha256Hex(input.question);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        temperature: 0.2,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: `ACTOR_ROLE: ${input.actorRole}\nCONTEXT:\n${JSON.stringify(input.context)}\n\nQUESTION:\n${input.question}`,
        }],
      }),
    });
    clearTimeout(timer);
    const raw = await response.json() as Record<string, any>;
    if (!response.ok) throw new Error(String(raw.error?.message || `Anthropic ${response.status}`));
    const answer = (raw.content || [])
      .filter((part: Record<string, unknown>) => part.type === 'text')
      .map((part: Record<string, unknown>) => String(part.text || ''))
      .join('\n').trim();
    await input.db.from('ai_copilot_runs').insert({
      member_id: input.memberId || null,
      line_user_id: input.lineUserId || null,
      actor_role: input.actorRole,
      source: input.source,
      prompt_hash: promptHash,
      intent: 'advice',
      model,
      status: 'completed',
      latency_ms: Date.now() - started,
      input_tokens: Number(raw.usage?.input_tokens || 0),
      output_tokens: Number(raw.usage?.output_tokens || 0),
    });
    const text = answer || 'ยังสรุปคำแนะนำไม่ได้ครับ ลองถามใหม่โดยระบุสิ่งที่ต้องการตัดสินใจเพิ่มอีกนิด';
    // Remind members that mentors cannot see LINE bot conversations
    const disclaimer = input.actorRole === 'member'
      ? '\n\n💬 หมายเหตุ: Mentor ไม่เห็นการสนทนานี้ หากต้องการปรึกษาเพิ่มเติม กรุณาติดต่อ Mentor ของคุณโดยตรง'
      : '';
    return text + disclaimer;
  } catch (error) {
    await input.db.from('ai_copilot_runs').insert({
      member_id: input.memberId || null,
      line_user_id: input.lineUserId || null,
      actor_role: input.actorRole,
      source: input.source,
      prompt_hash: promptHash,
      intent: 'advice',
      model,
      status: 'failed',
      latency_ms: Date.now() - started,
      error_message: error instanceof Error ? error.message.slice(0, 1000) : String(error),
    });
    return 'AI Copilot ตอบไม่ได้ชั่วคราวครับ กรุณาลองใหม่ภายหลัง หรือใช้เมนูขอความช่วยเหลือเพื่อส่งเรื่องให้ Mentor';
  }
}


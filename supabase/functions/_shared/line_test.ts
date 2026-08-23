import {
  bangkokDateKey,
  bangkokWeekKey,
  eventIdFor,
  generateLinkToken,
  LINE_QR_MEMBER,
  LINE_QR_MENTOR,
  LINE_QR_MC,
  LINE_QR_GROWTH,
  linePush,
  lineRetryKeyFor,
  normalizeLinkToken,
  renewalMilestone,
  sha256Hex,
} from './line.ts';
import { buildRichMenu } from './line-rich-menu.ts';
import { commandCardFlex, memberScoreFlex, nextColorAdvice } from './line-flex.ts';
import { teamCommandMode } from './line-roles.ts';
import { parseLineCommand } from './line-commands.ts';
import { findEvolutionAverageColumn } from './traffic-evolution.ts';

function assert(condition: unknown, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}

Deno.test('secure link tokens normalize and avoid ambiguous characters', () => {
  assertEquals(normalizeLinkToken(' ab-cd 2345 '), 'ABCD2345');
  const token = generateLinkToken(20);
  assertEquals(token.length, 20);
  assert(/^[A-HJ-NP-Z2-9]+$/.test(token), `Unexpected token alphabet: ${token}`);
});

Deno.test('sha256Hex returns stable lowercase digest', async () => {
  assertEquals(
    await sha256Hex('BNI'),
    '1f1d18e1724962788bca0f6aa69ab7f3165b65f48f810a1424593f3dd292ba8d',
  );
});

Deno.test('eventIdFor prefers LINE webhookEventId and otherwise remains stable', async () => {
  const explicit = await eventIdFor({
    webhookEventId: 'evt-123',
    type: 'message',
    source: { type: 'user', userId: 'U1' },
  });
  assertEquals(explicit, 'evt-123');

  const event = {
    type: 'message',
    timestamp: 123,
    source: { type: 'user', userId: 'U1' },
    message: { type: 'text', id: 'M1', text: 'hello' },
  };
  assertEquals(await eventIdFor(event), await eventIdFor(event));
});

Deno.test('Bangkok date and ISO week keys are deterministic', () => {
  const date = new Date('2026-06-21T18:00:00.000Z'); // 2026-06-22 in Bangkok
  assertEquals(bangkokDateKey(date), '2026-06-22');
  assertEquals(bangkokWeekKey(date), '2026-W26');
});

Deno.test('renewal milestones suppress daily duplicate reminders', () => {
  assertEquals(renewalMilestone(46), null);
  assertEquals(renewalMilestone(45), '45');
  assertEquals(renewalMilestone(29), '30');
  assertEquals(renewalMilestone(13), '14');
  assertEquals(renewalMilestone(6), '7');
  assertEquals(renewalMilestone(2), '3');
  assertEquals(renewalMilestone(0), '0');
  assertEquals(renewalMilestone(-8), 'expired:1');
});

Deno.test('unified sender skips provider call when delivery key is already claimed', async () => {
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    fetchCalls++;
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as typeof fetch;

  const db = {
    rpc: () => Promise.resolve({
      data: [{ delivery_id: 'delivery-1', should_send: false }],
      error: null,
    }),
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  };

  try {
    const result = await linePush('U1', 'hello', {
      db,
      idempotencyKey: 'same-key',
      notificationType: 'test',
    });
    assert(result.skipped);
    assertEquals(result.sent, false);
    assertEquals(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('unified sender claims delivery with message_preview using the 8-arg RPC contract', async () => {
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    fetchCalls++;
    return Promise.resolve(new Response('{}', {
      status: 200,
      headers: { 'x-line-request-id': 'req-1' },
    }));
  }) as typeof fetch;

  let rpcArgs: Record<string, unknown> | null = null;
  const db = {
    rpc: (_fn: string, args: Record<string, unknown>) => {
      rpcArgs = args;
      return Promise.resolve({
        data: [{ delivery_id: 'delivery-8arg', should_send: false }],
        error: null,
      });
    },
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  };

  try {
    const result = await linePush('U1', 'hello legacy', {
      db,
      idempotencyKey: 'legacy-key',
      notificationType: 'test',
    });
    assert(result.skipped);
    assertEquals(result.deliveryId, 'delivery-8arg');
    assertEquals(fetchCalls, 0);
    assert(rpcArgs);
    const capturedArgs = rpcArgs as Record<string, unknown>;
    assertEquals(capturedArgs.p_message_preview, 'hello legacy');
    assertEquals(Object.keys(capturedArgs).sort(), [
      'p_channel',
      'p_idempotency_key',
      'p_member_id',
      'p_message_preview',
      'p_notification_type',
      'p_payload_hash',
      'p_recipient_id',
      'p_source',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('LINE retry keys are deterministic and only attached to provider send endpoints', async () => {
  const retryKey = await lineRetryKeyFor({ idempotencyKey: 'same-key' }, 'push');
  assert(retryKey);
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/.test(retryKey));
  assertEquals(await lineRetryKeyFor({ idempotencyKey: 'same-key' }, 'push'), retryKey);
  assertEquals(await lineRetryKeyFor({ idempotencyKey: 'same-key' }, 'reply'), undefined);
});

Deno.test('rich menu definitions cover the full 2500x1686 canvas', () => {
  const menu = buildRichMenu('member', 'https://liff.line.me/test', 'https://example.com');
  assertEquals(menu.areas.length, 7);
  const totalArea = menu.areas.reduce(
    (sum, area) => sum + area.bounds.width * area.bounds.height,
    0,
  );
  assertEquals(totalArea, 2500 * 1686);
  assertEquals(menu.areas[2].bounds.width, 834);
  assertEquals(menu.areas[3].bounds.width, 625);
});

Deno.test('all operational roles use the same personal LINE menu contract as member', () => {
  const member = buildRichMenu('member', 'https://liff.line.me/test', 'https://example.com');
  for (const role of ['mentor', 'mc', 'growth'] as const) {
    const menu = buildRichMenu(role, 'https://liff.line.me/test', 'https://example.com');
    assertEquals(menu.chatBarText, member.chatBarText);
    assertEquals(menu.areas.length, member.areas.length);
    assertEquals(menu.areas.map(area => area.bounds), member.areas.map(area => area.bounds));
    assertEquals(menu.areas.map(area => area.action), member.areas.map(area => area.action));
  }
});

Deno.test('all operational role quick replies stay aligned with member support actions', () => {
  assertEquals(LINE_QR_MENTOR, LINE_QR_MEMBER);
  assertEquals(LINE_QR_MC, LINE_QR_MEMBER);
  assertEquals(LINE_QR_GROWTH, LINE_QR_MEMBER);
});

Deno.test('rich menu keeps support commands and opens MY121 directly in LIFF', () => {
  const menu = buildRichMenu(
    'mentor',
    'https://liff.line.me/test?source=rich-menu',
    'https://example.com',
  );
  assertEquals(menu.areas[2].action, { type: 'message', text: 'นัด 1-2-1' });
  assertEquals(menu.areas[3].action, { type: 'message', text: 'ลา / ส่งแทน' });
  assertEquals(menu.areas[4].action, { type: 'message', text: 'เป้าหมาย' });
  assertEquals(menu.areas[5].action, { type: 'message', text: 'ขอความช่วยเหลือ' });
  assertEquals(menu.areas[6].action, { type: 'uri', uri: 'https://liff.line.me/test?source=rich-menu&action=121' });
});

Deno.test('LINE role-specific menus remain available only as member-equivalent aliases', () => {
  const member = buildRichMenu('member', 'https://liff.line.me/test', 'https://example.com');
  const mc = buildRichMenu('mc', 'https://liff.line.me/test', 'https://example.com');
  const growth = buildRichMenu('growth', 'https://liff.line.me/test', 'https://example.com');
  assertEquals(mc.areas.map(area => area.action), member.areas.map(area => area.action));
  assertEquals(growth.areas.map(area => area.action), member.areas.map(area => area.action));
});

Deno.test('score flex card exposes safe alt text and action button', () => {
  const flex = memberScoreFlex({
    name: 'Test Member',
    nickname: 'Test',
    display_score: 55,
    traffic_light: 'yellow',
    palms_detail: { absence: 15, referral: 5, visitor: 0, oneToOne: 10, ceu: 5, tyfb: 0 },
  }, 'https://liff.line.me/test');
  assertEquals(flex.type, 'flex');
  assert(String(flex.altText).includes('55/100'));
  const contents = flex.contents as Record<string, unknown>;
  assertEquals(contents.type, 'bubble');
});

Deno.test('team command routes chapter roles to all-team overview', () => {
  assertEquals(teamCommandMode('mc'), 'all-teams');
  assertEquals(teamCommandMode('growth'), 'all-teams');
  assertEquals(teamCommandMode('mentor'), 'own-team');
  assertEquals(teamCommandMode('member'), 'own-team');
});

Deno.test('all documented LINE command aliases resolve to stable command contracts', () => {
  const cases: [string, string, string?][] = [
    ['สถานะ', 'status'],
    ['ทำอะไร', 'action-plan'],
    ['action', 'action-plan'],
    ['next', 'action-plan'],
    ['ต่อไป', 'action-plan'],
    ['ช่วยเหลือ', 'help'],
    ['help', 'help'],
    ['ประวัติ', 'history'],
    ['ทีม', 'team'],
    ['focus 3', 'focus3'],
    ['chapter pulse', 'chapter-pulse'],
    ['chapter trend', 'chapter-trend'],
    ['ติดตาม', 'tracking'],
    ['นัด 1-2-1', 'tracking'],
    ['เป้า', 'goals'],
    ['เป้าหมาย', 'goals'],
    ['Blueprint', 'blueprint'],
    ['goal', 'blueprint'],
    ['MSB', 'blueprint'],
    ['แจ้งเตือน', 'notifications'],
    ['ปัญหา', 'issues'],
    ['ขอความช่วยเหลือ', 'issues'],
    ['เจอแล้ว', 'met'],
    ['แนะนำ เจ้าของกิจการ', 'match', 'เจ้าของกิจการ'],
    ['นัด Pete', 'schedule', 'Pete'],
    ['ลา ติดประชุม', 'absence', 'ติดประชุม'],
    ['ลา / ส่งแทน', 'absence'],
    ['ขาด ไปต่างจังหวัด', 'absence', 'ไปต่างจังหวัด'],
    ['ส่ง sub Somchai', 'substitute', 'Somchai'],
    ['ยกเลิกลา', 'cancel-absence'],
    ['ปัญหา ติดต่อ Mentor ไม่ได้', 'report-issue', 'ติดต่อ Mentor ไม่ได้'],
    ['ธุรกิจ ที่ปรึกษาการเงิน', 'business-profile', 'ที่ปรึกษาการเงิน'],
    ['เป้า ref 8', 'set-goal', 'ref 8'],
    ['ปิด nudge', 'mute-notification', 'nudge'],
    ['เปิด nudge', 'unmute-notification', 'nudge'],
    ['ลบบัญชี', 'delete-account'],
  ];
  for (const [input, expectedName, expectedArgument = ''] of cases) {
    const parsed = parseLineCommand(input);
    assertEquals(parsed.name, expectedName);
    assertEquals(parsed.argument, expectedArgument);
  }
});

Deno.test('generic cancel never unlinks an account', () => {
  assertEquals(parseLineCommand('ยกเลิก').name, 'help');
  assertEquals(parseLineCommand('ลบ').name, 'help');
  assertEquals(parseLineCommand('ลบบัญชี').name, 'delete-account');
});

Deno.test('command card follows the shared Flex design contract', () => {
  const card = commandCardFlex('MENTOR TEAMS', 'ทีม A · 8 คน · เฉลี่ย 65pt', {
    actions: [{ label: 'ดู Chapter Pulse', type: 'message', text: 'chapter pulse' }],
    quickReplyItems: [{ type: 'action', action: { type: 'message', label: 'ทีม', text: 'ทีม' } }],
  });
  assertEquals(card.type, 'flex');
  assert(String(card.altText).includes('MENTOR TEAMS'));
  const contents = card.contents as Record<string, unknown>;
  assertEquals(contents.type, 'bubble');
  assert(card.quickReply);
});

Deno.test('command card remains inside LINE message safety limits', () => {
  const card = commandCardFlex('LONG RESPONSE', 'ก'.repeat(5000), {
    actions: [
      { label: 'Primary', type: 'message', text: 'สถานะ' },
      { label: 'Secondary', type: 'message', text: 'ประวัติ' },
      { label: 'Ignored third action', type: 'message', text: 'ทีม' },
    ],
  });
  assert(String(card.altText).length <= 400);
  const serialized = JSON.stringify(card);
  assert(!serialized.includes('undefined'));
  const contents = card.contents as {
    footer: { contents: unknown[] };
    body: { contents: { text: string }[] };
  };
  assertEquals(contents.footer.contents.length, 2);
  assert(contents.body.contents[0].text.length <= 3500);
});

Deno.test('Traffic Lights Evolution average uses explicit header or right-most column', () => {
  assertEquals(
    findEvolutionAverageColumn(['Member', '01/26', '02/26', 'Average'], [1, 2]),
    3,
  );
  assertEquals(
    findEvolutionAverageColumn(['Member', '01/26', '02/26', 'ค่าเฉลี่ย'], [1, 2]),
    3,
  );
  assertEquals(
    findEvolutionAverageColumn(['Member', '01/26', '02/26', 'Final metric'], [1, 2]),
    3,
  );
  assertEquals(
    findEvolutionAverageColumn(['Member', '01/26', '02/26'], [1, 2]),
    -1,
  );
});

Deno.test('next color advice identifies the fastest available PALMS action', () => {
  const advice = nextColorAdvice({
    display_score: 45,
    traffic_light: 'red',
    attend: 8,
    absent: 0,
    late: 0,
    medical: 0,
    sub: 0,
    visitors: 0,
    rg: 8,
    one_to_one: 8,
    ceu: 0,
    tyfcb_thb: 0,
    palms_detail: { absence: 15, referral: 5, visitor: 0, oneToOne: 5, ceu: 0, tyfb: 0 },
  });
  assertEquals(advice.currentLabel, 'สีแดง');
  assertEquals(advice.nextLabel, 'สีเหลือง');
  assertEquals(advice.pointsNeeded, 5);
  assertEquals(advice.action, 'เรียน CEU เพิ่ม 1 หน่วย');
});

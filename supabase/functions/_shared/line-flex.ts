type Json = Record<string, unknown>;

export const LINE_CARD_TOKENS = {
  forest: '#123C35',
  forestSoft: '#1F7A64',
  gold: '#A8864F',
  goldSoft: '#D8C7A2',
  ink: '#26332F',
  body: '#53615C',
  cream: '#FBF8F1',
  line: '#E7E0D3',
  white: '#FFFFFF',
  warning: '#C79A2B',
  danger: '#B65245',
} as const;

const COLORS: Record<string, string> = {
  green: '#1F7A64',
  yellow: '#C79A2B',
  red: '#B65245',
  black: '#26332F',
  none: '#7A837F',
};

export type CardTone = 'default' | 'success' | 'warning' | 'danger';

export interface CardAction {
  label: string;
  type: 'message' | 'uri';
  text?: string;
  uri?: string;
  primary?: boolean;
}

export function nextColorAdvice(data: Record<string, unknown>): {
  currentLabel: string;
  nextLabel: string;
  pointsNeeded: number;
  action: string;
} {
  const score = Math.round(Number(data.display_score || 0));
  const traffic = String(data.traffic_light || 'none');
  const labels: Record<string, string> = {
    none: 'ยังไม่มีสี', black: 'สีดำ', red: 'สีแดง', yellow: 'สีเหลือง', green: 'สีเขียว',
  };
  if (traffic === 'green' || score >= 70) {
    return {
      currentLabel: 'สีเขียว',
      nextLabel: 'รักษาสีเขียว',
      pointsNeeded: 0,
      action: 'รักษาความสม่ำเสมอ และช่วยสมาชิกในทีมปิด Key ที่ยังขาด',
    };
  }

  const target = score < 30 ? 30 : score < 50 ? 50 : 70;
  const nextLabel = target === 30 ? 'สีแดง' : target === 50 ? 'สีเหลือง' : 'สีเขียว';
  const palms = (data.palms_detail || {}) as Record<string, unknown>;
  const weeks = Math.max(
    1,
    Number(data.attend || 0) + Number(data.absent || 0) + Number(data.late || 0) +
      Number(data.medical || 0) + Number(data.sub || 0),
  );
  const candidates = [
    {
      gain: nextTierGain(Number(palms.visitor || 0), [0, 10, 20]),
      effort: Math.max(1, Math.ceil(weeks / 4) - Number(data.visitors || 0)),
      action: `ชวน Visitor เพิ่ม ${Math.max(1, Math.ceil(weeks / 4) - Number(data.visitors || 0))} คน`,
    },
    {
      gain: nextTierGain(Number(palms.ceu || 0), [0, 5, 10, 15, 20]),
      effort: 1,
      action: 'เรียน CEU เพิ่ม 1 หน่วย',
    },
    {
      gain: nextTierGain(Number(palms.referral || 0), [0, 5, 10, 15]),
      effort: Math.max(1, nextWeeklyTarget(Number(palms.referral || 0), weeks) - Number(data.rg || 0)),
      action: `ส่ง Referral เพิ่ม ${Math.max(1, nextWeeklyTarget(Number(palms.referral || 0), weeks) - Number(data.rg || 0))} ใบ`,
    },
    {
      gain: nextTierGain(Number(palms.oneToOne || 0), [0, 5, 10, 15]),
      effort: Math.max(1, nextWeeklyTarget(Number(palms.oneToOne || 0), weeks) - Number(data.one_to_one || 0)),
      action: `ทำ 1-2-1 เพิ่ม ${Math.max(1, nextWeeklyTarget(Number(palms.oneToOne || 0), weeks) - Number(data.one_to_one || 0))} ครั้ง`,
    },
    {
      gain: nextTierGain(Number(palms.tyfb || 0), [0, 5, 10, 15]),
      effort: Math.max(1, nextMoneyTarget(Number(palms.tyfb || 0)) - Number(data.tyfcb_thb || 0)),
      action: `เพิ่ม TYFCB อีก ${formatBaht(Math.max(1, nextMoneyTarget(Number(palms.tyfb || 0)) - Number(data.tyfcb_thb || 0)))} บาท`,
    },
  ].filter(candidate => candidate.gain > 0)
    .sort((a, b) => {
      const needed = Math.max(1, target - score);
      const aCompletes = a.gain >= needed;
      const bCompletes = b.gain >= needed;
      if (aCompletes !== bCompletes) return aCompletes ? -1 : 1;
      if (aCompletes && bCompletes && a.effort !== b.effort) return a.effort - b.effort;
      return (b.gain / b.effort) - (a.gain / a.effort);
    });
  const best = candidates[0];
  return {
    currentLabel: labels[traffic] || 'ยังไม่มีสี',
    nextLabel,
    pointsNeeded: Math.max(0, target - score),
    action: best?.action || 'รักษาการเข้าประชุมและคุยกับ Mentor เพื่อวางแผน Key ถัดไป',
  };
}

function nextTierGain(current: number, tiers: number[]): number {
  const next = tiers.find(tier => tier > current);
  return next === undefined ? 0 : next - current;
}

function nextWeeklyTarget(currentPoints: number, weeks: number): number {
  if (currentPoints < 5) return weeks;
  if (currentPoints < 10) return weeks + 1;
  return 2 * weeks;
}

function nextMoneyTarget(currentPoints: number): number {
  if (currentPoints < 5) return 100000;
  if (currentPoints < 10) return 200000;
  return 500000;
}

function formatBaht(value: number): string {
  return Math.ceil(value).toLocaleString('en-US');
}

export function commandCardFlex(
  title: string,
  body: string,
  options: {
    eyebrow?: string;
    tone?: CardTone;
    actions?: CardAction[];
    quickReplyItems?: unknown[];
  } = {},
): Json {
  const tone = options.tone || inferTone(body);
  const accent = tone === 'success'
    ? LINE_CARD_TOKENS.forestSoft
    : tone === 'warning'
    ? LINE_CARD_TOKENS.warning
    : tone === 'danger'
    ? LINE_CARD_TOKENS.danger
    : LINE_CARD_TOKENS.gold;
  const cleanBody = body.trim().slice(0, 3500) || 'พร้อมใช้งานครับ';
  const message: Json = {
    type: 'flex',
    altText: `${title}: ${cleanBody.replace(/\s+/g, ' ').slice(0, 280)}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      styles: {
        header: { backgroundColor: LINE_CARD_TOKENS.forest },
        body: { backgroundColor: LINE_CARD_TOKENS.cream },
        footer: { backgroundColor: LINE_CARD_TOKENS.cream },
      },
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '22px',
        contents: [
          {
            type: 'text',
            text: options.eyebrow || 'IDEAL · MENTOR',
            color: LINE_CARD_TOKENS.goldSoft,
            size: 'xs',
            weight: 'bold',
          },
          {
            type: 'text',
            text: title,
            color: LINE_CARD_TOKENS.white,
            size: 'xl',
            weight: 'bold',
            wrap: true,
            margin: 'md',
          },
          {
            type: 'box',
            layout: 'vertical',
            height: '3px',
            backgroundColor: accent,
            margin: 'lg',
            contents: [],
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '22px',
        contents: [
          {
            type: 'text',
            text: cleanBody,
            color: LINE_CARD_TOKENS.ink,
            size: 'md',
            wrap: true,
            lineSpacing: '6px',
          },
        ],
      },
      ...(options.actions?.length
        ? {
          footer: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '18px',
            paddingTop: '0px',
            contents: options.actions.slice(0, 2).map((action, index) => ({
              type: 'button',
              style: action.primary || index === 0 ? 'primary' : 'secondary',
              color: action.primary || index === 0 ? LINE_CARD_TOKENS.forest : undefined,
              margin: index ? 'sm' : undefined,
              action: action.type === 'uri'
                ? { type: 'uri', label: action.label, uri: action.uri || 'https://line.me' }
                : { type: 'message', label: action.label, text: action.text || action.label },
            })),
          },
        }
        : {}),
    },
  };
  if (options.quickReplyItems?.length) {
    message.quickReply = { items: options.quickReplyItems.slice(0, 13) };
  }
  return message;
}

export function inferTone(body: string): CardTone {
  if (/❌|ไม่สามารถ|ผิดพลาด|ล้มเหลว/.test(body)) return 'danger';
  if (/⚠️|ยังไม่มี|ไม่พบ|กรุณา|รอ/.test(body)) return 'warning';
  if (/✅|สำเร็จ|บันทึกแล้ว|รับทราบ|ยอดเยี่ยม|🏆/.test(body)) return 'success';
  return 'default';
}

export function memberScoreFlex(data: Record<string, unknown>, liffUrl = ''): Json {
  const score = Math.round(Number(data.display_score || 0));
  const traffic = String(data.traffic_light || 'black');
  const palms = (data.palms_detail || {}) as Record<string, unknown>;
  const nickname = String(data.nickname || data.name || 'สมาชิก');
  const categories = [
    ['Attendance', Number(palms.absence || 0), 15],
    ['Referral', Number(palms.referral || 0), 15],
    ['Visitor', Number(palms.visitor || 0), 20],
    ['1-2-1', Number(palms.oneToOne || 0), 15],
    ['CEU', Number(palms.ceu || 0), 20],
    ['TYFB', Number(palms.tyfb || 0), 15],
  ] as [string, number, number][];
  const color = COLORS[traffic] || COLORS.black;
  const advice = nextColorAdvice(data);

  const message: Json = {
    type: 'flex',
    altText: `คะแนนของคุณ${nickname}: ${score}/100`,
    contents: {
      type: 'bubble',
      size: 'mega',
      styles: { header: { backgroundColor: '#123C35' } },
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '22px',
        contents: [
          { type: 'text', text: 'MY IDEAL · WEEKLY PULSE', color: '#D8C7A2', size: 'xs', weight: 'bold' },
          { type: 'text', text: `คุณ${nickname}`, color: '#FFFFFF', size: 'xl', weight: 'bold', margin: 'md' },
          {
            type: 'box', layout: 'baseline', margin: 'lg',
            contents: [
              { type: 'text', text: String(score), color: '#FFFFFF', size: '4xl', weight: 'bold', flex: 0 },
              { type: 'text', text: '/100', color: '#D6E2DE', size: 'md', margin: 'sm', flex: 0 },
              { type: 'text', text: traffic.toUpperCase(), color: '#FFFFFF', size: 'sm', align: 'end', weight: 'bold' },
            ],
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '22px',
        contents: [
          { type: 'text', text: 'คะแนนรายหมวด', color: '#123C35', size: 'sm', weight: 'bold' },
          ...categories.map(([label, value, max]) => ({
            type: 'box', layout: 'horizontal', margin: 'md',
            contents: [
              { type: 'text', text: label, size: 'sm', color: '#53615C', flex: 4 },
              { type: 'text', text: `${value}/${max}`, size: 'sm', color: value === max ? '#1F7A64' : '#26332F', align: 'end', weight: 'bold', flex: 2 },
            ],
          })),
          { type: 'separator', margin: 'xl', color: '#E7E0D3' },
          { type: 'text', text: 'เส้นทางขึ้นสี', margin: 'xl', color: '#A8864F', size: 'xs', weight: 'bold' },
          {
            type: 'text',
            text: advice.pointsNeeded === 0
              ? `ปัจจุบัน ${advice.currentLabel} · ${advice.action}`
              : `ปัจจุบัน ${advice.currentLabel} → ${advice.nextLabel}\nขาดอีก ${advice.pointsNeeded} คะแนน\nทางเร็วที่สุด: ${advice.action}`,
            margin: 'sm', color: '#123C35', size: 'md', weight: 'bold', wrap: true,
          },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '18px',
        contents: [
          {
            type: 'button', style: 'primary', color,
            action: liffUrl
              ? { type: 'uri', label: 'เปิด Action Center', uri: liffUrl }
              : { type: 'message', label: 'ดูสิ่งที่ควรทำ', text: 'ทำอะไร' },
          },
          { type: 'button', margin: 'sm', action: { type: 'message', label: 'ดูประวัติทั้งหมด', text: 'ประวัติ' } },
        ],
      },
    },
  };
  return message;
}

export function simpleActionFlex(
  title: string,
  body: string,
  primaryLabel: string,
  primaryAction: Json,
): Json {
  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      styles: { header: { backgroundColor: '#123C35' } },
      header: {
        type: 'box', layout: 'vertical', paddingAll: '20px',
        contents: [{ type: 'text', text: title, color: '#FFFFFF', size: 'lg', weight: 'bold', wrap: true }],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '20px',
        contents: [{ type: 'text', text: body, color: '#394842', size: 'sm', wrap: true }],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [{ type: 'button', style: 'primary', color: '#123C35', action: { label: primaryLabel, ...primaryAction } }],
      },
    },
  };
}

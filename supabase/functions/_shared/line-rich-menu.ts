export type RichMenuRole = 'member' | 'mentor' | 'mc' | 'growth';

export interface RichMenuItem {
  label: string;
  sublabel: string;
  icon: string;
  action: { type: 'message'; text: string } | { type: 'uri'; uri: string };
}

const PERSONAL_SUPPORT_ITEMS: RichMenuItem[] = [
  { icon: '◉', label: 'คะแนนของฉัน', sublabel: 'Score & Action', action: { type: 'message', text: 'สถานะ' } },
  { icon: '↗', label: 'ประวัติ', sublabel: 'My Progress', action: { type: 'message', text: 'ประวัติ' } },
  { icon: '◇', label: 'นัด 1-2-1', sublabel: 'Connect', action: { type: 'message', text: 'นัด 1-2-1' } },
  { icon: '○', label: 'ลา / ส่งแทน', sublabel: 'Attendance', action: { type: 'message', text: 'ลา / ส่งแทน' } },
  { icon: '△', label: 'เป้าหมาย', sublabel: 'My Goal', action: { type: 'message', text: 'เป้าหมาย' } },
  { icon: '?', label: 'ขอความช่วยเหลือ', sublabel: 'Private Support', action: { type: 'message', text: 'ขอความช่วยเหลือ' } },
  { icon: '121', label: 'MY121', sublabel: 'My 1-2-1', action: { type: 'uri', uri: 'LIFF_URL?action=121' } },
];

export const RICH_MENU_ITEMS: Record<RichMenuRole, RichMenuItem[]> = {
  member: PERSONAL_SUPPORT_ITEMS,
  mentor: PERSONAL_SUPPORT_ITEMS,
  mc: PERSONAL_SUPPORT_ITEMS,
  growth: PERSONAL_SUPPORT_ITEMS,
};

function resolveRichMenuUri(uri: string, liffUrl: string, appUrl: string): string {
  if (uri.startsWith('LIFF_URL?')) {
    const query = uri.slice('LIFF_URL?'.length);
    return `${liffUrl}${liffUrl.includes('?') ? '&' : '?'}${query}`;
  }
  return uri
    .replace('LIFF_URL', liffUrl)
    .replace('APP_URL', appUrl);
}

export function buildRichMenu(role: RichMenuRole, liffUrl: string, appUrl: string) {
  const items = RICH_MENU_ITEMS[role];
  const resolveAction = (item: RichMenuItem) =>
    item.action.type === 'uri'
      ? { type: 'uri', uri: resolveRichMenuUri(item.action.uri, liffUrl, appUrl) }
      : item.action;

  // 7-item personal menus: top row 3 (833px each), bottom row 4 (625px each)
  const areas = items.length === 7
    ? [
        // Top row — 3 items × 833px wide
        { bounds: { x: 0,    y: 0,   width: 833, height: 843 }, action: resolveAction(items[0]) },
        { bounds: { x: 833,  y: 0,   width: 833, height: 843 }, action: resolveAction(items[1]) },
        { bounds: { x: 1666, y: 0,   width: 834, height: 843 }, action: resolveAction(items[2]) },
        // Bottom row — 4 items × 625px wide
        { bounds: { x: 0,    y: 843, width: 625, height: 843 }, action: resolveAction(items[3]) },
        { bounds: { x: 625,  y: 843, width: 625, height: 843 }, action: resolveAction(items[4]) },
        { bounds: { x: 1250, y: 843, width: 625, height: 843 }, action: resolveAction(items[5]) },
        { bounds: { x: 1875, y: 843, width: 625, height: 843 }, action: resolveAction(items[6]) },
      ]
    : items.map((item, index) => {
        const col = index % 3;
        const row = Math.floor(index / 3);
        return {
          bounds: { x: col * 833, y: row * 843, width: col === 2 ? 834 : 833, height: 843 },
          action: resolveAction(item),
        };
      });

  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: `BNI IDEAL ${role.toUpperCase()} v1`,
    chatBarText: 'MY IDEAL',
    areas,
  };
}

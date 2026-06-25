export type RichMenuRole = 'member' | 'mentor' | 'mc' | 'growth';

export interface RichMenuItem {
  label: string;
  sublabel: string;
  icon: string;
  action: { type: 'message'; text: string } | { type: 'uri'; uri: string };
}

export const RICH_MENU_ITEMS: Record<RichMenuRole, RichMenuItem[]> = {
  member: [
    { icon: '◉', label: 'คะแนนของฉัน', sublabel: 'Score & Action', action: { type: 'message', text: 'สถานะ' } },
    { icon: '↗', label: 'ประวัติ', sublabel: 'My Progress', action: { type: 'message', text: 'ประวัติ' } },
    { icon: '◇', label: 'นัด 1-2-1', sublabel: 'Connect', action: { type: 'uri', uri: 'LIFF_URL?action=121' } },
    { icon: '○', label: 'ลา / ส่งแทน', sublabel: 'Attendance', action: { type: 'uri', uri: 'LIFF_URL?action=absence' } },
    { icon: '△', label: 'เป้าหมาย', sublabel: 'My Goal', action: { type: 'uri', uri: 'LIFF_URL?action=goal' } },
    { icon: '?', label: 'ขอความช่วยเหลือ', sublabel: 'Private Support', action: { type: 'uri', uri: 'LIFF_URL?action=issue' } },
    { icon: '⊕', label: 'จำลองคะแนน', sublabel: 'PALMS Simulator', action: { type: 'uri', uri: 'APP_URL/index.html?action=simulate' } },
  ],
  mentor: [
    { icon: '◉', label: 'Focus 3', sublabel: 'Priority Members', action: { type: 'message', text: 'focus 3' } },
    { icon: '◇', label: 'ทีมของฉัน', sublabel: 'Team Pulse', action: { type: 'message', text: 'ทีม' } },
    { icon: '+', label: 'บันทึก Mentor', sublabel: 'Mentor Log', action: { type: 'uri', uri: 'LIFF_URL?action=mentor-log' } },
    { icon: '↗', label: 'งานติดตาม', sublabel: 'Follow-up', action: { type: 'uri', uri: 'LIFF_URL?action=follow-up' } },
    { icon: '!', label: 'รายงานปัญหา', sublabel: 'Core Issue', action: { type: 'uri', uri: 'LIFF_URL?action=issue' } },
    { icon: '○', label: 'Renewal', sublabel: 'Member Journey', action: { type: 'uri', uri: 'LIFF_URL?action=renewal' } },
  ],
  mc: [
    { icon: '◉', label: 'Chapter Pulse', sublabel: 'Live Overview', action: { type: 'message', text: 'chapter pulse' } },
    { icon: '◇', label: 'Mentor Team', sublabel: 'Team Health', action: { type: 'uri', uri: 'APP_URL/dashboard?view=mentor' } },
    { icon: '!', label: 'Alerts', sublabel: 'Needs Attention', action: { type: 'uri', uri: 'APP_URL/dashboard?view=alerts' } },
    { icon: '+', label: 'มอบหมายงาน', sublabel: 'Assignment', action: { type: 'uri', uri: 'LIFF_URL?action=assignments' } },
    { icon: '↗', label: 'Reports', sublabel: 'Insights', action: { type: 'uri', uri: 'APP_URL/dashboard?view=reports' } },
    { icon: '○', label: 'ตั้งค่าระบบ', sublabel: 'Admin', action: { type: 'uri', uri: 'APP_URL/admin/settings.html' } },
  ],
  growth: [
    { icon: '◉', label: 'Growth Pulse', sublabel: 'Opportunity', action: { type: 'uri', uri: 'APP_URL/dashboard?view=growth' } },
    { icon: '◇', label: 'Referral Match', sublabel: 'Smart Connect', action: { type: 'message', text: 'แนะนำ' } },
    { icon: '+', label: 'Visitor', sublabel: 'Guest Journey', action: { type: 'uri', uri: 'LIFF_URL?action=visitor' } },
    { icon: '↗', label: 'Growth Tasks', sublabel: 'Next Actions', action: { type: 'uri', uri: 'APP_URL/dashboard?view=growth-tasks' } },
    { icon: '△', label: 'Power Team', sublabel: 'Synergy', action: { type: 'uri', uri: 'APP_URL/dashboard?view=power-team' } },
    { icon: '○', label: 'Chapter Trend', sublabel: 'Momentum', action: { type: 'message', text: 'chapter trend' } },
  ],
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

  // Member has 7 items: top row 3 (833px each), bottom row 4 (625px each)
  const areas = role === 'member' && items.length === 7
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
    chatBarText: role === 'member' ? 'MY IDEAL' : role.toUpperCase(),
    areas,
  };
}

export type CsvRow121 = {
  rowNumber: number; firstName: string; lastName: string; fullName: string;
  substituteFor: string; lookingFor: string; date: string; time: string; userRole: string;
};

export function normalize121Name(value: string): string {
  return value.replace(/^\uFEFF/, '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function hasUsableLineId(value: unknown): boolean {
  const id = String(value ?? '').trim();
  return Boolean(id) && id !== 'null' && id !== 'undefined';
}

export function oneToOneRoundDeliveryStatus(sent: number, failed: number, skipped: number): 'sent' | 'partially_failed' {
  return sent > 0 && failed === 0 && skipped === 0 ? 'sent' : 'partially_failed';
}

function parseCsvMatrix(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, '');
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field.length === 0) quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim()));
}

const REQUIRED = ['ชื่อผู้เข้าประชุม (ภาษาอังกฤษ)', 'นามสกุล (ภาษาอังกฤษ)', 'มาประชุมแทน', 'looking for', 'date', 'time'];
export function parseWeekly121Csv(text: string): { rows: CsvRow121[]; dates: string[]; headers: string[] } {
  const matrix = parseCsvMatrix(text);
  if (matrix.length < 2) throw new Error('ไฟล์ CSV ไม่มีข้อมูล');
  const headers = matrix[0].map(v => v.replace(/^\uFEFF/, '').trim());
  const normalized = headers.map(v => v.toLocaleLowerCase('en-US').replace(/\s+/g, ' '));
  const missing = REQUIRED.filter(h => !normalized.includes(h));
  if (missing.length) throw new Error(`Header ไม่ถูกต้องหรือไม่ครบ: ${missing.join(', ')}`);
  const at = (name: string) => normalized.indexOf(name);
  const first = at(REQUIRED[0]), last = at(REQUIRED[1]), sub = at(REQUIRED[2]);
  const looking = at('looking for'), date = at('date'), time = at('time'), role = at('user_role');
  const rows = matrix.slice(1).map((r, i): CsvRow121 => {
    const firstName = String(r[first] || '').trim(); const lastName = String(r[last] || '').trim();
    return { rowNumber: i + 2, firstName, lastName, fullName: [firstName, lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(), substituteFor: String(r[sub] || '').trim(), lookingFor: String(r[looking] || '').trim(), date: String(r[date] || '').trim(), time: String(r[time] || '').trim(), userRole: role >= 0 ? String(r[role] || '').trim() : '' };
  }).filter(r => r.fullName || r.substituteFor);
  return { rows, dates: [...new Set(rows.map(r => r.date).filter(Boolean))], headers };
}

export type MatchingStrategy = 'random' | 'checkin_mix' | 'looking_for' | 'cross_team' | 'smart_mix';
export function fullyDeliveredOneToOnePairIds(deliveries: Array<Record<string, unknown>>): string[] {
  const recipientsByPair = new Map<string, Set<string>>();
  deliveries.forEach(row => {
    if (String(row.status || '') !== 'sent' || String(row.notification_type || '') !== 'weekly_121_matching') return;
    const pairId=String(row.matching_pair_id||''),memberId=String(row.member_id||'');if(!pairId||!memberId)return;
    if(!recipientsByPair.has(pairId))recipientsByPair.set(pairId,new Set());recipientsByPair.get(pairId)!.add(memberId);
  });
  return [...recipientsByPair.entries()].filter(([,recipients])=>recipients.size>=2).map(([pairId])=>pairId);
}
export type MatchMember = { id: string; name: string; checkinOrder?: number; lookingFor?: string; business?: string; mentorTeam?: string; waitingPriority?: number; completionRate?: number };
export type MatchGroup = { members: MatchMember[]; locked?: boolean };
export type MatchResult = { groups: MatchGroup[]; waiting: MatchMember | null };
const pairKey = (a: string, b: string) => [a, b].sort().join('|');

function matchTokens(value: string | undefined): Set<string> {
  return new Set(normalize121Name(value || '').replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(t => t.length >= 2));
}
function overlapScore(left: string | undefined, right: string | undefined): number {
  const a = matchTokens(left), b = matchTokens(right); let score = 0;
  for (const token of a) if (b.has(token)) score += token.length >= 5 ? 8 : 4;
  const compactA = normalize121Name(left || '').replace(/\s/g, '');
  const compactB = normalize121Name(right || '').replace(/\s/g, '');
  if (compactA.length >= 4 && compactB.length >= 4 && (compactA.includes(compactB) || compactB.includes(compactA))) score += 12;
  return score;
}
export function weekly121PairScore(a: MatchMember, b: MatchMember, strategy: MatchingStrategy): number {
  const checkinDistance = Math.abs(Number(a.checkinOrder || 0) - Number(b.checkinOrder || 0));
  const lookingFit = overlapScore(a.lookingFor, b.business) + overlapScore(b.lookingFor, a.business);
  const crossTeam = a.mentorTeam && b.mentorTeam && normalize121Name(a.mentorTeam) !== normalize121Name(b.mentorTeam) ? 25 : 0;
  if (strategy === 'checkin_mix') return checkinDistance;
  if (strategy === 'looking_for') return lookingFit;
  if (strategy === 'cross_team') return crossTeam;
  if (strategy === 'smart_mix') return lookingFit * 2 + crossTeam + Math.min(checkinDistance, 15);
  return 0;
}

export function createWeekly121Matches(
  members: MatchMember[], blockedKeys: Set<string>, locked: MatchGroup[] = [], random: () => number = Math.random,
  strategy: MatchingStrategy = 'random',
): MatchGroup[] {
  const lockedIds = new Set(locked.flatMap(g => g.members.map(m => m.id)));
  const pool = members.filter(m => !lockedIds.has(m.id));
  if (new Set(members.map(m => m.id)).size !== members.length) throw new Error('พบสมาชิกซ้ำในรายการจับคู่');
  if (pool.length === 1) return [...locked];
  const sizes: number[] = [];
  for (let n = 0; n < pool.length; n += 2) sizes.push(2);
  const shuffled = pool.slice().sort(() => random() - .5);
  const compatible = (group: MatchMember[], candidate: MatchMember) => group.every(m => m.id !== candidate.id && !blockedKeys.has(pairKey(m.id, candidate.id)));
  const search = (remaining: MatchMember[], index: number, made: MatchGroup[]): MatchGroup[] | null => {
    if (!remaining.length) return made;
    const size = sizes[index], first = remaining[0];
    const choose = (start: number, chosen: MatchMember[]): MatchGroup[] | null => {
      if (chosen.length === size) {
        const ids = new Set(chosen.map(m => m.id));
        return search(remaining.filter(m => !ids.has(m.id)), index + 1, [...made, { members: chosen }]);
      }
      const ranked = remaining.map((candidate, i) => ({candidate, i, score: chosen.reduce((sum, member) => sum + weekly121PairScore(member, candidate, strategy), 0), tie: random()}))
        .filter(x => x.i >= start && compatible(chosen, x.candidate))
        .sort((a, b) => b.score - a.score || a.tie - b.tie);
      for (const item of ranked) {
        const found = choose(item.i + 1, [...chosen, item.candidate]); if (found) return found;
      }
      return null;
    };
    return choose(1, [first]);
  };
  const result = search(shuffled, 0, []);
  if (!result) throw new Error('ไม่สามารถจัดคู่ภายใต้เงื่อนไขคู่ซ้ำ/คู่ห้ามได้ กรุณาลดระยะเวลาหรือปรับรายชื่อ');
  return [...locked, ...result];
}

/** New-system matcher. It never creates a trio; one fair-rotation member waits. */
export function createOneToOneMatches(
  members: MatchMember[], blockedKeys: Set<string>, locked: MatchGroup[] = [], random: () => number = Math.random,
  strategy: MatchingStrategy = 'random',
): MatchResult {
  const lockedIds = new Set(locked.flatMap(group => group.members.map(member => member.id)));
  const available = members.filter(member => !lockedIds.has(member.id));
  let waiting: MatchMember | null = null;
  if (available.length % 2 === 1) {
    // A higher carry priority means this person waited before and should be paired now.
    // Choose among the lowest priority first, using check-in order then randomness as ties.
    waiting = available.slice().sort((a, b) =>
      Number(a.waitingPriority || 0) - Number(b.waitingPriority || 0)
      || Number(b.checkinOrder || 0) - Number(a.checkinOrder || 0)
      || random() - .5
    )[0];
  }
  const pairable = waiting ? members.filter(member => member.id !== waiting!.id) : members;
  const groups = createWeekly121Matches(pairable, blockedKeys, locked, random, strategy);
  if (groups.some(group => group.members.length !== 2)) throw new Error('ระบบป้องกันกลุ่มสาม: คู่ใหม่ต้องมีสมาชิก 2 คนเท่านั้น');
  return { groups, waiting };
}

function compact121(value: string | undefined, fallback = ''): string {
  const clean = String(value || '').trim().replace(/\s+/g, ' ');
  return clean.length > 180 ? `${clean.slice(0, 177)}…` : clean || fallback;
}

export function weekly121Message(
  recipient: { name: string; business?: string; lookingFor?: string },
  partners: Array<{ name: string; business?: string; lookingFor?: string }>,
  templateKey = 'growth_opportunity',
): string {
  const recipientName = compact121(recipient.name, 'สมาชิก');
  const partnerText = partners.map(p => `✨ คุณ ${compact121(p.name)}${p.business ? `\n   ${compact121(p.business)}` : ''}`).join('\n\n');
  const opportunities = partners.map(p => {
    const name = compact121(p.name);
    const looking = compact121(p.lookingFor);
    return looking ? `• ${name} กำลังมองหา: ${looking}` : `• ชวน ${name} เล่าถึงลูกค้าในอุดมคติของเขา`;
  }).join('\n');
  const primary = partners[0] || { name: 'คู่ของคุณ' };
  const primaryName = compact121(primary.name, 'คู่ของคุณ');
  const primaryBusiness = compact121(primary.business);
  const openerTopic = primaryBusiness
    ? `ในธุรกิจ ${primaryBusiness} ตอนนี้ลูกค้าแบบไหนที่คุณอยากพบมากที่สุดครับ/คะ?`
    : 'ตอนนี้ลูกค้าแบบไหนที่คุณอยากพบมากที่สุดครับ/คะ?';
  const recipientLooking = compact121(recipient.lookingFor);
  const sharePrompt = recipientLooking
    ? `และเล่าให้คู่คุณรู้ว่า คุณกำลังมองหา “${recipientLooking}”`
    : 'และเล่าให้คู่คุณรู้ว่า ลูกค้าแบบไหนที่คุณอยากให้ช่วยแนะนำ';

  if (templateKey === 'warm_connection') return `🤝 คู่สนทนาดี ๆ ประจำสัปดาห์นี้มาแล้ว

สวัสดีคุณ ${recipientName} 😊
สัปดาห์นี้คุณได้ทำความรู้จักกับ

${partnerText}

🌱 ลองเริ่มจาก 3 เรื่องง่าย ๆ
• อะไรทำให้คุณเริ่มทำธุรกิจนี้
• ลูกค้าแบบไหนที่คุณภูมิใจที่สุด
• คนรอบตัวควรนึกถึงคุณเมื่อเจอสถานการณ์แบบไหน

ไม่ต้องขายของให้กัน แค่ฟังให้เข้าใจ แล้วช่วยกันมองหาโอกาสดี ๆ
ทักหากันวันนี้และนัด 1-2-1 ภายในสัปดาห์นี้นะครับ/คะ

— Mentor Team, BNI IDEAL`;

  if (templateKey === 'referral_focus') return `🎯 Referral Focus 1-2-1

คุณ ${recipientName} ได้คู่ประจำสัปดาห์นี้แล้ว

${partnerText}

🔍 สิ่งที่แต่ละคนกำลังมองหา
${opportunities}

ก่อนจบการคุย ลองช่วยกันตอบให้ได้ว่า
• ลูกค้าในอุดมคติคือใคร
• มีคำพูดหรือเหตุการณ์อะไรที่เป็น Referral Trigger
• สัปดาห์นี้จะแนะนำ Connection ใดให้กันได้ 1 คน

${sharePrompt}

นัดคุยกัน 30–45 นาที แล้วเปลี่ยนความรู้จักให้เป็น Referral ที่มีคุณภาพครับ/ค่ะ 🚀

— Mentor Team, BNI IDEAL`;

  if (templateKey === 'story_trust') return `✨ 1-2-1 Story & Trust

สวัสดีคุณ ${recipientName}
คู่ที่ระบบเลือกให้คุณในสัปดาห์นี้คือ

${partnerText}

💬 คำถามชวนคุย
• จุดเปลี่ยนสำคัญในชีวิตการทำงานของคุณคืออะไร
• ลูกค้าคนไหนทำให้คุณรู้สึกว่างานนี้มีความหมาย
• สมาชิก BNI จะช่วยเปิดประตูให้คุณได้อย่างไร

ฟังเรื่องราวของกันและกันให้จบ แล้วสรุป 1 ประโยคว่า “ฉันจะแนะนำคุณกับคนอื่นว่า…”

เริ่มจากความไว้ใจ แล้วโอกาสทางธุรกิจจะตามมาครับ/ค่ะ 🤍

— Mentor Team, BNI IDEAL`;

  if (templateKey === 'quick_action') return `⚡ คู่ 1-2-1 สัปดาห์นี้

คุณ ${recipientName} ↔ ${partners.map(p=>`คุณ ${compact121(p.name)}`).join(' / ')}

${partnerText}

ภารกิจ 20 นาที
1) แนะนำธุรกิจคนละ 3 นาที
2) บอก Looking for ที่ชัดที่สุดคนละ 1 เรื่อง
3) แลก Referral Trigger
4) นัด Next Action คนละ 1 ข้อ

${opportunities}

ทักหาคู่ของคุณวันนี้ แล้วล็อกเวลาในปฏิทินได้เลยครับ/ค่ะ ✅

— Mentor Team, BNI IDEAL`;

  return `🎉 คุณมีคู่ 1-2-1 ประจำสัปดาห์แล้ว!\n\nคุณ ${recipientName}\nสัปดาห์นี้ชวนมารู้จักกันให้ลึกกว่าเดิมกับ\n\n${partnerText}\n\n💡 โอกาสที่น่าชวนคุย\n${opportunities}\n\n🗣️ เริ่มบทสนทนาได้เลย\n“สวัสดีครับ/ค่ะ คุณ ${primaryName} สัปดาห์นี้เราได้คู่ 1-2-1 กัน ยินดีมากครับ/ค่ะ 😊\n${openerTopic}”\n\n🎯 ภารกิจเล็ก ๆ ในการคุยครั้งนี้\n• แลกเปลี่ยนเรื่องธุรกิจคนละ 5 นาที\n• บอกสัญญาณที่ทำให้นึกถึงกันได้ง่าย ๆ\n• ลองมองหาคนที่ช่วยแนะนำให้กันได้คนละ 1 คน\n\n${sharePrompt}\n\nทักหากันวันนี้ แล้วนัดเวลา 1-2-1 ภายในสัปดาห์นี้นะครับ/คะ 🚀\n\n— Mentor Team, BNI IDEAL`;
}

export function weekly121TestMessage(message: string): string {
  return `🧪 นี่คือการทดลองระบบ\nข้อความนี้ใช้สำหรับทดสอบระบบ Weekly 1-2-1 เท่านั้น\n\n${message}`;
}

export type CsvRow121 = {
  rowNumber: number; firstName: string; lastName: string; fullName: string;
  substituteFor: string; lookingFor: string; date: string; time: string; userRole: string;
};

export function normalize121Name(value: string): string {
  return value.replace(/^\uFEFF/, '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
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

export type MatchMember = { id: string; name: string };
export type MatchGroup = { members: MatchMember[]; locked?: boolean };
const pairKey = (a: string, b: string) => [a, b].sort().join('|');

export function createWeekly121Matches(
  members: MatchMember[], blockedKeys: Set<string>, locked: MatchGroup[] = [], random: () => number = Math.random,
): MatchGroup[] {
  const lockedIds = new Set(locked.flatMap(g => g.members.map(m => m.id)));
  const pool = members.filter(m => !lockedIds.has(m.id));
  if (new Set(members.map(m => m.id)).size !== members.length) throw new Error('พบสมาชิกซ้ำในรายการจับคู่');
  if (pool.length === 1) throw new Error('เหลือสมาชิกเพียง 1 คนหลังหักคู่ที่ล็อก');
  const sizes: number[] = [];
  if (pool.length % 2) sizes.push(3);
  for (let n = sizes.reduce((a, b) => a + b, 0); n < pool.length; n += 2) sizes.push(2);
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
      for (let i = start; i < remaining.length; i++) {
        if (!compatible(chosen, remaining[i])) continue;
        const found = choose(i + 1, [...chosen, remaining[i]]); if (found) return found;
      }
      return null;
    };
    return choose(1, [first]);
  };
  const result = search(shuffled, 0, []);
  if (!result) throw new Error('ไม่สามารถจัดคู่ภายใต้เงื่อนไขคู่ซ้ำ/คู่ห้ามได้ กรุณาลดระยะเวลาหรือปรับรายชื่อ');
  return [...locked, ...result];
}

function compact121(value: string | undefined, fallback = ''): string {
  const clean = String(value || '').trim().replace(/\s+/g, ' ');
  return clean.length > 180 ? `${clean.slice(0, 177)}…` : clean || fallback;
}

export function weekly121Message(
  recipient: { name: string; business?: string; lookingFor?: string },
  partners: Array<{ name: string; business?: string; lookingFor?: string }>,
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

  return `🎉 คุณมีคู่ 1-2-1 ประจำสัปดาห์แล้ว!\n\nคุณ ${recipientName}\nสัปดาห์นี้ชวนมารู้จักกันให้ลึกกว่าเดิมกับ\n\n${partnerText}\n\n💡 โอกาสที่น่าชวนคุย\n${opportunities}\n\n🗣️ เริ่มบทสนทนาได้เลย\n“สวัสดีครับ/ค่ะ คุณ ${primaryName} สัปดาห์นี้เราได้คู่ 1-2-1 กัน ยินดีมากครับ/ค่ะ 😊\n${openerTopic}”\n\n🎯 ภารกิจเล็ก ๆ ในการคุยครั้งนี้\n• แลกเปลี่ยนเรื่องธุรกิจคนละ 5 นาที\n• บอกสัญญาณที่ทำให้นึกถึงกันได้ง่าย ๆ\n• ลองมองหาคนที่ช่วยแนะนำให้กันได้คนละ 1 คน\n\n${sharePrompt}\n\nทักหากันวันนี้ แล้วนัดเวลา 1-2-1 ภายในสัปดาห์นี้นะครับ/คะ 🚀\n\n— Mentor Team, BNI IDEAL`;
}

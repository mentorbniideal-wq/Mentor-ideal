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

export function weekly121Message(recipient: { name: string }, partners: Array<{ name: string; business?: string; lookingFor?: string }>): string {
  const partnerText = partners.map(p => `คุณ ${p.name}${p.business ? ` — ${p.business}` : ''}`).join('\n');
  const looking = partners.map(p => p.lookingFor).filter(Boolean).join('\n• ') || 'ไม่ได้ระบุ';
  return `🤝 คู่ 1-2-1 ประจำสัปดาห์\n\nคุณ ${recipient.name}\nจับคู่กับ\n${partnerText}\n\n🎯 Looking for ของคู่คุณ:\n${looking}\n\nกรุณาติดต่อกันเพื่อนัดหมาย 1-2-1 ภายในสัปดาห์นี้ครับ\n\nขอให้เป็นบทสนทนาดี ๆ ที่นำไปสู่โอกาสใหม่ร่วมกัน\n— Mentor Team, BNI IDEAL`;
}

import { createWeekly121Matches, normalize121Name, parseWeekly121Csv, weekly121Message } from './weekly-121.ts';
const eq = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
Deno.test('CSV รองรับ BOM ไทย quoted comma และ multiline', () => {
  const csv = '\uFEFF"ชื่อผู้เข้าประชุม (ภาษาอังกฤษ)","นามสกุล (ภาษาอังกฤษ)",มาประชุมแทน,"Looking for",date,time,user_role\nMayuree,Issard,,"โรงแรม, ขอนแก่น\nแห่งใหม่",18/08/2026,07:49:02,member';
  const out = parseWeekly121Csv(csv); eq(out.rows.length, 1); eq(out.rows[0].lookingFor, 'โรงแรม, ขอนแก่น\nแห่งใหม่');
});
Deno.test('normalize ชื่อ', () => eq(normalize121Name('  MAYUREE   Issard '), 'mayuree issard'));
Deno.test('จำนวนคู่และเลขคี่เป็นกลุ่มสามโดยสมาชิกไม่ซ้ำ', () => {
  const ms = ['a','b','c','d','e'].map(id => ({ id, name: id }));
  const groups = createWeekly121Matches(ms, new Set(), [], () => .5);
  eq(groups.map(g => g.members.length), [3,2]); eq(new Set(groups.flatMap(g => g.members.map(m => m.id))).size, 5);
});
Deno.test('ป้องกันคู่ซ้ำและรักษาคู่ล็อก', () => {
  const ms = ['a','b','c','d'].map(id => ({ id, name: id }));
  const locked = [{ members: [ms[0], ms[1]], locked: true }];
  const groups = createWeekly121Matches(ms, new Set(['a|c','a|d']), locked, () => .5);
  eq(groups[0].members.map(m => m.id), ['a','b']); eq(groups[1].members.map(m => m.id), ['c','d']);
});
Deno.test('ข้อความ LINE ชวนให้อยากนัดและมีคำถามเริ่มบทสนทนา', () => {
  const message = weekly121Message(
    { name: 'Mayuree Issard', lookingFor: 'โรงแรมเปิดใหม่' },
    [{ name: 'Phanuwat Promwong', business: 'รับสร้างบ้าน', lookingFor: 'คุณหมอและผู้ประกอบการ' }],
  );
  for (const expected of ['คุณมีคู่ 1-2-1', 'โอกาสที่น่าชวนคุย', 'เริ่มบทสนทนาได้เลย', 'ลูกค้าแบบไหน', 'คนละ 1 คน', 'โรงแรมเปิดใหม่']) {
    if (!message.includes(expected)) throw new Error(`missing engaging copy: ${expected}`);
  }
  if (message.includes('undefined') || message.length > 5000) throw new Error('unsafe LINE message');
});

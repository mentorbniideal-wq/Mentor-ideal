import { createWeekly121Matches, normalize121Name, parseWeekly121Csv, weekly121Message, weekly121PairScore, weekly121TestMessage } from './weekly-121.ts';
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
Deno.test('โหมด check-in ให้คะแนนคนที่อยู่ห่างกันมากกว่า', () => {
  const a={id:'a',name:'A',checkinOrder:1}, b={id:'b',name:'B',checkinOrder:2}, c={id:'c',name:'C',checkinOrder:20};
  if(weekly121PairScore(a,c,'checkin_mix')<=weekly121PairScore(a,b,'checkin_mix'))throw new Error('check-in distance not preferred');
});
Deno.test('โหมด Looking for จับความต้องการเข้ากับธุรกิจ', () => {
  const a={id:'a',name:'A',lookingFor:'โรงแรม เปิดใหม่'}, b={id:'b',name:'B',business:'รับออกแบบ โรงแรม'}, c={id:'c',name:'C',business:'ประกันชีวิต'};
  if(weekly121PairScore(a,b,'looking_for')<=weekly121PairScore(a,c,'looking_for'))throw new Error('looking-for fit not preferred');
});
Deno.test('โหมดข้ามทีมให้คะแนนสมาชิกต่างทีม', () => {
  const a={id:'a',name:'A',mentorTeam:'Aof'}, b={id:'b',name:'B',mentorTeam:'Aof'}, c={id:'c',name:'C',mentorTeam:'Draft'};
  if(weekly121PairScore(a,c,'cross_team')<=weekly121PairScore(a,b,'cross_team'))throw new Error('cross-team not preferred');
});
Deno.test('ข้อความทดสอบขึ้นต้นชัดเจนและเก็บข้อความจริงไว้', () => {
  const out=weekly121TestMessage('ข้อความคู่จริง');
  if(!out.startsWith('🧪 นี่คือการทดลองระบบ')||!out.includes('ข้อความคู่จริง'))throw new Error('invalid test prefix');
});

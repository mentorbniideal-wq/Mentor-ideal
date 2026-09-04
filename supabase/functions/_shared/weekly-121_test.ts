import { createOneToOneMatches, createWeekly121Matches, fullyDeliveredOneToOnePairIds, hasUsableLineId, normalize121Name, oneToOneRoundDeliveryStatus, parseWeekly121Csv, weekly121Message, weekly121PairScore, weekly121RealDeliveryByMember, weekly121TestMessage } from './weekly-121.ts';
const eq = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
Deno.test('CSV รองรับ BOM ไทย quoted comma และ multiline', () => {
  const csv = '\uFEFF"ชื่อผู้เข้าประชุม (ภาษาอังกฤษ)","นามสกุล (ภาษาอังกฤษ)",มาประชุมแทน,"Looking for",date,time,user_role\nMayuree,Issard,,"โรงแรม, ขอนแก่น\nแห่งใหม่",18/08/2026,07:49:02,member';
  const out = parseWeekly121Csv(csv); eq(out.rows.length, 1); eq(out.rows[0].lookingFor, 'โรงแรม, ขอนแก่น\nแห่งใหม่');
});
Deno.test('normalize ชื่อ', () => eq(normalize121Name('  MAYUREE   Issard '), 'mayuree issard'));
Deno.test('ระบบใหม่สร้างกลุ่มพิเศษ 3 คนเมื่อจำนวนผู้เข้าร่วมเป็นเลขคี่', () => {
  const ms = ['a','b','c','d','e'].map(id => ({ id, name: id }));
  const result = createOneToOneMatches(ms, new Set(), [], () => .5);
  eq(result.groups.map(g => g.members.length).sort(), [2,3]);
  if (result.waiting) throw new Error('odd pool must use a trio');
  eq(new Set(result.groups.flatMap(g => g.members.map(m => m.id))).size, 5);
});
Deno.test('กลุ่มพิเศษรวมสมาชิกที่เคยรอเข้าด้วย', () => {
  const ms = [{id:'a',name:'A',waitingPriority:4},{id:'b',name:'B',waitingPriority:0},{id:'c',name:'C',waitingPriority:0}];
  const result=createOneToOneMatches(ms,new Set(),[],()=>.5);
  eq(result.groups[0].members.length,3);
  if(!result.groups[0].members.some(member=>member.id==='a'))throw new Error('priority member must be included');
});
Deno.test('คนเหลือหนึ่งคนถูกเติมเข้าคู่ที่ล็อกเป็นกลุ่มพิเศษโดยไม่รื้อคู่เดิม',()=>{
  const members=['a','b','c'].map(id=>({id,name:id})),locked=[{id:'pair-1',locked:true,members:members.slice(0,2)}];
  const result=createOneToOneMatches(members,new Set(),locked,()=>.5);
  eq(result.waiting,null);eq(result.groups[0].id,'pair-1');eq(result.groups[0].members.map(x=>x.id),['a','b','c']);
});
Deno.test('ระบบเดิมที่เรียก matcher ด้วยจำนวนคู่ยังได้เฉพาะคู่', () => {
  const groups=createWeekly121Matches(['a','b','c','d'].map(id=>({id,name:id})),new Set(),[],()=>.5);
  if(groups.some(group=>group.members.length!==2))throw new Error('new group of three detected');
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
Deno.test('Template มาตรฐานทั้งห้าแบบสร้างข้อความเฉพาะและปลอดภัย', () => {
  const keys=['growth_opportunity','warm_connection','referral_focus','story_trust','quick_action'];
  const messages=keys.map(key=>weekly121Message({name:'Pete',lookingFor:'เจ้าของโรงแรม'},[{name:'Ideal',business:'สถาปนิก'}],key));
  if(new Set(messages).size!==keys.length)throw new Error('templates must produce distinct messages');
  messages.forEach(message=>{if(!message.includes('Pete')||!message.includes('Ideal')||message.includes('undefined')||message.length>5000)throw new Error('unsafe template output');});
});
Deno.test('กำลังดำเนินการต้องส่ง LINE จริงสำเร็จครบทั้งคู่',()=>{
  const rows=[{matching_pair_id:'complete',member_id:'a',status:'sent',notification_type:'weekly_121_matching'},{matching_pair_id:'complete',member_id:'b',status:'sent',notification_type:'weekly_121_matching'},{matching_pair_id:'one-sided',member_id:'c',status:'sent',notification_type:'weekly_121_matching'},{matching_pair_id:'test-only',member_id:'d',status:'sent',notification_type:'weekly_121_test'},{matching_pair_id:'test-only',member_id:'e',status:'sent',notification_type:'weekly_121_test'},{matching_pair_id:'failed',member_id:'f',status:'failed',notification_type:'weekly_121_matching'},{matching_pair_id:'failed',member_id:'g',status:'sent',notification_type:'weekly_121_matching'}];
  eq(fullyDeliveredOneToOnePairIds(rows),['complete']);
});
Deno.test('LINE ID ต้องมีค่าจริง ไม่รับ null หรือช่องว่าง',()=>{
  eq([hasUsableLineId(null),hasUsableLineId(''),hasUsableLineId('  '),hasUsableLineId('null'),hasUsableLineId('undefined'),hasUsableLineId('U123')],[false,false,false,false,false,true]);
});
Deno.test('รอบขึ้นว่าส่งแล้วเฉพาะเมื่อส่งครบโดยไม่ถูกข้ามหรือล้มเหลว',()=>{
  eq(oneToOneRoundDeliveryStatus(18,0,0),'sent');
  eq(oneToOneRoundDeliveryStatus(2,0,16),'partially_failed');
  eq(oneToOneRoundDeliveryStatus(0,0,18),'partially_failed');
  eq(oneToOneRoundDeliveryStatus(17,1,0),'partially_failed');
});
Deno.test('Live delivery ไม่ใช้ผลส่งทดสอบแทนผลส่งจริง',()=>{
  const rows=[{member_id:'a',notification_type:'weekly_121_test',status:'sent'},{member_id:'a',notification_type:'weekly_121_matching',status:'failed'},{member_id:'b',notification_type:'weekly_121_test',status:'sent'}];
  const byMember=weekly121RealDeliveryByMember(rows);
  eq(byMember.get('a')?.status,'failed');
  eq(byMember.has('b'),false);
});

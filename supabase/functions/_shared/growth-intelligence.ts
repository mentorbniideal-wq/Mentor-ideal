export type GrowthMember = { id: string; name: string; nickname?: string | null; profession?: string | null; isArchived?: boolean };
export type GrowthPlan = { memberId: string; lookingFor: string[]; powerTeam: string[]; updatedAt?: string | null };
export type GrowthTask = { id: string; status: string; taskText?: string | null; memberId?: string | null; createdAt?: string | null };
export type GrowthProposal = { id: string; status: string; sourceCategory?: string | null; memberIds: string[] };
export type GrowthPair = { a: string; b: string; completedAt?: string | null; active?: boolean };

export function categoryKey(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[’']/g, '').replace(/&/g, 'and').replace(/[^a-z0-9\u0E00-\u0E7F]+/g, '').trim();
}

function stale(value: string | null | undefined, now: Date): boolean {
  if (!value) return true;
  const at = new Date(value).getTime();
  return !Number.isFinite(at) || now.getTime() - at > 120 * 86400000;
}

export function buildGrowthIntelligence(input: {
  members: GrowthMember[]; plans: GrowthPlan[]; tasks: GrowthTask[]; proposals: GrowthProposal[]; pairs: GrowthPair[]; now?: Date; lookbackDays?: number;
}) {
  const now = input.now || new Date();
  const lookback = (input.lookbackDays || 120) * 86400000;
  const activeMembers = input.members.filter(m => !m.isArchived);
  const memberIds = new Set(activeMembers.map(m => m.id));
  const memberById = new Map(activeMembers.map(m => [m.id, m]));
  const coverage = new Set(activeMembers.map(m => categoryKey(m.profession)).filter(Boolean));
  const demand = new Map<string, { category: string; memberIds: string[]; fresh: boolean; power: boolean }>();
  for (const plan of input.plans) {
    if (!memberIds.has(plan.memberId)) continue;
    for (const row of [{ values: plan.lookingFor, power: false }, { values: plan.powerTeam, power: true }]) {
      for (const category of row.values || []) {
        const key = categoryKey(category); if (!key) continue;
        const existing = demand.get(key) || { category: String(category).trim(), memberIds: [], fresh: true, power: false };
        if (!existing.memberIds.includes(plan.memberId)) existing.memberIds.push(plan.memberId);
        existing.fresh = existing.fresh && !stale(plan.updatedAt, now);
        existing.power = existing.power || row.power;
        demand.set(key, existing);
      }
    }
  }
  const hasTask = (key: string, ids: string[]) => input.tasks.some(t => !['completed', 'cancelled'].includes(t.status) && (ids.includes(String(t.memberId || '')) || categoryKey(t.taskText).includes(key)));
  const hasProposal = (key: string, ids: string[]) => input.proposals.some(p => p.status !== 'archived' && (categoryKey(p.sourceCategory).includes(key) || p.memberIds.some(id => ids.includes(id))));
  const opportunities = [...demand.entries()].map(([key, row]) => {
    const covered = coverage.has(key);
    const confidence = !row.memberIds.length ? 'INSUFFICIENT' : row.fresh ? 'RELIABLE' : 'STALE';
    const existingTask = hasTask(key, row.memberIds), existingProposal = hasProposal(key, row.memberIds);
    return { id: `category:${key}`, type: 'MISSING_CATEGORY', category: row.category, memberIds: row.memberIds, covered, confidence, existingTask, existingProposal,
      title: covered ? `${row.category} มีใน Chapter แล้ว` : `${row.category} เป็นโอกาสของ Chapter`,
      why: covered ? 'พบ profession/category นี้ในสมาชิกที่ใช้งานอยู่ จึงไม่เสนอเป็นช่องว่างใหม่' : `สมาชิก ${row.memberIds.length} คนระบุความต้องการนี้ใน Blueprint`,
      evidence: [`ต้องการ ${row.memberIds.length} คน`, covered ? 'มี coverage ใน Chapter' : 'ยังไม่พบ coverage จาก profession ปัจจุบัน'],
      recommendedAction: covered ? 'ตรวจความเหมาะสมของ connection ที่มีอยู่' : existingTask || existingProposal ? 'ติดตาม action ที่มีอยู่' : 'สร้าง Growth Task หรือ Draft Power Team Proposal' };
  }).sort((a,b) => Number(a.covered)-Number(b.covered) || b.memberIds.length-a.memberIds.length || a.category.localeCompare(b.category, 'th'));

  const recentPair = new Set(input.pairs.filter(p => p.completedAt && now.getTime() - new Date(p.completedAt).getTime() <= lookback).map(p => [p.a,p.b].sort().join(':')));
  const activePair = new Set(input.pairs.filter(p => p.active).map(p => [p.a,p.b].sort().join(':')));
  const planByMember = new Map(input.plans.filter(p => memberIds.has(p.memberId)).map(p => [p.memberId,p]));
  const connections: any[] = [];
  for (let i=0;i<activeMembers.length;i++) for (let j=i+1;j<activeMembers.length;j++) {
    const a=activeMembers[i], b=activeMembers[j], key=[a.id,b.id].sort().join(':');
    if (recentPair.has(key) || activePair.has(key)) continue;
    const ap=planByMember.get(a.id), bp=planByMember.get(b.id); if (!ap || !bp) continue;
    const aCats=[...(ap.lookingFor||[]),...(ap.powerTeam||[])], bCats=[...(bp.lookingFor||[]),...(bp.powerTeam||[])];
    const shared=aCats.filter(x => bCats.map(categoryKey).includes(categoryKey(x))).filter((x,i,all)=>all.findIndex(y=>categoryKey(y)===categoryKey(x))===i);
    if (!shared.length) continue;
    const taskExists=hasTask(categoryKey(shared[0]), [a.id,b.id]);
    connections.push({id:`connection:${key}`,type:'CONNECTION_OPPORTUNITY',memberIds:[a.id,b.id],members:[a,b],shared,confidence:stale(ap.updatedAt,now)||stale(bp.updatedAt,now)?'STALE':'RELIABLE',existingTask:taskExists,
      title:`${a.nickname || a.name} ↔ ${b.nickname || b.name}`, why:`มี category ที่ระบุร่วมกัน: ${shared.join(', ')}`, evidence:[`ยังไม่พบ 1-2-1 ที่เสร็จภายใน ${Math.round(lookback/86400000)} วัน`, 'เป็น connection opportunity ไม่ใช่การคาดการณ์ Referral'], recommendedAction:taskExists?'ติดตาม Growth Task ที่มีอยู่':'ชวนทำ MY121 หรือสร้าง Growth Task'});
  }
  connections.sort((a,b)=>b.shared.length-a.shared.length || a.title.localeCompare(b.title,'th'));
  const followUps=input.tasks.filter(t=>!['completed','cancelled'].includes(t.status)).slice(0,5).map(t=>({id:`task:${t.id}`,type:'GROWTH_FOLLOW_UP',taskId:t.id,memberIds:t.memberId?[String(t.memberId)]:[],confidence:'RELIABLE',existingTask:true,title:'ติดตาม Growth Action ที่เปิดอยู่',why:t.taskText || 'ยังมี Growth Task ที่ต้องดูแล',evidence:[`สถานะ: ${t.status}`],recommendedAction:'เปิด Growth Inbox และอัปเดตสถานะ'}));
  const priorities=[...opportunities.filter(x=>!x.covered&&!x.existingTask&&!x.existingProposal),...connections.filter(x=>!x.existingTask),...followUps].slice(0,5);
  return { priorities, opportunities, connections: connections.slice(0,12), dataConfidence: input.plans.length ? 'RELIABLE' : 'INSUFFICIENT' };
}

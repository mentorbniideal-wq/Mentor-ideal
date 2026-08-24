export type GoalKey='ref'|'visitor'|'oto'|'ceu'|'tyfb';
export type GoalCoachInput={score:number;trafficLight:string;weeks:number;actuals:Record<string,number>;palms:Record<string,number>;goals?:Record<string,number>};

const definitions=[
  {key:'ref' as GoalKey,label:'Referral',actual:'referrals',actualUnit:'ใบ',points:'referral',max:15,unit:'ใบ/สัปดาห์',starter:1,strong:2,action:'เตรียม Referral คุณภาพอย่างน้อย 1 ใบก่อนประชุม'},
  {key:'visitor' as GoalKey,label:'Visitor',actual:'visitors',actualUnit:'คน',points:'visitor',max:20,unit:'คน/เดือน',starter:1,strong:1,action:'เลือก 1 คนที่ได้ประโยชน์จากการมารู้จัก Chapter'},
  {key:'oto' as GoalKey,label:'1-2-1',actual:'oneToOne',actualUnit:'ครั้ง',points:'oneToOne',max:15,unit:'ครั้ง/สัปดาห์',starter:1,strong:2,action:'จองเวลา 1-2-1 ล่วงหน้าอย่างน้อย 1 ครั้ง'},
  {key:'ceu' as GoalKey,label:'CEU',actual:'ceu',actualUnit:'ครั้ง',points:'ceu',max:20,unit:'ครั้ง/เดือน',starter:1,strong:1,action:'เลือก CEU ที่ช่วยธุรกิจหรือบทบาทใน Chapter 1 เรื่อง'},
  {key:'tyfb' as GoalKey,label:'TYFB',actual:'tyfbThb',actualUnit:'บาท',points:'tyfb',max:15,unit:'บาท/รอบ',starter:100000,strong:200000,action:'ติดตาม Referral ที่เกิดผลและบันทึก TYFB ให้ครบ'},
];

export function nextTrafficTarget(score:number){const value=Math.max(0,Math.min(100,Math.round(Number(score)||0)));if(value<30)return 30;if(value<50)return 50;if(value<70)return 70;return Math.min(100,Math.max(80,value+10));}

export function buildGoalCoach(input:GoalCoachInput){
  const score=Math.max(0,Math.min(100,Math.round(Number(input.score)||0))),goals=input.goals||{};
  const components=definitions.map(d=>{const points=Math.max(0,Number(input.palms[d.points]||0)),actual=Math.max(0,Number(input.actuals[d.actual]||0)),suggested=d.key==='tyfb'?(points>=10?500000:points>=5?200000:100000):(points>=Math.ceil(d.max/2)?d.strong:d.starter);return{key:d.key,label:d.label,actual,actualUnit:d.actualUnit,points,maxPoints:d.max,unit:d.unit,currentGoal:Number(goals[d.key]||0)||null,suggestedGoal:suggested,action:d.action,gap:d.max-points};});
  const priorities=components.filter(x=>x.gap>0).sort((a,b)=>b.gap-a.gap||a.label.localeCompare(b.label)).slice(0,3);
  return{score,trafficLight:input.trafficLight||'none',scoreTarget:nextTrafficTarget(score),components,priorities,guidance:score<30?'เริ่มจากพฤติกรรมเล็ก ๆ เพียง 1–2 เรื่องให้ทำได้ต่อเนื่อง':score<70?'เลือกจุดที่คะแนนขยับได้และทำซ้ำทุกสัปดาห์':'รักษาความสม่ำเสมอ และเลือกหนึ่งเรื่องเพื่อช่วยสมาชิกคนอื่นให้มากขึ้น'};
}

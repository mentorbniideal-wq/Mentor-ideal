// deno-lint-ignore-file no-explicit-any
import { linePush } from './line.ts';

type Db = { from: (table:string)=>any; rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<any> };

async function memberLineId(db:Db, memberId:string):Promise<string>{
  const {data}=await db.from('line_members').select('line_user_id').eq('member_id',memberId).maybeSingle();
  return String((data as Record<string,unknown>|null)?.line_user_id||'');
}

export async function notifyOneToOnePartner(db:Db,input:{pairId:string;memberId:string;partnerId:string;type:string;message:string}){
  const recipient=await memberLineId(db,input.partnerId);if(!recipient)return {sent:0};
  const result=await linePush(recipient,input.message,{db,idempotencyKey:`121:${input.type}:${input.pairId}:${input.memberId}:${input.partnerId}`,memberId:input.partnerId,notificationType:`one_to_one_${input.type}`,source:'liff-api'});
  return {sent:result.skipped?0:1};
}

export async function notifyOneToOneMentorAndMc(db:Db,input:{feedbackId:string;pairId:string;memberId:string;memberName:string;nickname:string;mentorTeam:string;message:string}){
  const recipients=new Set<string>();
  const {data:mcSettings}=await db.from('settings').select('key,value').in('key',['MC_LINE_USER_ID','MC_LINE_ID','LINE_ID_MC']);
  for(const row of mcSettings||[]){const id=String((row as Record<string,unknown>).value||'');if(id)recipients.add(id);}
  const team=input.mentorTeam.trim();
  if(team){
    const keys=[`LINE_ID_${team}`,`LINE_ID_${team.toUpperCase().replace(/[^A-Z0-9]/g,'_')}`];
    const {data:teamSettings}=await db.from('settings').select('value').in('key',[...new Set(keys)]);
    for(const row of teamSettings||[]){const id=String((row as Record<string,unknown>).value||'');if(id)recipients.add(id);}
    const {data:teamRow}=await db.from('mentor_teams').select('leader_name').eq('name',team).maybeSingle();
    const leader=String((teamRow as Record<string,unknown>|null)?.leader_name||'').trim();
    if(leader){const {data:mentor}=await db.from('members').select('id').or(`name.ilike.%${leader}%,nickname.ilike.%${leader}%`).eq('is_archived',false).limit(1).maybeSingle();if(mentor){const id=await memberLineId(db,String((mentor as Record<string,unknown>).id));if(id)recipients.add(id);}}
  }
  const nickname=input.nickname||input.memberName.split(' ')[0]||input.memberName;
  await db.from('notifications').insert({type:'one_to_one_mentor_request',severity:'warning',title:`${nickname} ขอความช่วยเหลือเรื่อง 1-2-1`,body:input.message,data:{feedbackId:input.feedbackId,pairId:input.pairId,memberId:input.memberId,mentorTeam:team},target_audience:['role:mc','role:mentor_support',...(team?[`team:${team}`]:[])]});
  const text=['🤝 สมาชิกขอคุยกับ Mentor',`${nickname} · ทีม ${team||'ยังไม่ระบุ'}`,`เรื่อง: ${input.message.length>220?input.message.slice(0,217)+'...':input.message}`,'','เปิด MC Desktop → 1-2-1 System → ต้องดูแล'].join('\n');
  let sent=0;for(const recipient of recipients){const result=await linePush(recipient,text,{db,idempotencyKey:`121:mentor-request:${input.feedbackId}:${recipient}`,memberId:input.memberId,notificationType:'one_to_one_mentor_request',source:'liff-api'});if(!result.skipped)sent++;}
  return {sent,recipientCount:recipients.size};
}

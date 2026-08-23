import { corsHeaders } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/db.ts';
import { trackLineEvent } from '../_shared/analytics.ts';
import { buildIdempotencyKey } from '../_shared/line.ts';
import { notifyAbsenceStakeholders } from '../_shared/line-absence-notify.ts';
import { notifyIssueStakeholders } from '../_shared/line-issue-notify.ts';
import { notifyOneToOneMentorAndMc, notifyOneToOnePartner } from '../_shared/one-to-one-notify.ts';
import { generateHandshakeCode, handshakeCodeHash, oneToOneGoogleCalendarUrl, oneToOneIcs, pairStatusFromVerification, safeHashEqual } from '../_shared/one-to-one.ts';

type Db = ReturnType<typeof getServiceClient>;

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function resolveLineMember(db: Db, accessToken: string) {
  if (!accessToken) return { error: 'LINE access token required' };
  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) return { error: 'LINE session ไม่ถูกต้องหรือหมดอายุ' };
  const profile = await profileRes.json() as Record<string, unknown>;
  const userId = String(profile.userId || '');
  const { data } = await db.from('line_members')
    .select('member_id, members(id, name, nickname, mentor_team, email)')
    .eq('line_user_id', userId)
    .maybeSingle();
  if (!data) return { error: 'บัญชี LINE นี้ยังไม่ได้เชื่อมกับสมาชิก', userId, profile };
  const member = (data as Record<string, unknown>).members as Record<string, unknown>;
  return { userId, profile, member, memberId: String((data as Record<string, unknown>).member_id) };
}


Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ ok: false, error: 'Method not allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return response({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const db = getServiceClient();
  const identity = await resolveLineMember(db, String(body.accessToken || ''));
  if ('error' in identity) return response({ ok: false, error: identity.error }, 401);
  const action = String(body.action || 'bootstrap');
  const member = identity.member;
  const memberId = identity.memberId;

  async function ownPair(pairId?:string){
    let query=db.from('matching_pairs').select('id,round_id,member_a_id,member_b_id,status,matching_rounds!inner(meeting_date,starts_at,ends_at,system_version)').or(`member_a_id.eq.${memberId},member_b_id.eq.${memberId}`).is('archived_at',null);
    if(pairId)query=query.eq('id',pairId);else query=query.eq('matching_rounds.system_version',2).order('created_at',{ascending:false}).limit(1);
    const {data,error}=await query.maybeSingle();return{pair:data as Record<string,unknown>|null,error};
  }

  if(action==='one-to-one-bootstrap'){
    const {pair,error}=await ownPair();if(error)return response({ok:false,error:error.message},400);if(!pair)return response({ok:true,pair:null});
    const partnerId=String(pair.member_a_id)===memberId?String(pair.member_b_id):String(pair.member_a_id);
    const [{data:partner},{data:schedules},{data:followUps},{data:history},{data:lookingFor}]=await Promise.all([
      db.from('members').select('id,name,nickname,profession,company_name,mentor_team').eq('id',partnerId).maybeSingle(),
      db.from('one_to_one_schedules').select('*').eq('pair_id',String(pair.id)).in('status',['proposed','confirmed']).order('created_at',{ascending:false}).limit(3),
      db.from('one_to_one_follow_up_actions').select('*').eq('pair_id',String(pair.id)).eq('owner_member_id',memberId).order('created_at',{ascending:false}),
      db.from('matching_pairs').select('id,status,created_at,member_a_id,member_b_id,matching_rounds(meeting_date)').or(`member_a_id.eq.${memberId},member_b_id.eq.${memberId}`).order('created_at',{ascending:false}).limit(20),
      db.from('matching_import_rows').select('looking_for').eq('round_id',String(pair.round_id)).eq('matched_member_id',partnerId).limit(1).maybeSingle(),
    ]);
    const scheduleRows=(schedules||[]) as Record<string,unknown>[],schedule=scheduleRows.find(x=>x.status==='confirmed')||scheduleRows[0]||null;
    return response({ok:true,pair,partner,schedule,scheduleOptions:scheduleRows,followUps:followUps||[],journey:{total:(history||[]).length,completed:((history||[]) as Record<string,unknown>[]).filter(x=>['verified','late_verified'].includes(String(x.status))).length,recent:history||[]},referralCard:{lookingFor:String((lookingFor as Record<string,unknown>|null)?.looking_for||''),profession:String((partner as Record<string,unknown>|null)?.profession||''),companyName:String((partner as Record<string,unknown>|null)?.company_name||'')},privacyNotice:'Shared Reflection เห็นได้โดยคุณ คู่สนทนา และ Mentor ที่มีสิทธิ์ ส่วน Private Mentor Feedback จะไม่แสดงให้อีกฝ่ายเห็น'});
  }

  if(action==='propose-one-to-one-schedule'){
    const pairId=String(body.pairId||''),startsAt=String(body.startsAt||''),mode=String(body.meetingMode||'in_person'),duration=Math.max(15,Math.min(240,Number(body.durationMinutes||45)));
    const {pair}=await ownPair(pairId);if(!pair)return response({ok:false,error:'ไม่พบคู่ 1-2-1 ของคุณ'},403);
    const start=new Date(startsAt);if(Number.isNaN(start.getTime())||start<=new Date())return response({ok:false,error:'กรุณาเลือกวันและเวลาในอนาคต'},400);
    if(!['in_person','phone','video','other'].includes(mode))return response({ok:false,error:'รูปแบบนัดหมายไม่ถูกต้อง'},400);
    const isA=String(pair.member_a_id)===memberId;const payload={pair_id:pairId,proposed_by:memberId,starts_at:start.toISOString(),duration_minutes:duration,timezone:'Asia/Bangkok',meeting_mode:mode,location_or_link:String(body.locationOrLink||'').trim()||null,status:'proposed',stable_event_uid:`${pairId}-${crypto.randomUUID()}@bni-ideal`,confirmed_by_a_at:isA?new Date().toISOString():null,confirmed_by_b_at:isA?null:new Date().toISOString()};
    const {data,error}=await db.from('one_to_one_schedules').insert(payload).select('*').single();if(error)return response({ok:false,error:error.message},400);
    await db.from('matching_pairs').update({status:'scheduled'}).eq('id',pairId);
    await db.from('one_to_one_status_events').insert({round_id:String(pair.round_id),pair_id:pairId,member_id:memberId,event_type:'schedule_proposed',actor_type:'member',actor_ref:memberId,metadata:{startsAt:start.toISOString(),mode}});
    const partnerId=String(pair.member_a_id)===memberId?String(pair.member_b_id):String(pair.member_a_id);await notifyOneToOnePartner(db,{pairId,memberId,partnerId,type:'schedule_proposed',message:`📅 คู่ 1-2-1 ของคุณเสนอเวลานัดแล้ว\n${start.toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}\n\nเปิด MY121 เพื่อยืนยันหรือเสนอเวลาใหม่`});
    return response({ok:true,schedule:data,message:'ส่งเวลานัดให้อีกฝ่ายยืนยันแล้ว'});
  }

  if(action==='propose-one-to-one-schedule-options'){
    const pairId=String(body.pairId||''),mode=String(body.meetingMode||'in_person'),duration=Math.max(15,Math.min(240,Number(body.durationMinutes||45))),raw=Array.isArray(body.startsAtOptions)?body.startsAtOptions:[];
    const options=[...new Set(raw.map(String).filter(Boolean))].slice(0,3);const {pair}=await ownPair(pairId);if(!pair)return response({ok:false,error:'ไม่พบคู่ 1-2-1 ของคุณ'},403);if(!['in_person','phone','video','other'].includes(mode))return response({ok:false,error:'รูปแบบนัดหมายไม่ถูกต้อง'},400);if(options.length<2)return response({ok:false,error:'กรุณาเสนอเวลาอย่างน้อย 2 ตัวเลือก'},400);
    const starts=options.map(value=>new Date(value));if(starts.some(start=>Number.isNaN(start.getTime())||start<=new Date()))return response({ok:false,error:'ทุกตัวเลือกต้องเป็นวันและเวลาในอนาคต'},400);const isA=String(pair.member_a_id)===memberId,now=new Date().toISOString();await db.from('one_to_one_schedules').update({status:'rescheduled',updated_at:now}).eq('pair_id',pairId).eq('status','proposed');
    const rows=starts.map(start=>({pair_id:pairId,proposed_by:memberId,starts_at:start.toISOString(),duration_minutes:duration,timezone:'Asia/Bangkok',meeting_mode:mode,location_or_link:String(body.locationOrLink||'').trim()||null,status:'proposed',stable_event_uid:`${pairId}-${crypto.randomUUID()}@bni-ideal`,confirmed_by_a_at:isA?now:null,confirmed_by_b_at:isA?null:now}));const {data,error}=await db.from('one_to_one_schedules').insert(rows).select('*');if(error)return response({ok:false,error:error.message},400);await db.from('matching_pairs').update({status:'scheduled'}).eq('id',pairId);await db.from('one_to_one_status_events').insert({round_id:String(pair.round_id),pair_id:pairId,member_id:memberId,event_type:'schedule_options_proposed',actor_type:'member',actor_ref:memberId,metadata:{startsAt:starts.map(x=>x.toISOString()),mode}});const partnerId=String(pair.member_a_id)===memberId?String(pair.member_b_id):String(pair.member_a_id);await notifyOneToOnePartner(db,{pairId,memberId,partnerId,type:'schedule_options_proposed',message:`📅 คู่ 1-2-1 ของคุณเสนอเวลา ${starts.length} ตัวเลือกแล้ว\nเปิด MY121 เพื่อเลือกเวลาที่สะดวก`});return response({ok:true,schedules:data||[],message:`ส่งเวลา ${starts.length} ตัวเลือกให้อีกฝ่ายแล้ว`});
  }

  if(action==='confirm-one-to-one-schedule'){
    const pairId=String(body.pairId||''),scheduleId=String(body.scheduleId||'');const {pair}=await ownPair(pairId);if(!pair)return response({ok:false,error:'ไม่มีสิทธิ์ยืนยันนัดนี้'},403);
    const {data:schedule}=await db.from('one_to_one_schedules').select('*').eq('id',scheduleId).eq('pair_id',pairId).maybeSingle();if(!schedule)return response({ok:false,error:'ไม่พบนัดหมาย'},404);
    const isA=String(pair.member_a_id)===memberId,now=new Date().toISOString();const changes=isA?{confirmed_by_a_at:now}:{confirmed_by_b_at:now};const confirmed=Boolean(isA?now:(schedule as Record<string,unknown>).confirmed_by_a_at)&&Boolean(isA?(schedule as Record<string,unknown>).confirmed_by_b_at:now);
    const {data,error}=await db.from('one_to_one_schedules').update({...changes,status:confirmed?'confirmed':'proposed',updated_at:now}).eq('id',scheduleId).select('*').single();if(error)return response({ok:false,error:error.message},400);
    if(confirmed){await db.from('one_to_one_schedules').update({status:'rescheduled',updated_at:now}).eq('pair_id',pairId).eq('status','proposed').neq('id',scheduleId);await db.from('matching_pairs').update({status:'confirmed_schedule'}).eq('id',pairId);await db.from('one_to_one_status_events').insert({round_id:String(pair.round_id),pair_id:pairId,member_id:memberId,event_type:'schedule_confirmed',actor_type:'member',actor_ref:memberId});const partnerId=String(pair.member_a_id)===memberId?String(pair.member_b_id):String(pair.member_a_id);await notifyOneToOnePartner(db,{pairId,memberId,partnerId,type:'schedule_confirmed',message:'✅ คู่ของคุณยืนยันเวลา 1-2-1 แล้ว\nเปิด MY121 เพื่อเพิ่มนัดลง Calendar'});}
    return response({ok:true,schedule:data,message:confirmed?'ยืนยันนัดเรียบร้อย เพิ่มลงปฏิทินได้เลย':'บันทึกการยืนยันแล้ว รออีกฝ่ายยืนยัน'});
  }

  if(action==='cancel-one-to-one-schedule'){
    const pairId=String(body.pairId||''),scheduleId=String(body.scheduleId||'');const {pair}=await ownPair(pairId);if(!pair)return response({ok:false,error:'ไม่มีสิทธิ์ยกเลิกนัดนี้'},403);const {error}=await db.from('one_to_one_schedules').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',scheduleId).eq('pair_id',pairId);if(error)return response({ok:false,error:error.message},400);await db.from('matching_pairs').update({status:'cancelled'}).eq('id',pairId);await db.from('one_to_one_status_events').insert({round_id:String(pair.round_id),pair_id:pairId,member_id:memberId,event_type:'cancelled',actor_type:'member',actor_ref:memberId,metadata:{scheduleId,reason:String(body.reason||'')}});return response({ok:true,message:'ยกเลิกนัดแล้ว หากต้องการสามารถเสนอเวลาใหม่ได้'});
  }

  if(action==='reschedule-one-to-one'){
    const previousId=String(body.scheduleId||''),pairId=String(body.pairId||''),startsAt=String(body.startsAt||''),mode=String(body.meetingMode||'in_person'),duration=Math.max(15,Math.min(240,Number(body.durationMinutes||45)));const {pair}=await ownPair(pairId);if(!pair)return response({ok:false,error:'ไม่มีสิทธิ์เปลี่ยนเวลานัดนี้'},403);if(previousId)await db.from('one_to_one_schedules').update({status:'rescheduled',updated_at:new Date().toISOString()}).eq('id',previousId).eq('pair_id',pairId);const start=new Date(startsAt);if(Number.isNaN(start.getTime())||start<=new Date())return response({ok:false,error:'กรุณาเลือกวันและเวลาใหม่ในอนาคต'},400);const isA=String(pair.member_a_id)===memberId;const {data,error}=await db.from('one_to_one_schedules').insert({pair_id:pairId,proposed_by:memberId,starts_at:start.toISOString(),duration_minutes:duration,timezone:'Asia/Bangkok',meeting_mode:mode,location_or_link:String(body.locationOrLink||'').trim()||null,status:'proposed',stable_event_uid:`${pairId}-${crypto.randomUUID()}@bni-ideal`,confirmed_by_a_at:isA?new Date().toISOString():null,confirmed_by_b_at:isA?null:new Date().toISOString()}).select('*').single();if(error)return response({ok:false,error:error.message},400);await db.from('matching_pairs').update({status:'scheduled'}).eq('id',pairId);await db.from('one_to_one_status_events').insert({round_id:String(pair.round_id),pair_id:pairId,member_id:memberId,event_type:'rescheduled',actor_type:'member',actor_ref:memberId,metadata:{previousId,startsAt:start.toISOString()}});return response({ok:true,schedule:data,message:'เสนอเวลาใหม่แล้ว รออีกฝ่ายยืนยัน'});
  }

  if(action==='get-one-to-one-calendar'){
    const pairId=String(body.pairId||''),scheduleId=String(body.scheduleId||'');const {pair}=await ownPair(pairId);if(!pair)return response({ok:false,error:'ไม่มีสิทธิ์ดูนัดนี้'},403);
    const partnerId=String(pair.member_a_id)===memberId?String(pair.member_b_id):String(pair.member_a_id);const [{data:schedule},{data:partner}]=await Promise.all([db.from('one_to_one_schedules').select('*').eq('id',scheduleId).eq('pair_id',pairId).eq('status','confirmed').maybeSingle(),db.from('members').select('name').eq('id',partnerId).maybeSingle()]);if(!schedule)return response({ok:false,error:'นัดต้องได้รับการยืนยันจากทั้งสองฝ่ายก่อน'},400);
    const event={uid:String((schedule as Record<string,unknown>).stable_event_uid),partnerName:String((partner as Record<string,unknown>|null)?.name||'คู่ของคุณ'),startsAt:String((schedule as Record<string,unknown>).starts_at),durationMinutes:Number((schedule as Record<string,unknown>).duration_minutes),mode:String((schedule as Record<string,unknown>).meeting_mode),location:String((schedule as Record<string,unknown>).location_or_link||'')};
    return response({ok:true,ics:oneToOneIcs(event),googleUrl:oneToOneGoogleCalendarUrl(event),fileName:`bni-ideal-121-${pairId}.ics`});
  }

  if(action==='start-one-to-one-verification'){
    const pairId=String(body.pairId||'');const {pair}=await ownPair(pairId);if(!pair)return response({ok:false,error:'ไม่มีสิทธิ์ยืนยันคู่นี้'},403);const pepper=Deno.env.get('ONE_TO_ONE_CODE_PEPPER')||'';if(!pepper)return response({ok:false,error:'ระบบยืนยันยังไม่ได้ตั้งค่า'},503);
    const {data:existing}=await db.from('one_to_one_verifications').select('id').eq('pair_id',pairId).eq('member_id',memberId).maybeSingle();if(existing)return response({ok:true,issued:false,message:'รหัสถูกสร้างแล้ว หากสูญหายกรุณาขอ Mentor ช่วยออกใหม่'});
    const code=generateHandshakeCode();const round=pair.matching_rounds as Record<string,unknown>;const expires=String(round.ends_at||new Date(Date.now()+7*86400000).toISOString());const hash=await handshakeCodeHash(pairId,memberId,code,pepper);
    const {error}=await db.from('one_to_one_verifications').insert({pair_id:pairId,member_id:memberId,code_hash:hash,code_expires_at:expires,flow_started_at:new Date().toISOString()});if(error)return response({ok:false,error:error.message},400);
    await db.from('matching_pairs').update({status:'awaiting_verification'}).eq('id',pairId);const partnerId=String(pair.member_a_id)===memberId?String(pair.member_b_id):String(pair.member_a_id);await notifyOneToOnePartner(db,{pairId,memberId,partnerId,type:'handshake_started',message:'🤝 คู่ของคุณเริ่ม Digital Handshake แล้ว\nเปิด MY121 เพื่อดูรหัสของคุณและแลกรหัสกันหลังจบการพูดคุย'});return response({ok:true,issued:true,code,expiresAt:expires,message:'แสดงรหัสนี้ให้คู่ของคุณหลังจบการพูดคุย ห้ามส่งต่อให้ผู้อื่น'});
  }

  if(action==='submit-one-to-one-code'){
    const pairId=String(body.pairId||''),code=String(body.code||'').trim();if(!/^\d{6}$/.test(code))return response({ok:false,error:'กรุณากรอกรหัสตัวเลข 6 หลัก'},400);const {pair}=await ownPair(pairId);if(!pair)return response({ok:false,error:'ไม่มีสิทธิ์ยืนยันคู่นี้'},403);
    const partnerId=String(pair.member_a_id)===memberId?String(pair.member_b_id):String(pair.member_a_id);const [{data:own},{data:partnerVerification}]=await Promise.all([db.from('one_to_one_verifications').select('*').eq('pair_id',pairId).eq('member_id',memberId).maybeSingle(),db.from('one_to_one_verifications').select('*').eq('pair_id',pairId).eq('member_id',partnerId).maybeSingle()]);if(!own||!partnerVerification)return response({ok:false,error:'ทั้งสองฝ่ายต้องเปิด Verification Flow ก่อน'},400);
    const ownRow=own as Record<string,unknown>,partnerRow=partnerVerification as Record<string,unknown>;if(ownRow.verified_partner_code_at)return response({ok:true,idempotent:true,status:String(pair.status)});if(Number(ownRow.attempts||0)>=5||ownRow.locked_until&&new Date(String(ownRow.locked_until))>new Date())return response({ok:false,error:'กรอกรหัสผิดเกินกำหนด กรุณารอ 15 นาทีหรือติดต่อ Mentor'},429);if(new Date(String(partnerRow.code_expires_at))<new Date())return response({ok:false,error:'รหัสหมดอายุแล้ว กรุณาติดต่อ Mentor'},400);
    const pepper=Deno.env.get('ONE_TO_ONE_CODE_PEPPER')||'';const submitted=await handshakeCodeHash(pairId,partnerId,code,pepper);if(!safeHashEqual(submitted,String(partnerRow.code_hash))){const attempts=Number(ownRow.attempts||0)+1;await db.from('one_to_one_verifications').update({attempts,locked_until:attempts>=5?new Date(Date.now()+15*60000).toISOString():null}).eq('id',String(ownRow.id));return response({ok:false,error:`รหัสไม่ถูกต้อง เหลือโอกาส ${Math.max(0,5-attempts)} ครั้ง`},400);}
    const now=new Date().toISOString();await db.from('one_to_one_verifications').update({verified_partner_code_at:now}).eq('id',String(ownRow.id));const {data:both}=await db.from('one_to_one_verifications').select('member_id,verified_partner_code_at').eq('pair_id',pairId);const aVerified=Boolean((both||[]).find((x:Record<string,unknown>)=>String(x.member_id)===String(pair.member_a_id))?.verified_partner_code_at),bVerified=Boolean((both||[]).find((x:Record<string,unknown>)=>String(x.member_id)===String(pair.member_b_id))?.verified_partner_code_at);const round=pair.matching_rounds as Record<string,unknown>,status=pairStatusFromVerification(aVerified,bVerified,String(round.ends_at||now));await db.from('matching_pairs').update({status}).eq('id',pairId);await db.from('one_to_one_status_events').insert({round_id:String(pair.round_id),pair_id:pairId,member_id:memberId,event_type:status,actor_type:'member',actor_ref:memberId,idempotency_key:`verification:${pairId}:${memberId}`});return response({ok:true,status,message:status==='partially_verified'?'ยืนยันสำเร็จ รอคู่ของคุณยืนยันอีกฝ่าย':'ยืนยัน 1-2-1 สำเร็จแล้ว'});
  }

  if(action==='submit-one-to-one-reflection'){
    const pairId=String(body.pairId||''),visibility=String(body.visibility||'shared');const {pair}=await ownPair(pairId);if(!pair)return response({ok:false,error:'ไม่มีสิทธิ์ส่ง Reflection คู่นี้'},403);if(!['verified','late_verified'].includes(String(pair.status)))return response({ok:false,error:'กรุณายืนยัน Digital Handshake ให้ครบก่อนตอบ Reflection'},400);if(!['shared','private_mentor'].includes(visibility))return response({ok:false,error:'ประเภท Reflection ไม่ถูกต้อง'},400);const aboutId=String(pair.member_a_id)===memberId?String(pair.member_b_id):String(pair.member_a_id);
    const feedback={pair_id:pairId,respondent_member_id:memberId,about_member_id:aboutId,visibility,learned:String(body.learned||'').trim()||null,outcomes:Array.isArray(body.outcomes)?body.outcomes:[],next_action_type:String(body.nextActionType||'').trim()||null,next_action_detail:String(body.nextActionDetail||'').trim()||null,usefulness:body.usefulness?Number(body.usefulness):null,cooperation:body.cooperation?Number(body.cooperation):null,mentor_help:String(body.mentorHelp||'').trim()||null};const {data:existing}=await db.from('one_to_one_feedback').select('id').eq('pair_id',pairId).eq('respondent_member_id',memberId).eq('visibility',visibility).is('archived_at',null).maybeSingle();const write=existing?db.from('one_to_one_feedback').update(feedback).eq('id',String((existing as Record<string,unknown>).id)).select('id').single():db.from('one_to_one_feedback').insert(feedback).select('id').single();const {data,error}=await write;if(error)return response({ok:false,error:error.message},400);
    if(visibility==='shared'&&feedback.next_action_type&&feedback.next_action_type!=='none')await db.from('one_to_one_follow_up_actions').insert({pair_id:pairId,action_type:feedback.next_action_type,description:feedback.next_action_detail,owner_member_id:memberId,related_member_id:aboutId,due_date:String(body.dueDate||'')||null});
    if(visibility==='private_mentor'&&feedback.mentor_help){const feedbackId=String((data as Record<string,unknown>).id),mentorMessage=String(feedback.mentor_help);await db.from('one_to_one_attention_items').insert({member_id:memberId,pair_id:pairId,level:'mentor_review_required',reason:`สมาชิกขอคุยกับ Mentor: ${mentorMessage.length>240?mentorMessage.slice(0,237)+'...':mentorMessage}`,evidence:[{feedbackId,message:mentorMessage}],positive_context:['สมาชิกเป็นผู้ขอความช่วยเหลือด้วยตนเอง'],suggested_action:'Mentor ติดต่อสมาชิกเพื่อรับฟังและช่วยวาง Next Action'});await notifyOneToOneMentorAndMc(db,{feedbackId,pairId,memberId,memberName:String(member.name||''),nickname:String(member.nickname||''),mentorTeam:String(member.mentor_team||''),message:mentorMessage});}
    return response({ok:true,message:visibility==='shared'?'บันทึก Reflection และ Next Action แล้ว':'ส่งข้อความส่วนตัวถึง Mentor แล้ว อีกฝ่ายจะไม่เห็นข้อความนี้'});
  }

  if (action === 'bootstrap') {
    const [{ data: dashboard }, { data: goals }, { data: notif }] = await Promise.all([
      db.from('v_member_dashboard')
        .select('display_score, traffic_light, palms_detail, days_to_expiry, absent')
        .eq('id', memberId).maybeSingle(),
      db.from('line_goals').select('goal_type, target').eq('member_id', memberId),
      db.from('line_notif_settings').select('notif_type, is_muted').eq('member_id', memberId),
    ]);
    await trackLineEvent(db, 'liff_opened', {
      lineUserId: identity.userId,
      memberId,
      source: 'liff',
    });
    return response({
      ok: true,
      profile: identity.profile,
      member,
      dashboard,
      goals: goals || [],
      notifications: notif || [],
    });
  }

  if (action === 'absence') {
    const absenceType = String(body.absenceType || 'ลา');
    if (!['ลา', 'ส่ง sub'].includes(absenceType)) return response({ ok: false, error: 'ประเภทไม่ถูกต้อง' }, 400);
    const meetingDate = String(body.meetingDate || '');
    if (!meetingDate) return response({ ok: false, error: 'meetingDate required' }, 400);
    const detail = absenceType === 'ส่ง sub'
      ? String(body.subName || '').trim()
      : String(body.reason || '').trim();
    const { error } = await db.from('line_absence_log').insert({
      member_id: memberId,
      absence_type: absenceType,
      sub_name: absenceType === 'ส่ง sub' ? detail || null : null,
      reason: absenceType === 'ลา' ? detail || null : null,
      week_date: meetingDate,
    });
    if (error) return response({ ok: false, error: error.message }, 400);
    const noticeKey = await buildIdempotencyKey([memberId, meetingDate, absenceType, detail]);
    await notifyAbsenceStakeholders(db, {
      memberId,
      memberName: String(identity.member.name || ''),
      nickname: String(identity.member.nickname || identity.member.name || ''),
      mentorTeam: String(identity.member.mentor_team || ''),
      absenceType,
      detail,
      meetingDate,
      idempotencyKey: `liff:absence:${noticeKey}`,
      source: 'liff-api',
    });
    await trackLineEvent(db, 'liff_absence_submitted', {
      lineUserId: identity.userId, memberId, source: 'liff', properties: { absenceType },
    });
    return response({ ok: true, message: 'บันทึกการแจ้งแล้ว' });
  }

  if (action === 'issue') {
    const issueText = String(body.issueText || '').trim();
    if (issueText.length < 3) return response({ ok: false, error: 'กรุณาระบุรายละเอียดเพิ่มเติม' }, 400);
    const { data: issue, error } = await db.from('line_issues')
      .insert({ member_id: memberId, issue_text: issueText })
      .select('id')
      .single();
    if (error) return response({ ok: false, error: error.message }, 400);
    const issueId = String((issue as Record<string, unknown> | null)?.id || '');
    if (issueId) {
      await notifyIssueStakeholders(db, {
        issueId,
        memberId,
        memberName: String(identity.member.name || ''),
        nickname: String(identity.member.nickname || identity.member.name || ''),
        mentorTeam: String(identity.member.mentor_team || ''),
        issueText,
        idempotencyKey: `liff:issue:${issueId}`,
        source: 'liff-api',
      });
    }
    await trackLineEvent(db, 'liff_issue_submitted', {
      lineUserId: identity.userId, memberId, source: 'liff',
    });
    return response({ ok: true, message: 'ส่งเรื่องให้ทีม Mentor แล้ว' });
  }

  if (action === '121') {
    const partnerName = String(body.partnerName || '').trim();
    const meetingDate = String(body.meetingDate || '').trim();
    if (!partnerName || !meetingDate) return response({ ok: false, error: 'กรุณาระบุคู่ 1-2-1 และวันที่' }, 400);
    const { data: partner } = await db.from('members')
      .select('id, name').or(`name.ilike.%${partnerName}%,nickname.ilike.%${partnerName}%`)
      .eq('is_archived', false).limit(1).maybeSingle();
    if (!partner) return response({ ok: false, error: `ไม่พบ "${partnerName}"` }, 404);
    const { error } = await db.from('one_to_one_logs').insert({
      initiator_id: memberId,
      partner_id: String((partner as Record<string, unknown>).id),
      partner_name: String((partner as Record<string, unknown>).name),
      scheduled_date: meetingDate,
    });
    if (error) return response({ ok: false, error: error.message }, 400);
    await trackLineEvent(db, 'liff_121_scheduled', {
      lineUserId: identity.userId, memberId, source: 'liff',
    });
    return response({ ok: true, message: 'บันทึกนัด 1-2-1 แล้ว' });
  }

  if (action === 'goal') {
    const goalType = String(body.goalType || '').trim();
    const target = Number(body.target);
    if (!['ref', 'visitor', 'oto', 'ceu', 'tyfb'].includes(goalType) || !Number.isFinite(target) || target <= 0) {
      return response({ ok: false, error: 'เป้าหมายไม่ถูกต้อง' }, 400);
    }
    const { error } = await db.from('line_goals').upsert({
      member_id: memberId, goal_type: goalType, target, set_at: new Date().toISOString(),
    }, { onConflict: 'member_id,goal_type' });
    if (error) return response({ ok: false, error: error.message }, 400);
    await trackLineEvent(db, 'liff_goal_saved', {
      lineUserId: identity.userId, memberId, source: 'liff', properties: { goalType },
    });
    return response({ ok: true, message: 'บันทึกเป้าหมายแล้ว' });
  }

  if (action === 'renewal') {
    const { data: dash } = await db.from('v_member_dashboard')
      .select('days_to_expiry, display_score, traffic_light, name, nickname')
      .eq('id', memberId)
      .maybeSingle();
    const d = dash as Record<string, unknown> | null;
    const daysToExpiry = d?.days_to_expiry != null ? Number(d.days_to_expiry) : null;
    return response({
      ok: true,
      daysToExpiry,
      trafficLight: String(d?.traffic_light ?? 'red'),
      score: Number(d?.display_score ?? 0),
      renewalUrgent: daysToExpiry !== null && daysToExpiry <= 45,
    });
  }

  if (action === 'visitor') {
    const visitorName = String(body.visitorName || '').trim();
    const visitDate = String(body.visitDate || '').trim();
    const notes = body.notes ? String(body.notes).trim() : null;
    if (!visitorName) return response({ ok: false, error: 'visitorName required' }, 400);
    if (!visitDate) return response({ ok: false, error: 'visitDate required' }, 400);
    const { error } = await db.from('visitor_log').insert({
      visitor_name: visitorName,
      invited_by: memberId,
      visit_date: visitDate,
      notes,
      status: 'pending',
    });
    if (error) return response({ ok: false, error: error.message }, 400);
    await trackLineEvent(db, 'liff_visitor_logged', {
      lineUserId: identity.userId, memberId, source: 'liff',
    });
    return response({ ok: true, message: 'บันทึกแขกพิเศษแล้วครับ' });
  }

  if (action === 'get-assignments') {
    const memberTeam = String(member.mentor_team || '');
    const { data: assignments } = await db.from('mc_assignments')
      .select('id, assignment_text, due_date, mentor_team')
      .or(`member_id.eq.${memberId}${memberTeam ? `,mentor_team.eq.${memberTeam}` : ''}`)
      .is('acknowledged_at', null)
      .order('due_date', { ascending: true })
      .limit(10);
    return response({ ok: true, assignments: assignments || [] });
  }

  if (action === 'ack-assignment') {
    const assignmentId = String(body.assignmentId || '').trim();
    if (!assignmentId) return response({ ok: false, error: 'assignmentId required' }, 400);
    const memberTeam = String(member.mentor_team || '');
    const orFilter = memberTeam
      ? `member_id.eq.${memberId},mentor_team.eq.${memberTeam}`
      : `member_id.eq.${memberId}`;
    const { error } = await db.from('mc_assignments')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', assignmentId)
      .or(orFilter);
    if (error) return response({ ok: false, error: error.message }, 400);
    return response({ ok: true, message: 'รับทราบแล้วครับ' });
  }

  if (action === 'progress') {
    const [{ data: dash }, { data: goals }] = await Promise.all([
      db.from('v_member_dashboard')
        .select('palms_detail, rg, visitors, one_to_one, ceu, tyfcb_thb, absent, bni_days')
        .eq('id', memberId).maybeSingle(),
      db.from('line_goals').select('goal_type, target').eq('member_id', memberId),
    ]);
    const d = dash as Record<string, unknown> | null;
    const actuals = {
      referrals: Number(d?.rg ?? 0),
      visitors: Number(d?.visitors ?? 0),
      oneToOne: Number(d?.one_to_one ?? 0),
      ceu: Number(d?.ceu ?? 0),
      tyfbThb: Number(d?.tyfcb_thb ?? 0),
      absent: Number(d?.absent ?? 0),
      weeks: Math.min(26, Math.max(1, Math.floor(Number(d?.bni_days ?? 7) / 7))),
    };
    const goalMap: Record<string, number> = {};
    for (const g of (goals || []) as Record<string, unknown>[]) {
      goalMap[String(g.goal_type)] = Number(g.target);
    }
    const pd = (d?.palms_detail ?? {}) as Record<string, unknown>;
    const actionComponents = [
      { pts: Number(pd.referral ?? 0),  max: 15, hint: 'ส่ง Referral เพิ่ม 1 ใบ' },
      { pts: Number(pd.visitor  ?? 0),  max: 20, hint: 'พา Visitor มาอีก 1 คน' },
      { pts: Number(pd.oneToOne ?? 0),  max: 15, hint: 'นัด 1-2-1 อีก 1 ครั้ง' },
      { pts: Number(pd.ceu      ?? 0),  max: 20, hint: 'เข้า CEU เพิ่มอีก 1 ครั้ง' },
      { pts: Number(pd.tyfb     ?? 0),  max: 15, hint: 'ส่ง TYFCB ให้มากขึ้น' },
      { pts: Number(pd.absence  ?? 0),  max: 15, hint: 'รักษาการเข้าร่วมประชุม' },
    ];
    const top = actionComponents.reduce(
      (best, c) => (c.max - c.pts > best.max - best.pts ? c : best),
      actionComponents[0],
    );
    const topAction = top.max > top.pts ? { hint: top.hint, gain: top.max - top.pts } : null;
    return response({ ok: true, palmsDetail: d?.palms_detail ?? {}, actuals, goals: goalMap, topAction });
  }

  if (action === 'get-121-pending') {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const { data: pending } = await db.from('one_to_one_logs')
      .select('id, partner_name, scheduled_date, met_at')
      .eq('initiator_id', memberId)
      .is('met_at', null)
      .gte('scheduled_date', cutoff)
      .order('scheduled_date', { ascending: true })
      .limit(5);
    return response({ ok: true, pending: pending || [] });
  }

  if (action === 'confirm-121') {
    const logId = String(body.logId || '').trim();
    if (!logId) return response({ ok: false, error: 'logId required' }, 400);
    const { error } = await db.from('one_to_one_logs')
      .update({ met_at: new Date().toISOString() })
      .eq('id', logId)
      .eq('initiator_id', memberId);
    if (error) return response({ ok: false, error: error.message }, 400);
    await trackLineEvent(db, 'liff_121_confirmed', { lineUserId: identity.userId, memberId, source: 'liff' });
    return response({ ok: true, message: 'ยืนยัน 1-2-1 สำเร็จแล้ว ✓' });
  }

  if (action === 'get-issues') {
    const { data: issues } = await db.from('line_issues')
      .select('id, issue_text, reported_at, mentor_response, resolved_at')
      .eq('member_id', memberId)
      .order('reported_at', { ascending: false })
      .limit(5);
    return response({ ok: true, issues: issues || [] });
  }

  if (action === 'get-visitors') {
    const { data: visitors } = await db.from('visitor_log')
      .select('id, visitor_name, visit_date, status, notes')
      .eq('invited_by', memberId)
      .order('visit_date', { ascending: false })
      .limit(5);
    return response({ ok: true, visitors: visitors || [] });
  }

  return response({ ok: false, error: `ฟีเจอร์นี้ไม่มีแล้วครับ (${action})` });
});

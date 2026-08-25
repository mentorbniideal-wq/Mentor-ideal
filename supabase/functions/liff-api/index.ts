import { corsHeaders } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/db.ts';
import { trackLineEvent } from '../_shared/analytics.ts';
import { buildIdempotencyKey } from '../_shared/line.ts';
import { notifyAbsenceStakeholders } from '../_shared/line-absence-notify.ts';
import { notifyVisitorStakeholders } from '../_shared/line-visitor-notify.ts';
import { notifyIssueStakeholders } from '../_shared/line-issue-notify.ts';
import { notifyOneToOneMentorAndMc, notifyOneToOnePartner } from '../_shared/one-to-one-notify.ts';
import { generateHandshakeCode, handshakeCodeHash, oneToOneGoogleCalendarUrl, oneToOneIcs, pairStatusFromVerification, safeHashEqual } from '../_shared/one-to-one.ts';
import { GUIDED_MODES, canEditOwnedGuidedData, cleanGuidedText, normalizeGuidedContent, recommendedGuidedMode, validGuidedStep } from '../_shared/guided-one-to-one.ts';
import { canMemberUpdateFollowUp, evaluateOneToOneAccess, shouldCreateMentorNotification, validMemberFollowUpOutcome } from '../_shared/one-to-one-workflow.ts';
import { canAccessPairProfile, member121ProfileCompleteness, normalizeMember121Profile, publicMember121Profile } from '../_shared/member-121-profile.ts';
import { buildGoalCoach } from '../_shared/goal-coach.ts';
import { upsertMemberSignal } from '../_shared/member-signals.ts';

type Db = ReturnType<typeof getServiceClient>;

function randomUrlToken(byteLength = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

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

  const oneToOneActions = new Set([
    'one-to-one-bootstrap','get-my-121-profile','save-my-121-profile','get-pair-121-profile','save-pair-121-question','answer-pair-121-question','archive-pair-121-question','get-my-one-to-one-history','update-my-one-to-one-follow-up','toggle-remembered-trigger','guided-session-bootstrap','save-guided-session','save-guided-private-note',
    'save-guided-trigger','approve-guided-trigger','archive-guided-trigger','save-guided-profile-draft',
    'confirm-guided-profile-draft','submit-guided-experience-feedback','complete-guided-session',
    'propose-one-to-one-schedule','propose-one-to-one-schedule-options','confirm-one-to-one-schedule',
    'cancel-one-to-one-schedule','reschedule-one-to-one','get-one-to-one-calendar',
    'start-one-to-one-verification','submit-one-to-one-code','submit-one-to-one-reflection','request-one-to-one-help',
  ]);
  if (oneToOneActions.has(action)) {
    const { data: controls } = await db.from('settings').select('key,value').in('key', [
      'FEATURE_ONE_TO_ONE_SYSTEM','ONE_TO_ONE_EMERGENCY_STOP','ONE_TO_ONE_PILOT_MEMBER_IDS','ONE_TO_ONE_ENFORCE_PILOT_ACCESS',
    ]);
    const control = new Map(((controls || []) as Record<string, unknown>[]).map(row => [String(row.key), String(row.value)]));
    let pilotIds: string[] = [];
    try { pilotIds = JSON.parse(control.get('ONE_TO_ONE_PILOT_MEMBER_IDS') || '[]'); } catch { pilotIds = []; }
    const access=evaluateOneToOneAccess({featureEnabled:control.get('FEATURE_ONE_TO_ONE_SYSTEM')==='true',emergencyStop:control.get('ONE_TO_ONE_EMERGENCY_STOP')==='true',enforcePilotAccess:control.get('ONE_TO_ONE_ENFORCE_PILOT_ACCESS')==='true',pilotIds},memberId,new Set(['one-to-one-bootstrap','get-my-121-profile','get-pair-121-profile','get-my-one-to-one-history','guided-session-bootstrap','get-one-to-one-calendar']).has(action));
    if (!access.allowed&&access.reason==='pilot_only') {
      return response({ ok: false, error: 'ระบบ 1-2-1 อยู่ในช่วงทดลองสำหรับสมาชิกที่ได้รับเลือก กรุณาติดต่อ MC' }, 403);
    }
    if (!access.allowed&&access.reason==='emergency_stop') {
      return response({ ok: false, error: 'ระบบหยุดการบันทึกชั่วคราวเพื่อดูแลข้อมูล คุณยังเปิดดูคู่และประวัติได้' }, 503);
    }
  }

  async function ownPair(pairId?:string){
    let query=db.from('matching_pairs').select('id,round_id,member_a_id,member_b_id,status,matching_rounds!inner(meeting_date,starts_at,ends_at,system_version)').or(`member_a_id.eq.${memberId},member_b_id.eq.${memberId}`).is('archived_at',null);
    if(pairId)query=query.eq('id',pairId);else query=query.eq('matching_rounds.system_version',2).order('created_at',{ascending:false}).limit(1);
    const {data,error}=await query.maybeSingle();return{pair:data as Record<string,unknown>|null,error};
  }

  async function ownGuidedSession(sessionId:string){
    const {data:session}=await db.from('guided_one_to_one_sessions').select('*').eq('id',sessionId).is('archived_at',null).maybeSingle();
    if(!session)return {session:null,pair:null};
    const {pair}=await ownPair(String((session as Record<string,unknown>).pair_id));
    return {session:pair?session as Record<string,unknown>:null,pair};
  }

  if(action==='training-calendar'){
    const from=new Date().toISOString().slice(0,10),until=new Date(Date.now()+180*86400000).toISOString().slice(0,10);
    const {data,error}=await db.from('bni_events')
      .select('id,event_no,name,event_date,time_start,time_end,ceu,category,audience,is_online,location,price_thb,note_th,venue_region')
      .gte('event_date',from).lte('event_date',until).order('event_date',{ascending:true}).limit(100);
    if(error)return response({ok:false,error:'โหลดปฏิทิน CEU ไม่สำเร็จ'},500);
    const events=((data||[]) as Record<string,unknown>[]).filter(row=>Number(row.ceu||0)>0||/ceu|training|msp|skill/i.test(`${row.category||''} ${row.name||''}`)).map(row=>({
      id:String(row.id||''),eventNo:String(row.event_no||''),name:String(row.name||'CEU Training'),eventDate:String(row.event_date||''),
      timeStart:String(row.time_start||'').slice(0,5),timeEnd:String(row.time_end||'').slice(0,5),ceu:Number(row.ceu||0),
      category:String(row.category||''),audience:String(row.audience||''),isOnline:Boolean(row.is_online),
      location:String(row.location||''),priceThb:Number(row.price_thb||0),note:String(row.note_th||''),venueRegion:String(row.venue_region||''),
    }));
    return response({ok:true,events});
  }

  if(action==='get-my-121-profile'){
    const [{data:person},{data:business},{data:profile}]=await Promise.all([
      db.from('members').select('id,name,nickname,profession,company_name,mentor_team').eq('id',memberId).maybeSingle(),
      db.from('biz_profiles').select('description,looking_for,ideal_client,referral_trigger_summary,updated_at').eq('member_id',memberId).maybeSingle(),
      db.from('member_one_to_one_profiles').select('*').eq('member_id',memberId).maybeSingle(),
    ]);
    return response({ok:true,member:person,profile:profile||null,business:business||null,completeness:member121ProfileCompleteness(profile as Record<string,unknown>|null),privacyNotice:'คุณเป็นเจ้าของข้อมูลและแก้ไขได้ตลอดเวลา คู่ 1-2-1 จะเห็นเฉพาะหัวข้อที่คุณเปิดให้เห็น'});
  }

  if(action==='save-my-121-profile'){
    const normalized=normalizeMember121Profile(body.profile),src=(body.profile&&typeof body.profile==='object'?body.profile:{}) as Record<string,unknown>,profession=cleanGuidedText(src.profession,200),companyName=cleanGuidedText(src.company_name,200);
    const {data:existing}=await db.from('member_one_to_one_profiles').select('profile_version').eq('member_id',memberId).maybeSingle();const version=Number((existing as Record<string,unknown>|null)?.profile_version||0)+1,now=new Date().toISOString();
    const payload={...normalized,member_id:memberId,profile_version:version,published_at:now,actor_member_id:memberId,updated_at:now};const {data,error}=await db.from('member_one_to_one_profiles').upsert(payload,{onConflict:'member_id'}).select('*').single();if(error)return response({ok:false,error:'บันทึกโปรไฟล์ 1-2-1 ไม่สำเร็จ กรุณาลองใหม่'},400);
    if(profession||companyName){const changes:Record<string,unknown>={updated_at:now};if(profession)changes.profession=profession;if(companyName)changes.company_name=companyName;await db.from('members').update(changes).eq('id',memberId);}
    const {data:oldBusiness}=await db.from('biz_profiles').select('description,looking_for,ideal_client,referral_trigger_summary').eq('member_id',memberId).maybeSingle();const oldBiz=(oldBusiness||{}) as Record<string,unknown>,description=String(normalized.business_summary||oldBiz.description||profession||companyName||'ข้อมูลธุรกิจสมาชิก');
    await db.from('biz_profiles').upsert({member_id:memberId,description,looking_for:normalized.looking_for||oldBiz.looking_for||null,ideal_client:normalized.ideal_client||oldBiz.ideal_client||null,referral_trigger_summary:normalized.referral_trigger||oldBiz.referral_trigger_summary||null,updated_at:now},{onConflict:'member_id'});
    await db.from('one_to_one_status_events').insert({member_id:memberId,event_type:'member_121_profile_updated',actor_type:'member',actor_ref:memberId,idempotency_key:`member-121-profile:${memberId}:${version}`,metadata:{profileVersion:version,completeness:member121ProfileCompleteness(data as Record<string,unknown>)}});
    return response({ok:true,profile:data,completeness:member121ProfileCompleteness(data as Record<string,unknown>),message:'บันทึกโปรไฟล์ 1-2-1 ของคุณแล้ว'});
  }

  if(action==='get-pair-121-profile'){
    const pairId=cleanGuidedText(body.pairId,100),{pair}=await ownPair(pairId);if(!pair)return response({ok:false,error:'ไม่พบคู่ 1-2-1 หรือคุณไม่มีสิทธิ์ดูโปรไฟล์นี้'},403);const subjectId=String(pair.member_a_id)===memberId?String(pair.member_b_id):String(pair.member_a_id);
    const [{data:person},{data:profile},{data:business},{data:questions}]=await Promise.all([
      db.from('members').select('id,name,nickname,profession,company_name,mentor_team').eq('id',subjectId).maybeSingle(),
      db.from('member_one_to_one_profiles').select('*').eq('member_id',subjectId).maybeSingle(),
      db.from('biz_profiles').select('description,looking_for,ideal_client,referral_trigger_summary').eq('member_id',subjectId).maybeSingle(),
      db.from('one_to_one_premeeting_questions').select('id,pair_id,asked_by_member_id,for_member_id,question_text,answer_text,status,created_at,updated_at').eq('pair_id',pairId).is('archived_at',null).order('created_at'),
    ]);if(!canAccessPairProfile(memberId,pair,subjectId))return response({ok:false,error:'คุณไม่มีสิทธิ์ดูโปรไฟล์นี้'},403);
    return response({ok:true,pairId,memberId,partner:person,profile:publicMember121Profile(profile as Record<string,unknown>|null),fallbackBusiness:business||null,completeness:member121ProfileCompleteness(profile as Record<string,unknown>|null),questions:questions||[],privacyNotice:'ข้อมูลนี้ใช้เตรียมการพูดคุยกับคู่ของคุณเท่านั้น กรุณาไม่ส่งต่อโดยไม่ได้รับอนุญาต'});
  }

  if(action==='save-pair-121-question'){
    const pairId=cleanGuidedText(body.pairId,100),{pair}=await ownPair(pairId);if(!pair)return response({ok:false,error:'ไม่พบคู่ 1-2-1 หรือคุณไม่มีสิทธิ์ตั้งคำถาม'},403);const forMemberId=String(pair.member_a_id)===memberId?String(pair.member_b_id):String(pair.member_a_id),question=cleanGuidedText(body.question,1000),clientActionId=cleanGuidedText(body.clientActionId,120)||null;if(!question)return response({ok:false,error:'กรุณาเขียนคำถามก่อนบันทึก'},400);
    if(clientActionId){const {data:existing}=await db.from('one_to_one_premeeting_questions').select('id,pair_id,asked_by_member_id,for_member_id,question_text,answer_text,status,created_at,updated_at').eq('pair_id',pairId).eq('asked_by_member_id',memberId).eq('client_action_id',clientActionId).maybeSingle();if(existing)return response({ok:true,question:existing,idempotent:true,message:'เก็บคำถามไว้สำหรับวัน 1-2-1 แล้ว'});}
    const {count}=await db.from('one_to_one_premeeting_questions').select('id',{count:'exact',head:true}).eq('pair_id',pairId).eq('asked_by_member_id',memberId).is('archived_at',null);if(Number(count||0)>=10)return response({ok:false,error:'เก็บคำถามล่วงหน้าได้สูงสุด 10 ข้อต่อคู่ กรุณานำคำถามที่ไม่ใช้แล้วออกก่อน'},429);
    const payload={pair_id:pairId,asked_by_member_id:memberId,for_member_id:forMemberId,question_text:question,client_action_id:clientActionId,updated_at:new Date().toISOString()};const write=clientActionId?db.from('one_to_one_premeeting_questions').upsert(payload,{onConflict:'client_action_id'}):db.from('one_to_one_premeeting_questions').insert(payload);const {data,error}=await write.select('id,pair_id,asked_by_member_id,for_member_id,question_text,answer_text,status,created_at,updated_at').single();if(error)return response({ok:false,error:'บันทึกคำถามล่วงหน้าไม่สำเร็จ'},400);await db.from('one_to_one_status_events').insert({pair_id:pairId,member_id:memberId,event_type:'premeeting_question_created',actor_type:'member',actor_ref:memberId,idempotency_key:clientActionId?`premeeting-question:${clientActionId}`:null,metadata:{questionId:String((data as Record<string,unknown>).id),forMemberId}});return response({ok:true,question:data,message:'เก็บคำถามไว้สำหรับวัน 1-2-1 แล้ว'});
  }

  if(action==='answer-pair-121-question'){
    const questionId=cleanGuidedText(body.questionId,100),answer=cleanGuidedText(body.answer,1500);if(!answer)return response({ok:false,error:'กรุณาเขียนคำตอบก่อนบันทึก'},400);const {data:item}=await db.from('one_to_one_premeeting_questions').select('id,pair_id,for_member_id').eq('id',questionId).is('archived_at',null).maybeSingle();if(!item||String((item as Record<string,unknown>).for_member_id)!==memberId)return response({ok:false,error:'คำถามนี้ไม่ได้ส่งถึงคุณ'},403);const pairId=String((item as Record<string,unknown>).pair_id),{pair}=await ownPair(pairId);if(!pair)return response({ok:false,error:'คุณไม่มีสิทธิ์ตอบคำถามนี้'},403);const now=new Date().toISOString(),{data,error}=await db.from('one_to_one_premeeting_questions').update({answer_text:answer,status:'answered',answered_at:now,updated_at:now}).eq('id',questionId).select('id,pair_id,asked_by_member_id,for_member_id,question_text,answer_text,status,created_at,updated_at').single();if(!error)await db.from('one_to_one_status_events').insert({pair_id:pairId,member_id:memberId,event_type:'premeeting_question_answered',actor_type:'member',actor_ref:memberId,metadata:{questionId}});return error?response({ok:false,error:'บันทึกคำตอบไม่สำเร็จ'},400):response({ok:true,question:data,message:'บันทึกคำตอบแล้ว'});
  }

  if(action==='archive-pair-121-question'){
    const questionId=cleanGuidedText(body.questionId,100),{data:item}=await db.from('one_to_one_premeeting_questions').select('id,pair_id,asked_by_member_id').eq('id',questionId).is('archived_at',null).maybeSingle();if(!item||String((item as Record<string,unknown>).asked_by_member_id)!==memberId)return response({ok:false,error:'คุณนำออกได้เฉพาะคำถามที่ตนเองเขียน'},403);const {pair}=await ownPair(String((item as Record<string,unknown>).pair_id));if(!pair)return response({ok:false,error:'คุณไม่มีสิทธิ์นำคำถามนี้ออก'},403);const now=new Date().toISOString();await db.from('one_to_one_premeeting_questions').update({status:'archived',archived_at:now,updated_at:now}).eq('id',questionId);return response({ok:true,message:'นำคำถามออกแล้ว'});
  }

  if(action==='one-to-one-bootstrap'){
    const {pair,error}=await ownPair();if(error)return response({ok:false,error:error.message},400);if(!pair)return response({ok:true,pair:null});
    const partnerId=String(pair.member_a_id)===memberId?String(pair.member_b_id):String(pair.member_a_id);
    const [{data:partner},{data:schedules},{data:followUps},{data:history},{data:lookingFor},{data:businessProfile},{data:legacyLogs},{data:guidedHistory},{data:myProfile}]=await Promise.all([
      db.from('members').select('id,name,nickname,profession,company_name,mentor_team').eq('id',partnerId).maybeSingle(),
      db.from('one_to_one_schedules').select('*').eq('pair_id',String(pair.id)).in('status',['proposed','confirmed']).order('created_at',{ascending:false}).limit(3),
      db.from('one_to_one_follow_up_actions').select('*').eq('pair_id',String(pair.id)).eq('owner_member_id',memberId).order('created_at',{ascending:false}),
      db.from('matching_pairs').select('id,status,created_at,member_a_id,member_b_id,matching_rounds(meeting_date)').or(`member_a_id.eq.${memberId},member_b_id.eq.${memberId}`).order('created_at',{ascending:false}).limit(20),
      db.from('matching_import_rows').select('looking_for').eq('round_id',String(pair.round_id)).eq('matched_member_id',partnerId).limit(1).maybeSingle(),
      db.from('biz_profiles').select('looking_for,ideal_client,referral_trigger_summary').eq('member_id',partnerId).maybeSingle(),
      db.from('one_to_one_logs').select('id,met_at,scheduled_date').or(`initiator_id.eq.${memberId},partner_id.eq.${memberId}`).order('created_at',{ascending:false}).limit(200),
      db.from('guided_one_to_one_sessions').select('id,pair_id,session_mode,status,completed_at,duration_seconds,shared_content').eq('pair_id',String(pair.id)).is('archived_at',null).maybeSingle(),
      db.from('member_one_to_one_profiles').select('*').eq('member_id',memberId).maybeSingle(),
    ]);
    const scheduleRows=(schedules||[]) as Record<string,unknown>[],schedule=scheduleRows.find(x=>x.status==='confirmed')||scheduleRows[0]||null;
    const newHistory=(history||[]) as Record<string,unknown>[],legacy=(legacyLogs||[]) as Record<string,unknown>[];
    return response({ok:true,pair,partner,schedule,scheduleOptions:scheduleRows,followUps:followUps||[],guidedHistory:guidedHistory||null,myProfileCompleteness:member121ProfileCompleteness(myProfile as Record<string,unknown>|null),journey:{total:newHistory.length+legacy.length,completed:newHistory.filter(x=>['verified','late_verified'].includes(String(x.status))).length+legacy.filter(x=>x.met_at).length,newSystemTotal:newHistory.length,legacyTotal:legacy.length,recent:newHistory},referralCard:{lookingFor:String((lookingFor as Record<string,unknown>|null)?.looking_for||(businessProfile as Record<string,unknown>|null)?.looking_for||''),idealClient:String((businessProfile as Record<string,unknown>|null)?.ideal_client||''),referralTrigger:String((businessProfile as Record<string,unknown>|null)?.referral_trigger_summary||''),profession:String((partner as Record<string,unknown>|null)?.profession||''),companyName:String((partner as Record<string,unknown>|null)?.company_name||'')},privacyNotice:'Shared Reflection เห็นได้โดยคุณ คู่สนทนา และ Mentor ที่มีสิทธิ์ ส่วน Private Mentor Feedback จะไม่แสดงให้อีกฝ่ายเห็น'});
  }

  if(action==='request-one-to-one-help'){
    const pairId=cleanGuidedText(body.pairId,100),reason=cleanGuidedText(body.reason,40),detail=cleanGuidedText(body.detail,1200),clientActionId=cleanGuidedText(body.clientActionId,120);const {pair}=await ownPair(pairId);if(!pair)return response({ok:false,error:'ไม่พบคู่ 1-2-1 หรือคุณไม่มีสิทธิ์ส่งเรื่องนี้'},403);
    const labels:Record<string,string>={contact:'ติดต่อคู่ไม่ได้',reschedule:'ต้องการเปลี่ยนวันหรือเวลา',no_response:'คู่ยังไม่ตอบกลับ',verification:'รหัสรับรองหายหรือใช้งานไม่ได้',mentor:'อยากคุยกับ Mentor',other:'เรื่องอื่น ๆ'},reasonText=labels[reason]||labels.other,message=detail?`${reasonText}: ${detail}`:reasonText,now=new Date().toISOString();
    if(clientActionId){const {data:existing}=await db.from('one_to_one_attention_items').select('id').eq('idempotency_key',`member-help:${clientActionId}`).maybeSingle();if(existing)return response({ok:true,idempotent:true,message:'รับเรื่องไว้แล้ว Mentor หรือ MC จะตรวจสอบและติดต่อกลับ'});}
    const {data,error}=await db.from('one_to_one_attention_items').insert({member_id:memberId,pair_id:pairId,level:'mentor_review_required',reason:`สมาชิกขอความช่วยเหลือ: ${message.length>240?message.slice(0,237)+'...':message}`,evidence:[{reason,detail}],positive_context:['สมาชิกเป็นผู้แจ้งปัญหาด้วยตนเอง'],suggested_action:'ตรวจสอบสถานะคู่และติดต่อสมาชิกเพื่อช่วยดำเนินการต่อ',status:'open',idempotency_key:clientActionId?`member-help:${clientActionId}`:null,updated_at:now}).select('id').single();if(error)return response({ok:false,error:'ส่งเรื่องไม่สำเร็จ กรุณาลองอีกครั้ง'},400);
    const attentionId=String((data as Record<string,unknown>).id);await db.from('one_to_one_status_events').insert({round_id:String(pair.round_id),pair_id:pairId,member_id:memberId,event_type:'member_requested_help',actor_type:'member',actor_ref:memberId,idempotency_key:clientActionId?`member-help-event:${clientActionId}`:null,metadata:{attentionId,reason}});await notifyOneToOneMentorAndMc(db,{feedbackId:`help-${attentionId}`,pairId,memberId,memberName:String(member.name||''),nickname:String(member.nickname||''),mentorTeam:String(member.mentor_team||''),message});return response({ok:true,message:'รับเรื่องแล้ว Mentor หรือ MC จะตรวจสอบและติดต่อกลับ'});
  }

  if(action==='get-my-one-to-one-history'){
    const {data:pairs,error:pairError}=await db.from('matching_pairs').select('id,round_id,status,member_a_id,member_b_id,optional_member_c_id,created_at,round:matching_rounds(meeting_date,system_version),schedules:one_to_one_schedules(id,starts_at,status,meeting_mode,location_or_link)').or(`member_a_id.eq.${memberId},member_b_id.eq.${memberId},optional_member_c_id.eq.${memberId}`).is('archived_at',null).order('created_at',{ascending:false}).limit(100);
    if(pairError)return response({ok:false,error:'ยังเปิดประวัติ 1-2-1 ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'},400);
    const pairRows=(pairs||[]) as Record<string,unknown>[],pairIds=pairRows.map(x=>String(x.id));
    const partnerIds=[...new Set(pairRows.flatMap(x=>[x.member_a_id,x.member_b_id,x.optional_member_c_id].filter(Boolean).map(String)).filter(id=>id!==memberId))];
    const [{data:partners},{data:businessProfiles},{data:feedback},{data:followUps},{data:guidedSessions},{data:legacy}]=await Promise.all([
      partnerIds.length?db.from('members').select('id,name,nickname,profession,company_name,mentor_team,is_archived').in('id',partnerIds):Promise.resolve({data:[]}),
      partnerIds.length?db.from('biz_profiles').select('member_id,looking_for,ideal_client,referral_trigger_summary').in('member_id',partnerIds):Promise.resolve({data:[]}),
      pairIds.length?db.from('one_to_one_feedback').select('id,pair_id,respondent_member_id,about_member_id,learned,outcomes,next_action_type,next_action_detail,created_at').in('pair_id',pairIds).eq('visibility','shared').is('archived_at',null).order('created_at',{ascending:false}):Promise.resolve({data:[]}),
      pairIds.length?db.from('one_to_one_follow_up_actions').select('id,pair_id,action_type,description,owner_member_id,related_member_id,due_date,status,completed_at,outcome').in('pair_id',pairIds).or(`owner_member_id.eq.${memberId},related_member_id.eq.${memberId}`).order('created_at',{ascending:false}):Promise.resolve({data:[]}),
      pairIds.length?db.from('guided_one_to_one_sessions').select('id,pair_id,session_mode,status,duration_seconds,completed_at,updated_at,shared_content').in('pair_id',pairIds).is('archived_at',null):Promise.resolve({data:[]}),
      db.from('one_to_one_logs').select('id,initiator_id,partner_id,partner_name,notes,outcome,met_at,scheduled_date,created_at,initiator:members!one_to_one_logs_initiator_id_fkey(id,name,nickname,profession,company_name),partner:members!one_to_one_logs_partner_id_fkey(id,name,nickname,profession,company_name)').or(`initiator_id.eq.${memberId},partner_id.eq.${memberId}`).order('created_at',{ascending:false}).limit(100),
    ]);
    const guidedRows=((guidedSessions||[]) as Record<string,unknown>[]).map((g):Record<string,unknown>=>({...g,shared_content:normalizeGuidedContent(g.shared_content)}));
    const sessionIds=guidedRows.map(x=>String(x.id));
    const [{data:triggers},{data:bookmarks}]=await Promise.all([
      sessionIds.length?db.from('guided_referral_triggers').select('id,session_id,owner_member_id,trigger_text,context,priority').in('session_id',sessionIds).eq('owner_approved',true).eq('is_active',true).is('archived_at',null).order('priority',{ascending:false}):Promise.resolve({data:[]}),
      db.from('member_referral_trigger_bookmarks').select('trigger_id').eq('member_id',memberId),
    ]);
    const businessMap=new Map(((businessProfiles||[]) as Record<string,unknown>[]).map(x=>[String(x.member_id),x]));
    const partnerMap=new Map(((partners||[]) as Record<string,unknown>[]).map(x=>[String(x.id),{...x,businessProfile:businessMap.get(String(x.id))||null}]));
    const feedbackRows=(feedback||[]) as Record<string,unknown>[],followRows=(followUps||[]) as Record<string,unknown>[],triggerRows=(triggers||[]) as Record<string,unknown>[];
    const history=pairRows.map(pair=>{
      const otherIds=[pair.member_a_id,pair.member_b_id,pair.optional_member_c_id].filter(Boolean).map(String).filter(id=>id!==memberId),round=(pair.round||{}) as Record<string,unknown>,schedules=(pair.schedules||[]) as Record<string,unknown>[],guided=guidedRows.find(x=>String(x.pair_id)===String(pair.id))||null;
      return{id:String(pair.id),meetingDate:String(round.meeting_date||''),status:String(pair.status||'matched'),partners:otherIds.map(id=>partnerMap.get(id)||{id,name:'สมาชิกเดิม'}),schedule:schedules.sort((a,b)=>String(b.starts_at).localeCompare(String(a.starts_at)))[0]||null,sharedFeedback:feedbackRows.filter(x=>String(x.pair_id)===String(pair.id)),followUps:followRows.filter(x=>String(x.pair_id)===String(pair.id)),guidedSession:guided?{...guided,referralTriggers:triggerRows.filter(t=>String(t.session_id)===String(guided.id))}:null};
    });
    const verified=history.filter(x=>['verified','late_verified'].includes(x.status)).length,pendingActions=followRows.filter(x=>['pending','in_progress','overdue'].includes(String(x.status))).length;
    const safeLegacy=((legacy||[]) as Record<string,unknown>[]).map(row=>{const other=String(row.initiator_id)===memberId?row.partner:row.initiator;return{id:row.id,partnerName:((other||{}) as Record<string,unknown>).nickname||((other||{}) as Record<string,unknown>).name||row.partner_name||'สมาชิก',profession:((other||{}) as Record<string,unknown>).profession||((other||{}) as Record<string,unknown>).company_name||'',notes:row.notes,outcome:row.outcome,metAt:row.met_at,scheduledDate:row.scheduled_date,createdAt:row.created_at};});
    return response({ok:true,memberId,stats:{total:history.length+safeLegacy.length,paired:history.length,verified,pendingActions},history,legacy:safeLegacy,rememberedTriggerIds:((bookmarks||[]) as Record<string,unknown>[]).map(x=>String(x.trigger_id)),privacyNotice:'แสดงเฉพาะข้อมูลที่บันทึกร่วมกันและงานที่เกี่ยวข้องกับคุณ ไม่แสดงบันทึกส่วนตัวหรือข้อความส่วนตัวถึง Mentor'});
  }

  if(action==='update-my-one-to-one-follow-up'){
    const followUpId=cleanGuidedText(body.followUpId,100),status=cleanGuidedText(body.status,30),allowedStatuses=new Set(['pending','in_progress','completed','cancelled']);
    if(!followUpId||!allowedStatuses.has(status))return response({ok:false,error:'สถานะรายการติดตามไม่ถูกต้อง'},400);
    const {data:item}=await db.from('one_to_one_follow_up_actions').select('id,pair_id,owner_member_id,status').eq('id',followUpId).maybeSingle();
    if(!item||!canMemberUpdateFollowUp(memberId,String((item as Record<string,unknown>).owner_member_id)))return response({ok:false,error:'คุณจัดการได้เฉพาะสิ่งที่คุณรับผิดชอบ'},403);
    const outcome=cleanGuidedText(body.outcome,40);if(!validMemberFollowUpOutcome(outcome))return response({ok:false,error:'ผลลัพธ์ที่เลือกไม่ถูกต้อง'},400);
    const stageMap:Record<string,string>={introduced:'introduction_sent',information_sent:'connection_identified'},outcomeStage=stageMap[outcome]||outcome,dueDate=cleanGuidedText(body.dueDate,10),now=new Date().toISOString(),consentStages=new Set(['introduction_sent','meeting_booked','referral_created']);const changes:Record<string,unknown>={status,outcome:outcome||null,outcome_stage:outcomeStage||null,outcome_updated_by:memberId,consent_confirmed_at:consentStages.has(outcomeStage)?now:null,updated_at:now,completed_at:status==='completed'?now:null};if(dueDate)changes.due_date=dueDate;
    const {data,error}=await db.from('one_to_one_follow_up_actions').update(changes).eq('id',followUpId).eq('owner_member_id',memberId).select('id,pair_id,action_type,description,owner_member_id,related_member_id,due_date,status,completed_at,outcome,outcome_stage').single();
    if(error)return response({ok:false,error:'บันทึกสิ่งที่ทำต่อไม่สำเร็จ กรุณาลองใหม่'},400);
    await db.from('one_to_one_status_events').insert({pair_id:String((item as Record<string,unknown>).pair_id),member_id:memberId,event_type:'member_follow_up_updated',actor_type:'member',actor_ref:memberId,metadata:{followUpId,status,outcome:outcome||null}});
    return response({ok:true,followUp:data,message:status==='completed'?'บันทึกว่าสำเร็จแล้ว':'อัปเดตรายการแล้ว'});
  }

  if(action==='toggle-remembered-trigger'){
    const triggerId=cleanGuidedText(body.triggerId,100),remember=body.remember!==false;if(!triggerId)return response({ok:false,error:'ไม่พบ Referral Trigger'},400);
    const {data:trigger}=await db.from('guided_referral_triggers').select('id,session_id,owner_approved,is_active,archived_at').eq('id',triggerId).maybeSingle();
    if(!trigger||!Boolean((trigger as Record<string,unknown>).owner_approved)||!Boolean((trigger as Record<string,unknown>).is_active)||(trigger as Record<string,unknown>).archived_at)return response({ok:false,error:'Trigger นี้ยังไม่พร้อมให้จดจำ'},403);
    const {data:session}=await db.from('guided_one_to_one_sessions').select('pair_id').eq('id',String((trigger as Record<string,unknown>).session_id)).is('archived_at',null).maybeSingle();const {pair}=session?await ownPair(String((session as Record<string,unknown>).pair_id)):{pair:null};if(!pair)return response({ok:false,error:'คุณจดจำได้เฉพาะ Trigger จากคู่ 1-2-1 ของคุณ'},403);
    const write=remember?db.from('member_referral_trigger_bookmarks').upsert({member_id:memberId,trigger_id:triggerId,updated_at:new Date().toISOString()},{onConflict:'member_id,trigger_id'}):db.from('member_referral_trigger_bookmarks').delete().eq('member_id',memberId).eq('trigger_id',triggerId);const {error}=await write;if(error)return response({ok:false,error:'ยังบันทึกรายการที่อยากจำไม่สำเร็จ'},400);
    await db.from('one_to_one_status_events').insert({pair_id:String(pair.id),member_id:memberId,event_type:remember?'referral_trigger_remembered':'referral_trigger_forgotten',actor_type:'member',actor_ref:memberId,metadata:{triggerId}});
    return response({ok:true,remembered:remember,message:remember?'เก็บไว้ในรายการที่อยากจำแล้ว':'นำออกจากรายการที่อยากจำแล้ว'});
  }

  if(action==='guided-session-bootstrap'){
    const pairId=String(body.pairId||'');const {pair}=await ownPair(pairId);if(!pair)return response({ok:false,error:'ไม่พบคู่ 1-2-1 หรือคุณไม่มีสิทธิ์เปิด Session นี้'},403);
    const aId=String(pair.member_a_id),bId=String(pair.member_b_id),partnerId=aId===memberId?bId:aId;
    const [{data:people},{data:priorPairs},{data:currentLooking},{data:canonicalLooking},{data:schedule}]=await Promise.all([
      db.from('members').select('id,name,nickname,profession,company_name,mentor_team').in('id',[aId,bId]),
      db.from('matching_pairs').select('id,status,member_a_id,member_b_id,created_at').or(`and(member_a_id.eq.${aId},member_b_id.eq.${bId}),and(member_a_id.eq.${bId},member_b_id.eq.${aId})`).neq('id',pairId).order('created_at',{ascending:false}).limit(10),
      db.from('matching_import_rows').select('matched_member_id,looking_for').eq('round_id',String(pair.round_id)).in('matched_member_id',[aId,bId]),
      db.from('biz_profiles').select('member_id,looking_for').in('member_id',[aId,bId]),
      db.from('one_to_one_schedules').select('*').eq('pair_id',pairId).eq('status','confirmed').order('created_at',{ascending:false}).limit(1).maybeSingle(),
    ]);
    const completed=((priorPairs||[]) as Record<string,unknown>[]).filter(x=>['verified','late_verified'].includes(String(x.status))).length;
    let {data:session}=await db.from('guided_one_to_one_sessions').select('*').eq('pair_id',pairId).is('archived_at',null).maybeSingle();
    if(!session){
      const mode=recommendedGuidedMode(completed);const {data:created,error}=await db.from('guided_one_to_one_sessions').insert({pair_id:pairId,round_id:String(pair.round_id),session_mode:mode,current_speaker_member_id:aId,created_by_member_id:memberId,updated_by_member_id:memberId}).select('*').maybeSingle();
      if(error&&!String(error.code).includes('23505'))return response({ok:false,error:'ยังสร้าง Guided Session ไม่สำเร็จ กรุณาลองอีกครั้ง'},400);
      session=created;if(!session)({data:session}=await db.from('guided_one_to_one_sessions').select('*').eq('pair_id',pairId).maybeSingle());
    }
    const sessionId=String((session as Record<string,unknown>).id);
    const [{data:privateNote},{data:triggers},{data:drafts},{data:previousGuided},{data:followUps},{data:detailedProfiles},{data:preQuestions}]=await Promise.all([
      db.from('guided_session_private_notes').select('note_text,version,updated_at').eq('session_id',sessionId).eq('member_id',memberId).is('archived_at',null).maybeSingle(),
      db.from('guided_referral_triggers').select('*').eq('session_id',sessionId).is('archived_at',null).order('created_at'),
      db.from('guided_member_profile_drafts').select('*').eq('session_id',sessionId).in('owner_member_id',[aId,bId]),
      completed?db.from('guided_one_to_one_sessions').select('id,session_mode,completed_at,shared_content,duration_seconds,pair_id').in('pair_id',((priorPairs||[]) as Record<string,unknown>[]).map(x=>String(x.id))).eq('status','completed').order('completed_at',{ascending:false}).limit(1).maybeSingle():Promise.resolve({data:null}),
      db.from('one_to_one_follow_up_actions').select('*').or(`owner_member_id.eq.${memberId},related_member_id.eq.${memberId}`).eq('status','pending').order('due_date').limit(10),
      db.from('member_one_to_one_profiles').select('*').in('member_id',[aId,bId]),
      db.from('one_to_one_premeeting_questions').select('id,pair_id,asked_by_member_id,for_member_id,question_text,answer_text,status,created_at,updated_at').eq('pair_id',pairId).is('archived_at',null).order('created_at'),
    ]);
    const profileRows=(detailedProfiles||[]) as Record<string,unknown>[],sharedProfiles=Object.fromEntries([aId,bId].map(id=>{const row=profileRows.find(x=>String(x.member_id)===id)||null;return[id,publicMember121Profile(row)];}));
    if(String((session as Record<string,unknown>).status)==='draft'&&!(session as Record<string,unknown>).started_at){for(const id of [aId,bId]){const row=profileRows.find(x=>String(x.member_id)===id)||null;if(row)await db.from('one_to_one_profile_snapshots').upsert({pair_id:pairId,member_id:id,profile_version:Number(row.profile_version||1),profile_data:publicMember121Profile(row)||{},captured_at:new Date().toISOString()},{onConflict:'pair_id,member_id'});}}
    const looking=Object.fromEntries(((canonicalLooking||[]) as Record<string,unknown>[]).map(x=>[String(x.member_id),String(x.looking_for||'')]));for(const row of (currentLooking||[]) as Record<string,unknown>[]){if(row.looking_for)looking[String(row.matched_member_id)]=String(row.looking_for);}
    return response({ok:true,session,pair,memberId,participants:people||[],partnerId,schedule,lookingFor:looking,sharedProfiles,preMeetingQuestions:preQuestions||[],triggers:triggers||[],profileDrafts:drafts||[],privateNote:privateNote||null,relationship:{completedSessions:completed,previous:previousGuided||null,pendingFollowUps:followUps||[]},recommendedMode:recommendedGuidedMode(completed),sameDeviceSupported:true,realtimeSupported:false});
  }

  if(action==='save-guided-session'){
    const sessionId=String(body.sessionId||''),expectedVersion=Number(body.version||0);const {session,pair}=await ownGuidedSession(sessionId);if(!session||!pair)return response({ok:false,error:'ไม่มีสิทธิ์แก้ไข Session นี้'},403);if(session.status==='completed')return response({ok:false,error:'Session นี้จบแล้ว เปิดดูได้จากประวัติแต่แก้ไขไม่ได้'},409);if(expectedVersion!==Number(session.version))return response({ok:false,error:'อีกฝ่ายมีการแก้ไขข้อมูลแล้ว กรุณาโหลดข้อมูลล่าสุด',code:'VERSION_CONFLICT',session},409);
    const mode=String(body.sessionMode||session.session_mode),speaker=String(body.currentSpeakerMemberId||session.current_speaker_member_id||'');const pairIds=[String(pair.member_a_id),String(pair.member_b_id)];if(!GUIDED_MODES.includes(mode as typeof GUIDED_MODES[number]))return response({ok:false,error:'Session Mode ไม่ถูกต้อง'},400);if(speaker&&!pairIds.includes(speaker))return response({ok:false,error:'ผู้พูดต้องเป็นสมาชิกในคู่นี้'},400);
    const status=['draft','active','paused'].includes(String(body.status))?String(body.status):String(session.status);const now=new Date().toISOString();const changes={session_mode:mode,status,current_step:validGuidedStep(body.currentStep),current_speaker_member_id:speaker||null,shared_content:normalizeGuidedContent(body.sharedContent),timer_enabled:body.timerEnabled!==false,timer_started_at:body.timerStartedAt?String(body.timerStartedAt):null,duration_seconds:Math.max(0,Math.min(86400,Number(body.durationSeconds||0))),started_at:session.started_at||(status==='active'?now:null),paused_at:status==='paused'?now:null,updated_by_member_id:memberId,updated_at:now,version:expectedVersion+1};
    const {data,error}=await db.from('guided_one_to_one_sessions').update(changes).eq('id',sessionId).eq('version',expectedVersion).select('*').maybeSingle();if(error)return response({ok:false,error:'บันทึกไม่สำเร็จ กรุณาลองใหม่'},400);if(!data)return response({ok:false,error:'ข้อมูลถูกแก้ไขจากอีกอุปกรณ์ กรุณาโหลดใหม่',code:'VERSION_CONFLICT'},409);return response({ok:true,session:data});
  }

  if(action==='save-guided-private-note'){
    const sessionId=String(body.sessionId||'');const {session}=await ownGuidedSession(sessionId);if(!session)return response({ok:false,error:'ไม่มีสิทธิ์บันทึก Note นี้'},403);const note=cleanGuidedText(body.note,8000);const {data,error}=await db.from('guided_session_private_notes').upsert({session_id:sessionId,member_id:memberId,note_text:note,updated_at:new Date().toISOString(),archived_at:null},{onConflict:'session_id,member_id'}).select('note_text,version,updated_at').single();if(error)return response({ok:false,error:'บันทึก Private Note ไม่สำเร็จ'},400);return response({ok:true,privateNote:data});
  }

  if(action==='save-guided-trigger'){
    const sessionId=String(body.sessionId||''),ownerId=String(body.ownerMemberId||'');const {session,pair}=await ownGuidedSession(sessionId);if(!session||!pair)return response({ok:false,error:'ไม่มีสิทธิ์บันทึก Trigger นี้'},403);const pairIds=[String(pair.member_a_id),String(pair.member_b_id)];if(!pairIds.includes(ownerId))return response({ok:false,error:'เจ้าของ Trigger ต้องเป็นสมาชิกในคู่นี้'},400);const trigger=cleanGuidedText(body.triggerText,500);if(!trigger)return response({ok:false,error:'กรุณาระบุ Referral Trigger'},400);const approved=Boolean(body.ownerApproved)&&canEditOwnedGuidedData(memberId,ownerId,pairIds),clientActionId=cleanGuidedText(body.clientActionId,120)||null;const payload={session_id:sessionId,owner_member_id:ownerId,trigger_text:trigger,context:cleanGuidedText(body.context,1000)||null,priority:Math.max(1,Math.min(3,Number(body.priority||2))),is_active:body.isActive!==false,owner_approved:approved,actor_member_id:memberId,client_action_id:clientActionId,updated_at:new Date().toISOString()};const write=clientActionId?db.from('guided_referral_triggers').upsert(payload,{onConflict:'client_action_id'}):db.from('guided_referral_triggers').insert(payload);const {data,error}=await write.select('*').single();if(error)return response({ok:false,error:'บันทึก Referral Trigger ไม่สำเร็จ'},400);return response({ok:true,trigger:data});
  }

  if(action==='approve-guided-trigger'){
    const triggerId=String(body.triggerId||'');
    const {data:trigger}=await db.from('guided_referral_triggers').select('id,session_id,owner_member_id').eq('id',triggerId).is('archived_at',null).maybeSingle();
    if(!trigger||String((trigger as Record<string,unknown>).owner_member_id)!==memberId)return response({ok:false,error:'คุณอนุมัติได้เฉพาะ Referral Trigger ของตนเอง'},403);
    const {session}=await ownGuidedSession(String((trigger as Record<string,unknown>).session_id));if(!session)return response({ok:false,error:'ไม่มีสิทธิ์เข้าถึง Session นี้'},403);
    const {data,error}=await db.from('guided_referral_triggers').update({owner_approved:true,actor_member_id:memberId,updated_at:new Date().toISOString()}).eq('id',triggerId).select('*').single();
    return error?response({ok:false,error:'อนุมัติ Referral Trigger ไม่สำเร็จ'},400):response({ok:true,trigger:data,message:'อนุมัติ Referral Trigger แล้ว'});
  }

  if(action==='archive-guided-trigger'){
    const triggerId=String(body.triggerId||'');
    const {data:trigger}=await db.from('guided_referral_triggers').select('id,session_id,owner_member_id,actor_member_id').eq('id',triggerId).is('archived_at',null).maybeSingle();
    if(!trigger)return response({ok:false,error:'ไม่พบ Referral Trigger'},404);const row=trigger as Record<string,unknown>;
    const {session}=await ownGuidedSession(String(row.session_id));if(!session)return response({ok:false,error:'ไม่มีสิทธิ์เข้าถึง Session นี้'},403);
    if(String(row.owner_member_id)!==memberId&&String(row.actor_member_id)!==memberId)return response({ok:false,error:'คุณไม่มีสิทธิ์นำ Trigger นี้ออก'},403);
    await db.from('guided_referral_triggers').update({archived_at:new Date().toISOString(),actor_member_id:memberId,updated_at:new Date().toISOString()}).eq('id',triggerId);
    return response({ok:true,message:'นำ Referral Trigger ออกจาก Session แล้ว'});
  }

  if(action==='save-guided-profile-draft'){
    const sessionId=String(body.sessionId||''),ownerId=String(body.ownerMemberId||'');const {session,pair}=await ownGuidedSession(sessionId);if(!session||!pair)return response({ok:false,error:'ไม่มีสิทธิ์แก้ข้อมูลนี้'},403);const pairIds=[String(pair.member_a_id),String(pair.member_b_id)];if(!canEditOwnedGuidedData(memberId,ownerId,pairIds))return response({ok:false,error:'คุณแก้ไขได้เฉพาะข้อมูลธุรกิจของตนเอง'},403);const src=(body.updates&&typeof body.updates==='object'?body.updates:{}) as Record<string,unknown>;const updates={profession:cleanGuidedText(src.profession,200),company_name:cleanGuidedText(src.company_name,200),looking_for:cleanGuidedText(src.looking_for,1000)};const {data,error}=await db.from('guided_member_profile_drafts').upsert({session_id:sessionId,owner_member_id:ownerId,proposed_updates:updates,status:'draft',actor_member_id:memberId,updated_at:new Date().toISOString()},{onConflict:'session_id,owner_member_id'}).select('*').single();if(error)return response({ok:false,error:'เก็บร่างข้อมูลธุรกิจไม่สำเร็จ'},400);return response({ok:true,draft:data,message:'เก็บเป็นร่างแล้ว ข้อมูลสมาชิกเดิมยังไม่ถูกเขียนทับ'});
  }

  if(action==='confirm-guided-profile-draft'){
    const sessionId=String(body.sessionId||'');const {session,pair}=await ownGuidedSession(sessionId);if(!session||!pair)return response({ok:false,error:'ไม่มีสิทธิ์ยืนยันข้อมูลนี้'},403);const {data:draft}=await db.from('guided_member_profile_drafts').select('*').eq('session_id',sessionId).eq('owner_member_id',memberId).eq('status','draft').maybeSingle();if(!draft)return response({ok:false,error:'ไม่พบร่างข้อมูลธุรกิจของคุณ'},404);const updates=((draft as Record<string,unknown>).proposed_updates||{}) as Record<string,unknown>,memberChanges:Record<string,unknown>={updated_at:new Date().toISOString()};if(cleanGuidedText(updates.profession,200))memberChanges.profession=cleanGuidedText(updates.profession,200);if(cleanGuidedText(updates.company_name,200))memberChanges.company_name=cleanGuidedText(updates.company_name,200);const {error}=await db.from('members').update(memberChanges).eq('id',memberId);if(error)return response({ok:false,error:'อัปเดตข้อมูลสมาชิกไม่สำเร็จ'},400);const looking=cleanGuidedText(updates.looking_for,1000);if(looking){await db.from('matching_import_rows').update({looking_for:looking}).eq('round_id',String(pair.round_id)).eq('matched_member_id',memberId);const {data:biz}=await db.from('biz_profiles').select('description').eq('member_id',memberId).maybeSingle();await db.from('biz_profiles').upsert({member_id:memberId,description:String((biz as Record<string,unknown>|null)?.description||memberChanges.profession||memberChanges.company_name||'ข้อมูลธุรกิจสมาชิก'),looking_for:looking,updated_at:new Date().toISOString()},{onConflict:'member_id'});}const now=new Date().toISOString();await db.from('guided_member_profile_drafts').update({status:'applied',approved_at:now,applied_at:now,actor_member_id:memberId,updated_at:now}).eq('id',String((draft as Record<string,unknown>).id));await db.from('one_to_one_status_events').insert({round_id:String(pair.round_id),pair_id:String(pair.id),member_id:memberId,event_type:'guided_profile_updated',actor_type:'member',actor_ref:memberId,idempotency_key:`guided-profile:${sessionId}:${memberId}`,metadata:{sessionId,fields:Object.keys(memberChanges).filter(x=>x!=='updated_at'),lookingForUpdated:Boolean(looking)}});return response({ok:true,message:'ยืนยันและอัปเดตข้อมูลธุรกิจของคุณแล้ว'});
  }

  if(action==='submit-guided-experience-feedback'){
    const sessionId=String(body.sessionId||''),score=Number(body.score||0);const {session,pair}=await ownGuidedSession(sessionId);if(!session||!pair)return response({ok:false,error:'ไม่มีสิทธิ์ส่งความคิดเห็นสำหรับการพูดคุยนี้'},403);if(session.status!=='completed')return response({ok:false,error:'ส่งความคิดเห็นได้หลังจบการพูดคุย'},400);if(![1,2,3].includes(score))return response({ok:false,error:'คะแนนความคิดเห็นไม่ถูกต้อง'},400);const friction=cleanGuidedText(body.friction,500);const idempotencyKey=`guided-experience:${sessionId}:${memberId}`;const {error}=await db.from('one_to_one_status_events').upsert({round_id:String(pair.round_id),pair_id:String(pair.id),member_id:memberId,event_type:'guided_experience_feedback',actor_type:'member',actor_ref:memberId,idempotency_key:idempotencyKey,metadata:{sessionId,score,friction:friction||null}},{onConflict:'idempotency_key'});if(error)return response({ok:false,error:'บันทึกความคิดเห็นไม่สำเร็จ กรุณาลองใหม่'},400);return response({ok:true,message:'ขอบคุณสำหรับความคิดเห็น'});
  }

  if(action==='complete-guided-session'){
    const sessionId=String(body.sessionId||''),expectedVersion=Number(body.version||0);const {session,pair}=await ownGuidedSession(sessionId);if(!session||!pair)return response({ok:false,error:'ไม่มีสิทธิ์จบ Session นี้'},403);if(session.status==='completed')return response({ok:true,idempotent:true,session});if(expectedVersion!==Number(session.version))return response({ok:false,error:'มีข้อมูลใหม่จากอีกอุปกรณ์ กรุณาโหลดก่อนจบ Session',code:'VERSION_CONFLICT'},409);
    const content=normalizeGuidedContent(body.sharedContent),commitments=Array.isArray(content.commitments)?content.commitments as Record<string,unknown>[]:[];if(!commitments.length)return response({ok:false,error:'กรุณาเลือก Commitment อย่างน้อยหนึ่งข้อ หรือเลือก “ยังไม่มี Action ในตอนนี้”'},400);const pairIds=[String(pair.member_a_id),String(pair.member_b_id)],now=new Date().toISOString(),followUpIds:string[]=[];
    const {data:claimed,error:claimError}=await db.from('guided_one_to_one_sessions').update({status:'completed',current_step:6,shared_content:content,completed_at:now,duration_seconds:Math.max(0,Math.min(86400,Number(body.durationSeconds||session.duration_seconds||0))),updated_by_member_id:memberId,updated_at:now,version:expectedVersion+1}).eq('id',sessionId).eq('version',expectedVersion).neq('status','completed').select('*').maybeSingle();if(claimError||!claimed)return response({ok:false,error:'Session ถูกจบจากอีกอุปกรณ์แล้ว กรุณาเปิด History',code:'VERSION_CONFLICT'},409);
    for(const item of commitments.slice(0,10)){const type=cleanGuidedText(item.type,80)||'other';if(type==='none')continue;const owner=pairIds.includes(String(item.ownerMemberId))?String(item.ownerMemberId):memberId,related=owner===pairIds[0]?pairIds[1]:pairIds[0];const {data}=await db.from('one_to_one_follow_up_actions').insert({pair_id:String(pair.id),action_type:type,description:cleanGuidedText(item.detail,1200)||null,owner_member_id:owner,related_member_id:related,due_date:cleanGuidedText(item.dueDate,10)||null,source_guided_session_id:sessionId}).select('id').maybeSingle();if(data)followUpIds.push(String((data as Record<string,unknown>).id));}
    const finalContent={...content,followUpActionIds:followUpIds};const {data}=await db.from('guided_one_to_one_sessions').update({shared_content:finalContent,version:expectedVersion+2,updated_at:new Date().toISOString()}).eq('id',sessionId).eq('version',expectedVersion+1).select('*').single();
    await db.from('one_to_one_status_events').insert({round_id:String(pair.round_id),pair_id:String(pair.id),member_id:memberId,event_type:'guided_session_completed',actor_type:'member',actor_ref:memberId,idempotency_key:`guided-completed:${sessionId}`,metadata:{sessionId,mode:String(session.session_mode),durationSeconds:Number(body.durationSeconds||0),followUpCount:followUpIds.length}});
    return response({ok:true,session:data,followUpActionIds:followUpIds,message:'บันทึก Guided 1-2-1 แล้ว ขั้นต่อไปคือ Digital Handshake และ Reflection'});
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
    const allowedOutcomes=new Set(['referral_opportunity','collaboration','connection','better_understanding','no_immediate_action']);const feedback={pair_id:pairId,respondent_member_id:memberId,about_member_id:aboutId,visibility,learned:cleanGuidedText(body.learned,2000)||null,outcomes:(Array.isArray(body.outcomes)?body.outcomes:[]).map(String).filter(x=>allowedOutcomes.has(x)).slice(0,10),next_action_type:cleanGuidedText(body.nextActionType,80)||null,next_action_detail:cleanGuidedText(body.nextActionDetail,1200)||null,usefulness:body.usefulness?Math.max(1,Math.min(5,Number(body.usefulness))):null,cooperation:body.cooperation?Math.max(1,Math.min(5,Number(body.cooperation))):null,mentor_help:cleanGuidedText(body.mentorHelp,2000)||null};const {data:existing}=await db.from('one_to_one_feedback').select('id').eq('pair_id',pairId).eq('respondent_member_id',memberId).eq('visibility',visibility).is('archived_at',null).maybeSingle();const write=existing?db.from('one_to_one_feedback').update(feedback).eq('id',String((existing as Record<string,unknown>).id)).select('id').single():db.from('one_to_one_feedback').insert(feedback).select('id').single();const {data,error}=await write;if(error)return response({ok:false,error:error.message},400);
    const feedbackId=String((data as Record<string,unknown>).id);
    if(visibility==='shared'){
      const nextType=String(feedback.next_action_type||'');
      if(nextType&&nextType!=='none'){
        const {data:existingFollow}=await db.from('one_to_one_follow_up_actions').select('status,completed_at').eq('source_feedback_id',feedbackId).maybeSingle();const completed=String((existingFollow as Record<string,unknown>|null)?.status||'')==='completed';
        const {error:followError}=await db.from('one_to_one_follow_up_actions').upsert({pair_id:pairId,action_type:nextType,description:feedback.next_action_detail,owner_member_id:memberId,related_member_id:aboutId,due_date:String(body.dueDate||'')||null,status:completed?'completed':'pending',completed_at:completed?(existingFollow as Record<string,unknown>).completed_at:null,source_feedback_id:feedbackId,updated_at:new Date().toISOString()},{onConflict:'source_feedback_id'});if(followError)return response({ok:false,error:'บันทึก Reflection แล้ว แต่ยังสร้างรายการติดตามไม่สำเร็จ กรุณากดบันทึกอีกครั้ง'},500);
      }else{
        await db.from('one_to_one_follow_up_actions').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('source_feedback_id',feedbackId).in('status',['pending','in_progress','overdue']);
      }
    }
    if(visibility==='private_mentor'&&feedback.mentor_help){
      const mentorMessage=String(feedback.mentor_help),now=new Date().toISOString();
      const {data:existingCare}=await db.from('one_to_one_attention_items').select('id').eq('source_feedback_id',feedbackId).maybeSingle();
      const {error:careError}=await db.from('one_to_one_attention_items').upsert({member_id:memberId,pair_id:pairId,level:'mentor_review_required',reason:`สมาชิกขอคุยกับ Mentor: ${mentorMessage.length>240?mentorMessage.slice(0,237)+'...':mentorMessage}`,evidence:[{feedbackId,message:mentorMessage}],positive_context:['สมาชิกเป็นผู้ขอความช่วยเหลือด้วยตนเอง'],suggested_action:'Mentor ติดต่อสมาชิกเพื่อรับฟังและช่วยวาง Next Action',source_feedback_id:feedbackId,status:'open',resolved_at:null,updated_at:now},{onConflict:'source_feedback_id'});if(careError)return response({ok:false,error:'บันทึกข้อความแล้ว แต่ยังส่งเข้าคิว Mentor ไม่สำเร็จ กรุณากดส่งอีกครั้ง'},500);
      if(shouldCreateMentorNotification(String((existingCare as Record<string,unknown>|null)?.id||'')))await notifyOneToOneMentorAndMc(db,{feedbackId,pairId,memberId,memberName:String(member.name||''),nickname:String(member.nickname||''),mentorTeam:String(member.mentor_team||''),message:mentorMessage});
    }
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

  if (action === 'member-home') {
    const today = new Date().toISOString().slice(0, 10);
    const trainingUntil = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    const [{ data: profile }, { data: pairRows }, { count: visitorCount }, { count: requestCount }, { count: trainingCount }, { count: followUpCount }, { data: renewal }] = await Promise.all([
      db.from('member_one_to_one_profiles').select('*').eq('member_id', memberId).maybeSingle(),
      db.from('matching_pairs').select('id,member_a_id,member_b_id,status,created_at').or(`member_a_id.eq.${memberId},member_b_id.eq.${memberId}`).is('archived_at', null).order('created_at', { ascending: false }).limit(1),
      db.from('visitor_log').select('id', { count: 'exact', head: true }).eq('invited_by', memberId).eq('status', 'pending'),
      db.from('member_signals').select('id', { count: 'exact', head: true }).eq('member_id', memberId).in('status', ['new','acknowledged','in_progress','waiting_member','snoozed']),
      db.from('bni_events').select('id', { count: 'exact', head: true }).gte('event_date', today).lte('event_date', trainingUntil).or('ceu.gt.0,category.ilike.%training%,name.ilike.%MSP%'),
      db.from('one_to_one_follow_up_actions').select('id', { count: 'exact', head: true }).eq('owner_member_id', memberId).in('status', ['pending','in_progress','overdue']),
      db.from('renewals').select('days_left,expiry_date,status').eq('member_id', memberId).maybeSingle(),
    ]);
    const pair = ((pairRows || []) as Record<string, unknown>[])[0] || null;
    let pairSummary: Record<string, unknown> | null = null;
    if (pair) {
      const partnerId = String(pair.member_a_id) === memberId ? String(pair.member_b_id) : String(pair.member_a_id);
      const { data: partner } = await db.from('members').select('name,nickname').eq('id', partnerId).maybeSingle();
      const state = String(pair.status || 'matched');
      const nextByStatus: Record<string,string> = { matched:'ทักคู่และเลือกวันนัด',scheduled:'ยืนยันเวลานัดกับคู่',confirmed_schedule:'เตรียมข้อมูลก่อนวัน 1-2-1',awaiting_verification:'ทำ Digital Handshake',partially_verified:'รออีกฝ่ายยืนยัน',verified:'บันทึก Reflection และสิ่งที่ทำต่อ',late_verified:'บันทึก Reflection และสิ่งที่ทำต่อ' };
      pairSummary = { id: pair.id, status: state, partnerName: String((partner as Record<string,unknown>|null)?.nickname || (partner as Record<string,unknown>|null)?.name || 'คู่ของคุณ'), nextAction: nextByStatus[state] || 'เปิด MY121 เพื่อดูขั้นตอนถัดไป' };
    }
    return response({
      ok: true,
      profileCompleteness: member121ProfileCompleteness(profile as Record<string,unknown>|null),
      pair: pairSummary,
      pendingVisitors: visitorCount || 0,
      openRequests: requestCount || 0,
      upcomingTraining: trainingCount || 0,
      pendingFollowUps: followUpCount || 0,
      daysToExpiry: Number((renewal as Record<string,unknown>|null)?.days_left || 0),
      renewalStatus: String((renewal as Record<string,unknown>|null)?.status || ''),
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

  if (action === 'goal-coach') {
    const [{data:dash},{data:goals},{data:notif}]=await Promise.all([
      db.from('v_member_dashboard').select('display_score,traffic_light,palms_detail,rg,visitors,one_to_one,ceu,tyfcb_thb,absent,bni_days').eq('id',memberId).maybeSingle(),
      db.from('line_goals').select('goal_type,target,set_at').eq('member_id',memberId),
      db.from('line_notif_settings').select('is_muted').eq('member_id',memberId).eq('notif_type','score').maybeSingle(),
    ]);const d=(dash||{}) as Record<string,unknown>,goalMap:Record<string,number>={};for(const g of (goals||[]) as Record<string,unknown>[])goalMap[String(g.goal_type)]=Number(g.target);const actuals={referrals:Number(d.rg||0),visitors:Number(d.visitors||0),oneToOne:Number(d.one_to_one||0),ceu:Number(d.ceu||0),tyfbThb:Number(d.tyfcb_thb||0),absent:Number(d.absent||0)},weeks=Math.max(1,Math.floor(Number(d.bni_days||7)/7)),coach=buildGoalCoach({score:Number(d.display_score||0),trafficLight:String(d.traffic_light||'none'),weeks,actuals,palms:(d.palms_detail||{}) as Record<string,number>,goals:goalMap});return response({ok:true,...coach,weeks,actuals,reminderEnabled:!(notif as Record<string,unknown>|null)?.is_muted,reminderDescription:'สรุปคะแนนก่อนประชุมวันพฤหัสบดี และรายงานประจำเดือน โดยระบบเดิมควบคุมโควตาและการส่งซ้ำ'});
  }

  if (action === 'goal-notification') {
    const enabled=body.enabled===true;const {error}=await db.from('line_notif_settings').upsert({member_id:memberId,notif_type:'score',is_muted:!enabled,updated_at:new Date().toISOString()},{onConflict:'member_id,notif_type'});if(error)return response({ok:false,error:'ปรับการแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่'},400);await trackLineEvent(db,'liff_goal_notification_updated',{lineUserId:identity.userId,memberId,source:'liff',properties:{enabled}});return response({ok:true,enabled,message:enabled?'เปิดสรุปคะแนนและเป้าหมายแล้ว':'ปิดสรุปคะแนนและเป้าหมายแล้ว'});
  }

  if (action === 'goal') {
    const goalType = String(body.goalType || '').trim();
    const target = Number(body.target);
    const maxTarget=goalType==='tyfb'?1000000000:100;
    if (!['ref', 'visitor', 'oto', 'ceu', 'tyfb'].includes(goalType) || !Number.isFinite(target) || target <= 0 || target>maxTarget) {
      return response({ ok: false, error: 'เป้าหมายไม่ถูกต้อง' }, 400);
    }
    const { error } = await db.from('line_goals').upsert({
      member_id: memberId, goal_type: goalType, target, set_at: new Date().toISOString(),
    }, { onConflict: 'member_id,goal_type' });
    if (error) return response({ ok: false, error: error.message }, 400);
    const month = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).format(new Date());
    await upsertMemberSignal(db,{memberId,signalType:'goal',subjectType:'line_goal',subjectId:goalType,title:'สมาชิกตั้งเป้าหมายใหม่',detail:`${goalType}: ${target}`,payload:{goalType,target},priority:'low',idempotencyKey:`goal:${memberId}:${goalType}:${month}`});
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

  if (action === 'renewal-intent') {
    const intent=String(body.intent||''),allowed=new Set(['renew_now','need_details','talk_mentor','unsure','not_now']);
    if(!allowed.has(intent))return response({ok:false,error:'กรุณาเลือกสิ่งที่ต้องการ'},400);
    const labels:Record<string,string>={renew_now:'พร้อมต่ออายุ',need_details:'ขอรายละเอียดการต่ออายุ',talk_mentor:'อยากคุยกับ Mentor ก่อน',unsure:'ยังไม่แน่ใจและอยากให้ช่วย',not_now:'ยังไม่ดำเนินการตอนนี้'};
    const {error}=await upsertMemberSignal(db,{memberId,signalType:'renewal',subjectType:'renewal_intent',subjectId:intent,title:labels[intent],detail:'สมาชิกแจ้งความต้องการผ่าน MY IDEAL',payload:{intent},priority:intent==='talk_mentor'||intent==='unsure'?'high':'normal',consent:intent!=='not_now',idempotencyKey:`renewal:${memberId}:${intent}`});
    if(error)return response({ok:false,error:'บันทึกความต้องการไม่สำเร็จ กรุณาลองใหม่'},400);
    return response({ok:true,message:intent==='not_now'?'บันทึกไว้แล้ว คุณกลับมาแจ้งใหม่ได้ทุกเมื่อ':'ส่งความต้องการให้ทีมที่รับผิดชอบแล้ว'});
  }

  if (action === 'training-interest') {
    const eventId=String(body.eventId||''),intent=String(body.intent||''),allowed=new Set(['interested','need_details','registered','cancelled']);
    if(!eventId||!allowed.has(intent))return response({ok:false,error:'ข้อมูลหลักสูตรหรือสถานะไม่ถูกต้อง'},400);
    const {data:event}=await db.from('bni_events').select('id,name,event_date').eq('id',eventId).maybeSingle();
    if(!event)return response({ok:false,error:'ไม่พบหลักสูตรนี้ กรุณารีเฟรชปฏิทิน'},404);
    const labels:Record<string,string>={interested:'สนใจเข้าร่วมอบรม',need_details:'ขอรายละเอียดหลักสูตร',registered:'ลงทะเบียนแล้ว',cancelled:'ยกเลิกความสนใจ'};
    const {error}=await upsertMemberSignal(db,{memberId,signalType:'training',subjectType:'bni_event',subjectId:eventId,title:`${labels[intent]} · ${String((event as Record<string,unknown>).name||'')}`,detail:String((event as Record<string,unknown>).event_date||''),payload:{intent,eventId},priority:intent==='need_details'?'high':'normal',consent:intent!=='cancelled',idempotencyKey:`training:${memberId}:${eventId}`});
    if(error)return response({ok:false,error:'บันทึกความสนใจไม่สำเร็จ กรุณาลองใหม่'},400);
    if(intent==='cancelled')await db.from('member_signals').update({status:'cancelled',resolved_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('idempotency_key',`training:${memberId}:${eventId}`);
    return response({ok:true,message:intent==='cancelled'?'ยกเลิกความสนใจแล้ว':'ส่งข้อมูลให้ทีม ST / NEC แล้ว'});
  }

  if (action === 'visitor') {
    const visitorName = String(body.visitorName || '').trim();
    const visitDate = String(body.visitDate || '').trim();
    const notes = body.notes ? String(body.notes).trim() : null;
    if (!visitorName) return response({ ok: false, error: 'visitorName required' }, 400);
    if (!visitDate) return response({ ok: false, error: 'visitDate required' }, 400);
    const { data: visitor, error } = await db.from('visitor_log').insert({
      visitor_name: visitorName,
      invited_by: memberId,
      visit_date: visitDate,
      notes,
      status: 'pending',
    }).select('id').single();
    if (error) return response({ ok: false, error: error.message }, 400);
    await upsertMemberSignal(db,{memberId,signalType:'visitor',subjectType:'visitor_log',subjectId:String((visitor as Record<string,unknown>).id),title:`มีแขกพิเศษ: ${visitorName}`,detail:visitDate,payload:{visitorName,visitDate},priority:'normal',consent:true,idempotencyKey:`visitor:${String((visitor as Record<string,unknown>).id)}`});
    await notifyVisitorStakeholders(db, {
      visitorLogId: String((visitor as Record<string, unknown>).id), visitorName, visitDate,
      invitedByMemberId: memberId,
      invitedByName: String(identity.member.nickname || identity.member.name || ''),
      notes: notes || '', source: 'liff-api',
    });
    await trackLineEvent(db, 'liff_visitor_logged', {
      lineUserId: identity.userId, memberId, source: 'liff',
    });
    return response({ ok: true, message: 'บันทึกแขกพิเศษแล้วครับ' });
  }

  if (action === 'create-visitor-checkin-token') {
    const visitorLogId = String(body.visitorLogId || '').trim();
    if (!visitorLogId) return response({ ok: false, error: 'ไม่พบรายการแขก' }, 400);
    const { data: visitor } = await db.from('visitor_log')
      .select('id, visitor_name, visit_date, status')
      .eq('id', visitorLogId)
      .eq('invited_by', memberId)
      .maybeSingle();
    if (!visitor) return response({ ok: false, error: 'ไม่พบรายการแขก หรือคุณไม่มีสิทธิ์สร้าง QR นี้' }, 403);
    if (String((visitor as Record<string, unknown>).status) !== 'pending') {
      return response({ ok: false, error: 'รายการนี้ยืนยันการเข้าร่วมแล้ว จึงไม่ต้องสร้าง QR ใหม่' }, 409);
    }

    const token = randomUrlToken();
    const tokenHash = await sha256Hex(token);
    const visitDate = String((visitor as Record<string, unknown>).visit_date || '');
    const visitEnd = new Date(`${visitDate}T23:59:59+07:00`);
    const maximum = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const expiresAt = visitEnd.getTime() > Date.now() && visitEnd < maximum ? visitEnd : maximum;

    await db.from('visitor_checkin_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('visitor_log_id', visitorLogId)
      .is('consumed_at', null)
      .is('revoked_at', null);
    const { error } = await db.from('visitor_checkin_tokens').insert({
      visitor_log_id: visitorLogId,
      token_hash: tokenHash,
      created_by_member_id: memberId,
      expires_at: expiresAt.toISOString(),
    });
    if (error) return response({ ok: false, error: 'ยังสร้าง QR ไม่สำเร็จ กรุณาลองอีกครั้ง' }, 400);
    await trackLineEvent(db, 'liff_visitor_qr_created', {
      lineUserId: identity.userId, memberId, source: 'liff', properties: { visitorLogId },
    });
    return response({
      ok: true,
      token,
      visitorName: String((visitor as Record<string, unknown>).visitor_name || ''),
      visitDate,
      expiresAt: expiresAt.toISOString(),
    });
  }

  if (action === 'consume-visitor-checkin-token') {
    const token = String(body.token || '').trim();
    if (!/^[A-Za-z0-9_-]{24,128}$/.test(token)) {
      return response({ ok: false, error: 'QR นี้ไม่ถูกต้อง กรุณาให้ผู้เชิญสร้างใหม่' }, 400);
    }
    const tokenHash = await sha256Hex(token);
    const { data: credential } = await db.from('visitor_checkin_tokens')
      .select('id, visitor_log_id, expires_at, consumed_at, revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    const cred = credential as Record<string, unknown> | null;
    if (!cred || cred.revoked_at) return response({ ok: false, error: 'QR นี้ถูกยกเลิกหรือไม่ถูกต้อง กรุณาขอ QR ใหม่' }, 410);
    if (new Date(String(cred.expires_at)).getTime() <= Date.now()) {
      return response({ ok: false, error: 'QR นี้หมดอายุแล้ว กรุณาให้ผู้เชิญสร้างใหม่' }, 410);
    }
    const visitorLogId = String(cred.visitor_log_id);
    const { data: visitor } = await db.from('visitor_log')
      .select('id, visitor_name, visit_date, status, invited_by')
      .eq('id', visitorLogId)
      .maybeSingle();
    if (!visitor) return response({ ok: false, error: 'ไม่พบรายการแขกนี้' }, 404);
    if (!cred.consumed_at) {
      const now = new Date().toISOString();
      const { data: consumed } = await db.from('visitor_checkin_tokens')
        .update({ consumed_at: now, consumed_by_member_id: memberId })
        .eq('id', String(cred.id))
        .is('consumed_at', null)
        .is('revoked_at', null)
        .gt('expires_at', now)
        .select('id')
        .maybeSingle();
      if (!consumed) return response({ ok: false, error: 'QR นี้ถูกใช้แล้ว กรุณารีเฟรชรายการแขก' }, 409);
      await db.from('visitor_log').update({ status: 'attended', updated_at: now }).eq('id', visitorLogId).eq('status', 'pending');
      await trackLineEvent(db, 'liff_visitor_qr_consumed', {
        lineUserId: identity.userId, memberId, source: 'liff', properties: { visitorLogId },
      });
    }
    return response({
      ok: true,
      alreadyUsed: Boolean(cred.consumed_at),
      visitor: {
        visitorName: String((visitor as Record<string, unknown>).visitor_name || ''),
        visitDate: String((visitor as Record<string, unknown>).visit_date || ''),
      },
      message: cred.consumed_at ? 'QR นี้ได้รับการยืนยันแล้ว' : 'ยืนยันการเข้าร่วมของแขกเรียบร้อยแล้ว ✓',
    });
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

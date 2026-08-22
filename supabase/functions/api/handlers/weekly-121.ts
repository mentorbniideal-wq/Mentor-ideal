import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';
import { createOneToOneMatches, normalize121Name, parseWeekly121Csv, weekly121Message, weekly121TestMessage, type MatchingStrategy } from '../../_shared/weekly-121.ts';
import { linePush } from '../../_shared/line.ts';
import { evaluateNotificationGuard, logSuppressedNotification } from '../../_shared/notification-orchestrator.ts';

const isoDate = (value: string) => { const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : value; };
const pairKey = (a: string, b: string) => [a,b].sort().join('|');
const MESSAGE_TEMPLATES=[
  {key:'growth_opportunity',name:'โอกาสทางธุรกิจ',icon:'🚀',description:'ครบทั้งธุรกิจ Looking for คำถามเปิดบทสนทนา และภารกิจ Referral'},
  {key:'warm_connection',name:'รู้จักกันแบบอบอุ่น',icon:'🤝',description:'เน้นความสัมพันธ์และการฟัง เหมาะกับสมาชิกใหม่หรือคู่ที่ยังไม่สนิท'},
  {key:'referral_focus',name:'Referral Focus',icon:'🎯',description:'เจาะลูกค้าในอุดมคติ Referral Trigger และ Connection ที่ช่วยกันได้'},
  {key:'story_trust',name:'Story & Trust',icon:'✨',description:'ใช้เรื่องราวและจุดเปลี่ยนสร้างความไว้ใจ ก่อนต่อยอดธุรกิจ'},
  {key:'quick_action',name:'Quick Action 20 นาที',icon:'⚡',description:'สั้น กระชับ มีขั้นตอนชัด เหมาะกับสัปดาห์ที่ทุกคนเวลาน้อย'},
] as const;
const templateKey=(value:unknown)=>MESSAGE_TEMPLATES.some(x=>x.key===String(value))?String(value):'growth_opportunity';

export async function handleWeekly121(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient(); const action = String(p.action || '');
  const auth = await requireAuth(db, p, ['mc']);
  if (!auth.ok) return errResponse(auth.error || 'ไม่มีสิทธิ์ใช้งาน', 403);

  if (action === 'importWeekly121Csv') {
    const csv = String(p.csv || ''); const fileName = String(p.fileName || '');
    if (!/\.csv$/i.test(fileName)) return errResponse('กรุณาเลือกไฟล์ .csv');
    if (!csv || new TextEncoder().encode(csv).length > 2 * 1024 * 1024) return errResponse('ไฟล์ว่างหรือมีขนาดเกิน 2 MB');
    let parsed; try { parsed = parseWeekly121Csv(csv); } catch (e) { return errResponse(e instanceof Error ? e.message : String(e)); }
    if (parsed.rows.length > 1000) return errResponse('ไฟล์มีข้อมูลเกิน 1,000 แถว');
    const selectedDate = String(p.meetingDate || parsed.dates[0] || '');
    if (!selectedDate) return errResponse('ไม่พบวันที่ประชุม');
    if (!p.meetingDate && parsed.dates.length > 1) return jsonResponse({ ok:true, needsDate:true, dates:parsed.dates, rowCount:parsed.rows.length });
    const dayRows = parsed.rows.filter(r => r.date === selectedDate);
    const { data: members, error: mErr } = await db.from('members').select('id,name,nickname,profession,company_name,is_new_member').eq('is_archived', false);
    if (mErr) return errResponse(mErr.message);
    const memberRows = (members || []) as Record<string, unknown>[];
    const ids = memberRows.map(m => String(m.id));
    const [{ data: links }, { data: biz }] = await Promise.all([
      ids.length ? db.from('line_members').select('member_id,line_user_id').in('member_id', ids) : Promise.resolve({data:[]}),
      ids.length ? db.from('biz_profiles').select('member_id,description').in('member_id', ids) : Promise.resolve({data:[]}),
    ]);
    const lineBy = new Map(((links||[]) as Record<string,unknown>[]).map(x => [String(x.member_id),String(x.line_user_id)]));
    const bizBy = new Map(((biz||[]) as Record<string,unknown>[]).map(x => [String(x.member_id),String(x.description)]));
    const byName = new Map<string,Record<string,unknown>[]>();
    memberRows.forEach(m => { const k=normalize121Name(String(m.name||'')); byName.set(k,[...(byName.get(k)||[]),m]); });
    const seen = new Set<string>();
    const reconciled = dayRows.map(r => {
      const key=normalize121Name(r.fullName); const found=byName.get(key)||[]; let status='not_found', message='ไม่พบชื่อในฐานสมาชิก', member:Record<string,unknown>|null=null;
      const isSub=Boolean(r.substituteFor)||normalize121Name(r.userRole)==='substitute';
      if (isSub) { status='substitute'; message=`ผู้มาประชุมแทน ${r.substituteFor||''}`.trim(); }
      else if (seen.has(key)) { status='duplicate'; message='ข้อมูลซ้ำในวันเดียวกัน'; }
      else if (found.length>1) { status='ambiguous'; message='พบสมาชิกมากกว่าหนึ่งคน'; }
      else if (found.length===1) { member=found[0]; status=lineBy.has(String(member.id))?'ready':'no_line'; message=status==='ready'?'พร้อมจับคู่':'สมาชิกยังไม่ได้เชื่อม LINE'; }
      seen.add(key);
      return { ...r, normalizedName:key, status, message, member:member?{...member,business:bizBy.get(String(member.id))||'',lineUserId:lineBy.get(String(member.id))||''}:null, candidates:found.map(m=>({id:m.id,name:m.name,nickname:m.nickname})) };
    });
    const meetingDate=isoDate(selectedDate);
    const friday=new Date(`${meetingDate}T00:00:00+07:00`); const saturday=new Date(friday.getTime()+86400000); const thursday=new Date(friday.getTime()+6*86400000+16*60*60*1000+59*60*1000);
    const { data: round, error:rErr } = await db.from('matching_rounds').insert({meeting_date:meetingDate,source_file_name:fileName,repeat_window_weeks:Number(p.repeatWindowWeeks||12),created_by:String(auth.displayName||auth.role),system_version:2,feature_flag:'one_to_one_system',message_template_key:templateKey(p.messageTemplateKey),timezone:'Asia/Bangkok',opt_in_closes_at:new Date(saturday.getTime()+5*60*60*1000).toISOString(),starts_at:saturday.toISOString(),ends_at:thursday.toISOString()}).select('id').single();
    if (rErr||!round) return errResponse(rErr?.message||'สร้างรอบไม่สำเร็จ'); const roundId=String((round as Record<string,unknown>).id);
    const inserts=reconciled.map(r=>({round_id:roundId,row_number:r.rowNumber,first_name_en:r.firstName,last_name_en:r.lastName,normalized_name:r.normalizedName,substitute_name:r.substituteFor||null,looking_for:r.lookingFor||null,checkin_date:isoDate(r.date),checkin_time:r.time||null,matched_member_id:r.member ? String((r.member as Record<string,unknown>).id) : null,import_status:r.status,validation_message:r.message}));
    const { error:iErr }=await db.from('matching_import_rows').insert(inserts); if(iErr)return errResponse(iErr.message);
    const eligibility=reconciled.filter(r=>r.member&&!['substitute','duplicate','excluded'].includes(r.status)).map(r=>({round_id:roundId,member_id:String((r.member as Record<string,unknown>).id),source:'attendee',status:r.status==='ready'?'eligible':'excluded',reason:r.message}));
    if(eligibility.length){const {error:eErr}=await db.from('round_eligibility').upsert(eligibility,{onConflict:'round_id,member_id'});if(eErr)return errResponse(eErr.message);}
    return jsonResponse({ok:true,roundId,meetingDate:selectedDate,dates:parsed.dates,rows:reconciled,memberOptions:memberRows.map(m=>({id:m.id,name:m.name,nickname:m.nickname})),summary:Object.fromEntries(['ready','no_line','not_found','ambiguous','substitute','duplicate'].map(s=>[s,reconciled.filter(r=>r.status===s).length]))});
  }

  if (action === 'generateWeekly121Matches') {
    const roundId=String(p.roundId||''); if(!roundId)return errResponse('roundId required');
    const {data:round}=await db.from('matching_rounds').select('*').eq('id',roundId).single(); if(!round)return errResponse('ไม่พบรอบจับคู่');
    if(String((round as Record<string,unknown>).status)!=='draft')return errResponse('แก้ไขได้เฉพาะร่าง');
    const {data:rows}=await db.from('matching_import_rows').select('row_number,matched_member_id,looking_for,members(id,name,nickname,is_new_member,mentor_team,profession,company_name)').eq('round_id',roundId).eq('import_status','ready');
    let eligible=(rows||[]) as Record<string,unknown>[]; const target=String(p.target||'all');
    const selected=new Set(Array.isArray(p.memberIds)?(p.memberIds as unknown[]).map(String):[]);
    if(target==='manual')eligible=eligible.filter(r=>selected.has(String(r.matched_member_id)));
    const memberIds=eligible.map(r=>String(r.matched_member_id));
    const {data:profiles}=memberIds.length?await db.from('biz_profiles').select('member_id,description').in('member_id',memberIds):{data:[]};
    const businessById=new Map(((profiles||[]) as Record<string,unknown>[]).map(x=>[String(x.member_id),String(x.description||'')]));
    if(target==='yellow' && memberIds.length){const {data:yellow}=await db.from('v_member_dashboard').select('id').in('id',memberIds).eq('traffic_light','yellow');const set=new Set(((yellow||[]) as Record<string,unknown>[]).map(x=>String(x.id)));eligible=eligible.filter(r=>set.has(String(r.matched_member_id)));}
    if(target==='new')eligible=eligible.filter(r=>Boolean((r.members as Record<string,unknown>|null)?.is_new_member));
    if(eligible.length<2)return errResponse('ต้องมีสมาชิกพร้อมจับคู่อย่างน้อย 2 คน');
    const cutoff=new Date(String((round as Record<string,unknown>).meeting_date)); cutoff.setUTCDate(cutoff.getUTCDate()-Number((round as Record<string,unknown>).repeat_window_weeks||12)*7);
    const [{data:history},{data:forbidden},{data:lockedRows},{data:waitingHistory}]=await Promise.all([
      db.from('matching_pairs').select('member_a_id,member_b_id,optional_member_c_id,matching_rounds!inner(meeting_date)').gte('matching_rounds.meeting_date',cutoff.toISOString().slice(0,10)).neq('round_id',roundId),
      db.from('matching_forbidden_pairs').select('member_low_id,member_high_id').eq('is_active',true),
      db.from('matching_pairs').select('id,position,member_a_id,member_b_id,optional_member_c_id,is_locked').eq('round_id',roundId).eq('is_locked',true),
      db.from('pairing_waitlist').select('member_id,priority_points').in('member_id',memberIds).in('status',['waiting','carried']),
    ]);
    const blocked=new Set<string>(); ((history||[]) as Record<string,unknown>[]).forEach(h=>{const a=String(h.member_a_id),b=String(h.member_b_id),c=h.optional_member_c_id?String(h.optional_member_c_id):'';blocked.add(pairKey(a,b));if(c){blocked.add(pairKey(a,c));blocked.add(pairKey(b,c));}}); ((forbidden||[]) as Record<string,unknown>[]).forEach(x=>blocked.add(pairKey(String(x.member_low_id),String(x.member_high_id))));
    const strategies=new Set(['random','checkin_mix','looking_for','cross_team','smart_mix']);
    const matchingType=(strategies.has(String(p.matchingType))?String(p.matchingType):'random') as MatchingStrategy;
    const waitingPriority=new Map<string,number>();((waitingHistory||[]) as Record<string,unknown>[]).forEach(x=>{const id=String(x.member_id),points=Number(x.priority_points)||0;waitingPriority.set(id,Math.max(waitingPriority.get(id)||0,points));});
    const map=new Map(eligible.map(r=>{const m=r.members as Record<string,unknown>;const id=String(r.matched_member_id);return[id,{id,name:String(m?.name||''),checkinOrder:Number(r.row_number)||0,lookingFor:String(r.looking_for||''),business:businessById.get(id)||String(m?.profession||m?.company_name||''),mentorTeam:String(m?.mentor_team||''),waitingPriority:waitingPriority.get(id)||0}];}));
    if(((lockedRows||[]) as Record<string,unknown>[]).some(x=>Boolean(x.optional_member_c_id)))return errResponse('รอบ Legacy ที่มีกลุ่ม 3 คนเปิดดูประวัติได้ แต่ไม่สามารถสุ่มใหม่ในระบบเวอร์ชัน 2');
    const locked=((lockedRows||[]) as Record<string,unknown>[]).map(x=>({locked:true,members:[x.member_a_id,x.member_b_id].map(id=>map.get(String(id))).filter(Boolean) as {id:string;name:string}[]})).filter(g=>g.members.length===2);
    let matchResult; try{matchResult=createOneToOneMatches([...map.values()],blocked,locked,Math.random,matchingType);}catch(e){return errResponse(e instanceof Error?e.message:String(e));}
    const groups=matchResult.groups;
    await db.from('matching_pairs').delete().eq('round_id',roundId).eq('is_locked',false);
    const existingLocked=locked.length; const nextPosition=Math.max(0,...((lockedRows||[]) as Record<string,unknown>[]).map(x=>Number(x.position)||0))+1; const inserts=groups.slice(existingLocked).map((g,i)=>({round_id:roundId,position:nextPosition+i,member_a_id:g.members[0].id,member_b_id:g.members[1].id,optional_member_c_id:g.members[2]?.id||null}));
    if(inserts.length){const {error}=await db.from('matching_pairs').insert(inserts);if(error)return errResponse(error.message);}
    await db.from('pairing_waitlist').delete().eq('round_id',roundId).eq('status','waiting');
    if(matchResult.waiting){const oldPriority=waitingPriority.get(matchResult.waiting.id)||0;const {error:wErr}=await db.from('pairing_waitlist').upsert({round_id:roundId,member_id:matchResult.waiting.id,status:'waiting',priority_points:oldPriority+1,reason:'odd_pool'},{onConflict:'round_id,member_id'});if(wErr)return errResponse(wErr.message);}
    await db.from('round_eligibility').update({status:'eligible'}).eq('round_id',roundId).eq('status','matched');
    const pairedIds=groups.flatMap(g=>g.members.map(m=>m.id));if(pairedIds.length)await db.from('round_eligibility').update({status:'matched'}).eq('round_id',roundId).in('member_id',pairedIds);
    if(matchResult.waiting)await db.from('round_eligibility').update({status:'waiting',priority_points:(waitingPriority.get(matchResult.waiting.id)||0)+1}).eq('round_id',roundId).eq('member_id',matchResult.waiting.id);
    await db.from('matching_rounds').update({version:Number((round as Record<string,unknown>).version||1)+1,matching_type:matchingType,system_version:2,feature_flag:'one_to_one_system'}).eq('id',roundId);
    return getRound(db,roundId);
  }

  if (action === 'setWeekly121PairLock') { const id=String(p.pairId||''); const {error}=await db.from('matching_pairs').update({is_locked:Boolean(p.locked)}).eq('id',id); return error?errResponse(error.message):jsonResponse({ok:true}); }
  if(action==='getWeekly121MessageTemplates')return jsonResponse({ok:true,templates:MESSAGE_TEMPLATES});
  if(action==='setWeekly121MessageTemplate'){
    const roundId=String(p.roundId||''),key=templateKey(p.templateKey);const {data:round}=await db.from('matching_rounds').select('status').eq('id',roundId).maybeSingle();if(!round)return errResponse('ไม่พบรอบจับคู่');if(String((round as Record<string,unknown>).status)!=='draft')return errResponse('เปลี่ยน Template ได้เฉพาะรอบร่าง');const {error}=await db.from('matching_rounds').update({message_template_key:key}).eq('id',roundId);return error?errResponse(error.message):getRound(db,roundId);
  }
  if(action==='saveOneToOneBusinessProfile'){
    const memberId=String(p.memberId||''),description=String(p.description||'').trim(),profession=String(p.profession||'').trim(),companyName=String(p.companyName||'').trim();if(!memberId)return errResponse('memberId required');const {error:memberError}=await db.from('members').update({profession:profession||null,company_name:companyName||null,updated_at:new Date().toISOString()}).eq('id',memberId);if(memberError)return errResponse(memberError.message);if(description){const {error}=await db.from('biz_profiles').upsert({member_id:memberId,description,updated_at:new Date().toISOString()},{onConflict:'member_id'});if(error)return errResponse(error.message);}else{const {error}=await db.from('biz_profiles').delete().eq('member_id',memberId);if(error)return errResponse(error.message);}return jsonResponse({ok:true,memberId,description,profession,companyName});
  }
  if (action === 'resolveWeekly121ImportRow') {
    const roundId=String(p.roundId||''), rowNumber=Number(p.rowNumber), memberId=String(p.memberId||'');
    if(!roundId||!rowNumber||!memberId)return errResponse('กรุณาเลือกรายการและสมาชิก');
    const {data:link}=await db.from('line_members').select('line_user_id').eq('member_id',memberId).maybeSingle();
    const status=link?'ready':'no_line';
    const {error}=await db.from('matching_import_rows').update({matched_member_id:memberId,import_status:status,validation_message:status==='ready'?'Admin ยืนยันสมาชิกแล้ว':'Admin ยืนยันแล้ว แต่สมาชิกยังไม่มี LINE'}).eq('round_id',roundId).eq('row_number',rowNumber);
    return error?errResponse(error.message):jsonResponse({ok:true,status});
  }
  if (action === 'removeWeekly121Member') {
    const roundId=String(p.roundId||''), pairId=String(p.pairId||''), memberId=String(p.memberId||'');
    const {data:round}=await db.from('matching_rounds').select('status').eq('id',roundId).maybeSingle(); if(!round||String((round as Record<string,unknown>).status)!=='draft')return errResponse('นำสมาชิกออกได้เฉพาะรอบร่าง');
    const {data:pair}=await db.from('matching_pairs').select('member_a_id,member_b_id,optional_member_c_id,is_locked').eq('id',pairId).eq('round_id',roundId).maybeSingle();
    if(!pair)return errResponse('ไม่พบคู่'); const pv=pair as Record<string,unknown>; if(pv.is_locked)return errResponse('กรุณาปลดล็อกคู่ก่อนนำสมาชิกออก');
    const ids=[String(pv.member_a_id),String(pv.member_b_id),pv.optional_member_c_id?String(pv.optional_member_c_id):''].filter(Boolean); if(!ids.includes(memberId))return errResponse('สมาชิกไม่อยู่ในคู่นี้');
    const remaining=ids.filter(id=>id!==memberId); let pairError=null;
    if(remaining.length<2){const {error}=await db.from('matching_pairs').delete().eq('id',pairId);pairError=error;}
    else{const {error}=await db.from('matching_pairs').update({member_a_id:remaining[0],member_b_id:remaining[1],optional_member_c_id:remaining[2]||null}).eq('id',pairId);pairError=error;}
    if(pairError)return errResponse(pairError.message);
    const {error:rowError}=await db.from('matching_import_rows').update({import_status:'excluded',validation_message:'Admin นำออกจากการจับคู่'}).eq('round_id',roundId).eq('matched_member_id',memberId);
    return rowError?errResponse(rowError.message):getRound(db,roundId);
  }
  if (action === 'swapWeekly121Members') {
    const roundId=String(p.roundId||''), firstPairId=String(p.firstPairId||''), secondPairId=String(p.secondPairId||''), firstMemberId=String(p.firstMemberId||''), secondMemberId=String(p.secondMemberId||'');
    if(!firstPairId||!secondPairId||firstPairId===secondPairId||firstMemberId===secondMemberId)return errResponse('กรุณาเลือกสมาชิกจากคนละคู่');
    const {data:round}=await db.from('matching_rounds').select('status').eq('id',roundId).maybeSingle();if(!round||String((round as Record<string,unknown>).status)!=='draft')return errResponse('สลับสมาชิกได้เฉพาะรอบร่าง');
    const {data:pairs}=await db.from('matching_pairs').select('id,member_a_id,member_b_id,optional_member_c_id,is_locked').eq('round_id',roundId).in('id',[firstPairId,secondPairId]);
    if((pairs||[]).length!==2)return errResponse('ไม่พบคู่ที่เลือก');
    const replace=(row:Record<string,unknown>,from:string,to:string)=>{const out:{member_a_id:string;member_b_id:string;optional_member_c_id:string|null}={member_a_id:String(row.member_a_id),member_b_id:String(row.member_b_id),optional_member_c_id:row.optional_member_c_id?String(row.optional_member_c_id):null};if(out.member_a_id===from)out.member_a_id=to;else if(out.member_b_id===from)out.member_b_id=to;else if(out.optional_member_c_id===from)out.optional_member_c_id=to;else throw new Error('ไม่พบสมาชิกในคู่');return out;};
    try{const a=(pairs as Record<string,unknown>[]).find(x=>String(x.id)===firstPairId)!,b=(pairs as Record<string,unknown>[]).find(x=>String(x.id)===secondPairId)!;if(a.is_locked||b.is_locked)return errResponse('กรุณาปลดล็อกทั้งสองคู่ก่อนสลับ');const av=replace(a,firstMemberId,secondMemberId),bv=replace(b,secondMemberId,firstMemberId);if(new Set(Object.values(av).filter(Boolean)).size!==Object.values(av).filter(Boolean).length||new Set(Object.values(bv).filter(Boolean)).size!==Object.values(bv).filter(Boolean).length)return errResponse('การสลับทำให้สมาชิกซ้ำในคู่');const [ra,rb]=await Promise.all([db.from('matching_pairs').update(av).eq('id',firstPairId),db.from('matching_pairs').update(bv).eq('id',secondPairId)]);if(ra.error||rb.error)return errResponse(ra.error?.message||rb.error?.message||'สลับไม่สำเร็จ');return getRound(db,roundId);}catch(e){return errResponse(e instanceof Error?e.message:String(e));}
  }
  if (action === 'getWeekly121Round') return getRound(db,String(p.roundId||''));
  if (action === 'getOneToOneOverview') {
    const [{data:round},{count:active},{count:waiting},{count:followUp},{count:attention}]=await Promise.all([
      db.from('matching_rounds').select('id,meeting_date,status,starts_at,ends_at,feature_flag').order('meeting_date',{ascending:false}).limit(1).maybeSingle(),
      db.from('matching_pairs').select('id',{count:'exact',head:true}).in('status',['matched','contacted','scheduled','confirmed_schedule','awaiting_verification','partially_verified']),
      db.from('pairing_waitlist').select('id',{count:'exact',head:true}).eq('status','waiting'),
      db.from('one_to_one_follow_up_actions').select('id',{count:'exact',head:true}).in('status',['pending','in_progress','overdue']),
      db.from('one_to_one_attention_items').select('id',{count:'exact',head:true}).in('status',['open','reviewed']),
    ]);
    return jsonResponse({ok:true,round:round||null,stats:{active:active||0,waiting:waiting||0,followup:followUp||0,attention:attention||0},featureEnabled:String((round as Record<string,unknown>|null)?.feature_flag||'')==='one_to_one_system'});
  }
  if(action==='getOneToOneQueues'){
    const [{data:active},{data:waiting},{data:followUps},{data:attention},{data:budgets}]=await Promise.all([
      db.from('matching_pairs').select('id,status,created_at,round:matching_rounds(meeting_date,ends_at),member_a:members!matching_pairs_member_a_id_fkey(id,name,nickname,mentor_team),member_b:members!matching_pairs_member_b_id_fkey(id,name,nickname,mentor_team),schedules:one_to_one_schedules(id,starts_at,status,meeting_mode)').is('archived_at',null).neq('status','verified').neq('status','late_verified').order('created_at',{ascending:false}).limit(100),
      db.from('pairing_waitlist').select('id,status,priority_points,reason,created_at,round:matching_rounds(meeting_date),member:members(id,name,nickname,mentor_team)').eq('status','waiting').order('priority_points',{ascending:false}).limit(100),
      db.from('one_to_one_follow_up_actions').select('id,action_type,description,due_date,status,outcome,owner:members!one_to_one_follow_up_actions_owner_member_id_fkey(id,name,nickname,mentor_team),related:members!one_to_one_follow_up_actions_related_member_id_fkey(id,name,nickname)').in('status',['pending','in_progress','overdue']).order('due_date',{ascending:true}).limit(100),
      db.from('one_to_one_attention_items').select('id,level,reason,evidence,positive_context,suggested_action,assigned_role,due_date,status,member:members(id,name,nickname,mentor_team),pair_id').in('status',['open','reviewed','snoozed']).order('created_at',{ascending:false}).limit(100),
      db.from('notification_budget_config').select('*').order('module'),
    ]);return jsonResponse({ok:true,active:active||[],waiting:waiting||[],followUps:followUps||[],attention:attention||[],budgets:budgets||[]});
  }
  if(action==='getOneToOneMemberHistory'){
    const memberIdInput=String(p.memberId||''),memberName=String(p.memberName||'').trim();let memberQuery=db.from('members').select('id,name,nickname,mentor_team,is_archived');if(memberIdInput)memberQuery=memberQuery.eq('id',memberIdInput);else memberQuery=memberQuery.eq('name',memberName);const {data:member,error:memberError}=await memberQuery.maybeSingle();if(memberError||!member)return errResponse(memberError?.message||'ไม่พบสมาชิก');const mv=member as Record<string,unknown>,memberId=String(mv.id);
    const {data:pairs,error:pairError}=await db.from('matching_pairs').select('id,round_id,status,member_a_id,member_b_id,optional_member_c_id,created_at,round:matching_rounds(meeting_date,ends_at,system_version),schedules:one_to_one_schedules(id,starts_at,status,meeting_mode)').or(`member_a_id.eq.${memberId},member_b_id.eq.${memberId},optional_member_c_id.eq.${memberId}`).order('created_at',{ascending:false}).limit(200);if(pairError)return errResponse(pairError.message);const pairRows=(pairs||[]) as Record<string,unknown>[],pairIds=pairRows.map(x=>String(x.id)),partnerIds=[...new Set(pairRows.flatMap(x=>[x.member_a_id,x.member_b_id,x.optional_member_c_id].filter(Boolean).map(String)).filter(id=>id!==memberId))];
    const [{data:partners},{data:feedback},{data:followUps},{data:waiting},{data:attention},{data:legacy}]=await Promise.all([
      partnerIds.length?db.from('members').select('id,name,nickname,mentor_team,is_archived').in('id',partnerIds):Promise.resolve({data:[]}),
      pairIds.length?db.from('one_to_one_feedback').select('id,pair_id,respondent_member_id,about_member_id,visibility,learned,outcomes,next_action_type,next_action_detail,created_at').in('pair_id',pairIds).order('created_at',{ascending:false}):Promise.resolve({data:[]}),
      pairIds.length?db.from('one_to_one_follow_up_actions').select('id,pair_id,action_type,description,owner_member_id,related_member_id,due_date,status,completed_at,outcome').in('pair_id',pairIds).order('created_at',{ascending:false}):Promise.resolve({data:[]}),
      db.from('pairing_waitlist').select('id,round_id,status,priority_points,reason,created_at,round:matching_rounds(meeting_date)').eq('member_id',memberId).order('created_at',{ascending:false}),
      db.from('one_to_one_attention_items').select('id,pair_id,level,reason,suggested_action,status,due_date,created_at,resolved_at').eq('member_id',memberId).order('created_at',{ascending:false}),
      db.from('one_to_one_logs').select('id,initiator_id,partner_id,partner_name,notes,outcome,met_at,scheduled_date,created_at').or(`initiator_id.eq.${memberId},partner_id.eq.${memberId}`).order('created_at',{ascending:false}).limit(200),
    ]);const partnerMap=new Map(((partners||[]) as Record<string,unknown>[]).map(x=>[String(x.id),x]));const feedbackRows=(feedback||[]) as Record<string,unknown>[],followRows=(followUps||[]) as Record<string,unknown>[];
    const history=pairRows.map(pair=>{const ids=[pair.member_a_id,pair.member_b_id,pair.optional_member_c_id].filter(Boolean).map(String).filter(id=>id!==memberId),round=(pair.round||{}) as Record<string,unknown>,schedules=(pair.schedules||[]) as Record<string,unknown>[];return{id:String(pair.id),meetingDate:String(round.meeting_date||''),systemVersion:Number(round.system_version||1),legacyGroup:Boolean(pair.optional_member_c_id),status:String(pair.status||'matched'),partners:ids.map(id=>partnerMap.get(id)||{id,name:'สมาชิกที่ Archive แล้ว',is_archived:true}),schedule:schedules.sort((a,b)=>String(b.starts_at).localeCompare(String(a.starts_at)))[0]||null,sharedFeedback:feedbackRows.filter(x=>String(x.pair_id)===String(pair.id)&&String(x.visibility)==='shared'),privateFeedback:feedbackRows.filter(x=>String(x.pair_id)===String(pair.id)&&String(x.visibility)==='private_mentor'),followUps:followRows.filter(x=>String(x.pair_id)===String(pair.id))};});
    const verified=history.filter(x=>['verified','late_verified'].includes(x.status)).length,onTime=history.filter(x=>x.status==='verified').length,opportunities=feedbackRows.filter(x=>Array.isArray(x.outcomes)&&(x.outcomes as unknown[]).some(v=>['referral_opportunity','collaboration','connection'].includes(String(v)))).length,pendingFollowUps=followRows.filter(x=>['pending','in_progress','overdue'].includes(String(x.status))).length;const relationships=[...partnerMap.entries()].map(([partnerId,partner])=>{const related=history.filter(x=>x.partners.some((m:Record<string,unknown>)=>String(m.id)===partnerId));return{partner,count:related.length,lastDate:related.map(x=>x.meetingDate).sort().reverse()[0]||'',verified:related.filter(x=>['verified','late_verified'].includes(x.status)).length,pendingFollowUps:related.flatMap(x=>x.followUps).filter(x=>['pending','in_progress','overdue'].includes(String(x.status))).length};}).sort((a,b)=>b.lastDate.localeCompare(a.lastDate));
    return jsonResponse({ok:true,member:mv,stats:{matched:history.length,verified,completionRate:history.length?Math.round(verified/history.length*100):0,onTimeRate:verified?Math.round(onTime/verified*100):0,lastDate:history.map(x=>x.meetingDate).filter(Boolean).sort().reverse()[0]||null,opportunities,pendingFollowUps,waitingCount:(waiting||[]).length},history,relationships,waiting:waiting||[],attention:attention||[],legacy:legacy||[]});
  }
  if(action==='updateOneToOneFollowUp'){
    const id=String(p.id||''),status=String(p.status||'');if(!['pending','in_progress','completed','cancelled','overdue'].includes(status))return errResponse('สถานะ Follow-up ไม่ถูกต้อง');const changes:Record<string,unknown>={status,outcome:String(p.outcome||'').trim()||null};if(status==='completed')changes.completed_at=new Date().toISOString();const {error}=await db.from('one_to_one_follow_up_actions').update(changes).eq('id',id);return error?errResponse(error.message):jsonResponse({ok:true});
  }
  if(action==='updateOneToOneAttention'){
    const id=String(p.id||''),status=String(p.status||'');if(!['open','reviewed','snoozed','resolved','no_action_required'].includes(status))return errResponse('สถานะ Attention ไม่ถูกต้อง');const changes:Record<string,unknown>={status,resolution:String(p.resolution||'').trim()||null,assigned_role:String(p.assignedRole||auth.role||'').trim()||null};if(status==='resolved'||status==='no_action_required')changes.resolved_at=new Date().toISOString();if(status==='snoozed')changes.snoozed_until=String(p.snoozedUntil||new Date(Date.now()+86400000).toISOString());const {error}=await db.from('one_to_one_attention_items').update(changes).eq('id',id);if(!error)await db.from('one_to_one_status_events').insert({event_type:'attention_override',actor_type:'mentor',actor_ref:String(auth.role),metadata:{attentionId:id,status,resolution:changes.resolution}});return error?errResponse(error.message):jsonResponse({ok:true});
  }
  if(action==='getOneToOnePilotSettings'){
    const [{data:settings},{data:members},{data:budgets}]=await Promise.all([db.from('settings').select('key,value').in('key',['FEATURE_ONE_TO_ONE_SYSTEM','ONE_TO_ONE_EMERGENCY_STOP','ONE_TO_ONE_PILOT_MEMBER_IDS']),db.from('members').select('id,name,nickname,mentor_team').eq('is_archived',false).order('name'),db.from('notification_budget_config').select('*').in('module',['global','one_to_one']).order('module')]);const map=new Map(((settings||[]) as Record<string,unknown>[]).map(x=>[String(x.key),String(x.value)]));let pilotIds:string[]=[];try{pilotIds=JSON.parse(map.get('ONE_TO_ONE_PILOT_MEMBER_IDS')||'[]');}catch{pilotIds=[];}return jsonResponse({ok:true,featureEnabled:map.get('FEATURE_ONE_TO_ONE_SYSTEM')==='true',emergencyStop:map.get('ONE_TO_ONE_EMERGENCY_STOP')==='true',pilotIds,members:members||[],budgets:budgets||[]});
  }
  if(action==='saveOneToOnePilotSettings'){
    const pilotIds=Array.isArray(p.pilotIds)?[...new Set((p.pilotIds as unknown[]).map(String).filter(Boolean))]:[];if(pilotIds.length>200)return errResponse('Pilot มีสมาชิกมากเกินกำหนด');const featureEnabled=Boolean(p.featureEnabled),emergencyStop=Boolean(p.emergencyStop);const {error}=await db.from('settings').upsert([{key:'FEATURE_ONE_TO_ONE_SYSTEM',value:String(featureEnabled)},{key:'ONE_TO_ONE_EMERGENCY_STOP',value:String(emergencyStop)},{key:'ONE_TO_ONE_PILOT_MEMBER_IDS',value:JSON.stringify(pilotIds)}],{onConflict:'key'});if(error)return errResponse(error.message);await db.from('one_to_one_status_events').insert({event_type:'pilot_settings_updated',actor_type:'admin',actor_ref:String(auth.role),metadata:{featureEnabled,emergencyStop,pilotCount:pilotIds.length}});return jsonResponse({ok:true,featureEnabled,emergencyStop,pilotCount:pilotIds.length});
  }
  if(action==='getOneToOneMessageControl'){
    const now=new Date(),monthStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString();const [{data:rows},{data:budgets}]=await Promise.all([db.from('line_message_deliveries').select('member_id,status,notification_type,priority,suppression_reason,estimated_count,created_at,members(name,nickname)').eq('module','one_to_one').gte('created_at',monthStart).order('created_at',{ascending:false}).limit(2000),db.from('notification_budget_config').select('*').in('module',['global','one_to_one'])]);const deliveries=(rows||[]) as Record<string,unknown>[],byStatus:Record<string,number>={},byType:Record<string,number>={},byPriority:Record<string,number>={},suppressed:Record<string,number>={},recipientCounts:Record<string,{name:string;count:number}>={};deliveries.forEach(x=>{const count=Number(x.estimated_count||1),status=String(x.status||'unknown'),type=String(x.notification_type||'unknown'),priority=String(x.priority||'unspecified');byStatus[status]=(byStatus[status]||0)+count;byType[type]=(byType[type]||0)+count;byPriority[priority]=(byPriority[priority]||0)+count;if(x.suppression_reason)suppressed[String(x.suppression_reason)]=(suppressed[String(x.suppression_reason)]||0)+count;const id=String(x.member_id||'unknown'),m=(x.members||{}) as Record<string,unknown>;if(!recipientCounts[id])recipientCounts[id]={name:String(m.nickname||m.name||'ไม่ระบุ'),count:0};recipientCounts[id].count+=count;});const sent=byStatus.sent||0,day=Math.max(1,now.getUTCDate()),daysInMonth=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,0)).getUTCDate(),forecast=Math.round(sent/day*daysInMonth);return jsonResponse({ok:true,monthStart,sent,forecast,byStatus,byType,byPriority,suppressed,topRecipients:Object.values(recipientCounts).sort((a,b)=>b.count-a.count).slice(0,10),budgets:budgets||[]});
  }
  if (action === 'getWeekly121History') { const {data,error}=await db.from('matching_rounds').select('id,meeting_date,source_file_name,status,repeat_window_weeks,created_by,created_at,confirmed_at,matching_pairs(count)').order('meeting_date',{ascending:false}).limit(30); return error?errResponse(error.message):jsonResponse({ok:true,rounds:data||[]}); }

  if (action === 'sendWeekly121Round') {
    const roundId=String(p.roundId||''); const dryRun=p.dryRun!==false; const testMode=Boolean(p.testMode);
    const detail=await loadDetail(db,roundId); if(!detail)return errResponse('ไม่พบรอบจับคู่');
    if(!dryRun && !Boolean(p.confirmed))return errResponse('ต้องยืนยันก่อนส่ง LINE');
    const previews=buildPreviews(detail.pairs,detail.looking,String((detail.round as Record<string,unknown>).message_template_key||'growth_opportunity'));const guardedPreviews=await Promise.all(previews.map(async item=>({...item,guard:await evaluateNotificationGuard(db,{memberId:item.recipient.id,module:'one_to_one',category:testMode?'weekly_121_test':'weekly_121_matching',priority:'action_required'})})));
    if(dryRun)return jsonResponse({ok:true,dryRun:true,testMode,previews:guardedPreviews,messageCount:guardedPreviews.filter(x=>x.guard.allowed&&x.lineUserId).length,suppressed:guardedPreviews.filter(x=>!x.guard.allowed).map(x=>({name:x.recipient.name,reason:x.guard.reason})),unsendable:guardedPreviews.filter(x=>!x.lineUserId).map(x=>x.recipient.name),budget:guardedPreviews[0]?.guard||null});
    if(!testMode)await db.from('matching_rounds').update({status:'sending',confirmed_by:String(auth.displayName||auth.role),confirmed_at:new Date().toISOString()}).eq('id',roundId).eq('status','draft');
    let sent=0,failed=0,skipped=0;
    for(const item of guardedPreviews){if(!item.lineUserId){failed++;continue;}const key=`weekly-121${testMode?'-test':''}:${roundId}:${item.recipient.id}`;if(!item.guard.allowed){skipped++;await logSuppressedNotification(db,{memberId:item.recipient.id,module:'one_to_one',category:testMode?'weekly_121_test':'weekly_121_matching',priority:'action_required'},item.guard,key,item.lineUserId);continue;}try{const outgoing=testMode?weekly121TestMessage(item.message):item.message;const result=await linePush(item.lineUserId,outgoing,{db,idempotencyKey:key,memberId:item.recipient.id,notificationType:testMode?'weekly_121_test':'weekly_121_matching',source:'api/weekly-121'});if(result.skipped)skipped++;else sent++;if(result.deliveryId)await db.from('line_message_deliveries').update({matching_round_id:roundId,matching_pair_id:item.pairId,module:'one_to_one',category:testMode?'weekly_121_test':'weekly_121_matching',priority:'action_required',estimated_count:1}).eq('id',result.deliveryId);}catch(e){failed++;console.error('[weekly-121-send]',roundId,item.recipient.id,e);}}
    if(testMode)return jsonResponse({ok:true,testMode:true,status:failed?'partially_failed':'tested',sent,failed,skipped});
    const status=failed?'partially_failed':'sent';await db.from('matching_rounds').update({status}).eq('id',roundId);
    return jsonResponse({ok:true,testMode:false,status,sent,failed,skipped});
  }
  return errResponse(`Unknown weekly 1-2-1 action: ${action}`);
}

async function loadDetail(db:any,roundId:string){const {data:round}=await db.from('matching_rounds').select('*').eq('id',roundId).maybeSingle();if(!round)return null;const {data:pairs}=await db.from('matching_pairs').select('id,position,is_locked,member_a:members!matching_pairs_member_a_id_fkey(id,name,nickname,profession,company_name,mentor_team),member_b:members!matching_pairs_member_b_id_fkey(id,name,nickname,profession,company_name,mentor_team),member_c:members!matching_pairs_optional_member_c_id_fkey(id,name,nickname,profession,company_name,mentor_team)').eq('round_id',roundId).order('position');const ids=((pairs||[]) as Record<string,unknown>[]).flatMap(x=>[x.member_a,x.member_b,x.member_c].filter(Boolean).map(m=>String((m as Record<string,unknown>).id)));const [{data:links},{data:rows},{data:biz},{data:deliveries}]=await Promise.all([db.from('line_members').select('member_id,line_user_id').in('member_id',ids),db.from('matching_import_rows').select('row_number,matched_member_id,looking_for,import_status').eq('round_id',roundId),db.from('biz_profiles').select('member_id,description').in('member_id',ids),db.from('line_message_deliveries').select('member_id,status,response_status,last_error,sent_at,notification_type,attempts').eq('matching_round_id',roundId).order('created_at',{ascending:false})]);const line=new Map(((links||[]) as Record<string,unknown>[]).map(x=>[String(x.member_id),String(x.line_user_id)]));const looking=new Map(((rows||[]) as Record<string,unknown>[]).map(x=>[String(x.matched_member_id),String(x.looking_for||'')]));const order=new Map(((rows||[]) as Record<string,unknown>[]).map(x=>[String(x.matched_member_id),Number(x.row_number)||0]));const business=new Map(((biz||[]) as Record<string,unknown>[]).map(x=>[String(x.member_id),String(x.description||'')]));const deliveryByMember=new Map<string,Record<string,unknown>>();((deliveries||[]) as Record<string,unknown>[]).forEach(x=>{const key=String(x.member_id);if(!deliveryByMember.has(key))deliveryByMember.set(key,x);});const decorated=((pairs||[]) as Record<string,unknown>[]).map(pair=>{const members=[pair.member_a,pair.member_b,pair.member_c].filter(Boolean).map(m=>{const x=m as Record<string,unknown>,id=String(x.id);return{...x,lineUserId:line.get(id)||'',business:business.get(id)||String(x.profession||x.company_name||''),lookingFor:looking.get(id)||'',checkinOrder:order.get(id)||0,delivery:deliveryByMember.get(id)||null}});const type=String((round as Record<string,unknown>).matching_type||'random');const reasons:string[]=[];if(type==='checkin_mix')reasons.push('สลับสมาชิกจากลำดับ Check-in คนละช่วง');if(type==='looking_for'||type==='smart_mix')reasons.push('พิจารณา Looking for เทียบกับธุรกิจ');if((type==='cross_team'||type==='smart_mix')&&new Set(members.map(m=>String((m as Record<string,unknown>).mentor_team||''))).size>1)reasons.push('เชื่อม Network ข้ามทีม Mentor');if(type==='random')reasons.push('สุ่มใหม่โดยหลีกเลี่ยงคู่ซ้ำ');return{...pair,members,matchReasons:reasons};});return{round,pairs:decorated,looking,deliveries:deliveries||[]};}
function buildPreviews(pairs:Record<string,unknown>[],looking:Map<string,string>,selectedTemplate='growth_opportunity'){return pairs.flatMap(pair=>{const members=pair.members as Record<string,unknown>[];return members.map(recipient=>{const partners=members.filter(x=>x.id!==recipient.id).map(x=>({name:String(x.name),business:String(x.business||''),lookingFor:looking.get(String(x.id))||''}));return{pairId:String(pair.id),recipient:{id:String(recipient.id),name:String(recipient.name)},lineUserId:String(recipient.lineUserId||''),message:weekly121Message({name:String(recipient.name),business:String(recipient.business||''),lookingFor:looking.get(String(recipient.id))||''},partners,selectedTemplate)};});});}
async function getRound(db:any,roundId:string){const d=await loadDetail(db,roundId);if(!d)return errResponse('ไม่พบรอบจับคู่');const {data:waiting}=await db.from('pairing_waitlist').select('id,status,priority_points,reason,member:members(id,name,nickname,mentor_team,profession)').eq('round_id',roundId).eq('status','waiting').order('priority_points',{ascending:false});return jsonResponse({ok:true,round:d.round,pairs:d.pairs,waiting:waiting||[],templates:MESSAGE_TEMPLATES,previews:buildPreviews(d.pairs,d.looking,String((d.round as Record<string,unknown>).message_template_key||'growth_opportunity'))});}

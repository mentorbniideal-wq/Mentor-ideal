import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';
import { createWeekly121Matches, normalize121Name, parseWeekly121Csv, weekly121Message } from '../../_shared/weekly-121.ts';
import { linePush } from '../../_shared/line.ts';

const isoDate = (value: string) => { const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : value; };
const pairKey = (a: string, b: string) => [a,b].sort().join('|');

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
    const { data: round, error:rErr } = await db.from('matching_rounds').insert({meeting_date:isoDate(selectedDate),source_file_name:fileName,repeat_window_weeks:Number(p.repeatWindowWeeks||12),created_by:String(auth.displayName||auth.role)}).select('id').single();
    if (rErr||!round) return errResponse(rErr?.message||'สร้างรอบไม่สำเร็จ'); const roundId=String((round as Record<string,unknown>).id);
    const inserts=reconciled.map(r=>({round_id:roundId,row_number:r.rowNumber,first_name_en:r.firstName,last_name_en:r.lastName,normalized_name:r.normalizedName,substitute_name:r.substituteFor||null,looking_for:r.lookingFor||null,checkin_date:isoDate(r.date),checkin_time:r.time||null,matched_member_id:r.member ? String((r.member as Record<string,unknown>).id) : null,import_status:r.status,validation_message:r.message}));
    const { error:iErr }=await db.from('matching_import_rows').insert(inserts); if(iErr)return errResponse(iErr.message);
    return jsonResponse({ok:true,roundId,meetingDate:selectedDate,dates:parsed.dates,rows:reconciled,summary:Object.fromEntries(['ready','no_line','not_found','ambiguous','substitute','duplicate'].map(s=>[s,reconciled.filter(r=>r.status===s).length]))});
  }

  if (action === 'generateWeekly121Matches') {
    const roundId=String(p.roundId||''); if(!roundId)return errResponse('roundId required');
    const {data:round}=await db.from('matching_rounds').select('*').eq('id',roundId).single(); if(!round)return errResponse('ไม่พบรอบจับคู่');
    if(String((round as Record<string,unknown>).status)!=='draft')return errResponse('แก้ไขได้เฉพาะร่าง');
    const {data:rows}=await db.from('matching_import_rows').select('matched_member_id,looking_for,members(id,name,nickname,is_new_member)').eq('round_id',roundId).eq('import_status','ready');
    let eligible=(rows||[]) as Record<string,unknown>[]; const target=String(p.target||'all');
    const selected=new Set(Array.isArray(p.memberIds)?(p.memberIds as unknown[]).map(String):[]);
    if(target==='manual')eligible=eligible.filter(r=>selected.has(String(r.matched_member_id)));
    const memberIds=eligible.map(r=>String(r.matched_member_id));
    if(target==='yellow' && memberIds.length){const {data:yellow}=await db.from('v_member_dashboard').select('id').in('id',memberIds).eq('traffic_light','yellow');const set=new Set(((yellow||[]) as Record<string,unknown>[]).map(x=>String(x.id)));eligible=eligible.filter(r=>set.has(String(r.matched_member_id)));}
    if(target==='new')eligible=eligible.filter(r=>Boolean((r.members as Record<string,unknown>|null)?.is_new_member));
    if(eligible.length<2)return errResponse('ต้องมีสมาชิกพร้อมจับคู่อย่างน้อย 2 คน');
    const cutoff=new Date(String((round as Record<string,unknown>).meeting_date)); cutoff.setUTCDate(cutoff.getUTCDate()-Number((round as Record<string,unknown>).repeat_window_weeks||12)*7);
    const [{data:history},{data:forbidden},{data:lockedRows}]=await Promise.all([
      db.from('matching_pairs').select('member_a_id,member_b_id,optional_member_c_id,matching_rounds!inner(meeting_date)').gte('matching_rounds.meeting_date',cutoff.toISOString().slice(0,10)).neq('round_id',roundId),
      db.from('matching_forbidden_pairs').select('member_low_id,member_high_id').eq('is_active',true),
      db.from('matching_pairs').select('id,position,member_a_id,member_b_id,optional_member_c_id,is_locked').eq('round_id',roundId).eq('is_locked',true),
    ]);
    const blocked=new Set<string>(); ((history||[]) as Record<string,unknown>[]).forEach(h=>{const a=String(h.member_a_id),b=String(h.member_b_id),c=h.optional_member_c_id?String(h.optional_member_c_id):'';blocked.add(pairKey(a,b));if(c){blocked.add(pairKey(a,c));blocked.add(pairKey(b,c));}}); ((forbidden||[]) as Record<string,unknown>[]).forEach(x=>blocked.add(pairKey(String(x.member_low_id),String(x.member_high_id))));
    const map=new Map(eligible.map(r=>{const m=r.members as Record<string,unknown>;return[String(r.matched_member_id),{id:String(r.matched_member_id),name:String(m?.name||''),lookingFor:String(r.looking_for||'')}];}));
    const locked=((lockedRows||[]) as Record<string,unknown>[]).map(x=>({locked:true,members:[x.member_a_id,x.member_b_id,x.optional_member_c_id].filter(Boolean).map(id=>map.get(String(id))).filter(Boolean) as {id:string;name:string}[]})).filter(g=>g.members.length>=2);
    let groups; try{groups=createWeekly121Matches([...map.values()],blocked,locked);}catch(e){return errResponse(e instanceof Error?e.message:String(e));}
    await db.from('matching_pairs').delete().eq('round_id',roundId).eq('is_locked',false);
    const existingLocked=locked.length; const nextPosition=Math.max(0,...((lockedRows||[]) as Record<string,unknown>[]).map(x=>Number(x.position)||0))+1; const inserts=groups.slice(existingLocked).map((g,i)=>({round_id:roundId,position:nextPosition+i,member_a_id:g.members[0].id,member_b_id:g.members[1].id,optional_member_c_id:g.members[2]?.id||null}));
    if(inserts.length){const {error}=await db.from('matching_pairs').insert(inserts);if(error)return errResponse(error.message);}
    await db.from('matching_rounds').update({version:Number((round as Record<string,unknown>).version||1)+1}).eq('id',roundId);
    return getRound(db,roundId);
  }

  if (action === 'setWeekly121PairLock') { const id=String(p.pairId||''); const {error}=await db.from('matching_pairs').update({is_locked:Boolean(p.locked)}).eq('id',id); return error?errResponse(error.message):jsonResponse({ok:true}); }
  if (action === 'getWeekly121Round') return getRound(db,String(p.roundId||''));
  if (action === 'getWeekly121History') { const {data,error}=await db.from('matching_rounds').select('id,meeting_date,source_file_name,status,repeat_window_weeks,created_by,created_at,confirmed_at,matching_pairs(count)').order('meeting_date',{ascending:false}).limit(30); return error?errResponse(error.message):jsonResponse({ok:true,rounds:data||[]}); }

  if (action === 'sendWeekly121Round') {
    const roundId=String(p.roundId||''); const dryRun=p.dryRun!==false;
    const detail=await loadDetail(db,roundId); if(!detail)return errResponse('ไม่พบรอบจับคู่');
    if(!dryRun && !Boolean(p.confirmed))return errResponse('ต้องยืนยันก่อนส่ง LINE');
    const previews=buildPreviews(detail.pairs,detail.looking);
    if(dryRun)return jsonResponse({ok:true,dryRun:true,previews,messageCount:previews.length,unsendable:previews.filter(x=>!x.lineUserId).map(x=>x.recipient.name)});
    await db.from('matching_rounds').update({status:'sending',confirmed_by:String(auth.displayName||auth.role),confirmed_at:new Date().toISOString()}).eq('id',roundId).eq('status','draft');
    let sent=0,failed=0,skipped=0;
    for(const item of previews){if(!item.lineUserId){failed++;continue;}try{const key=`weekly-121:${roundId}:${item.recipient.id}`;const result=await linePush(item.lineUserId,item.message,{db,idempotencyKey:key,memberId:item.recipient.id,notificationType:'weekly_121_matching',source:'api/weekly-121'});if(result.skipped)skipped++;else sent++;if(result.deliveryId)await db.from('line_message_deliveries').update({matching_round_id:roundId,matching_pair_id:item.pairId}).eq('id',result.deliveryId);}catch(e){failed++;console.error('[weekly-121-send]',roundId,item.recipient.id,e);}}
    const status=failed?'partially_failed':'sent';await db.from('matching_rounds').update({status}).eq('id',roundId);
    return jsonResponse({ok:true,status,sent,failed,skipped});
  }
  return errResponse(`Unknown weekly 1-2-1 action: ${action}`);
}

async function loadDetail(db:any,roundId:string){const {data:round}=await db.from('matching_rounds').select('*').eq('id',roundId).maybeSingle();if(!round)return null;const {data:pairs}=await db.from('matching_pairs').select('id,position,is_locked,member_a:members!matching_pairs_member_a_id_fkey(id,name,nickname,profession,company_name),member_b:members!matching_pairs_member_b_id_fkey(id,name,nickname,profession,company_name),member_c:members!matching_pairs_optional_member_c_id_fkey(id,name,nickname,profession,company_name)').eq('round_id',roundId).order('position');const ids=((pairs||[]) as Record<string,unknown>[]).flatMap(x=>[x.member_a,x.member_b,x.member_c].filter(Boolean).map(m=>String((m as Record<string,unknown>).id)));const [{data:links},{data:rows},{data:biz}]=await Promise.all([db.from('line_members').select('member_id,line_user_id').in('member_id',ids),db.from('matching_import_rows').select('matched_member_id,looking_for').eq('round_id',roundId),db.from('biz_profiles').select('member_id,description').in('member_id',ids)]);const line=new Map(((links||[]) as Record<string,unknown>[]).map(x=>[String(x.member_id),String(x.line_user_id)]));const looking=new Map(((rows||[]) as Record<string,unknown>[]).map(x=>[String(x.matched_member_id),String(x.looking_for||'')]));const business=new Map(((biz||[]) as Record<string,unknown>[]).map(x=>[String(x.member_id),String(x.description||'')]));const decorated=((pairs||[]) as Record<string,unknown>[]).map(pair=>({...pair,members:[pair.member_a,pair.member_b,pair.member_c].filter(Boolean).map(m=>{const x=m as Record<string,unknown>;return{...x,lineUserId:line.get(String(x.id))||'',business:business.get(String(x.id))||String(x.profession||x.company_name||'')}})}));return{round,pairs:decorated,looking};}
function buildPreviews(pairs:Record<string,unknown>[],looking:Map<string,string>){return pairs.flatMap(pair=>{const members=pair.members as Record<string,unknown>[];return members.map(recipient=>{const partners=members.filter(x=>x.id!==recipient.id).map(x=>({name:String(x.name),business:String(x.business||''),lookingFor:looking.get(String(x.id))||''}));return{pairId:String(pair.id),recipient:{id:String(recipient.id),name:String(recipient.name)},lineUserId:String(recipient.lineUserId||''),message:weekly121Message({name:String(recipient.name),business:String(recipient.business||''),lookingFor:looking.get(String(recipient.id))||''},partners)};});});}
async function getRound(db:any,roundId:string){const d=await loadDetail(db,roundId);return d?jsonResponse({ok:true,round:d.round,pairs:d.pairs,previews:buildPreviews(d.pairs,d.looking)}):errResponse('ไม่พบรอบจับคู่');}

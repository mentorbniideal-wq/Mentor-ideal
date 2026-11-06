// FILE: power-teams.ts
// Handler: power-teams — getPowerTeams, getPTMembers, savePTMember, deletePTMember,
//   setPTMemberStatus, updatePTMember, movePTMember, moveSynMember,
//   getCrossTeamSynergy, saveCrossTeamPair
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';
import { resolveChapterScope } from '../../_shared/chapter-scope.ts';
import { CAPABILITY, hasCapability } from '../../_shared/capabilities.ts';
import { resolveMsbPlanningYear } from '../../_shared/msb-planning-year.ts';
import { projectBlueprintProposal, blueprintCategoryKey } from '../../_shared/blueprint-growth-privacy.ts';


function cleanText(value: unknown, limit: number): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, limit);
}

export async function powerTeamCandidates(
  db: ReturnType<typeof getServiceClient>,
  chapterId: string,
  respectReferralConsent = false,
) {
  const year = await resolveMsbPlanningYear(db, { chapterId });
  const { data: scopedMembers, error: scopeError } = await db.from('members').select('id')
    .eq('chapter_id', chapterId).eq('is_archived', false);
  if (scopeError) throw new Error(scopeError.message);
  const scopedIds = (scopedMembers || []).map((member: Record<string, unknown>) => String(member.id));
  if (!scopedIds.length) return [];
  const { data: plans, error: planError } = await db.from('member_success_blueprints')
    .select('member_id,blueprint_year,power_team_categories,power_team_detail,updated_at')
    .in('member_id', scopedIds).eq('blueprint_year', year).eq('status', 'submitted')
    .order('blueprint_year', { ascending: false }).order('updated_at', { ascending: false });
  if (planError) throw new Error(planError.message);
  const newestByMember = new Map<string, Record<string, unknown>>();
  for (const plan of (plans || []) as Record<string, unknown>[]) {
    const memberId = String(plan.member_id || '');
    if (memberId && !newestByMember.has(memberId)) newestByMember.set(memberId, plan);
  }
  const ids = [...newestByMember.keys()];
  if (!ids.length) return [];
  const consentByMember = new Map<string, Record<string, unknown>>();
  if (respectReferralConsent) {
    const {data:profiles,error:profileError}=await db.from('member_blueprint_growth_consents').select('member_id,share_business,share_referral_focus,share_details').eq('blueprint_year',year).eq('chapter_id',chapterId).in('member_id',ids);
    if(profileError)throw new Error(profileError.message);
    for(const profile of (profiles||[]) as Record<string,unknown>[])consentByMember.set(String(profile.member_id),profile);
  }
  const { data: members, error: memberError } = await db.from('members')
    .select('id,name,nickname,profession,company_name,is_archived').in('id', ids).eq('chapter_id', chapterId).eq('is_archived', false);
  if (memberError) throw new Error(memberError.message);
  const groups = new Map<string, { category:string; memberIds: string[]; members: Record<string, unknown>[]; details: string[] }>();
  for (const member of (members || []) as Record<string, unknown>[]) {
    const plan = newestByMember.get(String(member.id));
    const consent = consentByMember.get(String(member.id));
    const rawCategories = Array.isArray(plan?.power_team_categories) ? plan.power_team_categories : [];
    const categories = respectReferralConsent && consent?.share_referral_focus !== true ? [] : rawCategories;
    // Blueprint detail is free text. An explicit category grant does not prove
    // that every phrase in the detail is shareable, so hide it when the member
    // has disabled full referral sharing.
    const detail = !respectReferralConsent || consent?.share_details === true
      ? cleanText(plan?.power_team_detail, 500) : '';
    for (const rawCategory of categories) {
      const category = cleanText(rawCategory, 120);
      if (!category) continue;
      const key=blueprintCategoryKey(category);
      const group = groups.get(key) || { category,memberIds: [], members: [], details: [] };
      if(group.memberIds.includes(String(member.id)))continue;
      group.memberIds.push(String(member.id)); group.members.push(member);
      if (detail && !group.details.includes(detail)) group.details.push(detail);
      groups.set(key, group);
    }
  }
  return [...groups.entries()].filter(([, group]) => group.memberIds.length >= 2)
    .map(([, group]) => ({
      category:group.category,
      memberIds: group.memberIds,
      members: group.members.map(member => {
        const profile = consentByMember.get(String(member.id));
        const showBusiness = !respectReferralConsent || profile?.share_business === true;
        return { id: member.id, name: member.name, nickname: member.nickname,
          profession: showBusiness ? member.profession : '', companyName: showBusiness ? member.company_name : '' };
      }),
      targetCustomerGroup: group.details.slice(0, 3).join(' · ') || `กลุ่มลูกค้าที่เกี่ยวข้องกับ ${group.category}`,
      rationale: `สมาชิก ${group.memberIds.length} คนระบุ ${group.category} ใน Blueprint จึงควรทดลอง 1-2-1 เพื่อพิสูจน์ว่ามีกลุ่มลูกค้าและ referral trigger ร่วมกัน`,
    })).sort((a, b) => b.memberIds.length - a.memberIds.length || a.category.localeCompare(b.category, 'th'));
}

/**
 * Growth works from declared Blueprint Power Team categories, never from a
 * Mentor ownership team. Keep the performance fields that the existing Growth
 * UI needs, while deriving every member ID from the authenticated Chapter.
 */
async function fetchGrowthPowerTeamOverview(
  db: ReturnType<typeof getServiceClient>,
  chapterId: string,
  respectReferralConsent = false,
) {
  const candidates = await powerTeamCandidates(db, chapterId, respectReferralConsent);
  const memberIds = [...new Set(candidates.flatMap(candidate => candidate.memberIds))];
  if (!memberIds.length) {
    return {
      teams: [],
      summary: { overallPct: 0, totalGoal: 0, totalRecv: 0, memberCount: 0, activeTotal: 0, departedTotal: 0 },
    };
  }

  // Candidate IDs have already been constrained by chapter_id above. The
  // second membership check prevents a dashboard view from widening scope.
  const { data: scopedMembers, error: memberError } = await db.from('members')
    .select('id').in('id', memberIds).eq('chapter_id', chapterId).eq('is_archived', false);
  if (memberError) throw new Error(memberError.message);
  const scopedIds = (scopedMembers || []).map((member: Record<string, unknown>) => String(member.id));
  if (!scopedIds.length) {
    return {
      teams: [],
      summary: { overallPct: 0, totalGoal: 0, totalRecv: 0, memberCount: 0, activeTotal: 0, departedTotal: 0 },
    };
  }
  const { data: dashboardRows, error: dashboardError } = await db.from('v_member_dashboard')
    .select('id,name,nickname,mentor_team,display_score,traffic_light,given_thb,received_thb,bni_goal')
    .in('id', scopedIds);
  if (dashboardError) throw new Error(dashboardError.message);
  const byId = new Map((dashboardRows || []).map((row: Record<string, unknown>) => [String(row.id), row]));
  const tlShort: Record<string, string> = { green: 'G', yellow: 'Y', red: 'R', black: 'B', none: '' };

  const teams = candidates.map((candidate, index) => {
    const members = candidate.memberIds.map(id => byId.get(id)).filter(Boolean) as Record<string, unknown>[];
    const teamGoal = members.reduce((sum, member) => sum + (Number(member.bni_goal) || 0), 0);
    const teamRecv = members.reduce((sum, member) => sum + (Number(member.received_thb) || 0), 0);
    const scored = members.filter(member => Number(member.display_score) > 0);
    const avgScore = scored.length ? Math.round(scored.reduce((sum, member) => sum + (Number(member.display_score) || 0), 0) / scored.length) : 0;
    return {
      id: `power-${index + 1}`,
      name: candidate.category,
      team: candidate.category,
      icon: '⚡',
      targetCustomerGroup: candidate.targetCustomerGroup,
      rationale: candidate.rationale,
      members: members.map((member, memberIndex) => {
        const goal = Number(member.bni_goal) || 0;
        const recv = Number(member.received_thb) || 0;
        return {
          row: memberIndex + 1,
          id: String(member.id), name: String(member.name || ''), nick: String(member.nickname || ''),
          firstName: String(member.name || ''), lastName: '', profession: '',
          tl: tlShort[String(member.traffic_light || 'none')] || '',
          bniGoal: goal, recv, given: Number(member.given_thb) || 0,
          goalPct: goal > 0 ? (recv / goal) * 100 : 0,
          score: Number(member.display_score) || 0,
          mentor: String(member.mentor_team || ''),
        };
      }),
      count: members.length, memberCount: members.length, teamGoal, teamRecv,
      teamPct: teamGoal > 0 ? (teamRecv / teamGoal) * 100 : 0,
      avgScore,
      redBlack: members.filter(member => ['red', 'black'].includes(String(member.traffic_light))).length,
      totalGiven: members.reduce((sum, member) => sum + (Number(member.given_thb) || 0), 0),
      totalRecv: teamRecv,
      suggestions: [],
    };
  }).filter(team => team.members.length >= 2);

  const uniqueMembers = [...byId.values()];
  const totalGoal = uniqueMembers.reduce((sum, member) => sum + (Number(member.bni_goal) || 0), 0);
  const totalRecv = uniqueMembers.reduce((sum, member) => sum + (Number(member.received_thb) || 0), 0);
  return {
    teams,
    summary: {
      overallPct: totalGoal > 0 ? (totalRecv / totalGoal) * 100 : 0,
      totalGoal, totalRecv, memberCount: uniqueMembers.length,
      activeTotal: uniqueMembers.length, departedTotal: 0,
    },
  };
}


export async function handlePowerTeams(p: Record<string, unknown>): Promise<Response> {
  const db     = getServiceClient();
  const action = String(p.action || '');
  // Legacy actions mixed Mentor ownership, Chapter membership and financial
  // source facts. Preserve history but never permit these service-role paths.
  if (['getPowerTeams','getPTMembers','savePTMember','deletePTMember','setPTMemberStatus','updatePTMember','movePTMember','moveSynMember'].includes(action)) {
    const auth=await requireAuth(db,p);
    if(!auth.ok)return errResponse(auth.error!,401);
    return errResponse('เมนู Power Team รุ่นเก่ายุติแล้ว กรุณาใช้ Power Team Hub; ข้อมูลเดิมยังเก็บไว้',410);
  }

  switch (action) {

    // These are proposals, not mentor teams and not official Power Teams.
    case 'getPowerTeamProposals': {
      const auth = await requireAuth(db, p, ['mc', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);
      try {
        const scope = await resolveChapterScope(db, auth);
        if (!scope.ok) return errResponse(scope.error, 403);
        const chapterId = scope.chapterId;
        const planningYear=await resolveMsbPlanningYear(db,{chapterId});
        const {data:roster,error:rosterError}=await db.from('members').select('id,name,nickname').eq('chapter_id',chapterId).eq('is_archived',false).order('name');
        if(rosterError)throw new Error(rosterError.message);
        const ids=(roster||[]).map((m:Record<string,unknown>)=>String(m.id));
        const [{data:submitted,error:submittedError},{data:shared,error:sharedError}]=await Promise.all([
          db.from('member_success_blueprints').select('member_id').in('member_id',ids.length?ids:['00000000-0000-0000-0000-000000000000']).eq('blueprint_year',planningYear).eq('status','submitted'),
          db.from('member_blueprint_growth_consents').select('member_id').eq('chapter_id',chapterId).eq('blueprint_year',planningYear).eq('share_referral_focus',true),
        ]);
        if(submittedError||sharedError)throw new Error('โหลดสถานะ Blueprint ไม่สำเร็จ');
        const sharing=new Set((shared||[]).map((m:Record<string,unknown>)=>String(m.member_id)));
        const [candidates, saved, published] = await Promise.all([
          powerTeamCandidates(db, chapterId, String(auth.role || '').toLowerCase() === 'growth'),
          db.from('power_team_proposals').select('id,title,target_customer_group,rationale,source_category,status,created_by,assigned_owner_email,assigned_owner_name,assigned_at,created_at,updated_at,blueprint_year,leader_member_id,supersedes_publication_id,power_team_proposal_members(member_id,participation_status,members(id,name,nickname,profession,company_name))')
            .eq('chapter_id', chapterId).order('updated_at', { ascending: false }),
          db.from('growth_power_team_publications').select('id,proposal_id,status,published_at,archived_at').eq('chapter_id', chapterId).order('published_at', { ascending: false }),
        ]);
        if (saved.error || published.error) throw new Error(saved.error?.message || published.error?.message);
        const coordinator = !auth.isViewer && !auth.isReadOnly && (auth.isMC || auth.isAdmin || hasCapability(auth, CAPABILITY.GROWTH_COORDINATE));
        const {data:growthOwners,error:ownerError}=coordinator?await db.from('role_assignments').select('email,display_name,access_starts_at,access_expires_at,read_only_after').eq('chapter_id',chapterId).eq('role','growth').eq('access_status','active'):{data:[],error:null};
        if(ownerError)throw new Error('โหลดผู้รับผิดชอบไม่สำเร็จ');
        const eligibleOwners=(growthOwners||[]).filter((owner:Record<string,unknown>)=>(!owner.access_starts_at||new Date(String(owner.access_starts_at)).getTime()<=Date.now())&&(!owner.access_expires_at||new Date(String(owner.access_expires_at)).getTime()>Date.now())&&(!owner.read_only_after||new Date(String(owner.read_only_after)).getTime()>Date.now())).map((owner:Record<string,unknown>)=>({email:owner.email,display_name:owner.display_name}));
        const rawProposals = coordinator ? (saved.data || []) : (saved.data || []).filter((row: Record<string, unknown>) => String(row.assigned_owner_email || '').toLowerCase() === String(auth.email || '').toLowerCase());
        const proposalMemberIds = [...new Set((saved.data || []).flatMap((row: Record<string, unknown>) => (Array.isArray(row.power_team_proposal_members) ? row.power_team_proposal_members : []).map((member: Record<string, unknown>) => String(member.member_id || '')).filter(Boolean)))];
        const { data: profileRows, error: profileError } = proposalMemberIds.length ? await db.from('member_blueprint_growth_consents').select('member_id,blueprint_year,share_referral_focus,share_details,share_business').eq('chapter_id',chapterId).in('member_id', proposalMemberIds) : { data: [], error: null };
        if (profileError) throw new Error(profileError.message);
        const referralByMember = new Map(((profileRows || []) as Record<string, unknown>[]).map(row => [String(row.member_id)+':'+String(row.blueprint_year), row]));
        // Conceal complete historical category/referral fields as one unit.
        const projectProposal=(row:Record<string,unknown>)=>String(auth.role||'').toLowerCase()==='growth'?projectBlueprintProposal(row,referralByMember):row;
        const publicationByProposal = new Map(((published.data || []) as Record<string, unknown>[]).map(row => [String(row.proposal_id), row]));
        const proposals = rawProposals.map(projectProposal).map(row => ({ ...row, officialStatus: publicationByProposal.get(String(row.id))?.status || null }));
        const proposalById = new Map(((saved.data || []) as Record<string, unknown>[]).map(row => [String(row.id), row]));
        const officialTeams = ((published.data || []) as Record<string, unknown>[]).map(publication => {
          const proposal = proposalById.get(String(publication.proposal_id));
          const safe = proposal ? projectProposal(proposal) : null;
          return { id: publication.id, proposalId: publication.proposal_id, status: publication.status, publishedAt: publication.published_at, archivedAt: publication.archived_at, title: safe?.title || '', leaderMemberId:safe?.leader_member_id||null, memberCount: safe?.member_count || (Array.isArray(safe?.power_team_proposal_members) ? safe.power_team_proposal_members.length : 0), members: safe?.power_team_proposal_members || [], detailRestricted: !safe || Boolean(safe.detailRestricted), targetCustomerGroup: safe?.target_customer_group || '' };
        });
        return jsonResponse({ ok: true, blueprintYear:planningYear,growthOwners:eligibleOwners, eligibleMembers:coordinator?roster:[], coverage:{activeMembers:ids.length,submitted:(submitted||[]).length,sharedCategories:(submitted||[]).filter((m:Record<string,unknown>)=>sharing.has(String(m.member_id))).length}, candidates: coordinator ? candidates : [], proposals, officialTeams, canCoordinate: coordinator, canApprove: Boolean(auth.isAdmin && auth.email && !auth.isViewer && !auth.isReadOnly), canManageAssigned: hasCapability(auth, CAPABILITY.GROWTH_TASK_MANAGE_ASSIGNED), viewerEmail: String(auth.email || '') });
      } catch (error) { return errResponse(error instanceof Error ? error.message : String(error)); }
    }

    case 'savePowerTeamProposal': {
      const auth = await requireAuth(db, p, ['mc', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);
      if (!auth.isMC && !auth.isAdmin && !hasCapability(auth, CAPABILITY.GROWTH_COORDINATE)) return errResponse('เฉพาะ Growth Coordinator เท่านั้นที่สร้างหรือมอบหมาย Proposal', 403);
      const title = cleanText(p.title, 120), targetCustomerGroup = cleanText(p.targetCustomerGroup, 500);
      const rationale = cleanText(p.rationale, 1500), sourceCategory = cleanText(p.sourceCategory, 120) || null;
      const memberIds = [...new Set(Array.isArray(p.memberIds) ? p.memberIds.map(value => String(value)).filter(Boolean) : [])];
      if (title.length < 2 || targetCustomerGroup.length < 2 || rationale.length < 5 || memberIds.length < 2) {
        return errResponse('ต้องระบุชื่อข้อเสนอ กลุ่มลูกค้า เหตุผล และสมาชิกอย่างน้อย 2 คน');
      }
      try {
        const scope = await resolveChapterScope(db, auth);
        if (!scope.ok) return errResponse(scope.error, 403);
        const chapterId = scope.chapterId;
        const { data: eligible, error: eligibleError } = await db.from('members').select('id').in('id', memberIds).eq('chapter_id', chapterId).eq('is_archived', false);
        if (eligibleError) throw new Error(eligibleError.message);
        if ((eligible || []).length !== memberIds.length) return errResponse('พบสมาชิกที่ไม่อยู่ในสถานะใช้งาน');
        const requestId=cleanText(p.requestId,80);
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))return errResponse('กรุณาเปิดฟอร์มใหม่ก่อนบันทึก',400);
        const {data:result,error}=await db.rpc('create_power_team_proposal_atomic',{
          p_chapter_id:chapterId,p_request_id:requestId,p_actor:String(auth.email||auth.displayName||auth.role),
          p_data:{title,targetCustomerGroup,rationale,sourceCategory,leaderMemberId:p.leaderMemberId||null,supersedesPublicationId:p.supersedesPublicationId||null},p_members:memberIds.sort(),
        });
        if(error)return errResponse('สร้างข้อเสนอไม่สำเร็จ กรุณาตรวจสมาชิกหรือโหลดรายการล่าสุดก่อนลองอีกครั้ง',409);
        return jsonResponse({ok:true,...result});
      } catch (error) { return errResponse(error instanceof Error ? error.message : String(error)); }
    }

    case 'updatePowerTeamProposal': {
      const auth = await requireAuth(db, p, ['mc', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);
      const scope = await resolveChapterScope(db, auth); if (!scope.ok) return errResponse(scope.error, 403);
      const proposalId = cleanText(p.proposalId, 80), status = cleanText(p.status, 30);
      if (!proposalId || !['draft','assigned','exploring','active','closed','archived'].includes(status)) return errResponse('proposalId หรือ status ไม่ถูกต้อง', 400);
      const { data: proposal } = await db.from('power_team_proposals').select('id,assigned_owner_email,status,rationale').eq('id', proposalId).eq('chapter_id', scope.chapterId).maybeSingle();
      const current = proposal as Record<string, unknown> | null; if (!current) return errResponse('ไม่พบ Proposal ใน Chapter นี้', 404);
      const { data: publication, error: publicationError } = await db.from('growth_power_team_publications').select('id').eq('proposal_id', proposalId).eq('chapter_id', scope.chapterId).maybeSingle();
      if (publicationError) return errResponse(publicationError.message);
      if (publication) return errResponse('Proposal ที่เผยแพร่เป็น Power Team แล้วแก้ไขไม่ได้', 409);
      const coordinator = auth.isMC || auth.isAdmin || hasCapability(auth, CAPABILITY.GROWTH_COORDINATE);
      const owns = Boolean(auth.email) && String(current.assigned_owner_email || '').toLowerCase() === String(auth.email || '').toLowerCase();
      if (!coordinator && !(owns && hasCapability(auth, CAPABILITY.GROWTH_TASK_MANAGE_ASSIGNED))) return errResponse('Proposal ต้องมอบหมายให้บัญชีของคุณก่อนจึงจะแก้ไขได้', 403);
      if (!coordinator && !['exploring','closed'].includes(status)) return errResponse('Growth owner เปลี่ยนได้เฉพาะ exploring หรือเสนอปิดงาน', 403);
      const patch: Record<string, unknown> = { status, updated_at:new Date().toISOString() };
      if (status === 'closed') {
        const closeReason = cleanText(p.closeReason, 1500);
        if (closeReason.length < 5) return errResponse('ต้องระบุเหตุผลหรือผลลัพธ์อย่างน้อย 5 ตัวอักษร', 400);
        patch.rationale = closeReason;
      }
      const {error}=await db.rpc('update_power_team_proposal_atomic',{p_chapter_id:scope.chapterId,p_proposal_id:proposalId,p_expected_updated_at:p.expectedUpdatedAt||null,p_actor:String(auth.email||auth.role),p_patch:patch});if(error)return errResponse('ข้อเสนอเปลี่ยนแล้วหรือบันทึกไม่สำเร็จ กรุณาโหลดใหม่',409);
      return jsonResponse({ ok:true });
    }

    case 'assignPowerTeamProposal': {
      const auth = await requireAuth(db, p, ['mc', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);
      if (!auth.isMC && !auth.isAdmin && !hasCapability(auth, CAPABILITY.GROWTH_COORDINATE)) return errResponse('เฉพาะ Growth Coordinator เท่านั้นที่มอบหมาย Proposal', 403);
      const scope = await resolveChapterScope(db, auth); if (!scope.ok) return errResponse(scope.error, 403);
      const proposalId = cleanText(p.proposalId, 80), ownerEmail = cleanText(p.ownerEmail, 255).toLowerCase(); if (!proposalId || !ownerEmail) return errResponse('proposalId และ ownerEmail required', 400);
      const { data: proposal, error: proposalError } = await db.from('power_team_proposals').select('id').eq('id', proposalId).eq('chapter_id', scope.chapterId).maybeSingle();
      if (proposalError) return errResponse(proposalError.message);
      if (!proposal) return errResponse('ไม่พบ Proposal ใน Chapter นี้', 404);
      const { data: publication, error: publicationError } = await db.from('growth_power_team_publications').select('id').eq('proposal_id', proposalId).eq('chapter_id', scope.chapterId).maybeSingle();
      if (publicationError) return errResponse(publicationError.message);
      if (publication) return errResponse('Proposal ที่เผยแพร่เป็น Power Team แล้วเปลี่ยนเจ้าของไม่ได้', 409);
      const { data: owner } = await db.from('role_assignments').select('email,display_name,role').eq('chapter_id', scope.chapterId).ilike('email', ownerEmail).eq('access_status','active').maybeSingle();
      if (!owner || String((owner as Record<string, unknown>).role) !== 'growth') return errResponse('ผู้รับผิดชอบต้องเป็น Growth ที่ active ใน Chapter นี้', 400);
      const {error}=await db.rpc('update_power_team_proposal_atomic',{p_chapter_id:scope.chapterId,p_proposal_id:proposalId,p_expected_updated_at:p.expectedUpdatedAt||null,p_actor:String(auth.email||auth.role),p_patch:{assigned_owner_email:ownerEmail,assigned_owner_name:String((owner as Record<string,unknown>).display_name||ownerEmail),assigned_at:new Date().toISOString(),status:'assigned'}});if(error)return errResponse('ข้อเสนอหรือผู้รับผิดชอบเปลี่ยนแล้ว กรุณาโหลดใหม่',409);
      return jsonResponse({ ok:true });
    }

    case 'publishGrowthPowerTeam': {
      const auth = await requireAuth(db, p, ['mc', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);
      if (!auth.isAdmin || !auth.email) return errResponse('เฉพาะ Chapter Admin ที่เข้าสู่ระบบด้วย OAuth เท่านั้น', 403);
      if (p.confirmed !== true) return errResponse('ต้องยืนยันการเผยแพร่ Power Team', 400);
      const scope = await resolveChapterScope(db, auth); if (!scope.ok) return errResponse(scope.error, 403);
      const proposalId = cleanText(p.proposalId, 80);
      if (!proposalId) return errResponse('proposalId required', 400);
      const { data: proposal, error: proposalError } = await db.from('power_team_proposals').select('id,status,blueprint_year').eq('id', proposalId).eq('chapter_id', scope.chapterId).maybeSingle();
      if (proposalError) return errResponse(proposalError.message);
      if (!proposal) return errResponse('ไม่พบ Proposal ใน Chapter นี้', 404);
      if (proposal.status !== 'active') return errResponse('ต้องให้ Proposal อยู่สถานะ active ก่อนเผยแพร่', 409);
      const { data: existing, error: existingError } = await db.from('growth_power_team_publications').select('id,status').eq('proposal_id', proposalId).eq('chapter_id', scope.chapterId).maybeSingle();
      if (existingError) return errResponse(existingError.message);
      if (existing) return jsonResponse({ ok: true, publicationId: existing.id, status: existing.status, alreadyPublished: true });
      const { data: members, error: memberError } = await db.from('power_team_proposal_members').select('member_id,participation_status').eq('proposal_id', proposalId);
      if (memberError) return errResponse(memberError.message);
      const memberIds = [...new Set((members || []).map((row: Record<string, unknown>) => String(row.member_id)))];
      if (memberIds.length < 2) return errResponse('ต้องมีสมาชิกอย่างน้อย 2 คน', 409);
      if(proposal.blueprint_year && (members||[]).some((m:Record<string,unknown>)=>m.participation_status!=='accepted'))return errResponse('สมาชิกทุกคนต้องตอบรับใน MY121 → Power Team ของฉัน ก่อนอนุมัติ',409);
      const { data: scopedMembers, error: scopedError } = await db.from('members').select('id').in('id', memberIds).eq('chapter_id', scope.chapterId).eq('is_archived', false);
      if (scopedError) return errResponse(scopedError.message);
      if ((scopedMembers || []).length !== memberIds.length) return errResponse('สมาชิกไม่อยู่ใน Chapter หรือไม่ active', 409);
      const { data: publication, error } = await db.from('growth_power_team_publications').insert({ chapter_id: scope.chapterId, proposal_id: proposalId, published_by_email: auth.email }).select('id').single();
      if (error) return errResponse(error.message, error.code === '23505' ? 409 : 400);
      return jsonResponse({ ok: true, publicationId: publication.id, status: 'active' });
    }

    case 'archiveGrowthPowerTeam': {
      const auth = await requireAuth(db, p, ['mc', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);
      if (!auth.isAdmin || !auth.email) return errResponse('เฉพาะ Chapter Admin ที่เข้าสู่ระบบด้วย OAuth เท่านั้น', 403);
      if (p.confirmed !== true) return errResponse('ต้องยืนยันการเก็บทีมเข้าประวัติ', 400);
      const scope = await resolveChapterScope(db, auth); if (!scope.ok) return errResponse(scope.error, 403);
      const publicationId = cleanText(p.publicationId, 80);
      if (!publicationId) return errResponse('publicationId required', 400);
      const { data: publication, error: lookupError } = await db.from('growth_power_team_publications').select('id,status').eq('id', publicationId).eq('chapter_id', scope.chapterId).maybeSingle();
      if (lookupError) return errResponse(lookupError.message);
      if (!publication) return errResponse('ไม่พบ Power Team ใน Chapter นี้', 404);
      if (publication.status === 'archived') return jsonResponse({ ok: true, alreadyArchived: true });
      const { error } = await db.from('growth_power_team_publications').update({ status: 'archived', archived_by_email: auth.email, archived_at: new Date().toISOString() }).eq('id', publicationId).eq('chapter_id', scope.chapterId).eq('status', 'active');
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }


    // Retired: this legacy pairing store had no trustworthy Chapter scope and
    // inferred 1-2-1 suggestions from Mentor teams. Historical rows are kept.
    case 'getCrossTeamSynergy':
    case 'saveCrossTeamPair': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);
      return errResponse('Legacy Connection Map is retired; use MY121', 410);
    }

    // ── Growth Power Teams overview ──────────────────────────────
    case 'getGrowthPowerTeams': {
      const auth = await requireAuth(db, p, ['mc', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);
      const scope = await resolveChapterScope(db, auth);
      if (!scope.ok) return errResponse(scope.error, 403);
      try {
        const overview = await fetchGrowthPowerTeamOverview(
          db,
          scope.chapterId,
          String(auth.role || '').toLowerCase() === 'growth',
        );
        return jsonResponse({ ok: true, ...overview });
      } catch (error) {
        return errResponse(error instanceof Error ? error.message : String(error));
      }
    }

    default:
      return errResponse(`Unknown power-teams action: ${action}`);
  }
}

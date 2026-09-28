// FILE: power-teams.ts
// Handler: power-teams — getPowerTeams, getPTMembers, savePTMember, deletePTMember,
//   setPTMemberStatus, updatePTMember, movePTMember, moveSynMember,
//   getCrossTeamSynergy, saveCrossTeamPair
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';
import { resolveChapterScope } from '../../_shared/chapter-scope.ts';
import { CAPABILITY, hasCapability } from '../../_shared/capabilities.ts';
import { resolveMsbPlanningYear } from '../../_shared/msb-planning-year.ts';

const TEAM_MAP: Record<string, string> = {
  toomtam: 'TOOMTAM', aof: 'Aof', draft: 'Draft', phai: 'PHAI', amp: 'AMP',
};

const ALL_TEAMS = ['TOOMTAM', 'Aof', 'Draft', 'PHAI', 'AMP'];

function cleanText(value: unknown, limit: number): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, limit);
}

async function powerTeamCandidates(
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
  const explicitCategories = new Map<string, Set<string>>();
  if (respectReferralConsent) {
    const [{ data: profiles, error: profileError }, { data: categoryRows, error: categoryError }] = await Promise.all([
      db.from('member_one_to_one_profiles').select('member_id,share_business,share_referral_focus').in('member_id', ids),
      db.from('member_growth_category_consents').select('member_id,category').in('member_id', ids).eq('category_type', 'power_team').is('revoked_at', null),
    ]);
    if (profileError) throw new Error(profileError.message);
    if (categoryError) throw new Error(categoryError.message);
    for (const profile of (profiles || []) as Record<string, unknown>[]) {
      consentByMember.set(String(profile.member_id), profile);
    }
    for (const row of (categoryRows || []) as Record<string, unknown>[]) {
      const memberId = String(row.member_id); const values = explicitCategories.get(memberId) || new Set<string>();
      values.add(cleanText(row.category, 120).toLowerCase()); explicitCategories.set(memberId, values);
    }
  }
  const { data: members, error: memberError } = await db.from('members')
    .select('id,name,nickname,profession,company_name,is_archived').in('id', ids).eq('chapter_id', chapterId).eq('is_archived', false);
  if (memberError) throw new Error(memberError.message);
  const groups = new Map<string, { memberIds: string[]; members: Record<string, unknown>[]; details: string[] }>();
  for (const member of (members || []) as Record<string, unknown>[]) {
    const plan = newestByMember.get(String(member.id));
    const consent = consentByMember.get(String(member.id));
    const rawCategories = Array.isArray(plan?.power_team_categories) ? plan.power_team_categories : [];
    const categories = respectReferralConsent && consent?.share_referral_focus !== true
      ? rawCategories.filter(category => explicitCategories.get(String(member.id))?.has(cleanText(category, 120).toLowerCase()))
      : rawCategories;
    // Blueprint detail is free text. An explicit category grant does not prove
    // that every phrase in the detail is shareable, so hide it when the member
    // has disabled full referral sharing.
    const detail = !respectReferralConsent || consent?.share_referral_focus === true
      ? cleanText(plan?.power_team_detail, 500) : '';
    for (const rawCategory of categories) {
      const category = cleanText(rawCategory, 120);
      if (!category) continue;
      const group = groups.get(category) || { memberIds: [], members: [], details: [] };
      group.memberIds.push(String(member.id)); group.members.push(member);
      if (detail && !group.details.includes(detail)) group.details.push(detail);
      groups.set(category, group);
    }
  }
  return [...groups.entries()].filter(([, group]) => group.memberIds.length >= 2)
    .map(([category, group]) => ({
      category,
      memberIds: group.memberIds,
      members: group.members.map(member => {
        const profile = consentByMember.get(String(member.id));
        const showBusiness = !respectReferralConsent || profile?.share_business === true;
        return { id: member.id, name: member.name, nickname: member.nickname,
          profession: showBusiness ? member.profession : '', companyName: showBusiness ? member.company_name : '' };
      }),
      targetCustomerGroup: group.details.slice(0, 3).join(' · ') || `กลุ่มลูกค้าที่เกี่ยวข้องกับ ${category}`,
      rationale: `สมาชิก ${group.memberIds.length} คนระบุ ${category} ใน Blueprint จึงควรทดลอง 1-2-1 เพื่อพิสูจน์ว่ามีกลุ่มลูกค้าและ referral trigger ร่วมกัน`,
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

/** Build per-team member groups from v_member_dashboard. */
async function fetchTeamGroups(db: ReturnType<typeof getServiceClient>) {
  const { data: rows, error } = await db
    .from('v_member_dashboard')
    .select('id, name, nickname, mentor_team, display_score, traffic_light, given_thb, received_thb, bni_goal')
    .eq('is_archived', false)
    .order('display_score', { ascending: false });

  if (error) return { teams: null, error: error.message };

  const groupMap: Record<string, Record<string, unknown>[]> = {};
  for (const team of ALL_TEAMS) groupMap[team] = [];

  for (const m of (rows || []) as Record<string, unknown>[]) {
    const team = String(m.mentor_team || '');
    if (team && groupMap[team]) groupMap[team].push(m);
  }

  const teams = ALL_TEAMS.map(teamName => {
    const members = groupMap[teamName];
    let totalScore = 0, scoredCount = 0;
    let totalGiven = 0, totalRecv = 0, redBlack = 0;

    for (const m of members) {
      const score = Number(m.display_score) || 0;
      const tl    = String(m.traffic_light || 'none');
      const given = Number(m.given_thb) || 0;
      const recv  = Number(m.received_thb) || 0;
      if (score > 0) { totalScore += score; scoredCount++; }
      totalGiven += given;
      totalRecv  += recv;
      if (tl === 'red' || tl === 'black') redBlack++;
    }

    const avgScore = scoredCount ? Math.round(totalScore / scoredCount) : 0;

    // Suggestions: pairs within same team where both score < 50
    const needHelp = members.filter(m => Number(m.display_score) < 50);
    const suggestions: { a: string; b: string; priority: string; reasons: string[] }[] = [];
    for (let i = 0; i < needHelp.length && suggestions.length < 5; i++) {
      for (let j = i + 1; j < needHelp.length && suggestions.length < 5; j++) {
        const ma = needHelp[i];
        const mb = needHelp[j];
        const sa = Number(ma.display_score) || 0;
        const sb = Number(mb.display_score) || 0;
        const reasons: string[] = [];
        if (sa < 30 || sb < 30) reasons.push('คะแนนต่ำกว่า 30 — ต้องการความช่วยเหลือด่วน');
        else reasons.push('คะแนนต่ำกว่า 50 — มีโอกาสพัฒนาร่วมกัน');
        suggestions.push({
          a:        String(ma.nickname || ma.name),
          b:        String(mb.nickname || mb.name),
          priority: (sa < 30 || sb < 30) ? 'high' : 'medium',
          reasons,
        });
      }
    }

    const tlShort: Record<string, string> = { green: 'G', yellow: 'Y', red: 'R', black: 'B', none: '' };
    return {
      id:          teamName,
      name:        teamName,
      team:        teamName,       // frontend uses t.team
      icon:        '🛡️',
      members:     members.map((m, idx) => ({
        row:         idx + 1,                                  // synthetic row for edit/delete ops
        name:        m.name,
        nick:        String(m.nickname || ''),
        firstName:   String(m.name || ''),                     // PT manager uses firstName
        lastName:    '',
        profession:  '',                                       // not in schema yet
        tl:          tlShort[String(m.traffic_light)] || '',  // frontend expects G/Y/R
        bniGoal:     Number(m.bni_goal) || 0,
        recv:        Number(m.received_thb) || 0,
        given:       Number(m.given_thb) || 0,
        goalPct:     0,
        score:       Number(m.display_score) || 0,
        mentor:      m.mentor_team,
      })),
      count:       members.length,
      memberCount: members.length,  // frontend uses t.memberCount
      teamGoal:    0,               // frontend uses t.teamGoal
      teamRecv:    totalRecv,       // frontend uses t.teamRecv
      avgScore,    redBlack,
      totalGiven,  totalRecv,
      suggestions,
    };
  });

  return { teams, error: null };
}

export async function handlePowerTeams(p: Record<string, unknown>): Promise<Response> {
  const db     = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    // These are proposals, not mentor teams and not official Power Teams.
    case 'getPowerTeamProposals': {
      const auth = await requireAuth(db, p, ['mc', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);
      try {
        const scope = await resolveChapterScope(db, auth);
        if (!scope.ok) return errResponse(scope.error, 403);
        const chapterId = scope.chapterId;
        const [candidates, saved, published] = await Promise.all([
          powerTeamCandidates(db, chapterId, String(auth.role || '').toLowerCase() === 'growth'),
          db.from('power_team_proposals').select('id,title,target_customer_group,rationale,source_category,status,created_by,assigned_owner_email,assigned_owner_name,assigned_at,created_at,updated_at,power_team_proposal_members(member_id,members(id,name,nickname,profession,company_name))')
            .eq('chapter_id', chapterId).order('updated_at', { ascending: false }),
          db.from('growth_power_team_publications').select('id,proposal_id,status,published_at,archived_at').eq('chapter_id', chapterId).order('published_at', { ascending: false }),
        ]);
        if (saved.error || published.error) throw new Error(saved.error?.message || published.error?.message);
        const coordinator = auth.isMC || auth.isAdmin || hasCapability(auth, CAPABILITY.GROWTH_COORDINATE);
        const rawProposals = coordinator ? (saved.data || []) : (saved.data || []).filter((row: Record<string, unknown>) => String(row.assigned_owner_email || '').toLowerCase() === String(auth.email || '').toLowerCase());
        const proposalMemberIds = [...new Set((saved.data || []).flatMap((row: Record<string, unknown>) => (Array.isArray(row.power_team_proposal_members) ? row.power_team_proposal_members : []).map((member: Record<string, unknown>) => String(member.member_id || '')).filter(Boolean)))];
        const { data: profileRows, error: profileError } = proposalMemberIds.length ? await db.from('member_one_to_one_profiles').select('member_id,share_referral_focus').in('member_id', proposalMemberIds) : { data: [], error: null };
        if (profileError) throw new Error(profileError.message);
        const referralByMember = new Map(((profileRows || []) as Record<string, unknown>[]).map(row => [String(row.member_id), row.share_referral_focus === true]));
        const projectProposal = (row: Record<string, unknown>) => {
          const memberIds = (Array.isArray(row.power_team_proposal_members) ? row.power_team_proposal_members : []).map((member: Record<string, unknown>) => String(member.member_id || '')).filter(Boolean);
          // For a legacy/unassociated or mixed-consent proposal, conceal the
          // complete historical category/referral fields as one unit.
          const revealHistorical = memberIds.length > 0 && memberIds.every(memberId => referralByMember.get(memberId) === true);
          return String(auth.role || '').toLowerCase() !== 'growth' || revealHistorical
            ? row : { ...row, title: '', source_category: null, target_customer_group: '', rationale: '', power_team_proposal_members: [], member_count: memberIds.length, detailRestricted: true };
        };
        const publicationByProposal = new Map(((published.data || []) as Record<string, unknown>[]).map(row => [String(row.proposal_id), row]));
        const proposals = rawProposals.map(projectProposal).map(row => ({ ...row, officialStatus: publicationByProposal.get(String(row.id))?.status || null }));
        const proposalById = new Map(((saved.data || []) as Record<string, unknown>[]).map(row => [String(row.id), row]));
        const officialTeams = ((published.data || []) as Record<string, unknown>[]).map(publication => {
          const proposal = proposalById.get(String(publication.proposal_id));
          const safe = proposal ? projectProposal(proposal) : null;
          return { id: publication.id, proposalId: publication.proposal_id, status: publication.status, publishedAt: publication.published_at, archivedAt: publication.archived_at, title: safe?.title || '', memberCount: safe?.member_count || (Array.isArray(safe?.power_team_proposal_members) ? safe.power_team_proposal_members.length : 0), members: safe?.power_team_proposal_members || [], detailRestricted: !safe || Boolean(safe.detailRestricted), targetCustomerGroup: safe?.target_customer_group || '' };
        });
        return jsonResponse({ ok: true, candidates: coordinator ? candidates : [], proposals, officialTeams, canCoordinate: coordinator, canApprove: Boolean(auth.isAdmin), canManageAssigned: hasCapability(auth, CAPABILITY.GROWTH_TASK_MANAGE_ASSIGNED), viewerEmail: String(auth.email || '') });
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
        const { data: proposal, error: proposalError } = await db.from('power_team_proposals').insert({
          chapter_id: chapterId, title, target_customer_group: targetCustomerGroup, rationale, source_category: sourceCategory,
          created_by: String(auth.email || auth.displayName || auth.role || 'growth'),
        }).select('id').single();
        if (proposalError || !proposal?.id) throw new Error(proposalError?.message || 'สร้างข้อเสนอไม่สำเร็จ');
        const proposalId = String(proposal.id);
        const { error: memberError } = await db.from('power_team_proposal_members').insert(memberIds.map(member_id => ({ proposal_id: proposalId, member_id })));
        if (memberError) throw new Error(memberError.message);
        await db.from('chapter_audit_events').insert({ event_type: 'power_team_proposal_created', actor_role: auth.role || 'growth', actor_ref: String(auth.email || auth.displayName || ''), metadata: { proposal_id: proposalId, chapter_id: chapterId, member_count: memberIds.length, source_category: sourceCategory } });
        return jsonResponse({ ok: true, proposalId });
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
      const owns = String(current.assigned_owner_email || '').toLowerCase() === String(auth.email || '').toLowerCase();
      if (!coordinator && !(owns && hasCapability(auth, CAPABILITY.GROWTH_TASK_MANAGE_ASSIGNED))) return errResponse('Proposal ต้องมอบหมายให้บัญชีของคุณก่อนจึงจะแก้ไขได้', 403);
      if (!coordinator && !['exploring','closed'].includes(status)) return errResponse('Growth owner เปลี่ยนได้เฉพาะ exploring หรือเสนอปิดงาน', 403);
      const patch: Record<string, unknown> = { status, updated_at:new Date().toISOString() };
      if (status === 'closed') {
        const closeReason = cleanText(p.closeReason, 1500);
        if (closeReason.length < 5) return errResponse('ต้องระบุเหตุผลหรือผลลัพธ์อย่างน้อย 5 ตัวอักษร', 400);
        patch.rationale = closeReason;
      }
      const { error } = await db.from('power_team_proposals').update(patch).eq('id', proposalId).eq('chapter_id', scope.chapterId); if (error) return errResponse(error.message);
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
      const { error } = await db.from('power_team_proposals').update({ assigned_owner_email:ownerEmail, assigned_owner_name:String((owner as Record<string,unknown>).display_name || ownerEmail), assigned_at:new Date().toISOString(), status:'assigned', updated_at:new Date().toISOString() }).eq('id', proposalId).eq('chapter_id', scope.chapterId); if (error) return errResponse(error.message);
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
      const { data: proposal, error: proposalError } = await db.from('power_team_proposals').select('id,status').eq('id', proposalId).eq('chapter_id', scope.chapterId).maybeSingle();
      if (proposalError) return errResponse(proposalError.message);
      if (!proposal) return errResponse('ไม่พบ Proposal ใน Chapter นี้', 404);
      if (proposal.status !== 'active') return errResponse('ต้องให้ Proposal อยู่สถานะ active ก่อนเผยแพร่', 409);
      const { data: existing, error: existingError } = await db.from('growth_power_team_publications').select('id,status').eq('proposal_id', proposalId).eq('chapter_id', scope.chapterId).maybeSingle();
      if (existingError) return errResponse(existingError.message);
      if (existing) return jsonResponse({ ok: true, publicationId: existing.id, status: existing.status, alreadyPublished: true });
      const { data: members, error: memberError } = await db.from('power_team_proposal_members').select('member_id').eq('proposal_id', proposalId);
      if (memberError) return errResponse(memberError.message);
      const memberIds = [...new Set((members || []).map((row: Record<string, unknown>) => String(row.member_id)))];
      if (memberIds.length < 2) return errResponse('ต้องมีสมาชิกอย่างน้อย 2 คน', 409);
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

    // ── Get Power Teams ──────────────────────────────────────────
    case 'getPowerTeams': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const { teams, error } = await fetchTeamGroups(db);
      if (error || !teams) return errResponse(error || 'Failed to fetch teams');

      return jsonResponse({ ok: true, teams });
    }

    // ── Get PT Members (simpler variant) ─────────────────────────
    case 'getPTMembers': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const { teams, error } = await fetchTeamGroups(db);
      if (error || !teams) return errResponse(error || 'Failed to fetch teams');

      const teamNames = teams.map(t => t.name);
      return jsonResponse({ ok: true, teams, teamNames });
    }

    // ── Save PT Member — update bni_goal (and optionally received_thb) for existing member ──
    // Frontend sends: { nick, firstName, bniGoal, recv, team, tl, profession, ... }
    // Members are already tracked in the members table via assignToTeam; this only saves the goal.
    case 'savePTMember': {
      const auth = await requireAuth(db, p, ['mc', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);

      const nick      = String(p.nick || p.firstName || '').trim();
      const bniGoal   = p.bniGoal !== undefined ? Number(p.bniGoal) : null;

      if (!nick) return jsonResponse({ ok: true }); // no-op if no identifier

      // Look up by nickname first, then by name
      let memberId = '';
      const { data: byNick } = await db.from('members').select('id').eq('nickname', nick).maybeSingle();
      if (byNick) {
        memberId = String((byNick as Record<string, unknown>).id);
      } else {
        const { data: byName } = await db.from('members').select('id').eq('name', nick).maybeSingle();
        if (byName) memberId = String((byName as Record<string, unknown>).id);
      }

      if (!memberId) return jsonResponse({ ok: true }); // member not in DB yet — no-op

      const updates: Record<string, unknown> = {};
      if (bniGoal !== null && !isNaN(bniGoal)) updates.bni_goal = bniGoal;

      if (Object.keys(updates).length > 0) {
        const { error } = await db.from('members').update(updates).eq('id', memberId);
        if (error) return errResponse(error.message);
      }

      return jsonResponse({ ok: true });
    }

    // ── Delete PT Member (remove power_teams pair or no-op) ──────
    case 'deletePTMember': {
      const auth = await requireAuth(db, p, ['mc', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberId = String(p.memberId || '');
      if (memberId) {
        // Remove all power_teams pairs involving this member
        const { error: err1 } = await db.from('power_teams')
          .delete().eq('member_a_id', memberId);
        const { error: err2 } = await db.from('power_teams')
          .delete().eq('member_b_id', memberId);
        if (err1) return errResponse(err1.message);
        if (err2) return errResponse(err2.message);
      }

      return jsonResponse({ ok: true });
    }

    // ── Set PT Member Status (active / departed) ─────────────────
    // Frontend sends { nick, status } where status is 'active' or 'departed'.
    // 'departed' maps to is_archived=true; 'active' maps to is_archived=false.
    case 'setPTMemberStatus': {
      const auth = await requireAuth(db, p, ['mc', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);

      const nick   = String(p.nick || p.name || p.memberName || '').trim();
      const status = String(p.status || 'active');

      if (!nick) return errResponse('nick required');

      // Look up member by nickname or name
      let memberId = '';
      const { data: byNick } = await db.from('members').select('id').eq('nickname', nick).maybeSingle();
      if (byNick) {
        memberId = String((byNick as Record<string, unknown>).id);
      } else {
        const { data: byName } = await db.from('members').select('id').eq('name', nick).maybeSingle();
        if (byName) memberId = String((byName as Record<string, unknown>).id);
      }
      if (!memberId) return errResponse(`ไม่พบสมาชิก: ${nick}`);

      const isArchived = status === 'departed';
      const { error } = await db.from('members').update({ is_archived: isArchived }).eq('id', memberId);
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true });
    }

    // ── Update PT Member — update bni_goal or received_thb for a member ──
    // Mobile sends: { nick, bniGoal } OR { nick, recv }
    case 'updatePTMember': {
      const auth = await requireAuth(db, p, ['mc', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);

      const nick = String(p.nick || '').trim();
      if (!nick) return errResponse('nick required');

      // Look up by nickname first, then by name
      let memberId = '';
      const { data: byNick } = await db.from('members').select('id').eq('nickname', nick).maybeSingle();
      if (byNick) {
        memberId = String((byNick as Record<string, unknown>).id);
      } else {
        const { data: byName } = await db.from('members').select('id').eq('name', nick).maybeSingle();
        if (byName) memberId = String((byName as Record<string, unknown>).id);
      }
      if (!memberId) return errResponse(`ไม่พบสมาชิก: ${nick}`);

      const updates: Record<string, unknown> = {};
      if (p.bniGoal !== undefined) {
        const v = Number(p.bniGoal);
        if (!isNaN(v) && v >= 0) updates.bni_goal = v;
      }
      if (p.recv !== undefined) {
        const v = Number(p.recv);
        if (!isNaN(v) && v >= 0) updates.received_thb = v;
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await db.from('members').update(updates).eq('id', memberId);
        if (error) return errResponse(error.message);
      }

      return jsonResponse({ ok: true });
    }

    // ── Move PT Member to different mentor team ──────────────────
    // movePTMember: frontend sends { nick, newTeam }
    // moveSynMember: frontend sends { name, nick, newTeamId }
    case 'movePTMember':
    case 'moveSynMember': {
      const auth = await requireAuth(db, p, ['mc', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberIdent = String(p.memberName || p.name || p.nick || '').trim();
      // moveSynMember sends newTeamId (= team name string); movePTMember sends newTeam
      const newTeam = String(p.newTeam || p.newTeamId || '').trim();

      if (!memberIdent) return errResponse('memberName/name/nick required');
      if (!newTeam)     return errResponse('newTeam required');

      // Look up member by name first, then by nickname
      let memberId = '';
      const { data: byName } = await db.from('members').select('id').eq('name', memberIdent).maybeSingle();
      if (byName) {
        memberId = String((byName as Record<string, unknown>).id);
      } else {
        const { data: byNick } = await db.from('members').select('id').eq('nickname', memberIdent).maybeSingle();
        if (byNick) memberId = String((byNick as Record<string, unknown>).id);
      }
      if (!memberId) return errResponse(`ไม่พบสมาชิก: ${memberIdent}`);

      // Use atomic team-move function
      const { data, error } = await db.rpc('fn_move_member_team', {
        p_member_id:   memberId,
        p_target_team: newTeam,
        p_moved_by:    String(p.role || 'mc'),
        p_note:        `moved via ${action}`,
      });
      if (error) return errResponse(error.message);

      const result = data as { ok: boolean; error?: string };
      if (!result.ok) return errResponse(result.error || 'Move failed');

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

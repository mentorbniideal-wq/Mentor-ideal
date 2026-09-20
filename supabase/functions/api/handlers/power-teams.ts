// FILE: power-teams.ts
// Handler: power-teams — getPowerTeams, getPTMembers, savePTMember, deletePTMember,
//   setPTMemberStatus, updatePTMember, movePTMember, moveSynMember,
//   getCrossTeamSynergy, saveCrossTeamPair
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';
import { resolveChapterScope } from '../../_shared/chapter-scope.ts';
import { CAPABILITY, hasCapability } from '../../_shared/capabilities.ts';

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
  const year = new Date().getFullYear();
  const { data: scopedMembers, error: scopeError } = await db.from('members').select('id')
    .eq('chapter_id', chapterId).eq('is_archived', false);
  if (scopeError) throw new Error(scopeError.message);
  const scopedIds = (scopedMembers || []).map((member: Record<string, unknown>) => String(member.id));
  if (!scopedIds.length) return [];
  const { data: plans, error: planError } = await db.from('member_success_blueprints')
    .select('member_id,blueprint_year,power_team_categories,power_team_detail,updated_at')
    .in('member_id', scopedIds).gte('blueprint_year', year - 1).lte('blueprint_year', year + 1)
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
    .select('id,name,nickname,profession,company_name,mentor_team,is_archived').in('id', ids).eq('chapter_id', chapterId).eq('is_archived', false);
  if (memberError) throw new Error(memberError.message);
  const groups = new Map<string, { memberIds: string[]; members: Record<string, unknown>[]; details: string[] }>();
  for (const member of (members || []) as Record<string, unknown>[]) {
    const plan = newestByMember.get(String(member.id));
    const consent = consentByMember.get(String(member.id));
    const rawCategories = Array.isArray(plan?.power_team_categories) ? plan.power_team_categories : [];
    const categories = respectReferralConsent && consent?.share_referral_focus === false
      ? rawCategories.filter(category => explicitCategories.get(String(member.id))?.has(cleanText(category, 120).toLowerCase()))
      : rawCategories;
    // Blueprint detail is free text. An explicit category grant does not prove
    // that every phrase in the detail is shareable, so hide it when the member
    // has disabled full referral sharing.
    const detail = !respectReferralConsent || consent?.share_referral_focus !== false
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
      members: group.members.map(member => ({ id: member.id, name: member.name, nickname: member.nickname, profession: member.profession, companyName: member.company_name, mentorTeam: member.mentor_team })),
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
        const [candidates, saved] = await Promise.all([
          powerTeamCandidates(db, chapterId, String(auth.role || '').toLowerCase() === 'growth'),
          db.from('power_team_proposals').select('id,title,target_customer_group,rationale,source_category,status,created_by,assigned_owner_email,assigned_owner_name,assigned_at,created_at,updated_at,power_team_proposal_members(member_id,members(id,name,nickname,profession,company_name,mentor_team))')
            .eq('chapter_id', chapterId).neq('status', 'archived').order('updated_at', { ascending: false }),
        ]);
        if (saved.error) throw new Error(saved.error.message);
        const coordinator = auth.isMC || auth.isAdmin || hasCapability(auth, CAPABILITY.GROWTH_COORDINATE);
        const rawProposals = coordinator ? (saved.data || []) : (saved.data || []).filter((row: Record<string, unknown>) => String(row.assigned_owner_email || '').toLowerCase() === String(auth.email || '').toLowerCase());
        const proposalMemberIds = [...new Set(rawProposals.flatMap((row: Record<string, unknown>) => (Array.isArray(row.power_team_proposal_members) ? row.power_team_proposal_members : []).map((member: Record<string, unknown>) => String(member.member_id || '')).filter(Boolean)))];
        const { data: profileRows, error: profileError } = proposalMemberIds.length ? await db.from('member_one_to_one_profiles').select('member_id,share_referral_focus').in('member_id', proposalMemberIds) : { data: [], error: null };
        if (profileError) throw new Error(profileError.message);
        const referralByMember = new Map(((profileRows || []) as Record<string, unknown>[]).map(row => [String(row.member_id), row.share_referral_focus === true]));
        const proposals = rawProposals.map((row: Record<string, unknown>) => {
          const memberIds = (Array.isArray(row.power_team_proposal_members) ? row.power_team_proposal_members : []).map((member: Record<string, unknown>) => String(member.member_id || '')).filter(Boolean);
          // For a legacy/unassociated or mixed-consent proposal, conceal the
          // complete historical category/referral fields as one unit.
          const revealHistorical = memberIds.length > 0 && memberIds.every(memberId => referralByMember.get(memberId) === true);
          return revealHistorical ? row : { ...row, source_category: null, target_customer_group: '', rationale: '' };
        });
        return jsonResponse({ ok: true, candidates: coordinator ? candidates : [], proposals });
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
      const { data: proposal } = await db.from('power_team_proposals').select('id,assigned_owner_email,status').eq('id', proposalId).eq('chapter_id', scope.chapterId).maybeSingle();
      const current = proposal as Record<string, unknown> | null; if (!current) return errResponse('ไม่พบ Proposal ใน Chapter นี้', 404);
      const coordinator = auth.isMC || auth.isAdmin || hasCapability(auth, CAPABILITY.GROWTH_COORDINATE);
      const owns = String(current.assigned_owner_email || '').toLowerCase() === String(auth.email || '').toLowerCase();
      if (!coordinator && !owns) return errResponse('ไม่มีสิทธิ์แก้ Proposal ของผู้อื่น', 403);
      if (!coordinator && !['exploring','closed'].includes(status)) return errResponse('Growth owner เปลี่ยนได้เฉพาะ exploring หรือเสนอปิดงาน', 403);
      const patch: Record<string, unknown> = { status, updated_at:new Date().toISOString() };
      if (status === 'closed') patch.rationale = cleanText(p.closeReason, 1500) || String(current.rationale || '');
      const { error } = await db.from('power_team_proposals').update(patch).eq('id', proposalId).eq('chapter_id', scope.chapterId); if (error) return errResponse(error.message);
      return jsonResponse({ ok:true });
    }

    case 'assignPowerTeamProposal': {
      const auth = await requireAuth(db, p, ['mc', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);
      if (!auth.isMC && !auth.isAdmin && !hasCapability(auth, CAPABILITY.GROWTH_COORDINATE)) return errResponse('เฉพาะ Growth Coordinator เท่านั้นที่มอบหมาย Proposal', 403);
      const scope = await resolveChapterScope(db, auth); if (!scope.ok) return errResponse(scope.error, 403);
      const proposalId = cleanText(p.proposalId, 80), ownerEmail = cleanText(p.ownerEmail, 255).toLowerCase(); if (!proposalId || !ownerEmail) return errResponse('proposalId และ ownerEmail required', 400);
      const { data: owner } = await db.from('role_assignments').select('email,display_name,role').eq('chapter_id', scope.chapterId).ilike('email', ownerEmail).eq('access_status','active').maybeSingle();
      if (!owner || String((owner as Record<string, unknown>).role) !== 'growth') return errResponse('ผู้รับผิดชอบต้องเป็น Growth ที่ active ใน Chapter นี้', 400);
      const { error } = await db.from('power_team_proposals').update({ assigned_owner_email:ownerEmail, assigned_owner_name:String((owner as Record<string,unknown>).display_name || ownerEmail), assigned_at:new Date().toISOString(), status:'assigned', updated_at:new Date().toISOString() }).eq('id', proposalId).eq('chapter_id', scope.chapterId); if (error) return errResponse(error.message);
      return jsonResponse({ ok:true });
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

    // ── Get Cross-Team Synergy ───────────────────────────────────
    case 'getCrossTeamSynergy': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      // Saved pairs from cross_team_synergy
      const { data: savedRows, error } = await db
        .from('cross_team_synergy')
        .select('id, member_a_id, member_b_id, status, notes, created_at')
        .order('created_at', { ascending: false });
      if (error) return errResponse(error.message);

      const pairRows = (savedRows || []) as Record<string, unknown>[];

      // Collect all member IDs for enrichment
      const allIds = [
        ...new Set([
          ...pairRows.map(r => r.member_a_id),
          ...pairRows.map(r => r.member_b_id),
        ].filter(Boolean)),
      ] as string[];

      let memberDataMap: Record<string, { name: string; nick: string; team: string; score: number }> = {};
      if (allIds.length) {
        const { data: mems } = await db
          .from('v_member_dashboard')
          .select('id, name, nickname, mentor_team, display_score')
          .in('id', allIds);
        for (const m of (mems || []) as Record<string, unknown>[]) {
          memberDataMap[String(m.id)] = {
            name:  String(m.name),
            nick:  String(m.nickname || ''),
            team:  String(m.mentor_team || ''),
            score: Number(m.display_score) || 0,
          };
        }
      }

      // Build savedPairs in flat format expected by both frontends
      const savedPairs = pairRows.map(r => {
        const a = memberDataMap[String(r.member_a_id)] || { name: '', nick: '', team: '', score: 0 };
        const b = memberDataMap[String(r.member_b_id)] || { name: '', nick: '', team: '', score: 0 };
        return {
          row:    r.id,                                        // UUID used as row key for update/delete
          id:     r.id,
          nick1:  a.nick || a.name,
          nick2:  b.nick || b.name,
          team1:  a.team,
          team2:  b.team,
          status: r.status ? String(r.status) : 'pending',   // requires status column in DB
          notes:  r.notes,
        };
      });

      // Build a set of already-saved nick pairs for isSaved check
      const savedSet = new Set(savedPairs.map(p => [p.nick1, p.nick2].sort().join('||')));

      // Suggested cross-team pairs: members from different teams with complementary scores
      const { data: allMems } = await db
        .from('v_member_dashboard')
        .select('id, name, nickname, mentor_team, display_score, traffic_light')
        .eq('is_archived', false);

      const recommendations: {
        nick1: string; nick2: string; team1: string; team2: string;
        score: number; reasons: string[]; isSaved: boolean;
      }[] = [];

      const allMArr = ((allMems || []) as Record<string, unknown>[]).filter(
        m => Number(m.display_score) > 0
      );

      for (let i = 0; i < allMArr.length && recommendations.length < 20; i++) {
        const ma    = allMArr[i];
        const teamA = String(ma.mentor_team || '');
        const scoreA = Number(ma.display_score) || 0;
        if (!teamA) continue;

        for (let j = i + 1; j < allMArr.length && recommendations.length < 20; j++) {
          const mb    = allMArr[j];
          const teamB = String(mb.mentor_team || '');
          const scoreB = Number(mb.display_score) || 0;
          if (!teamB || teamA === teamB) continue;

          const scoreDiff = Math.abs(scoreA - scoreB);
          if (scoreDiff < 20 || scoreDiff > 50) continue;

          const n1 = String(ma.nickname || ma.name);
          const n2 = String(mb.nickname || mb.name);
          const reasons: string[] = [];
          if (scoreA >= 70 && scoreB < 50) reasons.push(`${n1} (${teamA}) สามารถช่วย ${n2} (${teamB}) เพิ่มคะแนน`);
          else if (scoreB >= 70 && scoreA < 50) reasons.push(`${n2} (${teamB}) สามารถช่วย ${n1} (${teamA}) เพิ่มคะแนน`);
          else reasons.push('คะแนนต่างกัน — โอกาสเรียนรู้จากกัน');

          const isSaved = savedSet.has([n1, n2].sort().join('||'));
          recommendations.push({ nick1: n1, nick2: n2, team1: teamA, team2: teamB, score: scoreA + scoreB, reasons, isSaved });
        }
      }

      recommendations.sort((a, b) => b.score - a.score);

      return jsonResponse({ ok: true, savedPairs, recommendations: recommendations.slice(0, 15) });
    }

    // ── Save / Update / Delete Cross-Team Pair ───────────────────
    case 'saveCrossTeamPair': {
      const auth = await requireAuth(db, p, ['mc', 'growth']);
      if (!auth.ok) return errResponse(auth.error!);

      const rowId = p.row ? String(p.row).trim() : null;

      // Handle status update
      if (p.field === 'status' && rowId) {
        const validStatuses = ['pending', 'in-progress', 'done', 'cancelled'];
        const newStatus = validStatuses.includes(String(p.value)) ? String(p.value) : 'pending';
        const { error } = await db.from('cross_team_synergy')
          .update({ status: newStatus })
          .eq('id', rowId);
        if (error) return errResponse(error.message);
        return jsonResponse({ ok: true });
      }

      // Handle delete
      if (p.field === 'delete' && rowId) {
        const { error } = await db.from('cross_team_synergy').delete().eq('id', rowId);
        if (error) return errResponse(error.message);
        return jsonResponse({ ok: true });
      }

      // Handle creation: accept nick1/nick2, name1/name2, or memberAName/memberBName
      const rawA = String(p.memberAName || p.name1 || p.nick1 || '').trim();
      const rawB = String(p.memberBName || p.name2 || p.nick2 || '').trim();
      const notes = p.notes ? String(p.notes).trim() : null;

      if (!rawA || !rawB) return errResponse('member names required');
      if (rawA === rawB) return errResponse('Cannot pair a member with themselves');

      // Look up by exact name first, then by nickname
      const lookupMember = async (nameOrNick: string) => {
        const { data: byName } = await db.from('members').select('id').eq('name', nameOrNick).maybeSingle();
        if (byName) return byName;
        const { data: byNick } = await db.from('members').select('id').ilike('nickname', nameOrNick).maybeSingle();
        return byNick;
      };

      const memA = await lookupMember(rawA);
      const memB = await lookupMember(rawB);

      if (!memA) return errResponse(`ไม่พบสมาชิก: ${rawA}`);
      if (!memB) return errResponse(`ไม่พบสมาชิก: ${rawB}`);

      const idA = String((memA as Record<string, unknown>).id);
      const idB = String((memB as Record<string, unknown>).id);

      if (idA === idB) return errResponse('Cannot pair a member with themselves');

      const [aId, bId] = idA < idB ? [idA, idB] : [idB, idA];

      const { error } = await db.from('cross_team_synergy').upsert({
        member_a_id: aId,
        member_b_id: bId,
        notes,
      }, { onConflict: 'member_a_id,member_b_id' });
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true });
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

// FILE: power-teams.ts
// Handler: power-teams — getPowerTeams, getPTMembers, savePTMember, deletePTMember,
//   setPTMemberStatus, updatePTMember, movePTMember, moveSynMember,
//   getCrossTeamSynergy, saveCrossTeamPair
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

const TEAM_MAP: Record<string, string> = {
  toomtam: 'TOOMTAM', aof: 'Aof', draft: 'Draft', phai: 'PHAI', amp: 'AMP',
};

const ALL_TEAMS = ['TOOMTAM', 'Aof', 'Draft', 'PHAI', 'AMP'];

/** Build per-team member groups from v_member_dashboard. */
async function fetchTeamGroups(db: ReturnType<typeof getServiceClient>) {
  const { data: rows, error } = await db
    .from('v_member_dashboard')
    .select('id, name, nickname, mentor_team, display_score, traffic_light, given_thb, received_thb')
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
        bniGoal:     0,
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

    // ── Save PT Member (stub: members already tracked in members table) ──
    case 'savePTMember': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);
      // PT membership = mentor_team assignment, already managed via assignToTeam
      return jsonResponse({ ok: true });
    }

    // ── Delete PT Member (remove power_teams pair or no-op) ──────
    case 'deletePTMember': {
      const auth = await requireAuth(db, p);
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
      const auth = await requireAuth(db, p);
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

    // ── Update PT Member (stub: member data lives in members table) ──
    case 'updatePTMember': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);
      // Extended member fields (bniGoal, etc.) not yet in schema
      return jsonResponse({ ok: true });
    }

    // ── Move PT Member to different mentor team ──────────────────
    // movePTMember: frontend sends { nick, newTeam }
    // moveSynMember: frontend sends { name, nick, newTeamId }
    case 'movePTMember':
    case 'moveSynMember': {
      const auth = await requireAuth(db, p);
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
      const auth = await requireAuth(db, p);
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

      const { teams, error } = await fetchTeamGroups(db);
      if (error || !teams) return errResponse(error || 'Failed to fetch teams');

      // Compute chapter-level summary
      let activeTotal = 0, departedTotal = 0, scoreSum = 0, scoredCount = 0;
      for (const t of teams) {
        const count = Number(t.count) || 0;
        const avgScore = Number(t.avgScore) || 0;
        activeTotal   += count;
        scoreSum      += avgScore * count;
        scoredCount   += count;
      }
      const overallPct = scoredCount > 0 ? Math.round(scoreSum / scoredCount) : 0;

      return jsonResponse({ ok: true, teams, summary: { overallPct, activeTotal, departedTotal } });
    }

    default:
      return errResponse(`Unknown power-teams action: ${action}`);
  }
}

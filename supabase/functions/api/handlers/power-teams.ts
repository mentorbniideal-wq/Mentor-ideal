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

    return {
      id:         teamName,
      name:       teamName,
      icon:       '🛡️',
      members:    members.map(m => ({
        name:   m.name,  nick:   m.nickname,
        score:  Number(m.display_score) || 0,
        tl:     String(m.traffic_light || 'none'),
        given:  Number(m.given_thb) || 0,
        recv:   Number(m.received_thb) || 0,
        mentor: m.mentor_team,
      })),
      count:      members.length,
      avgScore,   redBlack,
      totalGiven, totalRecv,
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

    // ── Set PT Member Status (update power_teams record) ─────────
    case 'setPTMemberStatus': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const memberId = String(p.memberId || '');
      const status   = String(p.status || 'active');

      if (!memberId) return errResponse('memberId required');

      // Update all pairs involving this member
      const { error: e1 } = await db.from('power_teams')
        .update({ status }).eq('member_a_id', memberId);
      const { error: e2 } = await db.from('power_teams')
        .update({ status }).eq('member_b_id', memberId);

      if (e1) return errResponse(e1.message);
      if (e2) return errResponse(e2.message);

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
    case 'movePTMember':
    case 'moveSynMember': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || '').trim();
      const newTeam    = String(p.newTeam || '').trim();

      if (!memberName) return errResponse('memberName required');
      if (!newTeam)    return errResponse('newTeam required');

      // Look up member by name
      const { data: member } = await db.from('members').select('id').eq('name', memberName).single();
      if (!member) return errResponse(`ไม่พบสมาชิก: ${memberName}`);
      const memberId = String((member as Record<string, unknown>).id);

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
        .select('id, member_a_id, member_b_id, notes, created_at')
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

      const saved = pairRows.map(r => {
        const a = memberDataMap[String(r.member_a_id)] || { name: '', nick: '', team: '', score: 0 };
        const b = memberDataMap[String(r.member_b_id)] || { name: '', nick: '', team: '', score: 0 };
        return {
          id: r.id,
          memberA: { id: r.member_a_id, name: a.name, nick: a.nick, team: a.team, score: a.score },
          memberB: { id: r.member_b_id, name: b.name, nick: b.nick, team: b.team, score: b.score },
          notes: r.notes,
          createdAt: r.created_at,
        };
      });

      // Suggested cross-team pairs: members from different teams with complementary scores
      // Heuristic: pair a lower-score member with a higher-score member from another team
      const { data: allMems } = await db
        .from('v_member_dashboard')
        .select('id, name, nickname, mentor_team, display_score, traffic_light')
        .eq('is_archived', false);

      const suggested: {
        nick1: string; nick2: string; team1: string; team2: string;
        score: number; reasons: string[];
      }[] = [];

      const allMArr = ((allMems || []) as Record<string, unknown>[]).filter(
        m => Number(m.display_score) > 0
      );

      // Find cross-team pairs where scores are complementary
      for (let i = 0; i < allMArr.length && suggested.length < 10; i++) {
        const ma   = allMArr[i];
        const teamA = String(ma.mentor_team || '');
        const scoreA = Number(ma.display_score) || 0;
        if (!teamA) continue;

        for (let j = i + 1; j < allMArr.length && suggested.length < 10; j++) {
          const mb    = allMArr[j];
          const teamB = String(mb.mentor_team || '');
          const scoreB = Number(mb.display_score) || 0;
          if (!teamB || teamA === teamB) continue;

          const scoreDiff = Math.abs(scoreA - scoreB);
          if (scoreDiff < 20 || scoreDiff > 50) continue; // want meaningful but not extreme gap

          const reasons: string[] = [];
          if (scoreA >= 70 && scoreB < 50) reasons.push(`${String(ma.nickname || ma.name)} (${teamA}) สามารถช่วย ${String(mb.nickname || mb.name)} (${teamB}) เพิ่มคะแนน`);
          else if (scoreB >= 70 && scoreA < 50) reasons.push(`${String(mb.nickname || mb.name)} (${teamB}) สามารถช่วย ${String(ma.nickname || ma.name)} (${teamA}) เพิ่มคะแนน`);
          else reasons.push('คะแนนต่างกัน — โอกาสเรียนรู้จากกัน');

          const combinedScore = scoreA + scoreB;
          suggested.push({
            nick1: String(ma.nickname || ma.name),
            nick2: String(mb.nickname || mb.name),
            team1: teamA, team2: teamB,
            score: combinedScore,
            reasons,
          });
        }
      }

      suggested.sort((a, b) => b.score - a.score);

      return jsonResponse({ ok: true, saved, suggested: suggested.slice(0, 8) });
    }

    // ── Save Cross-Team Pair ─────────────────────────────────────
    case 'saveCrossTeamPair': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const memberAName = String(p.memberAName || '').trim();
      const memberBName = String(p.memberBName || '').trim();
      const notes       = p.notes ? String(p.notes).trim() : null;

      if (!memberAName || !memberBName) return errResponse('memberAName and memberBName required');
      if (memberAName === memberBName) return errResponse('Cannot pair a member with themselves');

      // Look up both member IDs
      const { data: memA } = await db.from('members').select('id').eq('name', memberAName).single();
      const { data: memB } = await db.from('members').select('id').eq('name', memberBName).single();

      if (!memA) return errResponse(`ไม่พบสมาชิก: ${memberAName}`);
      if (!memB) return errResponse(`ไม่พบสมาชิก: ${memberBName}`);

      const idA = String((memA as Record<string, unknown>).id);
      const idB = String((memB as Record<string, unknown>).id);

      // Ensure canonical order: a_id < b_id (required by CHECK constraint)
      const [aId, bId] = idA < idB ? [idA, idB] : [idB, idA];

      const { error } = await db.from('cross_team_synergy').upsert({
        member_a_id: aId,
        member_b_id: bId,
        notes,
      }, { onConflict: 'member_a_id,member_b_id' });
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true });
    }

    default:
      return errResponse(`Unknown power-teams action: ${action}`);
  }
}

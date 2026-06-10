// Handler: members
// Covers: getMemberList, moveMemberToTeam, assignToTeam,
//         archiveMember, unarchiveMember, addNewMember, saveScore, saveStatus, etc.
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

const VALID_TEAMS = new Set(['TOOMTAM', 'Aof', 'Draft', 'PHAI', 'AMP']);

export async function handleMembers(p: Record<string, unknown>): Promise<Response> {
  const db  = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    // ── GET: all members with team info (MC only) ─────────────
    case 'getMemberList': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const { data, error } = await db
        .from('v_members_by_team')
        .select('*');
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true, members: data });
    }

    // ── GET: members grouped by team for team management UI ───
    case 'getMembersByTeam': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const { data, error } = await db
        .from('v_members_by_team')
        .select('id, name, nickname, mentor_team, is_mentored, latest_score, traffic_light');
      if (error) return errResponse(error.message);

      // Group by team
      const teams: Record<string, unknown[]> = {
        TOOMTAM: [], Aof: [], Draft: [], PHAI: [], AMP: [], unassigned: [],
      };
      for (const m of (data || []) as Record<string, unknown>[]) {
        const team = String(m.mentor_team || '');
        const key = VALID_TEAMS.has(team) ? team : 'unassigned';
        teams[key].push(m);
      }

      return jsonResponse({ ok: true, teams });
    }

    // ── MOVE: MC moves a member to a different team ───────────
    // This is the core feature: MC can freely reassign any member
    // including LT/President who previously had no team.
    case 'moveMemberToTeam':
    case 'assignToTeam': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberId   = String(p.memberId   || p.member_id   || '');
      const targetTeam = p.targetTeam != null ? String(p.targetTeam) : null;
      const note       = p.note ? String(p.note) : null;

      if (!memberId) return errResponse('memberId required');

      // Validate team name if provided
      if (targetTeam !== null && !VALID_TEAMS.has(targetTeam)) {
        return errResponse(`Invalid team "${targetTeam}". Must be one of: ${[...VALID_TEAMS].join(', ')}`);
      }

      // Use atomic DB function that also logs history
      const { data, error } = await db.rpc('fn_move_member_team', {
        p_member_id:   memberId,
        p_target_team: targetTeam,
        p_moved_by:    'mc',
        p_note:        note,
      });
      if (error) return errResponse(error.message);

      const result = data as { ok: boolean; error?: string; changed?: boolean; member?: string; from_team?: string; to_team?: string };
      if (!result.ok) return errResponse(result.error || 'Move failed');
      return jsonResponse(result);
    }

    // ── GET: team move history for a member ──────────────────
    case 'getTeamHistory': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberId = String(p.memberId || p.member_id || '');
      if (!memberId) return errResponse('memberId required');

      const { data, error } = await db
        .from('member_team_history')
        .select('from_team, to_team, moved_by_role, note, moved_at')
        .eq('member_id', memberId)
        .order('moved_at', { ascending: false })
        .limit(20);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true, history: data });
    }

    // ── ARCHIVE member ────────────────────────────────────────
    case 'archiveMember': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberId = String(p.memberId || p.member_id || '');
      if (!memberId) return errResponse('memberId required');

      const { error } = await db
        .from('members')
        .update({ is_archived: true, archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', memberId);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    // ── UNARCHIVE member ──────────────────────────────────────
    case 'unarchiveMember': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberId = String(p.memberId || p.member_id || '');
      if (!memberId) return errResponse('memberId required');

      const { error } = await db
        .from('members')
        .update({ is_archived: false, archived_at: null, updated_at: new Date().toISOString() })
        .eq('id', memberId);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    // ── ADD new member ────────────────────────────────────────
    case 'addNewMember': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const name       = String(p.name || '').trim();
      const nickname   = String(p.nickname || '').trim() || null;
      const mentorTeam = p.mentorTeam ? String(p.mentorTeam) : null;

      if (!name) return errResponse('name required');
      if (mentorTeam && !VALID_TEAMS.has(mentorTeam)) {
        return errResponse(`Invalid team "${mentorTeam}"`);
      }

      const { data, error } = await db
        .from('members')
        .insert({
          name,
          nickname,
          mentor_team:  mentorTeam,
          is_mentored:  mentorTeam !== null,
          is_archived:  false,
        })
        .select('id, name, nickname, mentor_team')
        .single();
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true, member: data });
    }

    // ── SAVE monthly score ────────────────────────────────────
    case 'saveScore': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberId = String(p.memberId || p.member_id || '');
      const year     = Number(p.year);
      const month    = Number(p.month);
      const score    = Number(p.score);

      if (!memberId || !year || !month || isNaN(score)) {
        return errResponse('memberId, year, month, score required');
      }

      const { error } = await db.from('monthly_scores').upsert({
        member_id: memberId,
        year,
        month,
        score,
        source: 'manual',
      }, { onConflict: 'member_id,year,month' });
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    // ── SAVE mentor status ────────────────────────────────────
    case 'saveStatus': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberId = String(p.memberId || p.member_id || '');
      const status   = String(p.status || '').trim();
      if (!memberId) return errResponse('memberId required');

      const { error } = await db
        .from('members')
        .update({ mentor_status: status, updated_at: new Date().toISOString() })
        .eq('id', memberId);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    default:
      return errResponse(`Unknown members action: ${action}`);
  }
}

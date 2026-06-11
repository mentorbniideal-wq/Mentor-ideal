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
          mentor_team:   mentorTeam,
          is_mentored:   mentorTeam !== null,
          is_archived:   false,
          is_new_member: true,
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

    // ── ENSURE slot: look up or create a member row ───────────
    case 'ensureSlot': {
      const memberName = String(p.memberName || '').trim();
      const nick       = p.nick ? String(p.nick).trim() : '';
      if (!memberName) return errResponse('memberName required');

      // Try to find existing member
      const { data: existing, error: findErr } = await db
        .from('members')
        .select('id')
        .eq('name', memberName)
        .limit(1)
        .maybeSingle();
      if (findErr) return errResponse(findErr.message);

      if (existing) {
        return jsonResponse({ ok: true, existed: true, memberId: existing.id });
      }

      // Not found — insert
      const { data: inserted, error: insErr } = await db
        .from('members')
        .insert({ name: memberName, nickname: nick, is_new_member: true, is_archived: false })
        .select('id')
        .single();
      if (insErr) return errResponse(insErr.message);
      return jsonResponse({ ok: true, existed: false, memberId: inserted.id });
    }

    // ── GET archived members ──────────────────────────────────
    case 'getArchivedMembers': {
      const { data, error } = await db
        .from('members')
        .select('id, name, nickname, mentor_team')
        .eq('is_archived', true)
        .order('name');
      if (error) return errResponse(error.message);
      const members = (data || []).map((m: Record<string, unknown>) => ({
        id: m.id,
        name: m.name,
        nick: m.nickname,
        mentorTeam: m.mentor_team,
      }));
      return jsonResponse({ ok: true, members });
    }

    // ── SAVE member note (upsert within 24 h) ─────────────────
    case 'saveMemberNote': {
      const memberName = String(p.memberName || '').trim();
      const note       = String(p.note ?? '');
      if (!memberName) return errResponse('memberName required');

      // Resolve member id
      const { data: member, error: mErr } = await db
        .from('members')
        .select('id')
        .eq('name', memberName)
        .limit(1)
        .maybeSingle();
      if (mErr) return errResponse(mErr.message);
      if (!member) return errResponse(`Member not found: ${memberName}`);
      const memberId = member.id as string;

      // Check for an existing note updated within the last 24 h
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: existing, error: nErr } = await db
        .from('member_notes')
        .select('id')
        .eq('member_id', memberId)
        .gte('updated_at', cutoff)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (nErr) return errResponse(nErr.message);

      if (existing) {
        const { error: upErr } = await db
          .from('member_notes')
          .update({ note, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (upErr) return errResponse(upErr.message);
      } else {
        const { error: insErr } = await db
          .from('member_notes')
          .insert({ member_id: memberId, note, author_role: String(p.role || '') });
        if (insErr) return errResponse(insErr.message);
      }

      return jsonResponse({ ok: true });
    }

    // ── GET latest member note ────────────────────────────────
    case 'getMemberNote': {
      const memberName = String(p.memberName || '').trim();
      if (!memberName) return errResponse('memberName required');

      const { data: member, error: mErr } = await db
        .from('members')
        .select('id')
        .eq('name', memberName)
        .limit(1)
        .maybeSingle();
      if (mErr) return errResponse(mErr.message);
      if (!member) return jsonResponse({ ok: true, note: '' });
      const memberId = member.id as string;

      const { data, error } = await db
        .from('member_notes')
        .select('note')
        .eq('member_id', memberId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true, note: (data?.note as string) || '' });
    }

    // ── SAVE new-member checklist item ────────────────────────
    case 'saveNMCheckItem': {
      const memberName = String(p.memberName || '').trim();
      const itemKey    = String(p.itemKey || '').trim();
      const isDone     = Boolean(p.isDone);
      if (!memberName || !itemKey) return errResponse('memberName and itemKey required');

      const { data: member, error: mErr } = await db
        .from('members')
        .select('id')
        .eq('name', memberName)
        .limit(1)
        .maybeSingle();
      if (mErr) return errResponse(mErr.message);
      if (!member) return errResponse(`Member not found: ${memberName}`);
      const memberId = member.id as string;

      const now = new Date().toISOString();
      const { error } = await db
        .from('new_member_checklist')
        .upsert({
          member_id:  memberId,
          item_key:   itemKey,
          is_done:    isDone,
          done_at:    isDone ? now : null,
          updated_at: now,
        }, { onConflict: 'member_id,item_key' });
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    // ── GET new-member checklist ──────────────────────────────
    case 'getNMChecklist': {
      // fileUrl = member name (legacy identifier from GAS version)
      const memberName = String(p.memberName || p.fileUrl || '').trim();
      if (!memberName) return errResponse('memberName required');

      const { data: member, error: mErr } = await db
        .from('members')
        .select('id')
        .eq('name', memberName)
        .limit(1)
        .maybeSingle();
      if (mErr) return errResponse(mErr.message);
      if (!member) return jsonResponse({ ok: true, checklist: [] });
      const memberId = member.id as string;

      const { data, error } = await db
        .from('new_member_checklist')
        .select('item_key, is_done, done_at, updated_at')
        .eq('member_id', memberId);
      if (error) return errResponse(error.message);
      const checklist = (data || []).map((r: Record<string, unknown>) => ({
        itemKey:   r.item_key,
        isDone:    r.is_done,
        doneAt:    r.done_at,
        updatedAt: r.updated_at,
      }));
      return jsonResponse({ ok: true, checklist });
    }

    // ── BATCH add new members (MC only) ──────────────────────
    case 'addNewMembersBatch': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const rawMembers = Array.isArray(p.members) ? p.members as Record<string, unknown>[] : [];
      if (!rawMembers.length) return errResponse('members array required');

      const rows = rawMembers.map((m) => ({
        name:        String(m.name || '').trim(),
        nickname:    String(m.nick || m.nickname || '').trim(),
        mentor_team: m.mentorTeam ? String(m.mentorTeam) : null,
        is_new_member: true,
        is_archived:   false,
      })).filter((m) => m.name);

      const { error } = await db
        .from('members')
        .upsert(rows, { onConflict: 'name', ignoreDuplicates: false });
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true, count: rows.length });
    }

    // ── GET new members with checklist progress + latest note ─
    case 'getNewMembers': {
      const { data: members, error: mErr } = await db
        .from('members')
        .select('id, name, nickname, mentor_team, created_at')
        .eq('is_new_member', true)
        .eq('is_archived', false)
        .order('name');
      if (mErr) return errResponse(mErr.message);
      if (!members || members.length === 0) return jsonResponse({ ok: true, members: [] });

      const memberIds = (members as Record<string, unknown>[]).map((m) => m.id as string);

      // Fetch checklist rows for all these members
      const { data: clRows, error: clErr } = await db
        .from('new_member_checklist')
        .select('member_id, is_done')
        .in('member_id', memberIds);
      if (clErr) return errResponse(clErr.message);

      // Fetch latest notes for all these members
      const { data: noteRows, error: noteErr } = await db
        .from('member_notes')
        .select('member_id, note, updated_at')
        .in('member_id', memberIds)
        .order('updated_at', { ascending: false });
      if (noteErr) return errResponse(noteErr.message);

      // Build lookup maps
      type ClRow = { member_id: string; is_done: boolean };
      type NoteRow = { member_id: string; note: string };

      const clByMember: Record<string, ClRow[]> = {};
      for (const r of (clRows || []) as ClRow[]) {
        (clByMember[r.member_id] ??= []).push(r);
      }
      const latestNoteByMember: Record<string, string> = {};
      for (const r of (noteRows || []) as NoteRow[]) {
        if (!(r.member_id in latestNoteByMember)) {
          latestNoteByMember[r.member_id] = r.note;
        }
      }

      const enriched = (members as Record<string, unknown>[]).map((m) => {
        const id      = m.id as string;
        const items   = clByMember[id] || [];
        const done    = items.filter((r) => r.is_done).length;
        const total   = items.length;
        const pct     = total > 0 ? Math.round(done / total * 100) : 0;

        // Derive dates from created_at (best proxy for join date)
        const createdAt  = String(m.created_at || '');
        const startDate  = createdAt.split('T')[0] || '';
        let w8Date = '';
        if (startDate) {
          const d = new Date(startDate);
          d.setDate(d.getDate() + 56); // 8 weeks
          w8Date = d.toISOString().split('T')[0];
        }

        const statusText = pct >= 100 ? 'ครบทุกข้อ' : total > 0 ? `${done}/${total} ข้อ` : 'ยังไม่ได้เริ่ม';

        return {
          id,
          name:           m.name,
          nick:           m.nickname,
          mentor:         m.mentor_team,   // frontend uses nm.mentor
          mentorTeam:     m.mentor_team,
          checklistDone:  done,
          checklistTotal: total,
          progress:       pct,
          startDate,
          w8Date,
          expDate:        '',  // expiry date not tracked on new members
          status:         statusText,
          fileUrl:        String(m.name),  // used as identifier for checklist panel
          latestNote:     latestNoteByMember[id] || '',
        };
      });

      return jsonResponse({ ok: true, members: enriched });
    }

    // ── REMOVE new-member flag (MC only) ─────────────────────
    case 'removeNewMember': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const memberName = String(p.memberName || '').trim();
      if (!memberName) return errResponse('memberName required');

      const { error } = await db
        .from('members')
        .update({ is_new_member: false, updated_at: new Date().toISOString() })
        .eq('name', memberName);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    // ── Admin: email whitelist (MC + TOOMTAM only) ───────────────
    case 'getAdminEmails': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam']);
      if (!auth.ok) return errResponse(auth.error!);

      const { data, error } = await db
        .from('allowed_emails')
        .select('id, email, label, added_by, added_at')
        .order('added_at', { ascending: false });
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true, emails: data || [] });
    }

    case 'addAdminEmail': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam']);
      if (!auth.ok) return errResponse(auth.error!);

      const email = String(p.email || '').trim().toLowerCase();
      const label = String(p.label || '').trim() || null;
      if (!email || !email.includes('@')) return errResponse('อีเมลไม่ถูกต้อง');

      const { error } = await db.from('allowed_emails').insert({
        email, label,
        added_by: auth.role || 'unknown',
        added_at: new Date().toISOString(),
      });
      if (error) {
        if (error.code === '23505') return errResponse('อีเมลนี้มีอยู่แล้ว');
        return errResponse(error.message);
      }
      return jsonResponse({ ok: true });
    }

    case 'removeAdminEmail': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam']);
      if (!auth.ok) return errResponse(auth.error!);

      const email = String(p.email || '').trim().toLowerCase();
      if (!email) return errResponse('email required');

      const { error } = await db.from('allowed_emails').delete().eq('email', email);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    default:
      return errResponse(`Unknown members action: ${action}`);
  }
}

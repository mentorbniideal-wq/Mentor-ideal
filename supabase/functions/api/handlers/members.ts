// Handler: members
// Covers: getMemberList, moveMemberToTeam, assignToTeam,
//         archiveMember, unarchiveMember, addNewMember, saveScore, saveStatus, etc.
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

const VALID_TEAMS = new Set(['TOOMTAM', 'Aof', 'Draft', 'PHAI', 'AMP']);

type MemberRef = {
  id: string;
  name: string;
  nickname: string | null;
  mentor_team: string | null;
};

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTeam(value: unknown): string | null {
  const raw = textValue(value);
  if (!raw) return null;
  const found = [...VALID_TEAMS].find(team => team.toLowerCase() === raw.toLowerCase());
  return found || raw;
}

function currentBangkokYear(): number {
  const year = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).format(new Date());
  return Number(year);
}

async function findMemberByLegacyPayload(
  db: ReturnType<typeof getServiceClient>,
  p: Record<string, unknown>,
): Promise<{ member?: MemberRef; error?: string }> {
  const directId = textValue(p.memberId || p.member_id);
  if (directId) {
    const { data, error } = await db
      .from('members')
      .select('id, name, nickname, mentor_team')
      .eq('id', directId)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: `Member not found: ${directId}` };
    return { member: data as MemberRef };
  }

  const name = textValue(p.memberName || p.name);
  const nick = textValue(p.nick || p.nickname);
  const team = normalizeTeam(p.teamName || p.mentor || p.mentorTeam);
  if (!name && !nick) return { error: 'memberId or memberName required' };

  let query = db
    .from('members')
    .select('id, name, nickname, mentor_team')
    .eq('is_archived', false);
  if (team && VALID_TEAMS.has(team)) query = query.eq('mentor_team', team);
  if (name) query = query.ilike('name', name);
  else query = query.ilike('nickname', nick);

  const { data, error } = await query.limit(2);
  if (error) return { error: error.message };
  const rows = (data || []) as MemberRef[];
  if (rows.length === 1) return { member: rows[0] };

  if (!rows.length && nick) {
    let nickQuery = db
      .from('members')
      .select('id, name, nickname, mentor_team')
      .eq('is_archived', false)
      .ilike('nickname', nick);
    if (team && VALID_TEAMS.has(team)) nickQuery = nickQuery.eq('mentor_team', team);

    const { data: nickData, error: nickError } = await nickQuery.limit(2);
    if (nickError) return { error: nickError.message };
    const nickRows = (nickData || []) as MemberRef[];
    if (nickRows.length === 1) return { member: nickRows[0] };
    if (nickRows.length > 1) return { error: `พบสมาชิกชื่อเล่นซ้ำ: ${nick}` };
  }

  if (rows.length > 1) return { error: `พบสมาชิกชื่อซ้ำ: ${name || nick}` };
  return { error: `Member not found: ${name || nick}` };
}

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

      const lookup = await findMemberByLegacyPayload(db, p);
      if (lookup.error || !lookup.member) return errResponse(lookup.error || 'member not found');

      const memberId   = lookup.member.id;
      const targetTeam = normalizeTeam(p.targetTeam ?? p.mentor ?? p.mentorTeam);
      const note       = textValue(p.note) || null;

      if (action === 'assignToTeam' && !targetTeam) return errResponse('targetTeam required');

      // Validate team name if provided
      if (targetTeam !== null && !VALID_TEAMS.has(targetTeam)) {
        return errResponse(`Invalid team "${targetTeam}". Must be one of: ${[...VALID_TEAMS].join(', ')}`);
      }

      // Use atomic DB function that also logs history
      const { data, error } = await db.rpc('fn_move_member_team', {
        p_member_id:   memberId,
        p_target_team: targetTeam,
        p_moved_by:    String(auth.role || 'mc'),
        p_note:        note,
      });
      if (error) return errResponse(error.message);

      const result = data as { ok: boolean; error?: string; changed?: boolean; member?: string; from_team?: string; to_team?: string };
      if (!result.ok) return errResponse(result.error || 'Move failed');

      // If expDate provided, upsert into renewals table
      const expDate = textValue(p.expDate || p.expiryDate || p.expiry);
      if (expDate) {
        await db.from('renewals').upsert(
          { member_id: memberId, expiry_date: expDate },
          { onConflict: 'member_id' },
        );
      }

      return jsonResponse({ ...result, warnings: [] });
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
    // Frontend sends { memberName: name } — resolve by name then archive
    case 'archiveMember': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const lookup = await findMemberByLegacyPayload(db, p);
      if (lookup.error || !lookup.member) return errResponse(lookup.error || 'member not found');

      const { error } = await db
        .from('members')
        .update({ is_archived: true, is_new_member: false, archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', lookup.member.id);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    // ── UNARCHIVE member ──────────────────────────────────────
    // Frontend sends { memberName: name } — resolve by name then unarchive
    case 'unarchiveMember': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      // For unarchive, allow searching archived members too
      const memberNameRaw = textValue(p.memberName || p.name);
      if (!memberNameRaw) return errResponse('memberName required');
      const { data: mRow, error: mErr } = await db.from('members').select('id').ilike('name', memberNameRaw).maybeSingle();
      if (mErr) return errResponse(mErr.message);
      if (!mRow) return errResponse(`ไม่พบสมาชิก: ${memberNameRaw}`);

      const { error } = await db
        .from('members')
        .update({ is_archived: false, archived_at: null, updated_at: new Date().toISOString() })
        .eq('id', String((mRow as Record<string, unknown>).id));
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    // ── ADD new member ────────────────────────────────────────
    case 'addNewMember': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const name       = textValue(p.name || p.memberName);
      const nickname   = textValue(p.nickname || p.nick) || null;
      const mentorTeam = normalizeTeam(p.mentorTeam ?? p.mentor ?? p.targetTeam);
      const email      = textValue(p.email) || null;
      const phone      = textValue(p.phone) || null;
      // joinDate: the actual BNI join date (YYYY-MM-DD) — distinct from created_at
      const joinDateRaw = textValue(p.joinDate || p.startDate);
      const joinDate    = joinDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(joinDateRaw) ? joinDateRaw : null;

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
          email,
          phone,
          joined_date:   joinDate,
        })
        .select('id, name, nickname, mentor_team, email, phone, joined_date')
        .single();
      if (error) return errResponse(error.message);
      const d = data as Record<string, unknown>;
      const memberId = d.id as string;

      // Auto-create renewal record: expiry = joined_date + 365 days
      const warnings: string[] = [];
      if (joinDate) {
        const expiryDate = new Date(joinDate);
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        const expiryStr = expiryDate.toISOString().split('T')[0];
        const { error: renErr } = await db.from('renewals').insert({
          member_id:   memberId,
          expiry_date: expiryStr,
          notes:       'Auto-created on member add',
        });
        if (renErr) warnings.push(`renewal: ${renErr.message}`);
      } else {
        warnings.push('ไม่ได้ระบุ joinDate — ไม่ได้สร้าง Renewal record');
      }

      // Calculate 8W end date for display
      const w8Date = joinDate ? (() => {
        const d2 = new Date(joinDate); d2.setDate(d2.getDate() + 56);
        return d2.toISOString().split('T')[0];
      })() : null;

      return jsonResponse({
        ok: true,
        name:       d.name,
        nick:       d.nickname,
        joinedDate: d.joined_date,
        w8Date,
        expiryDate: joinDate ? (() => { const d2 = new Date(joinDate); d2.setFullYear(d2.getFullYear()+1); return d2.toISOString().split('T')[0]; })() : null,
        member: data,
        ...(warnings.length ? { warnings } : {}),
      });
    }

    // ── DELETE member permanently (MC only) ──────────────────
    case 'deleteMember': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const lookup = await findMemberByLegacyPayload(db, p);
      if (lookup.error || !lookup.member) return errResponse(lookup.error || 'member not found');

      const { error } = await db
        .from('members')
        .delete()
        .eq('id', lookup.member.id);
      if (error) return errResponse(error.message);
      // ON DELETE CASCADE removes all child rows automatically
      return jsonResponse({ ok: true, deleted: lookup.member.name });
    }

    // ── SAVE monthly score ────────────────────────────────────
    case 'saveScore': {
      const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
      if (!auth.ok) return errResponse(auth.error!);

      const lookup = await findMemberByLegacyPayload(db, p);
      if (lookup.error || !lookup.member) return errResponse(lookup.error || 'member not found');

      const memberId = lookup.member.id;
      const year     = Number(p.year || currentBangkokYear());
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

      const lookup = await findMemberByLegacyPayload(db, p);
      if (lookup.error || !lookup.member) return errResponse(lookup.error || 'member not found');

      const memberId = lookup.member.id;
      const status   = textValue(p.status);

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
      const memberName = String(p.memberName || p.fileUrl || '').trim();
      const itemKey    = String(p.itemKey || '').trim();
      // pass=true → passed, pass=false+nopass=true → no-pass, pass=null → reset
      const passRaw    = p.pass;
      const nopassRaw  = p.nopass;
      const pass       = passRaw  === null || passRaw  === undefined ? false : Boolean(passRaw);
      const nopass     = nopassRaw === null || nopassRaw === undefined ? false : Boolean(nopassRaw);
      const isDone     = pass;
      const comment    = p.mentor_comment !== undefined ? String(p.mentor_comment || '').trim() : undefined;
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
      const upsertData: Record<string, unknown> = {
        member_id:  memberId,
        item_key:   itemKey,
        is_done:    isDone,
        pass,
        nopass,
        done_at:    isDone ? now : null,
        updated_at: now,
      };
      if (comment !== undefined) upsertData.mentor_comment = comment;

      const { error } = await db
        .from('new_member_checklist')
        .upsert(upsertData, { onConflict: 'member_id,item_key' });
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
        .select('id, name, nickname, mentor_team, created_at')
        .eq('name', memberName)
        .limit(1)
        .maybeSingle();
      if (mErr) return errResponse(mErr.message);
      if (!member) return jsonResponse({ ok: true, checklist: [], tasks: [], total: 0, done: 0, pct: 0 });
      const m = member as Record<string, unknown>;
      const memberId = String(m.id);

      // BNI Chapter Ideal — Full 41-task mentoring program template
      const TEMPLATE = [
        // 8-Week Mentoring Program
        { itemKey: 'orientation',     phase: '🗓 8-Week Program', timeline: 'Orientation', task: 'New Member Orientation', link: '' },
        { itemKey: 'w1_visitor_day',  phase: '🗓 8-Week Program', timeline: '1st Week',    task: 'Visitor Day — นำสมาชิกมาร่วมประชุม', link: '' },
        { itemKey: 'w2_30sec',        phase: '🗓 8-Week Program', timeline: '2nd Week',    task: '30 Seconds Presentation', link: '' },
        { itemKey: 'w3_referral',     phase: '🗓 8-Week Program', timeline: '3rd Week',    task: 'Referral — ส่งงานให้สมาชิก', link: '' },
        { itemKey: 'w4_121',          phase: '🗓 8-Week Program', timeline: '4th Week',    task: '121 Meeting — จัดนัด 1-2-1', link: '' },
        { itemKey: 'w5_121_followup', phase: '🗓 8-Week Program', timeline: '5th Week',    task: '121 Follow Up', link: '' },
        { itemKey: 'w6_5min_feature', phase: '🗓 8-Week Program', timeline: '6th Week',    task: '5 Minutes Feature Presentation', link: '' },
        { itemKey: 'w7_power_team',   phase: '🗓 8-Week Program', timeline: '7th Week',    task: 'Power Team — สร้างกลุ่มอาชีพ', link: '' },
        { itemKey: 'w8_substitute',   phase: '🗓 8-Week Program', timeline: '8th Week',    task: 'Substitute — ส่งตัวแทนเข้าประชุม', link: '' },
        // Needed Training
        { itemKey: 't_msp',           phase: '📚 Needed Training', timeline: '60 Days', task: 'MSP — Member Success Program', link: '' },
        { itemKey: 't_lcd_review',    phase: '📚 Needed Training', timeline: '60 Days', task: 'Review LCD After MSP', link: '' },
        { itemKey: 't_adv_msp',       phase: '📚 Needed Training', timeline: '60 Days', task: 'Advanced MSP', link: '' },
        { itemKey: 't_1yr_club',      phase: '📚 Needed Training', timeline: '60 Days', task: '1st Year Club', link: '' },
        // New Member Tools
        { itemKey: 'tool_one_page',   phase: '🛠 New Member Tools', timeline: '60 Days', task: 'One Page (Business Profile)', link: '' },
        { itemKey: 'tool_bni_app',    phase: '🛠 New Member Tools', timeline: '60 Days', task: 'BNI Connect Mobile App', link: '' },
        { itemKey: 'tool_r2y',        phase: '🛠 New Member Tools', timeline: '60 Days', task: 'Reporting2You App', link: 'https://bit.ly/r2you' },
        { itemKey: 'tool_slide_121',  phase: '🛠 New Member Tools', timeline: '60 Days', task: 'Slide Template สำหรับ 1-2-1', link: '' },
        { itemKey: 'tool_30s_script', phase: '🛠 New Member Tools', timeline: '60 Days', task: '30s Script — สคริปต์นำเสนอ', link: '' },
        { itemKey: 'tool_passport',   phase: '🛠 New Member Tools', timeline: '60 Days', task: 'Passport Program', link: '' },
        { itemKey: 'tool_sunshine',   phase: '🛠 New Member Tools', timeline: '60 Days', task: 'Sunshine Concept', link: '' },
        { itemKey: 'tool_ref_partner',phase: '🛠 New Member Tools', timeline: '60 Days', task: 'Referral Partner Setup', link: '' },
        { itemKey: 'tool_goal_form',  phase: '🛠 New Member Tools', timeline: '60 Days', task: 'Member Goal Setting Form', link: '' },
        { itemKey: 'tool_green_2mo',  phase: '🛠 New Member Tools', timeline: '60 Days', task: 'Green Member — ภายใน 2 เดือน', link: '' },
        // 3 Months
        { itemKey: 'm3_gains_121',    phase: '📊 3 Months Program', timeline: '3 Months', task: 'Review : GAINS & 121 Meeting', link: '' },
        { itemKey: 'm3_msp_review',   phase: '📊 3 Months Program', timeline: '3 Months', task: 'Review : MSP & Advanced MSP', link: '' },
        { itemKey: 'm3_survey',       phase: '📊 3 Months Program', timeline: '3 Months', task: 'Member Survey : 3 Months', link: '' },
        // 6 Months
        { itemKey: 'm6_pd_care',      phase: '📈 6 Months Program', timeline: '6 Months', task: 'PD & Support Care Call', link: '' },
        { itemKey: 'm6_adv_skill',    phase: '📈 6 Months Program', timeline: '6 Months', task: 'Advanced Skill Training', link: '' },
        { itemKey: 'm6_lt_support',   phase: '📈 6 Months Program', timeline: '6 Months', task: 'Assist Leadership Team Support', link: '' },
        { itemKey: 'm6_survey',       phase: '📈 6 Months Program', timeline: '6 Months', task: 'Member Survey : 6 Months', link: '' },
        // 7 Months
        { itemKey: 'm7_become_mentor',phase: '🚀 7 Months Program', timeline: '7 Months', task: 'Become a Mentor', link: '' },
        { itemKey: 'm7_sponsor',      phase: '🚀 7 Months Program', timeline: '7 Months', task: 'Sponsor a New Member', link: '' },
        { itemKey: 'm7_power_team',   phase: '🚀 7 Months Program', timeline: '7 Months', task: 'Engage in Power Team', link: '' },
        // 9 Months
        { itemKey: 'm9_renewal_ann',  phase: '🔄 9 Months Program', timeline: '9 Months', task: 'ST : Renewal Announcement', link: '' },
        { itemKey: 'm9_renewal_int',  phase: '🔄 9 Months Program', timeline: '9 Months', task: 'MCC : Renewal Interview', link: '' },
        { itemKey: 'm9_renewal_pay',  phase: '🔄 9 Months Program', timeline: '9 Months', task: 'Renewal Payment & Process', link: '' },
        // 10 Months
        { itemKey: 'm10_renewal_fu',  phase: '💎 10 Months Program', timeline: '10 Months', task: 'MCC : Renewal Follow Up', link: '' },
        // 12 Months
        { itemKey: 'm12_refresh_msp', phase: '🎓 12 Months Program', timeline: '12 Months', task: 'Refresh MSP', link: '' },
        { itemKey: 'm12_adv_msp',     phase: '🎓 12 Months Program', timeline: '12 Months', task: 'Refresh Advanced MSP', link: '' },
        { itemKey: 'm12_1yr_club',    phase: '🎓 12 Months Program', timeline: '12 Months', task: 'Refresh 1st Year Club', link: '' },
        { itemKey: 'm12_survey',      phase: '🎓 12 Months Program', timeline: '12 Months', task: 'Member Survey : 12 Months', link: '' },
      ];

      const { data: clData, error: clErr } = await db
        .from('new_member_checklist')
        .select('item_key, is_done, done_at, pass, nopass, mentor_comment, updated_at')
        .eq('member_id', memberId);
      if (clErr) return errResponse(clErr.message);

      const doneMap: Record<string, { isDone: boolean; pass: boolean; nopass: boolean; doneAt: string | null; comment: string }> = {};
      for (const r of (clData || []) as Record<string, unknown>[]) {
        doneMap[String(r.item_key)] = {
          isDone:  Boolean(r.is_done),
          pass:    Boolean(r.pass),
          nopass:  Boolean(r.nopass),
          doneAt:  r.done_at ? String(r.done_at) : null,
          comment: String(r.mentor_comment || ''),
        };
      }

      const tasks = TEMPLATE.map((t) => {
        const state = doneMap[t.itemKey];
        const pass   = state?.pass   ?? false;
        const nopass = state?.nopass ?? false;
        const doneAt = state?.doneAt ?? null;
        return {
          itemKey:  t.itemKey,
          phase:    t.phase,
          timeline: t.timeline,
          task:     t.task,
          link:     t.link || '',
          pass,
          nopass,
          date:     doneAt ? doneAt.split('T')[0] : '',
          by:       '',
          comment:  state?.comment || '',
          status:   pass ? 'ผ่านแล้ว' : nopass ? 'ยังไม่ผ่าน' : 'ยังไม่ดำเนินการ',
        };
      });

      const totalCount = tasks.length;
      const doneCount  = tasks.filter((t) => t.pass).length;
      const pct        = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0;

      const createdAt = String(m.created_at || '');
      const startDate = createdAt.split('T')[0] || '';

      return jsonResponse({
        ok:         true,
        memberName: String(m.name),
        nick:       String(m.nickname || ''),
        mentor:     String(m.mentor_team || ''),
        startDate,
        total:      totalCount,
        done:       doneCount,
        pct,
        tasks,
        fileUrl:    String(m.name),
      });
    }

    // ── BATCH add new members (MC only) ──────────────────────
    case 'addNewMembersBatch': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const rawMembers = Array.isArray(p.members) ? p.members as Record<string, unknown>[] : [];
      if (!rawMembers.length) return errResponse('members array required');

      const rows = rawMembers.map((m) => {
        const jd = String(m.joined_date || m.startDate || m.joinDate || '').trim();
        return {
          name:          String(m.name || '').trim(),
          nickname:      String(m.nick || m.nickname || '').trim(),
          mentor_team:   m.mentor_team || m.mentorTeam ? String(m.mentor_team || m.mentorTeam) : null,
          is_new_member: true,
          is_archived:   false,
          joined_date:   /^\d{4}-\d{2}-\d{2}$/.test(jd) ? jd : null,
        };
      }).filter((m) => m.name);

      const { data: inserted, error } = await db
        .from('members')
        .upsert(rows, { onConflict: 'name', ignoreDuplicates: false })
        .select('id, joined_date');
      if (error) return errResponse(error.message);

      // Auto-create renewal records for members with joined_date
      const renewalRows = (inserted || [])
        .filter((m: Record<string, unknown>) => m.joined_date)
        .map((m: Record<string, unknown>) => {
          const exp = new Date(String(m.joined_date));
          exp.setFullYear(exp.getFullYear() + 1);
          return { member_id: m.id, expiry_date: exp.toISOString().split('T')[0], notes: 'Auto-created on batch add' };
        });
      if (renewalRows.length) {
        await db.from('renewals').upsert(renewalRows, { onConflict: 'member_id', ignoreDuplicates: true });
      }
      return jsonResponse({ ok: true, count: rows.length });
    }

    // ── GET new members with checklist progress + latest note ─
    case 'getNewMembers': {
      // Mentors see only their own team; MC sees everyone
      let callerTeam: string | null = null;
      if (p.token || p.role) {
        const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp', 'growth']);
        if (auth.ok && auth.role && auth.role !== 'mc' && auth.role !== 'growth') {
          callerTeam = auth.teamName ?? null;
        }
      }

      let query = db
        .from('members')
        .select('id, name, nickname, mentor_team, created_at, joined_date')
        .eq('is_new_member', true)
        .eq('is_archived', false);
      if (callerTeam) {
        query = query.eq('mentor_team', callerTeam);
      }
      const { data: members, error: mErr } = await query.order('name');
      if (mErr) return errResponse(mErr.message);
      if (!members || members.length === 0) return jsonResponse({ ok: true, members: [] });

      const memberIds = (members as Record<string, unknown>[]).map((m) => m.id as string);

      // Fetch checklist rows for all these members
      const CHECKLIST_TOTAL = 41; // must match TEMPLATE.length in getNMChecklist
      const { data: clRows, error: clErr } = await db
        .from('new_member_checklist')
        .select('member_id, is_done, pass')
        .in('member_id', memberIds);
      if (clErr) return errResponse(clErr.message);

      // Fetch latest notes for all these members
      const { data: noteRows, error: noteErr } = await db
        .from('member_notes')
        .select('member_id, note, updated_at')
        .in('member_id', memberIds)
        .order('updated_at', { ascending: false });
      if (noteErr) return errResponse(noteErr.message);

      // Fetch renewal/expiry dates
      const { data: renewalRows } = await db
        .from('renewals')
        .select('member_id, expiry_date')
        .in('member_id', memberIds);
      const expiryMap: Record<string, string> = {};
      for (const r of (renewalRows || []) as Record<string, unknown>[]) {
        expiryMap[String(r.member_id)] = String(r.expiry_date || '');
      }

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
        const total   = CHECKLIST_TOTAL; // always 41, never items.length
        const pct     = Math.round(done / total * 100);

        // Use joined_date (actual BNI join date), fall back to created_at
        const joinedDate = String(m.joined_date || '').split('T')[0];
        const createdAt  = String(m.created_at || '');
        const startDate  = joinedDate || createdAt.split('T')[0] || '';
        let w8Date = '';
        if (startDate) {
          const d = new Date(startDate);
          d.setDate(d.getDate() + 56); // 8 weeks = 56 days
          w8Date = d.toISOString().split('T')[0];
        }

        const statusText = pct >= 100 ? 'ครบทุกข้อ' : done > 0 ? `${done}/${total} ข้อ` : 'ยังไม่ได้เริ่ม';

        return {
          id,
          name:           m.name,
          nick:           m.nickname,
          mentor:         m.mentor_team,   // frontend uses nm.mentor
          mentorTeam:     m.mentor_team,
          checklistDone:  done,
          checklistTotal: total,
          progress:       pct,
          joinedDate:     startDate,       // actual BNI join date
          startDate,                       // alias kept for backward compat
          w8Date,
          expDate:        expiryMap[id] || '',
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

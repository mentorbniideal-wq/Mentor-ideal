import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { provisionLineExperience } from '../../_shared/line-provision.ts';
import { linePushMessages } from '../../_shared/line.ts';

const ADMIN_SECTIONS = ['dashboard','members','issues','checkin','revenue','broadcast'] as const;
type LineMenuRole = 'member' | 'mentor' | 'mc' | 'growth';
const MOBILE_ACCESS_ROLES = ['mc','toomtam','aof','draft','phai','amp','mentor_support','growth'] as const;

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function googleUserFromToken(token: string): Promise<{ email: string; name: string } | null> {
  if (!token) return null;
  const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: { user }, error } = await anonClient.auth.getUser(token);
  if (error || !user?.email) return null;
  return {
    email: user.email.trim().toLowerCase(),
    name: String(user.user_metadata?.full_name || user.email.split('@')[0]).slice(0, 120),
  };
}

function expectedMenuRole(settingKey: string): LineMenuRole {
  if (settingKey === 'LINE_ID_MC') return 'member';
  if (settingKey === 'LINE_ID_GROWTH') return 'member';
  return 'member';
}

async function getLineMenuForUser(token: string, lineUserId: string): Promise<{
  ok: boolean;
  richMenuId: string | null;
  error?: string;
}> {
  try {
    const response = await fetch(
      `https://api.line.me/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (response.status === 404) return { ok: true, richMenuId: null };
    const text = await response.text();
    if (!response.ok) return { ok: false, richMenuId: null, error: `LINE ${response.status}: ${text.slice(0, 160)}` };
    return { ok: true, richMenuId: String((JSON.parse(text) as Record<string, unknown>).richMenuId || '') || null };
  } catch (e) {
    return { ok: false, richMenuId: null, error: (e as Error).message };
  }
}

async function checkUrl(url: string): Promise<{ url: string; ok: boolean; status: number | null }> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    response.body?.cancel();
    return { url, ok: response.ok, status: response.status };
  } catch {
    return { url, ok: false, status: null };
  }
}

export async function handleAdminSettings(p: Record<string, unknown>): Promise<Response> {
  const db     = getServiceClient();
  const action = String(p.action);

  // ── Public (Google-authenticated but NOT necessarily role-assigned) ──────────
  if (action === 'submitAccessRequest') {
    const token = String(p.token || '');
    if (!token) return errResponse('Authentication required');

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );
    const { data: { user }, error: userErr } = await anonClient.auth.getUser(token);
    if (userErr || !user?.email) return errResponse('Invalid session — please sign in with Google first');

    const email    = user.email.toLowerCase();
    const name     = String(p.name || '').trim().slice(0, 100);
    const sections = (Array.isArray(p.sections) ? p.sections as string[] : [])
      .filter(s => ADMIN_SECTIONS.includes(s as typeof ADMIN_SECTIONS[number]));
    const editAccess = Boolean(p.editAccess);
    const reason     = String(p.reason || '').trim().slice(0, 500);

    // Already role-assigned → tell frontend
    const { data: existing } = await db.from('role_assignments').select('email').eq('email', email).maybeSingle();
    if (existing) return jsonResponse({ ok: false, error: 'already_assigned' });

    // Deduplicate: pending request already exists
    const { data: dup } = await db
      .from('access_requests')
      .select('id')
      .eq('email', email)
      .eq('status', 'pending')
      .maybeSingle();
    if (dup) return jsonResponse({ ok: true, alreadyPending: true });

    const { error } = await db.from('access_requests').insert({
      email,
      name: name || (user.user_metadata?.full_name as string) || email.split('@')[0],
      requested_sections: sections,
      edit_access: editAccess,
      reason,
      status: 'pending',
    });
    if (error) return errResponse(error.message);
    return jsonResponse({ ok: true });
  }

  // Public invite lookup. Only a high-entropy, expiring token is accepted.
  if (action === 'getMobileAccessInvite') {
    const rawToken = String(p.inviteToken || '');
    if (rawToken.length < 32) return errResponse('ลิงก์เชิญไม่ถูกต้อง');
    const { data: invite, error } = await db
      .from('mobile_access_invitations')
      .select('id, approved_role, approved_team_name, status, expires_at, members(name, nickname)')
      .eq('token_hash', await sha256(rawToken)).maybeSingle();
    if (error || !invite) return errResponse('ไม่พบลิงก์เชิญ หรือมีการออกลิงก์ใหม่แล้ว', 404);
    const row = invite as Record<string, unknown>;
    if (String(row.status) !== 'pending') return errResponse('ลิงก์นี้ถูกใช้หรือยกเลิกแล้ว');
    if (new Date(String(row.expires_at)).getTime() <= Date.now()) return errResponse('ลิงก์นี้หมดอายุแล้ว กรุณาขอ Chapter Admin ออกใหม่');
    const member = (row.members || {}) as Record<string, unknown>;
    return jsonResponse({
      ok: true,
      invite: {
        memberName: String(member.nickname || member.name || ''),
        approvedRole: String(row.approved_role),
        teamName: row.approved_team_name ? String(row.approved_team_name) : null,
        expiresAt: String(row.expires_at),
      },
    });
  }

  // Claim requires both the one-time invitation and a verified Google session.
  if (action === 'claimMobileAccessInvite') {
    const rawToken = String(p.inviteToken || '');
    const googleUser = await googleUserFromToken(String(p.token || ''));
    if (!googleUser) return errResponse('กรุณาเข้าสู่ระบบด้วย Google ก่อน');
    if (rawToken.length < 32) return errResponse('ลิงก์เชิญไม่ถูกต้อง');
    const tokenHash = await sha256(rawToken);
    const { data: invite, error } = await db
      .from('mobile_access_invitations')
      .select('id, member_id, approved_role, approved_team_name, status, expires_at, members(name, nickname)')
      .eq('token_hash', tokenHash).maybeSingle();
    if (error || !invite) return errResponse('ไม่พบลิงก์เชิญ', 404);
    const row = invite as Record<string, unknown>;
    if (String(row.status) !== 'pending') return errResponse('ลิงก์นี้ถูกใช้หรือยกเลิกแล้ว');
    if (new Date(String(row.expires_at)).getTime() <= Date.now()) return errResponse('ลิงก์นี้หมดอายุแล้ว');
    const role = String(row.approved_role || '');
    if (!MOBILE_ACCESS_ROLES.includes(role as typeof MOBILE_ACCESS_ROLES[number])) return errResponse('บทบาทในลิงก์ไม่ถูกต้อง');
    const member = (row.members || {}) as Record<string, unknown>;
    const displayName = String(member.nickname || member.name || googleUser.name).slice(0, 120);
    const isMentor = ['toomtam','aof','draft','phai','amp','mentor_support'].includes(role);
    const { data: activeTerm } = await db.from('lt_terms').select('id,ends_on').eq('status', 'active').maybeSingle();
    const termExpiry = activeTerm?.ends_on ? `${String(activeTerm.ends_on)}T23:59:59+07:00` : null;

    const { data: existingAssignment } = await db.from('role_assignments').select('email, role, member_id')
      .eq('email', googleUser.email).maybeSingle();
    if (existingAssignment && String(existingAssignment.member_id || '') !== String(row.member_id)) {
      return errResponse('Gmail นี้ผูกกับสมาชิกคนอื่นอยู่ กรุณาให้ Chapter Admin ตรวจสอบก่อน');
    }
    const createdNewAssignment = !existingAssignment;
    const { error: assignError } = await db.from('role_assignments').upsert({
      email: googleUser.email,
      member_id: String(row.member_id),
      role,
      display_name: displayName,
      team_name: row.approved_team_name || null,
      is_mc: role === 'mc',
      is_mentor: isMentor,
      access_status: 'active',
      access_expires_at: termExpiry,
      term_id: activeTerm?.id || null,
    }, { onConflict: 'email' });
    if (assignError) return errResponse(assignError.message);

    const { data: claimed, error: claimError } = await db.from('mobile_access_invitations').update({
      status: 'claimed', claimed_email: googleUser.email,
      claimed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', String(row.id)).eq('status', 'pending').select('id').maybeSingle();
    if (claimError || !claimed) {
      if (createdNewAssignment) {
        await db.from('role_assignments').delete().eq('email', googleUser.email).eq('role', role);
      }
      return errResponse('ลิงก์ถูกใช้งานพร้อมกัน กรุณาติดต่อ Chapter Admin');
    }
    return jsonResponse({ ok: true, email: googleUser.email, role, displayName });
  }

  // ── PIN session verification (open to all authenticated roles) ──────────────
  if (action === 'getAdminSessionInfo') {
    const auth = await requireAuth(db, p);
    if (!auth.ok) return errResponse(auth.error!);
    return jsonResponse({
      ok:              true,
      role:            auth.role,
      isMC:            auth.isMC,
      isMentor:        auth.isMentor,
      isAdmin:         auth.isAdmin,
      displayName:     auth.displayName,
      adminSections:   auth.adminSections || [],
      adminEditAccess: Boolean(auth.adminEditAccess),
      capabilities:    auth.capabilities || [],
    });
  }

  // ── Chapter Admin-only control plane ───────────────────────────────────────
  // Mentor Co uses the operational pages granted through admin_sections, but
  // cannot change accounts, invitations, LINE configuration, or system settings.
  const auth = await requireAuth(db, p);
  if (!auth.ok) return errResponse(auth.error!);
  if (!auth.isAdmin) return errResponse('เฉพาะ Chapter Admin เท่านั้นที่จัดการการเข้าถึงและการตั้งค่าระบบได้', 403);

  if (action === 'getChapterConfiguration') {
    const { data: activeKeyRow, error: activeKeyError } = await db.from('settings')
      .select('value').eq('key', 'ACTIVE_CHAPTER_KEY').maybeSingle();
    if (activeKeyError) return errResponse(activeKeyError.message);
    const activeChapterKey = String(activeKeyRow?.value || 'bni-ideal');
    const [{ data: chapter, error }, { count: activeMembers }, { count: linkedMembers }, { data: recentJobs }] = await Promise.all([
      db.from('chapter_profiles').select('id,chapter_key,display_name,short_name,timezone,locale,meeting_weekday,meeting_time,branding,scoring_config,notification_config,config_version,is_active,created_at,updated_at').eq('chapter_key', activeChapterKey).maybeSingle(),
      db.from('members').select('id', { count: 'exact', head: true }).eq('is_archived', false),
      db.from('line_members').select('member_id', { count: 'exact', head: true }).not('line_user_id', 'is', null),
      db.from('system_job_runs').select('job_name,status,started_at,error').order('started_at', { ascending: false }).limit(50),
    ]);
    if (error) return errResponse(error.message);
    if (!chapter) return errResponse('ยังไม่มี Active Chapter configuration', 404);
    const { data: revisions, error: revisionError } = await db.from('chapter_profile_revisions')
      .select('id,config_version,changed_by,change_reason,created_at')
      .eq('chapter_id', chapter.id).order('config_version', { ascending: false }).limit(10);
    if (revisionError) return errResponse(revisionError.message);
    const required = [
      ['display_name', Boolean(chapter.display_name)], ['short_name', Boolean(chapter.short_name)],
      ['timezone', Boolean(chapter.timezone)], ['locale', Boolean(chapter.locale)],
      ['meeting_time', Boolean(chapter.meeting_time)],
    ];
    const failedJobs = ((recentJobs || []) as Record<string, unknown>[]).filter(row =>
      String(row.status) === 'failed' && Date.now() - new Date(String(row.started_at)).getTime() < 24 * 60 * 60_000
    );
    const issues = required.filter(([, ok]) => !ok).map(([field]) => ({ level: 'critical', code: `missing_${field}`, message: `ยังไม่ได้ตั้งค่า ${field}` }));
    if (!Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')) issues.push({ level: 'critical', code: 'line_token_missing', message: 'LINE Bot Token ยังไม่พร้อม' });
    if (failedJobs.length) issues.push({ level: 'warning', code: 'jobs_failed_24h', message: `มีงานอัตโนมัติล้มเหลว ${failedJobs.length} รายการใน 24 ชั่วโมง` });
    const total = Number(activeMembers || 0), linked = Number(linkedMembers || 0);
    if (total && linked < total) issues.push({ level: 'warning', code: 'line_coverage', message: `สมาชิกผูก LINE ${linked}/${total} คน` });
    return jsonResponse({ ok: true, chapter, revisions: revisions || [], health: { status: issues.some(x => x.level === 'critical') ? 'blocked' : issues.length ? 'attention' : 'healthy', issues, activeMembers: total, linkedMembers: linked } });
  }

  if (action === 'updateChapterConfiguration') {
    const chapterKey = String(p.chapterKey || '').trim().toLowerCase();
    const displayName = String(p.displayName || '').trim();
    const shortName = String(p.shortName || '').trim();
    const timezone = String(p.timezone || '').trim();
    const locale = String(p.locale || '').trim();
    const meetingWeekday = Number(p.meetingWeekday);
    const meetingTime = String(p.meetingTime || '').trim();
    const reason = String(p.reason || '').trim().slice(0, 300);
    if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(chapterKey)) return errResponse('Chapter key ใช้ได้เฉพาะ a-z, 0-9, _ และ -');
    if (displayName.length < 2 || displayName.length > 120 || shortName.length < 2 || shortName.length > 40) return errResponse('กรุณาตรวจชื่อ Chapter');
    try { new Intl.DateTimeFormat('th-TH', { timeZone: timezone }).format(); } catch { return errResponse('Timezone ไม่ถูกต้อง'); }
    if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale)) return errResponse('Locale ไม่ถูกต้อง เช่น th-TH');
    if (!Number.isInteger(meetingWeekday) || meetingWeekday < 0 || meetingWeekday > 6) return errResponse('วันประชุมไม่ถูกต้อง');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(meetingTime)) return errResponse('เวลาประชุมไม่ถูกต้อง');
    const { data: activeKeyRow } = await db.from('settings').select('value').eq('key', 'ACTIVE_CHAPTER_KEY').maybeSingle();
    const { data: current, error: currentError } = await db.from('chapter_profiles').select('*').eq('chapter_key', String(activeKeyRow?.value || 'bni-ideal')).maybeSingle();
    if (currentError || !current) return errResponse(currentError?.message || 'ไม่พบ Active Chapter');
    if (Number(p.expectedVersion) !== Number(current.config_version)) return errResponse('ข้อมูลถูกแก้จากหน้าจออื่น กรุณา Refresh แล้วตรวจใหม่', 409);
    const nextVersion = Number(current.config_version) + 1;
    const update = { chapter_key: chapterKey, display_name: displayName, short_name: shortName, timezone, locale, meeting_weekday: meetingWeekday, meeting_time: meetingTime, config_version: nextVersion, updated_at: new Date().toISOString() };
    const { data: saved, error: saveError } = await db.from('chapter_profiles').update(update).eq('id', current.id).eq('config_version', current.config_version).select('*').maybeSingle();
    if (saveError || !saved) return errResponse(saveError?.message || 'บันทึกไม่สำเร็จ กรุณา Refresh');
    const actor = String(auth.displayName || auth.role || 'Chapter Admin');
    const snapshot = { ...saved }; delete (snapshot as Record<string, unknown>).created_at; delete (snapshot as Record<string, unknown>).updated_at;
    await Promise.all([
      db.from('chapter_profile_revisions').insert({ chapter_id: saved.id, config_version: nextVersion, snapshot, changed_by: actor, change_reason: reason || 'Updated from Chapter Settings' }),
      db.from('settings').upsert([
        { key: 'ACTIVE_CHAPTER_KEY', value: chapterKey }, { key: 'CHAPTER_DISPLAY_NAME', value: displayName },
        { key: 'CHAPTER_TIMEZONE', value: timezone }, { key: 'CHAPTER_MEETING_WEEKDAY', value: String(meetingWeekday) },
        { key: 'CHAPTER_MEETING_TIME', value: meetingTime },
      ], { onConflict: 'key' }),
      db.from('chapter_audit_events').insert({ event_type: 'chapter_configuration_updated', actor_role: String(auth.role), actor_ref: actor, subject_type: 'chapter_profile', subject_ref: String(saved.id), metadata: { from_version: current.config_version, to_version: nextVersion, changed_fields: Object.keys(update).filter(key => key !== 'updated_at' && key !== 'config_version' && String((current as Record<string, unknown>)[key]) !== String((update as Record<string, unknown>)[key])) } }),
    ]);
    return jsonResponse({ ok: true, chapter: saved });
  }

  if (action === 'restoreChapterConfiguration') {
    if (p.confirmed !== true) return errResponse('กรุณายืนยันก่อนย้อน Configuration');
    const revisionId = String(p.revisionId || '');
    const { data: activeKeyRow } = await db.from('settings').select('value').eq('key', 'ACTIVE_CHAPTER_KEY').maybeSingle();
    const [{ data: current }, { data: revision }] = await Promise.all([
      db.from('chapter_profiles').select('*').eq('chapter_key', String(activeKeyRow?.value || 'bni-ideal')).maybeSingle(),
      db.from('chapter_profile_revisions').select('*').eq('id', revisionId).maybeSingle(),
    ]);
    if (!current || !revision || String(revision.chapter_id) !== String(current.id)) return errResponse('ไม่พบ revision ที่เลือก');
    const snap = (revision.snapshot || {}) as Record<string, unknown>;
    const nextVersion = Number(current.config_version) + 1;
    const restored = { chapter_key: snap.chapter_key, display_name: snap.display_name, short_name: snap.short_name, timezone: snap.timezone, locale: snap.locale, meeting_weekday: snap.meeting_weekday, meeting_time: snap.meeting_time, branding: snap.branding || {}, scoring_config: snap.scoring_config || {}, notification_config: snap.notification_config || {}, config_version: nextVersion, updated_at: new Date().toISOString() };
    const { data: saved, error } = await db.from('chapter_profiles').update(restored).eq('id', current.id).eq('config_version', current.config_version).select('*').maybeSingle();
    if (error || !saved) return errResponse(error?.message || 'ย้อน Configuration ไม่สำเร็จ');
    const actor = String(auth.displayName || auth.role || 'Chapter Admin');
    const snapshot = { ...saved }; delete (snapshot as Record<string, unknown>).created_at; delete (snapshot as Record<string, unknown>).updated_at;
    await Promise.all([
      db.from('chapter_profile_revisions').insert({ chapter_id: saved.id, config_version: nextVersion, snapshot, changed_by: actor, change_reason: `Restored from version ${revision.config_version}` }),
      db.from('settings').upsert([{ key:'ACTIVE_CHAPTER_KEY',value:String(saved.chapter_key) },{ key:'CHAPTER_DISPLAY_NAME',value:String(saved.display_name) },{ key:'CHAPTER_TIMEZONE',value:String(saved.timezone) },{ key:'CHAPTER_MEETING_WEEKDAY',value:String(saved.meeting_weekday) },{ key:'CHAPTER_MEETING_TIME',value:String(saved.meeting_time).slice(0,5) }], { onConflict:'key' }),
      db.from('chapter_audit_events').insert({ event_type:'chapter_configuration_restored',actor_role:String(auth.role),actor_ref:actor,subject_type:'chapter_profile',subject_ref:String(saved.id),metadata:{ restored_from_version:revision.config_version,to_version:nextVersion } }),
    ]);
    return jsonResponse({ ok:true, chapter:saved });
  }

  if (action === 'getRoleAssignments') {
    const { data, error } = await db
      .from('role_assignments')
      .select('email, role, display_name, team_name, member_id, is_mc, is_mentor, is_admin, admin_sections, admin_edit_access, capabilities, access_status, access_expires_at, term_id, created_at, updated_at')
      .order('role');
    if (error) return errResponse(error.message);
    return jsonResponse({ ok: true, assignments: data || [] });
  }

  if (action === 'getMobileAccessInvites') {
    await db.from('mobile_access_invitations').update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('status', 'pending').lte('expires_at', new Date().toISOString());
    const [{ data: invites, error }, { data: linked }] = await Promise.all([
      db.from('mobile_access_invitations')
        .select('id, member_id, approved_role, approved_team_name, status, claimed_email, expires_at, created_at, sent_at, claimed_at, members(name, nickname)')
        .order('created_at', { ascending: false }).limit(100),
      db.from('line_members').select('member_id, line_user_id, members(name, nickname)').limit(300),
    ]);
    if (error) return errResponse(error.message);
    const members = ((linked || []) as Record<string, unknown>[]).map(item => {
      const member = (item.members || {}) as Record<string, unknown>;
      return {
        memberId: String(item.member_id || ''), lineUserId: String(item.line_user_id || ''),
        name: String(member.name || ''), nickname: String(member.nickname || ''),
      };
    }).filter(item => item.memberId && item.lineUserId);
    return jsonResponse({ ok: true, invites: invites || [], members });
  }

  if (action === 'getMentorMobileAccess') {
    const memberId = String(p.memberId || '');
    if (!memberId) return errResponse('กรุณาเลือกสมาชิก');
    const [{ data: member }, { data: assignment }, { data: invite }] = await Promise.all([
      db.from('members').select('id, name, nickname').eq('id', memberId).maybeSingle(),
      db.from('role_assignments')
        .select('email, role, display_name, team_name, member_id, access_status, access_expires_at, term_id, created_at')
        .eq('member_id', memberId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      db.from('mobile_access_invitations')
        .select('id, status, approved_role, approved_team_name, claimed_email, sent_at, claimed_at, expires_at, created_at')
        .eq('member_id', memberId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!member) return errResponse('ไม่พบสมาชิก', 404);
    return jsonResponse({ ok: true, member, assignment: assignment || null, latestInvite: invite || null });
  }

  if (action === 'updateMentorMobileEmail') {
    const memberId = String(p.memberId || '');
    const email = String(p.email || '').trim().toLowerCase();
    if (!memberId) return errResponse('กรุณาเลือกสมาชิก');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errResponse('รูปแบบ Gmail ไม่ถูกต้อง');
    const { data: current, error: currentError } = await db.from('role_assignments')
      .select('email, role, display_name, team_name, member_id, is_mc, is_mentor, is_admin, admin_sections, admin_edit_access, capabilities, access_status, access_expires_at, term_id')
      .eq('member_id', memberId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (currentError) return errResponse(currentError.message);
    if (!current) return errResponse('สมาชิกยังไม่เคยผูก Mentor Mobile กรุณาส่งคำเชิญครั้งแรกก่อน');
    if (String(current.email).toLowerCase() === email) return jsonResponse({ ok: true, email, unchanged: true });
    const { data: occupied } = await db.from('role_assignments').select('email, display_name').eq('email', email).maybeSingle();
    if (occupied) return errResponse('Gmail นี้มีสิทธิ์ในระบบอยู่แล้ว');
    const replacement = { ...current, email } as Record<string, unknown>;
    delete replacement.created_at;
    const { error: insertError } = await db.from('role_assignments').insert(replacement);
    if (insertError) return errResponse(insertError.message);
    const { error: deleteError } = await db.from('role_assignments').delete().eq('email', String(current.email));
    if (deleteError) {
      await db.from('role_assignments').delete().eq('email', email);
      return errResponse(deleteError.message);
    }
    await db.from('mobile_access_invitations').update({ claimed_email: email, updated_at: new Date().toISOString() })
      .eq('member_id', memberId).eq('status', 'claimed');
    return jsonResponse({ ok: true, email, previousEmail: current.email });
  }

  if (action === 'createMobileAccessInvite') {
    const memberId = String(p.memberId || '');
    const role = String(p.approvedRole || '').toLowerCase();
    const teamName = String(p.teamName || '').trim().slice(0, 80) || null;
    if (!memberId || !MOBILE_ACCESS_ROLES.includes(role as typeof MOBILE_ACCESS_ROLES[number])) {
      return errResponse('กรุณาเลือกสมาชิกและบทบาทที่ถูกต้อง');
    }
    const { data: linked } = await db.from('line_members').select('line_user_id, members(name, nickname)')
      .eq('member_id', memberId).maybeSingle();
    if (!linked?.line_user_id) return errResponse('สมาชิกคนนี้ยังไม่ได้ผูก LINE จึงยังส่งลิงก์ไม่ได้');
    await db.from('mobile_access_invitations').update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('member_id', memberId).eq('status', 'pending');
    const rawToken = randomInviteToken();
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const { data: created, error } = await db.from('mobile_access_invitations').insert({
      token_hash: await sha256(rawToken), member_id: memberId,
      line_user_id: String(linked.line_user_id), approved_role: role,
      approved_team_name: teamName, expires_at: expiresAt,
      created_by: auth.displayName || auth.role || 'Chapter Admin',
    }).select('id').single();
    if (error) return errResponse(error.message);
    const appUrl = String(Deno.env.get('PUBLIC_APP_URL') || 'https://bni-mentor-system.vercel.app').replace(/\/$/, '');
    return jsonResponse({ ok: true, inviteId: created.id, inviteToken: rawToken,
      inviteUrl: `${appUrl}/mobile-access.html?invite=${encodeURIComponent(rawToken)}`, expiresAt });
  }

  if (action === 'sendMobileAccessInvite') {
    const inviteId = String(p.inviteId || '');
    const rawToken = String(p.inviteToken || '');
    const { data: invite } = await db.from('mobile_access_invitations')
      .select('id, member_id, line_user_id, approved_role, approved_team_name, status, expires_at, token_hash, members(name, nickname)')
      .eq('id', inviteId).maybeSingle();
    if (!invite || String(invite.status) !== 'pending' || String(invite.token_hash) !== await sha256(rawToken)) {
      return errResponse('ลิงก์เชิญไม่ถูกต้องหรือใช้งานไม่ได้แล้ว');
    }
    if (new Date(String(invite.expires_at)).getTime() <= Date.now()) return errResponse('ลิงก์หมดอายุแล้ว');
    const member = (invite.members || {}) as unknown as Record<string, unknown>;
    const name = String(member.nickname || member.name || 'สมาชิก');
    const appUrl = String(Deno.env.get('PUBLIC_APP_URL') || 'https://bni-mentor-system.vercel.app').replace(/\/$/, '');
    const inviteUrl = `${appUrl}/mobile-access.html?invite=${encodeURIComponent(rawToken)}`;
    const defaultMessage = `🔐 คำเชิญเข้า Mentor Mobile\n\nสวัสดีครับคุณ${name}\nChapter Admin ได้เตรียมสิทธิ์ ${String(invite.approved_team_name || invite.approved_role)} ให้แล้ว\n\nกดลิงก์เพื่อผูก Gmail และตั้ง PIN 4 ตัวสำหรับเครื่องนี้:\n${inviteUrl}\n\nลิงก์ใช้ได้ครั้งเดียวและหมดอายุภายใน 7 วัน หากไม่ได้ร้องขอ ไม่ต้องกดลิงก์นี้ครับ`;
    if (p.dryRun !== false) return jsonResponse({ ok: true, dryRun: true, audience: name, message: defaultMessage, inviteUrl });
    if (p.confirmed !== true) return errResponse('กรุณาตรวจข้อความและยืนยันก่อนส่ง LINE');
    const message = String(p.customMessage || defaultMessage).trim().slice(0, 5000);
    if (!message.includes(inviteUrl)) return errResponse('ข้อความต้องมีลิงก์ตั้งค่า Mentor Mobile');
    const result = await linePushMessages(String(invite.line_user_id), [{ type: 'text', text: message }], {
      db, memberId: String(invite.member_id), notificationType: 'mobile_access_invite',
      source: 'admin-api/mobile-access', idempotencyKey: `mobile-access:${inviteId}`,
    });
    if (!result.sent) return errResponse(result.skipped ? 'ระบบป้องกันข้อความซ้ำ จึงไม่ได้ส่งซ้ำ' : 'LINE ไม่อนุญาตให้ส่งข้อความนี้ในขณะนี้');
    await db.from('mobile_access_invitations').update({ sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', inviteId);
    return jsonResponse({ ok: true });
  }

  if (action === 'revokeMobileAccessInvite') {
    const inviteId = String(p.inviteId || '');
    const { error } = await db.from('mobile_access_invitations').update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', inviteId).eq('status', 'pending');
    if (error) return errResponse(error.message);
    return jsonResponse({ ok: true });
  }

  if (action === 'addRoleAssignment') {
    const email       = String(p.email       || '').toLowerCase().trim();
    const role        = String(p.role        || '').toLowerCase().trim();
    const displayName = String(p.displayName || p.display_name || role).trim();
    const teamName    = p.teamName || p.team_name ? String(p.teamName || p.team_name) : null;
    const isMC        = Boolean(p.isMC    ?? p.is_mc    ?? false);
    const isMentor    = Boolean(p.isMentor ?? p.is_mentor ?? false);
    const isAdmin     = role === 'admin' || Boolean(p.isAdmin ?? p.is_admin ?? false);
    const hasAdminSections = Array.isArray(p.adminSections);
    const adminSections = (hasAdminSections ? p.adminSections as string[] : [])
      .filter(s => ADMIN_SECTIONS.includes(s as typeof ADMIN_SECTIONS[number]));

    if (!email || !role) return errResponse('email and role required');
    const validRoles = ['admin','mc','toomtam','aof','draft','phai','amp','mentor_support','growth'];
    if (!validRoles.includes(role)) return errResponse(`Invalid role. Must be one of: ${validRoles.join(', ')}`);

    const assignment: Record<string, unknown> = {
      email, role, display_name: displayName, team_name: teamName,
      is_mc: isMC || isAdmin, is_mentor: isMentor, is_admin: isAdmin,
    };
    if (hasAdminSections) assignment.admin_sections = adminSections;
    if (p.adminEditAccess !== undefined) {
      assignment.admin_edit_access = Boolean(p.adminEditAccess);
    }
    if (Array.isArray(p.capabilities)) {
      assignment.capabilities = (p.capabilities as unknown[])
        .map(String).map(value => value.trim()).filter(Boolean).slice(0, 50);
    }

    const { error } = await db.from('role_assignments').upsert(
      assignment,
      { onConflict: 'email' },
    );
    if (error) return errResponse(error.message);
    return jsonResponse({ ok: true });
  }

  if (action === 'removeRoleAssignment') {
    const email = String(p.email || '').toLowerCase().trim();
    if (!email) return errResponse('email required');
    const { error } = await db.from('role_assignments').delete().eq('email', email);
    if (error) return errResponse(error.message);
    return jsonResponse({ ok: true });
  }

  if (action === 'getAccessRequests') {
    const { data, error } = await db
      .from('access_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return errResponse(error.message);
    return jsonResponse({ ok: true, requests: data || [] });
  }

  if (action === 'approveAccessRequest') {
    const id       = String(p.id || '');
    const role     = String(p.role || '').toLowerCase().trim();
    const isMentor = Boolean(p.isMentor ?? false);
    const teamName = p.teamName ? String(p.teamName) : null;
    const approvedSections = (Array.isArray(p.sections) ? p.sections as string[] : [])
      .filter(s => ADMIN_SECTIONS.includes(s as typeof ADMIN_SECTIONS[number]));
    const editAccess = Boolean(p.editAccess);
    if (!id || !role) return errResponse('id and role required');
    const validRoles = ['admin','mc','toomtam','aof','draft','phai','amp','mentor_support','growth'];
    if (!validRoles.includes(role)) return errResponse('Invalid role');

    const { data: req, error: fetchErr } = await db
      .from('access_requests').select('*').eq('id', id).single();
    if (fetchErr || !req) return errResponse('Request not found');
    const r = req as Record<string, unknown>;

    const { error: raErr } = await db.from('role_assignments').upsert({
      email:        String(r.email),
      role,
      display_name: String(r.name || r.email),
      team_name:    teamName,
      is_mc:        role === 'mc' || role === 'admin',
      is_mentor:    isMentor,
      is_admin:     role === 'admin',
      admin_sections: approvedSections.length
        ? approvedSections
        : (Array.isArray(r.requested_sections) ? r.requested_sections : []),
      admin_edit_access: editAccess || Boolean(r.edit_access),
    }, { onConflict: 'email' });
    if (raErr) return errResponse(raErr.message);

    await db.from('access_requests').update({
      status:      'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: auth.displayName || 'Chapter Admin',
    }).eq('id', id);

    return jsonResponse({ ok: true });
  }

  if (action === 'rejectAccessRequest') {
    const id = String(p.id || '');
    if (!id) return errResponse('id required');
    const { error } = await db.from('access_requests').update({
      status:      'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: auth.displayName || 'Chapter Admin',
    }).eq('id', id);
    if (error) return errResponse(error.message);
    return jsonResponse({ ok: true });
  }

  if (action === 'getLineTeamMappings') {
    const [{ data: teams }, { data: settings }, { data: lineMembers }] = await Promise.all([
      db.from('mentor_teams').select('name, leader_name').order('name'),
      db.from('settings').select('key, value').like('key', 'LINE_ID_%'),
      db.from('line_members').select('line_user_id, member_id, members(name, nickname)').limit(200),
    ]);
    const settingsMap: Record<string, string> = {};
    for (const s of (settings || []) as Record<string, string>[]) settingsMap[s.key] = s.value;
    const memberMap: Record<string, Record<string, unknown>> = {};
    for (const lm of (lineMembers || []) as Record<string, unknown>[]) {
      memberMap[String(lm.line_user_id)] = lm;
    }
    const teamRows = (teams || []).map((team: Record<string, unknown>) => {
      const name = String(team.name || '');
      const key = `LINE_ID_${name.toUpperCase()}`;
      const currentLineId = settingsMap[key] || null;
      const linkedRec = currentLineId ? memberMap[currentLineId] : null;
      return {
        name,
        leader_name: String(team.leader_name || ''),
        currentLineId,
        linkedMember: linkedRec ? (linkedRec.members as Record<string, unknown>) : null,
      };
    });
    const growthLineId = settingsMap['LINE_ID_GROWTH'] || null;
    const growthLinkedRec = growthLineId ? memberMap[growthLineId] : null;
    const growthRow = {
      name: 'GROWTH',
      leader_name: 'Growth',
      currentLineId: growthLineId,
      linkedMember: growthLinkedRec ? (growthLinkedRec.members as Record<string, unknown>) : null,
      isSpecial: true,
    };
    const availableMembers = (lineMembers || []).map((lm: Record<string, unknown>) => ({
      lineUserId: String(lm.line_user_id),
      memberId: String(lm.member_id),
      name: String((lm.members as Record<string, unknown>)?.name || ''),
      nickname: String((lm.members as Record<string, unknown>)?.nickname || ''),
    }));
    return jsonResponse({ ok: true, teams: teamRows, growth: growthRow, availableMembers });
  }

  if (action === 'setLineTeamMapping') {
    const teamName = String(p.teamName || '').toUpperCase().replace(/[^A-Z0-9_]/g, '');
    const lineUserId = String(p.lineUserId || '').trim();
    if (!teamName) return errResponse('teamName required');
    const key = `LINE_ID_${teamName}`;
    if (lineUserId) {
      const { error } = await db.from('settings').upsert({ key, value: lineUserId }, { onConflict: 'key' });
      if (error) return errResponse(error.message);
    } else {
      await db.from('settings').delete().eq('key', key);
    }
    return jsonResponse({ ok: true });
  }

  if (action === 'simulateLineMessage') {
    const text       = String(p.text || '').trim();
    const memberName = String(p.memberName || '').trim();
    if (!text) return errResponse('text required');

    // Look up LINE user ID for the requested member (if any)
    let userId = String(p.userId || '').trim();
    if (!userId && memberName) {
      const { data: member } = await db.from('members').select('id').eq('name', memberName).maybeSingle();
      if (member) {
        const { data: link } = await db.from('line_members').select('line_user_id').eq('member_id', String((member as Record<string,unknown>).id)).maybeSingle();
        userId = String((link as Record<string,unknown>)?.line_user_id || '');
      }
    }
    if (!userId) {
      return jsonResponse({ ok: false, error: memberName ? `${memberName} ยังไม่ได้เชื่อม LINE ครับ` : 'userId required' });
    }

    const webhookUrl = `${Deno.env.get('SUPABASE_URL') || ''}/functions/v1/line-webhook`;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BNI-Sim': serviceKey,
        },
        body: JSON.stringify({ text, userId }),
      });
      const data = await res.json() as Record<string, unknown>;
      return jsonResponse(data);
    } catch (e) {
      return errResponse((e as Error).message);
    }
  }

  if (action === 'provisionLineMenus') {
    try {
      const result = await provisionLineExperience(db);
      return jsonResponse({ ok: true, ...result });
    } catch (e) {
      return errResponse((e as Error).message);
    }
  }

  if (action === 'getLineHealth') {
    const lineToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '';
    if (!lineToken) return errResponse('LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า');

    const appUrl = String(Deno.env.get('PUBLIC_APP_URL') || 'https://bni-mentor-system.vercel.app')
      .replace(/\/$/, '');
    const [{ data: settings }, { data: lineMembers }, { data: teams }, { data: jobRuns }, { data: latestScore }] = await Promise.all([
      db.from('settings').select('key, value')
        .or('key.like.LINE_ID_%,key.like.LINE_RICH_MENU_%,key.eq.LINE_PROVISIONED_AT'),
      db.from('line_members').select('line_user_id, member_id, members(name, nickname)').limit(300),
      db.from('mentor_teams').select('name, leader_name').order('name'),
      db.from('system_job_runs').select('job_name,status,started_at,finished_at,duration_ms,error,reason').order('started_at', { ascending: false }).limit(100),
      db.from('monthly_scores').select('year,month,created_at').order('year', { ascending: false }).order('month', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const settingMap: Record<string, string> = {};
    for (const row of (settings || []) as Record<string, unknown>[]) {
      settingMap[String(row.key || '')] = String(row.value || '');
    }
    const linkedMap = new Map<string, Record<string, unknown>>();
    for (const row of (lineMembers || []) as Record<string, unknown>[]) {
      linkedMap.set(String(row.line_user_id || ''), row);
    }

    const assignmentSeed: Record<string, unknown>[] = [
      { key: 'LINE_ID_MC', label: 'MC', expectedRole: 'member' },
      { key: 'LINE_ID_GROWTH', label: 'Growth', expectedRole: 'member' },
      ...(teams || []).map((team: Record<string, unknown>) => ({
        key: `LINE_ID_${String(team.name || '').toUpperCase()}`,
        label: `Mentor · ${String(team.name || '')}`,
        expectedRole: 'member',
        leaderName: String(team.leader_name || ''),
      })),
    ];
    const seededLineIds = new Set(
      assignmentSeed
        .map(seed => settingMap[String(seed.key || '')])
        .filter(Boolean),
    );
    for (const row of (lineMembers || []) as Record<string, unknown>[]) {
      const lineUserId = String(row.line_user_id || '');
      if (!lineUserId || seededLineIds.has(lineUserId)) continue;
      seededLineIds.add(lineUserId);
      const member = row.members as Record<string, unknown> | undefined;
      assignmentSeed.push({
        key: `LINE_MEMBER_${lineUserId}`,
        label: `Member · ${String(member?.nickname || member?.name || 'LINE')}`,
        expectedRole: 'member',
        lineUserId,
      });
    }

    const rolePriority: Record<LineMenuRole, number> = { member: 0, mentor: 1, growth: 2, mc: 3 };
    const effectiveRoleByLineId = new Map<string, LineMenuRole>();
    const resolvedAssignments: Record<string, unknown>[] = [];
    const missingAssignments: Record<string, unknown>[] = [];
    for (const seed of assignmentSeed) {
      const key = String(seed.key);
      const lineUserId = String(seed.lineUserId || settingMap[key] || '');
      if (!lineUserId) {
        missingAssignments.push({ ...seed, lineUserId: null, status: 'missing_link' });
        continue;
      }
      const nextRole = expectedMenuRole(key);
      const currentRole = effectiveRoleByLineId.get(lineUserId) || 'member';
      if (rolePriority[nextRole] > rolePriority[currentRole]) {
        effectiveRoleByLineId.set(lineUserId, nextRole);
      }
      resolvedAssignments.push({ ...seed, lineUserId });
    }

    const actualMenuPromises = new Map<string, Promise<{
      ok: boolean;
      richMenuId: string | null;
      error?: string;
    }>>();
    const checkedAssignments = await Promise.all(
      resolvedAssignments.map(async seed => {
        const lineUserId = String(seed.lineUserId);
        const configuredRole = String(seed.expectedRole) as LineMenuRole;
        const expectedRole = effectiveRoleByLineId.get(lineUserId) || configuredRole;
        const expectedMenuId = settingMap[`LINE_RICH_MENU_${expectedRole.toUpperCase()}`] || null;
        if (!actualMenuPromises.has(lineUserId)) {
          actualMenuPromises.set(lineUserId, getLineMenuForUser(lineToken, lineUserId));
        }
        const actual = await actualMenuPromises.get(lineUserId)!;
        const linked = linkedMap.get(lineUserId);
        const member = linked?.members as Record<string, unknown> | undefined;
        const status = !actual.ok
          ? 'error'
          : !expectedMenuId
          ? 'missing_menu'
          : actual.richMenuId === expectedMenuId
          ? 'ok'
          : 'drift';
        return {
          ...seed,
          configuredRole,
          expectedRole,
          expectedMenuId,
          actualMenuId: actual.richMenuId,
          linkedMember: member ? {
            name: String(member.name || ''),
            nickname: String(member.nickname || ''),
          } : null,
          status,
          error: actual.error || null,
        };
      }),
    );

    const actions = ['renewal', 'assignments'];
    const urlChecks = await Promise.all([
      ...actions.map(item => checkUrl(`${appUrl}/liff/${item}?preview=1`)),
    ]);
    const menuRoles: LineMenuRole[] = ['member', 'mentor', 'mc', 'growth'];
    const menus = Object.fromEntries(menuRoles.map(role => [
      role,
      settingMap[`LINE_RICH_MENU_${role.toUpperCase()}`] || null,
    ]));
    const allAssignments = [...checkedAssignments, ...missingAssignments];
    const latestRunByJob = new Map<string, Record<string, unknown>>();
    for (const run of (jobRuns || []) as Record<string, unknown>[]) {
      const name = String(run.job_name || '');
      if (name && !latestRunByJob.has(name)) latestRunByJob.set(name, run);
    }
    const failedJobs = ((jobRuns || []) as Record<string, unknown>[]).filter(run =>
      String(run.status) === 'failed' && new Date(String(run.started_at)).getTime() >= Date.now() - 24 * 60 * 60_000
    );
    const runningStale = ((jobRuns || []) as Record<string, unknown>[]).filter(run =>
      String(run.status) === 'running' && new Date(String(run.started_at)).getTime() < Date.now() - 15 * 60_000
    );
    const scorePeriod = latestScore ? `${String((latestScore as Record<string, unknown>).month).padStart(2, '0')}/${String((latestScore as Record<string, unknown>).year)}` : null;
    return jsonResponse({
      ok: true,
      summary: {
        total: allAssignments.length,
        healthy: allAssignments.filter(row => row.status === 'ok').length,
        drift: allAssignments.filter(row => row.status === 'drift').length,
        missing: allAssignments.filter(row => String(row.status).startsWith('missing')).length,
        errors: allAssignments.filter(row => row.status === 'error').length,
        urlsOk: urlChecks.filter(row => row.ok).length,
        urlsTotal: urlChecks.length,
        cronHealthy: failedJobs.length === 0 && runningStale.length === 0,
        cronFailed24h: failedJobs.length,
        cronStale: runningStale.length,
      },
      assignments: allAssignments,
      menus,
      menuVersion: settingMap.LINE_RICH_MENU_VERSION || null,
      menuSource: settingMap.LINE_RICH_MENU_SOURCE || null,
      provisionedAt: settingMap.LINE_PROVISIONED_AT || null,
      appUrl,
      urlChecks,
      cron: {
        latest: [...latestRunByJob.values()],
        failed24h: failedJobs,
        staleRunning: runningStale,
      },
      dataFreshness: { palmsPeriod: scorePeriod },
    });
  }

  if (action === 'reassignLineMenu') {
    const lineToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '';
    if (!lineToken) return errResponse('LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า');
    const lineUserId = String(p.lineUserId || '').trim();
    const menuRole = String(p.menuRole || '').toLowerCase() as LineMenuRole;
    if (!lineUserId) return errResponse('lineUserId required');
    if (!['member', 'mentor', 'mc', 'growth'].includes(menuRole)) return errResponse('Invalid menuRole');

    const { data: linked } = await db.from('line_members')
      .select('line_user_id').eq('line_user_id', lineUserId).maybeSingle();
    const { data: mapped } = await db.from('settings')
      .select('key').like('key', 'LINE_ID_%').eq('value', lineUserId).limit(1);
    if (!linked && !(mapped || []).length) return errResponse('LINE account นี้ไม่ได้อยู่ในระบบ');

    const { data: menuSetting } = await db.from('settings')
      .select('value').eq('key', `LINE_RICH_MENU_${menuRole.toUpperCase()}`).maybeSingle();
    const richMenuId = String((menuSetting as Record<string, unknown> | null)?.value || '');
    if (!richMenuId) return errResponse(`ไม่พบ Rich Menu สำหรับ ${menuRole}`);
    const response = await fetch(
      `https://api.line.me/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu/${encodeURIComponent(richMenuId)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${lineToken}` },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) return errResponse(`LINE ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return jsonResponse({ ok: true, lineUserId, menuRole, richMenuId });
  }

  if (action === 'getConnectionStatus') {
    const { data, error } = await db.from('settings').select('key, value').in('key', ['APP_VERSION','MC_LINE_USER_ID']);
    const settings: Record<string, string> = {};
    for (const r of (data || []) as Record<string, string>[]) settings[r.key] = r.value;
    const lineToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '';
    return jsonResponse({
      ok: true,
      supabase: !error,
      lineConfigured: !!lineToken,
      appVersion: settings['APP_VERSION'] || '—',
      mcLineId:   settings['MC_LINE_USER_ID'] || '—',
    });
  }

  if (action === 'getLineQuota') {
    const lineToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '';
    if (!lineToken) return errResponse('LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า');
    const [quotaRes, usageRes] = await Promise.all([
      fetch('https://api.line.me/v2/bot/message/quota', { headers: { Authorization: `Bearer ${lineToken}` } }),
      fetch('https://api.line.me/v2/bot/message/quota/consumption', { headers: { Authorization: `Bearer ${lineToken}` } }),
    ]);
    if (!quotaRes.ok || !usageRes.ok) return errResponse(`LINE quota API error: ${quotaRes.status}/${usageRes.status}`);
    const quota = await quotaRes.json() as Record<string, unknown>;
    const usage = await usageRes.json() as Record<string, unknown>;
    const type = String(quota.type || 'unknown');
    const isUnlimited = type === 'unlimited';
    const limit = isUnlimited ? null : Number(quota.value) || 0;
    const used  = Number(usage.totalUsage) || 0;
    return jsonResponse({
      ok: true,
      type,
      unlimited: isUnlimited,
      limit,
      used,
      remaining: isUnlimited ? null : Math.max(0, Number(limit) - used),
      pct: !isUnlimited && Number(limit) > 0 ? Math.round(used / Number(limit) * 100) : 0,
    });
  }

  if (action === 'getLineDeliveryLog') {
    const pageSize = Math.min(100, Number(p.limit) || 50);
    const offset   = Number(p.offset) || 0;
    let q = db.from('line_message_deliveries')
      .select(`id, channel, recipient_id, member_id, notification_type, source,
               status, created_at, sent_at, message_preview, message_payload, last_error,
               members ( nickname, name, mentor_team )`, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (p.status)    q = q.eq('status',            String(p.status));
    if (p.notifType) q = q.eq('notification_type', String(p.notifType));
    if (p.source)    q = q.eq('source',            String(p.source));
    const { data, error, count } = await q;
    if (error) return errResponse(error.message);
    const rows = ((data || []) as Record<string, unknown>[]).map(r => {
      const m = (r.members || {}) as Record<string, unknown>;
      return {
        id: String(r.id || ''), channel: String(r.channel || ''),
        notifType: String(r.notification_type || ''), source: String(r.source || ''),
        status: String(r.status || ''), createdAt: String(r.created_at || ''),
        sentAt: r.sent_at ? String(r.sent_at) : null,
        preview: r.message_preview ? String(r.message_preview) : null,
        lastError: r.last_error ? String(r.last_error).slice(0, 200) : null,
        canRetry: r.status === 'failed' && r.channel === 'push' && Array.isArray(r.message_payload),
        memberNick: String(m.nickname || m.name || ''), memberName: String(m.name || ''),
        memberTeam: String(m.mentor_team || ''),
      };
    });
    return jsonResponse({ ok: true, rows, total: count || 0, offset, pageSize });
  }

  if (action === 'retryLineDelivery') {
    const deliveryId = String(p.deliveryId || '');
    if (!deliveryId) return errResponse('deliveryId required');

    const { data: row, error } = await db
      .from('line_message_deliveries')
      .select('id, channel, recipient_id, member_id, notification_type, message_payload, status')
      .eq('id', deliveryId)
      .maybeSingle();
    if (error) return errResponse(error.message);
    if (!row) return errResponse('ไม่พบรายการส่งข้อความนี้');

    const channel = String(row.channel || '');
    if (channel !== 'push') return errResponse('Retry รองรับเฉพาะข้อความแบบ push รายบุคคลตอนนี้');
    const recipientId = String(row.recipient_id || '');
    const payload = row.message_payload;
    if (!recipientId || !Array.isArray(payload) || payload.length === 0) {
      return errResponse('รายการนี้ไม่มีข้อมูลข้อความสำหรับ Retry');
    }

    const retrySeed = `retry:${deliveryId}:${Date.now()}`;
    const result = await linePushMessages(recipientId, payload as Record<string, unknown>[], {
      db,
      memberId: row.member_id ? String(row.member_id) : null,
      notificationType: `${String(row.notification_type || 'manual')}:retry`,
      source: 'admin-api/retryLineDelivery',
      idempotencyKey: retrySeed,
      lineRetryKey: retrySeed,
    });
    return jsonResponse({ ok: true, result });
  }

  return errResponse(`Unknown settings action: ${action}`);
}

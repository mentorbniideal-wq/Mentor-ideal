// FILE: comms.ts
// Handler: comms — sendBroadcast, getBroadcasts, saveMCMessage, getMessages,
//                  getReadMsgKeys, setMsgRead, createMCAssignment,
//                  getMCAssignments, getMentorAssignments, ackAssignment
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';
import { isGrowth } from '../../_shared/authorization.ts';

export async function handleComms(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    // ── sendBroadcast ──────────────────────────────────────────
    // MC sends a broadcast message (stored; LINE delivery handled separately).
    case 'sendBroadcast': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const message     = String(p.message     || '').trim();
      const title       = String(p.title       || '').trim() || null;
      const targetScope = String(p.targetScope || 'all').trim();

      if (!message) return errResponse('message required');

      const sentAt = new Date().toISOString();
      const { error } = await db.from('broadcasts').insert({
        sender_role:  'mc',
        title,
        message,
        target_scope:    targetScope,
        sent_at:         sentAt,
        line_delivered:  false,
        recipient_count: 0,
      });
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true, sentAt });
    }

    // ── getBroadcasts ──────────────────────────────────────────
    // Retrieve recent broadcasts (any authenticated role).
    case 'getBroadcasts': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const { data, error } = await db
        .from('broadcasts')
        .select('id, title, message, target_scope, sent_at, line_delivered, recipient_count')
        .order('sent_at', { ascending: false })
        .limit(20);
      if (error) return errResponse(error.message);

      type BroadcastRow = {
        id: string;
        title: string | null;
        message: string;
        target_scope: string;
        sent_at: string;
        line_delivered: boolean;
        recipient_count: number;
      };

      const broadcasts = ((data || []) as BroadcastRow[]).map((row) => ({
        id:            row.id,
        title:         row.title         ?? '',
        message:       row.message,
        sentAt:        row.sent_at,
        scope:         row.target_scope,
        lineDelivered: row.line_delivered,
        recipients:    row.recipient_count,
      }));

      return jsonResponse({ ok: true, broadcasts });
    }

    // ── saveMCMessage ──────────────────────────────────────────
    // MC saves an in-app message targeting a role (or 'all').
    case 'saveMCMessage': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const message    = String(p.message    || '').trim();
      // Frontend sends teamName; also accept targetRole as fallback
      const targetRole = String(p.teamName || p.targetRole || 'all').trim();

      if (!message) return errResponse('message required');

      const { error } = await db.from('mc_messages').insert({
        message,
        target_role: targetRole,
      });
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true });
    }

    // ── deleteMCMessage ───────────────────────────────────────
    case 'deleteMCMessage': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);
      const id = String(p.id || '').trim();
      if (!id) return errResponse('id required');
      const { error } = await db.from('mc_messages').delete().eq('id', id);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    // ── updateMCMessage ───────────────────────────────────────
    case 'updateMCMessage': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);
      const id      = String(p.id      || '').trim();
      const message = String(p.message || '').trim();
      if (!id)      return errResponse('id required');
      if (!message) return errResponse('message required');
      const { error } = await db.from('mc_messages').update({ message }).eq('id', id);
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true });
    }

    // ── getMessages ────────────────────────────────────────────
    // Get MC messages relevant to the caller's role.
    // MC sees all; mentors/growth see their own + 'all'.
    case 'getMessages': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const role = auth.role!;

      let query = db
        .from('mc_messages')
        .select('id, message, target_role, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!auth.isMC) {
        // Supabase JS v2: use .or() for multiple conditions on same column
        query = (query as typeof query).or(`target_role.eq.${role},target_role.eq.all`);
      }

      const { data, error } = await query;
      if (error) return errResponse(error.message);

      type MsgRow = { id: string; message: string; target_role: string; created_at: string };
      const messages = ((data || []) as MsgRow[]).map((row) => ({
        id:         row.id,
        key:        row.id,            // key = id for read-tracking
        // Frontend (index.html) reads: m.msg, m.team, m.name, m.nick
        msg:        row.message,
        message:    row.message,       // keep for backward compat
        team:       row.target_role,
        targetRole: row.target_role,   // keep for backward compat
        name:       'MC',
        nick:       '',
        createdAt:  row.created_at,
      }));

      return jsonResponse({ ok: true, messages });
    }

    // ── getReadMsgKeys ─────────────────────────────────────────
    // Return the list of message keys already read by this role.
    case 'getReadMsgKeys': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const role = String(auth.role || '').toLowerCase();

      const { data, error } = await db
        .from('message_reads')
        .select('message_key')
        .eq('role', role);
      if (error) return errResponse(error.message);

      type ReadRow = { message_key: string };
      const keys = ((data || []) as ReadRow[]).map((r) => r.message_key);

      return jsonResponse({ ok: true, keys });
    }

    // ── setMsgRead ─────────────────────────────────────────────
    // Mark a message as read for the caller's role (upsert).
    case 'setMsgRead': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const role = String(auth.role || '').toLowerCase();
      const key  = String(p.key  || '').trim();

      if (!key) return errResponse('key required');

      const { error } = await db.from('message_reads').upsert(
        { role, message_key: key, read_at: new Date().toISOString() },
        { onConflict: 'role,message_key' },
      );
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true });
    }

    // ── createMCAssignment ─────────────────────────────────────
    // MC creates a task assignment for a mentor team (optionally for a member).
    case 'createMCAssignment': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const mentorTeam     = String(p.mentorTeam     || p.team     || p.mentor  || '').trim();
      const assignmentText = String(p.assignmentText || p.text     || p.message || '').trim();
      const dueDate        = p.dueDate ? String(p.dueDate) : null;

      if (!assignmentText) return errResponse('assignmentText required');

      // Optionally look up a member id if memberName provided
      let memberId: string | null = null;
      const memberName = String(p.memberName || '').trim();
      if (memberName) {
        const { data: member } = await db
          .from('members')
          .select('id')
          .eq('name', memberName)
          .single();
        if (member) memberId = String((member as Record<string, unknown>).id);
      }

      const { error } = await db.from('mc_assignments').insert({
        mentor_team:     mentorTeam  || null,
        member_id:       memberId,
        assignment_text: assignmentText,
        due_date:        dueDate,
      });
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true });
    }

    // ── getMCAssignments ───────────────────────────────────────
    // Get all assignments (MC) or own-team assignments (mentor).
    case 'getMCAssignments': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      let query = db
        .from('mc_assignments')
        .select(`
          id,
          mentor_team,
          assignment_text,
          due_date,
          acknowledged_at,
          created_at,
          member:members(name, nickname)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      // Non-MC roles only see their own team
      if (!auth.isMC && auth.teamName) {
        query = (query as typeof query).eq('mentor_team', auth.teamName);
      }

      const { data, error } = await query;
      if (error) return errResponse(error.message);

      type AssignRow = {
        id: string;
        mentor_team: string | null;
        assignment_text: string;
        due_date: string | null;
        acknowledged_at: string | null;
        created_at: string;
        member: { name: string; nickname: string | null } | null;
      };

      const assignments = ((data || []) as unknown as AssignRow[]).map((row) => ({
        id:         row.id,
        row:        row.id,   // frontend uses a.row for ackAssignment onclick
        mentor:     row.mentor_team ?? '',
        message:    row.assignment_text,
        dueDate:    row.due_date ?? null,
        doneAt:     row.acknowledged_at ?? null,
        acknowledgedAt: row.acknowledged_at ?? null,
        status:     row.acknowledged_at ? 'done' : 'pending',
        createdAt:  row.created_at,
        memberName: row.member?.name   ?? null,
        memberNick: row.member?.nickname ?? null,
      }));

      return jsonResponse({ ok: true, assignments });
    }

    // ── getMentorAssignments ───────────────────────────────────
    // Mentor-perspective alias for getMCAssignments.
    // Mentors see only their own team; MC sees all.
    case 'getMentorAssignments': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      let query = db
        .from('mc_assignments')
        .select(`
          id,
          mentor_team,
          assignment_text,
          due_date,
          acknowledged_at,
          created_at,
          member:members(name, nickname)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!auth.isMC && auth.teamName) {
        query = (query as typeof query).eq('mentor_team', auth.teamName);
      }

      const { data, error } = await query;
      if (error) return errResponse(error.message);

      type AssignRow = {
        id: string;
        mentor_team: string | null;
        assignment_text: string;
        due_date: string | null;
        acknowledged_at: string | null;
        created_at: string;
        member: { name: string; nickname: string | null } | null;
      };

      const assignments = ((data || []) as unknown as AssignRow[]).map((row) => ({
        id:         row.id,
        row:        row.id,   // frontend uses a.row for ackAssignment onclick
        mentor:     row.mentor_team ?? '',
        message:    row.assignment_text,
        dueDate:    row.due_date ?? null,
        doneAt:     row.acknowledged_at ?? null,
        acknowledgedAt: row.acknowledged_at ?? null,
        status:     row.acknowledged_at ? 'done' : 'pending',
        createdAt:  row.created_at,
        memberName: row.member?.name   ?? null,
        memberNick: row.member?.nickname ?? null,
      }));

      return jsonResponse({ ok: true, assignments });
    }

    // ── ackAssignment ──────────────────────────────────────────
    // Mentor acknowledges an assignment by ID.
    case 'ackAssignment': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const assignmentId = String(p.row || p.assignmentId || p.id || '').trim();
      if (!assignmentId) return errResponse('assignmentId required');

      const { data: assignment, error: findError } = await db
        .from('mc_assignments')
        .select('mentor_team')
        .eq('id', assignmentId)
        .maybeSingle();
      if (findError) return errResponse(findError.message);
      if (!assignment) return errResponse('ไม่พบงานที่มอบหมาย');
      const assignmentTeam = String((assignment as Record<string, unknown>).mentor_team || '');
      if (!auth.isMC && !isGrowth(auth) && auth.teamName !== assignmentTeam) {
        return errResponse('ไม่มีสิทธิ์รับทราบงานของทีมอื่น', 403);
      }

      const { error } = await db
        .from('mc_assignments')
        .update({ acknowledged_at: new Date().toISOString() })
        .eq('id', assignmentId);
      if (error) return errResponse(error.message);

      return jsonResponse({ ok: true });
    }

    default:
      return errResponse(`Unknown comms action: ${action}`);
  }
}

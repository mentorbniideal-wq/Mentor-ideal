import { requireAdminAccess } from '../../_shared/admin-auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

export async function handleAdminIssues(p: Record<string, unknown>): Promise<Response> {
  const db   = getServiceClient();
  const action = String(p.action);
  const auth = await requireAdminAccess(db, p, 'issues', {
    write: action === 'updateIssueStatus' || action === 'addActionLog',
  });
  if (!auth.ok) return errResponse(auth.error!);

  // ── List core_issues with member info ─────────────────────────
  if (action === 'getAdminIssues') {
    const statusFilter = String(p.status || '').toLowerCase();

    let query = db.from('core_issues')
      .select('id, status, issue_text, mentor_team, created_at, updated_at, members(name, nickname)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (statusFilter && statusFilter !== 'all') query = query.eq('status', statusFilter);

    const { data, error } = await query;
    if (error) return errResponse(error.message);

    type IssueRow = { id: string; status: string; issue_text: string; mentor_team: string | null; created_at: string; updated_at: string | null; members: { name: string; nickname: string | null } | null };
    const issues = ((data || []) as unknown as IssueRow[]).map(r => ({
      id:         r.id,
      status:     r.status,
      issueText:  r.issue_text,
      team:       r.mentor_team ?? '—',
      memberName: r.members?.name ?? '—',
      memberNick: r.members?.nickname ?? '',
      createdAt:  r.created_at,
      updatedAt:  r.updated_at,
    }));
    return jsonResponse({ ok: true, issues });
  }

  // ── Open / close an issue ─────────────────────────────────────
  if (action === 'updateIssueStatus') {
    const id     = String(p.id || '').trim();
    const status = String(p.status || 'open').trim();
    if (!id) return errResponse('id required');
    const { error } = await db.from('core_issues')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return errResponse(error.message);
    return jsonResponse({ ok: true });
  }

  // ── Add action log entry ──────────────────────────────────────
  if (action === 'addActionLog') {
    const memberName = String(p.memberName || '').trim();
    const actionText = String(p.actionText || '').trim();
    const team       = String(p.team       || '').trim();
    const actionBy   = String(p.actionBy   || auth.displayName || 'MC').trim();
    const actionDate = String(p.actionDate || new Date().toISOString().split('T')[0]);

    if (!memberName || !actionText) return errResponse('memberName and actionText required');

    const { data: member } = await db.from('members').select('id')
      .ilike('name', memberName).limit(1).maybeSingle();
    const memberId = member ? String((member as Record<string, unknown>).id) : null;

    const { error } = await db.from('action_logs').insert({
      member_id:   memberId,
      mentor_team: team || null,
      action_text: actionText,
      action_by:   actionBy,
      action_date: actionDate,
    });
    if (error) return errResponse(error.message);
    return jsonResponse({ ok: true });
  }

  // ── List action logs ──────────────────────────────────────────
  if (action === 'getActionLogs') {
    const memberName = String(p.memberName || '').trim();
    let query = db.from('action_logs')
      .select('id, mentor_team, action_text, action_by, action_date, created_at, members(name, nickname)')
      .order('action_date', { ascending: false }).limit(100);
    if (memberName) {
      const { data: m } = await db.from('members').select('id').ilike('name', `%${memberName}%`).limit(1).maybeSingle();
      if (m) query = query.eq('member_id', String((m as Record<string, unknown>).id));
    }
    const { data, error } = await query;
    if (error) return errResponse(error.message);
    type LogRow = { id: string; mentor_team: string|null; action_text: string; action_by: string; action_date: string; created_at: string; members: {name:string;nickname:string|null}|null };
    const logs = ((data || []) as unknown as LogRow[]).map(r => ({
      id: r.id, team: r.mentor_team ?? '—', actionText: r.action_text,
      actionBy: r.action_by, date: r.action_date, createdAt: r.created_at,
      memberName: r.members?.name ?? '—', memberNick: r.members?.nickname ?? '',
    }));
    return jsonResponse({ ok: true, logs });
  }

  return errResponse(`Unknown issues action: ${action}`);
}

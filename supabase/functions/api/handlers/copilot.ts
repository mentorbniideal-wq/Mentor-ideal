import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';
import { runCopilot } from '../../_shared/copilot.ts';
import { trackLineEvent } from '../../_shared/analytics.ts';
import { enrichOperationalMembers } from '../../_shared/copilot-context.ts';

export async function handleCopilot(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient();
  const auth = await requireAuth(db, p, ['mc', 'growth', 'toomtam', 'aof', 'draft', 'phai', 'amp']);
  if (!auth.ok) return errResponse(auth.error!, 401);
  const question = String(p.question || '').trim();
  if (question.length < 3 || question.length > 1500) {
    return errResponse('คำถามต้องมีความยาว 3–1,500 ตัวอักษร');
  }
  const history = Array.isArray(p.history) ? p.history.slice(-6).flatMap((turn) => {
    const row = (turn || {}) as Record<string, unknown>;
    const role = row.role === 'assistant' ? 'assistant' : row.role === 'user' ? 'user' : null;
    const content = String(row.content || '').trim().slice(0, 1200);
    return role && content ? [{ role, content }] : [];
  }) : [];

  let query = db.from('v_member_dashboard')
    .select('id, name, nickname, mentor_team, display_score, traffic_light, palms_detail, open_core_issue, days_to_expiry, membership_start_date, joined_date, bni_days, expiry_date')
    .eq('is_archived', false)
    .order('display_score', { ascending: true })
    .limit(auth.isMC || auth.role === 'growth' ? 80 : 25);
  if (!auth.isMC && auth.role !== 'growth' && auth.teamName) {
    query = query.eq('mentor_team', auth.teamName);
  }
  const { data: members, error } = await query;
  if (error) return errResponse(error.message);
  const operational = await enrichOperationalMembers(db, (members || []) as Record<string, unknown>[]);

  // Load upcoming training events (next 30 days) so AI can recommend specific dates
  const today = new Date().toISOString().split('T')[0];
  const until30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  const { data: upcomingEvents } = await db.from('bni_events')
    .select('name, event_date, time_start, category, audience, ceu, is_online, location, price_thb')
    .gte('event_date', today)
    .lte('event_date', until30)
    .order('event_date', { ascending: true })
    .limit(12);

  const answer = await runCopilot({
    db,
    question,
    actorRole: String(auth.role),
    source: 'dashboard',
    context: {
      actor: { role: auth.role, team: auth.teamName },
      members: operational.members,
      operationalSummary: operational.operationalSummary,
      upcomingTraining: (upcomingEvents || []).map((e: Record<string, unknown>) => ({
        name: e.name,
        date: e.event_date,
        time: e.time_start,
        category: e.category,
        ceu: e.ceu,
        online: e.is_online,
        location: e.location,
        price: e.price_thb,
      })),
      policy: 'Suggestions are drafts. Any write or message send requires explicit user confirmation.',
    },
    history: history as Array<{ role: 'user' | 'assistant'; content: string }>,
  });
  await trackLineEvent(db, 'copilot_dashboard_answered', {
    role: auth.role,
    source: 'dashboard',
    properties: { team: auth.teamName || null },
  });
  return jsonResponse({
    ok: true,
    answer,
    grounding: {
      memberCount: operational.members.length,
      teamScope: auth.isMC || auth.role === 'growth' ? 'chapter' : auth.teamName,
      includes: ['PALMS', 'Renewal', 'Goals', 'Follow-up', 'Mentor Help', '1-2-1 Attention'],
      readOnly: true,
    },
  });
}

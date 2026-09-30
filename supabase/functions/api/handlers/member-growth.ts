import { requireAuth } from '../../_shared/auth.ts';
import { resolveChapterScope } from '../../_shared/chapter-scope.ts';
import { CAPABILITY, hasCapability } from '../../_shared/capabilities.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';
import { canManageGrowthCycle, canReadGrowthCycle, cycleMonth, growthMilestone, membershipFacts, monthDueDate, parseDateOnly, renewalCycleStatus, todayInZone } from '../../_shared/member-growth-cycle.ts';
import { buildMemberPerformanceHistory } from '../../_shared/member-performance-history.ts';

type Row = Record<string, unknown>;
const uuid = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
const str = (value: unknown) => String(value || '').trim();

function writable(auth: Awaited<ReturnType<typeof requireAuth>>) {
  return canManageGrowthCycle(auth);
}

function nodes(expiry: string, isNew: boolean, entries: Row[] = []) {
  const indexed = new Map(entries.map(row => [Number(row.month_number), row]));
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const entry = indexed.get(month);
    return { month, dueDate: monthDueDate(expiry, month), milestone: growthMilestone(month, isNew),
      status: entry?.status || 'not_recorded', hasNote: Boolean(entry?.note_count),
      followUpDate: entry?.follow_up_date || null, entryId: entry?.id || null,
      handoff: Boolean(entry?.handoff_signal_id) };
  });
}

export async function handleMemberGrowth(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient();
  const auth = await requireAuth(db, p, ['growth', 'mc']);
  if (!auth.ok) return errResponse(auth.error!);
  if (!canReadGrowthCycle(auth)) return errResponse('Member Growth ต้องเข้าสู่ระบบด้วย OAuth email ที่ตั้งค่าไว้ใน Access', 403);
  const scope = await resolveChapterScope(db, auth);
  if (!scope.ok) return errResponse(scope.error, 403);
  const chapterId = scope.chapterId;
  const { data: chapter, error: chapterError } = await db.from('chapter_profiles').select('timezone').eq('id', chapterId).maybeSingle();
  if (chapterError) return errResponse(chapterError.message);
  const today = todayInZone(String((chapter as Row | null)?.timezone || 'Asia/Bangkok'));
  const action = str(p.action);
  const supportedActions = ['getMemberGrowthBoard', 'getMemberGrowthTimeline', 'saveMemberGrowthEntry',
    'appendMemberGrowthNote', 'linkMemberGrowthTask', 'linkMemberGrowthMy121', 'createMemberGrowthRenewalHandoff'];
  if (!supportedActions.includes(action)) return errResponse('Unknown member growth action', 400);
  if (action === 'getMemberGrowthBoard') {
    const { data: members, error } = await db.from('members')
      .select('id,name,nickname,is_new_member,joined_date,membership_start_date').eq('chapter_id', chapterId).eq('is_archived', false).order('name').limit(500);
    if (error) return errResponse(error.message);
    const ids = ((members || []) as Row[]).map(row => String(row.id));
    if (!ids.length) return jsonResponse({ ok: true, members: [], dueWork: [], summary: { activeMembers: 0 } });
    const [renewalQ, cycleQ] = await Promise.all([
      db.from('renewals').select('member_id,expiry_date,workflow_status,completed_at,extended_at,source,source_reported_at').eq('chapter_id', chapterId).in('member_id', ids),
      db.from('member_growth_cycles').select('id,member_id,expiry_date').eq('chapter_id', chapterId).in('member_id', ids),
    ]);
    if (renewalQ.error || cycleQ.error) return errResponse(renewalQ.error?.message || cycleQ.error?.message || 'Growth cycle unavailable');
    const renewals = new Map(((renewalQ.data || []) as Row[]).map(row => [String(row.member_id), row]));
    const cycles = new Map(((cycleQ.data || []) as Row[]).map(row => [`${row.member_id}:${row.expiry_date}`, row]));
    const cycleIds = ((cycleQ.data || []) as Row[]).map(row => String(row.id));
    const { data: entries, error: entryError } = cycleIds.length
      ? await db.from('member_growth_entries').select('id,cycle_id,month_number,status,follow_up_date,handoff_signal_id').in('cycle_id', cycleIds)
      : { data: [], error: null };
    if (entryError) return errResponse(entryError.message);
    const byCycle = new Map<string, Row[]>();
    for (const entry of (entries || []) as Row[]) byCycle.set(String(entry.cycle_id), [...(byCycle.get(String(entry.cycle_id)) || []), entry]);
    const horizonDate = new Date(`${today}T00:00:00Z`);
    horizonDate.setUTCDate(horizonDate.getUTCDate() + 30);
    const horizon = horizonDate.toISOString().slice(0, 10);
    const soonDate = new Date(`${today}T00:00:00Z`);
    soonDate.setUTCDate(soonDate.getUTCDate() + 7);
    const soon = soonDate.toISOString().slice(0, 10);
    const memberRows = ((members || []) as Row[]).map(member => {
      const renewal = renewals.get(String(member.id));
      const facts = membershipFacts(member, renewal || null, today);
      const expiry = facts.expiryDate || '';
      const cycle = cycles.get(`${member.id}:${expiry}`);
      const allNodes = expiry ? nodes(expiry, Boolean(member.is_new_member), byCycle.get(String(cycle?.id)) || []) : [];
      const next = allNodes.find(node => node.milestone && node.dueDate && node.dueDate >= today && node.status !== 'completed');
      return { memberId: member.id, name: member.name, nickname: member.nickname, isNewMember: Boolean(member.is_new_member),
        membershipStartDate: facts.membershipStartDate, membershipStartSource: facts.membershipStartSource,
        membershipDays: facts.membershipDays, lastRenewedOn: facts.lastRenewedOn,
        expirySource: renewal?.source || null, expiryReportedAt: renewal?.source_reported_at || null,
        expiryDate: expiry || null, cycleStartDate: expiry ? monthDueDate(expiry, 1) : null,
        currentMonth: expiry ? cycleMonth(expiry, today) : null, renewalStatus: renewalCycleStatus(renewal?.workflow_status),
        nextMilestone: next?.milestone?.label || null, nextDueDate: next?.dueDate || null,
        hasCycle: Boolean(cycle), status: cycle ? 'in_progress' : 'not_recorded' };
    });
    const dueWork = memberRows.flatMap(member => {
      if (!member.expiryDate) return [];
      const cycle = cycles.get(`${member.memberId}:${member.expiryDate}`);
      const allNodes = nodes(member.expiryDate, member.isNewMember, byCycle.get(String(cycle?.id)) || []);
      return allNodes.filter(node => (node.milestone?.owner.startsWith('Growth') || node.followUpDate) && node.status !== 'completed')
        .map(node => ({ memberId: member.memberId, memberName: member.nickname || member.name, isNewMember: member.isNewMember, month: node.month,
          milestone: node.milestone?.label || 'Monthly check-in', owner: node.milestone?.owner || 'Growth',
          dueDate: node.followUpDate || node.dueDate, status: node.status, handoff: node.handoff }));
    }).filter((row): row is typeof row & { dueDate: string } => typeof row.dueDate === 'string' && row.dueDate <= horizon)
      .map(row => ({ ...row, urgency: row.dueDate < today ? 'overdue' : row.dueDate <= soon ? 'due_soon' : 'upcoming' }));
    dueWork.sort((a, b) => (a.urgency === b.urgency ? String(a.dueDate).localeCompare(String(b.dueDate)) :
      ['overdue','due_soon','upcoming'].indexOf(a.urgency) - ['overdue','due_soon','upcoming'].indexOf(b.urgency)));
    return jsonResponse({ ok: true, members: memberRows, dueWork,
      summary: { activeMembers: memberRows.length, dueNow: dueWork.filter(row => row.dueDate <= today).length,
        dueSoon: dueWork.filter(row => row.urgency === 'due_soon').length, missingExpiry: memberRows.filter(row => !row.expiryDate).length },
      canManage: writable(auth) });
  }

  const memberId = str(p.memberId);
  if (!uuid(memberId)) return errResponse('memberId ไม่ถูกต้อง', 400);
  const { data: member, error: memberError } = await db.from('members')
    .select('id,name,nickname,is_new_member,joined_date,membership_start_date,chapter_id').eq('id', memberId).eq('chapter_id', chapterId).eq('is_archived', false).maybeSingle();
  if (memberError) return errResponse(memberError.message);
  if (!member) return errResponse('ไม่พบสมาชิกใน Chapter นี้', 404);
  const { data: renewal, error: renewalError } = await db.from('renewals')
    .select('expiry_date,workflow_status,completed_at,extended_at,source,source_reported_at').eq('member_id', memberId).eq('chapter_id', chapterId).maybeSingle();
  if (renewalError) return errResponse(renewalError.message);
  const facts = membershipFacts(member as Row, renewal as Row | null, today);
  const currentExpiry = facts.expiryDate || '';
  const { data: history, error: historyError } = await db.from('member_growth_cycles')
    .select('id,expiry_date').eq('chapter_id', chapterId).eq('member_id', memberId).order('expiry_date', { ascending: false }).limit(30);
  if (historyError) return errResponse(historyError.message);
  const requestedExpiry = action === 'getMemberGrowthTimeline' ? str(p.expiryDate) : '';
  if (requestedExpiry && !(history || []).some((cycle: Row) => String(cycle.expiry_date) === requestedExpiry))
    return errResponse('ไม่พบรอบสมาชิกนี้ใน Chapter', 404);
  const expiry = requestedExpiry || currentExpiry;
  if (!parseDateOnly(expiry)) return jsonResponse({ ok: true, unavailable: 'ไม่มีวันหมดอายุสมาชิกที่ยืนยันได้', member: { id: memberId, name: (member as Row).name, nickname: (member as Row).nickname }, ...facts,
    expirySource: (renewal as Row | null)?.source || null, expiryReportedAt: (renewal as Row | null)?.source_reported_at || null, nodes: [] });
  let { data: cycle, error: cycleError } = await db.from('member_growth_cycles')
    .select('id,member_id,expiry_date').eq('chapter_id', chapterId).eq('member_id', memberId).eq('expiry_date', expiry).maybeSingle();
  if (cycleError) return errResponse(cycleError.message);
  if (action !== 'getMemberGrowthTimeline' && !writable(auth)) return errResponse('ไม่มีสิทธิ์แก้ Member Growth Cycle', 403);
  const requestedMonth = Number(p.month);
  if (action !== 'getMemberGrowthTimeline' && (!Number.isInteger(requestedMonth) || requestedMonth < 1 || requestedMonth > 12))
    return errResponse('month ต้องเป็น 1–12', 400);
  if (action !== 'getMemberGrowthTimeline' && (requestedMonth === 3 || requestedMonth === 12))
    return errResponse('Milestone นี้เป็นงานของ Mentor หรือ Membership Committee', 403);
  if (action !== 'getMemberGrowthTimeline' && !cycle) {
    const created = await db.from('member_growth_cycles').upsert({ chapter_id: chapterId, member_id: memberId, expiry_date: expiry }, { onConflict: 'member_id,expiry_date' })
      .select('id,member_id,expiry_date').single();
    if (created.error) return errResponse(created.error.message);
    cycle = created.data;
  }
  const cycleId = str((cycle as Row | null)?.id);
  if (action === 'getMemberGrowthTimeline') {
    // Historical values are source snapshots, not confirmed monthly activity.
    // The member lookup above establishes Chapter ownership before service-role reads.
    const [performanceQ, scoresQ] = await Promise.all([
      db.from('palms_key_snapshots').select('year,month,referral_value,visitor_value,one_to_one_value,ceu_value,tyfcb_value,captured_at')
        .eq('member_id', memberId).order('year', { ascending: false }).order('month', { ascending: false }).limit(12),
      db.from('monthly_scores').select('year,month,score,synced_at,source').eq('member_id', memberId).eq('chapter_id', chapterId)
        .order('year', { ascending: false }).order('month', { ascending: false }).limit(12),
    ]);
    if (performanceQ.error || scoresQ.error) return errResponse(performanceQ.error?.message || scoresQ.error?.message || 'Performance history unavailable');
    const performanceHistory = buildMemberPerformanceHistory((performanceQ.data || []) as Row[], (scoresQ.data || []) as Row[]);
    const { data: entries, error: entriesError } = cycleId
      ? await db.from('member_growth_entries').select('id,month_number,status,result,issue,next_action,follow_up_date,related_growth_task_id,related_proposal_id,related_my121_id,handoff_signal_id,updated_at').eq('cycle_id', cycleId)
      : { data: [], error: null };
    if (entriesError) return errResponse(entriesError.message);
    const { data: mentorReview, error: mentorReviewError } = (member as Row).is_new_member
      ? await db.from('ninety_day_reviews').select('id,review_date').eq('member_id', memberId)
        .gte('review_date', monthDueDate(expiry, 1)!).lte('review_date', expiry)
        .order('review_date', { ascending: false }).limit(1).maybeSingle()
      : { data: null, error: null };
    if (mentorReviewError) return errResponse(mentorReviewError.message);
    const { data: profile } = await db.from('member_one_to_one_profiles').select('share_referral_focus').eq('member_id', memberId).maybeSingle();
    const canReadText = (profile as Row | null)?.share_referral_focus === true;
    const entryIds = ((entries || []) as Row[]).map(row => String(row.id));
    const signalIds = ((entries || []) as Row[]).map(row => str(row.handoff_signal_id)).filter(Boolean);
    const [notesQ, signalsQ] = await Promise.all([
      canReadText && entryIds.length ? db.from('member_growth_notes').select('id,entry_id,body,created_by,created_at').in('entry_id', entryIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
      signalIds.length ? db.from('member_signals').select('id,status,acknowledged_at').eq('member_id', memberId).in('id', signalIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (notesQ.error || signalsQ.error) return errResponse(notesQ.error?.message || signalsQ.error?.message || 'Timeline unavailable');
    const signals = new Map(((signalsQ.data || []) as Row[]).map(row => [String(row.id), row]));
    const noteCounts = new Map<string, number>();
    for (const note of (notesQ.data || []) as Row[]) noteCounts.set(String(note.entry_id), (noteCounts.get(String(note.entry_id)) || 0) + 1);
    const { data: rounds, error: roundsError } = await db.from('matching_rounds').select('id,meeting_date')
      .eq('chapter_id', chapterId).order('meeting_date', { ascending: false }).limit(200);
    if (roundsError) return errResponse(roundsError.message);
    const roundIds = ((rounds || []) as Row[]).map(row => String(row.id));
    const { data: verifiedPairs, error: pairError } = roundIds.length
      ? await db.from('matching_pairs').select('id,round_id').in('round_id', roundIds)
        .in('status', ['verified','late_verified'])
        .or(`member_a_id.eq.${memberId},member_b_id.eq.${memberId},optional_member_c_id.eq.${memberId}`).limit(100)
      : { data: [], error: null };
    if (pairError) return errResponse(pairError.message);
    const roundDates = new Map(((rounds || []) as Row[]).map(row => [String(row.id), row.meeting_date]));
    const safeEntries = ((entries || []) as Row[]).map(row => ({ id: row.id, month: row.month_number, status: row.status,
      result: canReadText ? row.result : '', issue: canReadText ? row.issue : '', nextAction: canReadText ? row.next_action : '',
      detailRestricted: !canReadText, followUpDate: row.follow_up_date, relatedGrowthTaskId: row.related_growth_task_id,
      relatedProposalId: row.related_proposal_id, relatedMy121Id: row.related_my121_id,
      handoffStatus: signals.get(str(row.handoff_signal_id))?.status || null, updatedAt: row.updated_at }));
    return jsonResponse({ ok: true, member: { id: memberId, name: (member as Row).name, nickname: (member as Row).nickname, isNewMember: (member as Row).is_new_member },
      expiryDate: expiry, cycleStartDate: monthDueDate(expiry, 1),
      membershipStartDate: facts.membershipStartDate, membershipStartSource: facts.membershipStartSource,
      membershipDays: facts.membershipDays, lastRenewedOn: facts.lastRenewedOn, latestExpiryDate: facts.expiryDate,
      expirySource: (renewal as Row | null)?.source || null, expiryReportedAt: (renewal as Row | null)?.source_reported_at || null,
      currentMonth: expiry === currentExpiry ? cycleMonth(expiry, today) : null,
      cycleHistory: ((history || []) as Row[]).map(row => String(row.expiry_date)),
      renewalStatus: expiry === currentExpiry ? renewalCycleStatus((renewal as Row | null)?.workflow_status) : 'Unknown',
      nodes: nodes(expiry, Boolean((member as Row).is_new_member), ((entries || []) as Row[]).map(row => ({ ...row, note_count: noteCounts.get(String(row.id)) || 0 })))
        .map(node => node.month === 3 && mentorReview ? { ...node, status: 'completed' } : node),
      mentorReview: mentorReview ? { status: 'completed', reviewDate: (mentorReview as Row).review_date } : { status: 'not_recorded', reviewDate: null },
      entries: safeEntries, notes: (notesQ.data || []), performanceHistory,
      verifiedMy121: ((verifiedPairs || []) as Row[]).map(pair => ({ pairId: pair.id, meetingDate: roundDates.get(String(pair.round_id)) || null })),
      canManage: writable(auth) && expiry === currentExpiry, privacy: canReadText ? 'current_consent' : 'detail_restricted' });
  }

  const month = requestedMonth;
  const { data: existing, error: existingError } = await db.from('member_growth_entries').select('id,result,issue,next_action,follow_up_date').eq('cycle_id', cycleId).eq('month_number', month).maybeSingle();
  if (existingError) return errResponse(existingError.message);
  let entryId = str((existing as Row | null)?.id);
  if (action === 'saveMemberGrowthEntry') {
    const status = str(p.status || 'open');
    if (!['open','in_progress','waiting_member','completed'].includes(status)) return errResponse('status ไม่ถูกต้อง', 400);
    const followUp = str(p.followUpDate);
    if (followUp && !parseDateOnly(followUp)) return errResponse('followUpDate ไม่ถูกต้อง', 400);
    const previous = (existing || {}) as Row;
    const requestedText = { result: str(p.result), issue: str(p.issue), next_action: str(p.nextAction) };
    if (Object.values(requestedText).some(value => value.length > 1000)) return errResponse('ข้อความยาวเกิน 1,000 ตัวอักษร', 400);
    const { data: profile } = await db.from('member_one_to_one_profiles').select('share_referral_focus').eq('member_id', memberId).maybeSingle();
    const canWriteText = (profile as Row | null)?.share_referral_focus === true;
    if (Object.values(requestedText).some(Boolean) && !canWriteText) return errResponse('ยังไม่มี consent ปัจจุบันสำหรับข้อความรายละเอียด', 403);
    const textFields = canWriteText
      ? { result: str(p.result ?? previous.result), issue: str(p.issue ?? previous.issue), next_action: str(p.nextAction ?? previous.next_action) }
      : { result: str(previous.result), issue: str(previous.issue), next_action: str(previous.next_action) };
    const payload = { cycle_id: cycleId, month_number: month, status, ...textFields, follow_up_date: p.followUpDate === undefined ? previous.follow_up_date || null : followUp || null,
      updated_by: str(auth.email), updated_at: new Date().toISOString() };
    const saved = await db.from('member_growth_entries').upsert(payload, { onConflict: 'cycle_id,month_number' }).select('id,status,follow_up_date').single();
    if (saved.error) return errResponse(saved.error.message);
    return jsonResponse({ ok: true, entry: saved.data });
  }
  if (action === 'appendMemberGrowthNote') {
    if (!entryId) return errResponse('บันทึกสถานะ Month นี้ก่อนเพิ่ม note', 409);
    const body = str(p.body);
    const key = str(p.requestKey);
    if (!body || body.length > 2000 || !/^[a-zA-Z0-9:_-]{12,160}$/.test(key)) return errResponse('body หรือ requestKey ไม่ถูกต้อง', 400);
    const { data: profile } = await db.from('member_one_to_one_profiles').select('share_referral_focus').eq('member_id', memberId).maybeSingle();
    if ((profile as Row | null)?.share_referral_focus !== true) return errResponse('ยังไม่มี consent ปัจจุบันสำหรับ note', 403);
    const inserted = await db.from('member_growth_notes').upsert({ entry_id: entryId, body, request_key: key, created_by: str(auth.email) }, { onConflict: 'request_key', ignoreDuplicates: true })
      .select('id,created_at').maybeSingle();
    if (inserted.error) return errResponse(inserted.error.message);
    return jsonResponse({ ok: true, note: inserted.data, duplicate: !inserted.data });
  }
  if (action === 'linkMemberGrowthTask') {
    if (!entryId || !uuid(p.taskId)) return errResponse('entry หรือ taskId ไม่ถูกต้อง', 400);
    const { data: task } = await db.from('growth_tasks').select('id,assigned_owner_email').eq('id', str(p.taskId)).eq('member_id', memberId).eq('chapter_id', chapterId).maybeSingle();
    if (!task) return errResponse('ไม่พบ Growth Task ของสมาชิกใน Chapter นี้', 404);
    if (!auth.isAdmin && !hasCapability(auth, CAPABILITY.GROWTH_COORDINATE) &&
        String(task.assigned_owner_email || '').toLowerCase() !== String(auth.email || '').toLowerCase())
      return errResponse('เชื่อมได้เฉพาะ Task ที่ตนได้รับมอบหมาย', 403);
    const updated = await db.from('member_growth_entries').update({ related_growth_task_id: str(p.taskId), updated_by: str(auth.email) }).eq('id', entryId).select('id').single();
    if (updated.error) return errResponse(updated.error.message);
    return jsonResponse({ ok: true, entryId, taskId: str(p.taskId) });
  }
  if (action === 'linkMemberGrowthMy121') {
    if (!entryId || !uuid(p.pairId)) return errResponse('entry หรือ pairId ไม่ถูกต้อง', 400);
    const { data: pair } = await db.from('matching_pairs')
      .select('id,round_id,member_a_id,member_b_id,optional_member_c_id,status')
      .eq('id', str(p.pairId)).in('status', ['verified','late_verified']).maybeSingle();
    if (!pair || ![pair.member_a_id, pair.member_b_id, pair.optional_member_c_id].some(id => String(id || '') === memberId))
      return errResponse('MY121 ต้องยืนยันแล้วและมีสมาชิกคนนี้อยู่ในคู่', 404);
    const { data: round } = await db.from('matching_rounds').select('id').eq('id', String(pair.round_id)).eq('chapter_id', chapterId).maybeSingle();
    if (!round) return errResponse('MY121 ไม่อยู่ใน Chapter นี้', 404);
    const updated = await db.from('member_growth_entries').update({ related_my121_id: str(p.pairId), updated_by: str(auth.email) }).eq('id', entryId).select('id').single();
    if (updated.error) return errResponse(updated.error.message);
    return jsonResponse({ ok: true, entryId, pairId: str(p.pairId), verified: true });
  }
  if (action === 'createMemberGrowthRenewalHandoff') {
    if (month !== 9 || !entryId) return errResponse('ต้องบันทึก Month 9 ก่อนส่งต่อ', 409);
    const summary = str(p.summary);
    if (summary.length < 10 || summary.length > 1000) return errResponse('สรุปที่แชร์ได้ต้องยาว 10–1,000 ตัวอักษร', 400);
    const { data: profile } = await db.from('member_one_to_one_profiles').select('share_referral_focus').eq('member_id', memberId).maybeSingle();
    if ((profile as Row | null)?.share_referral_focus !== true) return errResponse('ต้องมี consent ปัจจุบันก่อนส่งข้อความรายละเอียด', 403);
    const key = `growth-renewal:${chapterId}:${memberId}:${expiry}`;
    const existingSignal = await db.from('member_signals').select('id,status').eq('idempotency_key', key).maybeSingle();
    if (existingSignal.error) return errResponse(existingSignal.error.message);
    let signal = existingSignal.data;
    if (!signal) {
      const created = await db.from('member_signals').insert({ member_id: memberId, signal_type: 'renewal', subject_type: 'member_growth_cycle', subject_id: cycleId,
        title: 'Growth pre-renewal handoff', detail: summary, target_roles: ['Membership Committee'], status: 'new', priority: 'normal',
        payload: { source_role: 'growth', target_role: 'Membership Committee', safe_context: true, cycle_month: 9 }, idempotency_key: key })
        .select('id,status').single();
      if (created.error) return errResponse(created.error.message);
      signal = created.data;
    }
    const linked = await db.from('member_growth_entries').update({ handoff_signal_id: (signal as Row).id, updated_by: str(auth.email) }).eq('id', entryId);
    if (linked.error) return errResponse(linked.error.message);
    return jsonResponse({ ok: true, duplicate: Boolean(existingSignal.data), handoff: signal });
  }
  return errResponse('Unknown member growth action', 400);
}

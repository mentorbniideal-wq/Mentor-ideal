// Handler: dashboard — getDashboard, getMemberDetail, getMentorActivity, getMyTeam, etc.
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

const TEAMS = ['TOOMTAM', 'Aof', 'Draft', 'PHAI', 'AMP'];
const TEAM_ROLE: Record<string, string> = {
  toomtam: 'TOOMTAM', aof: 'Aof', draft: 'Draft', phai: 'PHAI', amp: 'AMP',
};
const MONTH_LABELS: Record<number, string> = {1:'JAN',2:'FEB',3:'MAR',4:'APR',5:'MAY',6:'JUN',7:'JUL',8:'AUG',9:'SEP',10:'OCT',11:'NOV',12:'DEC'};

export async function getMentorActivityData(db: ReturnType<typeof getServiceClient>) {
  const result = [];
  for (const teamName of TEAMS) {
    const { data: members } = await db
      .from('v_member_dashboard')
      .select('id, name, open_core_issue, core_issue_opened_at, display_score')
      .eq('mentor_team', teamName)
      .eq('is_archived', false);

    if (!members || (members as unknown[]).length === 0) {
      result.push({ team: teamName, memberCount: 0, scoreUp: 0, scoreDown: 0, scoreSame: 0, noScoreYet: 0, reportCount: 0, openCount: 0, notReported: [], daysSince: null, statusFlag: 'none' });
      continue;
    }

    const mArr = members as Record<string, unknown>[];
    const memberIds = mArr.map(m => String(m.id));

    const { data: allScores } = await db
      .from('monthly_scores')
      .select('member_id, score, year, month')
      .in('member_id', memberIds)
      .order('year', { ascending: false })
      .order('month', { ascending: false });

    const memberScores: Record<string, number[]> = {};
    for (const s of (allScores || []) as Record<string, unknown>[]) {
      const mid = String(s.member_id);
      if (!memberScores[mid]) memberScores[mid] = [];
      if (memberScores[mid].length < 2) memberScores[mid].push(Number(s.score) || 0);
    }

    let scoreUp = 0, scoreDown = 0, scoreSame = 0, noScoreYet = 0;
    let reportCount = 0, openCount = 0;
    const notReported: string[] = [];
    let latestTs: string | null = null;

    for (const m of mArr) {
      const scores = memberScores[String(m.id)] || [];
      if (scores.length >= 2) {
        const [curr, prev] = scores;
        if (curr > prev + 2) scoreUp++;
        else if (curr < prev - 2) scoreDown++;
        else scoreSame++;
      } else { noScoreYet++; }

      if (m.open_core_issue) {
        reportCount++;
        openCount++;
        const ts = String(m.core_issue_opened_at || '');
        if (!latestTs || ts > latestTs) latestTs = ts;
      } else {
        notReported.push(String(m.name));
      }
    }

    let daysSince: number | null = null;
    if (latestTs) daysSince = Math.floor((Date.now() - new Date(latestTs).getTime()) / 86400000);

    const statusFlag = reportCount === 0 ? 'none'
      : daysSince !== null && daysSince > 21 ? 'stale'
      : notReported.length > 0 ? 'partial' : 'ok';

    result.push({ team: teamName, memberCount: mArr.length, scoreUp, scoreDown, scoreSame, noScoreYet, reportCount, openCount, notReported, daysSince, statusFlag });
  }
  return result;
}

export async function handleDashboard(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    case 'getDashboard':
    case 'getMCData':
    case 'getDesktopDashboard': {
      const { data: rows, error } = await db
        .from('v_member_dashboard')
        .select('id, name, nickname, mentor_team, display_score, traffic_light, given_thb, received_thb, tyfcb_thb, absent, attend, rg, rr, visitors, one_to_one, ceu, palms_detail, expiry_date, days_to_expiry, bni_days')
        .eq('is_archived', false)
        .order('display_score', { ascending: false });
      if (error) return errResponse(error.message);

      const memberIds = (rows || []).map((m: Record<string, unknown>) => String(m.id));

      // ── Batch-fetch monthly score history for sparklines ──
      const { data: allScores } = memberIds.length
        ? await db.from('monthly_scores').select('member_id, score, year, month')
            .in('member_id', memberIds)
            .order('year', { ascending: true })
            .order('month', { ascending: true })
        : { data: [] };
      const histMap: Record<string, number[]> = {};
      const scoreHistoryMap: Record<string, { year: number; month: number; label: string; score: number | null }[]> = {};
      for (const s of (allScores || []) as Record<string, unknown>[]) {
        const mid = String(s.member_id);
        if (!histMap[mid]) histMap[mid] = [];
        if (!scoreHistoryMap[mid]) scoreHistoryMap[mid] = [];
        const year = Number(s.year) || 0;
        const month = Number(s.month) || 0;
        const scoreVal = Number(s.score) || 0;
        histMap[mid].push(scoreVal);
        scoreHistoryMap[mid].push({
          year,
          month,
          label: `${MONTH_LABELS[month] || String(month)} ${year || ''}`.trim(),
          score: scoreVal || null,
        });
      }

      // ── Batch-fetch phone/email/is_new_member (not in view) ──
      const { data: contactRows } = memberIds.length
        ? await db.from('members').select('id, phone, email, is_new_member').in('id', memberIds)
        : { data: [] };
      const contactMap: Record<string, { phone: string; email: string; isNew: boolean }> = {};
      for (const c of (contactRows || []) as Record<string, unknown>[]) {
        contactMap[String(c.id)] = { phone: String(c.phone || ''), email: String(c.email || ''), isNew: Boolean(c.is_new_member) };
      }

      const summary: Record<string, number> = { green: 0, yellow: 0, red: 0, black: 0, none: 0 };
      type TeamAgg = { team: string; count: number; scoreSum: number; scored: number; green: number; yellow: number; red: number; black: number; none: number; nmCount: number; tyfcbTotal: number; givenTotal: number; recvTotal: number; absentTotal: number };
      const teamAgg: Record<string, TeamAgg> = {};

      const members = (rows || []).map((m: Record<string, unknown>) => {
        const mid     = String(m.id);
        const tl      = String(m.traffic_light || 'none');
        const score   = Number(m.display_score) || 0;
        const team    = String(m.mentor_team || '');
        const bniDays = Number(m.bni_days) || 0;
        const recv    = Number(m.received_thb) || 0;
        const given   = Number(m.given_thb) || 0;
        const tyfcbV  = Number(m.tyfcb_thb) || 0;
        const absentV = Number(m.absent) || 0;
        const contact = contactMap[mid] || { phone: '', email: '', isNew: false };

        if (tl in summary) summary[tl]++;

        if (team) {
          if (!teamAgg[team]) teamAgg[team] = { team, count: 0, scoreSum: 0, scored: 0, green: 0, yellow: 0, red: 0, black: 0, none: 0, nmCount: 0, tyfcbTotal: 0, givenTotal: 0, recvTotal: 0, absentTotal: 0 };
          const ta = teamAgg[team];
          ta.count++;
          if (score > 0) { ta.scoreSum += score; ta.scored++; }
          if (tl in ta) (ta as unknown as Record<string, number>)[tl]++;
          if (contact.isNew) ta.nmCount++;
          ta.tyfcbTotal  += tyfcbV;
          ta.givenTotal  += given;
          ta.recvTotal   += recv;
          ta.absentTotal += absentV;
        }

        // Map palms_detail keys to frontend naming convention
        const pd   = (m.palms_detail || {}) as Record<string, unknown>;
        const cats = pd && Object.keys(pd).length > 0 ? {
          absent:   Number(pd.absence)  || 0,
          ref:      Number(pd.referral) || 0,
          tyfcb:    Number(pd.tyfb)     || 0,
          visitor:  Number(pd.visitor)  || 0,
          one21:    Number(pd.oneToOne) || 0,
          training: Number(pd.ceu)      || 0,
        } : null;

        const actual = {
          rg:      Number(m.rg)         || 0,
          rr:      Number(m.rr)         || 0,
          visitor: Number(m.visitors)   || 0,
          oToOne:  Number(m.one_to_one) || 0,
          ceu:     Number(m.ceu)        || 0,
          tyfcb:   tyfcbV,
          bniDays, absent: absentV,
          attend:  Number(m.attend)     || 0,
        };

        const roi = given > 0 ? Math.round(recv / 28000 * 100) : 0;
        const hist = histMap[mid] || [];
        const scoreHistory = scoreHistoryMap[mid] || [];

        // Fast Track: suggest highest-gain next actions per PALMS tier
        const fastTrack: { icon: string; cat: string; action: string; gain: number; curVal: string; tgtVal: string }[] = [];
        if (cats) {
          const wks = Math.max(1, Math.floor(bniDays / 7));
          const mos = Math.max(1, wks / 4);
          const fmt = (v: number) => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? Math.round(v / 1000) + 'K' : String(Math.round(v));

          // Absence (15pts): 0abs→15, 1→10, 2→5, 3+→0
          if (cats.absent < 15) {
            const gain = cats.absent < 5 ? 5 : cats.absent < 10 ? 5 : 5;
            const tgt  = cats.absent < 5 ? '2 ครั้ง' : cats.absent < 10 ? '1 ครั้ง' : '0 ครั้ง';
            fastTrack.push({ icon: '📅', cat: 'ลดการขาด', gain, action: 'ลดการขาดประชุมให้เหลือน้อยกว่าเป้า', curVal: `ขาด ${actual.absent} ครั้ง`, tgtVal: `ขาด ≤${tgt}` });
          }
          // Referral (15pts): ≥2/wk→15, ≥1/wk→10, else→0
          if (cats.ref < 15) {
            const gain = cats.ref === 0 ? 10 : 5;
            const tgt  = cats.ref === 0 ? '1 ใบ/สัปดาห์' : '2 ใบ/สัปดาห์';
            fastTrack.push({ icon: '💡', cat: 'Referral', gain, action: 'ให้ Referral เพิ่มขึ้น', curVal: `${(actual.rg / wks).toFixed(1)} ใบ/สัปดาห์`, tgtVal: tgt });
          }
          // Visitor (20pts): ≥1/mo→20, any→10, else→0
          if (cats.visitor < 20) {
            const gain = cats.visitor === 0 ? 10 : 10;
            const tgt  = cats.visitor === 0 ? 'พา Visitor อย่างน้อย 1 คน' : '≥1 คน/เดือน';
            fastTrack.push({ icon: '👥', cat: 'Visitor', gain, action: 'พาคนนอกมาเยี่ยม Chapter', curVal: `${actual.visitor} คน (${(actual.visitor / mos).toFixed(1)}/เดือน)`, tgtVal: tgt });
          }
          // 1-2-1 (15pts): ≥2/wk→15, ≥1/wk→10, >0→5
          if (cats.one21 < 15) {
            const gain = cats.one21 === 0 ? 5 : 5;
            const tgt  = cats.one21 === 0 ? 'ทำ 1-2-1 อย่างน้อย 1 ครั้ง' : cats.one21 < 10 ? '1 ครั้ง/สัปดาห์' : '2 ครั้ง/สัปดาห์';
            fastTrack.push({ icon: '🤝', cat: '1-2-1', gain, action: 'เพิ่มการนัด 1-2-1 กับ Chapter', curVal: `${(actual.oToOne / wks).toFixed(1)} ครั้ง/สัปดาห์`, tgtVal: tgt });
          }
          // CEU (20pts): ≥4→20, 3→15, ≥2→10, ≥1→5
          if (cats.training < 20) {
            const gain = 5;
            const tgt  = cats.training === 0 ? '1 CEU' : cats.training < 10 ? '2 CEU' : cats.training < 15 ? '3 CEU' : '4+ CEU';
            fastTrack.push({ icon: '📚', cat: 'CEU/Training', gain, action: 'เข้าร่วม Training / CEU เพิ่ม', curVal: `${actual.ceu} CEU`, tgtVal: tgt });
          }
          // TYFCB (15pts): ≥500k→15, ≥200k→10, ≥100k→5
          if (cats.tyfcb < 15) {
            const gain = 5;
            const tgt  = cats.tyfcb === 0 ? '฿100K' : cats.tyfcb < 10 ? '฿200K' : '฿500K';
            fastTrack.push({ icon: '💰', cat: 'TYFCB', gain, action: 'เพิ่ม Closed Business จาก BNI', curVal: `฿${fmt(actual.tyfcb)}`, tgtVal: tgt });
          }
          fastTrack.sort((a, b) => b.gain - a.gain);
          fastTrack.splice(4); // top 4 only
        }

        return {
          id: mid,
          name: m.name, nick: m.nickname, mentor: m.mentor_team,
          score, tl, roi, hist,
          scoreHistory,
          given, recv,
          tyfcb: tyfcbV, absent: absentV,
          bniScore: score, bniTl: tl,
          palmsScore: score,
          cats, actual, bniDays,
          fastTrack,
          phone: contact.phone, email: contact.email,
          noMentorContact: false, mentorContactDays: null as number | null,
          scoreAvg: hist.length ? Math.round(hist.reduce((a, v) => a + v, 0) / hist.length) : score,
        };
      });

      // ── Teams aggregation (needed for bar chart + Mentor Teams tab) ──
      const activityData = await getMentorActivityData(db);
      const actMap: Record<string, Record<string, unknown>> = {};
      for (const a of activityData) actMap[a.team] = a as unknown as Record<string, unknown>;

      const teams = TEAMS.map(teamName => {
        const ta  = teamAgg[teamName] || { team: teamName, count: 0, scoreSum: 0, scored: 0, green: 0, yellow: 0, red: 0, black: 0, none: 0, nmCount: 0, tyfcbTotal: 0, givenTotal: 0, recvTotal: 0, absentTotal: 0 };
        const act = actMap[teamName]  || {};
        return {
          team: teamName,
          count: ta.count,
          avg: ta.scored ? Math.round(ta.scoreSum / ta.scored) : 0,
          green: ta.green, yellow: ta.yellow, red: ta.red, black: ta.black, none: ta.none,
          nmCount: ta.nmCount, tyfcbTotal: ta.tyfcbTotal,
          givenTotal: ta.givenTotal, recvTotal: ta.recvTotal, absentTotal: ta.absentTotal,
          ...act,
        };
      });

      // ── Renewal list (within 90 days) ──
      const now90 = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0];
      const renewal = (rows || [])
        .filter((m: Record<string, unknown>) => m.expiry_date != null && String(m.expiry_date) <= now90)
        .map((m: Record<string, unknown>) => {
          const diffDays = Number(m.days_to_expiry) || 0;
          return {
            name:     String(m.name),
            team:     String(m.mentor_team || ''),
            diffDays,
            expStr:   String(m.expiry_date || ''),
            status:   diffDays < 0 ? 'expired' : diffDays <= 30 ? 'urgent' : 'soon',
          };
        })
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) => (Number(a.diffDays) || 0) - (Number(b.diffDays) || 0));

      // ── Chapter health metrics (computed from members) ──
      const total = members.length;
      const greenPct  = total ? Math.round(summary.green / total * 100) : 0;
      const avgBNI    = total ? Math.round(members.reduce((s, m) => s + (m.score || 0), 0) / total) : 0;
      const avgROI    = total ? Math.round(members.reduce((s, m) => s + (m.recv as number) / 28000 * 100, 0) / total) : 0;

      const { data: archivedRows } = await db.from('members').select('id')
        .eq('is_archived', true)
        .gte('updated_at', new Date(Date.now() - 365 * 86400000).toISOString());
      const left12mo = (archivedRows || []).length;

      const { data: newRows } = await db.from('members').select('id')
        .eq('is_new_member', true)
        .eq('is_archived', false);
      const added6mo = (newRows || []).length;

      const thisMonthStart = new Date(); thisMonthStart.setDate(1); thisMonthStart.setHours(0,0,0,0);
      const { data: visRows } = await db.from('visitor_log').select('id, status')
        .gte('visit_date', thisMonthStart.toISOString().split('T')[0]);
      const visTot = (visRows || []).length;
      const visJoined = (visRows || []).filter((v: Record<string, unknown>) => String(v.status) === 'joined').length;

      const health = {
        total, greenPct, avgBNI, avgROI,
        retention: total + left12mo > 0 ? Math.round(total / (total + left12mo) * 100) : 100,
        left12mo, added6mo,
        visitors: { visitedThisMonth: visTot, total: visTot, joined: visJoined, convRate: visTot ? Math.round(visJoined / visTot * 100) : 0 },
      };

      // ── New member list ──
      const { data: nmRows } = await db.from('members').select('name, nickname, mentor_team')
        .eq('is_new_member', true).eq('is_archived', false);
      const nmList = (nmRows || []).map((m: Record<string, unknown>) => ({
        name: m.name, nick: m.nickname, mentor: m.mentor_team,
      }));

      summary['total'] = members.length;
      return jsonResponse({ ok: true, members, summary, teams, renewal, health, nmList, updatedAt: new Date().toISOString() });
    }

    case 'getMemberDetail': {
      const memberName = String(p.memberName || p.name || '').replace(/\s*\([^)]+\)\s*$/,'').trim();
      if (!memberName) return errResponse('memberName required');

      const { data: m, error: mErr } = await db
        .from('v_member_dashboard').select('*').eq('name', memberName).single();
      if (mErr || !m) return errResponse(`ไม่พบ "${memberName}"`);

      const mv = m as Record<string, unknown>;
      const memberId = String(mv.id);

      const { data: scores } = await db.from('monthly_scores').select('year, month, score')
        .eq('member_id', memberId).order('year', { ascending: true }).order('month', { ascending: true });
      const scoreHistory = (scores || []).map((s: Record<string, unknown>) => ({
        month: MONTH_LABELS[Number(s.month)] || String(s.month),
        score: Number(s.score) || null,
      }));

      const { data: info } = await db.from('members').select('phone, email').eq('id', memberId).single();
      const inf = (info || {}) as Record<string, unknown>;

      const bniDays = Number(mv.bni_days) || 0;
      const weeks = bniDays > 0 ? Math.min(26, Math.max(1, Math.floor(bniDays / 7))) : 1;
      const actual = {
        rg: Number(mv.rg) || 0, rr: Number(mv.rr) || 0,
        visitor: Number(mv.visitors) || 0, oToOne: Number(mv.one_to_one) || 0,
        ceu: Number(mv.ceu) || 0, tyfcb: Number(mv.tyfcb_thb) || 0,
        bniDays, attend: Number(mv.attend) || 0, absent: Number(mv.absent) || 0,
        late: Number(mv.late) || 0, sub: Number(mv.sub) || 0,
        email: String(inf.email || ''), phone: String(inf.phone || ''),
      };
      const target = {
        referral: weeks * 2, visitor: Math.max(1, Math.ceil((weeks / 26) * 2)),
        oToOne: weeks * 2, ceu: Math.max(1, Math.ceil((weeks / 26) * 4)), attend: weeks,
      };

      const displayScore = Number(mv.display_score) || 0;
      const tl = String(mv.traffic_light || 'none');

      const absent = actual.absent;
      const attendRisk = absent >= 5 ? 'critical' : absent >= 3 ? 'danger' : absent >= 1 ? 'warning' : 'ok';

      // Build PALMS component scores from palms_detail
      const pd = (mv.palms_detail || {}) as Record<string, unknown>;
      const cats = Object.keys(pd).length > 0 ? {
        absent:   Number(pd.absence)  || 0,
        ref:      Number(pd.referral) || 0,
        tyfcb:    Number(pd.tyfb)     || 0,
        visitor:  Number(pd.visitor)  || 0,
        one21:    Number(pd.oneToOne) || 0,
        training: Number(pd.ceu)      || 0,
      } : null;

      // Fast Track actions (same algorithm as getDashboard)
      const fmt = (v: number) => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? Math.round(v / 1000) + 'K' : String(Math.round(v));
      const wks = Math.max(1, Math.floor(bniDays / 7));
      const mos = Math.max(1, wks / 4);
      const fastestActions: { icon: string; cat: string; action: string; gain: number; curVal: string; tgtVal: string }[] = [];
      if (cats) {
        if (cats.absent < 15) {
          const gain = cats.absent < 10 ? 5 : 5;
          fastestActions.push({ icon: '📅', cat: 'ลดการขาด', gain, action: 'ลดการขาดประชุมให้เหลือน้อยกว่าเป้า', curVal: `ขาด ${absent} ครั้ง`, tgtVal: cats.absent < 5 ? 'ขาด ≤2 ครั้ง' : 'ขาด 0 ครั้ง' });
        }
        if (cats.ref < 15) {
          fastestActions.push({ icon: '💡', cat: 'Referral', gain: cats.ref === 0 ? 10 : 5, action: 'ให้ Referral เพิ่มขึ้น', curVal: `${(actual.rg / wks).toFixed(1)} ใบ/สัปดาห์`, tgtVal: cats.ref === 0 ? '1 ใบ/สัปดาห์' : '2 ใบ/สัปดาห์' });
        }
        if (cats.visitor < 20) {
          fastestActions.push({ icon: '👥', cat: 'Visitor', gain: 10, action: 'พาคนนอกมาเยี่ยม Chapter', curVal: `${actual.visitor} คน (${(actual.visitor / mos).toFixed(1)}/เดือน)`, tgtVal: cats.visitor === 0 ? 'พา Visitor อย่างน้อย 1 คน' : '≥1 คน/เดือน' });
        }
        if (cats.one21 < 15) {
          fastestActions.push({ icon: '🤝', cat: '1-2-1', gain: 5, action: 'เพิ่มการนัด 1-2-1 กับ Chapter', curVal: `${(actual.oToOne / wks).toFixed(1)} ครั้ง/สัปดาห์`, tgtVal: cats.one21 === 0 ? 'ทำ 1-2-1 อย่างน้อย 1 ครั้ง' : '1 ครั้ง/สัปดาห์' });
        }
        if (cats.training < 20) {
          fastestActions.push({ icon: '📚', cat: 'CEU/Training', gain: 5, action: 'เข้าร่วม Training / CEU เพิ่ม', curVal: `${actual.ceu} CEU`, tgtVal: cats.training === 0 ? '1 CEU' : cats.training < 10 ? '2 CEU' : '4+ CEU' });
        }
        if (cats.tyfcb < 15) {
          fastestActions.push({ icon: '💰', cat: 'TYFCB', gain: 5, action: 'เพิ่ม Closed Business จาก BNI', curVal: `฿${fmt(actual.tyfcb)}`, tgtVal: cats.tyfcb === 0 ? '฿100K' : cats.tyfcb < 10 ? '฿200K' : '฿500K' });
        }
        fastestActions.sort((a, b) => b.gain - a.gain);
        fastestActions.splice(4);
      }

      const nextTl = displayScore >= 70 ? 'green' : displayScore >= 50 ? 'green' : 'yellow';
      const needed = displayScore >= 70 ? 0 : displayScore >= 50 ? 70 - displayScore : displayScore >= 30 ? 50 - displayScore : 30 - displayScore;

      const fastTrack = {
        score: {
          tl,
          total: displayScore,
          absent:   cats?.absent   ?? 0,
          ref:      cats?.ref      ?? 0,
          tyfcb:    cats?.tyfcb    ?? 0,
          visitor:  cats?.visitor  ?? 0,
          one21:    cats?.one21    ?? 0,
          training: cats?.training ?? 0,
        },
        nextTl,
        needed,
        gaps:           fastestActions,
        fastestActions,
      };

      // Balance: given - received (formatted string)
      const givenThb = Number(mv.given_thb) || 0;
      const recvThb  = Number(mv.received_thb) || 0;
      const balVal   = givenThb - recvThb;
      const balance  = (balVal >= 0 ? '+฿' : '-฿') + fmt(Math.abs(balVal));

      // Build priorities array for the coaching card (mapped from fastestActions)
      const priorities = fastestActions.map(fa => ({
        type:   fa.gain >= 10 ? 'emergency' : fa.gain >= 5 ? 'warning' : 'quick',
        title:  fa.cat,
        action: `${fa.action}\n${fa.curVal} → ${fa.tgtVal}`,
        target: fa.tgtVal,
      }));

      return jsonResponse({
        ok: true, name: mv.name, nick: mv.nickname, mentor: mv.mentor_team,
        score: displayScore, tl, bniScore: displayScore, bniTl: tl,
        cats, attendRisk, fastTrack, priorities, balance,
        given: Number(mv.given_thb) || 0, recv: Number(mv.received_thb) || 0,
        actual, target, weeks, scoreHistory,
        coreIssue: mv.open_core_issue ? { coreIssue: mv.open_core_issue, savedAt: mv.core_issue_opened_at } : null,
        renewal: mv.expiry_date || '',
      });
    }

    case 'getMyTeam': {
      const role = String(p.role || '').toLowerCase();
      const teamName = String(p.teamName || TEAM_ROLE[role] || '');
      if (!teamName) return errResponse('ไม่พบทีม');

      const { data: members, error } = await db
        .from('v_member_dashboard')
        .select('id, name, nickname, display_score, traffic_light, absent, tyfcb_thb, open_core_issue, given_thb, received_thb, palms_detail')
        .eq('mentor_team', teamName).eq('is_archived', false)
        .order('display_score', { ascending: false });
      if (error) return errResponse(error.message);

      const memberIds = (members || []).map((m: Record<string, unknown>) => String(m.id));
      const { data: scoreHist } = await db.from('monthly_scores')
        .select('member_id, year, month, score').in('member_id', memberIds)
        .order('year', { ascending: true }).order('month', { ascending: true });

      const histMap: Record<string, { month: string; score: number | null }[]> = {};
      for (const s of (scoreHist || []) as Record<string, unknown>[]) {
        const mid = String(s.member_id);
        if (!histMap[mid]) histMap[mid] = [];
        histMap[mid].push({ month: MONTH_LABELS[Number(s.month)] || '', score: Number(s.score) || null });
      }

      const memberList = (members || []).map((m: Record<string, unknown>, idx: number) => ({
        row: idx + 1,   // 1-based numeric row — used by saveMCMessage
        name: m.name, nick: m.nickname,
        score: Number(m.display_score) || 0, tl: String(m.traffic_light || 'none'),
        absent: Number(m.absent) || 0, tyfcb: Number(m.tyfcb_thb) || 0,
        given: Number(m.given_thb) || 0, recv: Number(m.received_thb) || 0,
        hasOpenCase: !!m.open_core_issue, cats: m.palms_detail || null,
        scoreHistory: histMap[String(m.id)] || [],
      }));

      return jsonResponse({ ok: true, teamName, members: memberList });
    }

    case 'getMentorActivity': {
      const teams = await getMentorActivityData(db);
      return jsonResponse({ ok: true, teams });
    }

    case 'getMentorPerformance': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);
      const teams = await getMentorActivityData(db);
      for (const t of teams) {
        const { data: issues } = await db.from('core_issues').select('opened_at')
          .eq('mentor_team', (t as Record<string, unknown>).team as string).eq('status', 'open');
        let oldest = 0;
        for (const ci of (issues || []) as Record<string, unknown>[]) {
          const age = Math.floor((Date.now() - new Date(String(ci.opened_at)).getTime()) / 86400000);
          if (age > oldest) oldest = age;
        }
        (t as Record<string, unknown>).oldestOpenDays = oldest;
      }
      return jsonResponse({ ok: true, teams });
    }

    case 'getChapterPulse': {
      const { data: rows, error } = await db
        .from('v_member_dashboard')
        .select('name, nickname, mentor_team, display_score, traffic_light, given_thb, received_thb')
        .eq('is_archived', false);
      if (error) return errResponse(error.message);

      const tlCount = { green: 0, yellow: 0, red: 0, black: 0, none: 0 };
      let totalScore = 0, memberCount = 0, totalGiven = 0, totalRecv = 0;

      for (const m of (rows || []) as Record<string, unknown>[]) {
        const score = Number(m.display_score) || 0;
        if (score === 0) continue;
        memberCount++; totalScore += score;
        totalGiven += Number(m.given_thb) || 0; totalRecv += Number(m.received_thb) || 0;
        const tl = String(m.traffic_light || 'none') as keyof typeof tlCount;
        if (tl in tlCount) tlCount[tl]++;
      }

      const { data: hist } = await db.from('v_score_history').select('nickname, score, sort_key').order('sort_key', { ascending: false });
      const trendMap: Record<string, { curr: number; prev: number }> = {};
      const seen: Record<string, number> = {};
      for (const s of (hist || []) as Record<string, unknown>[]) {
        const nick = String(s.nickname || '');
        if (!nick) continue;
        seen[nick] = (seen[nick] || 0) + 1;
        if (seen[nick] === 1) trendMap[nick] = { curr: Number(s.score), prev: 0 };
        else if (seen[nick] === 2) trendMap[nick].prev = Number(s.score);
      }

      const movers = (rows || []).map((m: Record<string, unknown>) => {
        const nick = String(m.nickname || m.name || '');
        const name = String(m.name || nick);
        const t = trendMap[nick];
        if (!t || !t.prev) return null;
        return { nick, name, tl: m.traffic_light, score: t.curr, prev: t.prev, delta: t.curr - t.prev };
      }).filter(Boolean) as Record<string, unknown>[];

      const risers  = movers.filter(m => Number(m.delta) > 2).sort((a, b) => Number(b.delta) - Number(a.delta)).slice(0, 3);
      const fallers = movers.filter(m => Number(m.delta) < -2).sort((a, b) => Number(a.delta) - Number(b.delta)).slice(0, 3);

      return jsonResponse({ ok: true, memberCount, avgScore: memberCount ? Math.round(totalScore / memberCount) : 0, tlCount, totalGiven, totalRecv, risers, fallers });
    }

    case 'getLeaderboard': {
      const { data: rows, error } = await db
        .from('v_member_dashboard')
        .select('name, nickname, mentor_team, display_score, traffic_light, given_thb, received_thb')
        .eq('is_archived', false).order('display_score', { ascending: false });
      if (error) return errResponse(error.message);
      const members = (rows || []).map((m: Record<string, unknown>) => ({
        name: m.name, nick: m.nickname, mentor: m.mentor_team,
        score: Number(m.display_score) || 0, tl: String(m.traffic_light || 'none'),
        given: Number(m.given_thb) || 0, recv: Number(m.received_thb) || 0,
      }));
      return jsonResponse({ ok: true, members });
    }

    case 'getScorecard': {
      // ── 1. Fetch all active members with current scores ──────
      const { data: memRows, error: memErr } = await db
        .from('v_member_dashboard')
        .select('id, name, nickname, mentor_team, display_score, traffic_light, absent, given_thb, received_thb')
        .eq('is_archived', false)
        .order('display_score', { ascending: false });
      if (memErr) return errResponse(memErr.message);

      const allMem = (memRows || []) as Record<string, unknown>[];
      const memberIds = allMem.map(m => String(m.id));

      // ── 2. Fetch last 2 months of monthly_scores for movement ─
      const { data: scoreRows } = memberIds.length
        ? await db.from('monthly_scores')
            .select('member_id, score, year, month')
            .in('member_id', memberIds)
            .order('year', { ascending: false })
            .order('month', { ascending: false })
        : { data: [] };

      // Group: keep only last 2 scores per member (desc order already)
      const scoreMap: Record<string, { score: number; year: number; month: number }[]> = {};
      for (const s of (scoreRows || []) as Record<string, unknown>[]) {
        const mid = String(s.member_id);
        if (!scoreMap[mid]) scoreMap[mid] = [];
        if (scoreMap[mid].length < 2) scoreMap[mid].push({ score: Number(s.score)||0, year: Number(s.year), month: Number(s.month) });
      }

      // Determine this/prev month labels from data
      let thisYear = new Date().getFullYear(), thisMonth = new Date().getMonth() + 1;
      let prevYear = thisYear, prevMonth = thisMonth === 1 ? 12 : thisMonth - 1;
      if (thisMonth === 1) prevYear--;

      // Try to infer from actual score data
      const allMonths: { year: number; month: number }[] = [];
      for (const scores of Object.values(scoreMap)) {
        if (scores[0]) allMonths.push({ year: scores[0].year, month: scores[0].month });
      }
      if (allMonths.length) {
        allMonths.sort((a, b) => b.year * 100 + b.month - (a.year * 100 + a.month));
        thisYear  = allMonths[0].year;  thisMonth  = allMonths[0].month;
        prevYear  = thisMonth === 1 ? thisYear - 1 : thisYear;
        prevMonth = thisMonth === 1 ? 12 : thisMonth - 1;
      }

      const thisMonthLabel = MONTH_LABELS[thisMonth] || String(thisMonth);
      const prevMonthLabel = MONTH_LABELS[prevMonth] || String(prevMonth);

      function tlZone(score: number): string {
        if (score >= 70) return 'green';
        if (score >= 50) return 'yellow';
        if (score >= 30) return 'red';
        return 'black';
      }
      function teamGrade(avg: number): string {
        if (avg >= 75) return 'A+';
        if (avg >= 70) return 'A';
        if (avg >= 60) return 'B+';
        if (avg >= 50) return 'B';
        if (avg >= 30) return 'C';
        return 'D';
      }

      // ── 3. Compute per-member movement ───────────────────────
      let mvUp = 0, mvSame = 0, mvDown = 0;
      const zoneUp: Record<string, unknown>[] = [];
      const zoneDn: Record<string, unknown>[] = [];
      const movers: { nick: string; team: string; from: number; to: number; diff: number }[] = [];

      for (const m of allMem) {
        const mid = String(m.id);
        const sc = scoreMap[mid] || [];
        if (sc.length < 2) continue;
        const curr = sc[0].score, prev = sc[1].score;
        const diff = curr - prev;
        if (diff > 2) mvUp++;
        else if (diff < -2) mvDown++;
        else mvSame++;

        const currZone = tlZone(curr), prevZone = tlZone(prev);
        const entry = { nick: String(m.nickname||m.name), team: String(m.mentor_team||''), from: prev, to: curr, diff };
        if (currZone !== prevZone) {
          const zoneOrder: Record<string, number> = { black: 0, red: 1, yellow: 2, green: 3 };
          if ((zoneOrder[currZone]||0) > (zoneOrder[prevZone]||0)) zoneUp.push(entry);
          else zoneDn.push(entry);
        }
        movers.push(entry);
      }

      movers.sort((a, b) => b.diff - a.diff);
      const topImproved = movers.slice(0, 3).filter(m => m.diff > 0);
      const topDeclined = movers.slice(-3).filter(m => m.diff < 0).reverse();

      // ── 4. Team aggregates with grades ───────────────────────
      const teamAgg: Record<string, { count: number; scoreSum: number; scored: number; prevSum: number; prevScored: number; redBlk: number; diving: number }> = {};
      for (const t of TEAMS) teamAgg[t] = { count: 0, scoreSum: 0, scored: 0, prevSum: 0, prevScored: 0, redBlk: 0, diving: 0 };

      for (const m of allMem) {
        const team = String(m.mentor_team || '');
        if (!teamAgg[team]) continue;
        const ta = teamAgg[team];
        ta.count++;
        const mid = String(m.id);
        const sc = scoreMap[mid] || [];
        const curr = sc[0]?.score ?? Number(m.display_score) ?? 0;
        const prev = sc[1]?.score ?? 0;
        const tl   = String(m.traffic_light || 'none');
        if (curr > 0) { ta.scoreSum += curr; ta.scored++; }
        if (prev > 0) { ta.prevSum  += prev; ta.prevScored++; }
        if (tl === 'red' || tl === 'black') ta.redBlk++;
        if (sc.length >= 2 && curr < prev - 2) ta.diving++;
      }

      const teams = TEAMS.map(t => {
        const ta = teamAgg[t];
        const thisAvg = ta.scored   ? Math.round(ta.scoreSum / ta.scored)   : 0;
        const prevAvg = ta.prevScored ? Math.round(ta.prevSum / ta.prevScored) : 0;
        return {
          name: t, team: t, count: ta.count,
          thisAvg, prevAvg, diff: thisAvg - prevAvg,
          grade: teamGrade(thisAvg),
          redBlk: ta.redBlk, diving: ta.diving,
        };
      });

      const members = allMem.map(m => ({
        name: m.name, nick: m.nickname, mentor: m.mentor_team,
        score: Number(m.display_score) || 0, tl: String(m.traffic_light || 'none'),
        absent: Number(m.absent) || 0, given: Number(m.given_thb) || 0, recv: Number(m.received_thb) || 0,
      }));

      return jsonResponse({
        ok: true, members,
        movement: {
          total: mvUp + mvSame + mvDown,
          up: mvUp, same: mvSame, down: mvDown,
          zoneUp, zoneDn,
        },
        prevMonth: prevMonthLabel, thisMonth: thisMonthLabel,
        topImproved, topDeclined,
        teams,
      });
    }

    case 'getMCCoaching': {
      const { data: rows, error } = await db
        .from('v_member_dashboard')
        .select('name, nickname, mentor_team, display_score, traffic_light, open_core_issue, palms_detail, rg, visitors, one_to_one, ceu, tyfcb_thb, bni_days, absent')
        .eq('is_archived', false).order('display_score', { ascending: true });
      if (error) return errResponse(error.message);

      const fmtThb = (v: number) => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? Math.round(v / 1000) + 'K' : String(Math.round(v));

      const guides = (rows || []).map((m: Record<string, unknown>) => {
        const score  = Number(m.display_score) || 0;
        const bniTl  = String(m.traffic_light || 'none');
        const pd     = (m.palms_detail || {}) as Record<string, unknown>;
        const cats   = Object.keys(pd).length > 0 ? {
          absent: Number(pd.absence)  || 0, ref:      Number(pd.referral) || 0,
          tyfcb:  Number(pd.tyfb)    || 0, visitor:  Number(pd.visitor)  || 0,
          one21:  Number(pd.oneToOne)|| 0, training: Number(pd.ceu)      || 0,
        } : null;

        const bniDays = Number(m.bni_days) || 0;
        const wks     = Math.max(1, Math.min(26, Math.floor(bniDays / 7)));
        const mos     = Math.max(1, wks / 4);
        const absent  = Number(m.absent)     || 0;
        const rg      = Number(m.rg)         || 0;
        const vis     = Number(m.visitors)   || 0;
        const oto     = Number(m.one_to_one) || 0;
        const ceu     = Number(m.ceu)        || 0;
        const tyfcb   = Number(m.tyfcb_thb)  || 0;

        type FA = { icon: string; cat: string; action: string; gain: number; curVal: string; tgtVal: string };
        const fastestActions: FA[] = [];
        if (cats) {
          if (cats.absent   < 15) fastestActions.push({ icon: '📅', cat: 'ลดการขาด',    gain: 5,                     action: 'ลดการขาดประชุม',                   curVal: `ขาด ${absent} ครั้ง`,                          tgtVal: 'ขาด 0 ครั้ง' });
          if (cats.ref      < 15) fastestActions.push({ icon: '💡', cat: 'Referral',     gain: cats.ref === 0 ? 10 : 5, action: 'ให้ Referral เพิ่มขึ้น',            curVal: `${(rg / wks).toFixed(1)} ใบ/สัปดาห์`,         tgtVal: cats.ref === 0 ? '1 ใบ/สัปดาห์' : '2 ใบ/สัปดาห์' });
          if (cats.visitor  < 20) fastestActions.push({ icon: '👥', cat: 'Visitor',      gain: 10,                    action: 'พาคนนอกมาเยี่ยม Chapter',           curVal: `${vis} คน (${(vis / mos).toFixed(1)}/เดือน)`, tgtVal: '≥1 คน/เดือน' });
          if (cats.one21    < 15) fastestActions.push({ icon: '🤝', cat: '1-2-1',        gain: 5,                     action: 'เพิ่มการนัด 1-2-1',                   curVal: `${(oto / wks).toFixed(1)} ครั้ง/สัปดาห์`,     tgtVal: '1 ครั้ง/สัปดาห์' });
          if (cats.training < 20) fastestActions.push({ icon: '📚', cat: 'CEU/Training', gain: 5,                     action: 'เข้าร่วม Training / CEU เพิ่ม',       curVal: `${ceu} CEU`,                                   tgtVal: '4+ CEU' });
          if (cats.tyfcb    < 15) fastestActions.push({ icon: '💰', cat: 'TYFCB',        gain: 5,                     action: 'เพิ่ม Closed Business',               curVal: `฿${fmtThb(tyfcb)}`,                           tgtVal: '฿500K' });
          fastestActions.sort((a, b) => b.gain - a.gain);
          fastestActions.splice(4);
        }

        const nextTl = score >= 50 ? 'green' : 'yellow';
        const needed = score >= 70 ? 0 : score >= 50 ? 70 - score : score >= 30 ? 50 - score : 30 - score;

        return {
          name: m.name, nick: m.nickname, mentor: m.mentor_team, score, bniTl, bniScore: score,
          coreIssue: m.open_core_issue || null, noData: score === 0,
          fastTrack: {
            score: { tl: bniTl, total: score, absent: cats?.absent ?? 0, ref: cats?.ref ?? 0, tyfcb: cats?.tyfcb ?? 0, visitor: cats?.visitor ?? 0, one21: cats?.one21 ?? 0, training: cats?.training ?? 0 },
            nextTl, needed, fastestActions, gaps: fastestActions,
          },
          palms: m.palms_detail,
        };
      });
      return jsonResponse({ ok: true, guides });
    }

    case 'getCurrentMonth': {
      const { data } = await db.from('settings').select('value').eq('key', 'CURRENT_MONTH').single();
      return jsonResponse({ ok: true, month: (data as Record<string, unknown>)?.value || '' });
    }

    case 'setCurrentMonth': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);
      const month = String(p.month || '').trim();
      if (!month) return errResponse('month required');
      await db.from('settings').upsert({ key: 'CURRENT_MONTH', value: month });
      return jsonResponse({ ok: true });
    }

    case 'verifyScoring':
      return jsonResponse({ ok: true, results: [] });

    case 'getChapterTrend': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const { data: scores, error: sErr } = await db
        .from('monthly_scores')
        .select('score, year, month')
        .order('year', { ascending: true })
        .order('month', { ascending: true });
      if (sErr) return errResponse(sErr.message);

      // Group by year+month, bucket by score tier
      const grouped: Record<string, { green: number; yellow: number; red: number; black: number; scoreSum: number; total: number }> = {};
      const keyOrder: string[] = [];
      for (const s of (scores || []) as Record<string, unknown>[]) {
        const yr = Number(s.year), mo = Number(s.month), sc = Number(s.score) || 0;
        const key = `${yr}-${String(mo).padStart(2,'0')}`;
        if (!grouped[key]) { grouped[key] = { green:0, yellow:0, red:0, black:0, scoreSum:0, total:0 }; keyOrder.push(key); }
        const g = grouped[key];
        g.total++; g.scoreSum += sc;
        if (sc >= 70) g.green++; else if (sc >= 50) g.yellow++; else if (sc >= 30) g.red++; else g.black++;
      }
      const trend = keyOrder.map(key => {
        const [yr, mo] = key.split('-').map(Number);
        const g = grouped[key];
        return { month: MONTH_LABELS[mo] || String(mo), year: yr, green: g.green, yellow: g.yellow, red: g.red, black: g.black, avg: g.total > 0 ? Math.round(g.scoreSum / g.total) : 0 };
      });
      return jsonResponse({ ok: true, trend });
    }

    default:
      return errResponse(`Unknown dashboard action: ${action}`);
  }
}

// Handler: Member Success Blueprint (MSB) MVP v1.0
// Isolated annual business planning module. Does not duplicate member-owned
// profile/team/performance data; dashboard rows join from existing members.
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';
import { sha256Hex } from '../../_shared/line.ts';

type Db = ReturnType<typeof getServiceClient>;

const DASHBOARD_ROLES = ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp', 'growth'];
const LINK_MANAGER_ROLES = ['mc', 'growth'];
const MSB_FORM_URL = (Deno.env.get('MSB_FORM_URL') || 'https://bni-mentor-system.vercel.app/member-success-blueprint').replace(/\/$/, '');

function num(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/[,฿\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function txt(value: unknown): string {
  return String(value ?? '').trim();
}

function arr(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(v => txt(v)).filter(Boolean);
}

function ceilSafe(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0;
}

function calculate(input: Record<string, unknown>) {
  const totalSales = num(input.total_sales_target_year);
  const bniSales = num(input.expected_sales_from_bni_year);
  const avgCustomer = num(input.average_customer_value_year);
  const conversion = num(input.conversion_rate_percent);
  const customerNeeded = ceilSafe(bniSales / avgCustomer);
  const referralNeeded = conversion > 0 ? ceilSafe(customerNeeded / (conversion / 100)) : 0;
  return {
    bni_contribution_percent: totalSales > 0 ? (bniSales / totalSales) * 100 : 0,
    customer_needed: customerNeeded,
    referral_needed: referralNeeded,
    referral_per_month: referralNeeded / 12,
    referral_per_week: referralNeeded / 52,
    calculated_at: new Date().toISOString(),
  };
}

function validate(input: Record<string, unknown>): string | null {
  if (num(input.total_sales_target_year) <= 0) return 'กรุณาระบุเป้ายอดขายรวมทั้งปี';
  if (num(input.expected_sales_from_bni_year) <= 0) return 'กรุณาระบุยอดขายที่คาดหวังจาก BNI';
  if (num(input.expected_sales_from_bni_year) > num(input.total_sales_target_year)) {
    return 'ยอดขายที่คาดหวังจาก BNI ไม่ควรมากกว่าเป้ายอดขายรวมทั้งปี';
  }
  if (num(input.average_customer_value_year) <= 0) return 'กรุณาระบุมูลค่าลูกค้าเฉลี่ยต่อปี';
  const conversion = num(input.conversion_rate_percent);
  if (conversion <= 0 || conversion > 100) return 'Conversion rate ต้องมากกว่า 0 และไม่เกิน 100';
  if (arr(input.looking_for_categories).length === 0) return 'กรุณาเลือกกลุ่มคนที่กำลังมองหา';
  if (!txt(input.looking_for_detail)) return 'กรุณาระบุรายละเอียดคนที่กำลังมองหา';
  if (arr(input.power_team_categories).length === 0) return 'กรุณาเลือกหมวด Power Team';
  if (!txt(input.power_team_detail)) return 'กรุณาระบุรายละเอียด Power Team';
  if (!txt(input.personal_goal_category)) return 'กรุณาเลือก Personal Goal';
  return null;
}

function buildWarnings(row: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  const calc = calculate(row);
  if (calc.referral_needed > 100) warnings.push('เป้านี้อาจต้องใช้ Referral มากกว่า 100 ใบ/ปี');
  if (num(row.conversion_rate_percent) < 10) warnings.push('Conversion rate ต่ำกว่า 10% ควรเพิ่มคุณภาพ Referral หรือระบบ Follow-up');
  if (calc.bni_contribution_percent > 50) warnings.push('สัดส่วนยอดขายจาก BNI สูงกว่า 50% ควรบริหารความเสี่ยงช่องทางรายได้');
  const existingNew = num(row.existing_customer_revenue_from_bni) + num(row.new_customer_revenue_from_bni);
  const expected = num(row.expected_sales_from_bni_year);
  if (existingNew > 0 && expected > 0 && Math.abs(existingNew - expected) / expected > 0.1) {
    warnings.push('ยอด Existing + New ยังไม่ใกล้เคียงยอดขายที่คาดหวังจาก BNI');
  }
  return warnings;
}

function roleCanSeeAll(auth: Awaited<ReturnType<typeof requireAuth>>): boolean {
  return Boolean(auth.isMC || String(auth.role) === 'growth');
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    no_plan: 'ยังไม่ได้กรอก Blueprint',
    no_actual_data: 'ยังไม่มีข้อมูล Actual',
    on_track: 'On Track',
    behind: 'Behind',
    critical: 'Critical',
  };
  return map[status] || status || '—';
}

function supportSuggestion(row: Record<string, unknown>): string {
  const status = txt(row.intelligence_status);
  if (status === 'no_plan') return 'ยังไม่ได้กรอก Blueprint';

  const referralGap = num(row.referral_gap);
  const referralNeeded = num(row.referral_needed);
  const revenueProgress = num(row.revenue_progress_percent);
  const rg = num(row.rg);
  const rr = num(row.rr);
  const bniContribution = num(row.bni_contribution_percent);
  const conversion = num(row.conversion_rate_percent);
  const powerCats = arr(row.power_team_categories);

  if (referralNeeded > 0 && referralGap >= Math.max(5, referralNeeded * 0.4)) {
    return 'ช่วยปรับ Looking For และ Referral Trigger';
  }
  if (revenueProgress < 40 && rg >= Math.max(5, rr * 1.5)) {
    return 'ให้เยอะแต่รับต่ำ ควรช่วยเรื่อง Weekly Presentation / Referral Trigger';
  }
  if (rg <= 2 && rr <= 2) {
    return 'ควรเริ่มจาก Visibility, 1-2-1 และ Power Team';
  }
  if (bniContribution > 50) {
    return 'เป้าจาก BNI สูง ควรมี Power Team ชัดเจน';
  }
  if (conversion > 0 && conversion < 10) {
    return 'Conversion ต่ำ ควรโฟกัสคุณภาพ Referral';
  }
  if (powerCats.length === 0) {
    return 'ควรระบุ Power Team ที่ต้องการ';
  }
  if (status === 'on_track') return 'กำลังไปได้ดี รักษา rhythm และเพิ่ม 1-2-1 คุณภาพ';
  if (status === 'behind') return 'ควรวาง action 30 วันเพื่อปิด gap ที่ใหญ่ที่สุด';
  if (status === 'critical') return 'ควรให้ Mentor/Growth ช่วยจับคู่และทบทวนเป้าทันที';
  return 'ติดตามต่อเนื่องและช่วยให้แผนชัดขึ้น';
}

function mapPlanRow(row: Record<string, unknown>) {
  return {
    memberId: row.member_id,
    name: row.name,
    nickname: row.nickname,
    profession: row.profession,
    companyName: row.company_name,
    mentorTeam: row.mentor_team,
    blueprintYear: row.blueprint_year,
    blueprintStatus: row.blueprint_status || (row.blueprint_id ? 'draft' : 'missing'),
    msbGoal: num(row.expected_sales_from_bni_year),
    totalSalesTargetYear: num(row.total_sales_target_year),
    actualReceived: num(row.actual_received_thb ?? row.received_thb),
    palmsTyfcb: num(row.tyfcb_thb),
    growthReceived: num(row.growth_received_thb),
    revenueProgressPercent: num(row.revenue_progress_percent),
    revenueGap: num(row.revenue_gap),
    customerNeeded: num(row.customer_needed),
    referralNeeded: num(row.referral_needed),
    referralReceived: num(row.rr),
    referralProgressPercent: num(row.referral_progress_percent),
    referralGap: num(row.referral_gap),
    referralPerWeek: num(row.referral_per_week),
    estimatedActualReferralPerWeek: num(row.estimated_actual_referral_per_week),
    referralWeekGap: num(row.referral_week_gap),
    trafficLight: row.traffic_light,
    latestMonthlyScore: row.latest_monthly_score,
    rg: num(row.rg),
    rr: num(row.rr),
    visitors: num(row.visitors),
    oneToOne: num(row.one_to_one),
    ceu: num(row.ceu),
    conversionRatePercent: num(row.conversion_rate_percent),
    bniContributionPercent: num(row.bni_contribution_percent),
    lookingForCategories: arr(row.looking_for_categories),
    lookingForDetail: row.looking_for_detail,
    powerTeamCategories: arr(row.power_team_categories),
    powerTeamDetail: row.power_team_detail,
    personalGoalCategory: row.personal_goal_category,
    personalGoalDetail: row.personal_goal_detail,
    status: row.intelligence_status,
    statusLabel: statusLabel(txt(row.intelligence_status)),
    suggestedSupport: supportSuggestion(row),
    r2ySyncedAt: row.r2y_synced_at,
  };
}

async function fetchPlanRows(
  db: Db,
  auth: Awaited<ReturnType<typeof requireAuth>>,
  year: number,
  memberId?: string,
) {
  let q = db
    .from('v_msb_plan_vs_actual')
    .select('*')
    .eq('blueprint_year', year)
    .order('mentor_team')
    .order('name');
  if (memberId) q = q.eq('member_id', memberId);
  if (!roleCanSeeAll(auth) && auth.teamName) q = q.eq('mentor_team', auth.teamName);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data || []) as Record<string, unknown>[]).map(mapPlanRow);
}

function topCountsFromRows(rows: ReturnType<typeof mapPlanRow>[], field: 'lookingForCategories' | 'powerTeamCategories') {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const item of (row[field] || [])) counts[item] = (counts[item] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));
}

function statusCountsFromRows(rows: ReturnType<typeof mapPlanRow>[]) {
  const counts: Record<string, number> = { no_plan: 0, no_actual_data: 0, on_track: 0, behind: 0, critical: 0 };
  for (const row of rows) counts[String(row.status || 'no_plan')] = (counts[String(row.status || 'no_plan')] || 0) + 1;
  return counts;
}

function supportRadar(rows: ReturnType<typeof mapPlanRow>[]) {
  const mk = (
    row: ReturnType<typeof mapPlanRow>,
    lane: string,
    reason: string,
    nextAction: string,
    priority: number,
  ) => ({
    memberId: row.memberId,
    name: row.name,
    nickname: row.nickname,
    mentorTeam: row.mentorTeam,
    profession: row.profession,
    companyName: row.companyName,
    trafficLight: row.trafficLight,
    score: row.latestMonthlyScore,
    status: row.status,
    statusLabel: row.statusLabel,
    msbGoal: row.msbGoal,
    actualReceived: row.actualReceived,
    revenueProgressPercent: row.revenueProgressPercent,
    revenueGap: row.revenueGap,
    referralNeeded: row.referralNeeded,
    referralReceived: row.referralReceived,
    referralGap: row.referralGap,
    lookingForCategories: row.lookingForCategories,
    powerTeamCategories: row.powerTeamCategories,
    suggestedSupport: row.suggestedSupport,
    lane,
    reason,
    nextAction,
    priority,
  });

  const urgent: ReturnType<typeof mk>[] = [];
  const growth: ReturnType<typeof mk>[] = [];
  const matching: ReturnType<typeof mk>[] = [];
  const dataQuality: ReturnType<typeof mk>[] = [];

  for (const row of rows) {
    const hasPlan = row.blueprintStatus && row.blueprintStatus !== 'missing';
    const hasProfession = Boolean(txt(row.profession) || txt(row.companyName));
    const hasLookingFor = row.lookingForCategories.length > 0 || txt(row.lookingForDetail).length > 0;
    const hasPowerTeam = row.powerTeamCategories.length > 0 || txt(row.powerTeamDetail).length > 0;
    const highReferralGap = row.referralNeeded > 0 && row.referralGap >= Math.max(5, row.referralNeeded * 0.4);
    const highRevenueGap = row.msbGoal > 0 && row.revenueGap >= Math.max(100000, row.msbGoal * 0.5);

    if (!hasPlan) {
      urgent.push(mk(row, 'urgent', 'ยังไม่ได้กรอก MSB Blueprint', 'ส่งลิงก์ Goal และให้ Mentor ช่วยกรอกให้จบในสัปดาห์นี้', 95));
    } else if (row.status === 'critical' || highReferralGap || highRevenueGap) {
      urgent.push(mk(row, 'urgent', row.status === 'critical' ? 'Plan vs Actual อยู่ในระดับ Critical' : 'Gap ระหว่างแผนกับผลงานจริงค่อนข้างสูง', row.suggestedSupport || 'นัดคุย 15 นาทีเพื่อเลือก action ที่เร็วที่สุด', 90));
    }

    if (hasPlan && (row.status === 'behind' || row.bniContributionPercent > 50 || row.referralNeeded > 100 || (row.conversionRatePercent > 0 && row.conversionRatePercent < 10))) {
      growth.push(mk(row, 'growth', row.suggestedSupport || 'มีสัญญาณที่ Growth ควรช่วยออกแบบแผน 30 วัน', 'ให้ Growth ช่วยปรับกลุ่มลูกค้า / Power Team / Referral Trigger', 75));
    }

    if (hasPlan && hasLookingFor && hasPowerTeam) {
      matching.push(mk(row, 'matching', 'มี Looking For และ Power Team พร้อมสำหรับจับคู่', 'ให้ Growth จับคู่ 1-2-1 หรือสร้าง mini power circle', 65));
    } else if (hasPlan && hasLookingFor) {
      matching.push(mk(row, 'matching', 'มี Looking For แล้ว แต่ Power Team ยังไม่ชัด', 'ช่วยเลือก Power Team 2–3 อาชีพที่น่าคุยก่อน', 55));
    }

    if (!hasProfession) {
      dataQuality.push(mk(row, 'data_quality', 'ยังไม่มีข้อมูลอาชีพ/บริษัทจาก roster', 'อัปเดต profession/company_name เพื่อให้ Matching แม่นขึ้น', 70));
    } else if (hasPlan && (!hasLookingFor || !hasPowerTeam)) {
      dataQuality.push(mk(row, 'data_quality', !hasLookingFor ? 'Blueprint ยังขาด Looking For ที่ชัด' : 'Blueprint ยังขาด Power Team ที่ชัด', 'ให้ Mentor ช่วยถามเพิ่มว่า “ลูกค้าคนไหนที่อยากให้เพื่อนมองหา?”', 60));
    }
  }

  const sortTake = (items: ReturnType<typeof mk>[], limit: number) =>
    items
      .sort((a, b) => b.priority - a.priority || num(b.revenueGap) - num(a.revenueGap) || num(b.referralGap) - num(a.referralGap))
      .slice(0, limit);

  const noProfession = rows.filter(r => !txt(r.profession) && !txt(r.companyName)).length;
  const readyToMatch = rows.filter(r =>
    r.blueprintStatus !== 'missing' &&
    (r.lookingForCategories.length > 0 || txt(r.lookingForDetail)) &&
    (r.powerTeamCategories.length > 0 || txt(r.powerTeamDetail))
  ).length;

  return {
    summary: {
      totalMembers: rows.length,
      urgentCount: urgent.length,
      growthActionCount: growth.length,
      matchingReadyCount: readyToMatch,
      dataQualityCount: dataQuality.length,
      professionCoveragePercent: rows.length ? Math.round(((rows.length - noProfession) / rows.length) * 100) : 0,
    },
    lanes: {
      urgent: sortTake(urgent, 12),
      growth: sortTake(growth, 12),
      matching: sortTake(matching, 12),
      dataQuality: sortTake(dataQuality, 12),
    },
  };
}

function matchTokens(value: string): string[] {
  const normalized = value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[/|,;()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const raw = normalized.split(' ').map(s => s.trim()).filter(s => s.length >= 2);
  const compact = normalized.replace(/[^a-z0-9\u0E00-\u0E7F]+/g, '');
  return Array.from(new Set([...raw, compact].filter(Boolean)));
}

function expandedNeedTerms(value: string): string[] {
  const base = matchTokens(value);
  const key = base.join(' ');
  const related: string[] = [];
  const add = (terms: string[]) => related.push(...terms);
  if (/real|estate|อสัง|บ้าน|property/.test(key)) add(['loan', 'สินเชื่อ', 'insurance', 'ประกัน', 'legal', 'กฎหมาย', 'interior', 'ตกแต่ง', 'construction', 'รับเหมา']);
  if (/hr|people|human|ทรัพยากร|พนักงาน/.test(key)) add(['insurance', 'ประกันกลุ่ม', 'payroll', 'training', 'health', 'legal', 'labor']);
  if (/finance|account|บัญชี|การเงิน|tax/.test(key)) add(['legal', 'insurance', 'business', 'owner', 'sme', 'audit', 'tax']);
  if (/health|wellness|สุขภาพ|clinic|medical/.test(key)) add(['hr', 'corporate', 'insurance', 'wellness', 'fitness', 'employee']);
  if (/marketing|media|brand|digital|it|website|content/.test(key)) add(['sme', 'owner', 'business', 'website', 'ads', 'video', 'branding']);
  if (/retail|f&b|restaurant|cafe|hospitality|โรงแรม|อาหาร/.test(key)) add(['marketing', 'real estate', 'accounting', 'supplier', 'event', 'media']);
  return Array.from(new Set([...base, ...related.map(t => t.toLowerCase())].filter(Boolean)));
}

function textMatchScore(need: string, candidateText: string): { score: number; hits: string[] } {
  const terms = expandedNeedTerms(need).filter(t => t.length >= 2);
  const hay = ` ${candidateText.toLowerCase()} `;
  const hayCompact = hay.replace(/[^a-z0-9\u0E00-\u0E7F]+/g, '');
  const hits: string[] = [];
  for (const term of terms) {
    const compact = term.replace(/[^a-z0-9\u0E00-\u0E7F]+/g, '');
    if (!compact) continue;
    if (hay.includes(` ${term} `) || hayCompact.includes(compact) || compact.includes(hayCompact.trim())) {
      hits.push(term);
    }
  }
  return { score: Math.min(30, hits.length * 10), hits: Array.from(new Set(hits)).slice(0, 4) };
}

function buildPairMatching(rows: ReturnType<typeof mapPlanRow>[]) {
  const eligible = rows.filter(r => r.blueprintStatus !== 'missing');
  const makePair = (
    source: ReturnType<typeof mapPlanRow>,
    target: ReturnType<typeof mapPlanRow>,
    score: number,
    reasons: string[],
    matchedTerms: string[],
  ) => ({
    source: {
      memberId: source.memberId,
      name: source.name,
      nickname: source.nickname,
      mentorTeam: source.mentorTeam,
      profession: source.profession,
      companyName: source.companyName,
      lookingForCategories: source.lookingForCategories,
      powerTeamCategories: source.powerTeamCategories,
    },
    target: {
      memberId: target.memberId,
      name: target.name,
      nickname: target.nickname,
      mentorTeam: target.mentorTeam,
      profession: target.profession,
      companyName: target.companyName,
      trafficLight: target.trafficLight,
    },
    score: Math.min(100, Math.round(score)),
    confidence: score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low',
    reasons: Array.from(new Set(reasons)).slice(0, 4),
    matchedTerms: Array.from(new Set(matchedTerms)).slice(0, 6),
    suggestedAgenda: [
      `ให้ ${txt(source.nickname || source.name)} เล่า Looking For ที่ต้องการให้ชัดใน 30 วินาที`,
      `ให้ ${txt(target.nickname || target.name)} ช่วยคิดว่าใน network มีใครใกล้เคียงหรือไม่`,
      'จบด้วย next step: นัด follow-up / ขอ intro / ปรับ referral trigger',
    ],
  });

  const pairs: ReturnType<typeof makePair>[] = [];
  for (const source of eligible) {
    const needs = [
      ...source.lookingForCategories,
      ...source.powerTeamCategories,
      txt(source.lookingForDetail),
      txt(source.powerTeamDetail),
    ].filter(Boolean);
    if (!needs.length) continue;
    for (const target of rows) {
      if (target.memberId === source.memberId) continue;
      const targetText = [
        target.profession,
        target.companyName,
        target.mentorTeam,
        ...target.lookingForCategories,
        ...target.powerTeamCategories,
        target.lookingForDetail,
        target.powerTeamDetail,
      ].map(v => txt(v)).filter(Boolean).join(' ');
      if (!targetText) continue;

      let score = 0;
      const reasons: string[] = [];
      const hits: string[] = [];
      for (const need of needs) {
        const m = textMatchScore(need, targetText);
        if (m.score > 0) {
          score += m.score;
          hits.push(...m.hits);
          if (txt(target.profession) || txt(target.companyName)) reasons.push('อาชีพ/บริษัทของคู่สนทนาใกล้กับสิ่งที่สมาชิกกำลังมองหา');
        }
      }
      const sourceCats = new Set([...source.lookingForCategories, ...source.powerTeamCategories].map(s => normalizeCategoryKey(s)));
      const targetCats = [...target.lookingForCategories, ...target.powerTeamCategories].map(s => normalizeCategoryKey(s)).filter(Boolean);
      const overlap = targetCats.filter(c => sourceCats.has(c));
      if (overlap.length) {
        score += Math.min(25, overlap.length * 12);
        reasons.push('มีหมวด Looking For / Power Team ที่ตรงกัน');
        hits.push(...overlap);
      }
      if (source.mentorTeam && target.mentorTeam && source.mentorTeam !== target.mentorTeam) {
        score += 8;
        reasons.push('ข้ามทีม Mentor ช่วยเพิ่ม network ใหม่');
      }
      if (target.trafficLight === 'green') {
        score += 5;
        reasons.push('คู่สนทนาอยู่ Green Zone มี rhythm การทำ BNI ดี');
      }
      if (score >= 25) pairs.push(makePair(source, target, score, reasons.length ? reasons : ['ข้อมูลมีความใกล้เคียงพอสำหรับลองนัด 1-2-1'], hits));
    }
  }

  const byPair: Record<string, ReturnType<typeof makePair>> = {};
  for (const pair of pairs) {
    const key = `${pair.source.memberId}:${pair.target.memberId}`;
    if (!byPair[key] || byPair[key].score < pair.score) byPair[key] = pair;
  }
  const deduped = Object.values(byPair)
    .sort((a, b) => b.score - a.score)
    .slice(0, 24);
  return {
    summary: {
      pairCount: deduped.length,
      highConfidence: deduped.filter(p => p.confidence === 'high').length,
      mediumConfidence: deduped.filter(p => p.confidence === 'medium').length,
      membersWithPlan: eligible.length,
    },
    pairs: deduped,
  };
}

async function buildFollowUpQueue(db: Db, auth: Awaited<ReturnType<typeof requireAuth>>) {
  const canSeeAll = roleCanSeeAll(auth);
  const role = txt(auth.role).toLowerCase();
  const teamName = txt(auth.teamName);
  const now = Date.now();
  const dayMs = 86400000;

  let issueQuery = db.from('core_issues')
    .select('id, member_id, mentor_team, issue_text, action_plan, action_taken, follow_up_at, opened_at, updated_at')
    .eq('status', 'open')
    .order('follow_up_at', { ascending: true, nullsFirst: false })
    .order('opened_at', { ascending: true });
  if (!canSeeAll && teamName) issueQuery = issueQuery.eq('mentor_team', teamName);
  const { data: issueRows, error: issueErr } = await issueQuery;
  if (issueErr) throw new Error(issueErr.message);

  const memberIds = Array.from(new Set(((issueRows || []) as Record<string, unknown>[]).map(r => txt(r.member_id)).filter(Boolean)));
  const { data: memberRows } = memberIds.length
    ? await db.from('members').select('id, name, nickname, mentor_team').in('id', memberIds)
    : { data: [] };
  const memberById: Record<string, Record<string, unknown>> = {};
  for (const m of (memberRows || []) as Record<string, unknown>[]) memberById[txt(m.id)] = m;

  let taskQuery = db.from('growth_tasks')
    .select('id, assigned_to, task_text, task_type, priority, member_name, created_at, responded_at')
    .is('responded_at', null)
    .order('created_at', { ascending: true });
  if (!canSeeAll && role) taskQuery = taskQuery.eq('assigned_to', role);
  const { data: taskRows, error: taskErr } = await taskQuery;
  if (taskErr) throw new Error(taskErr.message);

  const items: Record<string, unknown>[] = [];

  for (const row of (issueRows || []) as Record<string, unknown>[]) {
    const openedAt = txt(row.opened_at);
    const followUpAt = txt(row.follow_up_at);
    const ageDays = openedAt ? Math.floor((now - new Date(openedAt).getTime()) / dayMs) : 0;
    const dueDays = followUpAt ? Math.floor((new Date(followUpAt).getTime() - now) / dayMs) : null;
    const member = memberById[txt(row.member_id)] || {};
    const overdue = dueDays !== null ? dueDays < 0 : ageDays >= 14;
    const dueSoon = dueDays !== null ? dueDays <= 3 : ageDays >= 10;
    items.push({
      id: row.id,
      type: 'core_issue',
      icon: '📋',
      title: txt(row.issue_text) || 'Core Issue',
      detail: txt(row.action_plan || row.action_taken),
      memberName: txt(member.name),
      nickname: txt(member.nickname),
      team: txt(row.mentor_team),
      followUpAt,
      createdAt: openedAt,
      ageDays,
      dueDays,
      level: overdue ? 'overdue' : dueSoon ? 'due_soon' : 'open',
      sortKey: overdue ? 1000 + ageDays : dueSoon ? 500 + ageDays : ageDays,
      canClose: Boolean(auth.isMC),
    });
  }

  for (const row of (taskRows || []) as Record<string, unknown>[]) {
    const createdAt = txt(row.created_at);
    const ageDays = createdAt ? Math.floor((now - new Date(createdAt).getTime()) / dayMs) : 0;
    const overdue = ageDays >= 7;
    const dueSoon = ageDays >= 3;
    items.push({
      id: row.id,
      type: 'growth_task',
      icon: txt(row.priority) || '🎯',
      title: txt(row.task_type) || 'Growth Task',
      detail: txt(row.task_text),
      memberName: txt(row.member_name),
      nickname: '',
      team: txt(row.assigned_to).toUpperCase(),
      followUpAt: '',
      createdAt,
      ageDays,
      dueDays: null,
      level: overdue ? 'overdue' : dueSoon ? 'due_soon' : 'open',
      sortKey: overdue ? 900 + ageDays : dueSoon ? 450 + ageDays : ageDays,
      canClose: true,
    });
  }

  items.sort((a, b) => num(b.sortKey) - num(a.sortKey));
  return {
    summary: {
      totalOpen: items.length,
      overdue: items.filter(i => i.level === 'overdue').length,
      dueSoon: items.filter(i => i.level === 'due_soon').length,
      coreIssues: items.filter(i => i.type === 'core_issue').length,
      growthTasks: items.filter(i => i.type === 'growth_task').length,
    },
    items: items.slice(0, 30),
  };
}

function normalizeCategoryKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, '')
    .trim();
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function newAccessToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function defaultExpiresAt(year: number): string {
  return new Date(`${year}-12-31T23:59:59+07:00`).toISOString();
}

function msbLink(token: string): string {
  return `${MSB_FORM_URL}?t=${encodeURIComponent(token)}`;
}

async function resolveLineMember(db: Db, accessToken: string): Promise<{
  memberId?: string;
  member?: Record<string, unknown>;
  blueprintYear?: number;
  error?: string;
}> {
  if (!accessToken) return { error: 'LINE access token required' };
  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) return { error: 'LINE session ไม่ถูกต้องหรือหมดอายุ' };
  const profile = await profileRes.json() as Record<string, unknown>;
  const userId = String(profile.userId || '');
  if (!userId) return { error: 'ไม่พบ LINE userId' };
  const { data, error } = await db.from('line_members')
    .select('member_id, members(id, name, nickname, mentor_team, email, bni_goal)')
    .eq('line_user_id', userId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'บัญชี LINE นี้ยังไม่ได้เชื่อมกับสมาชิก' };
  const rec = data as Record<string, unknown>;
  return {
    memberId: String(rec.member_id || ''),
    member: (rec.members || {}) as Record<string, unknown>,
  };
}

async function resolveBlueprintToken(db: Db, token: string): Promise<{
  memberId?: string;
  member?: Record<string, unknown>;
  blueprintYear?: number;
  error?: string;
}> {
  const raw = txt(token);
  if (!raw) return { error: 'Blueprint token required' };
  const tokenHash = await sha256Hex(raw);
  const { data, error } = await db.from('member_success_blueprint_tokens')
    .select('id, member_id, expires_at, revoked_at, members(id, name, nickname, mentor_team, email, bni_goal)')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'ลิงก์นี้ไม่ถูกต้องหรือหมดอายุ' };
  const rec = data as Record<string, unknown>;
  if (rec.revoked_at) return { error: 'ลิงก์นี้ถูกยกเลิกแล้ว' };
  if (new Date(String(rec.expires_at)).getTime() < Date.now()) return { error: 'ลิงก์นี้หมดอายุแล้ว กรุณาพิมพ์ Goal ใน LINE เพื่อขอลิงก์ใหม่' };
  await db.from('member_success_blueprint_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', String(rec.id));
  return {
    memberId: String(rec.member_id || ''),
    member: (rec.members || {}) as Record<string, unknown>,
  };
}

async function resolveWebAccessToken(db: Db, token: string): Promise<{
  memberId?: string;
  member?: Record<string, unknown>;
  blueprintYear?: number;
  tokenId?: string;
  error?: string;
}> {
  const raw = txt(token);
  if (!raw) return { error: 'กรุณาเปิดจากลิงก์ส่วนตัวของคุณ' };
  const { data, error } = await db.from('msb_access_tokens')
    .select('id, member_id, blueprint_year, expires_at, members(id, name, nickname, mentor_team, email, bni_goal)')
    .eq('token', raw)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'ลิงก์นี้ไม่ถูกต้อง กรุณาขอลิงก์ใหม่จาก MC หรือ Growth' };
  const rec = data as Record<string, unknown>;
  const expiresAt = rec.expires_at ? new Date(String(rec.expires_at)).getTime() : null;
  if (expiresAt && expiresAt < Date.now()) {
    return { error: 'ลิงก์นี้หมดอายุแล้ว กรุณาขอลิงก์ใหม่จาก MC หรือ Growth' };
  }
  await db.from('msb_access_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', String(rec.id));
  return {
    memberId: String(rec.member_id || ''),
    member: (rec.members || {}) as Record<string, unknown>,
    blueprintYear: Number(rec.blueprint_year || new Date().getFullYear()),
    tokenId: String(rec.id || ''),
  };
}

async function resolveMemberIdentity(db: Db, p: Record<string, unknown>) {
  const blueprintToken = String(p.blueprintToken || p.msbToken || p.token || '').trim();
  if (blueprintToken) return await resolveBlueprintToken(db, blueprintToken);
  const accessToken = String(p.lineAccessToken || p.accessToken || '');
  return await resolveLineMember(db, accessToken);
}

async function getBlueprint(db: Db, memberId: string, year: number) {
  const { data, error } = await db
    .from('member_success_blueprints')
    .select('*')
    .eq('member_id', memberId)
    .eq('blueprint_year', year)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

function normalizeBlueprint(row: Record<string, unknown> | null) {
  if (!row) return null;
  return { ...row, warnings: buildWarnings(row) };
}

async function saveBlueprintForMember(db: Db, memberId: string, year: number, p: Record<string, unknown>) {
  const error = validate(p);
  if (error) return { error, status: 400 };
  const calculated = calculate(p);
  const payload = {
    member_id: memberId,
    blueprint_year: year,
    total_sales_target_year: num(p.total_sales_target_year),
    expected_sales_from_bni_year: num(p.expected_sales_from_bni_year),
    existing_customer_revenue_from_bni: num(p.existing_customer_revenue_from_bni),
    new_customer_revenue_from_bni: num(p.new_customer_revenue_from_bni),
    average_customer_value_year: num(p.average_customer_value_year),
    conversion_rate_percent: num(p.conversion_rate_percent),
    ...calculated,
    looking_for_categories: arr(p.looking_for_categories),
    looking_for_detail: txt(p.looking_for_detail),
    power_team_categories: arr(p.power_team_categories),
    power_team_detail: txt(p.power_team_detail),
    personal_goal_category: txt(p.personal_goal_category),
    personal_goal_detail: txt(p.personal_goal_detail) || null,
    status: txt(p.status) === 'draft' ? 'draft' : 'submitted',
    source: 'member_form',
    updated_at: new Date().toISOString(),
  };
  const { data, error: upsertErr } = await db
    .from('member_success_blueprints')
    .upsert(payload, { onConflict: 'member_id,blueprint_year' })
    .select('*')
    .single();
  if (upsertErr) return { error: upsertErr.message, status: 400 };
  const { error: goalErr } = await db
    .from('members')
    .update({ bni_goal: payload.expected_sales_from_bni_year })
    .eq('id', memberId);
  if (goalErr) return { error: `บันทึก Blueprint แล้ว แต่ sync MSB Goal ไม่สำเร็จ: ${goalErr.message}`, status: 400 };
  return { blueprint: normalizeBlueprint(data as Record<string, unknown>) };
}

async function listDashboardRows(db: Db, auth: Awaited<ReturnType<typeof requireAuth>>, year: number) {
  let q = db
    .from('members')
    .select('id, name, nickname, mentor_team, bni_goal, is_archived')
    .eq('is_archived', false)
    .order('mentor_team')
    .order('name');
  if (!auth.isMC && String(auth.role) !== 'growth' && auth.teamName) {
    q = q.eq('mentor_team', auth.teamName);
  }
  const { data: members, error: memErr } = await q;
  if (memErr) throw new Error(memErr.message);
  const memberRows = (members || []) as Record<string, unknown>[];
  const memberIds = memberRows.map(m => String(m.id)).filter(Boolean);

  const { data: blueprints, error: bpErr } = memberIds.length
    ? await db.from('member_success_blueprints').select('*').eq('blueprint_year', year).in('member_id', memberIds)
    : { data: [], error: null };
  if (bpErr) throw new Error(bpErr.message);

  const { data: tokens, error: tokErr } = memberIds.length
    ? await db.from('msb_access_tokens')
        .select('member_id, blueprint_year, expires_at, used_at, created_at')
        .eq('blueprint_year', year)
        .in('member_id', memberIds)
    : { data: [], error: null };
  if (tokErr) throw new Error(tokErr.message);

  const bpByMember: Record<string, Record<string, unknown>> = {};
  for (const bp of (blueprints || []) as Record<string, unknown>[]) bpByMember[String(bp.member_id)] = bp;
  const tokenByMember: Record<string, Record<string, unknown>> = {};
  for (const token of (tokens || []) as Record<string, unknown>[]) tokenByMember[String(token.member_id)] = token;

  return memberRows.map(m => {
    const bp = bpByMember[String(m.id)] || null;
    const token = tokenByMember[String(m.id)] || null;
    return {
      memberId: m.id,
      name: m.name,
      nickname: m.nickname,
      mentorTeam: m.mentor_team,
      bniGoal: num(m.bni_goal),
      status: bp ? String(bp.status || 'draft') : 'missing',
      linkStatus: bp ? 'saved' : token ? 'link_created' : 'link_not_created',
      linkCreatedAt: token ? token.created_at : null,
      linkUsedAt: token ? token.used_at : null,
      linkExpiresAt: token ? token.expires_at : null,
      blueprint: normalizeBlueprint(bp),
    };
  });
}

function summarizeDashboardRows(rows: Awaited<ReturnType<typeof listDashboardRows>>) {
  const submitted = rows.filter(r => r.status === 'submitted');
  const drafts = rows.filter(r => r.status === 'draft');
  const blueprints = rows.map(r => r.blueprint).filter(Boolean) as Record<string, unknown>[];
  const totalExpectedSalesFromBni = blueprints.reduce((s, b) => s + num(b.expected_sales_from_bni_year), 0);
  const totalReferralDemand = blueprints.reduce((s, b) => s + num(b.referral_needed), 0);
  const avgConversionRate = blueprints.length
    ? blueprints.reduce((s, b) => s + num(b.conversion_rate_percent), 0) / blueprints.length
    : 0;
  const avgReferralPerWeek = blueprints.length
    ? blueprints.reduce((s, b) => s + num(b.referral_per_week), 0) / blueprints.length
    : 0;
  const countTop = (field: string) => {
    const counts: Record<string, number> = {};
    for (const b of blueprints) for (const item of arr(b[field])) counts[item] = (counts[item] || 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  };
  return {
    totalMembers: rows.length,
    submitted: submitted.length,
    drafts: drafts.length,
    missing: rows.filter(r => r.status === 'missing').length,
    completionPct: rows.length ? Math.round((submitted.length / rows.length) * 100) : 0,
    totalExpectedSalesFromBni,
    totalReferralDemand,
    avgConversionRate,
    avgReferralPerWeek,
    topLookingForCategories: countTop('looking_for_categories'),
    topPowerTeamCategories: countTop('power_team_categories'),
  };
}

function intelligenceOverviewFromRows(rows: ReturnType<typeof mapPlanRow>[]) {
  const submitted = rows.filter(r => r.blueprintStatus === 'submitted');
  const planned = rows.filter(r => r.blueprintStatus && r.blueprintStatus !== 'missing');
  const totalMgb = rows.reduce((s, r) => s + num(r.msbGoal), 0);
  const totalActualReceived = rows.reduce((s, r) => s + num(r.actualReceived), 0);
  const totalReferralNeeded = rows.reduce((s, r) => s + num(r.referralNeeded), 0);
  const totalReferralReceived = rows.reduce((s, r) => s + num(r.referralReceived), 0);
  return {
    totalMembers: rows.length,
    submittedCount: submitted.length,
    plannedCount: planned.length,
    completionPercent: rows.length ? Math.round((submitted.length / rows.length) * 100) : 0,
    totalMsbBniGoal: totalMgb,
    totalActualReceived,
    totalRevenueGap: Math.max(0, totalMgb - totalActualReceived),
    totalReferralNeeded,
    totalReferralReceived,
    totalReferralGap: Math.max(0, totalReferralNeeded - totalReferralReceived),
    topLookingForCategories: topCountsFromRows(rows, 'lookingForCategories'),
    topPowerTeamCategories: topCountsFromRows(rows, 'powerTeamCategories'),
    statusCounts: statusCountsFromRows(rows),
  };
}

function dataQualityCenterFromRows(
  dashboardRows: Awaited<ReturnType<typeof listDashboardRows>>,
  planRows: ReturnType<typeof mapPlanRow>[],
) {
  const planById = new Map(planRows.map(row => [String(row.memberId), row]));
  const issues: Array<{
    type: string;
    level: 'critical' | 'warning' | 'info';
    memberId: unknown;
    name: unknown;
    nickname: unknown;
    mentorTeam: unknown;
    title: string;
    detail: string;
    nextAction: string;
  }> = [];

  for (const row of dashboardRows) {
    const plan = planById.get(String(row.memberId));
    const bp = (row.blueprint || {}) as Record<string, unknown>;
    const hasPlan = row.status && row.status !== 'missing';
    const hasLink = row.linkStatus && row.linkStatus !== 'link_not_created';
    const looking = arr(bp.looking_for_categories);
    const power = arr(bp.power_team_categories);
    const lookingDetail = txt(bp.looking_for_detail);
    const powerDetail = txt(bp.power_team_detail);

    if (!hasLink && !hasPlan) {
      issues.push({
        type: 'missing_link',
        level: 'critical',
        memberId: row.memberId,
        name: row.name,
        nickname: row.nickname,
        mentorTeam: row.mentorTeam,
        title: 'ยังไม่ได้สร้างลิงก์ Blueprint',
        detail: 'สมาชิกยังไม่มีทางเข้ากรอก MSB Goal',
        nextAction: 'กด Copy Link แล้วส่งให้สมาชิกผ่าน LINE หรือช่องทางที่สะดวก',
      });
    } else if (!hasPlan) {
      issues.push({
        type: 'missing_blueprint',
        level: 'critical',
        memberId: row.memberId,
        name: row.name,
        nickname: row.nickname,
        mentorTeam: row.mentorTeam,
        title: 'ยังไม่ได้กรอก Blueprint',
        detail: 'มีลิงก์แล้วแต่ยังไม่บันทึกแผน',
        nextAction: 'ให้ Mentor ช่วย follow-up และนัดกรอกให้จบ',
      });
    }

    if (hasPlan && (!looking.length || lookingDetail.length < 8)) {
      issues.push({
        type: 'weak_looking_for',
        level: 'warning',
        memberId: row.memberId,
        name: row.name,
        nickname: row.nickname,
        mentorTeam: row.mentorTeam,
        title: 'Looking For ยังไม่ชัด',
        detail: 'ข้อมูลยังไม่พอให้ Growth จับคู่หรือช่วยหา referral ได้แม่น',
        nextAction: 'ถามเพิ่มว่า “ลูกค้าแบบไหนที่อยากให้เพื่อนมองหาให้?”',
      });
    }

    if (hasPlan && (!power.length || powerDetail.length < 8)) {
      issues.push({
        type: 'weak_power_team',
        level: 'warning',
        memberId: row.memberId,
        name: row.name,
        nickname: row.nickname,
        mentorTeam: row.mentorTeam,
        title: 'Power Team ยังไม่ชัด',
        detail: 'ยังไม่รู้ว่าควรจับวง 1-2-1 กับอาชีพกลุ่มไหนก่อน',
        nextAction: 'เลือก Power Team 2–3 อาชีพที่ส่ง referral ให้กันได้จริง',
      });
    }

    if (plan && !txt(plan.profession) && !txt(plan.companyName)) {
      issues.push({
        type: 'missing_profession',
        level: 'info',
        memberId: row.memberId,
        name: row.name,
        nickname: row.nickname,
        mentorTeam: row.mentorTeam,
        title: 'ยังไม่มีอาชีพ/บริษัทใน roster',
        detail: 'Pair Matching จะเดาได้ยากขึ้น',
        nextAction: 'เติม profession/company_name ตอน sync roster หรือหน้า members',
      });
    }

    if (plan && plan.msbGoal > 0 && plan.actualReceived <= 0 && plan.referralReceived <= 0) {
      issues.push({
        type: 'no_actual_signal',
        level: 'warning',
        memberId: row.memberId,
        name: row.name,
        nickname: row.nickname,
        mentorTeam: row.mentorTeam,
        title: 'มีแผนแล้ว แต่ยังไม่เห็น Actual signal',
        detail: 'ยังไม่เจอ receive หรือ referral received ในข้อมูลปัจจุบัน',
        nextAction: 'เช็ค R2Y / Traffic Light sync หรือช่วยวาง action เริ่มต้น',
      });
    }
  }

  const counts = issues.reduce<Record<string, number>>((acc, issue) => {
    acc[issue.level] = (acc[issue.level] || 0) + 1;
    acc[issue.type] = (acc[issue.type] || 0) + 1;
    return acc;
  }, {});

  return {
    summary: {
      totalIssues: issues.length,
      critical: counts.critical || 0,
      warning: counts.warning || 0,
      info: counts.info || 0,
      missingLink: counts.missing_link || 0,
      missingBlueprint: counts.missing_blueprint || 0,
      weakLookingFor: counts.weak_looking_for || 0,
      weakPowerTeam: counts.weak_power_team || 0,
      missingProfession: counts.missing_profession || 0,
      noActualSignal: counts.no_actual_signal || 0,
    },
    issues: issues
      .sort((a, b) => {
        const weight = { critical: 3, warning: 2, info: 1 };
        return weight[b.level] - weight[a.level] || txt(a.mentorTeam).localeCompare(txt(b.mentorTeam), 'th') || txt(a.name).localeCompare(txt(b.name), 'th');
      })
      .slice(0, 30),
  };
}

export async function handleMemberSuccessBlueprints(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient();
  const action = String(p.action || '');
  const year = Number(p.blueprintYear || p.blueprint_year || new Date().getFullYear());

  switch (action) {
    case 'generateMemberSuccessBlueprintLink': {
      const auth = await requireAuth(db, p, LINK_MANAGER_ROLES);
      if (!auth.ok) return errResponse(auth.error!, 403);
      const memberId = txt(p.memberId || p.member_id);
      if (!memberId) return errResponse('memberId required', 400);

      const { data: member, error: memErr } = await db.from('members')
        .select('id, name, nickname, mentor_team')
        .eq('id', memberId)
        .maybeSingle();
      if (memErr) return errResponse(memErr.message, 400);
      if (!member) return errResponse('ไม่พบสมาชิกนี้', 404);

      const now = Date.now();
      const { data: existing, error: exErr } = await db.from('msb_access_tokens')
        .select('id, token, expires_at, created_at, used_at')
        .eq('member_id', memberId)
        .eq('blueprint_year', year)
        .maybeSingle();
      if (exErr) return errResponse(exErr.message, 400);

      let token = existing ? String((existing as Record<string, unknown>).token || '') : '';
      const expiresAtExisting = existing && (existing as Record<string, unknown>).expires_at
        ? new Date(String((existing as Record<string, unknown>).expires_at)).getTime()
        : null;
      let expiresAt = existing && (existing as Record<string, unknown>).expires_at
        ? String((existing as Record<string, unknown>).expires_at)
        : defaultExpiresAt(year);
      if (!token || (expiresAtExisting && expiresAtExisting < now)) {
        token = newAccessToken();
        expiresAt = defaultExpiresAt(year);
        const payload = {
          member_id: memberId,
          token,
          blueprint_year: year,
          expires_at: expiresAt,
          used_at: existing ? (existing as Record<string, unknown>).used_at || null : null,
          created_by: `dashboard:${String(auth.role || 'unknown')}`,
          created_at: new Date().toISOString(),
        };
        const { error: upsertErr } = await db.from('msb_access_tokens')
          .upsert(payload, { onConflict: 'member_id,blueprint_year' });
        if (upsertErr) return errResponse(upsertErr.message, 400);
      }

      return jsonResponse({
        ok: true,
        link: msbLink(token),
        token,
        blueprintYear: year,
        member,
        expiresAt,
      });
    }

    case 'getMemberSuccessBlueprintByToken': {
      const identity = await resolveWebAccessToken(db, String(p.token || p.t || p.msbToken || ''));
      if (identity.error || !identity.memberId) return errResponse(identity.error || 'Unauthorized', 401);
      const tokenYear = identity.blueprintYear || year;
      const blueprint = await getBlueprint(db, identity.memberId, tokenYear);
      return jsonResponse({
        ok: true,
        member: identity.member,
        blueprint: normalizeBlueprint(blueprint),
        blueprintYear: tokenYear,
      });
    }

    case 'saveMemberSuccessBlueprintByToken': {
      const identity = await resolveWebAccessToken(db, String(p.token || p.t || p.msbToken || ''));
      if (identity.error || !identity.memberId) return errResponse(identity.error || 'Unauthorized', 401);
      const tokenYear = identity.blueprintYear || year;
      const saved = await saveBlueprintForMember(db, identity.memberId, tokenYear, p);
      if (saved.error) return errResponse(saved.error, saved.status || 400);
      return jsonResponse({ ok: true, blueprint: saved.blueprint, blueprintYear: tokenYear });
    }

    case 'getMSBCategorySuggestions': {
      const identity = await resolveWebAccessToken(db, String(p.token || p.t || p.msbToken || ''));
      if (identity.error || !identity.memberId) return errResponse(identity.error || 'Unauthorized', 401);
      const tokenYear = identity.blueprintYear || year;
      const [{ data, error }, { data: aliases, error: aliasErr }] = await Promise.all([
        db.from('v_msb_category_demand')
          .select('category_type, category')
          .eq('blueprint_year', tokenYear),
        db.from('msb_category_aliases')
          .select('category_type, canonical_category, alias'),
      ]);
      if (error) return errResponse(error.message, 400);
      if (aliasErr) return errResponse(aliasErr.message, 400);
      const aliasByKey: Record<string, string> = {};
      for (const a of (aliases || []) as Record<string, unknown>[]) {
        aliasByKey[`${txt(a.category_type)}:${normalizeCategoryKey(txt(a.alias))}`] = txt(a.canonical_category);
      }

      const buckets: Record<string, Record<string, { name: string; count: number }>> = {
        looking_for: {},
        power_team: {},
      };
      for (const row of (data || []) as Record<string, unknown>[]) {
        const type = txt(row.category_type);
        const rawCategory = txt(row.category);
        const category = aliasByKey[`${type}:${normalizeCategoryKey(rawCategory)}`] || rawCategory;
        if (!category || !buckets[type]) continue;
        const key = normalizeCategoryKey(category);
        if (!key) continue;
        if (!buckets[type][key]) buckets[type][key] = { name: category, count: 0 };
        buckets[type][key].count += 1;
      }
      const toList = (type: string) => Object.values(buckets[type] || {})
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'th'))
        .slice(0, 24);
      return jsonResponse({
        ok: true,
        blueprintYear: tokenYear,
        suggestions: {
          looking_for: toList('looking_for'),
          power_team: toList('power_team'),
        },
      });
    }

    case 'getMyMemberSuccessBlueprint': {
      const identity = await resolveMemberIdentity(db, p);
      if (identity.error || !identity.memberId) return errResponse(identity.error || 'Unauthorized', 401);
      const tokenYear = identity.blueprintYear || year;
      const blueprint = await getBlueprint(db, identity.memberId, tokenYear);
      return jsonResponse({
        ok: true,
        member: identity.member,
        blueprint: normalizeBlueprint(blueprint),
        blueprintYear: tokenYear,
      });
    }

    case 'saveMyMemberSuccessBlueprint': {
      const identity = await resolveMemberIdentity(db, p);
      if (identity.error || !identity.memberId) return errResponse(identity.error || 'Unauthorized', 401);
      const tokenYear = identity.blueprintYear || year;
      const saved = await saveBlueprintForMember(db, identity.memberId, tokenYear, p);
      if (saved.error) return errResponse(saved.error, saved.status || 400);
      return jsonResponse({ ok: true, blueprint: saved.blueprint, blueprintYear: tokenYear });
    }

    case 'getMemberSuccessBlueprintsForDashboard': {
      const auth = await requireAuth(db, p, DASHBOARD_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      const rows = await listDashboardRows(db, auth, year);
      return jsonResponse({ ok: true, rows, blueprintYear: year });
    }

    case 'getMemberSuccessBlueprintSummary': {
      const auth = await requireAuth(db, p, DASHBOARD_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      const rows = await listDashboardRows(db, auth, year);
      return jsonResponse({
        ok: true,
        blueprintYear: year,
        summary: summarizeDashboardRows(rows),
      });
    }

    case 'getMSBDashboardBundle': {
      const auth = await requireAuth(db, p, DASHBOARD_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      const [dashboardRows, planRows, followups] = await Promise.all([
        listDashboardRows(db, auth, year),
        fetchPlanRows(db, auth, year),
        buildFollowUpQueue(db, auth),
      ]);
      const summary = summarizeDashboardRows(dashboardRows);
      const overview = intelligenceOverviewFromRows(planRows);
      return jsonResponse({
        ok: true,
        blueprintYear: year,
        rows: dashboardRows,
        summary,
        overview,
        planVsActual: { rows: planRows },
        radar: supportRadar(planRows),
        matching: buildPairMatching(planRows),
        followups,
        dataQuality: dataQualityCenterFromRows(dashboardRows, planRows),
        meta: {
          bundled: true,
          generatedAt: new Date().toISOString(),
          source: 'getMSBDashboardBundle',
        },
      });
    }

    case 'getMSBIntelligenceOverview': {
      const auth = await requireAuth(db, p, DASHBOARD_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      const rows = await fetchPlanRows(db, auth, year);
      return jsonResponse({
        ok: true,
        blueprintYear: year,
        overview: intelligenceOverviewFromRows(rows),
      });
    }

    case 'getMSBPlanVsActual': {
      const auth = await requireAuth(db, p, DASHBOARD_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      const rows = await fetchPlanRows(db, auth, year);
      return jsonResponse({ ok: true, blueprintYear: year, rows });
    }

    case 'getMSBSupportRadar': {
      const auth = await requireAuth(db, p, DASHBOARD_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      const rows = await fetchPlanRows(db, auth, year);
      return jsonResponse({ ok: true, blueprintYear: year, radar: supportRadar(rows) });
    }

    case 'getMSBPairMatchingSuggestions': {
      const auth = await requireAuth(db, p, DASHBOARD_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      const rows = await fetchPlanRows(db, auth, year);
      return jsonResponse({ ok: true, blueprintYear: year, matching: buildPairMatching(rows) });
    }

    case 'getMSBFollowUpQueue': {
      const auth = await requireAuth(db, p, DASHBOARD_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      const queue = await buildFollowUpQueue(db, auth);
      return jsonResponse({ ok: true, queue });
    }

    case 'getMSBMemberIntelligence': {
      const auth = await requireAuth(db, p, DASHBOARD_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      const memberId = txt(p.memberId || p.member_id);
      if (!memberId) return errResponse('memberId required', 400);
      const rows = await fetchPlanRows(db, auth, year, memberId);
      const row = rows[0];
      if (!row) return errResponse('ไม่พบข้อมูลสมาชิกนี้ หรือไม่มีสิทธิ์ดูข้อมูล', 404);
      return jsonResponse({
        ok: true,
        blueprintYear: year,
        member: {
          memberId: row.memberId,
          name: row.name,
          nickname: row.nickname,
          profession: row.profession,
          companyName: row.companyName,
          mentorTeam: row.mentorTeam,
        },
        planSummary: {
          msbGoal: row.msbGoal,
          totalSalesTargetYear: row.totalSalesTargetYear,
          customerNeeded: row.customerNeeded,
          referralNeeded: row.referralNeeded,
          referralPerWeek: row.referralPerWeek,
          conversionRatePercent: row.conversionRatePercent,
          bniContributionPercent: row.bniContributionPercent,
        },
        actualSummary: {
          actualReceived: row.actualReceived,
          palmsTyfcb: row.palmsTyfcb,
          growthReceived: row.growthReceived,
          rg: row.rg,
          rr: row.rr,
          visitors: row.visitors,
          oneToOne: row.oneToOne,
          ceu: row.ceu,
          trafficLight: row.trafficLight,
          latestMonthlyScore: row.latestMonthlyScore,
        },
        gapSummary: {
          revenueProgressPercent: row.revenueProgressPercent,
          revenueGap: row.revenueGap,
          referralProgressPercent: row.referralProgressPercent,
          referralGap: row.referralGap,
          referralWeekGap: row.referralWeekGap,
          status: row.status,
          statusLabel: row.statusLabel,
        },
        lookingFor: { categories: row.lookingForCategories, detail: row.lookingForDetail },
        powerTeam: { categories: row.powerTeamCategories, detail: row.powerTeamDetail },
        personalGoal: { category: row.personalGoalCategory, detail: row.personalGoalDetail },
        coachingInsights: [
          row.suggestedSupport,
          row.referralGap > 0 ? `ยังขาด Referral ประมาณ ${Math.round(row.referralGap).toLocaleString('th-TH')} ครั้งจากแผน` : '',
          row.revenueGap > 0 ? `ยังมี Revenue Gap ประมาณ ${Math.round(row.revenueGap).toLocaleString('th-TH')} บาทจาก MSB Goal` : '',
        ].filter(Boolean),
      });
    }

    case 'getMSBMatchingSuggestions': {
      const auth = await requireAuth(db, p, DASHBOARD_ROLES);
      if (!auth.ok) return errResponse(auth.error!);
      const memberId = txt(p.memberId || p.member_id);
      if (!memberId) return errResponse('memberId required', 400);
      const rows = await fetchPlanRows(db, auth, year, memberId);
      const row = rows[0];
      if (!row) return errResponse('ไม่พบข้อมูลสมาชิกนี้ หรือไม่มีสิทธิ์ดูข้อมูล', 404);
      const desired = [...row.powerTeamCategories, ...row.lookingForCategories].map(s => s.toLowerCase());
      if (!desired.length) return jsonResponse({ ok: true, blueprintYear: year, suggestions: [] });
      let memberQuery = db.from('members')
        .select('id, name, nickname, mentor_team, profession, company_name, is_archived')
        .eq('is_archived', false)
        .neq('id', memberId)
        .order('mentor_team')
        .order('name');
      if (!roleCanSeeAll(auth) && auth.teamName) memberQuery = memberQuery.eq('mentor_team', auth.teamName);
      const { data, error } = await memberQuery;
      if (error) return errResponse(error.message, 400);
      const suggestions = ((data || []) as Record<string, unknown>[])
        .map(m => {
          const profession = txt(m.profession).toLowerCase();
          const company = txt(m.company_name).toLowerCase();
          const matched = desired.filter(cat => cat && (profession.includes(cat) || company.includes(cat) || cat.includes(profession)));
          return {
            memberId: m.id,
            name: m.name,
            nickname: m.nickname,
            mentorTeam: m.mentor_team,
            profession: m.profession,
            companyName: m.company_name,
            matchedCategories: Array.from(new Set(matched)),
            confidence: matched.length >= 2 ? 'medium' : matched.length === 1 ? 'low' : '',
            label: 'category-based suggestion',
          };
        })
        .filter(m => m.matchedCategories.length)
        .slice(0, 12);
      return jsonResponse({ ok: true, blueprintYear: year, suggestions });
    }
  }

  return errResponse(`unknown action: ${action}`);
}

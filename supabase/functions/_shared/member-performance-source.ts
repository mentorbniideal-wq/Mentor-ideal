type MetricRow = Record<string, unknown>;

export type PerformanceSource = 'member_traffic_light' | 'reporting2you';

/** A source snapshot never claims monthly activity without a verified report window. */
export function performanceSourceRows(
  rows: MetricRow[], sourceType: PerformanceSource, chapterId: string, batchId: string,
  period: { year: number; month: number },
) {
  return rows.map(row => {
    const values = (row.source_values && typeof row.source_values === 'object')
      ? row.source_values as MetricRow : row;
    return ({
    chapter_id: chapterId,
    member_id: String(row.member_id),
    period_year: period.year,
    period_month: period.month,
    source_type: sourceType,
    import_batch_id: batchId,
    captured_at: new Date().toISOString(),
    source_semantics: 'needs_verification',
    window_start: null,
    window_end: null,
    referrals_given: numeric(values.rg),
    referrals_received: numeric(values.rr),
    tyfcb_given: numeric(sourceType === 'member_traffic_light' ? values.given : values.tyfcb_thb),
    tyfcb_received: sourceType === 'member_traffic_light' ? numeric(values.received) : null,
    // The supplied R2Y file has an unlabeled column at this position.
    visitors: sourceType === 'member_traffic_light' ? numeric(values.visitors) : null,
    one_to_ones: numeric(values.one_to_one),
    ceu: numeric(values.ceu),
    traffic_light_points: sourceType === 'member_traffic_light' ? numeric(values.score) : null,
    attendance_present: numeric(sourceType === 'member_traffic_light' ? values.p : values.attend),
    attendance_absent: numeric(sourceType === 'member_traffic_light' ? values.a : values.absent),
    attendance_late: numeric(sourceType === 'member_traffic_light' ? values.l : values.late),
    attendance_medical: numeric(sourceType === 'member_traffic_light' ? values.m : values.medical),
    attendance_substitute: numeric(sourceType === 'member_traffic_light' ? values.s : values.sub),
    bni_days: sourceType === 'reporting2you' ? numeric(values.bni_days) : null,
    reported_points: sourceType === 'reporting2you' ? numeric(values.official_pts) : null,
  });
  });
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function sourceSnapshotHistory(rows: MetricRow[]) {
  return rows.map(row => ({
    period: `${row.period_year}-${String(row.period_month).padStart(2, '0')}`,
    source: row.source_type,
    semantics: row.source_semantics,
    windowStart: row.window_start || null,
    windowEnd: row.window_end || null,
    referralsGiven: numeric(row.referrals_given),
    referralsReceived: numeric(row.referrals_received),
    tyfcbGiven: numeric(row.tyfcb_given),
    tyfcbReceived: numeric(row.tyfcb_received),
    visitors: numeric(row.visitors),
    oneToOnes: numeric(row.one_to_ones),
    ceu: numeric(row.ceu),
    trafficLightPoints: numeric(row.traffic_light_points),
    attendancePresent: numeric(row.attendance_present),
    attendanceAbsent: numeric(row.attendance_absent),
    attendanceLate: numeric(row.attendance_late),
    attendanceMedical: numeric(row.attendance_medical),
    attendanceSubstitute: numeric(row.attendance_substitute),
    bniDays: numeric(row.bni_days),
    reportedPoints: numeric(row.reported_points),
    batchId: row.import_batch_id,
    capturedAt: row.captured_at,
    monthlyActivityVerified: row.source_semantics === 'monthly' && Boolean(row.window_start && row.window_end),
  }));
}

/** Only the latest finished attempt for a period can make its snapshots trusted. */
export function trustedSourceSnapshotHistory(rows: MetricRow[], batches: MetricRow[]) {
  const latest = new Map<string, MetricRow>();
  for (const batch of [...batches].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))) {
    const period = `${batch.period_year}-${String(batch.period_month).padStart(2, '0')}`;
    if (!latest.has(period) && !['previewed', 'rolled_back'].includes(String(batch.status))) latest.set(period, batch);
  }
  const periods = [...latest].map(([period, batch]) => {
    const hashes = (batch.file_hashes || {}) as Record<string, unknown>;
    const complete = batch.status === 'completed' &&
      ['trafficLightEvolution', 'memberTrafficLight', 'reporting2You'].every(key => typeof hashes[key] === 'string' && Boolean(hashes[key]));
    return { period, status: complete ? 'COMPLETE' : 'PARTIAL' };
  }).sort((a, b) => b.period.localeCompare(a.period));
  const trusted = rows.filter(row => {
    const period = `${row.period_year}-${String(row.period_month).padStart(2, '0')}`;
    const batch = latest.get(period);
    return periods.find(item => item.period === period)?.status === 'COMPLETE' &&
      String(row.import_batch_id) === String(batch?.id);
  });
  return { history: sourceSnapshotHistory(trusted), periods };
}

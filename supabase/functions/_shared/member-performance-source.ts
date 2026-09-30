type MetricRow = Record<string, unknown>;

export type PerformanceSource = 'member_traffic_light' | 'reporting2you';

/** A source snapshot never claims monthly activity without a verified report window. */
export function performanceSourceRows(
  rows: MetricRow[], sourceType: PerformanceSource, chapterId: string, batchId: string,
  period: { year: number; month: number },
) {
  return rows.map(row => ({
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
    referrals_given: numeric(row.rg),
    referrals_received: numeric(row.rr),
    tyfcb_given: numeric(sourceType === 'member_traffic_light' ? row.given : row.tyfcb_thb),
    tyfcb_received: sourceType === 'member_traffic_light' ? numeric(row.received) : null,
    // The supplied R2Y file has an unlabeled column at this position.
    visitors: sourceType === 'member_traffic_light' ? numeric(row.visitors) : null,
    one_to_ones: numeric(row.one_to_one),
    ceu: numeric(row.ceu),
    traffic_light_points: sourceType === 'member_traffic_light' ? numeric(row.score) : null,
  }));
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
    batchId: row.import_batch_id,
    capturedAt: row.captured_at,
    monthlyActivityVerified: row.source_semantics === 'monthly' && Boolean(row.window_start && row.window_end),
  }));
}

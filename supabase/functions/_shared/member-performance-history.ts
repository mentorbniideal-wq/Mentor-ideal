type Row = Record<string, unknown>;

/** Historical source values only. This deliberately does not infer monthly activity. */
export function buildMemberPerformanceHistory(keys: Row[], scores: Row[], limit = 12) {
  const keyByPeriod = new Map(keys.map(row => [`${row.year}-${row.month}`, row]));
  const scoreByPeriod = new Map(scores.map(row => [`${row.year}-${row.month}`, row]));
  return [...new Set([...keyByPeriod.keys(), ...scoreByPeriod.keys()])]
    .sort((a, b) => b.localeCompare(a)).slice(0, limit).map(period => {
      const snapshot = keyByPeriod.get(period);
      const score = scoreByPeriod.get(period);
      const [year, month] = period.split('-');
      return { period: `${year}-${month.padStart(2, '0')}`,
        referralGivenSnapshot: snapshot ? Number(snapshot.referral_value) : null,
        visitorSnapshot: snapshot ? Number(snapshot.visitor_value) : null,
        oneToOneSnapshot: snapshot ? Number(snapshot.one_to_one_value) : null,
        ceuSnapshot: snapshot ? Number(snapshot.ceu_value) : null,
        tyfcbGivenSnapshot: snapshot ? Number(snapshot.tyfcb_value) : null,
        trafficLightScore: score ? Number(score.score) : null,
        capturedAt: snapshot?.captured_at || score?.synced_at || null,
        source: snapshot ? 'PALMS key snapshot' : String(score?.source || 'Traffic Light'),
        monthlyActivityVerified: false };
    });
}

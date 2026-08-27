export type Member360HealthCheck = { key: string; label: string; ok: boolean };

export function summarizeMember360Health(checks: Member360HealthCheck[]) {
  const completed = checks.filter((check) => check.ok).length;
  return {
    completed,
    total: checks.length,
    percent: checks.length ? Math.round(completed / checks.length * 100) : 0,
    checks,
    missing: checks.filter((check) => !check.ok),
  };
}

export function sortMember360Timeline(events: Record<string, unknown>[], limit = 80) {
  return [...events]
    .filter((event) => Boolean(event.at))
    .sort((a, b) => new Date(String(b.at)).getTime() - new Date(String(a.at)).getTime())
    .slice(0, Math.max(0, limit));
}

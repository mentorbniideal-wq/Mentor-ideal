export const GUIDED_MODES = ['discover', 'deepen', 'referral_focus'] as const;
export const GUIDED_STEPS = [3, 5, 10, 10, 10, 5, 2] as const;

export function recommendedGuidedMode(completedRelationshipSessions: number) {
  return completedRelationshipSessions > 0 ? 'deepen' : 'discover';
}

export function cleanGuidedText(value: unknown, max = 1200) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

export function normalizeGuidedContent(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const allowed = ['agreements', 'stepNotes', 'business', 'referralMap', 'commitments', 'checklist', 'sharedSummary'];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    const value = source[key];
    if (JSON.stringify(value ?? null).length <= 30_000) out[key] = value;
  }
  return out;
}

export function validGuidedStep(value: unknown) {
  const step = Number(value);
  return Number.isInteger(step) && step >= 0 && step < GUIDED_STEPS.length ? step : 0;
}

export function canEditOwnedGuidedData(actorId: string, ownerId: string, pairMemberIds: string[]) {
  return actorId === ownerId && pairMemberIds.includes(actorId);
}

export function elapsedGuidedSeconds(startedAt: unknown, now = Date.now()) {
  const start = new Date(String(startedAt || '')).getTime();
  return Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 1000)) : 0;
}

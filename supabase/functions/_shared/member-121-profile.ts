import { cleanGuidedText } from './guided-one-to-one.ts';

export const MEMBER_121_TEXT_LIMITS: Record<string, number> = {
  business_summary: 2000, target_clients: 1500, problems_solved: 1500,
  primary_services: 1500, differentiators: 1500, service_area: 500,
  looking_for: 1500, ideal_client: 1500, referral_trigger: 1500,
  good_referral: 1500, not_a_fit: 1500, before_intro_question: 1000,
  promise_boundaries: 1000, credibility_story: 2500, introduction_script: 1500,
  gains_goals: 1500, gains_accomplishments: 1500, gains_interests: 1500,
  gains_networks: 1500, gains_skills: 1500,
};

export const MEMBER_121_VISIBILITY_FIELDS = [
  'share_business', 'share_referral_focus', 'share_goals', 'share_accomplishments',
  'share_interests', 'share_networks', 'share_skills',
] as const;

export function normalizeMember121Profile(input: unknown) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const out: Record<string, unknown> = {};
  for (const [field, max] of Object.entries(MEMBER_121_TEXT_LIMITS)) out[field] = cleanGuidedText(source[field], max) || null;
  for (const field of MEMBER_121_VISIBILITY_FIELDS) out[field] = field === 'share_networks' ? source[field] === true : source[field] !== false;
  return out;
}

export function publicMember121Profile(row: Record<string, unknown> | null | undefined) {
  if (!row) return null;
  const out: Record<string, unknown> = {
    member_id: row.member_id,
    profile_version: Number(row.profile_version || 1),
    published_at: row.published_at || null,
    updated_at: row.updated_at || null,
  };
  const copy = (fields: string[]) => fields.forEach(field => { if (row[field]) out[field] = row[field]; });
  if (row.share_business !== false) copy(['business_summary','target_clients','problems_solved','primary_services','differentiators','service_area']);
  if (row.share_referral_focus !== false) copy(['looking_for','ideal_client','referral_trigger','good_referral','not_a_fit','before_intro_question','promise_boundaries','credibility_story','introduction_script']);
  if (row.share_goals !== false) copy(['gains_goals']);
  if (row.share_accomplishments !== false) copy(['gains_accomplishments']);
  if (row.share_interests !== false) copy(['gains_interests']);
  if (row.share_networks === true) copy(['gains_networks']);
  if (row.share_skills !== false) copy(['gains_skills']);
  return out;
}

export function member121ProfileCompleteness(row: Record<string, unknown> | null | undefined) {
  if (!row) return 0;
  const important = ['business_summary','target_clients','problems_solved','looking_for','ideal_client','referral_trigger','introduction_script','gains_goals','gains_interests','gains_skills'];
  return Math.round(important.filter(field => String(row[field] || '').trim()).length / important.length * 100);
}

export function canAccessPairProfile(actorMemberId: string, pair: Record<string, unknown> | null | undefined, subjectMemberId: string) {
  if (!pair) return false;
  const members = [pair.member_a_id, pair.member_b_id, pair.optional_member_c_id].filter(Boolean).map(String);
  return members.includes(actorMemberId) && members.includes(subjectMemberId);
}

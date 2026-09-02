import { cleanGuidedText } from './guided-one-to-one.ts';

export type DirectoryRow = {
  member: Record<string, unknown>;
  profile?: Record<string, unknown> | null;
};

const referralReadinessFields = [
  'business_summary','target_clients','primary_services','looking_for','ideal_client',
  'referral_trigger','good_referral','before_intro_question','introduction_script',
];

const searchableGroups = [
  { label: 'ชื่อสมาชิก', fields: ['name','nickname'], source: 'member' },
  { label: 'อาชีพ/บริษัท', fields: ['profession','company_name'], source: 'member' },
  { label: 'ธุรกิจที่ให้บริการ', fields: ['business_summary','target_clients','problems_solved','primary_services','differentiators','service_area'], source: 'profile' },
  { label: 'Looking for', fields: ['looking_for','ideal_client','good_referral'], source: 'profile' },
  { label: 'Referral Trigger', fields: ['referral_trigger','before_intro_question'], source: 'profile' },
] as const;

export function normalizeDirectoryQuery(value: unknown) {
  return cleanGuidedText(value, 80).toLocaleLowerCase('th-TH').replace(/\s+/g, ' ').trim();
}

function normalizeDirectorySearchText(value: unknown) {
  return cleanGuidedText(value, 5_000).toLocaleLowerCase('th-TH').replace(/\s+/g, ' ').trim();
}

export function directoryProfileProjection(profile: Record<string, unknown> | null | undefined) {
  if (!profile || profile.share_directory !== true) return null;
  const fields = ['business_summary','target_clients','problems_solved','primary_services','differentiators','service_area','looking_for','ideal_client','referral_trigger','good_referral','not_a_fit','before_intro_question','promise_boundaries','credibility_story','introduction_script'];
  return Object.fromEntries(fields.filter(field => profile[field]).map(field => [field, profile[field]]));
}

export function directorySearchText(row: DirectoryRow) {
  const member = row.member || {};
  const profile = directoryProfileProjection(row.profile);
  return normalizeDirectorySearchText([
    member.name, member.nickname, member.profession, member.company_name,
    ...(profile ? Object.values(profile) : []),
  ].filter(Boolean).join(' '));
}

export function directorySearchScore(row: DirectoryRow, query: string) {
  const q = normalizeDirectoryQuery(query);
  if (!q) return 1;
  const member = row.member || {};
  const identities = [member.name, member.nickname].filter(Boolean).map(normalizeDirectoryQuery);
  const identity = identities.join(' ');
  const business = normalizeDirectoryQuery([member.profession, member.company_name].filter(Boolean).join(' '));
  const full = directorySearchText(row);
  if (!full.includes(q)) return 0;
  if (identities.some(value => value.startsWith(q))) return 100;
  if (identity.includes(q)) return 80;
  if (business.includes(q)) return 60;
  return 40;
}

export function directoryMatchReasons(row: DirectoryRow, query: string) {
  const q = normalizeDirectoryQuery(query);
  if (!q) return [];
  const member = row.member || {};
  const profile = directoryProfileProjection(row.profile);
  return searchableGroups.filter(group => {
    if (group.source === 'profile' && !profile) return false;
    const source = group.source === 'member' ? member : profile || {};
    return group.fields.some(field => normalizeDirectorySearchText(source[field]).includes(q));
  }).map(group => group.label);
}

export function directoryReferralReadiness(profile: Record<string, unknown> | null | undefined) {
  const visible = directoryProfileProjection(profile);
  if (!visible) return { percent: 0, status: 'not_shared', completed: 0, total: referralReadinessFields.length };
  const completed = referralReadinessFields.filter(field => normalizeDirectorySearchText(visible[field]).length > 0).length;
  const percent = Math.round(completed * 100 / referralReadinessFields.length);
  return { percent, status: percent >= 75 ? 'ready' : percent >= 40 ? 'developing' : 'starting', completed, total: referralReadinessFields.length };
}

export function directoryResult(row: DirectoryRow) {
  const member = row.member || {};
  const profile = directoryProfileProjection(row.profile);
  return {
    id: String(member.id || ''), name: String(member.name || ''), nickname: String(member.nickname || ''),
    profession: String(member.profession || ''), companyName: String(member.company_name || ''),
    directoryOptIn: Boolean(profile), businessSummary: String(profile?.business_summary || ''),
    lookingFor: String(profile?.looking_for || ''), idealClient: String(profile?.ideal_client || ''),
    referralTrigger: String(profile?.referral_trigger || ''),
    referralReadiness: directoryReferralReadiness(row.profile),
    profileUpdatedAt: profile ? String(row.profile?.updated_at || row.profile?.published_at || '') : '',
  };
}

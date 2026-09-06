export type HelpRequestRoute = {
  signalType: string;
  label: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  confidential?: boolean;
};

const HELP_REQUEST_ROUTES: Record<string, HelpRequestRoute> = {
  mentor: { signalType: 'member_help', label: 'Mentor Team' },
  one_to_one: { signalType: 'member_help', label: 'Mentor Team' },
  visitor: { signalType: 'visitor', label: 'Visitor Host' },
  growth: { signalType: 'goal', label: 'Growth Team' },
  training: { signalType: 'training', label: 'ST / NEC' },
  renewal: { signalType: 'renewal', label: 'Committee / ST' },
  referral: { signalType: 'referral', label: 'Growth Coordinator / Mentor Team' },
  profile: { signalType: 'profile_update', label: 'Membership Committee / Chapter Admin' },
  presentation: { signalType: 'presentation', label: 'Vice President / NEC' },
  confidential: {
    signalType: 'confidential',
    label: 'Membership Committee / Mentor Co.',
    priority: 'high',
    confidential: true,
  },
  technical: { signalType: 'member_help', label: 'Mentor Team / Chapter Admin' },
};

export function helpRequestRoute(category: string): HelpRequestRoute | null {
  return HELP_REQUEST_ROUTES[String(category || '').trim()] || null;
}

export type HelpRequestRoute = { signalType: string; label: string };

const HELP_REQUEST_ROUTES: Record<string, HelpRequestRoute> = {
  mentor: { signalType: 'member_help', label: 'Mentor Team' },
  one_to_one: { signalType: 'member_help', label: 'Mentor Team' },
  visitor: { signalType: 'visitor', label: 'Visitor Host' },
  growth: { signalType: 'goal', label: 'Growth Team' },
  training: { signalType: 'training', label: 'ST / NEC' },
  renewal: { signalType: 'renewal', label: 'Committee / ST' },
  technical: { signalType: 'member_help', label: 'Mentor Team / Chapter Admin' },
};

export function helpRequestRoute(category: string): HelpRequestRoute | null {
  return HELP_REQUEST_ROUTES[String(category || '').trim()] || null;
}

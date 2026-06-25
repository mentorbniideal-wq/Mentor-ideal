export type LineRole = 'member' | 'mentor' | 'mc' | 'growth';

export function teamCommandMode(role: LineRole): 'own-team' | 'all-teams' {
  return role === 'mc' || role === 'growth' ? 'all-teams' : 'own-team';
}


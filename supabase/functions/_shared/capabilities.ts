export const CAPABILITY = {
  ALL: '*',
  ACCESS_MANAGE: 'access.manage',
  SETTINGS_MANAGE: 'settings.manage',
  LINE_MANAGE: 'line.manage',
  MOBILE_ACCESS_MANAGE: 'mobile_access.manage',
  MENTOR_MANAGE: 'mentor.manage',
  LT_VIEW: 'lt.view',
  LT_MANAGE: 'lt.manage',
  SIGNALS_VIEW: 'signals.view',
  SIGNALS_MANAGE: 'signals.manage',
} as const;

export interface CapabilitySubject {
  isAdmin?: boolean;
  adminSections?: string[];
  adminEditAccess?: boolean;
  capabilities?: string[];
}

export function hasCapability(subject: CapabilitySubject, capability: string): boolean {
  if (subject.isAdmin) return true;
  const capabilities = subject.capabilities || [];
  return capabilities.includes(CAPABILITY.ALL) || capabilities.includes(capability);
}

export function canAccessAdminSection(
  subject: CapabilitySubject,
  section: string,
  write = false,
): boolean {
  if (subject.isAdmin) return true;
  if (!(subject.adminSections || []).includes(section)) return false;
  return !write || Boolean(subject.adminEditAccess);
}

export function defaultCapabilities(role: string, isAdmin = false): string[] {
  if (isAdmin || role === 'admin') return [CAPABILITY.ALL];
  if (role === 'mc') {
    return [
      CAPABILITY.MENTOR_MANAGE,
      CAPABILITY.LT_VIEW,
      CAPABILITY.SIGNALS_VIEW,
      CAPABILITY.SIGNALS_MANAGE,
    ];
  }
  if (role === 'mentor_support') return [CAPABILITY.SIGNALS_VIEW];
  if (['toomtam', 'aof', 'draft', 'phai', 'amp'].includes(role)) {
    return [CAPABILITY.SIGNALS_VIEW, CAPABILITY.SIGNALS_MANAGE];
  }
  if (role === 'growth') return [CAPABILITY.SIGNALS_VIEW, CAPABILITY.SIGNALS_MANAGE];
  return [];
}

export function canAssumeOperationalView(
  subject: { role?: string; isMC?: boolean; isAdmin?: boolean },
  targetRole: string,
): boolean {
  if (targetRole === 'admin') return Boolean(subject.isAdmin);
  return Boolean(subject.isAdmin || subject.isMC || subject.role === 'toomtam');
}

import {
  CAPABILITY,
  canAccessAdminSection,
  defaultCapabilities,
  hasCapability,
} from './capabilities.ts';

Deno.test('Chapter Admin can access every capability and section', () => {
  const admin = { isAdmin: true };
  if (!hasCapability(admin, CAPABILITY.ACCESS_MANAGE)) throw new Error('admin capability denied');
  if (!canAccessAdminSection(admin, 'revenue', true)) throw new Error('admin section denied');
});

Deno.test('Mentor Co only accesses assigned sections and respects view-only mode', () => {
  const mc = {
    isAdmin: false,
    adminSections: ['dashboard', 'members', 'issues'],
    adminEditAccess: false,
    capabilities: defaultCapabilities('mc'),
  };
  if (!canAccessAdminSection(mc, 'members')) throw new Error('assigned section denied');
  if (canAccessAdminSection(mc, 'members', true)) throw new Error('view-only write allowed');
  if (canAccessAdminSection(mc, 'revenue')) throw new Error('unassigned section allowed');
  if (hasCapability(mc, CAPABILITY.ACCESS_MANAGE)) throw new Error('admin capability leaked');
  if (!hasCapability(mc, CAPABILITY.MENTOR_MANAGE)) throw new Error('mentor capability denied');
});

Deno.test('Mentor Support cannot manage access or contact members directly', () => {
  const support = { capabilities: defaultCapabilities('mentor_support') };
  if (hasCapability(support, CAPABILITY.ACCESS_MANAGE)) throw new Error('access management leaked');
  if (hasCapability(support, CAPABILITY.LINE_MANAGE)) throw new Error('LINE management leaked');
  if (!hasCapability(support, CAPABILITY.SIGNALS_VIEW)) throw new Error('support view denied');
  if (hasCapability(support, CAPABILITY.SIGNALS_MANAGE)) throw new Error('support write leaked');
});

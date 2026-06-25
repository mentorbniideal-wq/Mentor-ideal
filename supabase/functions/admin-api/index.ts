// Admin API Edge Function — MC-only data management
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { jsonResponse, errResponse } from '../_shared/db.ts';
import { handleAdminMembers }   from './handlers/members.ts';
import { handleAdminIssues }    from './handlers/issues.ts';
import { handleAdminCheckin }   from './handlers/checkin.ts';
import { handleAdminRevenue }   from './handlers/revenue.ts';
import { handleAdminBroadcast } from './handlers/broadcast.ts';
import { handleAdminSettings }  from './handlers/settings.ts';

const ROUTES: Record<string, string> = {
  // Members (growth_referral_members)
  'getAdminMembers': 'members', 'updateAdminMember': 'members',
  'getAdminDashboard': 'members',
  // Issues
  'getAdminIssues': 'issues', 'updateIssueStatus': 'issues',
  'addActionLog': 'issues', 'getActionLogs': 'issues',
  // Check-in
  'getAdminCheckinSessions': 'checkin', 'getAdminCheckinEntries': 'checkin',
  // Revenue
  'getAdminRevenue': 'revenue', 'saveAdminRevenue': 'revenue',
  'deleteAdminRevenue': 'revenue',
  // Broadcast
  'getAdminBroadcasts': 'broadcast', 'sendAdminBroadcast': 'broadcast',
  // Settings
  'getRoleAssignments': 'settings', 'addRoleAssignment': 'settings',
  'removeRoleAssignment': 'settings', 'getConnectionStatus': 'settings',
  'submitAccessRequest': 'settings', 'getAccessRequests': 'settings',
  'approveAccessRequest': 'settings', 'rejectAccessRequest': 'settings',
  'getLineTeamMappings': 'settings', 'setLineTeamMapping': 'settings',
  'provisionLineMenus': 'settings', 'getLineHealth': 'settings',
  'reassignLineMenu': 'settings', 'simulateLineMessage': 'settings',
};

const HANDLERS: Record<string, (p: Record<string, unknown>) => Promise<Response>> = {
  'members':   handleAdminMembers,
  'issues':    handleAdminIssues,
  'checkin':   handleAdminCheckin,
  'revenue':   handleAdminRevenue,
  'broadcast': handleAdminBroadcast,
  'settings':  handleAdminSettings,
};

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errResponse('Method not allowed', 405);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); }
  catch { return errResponse('Invalid JSON'); }

  const action = String(payload.action || '');
  if (!action) return errResponse('action required');

  const domain = ROUTES[action];
  if (!domain) return jsonResponse({ ok: false, error: `unknown admin action: ${action}` });

  const handler = HANDLERS[domain];
  if (!handler) return jsonResponse({ ok: false, error: `handler not found: ${domain}` });

  try { return await handler(payload); }
  catch (e) {
    console.error(`[admin:${action}]`, e);
    return jsonResponse({ ok: false, error: (e as Error).message });
  }
});

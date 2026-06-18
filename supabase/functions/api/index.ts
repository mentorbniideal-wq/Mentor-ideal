// ============================================================
// BNI IDEAL — Unified API Edge Function
// Mirrors the dispatch() pattern from WEBAPP.js exactly.
// All ~80 actions route through a single function to minimize cold starts.
//
// Request format (POST, JSON body):
//   { action: string, role: string, pin: string, ...payload }
//
// Response format (always JSON):
//   { ok: true,  ...data }  on success
//   { ok: false, error: string } on failure
// ============================================================

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getServiceClient, getAnonClient, jsonResponse, errResponse } from '../_shared/db.ts';
import { requireAuth } from '../_shared/auth.ts';

// ── Import domain handlers (one file per domain group) ────────
// These are stub imports — implement each file as you migrate each API group.
import { handleAuth }       from './handlers/auth.ts';
import { handleDashboard }  from './handlers/dashboard.ts';
import { handlePublic }     from './handlers/public.ts';
import { handleMembers }    from './handlers/members.ts';
import { handleCoaching }   from './handlers/coaching.ts';
import { handleCheckin }    from './handlers/checkin.ts';
import { handleRenewal }    from './handlers/renewal.ts';
import { handleGrowth }     from './handlers/growth.ts';
import { handlePowerTeams } from './handlers/power-teams.ts';
import { handle121 }        from './handlers/121.ts';
import { handleAlerts }     from './handlers/alerts.ts';
import { handleMeetings }   from './handlers/meetings.ts';
import { handleComms }      from './handlers/comms.ts';
import { handleLineAdmin }  from './handlers/line-admin.ts';
import { handleUsage }         from './handlers/usage.ts';
import { handleNotifications } from './handlers/notifications.ts';

// ── Public actions that require NO PIN ────────────────────────
const PUBLIC_ACTIONS = new Set([
  'getMemberDirectory',
  'getSimulateData',
  'getMemberPublicDetail',
]);

// ── Action → handler routing table ───────────────────────────
// Mirrors dispatch() in WEBAPP.js lines 3400-3551
const ROUTES: Record<string, string> = {
  // Auth
  'login':      'auth',
  'verifyPin':  'auth',
  'changePIN':  'auth',
  'getMyRole':  'auth',
  'viewAsRole': 'auth',

  // Dashboard & scores
  'getDashboard': 'dashboard', 'getDesktopDashboard': 'dashboard',
  'getMemberDetail': 'dashboard', 'getScorecard': 'dashboard',
  'getMyTeam': 'dashboard', 'getLeaderboard': 'dashboard',
  'getChapterTrend': 'dashboard', 'getChapterPulse': 'dashboard',
  'getCurrentMonth': 'dashboard', 'setCurrentMonth': 'dashboard',
  'verifyScoring': 'dashboard', 'getMCCoaching': 'dashboard',
  'getMCData': 'dashboard',

  // Public (anon)
  'getMemberDirectory': 'public', 'getSimulateData': 'public',
  'getMemberPublicDetail': 'public',

  // Members
  'getMemberList': 'members', 'addNewMember': 'members',
  'addNewMembersBatch': 'members', 'assignToTeam': 'members',
  'moveMemberToTeam': 'members', 'getMembersByTeam': 'members',
  'getTeamHistory': 'members',
  'setMentoringMode': 'members',
  'archiveMember': 'members', 'unarchiveMember': 'members', 'deleteMember': 'members',
  'removeNewMember': 'members', 'getArchivedMembers': 'members',
  'getNewMembers': 'members', 'saveMemberNote': 'members',
  'getMemberNote': 'members', 'saveScore': 'members',
  'saveStatus': 'members', 'ensureSlot': 'members',
  'getNMChecklist': 'members', 'saveNMCheckItem': 'members',
  'getAdminEmails': 'members', 'addAdminEmail': 'members', 'removeAdminEmail': 'members',

  // Coaching / Core Issue
  'saveCoreIssue': 'coaching', 'getCoachingGuide': 'coaching',
  'saveMentorLog': 'coaching', 'getMentorLogs': 'coaching',
  'getMemberTimeline': 'coaching',
  'save90DayReview': 'coaching', 'get90DayReviews': 'coaching',

  // Check-in
  'parseCheckin': 'checkin', 'parseCheckinPDF': 'checkin',
  'saveCheckin': 'checkin', 'getCheckinLog': 'checkin',
  'getAIMatching': 'checkin',

  // Renewal
  'getRenewal': 'renewal', 'extendRenewal': 'renewal',
  'updateRenewalStatus': 'renewal',

  // Growth System
  'getGrowthData': 'growth', 'getGrowthSheetData': 'growth',
  'updateGrowthMember': 'growth', 'addGrowthMember': 'growth',
  'moveGrowthMember': 'growth', 'getGrowthPowerTeams': 'power-teams',
  'getRiskMembers': 'growth', 'getMentorPerformance': 'growth',
  'getMentorActivity': 'growth', 'getWeeklyActions': 'growth',
  'createGrowthTask': 'growth', 'getGrowthTasks': 'growth',
  'respondGrowthTask': 'growth', 'monthlySync': 'growth', 'importScoreHistory': 'growth',

  // Power Teams
  'getPowerTeams': 'power-teams', 'getPTMembers': 'power-teams',
  'savePTMember': 'power-teams', 'deletePTMember': 'power-teams',
  'setPTMemberStatus': 'power-teams', 'updatePTMember': 'power-teams',
  'movePTMember': 'power-teams', 'moveSynMember': 'power-teams',
  'getCrossTeamSynergy': 'power-teams', 'saveCrossTeamPair': 'power-teams',

  // 1-2-1
  'save121Log': '121', 'get121Logs': '121',
  'getAll121Logs': '121', 'get121Tracker': '121',

  // Alerts
  'getAlertCenter': 'alerts', 'dismissAlert': 'alerts',
  'getDismissedAlerts': 'alerts', 'getTeamNotifs': 'alerts',
  'ackTeamNotifs': 'alerts', 'getUnreadCounts': 'alerts',
  'getReports': 'alerts', 'setReportStatus': 'alerts', 'saveReply': 'alerts',

  // Notifications (in-app persistent)
  'getNotifications': 'notifications', 'markNotificationsRead': 'notifications',
  'dismissNotification': 'notifications', 'dismissAllNotifications': 'notifications',

  // Meetings / Chapter
  'getMeetingPrep': 'meetings', 'getVisitorTracker': 'meetings',
  'getVisitorLog': 'meetings', 'addVisitor': 'meetings',
  'updateVisitor': 'meetings', 'getSeatMap': 'meetings',
  'getChapterRevenue': 'meetings', 'setChapterGoal': 'meetings',
  'getSprintBoard': 'meetings', 'saveSprintPlan': 'meetings',
  'getChapterActions': 'meetings', 'getReferralFlow': 'meetings',

  // Comms (messages, broadcasts, assignments)
  'sendBroadcast': 'comms', 'getBroadcasts': 'comms',
  'createMCAssignment': 'comms', 'getMCAssignments': 'comms',
  'getMentorAssignments': 'comms', 'ackAssignment': 'comms',
  'getMessages': 'comms', 'saveMCMessage': 'comms',
  'deleteMCMessage': 'comms', 'updateMCMessage': 'comms',
  'getReadMsgKeys': 'comms', 'setMsgRead': 'comms',

  // LINE Admin
  'saveLineId': 'line-admin', 'getLineIds': 'line-admin',
  'getLineMembers': 'line-admin', 'getLineMembersDetail': 'line-admin',
  'sendLineMessage': 'line-admin', 'sendLineBroadcast': 'line-admin',
  'sendLineIntro': 'line-admin', 'setMCLineId': 'line-admin',
  'getAbsenceLog': 'line-admin', 'getLineIssues': 'line-admin',
  'enrollOnboarding': 'line-admin', 'removeOnboarding': 'line-admin',
  'sendOnboardingWeek': 'line-admin', 'getOnboardingStatus': 'line-admin',
  'getOnboardingMessages': 'line-admin', 'saveOnboardingMessage': 'line-admin', 'getOnboardingPreview': 'line-admin',
  'mentorBroadcast': 'line-admin', 'setupRichMenu': 'line-admin',
  'setupAllTriggers': 'line-admin', 'testLineConnection': 'line-admin',
  'triggerScoreAlert': 'line-admin', 'triggerAnniversary': 'line-admin',
  'triggerCheckinReminder': 'line-admin', 'triggerChapterPulse': 'line-admin',
  'triggerPostMeetingPrompt': 'line-admin', 'triggerWednesdayNudge': 'line-admin',
  'triggerTeamLeaderboard': 'line-admin', 'triggerWeeklyScorePush': 'line-admin',
  'triggerMondayBrief': 'line-admin', 'triggerMonthlyRecap': 'line-admin',
  'trigger121Reminder': 'line-admin', 'getAbsenceLogRecent': 'line-admin',

  // Usage
  'logUsage': 'usage', 'getUsageLog': 'usage',
};

const HANDLERS: Record<string, (p: Record<string, unknown>) => Promise<Response>> = {
  'auth':        handleAuth,
  'dashboard':   handleDashboard,
  'public':      handlePublic,
  'members':     handleMembers,
  'coaching':    handleCoaching,
  'checkin':     handleCheckin,
  'renewal':     handleRenewal,
  'growth':      handleGrowth,
  'power-teams': handlePowerTeams,
  '121':         handle121,
  'alerts':        handleAlerts,
  'notifications': handleNotifications,
  'meetings':    handleMeetings,
  'comms':       handleComms,
  'line-admin':  handleLineAdmin,
  'usage':       handleUsage,
};

// ── Main entry point ──────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return errResponse('Method not allowed', 405);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return errResponse('Invalid JSON body');
  }

  const action = String(payload.action || '');
  if (!action) return errResponse('action is required');

  // Route to handler
  const domain = ROUTES[action];
  if (!domain) {
    return jsonResponse({ ok: false, error: `unknown action: ${action}` });
  }

  const handler = HANDLERS[domain];
  if (!handler) {
    return jsonResponse({ ok: false, error: `handler not implemented: ${domain}` });
  }

  try {
    // Log usage (non-blocking, fire-and-forget)
    if (action !== 'logUsage' && payload.role) {
      logUsageAsync(payload).catch(() => {});
    }
    return await handler(payload);
  } catch (e) {
    console.error(`[${action}] Error:`, e);
    return jsonResponse({ ok: false, error: (e as Error).message });
  }
});

async function logUsageAsync(payload: Record<string, unknown>): Promise<void> {
  const db = getServiceClient();
  await db.from('app_usage').insert({
    role:     String(payload.role || ''),
    team:     String(payload.team || payload.role || ''),
    platform: String(payload.platform || 'mobile'),
    action:   String(payload.action || ''),
    detail:   String(payload.detail || ''),
  });
}

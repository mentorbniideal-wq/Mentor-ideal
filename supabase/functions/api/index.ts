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
import { handleCopilot } from './handlers/copilot.ts';
import { handleMemberSuccessBlueprints } from './handlers/member-success-blueprints.ts';
import { handleWeekly121 } from './handlers/weekly-121.ts';

// ── Public actions that require NO PIN ────────────────────────
const PUBLIC_ACTIONS = new Set([
  'getMemberDirectory',
  'getSimulateData',
  'getMemberPublicDetail',
  'getTrainingEvents',
  // Public entrypoint, but handler verifies LINE access token and resolves own member_id server-side.
  'getMyMemberSuccessBlueprint',
  'saveMyMemberSuccessBlueprint',
  // Public token entrypoint. Handler resolves member_id server-side from msb_access_tokens only.
  'getMemberSuccessBlueprintByToken',
  'saveMemberSuccessBlueprintByToken',
  'getMSBCategorySuggestions',
]);

const AUTH_ACTIONS = new Set([
  'login',
  'verifyPin',
  'getMyRole',
  'viewAsRole',
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
  'getTrafficLightMonthlySummary': 'dashboard',
  'getSystemHealth': 'system',
  'getCurrentMonth': 'dashboard', 'setCurrentMonth': 'dashboard',
  'verifyScoring': 'dashboard', 'getMCCoaching': 'dashboard',
  'getMCData': 'dashboard',

  // Public (anon)
  'getMemberDirectory': 'public', 'getSimulateData': 'public',
  'getMemberPublicDetail': 'public', 'getTrainingEvents': 'public',

  // Members
  'getMemberList': 'members', 'addNewMember': 'members',
  'addNewMembersBatch': 'members', 'assignToTeam': 'members',
  'moveMemberToTeam': 'members', 'getMembersByTeam': 'members',
  'getTeamHistory': 'members',
  'setMentoringMode': 'members',
  'archiveMember': 'members', 'unarchiveMember': 'members', 'deleteMember': 'members', 'updateMember': 'members',
  'removeNewMember': 'members', 'getArchivedMembers': 'members',
  'getNewMembers': 'members', 'saveMemberNote': 'members',
  'getMemberNote': 'members', 'saveScore': 'members',
  'saveStatus': 'members', 'ensureSlot': 'members',
  'getNMChecklist': 'members', 'saveNMCheckItem': 'members',
  'getAdminEmails': 'members', 'addAdminEmail': 'members', 'removeAdminEmail': 'members',
  'saveTrainingEvent': 'members', 'deleteTrainingEvent': 'members',
  'previewRosterImport': 'members', 'syncRosterImport': 'members',
  'previewPalmsSummaryImport': 'members', 'syncPalmsSummaryImport': 'members',
  'getPassportBoard': 'members', 'syncPassportEnrollments': 'members',
  'updatePassportSession': 'members', 'savePassportLtAssignment': 'members',
  'getPassportCalendar': 'members',

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
  'getMSBCategoryLibrary': 'growth', 'saveMSBCategoryAlias': 'growth',
  'saveGrowthGoalReview': 'growth',
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
  'createLineLinkToken': 'line-admin', 'revokeLineLinkTokens': 'line-admin', 'unlinkLineMember': 'line-admin',
  'getLineMembers': 'line-admin', 'getLineMembersDetail': 'line-admin',
  'getLineActivityTimeline': 'line-admin', 'getUnifiedFollowUpInbox': 'line-admin',
  'sendLineMessage': 'line-admin', 'sendLineBroadcast': 'line-admin',
  'sendLineIntro': 'line-admin', 'setMCLineId': 'line-admin',
  'getAbsenceLog': 'line-admin', 'getLineIssues': 'line-admin',
  'replyLineIssue': 'line-admin', 'updateLineIssueStatus': 'line-admin',
  'enrollOnboarding': 'line-admin', 'removeOnboarding': 'line-admin',
  'sendOnboardingWeek': 'line-admin', 'getOnboardingStatus': 'line-admin',
  'getOnboardingMessages': 'line-admin', 'saveOnboardingMessage': 'line-admin', 'getOnboardingPreview': 'line-admin',
  'mentorBroadcast': 'line-admin', 'setupRichMenu': 'line-admin', 'assignRichMenu': 'line-admin',
  'setupAllTriggers': 'line-admin', 'testLineConnection': 'line-admin', 'getLineQuota': 'line-admin', 'getLineDeliveryLog': 'line-admin',
  'triggerScoreAlert': 'line-admin', 'triggerAnniversary': 'line-admin',
  'triggerCheckinReminder': 'line-admin', 'triggerChapterPulse': 'line-admin',
  'triggerPostMeetingPrompt': 'line-admin', 'triggerWednesdayNudge': 'line-admin',
  'triggerTeamLeaderboard': 'line-admin', 'triggerWeeklyScorePush': 'line-admin',
  'triggerMondayBrief': 'line-admin', 'triggerMonthlyRecap': 'line-admin',
  'trigger121Reminder': 'line-admin', 'getAbsenceLogRecent': 'line-admin',
  'getLineHealth': 'line-admin', 'testLineCommand': 'line-admin',
  'getLineCommandGuide': 'line-admin', 'getLineAutomationLibrary': 'line-admin',
  'getLineMemberJourney': 'line-admin',

  // AI Copilot (read-only recommendations; write actions require separate confirmation)
  'askCopilot': 'copilot',

  // Member Success Blueprint
  'getMyMemberSuccessBlueprint': 'member-success-blueprints',
  'saveMyMemberSuccessBlueprint': 'member-success-blueprints',
  'getMemberSuccessBlueprintByToken': 'member-success-blueprints',
  'saveMemberSuccessBlueprintByToken': 'member-success-blueprints',
  'getMSBCategorySuggestions': 'member-success-blueprints',
  'generateMemberSuccessBlueprintLink': 'member-success-blueprints',
  'getMemberSuccessBlueprintsForDashboard': 'member-success-blueprints',
  'getMemberSuccessBlueprintSummary': 'member-success-blueprints',
  'getMSBDashboardBundle': 'member-success-blueprints',
  'getMSBIntelligenceOverview': 'member-success-blueprints',
  'getMSBPlanVsActual': 'member-success-blueprints',
  'getMSBSupportRadar': 'member-success-blueprints',
  'getMSBPairMatchingSuggestions': 'member-success-blueprints',
  'getMSBFollowUpQueue': 'member-success-blueprints',
  'getMSBMemberIntelligence': 'member-success-blueprints',
  'getMSBMatchingSuggestions': 'member-success-blueprints',

  // Weekly 1-2-1 Matching (MC only)
  'importWeekly121Csv': 'weekly-121', 'generateWeekly121Matches': 'weekly-121',
  'getWeekly121Round': 'weekly-121', 'getWeekly121History': 'weekly-121',
  'setWeekly121PairLock': 'weekly-121', 'sendWeekly121Round': 'weekly-121',
  'resolveWeekly121ImportRow': 'weekly-121', 'removeWeekly121Member': 'weekly-121',
  'swapWeekly121Members': 'weekly-121',
  'getOneToOneOverview': 'weekly-121',
  'getOneToOneQueues': 'weekly-121', 'updateOneToOneFollowUp': 'weekly-121',
  'reissueOneToOneVerificationCode': 'weekly-121',
  'updateOneToOneAttention': 'weekly-121',
  'getOneToOneMemberHistory': 'weekly-121',
  'getOneToOnePilotSettings': 'weekly-121', 'saveOneToOnePilotSettings': 'weekly-121',
  'getOneToOneMessageControl': 'weekly-121',
  'getWeekly121MessageTemplates': 'weekly-121', 'setWeekly121MessageTemplate': 'weekly-121',
  'saveOneToOneBusinessProfile': 'weekly-121',
  'getOneToOneManualCandidates': 'weekly-121', 'createManualOneToOneRound': 'weekly-121',

  // Usage
  'logUsage': 'usage', 'getUsageLog': 'usage', 'getLineAnalytics': 'usage',
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
  'copilot':     handleCopilot,
  'member-success-blueprints': handleMemberSuccessBlueprints,
  'weekly-121': handleWeekly121,
  'system':      handleSystemHealth,
};

async function handleSystemHealth(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient();
  const auth = await requireAuth(db, p, ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp', 'growth']);
  if (!auth.ok) return errResponse(auth.error || 'Authentication required', 401);

  const { data: settingsRows } = await db
    .from('settings')
    .select('key, value')
    .in('key', ['APP_VERSION']);
  const appVersion = (settingsRows || []).find((r: { key: string; value: string }) => r.key === 'APP_VERSION')?.value || 'v4.0';

  const smokeActions = [
    { action: 'getDesktopDashboard', label: 'MC/Growth dashboard data', readOnly: true },
    { action: 'getUnifiedFollowUpInbox', label: 'Unified Follow-up Inbox', readOnly: true },
    { action: 'getMSBDashboardBundle', label: 'Member Success Blueprint bundle', readOnly: true },
    { action: 'getLineActivityTimeline', label: 'LINE Member Activity Timeline', readOnly: true },
    { action: 'getTrafficLightMonthlySummary', label: 'Traffic Light Monthly Summary', readOnly: true },
    { action: 'getUnreadCounts', label: 'Unread badges / counters', readOnly: true },
  ];

  const routeNames = Object.keys(ROUTES).sort();
  const handlerDomains = Object.keys(HANDLERS).sort();
  const smokeChecks = smokeActions.map((item) => {
    const domain = ROUTES[item.action];
    return {
      ...item,
      domain: domain || '',
      routeOk: Boolean(domain),
      handlerOk: Boolean(domain && HANDLERS[domain]),
    };
  });
  const missingHandlers = routeNames
    .map((action) => ({ action, domain: ROUTES[action] }))
    .filter((r) => !HANDLERS[r.domain]);

  return jsonResponse({
    ok: true,
    appVersion,
    staticVersionHint: String(p.staticVersion || ''),
    generatedAt: new Date().toISOString(),
    routeCount: routeNames.length,
    handlerDomains,
    missingHandlers,
    smokeChecks,
    deployment: {
      vercelCommit: Deno.env.get('VERCEL_GIT_COMMIT_SHA') || '',
      vercelCommitMessage: Deno.env.get('VERCEL_GIT_COMMIT_MESSAGE') || '',
      denoDeploymentId: Deno.env.get('DENO_DEPLOYMENT_ID') || '',
      supabaseRegion: Deno.env.get('SB_REGION') || '',
    },
    notes: [
      'Health check is read-only and does not send LINE messages.',
      'Smoke actions listed here are safe to run from the dashboard UI.',
    ],
  });
}

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
    // Defense in depth: every non-public, non-auth action must authenticate
    // before a service-role handler can access the database.
    if (!PUBLIC_ACTIONS.has(action) && !AUTH_ACTIONS.has(action)) {
      const auth = await requireAuth(getServiceClient(), payload);
      if (!auth.ok) return errResponse(auth.error || 'Authentication required', 401);
    }

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

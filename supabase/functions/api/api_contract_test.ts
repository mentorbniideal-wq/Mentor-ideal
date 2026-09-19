function assert(condition: unknown, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)].sort();
}

async function read(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(`../../../${path}`, import.meta.url));
}

function routeActions(indexSource: string): Set<string> {
  return new Set(
    [...indexSource.matchAll(/'([^']+)'\s*:\s*'[^']+'/g)].map(match => match[1]),
  );
}

function handlerCases(source: string): string[] {
  return [
    ...[...source.matchAll(/case\s+['"]([^'"]+)['"]/g)].map(match => match[1]),
    ...[...source.matchAll(/\baction\s*===\s*['"]([^'"]+)['"]/g)].map(match => match[1]),
  ];
}

function frontendActions(source: string): string[] {
  return [...source.matchAll(/\b(?:gsr|call|[A-Za-z][A-Za-z0-9_]*Call)\(\s*['"]([A-Za-z0-9_]+)['"]/g)]
    .map(match => match[1]);
}

async function filesUnder(relativeDir: string, extensions: string[]): Promise<string[]> {
  const found: string[] = [];
  async function walk(relativePath: string): Promise<void> {
    const directory = new URL(`../../../${relativePath}`, import.meta.url);
    for await (const entry of Deno.readDir(directory)) {
      const child = `${relativePath}/${entry.name}`;
      if (entry.isDirectory) await walk(child);
      else if (!entry.name.startsWith('_') && extensions.some(extension => entry.name.endsWith(extension))) found.push(child);
    }
  }
  await walk(relativeDir);
  return found.sort();
}

Deno.test('every API handler case is registered in the unified router', async () => {
  const indexSource = await read('supabase/functions/api/index.ts');
  const routes = routeActions(indexSource);
  const handlerFiles = await filesUnder('supabase/functions/api/handlers', ['.ts']);

  const missing: string[] = [];
  for (const file of handlerFiles) {
    const source = await read(file);
    for (const action of handlerCases(source)) {
      if (!routes.has(action)) missing.push(`${action} (${file})`);
    }
  }

  assert(missing.length === 0, `Handler actions missing from ROUTES:\n${missing.join('\n')}`);
});

Deno.test('dashboard frontend only calls actions registered in the unified router', async () => {
  const indexSource = await read('supabase/functions/api/index.ts');
  const frontendFiles = await filesUnder('public', ['.html', '.js']);
  const routes = routeActions(indexSource);
  const actions = unique((await Promise.all(frontendFiles.map(read))).flatMap(frontendActions));
  const missing = actions.filter(action => !routes.has(action));

  assert(missing.length === 0, `Frontend API calls missing from ROUTES:\n${missing.join('\n')}`);
});

Deno.test('viewer requests keep viewer authentication and remain read-only', async () => {
  const frontend = await read('public/assets/js/desktop-operations.js');
  const auth = await read('supabase/functions/_shared/auth.ts');

  assert(
    frontend.includes("if(S&&S.isViewer)payload.role='viewer'"),
    'Viewer requests must override legacy role:"mc" payloads with role:"viewer"',
  );
  assert(
    frontend.includes("S&&S.isViewer&&String(a||'').indexOf('get')!==0"),
    'Viewer frontend must reject write actions',
  );
  assert(
    auth.includes("if (role === 'viewer')") && auth.includes("if (!action.startsWith('get'))"),
    'Viewer API authentication must reject write actions',
  );
});

Deno.test('mentor PIN roles are routed to the Mobile workspace after authentication', async () => {
  const frontend = await read('public/assets/js/desktop-operations.js');
  assert(
    frontend.includes("MENTOR_MOBILE_ROLES=new Set(['toomtam','aof','draft','phai','amp','mentor_support'])"),
    'Every mentor role must share the direct Mobile route',
  );
  assert(
    frontend.includes("sessionStorage.setItem('bni_app_session'") && frontend.includes("if(routeMentorToMobile(r))return"),
    'Desktop must transfer a verified PIN session before routing Mentor to Mobile',
  );
});

Deno.test('dark iPad rail keeps the Desktop workspace visible beside navigation', async () => {
  const css = await read('public/assets/css/desktop-ux-pro-max.css');
  assert(
    css.includes('body.dark #app-workspace{grid-column:2;grid-row:2;height:calc(100dvh - 76px)'),
    'iPad breakpoint must not leave the workspace in the third grid row below a full-height rail',
  );
  assert(
    css.includes('body.dark .tabs-wrap{grid-column:1;grid-row:2;min-height:0}'),
    'iPad navigation wrapper must remain in the second row beside the workspace',
  );
});

Deno.test('LT management derives tenant scope and never accepts a browser chapter id', async () => {
  const membersHandler = await read('supabase/functions/api/handlers/members.ts');
  const migration = await read('supabase/migrations/20260912000009_phase_2c_scoped_lt_operations.sql');
  for (const action of ['getLtTeam', 'saveLtGrowthTeam', 'previewLtTerm', 'createLtTerm', 'savePassportLtAssignment']) {
    const start = membersHandler.indexOf(`case "${action}":`);
    assert(start >= 0, `${action} must remain implemented`);
    const next = membersHandler.indexOf('\n    case ', start + 1);
    const block = membersHandler.slice(start, next < 0 ? undefined : next);
    assert(block.includes('resolveChapterScope(db, auth)'), `${action} must derive Chapter scope server-side`);
    assert(block.includes('scope.chapterId'), `${action} must constrain reads or writes to the resolved Chapter`);
  }
  assert(
    migration.includes('idx_lt_terms_one_active_per_chapter') && migration.includes('fn_create_lt_term_scoped'),
    'LT term migration must enforce one active term per Chapter and use a scoped creator',
  );
});

Deno.test('member CRUD and Member 360 resolve Chapter before accessing a member', async () => {
  const membersHandler = await read('supabase/functions/api/handlers/members.ts');
  const dashboardHandler = await read('supabase/functions/api/handlers/dashboard.ts');
  for (const action of ['getMemberList', 'moveMemberToTeam', 'assignToTeam', 'archiveMember', 'unarchiveMember', 'addNewMember', 'updateMember', 'deleteMember', 'getArchivedMembers', 'addNewMembersBatch', 'getNewMembers']) {
    const caseMarker = `case "${action}":`;
    let start = membersHandler.indexOf(caseMarker);
    assert(start >= 0, `${action} must remain implemented`);
    if (action === 'moveMemberToTeam') start = membersHandler.indexOf('case "assignToTeam":', start);
    const next = membersHandler.indexOf('\n    case ', start + caseMarker.length);
    const block = membersHandler.slice(start, next < 0 ? undefined : next);
    assert(block.includes('resolveChapterScope(db, auth)'), `${action} must derive Chapter scope server-side`);
    assert(block.includes('scope.chapterId'), `${action} must constrain the resolved Chapter`);
  }
  const memberDetailStart = dashboardHandler.indexOf("case 'getMemberDetail':");
  const memberDetailBlock = dashboardHandler.slice(memberDetailStart, dashboardHandler.indexOf("\n    case ", memberDetailStart + 1));
  assert(memberDetailBlock.includes('resolveChapterScope(db, auth)'), 'Member 360 must derive Chapter scope server-side');
  assert(memberDetailBlock.includes("from('members').select('id').eq('chapter_id', scope.chapterId)"), 'Member 360 must resolve member identity within the Chapter before reading related records');
});

Deno.test('renewal workflow resolves Chapter scope for reads and writes', async () => {
  const renewalHandler = await read('supabase/functions/api/handlers/renewal.ts');
  const migration = await read('supabase/migrations/20260912000010_phase_2c_scoped_renewals.sql');
  for (const action of ['getRenewal', 'updateRenewalStatus', 'extendRenewal']) {
    const start = renewalHandler.indexOf(`case '${action}':`);
    assert(start >= 0, `${action} must remain implemented`);
    const next = renewalHandler.indexOf('\n    case ', start + 1);
    const block = renewalHandler.slice(start, next < 0 ? undefined : next);
    assert(block.includes('resolveChapterScope(db, auth)'), `${action} must derive Chapter scope server-side`);
    assert(block.includes('scope.chapterId'), `${action} must constrain the resolved Chapter`);
  }
  assert(migration.includes('idx_renewals_chapter_expiry') && migration.includes('idx_renewal_events_chapter_member'), 'renewal records and audit events must have tenant indexes');
});

Deno.test('Growth score entrypoints derive Chapter scope before reading score data', async () => {
  const growthHandler = await read('supabase/functions/api/handlers/growth.ts');
  for (const action of ['getRiskMembers', 'getGrowthData', 'importScoreHistory']) {
    const start = growthHandler.indexOf(`case '${action}':`);
    assert(start >= 0, `${action} must remain implemented`);
    const next = growthHandler.indexOf('\n    case ', start + 1);
    const block = growthHandler.slice(start, next < 0 ? undefined : next);
    assert(block.includes('resolveChapterScope(db, auth)'), `${action} must derive Chapter scope server-side`);
    assert(block.includes('scope.chapterId'), `${action} must use the resolved Chapter`);
  }
});

Deno.test('Growth Intelligence and legacy Growth Sheet derive tenant scope server-side', async () => {
  const growthHandler = await read('supabase/functions/api/handlers/growth.ts');
  const powerHandler = await read('supabase/functions/api/handlers/power-teams.ts');
  const migration = await read('supabase/migrations/20260913000001_growth_intelligence_scope.sql');
  for (const action of ['getGrowthPriorities', 'getGrowthSheetData', 'createGrowthTask', 'getGrowthTasks', 'respondGrowthTask']) {
    const start = growthHandler.indexOf(`case '${action}':`);
    assert(start >= 0, `${action} must remain implemented`);
    const next = growthHandler.indexOf('\n    case ', start + 1);
    const block = growthHandler.slice(start, next < 0 ? undefined : next);
    assert(block.includes('resolveChapterScope(db, auth)') && block.includes('scope.chapterId'), `${action} must use server-derived Chapter scope`);
  }
  assert(powerHandler.includes('powerTeamCandidates(db, chapterId)') && powerHandler.includes('resolveChapterScope(db, auth)'), 'Power Team proposals must use the authenticated Chapter scope');
  assert(migration.includes('idx_growth_referral_groups_chapter_order') && migration.includes('idx_growth_tasks_chapter_status_due'), 'legacy Growth records need Chapter indexes');
});

Deno.test('Growth Mobile uses the shared, privacy-minimised member context contract', async () => {
  const index = await read('supabase/functions/api/index.ts');
  const dashboard = await read('supabase/functions/api/handlers/dashboard.ts');
  const page = await read('public/growth-mobile.html');
  const mobile = await read('public/assets/js/growth-mobile-ops.js');
  const baseMobile = await read('public/assets/js/growth-mobile.js');
  const start = dashboard.indexOf("case 'getGrowthMemberContext':");
  const end = dashboard.indexOf("case 'getMemberDetail':", start);
  const contract = dashboard.slice(start, end);
  assert(index.includes("'getGrowthMemberContext': 'dashboard'"), 'Growth-safe member context must be routed');
  assert(contract.includes('resolveChapterScope') && contract.includes("eq('chapter_id', scope.chapterId)"), 'Growth context must derive and enforce Chapter scope');
  assert(contract.includes('Growth context excludes Mentor logs, reviews, notes'), 'Growth context must document private-field exclusion');
  assert(!contract.includes('mentor_logs') && !contract.includes('member_notes') && !contract.includes('ninety_day_reviews'), 'Growth context must not query Mentor-private records');
  assert(page.includes('/assets/js/growth-mobile-ops.js'), 'the privacy-safe operational layer must be loaded by Growth Mobile');
  assert(mobile.includes("api('getGrowthMemberContext'") && !baseMobile.includes("api('getMemberDetail'"), 'every loaded Growth Mobile member-card path must use the privacy-minimised contract');
  assert(mobile.includes('window.growthMobileState') && mobile.includes('window.growthMobileApi') && mobile.includes("replace(/[&<>\"']/g"), 'Growth extension must use the explicit base-Mobile interface rather than private helpers');
});

Deno.test('Member Support OS shared context is role-safe and Chapter-scoped', async () => {
  const index = await read('supabase/functions/api/index.ts');
  const dashboard = await read('supabase/functions/api/handlers/dashboard.ts');
  const start = dashboard.indexOf("case 'getSharedMemberSupportContext':");
  const end = dashboard.indexOf("case 'getGrowthMemberContext':", start);
  const contract = dashboard.slice(start, end);
  assert(index.includes("'getSharedMemberSupportContext': 'dashboard'"), 'shared context must be routed');
  assert(contract.includes('resolveChapterScope') && contract.includes("eq('chapter_id', scope.chapterId)"), 'shared context must derive Chapter scope');
  assert(contract.includes('const isGrowthLens') && contract.includes('const isMentorLens'), 'lens must be derived from authenticated role');
  assert(!contract.includes('mentor_logs') && !contract.includes('member_notes') && !contract.includes('ninety_day_reviews'), 'shared context must not query Mentor-private records');
  assert(contract.includes('Shared context excludes Mentor logs, notes, reviews'), 'privacy rule must be explicit in the response contract');
});

Deno.test('Member Support OS handoff reuses signals with tenant-safe duplicate prevention', async () => {
  const index = await read('supabase/functions/api/index.ts');
  const members = await read('supabase/functions/api/handlers/members.ts');
  const start = members.indexOf('case "createSupportHandoff":');
  const end = members.indexOf('case "getMemberSignalHistory":', start);
  const contract = members.slice(start, end);
  assert(index.includes("'createSupportHandoff': 'members'"), 'handoff action must be routed');
  assert(contract.includes('resolveChapterScope') && contract.includes("eq('chapter_id', scope.chapterId)"), 'handoff member must be scoped to the authenticated Chapter');
  assert(contract.includes('support-handoff:${scope.chapterId}:${memberId}:${intent}:${target}'), 'duplicate key must include server-derived Chapter, member, intent and target');
  assert(contract.includes("subject_type:'support_handoff'") && contract.includes('safe_context:true'), 'handoff must be represented by existing Member Signal infrastructure');
  assert(contract.includes('คำขอเดิมปิดแล้ว'), 'closed handoff must not silently reopen');
});

Deno.test('Growth Mobile operations expose safe handoff status and auditable actions', async () => {
  const index = await read('supabase/functions/api/index.ts');
  const members = await read('supabase/functions/api/handlers/members.ts');
  const access = await read('supabase/functions/_shared/member-signal-access.ts');
  const growth = await read('supabase/functions/api/handlers/growth.ts');
  const mobile = await read('public/assets/js/growth-mobile-ops.js');
  const migration = await read('supabase/migrations/20260913000002_growth_mobile_os.sql');
  assert(index.includes("'getGrowthSupportHandoffs': 'members'"), 'safe Growth handoff status must be routed');
  assert(members.includes('case "getGrowthSupportHandoffs":') && members.includes("eq('chapter_id', scope.chapterId)"), 'handoffs must use server-derived Chapter scope');
  assert(members.includes("payload.source_role") && members.includes("payload.safe_context === true"), 'Growth must only receive its own safe handoff context');
  assert(access.includes("isOwnSafeHandoff") && access.includes("payload.safe_context === true"), 'shared signal access must preserve private Mentor boundaries');
  assert(growth.includes("nextStatus === 'completed' && !response"), 'task completion must require an outcome server-side');
  assert(growth.includes("select('id,status,due_date').single()"), 'new task id must be returned for trackable follow-on state');
  assert(growth.includes("eq('idempotency_key', idempotencyKey)") && growth.includes("error.code === '23505'") && migration.includes('idx_growth_tasks_chapter_idempotency'), 'Growth action retries and concurrent submissions must be deduplicated inside the authenticated Chapter');
  assert(mobile.includes('function nextActions()') && mobile.includes('function renderWorkload()'), 'Mobile must render prioritized actions and workload');
  assert(mobile.includes("data-opportunity-action") && mobile.includes("data-profile-request") && mobile.includes("data-talk-member"), 'Mobile must convert conversations, opportunities and profile review into tracked actions');
});

Deno.test('Growth member detail keeps Growth overview after async enrichment', async () => {
  const source = await read('public/assets/js/desktop-operations.js');
  assert(source.includes("if(s)s.innerHTML=S.role==='mc'?buildIMDScore(mem):buildIMDGrOverview(mem);"));
  assert(source.includes("document.getElementById('imd-sub').textContent=(mem.mentor?teamDisplayName(mem.mentor):'ไม่มีทีม');"));
  assert(source.includes("gsr('getMSBMemberIntelligence',{role:S.role,memberId:m.memberId}"));
});

Deno.test('Growth Mobile access stays role-specific from admin UI through invite copy', async () => {
  const ui = await read('public/assets/js/desktop-mobile-access.js');
  const settings = await read('supabase/functions/admin-api/handlers/settings.ts');
  const claimPage = await read('public/mobile-access.html');
  assert(ui.includes('approvedRole:ctx.access.role'), 'Admin access lookup and update must include the selected Mobile role');
  assert(settings.includes("assignmentQuery.eq('role', requestedRole)"), 'Existing access must be filtered by the requested role');
  assert(settings.includes("String(invite.approved_role) === 'growth' ? 'Growth Mobile' : 'Mentor Mobile'"), 'Invite copy must name the correct Mobile product');
  assert(claimPage.includes("info.invite.approvedRole==='growth'?'Growth Mobile':'Mentor Mobile'"), 'Claim page must show Growth branding for Growth invitations');
  assert(ui.includes('window.openGrowthMobileAccess'), 'Growth Mobile access dialog must be available');
  const operations = await read('public/assets/js/desktop-operations.js');
  assert(operations.includes("accessButton('lt-growth-lead')") && operations.includes("var id='lt-growth-co-'"), 'Growth Lead and both Co-Leads must each expose Mobile access management');
  assert(operations.includes('กรุณาบันทึก Growth Team ก่อนจัดการสิทธิ์'), 'Growth Mobile access must follow the saved Growth Team assignment');
});

Deno.test('Blueprint Intelligence separates each Growth workflow into one visible workspace view', async () => {
  const page = await read('public/dashboard.html');
  const source = await read('public/assets/js/desktop-blueprint-workspace.js');
  for (const view of ['table','radar','followups','quality','pairs','calendar','comparison']) {
    assert(source.includes(`['${view}'`), `Blueprint navigation must expose ${view}`);
    assert(page.includes(`data-msb-view="${view}"`), `Blueprint workspace must contain ${view}`);
  }
  assert(source.includes("window.MSB_GROWTH_VIEW='table'"), 'Chapter Blueprint Table must be the default view');
  assert(source.includes("panel.hidden=panel.getAttribute('data-msb-view')!==view"), 'Only the selected Blueprint workflow may remain visible');
});

Deno.test('workspace chooser presents Mentor and Growth with explicit Desktop and Mobile actions', async () => {
  const page = await read('public/index.html');
  const script = await read('public/assets/js/mobile-operations.js');
  assert(page.includes('>Mentor</h2>') && page.includes('>Growth</h2>'), 'Workspace chooser must name its two work areas clearly');
  assert(page.includes("entryOpenDesktop('mc')") && page.includes("entryOpenMobile('mc')"), 'Mentor must expose Desktop and Mobile actions');
  assert(page.includes("entryOpenDesktop('growth')") && page.includes('entryOpenGrowthMobile()'), 'Growth must expose Desktop and Mobile actions');
  assert(script.includes("getElementById('entry-growth-group')") && script.includes("growth.style.display=isOwner?'block':'none'"), 'Growth workspace visibility must remain server-derived from the authenticated owner identity');
});

Deno.test('successful 1-2-1 profile reminder results are not marked failed in the UI', async () => {
  const source = await read('public/assets/js/desktop-one-to-one.js');
  assert(source.includes("if(response&&response.ok)updateLineBulkRows(chunkIds,'sent',response.results||[])"), 'Successful reminder batches must default to sent while preserving provider-specific result statuses');
  assert(!source.includes("if(response&&response.ok)updateLineBulkRows(chunkIds,'failed',response.results||[])"), 'Successful reminder batches must never be labeled failed');
});

Deno.test('Weekly MY121 roots, aliases and operator reads are tenant-scoped', async () => {
  const handler = await read('supabase/functions/api/handlers/weekly-121.ts');
  const migration = await read('supabase/migrations/20260914000000_phase_2d_scoped_one_to_one.sql');
  assert(handler.includes('resolveChapterScope(db, auth)') && handler.includes('const chapterId = scope.chapterId'), 'Weekly MY121 must derive Chapter scope from authenticated access');
  assert(handler.includes("insert({chapter_id:chapterId,meeting_date:meetingDate") && handler.includes("eq('chapter_id',chapterId).order('meeting_date'"), 'round creation and history must use the resolved Chapter');
  assert(handler.includes("eq('matching_rounds.chapter_id',chapterId)") && handler.includes('activePairMemberIds(db,chapterId'), 'active-pair detection must not mix Chapters');
  assert(handler.includes("eq('chapter_id',chapterId).eq('normalized_name',normalizedName)") && handler.includes("insert({chapter_id:chapterId,normalized_name:normalizedName"), 'remembered CSV aliases must be unique and queried inside one Chapter');
  assert(handler.includes('async function loadDetail(db:any,roundId:string,chapterId:string)') && handler.includes("select('*').eq('chapter_id',chapterId).eq('id',roundId)"), 'round detail access must verify Chapter ownership before child reads');
  assert(!handler.includes('p.chapterId') && !handler.includes('p.chapter_id'), 'Weekly MY121 must never trust browser-supplied Chapter scope');
  assert(migration.includes('one_to_one_member_name_aliases_chapter_name_key') && migration.includes('idx_matching_rounds_chapter_status'), 'tenant-scoped uniqueness and lookup indexes must exist');
  assert(migration.includes('trg_matching_pair_chapter_scope') && migration.includes('Invitation members must belong to the same Chapter'), 'database guards must reject cross-Chapter pairs and member invitations');
  assert(migration.includes('INSERT INTO public.matching_rounds(chapter_id') && migration.includes('VALUES(v_round.chapter_id'), 'database-owned round creation and replacement must preserve Chapter scope');
});

Deno.test('Mentor MY121 applies the authenticated Chapter before team filtering', async () => {
  const handler = await read('supabase/functions/api/handlers/mentor-121.ts');
  assert(handler.includes("resolveChapterScope(db,auth)") && handler.includes('const chapterId=chapterScope.chapterId'), 'Mentor MY121 must derive Chapter scope from authenticated access');
  assert(handler.includes("String(member?.chapter_id||'')===chapterId"), 'Mentor-team access must also require the member Chapter');
  assert(handler.includes("eq('matching_rounds.chapter_id',chapterId)"), 'pair operations and timelines must root reads in the Chapter-scoped round');
  assert(handler.includes("round:matching_rounds!inner(chapter_id)"), 'retry delivery must prove its matching round belongs to the Chapter');
});

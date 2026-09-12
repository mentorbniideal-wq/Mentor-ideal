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

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
  return [...source.matchAll(/case\s+'([^']+)'/g)].map(match => match[1]);
}

function frontendActions(source: string): string[] {
  return [...source.matchAll(/\b(?:gsr|call)\(\s*['"]([A-Za-z0-9_]+)['"]/g)]
    .map(match => match[1]);
}

Deno.test('every API handler case is registered in the unified router', async () => {
  const indexSource = await read('supabase/functions/api/index.ts');
  const routes = routeActions(indexSource);
  const handlerFiles = [
    'supabase/functions/api/handlers/auth.ts',
    'supabase/functions/api/handlers/dashboard.ts',
    'supabase/functions/api/handlers/public.ts',
    'supabase/functions/api/handlers/members.ts',
    'supabase/functions/api/handlers/coaching.ts',
    'supabase/functions/api/handlers/checkin.ts',
    'supabase/functions/api/handlers/renewal.ts',
    'supabase/functions/api/handlers/growth.ts',
    'supabase/functions/api/handlers/power-teams.ts',
    'supabase/functions/api/handlers/121.ts',
    'supabase/functions/api/handlers/alerts.ts',
    'supabase/functions/api/handlers/meetings.ts',
    'supabase/functions/api/handlers/comms.ts',
    'supabase/functions/api/handlers/line-admin.ts',
    'supabase/functions/api/handlers/usage.ts',
    'supabase/functions/api/handlers/notifications.ts',
    'supabase/functions/api/handlers/copilot.ts',
  ];

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
  const [indexSource, dashboardSource, lineAdminSource] = await Promise.all([
    read('supabase/functions/api/index.ts'),
    read('public/dashboard.html'),
    read('public/admin/line.html'),
  ]);
  const routes = routeActions(indexSource);
  const actions = unique([
    ...frontendActions(dashboardSource),
    ...frontendActions(lineAdminSource),
  ]);
  const missing = actions.filter(action => !routes.has(action));

  assert(missing.length === 0, `Frontend API calls missing from ROUTES:\n${missing.join('\n')}`);
});

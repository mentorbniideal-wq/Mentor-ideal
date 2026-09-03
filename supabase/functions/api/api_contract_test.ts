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

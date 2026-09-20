#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = new URL('..', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'my-ideal-runtime-'));
const run = (extra, expected = 0) => {
  const output = join(dir, `${Math.random()}.js`);
  const result = spawnSync(process.execPath, ['scripts/generate-runtime-config.mjs'], { cwd: root, env: { ...process.env, RUNTIME_CONFIG_OUTPUT: output, RELEASE_SHA:'test', PUBLIC_APP_URL:'https://staging.example.test', PUBLIC_SUPABASE_ANON_KEY:'public-test', PRODUCTION_SUPABASE_URL:'https://production-ref.supabase.co', ...extra }, encoding:'utf8' });
  if (result.status !== expected) throw new Error(result.stderr || result.stdout || `expected ${expected}, got ${result.status}`);
  return output;
};
try {
  const staging = run({ MY_IDEAL_ENV:'staging', PUBLIC_SUPABASE_URL:'https://staging-ref.supabase.co', LINE_DELIVERY_ENABLED:'false' });
  if (readFileSync(staging,'utf8').includes('production-ref')) throw new Error('staging artifact leaked production ref');
  run({ MY_IDEAL_ENV:'staging', PUBLIC_SUPABASE_URL:'https://production-ref.supabase.co' }, 1);
  run({ MY_IDEAL_ENV:'staging', PUBLIC_SUPABASE_URL:'https://staging-ref.supabase.co', LINE_DELIVERY_ENABLED:'true' }, 1);
  const production = run({ MY_IDEAL_ENV:'production', PUBLIC_SUPABASE_URL:'https://production-ref.supabase.co', LINE_DELIVERY_ENABLED:'true' });
  if (!readFileSync(production,'utf8').includes('"production"')) throw new Error('production artifact missing environment');
  console.log('runtime config generation guards passed');
} finally { rmSync(dir, { recursive:true, force:true }); }

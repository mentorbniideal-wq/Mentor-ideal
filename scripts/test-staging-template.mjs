#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const source = readFileSync('.env.staging.example', 'utf8');
const vars = new Map();
for (const line of source.split(/\r?\n/)) {
  if (!line || line.startsWith('#')) continue;
  const index = line.indexOf('='); if (index < 1) continue;
  const key = line.slice(0, index);
  if (vars.has(key)) throw new Error(`Duplicate Staging variable: ${key}`);
  vars.set(key, line.slice(index + 1));
}
for (const key of ['MY_IDEAL_ENV','PUBLIC_APP_URL','PUBLIC_SUPABASE_URL','PUBLIC_SUPABASE_ANON_KEY','SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','PRODUCTION_SUPABASE_URL','MSB_FORM_URL','LINE_LIFF_URL','LINE_DELIVERY_ENABLED','LINE_WEBHOOK_ENABLED','DEV_MODE']) if (!vars.has(key)) throw new Error(`Missing Staging variable: ${key}`);
if (vars.get('MY_IDEAL_ENV') !== 'staging' || vars.get('LINE_DELIVERY_ENABLED') !== 'false' || vars.get('LINE_WEBHOOK_ENABLED') !== 'false' || vars.get('DEV_MODE') !== 'false') throw new Error('Unsafe Staging defaults');
if (vars.get('PUBLIC_LINE_LIFF_ID') !== '' || vars.get('LINE_CHANNEL_ACCESS_TOKEN') !== '' || vars.get('LINE_CHANNEL_SECRET') !== '') throw new Error('Staging must not contain LIFF or LINE credentials');
console.log('staging template is unambiguous and fail-closed');

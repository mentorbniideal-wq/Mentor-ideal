#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const env = process.env;
const required = ['MY_IDEAL_ENV', 'RELEASE_SHA', 'PUBLIC_APP_URL', 'PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY'];
const missing = required.filter((key) => !String(env[key] || '').trim());
if (missing.length) throw new Error(`Missing public runtime configuration: ${missing.join(', ')}`);
const environment = String(env.MY_IDEAL_ENV).trim();
if (!['local', 'staging', 'production'].includes(environment)) throw new Error('MY_IDEAL_ENV must be local, staging, or production');
const normalize = (value) => new URL(String(value).replace(/\/$/, '')).toString().replace(/\/$/, '');
const supabaseUrl = normalize(env.PUBLIC_SUPABASE_URL);
const appUrl = normalize(env.PUBLIC_APP_URL);
const protectedProductionUrl = String(env.PRODUCTION_SUPABASE_URL || '').trim();
if (environment === 'staging') {
  if (!protectedProductionUrl) throw new Error('PRODUCTION_SUPABASE_URL is required to validate staging');
  if (normalize(protectedProductionUrl) === supabaseUrl) throw new Error('Staging cannot use the Production Supabase project');
  if (String(env.LINE_DELIVERY_ENABLED || '').toLowerCase() === 'true') throw new Error('LINE delivery must be disabled in staging');
}
if (environment === 'production' && protectedProductionUrl && normalize(protectedProductionUrl) !== supabaseUrl) throw new Error('Production public config must use the protected Production Supabase URL');
const config = {
  environment,
  release: String(env.RELEASE_SHA).trim(),
  appUrl,
  supabaseUrl,
  supabaseAnonKey: String(env.PUBLIC_SUPABASE_ANON_KEY).trim(),
  apiUrl: `${supabaseUrl}/functions/v1/api`,
  adminApiUrl: `${supabaseUrl}/functions/v1/admin-api`,
  liffApiUrl: `${supabaseUrl}/functions/v1/liff-api`,
  liffId: String(env.PUBLIC_LINE_LIFF_ID || ''),
  lineDeliveryEnabled: environment === 'production' && String(env.LINE_DELIVERY_ENABLED || '').toLowerCase() === 'true'
};
const output = resolve(env.RUNTIME_CONFIG_OUTPUT || 'public/assets/js/runtime-config.js');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `/* Generated: do not edit. Public values only. */\nwindow.__MY_IDEAL_RUNTIME_CONFIG__ = Object.freeze(${JSON.stringify(config, null, 2)});\n`);
console.log(`Generated ${output} for ${environment}`);

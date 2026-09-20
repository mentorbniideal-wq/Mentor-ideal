#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const file = process.argv[2] || 'public/assets/js/runtime-config.js';
const source = readFileSync(file, 'utf8');
if (/SERVICE_ROLE|CHANNEL_SECRET|CODE_PEPPER|CRON_SECRET|ANTHROPIC_API_KEY/i.test(source)) throw new Error('Server-only secret marker found in public runtime artifact');
const context = { window: {} }; vm.runInNewContext(source, context, { filename: file });
const c = context.window.__MY_IDEAL_RUNTIME_CONFIG__;
if (!c || !c.environment || !c.supabaseUrl || !c.apiUrl || !c.supabaseAnonKey) throw new Error('Runtime artifact is incomplete');
const origin = new URL(c.supabaseUrl).origin;
for (const key of ['apiUrl', 'adminApiUrl', 'liffApiUrl']) if (new URL(c[key]).origin !== origin) throw new Error(`${key} does not match Supabase URL`);
const production = process.env.PRODUCTION_SUPABASE_URL ? new URL(process.env.PRODUCTION_SUPABASE_URL).origin : '';
if (c.environment === 'staging' && (!production || origin === production || c.lineDeliveryEnabled)) throw new Error('Unsafe staging runtime artifact');
console.log(`Validated ${file} for ${c.environment}`);

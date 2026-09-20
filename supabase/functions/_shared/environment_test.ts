import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { serverEnvironment } from './environment.ts';

const keys = ['MY_IDEAL_ENV','PUBLIC_APP_URL','SUPABASE_URL','PRODUCTION_SUPABASE_URL','MSB_FORM_URL','LINE_LIFF_URL','LINE_DELIVERY_ENABLED'];
function withEnv(values: Record<string,string>, run: () => void) { const old = new Map(keys.map(k => [k, Deno.env.get(k)])); try { keys.forEach(k => Deno.env.delete(k)); Object.entries(values).forEach(([k,v]) => Deno.env.set(k,v)); run(); } finally { keys.forEach(k => { const v=old.get(k); if(v===undefined) Deno.env.delete(k); else Deno.env.set(k,v); }); } }
Deno.test('staging environment is isolated and LINE-disabled', () => withEnv({MY_IDEAL_ENV:'staging',PUBLIC_APP_URL:'https://staging.example.test',SUPABASE_URL:'https://staging-ref.supabase.co',PRODUCTION_SUPABASE_URL:'https://production-ref.supabase.co'}, () => assertEquals(serverEnvironment().lineDeliveryEnabled,false)));
Deno.test('staging rejects Production database and LINE delivery', () => withEnv({MY_IDEAL_ENV:'staging',PUBLIC_APP_URL:'https://staging.example.test',SUPABASE_URL:'https://production-ref.supabase.co',PRODUCTION_SUPABASE_URL:'https://production-ref.supabase.co'}, () => assertThrows(() => serverEnvironment())));

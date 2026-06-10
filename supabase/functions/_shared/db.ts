// Supabase client factory for Edge Functions
// Always uses service_role key → bypasses RLS for server-side API calls.
// Public endpoints that want RLS enforcement should use the anon client variant.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';

let _serviceClient: SupabaseClient | null = null;
let _anonClient: SupabaseClient | null = null;

/** Service-role client — use for all authenticated API operations. */
export function getServiceClient(): SupabaseClient {
  if (!_serviceClient) {
    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
    _serviceClient = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return _serviceClient;
}

/** Anon client — use only for the 3 public endpoints (getMemberDirectory, getSimulateData). */
export function getAnonClient(): SupabaseClient {
  if (!_anonClient) {
    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_ANON_KEY')!;
    if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not set');
    _anonClient = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return _anonClient;
}

/** Standard JSON response helper — includes CORS headers on every response. */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Error response matching GAS { ok:false, error:string } pattern. */
export function errResponse(message: string, status = 200): Response {
  return jsonResponse({ ok: false, error: message }, status);
}

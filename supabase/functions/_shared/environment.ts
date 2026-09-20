export type RuntimeEnvironment = 'local' | 'staging' | 'production';

export type ServerEnvironment = { environment: RuntimeEnvironment; appUrl: string; msbFormUrl: string; liffUrl: string; lineDeliveryEnabled: boolean };

function normalizedUrl(value: string, name: string): string {
  try { return new URL(value).toString().replace(/\/$/, ''); }
  catch { throw new Error(`${name} must be an absolute URL`); }
}

export function serverEnvironment(): ServerEnvironment {
  const environment = String(Deno.env.get('MY_IDEAL_ENV') || '').toLowerCase();
  if (!['local', 'staging', 'production'].includes(environment)) throw new Error('MY_IDEAL_ENV is required and must be local, staging, or production');
  const appUrl = normalizedUrl(String(Deno.env.get('PUBLIC_APP_URL') || ''), 'PUBLIC_APP_URL');
  const supabaseUrl = normalizedUrl(String(Deno.env.get('SUPABASE_URL') || ''), 'SUPABASE_URL');
  const protectedProductionUrl = String(Deno.env.get('PRODUCTION_SUPABASE_URL') || '');
  if (environment === 'staging') {
    if (!protectedProductionUrl) throw new Error('PRODUCTION_SUPABASE_URL is required in staging');
    if (normalizedUrl(protectedProductionUrl, 'PRODUCTION_SUPABASE_URL') === supabaseUrl) throw new Error('Staging cannot use Production Supabase URL');
  }
  const lineDeliveryEnabled = environment === 'production' && String(Deno.env.get('LINE_DELIVERY_ENABLED') || '').toLowerCase() === 'true';
  if (environment === 'staging' && lineDeliveryEnabled) throw new Error('LINE delivery is forbidden in staging');
  const msbFormUrl = normalizedUrl(String(Deno.env.get('MSB_FORM_URL') || `${appUrl}/member-success-blueprint`), 'MSB_FORM_URL');
  const liffUrl = normalizedUrl(String(Deno.env.get('LINE_LIFF_URL') || `${appUrl}/liff/`), 'LINE_LIFF_URL');
  if (environment === 'staging' && [appUrl, msbFormUrl, liffUrl].some((url) => /bni-mentor-system\.vercel\.app/i.test(url))) throw new Error('Staging URL points to Production');
  return { environment: environment as RuntimeEnvironment, appUrl, msbFormUrl, liffUrl, lineDeliveryEnabled };
}

export function requireLineDeliveryEnabled(): void {
  if (!serverEnvironment().lineDeliveryEnabled) throw new Error('LINE delivery is disabled for this environment');
}

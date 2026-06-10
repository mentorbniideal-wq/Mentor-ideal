// Auth handler — login + changePIN
import { getServiceClient, jsonResponse } from '../../_shared/db.ts';
import { verifyPin } from '../../_shared/auth.ts';

export async function handleAuth(p: Record<string, unknown>): Promise<Response> {
  const db     = getServiceClient();
  const action = String(p.action || '');

  // ── login ────────────────────────────────────────────────────
  if (action === 'login') {
    const role = String(p.role || '').toLowerCase();
    const pin = String(p.pin || '');

    if (!role) {
      return jsonResponse({ ok: false, error: 'Role is required' });
    }

    const auth = await verifyPin(db, role, pin);
    if (!auth.ok) return jsonResponse({ ok: false, error: auth.error });

    const { data: ver } = await db
      .from('settings')
      .select('key, value')
      .in('key', ['APP_VERSION']);
    const version = ver?.find((r: { key: string }) => r.key === 'APP_VERSION')?.value || 'v4.0';

    return jsonResponse({
      ok:          true,
      role:        auth.role,
      isMC:        auth.isMC,
      teamName:    auth.teamName,
      displayName: auth.displayName,
      version,
    });
  }

  // ── changePIN ────────────────────────────────────────────────
  if (action === 'changePIN') {
    // Must provide current PIN to change it
    const role    = String(p.role    || '').toLowerCase();
    const oldPin  = String(p.oldPin  || '');
    const newPin  = String(p.newPin  || '');

    if (!role || !oldPin || !newPin) {
      return jsonResponse({ ok: false, error: 'ต้องระบุ role, oldPin, newPin' });
    }
    if (newPin.length < 4) {
      return jsonResponse({ ok: false, error: 'PIN ต้องมีอย่างน้อย 4 ตัว' });
    }

    // Verify old PIN first
    const { data: verified } = await db
      .rpc('fn_verify_pin', { p_role: role, p_pin: oldPin })
      .single();
    if (!verified) return jsonResponse({ ok: false, error: 'PIN เดิมไม่ถูกต้อง' });

    // Update with new bcrypt hash
    const { error: updateErr } = await db.rpc('fn_update_pin', {
      p_role:    role,
      p_new_pin: newPin,
    });
    if (updateErr) return jsonResponse({ ok: false, error: updateErr.message });

    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: false, error: `unknown auth action: ${action}` });
}

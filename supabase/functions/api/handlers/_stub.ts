// ============================================================
// Handler stub template — copy this file to implement each handler.
// Replace "DOMAIN" with the actual domain name.
// ============================================================
// import { requireAuth } from '../../_shared/auth.ts';
// import { getServiceClient, jsonResponse } from '../../_shared/db.ts';
//
// export async function handleDOMAIN(p: Record<string, unknown>): Promise<Response> {
//   const db = getServiceClient();
//   const action = String(p.action || '');
//
//   // Verify auth (omit allowedRoles to allow any valid role)
//   const auth = await requireAuth(db, p /*, ['mc', 'toomtam'] */);
//   if (!auth.ok) return jsonResponse({ ok: false, error: auth.error });
//
//   if (action === 'myAction') {
//     // TODO: implement
//     return jsonResponse({ ok: true });
//   }
//
//   return jsonResponse({ ok: false, error: `unknown action: ${action}` });
// }

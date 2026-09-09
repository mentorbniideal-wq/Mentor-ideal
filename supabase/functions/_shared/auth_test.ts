import { requireAuth, verifyToken, SYSTEM_OWNER_EMAIL } from './auth.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { canAccessAdminSection } from './capabilities.ts';
import { requireAdminAccess } from './admin-auth.ts';
import { canAccessTeam } from './authorization.ts';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function withIdentity(row: Record<string, unknown>, run: (db: SupabaseClient, pattern: () => string) => Promise<void>, identityEmail = 'a_b%test@example.test') {
  const previousFetch = globalThis.fetch;
  const previousUrl = Deno.env.get('SUPABASE_URL');
  const previousKey = Deno.env.get('SUPABASE_ANON_KEY');
  let emailPattern = '';
  Deno.env.set('SUPABASE_URL', 'https://identity.test');
  Deno.env.set('SUPABASE_ANON_KEY', 'test-only');
  globalThis.fetch = (() => Promise.resolve(Response.json({ id: 'test-user', email: identityEmail }))) as typeof fetch;
  const query = {
    select() { return this; },
    ilike(_column: string, pattern: string) { emailPattern = pattern; return this; },
    maybeSingle() { return Promise.resolve({ data: { email: identityEmail, ...row }, error: null }); },
  };
  const db = { from: () => query } as unknown as SupabaseClient;
  try { await run(db, () => emailPattern); }
  finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) Deno.env.delete('SUPABASE_URL'); else Deno.env.set('SUPABASE_URL', previousUrl);
    if (previousKey === undefined) Deno.env.delete('SUPABASE_ANON_KEY'); else Deno.env.set('SUPABASE_ANON_KEY', previousKey);
  }
}

Deno.test('OAuth read-only deadline blocks writes while retaining the original read scope', async () => {
  await withIdentity({ role: 'growth', read_only_after: '2000-01-01', admin_edit_access: true }, async db => {
    const write = await requireAuth(db, { token: 'test', action: 'saveGrowthData', role: 'admin' });
    assert(!write.ok, 'Past deadline must deny writes despite client role');
    const read = await requireAuth(db, { token: 'test', action: 'getGrowthData' }, ['growth']);
    assert(read.ok && read.isReadOnly && !read.isAdmin && !read.adminEditAccess, 'Read access must not become admin');
    const forbidden = await requireAuth(db, { token: 'test', action: 'getOtherTeam' }, ['mc']);
    assert(!forbidden.ok, 'Read-only must preserve allowedRoles');
  });
});

Deno.test('OAuth viewer cannot write even with legacy editor flags', async () => {
  await withIdentity({ role: 'viewer', is_mc: true, admin_edit_access: true }, async db => {
    assert(!(await requireAuth(db, { token: 'test', action: 'sendBroadcast' })).ok, 'Viewer write must fail');
    assert((await requireAuth(db, { token: 'test', action: 'getDashboard' })).ok, 'Viewer read remains available');
  });
});

Deno.test('future read-only deadline preserves active editor access', async () => {
  await withIdentity({ role: 'growth', read_only_after: '2999-01-01', admin_edit_access: true }, async db => {
    const auth = await requireAuth(db, { token: 'test', action: 'saveGrowthData' }, ['growth']);
    assert(auth.ok && !auth.isReadOnly && auth.adminEditAccess, 'Future deadline must not disable current editor');
  });
});

Deno.test('verified email lookup treats SQL wildcard characters literally', async () => {
  await withIdentity({ role: 'growth' }, async (db, pattern) => {
    assert((await verifyToken(db, 'test')).ok, 'Identity lookup must succeed');
    assert(pattern() === 'a\\_b\\%test@example.test', 'Email must not match another account using ILIKE wildcards');
  });
});

Deno.test('admin section writes honor read-only and viewer flags before admin bypass', () => {
  for (const subject of [{ isAdmin: true, isReadOnly: true }, { isAdmin: true, isViewer: true }]) {
    assert(!canAccessAdminSection(subject, 'settings', true), 'Read-only admin flags must not permit writes');
    assert(canAccessAdminSection(subject, 'settings'), 'Read access remains available');
  }
});

Deno.test('OAuth rejects a different email even if the lookup returns a row', async () => {
  await withIdentity({ role: 'mc', email: 'another@example.test' }, async db => {
    assert(!(await verifyToken(db, 'test')).ok, 'A mismatched identity must fail closed');
  });
});

Deno.test('verified OAuth role matrix keeps caller scope despite client role and chapter claims', async t => {
  for (const role of ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp', 'mentor_support', 'growth', 'viewer']) {
    await t.step(role, async () => {
      await withIdentity({ role, is_mc: role === 'mc', team_name: 'team-a', admin_sections: ['members'], admin_edit_access: role !== 'viewer' }, async db => {
        const payload = { token: 'test', action: 'getDashboard', role: 'admin', chapter_id: 'foreign-chapter', isAdmin: true };
        const own = await requireAuth(db, payload, [role]);
        assert(own.ok && own.role === role && !own.isAdmin, 'Use verified role only');
        assert(!(await requireAuth(db, payload, ['admin'])).ok, 'Cannot become Admin');
        assert(!(await requireAdminAccess(db, payload, 'settings')).ok, 'Cannot read an unassigned admin section');
        assert((await requireAdminAccess(db, payload, 'members')).ok, 'Assigned section read remains available');
        const write = await requireAdminAccess(db, { ...payload, action: 'updateAdminMember' }, 'members', { write: true });
        assert(write.ok === (role !== 'viewer'), 'Assigned editor access follows server policy');
        if (!own.isMC) assert(!canAccessTeam(own, 'team-b'), 'Client cannot expand member team access');
      });
    });
  }
});

Deno.test('only verified system-owner identity gets unrestricted Admin access', async () => {
  await withIdentity({ role: 'admin', is_admin: true, capabilities: ['*'] }, async db => {
    const result = await requireAuth(db, { token: 'test', action: 'getDashboard' });
    assert(result.ok && !result.isAdmin && !result.capabilities?.includes('*'), 'DB flags must not elevate another identity');
  });
  await withIdentity({ role: 'admin' }, async db => {
    const result = await requireAdminAccess(db, { token: 'test', action: 'updateAdminMember' }, 'members', { write: true });
    assert(result.ok && result.isSystemOwner && result.isAdmin, 'Verified owner remains authorized');
  }, SYSTEM_OWNER_EMAIL);
});

Deno.test('suspended, future and expired assignments fail before role authorization', async () => {
  for (const restriction of [{ access_status: 'suspended' }, { access_starts_at: '2999-01-01' }, { access_expires_at: '2000-01-01' }]) {
    await withIdentity({ role: 'mc', ...restriction }, async db => {
      assert(!(await requireAuth(db, { token: 'test', action: 'getDashboard', role: 'admin' })).ok, 'Inactive assignment must fail');
    });
  }
});

Deno.test('missing credentials and forged roles cannot trigger PIN database verification', async () => {
  const db = { rpc() { throw new Error('No verification permitted without credentials'); } } as unknown as SupabaseClient;
  for (const payload of [{}, { role: 'mc' }, { role: 'admin' }, { role: 'unknown', pin: 'test' }]) {
    assert(!(await requireAuth(db, { action: 'getDashboard', ...payload })).ok, 'Unauthenticated request must fail');
  }
});

Deno.test('PIN role matrix preserves viewer reads and rejects writes and cross-role access', async t => {
  for (const role of ['mc', 'toomtam', 'aof', 'draft', 'phai', 'amp', 'mentor_support', 'growth', 'viewer']) {
    await t.step(role, async () => {
      const db = { rpc(_name: string, args: { p_role: string; p_pin: string }) {
        assert(args.p_role === role, 'Verify the credential against its role');
        return { single: async () => ({ data: args.p_pin === 'test-only' ? { role } : null, error: null }) };
      } } as unknown as SupabaseClient;
      const payload = { action: 'getDashboard', role, pin: 'test-only', chapter_id: 'foreign-chapter' };
      assert((await requireAuth(db, payload, [role])).ok, 'Valid PIN read must succeed');
      const write = await requireAuth(db, { ...payload, action: 'saveData' }, [role]);
      assert(write.ok === (role !== 'viewer'), 'Viewer cannot write');
      if (role !== 'viewer') assert(!(await requireAuth(db, payload, ['admin'])).ok, 'Non-admin PIN cannot assume Admin');
      assert(!(await requireAuth(db, { ...payload, pin: 'invalid' })).ok, 'Invalid PIN must fail');
    });
  }
});

Deno.test('invalid OAuth token never falls back to a supplied PIN', async () => {
  await withIdentity({ role: 'mc' }, async db => {
    globalThis.fetch = (() => Promise.resolve(Response.json({ message: 'invalid token' }, { status: 401 }))) as typeof fetch;
    const result = await requireAuth(db, { token: 'invalid', role: 'mc', pin: 'test-only', action: 'getDashboard' });
    assert(!result.ok, 'Invalid OAuth must fail closed, without PIN fallback');
  });
});

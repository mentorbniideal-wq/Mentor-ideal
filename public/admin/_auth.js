// Admin panel shared auth — Google OAuth, MC-only
(function() {
  const SUPABASE_URL  = 'https://itwyjhlfemxsfbimshby.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_vTX2pRpd9axDyAuMHTVhDQ_zfS1VE-j';
  const ADMIN_API     = 'https://itwyjhlfemxsfbimshby.supabase.co/functions/v1/admin-api';

  window.ADMIN_API = ADMIN_API;

  function getSbAuth() {
    const { createClient } = window.supabase;
    if (!getSbAuth._client) {
      getSbAuth._client = createClient(SUPABASE_URL, SUPABASE_ANON);
    }
    return getSbAuth._client;
  }
  window.getSbAuth = getSbAuth;

  // Call admin-api with current session token
  async function adminCall(payload) {
    const sb = getSbAuth();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = '/index.html'; return null; }
    payload.token = session.access_token;
    const res = await fetch(ADMIN_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  }
  window.adminCall = adminCall;

  // Check auth and MC permission on page load
  async function checkAdminAuth() {
    const sb = getSbAuth();

    // Handle OAuth redirect
    await new Promise(resolve => {
      const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          subscription.unsubscribe();
          resolve();
        } else if (event === 'SIGNED_OUT') {
          subscription.unsubscribe();
          resolve();
        }
      });
      // Fallback timeout
      setTimeout(() => { subscription.unsubscribe(); resolve(); }, 2000);
    });

    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = '/index.html'; return null; }

    const res = await fetch('https://itwyjhlfemxsfbimshby.supabase.co/functions/v1/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getMyRole', token: session.access_token }),
    });
    const role = await res.json();
    const sections = Array.isArray(role.adminSections) ? role.adminSections : [];
    const page = (window.location.pathname.split('/').pop() || 'index.html').replace('.html','');
    const pageSection = page === 'index' ? 'dashboard' : page;
    const canUseAdmin = role.ok && (role.isMC || sections.length > 0);
    if (!canUseAdmin) {
      window.location.href = '/admin/request-access.html';
      return null;
    }
    if (!role.isMC && !sections.includes(pageSection)) {
      window.location.href = '/admin/' + (sections[0] === 'dashboard' ? 'index' : sections[0]) + '.html';
      return null;
    }

    // Store in window for page scripts
    window.ADMIN_SESSION = {
      token: session.access_token,
      displayName: role.displayName,
      isMC: Boolean(role.isMC),
      sections,
      editAccess: Boolean(role.adminEditAccess),
    };

    const linkSections = {
      'index.html':'dashboard', 'members.html':'members', 'issues.html':'issues',
      'checkin.html':'checkin', 'revenue.html':'revenue',
      'broadcast.html':'broadcast', 'settings.html':'settings',
    };
    document.querySelectorAll('nav a[href]').forEach(link => {
      const section = linkSections[link.getAttribute('href')];
      if (section && !role.isMC && !sections.includes(section)) link.remove();
    });

    const nameEl = document.getElementById('adminName');
    if (nameEl) nameEl.textContent = role.displayName || 'MC';

    // Show pending access request badge on Settings nav link
    if (role.isMC) _loadRequestBadge();

    return window.ADMIN_SESSION;
  }

  async function _loadRequestBadge() {
    try {
      const r = await adminCall({ action: 'getAccessRequests' });
      if (!r || !r.ok) return;
      const pending = (r.requests || []).filter(req => req.status === 'pending').length;
      if (pending > 0) {
        document.querySelectorAll('a[href="settings.html"]').forEach(link => {
          if (!link.querySelector('.req-badge')) {
            const b = document.createElement('span');
            b.className = 'req-badge';
            b.style.cssText = 'background:#ef4444;color:#fff;padding:1px 6px;border-radius:10px;font-size:10px;margin-left:5px;font-weight:700;';
            b.textContent = String(pending);
            link.appendChild(b);
          }
        });
      }
    } catch(e) { /* non-critical */ }
  }
  window._loadRequestBadge = _loadRequestBadge;
  window.checkAdminAuth = checkAdminAuth;

  window.adminLogout = async function() {
    await getSbAuth().auth.signOut();
    window.location.href = '/index.html';
  };

  // Format helpers shared by all admin pages
  window.fmt = {
    thb: (n) => Number(n||0).toLocaleString('th-TH') + ' ฿',
    pct: (n) => Number(n||0).toFixed(0) + '%',
    date: (s) => s ? new Date(s).toLocaleDateString('th-TH', { year:'2-digit', month:'short', day:'numeric' }) : '—',
    tl: (t) => ({ green:'🟢', yellow:'🟡', red:'🔴', black:'⚫' }[t] || '•'),
  };
})();

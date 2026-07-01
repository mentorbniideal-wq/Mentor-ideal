// Admin panel auth — PIN-based (works in LINE browser and all standard browsers)
(function () {
  const SUPABASE_ANON = 'sb_publishable_vTX2pRpd9axDyAuMHTVhDQ_zfS1VE-j';
  const ADMIN_API     = 'https://itwyjhlfemxsfbimshby.supabase.co/functions/v1/admin-api';
  const API_HEADERS   = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON };
  const SESSION_KEY   = 'bni_admin_pin_session';

  window.ADMIN_API = ADMIN_API;

  // ── Session helpers ─────────────────────────────────────────
  function getStoredSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }
  function storeSession(s) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
  }
  function clearStoredSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  }

  // ── adminCall: send pin+role with every request ─────────────
  async function adminCall(payload) {
    const sess = getStoredSession();
    if (!sess) { redirectToLogin(); return null; }
    const body = Object.assign({}, payload, { role: sess.role, pin: sess.pin });
    const res = await fetch(ADMIN_API, { method: 'POST', headers: API_HEADERS, body: JSON.stringify(body) });
    const r = await res.json();
    // Session expired / invalid PIN → force re-login
    if (!r.ok && r.error && /(PIN|ไม่ถูกต้อง|Authentication failed|Admin access required)/i.test(r.error)) {
      clearStoredSession();
      showPinModal(window._adminAuthResolve);
    }
    return r;
  }
  window.adminCall = adminCall;

  // ── Logout ──────────────────────────────────────────────────
  window.adminLogout = function () { clearStoredSession(); redirectToLogin(); };

  function redirectToLogin() { window.location.href = '/admin/index.html'; }

  // ── Format helpers shared by all admin pages ─────────────────
  window.fmt = {
    thb:  n => Number(n || 0).toLocaleString('th-TH') + ' ฿',
    pct:  n => Number(n || 0).toFixed(0) + '%',
    date: s => s ? new Date(s).toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric' }) : '—',
    tl:   t => ({ green: '🟢', yellow: '🟡', red: '🔴', black: '⚫' }[t] || '•'),
  };

  // ── PIN Modal UI ─────────────────────────────────────────────
  var _resolveLogin = null;

  function showPinModal(resolve) {
    _resolveLogin = resolve;
    var existing = document.getElementById('_adminPinModal');
    if (existing) existing.remove();

    var el = document.createElement('div');
    el.id = '_adminPinModal';
    el.style.cssText = 'position:fixed;inset:0;background:#0a1628;display:flex;align-items:center;justify-content:center;z-index:99999;font-family:Poppins,sans-serif';
    el.innerHTML =
      '<div style="background:#0e2040;border-radius:16px;padding:36px 28px;width:320px;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,.6)">'
      + '<div style="font-size:36px;margin-bottom:8px">⚙️</div>'
      + '<div style="font-size:20px;font-weight:700;color:#d7fefa;margin-bottom:4px">BNI Admin</div>'
      + '<div style="font-size:12px;color:#7a9bb5;margin-bottom:24px">ใส่ Role และ PIN เพื่อเข้าใช้งาน</div>'
      + '<select id="_aRole" style="width:100%;padding:10px 12px;margin-bottom:12px;border-radius:8px;border:1px solid #1a3a5c;background:#0a1628;color:#e8f4f8;font-size:13px">'
      + '<option value="mc">MC (พีท)</option>'
      + '<option value="toomtam">Mentor: TOOMTAM</option>'
      + '<option value="aof">Mentor: Aof</option>'
      + '<option value="draft">Mentor: Draft</option>'
      + '<option value="phai">Mentor: PHAI</option>'
      + '<option value="amp">Mentor: AMP</option>'
      + '<option value="growth">Growth</option>'
      + '</select>'
      + '<input id="_aPin" type="password" placeholder="PIN" maxlength="10" autocomplete="current-password"'
      + ' style="width:100%;padding:13px;margin-bottom:14px;border-radius:8px;border:1px solid #1a3a5c;background:#0a1628;color:#e8f4f8;font-size:20px;text-align:center;letter-spacing:6px;outline:none"'
      + ' onkeydown="if(event.key===\'Enter\')window._adminPinSubmit()">'
      + '<button onclick="window._adminPinSubmit()" id="_aBtn"'
      + ' style="width:100%;padding:12px;border-radius:8px;border:none;background:#3dd6f5;color:#0a1628;font-size:14px;font-weight:700;cursor:pointer;transition:.15s">'
      + 'เข้าสู่ระบบ</button>'
      + '<div id="_aErr" style="color:#ff6b6b;font-size:12px;margin-top:12px;min-height:1.2em"></div>'
      + '</div>';
    document.body.appendChild(el);
    setTimeout(function () { var i = document.getElementById('_aPin'); if (i) i.focus(); }, 100);
  }

  window._adminPinSubmit = async function () {
    var role  = document.getElementById('_aRole').value;
    var pin   = document.getElementById('_aPin').value.trim();
    var errEl = document.getElementById('_aErr');
    var btn   = document.getElementById('_aBtn');
    errEl.textContent = '';
    if (!pin) { errEl.textContent = 'กรุณาใส่ PIN'; return; }

    btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ...';

    try {
      const res = await fetch(ADMIN_API, {
        method: 'POST', headers: API_HEADERS,
        body: JSON.stringify({ action: 'getAdminSessionInfo', role, pin }),
      });
      const r = await res.json();

      if (!r.ok) {
        errEl.textContent = r.error || 'PIN ไม่ถูกต้อง';
        btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
        return;
      }
      if (!r.isMC && (!r.adminSections || r.adminSections.length === 0)) {
        errEl.textContent = 'บัญชีนี้ไม่มีสิทธิ์เข้า Admin Panel';
        btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
        return;
      }

      storeSession({ role, pin });
      window.ADMIN_SESSION = {
        pin, role,
        displayName:  r.displayName || role.toUpperCase(),
        isMC:         Boolean(r.isMC),
        sections:     r.adminSections || [],
        editAccess:   Boolean(r.adminEditAccess),
      };

      // Update name display
      var nameEl = document.getElementById('adminName');
      if (nameEl) nameEl.textContent = window.ADMIN_SESSION.displayName;

      // Update nav links for non-MC
      if (!r.isMC && r.adminSections) _applyNavRestrictions(r.adminSections);

      var modal = document.getElementById('_adminPinModal');
      if (modal) modal.remove();

      if (typeof _resolveLogin === 'function') { _resolveLogin(window.ADMIN_SESSION); _resolveLogin = null; }
    } catch (e) {
      errEl.textContent = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
      btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
    }
  };

  function _applyNavRestrictions(sections) {
    const linkSections = {
      'index.html': 'dashboard', 'members.html': 'members', 'issues.html': 'issues',
      'checkin.html': 'checkin', 'revenue.html': 'revenue',
      'broadcast.html': 'broadcast', 'settings.html': 'settings',
    };
    document.querySelectorAll('nav a[href]').forEach(function (link) {
      var sec = linkSections[link.getAttribute('href')];
      if (sec && !sections.includes(sec)) link.remove();
    });
  }

  // ── checkAdminAuth: called by every admin page on load ───────
  async function checkAdminAuth() {
    return new Promise(function (resolve) {
      var sess = getStoredSession();
      if (sess && sess.pin && sess.role) {
        // Restore session from storage (no re-verify needed — next API call will fail if PIN changed)
        // But we need display info: call getAdminSessionInfo once to populate ADMIN_SESSION
        fetch(ADMIN_API, {
          method: 'POST', headers: API_HEADERS,
          body: JSON.stringify({ action: 'getAdminSessionInfo', role: sess.role, pin: sess.pin }),
        }).then(function (r) { return r.json(); }).then(function (r) {
          if (!r.ok) {
            clearStoredSession();
            showPinModal(resolve);
            return;
          }
          // Check page-level access
          var page = (window.location.pathname.split('/').pop() || 'index.html').replace('.html', '');
          var pageSection = page === 'index' ? 'dashboard' : page;
          var canAccess = r.isMC || (r.adminSections || []).includes(pageSection);
          if (!canAccess) {
            var first = (r.adminSections || [])[0];
            window.location.href = '/admin/' + (first === 'dashboard' ? 'index' : (first || 'index')) + '.html';
            return;
          }
          window.ADMIN_SESSION = {
            pin: sess.pin, role: sess.role,
            displayName:  r.displayName || sess.role.toUpperCase(),
            isMC:         Boolean(r.isMC),
            sections:     r.adminSections || [],
            editAccess:   Boolean(r.adminEditAccess),
          };
          var nameEl = document.getElementById('adminName');
          if (nameEl) nameEl.textContent = window.ADMIN_SESSION.displayName;
          if (!r.isMC && r.adminSections) _applyNavRestrictions(r.adminSections);
          if (r.isMC) _loadRequestBadge();
          resolve(window.ADMIN_SESSION);
        }).catch(function () { clearStoredSession(); showPinModal(resolve); });
      } else {
        showPinModal(resolve);
      }
    });
  }
  window.checkAdminAuth = checkAdminAuth;

  async function _loadRequestBadge() {
    try {
      var r = await adminCall({ action: 'getAccessRequests' });
      if (!r || !r.ok) return;
      var pending = (r.requests || []).filter(function (req) { return req.status === 'pending'; }).length;
      if (pending > 0) {
        document.querySelectorAll('a[href="settings.html"]').forEach(function (link) {
          if (!link.querySelector('.req-badge')) {
            var b = document.createElement('span');
            b.className = 'req-badge';
            b.style.cssText = 'background:#ef4444;color:#fff;padding:1px 6px;border-radius:10px;font-size:10px;margin-left:5px;font-weight:700;';
            b.textContent = String(pending);
            link.appendChild(b);
          }
        });
      }
    } catch (e) { /* non-critical */ }
  }
  window._loadRequestBadge = _loadRequestBadge;

  // Keep getSbAuth for any page that still imports Supabase SDK (e.g. request-access.html)
  window.getSbAuth = function () {
    if (window.supabase && window.supabase.createClient) {
      if (!window._sbAuthClient) {
        window._sbAuthClient = window.supabase.createClient(
          'https://itwyjhlfemxsfbimshby.supabase.co', SUPABASE_ANON
        );
      }
      return window._sbAuthClient;
    }
    return null;
  };
})();

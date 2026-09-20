/* Public runtime configuration guard. Loaded before every API/OAuth consumer. */
(function () {
  var c = window.__MY_IDEAL_RUNTIME_CONFIG__;
  var required = ['environment', 'release', 'appUrl', 'supabaseUrl', 'supabaseAnonKey', 'apiUrl', 'adminApiUrl', 'liffApiUrl'];
  var invalid = !c || required.some(function (key) { return !c[key] || typeof c[key] !== 'string'; });
  if (!invalid) {
    try {
      var sb = new URL(c.supabaseUrl);
      invalid = !/^https:$/.test(sb.protocol) || new URL(c.apiUrl).origin !== sb.origin || new URL(c.adminApiUrl).origin !== sb.origin || new URL(c.liffApiUrl).origin !== sb.origin;
    } catch (_) { invalid = true; }
  }
  if (invalid) {
    window.__MY_IDEAL_RUNTIME_CONFIG_ERROR__ = 'การตั้งค่าระบบไม่พร้อม กรุณาติดต่อผู้ดูแลระบบ';
    return;
  }
  window.MY_IDEAL_RUNTIME = Object.freeze(c);
  window.SUPABASE_API = c.apiUrl;
  window.SUPABASE_ANON = c.supabaseAnonKey;
})();

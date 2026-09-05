import fs from 'node:fs';

const css = fs.readFileSync('public/assets/css/login-experience.css', 'utf8');
const html = fs.readFileSync('public/index.html', 'utf8');

if (!/@media\(max-width:620px\)[\s\S]*\.gw-card\{width:100%!important;max-width:100%!important/.test(css)) {
  throw new Error('mobile login card must be constrained by its padded parent');
}
if (/max-width:calc\(100dvw/.test(css)) throw new Error('mobile login must not double-count viewport width and parent padding');
if (!/login-experience\.css\?v=20260906-audit\.1/.test(html)) throw new Error('login CSS cache key is stale');

console.log('Login responsive contract passed.');

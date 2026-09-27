import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const menu = readFileSync('supabase/functions/_shared/line-rich-menu.ts', 'utf8');
const liff = readFileSync('public/liff/index.html', 'utf8');

assert.match(menu, /Member Goal Setting[\s\S]*LIFF_URL\?action=blueprint/, 'one-page MY GOAL opens the LIFF Blueprint bridge');
assert.match(menu, /uri\('blueprint'\)/, 'tabbed MY GOAL opens the same LIFF Blueprint bridge');
assert.doesNotMatch(menu, /label: 'Member Goal Setting'[\s\S]{0,160}type: 'message'/, 'MY GOAL no longer sends an intermediate chat command');

assert.match(liff, /async function openBlueprintFromRichMenu\(\)/, 'LIFF provides a direct Blueprint redirect flow');
assert.match(liff, /api\(\{action:'member-blueprint-link'\}\)/, 'LIFF obtains the member-scoped token from the server');
assert.match(liff, /target\.origin!==location\.origin\|\|target\.pathname!=='\/member-success-blueprint'/, 'LIFF validates the redirect destination');
assert.match(liff, /getRequestedAction\(\)==='blueprint'/, 'LIFF invokes the direct flow only for the Blueprint action');

console.log('PASS Rich Menu Blueprint entry: direct authenticated LIFF bridge with validated member-scoped redirect');

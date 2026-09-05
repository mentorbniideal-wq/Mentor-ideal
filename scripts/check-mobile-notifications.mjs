import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync('public/index.html', 'utf8');
const js = readFileSync('public/assets/js/mobile-operations.js', 'utf8');
const sw = readFileSync('public/sw.js', 'utf8');
const api = readFileSync('supabase/functions/api/handlers/notifications.ts', 'utf8');
const cron = readFileSync('supabase/functions/cron-jobs/index.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260905000119_web_push_notifications.sql', 'utf8');
const stabilization = readFileSync('supabase/migrations/20260905000120_mobile_notification_stabilization.sql', 'utf8');

assert.match(html, /rel="manifest"/);
assert.match(html, /push-permission-card/);
assert.match(html, /push-test-btn/);
assert.match(html, /id="mentor-bell" onclick="openNotifPanel\(\)"/);
assert.match(html, /id="growth-bell" onclick="openNotifPanel\(\)"/);
assert.match(js, /serviceWorker\.register\('\/sw\.js'\)/);
assert.match(js, /call\('getNotifications'/);
assert.match(js, /Notification\.requestPermission\(\)/);
assert.doesNotMatch(js.slice(js.indexOf('// ── Notification Center v2')), /call\('getAlertCenter'/);
assert.match(sw, /addEventListener\('push'/);
assert.match(sw, /addEventListener\('notificationclick'/);
assert.match(api, /case 'subscribeWebPush'/);
assert.match(api, /case 'sendWebPushTest'/);
assert.match(api, /mentor_support/);
assert.match(api, /recipientKey\(auth\)/);
assert.match(cron, /webPushDispatch/);
assert.match(migration, /UNIQUE\(chapter_id, endpoint_hash\)/);
assert.match(migration, /UNIQUE\(notification_id\)/);
assert.match(migration, /web_push_delivery_attempts/);
assert.doesNotMatch(migration, /LINE_CHANNEL|LINE_TOKEN|LINE_SECRET/);
assert.match(stabilization, /recipient_keys TEXT\[\]/);
assert.match(stabilization, /purge_mobile_operational_history/);
assert.doesNotMatch(sw, /hit \|\| caches\.match\('\/index\.html'\)/);

console.log('Mobile notification architecture guard passed.');

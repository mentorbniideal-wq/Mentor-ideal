import { stat } from 'node:fs/promises';

const budgets = [
  ['public/assets/js/desktop-operations.js', 720_000],
  ['public/assets/js/desktop-member-360.js', 20_000],
  ['public/assets/js/mobile-operations.js', 460_000],
  ['public/assets/css/desktop-operations.css', 130_000],
  ['public/assets/css/desktop-member-360.css', 8_000],
  ['public/assets/css/mobile-operations.css', 150_000],
  ['public/dashboard.html', 210_000],
  ['public/index.html', 110_000],
  ['public/liff/index.html', 200_000],
  ['public/liff/chapter-home.css', 8_000],
  ['public/liff/chapter-home.js', 12_000],
  ['public/liff/help-center.css', 12_000],
  ['public/liff/help-center.js', 10_000],
  ['public/liff/chapter-directory.css', 8_000],
  ['public/liff/chapter-directory.js', 14_000],
];

let failed = false;
for (const [file, limit] of budgets) {
  const { size } = await stat(file);
  const percent = Math.round((size / limit) * 100);
  const status = size <= limit ? 'PASS' : 'FAIL';
  console.log(`${status.padEnd(4)} ${file} ${size}/${limit} bytes (${percent}%)`);
  if (size > limit) failed = true;
}

if (failed) {
  console.error('Web performance budget exceeded. Split or remove code before deployment.');
  process.exit(1);
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/assets/css/desktop-operations.css', import.meta.url), 'utf8');
const dark = css.match(/body\.dark\s*\{([^}]+)\}/)?.[1];
assert.ok(dark, 'Dark theme must exist');
for (const color of ['gr', 'ye', 're']) {
  const value = dark.match(new RegExp(`--${color}:([^;]+);`))?.[1]?.trim();
  assert.ok(value && value !== `var(--${color})`, `Dark theme ${color} color must not refer to itself`);
}
console.log('Desktop dark Trend colors are defined');

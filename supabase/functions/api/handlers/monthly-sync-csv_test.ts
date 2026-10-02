import { parseCsvString } from './growth.ts';

Deno.test('Monthly Sync reads BOM, quoted commas and multiline CSV cells without shifting rows', () => {
  const rows = parseCsvString('\uFEFFName,Looking For,Score\r\n"Test Member","Hotel, restaurant\r\nnew branch",0\r\n');
  if (JSON.stringify(rows) !== JSON.stringify([
    ['Name', 'Looking For', 'Score'],
    ['Test Member', 'Hotel, restaurant\nnew branch', '0'],
  ])) throw new Error('CSV rows were shifted or zero was lost');
});

Deno.test('Monthly Sync rejects an incomplete quoted CSV field', () => {
  let rejected = false;
  try { parseCsvString('Name,Score\n"Test Member,0'); } catch { rejected = true; }
  if (!rejected) throw new Error('malformed CSV was accepted');
});

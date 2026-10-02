import { normalizeName, parseCsvString, parseR2YRows } from './growth.ts';

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

Deno.test('R2Y export UI suffix is removed without guessing a different member', () => {
  const name = 'TEST Member (BNI Ideal) Export All Loading...No data is available to display';
  if (normalizeName(name) !== 'test member') throw new Error('R2Y name did not match the stable roster name');
  if (normalizeName('TEST Member Loading...') !== 'test member loading...') throw new Error('unverified suffix was removed');
  const csv = parseCsvString('Name,RG,RR,Unnamed,121,CEU,TYFCB,Points,BNI Days\n"TEST Member (BNI Ideal) Export All Loading...No data is available to display",0,1,,2,3,0,65,365');
  const unmatched: string[] = [];
  const parsed = parseR2YRows(csv, { 'test member': '00000000-0000-0000-0000-000000000001' }, unmatched);
  if (parsed.length !== 1 || unmatched.length || parsed[0].rg !== 0 || parsed[0].member_id !== '00000000-0000-0000-0000-000000000001') throw new Error('R2Y row did not match the correct member with zero intact');
});

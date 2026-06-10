#!/usr/bin/env -S deno run --allow-read --allow-net --allow-env
/**
 * import-line-members.ts
 * ──────────────────────
 * ⚠️  CRITICAL MIGRATION STEP — preserves existing LINE registrations.
 *     Run this BEFORE cutover. Failure means members must re-register.
 *
 * Source: Google Sheet "📱 LINE MEMBERS"
 * Expected columns (export as CSV):
 *   A = LINE User ID  (Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)
 *   B = Full member name (must exactly match members.name in Supabase)
 *   C = Nickname (optional — used as fallback display name)
 *   D = Registered at (timestamp, optional)
 *
 * Usage:
 *   export SUPABASE_URL=https://<ref>.supabase.co
 *   export SUPABASE_SERVICE_ROLE_KEY=<key>
 *   deno run --allow-read --allow-net --allow-env scripts/import-line-members.ts line_members.csv
 *
 * How to export the LINE MEMBERS sheet:
 *   1. Open Google Sheets
 *   2. Click the "📱 LINE MEMBERS" sheet tab
 *   3. File → Download → Comma Separated Values (.csv)
 *   4. Save as line_members.csv in this directory
 *
 * What this script does:
 *   - Reads each row: lineUserId, memberName
 *   - Looks up the member's UUID in Supabase by name (exact match)
 *   - Upserts into line_members(line_user_id, member_id)
 *   - Reports unmatched names so you can fix them manually
 *
 * Name mismatch fixes:
 *   If a name in the LINE sheet doesn't match Supabase exactly, the script
 *   will print it as UNMATCHED. Fix by either:
 *   (a) Update the name in the LINE sheet CSV before re-running, or
 *   (b) Run the --patch flag with a JSON patch file (see below)
 *
 * Patch file format (name-patches.json):
 *   { "LINE Sheet Name": "Supabase Exact Name", ... }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parse as parseCsv } from 'https://deno.land/std@0.224.0/csv/parse.ts';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars required');
  Deno.exit(1);
}

const csvPath = Deno.args[0];
if (!csvPath) {
  console.error('Usage: deno run ... import-line-members.ts <path-to-line_members.csv> [--patch name-patches.json]');
  Deno.exit(1);
}

// ── Load optional name patches ────────────────────────────────
let patches: Record<string, string> = {};
const patchFlag = Deno.args.indexOf('--patch');
if (patchFlag !== -1 && Deno.args[patchFlag + 1]) {
  const patchFile = Deno.args[patchFlag + 1];
  try {
    patches = JSON.parse(await Deno.readTextFile(patchFile));
    console.log(`Loaded ${Object.keys(patches).length} name patches from ${patchFile}`);
  } catch (e) {
    console.error(`Failed to load patch file ${patchFile}:`, e);
    Deno.exit(1);
  }
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── 1. Load all members from Supabase (name → id map) ─────────
const { data: memberRows, error: membersErr } = await db
  .from('members')
  .select('id, name')
  .eq('is_archived', false);

if (membersErr) { console.error('Failed to load members:', membersErr); Deno.exit(1); }

const memberIdByName: Record<string, string> = {};
for (const m of (memberRows || []) as { id: string; name: string }[]) {
  memberIdByName[m.name.toLowerCase().trim()] = m.id;
}
console.log(`Loaded ${Object.keys(memberIdByName).length} members from Supabase`);

// ── 2. Parse LINE members CSV ─────────────────────────────────
const raw = await Deno.readTextFile(csvPath);
const rows = parseCsv(raw, { skipFirstRow: false }).slice(1); // skip header row
console.log(`Parsed ${rows.length} LINE registration rows`);

// ── 3. Match LINE users to Supabase member IDs ────────────────
type LineInsert = { line_user_id: string; member_id: string };

const toInsert: LineInsert[] = [];
const unmatched: Array<{ lineId: string; name: string }> = [];
const invalid: string[] = [];

for (const row of rows) {
  const lineId  = (row[0] || '').trim();
  const rawName = (row[1] || '').trim();

  if (!lineId) { invalid.push(JSON.stringify(row)); continue; }
  if (!lineId.startsWith('U') || lineId.length !== 33) {
    console.warn(`  [WARN] Possibly invalid LINE User ID: ${lineId}`);
  }
  if (!rawName) { invalid.push(lineId + '(no name)'); continue; }

  // Apply patch if available
  const memberName = patches[rawName] || rawName;
  const memberId   = memberIdByName[memberName.toLowerCase().trim()];

  if (!memberId) {
    unmatched.push({ lineId, name: rawName });
    continue;
  }

  toInsert.push({ line_user_id: lineId, member_id: memberId });
}

// ── 4. Report before writing ──────────────────────────────────
console.log(`\n── Pre-import summary ───────────────────────────────────`);
console.log(`  Matched:   ${toInsert.length}`);
console.log(`  Unmatched: ${unmatched.length}`);
console.log(`  Invalid:   ${invalid.length}`);

if (unmatched.length > 0) {
  console.log('\n⚠️  UNMATCHED LINE registrations (will NOT be imported):');
  for (const { lineId, name } of unmatched) {
    console.log(`  Line ID: ${lineId}  →  Name in sheet: "${name}"`);
  }
  console.log('\nTo fix: add entries to name-patches.json and re-run with --patch name-patches.json');
  console.log('Example name-patches.json:');
  const example: Record<string, string> = {};
  for (const { name } of unmatched.slice(0, 3)) {
    example[name] = '← correct Supabase name here';
  }
  console.log(JSON.stringify(example, null, 2));
}

if (invalid.length > 0) {
  console.log('\n🚫 Invalid/skipped rows:', invalid);
}

if (toInsert.length === 0) {
  console.log('\nNothing to import. Exiting.');
  Deno.exit(unmatched.length > 0 ? 1 : 0);
}

// ── 5. Confirm before writing ─────────────────────────────────
console.log(`\nAbout to upsert ${toInsert.length} LINE registrations.`);
if (Deno.stdin.isTerminal()) {
  const answer = prompt('Proceed? (yes/no): ');
  if (answer?.toLowerCase() !== 'yes') {
    console.log('Aborted.');
    Deno.exit(0);
  }
}

// ── 6. Upsert line_members ────────────────────────────────────
const BATCH = 50;
let imported = 0;
let errors   = 0;

for (let i = 0; i < toInsert.length; i += BATCH) {
  const batch = toInsert.slice(i, i + BATCH);
  const { error } = await db.from('line_members').upsert(batch, {
    onConflict: 'line_user_id',
    ignoreDuplicates: false,
  });
  if (error) {
    console.error(`  [ERROR] batch ${i}–${i + batch.length - 1}:`, error.message);
    errors += batch.length;
  } else {
    imported += batch.length;
    console.log(`  Imported rows ${i + 1}–${i + batch.length}`);
  }
}

// ── 7. Final report ───────────────────────────────────────────
console.log(`\n${ errors === 0 ? '✅' : '⚠️ '} Done: ${imported} imported, ${errors} errors, ${unmatched.length} unmatched`);

if (unmatched.length > 0) {
  console.warn('⚠️  Unmatched members were NOT imported — fix name mismatches and re-run.');
}
if (errors > 0) {
  console.warn('⚠️  Some inserts failed — review errors above and re-run.');
  Deno.exit(1);
}
if (unmatched.length > 0) {
  Deno.exit(2); // non-zero but different code to distinguish from errors
}

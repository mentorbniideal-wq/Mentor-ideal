#!/usr/bin/env -S deno run --allow-read --allow-net --allow-env
/**
 * import-members.ts
 * ─────────────────
 * Imports members from the exported CSV of sheet "รายชื่อทั้งหมด" into Supabase.
 *
 * Source sheet columns (row 3 = first data row):
 *   A  = row# / sequence
 *   B  = name (English full name)
 *   C  = nickname (Thai)
 *   D  = mentor team name (TOOMTAM / Aof / Draft / PHAI / AMP / blank=non-mentored)
 *   E  = latest score (latest monthly score)
 *   F  = status / notes
 *   G  = given (฿)
 *   H  = received (฿)
 *   R  = mentor_status (col 18, 0-indexed 17)
 *
 * Usage:
 *   export SUPABASE_URL=https://<ref>.supabase.co
 *   export SUPABASE_SERVICE_ROLE_KEY=<key>
 *   deno run --allow-read --allow-net --allow-env scripts/import-members.ts members.csv
 *
 * Export CSV from Google Sheets: File → Download → CSV (for the รายชื่อทั้งหมด sheet).
 * The first two rows are headers — skip rows 1 and 2, data starts row 3.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parse as parseCsv } from 'https://deno.land/std@0.224.0/csv/parse.ts';

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars required');
  Deno.exit(1);
}

const csvPath = Deno.args[0];
if (!csvPath) {
  console.error('Usage: deno run ... import-members.ts <path-to-members.csv>');
  Deno.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── 1. Read + parse CSV ───────────────────────────────────────
const raw = await Deno.readTextFile(csvPath);
// Sheet has 2 header rows — skip them
const allRows = parseCsv(raw, { skipFirstRow: false });
const dataRows = allRows.slice(2); // row index 2 = sheet row 3

console.log(`Parsed ${dataRows.length} member rows`);

// ── 2. Valid mentor team names (exact match from mentor_teams table) ──────────
const VALID_TEAMS = new Set(['toomtam', 'aof', 'draft', 'phai', 'amp']);

// ── 3. Parse rows and build member records ────────────────────
type MemberInsert = {
  name: string;
  nickname: string | null;
  mentor_team: string | null;
  is_mentored: boolean;
  given_thb: number;
  received_thb: number;
  mentor_status: string | null;
  is_archived: boolean;
};

const members: MemberInsert[] = [];
const skipped: string[] = [];

for (const row of dataRows) {
  const name = (row[1] || '').trim();  // col B (0-indexed 1)
  if (!name) continue;                  // skip blank/header rows
  // Skip rows where col A is not a number (stray header rows from multiline CSV)
  if (!/^\d+$/.test((row[0] || '').trim())) continue;

  const nickname = (row[2] || '').trim() || null;              // col C
  const mentorRaw = (row[3] || '').trim();                     // col D
  const givenRaw = (row[6] || '0').replace(/[^0-9.]/g, '');   // col G
  const recvRaw  = (row[7] || '0').replace(/[^0-9.]/g, '');   // col H
  const statusRaw = row[17] ? (row[17] || '').trim() : null;  // col R (0-indexed 17)

  // Only TOOMTAM/Aof/Draft/PHAI/AMP are valid mentored teams
  // LT, PRESIDENT, VP, GW, ST CO, WEB CO, MENTOR CO. etc → non-mentored
  const teamKey = mentorRaw.toLowerCase();
  const mentorTeam = VALID_TEAMS.has(teamKey) ? mentorRaw : null;
  const isMentored = mentorTeam !== null;

  if (!isMentored && mentorRaw) {
    console.log(`  [non-mentored] "${name}" role="${mentorRaw}"`);
  }

  members.push({
    name,
    nickname,
    mentor_team: mentorTeam,
    is_mentored: isMentored,
    given_thb: parseFloat(givenRaw) || 0,
    received_thb: parseFloat(recvRaw) || 0,
    mentor_status: statusRaw || null,
    is_archived: false,
  });
}

console.log(`\nReady to import: ${members.length} members (${skipped.length} skipped)`);

// ── 4. Upsert members (conflict on name) ─────────────────────
const BATCH = 50;
let imported = 0;
let errors   = 0;

for (let i = 0; i < members.length; i += BATCH) {
  const batch = members.slice(i, i + BATCH);
  const { error } = await db.from('members').upsert(batch, {
    onConflict: 'name',
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

console.log(`\n✅ Done: ${imported} imported, ${errors} errors`);
if (errors > 0) {
  console.warn('⚠️  Some rows failed. Review errors above and re-run to retry.');
  Deno.exit(1);
}

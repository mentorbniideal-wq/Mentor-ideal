#!/usr/bin/env -S deno run --allow-read --allow-net --allow-env
/**
 * import-scores.ts
 * ────────────────
 * Imports monthly scores from mentor sheet CSVs into the monthly_scores table.
 * Also imports R2Y (Reporting2You) stats from the Reporting2You sheet.
 *
 * Run AFTER import-members.ts (depends on members.id).
 *
 * Usage:
 *   # Monthly scores (one CSV per mentor sheet):
 *   deno run ... import-scores.ts --monthly TOOMTAM.csv Aof.csv Draft.csv PHAI.csv AMP.csv
 *
 *   # R2Y stats (from Reporting2You sheet):
 *   deno run ... import-scores.ts --r2y Reporting2You.csv
 *
 * ── Mentor sheet CSV layout ─────────────────────────────────────
 *   Row 1–3 = header rows (skip)
 *   Row 4    = first member data row
 *   Col A    = row# (skip)
 *   Col B    = seq (skip)
 *   Col C    = Full name (English)
 *   Col D    = Nickname
 *   Col E    = JAN score   (col index 4)
 *   Col F    = FEB score   (col index 5)
 *   ...
 *   Col P    = DEC score   (col index 15)
 *   Col X    = Core issue JSON (col index 23, handled separately)
 *
 * ── R2Y sheet CSV layout ─────────────────────────────────────────
 *   Row 1    = header (skip)
 *   Row 2+   = data
 *   Col 1  = member name
 *   Col 2  = RG (Given Referrals)
 *   Col 3  = RR (Received Referrals)
 *   Col 4  = Visitors
 *   Col 5  = 1-2-1
 *   Col 6  = CEU
 *   Col 7  = TYFCB (฿)
 *   Col 8  = Official Points
 *   Col 9  = BNI Days
 *   Col 10 = P (Present)
 *   Col 11 = A (Absent)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parse as parseCsv } from 'https://deno.land/std@0.224.0/csv/parse.ts';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  Deno.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Detect year from current date (BNI fiscal = calendar year) ──
// If it's Jan–Mar, scores from previous year's Dec might exist
const CURRENT_YEAR = new Date().getFullYear();
const MONTH_NAMES  = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

// ── Load member name → UUID map ───────────────────────────────
async function loadMemberMap(): Promise<Record<string, string>> {
  const { data, error } = await db.from('members').select('id, name');
  if (error) { console.error('Failed to load members:', error); Deno.exit(1); }
  const map: Record<string, string> = {};
  for (const m of (data || []) as { id: string; name: string }[]) {
    map[m.name.toLowerCase().trim()] = m.id;
  }
  return map;
}

// ── Import monthly scores from one mentor sheet CSV ───────────
async function importMentor(csvPath: string, memberMap: Record<string, string>): Promise<void> {
  console.log(`\nImporting mentor sheet: ${csvPath}`);
  const raw  = await Deno.readTextFile(csvPath);
  const rows = parseCsv(raw, { skipFirstRow: false });
  const dataRows = rows.slice(3); // rows 1–3 = headers

  type ScoreInsert = { member_id: string; year: number; month: number; score: number; source: string };
  const toInsert: ScoreInsert[] = [];
  const unmatched: string[] = [];

  // Detect year from filename or use current year
  const yearMatch = csvPath.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1]) : CURRENT_YEAR;

  for (const row of dataRows) {
    const name = (row[2] || '').trim(); // col C (0-indexed 2)
    if (!name) continue;

    const memberId = memberMap[name.toLowerCase().trim()];
    if (!memberId) {
      unmatched.push(name);
      continue;
    }

    // Cols E–P = JAN–DEC = indices 4–15
    for (let colIdx = 4; colIdx <= 15; colIdx++) {
      const monthIdx = colIdx - 4; // 0=JAN, 11=DEC
      const raw = (row[colIdx] || '').trim();
      if (!raw) continue;
      const score = parseFloat(raw.replace(/[^0-9.]/g, ''));
      if (isNaN(score)) continue;

      toInsert.push({
        member_id: memberId,
        year,
        month: monthIdx + 1, // 1=JAN, 12=DEC
        score,
        source: 'traffic_light_csv',
      });
    }
  }

  if (unmatched.length > 0) {
    console.warn(`  ⚠️  Unmatched names (scores skipped):`);
    for (const n of unmatched) console.warn(`    - "${n}"`);
  }

  // Upsert in batches
  const BATCH = 100;
  let imported = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const { error } = await db.from('monthly_scores').upsert(batch, {
      onConflict: 'member_id,year,month',
      ignoreDuplicates: false,
    });
    if (error) console.error(`  [ERROR] batch ${i}:`, error.message);
    else imported += batch.length;
  }
  console.log(`  ✅ ${imported}/${toInsert.length} score records imported`);
}

// ── Import R2Y stats ─────────────────────────────────────────
async function importR2Y(csvPath: string, memberMap: Record<string, string>): Promise<void> {
  console.log(`\nImporting R2Y stats: ${csvPath}`);
  const raw  = await Deno.readTextFile(csvPath);
  const rows = parseCsv(raw, { skipFirstRow: false }).slice(1); // skip header row

  type R2YInsert = {
    member_id: string;
    rg: number; rr: number; visitors: number; one_to_one: number;
    ceu: number; tyfcb_thb: number; official_pts: number;
    bni_days: number; attend: number; absent: number;
    synced_at: string;
  };

  const toInsert: R2YInsert[] = [];
  const unmatched: string[] = [];

  for (const row of rows) {
    // Strip " (BNI Ideal)" suffix that Reporting2You adds to all names
    const name = (row[0] || '').trim().replace(/\s*\(BNI\s+Ideal\)\s*$/i, '');
    if (!name) continue;

    const memberId = memberMap[name.toLowerCase().trim()];
    if (!memberId) { unmatched.push(name); continue; }

    const n = (s: string) => parseFloat((s || '0').replace(/[^0-9.]/g, '')) || 0;

    toInsert.push({
      member_id:   memberId,
      rg:          n(row[1]),
      rr:          n(row[2]),
      visitors:    n(row[3]),
      one_to_one:  n(row[4]),
      ceu:         n(row[5]),
      tyfcb_thb:   n(row[6]),
      official_pts: n(row[7]),
      bni_days:    n(row[8]),
      attend:      n(row[9]),
      absent:      n(row[10]),
      synced_at:   new Date().toISOString(),
    });
  }

  if (unmatched.length > 0) {
    console.warn(`  ⚠️  Unmatched names:`);
    for (const n of unmatched) console.warn(`    - "${n}"`);
  }

  const BATCH = 100;
  let imported = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const { error } = await db.from('r2y_stats').upsert(batch, {
      onConflict: 'member_id',
      ignoreDuplicates: false,
    });
    if (error) console.error(`  [ERROR] batch ${i}:`, error.message);
    else imported += batch.length;
  }
  console.log(`  ✅ ${imported}/${toInsert.length} R2Y records imported`);
}

// ── Entry point ───────────────────────────────────────────────
const mode = Deno.args[0];
const files = Deno.args.slice(1);

if (!mode || (!['--monthly', '--r2y'].includes(mode)) || files.length === 0) {
  console.error('Usage:');
  console.error('  import-scores.ts --monthly TOOMTAM.csv Aof.csv ... (one per mentor sheet)');
  console.error('  import-scores.ts --r2y Reporting2You.csv');
  Deno.exit(1);
}

const memberMap = await loadMemberMap();
console.log(`Loaded ${Object.keys(memberMap).length} members`);

if (mode === '--monthly') {
  for (const f of files) await importMentor(f, memberMap);
} else if (mode === '--r2y') {
  await importR2Y(files[0], memberMap);
}

console.log('\n✅ Import complete');

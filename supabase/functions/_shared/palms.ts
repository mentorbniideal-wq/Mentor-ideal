// Port of PALMS scoring from WEBAPP.js — pure TypeScript, no DB dependency.
// Use this in Edge Functions for gap calculations & fast-track suggestions.
// For SQL queries, use fn_palms_score() Postgres function instead.

export interface PalmsInput {
  attend:  number;  // P
  absent:  number;  // A
  late:    number;  // L
  medical: number;  // M
  sub:     number;  // S
  rgi:     number;  // referrals given
  rgo:     number;  // referrals given out (usually 0 in R2Y)
  visitor: number;
  oto:     number;  // 1-2-1
  ceu:     number;
  tyfb:    number;  // TYFCB in THB
  bniDays: number;
}

export interface PalmsResult {
  weeks:     number;
  absence:   number;
  referral:  number;
  visitor:   number;
  oneToOne:  number;
  ceu:       number;
  tyfb:      number;
  total:     number;
  color:     'green' | 'yellow' | 'red' | 'black';
}

export function trafficLight(score: number): 'green' | 'yellow' | 'red' | 'black' {
  if (score >= 70) return 'green';
  if (score >= 50) return 'yellow';
  if (score >= 30) return 'red';
  return 'black';
}

export function effectiveWeeks(bniDays: number): number {
  return bniDays > 0 ? Math.min(26, Math.max(1, Math.floor(bniDays / 7))) : 1;
}

export function calcPalmsScore(d: PalmsInput): PalmsResult {
  const weeks = d.attend + d.absent + d.late + d.medical + d.sub;

  if (weeks === 0) {
    return { weeks: 0, absence: 0, referral: 0, visitor: 0, oneToOne: 0, ceu: 0, tyfb: 0, total: 0, color: 'black' };
  }

  // Absence (15 pts)
  const absence = d.absent === 0 ? 15 : d.absent === 1 ? 10 : d.absent === 2 ? 5 : 0;

  // Referral (15 pts) — NO 5-pt tier
  const rgRate = (d.rgi + d.rgo) / weeks;
  const referral = rgRate >= 2 ? 15 : rgRate >= 1 ? 10 : 0;

  // Visitor (20 pts)
  const visRate = d.visitor / (weeks / 4.333);
  const visitor = visRate >= 1 ? 20 : d.visitor > 0 ? 10 : 0;

  // 1-2-1 (15 pts)
  const otoRate = d.oto / weeks;
  const oneToOne = otoRate >= 2 ? 15 : otoRate >= 1 ? 10 : otoRate > 0 ? 5 : 0;

  // CEU (20 pts)
  const ceu = d.ceu >= 4 ? 20 : d.ceu >= 3 ? 15 : d.ceu >= 2 ? 10 : d.ceu >= 1 ? 5 : 0;

  // TYFB (15 pts)
  const tyfb = d.tyfb >= 500000 ? 15 : d.tyfb >= 200000 ? 10 : d.tyfb >= 100000 ? 5 : 0;

  const total = absence + referral + visitor + oneToOne + ceu + tyfb;
  return { weeks, absence, referral, visitor, oneToOne, ceu, tyfb, total, color: trafficLight(total) };
}

// Verified test cases from runTests() in WEBAPP.js
// Run with: deno test supabase/functions/_shared/palms.ts
if (import.meta.main) {
  const cases = [
    { name:'Archara',   attend:19,absent:0,late:0,medical:0,sub:4,  rgi:21,rgo:24,visitor:8,  oto:54,tyfb:901911,   ceu:10, expect:95 },
    { name:'Thitima',   attend:20,absent:0,late:0,medical:2,sub:1,  rgi:6, rgo:42,visitor:7,  oto:25,tyfb:31992540, ceu:6,  expect:95 },
    { name:'Ophat',     attend:18,absent:0,late:2,medical:2,sub:1,  rgi:10,rgo:29,visitor:2,  oto:41,tyfb:396866,   ceu:2,  expect:65 },
    { name:'Krisada',   attend:12,absent:2,late:5,medical:0,sub:0,  rgi:5, rgo:1, visitor:1,  oto:40,tyfb:10490,    ceu:2,  expect:40 },
    { name:'Narin',     attend:20,absent:1,late:0,medical:0,sub:2,  rgi:6, rgo:4, visitor:1,  oto:36,tyfb:149281,   ceu:5,  expect:55 },
    { name:'Tanyaluck', attend:15,absent:3,late:4,medical:0,sub:1,  rgi:9, rgo:7, visitor:2,  oto:32,tyfb:307831,   ceu:4,  expect:50 },
    { name:'Phitarn',   attend:23,absent:0,late:0,medical:0,sub:0,  rgi:20,rgo:12,visitor:3,  oto:50,tyfb:309206,   ceu:5,  expect:80 },
    { name:'CEU3Test',  attend:20,absent:0,late:0,medical:0,sub:6,  rgi:0, rgo:0, visitor:0,  oto:0, tyfb:0,        ceu:3,  expect:30 },
  ];
  let allPass = true;
  for (const c of cases) {
    const r = calcPalmsScore({ ...c, bniDays: 0 });
    const pass = r.total === c.expect;
    console.log(`${c.name}: got=${r.total} expect=${c.expect} ${pass ? '✅' : '❌ FAIL'}`);
    if (!pass) allPass = false;
  }
  console.log(allPass ? '\n✅ ALL 8 PASS' : '\n❌ SOME FAILED');
}

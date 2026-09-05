// Handler: public — no PIN required
// getMemberDirectory, getSimulateData, getMemberPublicDetail
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function text(value: unknown): string {
  return value == null ? '' : String(value);
}

function simTl(value: unknown): string {
  const tl = text(value) || 'none';
  return tl === 'black' ? 'blue' : tl;
}

function catsFromPalms(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  return {
    absent:   num(p.absence),
    ref:      num(p.referral),
    tyfcb:    num(p.tyfb),
    visitor:  num(p.visitor),
    one21:    num(p.oneToOne),
    training: num(p.ceu),
  };
}

type FtAction = { icon: string; cat: string; action: string; gain: number; curVal: string; tgtVal: string };

function computeFastTrack(cats: Record<string, number>, actual: Record<string, number>, bniDays: number): FtAction[] {
  const wks  = Math.max(1, Math.min(26, Math.floor(bniDays / 7)));
  const mos  = Math.max(1, wks / 4);
  const fmtB = (v: number) => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? Math.round(v / 1000) + 'K' : String(Math.round(v));
  const ft: FtAction[] = [];

  if (cats.absent < 15) {
    const gain = 5;
    const tgt  = cats.absent < 5 ? 'ขาด ≤2 ครั้ง' : cats.absent < 10 ? 'ขาด ≤1 ครั้ง' : 'ขาด 0 ครั้ง';
    ft.push({ icon: '📅', cat: 'ลดการขาด', gain, action: 'ลดการขาดประชุมให้เหลือน้อยกว่าเป้า', curVal: `ขาด ${actual.absent} ครั้ง`, tgtVal: tgt });
  }
  if (cats.ref < 15) {
    const gain = cats.ref === 0 ? 10 : 5;
    const tgt  = cats.ref === 0 ? '1 ใบ/สัปดาห์' : '2 ใบ/สัปดาห์';
    ft.push({ icon: '💡', cat: 'Referral', gain, action: 'ให้ Referral เพิ่มขึ้น', curVal: `${(actual.rg / wks).toFixed(1)} ใบ/สัปดาห์`, tgtVal: tgt });
  }
  if (cats.visitor < 20) {
    const gain = cats.visitor === 0 ? 10 : 10;
    const tgt  = cats.visitor === 0 ? 'พา Visitor อย่างน้อย 1 คน' : '≥1 คน/เดือน';
    ft.push({ icon: '👥', cat: 'Visitor', gain, action: 'พาคนนอกมาเยี่ยม Chapter', curVal: `${actual.visitor} คน (${(actual.visitor / mos).toFixed(1)}/เดือน)`, tgtVal: tgt });
  }
  if (cats.one21 < 15) {
    const gain = cats.one21 === 0 ? 5 : 5;
    const tgt  = cats.one21 === 0 ? 'ทำ 1-2-1 อย่างน้อย 1 ครั้ง' : cats.one21 < 10 ? '1 ครั้ง/สัปดาห์' : '2 ครั้ง/สัปดาห์';
    ft.push({ icon: '🤝', cat: '1-2-1', gain, action: 'เพิ่มการนัด 1-2-1 กับ Chapter', curVal: `${(actual.oToOne / wks).toFixed(1)} ครั้ง/สัปดาห์`, tgtVal: tgt });
  }
  if (cats.training < 20) {
    const gain = 5;
    const tgt  = cats.training === 0 ? '1 CEU' : cats.training < 10 ? '2 CEU' : cats.training < 15 ? '3 CEU' : '4+ CEU';
    ft.push({ icon: '📚', cat: 'CEU/Training', gain, action: 'เข้าร่วม Training / CEU เพิ่ม', curVal: `${actual.ceu} CEU`, tgtVal: tgt });
  }
  if (cats.tyfcb < 15) {
    const gain = 5;
    const tgt  = cats.tyfcb === 0 ? '฿100K' : cats.tyfcb < 10 ? '฿200K' : '฿500K';
    ft.push({ icon: '💰', cat: 'TYFCB', gain, action: 'เพิ่ม Closed Business จาก BNI', curVal: `฿${fmtB(actual.tyfcb)}`, tgtVal: tgt });
  }
  ft.sort((a, b) => b.gain - a.gain);
  return ft.slice(0, 4);
}

function actualFromRow(row: Record<string, unknown>): Record<string, number> {
  return {
    rg:      num(row.rg),
    visitor: num(row.visitors),
    oToOne:  num(row.one_to_one),
    ceu:     num(row.ceu),
    tyfcb:   num(row.tyfcb_thb),
    bniDays: num(row.bni_days),
    absent:  num(row.absent),
    attend:  num(row.attend),
    late:    num(row.late),
    medical: num(row.medical),
    sub:     num(row.sub),
  };
}

export async function handlePublic(p: Record<string, unknown>): Promise<Response> {
  const db     = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    case 'getPublicTeamCatalog': {
      const { data, error } = await db
        .from('mentor_teams')
        .select('name,leader_name,display_name')
        .order('id');
      if (error) return errResponse(error.message);
      const teams = ((data || []) as Record<string, unknown>[]).map((row) => ({
        code: text(row.name),
        displayName: text(row.display_name) || `ทีม ${text(row.leader_name) || text(row.name)}`,
      }));
      return jsonResponse({ ok: true, teams });
    }

    case 'getMemberDirectory': {
      const { data, error } = await db
        .from('v_member_dashboard')
        .select('id, name, nickname, mentor_team, display_score, traffic_light')
        .eq('is_archived', false)
        .order('name');
      if (error) return errResponse(error.message);

      const members = ((data || []) as Record<string, unknown>[]).map(m => {
        return {
          id:     m.id,
          name:   text(m.name),
          nick:   text(m.nickname),
          mentor: text(m.mentor_team),
          score:  num(m.display_score),
          tl:     text(m.traffic_light) || 'none',
        };
      });
      return jsonResponse({ ok: true, members, total: members.length });
    }

    case 'getSimulateData': {
      const { data, error } = await db
        .from('v_member_dashboard')
        .select('id, name, nickname, mentor_team, display_score, traffic_light, palms_detail, rg, visitors, one_to_one, ceu, tyfcb_thb, bni_days, absent, attend, late, medical, sub')
        .eq('is_archived', false)
        .order('name');
      if (error) return errResponse(error.message);

      const rows = (data || []) as Record<string, unknown>[];
      const memberIds = rows.map(m => String(m.id));
      const { data: scoreRows } = memberIds.length
        ? await db.from('monthly_scores').select('member_id, year, month, score')
            .in('member_id', memberIds)
            .order('year', { ascending: true }).order('month', { ascending: true })
        : { data: [] };
      const MLABELS = ['','JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
      const histMap: Record<string, { year: number; month: number; label: string; score: number | null }[]> = {};
      for (const s of (scoreRows || []) as Record<string, unknown>[]) {
        const mid = String(s.member_id);
        if (!histMap[mid]) histMap[mid] = [];
        histMap[mid].push({ year: num(s.year), month: num(s.month), label: MLABELS[num(s.month)] || '', score: num(s.score) || null });
      }

      const members = rows.map(m => {
        const cats    = catsFromPalms(m.palms_detail);
        const actual  = actualFromRow(m);
        const bniDays = num(m.bni_days);
        return {
          name:         text(m.name),
          nick:         text(m.nickname),
          mentor:       text(m.mentor_team),
          bniScore:     num(m.display_score),
          bniTl:        simTl(m.traffic_light),
          cats,
          actual,
          fastTrack:    cats ? computeFastTrack(cats, actual, bniDays) : [],
          scoreHistory: histMap[String(m.id)] || [],
        };
      });
      return jsonResponse({ ok: true, members });
    }

    case 'getMemberPublicDetail': {
      const name = String(p.name || '').trim();
      if (!name) return errResponse('name required');
      const { data, error } = await db
        .from('v_member_dashboard')
        .select('id, name, nickname, mentor_team, display_score, traffic_light, palms_detail, rg, visitors, one_to_one, ceu, tyfcb_thb, bni_days, absent, attend, late, medical, sub')
        .eq('name', name)
        .single();
      if (error) return errResponse(error.message);
      const m = data as Record<string, unknown>;
      return jsonResponse({
        ok: true,
        member: {
          id:       m.id,
          name:     text(m.name),
          nick:     text(m.nickname),
          mentor:   text(m.mentor_team),
          score:    num(m.display_score),
          tl:       text(m.traffic_light) || 'none',
          bniScore: num(m.display_score),
          bniTl:    simTl(m.traffic_light),
          cats:     catsFromPalms(m.palms_detail),
          actual:   actualFromRow(m),
        },
      });
    }

    // ── getTrainingEvents — public, no auth ─────────────────────
    // Returns events in the same shape as TRAINING_EVENTS hardcoded array in index.html
    // so they merge seamlessly in trAllEvents().
    case 'getTrainingEvents': {
      const daysAhead = Math.min(365, Math.max(7, Number(p.daysAhead || 120)));
      const today = new Date();
      const from = today.toISOString().split('T')[0];
      const until = new Date(today.getTime() + daysAhead * 86400000).toISOString().split('T')[0];

      const { data: rows, error } = await db.from('bni_events')
        .select('event_no,name,event_date,time_start,time_end,ceu,category,audience,is_online,location,price_thb,note_th,venue_region')
        .gte('event_date', from)
        .lte('event_date', until)
        .order('event_date', { ascending: true });
      if (error) return errResponse(error.message);

      // Map category → course value expected by frontend trTags()
      const courseMap: Record<string, string> = {
        msp: 'msp', skill: 'skill', lt: 'club', club: 'club', event: 'event',
      };
      // Map audience string → audience array expected by trMatch()
      const audMap: Record<string, string[]> = {
        all: [], mentor: ['mentor', 'leader'], growth: ['mentor'],
        new_member: ['new'], lt: ['leader'], president: ['leader'],
        vp: ['leader'], st: ['leader'],
      };

      const events = (rows || []).map((r: Record<string, unknown>) => {
        const name   = String(r.name || '');
        const cat    = String(r.category || 'skill');
        const tStart = String(r.time_start || '').slice(0, 5);
        const tEnd   = String(r.time_end   || '').slice(0, 5);
        const audStr = String(r.audience || 'all');
        const ceu    = Number(r.ceu) || 0;

        // Determine course sub-type
        let course = courseMap[cat] || 'event';
        if (cat === 'msp' && name.includes('Advanced')) course = 'advanced';
        if (cat === 'skill') {
          if (name.includes('1-2-1')) course = '121';
          else if (name.includes('Networking')) course = 'networking';
        }

        // Build audience array
        const audArr: string[] = [...(audMap[audStr] || [])];
        if (ceu > 0 && !audArr.includes('ceu')) audArr.push('ceu');
        if (audArr.length === 0) audArr.push('ceu'); // default

        return {
          date:         String(r.event_date || ''),
          title:        name,
          course,
          format:       r.is_online ? 'online' : 'onsite',
          time:         tStart && tEnd ? `${tStart}-${tEnd}` : tStart,
          location:     String(r.location || ''),
          price:        String(r.price_thb || ''),
          early:        '',
          audience:     audArr,
          note:         String(r.note_th || ''),
          venueRegion:  r.venue_region ? String(r.venue_region) : null,
          ceu:          Number(r.ceu) || 0,
          _source:      'bni_events',
        };
      });
      return jsonResponse({ ok: true, events });
    }

    default:
      return errResponse(`Unknown public action: ${action}`);
  }
}

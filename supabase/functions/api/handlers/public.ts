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
  const wks  = Math.max(1, Math.floor(bniDays / 7));
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

    case 'getMemberDirectory': {
      const { data, error } = await db
        .from('v_member_dashboard')
        .select('id, name, nickname, mentor_team, display_score, traffic_light')
        .eq('is_archived', false)
        .order('name');
      if (error) return errResponse(error.message);

      const rows = (data || []) as Record<string, unknown>[];
      const ids = rows.map(r => String(r.id)).filter(Boolean);
      const contactMap: Record<string, { email: string; phone: string }> = {};
      if (ids.length) {
        const { data: contacts } = await db
          .from('members')
          .select('id, email, phone')
          .in('id', ids);
        for (const c of (contacts || []) as Record<string, unknown>[]) {
          contactMap[String(c.id)] = { email: text(c.email), phone: text(c.phone) };
        }
      }

      const members = rows.map(m => {
        const contact = contactMap[String(m.id)] || { email: '', phone: '' };
        return {
          id:     m.id,
          name:   text(m.name),
          nick:   text(m.nickname),
          mentor: text(m.mentor_team),
          email:  contact.email,
          phone:  contact.phone,
          score:  num(m.display_score),
          tl:     text(m.traffic_light) || 'none',
        };
      });
      return jsonResponse({ ok: true, members, total: members.length });
    }

    case 'getSimulateData': {
      const { data, error } = await db
        .from('v_member_dashboard')
        .select('name, nickname, mentor_team, display_score, traffic_light, palms_detail, rg, visitors, one_to_one, ceu, tyfcb_thb, bni_days, absent, attend, late, medical, sub')
        .eq('is_archived', false)
        .order('name');
      if (error) return errResponse(error.message);

      const members = ((data || []) as Record<string, unknown>[]).map(m => {
        const cats   = catsFromPalms(m.palms_detail);
        const actual = actualFromRow(m);
        const bniDays = num(m.bni_days);
        return {
          name:      text(m.name),
          nick:      text(m.nickname),
          mentor:    text(m.mentor_team),
          bniScore:  num(m.display_score),
          bniTl:     simTl(m.traffic_light),
          cats,
          actual,
          fastTrack: cats ? computeFastTrack(cats, actual, bniDays) : [],
        };
      });
      return jsonResponse({ ok: true, members });
    }

    case 'getMemberPublicDetail': {
      const name = String(p.name || '').trim();
      if (!name) return errResponse('name required');
      const { data, error } = await db
        .from('v_member_dashboard')
        .select('*')
        .eq('name', name)
        .single();
      if (error) return errResponse(error.message);
      const m = data as Record<string, unknown>;
      return jsonResponse({
        ok: true,
        member: {
          ...m,
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

    default:
      return errResponse(`Unknown public action: ${action}`);
  }
}

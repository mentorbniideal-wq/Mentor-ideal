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

      const members = ((data || []) as Record<string, unknown>[]).map(m => ({
        name:      text(m.name),
        nick:      text(m.nickname),
        mentor:    text(m.mentor_team),
        bniScore:  num(m.display_score),
        bniTl:     simTl(m.traffic_light),
        cats:      catsFromPalms(m.palms_detail),
        actual:    actualFromRow(m),
        fastTrack: [],
      }));
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

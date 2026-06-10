// Handler: public — no PIN required
// getMemberDirectory, getSimulateData, getMemberPublicDetail
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

export async function handlePublic(p: Record<string, unknown>): Promise<Response> {
  const db     = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    case 'getMemberDirectory': {
      const { data, error } = await db
        .from('v_members_by_team')
        .select('id, name, nickname, mentor_team, latest_score, traffic_light')
        .eq('is_archived', false)
        .order('name');
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true, members: data });
    }

    case 'getSimulateData': {
      const { data, error } = await db
        .from('v_member_dashboard')
        .select('name, nickname, mentor_team, display_score, traffic_light, palms_detail')
        .eq('is_archived', false)
        .order('name');
      if (error) return errResponse(error.message);
      return jsonResponse({ ok: true, members: data });
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
      return jsonResponse({ ok: true, member: data });
    }

    default:
      return errResponse(`Unknown public action: ${action}`);
  }
}

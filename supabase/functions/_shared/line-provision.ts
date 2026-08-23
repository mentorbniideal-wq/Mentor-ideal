import { buildRichMenu, type RichMenuRole } from './line-rich-menu.ts';

type Db = any;

async function lineRequest(
  token: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`LINE API ${response.status} ${url}: ${(await response.text()).slice(0, 500)}`);
  }
  return response;
}

export async function provisionLineExperience(db: Db) {
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || '';
  const appUrl = (Deno.env.get('PUBLIC_APP_URL') || '').replace(/\/$/, '');
  const liffUrl = (Deno.env.get('LINE_LIFF_URL') || `${appUrl}/liff/`).replace(/\/$/, '');
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
  if (!token || !appUrl || !supabaseUrl) {
    throw new Error('LINE token, PUBLIC_APP_URL, or SUPABASE_URL is missing');
  }

  const webhookEndpoint = `${supabaseUrl}/functions/v1/line-webhook`;
  await lineRequest(token, 'https://api.line.me/v2/bot/channel/webhook/endpoint', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: webhookEndpoint }),
  });

  const roles: RichMenuRole[] = ['member', 'mentor', 'mc', 'growth'];
  const desiredMenuVersion = 'v13';
  const menuAssetVersion = 'v5';
  const desiredMenuSource = `${desiredMenuVersion}|my121-uri|${appUrl}`;
  const { data: menuSettings } = await db.from('settings')
    .select('key, value')
    .in('key', ['LINE_RICH_MENU_VERSION', 'LINE_RICH_MENU_SOURCE']);
  const menuSettingMap = Object.fromEntries(
    (menuSettings || []).map((row: Record<string, unknown>) => [
      String(row.key || ''),
      String(row.value || ''),
    ]),
  );
  const replaceMenus =
    menuSettingMap.LINE_RICH_MENU_VERSION !== desiredMenuVersion ||
    menuSettingMap.LINE_RICH_MENU_SOURCE !== desiredMenuSource;
  const menus: Record<string, string> = {};
  const oldMenus: string[] = [];
  for (const role of roles) {
    const key = `LINE_RICH_MENU_${role.toUpperCase()}`;
    const { data: existing } = await db.from('settings').select('value').eq('key', key).maybeSingle();
    let richMenuId = String(existing?.value || '');
    if (richMenuId && replaceMenus) oldMenus.push(richMenuId);
    if (!richMenuId || replaceMenus) {
      const create = await lineRequest(token, 'https://api.line.me/v2/bot/richmenu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRichMenu(role, liffUrl, appUrl)),
      });
      richMenuId = String((await create.json() as Record<string, unknown>).richMenuId || '');
      if (!richMenuId) throw new Error(`LINE did not return richMenuId for ${role}`);
      const assetRole = 'member';
      const image = await fetch(`${appUrl}/assets/line/rich-menu-${assetRole}-${menuAssetVersion}.jpg`);
      if (!image.ok) throw new Error(`Cannot download ${role} rich menu asset: ${image.status}`);
      await lineRequest(token, `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg' },
        body: await image.arrayBuffer(),
      });
      await db.from('settings').upsert({ key, value: richMenuId }, { onConflict: 'key' });
    }
    menus[role] = richMenuId;
  }

  await lineRequest(token, `https://api.line.me/v2/bot/user/all/richmenu/${menus.member}`, {
    method: 'POST',
  });

  const { data: settings } = await db.from('settings')
    .select('key, value')
    .like('key', 'LINE_ID_%');
  const assignedLineUserIds = new Set<string>();
  for (const row of settings || []) {
    const lineUserId = String(row.value || '');
    if (!lineUserId) continue;
    assignedLineUserIds.add(lineUserId);
    await lineRequest(token, `https://api.line.me/v2/bot/user/${lineUserId}/richmenu/${menus.member}`, {
      method: 'POST',
    });
  }

  // Some members may still have an old individual rich menu assigned from an
  // earlier LIFF-based version. Default menu changes do not override those
  // per-user assignments, so explicitly reassign every linked LINE account.
  const { data: lineMembers } = await db.from('line_members')
    .select('line_user_id')
    .limit(1000);
  for (const row of lineMembers || []) {
    const lineUserId = String(row.line_user_id || '').trim();
    if (!lineUserId || assignedLineUserIds.has(lineUserId)) continue;
    assignedLineUserIds.add(lineUserId);
    await lineRequest(token, `https://api.line.me/v2/bot/user/${lineUserId}/richmenu/${menus.member}`, {
      method: 'POST',
    });
  }

  // Resolve mentor leaders from canonical team data so every mentor receives
  // the Mentor menu even when LINE_ID_<TEAM> settings were not maintained.
  const { data: teams } = await db.from('mentor_teams').select('name, leader_name');
  for (const team of teams || []) {
    const leaderName = String(team.leader_name || '').trim();
    if (!leaderName) continue;
    const { data: leader } = await db.from('members')
      .select('id')
      .or(`nickname.ilike.%${leaderName}%,name.ilike.%${leaderName}%`)
      .eq('is_archived', false)
      .limit(1)
      .maybeSingle();
    if (!leader?.id) continue;
    const { data: link } = await db.from('line_members')
      .select('line_user_id')
      .eq('member_id', String(leader.id))
      .maybeSingle();
    const lineUserId = String(link?.line_user_id || '');
    if (!lineUserId || assignedLineUserIds.has(lineUserId)) continue;
    assignedLineUserIds.add(lineUserId);
    // Mentor, MC, and Growth work lives in the web app, so LINE stays as
    // member-support only for everyone.
    await lineRequest(token, `https://api.line.me/v2/bot/user/${lineUserId}/richmenu/${menus.member}`, {
      method: 'POST',
    });
  }

  const test = await lineRequest(token, 'https://api.line.me/v2/bot/channel/webhook/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: webhookEndpoint }),
  });
  const testResult = await test.json().catch(() => ({}));
  await db.from('settings').upsert([
    { key: 'LINE_WEBHOOK_ENDPOINT', value: webhookEndpoint },
    { key: 'LINE_PROVISIONED_AT', value: new Date().toISOString() },
    { key: 'LINE_RICH_MENU_VERSION', value: desiredMenuVersion },
    { key: 'LINE_RICH_MENU_SOURCE', value: desiredMenuSource },
  ], { onConflict: 'key' });

  // Delete previous menus only after the new default and role assignments
  // are complete, avoiding a period where users have no menu.
  for (const oldMenuId of [...new Set(oldMenus)]) {
    if (!oldMenuId || Object.values(menus).includes(oldMenuId)) continue;
    await lineRequest(token, `https://api.line.me/v2/bot/richmenu/${oldMenuId}`, {
      method: 'DELETE',
    });
  }

  return { webhookEndpoint, menuVersion: desiredMenuVersion, menus, testResult, assignedUsers: assignedLineUserIds.size };
}

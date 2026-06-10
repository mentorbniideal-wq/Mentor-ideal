// FILE: checkin.ts
// Handler: checkin — saveCheckin, getCheckinLog, parseCheckin, parseCheckinPDF, getAIMatching
import { requireAuth } from '../../_shared/auth.ts';
import { getServiceClient, jsonResponse, errResponse } from '../../_shared/db.ts';

export async function handleCheckin(p: Record<string, unknown>): Promise<Response> {
  const db = getServiceClient();
  const action = String(p.action || '');

  switch (action) {

    // ── SAVE: import a full checkin session (replaces if same weekLabel) ───
    case 'saveCheckin': {
      const auth = await requireAuth(db, p, ['mc']);
      if (!auth.ok) return errResponse(auth.error!);

      const weekLabel   = String(p.weekLabel || '').trim();
      const meetingDate = p.meetingDate ? String(p.meetingDate) : new Date().toISOString().split('T')[0];
      const rawEntries  = Array.isArray(p.entries) ? p.entries as Record<string, unknown>[] : [];

      if (!weekLabel) return errResponse('weekLabel required');

      // 1. Upsert checkin_sessions
      const { error: sessErr } = await db.from('checkin_sessions').upsert(
        { week_label: weekLabel, meeting_date: meetingDate, imported_at: new Date().toISOString() },
        { onConflict: 'week_label' },
      );
      if (sessErr) return errResponse(sessErr.message);

      // 2. Get the session id
      const { data: sessRow, error: sessGetErr } = await db
        .from('checkin_sessions')
        .select('id')
        .eq('week_label', weekLabel)
        .single();
      if (sessGetErr || !sessRow) return errResponse('ไม่พบ session หลัง upsert');
      const sessionId = String((sessRow as Record<string, unknown>).id);

      // 3. Delete existing entries for this session (re-import replaces)
      const { error: delErr } = await db
        .from('checkin_entries')
        .delete()
        .eq('session_id', sessionId);
      if (delErr) return errResponse(delErr.message);

      // 4. Resolve each entry's member_id + mentor_team via case-insensitive name lookup
      let matched = 0;
      const toInsert: Record<string, unknown>[] = [];

      for (let i = 0; i < rawEntries.length; i++) {
        const e    = rawEntries[i];
        const name = String(e.rawName || '').trim();
        const seqNo = Number(e.seqNo ?? i + 1);

        let memberId: string | null   = null;
        let mentorTeam: string | null = null;

        if (name) {
          const { data: member } = await db
            .from('members')
            .select('id, mentor_team')
            .ilike('name', name)
            .limit(1)
            .maybeSingle();
          if (member) {
            const mv = member as Record<string, unknown>;
            memberId   = String(mv.id);
            mentorTeam = mv.mentor_team ? String(mv.mentor_team) : null;
            matched++;
          }
        }

        toInsert.push({
          session_id:  sessionId,
          seq_no:      seqNo,
          member_id:   memberId,
          raw_name:    name,
          status:      String(e.status || 'สมาชิก'),
          sub_for:     e.subFor   ? String(e.subFor)   : null,
          looking_for: e.lookingFor ? String(e.lookingFor) : null,
          mentor_team: e.mentorTeam ? String(e.mentorTeam) : mentorTeam,
        });
      }

      // 5. Batch insert entries
      if (toInsert.length > 0) {
        const { error: insErr } = await db.from('checkin_entries').insert(toInsert);
        if (insErr) return errResponse(insErr.message);
      }

      return jsonResponse({ ok: true, sessionId, count: toInsert.length, matched });
    }

    // ── GET: latest or specific checkin log ───────────────────
    case 'getCheckinLog': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const weekLabel = p.weekLabel ? String(p.weekLabel).trim() : null;
      const limit     = Math.min(Number(p.limit || 10), 50);

      // Sessions list (summary)
      const { data: sessions, error: sessErr } = await db
        .from('checkin_sessions')
        .select('id, week_label, meeting_date, imported_at')
        .order('meeting_date', { ascending: false })
        .limit(limit);
      if (sessErr) return errResponse(sessErr.message);

      const sessionList = ((sessions || []) as Record<string, unknown>[]).map(s => ({
        weekLabel:   s.week_label,
        meetingDate: s.meeting_date,
        importedAt:  s.imported_at,
        entryCount:  null as number | null, // filled below if needed
      }));

      // Latest (or requested) session with entries
      let latestSession: Record<string, unknown> | null = null;

      if (weekLabel) {
        const { data: s } = await db.from('checkin_sessions')
          .select('id, week_label, meeting_date').eq('week_label', weekLabel).single();
        latestSession = s as Record<string, unknown> | null;
      } else if (sessionList.length > 0) {
        const first = sessionList[0];
        const { data: s } = await db.from('checkin_sessions')
          .select('id, week_label, meeting_date').eq('week_label', String(first.weekLabel)).single();
        latestSession = s as Record<string, unknown> | null;
      }

      let latestPayload: Record<string, unknown> | null = null;

      if (latestSession) {
        const sid = String(latestSession.id);
        const { data: entries, error: eErr } = await db
          .from('checkin_entries')
          .select('seq_no, raw_name, status, sub_for, looking_for, mentor_team, member_id')
          .eq('session_id', sid)
          .order('seq_no', { ascending: true });
        if (eErr) return errResponse(eErr.message);

        // Backfill entry count into sessions list
        const entryArr = (entries || []) as Record<string, unknown>[];
        if (sessionList.length > 0) sessionList[0].entryCount = entryArr.length;

        latestPayload = {
          weekLabel:   latestSession.week_label,
          meetingDate: latestSession.meeting_date,
          entries: entryArr.map(e => ({
            seqNo:      e.seq_no,
            rawName:    e.raw_name,
            status:     e.status,
            subFor:     e.sub_for,
            lookingFor: e.looking_for,
            mentorTeam: e.mentor_team,
            memberId:   e.member_id,
          })),
        };
      }

      return jsonResponse({ ok: true, sessions: sessionList, latest: latestPayload });
    }

    // ── PARSE: server-side text parser for Thai BNI attendance format ──
    case 'parseCheckin': {
      const text = String(p.text || '').trim();
      if (!text) return errResponse('text required');

      const lines = text.split('\n');
      const entries: { rawName: string; status: string; seqNo: number }[] = [];
      let seq = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Strip leading sequence number: "1. " or "12. "
        const cleaned = trimmed.replace(/^\d+\.\s*/, '').trim();
        if (!cleaned) continue;

        let status = 'สมาชิก';
        if (cleaned.includes('ผู้เยี่ยมชม')) {
          status = 'ผู้เยี่ยมชม';
        } else if (cleaned.includes('ตัวแทน')) {
          status = 'ตัวแทน';
        }

        // Skip meta-lines that are not names
        if (cleaned.startsWith('ต้องการ') || cleaned.startsWith('ขอ')) continue;

        seq++;
        entries.push({ rawName: cleaned, status, seqNo: seq });
      }

      return jsonResponse({ ok: true, entries, count: entries.length });
    }

    // ── PARSE PDF: stub — PDF requires file upload ─────────────
    case 'parseCheckinPDF': {
      return jsonResponse({ ok: false, error: 'กรุณาใช้ parseCheckin แทน (text mode)' });
    }

    // ── GET: AI/rule-based 1-2-1 matching for latest session ──
    case 'getAIMatching': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const sessionId = p.sessionId ? String(p.sessionId) : null;

      let sid: string | null = sessionId;

      if (!sid) {
        // Get latest session
        const { data: latestSess } = await db
          .from('checkin_sessions')
          .select('id')
          .order('meeting_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestSess) sid = String((latestSess as Record<string, unknown>).id);
      }

      if (!sid) return jsonResponse({ ok: true, matches: [] });

      const { data: entries, error: eErr } = await db
        .from('checkin_entries')
        .select('raw_name, looking_for, member_id')
        .eq('session_id', sid)
        .not('looking_for', 'is', null);
      if (eErr) return errResponse(eErr.message);

      const rawMatches = ((entries || []) as Record<string, unknown>[])
        .filter(e => String(e.looking_for || '').trim() !== '')
        .map(e => ({
          memberName: String(e.raw_name || ''),
          lookingFor: String(e.looking_for || ''),
        }));

      if (rawMatches.length === 0) return jsonResponse({ ok: true, matches: [] });

      // Load all active members for AI context
      const { data: allMembers } = await db
        .from('members')
        .select('name, nickname, mentor_team')
        .eq('is_archived', false)
        .order('name');

      const memberList = ((allMembers || []) as Record<string, unknown>[]).map(m =>
        `${String(m.name)} (${String(m.nickname || m.name)}, ทีม${String(m.mentor_team || 'N/A')})`
      );

      // Call Anthropic for smart 1-2-1 matching
      const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
      let matches: Array<{ memberName: string; lookingFor: string; suggestedPartners: string[] }> = rawMatches.map(m => ({ ...m, suggestedPartners: [] }));

      if (ANTHROPIC_KEY) {
        try {
          const prompt = `คุณเป็นผู้ช่วยจับคู่ธุรกิจ BNI IDEAL Chapter ภาษาไทย

สมาชิกที่เข้าประชุมวันนี้และความต้องการทางธุรกิจ:
${JSON.stringify(rawMatches, null, 2)}

รายชื่อสมาชิกทั้งหมดในชาพเตอร์:
${memberList.join('\n')}

งาน: สำหรับแต่ละสมาชิกที่มี "lookingFor" ให้แนะนำ 1-3 คนที่น่าจะช่วยได้ดีที่สุด โดยพิจารณาจากประเภทธุรกิจและความต้องการ

ตอบเฉพาะ JSON array นี้เท่านั้น (ไม่ต้องมีคำอธิบายเพิ่มเติม):
[{"memberName":"...", "suggestedPartners":["ชื่อ1","ชื่อ2"]}]`;

          const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': ANTHROPIC_KEY,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 1024,
              messages: [{ role: 'user', content: prompt }],
            }),
          });

          if (aiResp.ok) {
            const aiJson = await aiResp.json() as Record<string, unknown>;
            const content = (aiJson.content as Array<{ type: string; text: string }>)?.[0]?.text || '';
            // Extract JSON array from response
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const aiMatches = JSON.parse(jsonMatch[0]) as Array<{ memberName: string; suggestedPartners: string[] }>;
              matches = rawMatches.map(m => {
                const ai = aiMatches.find(a => a.memberName === m.memberName);
                return { ...m, suggestedPartners: ai?.suggestedPartners || [] };
              });
            }
          }
        } catch (_err) {
          // AI failed — return rule-based empty suggestions, don't error
        }
      }

      return jsonResponse({ ok: true, matches });
    }

    // ── Default stub ──────────────────────────────────────────
    default:
      return jsonResponse({ ok: true, message: 'not yet implemented' });
  }
}

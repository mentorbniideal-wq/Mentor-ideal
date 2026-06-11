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

      // Accept both legacy GAS names (week/date/members) and canonical names (weekLabel/meetingDate/entries)
      const weekLabel   = String(p.week || p.weekLabel || '').trim();
      const meetingDate = String(p.date || p.meetingDate || new Date().toISOString().split('T')[0]);
      const rawMembers  = Array.isArray(p.members) ? p.members as Record<string, unknown>[] : null;
      const rawEntries  = rawMembers
        ? rawMembers.map((m, i) => ({ rawName: String(m.name || ''), seqNo: i + 1, status: m.status, subFor: m.sub_for, lookingFor: m.looking_for }))
        : Array.isArray(p.entries) ? p.entries as Record<string, unknown>[] : [];

      if (!weekLabel) return errResponse('week required');

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
        const e    = rawEntries[i] as Record<string, unknown>;
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

      return jsonResponse({ ok: true, sessionId, saved: toInsert.length, count: toInsert.length, week: weekLabel, matched });
    }

    // ── GET: latest or specific checkin log ───────────────────
    case 'getCheckinLog': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      // Accept `week` or `weekLabel` as the week selector
      const weekParam = (p.week || p.weekLabel) ? String(p.week || p.weekLabel).trim() : null;
      const limit     = Math.min(Number(p.limit || 20), 50);

      // Fetch sessions list
      const { data: sessions, error: sessErr } = await db
        .from('checkin_sessions')
        .select('id, week_label, meeting_date')
        .order('meeting_date', { ascending: false })
        .limit(limit);
      if (sessErr) return errResponse(sessErr.message);

      const sessionList = (sessions || []) as Record<string, unknown>[];

      // If a specific week is requested, return members for that week
      if (weekParam) {
        const { data: s } = await db.from('checkin_sessions')
          .select('id').eq('week_label', weekParam).maybeSingle();
        if (!s) return jsonResponse({ ok: true, members: [] });

        const { data: entries, error: eErr } = await db
          .from('checkin_entries')
          .select('seq_no, raw_name, status, sub_for, looking_for, mentor_team')
          .eq('session_id', String((s as Record<string, unknown>).id))
          .order('seq_no', { ascending: true });
        if (eErr) return errResponse(eErr.message);

        const members = ((entries || []) as Record<string, unknown>[]).map(e => ({
          name:       String(e.raw_name  || ''),
          status:     String(e.status    || 'สมาชิก'),
          sub_for:    e.sub_for    || null,
          looking_for: e.looking_for || null,
          mentor_team: e.mentor_team || null,
        }));

        return jsonResponse({ ok: true, members });
      }

      // List call: return weeks summary + currentWeek
      // Get entry counts per session in one query
      const sessionIds = sessionList.map(s => String(s.id));
      let countMap: Record<string, number> = {};
      if (sessionIds.length > 0) {
        const { data: counts } = await db
          .from('checkin_entries')
          .select('session_id')
          .in('session_id', sessionIds);
        for (const c of (counts || []) as Record<string, unknown>[]) {
          const sid = String(c.session_id);
          countMap[sid] = (countMap[sid] || 0) + 1;
        }
      }

      const weeks = sessionList.map(s => ({
        week:        String(s.week_label || ''),
        meetingDate: String(s.meeting_date || ''),
        count:       countMap[String(s.id)] || 0,
      }));

      const currentWeek = weeks.length > 0 ? weeks[0].week : '';
      return jsonResponse({ ok: true, weeks, currentWeek, sessions: sessionList });
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

    // ── PARSE PDF: intentionally disabled; CSV/text is the supported workflow.
    case 'parseCheckinPDF': {
      return jsonResponse({ ok: false, error: 'ระบบใหม่นำเข้า Check-In ด้วยไฟล์ CSV หรือข้อความเท่านั้น' });
    }

    // ── GET: AI/rule-based 1-2-1 matching for latest session ──
    case 'getAIMatching': {
      const auth = await requireAuth(db, p);
      if (!auth.ok) return errResponse(auth.error!);

      const weekParam   = p.week      ? String(p.week).trim()      : null;
      const sessionIdParam = p.sessionId ? String(p.sessionId)     : null;

      let sid: string | null = sessionIdParam;

      if (!sid && weekParam) {
        const { data: ws } = await db
          .from('checkin_sessions')
          .select('id')
          .eq('week_label', weekParam)
          .maybeSingle();
        if (ws) sid = String((ws as Record<string, unknown>).id);
      }

      if (!sid) {
        const { data: latestSess } = await db
          .from('checkin_sessions')
          .select('id')
          .order('meeting_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestSess) sid = String((latestSess as Record<string, unknown>).id);
      }

      if (!sid) return jsonResponse({ ok: true, matches: [], summary: 'ไม่พบข้อมูล Check-in' });

      // Fetch ALL entries for the session (need everyone for context + mentor_team)
      const { data: entries, error: eErr } = await db
        .from('checkin_entries')
        .select('raw_name, looking_for, mentor_team')
        .eq('session_id', sid)
        .order('seq_no', { ascending: true });
      if (eErr) return errResponse(eErr.message);

      const allEntries = (entries || []) as Record<string, unknown>[];

      // Build name → mentor_team map from session + fallback DB lookup
      const nameToTeam: Record<string, string | null> = {};
      for (const e of allEntries) {
        const nm = String(e.raw_name || '').trim();
        if (nm) nameToTeam[nm] = e.mentor_team ? String(e.mentor_team) : null;
      }

      // Fill missing mentor_teams from members table
      const missingTeamNames = Object.entries(nameToTeam)
        .filter(([, t]) => t === null)
        .map(([n]) => n);
      if (missingTeamNames.length > 0) {
        const { data: mbrData } = await db
          .from('members')
          .select('name, mentor_team')
          .eq('is_archived', false);
        for (const m of (mbrData || []) as Record<string, unknown>[]) {
          const nm = String(m.name || '').trim();
          if (nameToTeam[nm] === null) {
            nameToTeam[nm] = m.mentor_team ? String(m.mentor_team) : null;
          }
        }
      }

      // Members with looking_for
      const withLF = allEntries
        .filter(e => String(e.looking_for || '').trim() !== '')
        .map(e => ({
          name:       String(e.raw_name    || ''),
          lookingFor: String(e.looking_for || ''),
        }));

      if (withLF.length === 0) {
        return jsonResponse({ ok: true, matches: [], summary: 'ไม่มีสมาชิกที่ระบุ Looking For สัปดาห์นี้' });
      }

      interface PairMatch {
        person_a:   string;
        lf_a:       string;
        person_b:   string;
        lf_b:       string;
        priority:   string;
        reasons:    string[];
        reason:     string;
        action:     string;
        mentor_a:   string | null;
        mentor_b:   string | null;
        cross_team: boolean;
      }

      let matches: PairMatch[] = [];

      const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';

      if (ANTHROPIC_KEY) {
        try {
          const allNamesForAI = allEntries.map(e => ({
            name:       String(e.raw_name    || ''),
            lookingFor: e.looking_for ? String(e.looking_for) : null,
          }));

          const prompt = `คุณเป็นผู้ช่วยจับคู่ธุรกิจ BNI IDEAL Chapter ภาษาไทย

สมาชิกในที่ประชุมวันนี้ (พร้อม Looking For ถ้ามี):
${JSON.stringify(allNamesForAI, null, 2)}

งาน: จับคู่ผู้ที่มี lookingFor กับสมาชิกคนอื่นที่น่าจะช่วยได้ดีที่สุด ไม่จำเป็นต้องให้อีกฝ่ายมี lookingFor ด้วย

ตอบเฉพาะ JSON array เท่านั้น ในรูปแบบนี้ (ไม่ต้องมีข้อความอื่น):
[{"person_a":"ชื่อคนต้องการ","lf_a":"สิ่งที่ต้องการ","person_b":"ชื่อคนที่แนะนำ","lf_b":"สิ่งที่คนแนะนำต้องการ หรือ null","priority":"high|medium|low","reasons":["เหตุผล1","เหตุผล2"],"action":"คำแนะนำ เช่น นัด 1-2-1 ภายใน 1 สัปดาห์"}]`;

          const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': ANTHROPIC_KEY,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model:      'claude-haiku-4-5',
              max_tokens: 2048,
              messages:   [{ role: 'user', content: prompt }],
            }),
          });

          if (aiResp.ok) {
            const aiJson  = await aiResp.json() as Record<string, unknown>;
            const content = (aiJson.content as Array<{ type: string; text: string }>)?.[0]?.text || '';
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const aiPairs = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
              matches = aiPairs.map(pair => {
                const pa      = String(pair.person_a || '');
                const pb      = String(pair.person_b || '');
                const ma      = nameToTeam[pa] ?? null;
                const mb      = nameToTeam[pb] ?? null;
                const reasons = Array.isArray(pair.reasons)
                  ? (pair.reasons as unknown[]).map(r => String(r))
                  : [String(pair.reasons || '')].filter(Boolean);
                const validPriority = ['high', 'medium', 'low'].includes(String(pair.priority))
                  ? String(pair.priority) : 'medium';
                return {
                  person_a:   pa,
                  lf_a:       String(pair.lf_a || ''),
                  person_b:   pb,
                  lf_b:       pair.lf_b ? String(pair.lf_b) : '',
                  priority:   validPriority,
                  reasons,
                  reason:     reasons[0] || '',
                  action:     String(pair.action || ''),
                  mentor_a:   ma,
                  mentor_b:   mb,
                  cross_team: !!ma && !!mb && ma !== mb,
                };
              }).filter(m => m.person_a && m.person_b);
            }
          }
        } catch (_err) {
          // AI failed — fall through to rule-based
        }
      }

      // Rule-based fallback: pair each person-with-LF with everyone else who also has LF
      if (matches.length === 0) {
        const seen = new Set<string>();
        for (const personA of withLF) {
          for (const personB of withLF) {
            if (personA.name === personB.name) continue;
            const key = [personA.name, personB.name].sort().join('||');
            if (seen.has(key)) continue;
            seen.add(key);
            const ma = nameToTeam[personA.name] ?? null;
            const mb = nameToTeam[personB.name] ?? null;
            matches.push({
              person_a:   personA.name,
              lf_a:       personA.lookingFor,
              person_b:   personB.name,
              lf_b:       personB.lookingFor,
              priority:   'medium',
              reasons:    [`${personA.name} มองหา: ${personA.lookingFor}`, `${personB.name} มองหา: ${personB.lookingFor}`],
              reason:     `ทั้งสองต่างมองหาพันธมิตรธุรกิจ`,
              action:     'นัด 1-2-1 เพื่อแลกเปลี่ยนธุรกิจ',
              mentor_a:   ma,
              mentor_b:   mb,
              cross_team: !!ma && !!mb && ma !== mb,
            });
          }
        }
      }

      const summary = `พบ ${matches.length} คู่จากสมาชิก ${withLF.length} คนที่มี Looking For`;
      return jsonResponse({ ok: true, matches, summary });
    }

    // ── Default stub ──────────────────────────────────────────
    default:
      return errResponse(`unknown action: ${p.action}`);
  }
}

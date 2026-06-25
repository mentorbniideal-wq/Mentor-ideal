-- Migration 038: Enrich bni_events with location, price, venue_region
-- Fixes blank cards in the training calendar (fields were missing).
-- Also adds province Advanced MSP dates from the Region PDF.

ALTER TABLE bni_events
  ADD COLUMN IF NOT EXISTS location     TEXT,
  ADD COLUMN IF NOT EXISTS price_thb    TEXT,
  ADD COLUMN IF NOT EXISTS note_th      TEXT,
  ADD COLUMN IF NOT EXISTS venue_region TEXT;
  -- venue_region: 'bangkok' | 'province' | NULL (online)

COMMENT ON COLUMN bni_events.venue_region IS
  'onsite location region: ''bangkok'' = BKK venue, ''province'' = upcountry, NULL = online';

-- ── MSP / Advanced MSP (Bangkok, onsite) ───────────────────────────
UPDATE bni_events
SET location     = 'Mandarin Hotel Samyan ชั้น 1',
    price_thb    = '1,550 บาท',
    venue_region = 'bangkok'
WHERE event_no IN (1, 2) AND is_online = false;

UPDATE bni_events
SET note_th = 'เหมาะกับ Member ใหม่ที่ต้องการ CEU และอยากเข้าใจ BNI อย่างละเอียด'
WHERE event_no = 1;

UPDATE bni_events
SET note_th = 'เหมาะกับ Member ที่ผ่าน MSP แล้ว ต้องการต่อยอดและเข้าใจ BNI แบบ advance'
WHERE event_no = 2;

-- ── Skill trainings (Online, rows 3–8) ────────────────────────────
UPDATE bni_events
SET location  = 'Zoom (Online)',
    price_thb = '650 บาท'
WHERE event_no BETWEEN 3 AND 8;

UPDATE bni_events SET note_th = 'ฝึกทักษะการตั้งเป้าหมายสมาชิก — ออนไลน์ เหมาะกับ Member ทุกคน'    WHERE event_no = 3;
UPDATE bni_events SET note_th = 'เพิ่มทักษะ Networking และการสร้างความสัมพันธ์ใน Chapter'           WHERE event_no = 4;
UPDATE bni_events SET note_th = 'เทคนิค Invitation ที่ได้ผล — ออนไลน์ 3 ชั่วโมง'                 WHERE event_no = 5;
UPDATE bni_events SET note_th = 'ฝึกการให้ Referral ที่มีคุณภาพ — ออนไลน์ เพิ่ม ROI ให้ทีม'      WHERE event_no = 6;
UPDATE bni_events SET note_th = 'พัฒนาทักษะการ Present ใน 60 วินาที — ออนไลน์'                   WHERE event_no = 7;
UPDATE bni_events SET note_th = 'เพิ่มคุณภาพ 1-2-1 และสร้าง Referral Relationship ที่ยั่งยืน'   WHERE event_no = 8;

-- ── Chapter events (onsite, Bangkok) ──────────────────────────────
UPDATE bni_events
SET location = 'TBD (สอบถามจาก BNI Thailand)', venue_region = 'bangkok'
WHERE event_no = 9 AND name IN ('LT Conference','Annual Power Team Conference 2026','Master Connector & Gold Club Cof.','Chapter Plan','LTM Chapter of the Year');

UPDATE bni_events
SET location = 'TBD — ต่างจังหวัด', venue_region = 'province'
WHERE event_no = 9 AND name = 'TNC';

-- ── LT Trainings (onsite, Bangkok) ────────────────────────────────
UPDATE bni_events
SET location = 'TBD (สอบถามจาก BNI Thailand)', venue_region = 'bangkok'
WHERE event_no BETWEEN 10 AND 14;

-- ── Clubs (Online) ────────────────────────────────────────────────
UPDATE bni_events
SET location  = 'Zoom (Online)',
    price_thb = '650 บาท'
WHERE event_no BETWEEN 15 AND 20 AND is_online = true;

-- Club onsite sessions (Bangkok)
UPDATE bni_events
SET location     = 'Zoom / สอบถาม BNI Thailand',
    venue_region = 'bangkok'
WHERE event_no BETWEEN 15 AND 20 AND is_online = false;

UPDATE bni_events SET note_th = 'เหมาะกับสมาชิกใหม่ใน 1 ปีแรก — ทุก 2 เดือน' WHERE event_no = 20;
UPDATE bni_events SET note_th = 'เหมาะกับ Mentor และ Growth Coordinator ทุกทีม'  WHERE event_no IN (18, 19);
UPDATE bni_events SET note_th = 'สำหรับสมาชิกในปีแรก — BNI Thailand เป็นเจ้าภาพ' WHERE event_no = 21;

-- ── Province Advanced MSP (from Region PDF) ────────────────────────
-- These are the region-hosted Advanced MSP sessions in upcountry provinces.
INSERT INTO bni_events (event_no, name, event_date, time_start, time_end, ceu, category, audience, is_online, location, price_thb, note_th, venue_region, year)
VALUES
  (2,'Advanced MSP (พิษณุโลก/สุโขทัย)','2026-02-03','10:00','17:00',1,'msp','all',false,'พิษณุโลก / สุโขทัย (สอบถาม CR2)','1,550 บาท','Advanced MSP จัด Region CR2 — เหมาะกับ Member ต่างจังหวัดแถบภาคเหนือตอนล่าง','province',2026),
  (2,'Advanced MSP (ภูเก็ต)','2026-05-05','10:00','17:00',1,'msp','all',false,'ภูเก็ต (สอบถาม SR1)','1,550 บาท','Advanced MSP จัด Region SR1 — เหมาะกับ Member แถบภาคใต้','province',2026),
  (2,'Advanced MSP (สงขลา)','2026-04-07','10:00','17:00',1,'msp','all',false,'สงขลา (สอบถาม SR7)','1,550 บาท','Advanced MSP จัด Region SR7','province',2026),
  (2,'Advanced MSP (โคราช)','2026-06-02','10:00','17:00',1,'msp','all',false,'โคราช (สอบถาม NE1)','1,550 บาท','Advanced MSP จัด Region NE1 — เหมาะกับ Member แถบอีสานล่าง','province',2026),
  (2,'Advanced MSP (อุดร/หนองคาย)','2026-07-07','10:00','17:00',1,'msp','all',false,'อุดรธานี / หนองคาย (สอบถาม NE2)','1,550 บาท','Advanced MSP จัด Region NE2','province',2026),
  (2,'Advanced MSP (ขอนแก่น)','2026-10-06','10:00','17:00',1,'msp','all',false,'ขอนแก่น (สอบถาม NE3)','1,550 บาท','Advanced MSP จัด Region NE3','province',2026),
  (2,'Advanced MSP (ร้อยเอ็ด)','2026-11-03','10:00','17:00',1,'msp','all',false,'ร้อยเอ็ด (สอบถาม NE5)','1,550 บาท','Advanced MSP จัด Region NE5','province',2026)
ON CONFLICT (event_no, event_date) DO NOTHING;

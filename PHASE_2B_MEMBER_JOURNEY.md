# Phase 2B — Member Journey and tenant-scoped member/LT foundation

สถานะ: ส่งมอบ 12 กันยายน 2569

## สิ่งที่เพิ่ม

- `members`, `role_assignments`, `lt_terms`, `passport_lt_assignments` และ
  `lt_growth_team_members` มี `chapter_id` แบบ additive พร้อม index ที่ใช้
  query ตาม Chapter ได้
- Backfill เฉพาะ Chapter IDEAL เดิมจาก `chapter_profiles` โดยไม่เปลี่ยน
  primary key หรือ global unique constraint ที่ใช้งานอยู่
- `member_journey_events` เป็น ledger กลางสำหรับวันที่เริ่ม/สิ้นสุดสมาชิก,
  ประวัติ LT, Growth Lead/Co-Lead และบันทึกย้อนหลัง
- ระบบ backfill เฉพาะวันที่/วาระที่มีหลักฐานอยู่แล้ว ไม่เดาวันจาก
  `created_at`; ข้อมูลอดีตที่ไม่ครบต้องเพิ่มผ่าน UI โดย MC/Admin
- Trigger สร้าง event เมื่อมีการแต่งตั้ง/ยกเลิก LT หรือ Growth team หลังจากนี้
- Member 360 แสดง Journey รวมกับ Health Timeline และ MC/Chapter Admin เพิ่ม
  historical event ได้จากปุ่ม `เพิ่มประวัติ`; ทุก write มี audit event

## การคุมขอบเขตและสิทธิ์

- API อ่าน timeline resolve Chapter จาก membership/server session และ filter
  `member_journey_events.chapter_id` ก่อนคืนข้อมูล
- การเพิ่มข้อมูลย้อนหลังรับได้เฉพาะ Mentor Co. หรือ Chapter Admin; browser
  ไม่ส่ง `chapter_id` และบันทึก source เป็น `manual` พร้อมผู้กระทำ
- ตาราง journey ปิดจาก `anon`/`authenticated`; Edge API ใช้ service role
  หลังการตรวจสิทธิ์เท่านั้น

## หนี้ที่ตั้งใจคงไว้สำหรับ Phase 2C

1. เปลี่ยน handler domain อื่น ๆ ทีละชุดให้ใช้ `resolveChapterScope` และ
   filter ตารางที่เพิ่ม `chapter_id` ครบทุก read/write
2. หลังตรวจ row count และ query ทั้งหมด จึงย้าย global uniqueness เช่น
   `members.name` และ `role_assignments.email` ไปเป็น uniqueness รวม
   `chapter_id` อย่างปลอดภัย
3. สร้าง synthetic Chapter ใน staging พร้อม cross-tenant leakage tests ก่อน
   เปิด Chapter ที่สองจริง
4. เมื่อทุก session derive scope ได้แล้ว ให้เลิก legacy single-active-Chapter
   fallback; งาน LINE secret/token ยังอยู่นอกขอบเขตจนกว่า readiness ใน roadmap
   จะครบและได้รับอนุมัติใหม่

## ความคืบหน้า Phase 2C (12 กันยายน 2569)

- LT management batch ใช้ Chapter scope ใน LT roster, Growth team, preview,
  create term และ Passport LT assignment แล้ว; active term ถูกบังคับหนึ่งวาระ
  ต่อ Chapter ผ่าน `fn_create_lt_term_scoped`.
- Member boundary batch ใช้ Chapter scope ใน member list, create/batch import,
  move team, update, archive/unarchive, delete, new-member queue และ Member 360.
- Batch import จะปฏิเสธชื่อที่พบใน Chapter อื่น แทนการ upsert ทับ record เดิม.
- ยังไม่เปลี่ยน global unique key ของระบบเดิม จนกว่าจะทำ staging synthetic-tenant
  test และ row-count verification ครบ; domain scoring, renewal, 1-2-1, Growth
  และ notification จะย้าย scope เป็น batch ถัดไป.

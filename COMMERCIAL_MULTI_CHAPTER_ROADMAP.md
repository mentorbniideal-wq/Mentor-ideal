# Commercial Multi-Chapter Roadmap

สถานะ: **แผนแม่บทที่อนุมัติแล้ว — พักงาน Token/Multi-tenant migration ไว้จนกว่าจะพร้อม**

เจ้าของผลิตภัณฑ์: Pete / `phitarn.p@gmail.com`

วันที่บันทึก: 4 กันยายน 2569

## เป้าหมาย

พัฒนา BNI IDEAL Mentor System ให้ใช้งานได้ดีใน Chapter ปัจจุบัน พร้อมวางโครงสร้างให้ต่อยอดเป็นผลิตภัณฑ์สำหรับหลาย Chapter ได้ โดยไม่ต้องรื้อระบบครั้งใหญ่เมื่อเริ่มขายจริง

ทุกงานหลังจากนี้ แม้เป็น bug fix หรือ UI ขนาดเล็ก ต้องผ่าน Commercial-readiness Definition of Done ในเอกสารนี้

## ขอบเขตที่พักไว้ในตอนนี้

ยังไม่เริ่มเปลี่ยนระบบ Token/Secret เป็นหลาย Chapter จนกว่า Pete จะอนุมัติรอบใหม่ งานปัจจุบันต้องไม่ทำให้การย้ายในอนาคตยากขึ้น

หัวข้อที่พักไว้:

- LINE Channel Access Token และ Channel Secret แยกต่อ Chapter
- Token rotation, revoke, expiry และ audit
- Secret vault/KMS และการเข้ารหัส at rest
- Webhook routing จาก LINE OA ไปยัง Chapter ที่ถูกต้อง
- Quota, budget และ delivery policy แยกต่อ Chapter
- การย้าย secret ออกจาก global environment variables โดยไม่ทำให้ Chapter IDEAL หยุดบริการ

เงื่อนไขก่อนเปิดงาน Token ระดับใหญ่:

1. เลือก Chapter ที่สองสำหรับ pilot ได้แล้ว
2. ตัดสินใจว่าแต่ละ Chapter ใช้ LINE OA ของตนเองหรือ OA กลาง
3. มี staging environment และแผน rollback
4. เลือก secret manager และผู้มีสิทธิ์ rotate/revoke
5. สำรอง delivery configuration และทดสอบ webhook แบบ dry-run ผ่าน

## หลักสถาปัตยกรรมที่ยึดตั้งแต่วันนี้

1. **Tenant-ready** — ข้อมูลและ configuration ใหม่ต้องสามารถผูก `chapter_id` ได้
2. **Server-derived scope** — ห้ามเชื่อ `chapter_id`, role หรือสิทธิ์สำคัญที่ client ส่งมาโดยตรง
3. **Configuration over hardcode** — ชื่อ Chapter, ทีม, สี, timezone, กติกาคะแนน,ข้อความ และ quota ต้องย้ายไป configuration ได้
4. **IDEAL remains compatible** — การปรับต้องไม่ทำลายข้อมูลหรือ flow ปัจจุบันของ BNI IDEAL
5. **Least privilege** — Member, Mentor, Growth, Viewer, Chapter Admin และ Platform Admin เห็น/ทำได้เฉพาะที่จำเป็น
6. **Auditable operations** — งานเขียนข้อมูล, เปลี่ยนสิทธิ์ และส่งข้อความต้องตามย้อนหลังได้
7. **Reliable delivery** — งานส่งต้องมี idempotency, retry, status และเหตุผลที่ส่งไม่สำเร็จ
8. **Privacy by design** — ไม่เปิดเผยข้อความส่วนตัว, contact หรือข้อมูลละเอียดข้าม Chapter
9. **Migration-safe** — ใช้ additive migration, backfill, verify แล้วจึงบังคับ constraint
10. **Product-quality UX** — responsive, accessible, loading/empty/error state ชัดเจน และมี confirmation ก่อน action สำคัญ

## Roadmap

### Phase 0 — Commercial-ready guardrails (เริ่มใช้ทันที)

- ใช้ Definition of Done ด้านล่างกับทุกงาน
- ห้ามเพิ่ม hardcode ที่ระบุ BNI IDEAL หรือบุคคลใดเป็น logic ของระบบ
- บันทึก technical debt ที่ขัดกับ multi-Chapter พร้อม owner และทางย้าย
- แยก UI copy, business rules และ notification templates ออกจาก flow หลักเมื่อแตะส่วนนั้น

### Phase 1 — Configuration extraction

- สถานะ 5 กันยายน 2569: เริ่มใช้งาน foundation แล้วผ่าน `chapter_profiles`, revision history, Chapter Settings และ Configuration Health; consumer modules เดิมยังต้องทยอยอ่านค่ากลางเมื่อมีการแก้แต่ละ module
- สร้าง Chapter profile: ชื่อ, logo, theme, timezone, locale และ meeting cadence
- แยก scoring thresholds, roles และ notification policy เป็น configuration; ข้อความเฉพาะ Chapter เช่น “30-second presentation” อยู่ใน template ของ automation ที่เกี่ยวข้อง ไม่ใช่กติกากลาง
- กำหนด default configuration ที่คงพฤติกรรม IDEAL เดิม
- เพิ่ม validation และ version ของ configuration

#### BNI Connect Report Import foundation (5 กันยายน 2569)

- Import Center รองรับ Roster, PALMS, Membership Dues, Absence, Speaker, Training Gap, Chapter Visitor และ Professions Not In Chapter
- ทุกไฟล์ใช้ hash + batch ledger เพื่อป้องกันนำเข้าซ้ำและตรวจ Audit ย้อนหลังได้ โดยไม่เก็บ source PDF ในฐานข้อมูล
- Structured records ผูก `chapter_id` ที่ backend derive จาก Active Chapter; ตารางถูกปิดจาก `anon`/`authenticated`
- Visitor และ Training มีข้อมูลส่วนบุคคล จึงเก็บแบบ service-only และยังไม่มี public read API
- รายงานย้อนหลังเก็บเป็น snapshot เท่านั้น; Membership Dues เป็นชนิดเดียวที่อัปเดต Renewal ปัจจุบัน และต้องจับคู่ Active member ได้ก่อน
- Training Report แบบ “Members who have not attended” ถูกจัดเป็น `training_gap` เสมอ ห้ามตีความเป็นประวัติเรียนสำเร็จ
- Technical debt: ตาราง `members`/`renewals` เดิมยังต้องรับการ backfill `chapter_id` ใน Phase 2; import layer ใหม่เก็บ tenant scope และ source provenance เตรียมไว้แล้ว

#### Mobile Web Push foundation (5 กันยายน 2569)

- Notification Center มือถืออ่านจาก `notifications` และ `notification_receipts` เป็นแหล่งข้อมูลหลักเดียว แยกเร่งด่วน/ต้องทำ/ข้อมูล และคงสถานะอ่านต่อผู้รับ
- Web Push เป็น opt-in ต่ออุปกรณ์ เก็บ subscription แบบ service-only ผูก Active Chapter และ recipient ที่ backend derive จาก credential
- Queue มี idempotency, retry, expiry, provider-acceptance ledger และยกเลิก endpoint ที่หมดอายุอัตโนมัติ; LINE automation เดิมไม่ถูกแก้หรือเพิ่มข้อความซ้ำ
- ข้อจำกัดที่สื่อใน UI: iOS ต้อง Add to Home Screen ก่อน และสถานะ `accepted` หมายถึง push provider รับคำขอ ไม่ใช่หลักฐานว่า OS แสดงบนหน้าจอแล้ว
- Technical debt สำหรับ Phase 2/3: เปลี่ยน Active Chapter resolver เป็น tenant จาก session และแยก VAPID key/dispatch policy ต่อ Chapter เมื่อเปิดงาน secret architecture อย่างเป็นทางการ

#### Member Action Routing foundation (6 กันยายน 2569)

- Member Action Center ใช้เส้นทางหลักแบบลดความซ้ำ: แจ้งลา/ส่งแทน, Visitor, Connection/Referral, เป้าหมาย, อบรม/ต่ออายุ และ Help Center
- Backend เป็นผู้แปลงหมวดย่อยเป็น `signal_type` และผู้รับจากตำแหน่ง LT วาระปัจจุบัน; client ไม่สามารถกำหนดผู้รับหรือขอบเขต Chapter เอง
- แยก Referral, แก้ข้อมูลธุรกิจ, Presentation และเรื่องเป็นความลับออกจาก `member_help` เพื่อจำกัดการมองเห็นตามหน้าที่ โดย Mentor Support ไม่เห็นเรื่องลับ
- คำขอใช้ idempotency เดิมและ LINE delivery ledger เดิมเพื่อไม่ส่งซ้ำ; หากไม่มีผู้รับที่ผูก LINE ระบบส่งสถานะผิดปกติให้ Mentor Co. ใน Notification Center

### Phase 2 — Multi-tenant foundation

- เพิ่ม `chapters`, `chapter_memberships` และ stable IDs
- เพิ่ม `chapter_id` ในตารางหลักแบบ additive
- Backfill BNI IDEAL เป็น tenant แรก แล้วตรวจ row count/checksum
- เพิ่ม composite index/unique constraint ที่รวม `chapter_id`
- ใช้ RLS และ server authorization ป้องกันข้อมูลรั่วข้าม Chapter
- ทดสอบ synthetic tenant อย่างน้อยหนึ่ง Chapter

แนวทางเริ่มต้นที่แนะนำ: shared database/shared schema พร้อม tenant isolation ที่เข้มงวด ก่อนพิจารณา database แยกรายลูกค้าขนาดใหญ่

### Phase 3 — Token & LINE tenant architecture (พักไว้)

- Secret vault ต่อ Chapter; ไม่ส่ง secret ไป browser และไม่บันทึกใน log
- Webhook resolver ที่ตรวจ signature ก่อนหา Chapter
- Delivery queue แยก tenant พร้อม rate limit, retry และ dead-letter handling
- Quota dashboard, emergency stop และ token health ต่อ Chapter
- Rotation แบบไม่ downtime และ audit ผู้เปลี่ยน secret
- Migration แบบ dual-read/controlled cutover ก่อนเลิกใช้ global token

### Phase 4 — Chapter onboarding & data portability

- Wizard สร้าง Chapter และผู้ดูแลคนแรก
- Import สมาชิก/ทีม/วาระ พร้อม preview, validation และ duplicate resolution
- ตั้ง role, LINE integration, scoring และ templates จากหน้าเดียว
- Export ข้อมูลของ Chapter และ restore rehearsal
- Checklist ก่อน go-live และ guided smoke test

### Phase 5 — Platform operations & reliability

- Platform Admin แยกจาก Chapter Admin
- Tenant health, error monitoring, audit search และ support impersonation แบบ read-only/มี audit
- CI ตรวจ migrations, routes, auth, RLS และ cross-tenant leakage
- Staging, backup, point-in-time recovery, disaster recovery และ status page
- SLO สำหรับหน้าเว็บ/API/LINE delivery และ incident playbook

### Phase 6 — Commercial product

- Package/feature entitlement และ usage metering
- Billing, invoice และ renewal โดยไม่ผูก access กับ payment provider โดยตรง
- PDPA/privacy policy, retention, consent และ data deletion/export workflow
- Terms, SLA, support process, onboarding materials และ product analytics
- Pilot Chapter ที่สอง ก่อน limited launch

## Definition of Done สำหรับทุกงานต่อจากนี้

### Foundation ที่เพิ่มแล้ว: Monthly CSV Sync Ledger

- Monthly Sync ต้องผ่าน Preview และระบุ reporting period ก่อนเขียนข้อมูลจริง
- เก็บ hash, quality summary, ผู้ดำเนินการ และผลลัพธ์ โดยไม่เก็บเนื้อหา CSV ต้นฉบับ
- เก็บ before/after snapshot ครบทุกประวัติของสมาชิกที่ได้รับผลกระทบ
- Rollback ได้เฉพาะ completed batch ล่าสุด และทำใน database transaction เดียว
- Ledger ผูก `chapter_id` ซึ่ง backend derive จาก active Chapter; เมื่อเข้าสู่ multi-tenant เต็มรูปแบบให้เปลี่ยน resolver เป็น Chapter จาก credential/session

ก่อน merge/commit งาน ต้องตอบได้ครบตามส่วนที่เกี่ยวข้อง:

- [ ] ไม่มี Chapter name, team, person, PIN, email, token หรือ business threshold ใหม่ที่ hardcode โดยไม่จำเป็น
- [ ] Schema/API ใหม่รองรับ tenant scope หรือมี migration path ที่ระบุชัด
- [ ] Backend derive Chapter และสิทธิ์จาก session/credential ที่เชื่อถือได้
- [ ] ไม่มี secret หรือข้อมูลส่วนตัวหลุดไป client, URL, analytics หรือ log
- [ ] Sensitive read/write ผ่าน authorization; write สำคัญมี audit event
- [ ] Operation ที่ retry ได้มี idempotency และแสดงสถานะสำเร็จ/ล้มเหลวจริง
- [ ] Migration เป็น additive, มี backfill/verification/rollback note และไม่แก้ migration ที่ deploy แล้ว
- [ ] Unique constraint/index/query ไม่เปิดช่องปะปนข้อมูลข้าม Chapter
- [ ] มี test ตามความเสี่ยง รวม unauthorized และ cross-tenant case เมื่อเกี่ยวข้อง
- [ ] UI มี loading, empty, error, success, confirmation และ responsive state ที่เหมาะสม
- [ ] ข้อความ/กติกาที่ Chapter อื่นอาจเปลี่ยนได้ไม่ฝังแน่นใน component
- [ ] อัปเดต roadmap/runbook/ADR เมื่อมีผลต่อสถาปัตยกรรมหรือการปฏิบัติการ

## ลำดับเปิดขายที่แนะนำ

1. รักษา IDEAL ให้เสถียรและทยอยแยก configuration
2. สร้าง tenant foundation และย้าย IDEAL เป็น tenant แรก
3. ทดสอบ Chapter จำลองและ leakage tests
4. ทำ Token/LINE architecture หลังเงื่อนไข readiness ครบ
5. Pilot Chapter จริงแห่งที่สองพร้อมทีม support
6. เติม billing, privacy และ self-service onboarding
7. เปิดขายแบบจำกัดจำนวน ก่อนขยายเต็มรูปแบบ

กรอบเวลาโดยประมาณเมื่อเริ่มทำเต็มกำลัง:

- Pilot Chapter ที่สอง: 8–12 สัปดาห์
- Commercial แบบควบคุม onboarding: 4–6 เดือน
- Self-service SaaS ที่พร้อมขยาย: 6–9 เดือน

## วิธีดึงแผนกลับมาทำต่อ

ใช้คำสั่งงานว่า: **“เปิด Commercial Multi-Chapter Roadmap และเริ่ม Phase ถัดไป”** แล้วเริ่มด้วย readiness review โดยเฉพาะหัวข้อ Token ห้ามเริ่ม migration หรือย้าย production secret เพียงเพราะมีงานอื่นมาแตะระบบ LINE

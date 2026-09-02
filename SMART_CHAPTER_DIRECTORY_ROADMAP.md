# Smart Chapter Directory — Product Roadmap

วันที่จัดทำ: 2 กันยายน 2569 (2026-09-02)  
เจ้าของผลิตภัณฑ์: Chapter Admin (พีท)  
สถานะปัจจุบัน: **Phase 1 — พร้อมเริ่มพัฒนา**

## เป้าหมาย

เปลี่ยน Smart Chapter Directory จากรายชื่อสมาชิกให้เป็น `Chapter Opportunity & Warm Introduction Engine` ที่ช่วยสมาชิกตอบคำถามสามข้อภายในหนึ่งนาที:

1. โอกาสนี้ควรนึกถึงใคร
2. ระบบแนะนำคนนี้เพราะอะไร
3. ต้องทำอะไรต่อเพื่อสร้าง Referral ที่เหมาะสมและได้รับความยินยอม

ระบบต้องเป็น Mobile-first, ไม่เพิ่ม LINE Push ที่ไม่จำเป็น, ไม่เปิดเผยข้อมูลบุคคลที่สาม และไม่สร้างคะแนนแข่งขันสาธารณะระหว่างสมาชิก

## หลักการตัดสินใจ

- เดินหน้าตาม **Stage Gate** ไม่ใช่วันที่อย่างเดียว
- Phase ถัดไปเริ่มได้เมื่อ Phase ปัจจุบันผ่านเกณฑ์และพีทอนุมัติ
- ฟีเจอร์ใหม่เริ่มจาก Pilot ก่อนเปิดทั้ง Chapter
- ข้อมูลที่ใช้ค้นหาต้องมาจากสมาชิกและมี Consent ชัดเจน
- ข้อความที่ระบบร่างต้องแก้ไขได้ก่อนส่งเสมอ
- ใช้ In-app notification หรือ Digest ก่อน LINE Push
- Migration ต้อง additive และมีทาง rollback โดยไม่ลบประวัติ

## ตารางเวลาเป้าหมาย

| จุดตรวจ | วันที่เป้าหมาย | สิ่งที่ต้องตัดสินใจ |
|---|---:|---|
| เริ่ม Phase 1 | 2 ก.ย. 2569 | ยืนยันขอบเขตและข้อมูลเดิมที่นำกลับมาใช้ |
| Phase 1 Readiness Review | 7 ก.ย. 2569 | อนุมัติ Pilot UX หรือส่งกลับแก้ไข |
| Phase 1 Pilot Review | 10 ก.ย. 2569 | เปิด Phase 2 ได้หรือยัง |
| Phase 2 Readiness Review | 18 ก.ย. 2569 | ตรวจ Consent, Workflow และข้อความขอแนะนำ |
| Phase 2 Pilot Review | 22 ก.ย. 2569 | อนุมัติเปิด Chapter หรือปรับ Workflow |
| Phase 3 Readiness Review | 30 ก.ย. 2569 | ตรวจ Analytics, Digest และ Growth Gap |
| Final Production Review | 5 ต.ค. 2569 | เปิดใช้ครบ, คง Pilot หรือ rollback บางส่วน |

วันที่เป็นเป้าหมาย ไม่ใช่คำสั่งเปิดใช้งานอัตโนมัติ หาก Stage Gate ไม่ผ่าน ให้บันทึกเหตุผลและกำหนดวันทบทวนใหม่

---

## Phase 1 — Find the Right Member

**เป้าหมาย:** ทำให้ผลค้นหาเข้าใจง่าย แม่น และนำไปใช้ได้ทันที โดยยังไม่สร้าง Workflow ติดต่อใหม่

### งานพัฒนา

- [ ] แสดง `เหตุผลที่ Match` บนทุกผลลัพธ์
- [ ] แยกผลลัพธ์ `Referral พร้อม` และ `สมาชิกทั้งหมด`
- [ ] จัดสมาชิกที่เปิดแชร์และข้อมูลสมบูรณ์ไว้ก่อน
- [ ] แสดง Referral Readiness โดยไม่ใช้เป็น Ranking สาธารณะ
- [ ] แสดงวันที่อัปเดต Referral Focus ล่าสุด
- [ ] เพิ่ม `บันทึกไว้` และหน้ารายการที่สมาชิกบันทึก
- [ ] ปรับการ์ด Mobile ให้สแกนได้เร็วและปุ่มสัมผัสไม่น้อยกว่า 44px
- [ ] เพิ่ม Empty, Loading, Error, Offline และ No-consent states
- [ ] รองรับคำค้นภาษาไทยที่มีเว้นวรรค/รูปแบบใกล้เคียง
- [ ] เพิ่ม Event แบบไม่เก็บเนื้อหาส่วนตัว: search, result open, bookmark
- [ ] เพิ่มการ์ดเตือนวัน Review สำหรับ Chapter Admin ใน MC Desktop โดยอ่าน Phase/วันที่จากการตั้งค่ากลางและไม่ส่ง LINE อัตโนมัติ

### ข้อมูลและความเป็นส่วนตัว

- ใช้ข้อมูลพื้นฐานจาก `members` และข้อมูลที่เจ้าของเปิด `share_directory=true`
- ห้ามส่ง GAINS, เบอร์โทร, อีเมล, Mentor feedback, private notes และข้อมูล Connection ภายนอก
- คำค้นเชิง Analytics ต้องไม่แสดงว่าใครเป็นผู้ค้นหาใน Desktop

### UX Acceptance

- ผู้ทดสอบเข้าใจผลลัพธ์แรกและเหตุผลที่ Match ภายใน 10 วินาที
- ผู้ทดสอบค้นหาจากชื่อ อาชีพ ปัญหา และ Referral Trigger ได้
- ผู้ทดสอบแยกได้ทันทีว่าใคร “Referral พร้อม” และใครมีเพียงข้อมูลพื้นฐาน
- หน้าจอ 390×844 ไม่มีข้อความหรือปุ่มล้น
- ไม่มีการสร้าง LINE Push ใหม่จากการค้นหาและ Bookmark

### Stage Gate 1

เริ่ม Phase 2 ได้เมื่อ:

- [ ] Automated tests ผ่าน
- [ ] ทดสอบ iPhone/Android/Desktop ผ่าน
- [ ] สมาชิก Pilot อย่างน้อย 5 คนทำภารกิจค้นหาได้โดยไม่ต้องอธิบาย
- [ ] อย่างน้อย 4 ใน 5 คนตอบได้ว่าระบบแนะนำบุคคลนั้นเพราะอะไร
- [ ] ไม่มีข้อมูลที่ไม่ได้รับ Consent หลุดในผลค้นหาหรือ Profile API
- [ ] พีทอนุมัติ Phase 1 Pilot Review

---

## Phase 2 — Warm Introduction Workflow

**เป้าหมาย:** เปลี่ยนผลค้นหาเป็นการขอแนะนำที่มีคุณภาพ โดยเจ้าของ Connection ควบคุมการเชื่อมต่อ

### งานพัฒนา

- [ ] Referral Fit Check ก่อนขอแนะนำ
- [ ] ปุ่ม `ขอให้ช่วยแนะนำ`
- [ ] เลือกผู้ประสานภายใน Chapter จากเส้นทางที่ได้รับอนุญาต
- [ ] สร้าง Draft คำขอ Warm Introduction ที่ผู้ใช้แก้ไขได้
- [ ] ให้ผู้ประสาน Accept, Decline หรือ Ask for context
- [ ] ให้เหตุผลปฏิเสธเป็นตัวเลือกที่สุภาพและไม่บังคับเปิดเผยรายละเอียด
- [ ] สถานะ `Draft → Requested → Accepted/Declined → Introduced → Closed`
- [ ] บันทึก Audit Event และ Idempotency ป้องกันกดซ้ำ
- [ ] Feedback แบบปิดหลังการแนะนำ
- [ ] เชื่อม Referral/1-2-1 history เดิมโดยไม่สร้างข้อมูลซ้ำ

### Guardrails

- ห้ามส่งข้อมูล Connection ภายนอกก่อนเจ้าของอนุญาต
- AI หรือ Template ร่างข้อความได้ แต่ส่งเองไม่ได้
- ผู้รับคำขอต้องมีทางปฏิเสธโดยไม่เสียคะแนน
- ห้ามทำ Rating ดาวหรือ Leaderboard จากการตอบรับ
- LINE ใช้เฉพาะเหตุการณ์ที่ต้องลงมือทำจริง และผ่าน Notification Governance

### Stage Gate 2

เริ่ม Phase 3 ได้เมื่อ:

- [ ] ทดสอบ Permission matrix ระหว่าง Member, Mentor, Mentor Support, Mentor Co. และ Chapter Admin ผ่าน
- [ ] การกดซ้ำไม่สร้างคำขอหรือข้อความซ้ำ
- [ ] Decline ไม่เปิดข้อมูลส่วนตัวและไม่สร้างผลเสียต่อคะแนนสมาชิก
- [ ] Pilot อย่างน้อย 5 เส้นทางจบครบ Workflow
- [ ] ผู้ใช้เข้าใจว่าใครเป็นผู้อนุญาต Connection
- [ ] LINE volume ไม่เพิ่มเกินงบที่กำหนด
- [ ] พีทอนุมัติ Phase 2 Pilot Review

---

## Phase 3 — Chapter Opportunity Intelligence

**เป้าหมาย:** ช่วยสมาชิกและ Growth Team มองเห็นความต้องการของ Chapter โดยไม่กลายเป็นระบบสอดส่องพฤติกรรมรายบุคคล

### งานพัฒนา

- [ ] Saved Search ของสมาชิก
- [ ] Weekly Opportunity Digest แบบสรุปรวม
- [ ] Suggested synonyms ภาษาไทยจากคำค้นที่ไม่พบผลลัพธ์
- [ ] Warm Path ภายใน Chapter จากข้อมูลที่มีสิทธิ์ใช้
- [ ] Dashboard ส่วนตัว: ถูกค้นพบ, Profile open, Saved, Intro request
- [ ] Dashboard Chapter แบบ aggregate เท่านั้น
- [ ] Growth Gap: หมวดหรือปัญหาที่ถูกค้นบ่อยแต่ไม่มีผู้รองรับ
- [ ] แนะนำหมวด Visitor ที่ Chapter ควรเชิญ
- [ ] ตรวจข้อมูล Referral Focus ที่เก่าเกิน 90 วัน
- [ ] ระบบ Pause/Availability สำหรับสมาชิกที่ยังไม่พร้อมรับงาน

### Notification Policy

- ค่าเริ่มต้นเป็น In-app
- Digest ไม่เกินสัปดาห์ละหนึ่งครั้ง
- ไม่มี Push เมื่อมีคนเปิด Profile หรือค้นชื่อสมาชิก
- มี Preview, Budget, Cooldown, Quiet hours และ Idempotency
- สมาชิกปิด Digest ได้ด้วยตนเอง

### Stage Gate 3

- [ ] Analytics ไม่เปิดเผยผู้ค้นหารายบุคคล
- [ ] Growth Gap ใช้ข้อมูลรวมและมี minimum cohort ที่ปลอดภัย
- [ ] Saved Search ลบและปิดแจ้งเตือนได้
- [ ] Digest ไม่มีข้อความซ้ำและไม่เกิน Notification budget
- [ ] คำแนะนำทุกชิ้นอธิบายเหตุผลได้
- [ ] พีทอนุมัติ Final Production Review

---

## Final QA Matrix

| พื้นที่ | ต้องตรวจ |
|---|---|
| Mobile | 360/390/430px, keyboard, safe area, loading, offline, long Thai text |
| Desktop | Member 360 link, Chapter aggregate, role visibility |
| Search | ชื่อ, ชื่อเล่น, บริษัท, อาชีพ, Looking for, Trigger, synonym, no result |
| Privacy | opt-in/off, hidden fields, third-party data, guessed member ID |
| Workflow | accept/decline, duplicate tap, expired request, archived member |
| LINE | preview, budget, suppression, cooldown, quiet hours, duplicate prevention |
| Accessibility | 44px targets, focus, contrast, labels, reduced motion |
| Performance | lazy load, API limit, debounce, empty query, large roster |

## Rollback Strategy

1. ปิด feature flag ของ Phase ล่าสุด
2. หยุด LINE category ที่เกี่ยวข้องก่อน
3. Deploy frontend/API รุ่นก่อนหน้า
4. เก็บตาราง additive และ Audit history ไว้
5. ห้ามลบข้อมูล Workflow จนกว่าจะ export และได้รับอนุมัติ

## Decision Log

| วันที่ | Phase | การตัดสินใจ | เหตุผล | วันทบทวนถัดไป |
|---|---|---|---|---|
| 2 ก.ย. 2569 | Planning | สร้าง Roadmap และเริ่มจาก Phase 1 | ลดความเสี่ยงและพิสูจน์ UX ก่อนสร้าง Workflow ติดต่อ | 7 ก.ย. 2569 |

## Review Template

เมื่อถึงวันทบทวน ให้ตอบคำถามต่อไปนี้ก่อนเลื่อน Phase:

1. สิ่งที่ส่งมอบครบตาม checklist หรือไม่
2. Automated test และ Manual QA ผ่านอะไร/ไม่ผ่านอะไร
3. มีข้อมูลส่วนตัวหรือ Permission ใดเสี่ยงหรือไม่
4. สมาชิก Pilot ใช้งานสำเร็จกี่คน และติดตรงไหน
5. LINE volume เปลี่ยนหรือไม่
6. ควร `Go`, `Revise`, `Hold` หรือ `Rollback`
7. หาก Go ให้พีทยืนยันก่อนเริ่ม Phase ถัดไป

## Reminder Runbook

เมื่อระบบเตือนในวันทบทวน ให้ดำเนินการดังนี้:

1. เปิดไฟล์ `SMART_CHAPTER_DIRECTORY_ROADMAP.md`
2. ตรวจ Phase ปัจจุบันและ Stage Gate
3. ตรวจ Git history, tests, production health และ Pilot feedback
4. สรุปสิ่งที่เสร็จ สิ่งที่ค้าง ความเสี่ยง และคำแนะนำ Go/Revise/Hold
5. แจ้งพีทโดยยังไม่เริ่ม Phase ถัดไปจนกว่าจะได้รับอนุมัติ

### Reminder behavior ในระบบ

- แสดงการ์ดใน MC Desktop เมื่อเหลือไม่เกิน 2 วันก่อน Review
- เปลี่ยนเป็นสถานะ `ถึงวันทบทวน` เมื่อครบกำหนด และ `เลยกำหนด` หากยังไม่ได้ตัดสินใจ
- ปุ่มบนการ์ดต้องเปิด Stage Gate ของ Phase ปัจจุบันและแบบฟอร์ม Review
- การกด `Go` ต้องให้ Chapter Admin ยืนยัน และจึงเปลี่ยน Phase/วันทบทวนถัดไป
- การกด `Revise` หรือ `Hold` ต้องบันทึกเหตุผลและวันทบทวนใหม่
- ไม่ส่ง LINE อัตโนมัติ; หากอนาคตต้องการ LINE ให้เพิ่มเป็น opt-in และผ่าน Notification Governance ก่อน

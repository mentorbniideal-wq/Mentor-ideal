# LT Term Handover System

เป้าหมายคือให้ทีมวาระเดิมส่งต่องาน คน ข้อมูล และสิทธิ์ให้ทีมวาระใหม่โดยไม่มีงานหลุด และยังตรวจสอบย้อนหลังได้ โดยไม่สร้างฐานข้อมูลสมาชิกหรืองานซ้ำกับระบบเดิม

## Phase 1 — Term & Role Foundation

- ใช้ `lt_terms` และ `passport_lt_assignments` เป็นแหล่งข้อมูลหลัก
- ผูกสิทธิ์กับวาระและกำหนดวันเริ่ม/วันหมดอายุ
- ใช้ Term Wizard สร้างวาระถัดไปและคัดลอกผู้รับผิดชอบเดิม

สถานะ: ฐานเดิมพร้อม; เพิ่ม lifecycle fields และตัวตรวจสิทธิ์ตามเวลาแล้ว

## Phase 2 — Role Handover

- Checklist แยกทุกตำแหน่ง: งานค้าง, เอกสาร/ความรู้, บัญชีและสิทธิ์
- แสดงผู้ส่งมอบและผู้รับมอบ
- ต้องมีการรับทราบจากทั้งสองฝ่ายก่อนนับว่าสมบูรณ์
- บันทึกเหตุการณ์ทุกครั้งใน Chapter Audit Log

สถานะ: API, schema และ Desktop Chapter Center พร้อมใช้งานหลัง migration

## Phase 3 — Immutable Snapshot

- เก็บ baseline, handover และ closing snapshot แยกกัน
- Snapshot เก็บ LT assignments, งานเปิด, checklist และรายชื่อสมาชิก ณ เวลานั้น
- ห้ามแก้ไขหรือลบ Snapshot เพื่อรักษาหลักฐานย้อนหลัง

สถานะ: schema, API และปุ่มสร้าง Handover Snapshot พร้อมแล้ว

## Phase 4 — Access Transition

- รองรับวันเริ่มสิทธิ์ วันหมดสิทธิ์ และช่วง read-only
- Chapter Admin สั่งตรวจ lifecycle ได้จาก Chapter Center
- บัญชี Full Access ของเจ้าของระบบไม่ถูกลดสิทธิ์โดยอัตโนมัติ

สถานะ: แกน lifecycle พร้อม; งานถัดไปคือ scheduled execution และหน้าแก้ช่วง Shadow/Read-only

## Phase 5 — One Essential LINE Summary

- Preview ก่อนส่งเสมอ
- รวมเฉพาะงานที่ผู้รับต้องทำ ลิงก์เข้า Workspace และวันครบกำหนด
- มีผลส่งรายคนและ retry เฉพาะคนที่ล้มเหลว
- ไม่ส่งซ้ำกับข้อความอัตโนมัติประเภทอื่น

สถานะ: เชื่อม Preview token, notification guard, delivery receipts และผลส่งรายคนแล้ว; ต้องผ่าน rehearsal ก่อนเปิดใช้จริง

## Phase 6 — Term Comparison & Close

- เปรียบเทียบ baseline กับ closing: งานค้าง, LINE readiness, profile coverage และปัญหาเกิน SLA
- ปิดวาระได้เมื่อ blocker สำคัญถูกยืนยันหรือมีเหตุผลอนุมัติ
- เก็บรายงานอ่านย้อนหลังใน Chapter Center

สถานะ: มี Snapshot และ comparison UI แล้ว; close gate จะเปิดหลัง rehearsal ยืนยันเกณฑ์ blocker ของ Chapter

## Release order

1. Apply database migration
2. Deploy API
3. Deploy Desktop assets
4. ทดสอบด้วยวาระจำลองและบัญชีที่ไม่ใช่ Full Access
5. เปิด scheduled lifecycle หลังผ่าน rehearsal
6. เปิด LINE summary หลังตรวจ preview และ recipient list

## Safety rules

- `phitarn.p@gmail.com` เป็น Full Access เพียงบัญชีเดียว
- ห้ามเก็บ PIN, token หรือเนื้อหาข้อความส่วนตัวใน audit/snapshot
- ทุกการส่ง LINE ต้อง Preview → Confirm → Delivery result
- Snapshot เขียนครั้งเดียวและไม่แก้ย้อนหลัง
- ระบบใหม่ต้อง additive และไม่เปลี่ยนประวัติวาระเดิม

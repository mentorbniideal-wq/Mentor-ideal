# Production E2E Runbook

ใช้เอกสารนี้ก่อนวันประชุมหรือหลัง deploy ที่แตะ Login, Member Action, LINE, 1-2-1 หรือ Notification

## หลักความปลอดภัย

- ใช้บัญชีทดสอบที่เจ้าของบัญชียินยอม 2–3 บัญชีเท่านั้น
- เริ่มด้วย Smoke Test แบบ read-only เสมอ
- ห้ามใช้ Broadcast หรือรอบสมาชิกจริงสำหรับการทดสอบ
- ทุกการส่งต้อง Preview และยืนยันผู้รับก่อน
- คำว่า `LINE รับแล้ว` หมายถึง LINE Messaging API ตอบรับ ไม่ใช่หลักฐานว่าเปิดอ่านแล้ว

## Gate 1 — Read-only readiness

1. Desktop → Settings → System Version & Route Health
2. กด `ตรวจระบบ` และ `Smoke Test`
3. ต้องผ่าน Dashboard, Work Queue, LT Routing, 1-2-1 Overview และ LINE Activity
4. Chapter Center ต้องไม่มี Critical issue ที่เกี่ยวกับข้อมูลซ้ำหรือผู้รับตำแหน่งไม่มี LINE

## Gate 2 — Member Action

1. บัญชีสมาชิกทดสอบเปิด MY IDEAL
2. ส่งคำขอหนึ่งรายการจาก Help Center
3. ตรวจว่าหน้าสมาชิกแสดง `รับเรื่องแล้ว`
4. ตรวจ Universal Work Queue ว่ามีรายการเดียว ไม่เกิด duplicate หลัง refresh
5. ผู้รับผิดชอบกดรับดูแล ใส่ข้อความตอบสมาชิก และปิดเคส
6. สมาชิกเปิด Timeline แล้วต้องเห็นสถานะล่าสุด แต่ไม่เห็น Internal note

## Gate 3 — LINE delivery

1. เปิด Desktop → LINE AUTO → Delivery Truth
2. ตรวจชื่อ ประเภทข้อความ Preview และสถานะของบัญชีทดสอบ
3. ถ้าล้มเหลว ใช้ `ตรวจและส่งใหม่`; เจ้าของระบบต้องยืนยัน Preview อีกครั้ง
4. ตรวจว่ารายการ Retry สร้าง Delivery record ใหม่และมี Audit event
5. ห้ามสรุปว่าโทรศัพท์ได้รับหรือเปิดอ่านจากสถานะ provider accepted เพียงอย่างเดียว

## Gate 4 — 1-2-1 controlled round

1. สร้างรอบเฉพาะบัญชีทดสอบและตรวจ Data Quality ก่อนสุ่ม
2. Preview รายชื่อและข้อความทุกคน
3. ล็อกคู่และส่งจริงครั้งเดียว
4. หน้าส่งแบบ Live ต้องแสดงผลครบทุกคน
5. ทดสอบนัดหมาย รหัสหกหลัก การยืนยัน และ Reflection ให้ครบหนึ่งคู่
6. ยกเลิกรอบทดสอบหลังเก็บผล โดยห้ามลบ Delivery/Audit history

## เกณฑ์ผ่าน

- ไม่มีข้อมูลซ้ำหรือคำขอซ้ำจาก retry
- ผู้รับและ Chapter scope มาจาก session/assignment ฝั่ง server
- ผล `sent`, `failed`, `skipped` ตรงกับ Delivery Ledger
- Viewer แก้ข้อมูลหรือ Retry ไม่ได้
- Internal note ไม่ปรากฏต่อสมาชิก
- ทุก error มีสาเหตุและขั้นตอนแก้ไข

## งานที่ยังไม่ควรเปิดอัตโนมัติ

- Daily Digest ยังไม่เปิดจนกว่าจะมีการยืนยันเวลาและกลุ่มข้อความจาก Pete
- การย้าย LINE Token/Secret แยก Chapter ยังคงพักตาม `COMMERCIAL_MULTI_CHAPTER_ROADMAP.md`


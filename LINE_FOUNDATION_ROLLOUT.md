# LINE Mentor & Growth — Foundation Rollout

ระยะนี้รวมระบบ LINE ให้มีจุดควบคุมกลาง เพิ่มการเชื่อมบัญชีแบบปลอดภัย
และป้องกัน webhook/notification ซ้ำ โดยยังไม่เปิด Rich Menu, LIFF หรือ AI Copilot

## สิ่งที่เปลี่ยน

- สมาชิกเดิมใน `line_members` ใช้งานต่อได้ตามปกติ
- สมาชิกใหม่ต้องรับ one-time link token จาก MC แล้วส่ง `เชื่อม <รหัส>`
- ชื่อและชื่อเล่นไม่สามารถใช้ claim บัญชีได้ เว้นแต่เปิด rollback flag ชั่วคราว
- ทุก webhook event ถูก claim แบบ atomic และ retry ได้สูงสุด 3 ครั้งเมื่อ processing ล้มเหลว
- ตัวส่ง LINE กลางตรวจ HTTP error และบันทึก sent/failed/skipped
- Scheduled notifications ใช้ idempotency key และเคารพ mute setting
- Renewal เปลี่ยนจากเตือนทุกวันเป็น milestone 45/30/14/7/3/1/0 วัน
- `rebuild_line_cron_jobs()` ลบ scheduler ทั้งสองรุ่นและสร้าง canonical jobs ชุดเดียว

## ตารางใหม่

- `line_link_tokens`
- `line_webhook_events`
- `line_message_deliveries`

ตารางทั้งหมดเปิด RLS และอนุญาตการเข้าถึงจาก `service_role` เท่านั้น
ข้อความ LINE เต็มฉบับจะไม่ถูกเก็บใน delivery log โดยเก็บเฉพาะ SHA-256 hash

## ลำดับ rollout ที่ปลอดภัย

1. สำรองรายการ `line_members` และตรวจ duplicate mapping
2. Apply migration `20260621000026_line_foundation.sql`
3. Deploy `api`, `line-webhook`, `cron-jobs` และ `admin-api`
4. ตั้ง secrets:
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_CHANNEL_SECRET`
   - `LINE_WEBHOOK_ENABLED=true`
   - `LINE_ALLOW_LEGACY_NAME_REGISTRATION=false`
   - `CRON_SECRET` ให้ตรงกับ `cron_config.cron_secret`
5. ทดสอบ `createLineLinkToken` ด้วยสมาชิกทดสอบ
6. เปลี่ยน LINE Developers webhook URL ไปที่ Supabase `line-webhook`
7. Verify webhook แล้วทดสอบ follow, link, status และ redelivery
8. เรียก `setupAllTriggers` เพียงครั้งเดียวหลังตรวจ cron secret แล้ว
9. ตรวจ `line_webhook_events`, `line_message_deliveries` และ `cron.job`
10. ปิดหรือลบ GAS triggers หลัง observation period

## Rollback

- เปลี่ยน LINE Developers webhook URL กลับ GAS
- ตั้ง `LINE_WEBHOOK_ENABLED=false`
- อย่าเปิด `LINE_ALLOW_LEGACY_NAME_REGISTRATION=true` เว้นแต่จำเป็นจริง
- Scheduler ใหม่ย้อนกลับได้ด้วยการ unschedule job ที่ขึ้นต้น `line-`

## Known constraints

- ต้อง apply migration ก่อน deploy webhook มิฉะนั้น event claim จะไม่สำเร็จ
- `setupAllTriggers` จะตั้ง canonical scheduler จริง จึงห้ามเรียกก่อน secrets พร้อม
- UI สำหรับออก link token ยังไม่อยู่ในระยะนี้ แต่ API `createLineLinkToken`
  และ `revokeLineLinkTokens` พร้อมให้หน้า Admin เรียกใช้ในระยะ UX
- Rich Menu, Flex Message และ LIFF อยู่ในระยะถัดไป

## Phase 2–4 additions prepared in working tree

- Role-based Rich Menu 4 แบบ: Member, Mentor, MC และ Growth
- ภาพ production ใช้ไฟล์ `rich-menu-*-v2.jpg` ขนาด 2500×1686 และต่ำกว่า 1 MB
- Flex Score Card สำหรับคำสั่ง `สถานะ`
- LIFF Action Center: ลา/ส่งแทน, นัด 1-2-1, เป้าหมาย และขอความช่วยเหลือ
- AI Copilot แบบ read-only ผ่านคำสั่ง `ถาม ...` และ API `askCopilot`
- Analytics สำหรับ command, delivery, LIFF และ AI run

ก่อน rollout ต้องแทนค่า `REPLACE_WITH_LINE_LIFF_ID` ใน `public/liff/config.js`
และ deploy `liff-api` เพิ่มจากรายการเดิม

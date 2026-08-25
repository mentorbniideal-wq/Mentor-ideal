# BNI IDEAL Chapter Operations — Major Upgrade Rollout

วันที่จัดทำ: 25 สิงหาคม 2569

## เป้าหมาย

ยกระดับ Desktop, Mentor Mobile และ LIFF ให้ใช้โครงสร้างสิทธิ์ ทีมงาน และรายการงานชุดเดียวกัน โดยไม่สร้างฐานสมาชิก การแจ้งเตือน หรือประวัติซ้ำ ระบบเดิมยังทำงานได้ระหว่างทยอยเปิดใช้

## สิ่งที่เปลี่ยน

1. **Role & Capability** — แยก Chapter Admin, Mentor Co., Mentor Team และ Mentor Support ตามความสามารถจริง ไม่ใช้ชื่อ role อย่างเดียวในการอนุญาตงานสำคัญ
2. **Stable Team Identity** — ทีม Mentor มีรหัสคงที่ แต่ชื่อแสดงผลเปลี่ยนตามหัวหน้าทีมและวาระได้ ประวัติเดิมจึงไม่ขาดเมื่อเปลี่ยนวาระ
3. **Universal Work Queue** — คำขอจากเป้าหมาย, Visitor, Renewal, Training, 1-2-1 และคุยกับ Mentor ใช้รายการงานกลาง พร้อมผู้รับผิดชอบ, SLA, สถานะ และ Audit Event
4. **Desktop + Mobile** — Chapter Admin เห็นภาพรวมและจัดสรรงาน; Mentor เห็นเฉพาะทีม/งานที่ได้รับมอบหมาย; Mentor Support อ่านและช่วยวิเคราะห์ได้แต่ไม่ติดต่อสมาชิกโดยตรง
5. **Notification Governance** — LINE Delivery แยก module/category/priority และใช้งบ, cooldown, quiet hours และ idempotency ชุดกลาง
6. **UX/Accessibility** — การ์ดงานอ่านง่ายบนจอเล็ก, ปุ่มสัมผัสอย่างน้อย 44px, สถานะ SLA ชัดเจน และรองรับ Reduced Motion

## Migration order

ใช้ migration แบบ additive ตามลำดับนี้:

1. `20260825000075_role_capabilities.sql`
2. `20260825000076_mentor_team_catalog.sql`
3. `20260825000077_member_signal_work_queue.sql`
4. `20260825000078_line_delivery_module_governance.sql`

ห้ามข้ามลำดับ และห้ามลบ table/column เดิมระหว่าง rollout

## Deployment order

1. สำรอง schema และตรวจ migration history
2. รัน database lint และ push migrations
3. Deploy Edge Functions ที่ใช้ shared auth/LINE: `api`, `admin-api`, `liff-api`, `line-webhook`, `cron-jobs`
4. Deploy Vercel Production
5. เปิดทดสอบด้วยบัญชี Chapter Admin ก่อน แล้วจึง Mentor Co., Mentor Team และ Mentor Support
6. ตรวจ delivery ledger แบบ dry-run ก่อนอนุญาต LINE จริง

## Manual QA matrix

| ผู้ใช้ | Desktop | Mentor Mobile | LIFF | ผลที่ต้องได้ |
|---|---|---|---|---|
| Chapter Admin | ทุกส่วน | ตามที่กำหนด | Member flow | จัด role/team/queue ได้ครบ |
| Mentor Co. | Mentor scope | งานทีม Mentor | Member flow | ดูแล Mentor ได้ แต่เข้า Control Plane ไม่ได้ |
| Mentor Team | เฉพาะทีม | งานทีมตน | Member flow | ไม่เห็นข้อมูลทีมอื่น |
| Mentor Support | อ่านคำขอช่วยเหลือ | อ่าน/ช่วยวิเคราะห์ | Member flow | ไม่มีปุ่มติดต่อสมาชิกหรือปิดงาน |
| Member | ไม่มี Admin | ไม่มี Mentor workspace | Member flow | เห็นข้อมูลตนเองเท่านั้น |

ทดสอบจอ 390×844, Android ขนาดเล็ก, iPad 768×1024 และ Desktop 1440px รวมถึง keyboard, offline/error, loading/empty, reduced motion และข้อความภาษาไทยไม่ล้น

## Production smoke test

- `phitarn.p@gmail.com` แสดง Chapter Admin และเข้า Access/Settings/LT Team ได้
- `mentorbniideal@gmail.com` แสดง Mentor Co. และไม่มีสิทธิ์แก้ Control Plane
- เปลี่ยนหัวหน้าทีมแล้วชื่อแสดงผลเปลี่ยน แต่ Team ID และประวัติสมาชิกเดิมไม่เปลี่ยน
- สร้างคำขอทดสอบหนึ่งรายการ แล้วตรวจว่า Desktop และ Mentor Mobile เห็นตรงกัน
- เปลี่ยนสถานะด้วย version ล่าสุดได้; tab เก่าต้องได้รับ conflict แทนการเขียนทับ
- LINE dry-run แสดง module/category/priority ถูกต้อง และกดซ้ำไม่สร้าง delivery ซ้ำ

## Rollback

1. หยุดการส่งจริงและเปิด dry-run/emergency stop
2. Roll back Vercel ไป deployment ก่อนหน้า
3. Redeploy Edge Functions เวอร์ชันก่อนหน้า
4. คง migration และข้อมูลใหม่ไว้เพื่อ audit; ไม่ drop table ระหว่างเหตุฉุกเฉิน
5. หากต้องย้อน schema จริง ต้อง export ข้อมูลและอนุมัติเป็นราย migration ก่อนเท่านั้น

## Known limitations / รอบถัดไป

- Frontend ปัจจุบันยังเป็น bundle ขนาดใหญ่ ควรแยกโหลดตามหน้าในรอบ performance โดยไม่รวมกับการเปลี่ยนสิทธิ์ครั้งนี้
- Realtime collaborative editing ยังไม่เปิด; ใช้ optimistic version ป้องกัน lost update
- Module เก่าบางจุดยังต้องทยอยระบุ category/priority โดยตรง แม้ระบบจะมี safe inference แล้ว
- ควรติดตาม SLA, งานค้าง, suppression reason และ LINE quota อย่างน้อยสองสัปดาห์หลังเปิดใช้

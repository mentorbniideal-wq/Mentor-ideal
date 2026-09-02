type AutomationPreview = { defaultPreview: string; previewNote: string; sendsLine: boolean };
const SYSTEM_ONLY = 'รายการนี้เป็นงานเบื้องหลังของระบบ จึงไม่มีข้อความส่งเข้า LINE';
const previews: Record<string, string> = {
  mentorTeamAlert: '⚠️ Mentor Action · ทีม [ชื่อทีม]\nมี [จำนวน] คนที่ควรเช็กอิน:\n────────────────────\n🔴 [ชื่อสมาชิก]: [คะแนน] pt\n────────────────────\nเลือกติดต่อ 1 คนก่อนภายในสัปดาห์นี้\nดูรายละเอียดที่ Desktop → สมาชิก',
  renewalPush: '🔁 Renewal · คุณ[ชื่อเล่น]\nสมาชิกภาพเหลือ [จำนวนวัน] วัน ⚠️\n\nขั้นตอนถัดไป: ติดต่อ Mentor Co. เพื่อยืนยันแผนต่ออายุ\nถ้าดำเนินการแล้ว ไม่ต้องตอบข้อความนี้',
  passportLtReminder: '📋 Passport Appointment\nอีก 2 วันมีนัด Passport กับคุณ[ชื่อสมาชิก]\nวันที่ [วันนัด] เวลา [เวลา]\n\nกรุณายืนยันความพร้อมกับทีม',
  line121AutoReminder: '🤝 1-2-1 ยังรอยืนยัน\n────────────────────\nถ้าพบกันแล้ว กด “เจอแล้ว” ใน MY121\nถ้ายังไม่ได้นัด เปิด MY121 เพื่อเลือกวัน\n\nข้อความนี้ส่งเฉพาะรายการที่ค้างเกิน 7 วัน',
  visitorFollowUpReminder: '👥 Follow-up Visitor\n────────────────────\n[ชื่อแขก] มาร่วมประชุมเมื่อ [วันที่]\n\nขั้นตอนถัดไป: อัปเดตผลว่า\nสนใจ / ขอเวลาตัดสินใจ / ไม่สนใจ\n\nเมื่ออัปเดตแล้ว ระบบจะหยุดเตือน',
  wednesdayNudge: '📅 พรุ่งนี้ประชุม BNI IDEAL\n────────────────────\nก่อนพักคืนนี้ เลือกเตรียมเพียง 1 เรื่อง:\n• Referral ที่ส่งต่อได้จริง\n• คนที่อยากนัด 1-2-1\n• Visitor ที่พร้อมเชิญ\n\nเตรียมครบแล้ว ไม่ต้องทำอะไรเพิ่มครับ',
  mondayBriefMc: '📊 BNI IDEAL — Monday Brief\n────────────────────\n🟢 เขียว : [จำนวน] คน\n🟡 เหลือง: [จำนวน] คน\n🔴 แดง  : [จำนวน] คน\n⚫ ดำ   : [จำนวน] คน\n────────────────────\nรวม [จำนวนสมาชิก] คน · ดูรายละเอียดใน Dashboard',
  monthlyPersonalReport: '📊 รายงานประจำเดือน [เดือน]\nสวัสดีคุณ[ชื่อเล่น] 👋\n────────────────────\n[สี] คะแนนรวม: [คะแนน]/100 pt\n────────────────────\n📌 Referral / Visitor / 1-2-1 / CEU / TYFCB\n🎯 จุดที่ควรเน้นเดือนนี้: [คำแนะนำ]\nพิมพ์ “สถานะ” หรือเปิด LIFF ดูรายละเอียดครับ',
  fridayLeaderboardMc: '🏆 Team Leaderboard — สัปดาห์นี้\n────────────────────\n[ชื่อทีม]\nAvg [คะแนน]pt  🟢[จำนวน] 🟡[จำนวน] 🔴[จำนวน] ⚫[จำนวน]',
  thursdayBotPush: '🌅 BNI Good Morning, คุณ[ชื่อเล่น]!\n────────────────────\n[สี] คะแนนล่าสุด: [คะแนน]/100 pt\n🎯 วันนี้เน้น: [คำแนะนำเฉพาะบุคคล]\n✅ เช็คลิสต์ Referral / Visitor / 1-2-1\nพิมพ์ “สถานะ” ดูรายละเอียดครับ',
  fridayRecapMembers: '🏆 BNI ประชุมเสร็จแล้ว! เยี่ยมมาก!\n────────────────────\nอย่าลืม 3 ข้อครับ:\n✅ Follow-up Referral ที่ส่งวันนี้\n🤝 จัดเวลา 1-2-1 กับเพื่อนที่นัดไว้\n📝 ส่ง Thank You Note ให้คนที่ส่ง Ref ให้คุณ\n────────────────────\nพิมพ์ “สถานะ” เพื่อดูคะแนนอัปเดต',
  mondayBriefMembers: '🌅 สัปดาห์ใหม่ BNI IDEAL!\n────────────────────\n3 เป้าหมายสัปดาห์นี้:\n✅ ส่ง Referral อย่างน้อย 1 ใบ\n🤝 นัด 1-2-1 อย่างน้อย 1 ครั้ง\n👥 ชวน Visitor มาประชุมวันศุกร์\n────────────────────\nพิมพ์ “สถานะ” ดูคะแนนของคุณ',
  monthlyRecap: '📊 Monthly Recap\n────────────────────\nเข้า Dashboard เพื่อดูสรุปประจำเดือน\nและวางแผน Coaching เดือนหน้าครับ',
};
const systemKeys = new Set(['provisionLineExperience','mondayMorningBrief','fridayEveningReminder','purgeExpiredDismissals','legacyGasChapterPulse','legacyGasMorningScore','legacyGasTeamLeaderboard','legacyGasPostMeeting']);
export function lineAutomationDefaultPreview(automationKey: string): AutomationPreview {
  if (systemKeys.has(automationKey)) return { defaultPreview: SYSTEM_ONLY, previewNote: 'งานระบบ · ไม่มีการส่งข้อความหา Member', sendsLine: false };
  const defaultPreview = previews[automationKey] || '';
  return { defaultPreview, previewNote: defaultPreview ? 'ตัวอย่างมาตรฐาน · ช่อง [ ] จะถูกแทนด้วยข้อมูลจริงตอนส่ง' : 'ยังไม่มีข้อความมาตรฐานในคลังกลาง', sendsLine: Boolean(defaultPreview) };
}

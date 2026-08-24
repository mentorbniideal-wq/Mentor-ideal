export type PairActionSnapshot={
  deliveredMemberIds:string[]; participantIds:string[]; scheduleStatus?:string;
  guidedStatus?:string; pairStatus:string; sharedReflectionMemberIds:string[];
  openFollowUps:number; openMentorHelp:number;
};

export function derivePairNextAction(x:PairActionSnapshot){
  const missing=x.participantIds.filter(id=>!x.deliveredMemberIds.includes(id));
  if(missing.length)return{code:'delivery_incomplete',title:'ส่ง LINE ให้สมาชิกที่ยังไม่ได้รับ',detail:`ยังส่งไม่ครบ ${missing.length} คน`,memberIds:missing,tone:'warning'};
  if(x.openMentorHelp)return{code:'mentor_help',title:'เปิดคำขอคุยกับ Mentor',detail:`มีคำขอความช่วยเหลือ ${x.openMentorHelp} รายการ`,memberIds:[],tone:'danger'};
  if(!x.scheduleStatus)return{code:'coordinate_schedule',title:'ช่วยทั้งคู่ประสานวันนัด',detail:'ส่งข้อความเตือนได้เมื่อจำเป็น โดยระบบตรวจ Quota และ Cooldown ก่อน',memberIds:x.participantIds,tone:'primary'};
  if(['proposed','pending'].includes(x.scheduleStatus))return{code:'confirm_schedule',title:'ติดตามการยืนยันวันนัด',detail:'มีเวลาที่เสนอแล้ว แต่ยังยืนยันไม่ครบ',memberIds:x.participantIds,tone:'warning'};
  if(['active','paused','draft'].includes(x.guidedStatus||''))return{code:'resume_session',title:'ทั้งคู่เริ่ม Guided 1-2-1 แล้ว',detail:'รอให้สมาชิกดำเนิน Session และ Digital Handshake ต่อ',memberIds:[],tone:'primary'};
  if(!['verified','late_verified'].includes(x.pairStatus))return{code:'complete_verification',title:'ติดตาม Digital Handshake',detail:'การยืนยันรหัส 6 ตัวยังไม่ครบสองฝ่าย',memberIds:x.participantIds,tone:'warning'};
  const missingReflection=x.participantIds.filter(id=>!x.sharedReflectionMemberIds.includes(id));
  if(missingReflection.length)return{code:'complete_reflection',title:'ติดตาม Reflection หลัง 1-2-1',detail:`ยังขาด Reflection ${missingReflection.length} คน`,memberIds:missingReflection,tone:'primary'};
  if(x.openFollowUps)return{code:'follow_up',title:'ติดตาม Commitment ที่ตกลงกัน',detail:`มี Follow-up ค้าง ${x.openFollowUps} รายการ`,memberIds:[],tone:'warning'};
  return{code:'complete',title:'คู่นี้ดำเนินการครบแล้ว',detail:'ไม่มี Action ค้างในขณะนี้',memberIds:[],tone:'success'};
}

export function pairStatusAfterContact(current:string){
  return ['matched','unable_to_contact','overdue'].includes(current)?'contacted':current;
}

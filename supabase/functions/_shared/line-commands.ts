export type LineCommand =
  | 'debug-id'
  | 'status'
  | 'action-plan'
  | 'history'
  | 'team'
  | 'focus3'
  | 'chapter-pulse'
  | 'chapter-trend'
  | 'tracking'
  | 'blueprint'
  | 'goals'
  | 'notifications'
  | 'issues'
  | 'met'
  | 'match'
  | 'schedule'
  | 'absence'
  | 'substitute'
  | 'cancel-absence'
  | 'report-issue'
  | 'contact-mentor'
  | 'delete-account'
  | 'business-profile'
  | 'set-goal'
  | 'mute-notification'
  | 'unmute-notification'
  | 'help'
  | 'unknown';

export interface ParsedLineCommand {
  name: LineCommand;
  argument: string;
}

export function parseLineCommand(input: string): ParsedLineCommand {
  const text = input.trim();
  const normalized = text.toLocaleLowerCase('th-TH');

  if (['myid', 'id'].includes(normalized)) return command('debug-id');
  if (['ช่วยเหลือ', 'help', 'คำสั่ง', 'command', 'commands', 'เมนู'].includes(normalized)) return command('help');
  if (['สถานะ', 'score', 'คะแนน'].includes(normalized)) return command('status');
  if (['ทำอะไร', 'action', 'next', 'next action', 'ต่อไป', 'แนะนำต่อไป', 'ทำอะไรดี'].includes(normalized)) return command('action-plan');
  if (['ประวัติ', 'trend', 'history'].includes(normalized)) return command('history');
  if (['ทีม', 'team', 'ทีมของฉัน'].includes(normalized)) return command('team');
  if (['focus 3', 'focus3', 'โฟกัส 3', 'f3'].includes(normalized)) return command('focus3');
  if (['chapter pulse', 'chapter', 'ภาพรวม'].includes(normalized)) return command('chapter-pulse');
  if (normalized === 'chapter trend') return command('chapter-trend');
  if (['ติดตาม', '1-2-1', 'นัด 1-2-1', 'นัด1-2-1'].includes(normalized)) return command('tracking');
  if (['blueprint', 'msb', 'member success blueprint', 'advanced msp', 'goal', 'goals', 'แผนธุรกิจ', 'แผนธุรกิจประจำปี'].includes(normalized)) return command('blueprint');
  if (['เป้า', 'เป้าหมาย', 'เป้าของฉัน'].includes(normalized)) return command('goals');
  if (['แจ้งเตือน', 'notif'].includes(normalized)) return command('notifications');
  if (['ปัญหา', 'issue', 'ขอความช่วยเหลือ'].includes(normalized)) return command('issues');
  if (['เจอแล้ว', 'met'].includes(normalized)) return command('met');
  if (normalized === 'ยกเลิกลา' || normalized === 'cancel absence') return command('cancel-absence');
  if (['ลบบัญชี', 'delete account', 'unlink'].includes(normalized)) return command('delete-account');

  if (normalized === 'แนะนำ' || normalized.startsWith('แนะนำ ')) {
    return command('match', text.slice('แนะนำ'.length).trim());
  }
  if (normalized.startsWith('นัด121 ') || normalized.startsWith('นัด ')) {
    return command('schedule', text.replace(/^นัด(?:121)?\s+/i, '').trim());
  }
  if (normalized === 'ลา / ส่งแทน' || normalized === 'ลา/ส่งแทน') {
    return command('absence');
  }
  if (normalized === 'ลา' || normalized.startsWith('ลา ')) {
    return command('absence', text.slice('ลา'.length).trim());
  }
  if (normalized === 'ขาด' || normalized.startsWith('ขาด ')) {
    return command('absence', text.slice('ขาด'.length).trim());
  }
  if (normalized === 'ส่ง sub' || normalized.startsWith('ส่ง sub ')) {
    return command('substitute', text.slice('ส่ง sub'.length).trim());
  }
  if (normalized.startsWith('ปัญหา ') || normalized.startsWith('issue ')) {
    return command('report-issue', text.replace(/^(?:ปัญหา|issue)\s+/i, '').trim());
  }
  const mentorPrefix = normalized.match(/^(คุยกับ\s*(?:mentor|เมนทอร์)|ติดต่อ\s*(?:mentor|เมนทอร์))(?:\s+|$)/i);
  if (mentorPrefix) return command('contact-mentor', text.slice(mentorPrefix[0].length).trim());
  if (normalized.startsWith('ธุรกิจ ')) {
    return command('business-profile', text.slice('ธุรกิจ'.length).trim());
  }
  if (normalized.startsWith('เป้า ')) {
    return command('set-goal', text.slice('เป้า'.length).trim());
  }
  if (normalized.startsWith('ปิด ')) {
    return command('mute-notification', text.slice('ปิด'.length).trim());
  }
  if (normalized.startsWith('เปิด ')) {
    return command('unmute-notification', text.slice('เปิด'.length).trim());
  }
  return command('unknown', text);
}

function command(name: LineCommand, argument = ''): ParsedLineCommand {
  return { name, argument };
}

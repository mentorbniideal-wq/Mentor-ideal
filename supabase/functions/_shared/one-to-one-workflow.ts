export interface OneToOneAccessControl {
  featureEnabled: boolean;
  emergencyStop: boolean;
  enforcePilotAccess: boolean;
  pilotIds: string[];
}

export function evaluateOneToOneAccess(
  control: OneToOneAccessControl,
  memberId: string,
  readOnly: boolean,
) {
  if (control.enforcePilotAccess && !control.featureEnabled && !control.pilotIds.includes(memberId)) {
    return { allowed: false, status: 403, reason: 'pilot_only' as const };
  }
  if (control.emergencyStop && !readOnly) {
    return { allowed: false, status: 503, reason: 'emergency_stop' as const };
  }
  return { allowed: true, status: 200, reason: null };
}

export function shouldCreateMentorNotification(existingAttentionId?: string | null) {
  return !String(existingAttentionId || '').trim();
}

export const MEMBER_FOLLOW_UP_OUTCOMES = [
  'introduced', 'not_ready', 'meeting_booked', 'referral_created',
  'collaboration', 'information_sent', 'learning_only', '',
] as const;

export function canMemberUpdateFollowUp(actorMemberId: string, ownerMemberId: string) {
  return Boolean(actorMemberId) && actorMemberId === ownerMemberId;
}

export function validMemberFollowUpOutcome(value: string) {
  return (MEMBER_FOLLOW_UP_OUTCOMES as readonly string[]).includes(value);
}

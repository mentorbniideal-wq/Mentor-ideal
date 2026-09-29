import { hasCapability, type CapabilitySubject } from "./capabilities.ts";
import { canManageGrowthCycle } from "./member-growth-cycle.ts";

type PulseActor = CapabilitySubject & {
  role?: string;
  email?: string;
  teamName?: string | null;
  isMC?: boolean;
  isMentor?: boolean;
  isSystemOwner?: boolean;
};
type PulseMember = { mentor_team?: unknown };

export function canManageMemberPulse(actor: PulseActor): boolean {
  return canManageGrowthCycle(actor) && Boolean(
    actor.isMC || actor.isAdmin || actor.isSystemOwner ||
      hasCapability(actor, "growth.coordinate"),
  );
}

export function canUseMemberPulseStaff(actor: PulseActor): boolean {
  return Boolean(
    actor.isMC || actor.isAdmin || actor.isSystemOwner ||
      (actor.role === "growth" && hasCapability(actor, "growth.coordinate")) ||
      (actor.isMentor && String(actor.teamName || "").trim()),
  );
}

// Caller must already have checked that member.chapter_id equals the
// authenticated server-derived Chapter scope.
export function canViewPulseMember(actor: PulseActor, member: PulseMember): boolean {
  if (!actor.isMentor || actor.isMC) return true;
  const team = String(actor.teamName || "").trim().toLowerCase();
  return Boolean(team && team === String(member.mentor_team || "").trim().toLowerCase());
}

export function canViewPulseVisibility(actor: PulseActor, scope: string): boolean {
  if (scope === "leadership_only") return Boolean(actor.isMC || actor.isAdmin || actor.isSystemOwner);
  if (scope === "mentor_growth") return Boolean(
    actor.isMC || actor.isAdmin || actor.isSystemOwner ||
      (actor.role === "growth" && hasCapability(actor, "growth.coordinate")) || actor.isMentor,
  );
  return false; // member scope: staff never sees individual answers
}

export function pulseReminderDay(remindersSent: number): 3 | 7 | null {
  return remindersSent === 0 ? 3 : remindersSent === 1 ? 7 : null;
}

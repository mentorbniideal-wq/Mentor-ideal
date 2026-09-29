// Member Pulse scheduling is a read-only decision. It never creates campaigns
// or sends LINE. Callers provide the Chapter-approved policy and local date.
export type PulseStage =
  | "onboarding"
  | "activation"
  | "value_retention"
  | "experience"
  | "renewal";
export type PulseMilestone = {
  stage: Exclude<PulseStage, "renewal">;
  months: number;
  repeatMonths?: number;
};
export type PulsePolicy = {
  enabled: boolean;
  milestones: PulseMilestone[];
  renewalDaysBefore: number;
  dueSoonDays: number;
  cooldownDays: number;
};
export type PulseHistory = {
  stage: PulseStage;
  cycleKey: string;
  status:
    | "sent"
    | "opened"
    | "in_progress"
    | "completed"
    | "declined"
    | "expired";
  sentOn?: string;
};
export type PulseDecision = {
  status:
    | "NOT_CONFIGURED"
    | "MISSING_DATE"
    | "EXPIRED_MEMBERSHIP"
    | "NOT_DUE"
    | "DUE_SOON"
    | "DUE"
    | "OVERDUE"
    | "SUPPRESSED"
    | "SENT"
    | "OPENED"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "DECLINED";
  stage: PulseStage | null;
  dueOn: string | null;
  cycleKey: string | null;
  reason?: "cooldown" | "existing_campaign";
};

function dateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    ? date
    : null;
}

function addMonths(value: string, months: number): string {
  const date = dateOnly(value)!;
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(last, date.getUTCDate()));
  return target.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = dateOnly(value)!;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function validPulsePolicy(
  policy: PulsePolicy | null,
): policy is PulsePolicy {
  return Boolean(
    policy?.enabled === true && Array.isArray(policy.milestones) &&
      policy.milestones.length > 0 &&
      Number.isInteger(policy.renewalDaysBefore) &&
      policy.renewalDaysBefore > 0 &&
      Number.isInteger(policy.dueSoonDays) && policy.dueSoonDays >= 0 &&
      Number.isInteger(policy.cooldownDays) && policy.cooldownDays >= 0 &&
      policy.milestones.every((item) =>
        ["onboarding", "activation", "value_retention", "experience"].includes(
          item.stage,
        ) &&
        Number.isInteger(item.months) && item.months > 0 &&
        (item.repeatMonths === undefined ||
          (Number.isInteger(item.repeatMonths) && item.repeatMonths > 0))
      ),
  );
}

export function decideMemberPulse(input: {
  today: string;
  joinedOn: string | null;
  expiresOn: string | null;
  history?: PulseHistory[];
}, policy: PulsePolicy | null): PulseDecision {
  const empty = (status: PulseDecision["status"]): PulseDecision => ({
    status,
    stage: null,
    dueOn: null,
    cycleKey: null,
  });
  if (!validPulsePolicy(policy) || !dateOnly(input.today)) {
    return empty("NOT_CONFIGURED");
  }
  const joined = dateOnly(input.joinedOn || "");
  const expires = dateOnly(input.expiresOn || "");
  if (!joined || !expires) return empty("MISSING_DATE");
  if (input.expiresOn! < input.today) return empty("EXPIRED_MEMBERSHIP");

  const candidates: { stage: PulseStage; dueOn: string; priority: number }[] =
    [];
  const renewalDue = addDays(input.expiresOn!, -policy.renewalDaysBefore);
  candidates.push({
    stage: "renewal",
    dueOn: renewalDue < input.joinedOn! ? input.joinedOn! : renewalDue,
    priority: 0,
  });
  for (const milestone of policy.milestones) {
    let months = milestone.months;
    while (months <= 600) {
      const dueOn = addMonths(input.joinedOn!, months);
      if (dueOn <= input.expiresOn!) {
        candidates.push({ stage: milestone.stage, dueOn, priority: 1 });
      }
      if (!milestone.repeatMonths || dueOn > input.expiresOn!) break;
      months += milestone.repeatMonths;
    }
  }
  const due = candidates.filter((item) =>
    item.dueOn <= addDays(input.today, policy.dueSoonDays)
  );
  const next = due.length
    ? due.sort((a, b) =>
      b.dueOn.localeCompare(a.dueOn) || a.priority - b.priority
    )[0]
    : candidates.filter((item) => item.dueOn >= input.today).sort((a, b) =>
      a.dueOn.localeCompare(b.dueOn) || a.priority - b.priority
    )[0];
  if (!next) return empty("NOT_DUE");
  const cycleKey = `${next.stage}:${next.dueOn}`;
  const history = input.history || [];
  const existing = history.find((item) => item.cycleKey === cycleKey);
  if (existing) {
    const status = ({
      sent: "SENT",
      opened: "OPENED",
      in_progress: "IN_PROGRESS",
      completed: "COMPLETED",
      declined: "DECLINED",
      expired: "SUPPRESSED",
    } as const)[existing.status];
    return {
      status,
      stage: next.stage,
      dueOn: next.dueOn,
      cycleKey,
      reason: "existing_campaign",
    };
  }
  const lastSent = history.map((item) => item.sentOn).filter((
    item,
  ): item is string => Boolean(item && dateOnly(item) && item <= input.today))
    .sort().at(-1);
  if (lastSent && input.today < addDays(lastSent, policy.cooldownDays)) {
    return {
      status: "SUPPRESSED",
      stage: next.stage,
      dueOn: next.dueOn,
      cycleKey,
      reason: "cooldown",
    };
  }
  return {
    status: next.dueOn < input.today
      ? "OVERDUE"
      : next.dueOn === input.today
      ? "DUE"
      : next.dueOn <= addDays(input.today, policy.dueSoonDays)
      ? "DUE_SOON"
      : "NOT_DUE",
    stage: next.stage,
    dueOn: next.dueOn,
    cycleKey,
  };
}

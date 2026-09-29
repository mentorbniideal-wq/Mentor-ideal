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
    | "due"
    | "sent"
    | "opened"
    | "in_progress"
    | "completed"
    | "declined"
    | "expired"
    | "superseded";
  sentOn?: string;
};

export function pulsePriority(stage: PulseStage, dueOn: string, joinedOn: string): number {
  if (stage === "renewal") return 0;
  return stage === "experience" && dateOnly(joinedOn) && dateOnly(dueOn) && dueOn > addMonths(joinedOn, 12) ? 2 : 1;
}

export function canReplaceDuePulse(candidate: { stage: PulseStage; dueOn: string; cycleKey: string }, unsent: Array<{ stage: PulseStage; dueOn: string; cycleKey: string }>, joinedOn: string): boolean {
  const priority = pulsePriority(candidate.stage, candidate.dueOn, joinedOn);
  return unsent.every(row => row.cycleKey !== candidate.cycleKey && pulsePriority(row.stage, row.dueOn, joinedOn) > priority);
}
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

export type PulseQuestion = {
  id: string;
  label: string;
  type: "scale" | "choice" | "text";
  required?: boolean;
  options?: string[];
};

// Template-driven validation; callers must never trust browser-supplied question labels.
export function validatePulseAnswers(
  spec: unknown,
  answers: unknown,
  allowPartial = false,
): { ok: true; answers: Record<string, string | number> } | {
  ok: false;
  error: string;
} {
  if (
    !Array.isArray(spec) || spec.length < 1 || spec.length > 20 ||
    !answers || typeof answers !== "object" || Array.isArray(answers)
  ) {
    return { ok: false, error: "รูปแบบคำถามหรือคำตอบไม่ถูกต้อง" };
  }
  const fields = new Map<string, PulseQuestion>();
  for (const item of spec) {
    if (
      !item || typeof item !== "object" ||
      !/^[a-z][a-z0-9_]{0,39}$/.test(item.id) ||
      typeof item.label !== "string" || !item.label.trim() ||
      item.label.length > 200 ||
      !["scale", "choice", "text"].includes(item.type) || fields.has(item.id) ||
      (item.visibility_scope !== undefined && !["member", "mentor_growth", "leadership_only"].includes(item.visibility_scope)) ||
      (item.type === "choice" && (!Array.isArray(item.options) ||
        item.options.length < 2 || item.options.length > 12 ||
        item.options.some((value: unknown) =>
          typeof value !== "string" || !value || value.length > 100
        )))
    ) {
      return { ok: false, error: "Template คำถามไม่ถูกต้อง" };
    }
    fields.set(item.id, item as PulseQuestion);
  }
  const source = answers as Record<string, unknown>;
  if (Object.keys(source).some((key) => !fields.has(key))) {
    return { ok: false, error: "มีคำตอบที่ไม่อยู่ในแบบสอบถาม" };
  }
  const cleaned: Record<string, string | number> = {};
  for (const [id, question] of fields) {
    const value = source[id];
    if (value === undefined || value === null || value === "") {
      if (question.required && !allowPartial) {
        return { ok: false, error: `กรุณาตอบ ${question.label}` };
      }
      continue;
    }
    if (question.type === "scale") {
      if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 10) {
        return { ok: false, error: `คะแนน ${question.label} ต้องเป็น 1–10` };
      }
      cleaned[id] = value as number;
    } else if (question.type === "choice") {
      if (typeof value !== "string" || !question.options?.includes(value)) {
        return { ok: false, error: `ตัวเลือก ${question.label} ไม่ถูกต้อง` };
      }
      cleaned[id] = value;
    } else {
      if (typeof value !== "string" || value.length > 1000) {
        return { ok: false, error: `ข้อความ ${question.label} ยาวเกินไป` };
      }
      cleaned[id] = value.trim();
    }
  }
  return { ok: true, answers: cleaned };
}

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
        const isRecurring = milestone.stage === "experience" && months > 12;
        candidates.push({ stage: milestone.stage, dueOn, priority: isRecurring ? 2 : 1 });
      }
      if (!milestone.repeatMonths || dueOn > input.expiresOn!) break;
      months += milestone.repeatMonths;
    }
  }
  const history = input.history || [];
  const closedCycles = new Set(history.filter(item => ["completed", "declined", "expired", "superseded"].includes(item.status)).map(item => item.cycleKey));
  const actionableCandidates = candidates.filter(item => !closedCycles.has(`${item.stage}:${item.dueOn}`));
  const due = actionableCandidates.filter((item) =>
    item.dueOn <= addDays(input.today, policy.dueSoonDays)
  );
  const next = due.length
    ? due.sort((a, b) => a.priority - b.priority || a.dueOn.localeCompare(b.dueOn))[0]
    : actionableCandidates.filter((item) => item.dueOn >= input.today).sort((a, b) =>
      a.dueOn.localeCompare(b.dueOn) || a.priority - b.priority
    )[0];
  if (!next) return empty("NOT_DUE");
  const cycleKey = `${next.stage}:${next.dueOn}`;
  const existing = history.find((item) => item.cycleKey === cycleKey);
  if (existing) {
    const status = ({
      due: "DUE",
      sent: "SENT",
      opened: "OPENED",
      in_progress: "IN_PROGRESS",
      completed: "COMPLETED",
      declined: "DECLINED",
      expired: "SUPPRESSED",
      superseded: "SUPPRESSED",
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

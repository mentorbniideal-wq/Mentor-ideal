const amount = (value: unknown): number => {
  const parsed = Number(String(value ?? '').replace(/[,฿\s]/g, ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export function annualGoalProgress(target: unknown, actual: unknown) {
  const goal = amount(target);
  const received = amount(actual);
  const progressPercent = goal > 0 ? (received / goal) * 100 : null;
  return {
    target: goal,
    actual: received,
    progressPercent,
    exceeded: goal > 0 && received > goal,
  };
}

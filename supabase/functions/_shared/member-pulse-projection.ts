type Row = Record<string, unknown>;

// Explicit DTO allowlist: never spread database rows containing answers or notes.
export function projectPulseBoard(campaigns: Row[], members: Row[]) {
  const names = new Map(
    members.map((
      row,
    ) => [String(row.id), String(row.nickname || row.name || "")]),
  );
  const rows = campaigns.filter((row) => names.has(String(row.member_id)))
    .map((row) => ({
      id: row.id,
      memberId: row.member_id,
      memberName: names.get(String(row.member_id)),
      stage: row.stage,
      dueOn: row.due_on,
      status: row.status,
      completedAt: row.completed_at || null,
      sentAt: row.sent_at || null,
      remindersSent: Number(row.reminders_sent || 0),
    }));
  return {
    campaigns: rows,
    summary: {
      due: rows.filter((row) => row.status === "due").length,
      waiting:
        rows.filter((row) =>
          ["sent", "opened", "in_progress"].includes(String(row.status))
        ).length,
      completed: rows.filter((row) => row.status === "completed").length,
    },
  };
}

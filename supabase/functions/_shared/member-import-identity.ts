type Member = { id: unknown; name: unknown; nickname?: unknown };

/** Never choose one member arbitrarily when an imported name matches multiple IDs. */
export function uniqueMemberNameMap(rows: Member[], normalize: (value: unknown) => string) {
  const candidates = new Map<string, Set<string>>();
  for (const row of rows) {
    const id = String(row.id || '');
    if (!id) continue;
    for (const raw of [row.name, row.nickname]) {
      const key = normalize(raw);
      if (!key) continue;
      const ids = candidates.get(key) || new Set<string>();
      ids.add(id);
      candidates.set(key, ids);
    }
  }
  const memberMap: Record<string, string> = {};
  const ambiguous: string[] = [];
  for (const [key, ids] of candidates) {
    if (ids.size === 1) memberMap[key] = [...ids][0];
    else ambiguous.push(key);
  }
  return { memberMap, ambiguous };
}

export function findEvolutionAverageColumn(headers: string[], monthColumnIndexes: number[]): number {
  const normalized = headers.map(header => String(header || '').toLocaleLowerCase('th-TH').trim());
  const aliases = ['average', 'avg', 'average score', 'avg score', 'ค่าเฉลี่ย', 'เฉลี่ย'];
  const explicit = normalized.findIndex(header => aliases.includes(header));
  if (explicit >= 0) return explicit;

  const lastMonth = monthColumnIndexes.length ? Math.max(...monthColumnIndexes) : -1;
  const lastPopulated = normalized.reduce((last, header, index) => header ? index : last, -1);
  return lastPopulated > lastMonth ? lastPopulated : -1;
}


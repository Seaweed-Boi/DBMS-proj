/**
 * Build a parameterised UPDATE ... SET ... WHERE pk = $n RETURNING *.
 * Column names come from validated zod schemas (never raw user keys).
 */
export function buildUpdate(table: string, fields: Record<string, unknown>, pk: string, id: number) {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    return { sql: `SELECT * FROM ${table} WHERE ${pk} = $1`, values: [id] as unknown[] };
  }
  const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(", ");
  return {
    sql: `UPDATE ${table} SET ${sets} WHERE ${pk} = $${entries.length + 1} RETURNING *`,
    values: [...entries.map(([, v]) => (v === "" ? null : v)), id] as unknown[],
  };
}

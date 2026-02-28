/** Simple unique ID generator for local SQLite keys. Not cryptographic. */
export function uid(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `${t}-${r}`;
}

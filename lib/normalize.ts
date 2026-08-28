/**
 * Normalized answer matching for fill-in-the-blank questions.
 *
 * "Reasonable" matching policy (P3): trim, collapse inner whitespace,
 * case-insensitive, ASCII lower/upper equivalence, strip common unit spellings
 * in parentheses variants, and treat a pure numeric answer as matching when
 * the numeric value equals (handles "1/2" vs "1/2 inch" -style cases where
 * the blank was clearly the value itself is NOT treated as equal here — a
 * unit on one side only loses the match unless the other has no word chars).
 */
/**
 * Canonical form for comparison: lowercase, collapse spaces, strip trailing
 * punctuation, and drop parenthesized annotations ("1/2 (nom) in" → "1/2 in")
 * so plain and annotated forms compare equal.
 */
export function normalizeAnswer(s: string | null | undefined): string {
  if (!s) return '';
  let t = String(s).trim();
  t = t.replace(/\([^)]*\)/g, ' ');
  t = t.replace(/[.,;:!?]+$/g, '');
  t = t.replace(/\s+/g, ' ').trim().toLowerCase();
  return t;
}

/**
 * True when user input `given` matches `expected` under the normalized rule.
 * Also accepts a plain numeric equivalence for pure-number expectations
 * (e.g. "0.5" matches "1/2" only when expected has no non-numeric char).
 */
export function answerMatches(expected: string, given: string | null | undefined): boolean {
  const e = normalizeAnswer(expected);
  const g = normalizeAnswer(given);
  if (!e || !g) return false;
  if (e === g) return true;
  // Numeric fallback: "1/2" (0.5) vs "0.5"
  const ev = toNumber(e);
  const gv = toNumber(g);
  if (ev !== null && gv !== null) return Math.abs(ev - gv) < 1e-9;
  return false;
}

function toNumber(t: string): number | null {
  if (/^[0-9.]+$/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  const m = t.match(/^(\d+)\/(\d+)$/);
  if (m) {
    const den = Number(m[2]);
    return den !== 0 ? Number(m[1]) / den : null;
  }
  return null;
}

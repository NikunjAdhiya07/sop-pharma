/**
 * How many prior revision slots to keep per SOP (folder upload + registry “Prior versions” column).
 *
 * Default: **unlimited** — every distinct prior revision below the current SOP number is uploaded and stored.
 *
 * Optional env `SOP_FOLDER_UPLOAD_MAX_PRIOR_VERSIONS`:
 * - Omit, `0`, `unlimited`, `all` → no cap
 * - Positive integer (1–10000) → keep only that many **newest** priors per SOP
 */
export function getMaxPriorVersionsStored(): number {
  const raw =
    typeof process !== 'undefined' && process.env?.SOP_FOLDER_UPLOAD_MAX_PRIOR_VERSIONS != null
      ? String(process.env.SOP_FOLDER_UPLOAD_MAX_PRIOR_VERSIONS).trim()
      : '';
  if (raw === '') return Number.POSITIVE_INFINITY;
  const lower = raw.toLowerCase();
  if (lower === 'unlimited' || lower === 'all' || lower === 'none') return Number.POSITIVE_INFINITY;
  if (/^0+$/.test(raw)) return Number.POSITIVE_INFINITY;

  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return Number.POSITIVE_INFINITY;
  if (n <= 0) return Number.POSITIVE_INFINITY;
  return Math.min(10_000, Math.max(1, n));
}

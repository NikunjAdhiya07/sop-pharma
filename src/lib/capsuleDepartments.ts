/** Canonical department list for capsules, charts, and department-scoped metrics. */
export const CAPSULE_DEPARTMENTS = [
  'QA',
  'QC',
  'Microbiology',
  'Production',
  'Store',
  'Engineering and Maintenance',
  'Personnel',
] as const;

export type CapsuleDepartment = (typeof CAPSULE_DEPARTMENTS)[number];

/**
 * Map a raw stored department string to a canonical capsule department.
 * Returns "" when the input is empty or means "Total".
 */
export function normalizeCapsuleDept(raw: string): string {
  if (!raw) return "";
  const lower = String(raw).toLowerCase().trim();
  if (lower === "total") return "";
  if (lower === "qa" || lower.includes("quality assurance")) return "QA";
  if (lower === "qc" || lower.includes("quality control")) return "QC";
  if (lower.includes("micro")) return "Microbiology";
  if (lower.includes("engineer")) return "Engineering and Maintenance";
  if (lower.includes("person") || lower.includes("hr")) return "Personnel";
  if (lower.includes("store")) return "Store";
  if (lower.includes("prod")) return "Production";
  const exact = (CAPSULE_DEPARTMENTS as readonly string[]).find((d) => d === raw);
  if (exact) return exact;
  return String(raw).trim();
}

/** SOP-number prefix → department inference (used when stored dept is unknown). */
const PREFIX_TO_DEPT: Record<string, string> = {
  QAGE: 'QA', ANNE: 'QA',
  QCGE: 'QC', QAIC: 'QC', QAIO: 'QC',
  QAMI: 'Microbiology', QCMI: 'Microbiology',
  PRAA: 'Production', PRCL: 'Production', PRED: 'Production',
  PREO: 'Production', PREP: 'Production', PRGE: 'Production',
  PRMA: 'Production', PRPA: 'Production',
  BSGE: 'Store', STCL: 'Store', STGE: 'Store',
  STOP: 'Store', STPA: 'Store', STRM: 'Store',
  MAGE: 'Engineering and Maintenance', PREG: 'Engineering and Maintenance',
  PEGE: 'Personnel',
};

export function deptFromSopNoPrefix(sopNo: string): string {
  const code = (sopNo || '').toUpperCase().trim().match(/^([A-Z]{2,6})\d/)?.[1] ?? '';
  return PREFIX_TO_DEPT[code] ?? '';
}

/**
 * Resolve the capsule-grouping department for a registry row.
 *
 * Priority: SOP-number prefix wins when it maps to a known department,
 * because the prefix is a structural property of the SOP itself (PRCL = a
 * Production cleaning SOP, regardless of what the DB row says). The stored
 * `department` field is used only as a fallback when no prefix mapping
 * exists. This guarantees the table filter and the capsule counts agree
 * with the visible SOP number.
 */
export function resolveRowCapsuleDept(row: { department?: string; sopNo?: string }): string {
  const fromPrefix = deptFromSopNoPrefix(row?.sopNo || "");
  if (fromPrefix) return fromPrefix;
  return normalizeCapsuleDept(row?.department || "");
}

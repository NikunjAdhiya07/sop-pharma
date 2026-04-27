export type CanonDept = 'QA' | 'QC' | 'Microbiology' | 'Production' | 'Store' | 'Engineering' | 'Personnel' | 'Other';

// Mirrors the dashboard department resolution logic (see `api/mcq-bank/dept-stats`).
// Key point: some identifier prefixes are subcategories (QAIC/QAIO/QAMI/QCMI/etc) and do NOT equal the parent dept.
const SUBCAT_TO_DEPT: Record<string, CanonDept> = {
  QAGE: 'QA',
  ANNE: 'QA',

  QCGE: 'QC',
  QAIC: 'QC',
  QAIO: 'QC',

  QAMI: 'Microbiology',
  QCMI: 'Microbiology',

  PRAA: 'Production',
  PRCL: 'Production',
  PRED: 'Production',
  PREO: 'Production',
  PREP: 'Production',
  PRGE: 'Production',
  PRMA: 'Production',
  PRPA: 'Production',

  BSGE: 'Store',
  STCL: 'Store',
  STGE: 'Store',
  STOP: 'Store',
  STPA: 'Store',
  STRM: 'Store',

  MAGE: 'Engineering',
  PREG: 'Engineering',

  PEGE: 'Personnel',
};

/** Resolve department from identifier prefix (e.g. "QAGE01-10" → "QA"). */
export function deptFromIdentifier(identifier?: string | null): CanonDept {
  if (!identifier) return 'Other';
  const id = identifier.toUpperCase().trim();

  const m = id.match(/^([A-Z]{2,6})\d/);
  if (m && SUBCAT_TO_DEPT[m[1]]) return SUBCAT_TO_DEPT[m[1]];

  // Try shorter prefixes for cases like "QAIC28-04" where regex may capture longer token
  for (let len = 4; len >= 2; len--) {
    const pfx = id.slice(0, len);
    if (SUBCAT_TO_DEPT[pfx]) return SUBCAT_TO_DEPT[pfx];
  }
  return 'Other';
}

/** Normalize stored department name → canonical dept, mirrors dashboard normalizeDeptName. */
export function normalizeDeptName(raw?: string | null): CanonDept {
  if (!raw) return 'Other';
  const lower = raw.toLowerCase().trim();
  if (lower === 'qa' || lower.includes('quality assurance')) return 'QA';
  if (lower === 'qc' || lower.includes('quality control')) return 'QC';
  if (lower.includes('micro')) return 'Microbiology';
  if (lower.includes('engineer')) return 'Engineering';
  if (lower.includes('person') || lower.includes('hr')) return 'Personnel';
  if (lower.includes('store')) return 'Store';
  if (lower.includes('prod')) return 'Production';
  return 'Other';
}

/** Resolve dept: try identifier prefix first, fall back to stored department name. */
export function resolveDept(identifierOrBaseCode: string, storedDept?: string | null): CanonDept {
  const fromId = deptFromIdentifier(identifierOrBaseCode);
  if (fromId !== 'Other') return fromId;
  return normalizeDeptName(storedDept);
}


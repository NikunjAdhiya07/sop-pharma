/**
 * Single source for dashboard chart metrics — same row semantics as SOP Registry / capsules
 * (primary rows from `filterPrimaryRegistryRows`, DOCX/PDF via {@link countRowDocxPdfForCapsules}).
 */
import { CAPSULE_DEPARTMENTS } from '@/lib/capsuleDepartments';
import { countRowDocxPdfForCapsules } from '@/lib/registryRowDocCounts';

const DEPT_ORDER = [...CAPSULE_DEPARTMENTS];

export function normalizeDeptForChart(raw: string): string {
  if (!raw) return '';
  const lower = raw.toLowerCase().trim();
  if (lower === 'total') return '';
  if (lower === 'qa' || lower.includes('quality assurance')) return 'QA';
  if (lower === 'qc' || lower.includes('quality control')) return 'QC';
  if (lower.includes('micro')) return 'Microbiology';
  if (lower.includes('engineer')) return 'Engineering and Maintenance';
  if (lower.includes('person') || lower.includes('hr')) return 'Personnel';
  if (lower.includes('store')) return 'Store';
  if (lower.includes('prod')) return 'Production';
  const exact = DEPT_ORDER.find((d) => d === raw);
  if (exact) return exact;
  return raw;
}

function dayStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export type DeptChartRow = {
  department: string;
  total: number;
  expired: number;
  nearExpiry: number;
  active: number;
};

/** Department bar + stacked compliance — only named departments (excludes Other / unmapped). */
export function aggregateDepartmentDistribution(data: any[]): DeptChartRow[] {
  const today = dayStart(new Date());
  const dayMs = 86400000;

  const map = new Map<string, { total: number; expired: number; near: number; active: number }>();
  DEPT_ORDER.forEach((d) => map.set(d, { total: 0, expired: 0, near: 0, active: 0 }));

  for (const row of data) {
    const dept = normalizeDeptForChart(String(row?.department || ''));
    if (!dept || !map.has(dept)) continue;
    const s = map.get(dept)!;
    s.total++;
    if (!row.expiryDate) {
      s.active++;
      continue;
    }
    const diffDays = Math.ceil((new Date(row.expiryDate).getTime() - today.getTime()) / dayMs);
    if (diffDays < 0) s.expired++;
    else if (diffDays <= 30) s.near++;
    else s.active++;
  }

  return DEPT_ORDER.map((department) => {
    const s = map.get(department)!;
    return {
      department,
      total: s.total,
      expired: s.expired,
      nearExpiry: s.near,
      active: s.active,
    };
  });
}

export type ExpiryStatusSlice = { name: string; value: number; color: string };

/** Global status donut — all primary registry rows. Near = ≤30 days (matches capsules). */
export function aggregateExpiryStatusGlobal(data: any[]): {
  slices: ExpiryStatusSlice[];
  total: number;
  expired: number;
  nearExpiry: number;
  active: number;
  noExpiryDate: number;
} {
  const today = dayStart(new Date());
  const dayMs = 86400000;
  let expired = 0;
  let nearExpiry = 0;
  let active = 0;
  let noExpiryDate = 0;

  for (const row of data) {
    if (!row.expiryDate) {
      noExpiryDate++;
      continue;
    }
    const diffDays = Math.ceil((new Date(row.expiryDate).getTime() - today.getTime()) / dayMs);
    if (diffDays < 0) expired++;
    else if (diffDays <= 30) nearExpiry++;
    else active++;
  }

  const total = data.length;
  const slices: ExpiryStatusSlice[] = [
    { name: 'Active', value: active, color: '#059669' },
    { name: 'Near expiry (≤30d)', value: nearExpiry, color: '#f59e0b' },
    { name: 'Expired', value: expired, color: '#dc2626' },
    { name: 'No Date', value: noExpiryDate, color: '#64748b' },
  ].filter((x) => x.value > 0);

  return { slices, total, expired, nearExpiry, active, noExpiryDate };
}

/** Version tracking buckets: artifact slots + current row = “depth” of stored versions. */
export function aggregateVersionBuckets(data: any[]): { name: string; value: number }[] {
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  for (const row of data) {
    const en = Array.isArray(row.versionArtifacts) ? row.versionArtifacts.length : 0;
    const gj = Array.isArray(row.versionArtifactsGujarati) ? row.versionArtifactsGujarati.length : 0;
    const slots = 1 + en + gj;
    if (slots <= 1) b1++;
    else if (slots === 2) b2++;
    else b3++;
  }
  return [
    { name: '1 slot (current only)', value: b1 },
    { name: '2 slots', value: b2 },
    { name: '3+ slots', value: b3 },
  ];
}

export type FileTypeCounts = {
  withDocx: number;
  withPdf: number;
  withVideo: number;
  withSlides: number;
  missingDocx: number;
  missingPdf: number;
};

export function aggregateFileTypesAndGaps(data: any[]): FileTypeCounts {
  let withDocx = 0;
  let withPdf = 0;
  let withVideo = 0;
  let withSlides = 0;
  let missingDocx = 0;
  let missingPdf = 0;

  for (const row of data) {
    const { docx, pdf } = countRowDocxPdfForCapsules(row);
    if (docx > 0) withDocx++;
    else missingDocx++;
    if (pdf > 0) withPdf++;
    else missingPdf++;
    if (row.mediaStatus?.videos) withVideo++;
    if (row.mediaStatus?.slides) withSlides++;
  }

  return { withDocx, withPdf, withVideo, withSlides, missingDocx, missingPdf };
}

/** Future-only expiring buckets (requires expiryDate). */
export function aggregateExpiryTimeline(data: any[]): { window: string; count: number; daysMin: number; daysMax: number }[] {
  const today = dayStart(new Date());
  const dayMs = 86400000;
  let w30 = 0;
  let w60 = 0;
  let w90 = 0;

  for (const row of data) {
    if (!row.expiryDate) continue;
    const diffDays = Math.ceil((new Date(row.expiryDate).getTime() - today.getTime()) / dayMs);
    if (diffDays < 0) continue;
    if (diffDays <= 30) w30++;
    else if (diffDays <= 60) w60++;
    else if (diffDays <= 90) w90++;
  }

  return [
    { window: '0–30 days', count: w30, daysMin: 0, daysMax: 30 },
    { window: '31–60 days', count: w60, daysMin: 31, daysMax: 60 },
    { window: '61–90 days', count: w90, daysMin: 61, daysMax: 90 },
  ];
}

export type DualDeptRow = { department: string; dual: number; single: number };

export function aggregateDualLanguageByDept(data: any[]): DualDeptRow[] {
  const map = new Map<string, { dual: number; single: number }>();
  DEPT_ORDER.forEach((d) => map.set(d, { dual: 0, single: 0 }));

  for (const row of data) {
    const dept = normalizeDeptForChart(String(row?.department || ''));
    if (!dept || !map.has(dept)) continue;
    const s = map.get(dept)!;
    if (row.isDualLanguage === true) s.dual++;
    else s.single++;
  }

  return DEPT_ORDER.map((department) => {
    const s = map.get(department)!;
    return { department, dual: s.dual, single: s.single };
  });
}

export function aggregateMissingInsights(data: any[]): {
  missingPdf: number;
  missingDocx: number;
  singleVersionOnly: number;
  noExpiryDate: number;
} {
  let missingPdf = 0;
  let missingDocx = 0;
  let singleVersionOnly = 0;
  let noExpiryDate = 0;

  for (const row of data) {
    const { docx, pdf } = countRowDocxPdfForCapsules(row);
    if (pdf === 0) missingPdf++;
    if (docx === 0) missingDocx++;
    const en = Array.isArray(row.versionArtifacts) ? row.versionArtifacts.length : 0;
    const gj = Array.isArray(row.versionArtifactsGujarati) ? row.versionArtifactsGujarati.length : 0;
    if (en + gj === 0) singleVersionOnly++;
    if (!row.expiryDate) noExpiryDate++;
  }

  return { missingPdf, missingDocx, singleVersionOnly, noExpiryDate };
}

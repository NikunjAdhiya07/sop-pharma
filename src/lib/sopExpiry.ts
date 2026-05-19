import { sopFamilyKeyFromIdentifier, normalizeSopIdentifierKey } from '@/lib/sopIdentifierNormalize';
import { parseRevisionFromSopIdentifier } from '@/lib/sopIdentifierNormalize';

const DAY_MS = 1000 * 60 * 60 * 24;

export function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/** Days until review/expiry (negative = overdue). Matches dashboard expiry filter. */
export function expiryDiffDays(
  expiryDate: Date | string | null | undefined,
  today: Date = startOfToday(),
): number | null {
  if (!expiryDate) return null;
  const exp = new Date(expiryDate);
  if (isNaN(exp.getTime())) return null;
  return Math.floor((exp.getTime() - today.getTime()) / DAY_MS);
}

export function isSopExpired(
  expiryDate: Date | string | null | undefined,
  today: Date = startOfToday(),
): boolean {
  const diff = expiryDiffDays(expiryDate, today);
  return diff !== null && diff < 0;
}

export type ReviewDateMaps = {
  byIdentifier: Map<string, Date>;
  byFamily: Map<string, { date: Date; rev: number }>;
};

export function buildReviewDateMaps(
  masterSops: Array<{ sopIdentifier?: string; identifier?: string; metadata?: { reviewDate?: Date; expiryDate?: Date } }>,
): ReviewDateMaps {
  const byIdentifier = new Map<string, Date>();
  const byFamily = new Map<string, { date: Date; rev: number }>();

  for (const sop of masterSops) {
    const id = String(sop.sopIdentifier || sop.identifier || '').trim().toUpperCase();
    if (!id) continue;
    const norm = normalizeSopIdentifierKey(id);
    const dateRaw = sop.metadata?.reviewDate || sop.metadata?.expiryDate;
    if (!dateRaw) continue;

    const dateDate = new Date(dateRaw);
    if (isNaN(dateDate.getTime())) continue;

    const fk = sopFamilyKeyFromIdentifier(id);
    const rev = parseRevisionFromSopIdentifier(id);
    for (const key of norm !== id ? [id, norm] : [id]) {
      byIdentifier.set(key, dateDate);
      if (fk && rev != null) {
        const existing = byFamily.get(fk);
        if (!existing || rev > existing.rev) {
          byFamily.set(fk, { date: dateDate, rev });
        }
      }
    }
  }

  return { byIdentifier, byFamily };
}

export function resolveSopReviewDate(
  sop: { identifier?: string; reviewDate?: Date | string | null; expiryDate?: Date | string | null },
  maps: ReviewDateMaps,
): Date | null {
  const identifier = (sop.identifier || '').trim().toUpperCase();

  let reviewDate: Date | null = null;
  if (sop.reviewDate) reviewDate = new Date(sop.reviewDate);
  else if (sop.expiryDate) reviewDate = new Date(sop.expiryDate);

  if (!reviewDate || isNaN(reviewDate.getTime())) {
    if (identifier && maps.byIdentifier.has(identifier)) {
      reviewDate = maps.byIdentifier.get(identifier)!;
    } else if (identifier) {
      const fk = sopFamilyKeyFromIdentifier(identifier);
      if (fk && maps.byFamily.has(fk)) {
        reviewDate = maps.byFamily.get(fk)!.date;
      }
    }
  }

  if (!reviewDate || isNaN(reviewDate.getTime())) return null;
  return reviewDate;
}

function looksLikeDocxPath(path: string | undefined): boolean {
  if (!path?.trim()) return false;
  return /\.docx?$/i.test(path.split('?')[0]);
}

export function collectDocxCandidates(
  sop: {
    fileUrl?: string;
    fileType?: string;
    sopDocuments?: Array<{ fileName?: string; filePath?: string; fileType?: string }>;
  },
  masters: Array<{ sopDocument?: { filePath?: string } }> = [],
): string[] {
  const candidates: string[] = [];
  const fileUrl = (sop.fileUrl || '').trim();
  if (fileUrl) {
    if (sop.fileType === 'docx' || looksLikeDocxPath(fileUrl)) {
      candidates.push(fileUrl);
    }
  }
  for (const d of sop.sopDocuments || []) {
    const isDocx =
      (d.fileType && /docx/i.test(d.fileType)) ||
      (d.fileName && /\.docx$/i.test(d.fileName)) ||
      (d.filePath && /\.docx$/i.test(d.filePath));
    if (isDocx && d.filePath) candidates.push(d.filePath);
  }
  for (const m of masters) {
    const p = m?.sopDocument?.filePath;
    if (p && /\.docx$/i.test(p)) candidates.push(p);
  }
  return [...new Set(candidates.filter(Boolean))];
}

/** True when we have any stored path hint for a DOCX (local, Bunny, or CDN). */
export function hasDocxPathHint(
  sop: Parameters<typeof collectDocxCandidates>[0],
  masters: Parameters<typeof collectDocxCandidates>[1] = [],
): boolean {
  return collectDocxCandidates(sop, masters).length > 0;
}

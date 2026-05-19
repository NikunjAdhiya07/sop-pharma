import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MasterSOPRepository from '@/models/MasterSOPRepository';
import { fetchBunnyFile, isBunnyPath, extractBunnyPath, searchBunnyStorageForDocx } from '@/lib/bunnyStorage';
import { extractSOPHeaderTableData } from '@/lib/docxHeaderExtractor';
import { parseSOPDate, extractDatesFromContent } from '@/lib/dateExtractor';
import { parseDOCX } from '@/lib/documentParser';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';

export const maxDuration = 300;

/**
 * Two-tier fetch: try CDN first (fast, cached), fall back to authenticated
 * Bunny Storage API (ground truth, bypasses CDN). Returns { buffer, source, status }.
 */
async function fetchDocxRobust(pathOrUrl: string): Promise<{ buffer: Buffer | null; source: string; status: number | null; triedUrls: string[] }> {
  const triedUrls: string[] = [];
  // Tier 1: CDN/standard fetch
  try {
    const buf = await fetchBunnyFile(pathOrUrl);
    if (buf) return { buffer: buf, source: 'cdn', status: 200, triedUrls };
  } catch { /* fall through */ }

  // Tier 2: Authenticated Storage API
  const storageZone =
    process.env.BUNNY_STORAGE_ZONE || process.env.BUNNY_STORAGE_ZONE_NAME || '';
  const apiKey =
    process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY || '';
  const storageHost = process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com';
  if (!storageZone || !apiKey) {
    return { buffer: null, source: 'no-storage-creds', status: null, triedUrls };
  }

  const cleanPath = extractBunnyPath(pathOrUrl).replace(/^\/+/, '');
  // URL-encode each path segment (spaces -> %20 etc.) but keep `/` separators
  const encodedPath = cleanPath.split('/').map(encodeURIComponent).join('/');
  const storageUrl = `https://${storageHost}/${storageZone}/${encodedPath}`;
  triedUrls.push(storageUrl);
  try {
    const res = await fetch(storageUrl, {
      headers: { AccessKey: apiKey },
      signal: AbortSignal.timeout(120_000),
    });
    if (res.ok) {
      const ab = await res.arrayBuffer();
      return { buffer: Buffer.from(ab), source: 'storage-api', status: 200, triedUrls };
    }
    // Tier 3: list the parent directory and look for any .docx — paths in DB
    // sometimes drift (renamed file, different sanitization) but the folder is right.
    const parentDir = cleanPath.replace(/\/[^/]+$/, '');
    if (parentDir && parentDir !== cleanPath) {
      const listUrl = `https://${storageHost}/${storageZone}/${parentDir.split('/').map(encodeURIComponent).join('/')}/`;
      triedUrls.push(listUrl);
      try {
        const listRes = await fetch(listUrl, {
          headers: { AccessKey: apiKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(60_000),
        });
        if (listRes.ok) {
          const items: any[] = await listRes.json();
          const docxItem = items.find((it) => /\.docx$/i.test(it?.ObjectName || ''));
          if (docxItem?.ObjectName) {
            const altPath = `${parentDir}/${docxItem.ObjectName}`;
            const altUrl = `https://${storageHost}/${storageZone}/${altPath.split('/').map(encodeURIComponent).join('/')}`;
            triedUrls.push(altUrl);
            const altRes = await fetch(altUrl, {
              headers: { AccessKey: apiKey },
              signal: AbortSignal.timeout(120_000),
            });
            if (altRes.ok) {
              const ab = await altRes.arrayBuffer();
              return { buffer: Buffer.from(ab), source: 'storage-api-listed', status: 200, triedUrls };
            }
          }
        }
      } catch { /* ignore */ }
    }
    return { buffer: null, source: 'storage-api', status: res.status, triedUrls };
  } catch (err: any) {
    return { buffer: null, source: 'storage-api-error', status: null, triedUrls };
  }
}

// Re-extract Review Date (= dashboard expiry date) for every non-obsolete SOP
// directly from its DOCX header, then overwrite SOP.reviewDate / SOP.expiryDate.
//
// Date-source precedence per SOP (Bunny DOCX is authoritative):
//   1. DOCX on Bunny — fetched from SOP.fileUrl (if DOCX), then SOP.sopDocuments[]
//      DOCX entries, then MasterSOPRepository.sopDocument.filePath. Parsed with
//      extractSOPHeaderTableData (cell-aware "REVIEW DT." reader) and a text-regex
//      fallback. This is the source of truth — the library metadata can drift.
//   2. MasterSOPRepository.metadata.reviewDate — last-resort fallback only when
//      no DOCX is reachable from Bunny (e.g. PDF-only SOPs).
export async function POST(request: NextRequest) {
  const onlyIdentifier = request.nextUrl.searchParams.get('identifier')?.trim().toUpperCase() || null;
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const send = async (data: object) => {
    await writer.write(encoder.encode('data: ' + JSON.stringify(data) + '\n\n'));
  };

  (async () => {
    try {
      await connectDB();

      const sopQuery: any = { isObsolete: { $ne: true } };
      if (onlyIdentifier) sopQuery.identifier = onlyIdentifier;
      const sops = await SOP.find(sopQuery)
        .select('_id identifier fileUrl fileType reviewDate effectiveDate language sopDocuments')
        .lean<any[]>();

      // Build a per-identifier index of MasterSOPRepository entries so we can
      // resolve DOCX paths + pre-parsed review dates without N round-trips.
      const masterByIdentifier = new Map<string, any[]>();
      const masters = await MasterSOPRepository.find({})
        .select('sopIdentifier language sopDocument metadata')
        .lean<any[]>();
      for (const m of masters) {
        const key = String(m.sopIdentifier || '').trim().toUpperCase();
        if (!key) continue;
        const arr = masterByIdentifier.get(key) || [];
        arr.push(m);
        masterByIdentifier.set(key, arr);
      }

      await send({ type: 'init', total: sops.length });

      let fixed = 0;
      let skipped = 0;
      let failed = 0;

      for (const sop of sops) {
        const id = String(sop.identifier || '').trim();
        const idUpper = id.toUpperCase();
        try {
          const masters = masterByIdentifier.get(idUpper) || [];

          let reviewDate: Date | null = null;
          let effectiveDate: Date | null = null;
          let dateSource = 'none';

          // --- Step 1: ALWAYS try the DOCX on Bunny first. The header-table
          // value inside the file itself is the source of truth — the SOP-library
          // metadata can drift out of sync with the actual document. ---
          const docxCandidates: string[] = [];
          if (sop.fileType === 'docx' && sop.fileUrl) docxCandidates.push(sop.fileUrl);
          for (const d of sop.sopDocuments || []) {
            const isDocx =
              (d.fileType && /docx/i.test(d.fileType)) ||
              (d.fileName && /\.docx$/i.test(d.fileName)) ||
              (d.filePath && /\.docx$/i.test(d.filePath));
            if (isDocx && d.filePath) docxCandidates.push(d.filePath);
          }
          for (const m of masters) {
            const p = m?.sopDocument?.filePath;
            if (p && /\.docx$/i.test(p)) docxCandidates.push(p);
          }
          // Accept any .docx path — every file is on Bunny so let fetchBunnyFile resolve it.
          const docxUrl = docxCandidates.find((u) => u && /\.docx(\?|$)/i.test(u));

          // Diagnostic: record why Bunny path was skipped
          let bunnyDiag: string = docxUrl ? 'tried' : (docxCandidates.length === 0 ? 'no-candidates' : 'no-docx-suffix');
          let triedUrl: string | null = null;
          let fetchSource: string | null = null;
          let fetchStatus: number | null = null;
          let buffer: Buffer | null = null;

          if (docxUrl) {
            triedUrl = docxUrl;
            const fetchResult = await fetchDocxRobust(docxUrl);
            buffer = fetchResult.buffer;
            fetchSource = fetchResult.source;
            fetchStatus = fetchResult.status;
            if (!buffer) bunnyDiag = `fetch-failed:${fetchResult.source}:${fetchResult.status}`;
          }

          // If the DB path is stale/wrong, search Bunny globally for this SOP's DOCX
          if (!buffer && id) {
            const foundUrl = await searchBunnyStorageForDocx(id);
            if (foundUrl) {
              triedUrl = foundUrl;
              const r2 = await fetchDocxRobust(foundUrl);
              buffer = r2.buffer;
              fetchSource = `searched:${r2.source}`;
              fetchStatus = r2.status;
              if (buffer) bunnyDiag = 'found-by-search';
              else bunnyDiag = `search-found-but-fetch-failed:${r2.source}:${r2.status}`;
            } else {
              bunnyDiag = bunnyDiag === 'no-candidates' ? 'no-candidates-and-search-empty' : `${bunnyDiag}+search-empty`;
            }
          }

          if (buffer) {
            try {
              const headerData = await extractSOPHeaderTableData(buffer);
              if (headerData.reviewDate) {
                reviewDate = parseSOPDate(headerData.reviewDate);
                if (reviewDate) dateSource = 'header-table';
              }
              if (headerData.effDate) {
                effectiveDate = parseSOPDate(headerData.effDate);
              }
            } catch {
              /* fall through to regex */
            }

            if (!reviewDate || !effectiveDate) {
              try {
                const parsed = await parseDOCX(buffer);
                const extracted = extractDatesFromContent(parsed.content);
                if (!reviewDate && extracted.reviewDate) {
                  reviewDate = extracted.reviewDate;
                  dateSource = 'text-regex';
                }
                if (!effectiveDate && extracted.effectiveDate) {
                  effectiveDate = extracted.effectiveDate;
                }
              } catch { /* ignore */ }
            }
            if (!reviewDate) bunnyDiag = 'parsed-but-no-review-date';
          }

          // --- Step 2: last-resort fallback — only if no DOCX on Bunny yielded
          // a date (e.g. PDF-only SOP, or Bunny fetch failed). ---
          if (!reviewDate) {
            let masterReview: Date | null = null;
            let masterEffective: Date | null = null;
            for (const m of masters) {
              const r = m?.metadata?.reviewDate;
              const e = m?.metadata?.effectiveDate;
              if (r && (!masterReview || new Date(r) > masterReview)) masterReview = new Date(r);
              if (e && (!masterEffective || new Date(e) > masterEffective)) masterEffective = new Date(e);
            }
            if (masterReview && !isNaN(masterReview.getTime())) {
              reviewDate = masterReview;
              if (!effectiveDate) effectiveDate = masterEffective || null;
              dateSource = 'master-repo-fallback';
            }
          }

          if (!reviewDate) {
            await send({
              type: 'skip',
              identifier: id,
              reason: 'no review date found in document',
              bunnyDiag,
              fileType: sop.fileType,
              fileUrlSample: typeof sop.fileUrl === 'string' ? sop.fileUrl.slice(0, 120) : null,
              sopDocsCount: Array.isArray(sop.sopDocuments) ? sop.sopDocuments.length : 0,
            });
            skipped++;
            continue;
          }

          // Only write when the value actually changes — keeps the audit clean.
          const prev = sop.reviewDate ? new Date(sop.reviewDate).getTime() : null;
          const next = reviewDate.getTime();
          if (prev === next && sop.effectiveDate && effectiveDate &&
              new Date(sop.effectiveDate).getTime() === effectiveDate.getTime()) {
            await send({ type: 'unchanged', identifier: id, reviewDate: reviewDate.toISOString(), dateSource, bunnyDiag, triedUrl, candidatesCount: docxCandidates.length, fetchSource, fetchStatus });
            skipped++;
            continue;
          }

          const update: Record<string, Date> = {
            reviewDate,
            // Sync the legacy `expiryDate` field so the dashboard fallback chain
            // can't surface a stale value from a prior upload of this SOP.
            expiryDate: reviewDate,
          };
          if (effectiveDate) update.effectiveDate = effectiveDate;

          await SOP.updateOne({ _id: sop._id }, { $set: update });
          fixed++;

          await send({
            type: 'fixed',
            identifier: id,
            previousReviewDate: prev ? new Date(prev).toISOString() : null,
            reviewDate: reviewDate.toISOString(),
            effectiveDate: effectiveDate ? effectiveDate.toISOString() : null,
            dateSource,
            bunnyDiag,
          });
        } catch (err: any) {
          failed++;
          await send({ type: 'error', identifier: id, reason: err?.message || 'unknown error' });
        }
      }

      void invalidateDashboardSopsCache();

      await send({ type: 'done', total: sops.length, fixed, skipped, failed });
    } catch (err: any) {
      await send({ type: 'fatal', reason: err?.message || 'Server error' });
    } finally {
      await writer.close();
    }
  })();

  return new NextResponse(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MasterSOPRepository from '@/models/MasterSOPRepository';
import { fetchBunnyFile, isBunnyPath } from '@/lib/bunnyStorage';
import { extractSOPHeaderTableData } from '@/lib/docxHeaderExtractor';
import { parseSOPDate, extractDatesFromContent } from '@/lib/dateExtractor';
import { parseDOCX } from '@/lib/documentParser';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';

export const maxDuration = 300;

// Re-extract Review Date (= dashboard expiry date) for every non-obsolete SOP
// directly from its DOCX header, then overwrite SOP.reviewDate / SOP.expiryDate.
//
// Date-source precedence per SOP:
//   1. MasterSOPRepository.metadata.reviewDate — already parsed at upload, trusted
//      when present (avoids re-downloading the DOCX from Bunny).
//   2. DOCX from SOP.fileUrl (if it's a DOCX), then SOP.sopDocuments[] DOCX entries,
//      then MasterSOPRepository.sopDocument.filePath — fetched and re-parsed with
//      extractSOPHeaderTableData (cell-aware "REVIEW DT." reader) and a regex
//      fallback.
// PDFs without a DOCX sibling are skipped (text-only PDFs can't be reliably
// parsed for header tables here).
export async function POST(_request: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const send = async (data: object) => {
    await writer.write(encoder.encode('data: ' + JSON.stringify(data) + '\n\n'));
  };

  (async () => {
    try {
      await connectDB();

      const sops = await SOP.find({ isObsolete: { $ne: true } })
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
          // --- Step 1: trust MasterSOPRepository.metadata.reviewDate when present ---
          const masters = masterByIdentifier.get(idUpper) || [];
          let masterReview: Date | null = null;
          let masterEffective: Date | null = null;
          for (const m of masters) {
            const r = m?.metadata?.reviewDate;
            const e = m?.metadata?.effectiveDate;
            if (r && (!masterReview || new Date(r) > masterReview)) masterReview = new Date(r);
            if (e && (!masterEffective || new Date(e) > masterEffective)) masterEffective = new Date(e);
          }

          let reviewDate: Date | null = null;
          let effectiveDate: Date | null = null;
          let dateSource = 'none';

          if (masterReview && !isNaN(masterReview.getTime())) {
            reviewDate = masterReview;
            effectiveDate = masterEffective || null;
            dateSource = 'master-repo';
          } else {
            // --- Step 2: find a DOCX URL to re-parse ---
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
            const docxUrl = docxCandidates.find(
              (u) => u && (isBunnyPath(u) || u.startsWith('http')),
            );

            if (!docxUrl) {
              await send({ type: 'skip', identifier: id, reason: 'no DOCX available (PDF-only SOP)' });
              skipped++;
              continue;
            }

            const buffer = await fetchBunnyFile(docxUrl);
            if (!buffer) {
              await send({ type: 'skip', identifier: id, reason: 'could not download DOCX from Bunny' });
              skipped++;
              continue;
            }

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
          }

          if (!reviewDate) {
            await send({ type: 'skip', identifier: id, reason: 'no review date found in document' });
            skipped++;
            continue;
          }

          // Only write when the value actually changes — keeps the audit clean.
          const prev = sop.reviewDate ? new Date(sop.reviewDate).getTime() : null;
          const next = reviewDate.getTime();
          if (prev === next && sop.effectiveDate && effectiveDate &&
              new Date(sop.effectiveDate).getTime() === effectiveDate.getTime()) {
            await send({ type: 'unchanged', identifier: id, reviewDate: reviewDate.toISOString(), dateSource });
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

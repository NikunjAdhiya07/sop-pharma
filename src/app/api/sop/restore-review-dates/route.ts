import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import { fetchBunnyFile, isBunnyPath } from '@/lib/bunnyStorage';
import { extractSOPHeaderTableData } from '@/lib/docxHeaderExtractor';
import { parseSOPDate, extractDatesFromContent } from '@/lib/dateExtractor';
import { parseDOCX } from '@/lib/documentParser';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const send = async (data: object) => {
    await writer.write(encoder.encode('data: ' + JSON.stringify(data) + '\n\n'));
  };

  (async () => {
    try {
      await connectDB();

      // Fetch all non-obsolete SOPs that have a file stored in Bunny
      const sops = await SOP.find({ isObsolete: { $ne: true } })
        .select('_id identifier fileUrl fileType reviewDate effectiveDate validityPeriod language')
        .lean();

      const bunnySops = sops.filter(
        (s) => s.fileUrl && (isBunnyPath(s.fileUrl) || s.fileUrl.startsWith('http'))
      );

      await send({ type: 'init', total: bunnySops.length });

      let fixed = 0;
      let skipped = 0;
      let failed = 0;

      for (const sop of bunnySops) {
        const id = sop.identifier;
        try {
          // Only process DOCX files — PDFs need OCR, skip for now
          const fileType = (sop.fileType as string) || '';
          const fileUrl = sop.fileUrl as string;

          if (fileType !== 'docx') {
            await send({ type: 'skip', identifier: id, reason: 'not a DOCX' });
            skipped++;
            continue;
          }

          const buffer = await fetchBunnyFile(fileUrl);
          if (!buffer) {
            await send({ type: 'skip', identifier: id, reason: 'could not download file' });
            skipped++;
            continue;
          }

          // Try cell-aware header table extraction first (most reliable for SOP headers)
          let reviewDate: Date | null = null;
          let effectiveDate: Date | null = null;
          let dateSource = 'none';

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
            // fall through to text extraction
          }

          // Fallback: text-based extraction
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
            } catch {
              // ignore
            }
          }

          // If no date found from doc, skip — we never write a calculated value
          if (!reviewDate) {
            await send({ type: 'skip', identifier: id, reason: 'no date found in document' });
            skipped++;
            continue;
          }

          // Update DB
          const update: Record<string, Date> = { reviewDate };
          if (effectiveDate) update.effectiveDate = effectiveDate;

          await SOP.updateOne({ _id: sop._id }, { $set: update });
          fixed++;

          await send({
            type: 'fixed',
            identifier: id,
            reviewDate: reviewDate.toISOString(),
            dateSource,
          });
        } catch (err: any) {
          failed++;
          await send({ type: 'error', identifier: id, reason: err.message || 'unknown error' });
        }
      }

      void invalidateDashboardSopsCache();

      await send({ type: 'done', total: bunnySops.length, fixed, skipped, failed });
    } catch (err: any) {
      await send({ type: 'fatal', reason: err.message || 'Server error' });
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

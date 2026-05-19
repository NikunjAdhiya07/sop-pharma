import SOP from '@/models/SOP';
import MasterSOPRepository from '@/models/MasterSOPRepository';
import { extractDatesFromBuffer, parseSOPDate } from '@/lib/dateExtractor';
import { extractSOPHeaderTableData } from '@/lib/docxHeaderExtractor';
import { parseDOCX } from '@/lib/documentParser';
import { loadWordDocumentBuffer } from '@/lib/loadStoredFileBuffer';
import { collectDocxCandidates } from '@/lib/sopExpiry';

export type RecheckResult = {
  identifier: string;
  status: 'updated' | 'unchanged' | 'skipped' | 'error';
  message: string;
  /** Review date stored in DB before recheck */
  previousReviewDate?: string | null;
  /** Review date read from DOCX */
  extractedReviewDate?: string | null;
  /** Effective date stored in DB before recheck */
  previousEffectiveDate?: string | null;
  /** Effective date read from DOCX */
  extractedEffectiveDate?: string | null;
  dateSource?: string;
  /** Diagnostic: raw values found in the DOCX header table */
  headerTable?: {
    sopNo: string | null;
    effDate: string | null;
    reviewDate: string | null;
    expiryDate: string | null;
  };
  /** Diagnostic: which path the DOCX was loaded from */
  docxPath?: string | null;
};

export type RecheckSource =
  | { kind: 'stored' }
  | { kind: 'buffer'; buffer: Buffer; fileName?: string };

async function loadBuffer(
  sop: any,
  masters: any[],
): Promise<{ buffer: Buffer | null; path: string | null }> {
  const pathHint = collectDocxCandidates(sop, masters)[0] || '';
  const buffer = await loadWordDocumentBuffer(pathHint, sop.identifier, sop.language);
  return { buffer, path: pathHint || null };
}

/**
 * Re-read review/effective dates from a DOCX. The DOCX can come from the SOP's
 * stored file (`{ kind: 'stored' }`) or from a freshly uploaded buffer
 * (`{ kind: 'buffer', buffer }`). For uploads we also overwrite the stored file
 * so future rechecks see the same content.
 */
export async function recheckSopDatesFromDocx(
  sopId: string,
  masterByIdentifier?: Map<string, any[]>,
  source: RecheckSource = { kind: 'stored' },
): Promise<RecheckResult> {
  const sop = await SOP.findById(sopId)
    .select('_id identifier fileUrl fileType reviewDate effectiveDate expiryDate language sopDocuments')
    .lean<any>();

  if (!sop) {
    return { identifier: sopId, status: 'error', message: 'SOP not found' };
  }

  const id = String(sop.identifier || '').trim();
  const idUpper = id.toUpperCase();

  try {
    let masters = masterByIdentifier?.get(idUpper);
    if (!masters) {
      masters = await MasterSOPRepository.find({ sopIdentifier: idUpper })
        .select('sopIdentifier sopDocument metadata')
        .lean<any[]>();
    }

    let buffer: Buffer | null = null;
    let docxPath: string | null = null;
    if (source.kind === 'buffer') {
      buffer = source.buffer;
      docxPath = source.fileName ? `upload:${source.fileName}` : 'upload:in-memory';
    } else {
      const loaded = await loadBuffer(sop, masters);
      buffer = loaded.buffer;
      docxPath = loaded.path;
    }

    if (!buffer) {
      return {
        identifier: id,
        status: 'skipped',
        message: 'No DOCX file available for this SOP — upload one to recheck',
        docxPath,
      };
    }

    let parsedContent = '';
    try {
      const parsed = await parseDOCX(buffer);
      parsedContent = parsed.content;
    } catch {
      /* header-only extraction may still work */
    }

    const headerData = await extractSOPHeaderTableData(buffer);
    const extracted = await extractDatesFromBuffer(buffer, 'docx', parsedContent);

    let reviewDate: Date | null = null;
    let effectiveDate: Date | null = null;
    let dateSource = 'docx';

    if (headerData.reviewDate) {
      reviewDate = parseSOPDate(headerData.reviewDate);
      dateSource = 'header-table';
    }
    if (headerData.effDate) {
      effectiveDate = parseSOPDate(headerData.effDate);
    }
    if (!reviewDate) {
      reviewDate = extracted.reviewDate ?? extracted.expiryDate ?? null;
      if (reviewDate) dateSource = 'text-regex';
    }
    if (!effectiveDate) {
      effectiveDate = extracted.effectiveDate ?? null;
    }

    const previousReviewDate = sop.reviewDate
      ? new Date(sop.reviewDate).toISOString()
      : null;
    const previousEffectiveDate = sop.effectiveDate
      ? new Date(sop.effectiveDate).toISOString()
      : null;
    const extractedReviewDate = reviewDate ? reviewDate.toISOString() : null;
    const extractedEffectiveDate = effectiveDate ? effectiveDate.toISOString() : null;
    const headerTable = {
      sopNo: headerData.sopNo,
      effDate: headerData.effDate,
      reviewDate: headerData.reviewDate,
      expiryDate: headerData.expiryDate,
    };

    if (!reviewDate) {
      const labelOnly =
        headerData.sopNo &&
        !headerData.effDate &&
        !headerData.reviewDate &&
        !headerData.expiryDate;
      return {
        identifier: id,
        status: 'skipped',
        message: labelOnly
          ? 'DOCX header table has empty EFF. DATE / REVIEW DT. cells — upload a filled-in DOCX'
          : 'No review date found in DOCX',
        previousReviewDate,
        previousEffectiveDate,
        extractedReviewDate: null,
        extractedEffectiveDate,
        dateSource,
        headerTable,
        docxPath,
      };
    }

    const prevMs = sop.reviewDate ? new Date(sop.reviewDate).getTime() : null;
    const nextMs = reviewDate.getTime();
    const effChanged =
      effectiveDate &&
      (!sop.effectiveDate ||
        new Date(sop.effectiveDate).getTime() !== effectiveDate.getTime());

    if (prevMs === nextMs && !effChanged && source.kind !== 'buffer') {
      return {
        identifier: id,
        status: 'unchanged',
        message: 'Review date already matches DOCX',
        previousReviewDate,
        previousEffectiveDate,
        extractedReviewDate,
        extractedEffectiveDate,
        dateSource,
        headerTable,
        docxPath,
      };
    }

    const update: Record<string, Date> = {
      reviewDate,
      expiryDate: reviewDate,
    };
    if (effectiveDate) update.effectiveDate = effectiveDate;

    await SOP.updateOne({ _id: sop._id }, { $set: update });

    const masterUpdate: Record<string, unknown> = {
      'metadata.reviewDate': reviewDate,
      'metadata.expiryDate': reviewDate,
    };
    if (effectiveDate) masterUpdate['metadata.effectiveDate'] = effectiveDate;
    if (extracted.version) masterUpdate.version = extracted.version;

    await MasterSOPRepository.updateMany(
      { sopIdentifier: { $regex: new RegExp(`^${idUpper.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') } },
      { $set: masterUpdate },
    );

    return {
      identifier: id,
      status: 'updated',
      message:
        source.kind === 'buffer'
          ? 'Review date updated from uploaded DOCX'
          : 'Review date updated from stored DOCX',
      previousReviewDate,
      previousEffectiveDate,
      extractedReviewDate,
      extractedEffectiveDate,
      dateSource,
      headerTable,
      docxPath,
    };
  } catch (err: unknown) {
    return {
      identifier: id,
      status: 'error',
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

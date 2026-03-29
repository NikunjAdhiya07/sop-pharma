import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPGuideline from '@/models/SOPGuideline';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — same as compliance engine

const BATCH_SIZE = 12;
const SMALL_BATCH_SIZE = 5; // used when clause texts are very long
const CLAUSE_TEXT_LIMIT = 400; // chars per clause in the prompt

function isLikelyObjectId(id: string): boolean {
  return typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Normalise complianceLevel — AI sometimes uses underscores or wrong case */
function normLevel(raw: string): string {
  const v = String(raw || '').toLowerCase().replace(/_/g, '-');
  const valid = ['compliant', 'partial', 'non-compliant', 'not-applicable'];
  return valid.includes(v) ? v : 'non-compliant';
}

/**
 * Build a batch prompt — same logic as analyze-v4.
 * Sends up to BATCH_SIZE clauses per AI call; expects a JSON array back.
 */
function buildBatchPrompt(
  sopData: { identifier: string; name: string; department: string; content: string },
  items: Array<{ guideline: { name: string; folderName: string }; clause: { clauseNumber: string; clauseTitle: string; clauseText: string } }>
): string {
  const clauseList = items
    .map(({ guideline, clause }, idx) =>
      '[' + (idx + 1) + '] Guideline: ' + guideline.name + ' (' + guideline.folderName + ')\n' +
      '    Clause ' + clause.clauseNumber + ': ' + clause.clauseTitle + '\n' +
      '    Requirement: ' + (clause.clauseText || '').substring(0, CLAUSE_TEXT_LIMIT) +
      ((clause.clauseText || '').length > CLAUSE_TEXT_LIMIT ? '...' : '')
    )
    .join('\n\n');

  const sopContent = (sopData.content || 'No content available').substring(0, 14000);
  const truncated  = (sopData.content || '').length > 14000;

  return (
    'You are a pharmaceutical GMP compliance expert.\n\n' +
    'Analyze the SOP below against EACH numbered guideline clause.\n' +
    'Return a JSON ARRAY containing exactly ' + items.length + ' objects (one per clause, same order).\n\n' +
    '**SOP:**\n' +
    '- Identifier: ' + sopData.identifier + '\n' +
    '- Name: ' + sopData.name + '\n' +
    '- Department: ' + sopData.department + '\n\n' +
    '**SOP CONTENT:**\n' +
    sopContent + (truncated ? '\n\n... (content truncated)' : '') + '\n\n' +
    '**CLAUSES TO CHECK (' + items.length + ' total):**\n' +
    clauseList + '\n\n' +
    '**REQUIRED JSON SHAPE per object:**\n' +
    '{\n' +
    '  "complianceLevel": "compliant" | "partial" | "non-compliant" | "not-applicable",\n' +
    '  "matchConfidence": 0-100,\n' +
    '  "issueType": "missing-clause" | "partial-coverage" | "incorrect-implementation" | "no-issue" | "not-applicable",\n' +
    '  "issueSeverity": "critical" | "major" | "minor" | "informational",\n' +
    '  "sopSectionAffected": "Section X.Y - Title or N/A",\n' +
    '  "mismatchExplanation": "Concise explanation of gap or compliance",\n' +
    '  "highlightedIssue": "Specific issue or empty string",\n' +
    '  "sopTextSnippet": "Relevant verbatim SOP text (max 200 chars) or empty",\n' +
    '  "guidelineRequirement": "What this clause requires (concise)",\n' +
    '  "suggestedAction": "Specific actionable fix",\n' +
    '  "suggestedText": "Exact proposed text to add/modify",\n' +
    '  "estimatedEffort": "low" | "medium" | "high",\n' +
    '  "priority": 1-5\n' +
    '}\n\n' +
    'RULES:\n' +
    '1. SOP does not mention topic → "non-compliant" + "missing-clause"\n' +
    '2. SOP partially addresses → "partial" + "partial-coverage"\n' +
    '3. SOP fully complies → "compliant" + "no-issue"\n' +
    '4. Clause irrelevant to this SOP → "not-applicable"\n' +
    '5. Be specific and actionable.\n\n' +
    'Respond with ONLY a valid JSON array of length ' + items.length + '. No markdown, no extra text.'
  );
}

function parseBatchResponse(text: string, expectedCount: number): any[] {
  let t = text.trim();
  if (t.startsWith('```json')) t = t.slice(7);
  else if (t.startsWith('```')) t = t.slice(3);
  if (t.endsWith('```')) t = t.slice(0, -3);
  t = t.trim();
  const start = t.indexOf('[');
  const end   = t.lastIndexOf(']');
  if (start === -1 || end <= start) throw new Error('No JSON array in batch response');
  const parsed = JSON.parse(t.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error('Response is not array');
  while (parsed.length < expectedCount) parsed.push(null);
  return parsed.slice(0, expectedCount);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sopId         = typeof body.sopId         === 'string' ? body.sopId.trim()         : '';
    const sopIdentifier = typeof body.sopIdentifier === 'string' ? body.sopIdentifier.trim() : '';
    const sopNo         = typeof body.sopNo         === 'string' ? body.sopNo.trim()         : '';
    const rawIds        = body.guidelineIds;
    const guidelineIds: string[] = Array.isArray(rawIds)
      ? rawIds.map((x: unknown) => String(x).trim()).filter(isLikelyObjectId)
      : [];

    if (!sopId && !sopIdentifier && !sopNo) {
      return NextResponse.json({ success: false, error: 'sopId, sopIdentifier, or sopNo is required' }, { status: 400 });
    }
    if (guidelineIds.length === 0) {
      return NextResponse.json({
        success: false, error: 'No guidelines selected',
        userMessage: 'Choose at least one guideline document from your stored library to run the check.',
      }, { status: 400 });
    }

    await connectDB();

    // ── Resolve SOP (same 4-step cascade as before) ──────────────────
    let sop: any = null;
    if (sopId && isLikelyObjectId(sopId))  sop = await SOP.findById(sopId);
    if (!sop && sopIdentifier)             sop = await SOP.findOne({ identifier: new RegExp('^' + escapeRegex(sopIdentifier) + '$', 'i') });
    if (!sop && sopNo)                     sop = await SOP.findOne({ identifier: new RegExp('^' + escapeRegex(sopNo)         + '$', 'i') });
    if (!sop && sopNo) {
      const loose = sopNo.replace(/[-\s]/g, '').toUpperCase();
      const candidates = await SOP.find({
        identifier: { $regex: new RegExp(loose.substring(0, Math.min(loose.length, 8)), 'i') },
      }).select('_id identifier content name department').lean();
      const match = candidates.find((c: any) => (c.identifier || '').replace(/[-\s]/g, '').toUpperCase() === loose);
      if (match) sop = await SOP.findById(match._id);
    }

    if (!sop) {
      return NextResponse.json({
        success: false, error: 'SOP not found',
        userMessage: 'Could not find SOP "' + (sopNo || sopIdentifier || sopId) + '" in the database. Only uploaded SOPs can be reviewed.',
      }, { status: 404 });
    }

    const content = (sop.content || '').trim();
    if (content.length < 80) {
      return NextResponse.json({
        success: false, error: 'SOP has insufficient text',
        userMessage: 'This SOP has little or no extracted text. Re-upload or OCR the document before running a guideline review.',
      }, { status: 400 });
    }

    // ── Fetch selected guidelines + their clauses ─────────────────────
    const objectIds  = guidelineIds.map(id => new mongoose.Types.ObjectId(id));
    const guidelines = await SOPGuideline.find({ _id: { $in: objectIds }, ocrStatus: 'completed' })
      .select('name folderName pdfName guidelineType category clauses')
      .lean();

    if (guidelines.length === 0) {
      return NextResponse.json({
        success: false, error: 'No matching guidelines',
        userMessage: 'None of the selected guidelines are available or finished processing (OCR). Choose other documents or wait.',
      }, { status: 400 });
    }

    // Flatten all clauses across selected guidelines
    const allClauses: Array<{ guideline: any; clause: any }> = [];
    for (const g of guidelines) {
      const clauses = Array.isArray(g.clauses) ? g.clauses : [];
      for (const c of clauses) {
        allClauses.push({ guideline: g, clause: c });
      }
    }

    if (allClauses.length === 0) {
      return NextResponse.json({
        success: false, error: 'No clauses found',
        userMessage: 'The selected guideline documents have no clause structure. Try documents that completed OCR processing.',
      }, { status: 400 });
    }

    // ── AI init ───────────────────────────────────────────────────────
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
    if (!geminiKey) {
      return NextResponse.json({
        success: false, error: 'AI not configured',
        userMessage: 'Set GEMINI_API_KEY in the environment to run guideline review.',
      }, { status: 503 });
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // ── Batch analysis (same as analyze-v4) ──────────────────────────
    const findings: any[] = [];

    const batches: Array<typeof allClauses> = [];
    for (let i = 0; i < allClauses.length; i += BATCH_SIZE) {
      batches.push(allClauses.slice(i, i + BATCH_SIZE));
    }

    const sopData = { identifier: sop.identifier, name: sop.name, department: sop.department || 'General', content };

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      const batch = batches[bIdx];

      // Dynamically split oversized batches — if avg clause text > 300 chars, use SMALL_BATCH_SIZE
      const avgClauseLen = batch.reduce((acc, { clause }) => acc + (clause.clauseText || '').length, 0) / batch.length;
      const effectiveBatchSize = avgClauseLen > 300 ? SMALL_BATCH_SIZE : BATCH_SIZE;

      const subBatches: Array<typeof batch> = [];
      for (let j = 0; j < batch.length; j += effectiveBatchSize) {
        subBatches.push(batch.slice(j, j + effectiveBatchSize));
      }

      for (const subBatch of subBatches) {
        try {
          const prompt      = buildBatchPrompt(sopData, subBatch);
          const result      = await model.generateContent(prompt);
          const batchResult = parseBatchResponse(result.response.text(), subBatch.length);

          subBatch.forEach(({ guideline, clause }, i) => {
            const ai = batchResult[i];
            if (!ai || typeof ai !== 'object') {
              findings.push(failedFinding(guideline, clause));
              return;
            }
            findings.push({
              guidelineId:        guideline._id?.toString() ?? '',
              guidelineName:      guideline.name,
              folderName:         guideline.folderName,
              pdfName:            guideline.pdfName || '',
              clauseNumber:       clause.clauseNumber,
              clauseTitle:        clause.clauseTitle,
              clauseText:         clause.clauseText,
              complianceLevel:    normLevel(ai.complianceLevel),
              matchConfidence:    Number(ai.matchConfidence) || 0,
              issueType:          ai.issueType          || 'not-applicable',
              issueSeverity:      ai.issueSeverity      || 'minor',
              sopSectionAffected: String(ai.sopSectionAffected || 'N/A'),
              mismatchExplanation:String(ai.mismatchExplanation || ''),
              highlightedIssue:   String(ai.highlightedIssue   || ''),
              sopTextSnippet:     String(ai.sopTextSnippet      || ''),
              guidelineRequirement:String(ai.guidelineRequirement || clause.clauseTitle || ''),
              suggestedAction:    String(ai.suggestedAction    || ''),
              suggestedText:      String(ai.suggestedText      || ''),
              estimatedEffort:    ai.estimatedEffort || 'medium',
              priority:           Number(ai.priority) || 3,
            });
          });
        } catch {
          subBatch.forEach(({ guideline, clause }) => findings.push(failedFinding(guideline, clause)));
        }
        if (subBatches.indexOf(subBatch) < subBatches.length - 1) await new Promise(r => setTimeout(r, 200));
      }

      if (bIdx < batches.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    // ── Compute summary counts ────────────────────────────────────────
    const compliantCount    = findings.filter(f => f.complianceLevel === 'compliant').length;
    const partialCount      = findings.filter(f => f.complianceLevel === 'partial').length;
    const nonCompliantCount = findings.filter(f => f.complianceLevel === 'non-compliant').length;
    const notApplicable     = findings.filter(f => f.complianceLevel === 'not-applicable').length;
    const applicable        = findings.length - notApplicable;
    const overallScore      = applicable > 0
      ? Math.round(((compliantCount * 10 + partialCount * 5) / applicable) * 10) / 10
      : 10;

    return NextResponse.json({
      success: true,
      sopIdentifier:        sop.identifier,
      sopName:              sop.name,
      guidelineDocumentsUsed: guidelines.length,
      guidelineIdsRequested:  guidelineIds.length,
      clausesAnalyzed:      findings.length,
      batchesUsed:          batches.length,
      overallScore,
      counts: { compliantCount, partialCount, nonCompliantCount, notApplicable },
      findings,
    });

  } catch (e) {
    console.error('sop-guideline-review:', e);
    return NextResponse.json({
      success: false,
      error: (e as Error).message || 'Review failed',
      userMessage: 'Guideline review failed. Try again or check server logs.',
    }, { status: 500 });
  }
}

function failedFinding(guideline: any, clause: any) {
  return {
    guidelineId: guideline._id?.toString() ?? '',
    guidelineName: guideline.name, folderName: guideline.folderName, pdfName: guideline.pdfName || '',
    clauseNumber: clause.clauseNumber, clauseTitle: clause.clauseTitle, clauseText: clause.clauseText,
    complianceLevel: 'analysis-failed', matchConfidence: 0, issueType: 'not-applicable',
    issueSeverity: 'informational', sopSectionAffected: 'N/A',
    mismatchExplanation: 'Analysis failed — batch may have been too large. Please re-run.', highlightedIssue: '',
    sopTextSnippet: '',
    // Use title (not full clause text) so the UI shows a concise label
    guidelineRequirement: clause.clauseTitle || clause.clauseNumber || 'Unknown clause',
    suggestedAction: 'Re-run analysis', suggestedText: '', estimatedEffort: 'low', priority: 5,
  };
}

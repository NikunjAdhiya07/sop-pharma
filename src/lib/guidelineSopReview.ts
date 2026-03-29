import { geminiModel } from '@/lib/gemini';

export type RecommendationPriority = 'High' | 'Medium' | 'Low';

export interface GuidelineRecommendation {
  priority: RecommendationPriority;
  title: string;
  detail: string;
  guidelineReference: string;
  /** SOP section where the change is needed, e.g. "Section 5.2.1" */
  sopSection?: string;
  /** The exact existing line/sentence from the SOP that needs modifying (verbatim) */
  currentLine?: string;
  /** The complete revised line with the suggested modification applied */
  suggestedLine?: string;
}

export interface GuidelineReviewResult {
  summary: string;
  recommendations: GuidelineRecommendation[];
}

function truncateText(s: string, max: number): string {
  const t = (s || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n\n[… truncated …]`;
}

/** Strip markdown fences and parse first JSON object from model output. */
function parseReviewJson(raw: string): GuidelineReviewResult {
  let t = raw.trim();
  if (t.includes('```json')) {
    const p = t.split('```json');
    if (p.length > 1) t = p[1].split('```')[0].trim();
  } else if (t.includes('```')) {
    const p = t.split('```');
    if (p.length > 1) t = p[1].split('```')[0].trim();
  }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('No JSON object in model response');
  }
  t = t.slice(start, end + 1);
  const parsed = JSON.parse(t) as { summary?: string; recommendations?: unknown };
  const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
  const recs: GuidelineRecommendation[] = [];
  if (Array.isArray(parsed.recommendations)) {
    for (const r of parsed.recommendations) {
      if (!r || typeof r !== 'object') continue;
      const o = r as Record<string, unknown>;
      const pr = String(o.priority || '');
      const priority: RecommendationPriority =
        pr === 'High' || pr === 'Medium' || pr === 'Low' ? pr : 'Medium';
      recs.push({
        priority,
        title: String(o.title || 'Recommendation'),
        detail: String(o.detail || o.suggestion || ''),
        guidelineReference: String(o.guidelineReference || o.reference || ''),
        sopSection: o.sopSection ? String(o.sopSection) : undefined,
        currentLine: o.currentLine ? String(o.currentLine) : undefined,
        suggestedLine: o.suggestedLine ? String(o.suggestedLine) : undefined,
      });
    }
  }
  return { summary, recommendations: recs };
}

/**
 * Single-pass review: compares SOP text to a consolidated guidelines corpus (uploaded guideline library).
 */
export async function reviewSopAgainstGuidelinesCorpus(params: {
  sopContent: string;
  sopName: string;
  sopIdentifier: string;
  department: string;
  guidelinesCorpus: string;
}): Promise<GuidelineReviewResult> {
  const sopExcerpt = truncateText(params.sopContent, 14000);
  const guideExcerpt = truncateText(params.guidelinesCorpus, 26000);

  const prompt = `You are a senior pharmaceutical GMP / regulatory QA reviewer.

Your task: compare the STANDARD OPERATING PROCEDURE (SOP) below against the REGULATORY GUIDELINE EXCERPTS (from the organization's uploaded guideline library: ICH, WHO GMP, FDA CFR, Schedule M, etc.).

SOP identifier: ${params.sopIdentifier}
SOP title: ${params.sopName}
Department: ${params.department}

=== SOP CONTENT (may be truncated) ===
${sopExcerpt}

=== GUIDELINE EXCERPTS (may be truncated) ===
${guideExcerpt}

Instructions:
1. Identify gaps, weak areas, or improvements where the SOP should better align with the cited regulatory expectations.
2. Assign each recommendation a priority:
   - **High**: critical compliance risk, missing required controls, or major deviation from applicable guidance.
   - **Medium**: meaningful improvement needed; partial alignment or unclear wording that could affect compliance.
   - **Low**: minor clarifications, best-practice enhancements, or optional alignment.
3. Reference which guideline area each recommendation relates to (document name + clause/annex/section visible in excerpts).
4. For each recommendation, when the SOP is machine-readable text (not a scanned image), also provide:
   - **sopSection**: the exact heading or number in the SOP where the change belongs (e.g. "Section 5.2.1", "Clause 4.3 - Monitoring"). Use "General" if the SOP has no sections.
   - **currentLine**: copy the single sentence/line from the SOP to be modified (verbatim, under 220 chars). Omit if the gap is about something entirely missing from the SOP.
   - **suggestedLine**: write the complete replacement sentence/line with the modification applied (under 320 chars).
   If the SOP is a scanned image or the text is unreadable, omit these three fields.

Respond with **valid JSON only** (no markdown outside JSON), exactly this shape:
{
  "summary": "2-4 sentences overall assessment of alignment.",
  "recommendations": [
    {
      "priority": "High",
      "title": "Short label (5-8 words)",
      "detail": "Specific actionable explanation of the gap and why it matters.",
      "guidelineReference": "Document name + clause, e.g. gmp-guide-annexes [PICS], Annex 1, Clause 8",
      "sopSection": "Section 5.2.1",
      "currentLine": "The temperature shall be maintained between 20 and 25 degrees C.",
      "suggestedLine": "The temperature shall be continuously monitored and maintained between 15 and 25 degrees C per Annex 1, Clause 8."
    }
  ]
}

Use at most 12 recommendations; omit empty items. If the SOP text is too short or is a scanned image, say so in summary and list any obvious gaps inferred from the title and department.`;

  const result = await geminiModel.generateContent(prompt);
  const text = result.response.text();
  return parseReviewJson(text);
}

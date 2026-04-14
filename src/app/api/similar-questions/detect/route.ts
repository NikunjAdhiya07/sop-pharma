import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';
import SimilarQuestion from '@/models/SimilarQuestion';

// ─── Stop words to ignore when comparing ────────────────────────────────────
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'on',
  'at', 'by', 'for', 'with', 'about', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'from', 'up', 'down', 'out',
  'off', 'over', 'under', 'again', 'then', 'once', 'and', 'but', 'or',
  'nor', 'so', 'yet', 'both', 'either', 'not', 'no', 'than', 'too',
  'very', 'just', 'this', 'that', 'these', 'those', 'it', 'its',
]);

// ─── Text helpers ────────────────────────────────────────────────────────────

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getContentWords(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/** Levenshtein distance */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
  return dp[m][n];
}

/** Character-level Levenshtein similarity (0–100) */
function charSimilarity(s1: string, s2: string): number {
  const a = s1.toLowerCase().trim();
  const b = s2.toLowerCase().trim();
  if (a === b) return 100;
  const longer = a.length > b.length ? a : b;
  if (longer.length === 0) return 100;
  return Math.round(((longer.length - levenshtein(a, b)) / longer.length) * 100);
}

/** Jaccard similarity on content-word sets (0–100) */
function jaccardSimilarity(s1: string, s2: string): number {
  const w1 = new Set(getContentWords(s1));
  const w2 = new Set(getContentWords(s2));
  if (w1.size === 0 && w2.size === 0) return 100;
  if (w1.size === 0 || w2.size === 0) return 0;
  const intersection = [...w1].filter(w => w2.has(w)).length;
  const union = new Set([...w1, ...w2]).size;
  return Math.round((intersection / union) * 100);
}

/** N-gram overlap on bigrams+trigrams of content words (0–100) */
function ngramSimilarity(s1: string, s2: string): number {
  const words1 = getContentWords(s1);
  const words2 = getContentWords(s2);

  const ngrams = (words: string[]) => {
    const result = new Set<string>();
    for (let i = 0; i < words.length - 1; i++) result.add(`${words[i]} ${words[i + 1]}`);
    for (let i = 0; i < words.length - 2; i++) result.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    return result;
  };

  const g1 = ngrams(words1);
  const g2 = ngrams(words2);
  if (g1.size === 0 && g2.size === 0) return 0;
  if (g1.size === 0 || g2.size === 0) return 0;

  const intersection = [...g1].filter(g => g2.has(g)).length;
  const union = new Set([...g1, ...g2]).size;
  return Math.round((intersection / union) * 100);
}

/**
 * Compute per-dimension similarity scores between two MCQ objects.
 * Returns a composite score (0–100) weighted by significance:
 *  - 30% question Jaccard (content words, no synonyms)
 *  - 20% question n-gram overlap
 *  - 10% character-level Levenshtein (surface form)
 *  - 25% correct answer match (exact or near-exact)
 *  - 15% answer-option Jaccard
 *
 * Design intent: minor rephrasing / synonym swap / sentence reorder
 * should score < 70. Structural duplicates (same core topic, same answer)
 * should score ≥ 85.
 */
function computeQuestionSimilarity(
  q1: { question: string; options: string[]; correctAnswer: string },
  q2: { question: string; options: string[]; correctAnswer: string },
): number {
  // ── Question text ──────────────────────────────────────────────
  const qJaccard = jaccardSimilarity(q1.question, q2.question);
  const qNgram   = ngramSimilarity(q1.question, q2.question);
  const qChar    = charSimilarity(q1.question, q2.question);

  // ── Correct answer similarity ──────────────────────────────────
  const aChar  = charSimilarity(q1.correctAnswer, q2.correctAnswer);
  // Jaccard on the correct-answer text
  const aJacc  = jaccardSimilarity(q1.correctAnswer, q2.correctAnswer);
  // Combine: 70% char + 30% word
  const answerScore = Math.round(aChar * 0.7 + aJacc * 0.3);

  // ── Answer options ──────────────────────────────────────────────
  // Concatenate all options to compare option pools
  const opts1 = (q1.options || []).join(' ');
  const opts2 = (q2.options || []).join(' ');
  const optionScore = jaccardSimilarity(opts1, opts2);

  // ── Composite ──────────────────────────────────────────────────
  const composite = Math.round(
    qJaccard   * 0.30 +
    qNgram     * 0.20 +
    qChar      * 0.10 +
    answerScore * 0.25 +
    optionScore * 0.15
  );

  return composite;
}

/** Find shared content phrases for display */
function findMatchingText(s1: string, s2: string): string {
  const w1 = getContentWords(s1);
  const w2 = new Set(getContentWords(s2));
  // bigrams that appear in both
  const shared: string[] = [];
  for (let i = 0; i < w1.length - 1; i++) {
    const bigram = `${w1[i]} ${w1[i + 1]}`;
    if (w2.has(w1[i]) && w2.has(w1[i + 1])) shared.push(bigram);
  }
  return [...new Set(shared)].slice(0, 5).join(', ');
}

// ─── Route ───────────────────────────────────────────────────────────────────

/**
 * POST /api/similar-questions/detect
 *
 * Thresholds (composite 0–100):
 *   < 70  → not similar
 *   70–84 → moderate (flagged for review, not auto-replaced)
 *   ≥ 85  → highly similar / duplicate (auto-replaceable)
 *
 * Default threshold sent by callers is 70 (was 50 / 30 before).
 */
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const {
      mcqBankId,
      sopId,
      threshold = 70,
      scanAllBanks = false,
      targetQuestionIndex,
    } = body;

    if (!mcqBankId && !sopId) {
      return NextResponse.json({ success: false, error: 'Either mcqBankId or sopId is required' }, { status: 400 });
    }

    // ── Fetch banks ──────────────────────────────────────────────
    let mcqBanks: any[] = [];
    if (mcqBankId) {
      const bank = await MCQBank.findById(mcqBankId).lean();
      if (!bank) return NextResponse.json({ success: false, error: 'MCQ Bank not found' }, { status: 404 });
      mcqBanks = [bank];
    } else if (sopId) {
      mcqBanks = scanAllBanks
        ? await MCQBank.find({ sopId }).lean()
        : [await MCQBank.findOne({ sopId }).lean()].filter(Boolean);
    }

    if (mcqBanks.length === 0) {
      return NextResponse.json({ success: false, error: 'No MCQ banks found' }, { status: 404 });
    }

    // ── Reset isSimilar flags on full-bank scan ──────────────────
    if (mcqBankId && targetQuestionIndex === undefined && mcqBanks.length === 1) {
      const bankToReset = await MCQBank.findById(mcqBankId);
      if (bankToReset?.mcqs?.length) {
        for (const m of bankToReset.mcqs) m.isSimilar = false;
        await bankToReset.save();
      }
    }

    // ── Detect similarities ──────────────────────────────────────
    const similarities: any[] = [];
    const processedPairs = new Set<string>();

    for (const bank1 of mcqBanks) {
      const startIdx = targetQuestionIndex !== undefined ? targetQuestionIndex : 0;
      const endIdx   = targetQuestionIndex !== undefined ? targetQuestionIndex + 1 : bank1.mcqs.length;

      for (let q1Idx = startIdx; q1Idx < endIdx; q1Idx++) {
        const q1 = bank1.mcqs[q1Idx];
        const similarQuestions: any[] = [];

        for (let q2Idx = 0; q2Idx < bank1.mcqs.length; q2Idx++) {
          if (q1Idx === q2Idx) continue;
          const pairKey = `${bank1._id}-${Math.min(q1Idx, q2Idx)}-${Math.max(q1Idx, q2Idx)}`;
          if (processedPairs.has(pairKey)) continue;

          const q2 = bank1.mcqs[q2Idx];
          const score = computeQuestionSimilarity(q1, q2);

          if (score >= threshold) {
            similarQuestions.push({
              mcqBankId: bank1._id,
              questionIndex: q2Idx,
              question: q2,
              similarityScore: score,
              matchingText: findMatchingText(q1.question, q2.question),
            });
            processedPairs.add(pairKey);
          }
        }

        // Cross-bank scan
        if (scanAllBanks) {
          for (const bank2 of mcqBanks) {
            if (bank2._id.toString() === bank1._id.toString()) continue;
            for (let q2Idx = 0; q2Idx < bank2.mcqs.length; q2Idx++) {
              const pairKey = `${bank1._id}-${q1Idx}-${bank2._id}-${q2Idx}`;
              if (processedPairs.has(pairKey)) continue;
              const q2 = bank2.mcqs[q2Idx];
              const score = computeQuestionSimilarity(q1, q2);
              if (score >= threshold) {
                similarQuestions.push({
                  mcqBankId: bank2._id,
                  questionIndex: q2Idx,
                  question: q2,
                  similarityScore: score,
                  matchingText: findMatchingText(q1.question, q2.question),
                });
                processedPairs.add(pairKey);
              }
            }
          }
        }

        if (similarQuestions.length > 0) {
          const existing = await SimilarQuestion.findOne({
            'primaryQuestion.mcqBankId': bank1._id,
            'primaryQuestion.questionIndex': q1Idx,
          });

          similarities.push({
            ...(existing ? { _id: existing._id, isUpdate: true } : {}),
            sopId: bank1.sopId,
            sopName: bank1.sopName,
            sopIdentifier: bank1.sopIdentifier,
            department: bank1.department,
            primaryQuestion: { mcqBankId: bank1._id, questionIndex: q1Idx, question: q1 },
            similarQuestions,
          });
        }
      }
    }

    // ── Persist & flag ───────────────────────────────────────────
    let flaggedCount = 0;
    for (const similarity of similarities) {
      try {
        if (similarity.isUpdate) {
          const { _id, isUpdate, ...updateData } = similarity;
          await SimilarQuestion.findByIdAndUpdate(_id, {
            ...updateData,
            flaggedBy: 'Auto-Detection',
            reviewStatus: 'pending',
          });
        } else {
          await SimilarQuestion.create({ ...similarity, flaggedBy: 'Auto-Detection', reviewStatus: 'pending' });
        }

        await MCQBank.updateOne(
          { _id: similarity.primaryQuestion.mcqBankId },
          { $set: { [`mcqs.${similarity.primaryQuestion.questionIndex}.isSimilar`]: true } }
        );
        for (const sq of similarity.similarQuestions) {
          await MCQBank.updateOne(
            { _id: sq.mcqBankId },
            { $set: { [`mcqs.${sq.questionIndex}.isSimilar`]: true } }
          );
        }
        flaggedCount++;
      } catch (err) {
        console.error(`[detect] Error flagging Q${similarity.primaryQuestion.questionIndex + 1}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Detected ${similarities.length} similarity groups`,
      flaggedCount,
      similarities,
      threshold,
    });
  } catch (error: any) {
    console.error('[detect] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to detect similarities' }, { status: 500 });
  }
}

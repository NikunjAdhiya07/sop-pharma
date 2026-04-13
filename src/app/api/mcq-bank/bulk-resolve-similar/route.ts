import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';
import SOP from '@/models/SOP';
import SimilarQuestion from '@/models/SimilarQuestion';
import EliminatedQuestion from '@/models/EliminatedQuestion';
import AutoResolveJob from '@/models/AutoResolveJob';
import { generateMCQsFromSOP } from '@/lib/gemini';
import { IMCQ } from '@/models/MCQBank';

// Concurrency guard: prevent multiple bulk-resolve jobs on the same bank
const CONCURRENT_JOBS = new Set<string>();

interface ClusterResult {
  similarQuestionDocId: string;
  primaryQuestionIndex: number;
  clusterSize: number;
  maxScore: number;
  bestKeptIndex: number;
  questionsToReplace: number;
  status: 'skipped' | 'dry_run' | 'replaced' | 'failed' | 'below_threshold';
  replacedQuestions?: number[];
  failureReason?: string;
  eligibleScores: Array<{ questionIndex: number; score: number; question: string }>;
}

interface BulkResolveResponse {
  success: boolean;
  dryRun: boolean;
  summary: {
    found: number;
    eligible: number;
    replaced: number;
    kept: number;
    failed: number;
    eliminatedCount: number;
  };
  clusters: ClusterResult[];
  log: string[];
  error?: string;
}

/**
 * Score a single MCQ within a cluster context
 * Returns 0-100 score based on: wording clarity, answer quality, SOP reference, style uniqueness
 */
function scoreClusterQuestion(
  mcq: IMCQ,
  allBankMcqs: IMCQ[],
  clusterMcqs: IMCQ[]
): number {
  let score = 0;

  // 1. WORDING_CLARITY (0-25)
  const questionLength = mcq.question.length;
  if (questionLength >= 50 && questionLength <= 150) {
    score += 25;
  } else if (questionLength > 150 && questionLength <= 200) {
    score += 15;
  } else {
    score += 5;
  }

  // 2. ANSWER_QUALITY (0-25)
  const uniqueOptions = new Set(mcq.options.map(o => o.toLowerCase().trim()));
  if (uniqueOptions.size === 4) {
    score += 10; // All 4 options are unique
  }
  if (mcq.options.some(opt => opt.toLowerCase().trim() === mcq.correctAnswer.toLowerCase().trim())) {
    score += 10; // correctAnswer exists in options
  }
  if (mcq.options.every(opt => opt.length > 10)) {
    score += 5; // All options > 10 chars
  }

  // 3. SOP_REFERENCE_SPECIFICITY (0-25)
  if (mcq.sopReference) {
    if (/\d+/.test(mcq.sopReference)) {
      score += 25; // Contains section numbers like "4.2" or "SOP-12"
    } else {
      score += 10; // Non-empty but no digits
    }
  }

  // 4. STYLE_UNIQUENESS (0-25)
  const firstThreeWords = mcq.question.split(' ').slice(0, 3).join(' ').toLowerCase();
  const duplicateStarts = allBankMcqs.filter(q => {
    if (q === mcq) return false; // Don't count self
    const qFirstThree = q.question.split(' ').slice(0, 3).join(' ').toLowerCase();
    return qFirstThree === firstThreeWords;
  }).length;

  if (duplicateStarts === 0) {
    score += 25;
  } else if (duplicateStarts === 1) {
    score += 15;
  } else {
    score += 5;
  }

  return score;
}

/**
 * POST /api/mcq-bank/bulk-resolve-similar
 * Bulk auto-resolution of similar questions in an MCQ bank
 */
export async function POST(request: NextRequest) {
  const log: string[] = [];
  let jobId: string | null = null;

  try {
    console.log(`\n🚀🚀🚀 BULK-RESOLVE-SIMILAR ENDPOINT CALLED 🚀🚀🚀`);

    await dbConnect();

    const body = await request.json();
    const {
      mcqBankId,
      jobId: bodyJobId,
      mode = 'balanced',
      dryRun = false,
      threshold = 50,  // Match "Check Similar" detection threshold
    } = body;

    jobId = bodyJobId;

    console.log(`📥 Received request:`, { mcqBankId, jobId, mode, dryRun, threshold });

    if (!mcqBankId) {
      console.error(`❌ No mcqBankId provided`);
      return NextResponse.json(
        { success: false, error: 'mcqBankId is required' },
        { status: 400 }
      );
    }

    // Concurrency guard
    if (CONCURRENT_JOBS.has(mcqBankId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'A resolution job is already running for this bank. Please wait.',
        },
        { status: 409 }
      );
    }

    CONCURRENT_JOBS.add(mcqBankId);

    try {
      // --- STEP 0: Validation & DB Connect ---
      log.push(`Starting bulk similarity resolution (mode: ${mode})`);

      const bank = await MCQBank.findById(mcqBankId);
      if (!bank) {
        log.push('❌ MCQ bank not found');
        if (jobId) {
          await AutoResolveJob.findByIdAndUpdate(jobId, {
            status: 'failed',
            error: 'MCQ bank not found',
            logs: log,
            completedAt: new Date(),
          });
        }
        return NextResponse.json(
          { success: false, error: 'MCQ bank not found', log },
          { status: 404 }
        );
      }

      log.push(`✓ Found bank: ${bank.sopIdentifier} (${bank.mcqs.length} questions)`);

      // Update job status to running
      if (jobId) {
        console.log(`📝 Updating job ${jobId} to running status with logs`);
        const updated = await AutoResolveJob.findByIdAndUpdate(
          jobId,
          {
            status: 'running',
            logs: log,
            startedAt: new Date(),
          },
          { new: true }
        );
        console.log(`✓ Job status updated: ${updated?.status}`);
      }

      // Find SOP with stale-sopId fallback
      let sop = await SOP.findById(bank.sopId);
      if (sop && bank.sopIdentifier && sop.identifier &&
          sop.identifier.toUpperCase().trim() !== bank.sopIdentifier.toUpperCase().trim()) {
        log.push(`⚠ SOP ID mismatch detected, falling back to identifier lookup`);
        sop = null;
      }
      if (!sop) {
        sop = await SOP.findOne({ identifier: bank.sopIdentifier });
        if (sop) {
          bank.sopId = sop._id as any;
          await bank.save();
          log.push(`✓ Fixed stale sopId in bank`);
        }
      }

      if (!sop || !sop.content || sop.content.trim().length === 0) {
        log.push('❌ SOP has no content');
        return NextResponse.json(
          { success: false, error: 'SOP has no content', log },
          { status: 400 }
        );
      }

      log.push(`✓ Using SOP: ${sop.name}`);

      // --- STEP 1: Detection ---
      log.push(`Running similarity detection...`);

      // Call detect endpoint to find similarities
      const detectUrl = new URL('/api/similar-questions/detect', process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
      const detectResponse = await fetch(detectUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mcqBankId,
          threshold,
          similarityMethod: 'combined_text',
        }),
      });

      if (!detectResponse.ok) {
        throw new Error(`Detection endpoint failed: ${detectResponse.statusText}`);
      }

      const detectData = await detectResponse.json();
      log.push(`✓ Detection complete: ${detectData.flaggedCount} clusters found`);

      // Use the fresh detection results directly - don't rely on old database records
      // Convert detection results to SimilarQuestion-like structure for processing
      const similarQuestions = detectData.similarities || [];

      log.push(`✓ Using ${similarQuestions.length} fresh similarity clusters from detection`);

      // --- STEP 2: Score Each Cluster ---
      log.push(`Scoring cluster candidates...`);

      const clusters: ClusterResult[] = [];
      let eligibleCount = 0;

      for (const similarQuestion of similarQuestions) {
        const primaryIdx = similarQuestion.primaryQuestion.questionIndex;
        const primaryMcq = bank.mcqs[primaryIdx];

        if (!primaryMcq) {
          log.push(`⚠ Primary question at index ${primaryIdx} not found, skipping cluster`);
          continue;
        }

        // Build candidate list: primary + all similar
        const candidates = [
          { mcq: primaryMcq, index: primaryIdx, score: 0, isFromCluster: 'primary' },
          ...similarQuestion.similarQuestions.map((sq: any, idx: number) => ({
            mcq: sq.question,
            index: sq.questionIndex,
            score: 0,
            similarityScore: sq.similarityScore,
            isFromCluster: 'similar',
          })),
        ];

        // Score each candidate
        candidates.forEach(cand => {
          cand.score = scoreClusterQuestion(cand.mcq, bank.mcqs, candidates.map(c => c.mcq));
        });

        // Find best (highest score)
        const best = candidates.reduce((a, b) => (a.score > b.score ? a : b));
        const bestIndex = best.index;
        const bestScore = best.score;

        // Determine questions to replace based on detection threshold (not mode)
        // Mode is now ignored in favor of the detection threshold
        const toReplace = similarQuestion.similarQuestions.filter(
          (sq: any) => sq.similarityScore >= threshold
        );

        const docId = similarQuestion._id ? similarQuestion._id.toString() : `${primaryIdx}-cluster`;

        if (toReplace.length === 0) {
          clusters.push({
            similarQuestionDocId: docId,
            primaryQuestionIndex: primaryIdx,
            clusterSize: similarQuestion.similarQuestions.length + 1,
            maxScore: bestScore,
            bestKeptIndex: bestIndex,
            questionsToReplace: 0,
            status: 'below_threshold',
            eligibleScores: candidates.map(c => ({
              questionIndex: c.index,
              score: c.score,
              question: c.mcq.question.substring(0, 60),
            })),
          });
        } else {
          eligibleCount++;
          clusters.push({
            similarQuestionDocId: docId,
            primaryQuestionIndex: primaryIdx,
            clusterSize: similarQuestion.similarQuestions.length + 1,
            maxScore: bestScore,
            bestKeptIndex: bestIndex,
            questionsToReplace: toReplace.length,
            status: 'dry_run',
            eligibleScores: candidates.map(c => ({
              questionIndex: c.index,
              score: c.score,
              question: c.mcq.question.substring(0, 60),
            })),
          });
        }
      }

      log.push(`✓ Scoring complete: ${eligibleCount}/${clusters.length} clusters eligible for replacement`);

      // --- STEP 3: Return if dry-run ---
      if (dryRun) {
        log.push(`Dry-run mode: returning preview without making changes`);
        return NextResponse.json({
          success: true,
          dryRun: true,
          summary: {
            found: clusters.length,
            eligible: eligibleCount,
            replaced: 0,
            kept: clusters.length,
            failed: 0,
            eliminatedCount: 0,
          },
          clusters,
          log,
        });
      }

      // --- STEP 4-7: Generation, Splicing, and Review Marking ---
      log.push(`Starting generation and replacement phase...`);

      let replacedCount = 0;
      let failedCount = 0;
      let eliminatedCount = 0;
      const processedIndices = new Set<number>(); // Guard against double-processing
      let updateInterval = 0; // Track updates to avoid spamming

      for (const cluster of clusters) {
        if (cluster.status === 'below_threshold') {
          log.push(`Skipping cluster (score below ${threshold}%)`);
          continue;
        }

        const similarQuestion = similarQuestions.find((sq: any) => {
          const sqId = sq._id ? sq._id.toString() : `${sq.primaryQuestion.questionIndex}-cluster`;
          return sqId === cluster.similarQuestionDocId;
        });
        if (!similarQuestion) continue;
        const toReplace = similarQuestion.similarQuestions.filter(
          (sq: any) => sq.similarityScore >= threshold && !processedIndices.has(sq.questionIndex)
        );

        if (toReplace.length === 0) continue;

        log.push(`Processing cluster: replacing ${toReplace.length} question(s)...`);
        cluster.replacedQuestions = [];

        for (const replacementTarget of toReplace) {
          if (processedIndices.has(replacementTarget.questionIndex)) {
            log.push(`Q${replacementTarget.questionIndex + 1} already processed, skipping`);
            continue;
          }

          try {
            log.push(`Generating replacement for Q${replacementTarget.questionIndex + 1}`);

            // Re-fetch fresh bank to get latest state
            const freshBank = await MCQBank.findById(mcqBankId);
            if (!freshBank) {
              log.push(`❌ Bank no longer exists during generation`);
              failedCount++;
              continue;
            }

            // Generate replacement
            // Pass the current bank questions to avoid duplicates, but don't count the question being replaced
            const questionsToAvoid = freshBank.mcqs
              .filter((_, idx) => idx !== replacementTarget.questionIndex) // Exclude the one being replaced
              .map(q => q.question);

            const genResult = await generateMCQsFromSOP({
              sopContent: sop.content,
              sopName: sop.name,
              sopIdentifier: sop.identifier || sop.name,
              existingQuestions: questionsToAvoid,
              targetCount: questionsToAvoid.length + 1, // Total count after adding the new question
              isBulk: false,
              language: sop.language || 'English',
            });

            if (!genResult.mcqs || genResult.mcqs.length === 0) {
              log.push(`⚠ Generation failed for Q${replacementTarget.questionIndex + 1}, keeping original`);
              failedCount++;
              continue;
            }

            const newQuestion = genResult.mcqs[0];
            log.push(`✓ Generated: "${newQuestion.question.substring(0, 50)}..."`);

            // Get the old question BEFORE replacing it
            const oldQuestion = freshBank.mcqs[replacementTarget.questionIndex];

            // Splice in-place replacement
            freshBank.mcqs.splice(replacementTarget.questionIndex, 1, newQuestion);

            // Save with retry
            let saveAttempts = 0;
            const MAX_SAVE_ATTEMPTS = 3;
            let saveError: any = null;

            while (saveAttempts < MAX_SAVE_ATTEMPTS) {
              try {
                await freshBank.save();
                log.push(`✓ Saved replacement at Q${replacementTarget.questionIndex + 1}`);
                saveError = null;
                break;
              } catch (versionError: any) {
                saveAttempts++;
                log.push(`⚠ Save attempt ${saveAttempts}/${MAX_SAVE_ATTEMPTS} failed`);

                if (saveAttempts >= MAX_SAVE_ATTEMPTS) {
                  saveError = versionError;
                  break;
                }

                // Refresh and retry
                const retryBank = await MCQBank.findById(mcqBankId);
                if (retryBank) {
                  retryBank.mcqs.splice(replacementTarget.questionIndex, 1, newQuestion);
                  Object.assign(freshBank, retryBank.toObject());
                } else {
                  saveError = new Error('Bank no longer exists');
                  break;
                }

                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }

            if (saveError) {
              log.push(`❌ Failed to save after retries, keeping original`);
              failedCount++;
              continue;
            }

            // Only increment eliminated count if we successfully saved the replacement
            eliminatedCount++;
            log.push(`✓ Replaced Q${replacementTarget.questionIndex + 1} - old question will be archived`);

            // Archive old question (non-critical - don't block on failure)
            if (oldQuestion) {
              try {
                await EliminatedQuestion.create({
                  sopId: bank.sopId,
                  sopName: bank.sopName,
                  sopIdentifier: bank.sopIdentifier,
                  question: oldQuestion,
                  originalQuestionIndex: replacementTarget.questionIndex,
                  eliminationReason: 'duplicate',
                  eliminatedAt: new Date(),
                  eliminatedBy: 'Bulk-Auto-Resolve',
                  duplicateOf: `Q${cluster.primaryQuestionIndex + 1}`,
                  similarityScore: replacementTarget.similarityScore,
                  replacedWith: newQuestion.question.substring(0, 100),
                });
                log.push(`✓ Archived old question to history`);
              } catch (archiveError: any) {
                log.push(`⚠ Failed to archive old question (non-critical): ${archiveError.message}`);
              }
            }

            processedIndices.add(replacementTarget.questionIndex);
            cluster.replacedQuestions!.push(replacementTarget.questionIndex);
            replacedCount++;

            // Periodic job update (every 5 replacements)
            updateInterval++;
            if (updateInterval % 5 === 0 && jobId) {
              await AutoResolveJob.findByIdAndUpdate(jobId, {
                logs: log,
                progress: {
                  clustersFound: clusters.length,
                  clustersProcessed: clusters.filter(c => c.replacedQuestions && c.replacedQuestions.length > 0).length,
                  questionsReplaced: replacedCount,
                  questionsFailed: failedCount,
                },
              }).catch(err => console.error('Failed to update progress:', err));
            }
          } catch (error: any) {
            log.push(`❌ Error replacing Q${replacementTarget.questionIndex + 1}: ${error.message}`);
            failedCount++;
          }
        }
      }

      // --- STEP 6: Mark SimilarQuestion as Reviewed ---
      log.push(`Marking clusters as reviewed...`);
      const updatedClusters = clusters.filter(c => c.replacedQuestions && c.replacedQuestions.length > 0);

      // Fetch the final bank state with all replacements
      const finalBank = await MCQBank.findById(mcqBankId);
      let bankModified = false;

      for (const cluster of updatedClusters) {
        try {
          await SimilarQuestion.findByIdAndUpdate(
            cluster.similarQuestionDocId,
            {
              reviewStatus: 'reviewed',
              actionTaken: 'keep_primary',
              reviewedAt: new Date(),
              reviewedBy: 'Bulk-Auto-Resolve',
              reviewNotes: `Auto-resolved via bulk similarity resolution. Mode: ${mode}. Replaced ${cluster.replacedQuestions?.length} questions.`,
            }
          );

          // Clear isSimilar flag on the kept question (from the final bank with all replacements)
          if (finalBank && finalBank.mcqs[cluster.bestKeptIndex]) {
            finalBank.mcqs[cluster.bestKeptIndex].isSimilar = false;
            bankModified = true;
          }
        } catch (error: any) {
          log.push(`⚠ Failed to mark cluster as reviewed: ${error.message}`);
        }
      }

      // Save the final bank state once with all flags updated
      if (finalBank && bankModified) {
        try {
          await finalBank.save();
          log.push(`✓ Cleared similarity flags on kept questions`);
        } catch (error: any) {
          log.push(`⚠ Failed to save similarity flags: ${error.message}`);
        }
      }

      log.push(`✓ Resolution complete`);

      // Update job status to completed
      if (jobId) {
        console.log(`📝 Updating job ${jobId} to completed status`);
        const summary = {
          found: clusters.length,
          eligible: clusters.filter(c => c.questionsToReplace > 0).length,
          replaced: replacedCount,
          kept: clusters.filter(c => c.replacedQuestions && c.replacedQuestions.length > 0).length,
          failed: failedCount,
          eliminatedCount,
        };
        const updated = await AutoResolveJob.findByIdAndUpdate(
          jobId,
          {
            status: 'completed',
            logs: log,
            summary: summary,
            completedAt: new Date(),
          },
          { new: true }
        );
        console.log(`✓ Job completed with status: ${updated?.status}, summary:`, summary);
      }

      return NextResponse.json({
        success: true,
        dryRun: false,
        summary: {
          found: clusters.length,
          eligible: clusters.filter(c => c.questionsToReplace > 0).length,
          replaced: replacedCount,
          kept: clusters.filter(c => c.replacedQuestions && c.replacedQuestions.length > 0).length,
          failed: failedCount,
          eliminatedCount,
        },
        clusters,
        log,
      });
    } finally {
      CONCURRENT_JOBS.delete(mcqBankId);
    }
  } catch (error: any) {
    console.error('Error in bulk-resolve-similar:', error);

    // Update job status to failed
    if (jobId) {
      console.log(`❌ Updating job ${jobId} to failed status: ${error.message}`);
      const updated = await AutoResolveJob.findByIdAndUpdate(
        jobId,
        {
          status: 'failed',
          error: error.message || 'Unknown error during bulk resolution',
          logs: log,
          completedAt: new Date(),
        },
        { new: true }
      ).catch(err => {
        console.error('Failed to update job status:', err);
        return null;
      });
      if (updated) {
        console.log(`✓ Job marked as failed, status: ${updated.status}`);
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to resolve similarities',
        log,
      },
      { status: 500 }
    );
  }
}

export const maxDuration = 300; // 5 minutes for long-running operations

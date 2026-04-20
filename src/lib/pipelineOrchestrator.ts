/**
 * Pipeline Orchestrator — executes each automated SOP pipeline stage.
 * Called by /api/sop/pipeline/run-stage. Each function updates the SOPPipeline
 * document in MongoDB, then fires the next stage as a detached fetch().
 */

import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import SOPPipeline, { ISOPPipeline, PipelineStatus } from '@/models/SOPPipeline';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import AutoResolveJob from '@/models/AutoResolveJob';
import SimilarQuestion from '@/models/SimilarQuestion';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';
import { mcqQueue } from '@/lib/mcqQueue';
import { autoFixCompliance, AutoFixResult } from '@/lib/complianceAutoFixer';

const MAX_SIMILARITY_ITERATIONS = 5;
const POLL_INTERVAL_MS = 4000;

function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL?.replace(/\/$/, '') ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  );
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function updatePipeline(
  sopId: string,
  updates: Partial<ISOPPipeline> & Record<string, unknown>
) {
  return SOPPipeline.findOneAndUpdate(
    { sopId: new mongoose.Types.ObjectId(sopId) },
    { $set: { ...updates, lastHeartbeat: new Date() } },
    { new: true }
  );
}

async function failPipeline(sopId: string, stageName: string, errorMessage: string) {
  console.error(`[PIPELINE] Stage "${stageName}" failed for SOP ${sopId}: ${errorMessage}`);
  await Promise.all([
    SOPPipeline.findOneAndUpdate(
      { sopId: new mongoose.Types.ObjectId(sopId) },
      {
        $set: {
          pipelineStatus: 'failed',
          errorStage: stageName,
          errorMessage,
          errorAt: new Date(),
          [`stages.${stageName}.status`]: 'failed',
          [`stages.${stageName}.errorMessage`]: errorMessage,
          lastHeartbeat: new Date(),
        },
      }
    ),
    SOP.findByIdAndUpdate(sopId, { pipelineStatus: 'failed' }),
  ]);
}

export async function advanceToNextStage(sopId: string, nextStage: PipelineStatus) {
  const baseUrl = getBaseUrl();

  await Promise.all([
    SOPPipeline.findOneAndUpdate(
      { sopId: new mongoose.Types.ObjectId(sopId) },
      { $set: { pipelineStatus: nextStage, lastHeartbeat: new Date() } }
    ),
    SOP.findByIdAndUpdate(sopId, { pipelineStatus: nextStage }),
  ]);

  // Map pipeline status to run-stage stage name
  const stageMap: Record<string, string> = {
    similarity_checking: 'similarity_check',
    compliance_checking: 'compliance_check',
    compliance_fixing: 'compliance_fix',
    updating_platform: 'platform_update',
  };
  const stageName = stageMap[nextStage] || nextStage;

  fetch(`${baseUrl}/api/sop/pipeline/run-stage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sopId, stage: stageName }),
  }).catch(err => console.error(`[PIPELINE] advance to ${nextStage} failed:`, err));
}

// ─────────────────────────────────────────────────────────
// STAGE 1: MCQ Generation
// ─────────────────────────────────────────────────────────
export async function runMcqGenerationStage(sopId: string) {
  await connectDB();
  const pipeline = await SOPPipeline.findOne({ sopId: new mongoose.Types.ObjectId(sopId) });
  if (!pipeline) throw new Error('Pipeline not found');

  await updatePipeline(sopId, {
    'stages.mcqGeneration.status': 'running',
    'stages.mcqGeneration.startedAt': new Date(),
    'stages.mcqGeneration.detail': 'Starting MCQ generation',
    'stages.mcqGeneration.progress': 5,
  });

  try {
    const sop = await SOP.findById(sopId);
    if (!sop) throw new Error('SOP not found');

    const language = (pipeline.language || sop.language || 'English') as 'English' | 'Gujarati';

    // Add to queue (duplicate-safe — queue ignores if already processing)
    mcqQueue.addTask({ sopId, targetCount: 100, priority: 10, language });
    mcqQueue.start();

    await updatePipeline(sopId, {
      'stages.mcqGeneration.detail': 'MCQ generation in progress via AI...',
      'stages.mcqGeneration.progress': 20,
    });

    // Wait for queue to finish this SOP
    await mcqQueue.waitForTask(sopId);

    await updatePipeline(sopId, {
      'stages.mcqGeneration.progress': 80,
      'stages.mcqGeneration.detail': 'Verifying generated MCQs...',
    });

    // Verify MCQBank was created
    const bank = await MCQBank.findOne({ sopId: new mongoose.Types.ObjectId(sopId), language });
    if (!bank || bank.mcqs.length === 0) {
      throw new Error('MCQ generation completed but no questions were saved');
    }

    await updatePipeline(sopId, {
      mcqBankId: bank._id,
      'stages.mcqGeneration.status': 'completed',
      'stages.mcqGeneration.completedAt': new Date(),
      'stages.mcqGeneration.progress': 100,
      'stages.mcqGeneration.detail': `Generated ${bank.mcqs.length} questions`,
    });

    console.log(`✅ [PIPELINE] MCQ generation done for ${sopId}: ${bank.mcqs.length} questions`);
    await advanceToNextStage(sopId, 'similarity_checking');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await failPipeline(sopId, 'mcqGeneration', msg);
  }
}

// ─────────────────────────────────────────────────────────
// STAGE 2: Similarity Check Loop
// ─────────────────────────────────────────────────────────
export async function runSimilarityCheckStage(sopId: string) {
  await connectDB();
  const pipeline = await SOPPipeline.findOne({ sopId: new mongoose.Types.ObjectId(sopId) });
  if (!pipeline) throw new Error('Pipeline not found');

  await updatePipeline(sopId, {
    'stages.similarityCheck.status': 'running',
    'stages.similarityCheck.startedAt': new Date(),
    'stages.similarityCheck.detail': 'Starting similarity detection',
    'stages.similarityCheck.progress': 5,
  });

  const baseUrl = getBaseUrl();
  let iteration = 0;

  try {
    const mcqBankId = pipeline.mcqBankId?.toString();
    if (!mcqBankId) throw new Error('mcqBankId not set in pipeline — MCQ stage may have failed');

    while (iteration < MAX_SIMILARITY_ITERATIONS) {
      iteration++;

      await updatePipeline(sopId, {
        similarityIterations: iteration,
        'stages.similarityCheck.detail': `Iteration ${iteration}/${MAX_SIMILARITY_ITERATIONS}: detecting similar questions`,
        'stages.similarityCheck.progress': Math.round((iteration / (MAX_SIMILARITY_ITERATIONS + 1)) * 80),
      });

      // Step A: Detect similarities
      const detectRes = await fetch(`${baseUrl}/api/similar-questions/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcqBankId }),
      });

      let pendingCount = 0;
      if (detectRes.ok) {
        const data = await detectRes.json();
        pendingCount = data.pendingCount ?? data.flaggedCount ?? data.similarCount ?? data.count ?? 0;
        // Fallback: count directly from DB
        if (typeof pendingCount !== 'number') {
          pendingCount = await SimilarQuestion.countDocuments({
            sopId: new mongoose.Types.ObjectId(sopId),
            reviewStatus: 'pending',
          });
        }
      } else {
        // Direct DB count if detect endpoint is unavailable
        pendingCount = await SimilarQuestion.countDocuments({
          sopId: new mongoose.Types.ObjectId(sopId),
          reviewStatus: 'pending',
        });
      }

      if (pendingCount === 0) {
        console.log(`✅ [PIPELINE] Similarity clean after ${iteration} iteration(s) for ${sopId}`);
        break;
      }

      console.log(`🔄 [PIPELINE] Similarity iter ${iteration}: ${pendingCount} pending for ${sopId}`);

      await updatePipeline(sopId, {
        'stages.similarityCheck.detail': `Iteration ${iteration}: resolving ${pendingCount} similar pairs`,
      });

      // Step B: Trigger auto-resolve
      const resolveRes = await fetch(`${baseUrl}/api/mcq-bank/auto-resolve-similar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcqBankId }),
      });

      if (!resolveRes.ok) {
        console.warn(`[PIPELINE] auto-resolve returned ${resolveRes.status} on iter ${iteration}`);
        // If there's a conflict (409 = already running), wait and continue
        if (resolveRes.status === 409) {
          const data = await resolveRes.json();
          const existingJobId = data.jobId?.toString();
          if (existingJobId) {
            await waitForAutoResolveJob(existingJobId);
          } else {
            await sleep(10_000);
          }
          continue;
        }
        break;
      }

      const resolveData = await resolveRes.json();
      const jobId = resolveData.jobId?.toString();
      if (jobId) {
        await waitForAutoResolveJob(jobId);
      } else {
        await sleep(5_000);
      }
    }

    // After loop: any remaining similar questions stay flagged for manual review (don't block pipeline)
    const remaining = await SimilarQuestion.countDocuments({
      sopId: new mongoose.Types.ObjectId(sopId),
      reviewStatus: 'pending',
    });

    await updatePipeline(sopId, {
      'stages.similarityCheck.status': 'completed',
      'stages.similarityCheck.completedAt': new Date(),
      'stages.similarityCheck.progress': 100,
      'stages.similarityCheck.detail':
        remaining === 0
          ? `All similar questions resolved after ${iteration} iteration(s)`
          : `${remaining} similar questions remain for manual review`,
    });

    console.log(`✅ [PIPELINE] Similarity check done for ${sopId}`);
    await advanceToNextStage(sopId, 'compliance_checking');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await failPipeline(sopId, 'similarityCheck', msg);
  }
}

async function waitForAutoResolveJob(jobId: string) {
  const MAX_WAIT_MS = 8 * 60_000; // 8 minutes max wait
  const start = Date.now();

  while (Date.now() - start < MAX_WAIT_MS) {
    await sleep(POLL_INTERVAL_MS);
    try {
      const job = await AutoResolveJob.findById(jobId).lean();
      if (!job) break;
      const status = (job as { status: string }).status;
      if (status === 'completed' || status === 'failed') break;
    } catch {
      break;
    }
  }
}

// ─────────────────────────────────────────────────────────
// STAGE 3: Compliance Check
// ─────────────────────────────────────────────────────────
export async function runComplianceCheckStage(sopId: string) {
  await connectDB();

  await updatePipeline(sopId, {
    'stages.complianceFix.status': 'running',
    'stages.complianceFix.startedAt': new Date(),
    'stages.complianceFix.detail': 'Running compliance analysis (AI-powered)...',
    'stages.complianceFix.progress': 5,
  });

  // Note: we reuse the complianceFix stage for both check+fix (they're tightly coupled)
  const baseUrl = getBaseUrl();

  try {
    const analyzeRes = await fetch(`${baseUrl}/api/compliance/analyze-v4`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sopId, config: { aiModel: 'gemini-1.5-flash' } }),
    });

    if (!analyzeRes.ok) {
      const errText = await analyzeRes.text();
      throw new Error(`Compliance analysis returned ${analyzeRes.status}: ${errText.slice(0, 200)}`);
    }

    const analyzeData = await analyzeRes.json();
    const reportId = analyzeData.reportId?.toString();
    const overallScore = analyzeData.overallScore ?? 0;
    const complianceStatus = analyzeData.complianceStatus ?? 'Unknown';

    if (!reportId) throw new Error('Compliance analysis did not return a reportId');

    await updatePipeline(sopId, {
      complianceReportId: new mongoose.Types.ObjectId(reportId),
      complianceScore: overallScore,
      complianceStatus,
      'stages.complianceFix.progress': 50,
      'stages.complianceFix.detail': `Compliance score: ${overallScore.toFixed(1)}/10 (${complianceStatus})`,
    });

    console.log(`✅ [PIPELINE] Compliance check done for ${sopId}: score ${overallScore}`);

    // Advance to fix stage
    await SOPPipeline.findOneAndUpdate(
      { sopId: new mongoose.Types.ObjectId(sopId) },
      { $set: { pipelineStatus: 'compliance_fixing', lastHeartbeat: new Date() } }
    );
    await SOP.findByIdAndUpdate(sopId, { pipelineStatus: 'compliance_fixing' });

    // Run the auto-fix inline (it's fast — no need for another stage hop)
    await runComplianceFixStage(sopId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Compliance check failure is non-fatal — still advance to platform update
    console.warn(`[PIPELINE] Compliance check failed for ${sopId}: ${msg}. Advancing anyway.`);
    await updatePipeline(sopId, {
      'stages.complianceFix.status': 'failed',
      'stages.complianceFix.completedAt': new Date(),
      'stages.complianceFix.detail': `Compliance check failed: ${msg}`,
      'stages.complianceFix.progress': 100,
    });
    await advanceToNextStage(sopId, 'updating_platform');
  }
}

// ─────────────────────────────────────────────────────────
// STAGE 4: Compliance Auto-Fix
// ─────────────────────────────────────────────────────────
export async function runComplianceFixStage(sopId: string) {
  await connectDB();
  const pipeline = await SOPPipeline.findOne({ sopId: new mongoose.Types.ObjectId(sopId) });
  if (!pipeline) throw new Error('Pipeline not found');

  try {
    let result: AutoFixResult = { fixedCount: 0, regeneratedCount: 0, unresolvedCount: 0, unresolvedFindings: [] };

    if (pipeline.complianceReportId) {
      const ComplianceReport = (await import('@/models/ComplianceReport')).default;
      const report = await ComplianceReport.findById(pipeline.complianceReportId);
      const bank = pipeline.mcqBankId ? await MCQBank.findById(pipeline.mcqBankId) : null;
      const sop = await SOP.findById(sopId);

      if (report && bank && sop) {
        result = await autoFixCompliance(report, bank, sop);

        if (result.fixedCount > 0 || result.regeneratedCount > 0) {
          bank.totalQuestions = bank.mcqs.length;
          const easy = bank.mcqs.filter((m: {difficulty: string}) => m.difficulty === 'Easy').length;
          const medium = bank.mcqs.filter((m: {difficulty: string}) => m.difficulty === 'Medium').length;
          const hard = bank.mcqs.filter((m: {difficulty: string}) => m.difficulty === 'Hard').length;
          bank.difficultyDistribution = { easy, medium, hard };
          await bank.save();
        }
      }
    }

    await updatePipeline(sopId, {
      unresolvedFindings: result.unresolvedCount,
      'stages.complianceFix.status': 'completed',
      'stages.complianceFix.completedAt': new Date(),
      'stages.complianceFix.progress': 100,
      'stages.complianceFix.detail': `Fixed ${result.fixedCount} issues, regenerated ${result.regeneratedCount} questions, ${result.unresolvedCount} need manual review`,
    });

    console.log(`✅ [PIPELINE] Compliance fix done for ${sopId}: fixed=${result.fixedCount} regen=${result.regeneratedCount} unresolved=${result.unresolvedCount}`);
    await advanceToNextStage(sopId, 'updating_platform');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[PIPELINE] Compliance fix failed for ${sopId}: ${msg}. Advancing anyway.`);
    await updatePipeline(sopId, {
      'stages.complianceFix.status': 'failed',
      'stages.complianceFix.completedAt': new Date(),
      'stages.complianceFix.detail': `Auto-fix failed: ${msg}`,
      'stages.complianceFix.progress': 100,
    });
    await advanceToNextStage(sopId, 'updating_platform');
  }
}

// ─────────────────────────────────────────────────────────
// STAGE 5: Platform Update
// ─────────────────────────────────────────────────────────
export async function runPlatformUpdateStage(sopId: string) {
  await connectDB();
  const pipeline = await SOPPipeline.findOne({ sopId: new mongoose.Types.ObjectId(sopId) });
  if (!pipeline) throw new Error('Pipeline not found');

  await updatePipeline(sopId, {
    'stages.platformUpdate.status': 'running',
    'stages.platformUpdate.startedAt': new Date(),
    'stages.platformUpdate.detail': 'Updating platform data...',
    'stages.platformUpdate.progress': 10,
  });

  try {
    // Run all platform updates in parallel
    await Promise.allSettled([
      // Invalidate dashboard cache so next request re-fetches fresh data
      Promise.resolve(invalidateDashboardSopsCache()),

      // Mark SOP as approved
      SOP.findByIdAndUpdate(sopId, {
        pipelineStatus: 'approved',
        complianceStatus: 'compliant',
      }),

      // Ensure MCQBank is active (not obsolete)
      pipeline.mcqBankId
        ? MCQBank.findByIdAndUpdate(pipeline.mcqBankId, { isObsolete: false })
        : Promise.resolve(),

      // Create notification for managers (best-effort)
      createDepartmentNotification(pipeline.department, pipeline.sopIdentifier, pipeline.sopName),
    ]);

    await updatePipeline(sopId, {
      pipelineStatus: 'approved',
      completedAt: new Date(),
      'stages.platformUpdate.status': 'completed',
      'stages.platformUpdate.completedAt': new Date(),
      'stages.platformUpdate.progress': 100,
      'stages.platformUpdate.detail': 'All platform data updated. SOP is now approved.',
    });

    console.log(`🎉 [PIPELINE] SOP ${pipeline.sopIdentifier} (${sopId}) fully approved!`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Platform update failure: still mark as approved but log error
    console.error(`[PIPELINE] Platform update partial failure for ${sopId}: ${msg}`);
    await updatePipeline(sopId, {
      pipelineStatus: 'approved',
      completedAt: new Date(),
      'stages.platformUpdate.status': 'completed',
      'stages.platformUpdate.completedAt': new Date(),
      'stages.platformUpdate.progress': 100,
      'stages.platformUpdate.detail': `Platform update completed with warnings: ${msg}`,
    });
    await SOP.findByIdAndUpdate(sopId, { pipelineStatus: 'approved' });
  }
}

async function createDepartmentNotification(department: string, sopIdentifier: string, sopName: string) {
  try {
    const User = (await import('@/models/User')).default;
    const Notification = (await import('@/models/Notification')).default;

    const managers = await User.find({
      department,
      role: { $in: ['manager', 'admin', 'trainer'] },
    }).select('_id').lean();

    if (managers.length === 0) return;

    const notifications = managers.map((m: { _id: unknown }) => ({
      recipient: m._id,
      type: 'update' as const,
      title: `SOP Pipeline Complete: ${sopIdentifier}`,
      message: `"${sopName}" has completed the automated pipeline (MCQ generation, similarity check, compliance check) and is now approved.`,
      link: '/dashboard',
      read: false,
    }));

    await Notification.insertMany(notifications, { ordered: false });
  } catch {
    // Non-fatal — notification failure does not fail the pipeline
  }
}

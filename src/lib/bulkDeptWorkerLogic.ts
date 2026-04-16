/**
 * bulkDeptWorkerLogic.ts
 *
 * Core logic for bulk department MCQ similarity resolution.
 * Extracted from the worker API route so it can be called directly
 * (in-process, no network hop) from the main route — avoiding the
 * fire-and-forget fetch() pattern that silently fails in some environments.
 */

import dbConnect from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';
import SOP from '@/models/SOP';
import EliminatedQuestion from '@/models/EliminatedQuestion';
import BulkDeptJob from '@/models/BulkDeptJob';
import { generateMCQsFromSOP } from '@/lib/gemini';
import { IMCQ } from '@/models/MCQBank';

// In-memory guard: prevent duplicate workers for same job (works within a single process)
export const ACTIVE_WORKERS = new Set<string>();

export const SIMILARITY_THRESHOLD = 70;
export const DELAY_BETWEEN_BANKS_MS = 500;
const MAX_RESOLVE_PASSES = 5;

// ─── Similarity helpers ───────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a','an','the','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall','can',
  'to','of','in','on','at','by','for','with','about','as','into','through',
  'during','before','after','above','below','from','up','down','out','off',
  'over','under','again','then','once',
  'and','but','or','nor','so','yet','both','either','not','no','than','too',
  'very','just','this','that','these','those','it','its',
]);

function normalizeText(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}
function contentWords(t: string) {
  return normalizeText(t).split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function lev(a: string, b: string) {
  const m = a.length, n = b.length;
  const dp = Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i===0?j:j===0?i:0));
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j-1],dp[i-1][j],dp[i][j-1]);
  return dp[m][n];
}
function charSim(a: string, b: string) {
  a=a.toLowerCase().trim(); b=b.toLowerCase().trim();
  if(a===b) return 100;
  const longer=a.length>b.length?a:b;
  return longer.length===0?100:Math.round(((longer.length-lev(a,b))/longer.length)*100);
}

function jaccardSim(a: string, b: string) {
  const w1 = new Set(contentWords(a)), w2 = new Set(contentWords(b));
  if (w1.size === 0 && w2.size === 0) return 100;
  if (w1.size === 0 || w2.size === 0) return 0;
  const inter = [...w1].filter(w => w2.has(w)).length;
  const union = new Set([...w1, ...w2]).size;
  return Math.round((inter / union) * 100);
}

function ngramSim(a: string, b: string) {
  const makeNgrams = (words: string[]) => {
    const out = new Set<string>();
    for (let i = 0; i < words.length - 1; i++) out.add(`${words[i]} ${words[i+1]}`);
    for (let i = 0; i < words.length - 2; i++) out.add(`${words[i]} ${words[i+1]} ${words[i+2]}`);
    return out;
  };
  const g1 = makeNgrams(contentWords(a)), g2 = makeNgrams(contentWords(b));
  if (g1.size === 0 && g2.size === 0) return 0;
  if (g1.size === 0 || g2.size === 0) return 0;
  const inter = [...g1].filter(x => g2.has(x)).length;
  const union = new Set([...g1, ...g2]).size;
  return Math.round((inter / union) * 100);
}

function answerSim(a: IMCQ, b: IMCQ) {
  const aA = a.correctAnswer || '', bA = b.correctAnswer || '';
  return Math.round(charSim(aA, bA) * 0.7 + jaccardSim(aA, bA) * 0.3);
}

function optionsSim(a: IMCQ, b: IMCQ) {
  const opts1 = (a.options || []).join(' ');
  const opts2 = (b.options || []).join(' ');
  return jaccardSim(opts1, opts2);
}

export function combinedSimilarity(a: IMCQ, b: IMCQ) {
  const q1 = a.question || '', q2 = b.question || '';
  return Math.round(
    jaccardSim(q1, q2) * 0.30 +
    ngramSim(q1, q2)   * 0.20 +
    charSim(q1, q2)    * 0.10 +
    answerSim(a, b)    * 0.25 +
    optionsSim(a, b)   * 0.15
  );
}

export function detectSimilarities(mcqs: IMCQ[], threshold: number) {
  const visited = new Set<number>();
  const clusters: Array<{primaryIndex:number; similarIndices:number[]; scores:number[]}> = [];

  for (let i = 0; i < mcqs.length; i++) {
    if (visited.has(i)) continue;
    const similar: number[] = [];
    const scores: number[] = [];
    for (let j = i + 1; j < mcqs.length; j++) {
      if (visited.has(j)) continue;
      const score = combinedSimilarity(mcqs[i], mcqs[j]);
      if (score >= threshold) {
        similar.push(j);
        scores.push(score);
        visited.add(j);
      }
    }
    if (similar.length > 0) {
      visited.add(i);
      clusters.push({ primaryIndex: i, similarIndices: similar, scores });
    }
  }
  return clusters;
}

function scoreQuestion(mcq: IMCQ, allMcqs: IMCQ[]) {
  let s = 0;
  const ql = mcq.question.length;
  s += ql>=50&&ql<=150?25:ql>150&&ql<=200?15:5;
  const uniq = new Set(mcq.options.map(o=>o.toLowerCase().trim()));
  if(uniq.size===4) s+=10;
  if(mcq.options.some(o=>o.toLowerCase().trim()===mcq.correctAnswer.toLowerCase().trim())) s+=10;
  if(mcq.options.every(o=>o.length>10)) s+=5;
  if(mcq.sopReference){ s+=/\d/.test(mcq.sopReference)?25:10; }
  const first3=mcq.question.split(' ').slice(0,3).join(' ').toLowerCase();
  const dups=allMcqs.filter(q=>q!==mcq&&q.question.split(' ').slice(0,3).join(' ').toLowerCase()===first3).length;
  s+=dups===0?25:dups===1?15:5;
  return s;
}

export interface ReplacementRecord {
  similarityScore: number;
  oldQuestion: string;
  oldAnswer: string;
  oldOptions: string[];
  newQuestion: string;
  newAnswer: string;
  newOptions: string[];
}

export async function resolveBank(bankId: string, log: string[]): Promise<{
  replaced: number; failed: number; remaining: number;
  replacements: ReplacementRecord[];
}> {
  const bank = await MCQBank.findById(bankId);
  if (!bank) { log.push('❌ Bank not found'); return { replaced:0, failed:0, remaining:0, replacements:[] }; }

  log.push(`✓ Bank: ${bank.sopIdentifier} (${bank.mcqs.length} questions)`);

  let sop = await SOP.findById(bank.sopId).catch(() => null);
  if (sop && bank.sopIdentifier && sop.identifier &&
      sop.identifier.toUpperCase().trim() !== bank.sopIdentifier.toUpperCase().trim()) {
    sop = null;
  }
  if (!sop) sop = await SOP.findOne({ identifier: bank.sopIdentifier }, { content: 1, name: 1, identifier: 1, language: 1 }).lean() as any;
  if (!sop?.content?.trim()) {
    log.push('⚠ SOP has no content — skipping');
    return { replaced:0, failed:0, remaining:0, replacements:[] };
  }

  let totalReplaced = 0, totalFailed = 0;
  const allReplacements: ReplacementRecord[] = [];
  const allEliminatedQueue: any[] = [];

  for (let pass = 1; pass <= MAX_RESOLVE_PASSES; pass++) {
    const clusters = detectSimilarities(bank.mcqs, SIMILARITY_THRESHOLD);

    if (clusters.length === 0) {
      if (pass === 1) {
        log.push('✓ No similar questions detected — bank is already unique');
      } else {
        log.push(`✓ Pass ${pass - 1} verified clean — all questions unique`);
      }
      break;
    }

    log.push(`~ Pass ${pass}: detected ${clusters.length} similarity cluster(s)`);

    let passReplaced = 0;
    const processed = new Set<number>();

    for (const cluster of clusters) {
      const allIdxs = [cluster.primaryIndex, ...cluster.similarIndices];
      const scored = allIdxs.map(idx => ({ idx, score: scoreQuestion(bank.mcqs[idx], bank.mcqs) }));
      scored.sort((a,b) => b.score - a.score);
      const keepIdx = scored[0].idx;
      const replaceIdxs = cluster.similarIndices.filter(idx => idx !== keepIdx && !processed.has(idx));

      log.push(`~ Cluster: keeping Q${keepIdx+1} "${bank.mcqs[keepIdx].question.substring(0,60)}..."`);

      for (const replIdx of replaceIdxs) {
        if (processed.has(replIdx)) continue;
        try {
          const oldQuestion = bank.mcqs[replIdx];
          const simScore = cluster.scores[cluster.similarIndices.indexOf(replIdx)] || 0;
          log.push(`~ Similar Q${replIdx+1} (${simScore}%): "${oldQuestion.question.substring(0,60)}..."`);

          const questionsToAvoid = bank.mcqs
            .filter((_,i) => i !== replIdx)
            .map(q => q.question);

          const genResult = await generateMCQsFromSOP({
            sopContent: (sop as any).content,
            sopName: (sop as any).name,
            sopIdentifier: (sop as any).identifier || (sop as any).name,
            existingQuestions: questionsToAvoid,
            targetCount: questionsToAvoid.length + 1,
            isBulk: false,
            language: (sop as any).language || bank.language || 'English',
          });

          if (!genResult.mcqs?.length) {
            log.push(`⚠ No replacement generated for Q${replIdx+1}`);
            totalFailed++;
            continue;
          }

          let newQ = genResult.mcqs[0];

          const maxSim = Math.max(...questionsToAvoid.map(e => jaccardSim(newQ.question, e)));
          if (maxSim >= SIMILARITY_THRESHOLD) {
            log.push(`⚠ Still too similar (${maxSim}%) — retrying`);
            const retry = await generateMCQsFromSOP({
              sopContent: (sop as any).content,
              sopName: (sop as any).name,
              sopIdentifier: (sop as any).identifier || (sop as any).name,
              existingQuestions: [...questionsToAvoid, newQ.question],
              targetCount: questionsToAvoid.length + 2,
              isBulk: false,
              language: (sop as any).language || bank.language || 'English',
            });
            if (!retry.mcqs?.length) { totalFailed++; continue; }
            newQ = retry.mcqs[0];
          }

          log.push(`↑ Replacement: "${newQ.question.substring(0,80)}"`);

          bank.mcqs.splice(replIdx, 1, { ...newQ, isSimilar: false } as any);

          allReplacements.push({
            similarityScore: simScore,
            oldQuestion: oldQuestion.question,
            oldAnswer: oldQuestion.correctAnswer,
            oldOptions: oldQuestion.options || [],
            newQuestion: newQ.question,
            newAnswer: newQ.correctAnswer,
            newOptions: newQ.options || [],
          });

          allEliminatedQueue.push({
            sopId: bank.sopId, sopName: bank.sopName, sopIdentifier: bank.sopIdentifier,
            question: oldQuestion, originalQuestionIndex: replIdx,
            eliminationReason: 'duplicate', eliminatedAt: new Date(),
            eliminatedBy: 'Bulk-Dept-Regen',
            duplicateOf: `Q${cluster.primaryIndex+1}`,
            similarityScore: simScore,
            replacedWith: newQ.question.substring(0,100),
          });

          processed.add(replIdx);
          totalReplaced++;
          passReplaced++;
        } catch (err: any) {
          log.push(`❌ Error on Q${replIdx+1}: ${err.message}`);
          totalFailed++;
        }
      }

      if (bank.mcqs[keepIdx]) (bank.mcqs[keepIdx] as any).isSimilar = false;
    }

    if (passReplaced > 0) {
      let saved = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await bank.save();
          saved = true;
          break;
        } catch (saveErr: any) {
          if (attempt < 2) {
            const reload = await MCQBank.findById(bankId);
            if (reload) {
              for (const r of allReplacements) {
                const idx = reload.mcqs.findIndex(q => q.question === r.oldQuestion);
                if (idx !== -1) reload.mcqs.splice(idx, 1, { ...bank.mcqs.find(q => q.question === r.newQuestion) } as any);
              }
              Object.assign(bank, reload.toObject());
            }
            await sleep(300);
          }
        }
      }
      if (!saved) log.push('⚠ Could not save bank after retries — some replacements may not persist');
    }

    log.push(`~ Pass ${pass} complete: ${passReplaced} replaced this pass`);

    if (passReplaced === 0) {
      const residual = detectSimilarities(bank.mcqs, SIMILARITY_THRESHOLD);
      log.push(`⚠ No progress in pass ${pass} — ${residual.length} cluster(s) remain (likely generation failures). Stopping.`);
      break;
    }

    if (pass === MAX_RESOLVE_PASSES) {
      const residual = detectSimilarities(bank.mcqs, SIMILARITY_THRESHOLD);
      if (residual.length > 0) {
        log.push(`⚠ Reached max passes (${MAX_RESOLVE_PASSES}) — ${residual.length} cluster(s) still remain`);
      }
    }
  }

  if (allEliminatedQueue.length > 0) {
    EliminatedQuestion.insertMany(allEliminatedQueue).catch(() => {});
  }

  const finalClusters = detectSimilarities(bank.mcqs, SIMILARITY_THRESHOLD);
  const remaining = finalClusters.length;

  if (remaining === 0) {
    log.push(`✓ VERIFIED: All questions unique`);
  } else {
    log.push(`⚠ ${remaining} cluster(s) still remain after all passes`);
  }

  log.push(`✓ Summary: ${totalReplaced} replaced, ${totalFailed} failed, ${remaining} remaining`);
  return { replaced: totalReplaced, failed: totalFailed, remaining, replacements: allReplacements };
}

/**
 * Run the full bulk job processing loop.
 * Called directly (no HTTP hop) from the main route.
 */
export async function runBulkDeptJob(jobId: string): Promise<void> {
  try {
    await dbConnect();

    if (ACTIVE_WORKERS.has(jobId)) {
      console.log(`[bulk-worker] Job ${jobId} already running in this process — skipping duplicate`);
      return;
    }
    ACTIVE_WORKERS.add(jobId);

    try {
      const job = await BulkDeptJob.findById(jobId);
      if (!job) { console.error(`[bulk-worker] Job ${jobId} not found`); return; }
      if (job.status === 'cancelled') { console.log(`[bulk-worker] Job ${jobId} already cancelled`); return; }

      await BulkDeptJob.findByIdAndUpdate(jobId, { status: 'running', startedAt: new Date() });
      console.log(`[bulk-worker] Job ${jobId} started — ${job.bankResults.length} banks`);

      let banksProcessed = 0, banksSucceeded = 0, banksFailed = 0;
      let banksSkipped = 0, totalReplaced = 0, totalFailed = 0;

      for (let i = 0; i < job.bankResults.length; i++) {
        if (i % 5 === 0) {
          const freshJob = await BulkDeptJob.findById(jobId, { cancelled:1, status:1 }).lean() as any;
          if (freshJob?.cancelled || freshJob?.status === 'cancelled') {
            await BulkDeptJob.findByIdAndUpdate(jobId, {
              status: 'cancelled', completedAt: new Date(),
              'progress.banksProcessed': banksProcessed,
              'progress.banksSucceeded': banksSucceeded,
              'progress.banksFailed': banksFailed,
              'progress.banksSkipped': banksSkipped + (job.bankResults.length - i),
              'progress.totalQuestionsReplaced': totalReplaced,
              'progress.totalQuestionsFailed': totalFailed,
            });
            console.log(`[bulk-worker] Job ${jobId} cancelled at bank ${i}`);
            return;
          }
        }

        const bankEntry = job.bankResults[i];
        if (bankEntry.status === 'completed' || bankEntry.status === 'failed') {
          banksSkipped++;
          continue;
        }

        const bankLog: string[] = [];
        let bankStatus: 'completed' | 'failed' = 'failed';
        let replaced = 0, failed = 0, remaining = 0;
        let bankReplacements: ReplacementRecord[] = [];
        let bankError: string | undefined;

        try {
          const result = await resolveBank(bankEntry.bankId, bankLog);
          replaced = result.replaced;
          failed = result.failed;
          remaining = result.remaining;
          bankReplacements = result.replacements;
          bankStatus = 'completed';
        } catch (err: any) {
          bankError = err.message || 'Unknown error';
          bankLog.push(`❌ ${bankError}`);
          bankStatus = 'failed';
        }

        banksProcessed++;
        if (bankStatus === 'completed') banksSucceeded++;
        else banksFailed++;
        totalReplaced += replaced;
        totalFailed += failed;

        await BulkDeptJob.findByIdAndUpdate(jobId, {
          [`bankResults.${i}.status`]: bankStatus,
          [`bankResults.${i}.questionsReplaced`]: replaced,
          [`bankResults.${i}.questionsFailed`]: failed,
          [`bankResults.${i}.remainingSimilar`]: remaining,
          [`bankResults.${i}.logs`]: bankLog,
          [`bankResults.${i}.replacements`]: bankReplacements,
          [`bankResults.${i}.completedAt`]: new Date(),
          ...(bankError ? { [`bankResults.${i}.error`]: bankError } : {}),
          'progress.banksProcessed': banksProcessed,
          'progress.banksSucceeded': banksSucceeded,
          'progress.banksFailed': banksFailed,
          'progress.banksSkipped': banksSkipped,
          'progress.totalQuestionsReplaced': totalReplaced,
          'progress.totalQuestionsFailed': totalFailed,
        });

        console.log(`[bulk-worker] Bank ${i+1}/${job.bankResults.length} — ${bankStatus} (${replaced} replaced)`);

        if (i < job.bankResults.length - 1) await sleep(DELAY_BETWEEN_BANKS_MS);
      }

      const finalCheck = await BulkDeptJob.findById(jobId, { status:1 }).lean() as any;
      if (finalCheck?.status !== 'cancelled') {
        await BulkDeptJob.findByIdAndUpdate(jobId, { status: 'completed', completedAt: new Date() });
        console.log(`[bulk-worker] Job ${jobId} completed — ${banksProcessed} banks processed`);
      }
    } finally {
      ACTIVE_WORKERS.delete(jobId);
    }
  } catch (err: any) {
    console.error(`[bulk-worker] Job ${jobId} fatal error:`, err);
    ACTIVE_WORKERS.delete(jobId);
    await BulkDeptJob.findByIdAndUpdate(jobId, {
      status: 'failed', error: err.message, completedAt: new Date(),
    }).catch(() => {});
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

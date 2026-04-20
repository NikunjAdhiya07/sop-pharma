/**
 * Compliance Auto-Fixer
 * Reads ComplianceReport findings and fixes what it can in the MCQBank.
 *
 * Category A — Format fixes (no AI, instant)
 * Category B — Difficulty imbalance (AI regeneration)
 * Category C — Missing SOP coverage (AI regeneration)
 * Category D — Everything else (flag as unresolved, don't block)
 */

import { generateMCQsFromSOP } from '@/lib/gemini';

export interface AutoFixResult {
  fixedCount: number;
  regeneratedCount: number;
  unresolvedCount: number;
  unresolvedFindings: Array<{
    clauseNumber: string;
    clauseTitle: string;
    reason: string;
  }>;
}

type IMCQ = {
  question: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  difficultyStars: '⭐' | '⭐⭐' | '⭐⭐⭐';
  options: string[];
  correctAnswer: string;
  explanation: string;
  sopReference: string;
  isChecked: boolean;
  isReviewed: boolean;
  isSimilar: boolean;
};

const DIFFICULTY_STARS: Record<string, '⭐' | '⭐⭐' | '⭐⭐⭐'> = {
  Easy: '⭐',
  Medium: '⭐⭐',
  Hard: '⭐⭐⭐',
};

const TARGET_DISTRIBUTION = { easy: 0.30, medium: 0.40, hard: 0.30 };
const IMBALANCE_THRESHOLD = 0.20; // 20 percentage points off target triggers regeneration

export async function autoFixCompliance(
  report: { findings: Array<{
    issueType: string;
    issueSeverity: string;
    complianceLevel: string;
    clauseNumber: string;
    clauseTitle: string;
    clauseText: string;
    sopSectionAffected: string;
  }> },
  bank: { mcqs: IMCQ[]; sopId: unknown; sopName: string; sopIdentifier: string; department: string; language?: string },
  sop: { content: string; name: string; identifier: string }
): Promise<AutoFixResult> {
  let fixedCount = 0;
  let regeneratedCount = 0;
  const unresolvedFindings: AutoFixResult['unresolvedFindings'] = [];
  const mcqs = bank.mcqs as IMCQ[];

  // ── Category A: Format fixes (no AI) ─────────────────────────────────────
  for (const mcq of mcqs) {
    let changed = false;

    // Trim whitespace
    if (mcq.question !== mcq.question.trim()) {
      mcq.question = mcq.question.trim();
      changed = true;
    }
    mcq.options = mcq.options.map(o => o.trim());

    // Fix difficultyStars to match difficulty
    const expectedStars = DIFFICULTY_STARS[mcq.difficulty];
    if (expectedStars && mcq.difficultyStars !== expectedStars) {
      mcq.difficultyStars = expectedStars;
      changed = true;
    }

    // Normalize correctAnswer to exactly match one option (case-insensitive)
    if (!mcq.options.includes(mcq.correctAnswer)) {
      const match = mcq.options.find(
        o => o.toLowerCase().trim() === mcq.correctAnswer.toLowerCase().trim()
      );
      if (match) {
        mcq.correctAnswer = match;
        changed = true;
      }
    }

    // Ensure exactly 4 options
    if (mcq.options.length < 4) {
      while (mcq.options.length < 4) {
        mcq.options.push('None of the above');
      }
      changed = true;
    } else if (mcq.options.length > 4) {
      mcq.options = mcq.options.slice(0, 4);
      changed = true;
    }

    if (changed) fixedCount++;
  }

  // ── Category B: Difficulty imbalance (AI regeneration) ───────────────────
  const total = mcqs.length;
  if (total > 0) {
    const easyPct = mcqs.filter(m => m.difficulty === 'Easy').length / total;
    const mediumPct = mcqs.filter(m => m.difficulty === 'Medium').length / total;
    const hardPct = mcqs.filter(m => m.difficulty === 'Hard').length / total;

    const imbalancedDifficulty =
      Math.abs(easyPct - TARGET_DISTRIBUTION.easy) > IMBALANCE_THRESHOLD
        ? 'Easy'
        : Math.abs(mediumPct - TARGET_DISTRIBUTION.medium) > IMBALANCE_THRESHOLD
        ? 'Medium'
        : Math.abs(hardPct - TARGET_DISTRIBUTION.hard) > IMBALANCE_THRESHOLD
        ? 'Hard'
        : null;

    if (imbalancedDifficulty) {
      try {
        const targetCount = Math.ceil(total * TARGET_DISTRIBUTION[imbalancedDifficulty.toLowerCase() as keyof typeof TARGET_DISTRIBUTION]) + 5;
        const existingQuestions = mcqs.map(m => m.question);

        const result = await generateMCQsFromSOP({
          sopContent: `FOCUS: Generate only ${imbalancedDifficulty} difficulty questions.\n\n${sop.content}`,
          sopName: sop.name,
          sopIdentifier: sop.identifier,
          existingQuestions,
          targetCount,
          isBulk: false,
          language: (bank.language as 'English' | 'Gujarati') || 'English',
        });

        if (result.mcqs && result.mcqs.length > 0) {
          const newMcqs = result.mcqs.filter(
            (m: IMCQ) => m.difficulty === imbalancedDifficulty
          );
          mcqs.push(...newMcqs);
          regeneratedCount += newMcqs.length;
        }
      } catch (err) {
        console.warn('[AUTO-FIX] Difficulty rebalancing AI call failed:', err);
      }
    }
  }

  // ── Category C: Missing SOP coverage (AI regeneration) ───────────────────
  const missingClauses = (report.findings || []).filter(
    f =>
      (f.issueType === 'missing-clause' || f.issueType === 'partial-coverage') &&
      (f.complianceLevel === 'non-compliant' || f.complianceLevel === 'partial') &&
      f.clauseText
  );

  if (missingClauses.length > 0) {
    try {
      const focusText = missingClauses
        .slice(0, 5) // limit to top 5 to avoid token overload
        .map(f => `${f.clauseTitle}: ${f.clauseText}`)
        .join('\n\n');

      const existingQuestions = mcqs.map(m => m.question);

      const result = await generateMCQsFromSOP({
        sopContent: focusText + '\n\nFull SOP:\n' + sop.content,
        sopName: sop.name,
        sopIdentifier: sop.identifier,
        existingQuestions,
        targetCount: missingClauses.length * 2,
        isBulk: false,
        language: (bank.language as 'English' | 'Gujarati') || 'English',
      });

      if (result.mcqs && result.mcqs.length > 0) {
        mcqs.push(...result.mcqs);
        regeneratedCount += result.mcqs.length;
      }
    } catch (err) {
      console.warn('[AUTO-FIX] Missing coverage AI call failed:', err);
      for (const f of missingClauses) {
        unresolvedFindings.push({
          clauseNumber: f.clauseNumber,
          clauseTitle: f.clauseTitle,
          reason: 'AI regeneration failed — manual review required',
        });
      }
    }
  }

  // ── Category D: Flag everything else as unresolved ───────────────────────
  const unresolvedRaw = (report.findings || []).filter(
    f =>
      f.complianceLevel !== 'compliant' &&
      f.complianceLevel !== 'not-applicable' &&
      f.issueType !== 'no-issue' &&
      f.issueType !== 'missing-clause' &&
      f.issueType !== 'partial-coverage' &&
      (f.issueSeverity === 'critical' || f.issueSeverity === 'major')
  );

  for (const f of unresolvedRaw) {
    unresolvedFindings.push({
      clauseNumber: f.clauseNumber,
      clauseTitle: f.clauseTitle,
      reason: `${f.issueType} (${f.issueSeverity}) — requires manual intervention`,
    });
  }

  return {
    fixedCount,
    regeneratedCount,
    unresolvedCount: unresolvedFindings.length,
    unresolvedFindings,
  };
}

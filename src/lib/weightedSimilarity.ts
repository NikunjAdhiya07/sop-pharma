/**
 * Weighted similarity computation for MCQ comparison
 * Combines text, options, and metadata similarity for a multi-dimensional score
 */

import { IMCQ } from '@/models/MCQBank';

/**
 * Compute weighted similarity between two MCQ objects
 * This is a placeholder/stub implementation since the full weighted_mcq mode
 * isn't fully implemented. For now, this returns a simplified composite score.
 *
 * In the future, this should:
 * - Question text similarity = 40%
 * - Answer option similarity = 20%
 * - SOP source line similarity = 20%
 * - Intent/concept similarity = 20%
 */
export function computeWeightedSimilarity(q1: IMCQ, q2: IMCQ): number {
  // For now, return a simple text-based similarity
  // This prevents crashes when weighted_mcq mode is selected in the UI
  // The combined_text mode (using weighted Levenshtein + keyword + concept)
  // is the primary production mode

  const q1Text = q1.question.toLowerCase().trim();
  const q2Text = q2.question.toLowerCase().trim();

  if (q1Text === q2Text) return 100;

  // Simple Levenshtein-based similarity as fallback
  const longer = q1Text.length > q2Text.length ? q1Text : q2Text;
  const shorter = q1Text.length > q2Text.length ? q2Text : q1Text;

  if (longer.length === 0) return 100;

  const editDistance = levenshteinDistance(longer, shorter);
  return Math.round(((longer.length - editDistance) / longer.length) * 100);
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}
